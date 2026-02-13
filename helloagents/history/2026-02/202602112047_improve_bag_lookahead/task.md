# 轻量迭代：改进 7-bag 预判的前视长度（Next5 之外）

目标：当用户开启“读取完整块序”时，把更多的 next 队列喂给 cold-clear（从 6 提升到 12），让它在 7-bag 下能做更好的远期推断（同时控制启动开销）。

任务清单：
- [√] 引擎：cold-clear start 的 queue 长度在 readFullBag=true 时提升到 12
- [√] 变更记录：更新 CHANGELOG
- [√] 验证：对改动 JS 做语法检查（node --check）

