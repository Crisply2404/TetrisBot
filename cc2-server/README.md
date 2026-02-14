# 本地 Cold Clear 2 服务（给扩展用）

这是一个**跑在你电脑本机**的“小服务”，让 Chrome 扩展可以优先用 **Cold Clear 2（cc2）** 来算落点；如果你没启动它，扩展会自动回退到插件内置的 **Cold Clear 1（cc1）** 兜底。

## 你需要准备什么

1. Node.js（你已经有了就跳过）
2. Rust 工具链（用于编译 cc2）

## 第一次使用（Windows）

1. 先把 cc2 编译出来（只要做一次）：

```powershell
cd "D:\Projects\Agent\TetrisBot\ref\cold-clear-2"
cargo build --release
```

编译成功后会生成：

- `ref/cold-clear-2/target/release/cold-clear-2.exe`

2. 启动本地服务：

```powershell
cd "D:\Projects\Agent\TetrisBot"
node .\cc2-server\server.js
```

看到类似输出说明启动成功：

```
[tbp-cc2-local] listening on http://127.0.0.1:47123
```

## 扩展怎么连它

默认地址：

- `http://127.0.0.1:47123`

接口：

- `GET /health`：检查服务是否活着
- `POST /suggest`：输入当前局面，返回建议落点
- `POST /reset`：重启/清空 cc2 的内部状态（一般你不用管）

你可以用环境变量改端口或二进制路径：

```powershell
$env:TBP_CC2_PORT=47123
$env:TBP_CC2_BIN="D:\\path\\to\\cold-clear-2.exe"
node .\cc2-server\server.js
```

