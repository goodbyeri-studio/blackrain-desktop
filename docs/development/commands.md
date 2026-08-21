# 开发命令

命令以 `apps/desktop/package.json` 为准。Windows 使用 PowerShell 7 和 `npm.cmd`。

## 安装与启动

```powershell
Set-Location apps/desktop
npm.cmd ci
npm.cmd run electron:start
```

首次打包前按 [上游参考](../reference/upstream-and-references.md) 准备锁定的 Codex/Node runtime；生成的 runtime 保持 gitignored。

## 日常检查

```powershell
Set-Location apps/desktop
npm.cmd run typecheck
npm.cmd run test
npm.cmd run lint
npm.cmd run check:host-boundary
```

## Electron 检查

```powershell
npm.cmd run electron:runtime:verify
npm.cmd run electron:node-runtime:verify
npm.cmd run electron:browser-client:verify
npm.cmd run electron:app-server:probe
npm.cmd run electron:package
npm.cmd run electron:package:audit
npm.cmd run electron:smoke
npm.cmd run electron:e2e
```

这些命令证明不同层级的代码或自动化状态，不能单独证明正式签名 Windows 产品可发布。真实登录、MFA、安装、升级、回滚和卸载必须在 Windows 目标矩阵中执行。

## Gateway

Gateway 是可选 sidecar，需要时从仓库根目录运行：

```powershell
$env:BLACKRAIN_GATEWAY_API_KEY = '<本机会话 bearer>'
$env:GW_PORT = '8899'
python gateway/gateway.py
```

不要把 secret 写进命令记录、日志或 Pull Request。
