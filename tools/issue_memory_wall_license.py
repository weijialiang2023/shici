#!/usr/bin/env python3
"""Issue a signed offline license for the paid memory-wall print pack."""

from __future__ import annotations

import argparse
import base64
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def der_integer_to_raw(value: bytes) -> bytes:
    if not value:
        raise ValueError("empty DER integer")
    value = value.lstrip(b"\x00")
    if len(value) > 32:
        raise ValueError("ECDSA integer is too large")
    return value.rjust(32, b"\x00")


def der_signature_to_p1363(signature: bytes) -> bytes:
    if len(signature) < 8 or signature[0] != 0x30:
        raise ValueError("unexpected ECDSA signature")
    index = 2 if signature[1] < 0x80 else 2 + (signature[1] & 0x7F)
    if index >= len(signature) or signature[index] != 0x02:
        raise ValueError("missing ECDSA r value")
    r_length = signature[index + 1]
    r_start = index + 2
    r_end = r_start + r_length
    if r_end >= len(signature) or signature[r_end] != 0x02:
        raise ValueError("missing ECDSA s value")
    s_length = signature[r_end + 1]
    s_start = r_end + 2
    s_end = s_start + s_length
    return der_integer_to_raw(signature[r_start:r_end]) + der_integer_to_raw(signature[s_start:s_end])


def b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--private-key", required=True)
    parser.add_argument("--subject", required=True, help="buyer ID, order ID, or installation ID")
    parser.add_argument("--expires-at", default="", help="optional ISO-8601 timestamp")
    parser.add_argument("--output", default="")
    args = parser.parse_args()

    if args.expires_at:
        expires_at = datetime.fromisoformat(args.expires_at.replace("Z", "+00:00"))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        expires_value = expires_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    else:
        expires_value = None

    payload = {
        "v": 1,
        "product": "memory-wall",
        "subject": args.subject,
        "issuedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "expiresAt": expires_value,
    }
    payload_bytes = json.dumps(
        payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    signature = subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", args.private_key],
        input=payload_bytes,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    ).stdout
    token = b64url(payload_bytes) + "." + b64url(der_signature_to_p1363(signature))
    if args.output:
        Path(args.output).write_text(token + "\n", encoding="utf-8")
    else:
        print(token)


if __name__ == "__main__":
    main()
