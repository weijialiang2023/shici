# T02 存储安全实施说明

## 已实现

### 状态形状

- 继续使用 `shici.state.v1` 键。
- 继续使用现有 V3 plain object，不创建 `{schemaVersion,data:{records}}` 新信封。
- 新增可选 `meta.revision`、`meta.writerId`、`meta.integrity`。
- 顶层、profile、record、meta 的未知字段在加载和导入时保留。

### 保存确认

- `localStorage` 成功：本次保存立即确认，并异步写 IndexedDB 副本。
- `localStorage` 抛错：不立即显示成功，等待 IndexedDB 事务完成后再确认。
- 两层都失败：`lastSaveOk=false`，设置页明确提示导出和检查存储。
- `getPersistence()` 暴露 local、IndexedDB、revision、integrity、最近保存层和错误。

### 完整性

- 保存前对完整状态做稳定键排序和 FNV-1a checksum。
- checksum 不承担安全签名职责。
- 旧状态没有 checksum 时按 `unsigned` 兼容读取。
- checksum 不匹配时保留原文到 `shici.state.v1.integrity.*`，不静默覆盖。
- 有效 IndexedDB 快照优先于损坏 local 状态恢复；恢复后保留损坏备份键和错误标记。

### 导入与远端

- 导入先检查结构和 checksum，再保留 `shici.state.v1.pre-import.*`。
- 导入状态规范化后重新计算 checksum。
- `/api/state` 远端恢复前检查 checksum；不匹配时不覆盖本地。

### 复习规则

- `again/fuzzy/known` 首次间隔、阶段变化和到期判断抽出纯函数。
- 已掌握仍需至少 3 个成功日期、2 种题型和最近一次 7 天成功间隔。
- 现有 `REVIEW_DAYS` 和自评语义不变。

## 验收证据

```sh
node --test tools/tests/*.test.cjs
python3 tools/check_project.py
python3 tools/content_audit.py
python3 tools/export_content_review.py --check
bash tools/test_learning_system.sh
```

浏览器隔离测试已经验证：

- localStorage 配额失败后，IndexedDB 事务成功且 `lastSaveOk=true`；
- checksum 被篡改后，原文进入隔离键，学习记录从有效 IDB 快照恢复；
- 五路由、7 词循环、离线、自评/客观计分和响应式继续通过。

## 尚未关闭

- 多标签页同时答题的分叉检测和 Web Locks 协调；
- 远端 409/CAS 协议；
- 两层本地存储全部失败时的统一“暂停写入型动作”控制器；
- IndexedDB 不可用时，本地数据增长后的配额预警；
- 会话中断后未答题卡片的恢复；
- 旧 v1/v2 真实历史备份的全量迁移金样本。
