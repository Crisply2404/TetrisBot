# 任务清单: fix_overlay_alignment

目录: `helloagents/plan/202602110208_fix_overlay_alignment/`

---

## 1. 叠加层对齐修复（格子大小/位置不对）
- [√] 1.1 在 `extension/page/pageHook.js` 改进 bounds 选择：更偏向 `board.getBounds()`，并在高 DPI 情况下强力偏向“缩放换算后的坐标”，避免提示整体放大一倍。
- [√] 1.2 在 `extension/content/overlay.js` 支持两种 bounds：如果 bounds 看起来覆盖了 40 行（buffer+可见），自动切换到按总行数绘制，避免纵向偏移/比例错误。
- [√] 1.3 在 `extension/content/overlay.js` 的 debug 模式下画一层很淡的网格线，方便肉眼确认是否对齐。

## 2. 文档更新
- [√] 2.1 更新 `helloagents/CHANGELOG.md`：记录本次对齐修复。

## 3. 验证
- [√] 3.1 基础语法检查：确保扩展脚本无语法错误。
- [?] 3.2 手动验证：提示格子大小与棋盘网格一致（需要在浏览器里验证）。
