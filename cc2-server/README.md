# 本地 Cold Clear 2 服务（给扩展用）

这是一个**跑在你电脑本机**的“小服务”，让 Chrome 扩展可以优先用 **Cold Clear 2（cc2）** 来算落点；如果你没启动它，扩展会自动回退到插件内置的 **Cold Clear 1（cc1）** 兜底。

## 你需要准备什么

1. Node.js（你已经有了就跳过）
2. Rust 工具链（用于编译 cc2：也就是 `cargo`）

## 第一次使用（Windows）

### 0) 安装 Rust / Cargo，并把它加进 PATH（最关键）

最省心的方式是装 **rustup**（它会把 `cargo` 一起装好，并默认加到 PATH）。

安装完成后，**重新打开**一个 PowerShell，验证：

```powershell
cargo -V
rustc -V
```

如果提示“找不到 cargo”，就手动把下面这个目录加到 PATH：

- `%USERPROFILE%\.cargo\bin`

怎么加（Windows 10/11）：

1. 打开「设置」→ 搜索「环境变量」→ 进入「编辑系统环境变量」
2. 点右下角「环境变量…」
3. **推荐改“用户变量”**（只影响你自己，最安全、也最常见）  
   - 在「用户变量」里找到 `Path` →「编辑」→「新建」→ 粘贴 `%USERPROFILE%\.cargo\bin`
4. 点确定保存，**重新打开** PowerShell 再试 `cargo -V`

什么时候用“系统变量”？
- 你希望这台电脑的所有账号都能用 cargo，或者你在公司环境里统一装在系统层面；否则一般不需要。

### 1) 编译 cc2（一般只要做一次）

先确保你有 `cold-clear-2` 源码（你可以放在任意目录；不强制必须是 `ref/`）。

在 `cold-clear-2` 目录里执行：

```powershell
cargo build --release
```

编译成功后会生成：

- `target/release/cold-clear-2.exe`

### 2) 启动本地服务（每次要用 CC2 时都要开着）

在本仓库根目录执行：

```powershell
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

如果你想改端口/或 `cold-clear-2.exe` 不在默认位置，可以用环境变量：

```powershell
$env:TBP_CC2_PORT=47123
$env:TBP_CC2_BIN="C:\\path\\to\\cold-clear-2.exe"
node .\cc2-server\server.js
```
