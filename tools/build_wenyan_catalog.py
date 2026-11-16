#!/usr/bin/env python3
"""Rebuild the 1,000-entry Classical Chinese high-frequency catalog.

The source data is intentionally kept separate from the published site:

* Jiayan's Classical Chinese frequency list and part-of-speech table select
  high-frequency content characters. Jiayan is MIT licensed.
* Xinhua Dictionary's character database supplies pinyin and concise Chinese
  definitions. The project is MIT licensed.

Run after downloading the two upstream JSON files and the frequency text:

    python3 tools/build_wenyan_catalog.py \
      --frequency /path/to/jiayan-dict.txt \
      --char-pos /path/to/jiayan-char-pos.json \
      --xinhua /path/to/chinese-xinhua-word.json

Only the selected and normalized 1,000 entries are committed to the site.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = ROOT / "tools" / "wenyan_catalog.json"
CONTENT_POS = {"名", "动", "形"}
POS_LABELS = {
    "名": "名词",
    "动": "动词",
    "形": "形容词",
    "数": "数词",
    "量": "量词",
    "代": "代词",
    "副": "副词",
}

TOP_LEVEL_ITEM = re.compile(r"^\s*([⒈⒉⒊⒋⒌⒍⒎⒏⒐⒑])\s*(.+)$")
SOURCED_EXAMPLE = re.compile(r"([^\n]{3,110})--([^\n]{0,100})")
SOURCE_TITLE = re.compile(r"《[^》]{1,30}》")
PINYIN_TOKEN = re.compile(r"[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüɡ]+", re.I)
BAD_MEANING_PREFIXES = (
    "见",
    "同“",
    '同"',
    "用于",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clean_inline(value: str) -> str:
    value = value.replace("\u00a0", " ").replace("ɡ", "g")
    value = re.sub(r"\s+", " ", value).strip()
    return value


def clean_meaning(value: str, word: str) -> str:
    value = clean_inline(value.replace("～", word))
    value = re.sub(r"〈[^〉]{1,8}〉", "", value)
    value = re.sub(r"（[^）]{1,24}）", "", value)
    value = re.sub(r"\([^)]{1,24}\)", "", value)
    value = re.split(r"[。；;]", value, maxsplit=1)[0]
    value = re.sub(r"^[，,：:\-—\s]+|[，,：:\-—\s]+$", "", value)
    return value.strip()


def summary_data(entry: dict, word: str, limit: int = 3) -> tuple[list[str], str]:
    raw = (entry.get("explanation") or "").replace("\r", "\n")
    sequences: list[tuple[str, list[str]]] = []
    current: list[str] = []
    current_header = ""
    header = ""
    for line in raw.splitlines():
        match = TOP_LEVEL_ITEM.match(line)
        if match:
            if not current:
                current_header = header
            meaning = clean_meaning(match.group(2), word)
            if (
                len(meaning) < 2
                or len(meaning) > 52
                or meaning.startswith(BAD_MEANING_PREFIXES)
                or meaning in current
            ):
                continue
            current.append(meaning)
            continue

        stripped = line.strip()
        if not stripped or re.match(r"^[①②③④⑤⑥⑦⑧⑨⑩]", stripped):
            continue
        if current:
            sequences.append((current_header, current))
            current = []
        header = clean_inline(stripped)
    if current:
        sequences.append((current_header, current))

    # Compact dictionary summaries contain the first meanings for each
    # pronunciation. Match the primary pinyin when possible, then fall back to
    # the first substantial run instead of late specialist senses.
    primary = clean_inline(entry.get("pinyin") or "").replace("ɡ", "g")
    for sequence_header, sequence in sequences:
        if primary and primary in sequence_header.replace("ɡ", "g"):
            pron = pinyin_from_header(sequence_header)
            return sequence[:limit], pron or primary
    for sequence_header, sequence in sequences:
        if sequence:
            return sequence[:limit], pinyin_from_header(sequence_header) or primary
    return [], primary


def pinyin_from_header(header: str) -> str:
    tokens = [token for token in PINYIN_TOKEN.findall(header) if len(token) > 1]
    return clean_inline(tokens[0]).replace("ɡ", "g") if tokens else ""


def sourced_example(entry: dict, word: str) -> tuple[str, str]:
    raw = (entry.get("more") or "").replace("\r", "\n")
    for line in raw.splitlines():
        if word not in line or "--" not in line:
            continue
        match = SOURCED_EXAMPLE.search(clean_inline(line))
        if not match:
            continue
        quote = clean_inline(match.group(1))
        source_block = match.group(2)
        source_match = SOURCE_TITLE.search(source_block)
        if not source_match:
            continue
        quote = re.sub(r"^\s*(?:[（(]?\d+[）)]?)?\s*", "", quote)
        if len(quote) < 4 or len(quote) > 80:
            continue
        return quote, source_match.group(0)
    return "", ""


def load_existing_words() -> set[str]:
    path = ROOT / "data" / "books" / "wenyan.json"
    if not path.exists():
        return set()
    payload = json.loads(path.read_text())
    return {
        word.get("word", "")
        for word in payload.get("words", [])
        if word.get("category") in {"core", "extension"}
    }


def build_catalog(
    frequency_path: Path,
    char_pos_path: Path,
    xinhua_path: Path,
    target: int,
) -> dict:
    xinhua = {entry.get("word"): entry for entry in json.loads(xinhua_path.read_text())}
    char_pos = json.loads(char_pos_path.read_text())
    excluded = load_existing_words()

    ranked: list[tuple[int, int, str]] = []
    for order, line in enumerate(frequency_path.read_text().splitlines()):
        try:
            word, frequency = line.rsplit(",", 1)
            frequency = int(frequency)
        except ValueError:
            continue
        if not re.fullmatch(r"[\u3400-\u9fff]", word):
            continue
        if set(char_pos.get(word, [])) & CONTENT_POS == set():
            continue
        entry = xinhua.get(word)
        if not entry:
            continue
        meanings, _pinyin = summary_data(entry, word)
        if not meanings:
            continue
        ranked.append((frequency, order, word))

    catalog = []
    for frequency, _order, word in ranked:
        if word in excluded:
            continue
        entry = xinhua[word]
        meanings, summary_pinyin = summary_data(entry, word)
        example, source = sourced_example(entry, word)
        tags = [tag for tag in char_pos.get(word, []) if tag in POS_LABELS]
        catalog.append({
            "word": word,
            "traditional": clean_inline(entry.get("oldword") or word),
            "pinyin": clean_inline(summary_pinyin or entry.get("pinyin") or ""),
            "pos": " / ".join(POS_LABELS[tag] for tag in tags[:2]),
            "meanings": meanings,
            "example": example,
            "source": source,
            "frequency": frequency,
        })
        if len(catalog) >= target:
            break

    if len(catalog) != target:
        raise ValueError(f"expected {target} catalog entries, got {len(catalog)}")

    return {
        "version": 1,
        "target": target,
        "selection": "Jiayan Classical Chinese frequency; noun/verb/adjective characters only",
        "sources": [
            {
                "name": "Jiayan Classical Chinese toolkit",
                "url": "https://github.com/jiaeyan/Jiayan",
                "commit": "28c9638a071f1f0ab69d0ee971081147aa682a5b",
                "license": "MIT",
                "files": {
                    "frequency": {
                        "url": "https://raw.githubusercontent.com/jiaeyan/Jiayan/28c9638a071f1f0ab69d0ee971081147aa682a5b/jiayan/data/dict.txt",
                        "sha256": sha256(frequency_path),
                    },
                    "part_of_speech": {
                        "url": "https://raw.githubusercontent.com/jiaeyan/Jiayan/28c9638a071f1f0ab69d0ee971081147aa682a5b/jiayan/data/char_pos_dict.json",
                        "sha256": sha256(char_pos_path),
                    },
                },
            },
            {
                "name": "Chinese Xinhua Dictionary",
                "url": "https://github.com/pwxcoo/chinese-xinhua",
                "commit": "fe6d6c2e8baa82187f4c96bbe042e43f96c05666",
                "license": "MIT",
                "files": {
                    "characters": {
                        "url": "https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/fe6d6c2e8baa82187f4c96bbe042e43f96c05666/data/word.json",
                        "sha256": sha256(xinhua_path),
                    },
                },
            },
        ],
        "words": catalog,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frequency", required=True, type=Path)
    parser.add_argument("--char-pos", required=True, type=Path)
    parser.add_argument("--xinhua", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--target", type=int, default=1000)
    args = parser.parse_args()

    catalog = build_catalog(
        args.frequency,
        args.char_pos,
        args.xinhua,
        args.target,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    )
    with_example = sum(bool(row["example"]) for row in catalog["words"])
    print(
        f"wenyan catalog: {len(catalog['words'])} entries, "
        f"{with_example} sourced examples"
    )
    print(f"written: {args.output} ({args.output.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
