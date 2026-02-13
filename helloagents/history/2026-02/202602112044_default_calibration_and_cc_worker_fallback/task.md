# 轻量迭代：把当前校准写成默认值 + cold-clear 内部 worker 路径兜底

目标：
- 把你当前“校准棋盘位置”的参数写进默认设置（你卸载/重装扩展后也能直接用）。
- 解决 cold-clear 运行时偶发崩溃/超时回退 `sim`：为 cold-clear 内部硬编码的 `worker.js` 增加扩展根目录兜底，减少路径解析差异导致的启动失败。

任务清单：
- [√] 默认设置：把 boundsAdjust/boundsLock/boundsLockedRect 写入 `DEFAULT_SETTINGS`
- [√] 引擎兜底：新增 `extension/worker.js`（root），确保 cold-clear 内部找得到 worker
- [√] 文档/变更记录：更新 CHANGELOG
- [√] 验证：对新增/改动的 JS 做语法检查（node --check）

