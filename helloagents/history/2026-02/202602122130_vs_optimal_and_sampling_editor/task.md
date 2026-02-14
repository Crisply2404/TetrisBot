# 任务清单: 对战“更像最优解” + 采样点管理与校准预览

目录: `helloagents/plan/202602122130_vs_optimal_and_sampling_editor/`

---

## 1. 引擎：最优策略与对战上下文
- [√] 1.1 增加“挑选策略”设置项（严格第1名 / 偏好旋转 /（实验）按伤害估算重排），并在详情页显示（`extension/shared/settings.js`、`extension/ui/*`、`extension/engine/coldClearTbpClient.js`）
- [√] 1.2 在 `pageHook` 尝试提取 combo / B2B（读不到就留空），并传到 content/state（`extension/page/pageHook.js`、`extension/content/content.js`）
- [√] 1.3 cold-clear start 填入 combo / back_to_back（`extension/engine/coldClearTbpClient.js`）
- [√] 1.4（可选/实验）对战伤害估算：对候选前 N 条做“放下去会清几行/是否旋转/是否进 B2B/连击加成”的估算并重排（`extension/engine/coldClearTbpClient.js`）
- [√] 1.5 Web 调研落地：把伤害规则来源写进代码注释与 wiki（`helloagents/wiki/modules/engine.md`）

## 2. 采样点：管理与回滚
- [√] 2.1 新增“采样点管理页”：列表显示、删除、禁用、导入/导出 JSON（`extension/ui/samples.html`、`extension/ui/samples.js`、`extension/ui/samples.css`）
- [√] 2.2 弹窗增加入口按钮：打开采样点管理页（`extension/ui/popup.html`、`extension/ui/popup.js`）

## 3. 校准体验
- [√] 3.1 校准模式实时预览：拖动绿色框时实时更新叠加提示（`extension/content/overlay.js`、`extension/content/content.js`）
- [√] 3.2 校准工具栏增加按钮“保存为样本”；并把“保存校准”改为不自动写入样本（`extension/content/overlay.js`、`extension/content/content.js`、`extension/ui/scaleLab.js` 文案同步）

## 4. 自动对齐（优先）：参照 tetrio-plus 的思路
- [√] 4.1 在 `pageHook` 增加 PIXI 探针：捕获 `window.PIXI` 出现、拿到 renderer/stage 入口（参考 `ref/tetrio-plus/microplus.js`）（`extension/page/pageHook.js`）
- [√] 4.2 在主世界尝试定位“本地棋盘 DisplayObject”，用 `getBounds()` 算出棋盘矩形并发回 content（`extension/page/pageHook.js`、`extension/content/content.js`）
- [√] 4.3 content 优先使用“自动棋盘矩形”来 `overlay.setBounds`；自动失败时才回退到“校准/采样”（`extension/content/content.js`、`extension/content/overlay.js`）
- [√] 4.4 UI 提示当前对齐来源：自动 / 兜底校准（`extension/ui/popup.*`、`extension/ui/details.*`）

## 5. 叠加层：支持显示上边界之外
- [√] 5.1 叠加绘制不裁掉 `y < 0` 的格子：允许显示棋盘上方缓冲区（`extension/content/overlay.js`）
- [√] 5.2 合法性校验放宽：上方缓冲区默认视为空（避免把“上方显示”当成非法落点）（`extension/engine/coldClearTbpClient.js` 或相关校验文件）
- [√] 5.3 详情页棋盘也支持显示上方缓冲区：别裁掉 `y < 0` 的高亮格子（`extension/ui/details.js`、`extension/ui/details.css` 如需）

## 6. 交互：快捷键一键开/关提示
- [√] 6.1 新增设置项：快捷键（默认 `E`），可关闭（`extension/shared/settings.js`、`extension/ui/*`）
- [√] 6.2 content script 监听按键：非输入框场景按 `E` 切换提示开关（`extension/content/content.js`）

## 7. 一致性：两套“记忆系统”
- [√] 7.1 按 `读取更长块序` 开关把缓存分成两套（各自容量/淘汰互不影响）（`extension/content/content.js`、`extension/engine/coldClearTbpClient.js` 如需配合）
- [√] 7.2 切换开关时强制对齐：悬浮提示与详情页以同一份实时结果为准（`extension/content/content.js`、`extension/ui/details.*`）

## 8. 安全检查
- [√] 8.1 检查：不写入敏感信息；不引入危险权限；不破坏 CSP（`extension/manifest.json`、新增页面）

## 9. 测试
- [√] 9.1 `node --check` 全部修改过的 js 文件（最少：`extension/page/pageHook.js`、`extension/content/content.js`、`extension/content/overlay.js`、`extension/engine/coldClearTbpClient.js`、`extension/ui/samples.js`）
- [?] 9.2 手动验证：按 how.md 的“手动验证清单”逐条跑一遍，并把结果写入 `helloagents/CHANGELOG.md`
