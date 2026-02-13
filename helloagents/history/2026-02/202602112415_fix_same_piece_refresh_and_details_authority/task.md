# 任务清单: 修复同块连发不刷新 + 明确“详情页为准”

目录: `helloagents/plan/202602112415_fix_same_piece_refresh_and_details_authority/`

---

## 1. 同块连发不刷新
- [√] 1.1 实时计算的 key 增加 `frame`，确保每次下块都会触发重算/更新（避免 T、T、T 时看起来“没更新”）

## 2. 详情页权威性
- [√] 2.1 详情页增加“实时/预览后续”状态提示 + “回到实时”按钮，避免误以为“详情页跟着悬浮走”
- [√] 2.2 调整详情页文案：明确“实时落点以此页为准；叠加层只是画同一个结果”

## 3. 文档同步
- [√] 3.1 更新 `helloagents/wiki/modules/ui.md`
- [√] 3.2 更新 `helloagents/CHANGELOG.md`

## 4. 验证
- [√] 4.1 运行 `node --check` 确认关键脚本无语法错误
