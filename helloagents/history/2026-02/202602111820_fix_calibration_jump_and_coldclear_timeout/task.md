# 轻量迭代：修复校准后“忽大忽小” + cold-clear 超时（每次都重启引擎）

目标：
- 用户校准好棋盘后，放一块也不再“自己变大/漂移”。
- cold-clear 不再每次算建议都重新 `stop/start`（那样会非常慢，导致超时），改为能用 `play/new_piece` 增量推进（只有检测到玩家没按建议走时才重启）。

任务清单：
- [√] 校准锁定升级：保存校准时同时保存“绝对像素框”（boundsLockedRect），后续绘制优先用它，避免 base bounds 抖动导致变大
- [√] 引擎增量同步：content script 判断“上一手是否按建议落点走了”，是则发 sync=advance（play/new_piece），否则 sync=start
- [√] cold-clear 客户端改造：支持 sync(start/advance)，并把 start 的超时放宽（首次/重启慢是正常的），增量推进行为用更短超时
- [√] worker 报错更直观：WASM 初始化失败时主动 postMessage error，避免前端只能看到“超时”
- [√] 验证：对改动 JS 做语法检查（node --check）

