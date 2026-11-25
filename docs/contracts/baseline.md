# 拾词 T01/T02 可执行基线

T01 已冻结公共 API、词书身份和静态入口；T02 已开始实施复习规则纯函数化与存储确认加固。当前是零构建静态站：本地通过 `python3 serve.py` 启动，再由浏览器访问 localhost；线上可由静态 HTTP 服务托管。`index.html` 按现有顺序加载脚本，`js/store.js` 挂载 `window.Store`、`js/ui.js` 挂载 `window.UI`、`js/app.js` 使用哈希路由。CSS 与应用资源为 v42，词书分段资源独立为 v27，Service Worker 缓存键为 `shici-v42`。

## 本轮静态契约

运行 `python3 tools/check_project.py`，除原有文言内容、审阅文件、部署保护、入口资源、链接及存储能力存在性检查外，还检查：

- `window.Store` 对象字面量的**精确成员名与类别**：65 个可调用成员、`words`/`units` 两个 getter、六个常量，共 73 项；重复、缺失或新增成员失败。清单逐项固化在检查器的 `STORE_METHODS`、`STORE_GETTERS`、`STORE_CONSTANTS` 中，不以单纯总数代替。
- `window.UI` 挂载与十个关键入口：`renderHome`、`renderStudyCenter`、`renderLibrary`、`renderBooks`、`renderReport`、`renderSession`、`wordDrawer`、`settingsDrawer`、`modal`、`searchSuggestions`；存储键须保持 `shici.state.v1`，内部 schema 当前为 3。
- 六本词书及 `data/books/index.json` 的键集合、每本 ID 和精确数量（gaokao 3663、curated 120、wenyan 1200、ielts 3426、cet4 1162、cet6 1228；合计 10799），逐条 ID 顺序和本书内部 ID 唯一性。`curated` 的 120 个 ID 必须依次等于 `wenyan` 的核心 120 个 ID；当前 Store 学习记录由词条 ID 索引，因此两书共享这些词的进度。

## T02 已实施部分

- `js/domain/srs-engine.js`：冻结 `again/fuzzy/known` 的首次间隔、阶段变化、到期判断和“3 个日期 + 2 类题型 + 最近间隔 7 天”的已掌握条件。
- `js/storage/state-integrity.js`：对现有 V3 plain object 增加稳定序列化、非加密完整性校验、revision 与 writerId；不改变 `shici.state.v1` 键或导出主体结构。
- `save()`：只有 localStorage 或 IndexedDB 至少一层确认成功才视为已保存；localStorage 失败时等待 IndexedDB 事务完成，不再立即假报成功。
- 加载与恢复：校验 checksum；不匹配的原文隔离到 `shici.state.v1.integrity.*`，优先从有效 IndexedDB 快照恢复；未知顶层字段继续保留。
- 导入：先校验完整性、保留 pre-import 原始副本，再规范化并写入。
- 本机远端快照：恢复前校验 checksum；不一致时拒绝覆盖本地。

辅助验收：`python3 tools/export_content_review.py --check` 只验证审核清单一致性（当前仍有 508 条待复核）；`find js -name '*.js' -print0 | xargs -0 -n1 node --check` 和 `node --check sw.js` 检查语法；`node --test tools/tests/*.test.cjs` 检查 SRS 与完整性金样本；`bash tools/test_learning_system.sh` 在隔离端口和临时状态目录验证配额失败回退、IndexedDB 恢复、checksum 损坏隔离、离线与五路由。

## 后续改造边界与协同

重构应保留 Store 全部 73 个顶层成员的名称、成员类别、调用参数与返回语义，UI 关键入口、哈希路由、`data-action` 协议、`shici.state.v1` 键及现有导出/导入格式；仅静态名称检查不足以证明行为兼容，后续须用合成夹具和独立测试覆盖。不要复制或读取真实用户进度到仓库；不要在真实学习 origin 上运行清状态测试。

WorkBuddy 产品经理定场景与验收，架构师定边界和迁移契约，工程师负责小范围实现与集成；Codex CLI 可执行限定文件补丁和静态审查，但不拥有公共契约决策或发布签字；独立 QA 负责浏览器、迁移和恢复门禁。会重写词书的构建脚本仍不在本轮运行；`Store.resetAll()` 只允许在隔离测试 origin 中运行。规划中的 `tools/check_static.mjs`、`--strict`、`--output`、内容构建脚本 `--check` 尚未实现。
