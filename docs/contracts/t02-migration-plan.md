# T02 下一实施包：旧状态迁移与 Schema 归一化

## 边界

允许修改：

- `js/domain/state-schema.js`（新增）
- `js/store.js`
- `index.html`
- `sw.js`
- `tools/tests/state-schema.test.cjs`（新增）
- `tools/fixtures/state-v1.min.json`、`state-v2.min.json`（新增）
- `tools/check_project.py`
- 本文件与 `docs/contracts/storage-safety.md`

不修改：

- `REVIEW_DAYS`、`again/fuzzy/known` 语义；
- 词书内容、词条 ID 或顺序；
- 五页面布局；
- 本机 `/api/state` 协议；
- `window.Store` 的 73 个顶层成员。

## 必须保持

- 存储键继续为 `shici.state.v1`；
- 内部 schema 继续为 3；
- 现有 plain object 不对状态包一层 `{schemaVersion,data}`；
- 未知顶层、profile、record、meta 字段保留；
- `dailyGoal` 限制在 1–300；
- `targetRetention` 限制在 0.75–0.95；
- `due` 和 activity key 仍为本地日期字符串；
- `curated` 与 `wenyan` 的共享词条 ID 不变。

## 实施步骤

1. 从 `js/store.js` 提取默认状态、空白记录、记录归一化、活动日归一化和整体状态归一化。
2. 新增 `state-schema.js`，以显式参数注入 defaultBook、合法词书 ID、目标范围和 retention 范围。
3. Store 的 load、IndexedDB restore、import 统一调用该模块。
4. 旧 v1/v2 合成 fixture 缺少 v3 字段，迁移后补齐默认值。
5. 同一状态重复迁移两次，输出深度等价；未知字段仍存在。
6. 新增 Node 金样本测试并纳入 CI。

## 验收

```sh
node --test tools/tests/*.test.cjs
python3 tools/check_project.py
find js -name '*.js' -print0 | xargs -0 -n1 node --check
bash tools/test_learning_system.sh
```

- 6 本词书仍为 10,799 条；
- Store 仍为 65 方法 + 2 getter + 6 常量；
- 现有浏览器主流程、离线、配额失败、IndexedDB 恢复和 checksum 隔离继续通过；
- 不读取或写入真实用户学习进度。

## 实施结果（2026-11-23）

- 已新增 `js/domain/state-schema.js` 并接入 Store 的 load、IndexedDB 恢复和导入。
- 已新增 V1/V2 合成 fixture 与 3 个 Node 迁移测试。
- 已在隔离浏览器 origin 验证 V1 → V3、未知字段保留、checksum 重算。
- 已新增多标签页冲突快照和后续写入暂停。
- 已新增 localStorage + IndexedDB 双层失败提示与作答暂停。
- 当前仍有 508 条内容待人工复核，不属于本迁移包。
