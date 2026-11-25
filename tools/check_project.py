#!/usr/bin/env python3
"""Fail fast on content or deployment regressions."""

from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent.parent
BOOK_COUNTS = {
    "gaokao": 3663,
    "curated": 120,
    "wenyan": 1200,
    "ielts": 3426,
    "cet4": 1162,
    "cet6": 1228,
}
STORE_CONSTANTS = {
    "STORAGE_KEY", "SCHEMA_VERSION", "REVIEW_DAYS", "MASTER_STAGE",
    "MIN_DAILY_GOAL", "MAX_DAILY_GOAL",
}
STORE_GETTERS = {"words", "units"}
STORE_METHODS = {
    "loadBook", "activateBook", "setBookIndex", "getBookMeta",
    "getBookProgress", "getActiveBookId", "getWord", "getUnit",
    "getRecord", "hasRecord", "getStatus", "isDue", "getDueLabel",
    "getProfile", "getMeta", "getState", "getActivityDay", "getOverview",
    "totalStats", "unitStats", "newWords", "studiedWords",
    "learnedReviewWords", "buildLearnedReviewQueue", "favorites", "dueWords",
    "buildDailyPlan", "buildNewQueue", "buildReviewQueue", "buildMixedQueue",
    "answerWord", "dueForSelfRating", "recordSessionQuizAnswer",
    "recordObjectiveAnswer", "recordQuizAnswer", "recordSession", "recordHint",
    "toggleFavorite", "markMastered", "updateProfile", "resetAll",
    "getWeekSeries", "getHeatmap", "getReviewForecast", "progressPercent",
    "getDailyGoalOptions", "dateKey", "todayKey", "addDays", "keyToDate",
    "formatDateCN", "weekdayCN", "daysBetween", "reviewLabelForStage",
    "hasVerifiedMastery", "classifySpellingError", "isStorageAvailable",
    "prepareRemote", "hydrateFromIndexedDb", "requestPersistentStorage",
    "pushRemoteNow", "restoreRemoteState", "exportState", "importState",
    "getPersistence",
}
UI_ENTRIES = {
    "renderHome", "renderStudyCenter", "renderLibrary", "renderBooks",
    "renderReport", "renderMemoryWall", "renderSession", "wordDrawer", "settingsDrawer",
    "modal", "searchSuggestions",
}


def skip_non_code(source: str, start: int) -> int:
    """Skip one JS comment or literal, including nested template interpolations."""
    if source.startswith("//", start):
        end = source.find("\n", start + 2)
        return len(source) if end == -1 else end
    if source.startswith("/*", start):
        end = source.find("*/", start + 2)
        require(end != -1, "JavaScript 存在未闭合块注释")
        return end + 2
    if source[start] == "/":
        before = start - 1
        while before >= 0 and source[before].isspace():
            before -= 1
        expression_prefix = before < 0 or source[before] in "=([{:,!?;&|+-*%^~<>"
        expression_prefix = expression_prefix or bool(re.search(
            r"\b(?:return|case|throw|yield|await)\s*$", source[max(0, before - 10):start]
        ))
        if expression_prefix:
            cursor = start + 1
            in_character_class = False
            while cursor < len(source) and source[cursor] != "\n":
                if source[cursor] == "\\":
                    cursor += 2
                    continue
                if source[cursor] == "[":
                    in_character_class = True
                elif source[cursor] == "]":
                    in_character_class = False
                elif source[cursor] == "/" and not in_character_class:
                    cursor += 1
                    while cursor < len(source) and source[cursor].isalpha():
                        cursor += 1
                    return cursor
                cursor += 1
    quote = source[start]
    if quote not in "'\"`":
        return start
    cursor = start + 1
    while cursor < len(source):
        if source[cursor] == "\\":
            cursor += 2
        elif source[cursor] == quote:
            return cursor + 1
        elif quote == "`" and source.startswith("${", cursor):
            cursor += 2
            depth = 1
            while cursor < len(source) and depth:
                next_cursor = skip_non_code(source, cursor)
                if next_cursor != cursor:
                    cursor = next_cursor
                    continue
                if source[cursor] == "{":
                    depth += 1
                elif source[cursor] == "}":
                    depth -= 1
                cursor += 1
            require(depth == 0, "JavaScript 模板插值未闭合")
        else:
            cursor += 1
    require(False, "JavaScript 字符串或模板字面量未闭合")
    return len(source)


def code_mask(source: str) -> str:
    """Keep JavaScript code at original offsets; blank comments and literals."""
    masked = list(source)
    cursor = 0
    while cursor < len(source):
        end = skip_non_code(source, cursor)
        if end != cursor:
            for position in range(cursor, end):
                if masked[position] != "\n":
                    masked[position] = " "
            cursor = end
        else:
            cursor += 1
    return "".join(masked)


def strip_leading_comments(source: str) -> str:
    """Remove trivia preceding a property without altering its initializer."""
    cursor = 0
    while cursor < len(source):
        if source[cursor].isspace():
            cursor += 1
        elif source.startswith(("//", "/*"), cursor):
            cursor = skip_non_code(source, cursor)
        else:
            break
    return source[cursor:].strip()


def object_properties(source: str, assignment: str) -> list[str]:
    """Split a JS object literal at top-level commas, ignoring comments and literals."""
    matches = list(re.finditer(r"\b" + re.escape(assignment) + r"\s*=\s*\{", code_mask(source)))
    require(len(matches) == 1, f"{assignment} 必须恰好有一个对象字面量导出")
    start = matches[0].end()
    stack: list[str] = ["{"]
    pieces: list[str] = []
    position = start
    cursor = start
    pairs = {"}": "{", "]": "[", ")": "("}
    while cursor < len(source):
        end = skip_non_code(source, cursor)
        if end != cursor:
            cursor = end
            continue
        char = source[cursor]
        if char in "{[(":
            stack.append(char)
        elif char in "}])":
            require(stack and stack[-1] == pairs[char], f"{assignment} 括号不匹配")
            stack.pop()
            if not stack:
                tail = strip_leading_comments(source[position:cursor])
                if tail:
                    pieces.append(tail)
                return pieces
        elif char == "," and len(stack) == 1:
            piece = strip_leading_comments(source[position:cursor])
            if piece:
                pieces.append(piece)
            position = cursor + 1
        cursor += 1
    require(False, f"{assignment} 对象字面量未闭合")
    return []


def check_public_api(store_js: str, ui_js: str) -> None:
    """Freeze the named and typed Store facade plus the essential UI exports."""
    store_code = code_mask(store_js)
    ui_code = code_mask(ui_js)
    exported: dict[str, str] = {}
    for property_text in object_properties(store_js, "window.Store"):
        getter = re.match(r"get\s+([\w$]+)\s*\(", property_text)
        field = re.match(r"([\w$]+)\s*:\s*([\s\S]+)", property_text)
        require(getter is not None or field is not None,
                f"Store 导出属性无法解析: {property_text[:60]}")
        if getter:
            name, kind = getter.group(1), "getter"
        else:
            name, value = field.group(1), field.group(2).strip()
            if name in STORE_CONSTANTS:
                kind = "constant" if value == name else "invalid constant"
            elif re.match(r"(?:async\s+)?function\b", value):
                kind = "method"
            else:
                kind = "method" if value == name and re.search(
                    r"\bfunction\s+" + re.escape(name) + r"\s*\(", store_code
                ) else "invalid method"
        require(not kind.startswith("invalid"), f"Store {name} 导出类型或绑定不符合基线: {kind}")
        require(name not in exported, f"Store 重复导出成员: {name}")
        exported[name] = kind

    for kind, expected in (("method", STORE_METHODS),
                           ("getter", STORE_GETTERS),
                           ("constant", STORE_CONSTANTS)):
        actual = {name for name, value in exported.items() if value == kind}
        require(actual == expected,
                f"Store {kind} 清单变化: 缺失={sorted(expected - actual)}, "
                f"新增={sorted(actual - expected)}")
    require(len(exported) == 73 and len(STORE_METHODS) == 65,
            f"Store 应有 65 方法+2 getter+6 常量，实际导出 {len(exported)}")
    storage_declarations = list(re.finditer(r"\bconst\s+STORAGE_KEY\s*=", store_code))
    require(len(storage_declarations) == 1, "Store 必须恰好声明一个 STORAGE_KEY")
    value_start = storage_declarations[0].end()
    while value_start < len(store_js):
        if store_js[value_start].isspace():
            value_start += 1
        elif store_js.startswith(("//", "/*"), value_start):
            value_start = skip_non_code(store_js, value_start)
        else:
            break
    require(value_start < len(store_js) and store_js[value_start] in "'\"",
            "Store 存储键必须是 shici.state.v1 字符串字面量")
    value_end = skip_non_code(store_js, value_start)
    require(store_js[value_start:value_end] in ("'shici.state.v1'", '"shici.state.v1"'),
            "Store 存储键必须保持 shici.state.v1")
    require(re.search(r"\bwindow\.UI\s*=\s*UI\s*;", ui_code), "UI 必须挂载 window.UI")
    for name in sorted(UI_ENTRIES):
        require(re.search(r"\bUI\." + re.escape(name) + r"\s*=\s*" + name + r"\s*;", ui_code),
                f"UI 缺失关键入口 {name}")


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
    require(set(index) == set(BOOK_COUNTS),
            f"词书索引清单变化: 缺失={sorted(set(BOOK_COUNTS) - set(index))}, "
            f"新增={sorted(set(index) - set(BOOK_COUNTS))}")
    total_words = 0
    for book_id, expected_count in BOOK_COUNTS.items():
        book_data = json.loads((ROOT / f"data/books/{book_id}.json").read_text())
        book_words = book_data["words"]
        word_ids = [word["id"] for word in book_words]
        require(book_data.get("id") == book_id, f"{book_id} 词书 ID 不匹配")
        require(len(book_words) == expected_count,
                f"{book_id} 必须有 {expected_count} 条，实际 {len(book_words)} 条")
        require(len(set(word_ids)) == expected_count, f"{book_id} 存在重复词条 ID")
        require(index[book_id] == word_ids, f"{book_id} 索引 ID 或顺序与词书不一致")
        total_words += len(book_words)
    require(total_words == 10799, f"六本词书合计必须有 10799 条，实际 {total_words} 条")
    for book_id, expected_count in BOOK_COUNTS.items():
        manifest_path = ROOT / f"data/books/{book_id}.manifest.js"
        require(manifest_path.exists(), f"{book_id} 缺少分段词书清单")
        manifest_text = manifest_path.read_text(encoding="utf-8")
        manifest = json.loads(manifest_text.split("] = ", 1)[1].rstrip().rstrip(";"))
        require(manifest.get("wordCount") == expected_count,
                f"{book_id} 分段清单词数不一致")
        require(len(manifest.get("wordIds", [])) == expected_count,
                f"{book_id} 分段清单 ID 不完整")
        require(sum(chunk.get("count", 0) for chunk in manifest.get("chunks", [])) == expected_count,
                f"{book_id} 分段数量总和不一致")
        unit_union = []
        for ids in manifest.get("unitIds", {}).values():
            unit_union.extend(ids)
        require(len(unit_union) == expected_count and len(set(unit_union)) == expected_count,
                f"{book_id} 单元 ID 映射不完整或重复")
        chunk_ids = []
        for chunk in manifest["chunks"]:
            chunk_path = ROOT / chunk["path"]
            require(chunk_path.exists(), f"{book_id} 缺少分段 {chunk['path']}")
            require(chunk_path.stat().st_size < 300 * 1024,
                    f"{book_id} 单段词书超过 300KB")
            chunk_text = chunk_path.read_text(encoding="utf-8")
            chunk_payload = json.loads(chunk_text.split("] = ", 1)[1].rstrip().rstrip(";"))
            chunk_ids.extend(word["id"] for word in chunk_payload.get("words", []))
        require(chunk_ids == manifest["wordIds"],
                f"{book_id} 分段顺序与清单 ID 不一致")
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
        "js/premium-config.js",
        "js/domain/state-schema.js",
        "js/domain/srs-engine.js",
        "js/storage/state-integrity.js",
        "js/domain/entitlements.js",
        "tools/issue_memory_wall_license.py",
        "tools/build_book_chunks.py",
        "tools/package_static.sh",
        "docs/operations/mainland-deployment.md",
        "docs/contracts/memory-wall-payment.md",
        "tools/fixtures/state-v3.min.json",
        "tools/fixtures/state-v1.min.json",
        "tools/fixtures/state-v2.min.json",
        "tools/tests/state-schema.test.cjs",
        "tools/tests/srs-engine.test.cjs",
        "tools/tests/state-integrity.test.cjs",
        "docs/contracts/baseline.md",
        "docs/contracts/storage-safety.md",
        "docs/contracts/t02-migration-plan.md",
        "docs/system_design.md",
        "docs/01-shici-prd.md",
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
    require([word["id"] for word in curated["words"]] == [word["id"] for word in core],
            "文言精讲 120 的词条 ID 与总书核心 120 不一致，不能共享学习进度")
    app_js = (ROOT / "js/app.js").read_text()
    require("document.currentScript" in app_js and "source.match" in app_js, "动态数据版本必须跟随入口脚本，不能写死旧缓存版本")
    require("window.addEventListener('beforeunload'" not in app_js, "学习会话不得阻止用户关闭页面或退出 Safari")
    store_js = (ROOT / "js/store.js").read_text()
    require("SCHEMA_VERSION = 3" in store_js, "学习记录必须使用可迁移的新 schema")
    require("recordObjectiveAnswer" in store_js, "客观提取必须与卡片自评分开记录")
    require("hydrateFromIndexedDb" in store_js, "必须提供 IndexedDB 历史恢复层")
    require("visibilitychange" not in store_js,
            "后台切换不得发送无法确认 revision 的 CAS 写入")
    require("localSeen === 0 && remoteSeen === 0" in store_js,
            "双空状态冲突必须自动以服务端 revision 重试")
    ui_js = (ROOT / "js/ui.js").read_text()
    require("home-more" in ui_js and "report-more" in ui_js,
            "首页和报告必须保留折叠的次级内容")
    require("mode-card" not in ui_js,
            "学习中心不得重复展示已合并的模式大卡")
    check_public_api(store_js, ui_js)
    require("navigator.storage.persist" in app_js or "requestPersistentStorage" in store_js, "必须申请浏览器持久存储")
    require("buildSpellingPool" in app_js and "Store.studiedWords()" in app_js, "拼写挑战必须只使用已学词")
    require("serviceWorker.register" in app_js, "必须注册离线 Service Worker")
    require("ego-browser nodejs" in (ROOT / "tools/test_learning_system.sh").read_text(), "浏览器主验收必须使用 ego-browser")
    index_html = (ROOT / "index.html").read_text()
    require('rel="manifest"' in index_html, "页面必须声明 Web App Manifest")
    require("css/styles.css?v=38" in index_html, "入口资源版本必须升级到 v38")
    require("js/product-analytics.js?v=38" in index_html, "匿名事件接口必须随入口加载")
    require("js/premium-config.js?v=38" in index_html, "付费产品配置必须随入口加载")
    require("js/domain/state-schema.js?v=38" in index_html, "状态迁移模块必须随入口加载")
    require("js/domain/srs-engine.js?v=38" in index_html, "SRS 领域模块必须随入口加载")
    require("js/storage/state-integrity.js?v=38" in index_html, "状态完整性模块必须随入口加载")
    require("js/domain/entitlements.js?v=38" in index_html, "离线授权校验模块必须随入口加载")
    sw_text = (ROOT / "sw.js").read_text()
    require("shici-v38" in sw_text, "Service Worker 缓存版本必须升级到 v38")
    require(sw_text.count("?v=38") == 11, "Service Worker 应用资源必须全部使用 v38")
    require("data/books/index.js?v=27" in sw_text, "词书索引必须使用独立的数据版本")
    app_js = (ROOT / "js/app.js").read_text()
    require("fetchBookManifest" in app_js and "fetchBookChunk" in app_js,
            "应用必须支持分段词书渐进加载")
    require("feedback.html" in (ROOT / "js/ui.js").read_text(), "设置页必须提供公开反馈入口")
    require("privacy.html" in index_html, "页脚必须提供隐私说明")
    require("大陆网络下 GitHub 可能不稳定" in (ROOT / "feedback.html").read_text(),
            "反馈页必须提示 GitHub 在大陆网络下的限制")
    package_script = (ROOT / "tools/package_static.sh").read_text()
    require("progress/" in package_script and "tools/source/" in package_script,
            "静态发布包必须排除本地记录和私有源文件")
    analytics_js = (ROOT / "js/product-analytics.js").read_text()
    require("SHICI_PRODUCT_ANALYTICS_CONFIG" in analytics_js, "匿名事件接口必须显式配置端点")
    require("if (!consent || !endpoint) return true;" in analytics_js, "匿名事件不得在无同意或无端点时外发")
    premium_config = (ROOT / "js/premium-config.js").read_text()
    require("memoryWall" in premium_config and "purchaseUrl" in premium_config,
            "记忆墙付费产品必须提供可配置购买入口")
    entitlements_js = (ROOT / "js/domain/entitlements.js").read_text()
    require("ECDSA" in entitlements_js and "crypto.subtle.verify" in entitlements_js,
            "付费授权必须使用签名校验")
    review_csv = (ROOT / "reports/content-review.csv").read_text()
    require(review_csv.startswith("priority,priority_score,books,word,"), "内容审核队列必须包含固定表头")
    require("review_status" in review_csv, "内容审核队列必须包含审核状态")
    for html_path in ROOT.glob("*.html"):
        parser = LocalLinkParser()
        parser.feed(html_path.read_text())
        require(not parser.missing, f"{html_path.name} 含不存在的本地资源: {parser.missing}")
    print("project checks: ok")
    print("store api: 65 methods + 2 getters + 6 constants; UI: 10 entries")
    print("books: 10799 entries across 6 books; all index IDs and order match")
    print("wenyan: 1200 = 200 editorial + 1000 high-frequency")
    print("deployment: GitHub Pages workflow + local persistent service")
    print("records: progress/ is protected from deployment")


if __name__ == "__main__":
    main()
