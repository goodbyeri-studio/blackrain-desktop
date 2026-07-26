# 快捷命令行

> BlackRain 日常启动、构建、发布和通用验证命令的唯一真源。模块 README/runbook 只保留不重复的局部诊断或协议探针。除特别标注外，路径均以仓库根 `BlackRain/` 为基准。
> MVP 仅发行 Windows，主流程使用 PowerShell 7 (`pwsh`)；macOS / iOS 只作为 post-MVP 或上游资产。

## 目录

- [Windows 首次准备](#windows-首次准备)
- [拉取并对齐 CODE 内核](#拉取并对齐-code-内核)
- [构建 CODE 内核](#构建-code-内核)
- [启动 Windows 客户端](#启动-windows-客户端)
- [前端与 Rust 验证](#前端与-rust-验证)
- [GitHub Actions 与 self-hosted Windows](#github-actions-与-self-hosted-windows)
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

## 拉取并对齐 CODE 内核

### 有 POSIX shell：自动锁定入口

Git for Windows 自带 Git Bash 时，优先使用仓库脚本。脚本会 clone/fetch 精确 tag、校验 tag 解引用后的完整 SHA，并 detached checkout；上游有已跟踪改动时会 fail closed：

```powershell
sh scripts/fetch-references.sh
```

### 纯 PowerShell 回退：显式 clone + checkout

纯 PowerShell 环境没有 `sh` 时，Windows 构建/验证前使用下面的显式流程：

```powershell
if (-not (Test-Path codex-upstream)) {
  git clone --filter=blob:none https://github.com/openai/codex.git codex-upstream
}

if ((git -C codex-upstream rev-parse --is-shallow-repository) -eq "true") {
  git -C codex-upstream fetch --unshallow origin
}

git -C codex-upstream fetch origin --tags --prune
git -C codex-upstream checkout --detach 87db9bc18ba5bc82c1cb4e4381b44f693ee35623

git -C codex-upstream rev-parse --short HEAD
# 预期为 87db9bc18ba5bc82c1cb4e4381b44f693ee35623
```

目标锁定值与边界见 [REFERENCES](REFERENCES.md)。不要把本机 gitignored 克隆的 `HEAD` 当成仓库已完成状态。

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

Set-Location ..\..

# 与 Windows CI、正式发布入口完全相同的 Rust 检查
pwsh scripts/check-windows-rust.ps1

# Windows 专用入口
Set-Location apps\desktop
npm run doctor:win
npm run tauri:dev:win
npm run tauri:build:win

Set-Location ..\..
```

按改动范围选择命令：前端行为跑 typecheck/test/lint；共享 chrome/弹层额外跑 `lint:ds` 和 `codemod:ds:dry`；Rust 改动跑统一的 `check-windows-rust.ps1`。发布级结论还必须完成 [.specs/007 verification](../.specs/007-windows-client/verification.md) 中适用的 Windows 实机项。

## GitHub Actions 与 self-hosted Windows

CI 默认把 JS 检查放在 `ubuntu-latest`，Windows Rust 检查在未配置变量时回退到 `windows-latest`。Windows 开发机稳定在线后，可在仓库 `Settings -> Actions -> Runners -> New self-hosted runner` 注册 runner，并添加唯一自定义 label `blackrain-windows`；随后执行：

```bash
gh variable set WINDOWS_RUNNER --body blackrain-windows
```

此变量只切换 Rust job，不改变检查覆盖。需要临时恢复 GitHub-hosted Windows 时删除变量：

```bash
gh variable delete WINDOWS_RUNNER
```

self-hosted runner 只接受本仓库内的可信分支 PR；workflow 会跳过 fork PR 的 Windows job。runner 应使用非管理员专用服务账号，只开放构建目录，不复用日常登录账号，不保存 Supabase `service_role`、模型平台密钥、代码签名私钥或 EV USB token。开发机离线时，先删除 `WINDOWS_RUNNER`，否则 job 会排队等待而不会自动换回 hosted runner。

## Windows 本机发布

> GitHub Actions 当前只做检查，不生成安装包。正式 NSIS 产物在 Windows 本机生成。

```powershell
Copy-Item .env.production.example .env.production.local
# 编辑 .env.production.local，至少确认 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY

pwsh scripts/release-client-win.ps1
```

脚本会先 vendor Windows runtime；常规 checks 覆盖 `typecheck`、`test`、`lint`、`lint:ds`、`codemod:ds:dry`、`doctor:win` 及统一 Rust/workbench 检查，最后运行 `tauri:build:win`。产物在：

```text
apps\desktop\src-tauri\target\release\bundle\
```

发布前还要在 Windows 实机完成 `.exe` 安装、开始菜单启动、真实对话、Credential Manager、Office（如涉及）和卸载验证；仅生成 bundle 不算发布闭环。

签名方案拍板后，OV/EV 签名仍只在受控 Windows 机器或专用签名 runner 上执行。普通 PR runner 不持有长期 `.pfx`、私钥或 USB token。签名并验证 `Get-AuthenticodeSignature` 后记录 SHA-256，再创建 Draft Release 并上传已签名产物；人工确认安装矩阵前不得转为正式 Release。未来自动发布必须单独使用 GitHub Environment 人工审批，不得扩张现有 PR CI。

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
