# misamino-server（本地服务）

这是一个给 `extension/` 用的本机 HTTP 服务，用来调用 `ref/misamino-bot`（MisaMinoBot）计算建议落点。

## 你需要准备什么

1) **克隆并打补丁（让它能输出落点 + 支持 hold）**

本项目默认把源码放在：

- `ref/misamino-bot`

如果你是自己重新 clone 的，请在仓库根目录执行一次：

```bash
git -C ref/misamino-bot apply ../../misamino-server/patches/misamino-action-json.patch
```

2) **编译 MisaMinoBot**

在仓库根目录执行：

```bash
cd ref/misamino-bot/tetris_ai
make -f Makefile CONF=Release
```

编译产物默认会在：

- `ref/misamino-bot/tetris_ai/dist/Release/GNU-Linux/tetris_ai`（macOS/Linux）
- Windows 可能是 `tetris_ai.exe`（如果你用 MinGW/MSYS2 或类似环境编译）

2) **启动服务**

```bash
node misamino-server/server.js
```

默认监听：

- `http://127.0.0.1:47124`

## 环境变量

- `TBP_MISA_PORT`：端口（默认 `47124`）
- `TBP_MISA_BIN`：MisaMinoBot 可执行文件路径（默认指向本仓库 `ref/` 下的编译产物）

## 接口

- `GET /health`：查看是否找到可执行文件
- `POST /suggest`：输入 `{ state, settings }`（格式与扩展发出的 payload 一致）
- `POST /reset`：杀掉子进程并重启（用于卡死/跑飞）

## 重要说明

- 目前按“只喂 next5”设计（MisaMinoBot 内部也只取 5 个 next）。
- 为了更稳，服务端默认会给 MisaMinoBot 喂 **24 行**（20 可见 + 少量 buffer），减少“堆高时看不见上面方块”导致的错误建议。
- MisaMinoBot 的内部坐标与扩展不同：服务端会把返回的 `cells` 映射到扩展使用的 **40 高度 top 坐标**（允许 `y < 0`）。
- 为了避免“旧回包污染/不同步”（例如当前=L、hold空、next1=O，却返回 J 这种不可能情况），服务端会校验返回的 `piece/useHold` 是否与输入状态一致；不一致会**硬重启子进程并自动重试一次**。超时/异常也会硬重启，避免后续串包。
