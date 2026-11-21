#!/usr/bin/env python3
"""Export flagged English examples into a deterministic editorial review queue."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BOOKS = ("gaokao", "cet4", "cet6", "ielts")
BOOK_LABELS = {
    "gaokao": "高中 3500",
    "cet4": "四级核心",
    "cet6": "六级核心",
    "ielts": "雅思必背",
}
DEFAULT_CSV = ROOT / "reports" / "content-review.csv"
DEFAULT_MD = ROOT / "reports" / "content-review.md"

FIELDS = (
    "priority",
    "priority_score",
    "books",
    "word",
    "gaokao_rank",
    "ipa",
    "pos",
    "meanings",
    "current_example",
    "current_translation",
    "collocations",
    "proposed_example",
    "proposed_translation",
    "source",
    "review_status",
    "reviewer",
    "reviewed_at",
    "notes",
)


def load_book(book_id: str) -> dict:
    return json.loads((ROOT / "data" / "books" / f"{book_id}.json").read_text())


def normalize_word(word: str) -> str:
    return str(word or "").strip().casefold()


def build_rows() -> list[dict[str, str | int]]:
    payloads = {book_id: load_book(book_id) for book_id in BOOKS}
    gaokao_rank = {
        normalize_word(word.get("word")): index
        for index, word in enumerate(payloads["gaokao"]["words"], start=1)
    }

    by_word: dict[str, list[tuple[str, dict, int]]] = {}
    for book_id, payload in payloads.items():
        for index, word in enumerate(payload["words"], start=1):
            flags = word.get("contentFlags") or []
            if "fallback-example" not in flags:
                continue
            key = normalize_word(word.get("word"))
            by_word.setdefault(key, []).append((book_id, word, index))

    occurrences = Counter()
    for book_id, payload in payloads.items():
        for word in payload["words"]:
            occurrences[normalize_word(word.get("word"))] += 1

    rows: list[dict[str, str | int]] = []
    for key, entries in by_word.items():
        primary_book, primary_word, _ = entries[0]
        books = [entry[0] for entry in entries]
        appears_in = occurrences[key]
        rank = gaokao_rank.get(key, 0)

        # P0: repeated across books, or an early high-school entry. P1: gaokao/CET.
        # P2: IELTS-only and remaining lower-priority entries.
        if primary_book == "gaokao" and (appears_in >= 2 or (rank and rank <= 1200)):
            priority, score = "P0", 300
        elif primary_book == "gaokao" or any(book in {"cet4", "cet6"} for book in books):
            priority, score = "P1", 200
        else:
            priority, score = "P2", 100
        score += appears_in * 10 + max(0, 2000 - rank) // 100

        rows.append(
            {
                "priority": priority,
                "priority_score": score,
                "books": " / ".join(BOOK_LABELS[book] for book in books),
                "word": primary_word.get("word") or "",
                "gaokao_rank": rank or "",
                "ipa": primary_word.get("ipa") or "",
                "pos": primary_word.get("pos") or "",
                "meanings": "；".join(primary_word.get("coreMeanings") or primary_word.get("meanings") or []),
                "current_example": primary_word.get("example") or "",
                "current_translation": primary_word.get("translation") or "",
                "collocations": "；".join(primary_word.get("collocations") or []),
                "proposed_example": "",
                "proposed_translation": "",
                "source": "",
                "review_status": "pending",
                "reviewer": "",
                "reviewed_at": "",
                "notes": "",
            }
        )

    order = {"P0": 0, "P1": 1, "P2": 2}
    rows.sort(
        key=lambda row: (
            order[str(row["priority"])],
            -int(row["priority_score"]),
            str(row["word"]).casefold(),
        )
    )
    return rows


def render_csv(rows: list[dict[str, str | int]]) -> str:
    from io import StringIO

    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def render_markdown(rows: list[dict[str, str | int]]) -> str:
    priority_counts = Counter(str(row["priority"]) for row in rows)
    book_counts = Counter(
        book.strip()
        for row in rows
        for book in str(row["books"]).split(" / ")
    )
    lines = [
        "# 拾词例句审核队列",
        "",
        "由 `python3 tools/export_content_review.py` 生成。只包含带 "
        "`fallback-example` 标记的英文词条；不会替换原文，也不会自动发布新例句。",
        "",
        f"- 待审核：**{len(rows)}** 条",
        f"- P0：{priority_counts['P0']} 条",
        f"- P1：{priority_counts['P1']} 条",
        f"- P2：{priority_counts['P2']} 条",
        "",
        "## 按词书出现次数",
        "",
        "| 词书 | 待审核条数 |",
        "| --- | ---: |",
    ]
    for book_id in BOOKS:
        lines.append(f"| {BOOK_LABELS[book_id]} | {book_counts[BOOK_LABELS[book_id]]} |")
    lines.extend(
        [
            "",
            "## 审核规则",
            "",
            "1. P0 优先，通常是高频词或跨词书重复词。",
            "2. 替换例句必须包含目标词，语义自然，并保留中文翻译。",
            "3. `source` 记录词典、教材、人工改写或自有例句来源。",
            "4. 审核完成后把 `review_status` 改为 `approved` 或 `rejected`。",
            "5. 未经人工审核的内容不要直接覆盖词书数据。",
            "",
            "完整字段见 `reports/content-review.csv`。",
            "",
        ]
    )
    return "\n".join(lines)


def write_or_check(path: Path, content: str, check: bool) -> bool:
    if check:
        current = path.read_text() if path.exists() else ""
        if current != content:
            print(f"content review queue is stale: {path.relative_to(ROOT)}", file=sys.stderr)
            return False
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MD)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    rows = build_rows()
    csv_path = args.csv if args.csv.is_absolute() else ROOT / args.csv
    markdown_path = args.markdown if args.markdown.is_absolute() else ROOT / args.markdown
    ok = write_or_check(csv_path, render_csv(rows), args.check)
    ok = write_or_check(markdown_path, render_markdown(rows), args.check) and ok
    if not ok:
        return 1
    print(f"content review: {len(rows)} pending entries")
    print(csv_path)
    print(markdown_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
