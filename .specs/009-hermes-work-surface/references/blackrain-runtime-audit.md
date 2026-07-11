# BlackRain Hermes runtime 接入现状审计

> 2026-07-12 静态审计。只描述当前仓库可复用基础设施和缺口，不证明 Hermes 已接入。

## 可复用基础设施

| 能力 | 当前真源 | 可复用方式 | 不可直接复用之处 |
|---|---|---|---|
| Windows 隐藏进程与进程树回收 | `apps/desktop/src-tauri/src/shared/process_core.rs` | `tokio_command`、`std_command`、`kill_child_process_tree` | 仍需 Hermes 状态机、优雅停止、PID 审计、日志滚动 |
| Sidecar 生命周期模式 | `apps/desktop/src-tauri/src/model_gateway.rs` | runtime state、start/stop/restart、loopback readiness、App/daemon adapter 结构 | Gateway 只服务 CODE；不能让 WORK 经过翻译网关，也不能共享其配置语义 |
| App data 根目录 | `apps/desktop/src-tauri/src/state.rs` | `app.path().app_data_dir()` 解析受控数据根 | 当前只设置专属 `CODEX_HOME`，尚无 `HERMES_HOME` 和 Hermes runtime state |
| 系统 credential store | `shared/model_gateway_secrets.rs`、`shared/account_session_core.rs` | `keyring` 的幂等读写/清理模式 | 需独立 service/username namespace，不能混用 CODE provider secret |
| 前端单 listener fanout | `apps/desktop/src/services/events.ts` | `createEventHub` 模式 | 尚无 `work-event` hub 和类型 |
| Remote backend 判断 | `src-tauri/src/remote_backend/*` 及各 adapter | 显式判断 remote mode | 首版 WORK 必须返回结构化 `unsupported_in_remote_backend`，不能静默本地执行 |
| 原子替换 helper | `shared/workspaces_core/helpers.rs` 等 | 临时文件 + rename 模式 | 需为 Hermes config/task store 建专用、可测试 helper |

## Windows runtime/release 缺口

当前发布路径：

- `scripts/vendor-windows-runtime.ps1` 只 vendor `codex.exe` 和 Python embeddable runtime。
- Python runtime 只有解释器文件，没有 Hermes venv、Hermes 包、依赖锁、License 集合或 checksums 清单。
- `tauri.conf.json` resources 只有 CODE gateway、Office CLI/plugin/workbench，没有 Hermes runtime。
- `apps/desktop/scripts/doctor.mjs` 没有检查 Hermes Python、关键 import、provenance 或 runtime checksum。
- `scripts/dev-client.ps1` 只启动 CODE gateway 和 Codex；没有 WORK/Hermes 开发入口。
- `scripts/release-client-win.ps1` 不构建或验证 Hermes runtime。
- 当前 CI/NSIS 没有 Hermes runtime、进程清理、Credential Manager、真实 run 或 Office WORK 黄金流程证据。

因此阶段 3 必须新增独立、可复现的 Hermes Windows runtime vendor 流程，不能把现有裸 Python 目录写成 Hermes 已随包交付。

## 已冻结的实现边界

### Local-only 与 Daemon parity

首版 Windows MVP 的 Hermes supervisor 是本地 App 能力。领域 contract、protocol、task store 和错误类型落 `shared/hermes_core/*`；App adapter 实现本地进程命令；remote backend/daemon 对进程和本地凭据相关命令明确返回 `unsupported_in_remote_backend`。不为形式 parity 复制远程 supervisor。

### Runtime 所有权

Hermes 引擎 runtime 属于 BlackRain Windows 基础包，而不是 spec 008 工作台自行安装的 managed runtime：

- App/Core 负责版本、vendor、校验、启动、升级和卸载。
- 工作台只能声明所需 Hermes capability/version range 和 desired state。
- 008 可以管理工作台私有插件、MCP、Skills 和额外依赖，但不能替换或写入基础 Hermes runtime。

### Task ↔ session/run 持久映射

首版冻结为 App data 下的版本化文件 contract：

```text
<app-data>/work/
├─ tasks.v1.json                 # 原子替换的任务索引/快照
└─ events/<task_id>.ndjson       # 只追加的归一化事件 journal
```

`tasks.v1.json` 顶层必须带 `schema_version: 1`，每条任务至少保存：

```text
task_id
workbench_id/workbench_version
project_path reference
hermes_session_id
active_run_id
status
last_event_sequence
created_at/updated_at
recovery metadata
```

journal 使用 BlackRain 稳定 `WorkEvent`，不保存 bearer、provider secret 或未脱敏诊断。阶段 6 若性能证据要求迁移 SQLite，可通过 schema migration 替换物理后端，但前端 contract 和恢复语义不变；localStorage 不能成为真源。

### Credit/new-api/BYOK

- 计量、套餐和 credit 服从 spec 002。
- WORK 网络路径和 new-api 边界服从 spec 003。
- 是否允许 BYOK、如何选择国产模型、生产 bearer/token 交换仍是 002/003 的未决产品/服务端问题。
- spec 009 只实现 secret reference、provider/model desired state 和脱敏诊断，不在客户端偷偷固化商业策略。
