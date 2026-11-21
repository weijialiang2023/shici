# 拾词

一个打开就能用的中英文词汇学习站。默认提供高中英语 3500、雅思和四六级词书，并新增 **文言精讲 120** 与 **高中文言重点字词 1200**。文言总书先学 200 条带书证和现代译文的教材精讲，再进入 1000 条经典高频字义。

> 每天拾一点，表达多一点。

## 在线地址

- GitHub Pages：<https://weijialiang2023.github.io/shici/>
- GitHub 仓库：<https://github.com/weijialiang2023/shici>
- 本机长期服务：<http://127.0.0.1:4173/>

GitHub Pages 与本机服务属于两个不同的浏览器 origin，各自使用独立的
`localStorage`。设置页的导出/导入功能用于在两者之间迁移或备份记录。

## 当前词书

| 词书 | 词条数 | 定位 |
| --- | ---: | --- |
| 高中 3500 | 3,663 | 高考阶段常见英语词汇 |
| 文言精讲 120 | 120 | 六个主题的核心实词精讲，与 1200 字词总书共享进度 |
| 高中文言重点字词 1200 | 1,200 | 200 条教材精讲 + 1,000 条经典高频字义 |
| 雅思必背 | 3,426 | 雅思阅读、写作核心词汇 |
| 四级核心 | 1,162 | CET-4 高频核心词 |
| 六级核心 | 1,228 | CET-6 进阶核心词 |

合计 **10,799 个词条**。单词与文言字词共用同一个学习面板，但按各自的词条 ID 保存进度；切换词书不会清空记录。

## 文言重点字词 1200

- **核心 120** 按标准高中常见实词范围整理，学习计划优先抽取尚未学过的核心词。
- **拓展 80** 覆盖教材常见实词、通假、古今异义和一词多义。
- **高频字义 1,000** 按文言语料使用频率选出名词、动词和形容词用字，提供标准读音、常用义项和可用的字典书证。
- 前 200 条为人工精讲，全部包含义项、书证、现代译文和辨析提示；新增 1,000 条用于扩大覆盖面与语境回看。
- 分为「核心 01–06」「拓展 01–02」「高频 01–25」共 33 个单元；顺序始终是核心、拓展、高频字义。
- 支持同义项选择题、错词重学、收藏、搜索、筛选和间隔复习。

文言教材精讲依据高中语文常见实词范围整理；高频字义目录由数据脚本从公开字典与文言语料频率表生成。教材版本、注释习惯和具体语境可能不同，考试作答请以本校教材和老师讲解为准。

## 英语美音与男女声

英语发音统一使用 `en-US`，不再混用英音：

- 设置中可选择 **女声 / 男声**；
- 优先匹配系统内置美音声线（如 Samantha、Ava、Alex 等）；
- 系统缺少对应性别的美音时，仍固定 `en-US`，并通过音高参数保持男女声差异；
- 可调整 `0.70–1.15` 倍语速并试听；
- 发音偏好会随学习记录一起保存。

浏览器实际可用声线由操作系统决定。Safari、Chrome 和 macOS 一般自带美音声线；如果某个浏览器没有返回声线列表，仍会使用该浏览器默认的 `en-US` 朗读。

学习卡每次进入下一张新词时，会自动朗读一次词条本身；翻释义、收藏或返回页面不会重复播放。英文使用当前美音与男女声设置，中文使用中文语音。

## 学习算法与报告

学习记录把“卡片自评”和“客观提取”分开保存：

- 首次选择“忘了 / 想起了，但不确定 / 能准确说出”，下一次复习分别安排在今天稍后、明天、3 天后；
- 选择题、语境选词、反向选词和拼写题进入客观正确率，卡片自评只显示为自评分布；
- 今日计划按 7 词左右的小循环推进，复习与新词交错出现，每组结束都做一次短提取；
- 答错时记录用户选择的干扰项、题型和错误类别，下一次优先安排待巩固词；
- “已掌握”至少需要 3 个不同日期的成功提取、2 种题型，并有一次 7 天以上的成功间隔；
- 报告分开显示 24 小时保持率、7 天保持率、自评分布、错误诊断和下一次适合练习的内容。

每张卡片默认只显示一到两个核心义项，其余义项折叠到“拓展义项”。学习记录 schema 为 v3，旧记录会增量迁移；无法解析的旧数据会先另存为 `shici.state.v1.corrupt.*`，不会被直接覆盖。

## 复习已学

学习中心提供“复习已学”入口，适用于高中英语、英语文言精讲、文言 1200、雅思和四六级等全部词书：

- 队列包含当前词书全部已学词，不设数量上限；
- 不会混入当前词书里尚未学习的词；
- 待巩固、答错较多、复习阶段较低和连续答对次数较少的词优先出现；
- 中文词书使用词义检验，英文词书沿用原学习流程；
- 与“智能复习”相互独立：智能复习只抽取今天到期的词。

## 自动保存与长期记录

每次作答、收藏、设置或词书切换都会立即写入浏览器 `localStorage`，并同步到 IndexedDB 作为本地恢复层；支持时还会申请 `navigator.storage.persist()` 持久存储。在本机长期服务模式下，还会自动写入独立目录：

```text
~/Library/Application Support/Shici/progress/
├── state.json                      当前记录
├── state.prev.json                 上一版
└── history/
    ├── daily/YYYY-MM-DD.json       每天第一份快照，永久保留
    └── checkpoints/YYYY-MM-DDT*.json
                                    每 6 小时一份，近 90 天
```

此外还有三层保护：

1. 页面每 30 秒检查未同步修改并重试；
2. 切换到后台或关闭页面时，用 `sendBeacon`/keepalive 再写一次；
3. 写入失败后每 8 秒自动重试，设置页会显示当前真实状态，不把失败伪装成成功。

学习会话不会用浏览器 `beforeunload` 对话框阻止关闭标签页或退出 Safari；每次作答和设置变化都已即时保存。

设置页支持「导出当前记录」「导入备份」「从本机恢复」。GitHub Pages 是纯静态站点，没有服务器端数据库，因此公开部署时仍以浏览器保存为主，跨设备迁移请使用导出/导入文件。

## 离线安装

站点包含 Web App Manifest、应用图标、Service Worker 和离线兜底页。在线打开一次后：

- 首页、核心脚本、样式和当前已下载词书会进入浏览器缓存；
- 断网后仍可打开页面并继续已缓存的词书；
- 可在 Safari / Chrome 中“添加到主屏幕”或安装为独立 Web App；
- 离线缓存不会替代备份，重要记录仍建议定期导出 JSON。

## 本机长期运行

桌面 `拾词.webloc` 指向固定地址：

<http://127.0.0.1:4173/>

首次安装或更新后运行：

```bash
cd "/Users/weijialiang/Documents/Codex/2026-11-16/wo/shici"
./tools/install_local.sh
```

脚本会：

- 同步静态文件到 `~/Library/Application Support/Shici`；
- **明确排除 `progress/`，部署永远不会删除学习记录**；
- 安装并启动 LaunchAgent `com.shici.web`；
- 登录后自动启动，进程退出后自动拉起。

只更新静态文件时也可以运行：

```bash
./tools/deploy_local.sh
```

停止常驻服务：

```bash
launchctl bootout "gui/$(id -u)/com.shici.web"
```

## GitHub Pages

项目已经包含 `.github/workflows/pages.yml`。推送到 GitHub 的 `main` 分支后，在仓库 **Settings → Pages** 中把 Source 设为 **GitHub Actions** 即可发布。

GitHub Pages 版本是纯前端模式：

- 学习进度保存在当前浏览器；
- 不支持本机 `/api/state` 历史快照；
- 换浏览器、换设备或清理站点数据前，请从设置页导出 JSON 备份；
- 不需要构建、数据库或 API Key。

仓库已启用 **Settings → Pages → GitHub Actions**。推送到 `main` 后，
`.github/workflows/pages.yml` 会自动校验内容并发布。

## 开发与验证

本机预览：

```bash
python3 serve.py
```

重建 1200 个文言字词及总索引：

```bash
python3 tools/build_wenyan.py
python3 tools/build_books.py
```

英文词书构建会清理已知拼写错误、截断括号、音标混入释义等问题，并为缺少例句的条目生成带 `contentFlags: ["fallback-example"]` 的可追踪课堂例句。生成后运行内容审计：

```bash
python3 tools/content_audit.py
```

审计结果写入 [`content-audit.md`](./content-audit.md) 和 `content-audit.json`。硬性问题必须清零；人名、专业名、货币和元素等仅作为人工抽检信号保留。

自动例句进入单独的人工审核队列。重新生成审核表和摘要：

```bash
python3 tools/export_content_review.py
```

审核文件位于 [`reports/content-review.csv`](./reports/content-review.csv) 和
[`reports/content-review.md`](./reports/content-review.md)。审核前不会自动覆盖词书；
发布前可用 `--check` 确认提交的审核表与当前词书一致。

`tools/build_wenyan.py` 会校验：

- 总数为 1,200；
- 核心 120、拓展 80、高频字义 1,000；
- 没有重复词条；
- 每一条都有义项；
- 教材精讲均有例句和现代译文；
- 高频字义中标注出处的条目均保留书证例句。

使用 `ego-browser` 完成学习系统、自动发音、离线、报告空状态、掌握规则和 390px 响应的主验收：

```bash
bash tools/test_learning_system.sh
```

测试脚本可复用当前 Ego TaskSpace；通过 `SHICI_EGO_SPACE_ID` 指定已有空间。运行前会只清理测试 origin 的 Service Worker、缓存和本地学习数据。

如需重新生成高频字义目录，下载 `tools/build_wenyan_catalog.py`
顶部注明版本的 Jiayan 与 Chinese Xinhua Dictionary 源文件后运行：

```bash
python3 tools/build_wenyan_catalog.py \
  --frequency /path/to/jiayan-dict.txt \
  --char-pos /path/to/jiayan-char-pos.json \
  --xinhua /path/to/word.json
```

## 反馈与隐私

- 在线反馈与备份帮助：[feedback.html](./feedback.html)
- 当前数据保存方式：[privacy.html](./privacy.html)
- 服务范围和内容参考说明：[terms.html](./terms.html)
- 内容纠错与功能问题模板：`.github/ISSUE_TEMPLATE/`

`js/product-analytics.js` 提供默认关闭的匿名事件接口。它只在部署时显式配置
`window.SHICI_PRODUCT_ANALYTICS_CONFIG.endpoint` 且用户同意后外发事件；当前公开版本
没有配置接收端点，也没有接入第三方分析服务。

## 目录

```text
shici/
├── index.html
├── feedback.html / privacy.html / terms.html
├── manifest.webmanifest
├── sw.js
├── offline.html
├── content-audit.md / content-audit.json
├── reports/content-review.md / content-review.csv
├── css/styles.css / info-pages.css
├── js/
│   ├── data.js          # 词书元数据、等级与成就
│   ├── store.js         # 学习记录、间隔复习、自动保存
│   ├── ui.js            # 页面、卡片、设置与学习报告
│   ├── app.js           # 路由、交互、美音与男女声
│   ├── feedback.js      # 反馈报告生成
│   └── product-analytics.js # 默认关闭的匿名事件接口
├── data/books/          # 词书及跨词书进度索引
├── tools/
│   ├── build_books.py   # 重建全部词书
│   ├── build_wenyan.py  # 文言字词 1200 的构建与校验
│   ├── build_wenyan_catalog.py # 高频字义目录生成
│   ├── content_audit.py # 内容硬性问题与人工审核信号
│   ├── export_content_review.py # 自动例句人工审核队列
│   ├── test_learning_system.sh # ego-browser 主验收
│   ├── wenyan_catalog.json     # 1000 条高频字义数据
│   ├── deploy_local.sh  # 部署静态文件，保留 progress/
│   └── install_local.sh # 安装长期 LaunchAgent
├── serve.py             # 本机服务、存档与历史快照 API
└── .github/workflows/pages.yml
```

## 内容来源与授权

英语例句、音标和中文释义整理自公开学习词库 [KyleBing/dict](https://github.com/KyleBing/dict)（上游为 [kajweb/dict](https://github.com/kajweb/dict)），构建时做了去重、筛选和展示整理。该上游当前的授权范围需要在公开发布或商用前自行核对；项目代码的 MIT 许可不自动覆盖第三方词典数据。

前 200 条文言精讲按高中常见考点重建，例句采用常见教材名篇或经典典籍文本。新增的 1,000 条高频字义使用以下 MIT 授权数据构建：

- [Jiayan 文言 NLP 工具包](https://github.com/jiaeyan/Jiayan) 的文言字频与词性表；
- [Chinese Xinhua Dictionary](https://github.com/pwxcoo/chinese-xinhua) 的汉字读音、释义与书证。

具体 commit、源文件地址和 SHA-256 记录在 `tools/wenyan_catalog.json` 的 `sources` 字段中。自动整理的高频字义适合扩充识别面，不等同于逐条教材考据；发现释义或读音问题应修正生成后目录或补充人工精讲。
