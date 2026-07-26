# Design

> **状态（2026-07-26）：暂停。** 本设计描述的是旧 Tauri Windows 路线；Electron Windows 目标以 spec 012 为准。

> **状态(2026-07-11)**:本文中的 `dev-client.ps1`、NSIS-only target、Windows 资源映射和本机发布脚本已有代码/配置;但尚无真实 NSIS 构建/安装/E2E 证据。下文的产品链路仍是待验收目标,不是发布完成声明。

## 总体方案

**沿用「同代码库 + 平台分叉点 + Tauri windows.conf override」既有路线**,不分库。`dev-client.ps1`、NSIS-only target、资源映射与 `release-client-win.ps1` 已落;本 spec 的剩余核心是在 Windows 实机跑完协议、DeepSeek、Credential Manager、sandbox、NSIS 资源/安装/卸载与首启矩阵。

## 架构边界

- 属于 `apps/desktop` 的逻辑:
  - `tauri.windows.conf.json` 已显式写 `bundle.targets = ["nsis"]` 并映射 Windows codex/Python/gateway/OfficeCLI/plugins/workbench 资源。publisher / shortcut / 签名元数据尚未落齐,且整份配置尚未经 NSIS 真构建。
  - 已有平台分叉点(`useLiquidGlassEffect`、`WindowCaptionControls`、`constants.ts`、`office.rs`)**不改**,只在 verification 上跑实测。
- 属于 `gateway` 的逻辑:无改动。`gateway.py` 是纯 stdlib Python,在 Windows 上由 dev-client.ps1 直接 `python3 gateway/gateway.py` 起,bearer 校验逻辑跨平台相同。
- 属于 `scripts/` 的内容:
  - **已存在** `scripts/dev-client.ps1` 与 `scripts/release-client-win.ps1`;前者尚未有本 spec 所要求的 GUI+真实对话 E2E 记录,后者尚未有真实安装包记录。
  - `dev-client.sh` 保留作 macOS/WSL/Linux post-MVP 上游资产,不进 MVP 常用命令与验收。
  - `vendor-officecli.ps1` 已存在;其他平台二进制只是保留资产,MVP 只验收 Windows x64。
- 属于 `plugins` / `workbenches` 的内容:无改动。
- 明确不改 `codex-upstream` 的部分:全部内核 + 协议代码。Windows 上要做的只是 `cargo build -p codex-cli` + 协议探针实测。

## 数据流(Windows 启动链路)

```text
用户双击 NSIS 安装包(待验证目标链路)
  -> %ProgramFiles%\BlackRain\ 装好（以当前 base `productName` 为目标）
  -> 开始菜单图标点击启动
  -> Tauri 主进程(BlackRain.exe)
       ├─ 读 %APPDATA%\cc.goodbyeri.blackrain\codex-home\config.toml
       │     model_provider = "blackrain_gateway"
       ├─ spawn 内嵌 codex.exe 子进程(从 resources/ 拉)
       └─ spawn 内嵌 gateway/gateway.py 子进程(配置已映射 Windows Python 资源,实际包内启动待验)
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
- 文件布局目标:NSIS 安装产物 = `%ProgramFiles%\BlackRain\BlackRain.exe` + `resources\office-cli\windows-x64\officecli.exe` + `resources\gateway\gateway.py` + `resources\plugins\office-cli\*` + `resources\workbenches\office-agent\*`。当前 Windows 窗口标题、About、tray 和 Credential Manager service 仍有 `BlackRain2049` 兼容旧名，品牌迁移尚未完成。

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
- `tauri.windows.conf.json` 已显式收窄为 `targets:["nsis"]` 并写入资源映射;尚需真实构建确认不触发 MSI/WiX 且资源全部入包。
- 签名方案待决:未签名、OV、EV 三种路线均尚未完成 SmartScreen/杀毒误报/成本评估;publisher/签名 hook 也尚未落地。

## 测试策略

- 单元测试:跑当前 `npm run test` 全量用例,不锁历史测试数。
- 集成测试:Windows 主机跑 `cargo check` + `cargo test model_gateway` + `npm run test` 全套;非 Windows 历史结果不代替 MVP 验收。
- 协议探针:`python3 .scratch/m0_protocol_probe.py` + `m0_tool_driver.py` 在 Windows 主机上对当前锁定 rust-v0.144.5 / `87db9bc` 内核跑全绿。
- 人工验证:① `pwsh scripts/dev-client.ps1` 起到 GUI 可见、能发对话;② `npm run tauri:build:win` 产出 NSIS .exe;③ 双击安装包装到默认位置,开始菜单图标点开能起 App;④ Windows Credential Manager 写 / 读 / 清测 API key;⑤ 卸载干净不留垃圾。
