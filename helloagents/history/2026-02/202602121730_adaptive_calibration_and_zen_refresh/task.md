# 任务清单: 自适应校准（按窗口大小）+ Zen 开局刷新

目录: `helloagents/plan/202602121730_adaptive_calibration_and_zen_refresh/`

---

## 1. 自适应校准（缩放/窗口）
- [√] 1.1 为设置加入 `scaleSamples`（采样点列表），作为“窗口变化时重算锁定框”的依据（`extension/shared/settings.js`）
- [√] 1.2 窗口大小变化时：优先用 `scaleSamples` 推断 `boundsAdjust` 并重算 `boundsLockedRect`（`extension/content/content.js`）
- [√] 1.3 用户保存校准时：自动把本次“窗口大小 + boundsAdjust”写入 `scaleSamples`（`extension/content/content.js`）

## 2. Zen 开局/切局面刷新
- [√] 2.1 局面语义变更时先清空旧建议/旧 debug，避免短暂显示上一局建议（`extension/content/content.js`）
- [√] 2.2 弹窗/详情页只展示“与当前局面匹配”的建议与 cold-clear debug（`extension/content/content.js`）

## 3. 验证
- [√] 3.1 语法检查：`node --check extension/content/content.js`
- [√] 3.2 语法检查：`node --check extension/shared/settings.js`

