# 任务清单: fix_game_api_capture

目录: `helloagents/plan/202602102209_fix_game_api_capture/`

---

## 1. state（取状态）
- [√] 1.1 在 `extension/page/pageHook.js` 增强“找 API”逻辑：支持从内部 Map 捕获 API，解决“未找到游戏 API”。
- [√] 1.2 保持跨域 iframe 安全跳过，避免 `SecurityError` 影响状态提取。

## 2. 文档更新
- [√] 2.1 更新 `helloagents/wiki/modules/state.md`：补充“Map 捕获 + window 扫描 fallback”的说明。
- [√] 2.2 更新 `helloagents/CHANGELOG.md`：记录本次修复。
- [√] 2.3 迁移方案包后更新 `helloagents/history/index.md`：补充本次修复索引。

## 3. 验证
- [√] 3.1 基础语法检查：确保扩展脚本无语法错误。
- [?] 3.2 手动验证：打开 `https://tetr.io/` 进入对局，叠加层不再提示“未找到游戏 API”（需要在浏览器里验证）。
