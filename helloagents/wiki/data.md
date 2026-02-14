# 数据模型

## 1. 设置（Settings）
建议存到 `chrome.storage.local`（或同等离线存储）里：
- `enabled`: 是否启用叠加层
- `engineMode`: 引擎优先级
  - `cc2`: 优先用本地 Cold Clear 2（连不上会自动回退 cc1）
  - `cc1`: 强制只用插件内置 Cold Clear 1（离线兜底）
- `cc2BaseUrl`: 本地 CC2 服务地址（默认 `http://127.0.0.1:47123`）
- `cc2TimeoutMs`: CC2 请求超时阈值（ms）
- `toggleKey`: 快捷键（默认 `E`），一键开/关提示；留空=关闭快捷键
- `modePreset`: `40l` / `vs`
- `allowedSpins`: `tspins` / `allspins`（先做 tspins）
- `pickStrategy`: cold-clear 返回多个候选时“怎么挑最终答案”
  - `strict`: 严格选第 1 名（更一致）
  - `preferSpins`: 对战时偏好旋转（更像打旋）
  - `damage`:（实验）按“当前一步粗略伤害估算”重排
- `useHold`: 是否允许引擎使用 hold（默认开，可关）
- `opacity`: 叠加层透明度
- `readFullBag`: 是否读取更长块序（默认开；会按 7-bag 变长队列喂给 cold-clear）
- `debug`: 是否开启调试输出（弹窗/详情页会显示更多排错信息）

叠加层对齐（校准/自适应）相关：
- `boundsLock`: 是否锁定棋盘像素框（用户校准后会开）
- `boundsLockedRect`: 锁定的棋盘像素矩形 `{x,y,width,height}`
- `boundsLockedViewport`: 保存锁定像素框时的视口尺寸 `{w,h}`（用于窗口缩放后自适应重算）
- `boundsAdjust`: 相对比例校准参数 `{dxr,dyr,wr,hr}`（用于“从 base bounds 重算锁定框”）
- `boundsLockBaseMode`: 记录校准时的 base bounds 模式（例如 `visible` / `croppedFromTotal`）
- `scaleSamples`: 缩放采样点列表（用于窗口缩放后更稳地重算锁定框；可在“采样点管理页”编辑/禁用/删除）

## 2. 游戏状态（GameState）— 实时用
- `board`: 10×(buffer+可见高度) 的格子数据（当前实现里用 0/1 表示空/有块）
- `current`: 当前块类型（I/O/T/S/Z/J/L）
- `hold`: hold 块类型或空
- `next`: next 队列（至少 5 个）
- `canHold`: 当前这“一手”是否还能 Hold（用于避免给出不合法建议；推断得出时会带上）
- `bufferRows` / `visibleRows`: 用于把“隐藏行/可见行”分开画
- `combo` / `backToBack`（可选）: 对战上下文（用于 cold-clear 的 `start` 参数）
- `frame`（可选）: 帧号（用于检测 Zen undo/回退等“时间倒退”）
- `bounds`（可选）: 棋盘在屏幕上的矩形区域（叠加层定位用）
- `boundsMeta`（可选）: bounds 来源信息（例如 pixi 扫描/holder 等，用于调试显示）

## 3. 建议（Suggestion）
- `useHold`: 是否建议先按 hold
- `cells`: 建议落点占用的格子坐标（方便直接画轮廓）
- `plan`（可选）: 详情页展示用的“当前块 + Next5”分步建议
