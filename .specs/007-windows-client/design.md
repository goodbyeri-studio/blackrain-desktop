# Design

## 总体方案

**沿用「同代码库 + 平台分叉点 + Tauri windows.conf override」既有路线**,不分库。本 spec 只补已落分叉骨架上的缺口:① 新增 `dev-client.ps1`(macOS `dev-client.sh` 的 PowerShell 对等版);② 把 `tauri.windows.conf.json` 的 NSIS bundle targets 显式落齐;③ 在 Windows 主机上跑完 macOS 已通过的全套验证矩阵(协议探针 / 真实 DeepSeek / Credential Manager / 资源 smoke);④ 把已知 Windows 专属缺口(`windowsSandbox/*` 探针、whisper-rs Windows 构建踩坑)记进 verification。

## 架构边界

- 属于 `apps/desktop` 的逻辑:
  - `tauri.windows.conf.json` 加 `bundle.targets = ["nsis"]` 与 publisher / shortcut name 等元数据(目前没写 targets 字段,继承默认 `"all"` 会同时跑 MSI,要求 WiX 工具链)。
  - 已有平台分叉点(`useLiquidGlassEffect`、`WindowCaptionControls`、`constants.ts`、`office.rs`)**不改**,只在 verification 上跑实测。
- 属于 `gateway` 的逻辑:无改动。`gateway.py` 是纯 stdlib Python,在 Windows 上由 dev-client.ps1 直接 `python3 gateway/gateway.py` 起,bearer 校验逻辑跨平台相同。
- 属于 `scripts/` 的内容:
  - **新增** `scripts/dev-client.ps1`(本 spec 主要新代码,~150 行 PowerShell,详见下「dev-client.ps1 设计」)。
  - `dev-client.sh` 保留,macOS / WSL / Linux 继续用。
  - `vendor-officecli.ps1` 已存在,Windows-x64 + macOS arm64/x64 三平台二进制都拉,无改动。
- 属于 `plugins` / `workbenches` 的内容:无改动。
- 明确不改 `codex-upstream` 的部分:全部内核 + 协议代码。Windows 上要做的只是 `cargo build -p codex-cli` + 协议探针实测。

## 数据流(Windows 启动链路)

```text
用户双击 NSIS 安装包
  -> %ProgramFiles%\BlackRain2049\ 装好
  -> 开始菜单图标点击启动
  -> Tauri 主进程(BlackRain2049.exe)
       ├─ 读 %APPDATA%\cc.goodbyeri.blackrain\codex-home\config.toml
       │     model_provider = "blackrain_gateway"
       ├─ spawn 内嵌 codex.exe 子进程(从 resources/ 拉)
       └─ spawn 内嵌 gateway/gateway.py 子进程(用系统 Python 或内嵌 Python)
             └─ bearer 校验 → 转发到 DeepSeek
  -> 首次启动:Mica 半透明窗口 + 自绘 caption controls
  -> 登录 Supabase → 进首页

dev 链路(本仓维护者):
  pwsh scripts/dev-client.ps1
    -> 加载 .env / 校验前置(node_modules、python3、cmake、codex.exe)
    -> 准备 .scratch\dev-codex-home\config.toml
    -> 起 gateway.py(后台,127.0.0.1:8899)
    -> 轮询 /health 就绪
    -> cd apps\desktop && npm run tauri:dev:win
```

## 接口与配置

- Tauri command / JSON-RPC:无新增,沿用现有所有命令。
- `config.toml` / `CODEX_HOME`:Windows 上 dev 模式落 `.scratch\dev-codex-home`,产品模式落 `%APPDATA%\cc.goodbyeri.blackrain\codex-home`,内容与 macOS 完全一致(`model = "deepseek-v4-flash"` + `model_provider = "blackrain_gateway"` + `wire_api = "responses"`)。
- 环境变量:`DEEPSEEK_API_KEY` / `BLACKRAIN_GATEWAY_API_KEY` / `CARGO_NET_GIT_FETCH_WITH_CLI=true`(libgit2 SSL 在 Windows 同样必踩,dev-client.ps1 必带)。
- 文件布局:NSIS 安装产物 = `%ProgramFiles%\BlackRain2049\BlackRain2049.exe` + `resources\office-cli\windows-x64\officecli.exe` + `resources\gateway\gateway.py` + `resources\plugins\office-cli\*` + `resources\workbenches\office-agent\*`。

## dev-client.ps1 设计

对照 `scripts/dev-client.sh` 一比一搬,POSIX 工具替换:
- `lsof -nP -iTCP:$GW_PORT` → `Get-NetTCPConnection -LocalPort $GW_PORT`
- `kill %1 / trap` → `Stop-Process -Id $gwPid` 注册到 `[Console]::CancelKeyPress` 事件 + try/finally。
- `set -a; source .env; set +a` → 自写 `.env` 解析器(`Get-Content .env | ForEach-Object { ... }` + `[Environment]::SetEnvironmentVariable($key, $value, 'Process')`)。
- `command -v cmake` → `Get-Command cmake -ErrorAction SilentlyContinue`。
- `curl -fs http://.../health` → `Invoke-WebRequest -Uri http://.../health -UseBasicParsing -TimeoutSec 1` + 非 200/异常视为未就绪。
- 内核 PATH 注入 → `$env:PATH = "$KERNEL_DIR;$env:PATH"`(注意分号、不是冒号)。
- 调用 `npm.cmd run tauri:dev:win`(Windows 上 npm 是 .cmd shim)。
- 失败路径:cmake 缺 → 提示 `choco install cmake llvm` 而非 `brew install cmake`(对齐 doctor.mjs)。

## 失败模式

- 上游协议失败:codex.exe Windows 编译失败(whisper-rs / libgit2)→ doctor.mjs 已先检 cmake+LLVM,失败提前在 doctor 阶段。
- 模型/网关失败:bearer 校验 / SSE 流式 / 工具调用历史转译——逻辑跨平台相同,Windows 上首次跑通仍可能撞 Python `aiohttp` / Path 分隔符问题,由 verification 跑出来。
- 配置损坏:专属 `CODEX_HOME` 路径用 Tauri `app_data_dir()` 解析,跨平台正确;不存在「macOS 写对 Windows 写错」的硬编码风险。
- 权限/沙箱失败:Windows 沙箱(`windowsSandbox/*`)5 层接线 `.specs/006` 已立项,首次在 Windows 主机跑探针时若内核报「沙箱未就绪」需走 setup 流程——本 spec 把它列为已知风险、不阻塞 v1。
- 用户可见降级:Mica 不可用(非 Windows 11 或被关闭透明效果)→ `useLiquidGlassEffect` 现有 fallback(纯背景色)生效,功能不挂。

## 安装包形态

- **NSIS**(选定):Tauri v2 默认推荐、产物体积小、自定义脚本灵活、社区生态成熟、与「面向小白一键装」契合。
- 在 `tauri.windows.conf.json` 显式加 `"bundle": { "targets": ["nsis"], "windows": { "nsis": { ... } } }`,把默认 `"all"` 显式收窄,避免触发 MSI 跑去找 WiX 工具链。
- v1 不签名(EV 证书成本 + 硬件 key 流程留 v2);NSIS 元数据预埋 `publisher = "Goodbyeri Studio"` 之类字段,后续加签名只补 `signingIdentity`,不动其他结构。

## 测试策略

- 单元测试:无新增逻辑,沿用现有 `npm run test` 1032 tests。
- 集成测试:Windows 主机跑 `cargo check` + `cargo test model_gateway` + `npm run test` 全套——这套在 macOS 已通过,Windows 是首次实测。
- 协议探针:`python3 .scratch/m0_protocol_probe.py` + `m0_tool_driver.py` 在 Windows 主机上对当前锁定 `da4c8ca` 内核跑全绿。
- 人工验证:① `pwsh scripts/dev-client.ps1` 起到 GUI 可见、能发对话;② `npm run tauri:build:win` 产出 NSIS .exe;③ 双击安装包装到默认位置,开始菜单图标点开能起 App;④ Windows Credential Manager 写 / 读 / 清测 API key;⑤ 卸载干净不留垃圾。
