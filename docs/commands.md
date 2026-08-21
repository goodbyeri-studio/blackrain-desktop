# BlackRain 日常与发布命令

> 本文件是 BlackRain Desktop 命令真源。当前生产宿主只有 Electron；MVP 仅发行 Windows x64。所有本机 PowerShell 命令必须由 `C:\Program Files\PowerShell\7\pwsh.exe` 执行，npm 使用 `npm.cmd`。

## 首次准备

```powershell
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion.Major'

Set-Location apps\desktop
npm.cmd install
Set-Location ..\..
```

预期 PowerShell major 为 `7`。Electron 开发需要 Git、Node.js 22 和 PowerShell 7；只有本地 Gateway 才额外需要 Python 3.10+。不需要 Rust/MSVC 来构建 Desktop。

## 锁定运行时

`codex-upstream/` 只作只读源码参考。发布资源使用官方 canonical Windows package 和 tracked lock，不从本机 debug build 拼装。

```powershell
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoLogo -NoProfile -File scripts\vendor-electron-codex-runtime.ps1 -Force
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoLogo -NoProfile -File scripts\vendor-electron-node-runtime.ps1 -Force

Set-Location apps\desktop
npm.cmd run electron:runtime:verify
npm.cmd run electron:node-runtime:verify
npm.cmd run electron:browser-client:verify
Set-Location ..\..
```

当前锁为 Codex `rust-v0.146.0`、Node `22.23.2` Windows x64，以及 tracked Browser adapter/client hash 和 License。生成态二进制保持 gitignored。

## 启动开发客户端

```powershell
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoLogo -NoProfile -File scripts\dev-client.ps1
```

脚本验证随包运行时后执行 `electron-forge start`。它沿用标准 Codex Home，不创建隐藏的 BlackRain 专属 Home。只想跳过已完成的本地 runtime 校验时可加 `-SkipRuntimeVerification`。

也可以直接运行：

```powershell
Set-Location apps\desktop
npm.cmd run electron:start
```

## 开发验证

```powershell
Set-Location apps\desktop

npm.cmd run typecheck
npm.cmd run test
npm.cmd run lint
npm.cmd run check:host-boundary

npm.cmd run electron:runtime:verify
npm.cmd run electron:node-runtime:verify
npm.cmd run electron:browser-client:verify
npm.cmd run electron:app-server:probe

npm.cmd run electron:package
npm.cmd run electron:package:audit
npm.cmd run electron:native-input:probe
npm.cmd run electron:smoke
npm.cmd run electron:e2e
```

`check:host-boundary` 是 final-mode Native Clean Gate，会扫描 renderer、Electron、资源、脚本、CI、README、package/lock 和仓库发布脚本；发现旧宿主 package/source/command/daemon/端口/安装器即 exit 1。

`electron:app-server:probe` 以隔离临时 Home 驱动 bundled `codex.exe app-server`，验证 initialize/thread/优雅退出和进程级标准 stdio Browser MCP。它不调用真实模型，不能替代登录、审批或恢复产品验收。

`electron:smoke` 和 `electron:e2e` 会重建 production package。E2E 覆盖 renderer 隔离、typed IPC、设置原生点击、main-owned Browser、OOPIF、locator/CUA、敏感操作确认、下载、file chooser、接管和 App restart recovery；测试 harness 不进入 packaged renderer。

## Browser 架构负向探针

```powershell
Set-Location apps\desktop
npm.cmd run electron:browser-runtime-seam:probe
```

该探针保留“锁定 code-mode V8 不能直接加载 Node/文件模块”的负向证据。`electron:browser-runtime-seam:gate` 按设计 exit 2，仅用于防止误把 V8 当 Node loader，不是 release gate；生产 gate 是 `electron:app-server:probe`。

## Unsigned MSIX

```powershell
Set-Location apps\desktop
npm.cmd run electron:make
```

输出：

```text
apps\desktop\out\electron\make\msix\x64\blackrain.msix
```

Forge 不覆盖已有 `x64` 目录；重跑前把旧目录移动到 `msix` 下的时间戳备份。`electron:make` 只证明 maker/资源/manifest，结论最多是 `RUN_PASS`。必须记录文件大小、SHA-256、manifest identity/publisher 和 `Get-AuthenticodeSignature` 状态。

## 正式签名候选

正式候选必须配置：

```text
BLACKRAIN_RELEASE_SIGNING=1
BLACKRAIN_RELEASE_PUBLISHER=<与证书 subject 完全一致>
BLACKRAIN_UPDATE_MANIFEST_URL=<HTTPS manifest URL>
BLACKRAIN_UPDATE_PUBLISHER=<与 release publisher 完全一致>
BLACKRAIN_UPDATE_PUBLIC_KEY=<更新 manifest 公钥>
WINDOWS_CERTIFICATE_FILE=<受控 PFX 绝对路径>
WINDOWS_CERTIFICATE_PASSWORD=<secret>
VITE_SUPABASE_URL=<账号服务 URL>
VITE_SUPABASE_ANON_KEY=<账号服务 anon key>
```

将这些值放入本机不提交的 `.env.production.local` 后运行：

```powershell
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoLogo -NoProfile -File scripts\release-client-win.ps1
```

脚本 vendor 锁定运行时，执行 typecheck/test/lint/Native Clean/App Server/smoke/E2E，并通过签名 fail-closed 的 `electron:make:release` 生成候选。仅需重建 unsigned 诊断制品时显式加 `-Unsigned`；它仍不能发布。

随后必须验证：

```powershell
Set-Location apps\desktop
$msix = (Resolve-Path 'out\electron\make\msix\x64\blackrain.msix').Path
signtool.exe verify /pa $msix
Get-AuthenticodeSignature -LiteralPath $msix
Get-FileHash -LiteralPath $msix -Algorithm SHA256
```

普通 PR runner 不持有证书。公开仓库当前不启用签名发布 workflow；签名构建应在受控 Windows runner 上按本节命令执行，使用临时 PFX 并在流程结束后删除。任何 artifact 仍必须经过下面的产品矩阵才能发布。

## 安装态验证

开发证书安装只用于内部产品复验，不代表可分发签名：

```powershell
Set-Location apps\desktop
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoLogo -NoProfile `
  -File scripts\msix-local-install-verification.ps1 `
  -MsixPath out\electron\make\msix\x64\blackrain.msix `
  -CertificatePath <公钥证书路径> `
  -ResultPath output\verification\msix-install-result.json
```

产品验收必须按 `.specs/002-electron-migration/tasks.md` 完成正式签名安装、登录/审批/恢复、Browser 真实站点/MFA、双用户 ACL、IME/DPI/多屏、升级/回滚/卸载、残留和性能矩阵。结束后卸载测试包并删除 Root/TrustedPeople 临时证书。

## 真实模型 Browser E2E

标准 Codex Home 已登录时可显式运行：

```powershell
Set-Location apps\desktop
$env:BLACKRAIN_ELECTRON_REAL_AGENT_E2E = '1'
node scripts\electron-e2e-supervisor.mjs
Remove-Item Env:BLACKRAIN_ELECTRON_REAL_AGENT_E2E
```

它使用现有登录态启动真实 thread/turn 并调用同一可见 `WebContentsView`，不会进入默认 CI，也不替代审批、真实站点和签名安装矩阵。

## 可选 Model Gateway

Gateway 是独立 sidecar，仅做模型协议翻译。需要单独调试时：

```powershell
$env:BLACKRAIN_GATEWAY_API_KEY = '<本机会话随机 bearer>'
$env:GW_PORT = '8899'
python gateway\gateway.py
```

不要把 bearer、模型厂商 key、Cookie、密码或完整网页正文写入日志、PR 或 spec。

## GitHub Flow

```powershell
git switch main
git pull --ff-only
git switch -c feat/短描述
git add -p
git commit -m 'feat: 一句话描述'
git push -u origin feat/短描述
gh pr create
```

`main` 禁止直接 push；CI 绿、review 通过后 Squash 合并并删除短命分支。
