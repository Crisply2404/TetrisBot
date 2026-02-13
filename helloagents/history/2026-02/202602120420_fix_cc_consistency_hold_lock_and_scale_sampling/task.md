# 任务清单: 修复 cc 一致性 + Hold 锁定 + 缩放采样工具

目录: `helloagents/plan/202602120420_fix_cc_consistency_hold_lock_and_scale_sampling/`

---

## 1. cc 一致性（undo/重复算）
- [√] 1.1 增加“同局面复用缓存”：同一个局面（含 next 队列 + 设置）算过一次就复用，避免撤回后建议变化
- [√] 1.2 修复 in-flight 判断：不再用 frame 做一致性判定，避免回包被错误丢弃/重复并发

## 2. Hold 规则（每块最多 hold 一次）
- [√] 2.1 从状态变化推断 `canHold`（棋盘没变但 current 变了 → 认为按了 hold → 本手不可再 hold）
- [√] 2.2 引擎侧尊重 `canHold`，避免给出“连续 hold 两次”的不合法建议

## 3. 缩放采样工具（缩小系数）
- [√] 3.1 弹窗新增入口「测缩放系数（采样）」
- [√] 3.2 新增采样页：支持一键开始校准、记录样本、复制 JSON、清空

## 4. 文档同步
- [√] 4.1 更新 `helloagents/wiki/modules/*` 与 `extension/README.md`
- [√] 4.2 更新 `helloagents/CHANGELOG.md`

## 5. 验证
- [√] 5.1 运行 `node --check` 验证关键脚本无语法错误
