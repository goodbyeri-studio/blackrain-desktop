# 快捷命令行

> BlackRain 日常启动、构建、发布和通用验证命令的唯一真源。模块 README/runbook 只保留不重复的局部诊断或协议探针。除特别标注外，路径均以仓库根 `BlackRain/` 为基准。
> MVP 仅发行 Windows，主流程使用 PowerShell 7 (`pwsh`)；macOS / iOS 只作为 post-MVP 或上游资产。

## 目录

- [Windows 首次准备](#windows-首次准备)
- [拉取并对齐双引擎](#拉取并对齐双引擎)
- [构建 CODE 内核](#构建-code-内核)
- [启动 Windows 客户端](#启动-windows-客户端)
- [前端与 Rust 验证](#前端与-rust-验证)
- [Windows 本机发布](#windows-本机发布)
- [单独调试模型网关](#单独调试模型网关)
- [协议探针](#协议探针)
- [日常 GitHub Flow](#日常-github-flow)
- [CodexMonitor subtree 同步](#codexmonitor-subtree-同步)
- [post-MVP 非 Windows 参考](#post-mvp-非-windows-参考)

---

## Windows 首次准备

```powershell
# 仓库根执行
Copy-Item .env.example .env
# 编辑 .env，填写 DEEPSEEK_API_KEY；不要提交该文件

# codex/whisper-rs 构建依赖
winget install Kitware.CMake LLVM.LLVM
# 或：choco install cmake llvm

Set-Location apps\desktop
npm install
npm run doctor:win
Set-Location ..\..
```

还需预先安装 Git、Node.js 22、Rust stable、Python 3.10+、PowerShell 7 和 Tauri 所需的 Windows 构建环境。`npm run doctor:win` 只做项目已有的环境自检，不代表 GUI、Office 或 NSIS 已验证。

## 拉取并对齐双引擎

### 有 POSIX shell：自动锁定入口

Git for Windows 自带 Git Bash 时，优先使用仓库脚本。脚本会 clone/fetch 精确 tag、校验 tag 解引用后的完整 SHA，并 detached checkout；上游有已跟踪改动时会 fail closed：

```powershell
sh scripts/fetch-references.sh
python scripts/check-hermes-contract.py --static-only
```

第二条只做 Hermes 锁、LICENSE/lockfile hash、AST 路由和 fixtures 静态审计，不安装依赖。

### 纯 PowerShell 回退：显式 clone + checkout

纯 PowerShell 环境没有 `sh` 时，Windows 构建/验证前使用下面的显式流程：

```powershell
if (-not (Test-Path codex-upstream)) {
  git clone --filter=blob:none https://github.com/openai/codex.git codex-upstream
}
if (-not (Test-Path hermes-upstream)) {
  git clone --filter=blob:none https://github.com/NousResearch/hermes-agent.git hermes-upstream
}

if ((git -C codex-upstream rev-parse --is-shallow-repository) -eq "true") {
  git -C codex-upstream fetch --unshallow origin
}
if ((git -C hermes-upstream rev-parse --is-shallow-repository) -eq "true") {
  git -C hermes-upstream fetch --unshallow origin
}

git -C codex-upstream fetch origin --tags --prune
git -C codex-upstream checkout --detach 44918ea10c0f99151c6710411b4322c2f5c96bea

git -C hermes-upstream fetch origin --tags --prune
git -C hermes-upstream checkout --detach 9de9c25f620ff7f1ce0fd5457d596052d5159596

git -C codex-upstream rev-parse --short HEAD
git -C hermes-upstream rev-parse --short HEAD
# 预期分别为 44918ea10c0f99151c6710411b4322c2f5c96bea、9de9c25f620ff7f1ce0fd5457d596052d5159596

python scripts/check-hermes-contract.py --static-only
```

目标锁定值与边界见 [REFERENCES](REFERENCES.md)。不要把本机 gitignored 克隆的 `HEAD` 当成仓库已完成状态。

### Hermes 上游升级 contract regression

```powershell
Set-Location hermes-upstream
uv sync --frozen --extra dev --extra mcp
Set-Location ..

python scripts/check-hermes-contract.py

# 启动锁定 Hermes 真进程，以本地确定性 Chat Completions 桩验证
# managed config → runs/SSE → tool/approval → stop/cancel → same-session continue
python scripts/test-hermes-live-probe.py
```

完整入口依次验证：

- runtime manifest、`fetch-references.sh`、上游 exact tag/commit 一致；
- 上游工作树干净，`LICENSE`、`pyproject.toml`、`uv.lock` SHA-256 与存证一致；
- 从 `api_server.py` AST 提取的必需 `/v1`/session 路由仍存在；
- 当前 tag 的 capabilities/SSE/run/approval/stop fixtures 完整；
- 锁定上游 API/Windows/Skills/file safety/approval 专项 pytest；
- BlackRain Hermes Rust contract 与前端 types/events/Tauri wrapper tests。

`test-hermes-live-probe.py` 不读取 `.env` 或用户凭据，使用随机 loopback 端口、固定测试文本和临时项目。它连续验证真实 `read_file`、受审批 `terminal` 的 `once` 执行与 `deny` 零副作用、阻塞模型流的 Stop/cancel，以及同 `session_id` 携带显式历史的新 run 继续，并检查 `memory`、`session_search`、`cronjob` 未进入模型工具列表。它证明锁定 Hermes 真进程可消费 BlackRain managed config 并完成结构化 run/SSE/approval/stop/continue，不证明真实 new-api、国产模型、Tauri 或 Windows 产品闭环。

升级 Hermes 时先更新 `scripts/fetch-references.sh` 与 Windows runtime manifest 的 tag、完整 commit、版本及三个 hash；重新生成并审阅新 tag fixture 目录，更新 spec 003/009 存证，再运行完整入口。最后仍须在 Windows 执行 runtime vendor、NSIS 和 spec 007/009 产品矩阵；该脚本不替代 Windows 实机验收。

## 构建 CODE 内核

```powershell
Set-Location codex-upstream\codex-rs
$env:CARGO_NET_GIT_FETCH_WITH_CLI = "true"

# 壳需要的 codex.exe
cargo build -p codex-cli --bin codex

# 协议调试用 codex-app-server.exe
cargo build -p codex-app-server

.\target\debug\codex.exe --help
Set-Location ..\..
```

产物：

- `codex-upstream\codex-rs\target\debug\codex.exe`
- `codex-upstream\codex-rs\target\debug\codex-app-server.exe`

若 bindgen 找不到 clang，可在当前 PowerShell 会话设置：

```powershell
$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"
```

## 启动 Windows 客户端

```powershell
# 默认 deepseek-v4-flash
pwsh scripts/dev-client.ps1

# 指定模型
$env:DEV_MODEL = "deepseek-v4-pro"
pwsh scripts/dev-client.ps1
```

脚本会加载 `.env`、检查 `codex.exe` / Python / cmake / `node_modules`、生成 `.scratch\dev-codex-home\config.toml`、启动带本地 bearer 的 Gateway，再执行 `npm run tauri:dev:win`。Ctrl-C 退出时会停止脚本启动的 Gateway。

该命令会打开 GUI，必须在有显示器的 Windows 本机运行，不能用 SSH/无头结果代替实机验证。

## 前端与 Rust 验证

```powershell
Set-Location apps\desktop

npm run typecheck
npm run test
npm run lint
npm run lint:ds
npm run codemod:ds:dry

Push-Location src-tauri
cargo check
# Hermes WORK shared contract/client/supervisor 专项
cargo test hermes --lib
# 工作台 verified plugin runtime/MCP 路径门禁专项
cargo test plugin_core --lib
Pop-Location

# Windows 专用入口
npm run doctor:win
npm run tauri:dev:win
npm run tauri:build:win

Set-Location ..\..
```

按改动范围选择命令：前端行为跑 typecheck/test/lint；共享 chrome/弹层额外跑 `lint:ds` 和 `codemod:ds:dry`；Rust 后端跑 `cargo check`。发布级结论还必须完成 [.specs/007 verification](../.specs/007-windows-client/verification.md) 中适用的 Windows 实机项。

## Windows 本机发布

> GitHub Actions 当前只做检查，不生成安装包。正式 NSIS 产物在 Windows 本机生成。

```powershell
Copy-Item .env.production.example .env.production.local
# 编辑 .env.production.local，至少确认 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY

pwsh scripts/release-client-win.ps1
```

脚本会先执行 Hermes static contract，再 vendor Windows/Hermes runtime；常规 checks 覆盖 `typecheck`、`test`、`lint`、`lint:ds`、`codemod:ds:dry`、`doctor:win`、Rust `cargo check` 及 Hermes/workbench/plugin 专项，最后运行 `tauri:build:win`。产物在：

```text
apps\desktop\src-tauri\target\release\bundle\
```

发布前还要在 Windows 实机完成 `.exe` 安装、开始菜单启动、真实对话、Credential Manager、Office（如涉及）和卸载验证；仅生成 bundle 不算发布闭环。

## 单独调试模型网关

### 启动（Windows PowerShell）

```powershell
$line = (Select-String -Path .env -Pattern '^DEEPSEEK_API_KEY=' | Select-Object -First 1).Line
$env:DEEPSEEK_API_KEY = ($line -replace '^DEEPSEEK_API_KEY=', '').Trim().Trim('"').Trim("'")
$env:BLACKRAIN_GATEWAY_API_KEY = "local-debug-gateway"
$env:GW_PORT = "8899"
$env:STRIP_TOOLS = "0"
$env:GW_LOG = "$env:TEMP\blackrain-gateway.log"

python gateway\gateway.py
```

如果机器只提供 Python Launcher，把最后一行改成 `py gateway\gateway.py`。

### 健康与模型列表

`/health` 不鉴权；`/v1/*` 在设置了 `BLACKRAIN_GATEWAY_API_KEY` 后必须带 bearer：

```powershell
Invoke-RestMethod http://127.0.0.1:8899/health

$headers = @{
  Authorization = "Bearer $env:BLACKRAIN_GATEWAY_API_KEY"
}
Invoke-RestMethod http://127.0.0.1:8899/v1/models -Headers $headers
```

不要把 bearer、模型厂商 key 或完整请求日志粘进 PR、聊天或正式文档。

## 协议探针

探针目前位于 gitignored 的 `.scratch/`，不是仓库可重建的正式工具。只有本机文件确实存在时才运行；可复用结果必须写入对应 spec `verification.md`。

```powershell
$bin = (Resolve-Path codex-upstream\codex-rs\target\debug\codex-app-server.exe).Path
$workspace = (Get-Location).Path

python .scratch\m0_protocol_probe.py $bin $env:CODEX_HOME $workspace
python .scratch\m0_tool_driver.py $bin $env:CODEX_HOME $workspace
```

升级 codex 锁定版本后，必须在 Windows 上重跑适用探针；macOS 历史 PASS 不能替代 Windows MVP 证据。

## 日常 GitHub Flow

```powershell
git switch main
git pull --ff-only
git switch -c feat/我的功能

git add -p
git commit -m "feat: 一句话描述"
git push -u origin feat/我的功能
gh pr create

gh pr view <num>
gh pr merge <num> --squash --delete-branch

git switch main
git pull --ff-only --prune
```

分支 type 可用 `feat` / `fix` / `docs` / `refactor` / `chore` / `test`。`main` 禁止直推；合并需 1 approve + CI 绿。

## CodexMonitor subtree 同步

> 维护者动作，禁止在普通功能 PR 中顺手执行。

```powershell
git subtree pull --prefix apps/desktop `
  https://github.com/Dimillian/CodexMonitor main --squash
```

同步后按影响范围跑前端/Rust 检查，并在 Windows 实机验证 GUI、标题栏、Mica、对话和打包。

## post-MVP 非 Windows 参考

以下脚本是保留的历史开发资产，不属于当前发布和 CI 验收：

```bash
./scripts/dev-client.sh

cd apps/desktop
npm run doctor:strict
npm run tauri:dev
npm run tauri:build
```

这些命令在 macOS / Linux 上通过，只能说明相应平台代码路径；不能替代 Windows MVP 的 NSIS、Credential Manager、真实对话、Office 或安装/卸载验证。iOS 仅是上游壳资产，当前没有 BlackRain iOS 发布命令。
