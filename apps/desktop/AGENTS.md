# BlackRain Desktop Agent Guide

> **状态（2026-07-31）**：当前产品流程仍是 CodexMonitor 衍生的 Tauri + React + Rust 实现；迁移中的 Electron/Browser foundation 与 unsigned MSIX make 已通过 Windows CI，锁定 `codex-cli 0.146.0` runtime 的供应链、production package/smoke 和 initialize/dynamicTools 探针已在 Windows 本机通过，但尚未接入真实产品 thread 或替代 Tauri 主流程。迁移合同以仓库根 `.specs/012-electron-shell-migration/` 为准，Codex App 能力与 Browser 以 `.specs/013-codex-app-capability-parity/` 为准。

## 项目快照

BlackRain Desktop 只使用原装 `codex-rs` / `codex app-server` 作为 agent 内核。当前产品流程仍运行于 React/Vite + Tauri/Rust；`electron/` 已建立 M1 安全空壳、M2 stdio/JSONL transport、锁定 `codex-cli 0.146.0` Windows canonical package 供应链，以及 M3 中首个 main-owned `WebContentsView` host/UI/受限 CDP foundation。bundled runtime 的完整性、production package/smoke 和 initialize/dynamicTools 探针已通过，但尚未接入真实产品 thread、事件投影或真实模型 Agent 工具闭环。不得把 fixture、基础 UI、协议探针或合成 E2E foundation 通过写成 Electron 客户端已经可用。

目标宿主边界：

```text
Electron main       App Server client、窗口、Browser、权限、更新
Electron preload    类型化最小 IPC
React renderer      产品 UI 和前端状态
codex app-server    main 直接监管的机器入口；下接唯一 codex-core agent loop、工具、策略和 ThreadStore
Model Gateway       可选协议翻译 sidecar
```

## 不可违反的架构规则

1. 不修改、分叉或重写 `codex-rs` agent loop。
2. 不引入任何第二 agent runtime。
3. `src-tauri/src/shared/*` 与 daemon 是当前 Tauri 迁移输入；新增目标态能力按所有权进入 Electron main/preload/renderer 或原装 app-server，不再扩建永久 daemon。
4. 当前 Tauri App/daemon adapter 只作迁移输入；目标 Electron main 不重复实现 app-server 的 agent、工具、审批或持久化逻辑。
5. renderer 不接触 Node.js、原始 IPC、secret、App Server transport 或任意文件系统。
6. Browser 网页不加载 App preload；spec 013 证明需要时，只允许 main 固定路径、固定 hash、无网页全局暴露的专用 page preload。所有导航、权限、下载、弹窗和 CDP 由宿主集中控制。
7. 目标 Electron App 沿用 Codex 标准 Home 解析并与 CLI 共享配置、能力和可恢复 thread；不得自动派生 BlackRain 专属 `CODEX_HOME`。
8. bundled `codex.exe` 路径与 Codex Home 是两个独立配置域；切换二进制不得切换或复制 Home。
9. Gateway 只做模型协议翻译，不持有 thread、Browser 或 UI 状态；BlackRain 专属 provider/model 只用进程级 `-c` override，不写共享 `config.toml`。
10. provider secret/credit token 的规范副本进入系统凭据库；Gateway 运行时凭据桥放 BlackRain app-data 的专用目录，不进入 Codex Home。
11. Tauri -> Electron 迁移期兼容层必须带删除任务，不建立永久双宿主。
12. Browser 采用 main-owned `WebContentsView`、统一 registry、view retention/reparenting 和持久 profile；React 只控制侧边栏布局，不得另起 Playwright/headless agent browser。
13. Browser 工具按 Codex session/turn 绑定到唯一 main backend；dynamic tools 只作 bootstrap，生产 Browser client/transport 必须鉴权、有界并带删除临时 adapter 的闸口。

## 当前 Tauri 代码路由

迁移完成前，现有 Tauri 后端改动遵循：

1. shared core：`src-tauri/src/shared/*`
2. App command：`src-tauri/src/lib.rs` 及 adapter
3. 前端 IPC：`src/services/tauri.ts`
4. daemon RPC：`src-tauri/src/bin/blackrain_daemon/rpc.rs` 及 `rpc/*`

新增或修改命令必须同步所有相关层和测试，并在 spec 012 中登记迁移归属。Electron 建立后，新的宿主 API 不应继续扩张 `tauri.ts`。

## 前端规则

- `src/App.tsx` 只做装配。
- 状态编排放 `src/features/app/hooks/*`、`bootstrap/*`、`orchestration/*`。
- 当前 Tauri 调用集中在 `src/services/tauri.ts`；迁移目标是宿主无关 typed client。
- 事件扇出集中在 `src/services/events.ts`，Browser 事件也必须标准化后进入 UI。
- 复用 design-system 原语和 token，不复制 Codex App 闭源资源。

## 关键文件

- `src/App.tsx`：前端组合根
- `src/services/tauri.ts`：当前 Tauri IPC 包装
- `src/services/events.ts`：事件中心
- `src-tauri/src/lib.rs`：当前 App 命令注册
- `src-tauri/src/bin/blackrain_daemon.rs`：daemon 入口
- `src-tauri/src/bin/blackrain_daemon/rpc.rs`：daemon RPC 路由
- `src-tauri/src/shared/*`：跨宿主领域逻辑
- `src/features/threads/hooks/useThreadsReducer.ts`：thread 状态入口

## 线程不变量

- `setThreads` reconciliation 保留必要的 active/processing/ancestor anchors 和 incoming order。
- `hiddenThreadIdsByWorkspace` 优先，不能在 reconciliation 中复活隐藏 thread。
- `useThreadRows` 只有在 parent summary 可见时才把 child 放在 parent 下；缺 parent 时 child 提升为 root。

## 验证

- 前端：`npm run typecheck`、按改动范围运行 `npm run test`、`npm run lint`、`npm run lint:ds`；renderer 宿主依赖、Tauri command 或 Electron 迁移改动额外运行 `npm run check:host-boundary`。
- 当前 Rust：在 `src-tauri` 运行 `cargo check` 和目标测试。
- Electron：当前运行 `npm run electron:typecheck`、目标单测、`npm run electron:smoke`、`npm run electron:e2e` 和 `npm run electron:make`；App Server 改动额外运行 `npm run test -- --run electron/main/app-server`，并继续补 bundled codex 集成与 Windows MSIX 签名/安装/升级/卸载/恢复矩阵。
- Browser、真实对话、权限和 Windows 制品必须实机验收；macOS smoke 不能替代。

## 安全与 Git

- 保留无关用户改动，不 reset/revert/清理未授权文件。
- 修改前先看 `git status`、`git diff` 和对应 spec。
- 任何目标态文档必须标明未验证状态。
- 分支、PR、License 和主线纪律服从仓库根 `AGENTS.md`。
