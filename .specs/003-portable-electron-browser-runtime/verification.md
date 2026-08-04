# 可移植 Electron Browser Runtime 验证

> `CODE_EXISTS`、`RUN_PASS`、`PORTABILITY_PASS` 与 BlackRain `PRODUCT_PASS` 不互相替代。现有 BlackRain Browser E2E 只能证明产品纵向切片，不证明其他 Electron 项目可以低耦合二次开发。

## 当前验证矩阵

| 日期       | 等级          | 范围                               | 命令/证据                                                                                          | 结果                                                                                           | 剩余边界                                                                                      |
| ---------- | ------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 2026-08-04 | `CODE_EXISTS` | 现有 Electron Browser runtime 盘点 | 静态读取 `electron/main/browser`、shared contracts、preload、IPC、BrowserSidebar 和 `package.json` | `WebContentsView`、session、registry、CDP、policy、Agent backend、MCP/transport 和 UI 代码存在 | 仍与 BlackRain/Codex/IPC/UI 耦合，不是可移植源码底座                                          |
| 2026-08-04 | `CODE_EXISTS` | 初始抽象接缝                       | `BrowserAgentBackend`、typed browser host API、独立 browser 文件目录                               | 已有可复用接口和分层雏形                                                                       | 公共合同仍使用 thread/turn/route，manager 直接发送 BlackRain IPC                              |
| 2026-08-04 | `NOT_RUN`     | Lease/profile/activity 合同        | 尚无公共合同与负向测试                                                                             | 未验证                                                                                         | raw ID 仍是当前接口主键，尚未证明 opaque lease、单活动和跨 profile fail-closed                |
| 2026-08-04 | `NOT_RUN`     | 单 backend runtime identity        | 尚无 composition test                                                                              | 未验证                                                                                         | 静态目录盘点不能证明 IPC/MCP/bootstrap 注入同一 runtime instance                              |
| 2026-08-04 | `NOT_RUN`     | 最小外部 Electron consumer         | 尚无命令/fixture                                                                                   | 未验证                                                                                         | 未证明无 Codex/App Server/BlackRain UI 时可启动                                               |
| 2026-08-04 | `NOT_RUN`     | hermetic `PORTABILITY_PASS`        | 尚无仓库外独立验证命令                                                                             | 未验证                                                                                         | 未完成独立 manifest/lockfile、依赖安装、模块解析证据、source integration guide 和 Windows E2E |

## 当前代码证据

- `apps/desktop/electron/main/browser/browser-view-manager.ts` 创建并持有 `WebContentsView`、session、registry 和页面策略。
- `apps/desktop/electron/main/browser/browser-cdp-controller.ts` 提供 CDP、snapshot、locator、动作与截图基础。
- `apps/desktop/electron/main/browser/browser-dynamic-tool-adapter.ts` 已定义 `BrowserAgentBackend`，但同时引用 App Server RPC 并使用 thread/turn 语义。
- `apps/desktop/electron/shared/host-api.ts` 已提供 typed Browser API，但仍嵌在总 `BlackRainHostApi`。
- `apps/desktop/src/features/browser/components/BrowserSidebar.tsx` 证明 UI 与 native viewport 的布局接缝存在，但属于 BlackRain 产品 UI。
- `apps/desktop/electron/main/index.ts` 直接把 `BrowserViewManager` 注入 `AppServerRuntime`，说明当前生产接线仍是 BlackRain/Codex 专用。

## 已验证

- PowerShell 7 shell 环境已按仓库规则确认。
- 当前源码确实包含较完整的 Electron Browser runtime 和 Agent 控制纵向切片。
- 当前实现已有内部目录分层和 `BrowserAgentBackend` 接口，具备抽取基础。
- 当前 `BrowserRegistry` 会校验 owner webContents/window/window generation 与 thread/route/view generation；抽象后的 lease 合同不得降低这组校验。

## 尚未验证

- 公共 core 是否能完全移除 App Server、BlackRain IPC/Host API、thread/turn/route 和 React 依赖。
- owner/activity lease 是否只能由 main runtime 签发、绑定 profile/host generation，并拒绝 raw ID、伪造对象、旧 lease 和并发第二 activity。
- permission/download/file chooser/dialog/popup/external protocol/sensitive action 是否统一走显式 DecisionPort，并对超时、取消、重复、迟到和跨 origin 结果默认拒绝。
- 是否只有一条 runtime event stream，BlackRain IPC 和 reference renderer 不会收到重复或乱序的第二来源事件。
- BlackRain IPC、标准 stdio MCP 和测试/bootstrap adapter 是否注入同一 runtime identity；静态扫描不能替代该证明。
- 是否能在不启动 Codex/App Server 的最小 Electron 宿主中创建、控制和恢复页面。
- 自定义非 Codex Agent 是否能只通过公共合同完成 tool 调用。
- 抽取后 BlackRain 的登录态、同页控制、权限、下载、OOPIF、崩溃和恢复是否无回归。
- Windows 多窗口、DPI、多屏、IME、焦点、sleep/resume、资源和孤儿进程矩阵。
- 对外源码授权、NOTICE、版本策略和分发边界。

## 未来验证命令要求

以下现有命令在相关改动后继续执行，但不能单独构成 `PORTABILITY_PASS`：

```powershell
Set-Location apps/desktop
npm.cmd run electron:typecheck
npm.cmd run test
npm.cmd run check:host-boundary
npm.cmd run electron:package
npm.cmd run electron:e2e
```

reference host、contract test、composition identity、hermetic consumer 和 portability scan 的新命令必须在脚本真实加入仓库后再记录到本文件与 `docs/commands.md`。

最终 hermetic 命令必须创建在 BlackRain 仓库根目录之外的全新临时目录，使用独立 manifest/lockfile 安装依赖，并在执行前清除 `NODE_PATH` 等模块解析继承。仅在 `apps/desktop` 内编译 reference host、仅扫描禁止 import 或复用根 `node_modules`，结果一律不能标记为 `PORTABILITY_PASS`。

## `PORTABILITY_PASS` 证据模板

```text
日期 / Windows build / Electron 版本 / Git commit 与 worktree
仓库外 reference consumer 路径 / 临时目录 containment / 精确命令 / 日志和截图
独立 manifest/lockfile / fresh install / NODE_PATH 与父级 node_modules 隔离 / 模块解析结果
公共入口与 adapter 清单 / contract version 与 source revision/hash / 禁止 import 扫描 / 依赖闭包 / 第三方 License/NOTICE
本地 HTTP/HTTPS fixture / 启动 / 导航 / Cookie 伪登录 / Service Worker / snapshot / locator / input / screenshot / restart / cleanup
owner/activity lease 负向矩阵 / DecisionPort 拒绝矩阵 / 单 event stream / runtime identity composition test
非 Codex Agent adapter 结果 / 安全拒绝矩阵 / 性能与资源结果
对外授权状态（只记录，不作为技术 PASS 的替代或默认批准）
已知限制 / 结论：PASS 或 FAIL
```

## 判定规则

- `CODE_EXISTS`：公共入口、lease/port/schema、adapter、reference host 和测试代码存在；不推导运行通过。
- `RUN_PASS`：公共合同负向测试、Electron 集成、BlackRain composition identity 与既有回归通过；不推导仓库外可移植。
- `PORTABILITY_PASS`：在锁定 Electron `42.3.0` 的 Windows 环境完成仓库外 hermetic consumer 全矩阵，并保留可重放证据。
- 任一 lease/profile/generation 绕过、第二活动 backend、第二事件出口、隐式 workspace 依赖或默认允许安全决策都直接判定 `FAIL`。
- 未决对外 License 不把技术结果改写为 `FAIL`，但禁止把结果表述为公开 SDK、开源项目或可对外分发源码。

## 失败记录

暂无。
