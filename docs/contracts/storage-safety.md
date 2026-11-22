# T02 存储安全实施说明

## 已实现

### 状态形状

- 继续使用 `shici.state.v1` 键。
- 继续使用现有 V3 plain object，不创建 `{schemaVersion,data:{records}}` 新信封。
- 新增可选 `meta.revision`、`meta.writerId`、`meta.integrity`。
- 顶层、profile、record、meta 的未知字段在加载和导入时保留。

### 旧状态迁移

- `js/domain/state-schema.js` 从 Store 提取默认状态和归一化逻辑。
- v1/v2 状态在加载与导入时统一归一化为 V3。
- 非法每日目标回退 20，失效词书回退默认词书，非法发音和 retention 参数被限制到合法范围。
- 旧记录缺少 `books` 但已有 `seen` 时，补充当前词书身份。
- 迁移记录写入 `meta.migration`，保留来源版本和 warnings。
- 同一 V3 状态再次归一化不改变内容，迁移为幂等。

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

### 多标签页冲突

- 监听其他标签页对 `shici.state.v1` 的写入。
- 忽略 checksum 无效和同一 writerId 的事件。
- 检测到不同 writer 的有效更新时，暂停本页后续写入，避免继续覆盖。
- 将本页与收到的状态一起保存在 IndexedDB 的 `conflict-*` 键。
- 页面提示用户导出当前记录，再关闭其他标签页并刷新。

### 双层失败

- localStorage 和 IndexedDB 都失败时，`lastSaveOk=false`。
- 页面显示“学习记录暂时无法保存”，并提供导出。
- 卡片自评、客观题和拼写提交在持久化状态未恢复前停止接受新答案，避免产生更多只存在内存里的学习结果。

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
- 两个独立标签页写入时，后收到更新的页面检测冲突、生成 IDB 冲突快照并暂停保存；
- localStorage 与 IndexedDB 同时失败时不假报成功，页面显示保存失败提示；恢复存储后可继续；
- V1 状态在独立页面中迁移到 V3，非法设置被修正，未知顶层/记录字段保留；
- 五路由、7 词循环、离线、自评/客观计分和响应式继续通过。

## 尚未关闭

- 多标签页冲突的自动合并/用户选择恢复；
- 远端 409/CAS 协议；
- IndexedDB 不可用时，本地数据增长后的配额预警；
- 会话中断后未答题卡片的恢复；
- 旧 v1/v2 真实历史备份的全量迁移金样本。
