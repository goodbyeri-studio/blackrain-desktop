# BlackRain Desktop

BlackRain Desktop 是面向 Windows 的开源 Electron Codex 客户端，直接使用上游 `codex.exe app-server`，并保持它是唯一 agent runtime。项目独立于 OpenAI，不复制闭源 Codex App 实现。

许可证、第三方归属、开源范围和当前发布边界见仓库根目录的 [README](../../README.md)、[NOTICE](../../NOTICE) 与 [项目范围](../../docs/project-scope.md)。

## 本地开发

要求 Windows 11 x64 和 Node.js `22.12.x`。

```powershell
npm.cmd ci
npm.cmd run electron:start
```

## 验证

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run lint
npm.cmd run check:host-boundary
npm.cmd run electron:runtime:verify
npm.cmd run electron:node-runtime:verify
npm.cmd run electron:browser-client:verify
npm.cmd run electron:app-server:probe
npm.cmd run electron:package
npm.cmd run electron:smoke
npm.cmd run electron:e2e
npm.cmd run electron:make:release
```

Windows 发布验收必须使用正式签名 MSIX，并记录产品矩阵。自动化 package/smoke 不能替代安装、升级、回滚、卸载、登录/MFA、输入法、DPI、多屏、睡眠恢复和崩溃恢复验收。详见[发布维护](../../docs/maintainers/release.md)。

## 架构

- `electron/main`：窗口、app-server 生命周期、Browser、文件、Git、终端、更新和系统权限。
- `electron/preload`：类型化 allowlist 宿主 API。
- `src`：不接触 Node.js 或原始 IPC 的 React renderer。
- `resources`：锁定的 Codex、Node 和 Browser client 发布资源。

产品边界和当前证据以仓库根[文档地图](../../docs/README.md)为准。
