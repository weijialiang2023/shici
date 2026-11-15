# 拾词

一个打开就能用的中英文词汇学习站。默认提供高中英语 3500、雅思、四六级和精讲词书，并新增 **高中文言实词 200**：先学 120 个高考常见核心实词，再补 80 个教材高频拓展。

> 每天拾一点，表达多一点。

## 当前词书

| 词书 | 词条数 | 定位 |
| --- | ---: | --- |
| 高中 3500 | 3,663 | 高考阶段常见英语词汇 |
| 精讲 120 | 120 | 带例句、搭配和记忆点的精讲词 |
| 高中文言实词 200 | 200 | 120 个核心重点 + 80 个高频拓展 |
| 雅思必背 | 3,427 | 雅思阅读、写作核心词汇 |
| 四级核心 | 1,162 | CET-4 高频核心词 |
| 六级核心 | 1,228 | CET-6 进阶核心词 |

合计 **9,800 个词条**。单词与文言实词共用同一个学习面板，但按各自的词条 ID 保存进度；切换词书不会清空记录。

## 文言实词 200

- **核心 120** 按标准高中常见实词范围整理，学习计划会优先抽取尚未学过的核心词。
- **拓展 80** 覆盖教材常见实词、通假、古今异义和一词多义。
- 每个词条均包含常见义项、文言例句、现代汉语译文、出处和辨析提示。
- 分为「核心 01–06」与「拓展 01–02」八个单元；核心结束后才进入拓展。
- 支持同义项选择题、错词重学、收藏、搜索、筛选和间隔复习。

文言释义依据高中语文常见实词范围整理。教材版本、注释习惯和具体语境可能不同，考试作答请以本校教材和老师讲解为准。

## 英语美音与男女声

英语发音统一使用 `en-US`，不再混用英音：

- 设置中可选择 **女声 / 男声**；
- 优先匹配系统内置美音声线（如 Samantha、Ava、Alex 等）；
- 系统缺少对应性别的美音时，仍固定 `en-US`，并通过音高参数保持男女声差异；
- 可调整 `0.70–1.15` 倍语速并试听；
- 发音偏好会随学习记录一起保存。

浏览器实际可用声线由操作系统决定。Safari、Chrome 和 macOS 一般自带美音声线；如果某个浏览器没有返回声线列表，仍会使用该浏览器默认的 `en-US` 朗读。

## 自动保存与长期记录

每次作答、收藏、设置或词书切换都会立即写入浏览器 `localStorage`；在本机长期服务模式下，还会自动写入独立目录：

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

设置页支持「导出当前记录」「导入备份」「从本机恢复」。GitHub Pages 是纯静态站点，没有服务器端数据库，因此公开部署时仍以浏览器保存为主，跨设备迁移请使用导出/导入文件。

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

## 开发与验证

本机预览：

```bash
python3 serve.py
```

重建 200 个文言实词及索引：

```bash
python3 tools/build_wenyan.py
python3 tools/build_books.py
```

`tools/build_wenyan.py` 会校验：

- 总数为 200；
- 核心 120、拓展 80；
- 没有重复词条；
- 每一条都有义项、例句和现代译文。

## 目录

```text
shici/
├── index.html
├── css/styles.css
├── js/
│   ├── data.js          # 词书元数据、等级与成就
│   ├── store.js         # 学习记录、间隔复习、自动保存
│   ├── ui.js            # 页面、卡片、设置与学习报告
│   └── app.js           # 路由、交互、美音与男女声
├── data/books/          # 词书及跨词书进度索引
├── tools/
│   ├── build_books.py   # 重建全部词书
│   ├── build_wenyan.py  # 文言实词 200 的源数据与校验
│   ├── deploy_local.sh  # 部署静态文件，保留 progress/
│   └── install_local.sh # 安装长期 LaunchAgent
├── serve.py             # 本机服务、存档与历史快照 API
└── .github/workflows/pages.yml
```

## 内容来源与授权

英语例句、音标和中文释义整理自公开学习词库 [KyleBing/dict](https://github.com/KyleBing/dict)（上游为 [kajweb/dict](https://github.com/kajweb/dict)），构建时做了去重、筛选和展示整理。该上游当前的授权范围需要在公开发布或商用前自行核对；项目代码的 MIT 许可不自动覆盖第三方词典数据。

文言实词内容按高中常见考点重建，例句采用常见教材名篇或经典典籍文本。学习内容仍可能存在版本差异；发现错误应直接修正 `tools/build_wenyan.py` 并重新生成数据。
