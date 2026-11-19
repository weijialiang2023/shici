# 拾词内容校验报告

由 `python3 tools/content_audit.py` 生成。硬性问题会阻止项目校验；“审核信号”用于人工抽检，不会自动删除正常词义。

| 词书 | 词数 | 缺音标 | 缺例句 | 缺翻译 | 缺核心义项 | 重复义项 | 目标词不在例句 | 括号异常 | 音标混入释义 | 回退例句 | 拓展义项 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gaokao | 3663 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 209 | 1901 |
| ielts | 3426 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 236 | 208 |
| cet4 | 1162 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 63 | 3 |
| cet6 | 1228 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 74 | 0 |

## 规则说明

- 缺例句/翻译/音标：必须清零。缺例句的条目由构建脚本生成可识别的课堂场景句子，并写入 `contentFlags`。
- 目标词不在例句：必须清零。构建时优先使用上游句子，必要时回退到目标词明确出现的课堂句。
- 括号异常、音标混入释义、已知拼写错误：必须清零。
- 重复义项：作为人工审核清单保留。
- 人名、元素、货币与专业名：作为审核信号保留，因为部分词本身是考试词汇，不能机械删除。

## 人工审核清单

### gaokao

- `abnormal`：元素/专业名
- `anecdote`：人名/专业名
- `aunt`：人名/专业名
- `average`：货币/单位
- `cent`：货币/单位
- `chairwoman`：人名/专业名
- `chat`：人名/专业名
- `day`：人名/专业名
- `dollar`：货币/单位
- `embassy`：人名/专业名
- `england`：人名/专业名
- `eventually`：人名/专业名
- `flashlight`：人名/专业名
- `fluent`：人名/专业名
- `grandchild`：人名/专业名
- `hello`：人名/专业名
- `high`：人名/专业名
- `italian`：人名/专业名
- `japan`：人名/专业名
- `kilo`：货币/单位
- `market`：人名/专业名
- `movie`：人名/专业名
- `neck`：人名/专业名
- `no`：人名/专业名
- `paris`：人名/专业名
- `pound`：货币/单位
- `rock`：元素/专业名
- `routine`：人名/专业名
- `rule`：人名/专业名
- `scottish`：人名/专业名
- `size`：人名/专业名
- `soccer`：人名/专业名
- `swiss`：人名/专业名
- `tibet`：人名/专业名
- `traditional`：人名/专业名
- `via`：人名/专业名
- `voyage`：人名/专业名
- `woo`：人名/专业名

### ielts

- `abnormal`：元素/专业名
- `amid`：货币/单位
- `anecdote`：人名/专业名
- `concoct`：人名/专业名
- `configuration`：人名/专业名
- `conquer`：人名/专业名
- `conquest`：人名/专业名
- `counterpart`：人名/专业名
- `day`：人名/专业名
- `embassy`：人名/专业名
- `eventually`：人名/专业名
- `export`：人名/专业名
- `fluent`：人名/专业名
- `generic`：人名/专业名
- `integrate`：人名/专业名
- `landscape`：人名/专业名
- `masterpiece`：人名/专业名
- `namely`：人名/专业名
- `peer`：人名/专业名
- `persecute`：人名/专业名
- `persist`：人名/专业名
- `proceeding`：人名/专业名
- `routine`：人名/专业名
- `scratch`：人名/专业名
- `sterling`：货币/单位
- `tunnel`：人名/专业名
- `upbringing`：人名/专业名

### cet4

- `chat`：人名/专业名
- `complement`：人名/专业名
- `equivalent`：货币/单位
- `namely`：人名/专业名
- `peer`：人名/专业名
- `upbringing`：人名/专业名
- `via`：人名/专业名

### cet6

- `conquer`：人名/专业名
- `counterpart`：人名/专业名
- `peer`：人名/专业名
- `prompt`：人名/专业名

## 已知限制

自动规则不能代替教材逐条校订。高频功能词、多义词、专业缩写和词族深浅仍需人工抽检；当前默认卡片只展示最多两个核心义项，其余义项折叠到“拓展义项”。
