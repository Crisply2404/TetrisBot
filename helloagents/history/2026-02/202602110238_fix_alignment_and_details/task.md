# 轻量迭代：修复叠加层对齐与详情页卡住

目标：让绿色提示“贴着格子”，并且离开对局/切模式时详情页不再停留上一局画面。

任务清单：
- [√] 叠加层：根据 `bufferRows/visibleRows` 自动裁剪 bounds（避免把隐藏 buffer 当成可见棋盘）
- [√] 叠加层：改进网格映射逻辑（不要用固定阈值猜 20/40 行）
- [√] 调试信息：把 bounds 选择来源（board/holder/stackobj + scaled/raw）回传到弹窗，方便用户反馈
- [√] 详情页：拿不到实时状态时清空旧画面（避免“停在上一局原地不动”）
- [√] 知识库：更新 `helloagents/CHANGELOG.md` + `helloagents/project.md`
- [√] 验证：对改动过的 JS 做语法检查（node --check）

