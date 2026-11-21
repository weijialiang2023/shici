#!/usr/bin/env python3
"""Fail fast on content or deployment regressions."""

from __future__ import annotations

import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent.parent


class LocalLinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.missing: list[str] = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        for key in ("href", "src"):
            value = values.get(key)
            if not value:
                continue
            parsed = urlparse(value)
            if parsed.scheme or parsed.netloc or value.startswith("#"):
                continue
            relative = value.split("#", 1)[0].split("?", 1)[0]
            if relative and not (ROOT / relative).resolve().exists():
                self.missing.append(value)


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
        "manifest.webmanifest",
        "sw.js",
        "offline.html",
        "tools/content_audit.py",
        "tools/export_content_review.py",
        "content-audit.md",
        "feedback.html",
        "privacy.html",
        "terms.html",
        "css/info-pages.css",
        "js/feedback.js",
        "js/product-analytics.js",
        "reports/content-review.csv",
        "reports/content-review.md",
        ".github/ISSUE_TEMPLATE/content-correction.yml",
        ".github/ISSUE_TEMPLATE/bug-report.yml",
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
    store_js = (ROOT / "js/store.js").read_text()
    require("SCHEMA_VERSION = 3" in store_js, "学习记录必须使用可迁移的新 schema")
    require("recordObjectiveAnswer" in store_js, "客观提取必须与卡片自评分开记录")
    require("hydrateFromIndexedDb" in store_js, "必须提供 IndexedDB 历史恢复层")
    require("navigator.storage.persist" in app_js or "requestPersistentStorage" in store_js, "必须申请浏览器持久存储")
    require("buildSpellingPool" in app_js and "Store.studiedWords()" in app_js, "拼写挑战必须只使用已学词")
    require("serviceWorker.register" in app_js, "必须注册离线 Service Worker")
    require("ego-browser nodejs" in (ROOT / "tools/test_learning_system.sh").read_text(), "浏览器主验收必须使用 ego-browser")
    index_html = (ROOT / "index.html").read_text()
    require('rel="manifest"' in index_html, "页面必须声明 Web App Manifest")
    require("css/styles.css?v=27" in index_html, "入口资源版本必须升级到 v27")
    require("js/product-analytics.js?v=27" in index_html, "匿名事件接口必须随入口加载")
    sw_text = (ROOT / "sw.js").read_text()
    require("shici-v27" in sw_text, "Service Worker 缓存版本必须升级到 v27")
    require(sw_text.count("?v=27") == 7, "Service Worker 外壳资源必须全部使用 v27")
    require("feedback.html" in (ROOT / "js/ui.js").read_text(), "设置页必须提供公开反馈入口")
    require("privacy.html" in index_html, "页脚必须提供隐私说明")
    analytics_js = (ROOT / "js/product-analytics.js").read_text()
    require("SHICI_PRODUCT_ANALYTICS_CONFIG" in analytics_js, "匿名事件接口必须显式配置端点")
    require("if (!consent || !endpoint) return true;" in analytics_js, "匿名事件不得在无同意或无端点时外发")
    review_csv = (ROOT / "reports/content-review.csv").read_text()
    require(review_csv.startswith("priority,priority_score,books,word,"), "内容审核队列必须包含固定表头")
    require("review_status" in review_csv, "内容审核队列必须包含审核状态")
    for html_path in ROOT.glob("*.html"):
        parser = LocalLinkParser()
        parser.feed(html_path.read_text())
        require(not parser.missing, f"{html_path.name} 含不存在的本地资源: {parser.missing}")
    for book_id in ("gaokao", "ielts", "cet4", "cet6"):
        book_data = json.loads((ROOT / f"data/books/{book_id}.json").read_text())
        require(len(book_data["words"]) == len(index[book_id]), f"{book_id} 词数必须与索引一致")

    print("project checks: ok")
    print("wenyan: 1200 = 200 editorial + 1000 high-frequency")
    print("deployment: GitHub Pages workflow + local persistent service")
    print("records: progress/ is protected from deployment")


if __name__ == "__main__":
    main()
