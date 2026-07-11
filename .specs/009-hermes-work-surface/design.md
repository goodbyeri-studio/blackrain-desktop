# Design

> 本文描述目标架构，不证明实现完成。当前仓库仍没有 Hermes Tauri 集成；真实进度只看 [verification](verification.md) 和代码。

## 总体方案

在现有 Tauri 壳中新增独立 WORK vertical slice：Rust/Core 纳管原装 Hermes 子进程并把 `/v1/runs` 事件转换为稳定的 BlackRain WORK contract；React 前端使用现有 Codex 风格 design system 展示任务、消息、工具、审批和结果。Hermes Desktop 提供功能参考和可选择的 MIT 组件，但不成为运行时或视觉主题。

## 真源分工

| 领域 | 真源 |
|---|---|
| 双引擎和 WORK/CODE 网络路径 | spec 003 + docs/09 |
| Windows 基础包、NSIS 和实机发布 | spec 007 |
| 工作台 Manifest、安装、激活、升级和卸载 | spec 008 |
| Hermes 进程、协议、状态、WORK UI 和任务闭环 | 本 spec 009 |
| 产品术语和工作台第一入口 | docs/04 |

## 目标拓扑

```text
工作台 / 项目 / 任务
        │
        ▼
React WORK surface
  ├─ Workbench/task sidebar
  ├─ Message/tool/approval/output UI
  ├─ Composer + stop/retry/resume
  └─ Diagnostics/status
        │ 只走 src/services/tauri.ts + src/services/events.ts
        ▼
Tauri App adapters
        │
        ▼
src-tauri/src/shared/hermes_core/*
  ├─ HermesConfigManager
  ├─ HermesProcessSupervisor
  ├─ HermesApiClient
  ├─ HermesEventNormalizer
  └─ HermesTaskStore
        │
        ├─ App data/HERMES_HOME
        └─ 127.0.0.1:<managed-port> + bearer
                         │
                         ▼
Hermes gateway v2026.7.7.2（原装黑盒）
  ├─ /health
  ├─ /v1/capabilities
  ├─ /v1/models
  ├─ /v1/runs
  ├─ /v1/runs/{id}/events
  ├─ /v1/runs/{id}/approval
  └─ /v1/runs/{id}/stop
                         │
                         ▼ Chat Completions，零翻译
                  new-api / 国产模型
```

## 后端模块建议

具体文件名可随现有 Rust 组织调整，但职责不得重新混回 `lib.rs` 或复制到 App/Daemon 两处。

```text
apps/desktop/src-tauri/src/
├── shared/
│   ├── hermes_core.rs
│   └── hermes_core/
│       ├── config.rs
│       ├── process.rs
│       ├── client.rs
│       ├── protocol.rs
│       ├── events.rs
│       ├── tasks.rs
│       └── diagnostics.rs
├── hermes/
│   ├── mod.rs
│   └── commands.rs
└── lib.rs
```

### `HermesConfigManager`

- 使用 Tauri App data API 计算 `HERMES_HOME`。
- 原子写入 `config.yaml` 和运行配置；失败不留下半文件。
- 只写命名 `providers:`，禁止 bare `custom` 静默 fallback。
- 生成或读取本地 API bearer；模型 secret 从 credential store/短期环境注入。
- 输出脱敏 config summary 供诊断。
- 工作台激活以结构化 desired state 输入，不接受任意脚本直接写配置。

### `HermesProcessSupervisor`

- 状态机建议：`not_installed → stopped → starting → ready → stopping`，任一运行态可进入 `degraded` / `crashed` / `repair_required`。
- 单实例启动去重；并发 start 合并为同一等待结果。
- spawn 锁定 runtime 中的 `hermes gateway`，设置 `HERMES_HOME` 和必要环境。
- 捕获 stdout/stderr 到滚动、脱敏日志。
- readiness 使用 health + capabilities，不用匹配一条易漂移日志作为唯一证据。
- shutdown 先走优雅终止，超时后强制回收整个受控进程树。
- 处理旧 PID、端口占用、进程已存在但 bearer 不匹配、App crash 后孤儿进程。

### `HermesApiClient`

- 只连接 supervisor 返回的 loopback URL，不接受工作台任意 URL。
- 所有请求带 bearer、超时、request id 和版本化 User-Agent。
- 方法至少包括：
  - health/capabilities/models
  - create/get/stop run
  - resolve approval
  - stream run events
  - 必要的 session list/read/create/resume
- 错误分为连接、鉴权、能力不支持、请求无效、上游模型、工具、超时和取消，避免前端只收到字符串。

### `HermesEventNormalizer`

Hermes 原始事件先进入 adapter，再转为稳定事件：

```text
WorkEvent
├─ TaskStatusChanged
├─ UserMessageAdded
├─ AgentTextDelta
├─ AgentMessageCompleted
├─ ReasoningUpdated
├─ ToolStarted
├─ ToolProgress
├─ ToolCompleted
├─ ApprovalRequested
├─ ApprovalResolved
├─ UserInputRequested
├─ OutputAvailable
├─ WarningRaised
└─ TaskFailed
```

每个事件至少携带：`task_id`、`run_id`、稳定 event id/sequence、时间、可选 item id 和 schema version。Normalizer 负责：

- 未知事件保留诊断但不使整个 stream 崩溃。
- 重复事件幂等。
- text delta 聚合不重复。
- tool/approval 生命周期可以从中间状态恢复。
- 敏感字段在进入日志前脱敏。

### `HermesTaskStore`

持久化 BlackRain task 与 Hermes session/run 的映射，不复制用户项目内容：

```text
task_id
workbench_id/version
project_path reference
hermes_session_id
active_run_id
status
last_event_cursor/sequence
created_at/updated_at
recovery metadata
```

存储格式须支持原子更新和 schema migration。当前壳若已有适合的 SQLite/store 基础设施则复用；不得用散落 localStorage 作为唯一真源。

## App/Daemon 边界

WORK MVP 是 Windows 本地客户端能力。首版允许：

- shared core 承载可复用领域逻辑；
- Tauri App command 完整实现本地进程和 API；
- Daemon 对 Hermes 本地进程命令显式返回 `unsupported_in_remote_backend`。

如果后续需要远程 WORK backend，再为 daemon 增加对应 adapter；不能提前复制一套 supervisor，也不能让前端猜测后端类型。

## 前端模块建议

```text
apps/desktop/src/features/work/
├── api/
├── components/
│   ├── WorkSurface.tsx
│   ├── WorkTaskSidebar.tsx
│   ├── WorkMessages.tsx
│   ├── WorkComposer.tsx
│   ├── WorkToolCard.tsx
│   ├── WorkApprovalCard.tsx
│   ├── WorkOutputCard.tsx
│   └── WorkDiagnosticsPanel.tsx
├── hooks/
│   ├── useHermesRuntime.ts
│   ├── useWorkTasks.ts
│   ├── useWorkTaskEvents.ts
│   └── useWorkTaskActions.ts
├── reducer/
├── types.ts
└── index.ts
```

命名可调整，但必须保持：

- `App.tsx` 只装配，不承载 WORK 状态机。
- Tauri 调用集中在 `src/services/tauri.ts`。
- 事件 listener 集中在 `src/services/events.ts`，feature 内只订阅 fanout。
- WORK reducer 与现有 Codex threads reducer 分离。
- 可复用的 Markdown、附件、tool chrome、approval modal 等使用现有组件或抽成 engine-neutral presentation primitive。

## 信息架构

用户第一层看到：

```text
工作台
  └─ 项目
      └─ 任务
          ├─ 对话和进度
          ├─ 工具与审批
          └─ 输出文件
```

不把 “Hermes” 作为普通用户主导航。引擎信息只在诊断、About 或高级设置出现。

进入逻辑：

- `engine.preferred: work` 的已激活工作台进入 WORK surface。
- `engine.preferred: code` 进入现有 CODE surface。
- 尚未安装/激活工作台时停在工作台流程，不生成虚假的 WORK 会话。

## 视觉策略

### 复用 BlackRain/Codex 风格

- 沿用现有 sidebar 密度、top bar、composer、message spacing、tool card、状态色和 design tokens。
- 使用现有 `ds-modal`、`ds-toast`、popover/panel primitives。
- WORK 特有能力以内容差异表达，不建立另一套主题。

### 参考 Hermes Desktop

重点研究：

- gateway connecting/boot failure 状态
- session list/resume
- composer queue/status
- tool progress/result
- approval/clarify
- project/CWD 切换
- session watchdog/recovery
- PTY attach/detach
- skills/memory/model panels

每个候选组件先记录：来源路径、commit、License、依赖、Electron 耦合、复制还是重写。默认优先借鉴行为并用现有 DS 重写；只有纯 React 组件复用价值明显时才复制源码。

## 任务数据流

```text
用户提交任务
  → 前端 workTaskStart()
  → Tauri command
  → Core ensure_runtime_ready()
  → Core create_run(workbench context, project path, input)
  → Hermes 返回 run_id
  → Core 启动 SSE consumer
  → raw event → normalizer → tauri event hub
  → WORK reducer 幂等更新
  → UI 渲染 delta/tool/approval/output
```

审批：

```text
ApprovalRequested
  → UI 展示工具、参数、影响和来源
  → 用户 approve/deny
  → Tauri command
  → POST /v1/runs/{id}/approval
  → ApprovalResolved / run continues
```

停止：

```text
用户 Stop
  → 本地立即进入 stopping（防重复点击）
  → POST /v1/runs/{id}/stop
  → 等待终态
  → 超时则查询 run 状态并展示真实结果
```

## 工作台上下文映射

spec 008 激活结果通过结构化 contract 交给 WORK：

```text
ActivatedWorkbenchContext
├─ workbench id/version
├─ project path
├─ task definition
├─ skill roots
├─ plugin/MCP registrations
├─ environment variables（secret references，不是明文）
├─ permission grant
└─ validation metadata
```

Core 将它转成 Hermes 可读状态。工作台不能自己修改 `config.yaml`，也不能把任意环境变量注入全局进程。

## Runtime 和制品

目标 Windows 布局由实际 Tauri resources 配置冻结，概念上包括：

```text
resources/
└─ hermes-runtime/windows-x64/
   ├─ python/
   ├─ venv/
   ├─ launcher/
   ├─ LICENSES/
   ├─ provenance/
   └─ checksums.txt
```

原则：

- 预构建 venv，不冻结为 PyInstaller/Nuitka。
- 排除未批准 extra 和未核实 License。
- 运行时 checksum、版本和来源可诊断。
- App 更新 Hermes runtime 时必须更新 spec 003/009 verification 和 NOTICE。

## 失败模式与用户降级

| 失败 | Core 行为 | 用户界面 |
|---|---|---|
| runtime 缺失/损坏 | 不启动，返回 repair plan | 显示修复入口，不展示假会话 |
| config 写入失败 | 保留旧可用配置 | 显示路径/权限诊断 |
| 端口冲突 | 尝试受控端口策略或失败 | 明确端口被占用，不随机连未知进程 |
| bearer 不匹配 | 拒绝复用现有进程 | 提示检测到非本 App 实例 |
| health 超时 | 回收本轮启动进程 | 显示日志摘要和重试 |
| capabilities 不足 | fail closed | 列出缺失能力和版本 |
| SSE 断开 | 重连/查询 run 状态 | 显示正在恢复，不重复消息 |
| approval 超时 | 保持 pending 或按上游规则终止 | 可重新提交或停止 |
| 模型/new-api 失败 | 保留任务和诊断 | 不切 OpenRouter/Codex |
| 工具进程残留 | supervisor 回收进程树 | 报告清理结果 |
| App 重启 | task store 做恢复审计 | 标记可恢复/已结束/孤儿 |

## 安全设计

- loopback + bearer 双约束。
- 对工作台权限、工具调用和 approval 展示真实来源。
- 日志统一脱敏 API key、bearer、JWT、Cookie、用户文件正文和模型内容；如需内容诊断必须由用户主动导出。
- 禁止工作台覆盖 `HERMES_HOME` 根、API host、bearer 和全局 provider。
- 不接 Nous Portal，CUA telemetry 保持关闭。
- 发行依赖继续遵守 MIT/Apache/BSD 优先，排除 GPL/AGPL/BSL/无许可证。

## 测试策略

### Rust 单元测试

- config schema/原子写入/脱敏
- process state machine、并发 start、graceful/forced stop
- port/PID/进程树处理
- HTTP error mapping
- SSE parser、event normalization、dedupe/order
- task store migration/recovery

### 前端单元和组件测试

- WORK reducer 状态转换
- text delta 聚合
- tool/approval 生命周期
- stop/retry/resume 防重复操作
- 空、加载、断流、崩溃和恢复状态
- 键盘/焦点/ARIA

### 集成测试

- fake Hermes server 覆盖完整 `/v1/runs` 生命周期
- 锁定 Hermes 本地进程 health/capabilities/models
- 真实 run + SSE + tool + approval + stop
- App 退出/重启恢复
- 工作台激活上下文映射

### Windows 产品验证

- 干净 Win11 x64 NSIS 安装
- 无系统 Python/uv 条件启动
- Credential Manager
- new-api/国产模型真实流式
- Office 工作台真实任务
- 崩溃、断网、睡眠、端口冲突和卸载

## 兼容与升级

- Hermes 升级前保存当前事件 fixtures 并重跑 contract tests。
- `/v1/capabilities` 是能力协商，不替代版本锁。
- 未知增量事件允许记录和忽略；已依赖字段发生 breaking change 时阻止升级。
- BlackRain task store 和 WORK event schema 独立版本化，不能直接序列化整个上游对象作为长期存储。
