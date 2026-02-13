# 轻量迭代：修复 cold-clear WASM 被 CSP 拦截 + 导出当前校准参数

目标：
- 解决 `WebAssembly.instantiateStreaming() ... violates CSP ...` 导致 cold-clear 启动失败的问题。
- 让用户一键复制“当前校准参数”，方便写进默认值或做备份。

任务清单：
- [√] Manifest：为扩展页面启用 `wasm-unsafe-eval`（让 offscreen/worker 可以编译 WASM）
- [√] 弹窗：新增「复制校准参数」按钮，复制 boundsAdjust/boundsLockedRect 等到剪贴板
- [√] 文档：补充 CSP/企业策略导致 WASM 不可用时的解释
- [√] 验证：对改动 JS 做语法检查（node --check）

