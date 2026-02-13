# 任务清单: 修复缩放对齐与实时提示不同步

目录: `helloagents/plan/202602112330_fix_bounds_resize_and_live_sync/`

---

## 1. 棋盘对齐（缩放/窗口变化）
- [√] 1.1 修复“窗口缩放后叠加层不跟随”的问题：锁定校准时也能在 resize 后自动重算并更新叠加层
- [√] 1.2 强化棋盘 bounds 自动识别：优先使用 tetr.io holder 提供的 canvas（如果拿得到），减少选错 canvas/缩放比例导致的偏移

## 2. 实时建议一致性（悬浮 vs 详情页）
- [√] 2.1 为每次 cold-clear 请求增加 requestId，回包必须匹配 requestId 才更新 UI，避免 undo/回退时“旧结果又覆盖回来”
- [√] 2.2 cold-clear 失败时不再回退到 sim（按当前要求），改为清空建议并显示更明确的错误信息

## 3. 文档同步
- [√] 3.1 更新 `helloagents/wiki/modules/state.md`（状态提取与 bounds 计算说明）
- [√] 3.2 更新 `helloagents/wiki/modules/ui.md`（校准/锁定/缩放行为说明）

## 4. 验证
- [√] 4.1 运行一次最小验证：检查扩展脚本无语法错误（node 语法检查）+ 关键文件加载路径存在
