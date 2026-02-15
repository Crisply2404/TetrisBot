# 任务清单: CC1 仿 CC2 策略 + 一键重置 + 不同步兜底

目录: `helloagents/plan/202602151845_cc1_strategy_reset_and_stability/`

---

## 1. CC1 仿 CC2 权重策略（可选）
- [√] 1.1 在 `extension/engine/coldClearTbpClient.js` 增加策略 `cc2Weights`：对 CC1 候选前 N 个按 CC2 `default.json` 权重重排，验证 why.md#需求-CC1-更像-CC2减少依赖本地服务-场景-只用-CC1-也能更聪明
- [√] 1.2 在设置页/弹窗说明里补充“仅 CC1 生效”的提示（`extension/ui/options.html`、`extension/shared/settings.js`），验证 why.md#需求-CC1-更像-CC2减少依赖本地服务-场景-只用-CC1-也能更聪明

## 2. 不同步检测：悬空落点（还能往下掉）
- [√] 2.1 在 `extension/content/content.js`（画叠加前）增加“还能往下掉”检测：一旦触发就清空建议 + reset 引擎 + 重算，验证 why.md#需求-发现悬空落点立即自救-场景-悬空提示要立刻消失并自恢复
- [√] 2.2 错误信息更好懂：在详情页显示“触发原因=悬空落点/还可下落”并展示关键坐标，便于截图反馈（`extension/ui/details.js`），验证 why.md#需求-发现悬空落点立即自救-场景-悬空提示要立刻消失并自恢复

## 3. 手动 Reset（清异常缓存 + 重新捕获 API）
- [√] 3.1 Popup 增加按钮“强制重置（清缓存）”（`extension/ui/popup.html`、`extension/ui/popup.js`），验证 why.md#需求-一键重置异常缓存旧局面-场景-退出对局再进切模式后卡旧局面
- [√] 3.2 Content 增加消息处理：收到 reset 后清内存缓存（两套记忆）+ 清旧画面 + 触发 `TBP_CC_RESET`（`extension/content/content.js`），验证 why.md#需求-一键重置异常缓存旧局面-场景-退出对局再进切模式后卡旧局面
- [√] 3.3 PageHook 增加“重新捕获 API”入口：收到 reset 消息后清掉已捕获 API，并重新安装 Map tap（`extension/page/pageHook.js`），验证 why.md#需求-一键重置异常缓存旧局面-场景-退出对局再进切模式后卡旧局面

## 4. 自动兜底：状态卡住自动清空
- [√] 4.1 Content 增加“心跳超时”机制：一段时间没收到 `TBP_STATE` 就清空画面并提示用户点 reset/刷新（`extension/content/content.js`、`extension/ui/popup.js` 提示文案），验证 why.md#需求-一键重置异常缓存旧局面-场景-退出对局再进切模式后卡旧局面

## 5. Windows Cargo 环境变量说明
- [√] 5.1 更新 `cc2-server/README.md`：用大白话写清楚 Rust/Cargo 安装与 PATH 设置（用户变量 vs 系统变量），并给出验证命令，验证 why.md#变更内容

## 6. 安全检查
- [√] 6.1 执行安全检查（按G9: 不新增多余权限/不保存敏感信息/不引入危险命令）

## 7. 提交与验证
- [√] 7.1 对修改过的 JS 执行 `node --check`（最少：`extension/content/content.js`、`extension/page/pageHook.js`、`extension/engine/coldClearTbpClient.js`、`extension/ui/popup.js`）
- [√] 7.2 Git commit：提交本次改动（包含 reset 按钮与策略），并保证 `helloagents/CHANGELOG.md` 同步更新
