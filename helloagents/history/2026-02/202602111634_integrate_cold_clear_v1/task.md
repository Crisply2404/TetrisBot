# 轻量迭代：接入 Cold Clear v1（WASM）作为建议引擎

目标：让叠加提示不再用占位评分器，而是用 Cold Clear v1 来算“当前块推荐落点”（更像对战思路）。

任务清单：
- [√] 引擎：把 Cold Clear web 产物打包进扩展（cc.js/cc_bg.wasm/worker.js）
- [√] 引擎运行位置：用 MV3 offscreen 文档创建 Worker，避免 content script 跨域 Worker 报错
- [√] 协议对接：按 TBP 协议发送 rules/start/suggest，拿 suggestion 的 move
- [√] 坐标转换：把 TBP 的落点（底部为 0、y 向上）转成我们棋盘的坐标（顶部为 0、y 向下），用于画格子
- [√] 兜底：Cold Clear 不可用时回退到现有简化引擎
- [√] 文档：更新使用说明与变更记录
- [√] 验证：对新增/改动的 JS 做语法检查（node --check）

