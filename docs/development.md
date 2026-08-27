# 开发与发布

命令以 `apps/desktop/package.json` 为准。当前开发机与产品优先级均为 macOS；历史 Windows 打包脚本不代表受支持的发布流程。

## Node 版本

仓库锁定 Node 22.23.2（`mise.toml` / `.node-version` / `.nvmrc`，与 `engines`、CI 及 `resources/node-runtime/runtime-lock.json` 一致）。用 mise 的贡献者首次进入仓库需要 `mise trust` 后再 `mise install`；nvm / fnm / nodenv / asdf 由 `.node-version`、`.nvmrc` 覆盖。

Browser transport 的 Unix socket 端点受 `sun_path` 上限约束（macOS 104 字节）。端点文件名已压缩到预算内，并在超限时显式报错，因此常规开发不需要设置 `TMPDIR`。若把 `TMPDIR` 指向异常长的路径，会得到一条指明字节数的明确错误，而不是 `listen EINVAL` 或静默截断。

## 本地开发

```sh
cd apps/desktop
npm ci
npm run electron:start
npm run typecheck
npm run test
npm run lint
npm run check:host-boundary
```

涉及锁定 runtime、Browser 或打包时，再按需执行：

```sh
npm run electron:runtime:verify
npm run electron:node-runtime:verify
npm run electron:browser-client:verify
npm run electron:app-server:probe
npm run electron:package
npm run electron:smoke
npm run electron:e2e
```

修改 Markdown 后从仓库根目录执行：

```sh
node scripts/check-doc-links.mjs
git diff --check
```

## Runtime vendoring

`codex app-server` 与 Browser MCP 用的 Node 都是 vendored 上游制品，不入库（见 `.gitignore`），首次开发前需要拉取：

```sh
cd apps/desktop
npm run electron:runtime:vendor        # codex，约 120MB
npm run electron:node-runtime:vendor   # Node 22.23.2，约 50MB
npm run electron:runtime:verify
npm run electron:node-runtime:verify
```

版本、下载地址、SHA-256 和签名身份全部锁定在 `resources/*/runtime-lock.json`；vendor 脚本会逐个文件核对摘要，并把 macOS 的 codesign Developer ID 身份写入 `runtime-manifest.json` 供 verify 比对。当前只 vendored `darwin-arm64`——Intel Mac 会得到明确的架构错误，而不是运行时失败。

Windows 的 `*:vendor:win`（PowerShell）随 Windows 暂停开发一并搁置，见下节。

## macOS 发布

目标是签名和公证后的 macOS 应用，并在真实设备验收安装、首次启动、Codex 登录/MFA、Browser 权限与下载、崩溃恢复、升级、回滚和卸载。

已经可用：`electron:package` 能在 macOS arm64 产出 `.app`，包内 codex 二进制可执行；`electron:app-server:probe` 能启动 bundled app-server、建 thread 并优雅退出。

仍然缺失：`forge.config.ts` 没有 macOS maker，签名与公证流水线尚未建立（需要 Apple Developer Program 会员、Developer ID Application 证书和公证凭据）。因此 `electron:make` 与任何 unsigned package 结果都**不能**声明 macOS `PRODUCT_PASS`；当前仓库仍然没有 `PRODUCT_PASS`。

## Windows（暂停开发，不发行）

Windows 客户端当前**暂停开发、不构建、不发行**，列为 TODO 而非近期承诺。相关资产被刻意保留而非删除，以便将来恢复时不需重做：

| 资产 | 状态 |
| --- | --- |
| `resources/*/runtime-lock.json` 的 `windows-x64` 条目 | 保留，仍受 `--lock-only` 结构校验 |
| `electron:runtime:vendor:win`、`electron:node-runtime:vendor:win` | 保留（PowerShell，需 `pwsh`） |
| `forge.config.ts` 的 `MakerMSIX` | 保留；它目前是唯一 maker，移除会让 `makers` 变空 |
| `audit-electron-package.mjs` 的 `--require-msix` | 保留（依赖 `tar.exe`，仅 Windows 可跑） |
| `scripts/*.ps1` | 保留 |

CI 不再跑 Windows 检查（见 `.github/workflows/ci.yml`）。恢复 Windows 前需要重新验证上述全部资产，并补回对应的 CI 覆盖。

## 上游更新

更新 `openai/codex` runtime 时，记录精确 commit/tag、回退点、runtime lock、许可证与 hash；阅读 app-server 协议和 schema 变化；然后重跑受影响的 probe、typecheck、test、lint、host-boundary、package、smoke 与 E2E。上游更新不得借由 fork 内核解决兼容问题。

## 安全与问题定位

不要提交或记录 token、Cookie、密码、用户项目、完整网页正文、签名材料或账号数据。app-server 启动失败先检查 `electron:runtime:verify` 和 `electron:app-server:probe`；Browser 异常先检查 window、route、profile 与 generation 日志，并确认页面未加载应用 preload。安全问题按 [SECURITY.md](../SECURITY.md) 私下报告。
