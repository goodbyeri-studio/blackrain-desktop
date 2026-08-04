# 快捷命令行

> **状态（2026-08-04）**：本文件中的 `tauri:*`、Tauri Windows 和 NSIS 命令仅保留为迁移期输入，不是最终发布路线。Electron 原生重建完成后，日常命令、发布命令和用户文档必须只保留 Electron；最终 release package、生产源码和脚本不得含 Tauri 残留。当前 Electron 安装态全页面原生点击仍为 `PRODUCT_FAIL`，不能作为可发布客户端。

> BlackRain 日常启动、构建、发布和通用验证命令的唯一真源。模块 README/runbook 只保留不重复的局部诊断或协议探针。除特别标注外，路径均以仓库根 `BlackRain/` 为基准。
> MVP 仅发行 Windows，主流程使用 `C:\Program Files\PowerShell\7\pwsh.exe`；macOS / iOS 只作为 post-MVP 或上游资产。

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

Set-Location apps\desktop
npm.cmd install
Set-Location ..\..
```

Electron/JS 和 Gateway 日常开发需预先安装 Git、Node.js 22、Python 3.10+ 与 PowerShell 7，不要求安装完整 Visual Studio。

只有需要在本机编译 `codex-rs`、当前 Tauri Rust 后端或 NSIS 时，才额外需要 Rust stable、CMake、LLVM 和 MSVC C++ 构建工具：

```powershell
winget install Kitware.CMake LLVM.LLVM
# 或：choco install cmake llvm

Set-Location apps\desktop
npm.cmd run doctor:win
Set-Location ..\..
```

`npm.cmd run doctor:win` 只检查 CMake/LLVM，不检查 MSVC linker，也不代表 GUI、Office 或 NSIS 已验证。活跃 GitHub Actions 不再执行 Windows Rust 检查；需要验证时必须在装有完整工具链的 Windows 本机运行统一脚本：

```powershell
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoLogo -NoProfile -File scripts\check-windows-rust.ps1
```

本机没有 MSVC 时不得把未运行写成通过；Linux CI 也不替代 Tauri GUI、NSIS 或 Windows 实机验收。

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
git -C codex-upstream checkout --detach e363b08c9175ac1cbe5893615dd2cb9ddf95043b

git -C codex-upstream rev-parse --short HEAD
# 预期为 e363b08c9175ac1cbe5893615dd2cb9ddf95043b
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

脚本会加载 `.env`、检查 `codex.exe` / Python / cmake / `node_modules`、生成 `.scratch\dev-codex-home\config.toml`、启动带本地 bearer 的 Gateway，再执行 `npm.cmd run tauri:dev:win`。Ctrl-C 退出时会停止脚本启动的 Gateway。

该命令会打开 GUI，必须在有显示器的 Windows 本机运行，不能用 SSH/无头结果代替实机验证。

## 前端与 Rust 验证

```powershell
Set-Location apps\desktop

npm.cmd run typecheck
npm.cmd run test
npm.cmd run lint
npm.cmd run lint:ds
npm.cmd run check:host-boundary
npm.cmd run codemod:ds:dry

Set-Location ..\..

# 与 Windows CI、正式发布入口完全相同的 Rust 检查
pwsh scripts/check-windows-rust.ps1

# Windows 专用入口
Set-Location apps\desktop
npm.cmd run doctor:win
npm.cmd run tauri:dev:win
npm.cmd run tauri:build:win

Set-Location ..\..
```

按改动范围选择命令：前端行为跑 typecheck/test/lint；共享 chrome/弹层额外跑 `lint:ds` 和 `codemod:ds:dry`；desktop renderer、Tauri command 或 Electron 迁移改动额外跑 `check:host-boundary`；Rust 改动跑统一的 `check-windows-rust.ps1`。Electron 发布级结论必须完成 [002 verification](../.specs/002-electron-migration/verification.md) 中适用的 Windows 实机项，并按 [09](09-运行时架构与里程碑.md) 的全量发布判定执行。

Windows 文档命令统一在 PowerShell 7 中执行；为避免 `npm.ps1` 执行策略差异，下面的 npm 命令应写成 `npm.cmd`。涉及 PowerShell 脚本时使用仓库规定的 `C:\Program Files\PowerShell\7\pwsh.exe -NoProfile`。

### Electron 迁移开发验证

```powershell
Set-Location apps\desktop

npm.cmd run electron:typecheck
npm.cmd run test -- --run electron
npm.cmd run electron:browser-client:verify
npm.cmd run electron:browser-runtime-seam:probe
npm.cmd run electron:browser-runtime-seam:gate
npm.cmd run electron:runtime:check-lock
npm.cmd run electron:node-runtime:check-lock
npm.cmd run electron:node-runtime:verify
npm.cmd run electron:app-server:probe
npm.cmd run electron:package
npm.cmd run electron:smoke
npm.cmd run electron:e2e
npm.cmd run electron:make
npm.cmd run test -- --run electron/main/app-server

Set-Location ..\..
```

`electron:smoke` 的 prehook 会先重新生成 `out/electron/codex-monitor-win32-x64` production package，再运行带 production fuses 的真实制品。`electron:e2e` 的 prehook 会重建同一 package 并安装 Electron runtime，再由 Playwright 驱动开发 Electron 加载 production bundles，验证自定义协议、renderer Node 隔离、typed preload、IPC 布局 revision、外部导航、popup 拒绝，以及通过仅开发态 main harness 对同一可见 Browser page 执行顶层与跨站 OOPIF snapshot/type/click/screenshot、敏感购买单次确认/拒绝、实际下载、用户 file chooser、接管和 App restart recovery。该 harness 不进入 renderer 且 packaged 强制禁用；E2E 仍不等于真实站点、签名或安装验收。当前 `electron:start` dev runner 仍需在锁定 Node 22 环境复核。

`electron:browser-client:verify` 校验自有 Browser MCP adapter/client 的固定版本、protocol、License 和 SHA-256；`electron:node-runtime:verify` 校验随包 Node.js 22 Windows x64 的版本、archive/逐文件摘要与 MIT License。`electron:package` 会先执行 Codex、Node 和 Browser 三组 gate。当前标准 stdio MCP 生产接缝、唯一 adapter 切换、同用户无/错/旧 token/generation 拒绝和真实模型 MCP screenshot turn 已通过；仍缺另一个真实 Windows 用户账户的 named pipe ACL 拒绝探针。该探针必须使用两个不同本地用户 SID，记录 pipe owner、拒绝错误、token/generation 摘要和 teardown 结果。威胁模型不声称抵御能够读取同用户进程内存或环境的恶意代码。

`electron:browser-runtime-seam:probe` 直接驱动锁定 Windows `codex-code-mode-host.exe` 的 protocol v1，保留“V8 不能加载 Node/文件模块”的负向证据。`supported=false` 只否定 V8 直载方案，不再是 release gate；生产接缝由 `electron:app-server:probe` 的标准 stdio MCP 实制品测试判定。`electron:browser-runtime-seam:gate` 仅供防止误把 V8 当 Node loader 的架构回归，当前按设计 exit 2。

CI 已先执行一次 `electron:package`，所以用 `npm --ignore-scripts run electron:smoke` 和 `npm --ignore-scripts run electron:e2e` 复用该 package，并在 E2E 前显式执行 `electron:install-runtime`。CI 虚拟桌面不保存 renderer `page.screenshot()`；Browser tool 返回的 viewport PNG 仍由 E2E 断言。本地 E2E 会额外写入 `apps/desktop/output/playwright/electron-browser-sidebar.png`。

`electron:make` 生成未签名的 Windows x64 foundation MSIX，只证明 Forge maker 能完成基础制品生成；该命令不要求生成态 runtime。`electron:make:release` 才要求锁定的 Codex package 完整存在，但仍不代表 MSIX 已签名或通过安装、升级、回滚和卸载验收。Forge 不覆盖已有 `out/electron/make/msix/x64`；重跑前应把旧目录移动到同级时间戳备份，禁止直接删除未归档制品。MVP 更新采用签名 MSIX/App Installer 包链，UpdateManager 只下载 staging 包、校验 manifest/publisher/hash 并交给 Windows 安装器，不覆盖运行中文件；失败时保留当前版本可启动，并用上一版签名包重新安装回滚。

本机开发签名安装只用于产品验收，不得作为发布签名。MSIX 必须先由 subject 与 manifest publisher 完全一致的代码签名证书签名，并通过 `signtool verify /pa`。随后在管理员 PowerShell 7 中运行：

```powershell
Set-Location apps\desktop
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoProfile `
  -File scripts\msix-local-install-verification.ps1 `
  -MsixPath out\electron\make\msix\x64\codex-monitor.msix `
  -CertificatePath out\electron\make\msix\x64\BlackRain-local-verification.cer `
  -ResultPath output\verification\msix-install-result.json
```

该脚本只导入公钥证书到本机 `Root`/`TrustedPeople` 并安装固定 identity `cc.goodbyeri.blackrain`；不负责创建或保存私钥，也不代表签名链适合分发。验收结束必须卸载测试包并删除本机与当前用户证书库中的临时证书。本轮 2026-08-03 安装已成功，签名私钥已从 `CurrentUser\My` 删除；测试包和公钥信任条目暂留供后续复现。用户人工确认整个页面仍无法点击，后续矩阵必须先修复该阻塞再重跑。

`npm.cmd run test -- --run electron/main/app-server` 覆盖 Electron main 的 stdio/JSONL transport、initialize client 与进程 supervisor，包含真实 Node 子进程 fixture；默认不会启动外部 Codex。`npm.cmd run electron:app-server:probe` 是 Windows x64 显式集成探针：它按 tracked lock 校验 bundled `codex.exe`，串行使用隔离 Codex Home 跑 initialize/thread/优雅退出，并通过进程级 `-c` 注册 Browser stdio MCP，验证 MCP ready/tool discovery、`mcpServer/tool/call`、可信 `_meta` 透传和同一 backend 命中。该命令不调用模型，不能替代真实 turn、审批或恢复验收。

本机标准 Codex Home 已登录时，可显式运行真实模型 Browser 共页 E2E：

```powershell
$env:BLACKRAIN_ELECTRON_REAL_AGENT_E2E = "1"
node scripts/electron-e2e-supervisor.mjs
Remove-Item Env:BLACKRAIN_ELECTRON_REAL_AGENT_E2E
```

该用例启动 bundled `codex-cli 0.146.0` 的真实 thread/turn，让模型调用 `blackrain_browser.screenshot` 操作同一可见 `WebContentsView`，并验证控制权释放和页面/App 重启恢复。命令会使用标准 Codex Home 的现有登录态，只能由开发者显式运行，不进入默认 CI，也不替代审批、真实站点或安装矩阵。

### Electron Codex runtime

源码与 Windows release package 锁见 `docs/REFERENCES.md` 和 `apps/desktop/resources/codex/runtime-lock.json`。生成的二进制不进入 Git；在仓库根使用 PowerShell 7 下载并校验官方 canonical package：

```powershell
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoProfile -File scripts/vendor-electron-codex-runtime.ps1
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoProfile -File scripts/vendor-electron-node-runtime.ps1

Set-Location apps\desktop
npm.cmd run electron:runtime:verify
npm.cmd run electron:node-runtime:verify
npm.cmd run electron:app-server:probe
npm.cmd run electron:make:release
Set-Location ..\..
```

Codex vendor 按 tracked lock 验证 archive、`codex-package.json`、EXE/helper、License/NOTICE 摘要与 Authenticode；Node vendor 验证官方 `nodejs.org` archive、`node.exe` 版本/摘要和 MIT License。两者生成审计 manifest。`electron:package` 与 `electron:make:release` 会重新以 lock 校验实际文件，缺失或不一致时 fail closed。

若要验证 runtime lock 之外的本地公开 `codex.exe`，仍可用显式临时 Home 运行底层探针，避免污染共享 Home：

```powershell
$env:BLACKRAIN_CODEX_BIN = "C:\absolute\path\to\codex.exe"
$env:BLACKRAIN_CODEX_PROBE_HOME = (Resolve-Path ..\..\.scratch).Path + "\electron-codex-probe-home"
npx vitest run electron/main/app-server/real-app-server-probe.test.ts
```

这两个环境变量只用于测试；正式打包版拒绝 `BLACKRAIN_CODEX_BIN` 覆盖，只解析 `resources\codex\windows-x64\bin\codex.exe`。

## GitHub Actions 与 self-hosted runner

活跃 CI 只保留 `js-checks` 和 `gateway-checks`，优先使用 `LINUX_RUNNER` 指向的受信 Linux self-hosted runner，未配置时回退 `ubuntu-latest`。Windows Electron/MSIX 和 Rust job 已从活跃 workflow 移到 `.github/workflows-disabled/windows-ci.yml` 冻结存档；GitHub Actions 不加载该目录，因此 PR 不会创建 Windows check。

`changes`、`js-checks` 和 `gateway-checks` 读取 `LINUX_RUNNER`；当前共享 CI 主机的 BlackRain 独立 runner label 为 `blackrain-linux`。配置或恢复 Linux 路由：

```powershell
gh variable set LINUX_RUNNER --body blackrain-linux
```

self-hosted runner 只接受本仓库内的可信分支 PR；`changes` 会在 fork PR 跳过，从入口阻止 Linux self-hosted job 执行。runner 应使用非管理员专用服务账号和独立 runner/work 目录，不保存 Supabase `service_role`、模型平台密钥、代码签名私钥或 EV USB token。对应主机离线时，先删除 `LINUX_RUNNER`，否则 job 会排队等待而不会自动换回 hosted runner。

## Windows 本机发布

> 当前产品发布基线仍是 Tauri NSIS，并在 Windows 本机生成。Electron 是迁移目标；GitHub Actions 会生成 unsigned MSIX 做构建验证，但不上传或发布该制品。

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

Electron unsigned MSIX 的本机验证命令为：

```powershell
Set-Location apps\desktop
npm.cmd run electron:make
Set-Location ..\..
```

当前输出为 `apps\desktop\out\electron\make\msix\x64\codex-monitor.msix`。普通 `electron:make` 的 foundation 制品未签名、未安装且不保证带 runtime；携带 runtime 的候选必须改用 `electron:make:release`。两者都不替代 `002-electron-migration/verification.md` 要求的制品与产品检查；安装、升级、回滚和卸载是当前 Electron P0 的发布闸口。

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
