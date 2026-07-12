# Requirements

> **事实状态纪律**：本 spec 定义 Hermes WORK surface 的长期完整闭环。当前仓库尚无 Hermes 进程纳管、Tauri WORK surface 或 Windows 产品 E2E；目录和任务清单存在不等于代码存在，macOS 开发验证不等于 Windows 发布可用。

## 背景

BlackRain 已将产品第一入口定为工作台、项目和任务。普通及专家工作台默认由 Hermes 执行，软件开发工作台进入 codex。但当前 Git 跟踪实现仍主要是 CODE/codex 壳：Hermes 只有独立 spike，没有 App 内子进程、配置、HTTP/SSE 客户端和用户可见 WORK surface。

这造成产品定位与实现倒挂：BlackRain 想交付“可安装的专家数字工作环境”，却没有承载这些环境的默认执行界面。本 spec 将该缺口拆成可持续执行、可分阶段验证的长期任务。

相关真源：

- 双引擎边界：[spec 003](../003-dual-engine-architecture/)
- Windows 发布验收：[spec 007](../007-windows-client/)
- 工作台包和生命周期：[spec 008](../008-expert-workbench-package/)
- 产品形态：[docs/04](../../docs/04-产品形态.md)
- 运行时拓扑：[docs/09](../../docs/09-运行时架构与里程碑.md)
- 桌面壳契约：[apps/desktop/AGENTS.md](../../apps/desktop/AGENTS.md)
- Hermes 锁定版本：v2026.7.7.2 / `9de9c25f620ff7f1ce0fd5457d596052d5159596`

## 用户目标

### 工作台使用者

- 作为安装 Office 或其他专家工作台的普通用户
- 想从工作台创建项目和任务，直接让 AI 使用预装环境完成工作
- 成功后不需要理解 Hermes、Python、MCP、模型 provider、端口或配置文件

### 工作台作者

- 作为把专家电脑环境封装成工作台的作者
- 想让工作台声明的 Skills、插件、环境和项目路径可靠映射到 WORK 执行器
- 成功后同一版本工作台能在干净 Windows 环境复现相同任务入口和运行能力

### 平台维护者

- 作为 BlackRain 维护者
- 想在不修改 Hermes Agent loop 的前提下，由 Tauri App 安全纳管 Hermes 黑盒
- 成功后能诊断启动、配置、协议、模型、审批、工具、会话、崩溃和退出清理问题

## 核心用户流程

```text
选择/安装工作台
  → 创建或打开用户项目
  → Core 激活工作台并选择 WORK surface
  → App 确保 Hermes 已配置且健康
  → 用户创建任务并发送目标
  → Hermes /v1/runs 执行
  → UI 流式展示消息、推理状态、工具、审批和文件结果
  → 用户可停止、恢复、重试或继续任务
  → 结果留在用户项目，工作台和 Hermes 可安全停用
```

## 功能需求

### R1：Hermes 黑盒进程纳管

- App 使用锁定的官方 Hermes 制品，不修改或 fork Agent loop。
- Windows 产品包使用内嵌 Python + 预构建 venv；不要求普通用户安装 Python、uv 或 Node。
- Hermes 前台子进程由 App 启动、持有、监控、终止和回收，不交给 systemd/launchd 或独立常驻服务。
- 支持启动中、健康、降级、崩溃、停止和需要修复等明确状态。
- 处理端口冲突、过期 PID、重复启动、异常退出、App 强退和系统休眠恢复。

### R2：隔离配置与凭据

- Hermes 使用 App data 下独立 `HERMES_HOME`，不默认读写用户 `~/.hermes`。
- App/Core 是唯一写 `$HERMES_HOME/config.yaml` 和运行 `.env` 的主体。
- `API_SERVER_KEY` 使用高熵随机值；模型密钥和平台 token 进入系统凭据存储或受控临时注入，不进入日志、Manifest 或用户项目。
- API Server 只监听 `127.0.0.1`，不允许空 bearer。
- WORK 路径直接使用 Chat Completions/new-api，不经过 CODE Responses 翻译网关。

### R3：健康和能力协商

- 启动后轮询 `/health`，再读取 `/v1/capabilities` 和 `/v1/models`。
- UI 和 Core 不假设所有 Hermes 版本能力相同；缺少 runs、approval、stop 或 session 能力时必须 fail closed 或明确降级。
- 记录实际 Hermes 版本、能力集、模型 route 和配置摘要，敏感值脱敏。

### R4：任务与事件协议

- 主任务通道使用 `POST /v1/runs`。
- 使用 `GET /v1/runs/{run_id}/events` 消费结构化 SSE。
- 支持读取 run 状态、停止 run 和提交 approval。
- 对断流、重复事件、乱序、重连和已结束 run 做幂等处理。
- 不以 `/v1/chat/completions` 代替需要工具审批和生命周期的产品任务；该接口只保留诊断或兼容用途。

### R5：会话与恢复

- 用户任务与 Hermes session/run 建立可持久映射。
- App 重启后能区分可恢复、已完成、失败和孤儿任务。
- 支持任务列表、恢复上下文、继续对话、停止和安全重试。
- 不把 Hermes session 数据冒充 BlackRain 用户项目；项目文件始终是独立用户资产。

### R6：统一 WORK 界面模型

Hermes 事件映射为 BlackRain 自己的 WORK domain model，至少覆盖：

- user message
- agent message / text delta
- reasoning / progress
- tool start / progress / result / error
- approval request / resolution
- user input request
- file or media output
- run status
- warning / error

该模型可以复用 CODE surface 的视觉组件，但不得伪装成 codex app-server payload，也不得让 WORK 状态污染现有 Codex thread reducer。

### R7：Codex 风格 WORK surface

- 使用现有 BlackRain design-system primitive、token、sidebar、composer 和消息视觉语言。
- WORK 与 CODE 进入后应被感知为同一个产品，不出现两套独立 App 的拼接感。
- 信息架构以工作台、项目、任务为主，不要求用户先选择引擎。
- 第一版至少包含任务侧栏、消息区、Composer、工具卡片、审批 UI、运行状态、停止/重试、输出文件入口和诊断入口。
- 支持键盘操作、焦点管理、空状态、加载状态、错误状态和基础无障碍语义。

### R8：Hermes Desktop 参考与复用

- Hermes Desktop 只作为功能结构、交互和 MIT React 组件参考，不运行、不分发整个 Electron App。
- 复制具体源码前逐文件确认 MIT 来源、锁定 commit、第三方依赖和 Electron 耦合。
- 复制的文件保留来源注释，并更新 NOTICE/THIRD-PARTY。
- 数据源必须重接 BlackRain Tauri/Hermes adapter，不直接照搬 Hermes Desktop 私有 dashboard runtime。

### R9：工作台激活

- spec 008 负责 inspect/install/activate/deactivate；本 spec 只提供 WORK 执行接缝。
- 激活时接收工作台的 Skills、插件/MCP、环境变量、权限、任务入口和项目路径。
- 每个新 run 的 Core-owned instructions 必须携带已验证项目根；用户选择的“附件”只作为项目内现有文件引用，经 Core 做数量、存在性、目录逃逸和 symlink 校验后加入 instructions，不伪装成 `/v1/runs` 不支持的二进制上传。
- 每轮原始用户消息及其项目文件引用必须先持久化到 WORK transcript，再向前端展示；同一 run 的 Hermes `user.message` 回显不得制造重复用户消息。
- 停用时解除本工作台的运行映射并回收受控进程，不删除用户项目。
- 动态 MCP 工具发现不能替代完整工作台生命周期。

### R10：诊断与安全降级

- 用户能区分 Hermes 未安装、配置无效、启动失败、模型不可用、SSE 断开、审批超时、工具失败和任务崩溃。
- 提供可复制的脱敏诊断摘要和受控日志入口。
- Hermes 不可用时不得静默切到 Codex 或 OpenRouter。
- CODE surface 不因 WORK 失败而不可用，反之亦然。

## 非目标

- 不修改 Hermes 或 Codex Agent loop。
- 不使用 Hermes 自带的 Codex runtime 实现 CODE surface。
- 不把 Hermes Desktop 整体 fork、嵌入或作为第二个桌面应用分发。
- 不在本 spec 实现工作台 Manifest 安装器、市场、签名、升级和卸载；这些属于 008 或后续市场 spec。
- 不实现工作室/OPC 多工作台自动协同。
- 不把 WhatsApp、Telegram、Discord 等多渠道作为 WORK surface 闭环条件。
- 不要求首版实现 Hermes 全部 Dashboard、Cron、MOA、Memory provider、Session export 和多 Profile 管理能力；它们按产品价值在核心闭环后评估。
- 不在单轮对话中热切 WORK/CODE 引擎。
- MVP 不发布 macOS/Linux；这些平台的开发结果只能作为辅助证据。

## 成功标准

### 代码/配置存在

- `apps/desktop` 有独立 WORK feature、Hermes adapter、事件模型和测试。
- Rust 后端有 Hermes 配置、HTTP 客户端、进程 supervisor 和薄 App adapter。
- App 能生成独立 `HERMES_HOME`，启动锁定 Hermes，完成 health/capabilities 协商。
- 前端能创建 run、消费 SSE、审批、停止、恢复并显示输出。
- spec 008 的激活接口能将官方工作台上下文交给 WORK surface。

### 开发验证通过

- Hermes client、event reducer、配置写入和 supervisor 单元测试通过。
- Mock/fixture 协议测试覆盖正常、断流、重复、乱序、审批、停止、崩溃和恢复。
- 真实锁定 Hermes 在隔离开发环境完成至少一个带工具和审批的任务。
- `npm run typecheck`、`npm run test`、`npm run lint`、`npm run lint:ds`、`npm run codemod:ds:dry` 和 Rust `cargo check` 按改动范围通过。

### Windows 产品闭环通过

- 干净 Windows x64 机器无需预装 Python/uv 即可启动 WORK surface。
- App 启动/停止 Hermes、健康检查、真实模型流式、工具、审批、文件输出、App 重启恢复全部通过。
- Office 官方工作台从项目创建到真实交付完成至少一条黄金流程。
- NSIS 安装、首次启动、异常退出清理和卸载不遗留失控 Hermes 进程。
- 失败降级、日志脱敏、Credential Manager、License/NOTICE 和包内制品来源通过检查。

## 性能与稳定性目标

- 已安装后的 Hermes 冷启动到 health ready 目标 ≤30 秒，最终阈值以 Windows 实测定案。
- 普通文本 delta 在 UI 中持续可见，不因高频事件导致明显卡顿。
- 任务停止后在合理时间内终止模型/工具工作并收敛为可解释状态。
- App 退出后无受控 Hermes/MCP 孤儿进程。
- 同一事件重复到达不会产生重复消息、重复工具卡片或重复审批。

## 约束

- Hermes 锁定 v2026.7.7.2 / `9de9c25`，升级按上游检查清单重新审计。
- App 是唯一配置写入者；工作台只声明 desired state。
- WORK 零协议翻译，不能复用 CODE Gateway 规避设计问题。
- 共享后端领域逻辑优先落 `src-tauri/src/shared/*`；若首版明确仅本地 App 可用，Daemon 必须返回显式 unsupported，而不是静默缺失。
- 前端 Tauri 调用只走 `src/services/tauri.ts`，事件扇出只走 `src/services/events.ts`。
- 共享 chrome 必须复用 design system，不能新增第二套 modal/toast/panel/popover。

## 开放问题

- [ ] WORK 首版是否要求 Daemon/远程后端 parity，还是明确 local-only 后再补。
- [ ] Hermes runtime 作为 BlackRain 基础包资源，还是由首个 WORK 工作台通过 008 managed runtime 安装。
- [ ] 生产 credit/new-api/`proxy.py`/BYOK 的最终鉴权和 token 注入方案。
- [ ] BlackRain task、Hermes session 和 run 的持久映射格式。
- [ ] 断开 SSE 后使用 replay、轮询状态还是重新连接同一 events endpoint。
- [ ] Hermes `/v1/runs` 事件 schema 是否需要在仓库保存版本化 fixtures。
- [ ] 哪些 Hermes Desktop 组件值得复制，哪些只参考交互重新实现。
- [ ] WORK/CODE 是否共享消息渲染 domain model，还是只共享纯展示组件。
- [ ] Windows 冷启动、内存和安装包体积最终门槛。
