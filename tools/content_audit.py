#!/usr/bin/env python3
"""Audit the bundled English books and write a human-readable report.

The report separates hard failures from review signals. Review signals are
kept visible so generated dictionary content is not mistaken for editorial
review.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BOOKS = ("gaokao", "ielts", "cet4", "cet6")
REVIEW_TERMS = {
    "人名/专业名": re.compile(r"\b(?:john|mary|mike|paris|england|japan|tibet|swiss|italian)\b", re.I),
    "元素/专业名": re.compile(r"\b(?:uranium|plutonium|radon|mercury|isotope|cholesterol)\b", re.I),
    "货币/单位": re.compile(r"\b(?:dollar|pound|euro|yen|sterling|cent)\b", re.I),
}
KNOWN_SPELLING = re.compile(r"behavious|relinguish", re.I)
IPA_IN_MEANING = re.compile(r"[\[\]]|\s/[^/]+/$")


def load_book(book_id: str) -> dict:
    return json.loads((ROOT / f"data/books/{book_id}.json").read_text(encoding="utf-8"))


def audit_book(book_id: str) -> dict:
    book = load_book(book_id)
    words = book.get("words", [])
    ids = Counter(str(word.get("id", "")) for word in words)
    texts = Counter(str(word.get("word", "")).lower() for word in words)
    missing = {"word": [], "ipa": [], "pos": [], "coreMeaning": [], "example": [], "translation": []}
    duplicate_meanings = []
    target_not_in_example = []
    bracket_issues = []
    spelling_issues = []
    ipa_in_meaning = []
    review_signals = []

    for word in words:
        text = str(word.get("word", ""))
        meanings = word.get("meanings") or []
        core = word.get("coreMeanings") or meanings[:2]
        if not text:
            missing["word"].append(word)
        if not word.get("ipa"):
            missing["ipa"].append(text)
        if not word.get("pos"):
            missing["pos"].append(text)
        if not core:
            missing["coreMeaning"].append(text)
        if not word.get("example"):
            missing["example"].append(text)
        if not word.get("translation"):
            missing["translation"].append(text)
        if len({meaning.strip() for meaning in meanings if meaning.strip()}) != len([meaning for meaning in meanings if meaning.strip()]):
            duplicate_meanings.append(text)
        if word.get("example") and text.lower() not in word["example"].lower():
            target_not_in_example.append(text)
        for meaning in meanings:
            if any(meaning.count(left) != meaning.count(right) for left, right in (("(", ")"), ("（", "）"), ("[", "]"))):
                bracket_issues.append([text, meaning])
            if IPA_IN_MEANING.search(meaning):
                ipa_in_meaning.append([text, meaning])
        if KNOWN_SPELLING.search(text):
            spelling_issues.append(text)
        review_text = " ".join([text, *meanings, word.get("example", ""), word.get("translation", "")])
        categories = [name for name, pattern in REVIEW_TERMS.items() if pattern.search(review_text)]
        if categories:
            review_signals.append({"word": text, "categories": categories})

    return {
        "book": book_id,
        "count": len(words),
        "duplicateIds": [value for value, count in ids.items() if value and count > 1],
        "duplicateWords": [value for value, count in texts.items() if value and count > 1],
        "missing": missing,
        "duplicateMeanings": duplicate_meanings,
        "targetNotInExample": target_not_in_example,
        "bracketIssues": bracket_issues,
        "ipaInMeaning": ipa_in_meaning,
        "knownSpellingIssues": spelling_issues,
        "reviewSignals": review_signals,
        "fallbackExamples": sum(1 for word in words if "fallback-example" in (word.get("contentFlags") or [])),
        "withExtendedMeanings": sum(1 for word in words if word.get("extendedMeanings")),
    }


def render_markdown(results: list[dict]) -> str:
    lines = [
        "# 拾词内容校验报告",
        "",
        "由 `python3 tools/content_audit.py` 生成。硬性问题会阻止项目校验；"
        "“审核信号”用于人工抽检，不会自动删除正常词义。",
        "",
        "| 词书 | 词数 | 缺音标 | 缺例句 | 缺翻译 | 缺核心义项 | 重复义项 | 目标词不在例句 | 括号异常 | 音标混入释义 | 回退例句 | 拓展义项 |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for result in results:
        missing = result["missing"]
        lines.append(
            f'| {result["book"]} | {result["count"]} | {len(missing["ipa"])} | '
            f'{len(missing["example"])} | {len(missing["translation"])} | '
            f'{len(missing["coreMeaning"])} | {len(result["duplicateMeanings"])} | '
            f'{len(result["targetNotInExample"])} | {len(result["bracketIssues"])} | '
            f'{len(result["ipaInMeaning"])} | {result["fallbackExamples"]} | '
            f'{result["withExtendedMeanings"]} |'
        )
    lines.extend([
        "",
        "## 规则说明",
        "",
        "- 缺例句/翻译/音标：必须清零。缺例句的条目由构建脚本生成可识别的课堂场景句子，并写入 `contentFlags`。",
        "- 目标词不在例句：必须清零。构建时优先使用上游句子，必要时回退到目标词明确出现的课堂句。",
        "- 括号异常、音标混入释义、已知拼写错误：必须清零。",
        "- 重复义项：作为人工审核清单保留。",
        "- 人名、元素、货币与专业名：作为审核信号保留，因为部分词本身是考试词汇，不能机械删除。",
        "",
        "## 人工审核清单",
        "",
    ])
    any_signal = False
    for result in results:
        rows = result["reviewSignals"][:80]
        if not rows:
            continue
        any_signal = True
        lines.append(f'### {result["book"]}')
        lines.append("")
        for row in rows:
            lines.append(f'- `{row["word"]}`：{"、".join(row["categories"])}')
        lines.append("")
    if not any_signal:
        lines.append("本批自动规则未命中审核信号。")
        lines.append("")
    lines.extend([
        "## 已知限制",
        "",
        "自动规则不能代替教材逐条校订。高频功能词、多义词、专业缩写和词族深浅仍需人工抽检；"
        "当前默认卡片只展示最多两个核心义项，其余义项折叠到“拓展义项”。",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", default=str(ROOT / "content-audit.json"))
    parser.add_argument("--markdown", default=str(ROOT / "content-audit.md"))
    args = parser.parse_args()
    results = [audit_book(book_id) for book_id in BOOKS]

    hard_failures = []
    for result in results:
        missing = result["missing"]
        for field in ("word", "ipa", "pos", "coreMeaning", "example", "translation"):
            if missing[field]:
                hard_failures.append(f'{result["book"]}: missing {field}: {len(missing[field])}')
        for field in ("duplicateIds", "duplicateWords", "targetNotInExample", "bracketIssues", "ipaInMeaning", "knownSpellingIssues"):
            if result[field]:
                hard_failures.append(f'{result["book"]}: {field}: {len(result[field])}')

    Path(args.json).write_text(json.dumps({"ok": not hard_failures, "books": results, "failures": hard_failures}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    Path(args.markdown).write_text(render_markdown(results), encoding="utf-8")
    if hard_failures:
        raise SystemExit("CONTENT AUDIT FAILED\n" + "\n".join(hard_failures))
    print(f"content audit: ok -> {args.markdown}")


if __name__ == "__main__":
    main()
