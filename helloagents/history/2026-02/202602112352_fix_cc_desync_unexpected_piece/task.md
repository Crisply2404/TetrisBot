# 轻量迭代：修复 cold-clear “建议不存在的块”（不同步）

现象：叠加层（cold-clear）偶发建议一个根本不可能出现的块（例如建议 I），但详情页/next 显示的是 Z 等正确块序。

推断原因：cold-clear 内部状态和页面当前局面不同步（可能来自增量推进跑飞、worker 崩溃后残留状态、或 tetr.io 的 `game.bag` 在某些模式里把 current 也放进了队列导致 next 错位）。

## 任务清单

- [√] cold-clear client：对返回的建议块做合法性校验（必须属于 current/hold/next1 之一），不合法则强制重启并重算一次。
- [√] UI：弹窗/详情页显示 `cc建议块=...`，方便截图排错。
- [√] pageHook：如果 `game.bag[0]` 等于 current，自动丢掉，避免 next 错位。
- [√] 迁移方案包至 history 并更新索引。
