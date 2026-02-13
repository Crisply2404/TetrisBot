# 任务清单: fix_overlay_not_visible

目录: `helloagents/plan/202602102303_fix_overlay_not_visible/`

---

## 1. 叠加层不显示（定位/绘制链路）
- [√] 1.1 在 `extension/page/pageHook.js` 增强棋盘定位：不要只“挑最大 canvas”，改为多 canvas/多对象尝试并自动选出最合理的棋盘边界（bounds）。
- [√] 1.2 在 `extension/content/overlay.js` 增强叠加层层级，避免被页面元素盖住。

## 2. 可观测性（让你一眼看出问题在哪）
- [√] 2.1 在 `extension/content/content.js` 的 `TBP_GET_STATUS` 返回更多信息：是否拿到状态/是否拿到定位/是否拿到建议。
- [√] 2.2 在 `extension/ui/popup.js`/`extension/ui/popup.css` 把这些信息展示出来（多行状态）。

## 3. 文档更新
- [√] 3.1 更新 `helloagents/wiki/modules/state.md`：补充“定位（bounds）如何计算、失败会导致叠加层不显示”的说明。
- [√] 3.2 更新 `helloagents/CHANGELOG.md`：记录本次修复。
- [√] 3.3 迁移方案包后更新 `helloagents/history/index.md`：补充本次修复索引。

## 4. 验证
- [√] 4.1 基础语法检查：确保扩展脚本无语法错误。
- [?] 4.2 手动验证：进入对局后，弹窗状态显示“定位✅ 建议✅”，场地能看到绿色半透明提示（需要在浏览器里验证）。
