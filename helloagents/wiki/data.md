# 数据模型

## 1. 设置（Settings）
建议存到 `chrome.storage.local`（或同等离线存储）里：
- `enabled`: 是否启用叠加层
- `modePreset`: `40l` / `vs`
- `allowedSpins`: `tspins` / `allspins`（先做 tspins）
- `useHold`: 是否允许引擎使用 hold（默认开，可关）
- `opacity`: 叠加层透明度

## 2. 游戏状态（GameState）— 实时用
- `board`: 10×(buffer+可见高度) 的格子数据（当前实现里用 0/1 表示空/有块）
- `current`: 当前块类型（I/O/T/S/Z/J/L）
- `hold`: hold 块类型或空
- `next`: next 队列（至少 5 个）
- `bagInfo`（可选）: 用于 7-bag 推断的辅助信息
- `context`: 模式/房间类型/是否疑似竞技匹配（用于安全开关）
- `bufferRows` / `visibleRows`: 用于把“隐藏行/可见行”分开画
- `bounds`（可选）: 棋盘在屏幕上的矩形区域（叠加层定位用）

## 3. 建议（Suggestion）
- `useHold`: 是否建议先按 hold
- `rotation`: 建议旋转（0/90/180/270 或同等表示）
- `x`: 建议落点列
- `cells`: 建议落点占用的格子坐标（方便直接画轮廓）
- `plan`（可选）: 详情页展示用的“当前块 + Next5”分步建议
