#!/usr/bin/env python3
"""Fail fast on content or deployment regressions."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def require(condition, message):
    if not condition:
        raise SystemExit(f"CHECK FAILED: {message}")


def main():
    book = json.loads((ROOT / "data/books/wenyan.json").read_text())
    index = json.loads((ROOT / "data/books/index.json").read_text())
    words = book["words"]
    core = [word for word in words if word.get("category") == "core"]
    extension = [word for word in words if word.get("category") == "extension"]

    require(len(words) == 200, "文言词书必须是 200 条")
    require(len(core) == 120, "核心实词必须是 120 条")
    require(len(extension) == 80, "拓展实词必须是 80 条")
    require(len({word["id"] for word in words}) == 200, "词条 ID 不得重复")
    require(len({word["word"] for word in words}) == 200, "词条文本不得重复")
    require(all(word.get("meanings") for word in words), "每个词条必须有义项")
    require(all(word.get("example") for word in words), "每个词条必须有例句")
    require(all(word.get("translation") for word in words), "每个词条必须有译文")
    require(index.get("wenyan") == [word["id"] for word in words], "索引必须与词书一致")
    require(len(index.get("wenyan", [])) == 200, "索引词数必须是 200")

    for relative in [
        "index.html",
        "serve.py",
        ".github/workflows/pages.yml",
        "tools/install_local.sh",
        "tools/deploy_local.sh",
    ]:
        require((ROOT / relative).exists(), f"缺少文件 {relative}")

    install_script = (ROOT / "tools/deploy_local.sh").read_text()
    require("--exclude 'progress/'" in install_script, "部署脚本必须排除 progress/")

    print("project checks: ok")
    print("wenyan: 200 = 120 core + 80 extension")
    print("deployment: GitHub Pages workflow + local persistent service")
    print("records: progress/ is protected from deployment")


if __name__ == "__main__":
    main()
