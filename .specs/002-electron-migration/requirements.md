# Electron 全量迁移需求

> **事实状态纪律**：代码存在、运行验证和发布可交付始终分开记录。当前 Electron 基础与 Browser runtime 已存在并有自动化证据，但真实安装态仍为 `PRODUCT_FAIL`，不得据此声称迁移完成。

## 背景

- 2026-08-03 产品优先级切换为 Electron 全量迁移。Browser P0 的 runtime/功能闭环不再作为独立开发里程碑，后续只作为 Electron 产品回归矩阵的一部分。
- 当前完整产品流程仍依赖 React/Vite + Tauri/Rust；Electron 已具备安全 main/preload/renderer、bundled `codex.exe app-server`、workspace/thread/turn facade、Browser host 和部分 typed host API。
- 当前基线包含 194 个 Tauri command 和 59 个 renderer 直接 Tauri 依赖；迁移完成前不得新增未登记的直接依赖。
- 本机开发签名 MSIX 已能安装和通过 AUMID 首启，但安装态全页面无法点击，当前为发布阻塞。

## 用户目标

- 作为 Windows 桌面用户，只安装和运行 Electron BlackRain 即可完成项目、thread、审批、文件、Git、终端、设置、更新和 in-app browser 工作流。
- Electron 与原生 Codex CLI 共享标准 Codex Home、登录态、配置和可恢复 thread。
- Tauri runtime、BlackRain daemon、固定本地端口和兼容 adapter 最终从发布代码、依赖、脚本和 CI 中删除。

## 非目标

- 不修改或分叉 `codex-rs` agent loop，不引入第二 agent runtime。
- 不恢复工作台、Session Orchestrator、市场、OPC/工作室等暂停路线。
- 不把 Gateway 协议翻译并入 Electron main 或 renderer。
- 不复制 Codex App 的闭源代码、私有资源或协议实现。

## 成功标准

- 代码/配置存在：所有当前产品能力均归属 Electron main/preload/renderer、原装 app-server 或明确删除；renderer 不再直接依赖 Tauri 包。
- 运行验证：typecheck、单测、host boundary、App Server bundled probe、packaged smoke 和 Playwright Electron E2E 全部通过。
- 发布可用：签名 MSIX 完成安装、首启、核心工作流、升级、回滚、卸载和残留检查，结果写入 `verification.md`。
- 功能行为：项目、thread/turn、审批/停止/恢复、文件、Git、终端、设置、账户和 Browser 使用唯一状态源。
- 用户体验：安装态所有可见入口可操作；尚未迁移的能力不得以点击后失败的入口暴露。
- 安全：preload 只暴露类型化 allowlist，renderer 无 Node/原始 IPC，网页无 App preload/App Server transport，凭据使用系统安全存储。
- 性能/稳定性：Windows 启动、内存、GPU、终端、Browser 工作集和崩溃恢复达到已记录基线。

## 约束

- Windows 是唯一 MVP 发布平台；其他平台只能提供开发 smoke。
- Electron main 直接监管 bundled `codex.exe app-server`，agent 状态只来自 app-server。
- App 默认沿用标准 Codex Home；Electron app-state/browser-data 与 Codex Home 分离。
- 新宿主能力不得继续扩张 `src/services/tauri.ts`；兼容回退必须有删除任务。
- 依赖仅允许进入闭源 Desktop/Cloud 的兼容许可证范围。

## 开放问题

- [ ] 安装态全页面无法点击的根因是窗口 hit-test、材质层、透明覆盖层还是 MSIX 环境差异。
- [ ] Electron 更新通道、正式签名和回滚策略采用的生产基础设施。
- [ ] 终端采用 `node-pty` 后的 Windows helper、ConPTY 和签名资源清单。
