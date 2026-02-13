# 模块：state（提取 TETR.IO 实时状态）

## 目的
稳定拿到这些信息：
- 棋盘每一格是空还是有块
- 当前块是什么
- Hold 是什么
- Next 队列至少 5 个

## 模块概述
- **职责:** 从页面内部拿“真实状态”，再发给引擎和 UI
- **状态:** ✅MVP已实现
- **最后更新:** 2026-02-10

## 现状（现在代码怎么做的）
相关代码在：
- `extension/page/pageHook.js`：跑在页面 MAIN 世界里，负责“读 tetr.io 内部状态”
- `extension/content/content.js`：桥接与缓存（也负责详情页实时数据）
- `extension/sw.js`：用 `chrome.scripting` 把 Hook 注入到 MAIN 世界（更不容易被 CSP 拦）

核心思路（大白话）：
1. Content Script 会让后台 `sw.js` 用 `chrome.scripting.executeScript({ world: "MAIN" })` 把 Hook 注入到页面主环境跑起来（这样才能读到 tetr.io 的内部对象）。
2. 页面内 Hook 需要先拿到“游戏 API 对象”（特征：有 `getHolderData()`、`ejectState()`、`isOnline()` 这些方法）。
   - **新版 tetr.io 可能不会把这个对象直接挂到 `window` 上**，所以我们加了一个更稳的办法：在 Hook 里“短暂监听” `Map.prototype.set/get`，一旦看到有对象长得像游戏 API，就立刻抓住并保存到 `window.__tbpGameApi`，然后把监听卸载掉（尽量减少对页面的影响）。
   - 同时保留兜底：如果它确实挂在 `window` 上，我们也会继续扫 `window` 来找。
   - 注意：tetr.io 页面里经常会有广告/统计用的 iframe（不同域名）。
   - 我们扫 `window` 的时候会碰到这些 iframe 的窗口对象；如果不做保护，读它的属性就会报“跨域访问”错误。
   - 所以代码里对候选对象做了 `try/catch`，遇到跨域窗口就直接跳过。
3. 找到以后，用 `ejectState()` 拿到：
   - `board`（棋盘）
   - `falling.type`（当前块）
   - `hold`（hold）
   - `bag`（我们默认只取前 5 个当 next5；如果你在设置里开了“读取完整块序”，会取更多）
   - 兼容点：棋盘格子的“空”在不同版本里可能是 `0/-1/255/null` 等；我们会先做一次“空格值自动识别”，避免误判整盘都是满的。
   - 兼容点：块类型有时不是字母（I/O/T/...），而是数字 id（例如 0-6）；我们也做了兼容映射，避免拿不到 `current`。
4. 再算出棋盘在屏幕上的位置（`bounds`，叠加层定位用）：
   - 我们会从 `getHolderData()` 里优先尝试 `stackobj / holder / board` 这几个对象（谁能算出边界就用谁）。
   - 同时页面里可能有多个 `<canvas>`：
     - **优先**用 `getHolderData()` 里带出来的那张 canvas（通常就是游戏渲染用的那张，更准、更不容易选错）。
     - 拿不到时才去扫页面上所有 `<canvas>`，把“最像棋盘”的那一个选出来（宽高比接近 10×20，而且大部分落在 canvas 里面）。
   - 如果这一步失败了，弹窗会显示“定位❌”，叠加层就会看不到（但不代表状态读取失败）。
   - 备注：就算能拿到 bounds，不同分辨率/缩放/皮肤也可能导致“差一点点不贴格子”。这时 UI 模块支持手动校准，会在不改 state 的情况下，用一个相对比例的 `boundsAdjust` 把最终叠加层对齐。
5. 最后用 `window.postMessage` 把状态发回 Content Script。

补充：Hold 是否“还能用”
- tetr.io 有一个规则：**每个块最多 hold 一次**（hold 以后直到落地前都不能再 hold）。
- tetr.io 内部有没有直接的 `canHold` 字段我们不敢保证稳定（版本一更新就可能变）。
- 所以现在我们用一个更稳的“行为推断”：
  - 如果棋盘没变（`boardHash` 一样）但 `current` 变了，基本就可以认定玩家按了 hold → 这一手 `canHold=false`
  - 一旦棋盘变了（说明块落地/行清/吃垃圾），就进入新一手 → `canHold=true`
- 这个 `canHold` 会传给引擎，用来避免出现“不合法的连续 hold 建议”。

## 规范

### 需求: 实时取状态（A 路线）
**模块:** state  
通过“页面内注入 Hook”的方式拿状态，尽量别用截图识别（那条路太挑画质/皮肤/分辨率）。

#### 场景: 页面正常加载 tetr.io
前置条件：用户打开 `https://tetr.io/` 并进入游戏界面  
- 预期结果：在 1 秒内拿到一次完整状态（board/current/hold/next）
- 预期结果：之后能持续更新（例如每帧/每几帧/每次状态变化）

#### 场景: 读不到状态 / TETR.IO 更新导致结构变了
- 预期结果：扩展自动关闭叠加层并提示“未连接到游戏状态”
- 预期结果：不疯狂报错、不拖慢页面

## 依赖
- engine 模块（需要 state 才能算建议）
- ui 模块（需要 state 才能画叠加层/详情页展示）
