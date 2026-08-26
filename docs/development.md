# 开发与发布

命令以 `apps/desktop/package.json` 为准。当前开发机与产品优先级均为 macOS；历史 Windows 打包脚本不代表受支持的发布流程。

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

## macOS 发布

目标是签名和公证后的 macOS 应用，并在真实设备验收安装、首次启动、Codex 登录/MFA、Browser 权限与下载、崩溃恢复、升级、回滚和卸载。

仓库尚未提供可用于该目标的 macOS 打包、签名或公证流水线。任何 `electron:make`、MSIX、Windows 证据或 unsigned package 结果都不能声明 macOS `PRODUCT_PASS`。补齐 macOS 发行工程前，应先更新 package 配置、运行时锁、签名/公证方案、测试矩阵和本页。

## 上游更新

更新 `openai/codex` runtime 时，记录精确 commit/tag、回退点、runtime lock、许可证与 hash；阅读 app-server 协议和 schema 变化；然后重跑受影响的 probe、typecheck、test、lint、host-boundary、package、smoke 与 E2E。上游更新不得借由 fork 内核解决兼容问题。

## 安全与问题定位

不要提交或记录 token、Cookie、密码、用户项目、完整网页正文、签名材料或账号数据。app-server 启动失败先检查 `electron:runtime:verify` 和 `electron:app-server:probe`；Browser 异常先检查 window、route、profile 与 generation 日志，并确认页面未加载应用 preload。安全问题按 [SECURITY.md](../SECURITY.md) 私下报告。
