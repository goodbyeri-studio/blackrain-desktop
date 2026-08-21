# BlackRain Desktop Agent Guide

Desktop 的生产宿主是 Electron，agent 能力来自原装 `codex.exe app-server`。当前代码和自动化检查不能替代正式签名 Windows 产品验收；公开范围、设计合同和发布层级见仓库根 `docs/`。

## 进程职责

```text
Electron main       App Server stdio client、窗口、Browser、权限、更新、系统能力
Electron preload    类型化最小 IPC allowlist
React renderer      产品 UI 和前端状态
codex app-server    thread/turn/tool/approval/ThreadStore 的唯一真源
Model Gateway       可选独立协议翻译 sidecar
```

## 不可违反的规则

1. 不修改、分叉或重写 `codex-rs` agent loop，不引入第二 agent runtime。
2. main 直接监管 bundled `codex.exe app-server`，只实现 stdio JSONL client、生命周期、权限边界和 UI 投影。
3. 使用标准 Codex Home，与 CLI 共享 config/auth/sessions/rollout/SQLite；不得创建隐藏的第二状态域。
4. renderer 不接触 Node.js、原始 IPC、secret、App Server transport 或任意文件系统，只使用 typed preload。
5. 所有 IPC 校验 schema、sender、window、workspace/thread、route 和 generation ownership。
6. Browser 页面不加载应用 preload；`WebContentsView`、session、权限、下载、CDP 和生命周期只由 main 持有。
7. Browser 发布态使用标准 stdio MCP、随包 Node adapter 和自有鉴权 transport；测试桥接不能成为第二生产路由。
8. Gateway 只做模型协议翻译，不持有 thread、Browser 或 UI 状态。
9. 不恢复旧宿主兼容层、固定 localhost、旧 command 名或 fallback；`check:host-boundary` 必须保持通过。
10. `plugins/`、`workbenches/` 的实验性内容不得未经设计和测试进入产品入口。

## 目录职责

- `electron/main/`：main 领域模块、App Server client、Browser backend 与 typed IPC handler。
- `electron/preload/`：最小 allowlist bridge。
- `electron/shared/`：main/preload/renderer 共享 schema 和类型。
- `src/`：React renderer；`src/App.tsx` 只做装配。
- `resources/`：锁定 Codex、Node、Browser client/adapter 的 manifest、license 和生成态资源。
- `scripts/`：Electron package、审计、probe、smoke 与 E2E。

事件扇出集中在 host event service；App Server 和 Browser 事件由 main 标准化后进入 renderer。文件、Git、终端、设置、凭据、通知、窗口、菜单、托盘、深链和更新属于 main 域。

## 线程不变量

- `setThreads` reconciliation 保留必要的 active/processing/ancestor anchors 和 incoming order。
- `hiddenThreadIdsByWorkspace` 优先，不能在 reconciliation 中复活隐藏 thread。
- `useThreadRows` 只有在 parent summary 可见时才把 child 放在 parent 下；缺 parent 时 child 提升为 root。

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
npm.cmd run electron:package:audit
npm.cmd run electron:native-input:probe
npm.cmd run electron:smoke
npm.cmd run electron:e2e
npm.cmd run electron:make
```

正式候选使用 `electron:make:release`，缺少签名/更新配置时必须 fail closed。真实站点、登录/MFA、审批、安装/升级/回滚/卸载和 Windows 输入/显示/恢复矩阵必须实机验收；unsigned 自动化不替代。

## Git 与安全

- 保留无关用户改动，不 reset/revert/清理未授权文件。
- 行为或公共边界变化时同步 `docs/architecture/`、`docs/design/` 或 `docs/adr/`。
- `main` 禁止直接 push；使用短命分支、Conventional Commits、CI 绿和 Pull Request review。
- 不得伪造 commit、签名、安装态或人工验收证据。
