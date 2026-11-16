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
    catalog = json.loads((ROOT / "tools/wenyan_catalog.json").read_text())
    words = book["words"]
    core = [word for word in words if word.get("category") == "core"]
    extension = [word for word in words if word.get("category") == "extension"]
    highfreq = [word for word in words if word.get("category") == "highfreq"]

    require(len(words) == 1200, "文言词书必须是 1200 条")
    require(len(core) == 120, "核心实词必须是 120 条")
    require(len(extension) == 80, "拓展实词必须是 80 条")
    require(len(highfreq) == 1000, "经典高频字义必须是 1000 条")
    require(len({word["id"] for word in words}) == 1200, "词条 ID 不得重复")
    require(len({word["word"] for word in words}) == 1200, "词条文本不得重复")
    require(all(word.get("meanings") for word in words), "每个词条必须有义项")
    require(all(word.get("example") for word in core + extension), "教材精讲条目必须有例句")
    require(all(word.get("translation") for word in core + extension), "教材精讲条目必须有译文")
    require(all(word.get("example") for word in highfreq if word.get("collocations")), "有出处的字义条目必须有例句")
    require(index.get("wenyan") == [word["id"] for word in words], "索引必须与词书一致")
    require(len(index.get("wenyan", [])) == 1200, "索引词数必须是 1200")
    require(len(catalog.get("words", [])) == 1000, "高频字义源目录必须是 1000 条")
    require(all(row.get("pinyin") and row.get("meanings") for row in catalog["words"]), "高频字义源目录必须有读音和义项")
    require(all(source.get("license") == "MIT" and source.get("commit") for source in catalog.get("sources", [])), "高频字义数据源必须记录 MIT 授权与固定版本")

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
    book_config = (ROOT / "js/data.js").read_text()
    require("title: '文言精讲 120'" in book_config, "精讲词书必须明确标注为文言")
    require("dataUrl: 'data/books/curated.json'" in book_config, "文言精讲必须使用独立的 120 条数据")
    require("title: '高中文言重点字词 1200'" in book_config, "文言词书名称不得被英语精讲覆盖")
    require("title: '英语精讲 120'" not in book_config, "不得再把精讲 120 配成英语词书")
    curated = json.loads((ROOT / "data/books/curated.json").read_text())
    require(curated.get("id") == "curated" and len(curated.get("words", [])) == 120, "文言精讲必须包含 120 条")
    require(all(word.get("lang") == "zh" for word in curated["words"]), "文言精讲词条必须全部是中文")
    app_js = (ROOT / "js/app.js").read_text()
    require("document.currentScript" in app_js and "source.match" in app_js, "动态数据版本必须跟随入口脚本，不能写死旧缓存版本")
    require("window.addEventListener('beforeunload'" not in app_js, "学习会话不得阻止用户关闭页面或退出 Safari")

    print("project checks: ok")
    print("wenyan: 1200 = 200 editorial + 1000 high-frequency")
    print("deployment: GitHub Pages workflow + local persistent service")
    print("records: progress/ is protected from deployment")


if __name__ == "__main__":
    main()
