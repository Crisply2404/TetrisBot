# 任务清单: debug_why_no_suggestion

目录: `helloagents/plan/202602102350_debug_why_no_suggestion/`

---

## 1. 根因定位（把“为什么建议❌”说清楚）
- [√] 1.1 在 `extension/engine/engineWorker.js` 为实时计算增加 debug 返回：明确是 `current` 缺失、`board` 维度不对、还是“没有任何可落点”。
- [√] 1.2 在 `extension/content/content.js` 的 `TBP_GET_STATUS` 返回关键字段：当前块、棋盘尺寸、buffer/visible、以及引擎 debug。
- [√] 1.3 在 `extension/ui/popup.js` 把 debug 信息展示出来（不需要你开控制台也能看到原因）。

## 2. 兼容性增强（降低“读到的数据形态变了就全挂”的概率）
- [√] 2.1 在 `extension/page/pageHook.js` 改进棋盘解析：自动识别“空格值”是哪一个（0/-1/255 等），避免误判。
- [√] 2.2 在 `extension/page/pageHook.js` 改进块类型解析：支持数字块 id（如果 tetr.io 用 0-6 表示 I/O/T/S/Z/J/L）。

## 3. 详情页可观测性
- [√] 3.1 在 `extension/ui/details.js` 加入错误捕获与提示：如果详情页收不到实时数据，直接把原因显示在页面上。

## 4. 文档更新
- [√] 4.1 更新 `helloagents/wiki/modules/state.md`：补充“空格值自动识别/块类型兼容”的说明。
- [√] 4.2 更新 `helloagents/CHANGELOG.md`：记录本次调试增强。
- [ ] 4.3 迁移方案包后更新 `helloagents/history/index.md`：补充本次修复索引。

## 5. 验证
- [√] 5.1 基础语法检查：确保扩展脚本无语法错误。
- [?] 5.2 手动验证：弹窗里能看到“建议❌的明确原因”，并按原因进一步修复（需要在浏览器里验证）。
