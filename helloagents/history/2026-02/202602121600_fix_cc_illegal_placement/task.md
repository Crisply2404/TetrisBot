# 任务清单: 修复 cc “不可能落点”

目录: `helloagents/plan/202602121600_fix_cc_illegal_placement/`

---

## 1. 坐标换算与校验
- [√] 1.1 修正 TBP 坐标换算：按 spec 处理 I/O 在不同朝向的中心点，避免落点偏移（`extension/content/content.js`）
- [√] 1.2 增加落点合法性校验：若越界/压到已有块/非整数坐标，报错并 reset cold-clear（`extension/content/content.js`）

## 2. 验证
- [√] 2.1 语法检查：`node --check extension/content/content.js`

