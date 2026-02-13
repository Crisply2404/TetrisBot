# 任务清单: fix_suggestion_and_details_live

目录: `helloagents/plan/202602102323_fix_suggestion_and_details_live/`

---

## 1. 叠加提示不出现（建议算不出来/坐标映射不对）
- [√] 1.1 在 `extension/page/pageHook.js` 修正棋盘数据解析：把 `0` 当作“空格”，避免整盘被误判为满格导致“建议❌”。
- [√] 1.2 在 `extension/page/pageHook.js` 修正 `bufferRows`/`visibleRows` 的计算：用棋盘数组真实高度推断，避免把可见行画到负数导致“画了但看不见”。

## 2. 详情页改为实时（不做快照/不做上一条下一条）
- [√] 2.1 在 `extension/content/content.js` 增加 `TBP_GET_DETAILS_DATA`：返回实时 state +（当前块+Next5）的详细建议（带简单缓存，别每次都重算）。
- [√] 2.2 更新 `extension/ui/details.html`/`details.js`：实时刷新显示，并移除“上一条/下一条快照”。
- [√] 2.3 更新 `extension/ui/popup.html`/`popup.js` 文案：把“打开详情（快照）”改成“打开详情（实时）”。

## 3. 文档更新
- [√] 3.1 更新 `extension/README.md`：同步“详情页实时”的新行为。
- [√] 3.2 更新 `helloagents/wiki/arch.md`、`helloagents/wiki/modules/ui.md`、`helloagents/wiki/data.md`：去掉“快照为默认”的描述（快照功能先搁置）。
- [√] 3.3 更新 `helloagents/CHANGELOG.md`：记录本次修复与行为变更。

## 4. 验证
- [√] 4.1 基础语法检查：确保扩展脚本无语法错误。
- [?] 4.2 手动验证：进入对局后弹窗显示“建议✅”，棋盘能看到绿色半透明提示；详情页会实时更新（需要在浏览器里验证）。
