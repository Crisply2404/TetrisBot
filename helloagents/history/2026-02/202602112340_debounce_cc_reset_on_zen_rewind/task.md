# 轻量迭代：Zen 撤回/重开时防抖重置 cold-clear（不再用 sim 兜底）

目标：Zen 模式里频繁 undo/重开时，不要每次都立刻 reset cold-clear（太重、跟不上），而是“防抖 + 限流”重置；并在撤回期间暂停出建议，等状态稳定后自动恢复 cold-clear。

## 任务清单

- [√] content：检测到 frame 倒退/无状态时，不立刻 reset，改为防抖 + 限流 schedule reset。
- [√] content：撤回期间暂停请求 cold-clear，清空叠加建议（不触发 sim 兜底）。
- [√] 弹窗：当没建议时也显示 cold-clear 状态提示，方便排错/截图反馈。
- [√] 文档：更新知识库与 CHANGELOG。
- [√] 迁移方案包至 history 并更新索引。
