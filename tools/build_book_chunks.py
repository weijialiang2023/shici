#!/usr/bin/env python3
"""Split generated word books into progressive-loading JS chunks."""

from __future__ import annotations

import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BOOK_DIR = ROOT / "data/books"
TARGET_CHUNK_BYTES = 180 * 1024
BOOK_IDS = ("gaokao", "curated", "wenyan", "ielts", "cet4", "cet6")


def compact_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def chunk_count(data: dict) -> int:
    encoded = compact_json(data).encode("utf-8")
    estimated = math.ceil(len(encoded) / TARGET_CHUNK_BYTES)
    return max(2, min(8, estimated))


def build_book(book_id: str, book_dir: Path = BOOK_DIR) -> dict:
    path = book_dir / f"{book_id}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    words = data.get("words")
    units = data.get("units")
    if not isinstance(words, list) or not isinstance(units, list):
        raise ValueError(f"{book_id}: invalid book shape")

    count = chunk_count(data)
    size = math.ceil(len(words) / count)
    chunks = []
    for chunk_index in range(count):
        chunk_words = words[chunk_index * size:(chunk_index + 1) * size]
        number = chunk_index + 1
        name = f"{book_id}.chunk-{number:02d}.js"
        payload = {
            "bookId": book_id,
            "index": number,
            "words": chunk_words,
        }
        (book_dir / name).write_text(
            "window.__SHICI_BOOK_CHUNKS__ = window.__SHICI_BOOK_CHUNKS__ || {};\n"
            f"window.__SHICI_BOOK_CHUNKS__[{json.dumps(book_id + ':' + str(number))}] = "
            f"{compact_json(payload)};\n",
            encoding="utf-8",
        )
        chunks.append({
            "index": number,
            "path": f"data/books/{name}",
            "count": len(chunk_words),
        })

    unit_ids: dict[str, list[str]] = {}
    for word in words:
        unit = str(word.get("unit") or 1)
        unit_ids.setdefault(unit, []).append(word["id"])

    manifest = {
        "id": book_id,
        "version": 1,
        "wordCount": len(words),
        "wordIds": [word["id"] for word in words],
        "unitIds": unit_ids,
        "units": units,
        "chunks": chunks,
    }
    manifest_path = book_dir / f"{book_id}.manifest.js"
    manifest_path.write_text(
        "window.__SHICI_BOOK_MANIFESTS__ = window.__SHICI_BOOK_MANIFESTS__ || {};\n"
        f"window.__SHICI_BOOK_MANIFESTS__[{json.dumps(book_id)}] = "
        f"{compact_json(manifest)};\n",
        encoding="utf-8",
    )
    return {
        "id": book_id,
        "words": len(words),
        "chunks": len(chunks),
        "manifestBytes": manifest_path.stat().st_size,
    }


def main() -> None:
    results = [build_book(book_id, BOOK_DIR) for book_id in BOOK_IDS]
    for item in results:
        print(
            f"{item['id']}: {item['words']} words, {item['chunks']} chunks, "
            f"manifest {item['manifestBytes'] // 1024} KB"
        )


if __name__ == "__main__":
    main()
