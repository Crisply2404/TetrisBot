# 轻量迭代：修复 cold-clear 运行一段时间后回退到 sim

目标：减少 `cold-clear：等待 cold-clear 返回超时 / worker：RuntimeError: unreachable` 导致的回退，并把排错信息讲清楚。

## 任务清单

- [√] 调整 short 队列的 `bag_state` 计算：保证与队列末尾一致，避免冷清算崩溃（unreachable）。
- [√] 修复 cold-clear client 的 `_waitFor`：超时后清理 waiter，避免“串消息→假超时”。
- [√] 在退出对局/回到菜单/时间倒退（Zen 撤回/重开）时，主动重置 cold-clear（避免带着旧状态继续算）。
- [√] 详情页与弹窗：显示更详细的 cold-clear 上下文（同步方式/阶段/超时阈值/喂给 cc 的队列）。
- [√] 跑现有单元测试（`node --test extension/engine/sevenBagQueue.test.js`）。
- [√] 同步更新知识库与 `helloagents/CHANGELOG.md`。
- [√] 迁移本方案包到 `helloagents/history/` 并更新索引。
