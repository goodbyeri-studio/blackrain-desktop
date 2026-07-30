# Electron 桌面壳迁移需求

> **状态（2026-07-29）**：P0，已按 Codex Desktop App 进程、协议和持久化调研重新设计；M0 迁移盘点、M1 Electron 安全空壳和 M2 App Server transport fixture 已实现，当前产品流程仍运行于 CodexMonitor 衍生的 Tauri 壳。目标架构和 fixture 通过不等于 Electron 客户端已经可用。

## 背景

BlackRain 的产品目标已经收敛为：以原装开源 `codex-rs` 为唯一 agent 内核，采用 Codex Desktop App 的 Electron/React/App Server 架构。2026-07-29 本机调研确认 Electron main 直接启动 bundled `codex.exe app-server`，通过 stdin/stdout JSONL 驱动双向协议，stderr 独立用于日志；thread、turn、item、工具、审批、沙箱和 ThreadStore 均留在 Rust 内核。Electron 迁移必须重建这套进程与协议边界，而不是保留 BlackRain 自定义 daemon 作为目标中间层。

## 用户目标

- 作为 BlackRain 用户，我能在一个稳定的 Windows 桌面 App 中使用 Codex 对话、项目、审批、终端、diff 和内置浏览器。
- 作为维护者，我能继续复用现有 React 前端，并通过明确的 main/preload/app-server 边界演进；现有 Rust daemon 只作迁移输入，app-server 已有能力不在 TypeScript 或 daemon 中重写。
- 迁移期间，任何里程碑都必须说明当前使用 Tauri 还是 Electron，不得把目标拓扑写成现状。

## 非目标

- 不修改、分叉或重新实现 `codex-rs` 的 agent 循环。
- 不在 Electron main 或 renderer 中实现第二套 agent 内核。
- 不以迁移为由同步建设工作台、Session Orchestrator、OPC 或专家市场。
- 不复制 OpenAI 闭源代码、私有资源或受限制素材。
- 不承诺迁移期间同时支持两个正式桌面运行时；Tauri 只作为过渡实现和回归参照。

## 成功标准

### 代码与合同

- Electron main、preload、renderer 和原装 app-server 有明确目录与进程所有权。
- renderer 无 Node.js 直通；所有特权操作通过类型化 preload allowlist。
- 现有 React 关键工作流在 Electron 中可运行。
- Electron main 直接启动 bundled `codex.exe app-server`，使用三根匿名管道连接 stdin/stdout/stderr。
- main 实现逐行 JSONL App Server client，覆盖双向 request/response/notification、initialize、订阅、取消、deadline、退出和恢复。
- App 默认沿用 Codex 标准 Home 解析和父进程显式 `CODEX_HOME`，与 CLI 共享 auth、配置、技能、插件和可恢复 thread；其他自定义绝对路径只作为用户主动选择的模式。
- bundled `codex.exe` 的安装路径与 Codex Home 独立；选择 BlackRain 自带二进制不得改变 Home 归属。
- rollout JSONL 与 SQLite 继续由原装 ThreadStore 管理，Electron 不直接改写 Codex 持久化文件。
- BlackRain 专属 Gateway provider/model 通过 app-server 进程级 `-c` override 注入，不持久写入共享 `config.toml`；provider secret/credit token 的规范副本进入系统凭据库，Gateway 临时文件只进入 BlackRain app-data。
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
- 固定 TCP 端口、未认证 named pipe、raw CDP 网络端点和 App Server transport 不进入 renderer 或网页权限域。
- 第三方依赖满足本仓闭源商业 License 边界。

## 约束

- MVP 仍以 Windows 为发布验收平台。
- BlackRain app-data 只保存 Electron/Browser/日志/制品等宿主状态，不得自动派生隐藏的第二个 Codex Home。
- 模型协议翻译继续留在独立 Gateway sidecar。
- 当前 Rust shared core/daemon 是迁移资产；目标态只保留报告确认的 Electron main/preload/renderer 与原装 app-server 边界。
- 保持现有 npm/`package-lock.json` 工作流；不得在迁移中无理由改用另一包管理器。
- Windows 工程使用 Electron Forge + Vite + TypeScript + MSIX maker；旧 Tauri NSIS 与 `electron-builder` 方向不进入目标发布链。
- 首个版本锁以调研快照 Electron `42.3.0`、Forge `7.11.1`、Vite `8.1.3`、TypeScript `5.9.3`、React `19.2.5` 和 codex `d06c7ac` 为候选；采用值必须经过 License、构建和 Windows 探针后落入 `verification.md`。
- 本 spec 的实施展开见 `docs/10-Electron迁移与内置浏览器实现计划.md`。

## 开放问题

- [ ] 确定签名证书、更新制品源、回滚保留策略和发布密钥管理。
- [ ] 确定 Tauri 正式删除闸口及最后一个可回退 tag。
- [ ] 用纵向切片测量 Electron + app-server + helper 进程的真实启动和内存成本。
