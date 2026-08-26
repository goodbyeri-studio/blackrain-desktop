# BlackRain Desktop 代码地图

> Desktop 只有 Electron 生产路径。历史迁移不构成当前 API；当前职责以本页和仓库根 [架构](../../../docs/architecture.md) 为准。

## 入口

- Main：`electron/main/index.ts`
- Preload：`electron/preload/index.ts`
- Shared schema/API：`electron/shared/`
- Renderer：`src/main.tsx`、`src/App.tsx`
- Forge/Vite：`forge.config.ts`、`vite.main.config.ts`、`vite.preload.config.ts`、`vite.config.ts`

## Main 领域

- App Server：`electron/main/app-server/`
- Browser：`electron/main/browser/`
- IPC 注册：`electron/main/ipc/register-ipc.ts`
- Workspace：`electron/main/workspaces/`
- 文件：`electron/main/files/`
- Git：`electron/main/git/`
- Terminal：`electron/main/terminal/`
- Settings/credentials/update/system：`electron/main/` 下对应领域目录

Main 拥有进程、文件、窗口、权限、Browser、系统集成和生命周期；agent 状态仍由原装 app-server 拥有。

## Renderer

- 业务按 `src/features/<domain>/` 组织。
- `src/App.tsx` 只装配；复杂状态进入 hooks/bootstrap/orchestration。
- renderer 只调用 `src/services/desktop.ts` 暴露的宿主无关 typed client，不访问 Node、原始 IPC 或文件系统。
- App Server 与 Browser 事件经 main 标准化后由 `src/services/events.ts` 扇出。

## 修改合同

| 改动 | 必须同步 |
|---|---|
| 新增宿主 API | shared schema/host API、preload allowlist、main handler、renderer service、sender/ownership 测试 |
| App Server 方法/事件 | runtime transport、shared agent 类型、renderer 投影、fixture/协议测试 |
| Browser 能力 | main backend/registry、BlackRain/Codex adapter、IPC ownership、E2E；公共合同变化同时更新 `003` |
| 文件/Git/terminal | workspace path ownership、schema、错误映射、macOS 测试 |
| 发布资源 | runtime lock、License/NOTICE、Forge extraResource、package audit、verification |

## 验证

以仓库根 [开发文档](../../../docs/development.md) 为命令入口。所有生产改动至少运行 typecheck、目标测试、lint 和 `check:host-boundary`；跨 main/preload、App Server、Browser 或发布边界时扩大到对应 probe/package/smoke/E2E。
