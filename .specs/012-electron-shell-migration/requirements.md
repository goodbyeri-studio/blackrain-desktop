# Electron 桌面壳迁移需求

> **状态（2026-07-27）**：P0，已根据 Codex App 本机研究重新设计，尚未开始实现。当前可运行代码仍是 CodexMonitor 衍生的 Tauri 壳；目标架构存在于本 spec 不等于 Electron 客户端已经可用。

## 背景

BlackRain 的产品目标已经收敛为：以原装开源 `codex-rs` 为唯一 agent 内核，高度对齐官方 Codex App 的核心桌面功能和可观察 Browser 控制面。三份 2026-07-26 本机研究稿确认了共享页面、registry、隐藏运行、持久 profile、Browser client/RPC 和 CDP 等关键职责；BlackRain 使用 main-owned `WebContentsView` 实现这些能力。Electron 迁移必须承载这套宿主能力，而不是只把现有 Tauri UI 换一个启动器。

## 用户目标

- 作为 BlackRain 用户，我能在一个稳定的 Windows 桌面 App 中使用 Codex 对话、项目、审批、终端、diff 和内置浏览器。
- 作为维护者，我能继续复用现有 React 前端和 Rust 领域逻辑，通过明确的 main/preload/daemon 边界演进，而不是把 Rust 业务逻辑重写进 TypeScript。
- 迁移期间，任何里程碑都必须说明当前使用 Tauri 还是 Electron，不得把目标拓扑写成现状。

## 非目标

- 不修改、分叉或重新实现 `codex-rs` 的 agent 循环。
- 不在 Electron main 或 renderer 中实现第二套 agent 内核。
- 不以迁移为由同步建设工作台、Session Orchestrator、OPC 或专家市场。
- 不复制 OpenAI 闭源代码、私有资源或受限制素材。
- 不承诺迁移期间同时支持两个正式桌面运行时；Tauri 只作为过渡实现和回归参照。

## 成功标准

### 代码与合同

- Electron main、preload、renderer 和 Rust daemon 有明确目录与进程所有权。
- renderer 无 Node.js 直通；所有特权操作通过类型化 preload allowlist。
- 现有 React 关键工作流在 Electron 中可运行。
- Rust daemon 托管原装 `codex app-server`、专属 `CODEX_HOME` 和已有共享领域逻辑。
- Electron main 启动 daemon，daemon 启动 app-server；两段连接都支持双向 request/response/notification、取消、deadline 和重启 generation。
- Browser 采用 spec 013 定义的 main-owned `WebContentsView` + registry/session/CDP，不建立独立 headless agent browser。
- Tauri 专属调用逐项迁移后删除，不长期维护双宿主分叉。

### Windows 验收

- 安装、首启、升级、卸载和异常恢复通过 Windows 实机验证。
- 真实 Codex thread 可创建、流式运行、审批、停止、恢复和归档。
- in-app browser 纵向切片通过 spec 013 的验收。
- 冷启动、空闲内存、运行中内存和多浏览视图资源有可复测基线。

### 安全与合规

- `contextIsolation` 开启，renderer 默认 `nodeIntegration: false`。
- `webviewTag` 保持关闭；Browser view 只由 main 创建，页面 WebContents 强制 sandbox、Node off、context isolation、web security 和无 App preload。
- 导航、弹窗、权限、下载和外部协议均有集中策略。
- main 对 Browser 创建、布局、迁移和每个 Browser API request 执行 sender window、thread、route、view generation、profile 和 ownership 校验。
- 浏览内容与应用 chrome 使用隔离的 page WebContents/session；不向任意网页暴露应用 preload。
- 固定 TCP 端口、未认证 named pipe、raw CDP 网络端点和 daemon token 不进入生产架构。
- 第三方依赖满足本仓闭源商业 License 边界。

## 约束

- MVP 仍以 Windows 为发布验收平台。
- App 继续使用应用数据目录内的专属 `CODEX_HOME`，不读写用户 `~/.codex`。
- 模型协议翻译继续留在独立 Gateway sidecar。
- 当前 Rust shared core 是迁移资产；Electron main 负责宿主编排，不吸收领域实现。
- 保持现有 npm/`package-lock.json` 工作流；不得在迁移中无理由改用另一包管理器。
- 本 spec 的实施展开见 `docs/10-Electron迁移与内置浏览器实现计划.md`。

## 开放问题

- [ ] 确定签名证书、更新制品源、回滚保留策略和发布密钥管理。
- [ ] 确定 Tauri 正式删除闸口及最后一个可回退 tag。
- [ ] 用纵向切片测量 Electron + Rust daemon 的真实启动和内存成本。
