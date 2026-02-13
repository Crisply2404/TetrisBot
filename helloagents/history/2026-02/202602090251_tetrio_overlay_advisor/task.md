# 任务清单: tetrio_overlay_advisor

目录: `helloagents/plan/202602090251_tetrio_overlay_advisor/`

> 说明：前端/UI 由我直接实现；UI 风格与结构参考 `ref/tetrismind/`（仅参考外观与组件组织方式）。

---

## 1. 项目骨架（扩展最小可运行）
- [√] 1.1 创建扩展目录结构与 `manifest.json`（MV3），包含：content script、注入脚本入口（验证 why.md“实时叠加层-40L 游戏中持续提示”）
- [√] 1.2 定义内部消息协议（type/payload）与调试开关（验证 why.md“读不到状态/自动提示”）

## 2. state：从 TETR.IO 页面取实时状态（A 路线）
- [√] 2.1 实现页面内 Hook：能拿到 `board/current/hold/next5`（最小：40L 能拿到一次）（验证 why.md“实时叠加层-40L 游戏中持续提示”）
- [√] 2.2 实现状态变化监听与节流：只在关键变化时推送（避免卡）（验证 why.md“实时叠加层-40L 游戏中持续提示”）
- [√] 2.3 失败兜底：读不到就关闭叠加层并提示原因（验证 why.md“读不到状态/自动提示”）

## 3. engine：先跑通，再接 cold-clear（离线）
- [√] 3.1 做一个占位引擎：输入 state，输出一个可画出来的 suggestion（验证 why.md“实时叠加层-40L 游戏中持续提示”）
- [ ] 3.2 接入 cold-clear（WASM）：把引擎放到 Worker 里跑，保证离线可用（验证 why.md“离线 AI 引擎接口”）
- [ ] 3.3 增强：实现 Next5 + 7-bag 采样推断（可配置采样次数/深度）（验证 why.md“Next5 + 7-bag 推断”）
- [?] 3.4 两套预设：40L / 对战（先做 T-spin 风格），并允许切换 hold 开关（验证 why.md“两套目标预设”）

## 4. ui：叠加层 + 弹窗/详情页（本项目实现）
实现 UI 时会参考两类“前端指导”：
- React 写法/性能：`vercel-react-best-practices`
- 交互与易用性：`ui-ux-pro-max`
- Chrome 扩展 UI 细节：`chrome-extension-ui`
- [√] 4.1 搭 UI 工程骨架（popup / 详情页 / 设置），并复用 `ref/tetrismind/` 的 UI 风格（验证 why.md“详情页快照”）
- [√] 4.2 实时叠加层：把 suggestion 画到棋盘上（半透明轮廓/阴影），支持开关与透明度（验证 why.md“实时叠加层”）
- [√] 4.3 弹窗/详情页：打开时抓快照并冻结展示（当前块 + Next5 的完整摆法），不跟随实时更新（验证 why.md“详情页（快照，不实时）”）
- [√] 4.4 快照回看 UI：上一条/下一条快照切换，并展示当时的完整摆法（验证 why.md“回看上一条快照”）
- [?] 4.5 设置 UI：40L/对战预设、T-spin/all-spin（先做 T-spin）、Hold 开关、快照数量上限（验证 why.md“快照历史回看”）

## 5. 快照（详情页冻结 + 回看）
- [√] 5.1 打开详情页时触发 SNAPSHOT_CAPTURE：保存 state + suggestion + settings（验证 why.md“打开详情页生成快照”）
- [√] 5.2 实现快照列表与回看：上一条/下一条/按 id 获取（验证 why.md“回看上一条快照”）
- [√] 5.3 加容量上限与清理策略（例如只留最近 N 条）（验证 why.md“快照历史回看”）

## 6. 安全检查
- [?] 6.1 检查：不保存令牌、不做自动操作、默认谨慎禁用竞技匹配/排位（按 how.md“安全与性能”）

## 7. 文档更新
- [√] 7.1 同步更新知识库：`helloagents/wiki/*`（模块说明、消息协议、数据模型）
- [√] 7.2 更新 `helloagents/CHANGELOG.md`（记录实现进度）

## 8. 测试（手动验收为主）
- [?] 8.1 按 how.md 验收清单逐项验证：40L/对战/离线/快照/回看
