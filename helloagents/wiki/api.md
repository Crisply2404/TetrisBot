# 内部消息 API（扩展内部用）

> 这里说的“API”不是网站接口，而是扩展内部各个部分互相发消息的约定。

## 概述
当前版本我们分 4 个角色（不强行上 Service Worker，能少一层就少一层）：
- **页面内 Hook（MAIN 世界）**：跑在 tetr.io 页面里，能直接读到游戏内部状态
- **Content Script（隔离世界）**：桥接页面与扩展；负责叠加层、详情页数据、和 UI 通信
- **本地计算（离线）**：先用 JS 占位引擎（后续可替换为 cold-clear WASM）
- **UI 页面**：Popup/详情页/设置页

## 消息列表（建议）

### `TBP_PAGE_CONFIG`
**方向:** Content Script → 页面内 Hook  
**用途:** 告诉页面内 Hook 一些开关（例如是否允许读取完整块序、是否开启 debug）

字段：
- `readFullBag`: boolean
- `debug`: boolean

### `TBP_STATE`
**方向:** 页面内 Hook → Content Script  
**用途:** 推送最新游戏状态（实时）

字段：
- `state.board`: 0/1 棋盘（包含 buffer 行）
- `state.current`: 当前块（I/O/T/S/Z/J/L）
- `state.hold`: hold 块（可为空）
- `state.next`: next（默认 5 个；开启“读取完整块序”后会更多）
- `state.bufferRows` / `state.visibleRows`: 行数信息
- `state.bounds`: 棋盘在屏幕上的矩形区域（给叠加层定位）
- `state.frame`: 帧号（用于去重/节流）

### 本地计算（无显式消息）
**位置:** Content Script 内部  
**用途:** 实时计算“当前块建议落点”，以及详情页用的“当前块 + Next5”步骤。

### `TBP_GET_DETAILS_DATA`
**方向:** 详情页 → Content Script  
**用途:** 获取“实时详情数据”（状态 + 当前块+Next5步骤），用于详情页展示

### 设置读写（无显式消息）
**方式:** UI/Content Script 直接用 `chrome.storage.local`  
**用途:** 保存开关、透明度、是否读取完整块序等
