# Tasks

> 本清单覆盖 Hermes WORK surface 长期完整闭环，不按单次 Goal 时长裁剪。Goal 每轮从最早未完成且未阻塞的任务继续；只在 `verification.md` 有对应证据时勾选。部分完成写子项和验证，不用“差不多完成”跳阶段。

## 阶段 0：边界、上游和现状审计

- [x] 阅读根 `AGENTS.md`、`apps/desktop/AGENTS.md`、spec 003/007/008 和模板
- [x] 确认 Hermes 锁定 v2026.7.7.2 / `9de9c25`
- [x] 确认目标协议包含 `/health`、`/v1/capabilities`、`/v1/models`、`/v1/runs`、events、approval、stop
- [x] 创建本 spec 五件套
- [x] 逐项记录锁定 Hermes 的 run event schema 和示例 payload，建立无敏感数据 fixtures
- [x] 盘点 Hermes Desktop 中 session、composer、tool、approval、gateway status、PTY、skills/memory 面板的真实来源文件
- [x] 为每个 UI 候选记录复制/重写决定、Electron 耦合、第三方依赖和 MIT 署名要求
- [x] 盘点现有 Tauri 子进程、sidecar、process tree、keyring、App data、event fanout 可复用基础设施
- [x] 盘点当前 Windows resource/vendor/release 脚本中 Hermes runtime 的缺口
- [x] 决定并记录 local-only 与 Daemon parity 边界
- [x] 决定 Hermes runtime 属于基础包还是 008 managed runtime
- [x] 决定 BlackRain task ↔ Hermes session/run 的持久映射格式
- [x] 将生产 credit/new-api/BYOK 未决项链接到 002/003，不在实现中偷偷定案

## 阶段 1：协议 contract 和 fake server

- [x] 定义版本化 Hermes raw protocol types，只覆盖实际使用字段并保留 unknown event
- [x] 定义稳定 `WorkEvent`、`WorkTask`、`WorkRuntimeStatus`、`WorkError` contract
- [x] 保存锁定版本 capabilities/models/runs/SSE/approval/stop fixtures
- [x] 实现 fake Hermes HTTP/SSE server 测试支架
- [x] 覆盖正常 run：创建 → stream → tool → completion
- [x] 覆盖 approval：pending → approve/deny → continue/terminate
- [x] 覆盖 stop、模型错误、工具错误、鉴权失败和 capability 缺失
- [x] 覆盖断流、重复事件、未知事件、乱序、重连和已结束 run
- [x] 冻结 Rust↔TypeScript 序列化 contract 测试

## 阶段 2：隔离配置和凭据

- [x] 新建 shared Hermes config domain，不在 `lib.rs` 直接拼 YAML/.env
- [x] 使用 Tauri App data API 解析独立 `HERMES_HOME`
- [x] 实现 config schema 和原子写入
- [x] 只生成命名 `providers:`，增加禁止 bare `custom` 的测试
- [x] 配置 `127.0.0.1`、受控端口、`API_SERVER_ENABLED=true` 和非空 bearer
- [x] 生成高熵 `API_SERVER_KEY`，实现安全保存/轮换策略
- [x] 对接模型/平台 secret reference，不在配置、日志或项目中落明文
- [x] 注入 `CUA_DRIVER_RS_TELEMETRY_ENABLED=0`，默认不接 Nous Portal
- [x] 实现脱敏 config/runtime summary
- [x] 配置损坏时保留上一个可用版本并输出 repair plan
- [x] 为工作台激活定义受限 desired-state 输入，禁止任意全局环境覆盖

## 阶段 3：Windows Hermes runtime 制品

- [x] 冻结 Python 版本、Hermes commit、核心 extra 和直接/传递依赖清单
- [x] 排除 `messaging`、`edge-tts`、`honcho`、未核实 `hindsight` 等不允许依赖
- [ ] 生成 Windows x64 预构建 venv，不使用 PyInstaller/Nuitka
- [ ] 验证 Windows 无 `uvloop` 时可靠降级 asyncio
- [x] 建立 runtime provenance、checksums、LICENSES 和 NOTICE
- [x] 实现 `vendor-hermes-runtime.ps1` 或等价可复现脚本
- [x] 将 runtime 加入 Tauri Windows resources 和 release script
- [x] 更新 doctor 检查 runtime 完整性、Python 可执行和关键 import
- [ ] 干净 Windows 环境验证无需系统 Python/uv/Node
- [ ] 记录实际包体、冷启动和内存基线

> 2026-07-12：上述已勾选项只证明冻结策略、生成脚本、打包声明和 doctor 门禁已经进入仓库。当前 macOS 开发机没有 `pwsh`，尚未生成 Windows venv；Windows asyncio、可搬移性、干净机和性能项保持未完成。

## 阶段 4：Hermes 进程 supervisor

- [x] 新建 `src-tauri/src/shared/hermes_core` 及 process supervisor
- [x] 实现 runtime 状态机和线程安全共享状态
- [x] 实现并发 start 去重
- [x] spawn 前台 `hermes gateway` 并注入专属环境
- [x] 捕获并滚动保存脱敏 stdout/stderr
- [x] health + capabilities readiness，日志字符串只作辅助
- [x] 处理启动超时、端口冲突、旧 PID 和 bearer 不匹配实例
- [x] 实现 graceful stop、超时强杀和 Windows process tree 回收
- [x] App 正常退出时清理 Hermes 和受控 MCP 子进程
- [x] App 异常退出/下次启动时审计并清理或安全接管孤儿进程
- [x] 处理系统休眠/恢复和网络变化
- [x] 暴露 runtime status、start、stop、restart、repair、logs Tauri commands
- [x] local-only 时为 remote backend 返回显式 unsupported
- [x] 补 supervisor 单元、并发和失败注入测试

> 2026-07-12：版本化 PID lease、进程身份核对、health/bearer/capability 复核与下次启动清理已经实现；PID 被复用、身份查询失败或 bearer 不匹配时进入 `repairRequired`，不会误杀。App adapter 已暴露六个 runtime commands，命令不接受 host/port/binary/env，remote mode 返回结构化 `unsupported_in_remote_backend`。Tauri `RunEvent::Resumed`、window focus、document visible 和 browser online 共用单一 250ms 去抖入口，重新读取 runtime/tasks/recovery/activations，并只对仍有 active run 的 degraded task 调用 resume 重新挂 SSE，不创建 run、不重放 prompt。App `ExitRequested` 会先取消受控 SSE，再等待 supervisor 停止后退出；Windows 使用 `taskkill /T` 收敛 Hermes/MCP tree，Unix 开发运行让 Hermes 独占 process group 并对整组 TERM/KILL，回归测试用真实 background child 证明 stop 后不留子进程。Windows 原生 sleep/resume、`Get-CimInstance`/`taskkill /T`、真实网络恢复和真实 MCP tree 仍未实测，因此发布验收保持未完成，但代码级恢复策略已闭合。

## 阶段 5：Hermes API client

- [x] 实现 loopback + bearer HTTP client 和统一超时
- [x] 实现 `/health`、`/v1/capabilities`、`/v1/models`
- [x] 实现 `POST /v1/runs`
- [x] 实现 `GET /v1/runs/{run_id}`
- [x] 实现 `GET /v1/runs/{run_id}/events` SSE consumer
- [x] 实现 `POST /v1/runs/{run_id}/approval`
- [x] 实现 `POST /v1/runs/{run_id}/stop`
- [x] 实现闭环所需 session list/read/create/resume 接口
- [x] 将 HTTP/上游错误映射为结构化 `WorkError`
- [x] 为每次请求加入 request id、版本 User-Agent 和脱敏 tracing
- [x] 对取消、超时、重试、幂等和 backpressure 建立测试

> 2026-07-12：supervisor 持有共享的有界 HTTP trace sink，并通过 runtime diagnostics 暴露；每条只包含 request id、method、受校验 path、status、outcome 和 elapsed，不记录 bearer/header/body。SSE 使用可唤醒取消 token，pending frame queue 上限 1024。timeout/5xx 标记 retryable，但 create run 等请求不会在 client 内自动重放，测试证明每次只发出一次。session resume 使用读取既有 session 后在新 run 中传回 `session_id`，锁定 Hermes 没有独立的 resume 端点。

## 阶段 6：事件 normalizer 和任务存储

- [x] 实现 raw Hermes event → `WorkEvent` 映射
- [x] 实现稳定 event id/sequence 和重复事件去重
- [x] 实现 text delta 聚合与 completed message 收敛
- [x] 实现 tool start/progress/result/error 生命周期
- [x] 实现 approval request/resolution 生命周期
- [x] 实现 user input、file/media output、warning/error 映射
- [x] 未知事件进入诊断，不使 stream/reducer 崩溃
- [x] 实现 task/session/run 持久映射和 schema migration
- [x] 实现 App 重启后的恢复审计（`AppState::load` 先做本地审计；managed runtime start/restart Ready 后查询上游 run status）
- [x] 区分 resumable/completed/failed/orphaned 状态
- [x] 恢复时不重复消息、工具和审批
- [x] 高事件频率下增加批处理/节流，避免 UI 卡顿

> 2026-07-12：normalizer 已覆盖锁定事件和预留扩展事件；raw 内容使用确定性 128-bit fingerprint 生成稳定 event id，sequence 从任务最后序号继续。进程内去重保留最近 20,000 个 raw fingerprint；未知/损坏事件只把 event type、字段名和原因写入最多 200 条诊断，不保存 payload 值。同名并发工具和批量 approval 使用计数生命周期，乱序 completion/responded 会发 warning 但仍保留可收敛事件。TaskStore 已实现版本化 snapshot/journal、本地审计和 runtime Ready 后的上游 status 对账；404 才标 orphaned，暂时连接失败与未知上游状态保留 active run 并降级为 resumable。真实 SSE 已有 replay 去重和有限重连；前端单 listener 以 16ms、每批最多 256 个事件向 reducer 交付，批量 reducer 按 task 合并并一次投影状态，600 事件测试证明分三批收敛且不丢失/不重复。

## 阶段 7：Tauri commands 和事件桥

- [x] 在 App adapter 暴露 runtime、task、approval、stop、resume、diagnostics commands
- [x] 在 `lib.rs` 注册命令，保持 adapter 薄
- [x] 在 `src/services/tauri.ts` 增加唯一前端 IPC 包装
- [x] 在 `src/services/events.ts` 增加 WORK event 单 listener fanout
- [x] 定义前后端 types 并增加 contract 测试
- [x] 远程 backend 分支按 decision 显式处理，不静默落本地
- [x] 审核命令参数不允许任意 host、port、binary、env 或路径穿越

> 2026-07-12：task start 已形成真实纵切：App adapter 仅校验结构化输入并调用 shared runner；runner 原子编排 operation reserve → `POST /v1/runs` → task/run attach → SSE consumer。归一化事件必须先通过 TaskStore journal-first 持久化，只有 `appended_events` 才通过 `work-event` 发给前端，因此 SSE replay 不会重复扇出。runtime stop/restart/repair/App exit 会取消并清空受控 stream registry；continue/retry、有限断流重连和独立前端状态机均已接通。

## 阶段 8：WORK 前端状态层

- [x] 新建独立 `src/features/work/`，不复用 Codex thread reducer 存储 Hermes 状态
- [x] 实现 runtime hook 和启动/修复状态
- [x] 实现 tasks list/load/create/resume/delete-local-metadata
- [x] 实现 `WorkEvent` reducer 和 selectors
- [ ] 实现 send/stop/retry/approval/user-input actions
- [x] 防止重复发送、重复审批和 stop 竞态
- [x] 实现断流恢复和 App 重启恢复状态
- [x] 为 reducer/hooks/actions 建立完整测试

> 2026-07-12：`useWorkController` 并行 bootstrap runtime/tasks/recovery，持有唯一 WORK event 与 follow-up queue subscription，并通过同步 `inFlightRef` 分别串行化同一 task 的 run mutation 和 queue mutation，避免等待 render 才生效的双击竞态；跨类型竞态继续由 Core 的 task 状态、队首 `starting` claim 和 run registry 门禁收敛。Reducer 以 event id 幂等、按 sequence 合并；事件先于 task start 响应到达时进入有界 orphan buffer，task metadata 到达后再收敛，避免真实快响应丢事件。actions 已覆盖 start、终态 task 显式 continue/retry、durable follow-up enqueue/edit/cancel/retry、resume、approval、stop、delete；SSE 已接 status-first 的有限退避重连。locked `/v1` 没有 active run user-input response endpoint，不能伪造，因此总项保持未完成。

## 阶段 9：Codex 风格 WORK surface UI

- [x] 把工作台/项目/任务路由接入现有 App 装配，不让 `App.tsx` 承担状态机
- [x] 实现 WORK task sidebar 和空状态
- [x] 实现 Codex 风格消息流和 Markdown/附件显示
- [x] 实现 Composer、发送、排队/禁用、Stop 和继续任务
- [x] 实现 reasoning/progress 呈现，避免暴露不应展示的内部内容
- [x] 实现 tool call 卡片、参数摘要、进度、结果、错误和耗时
- [x] 实现 approval UI，展示工具来源、影响、参数和 approve/deny
- [x] 实现 user input request UI
- [x] 实现 file/media/output 卡片和打开项目文件入口
- [x] 实现 runtime status、连接恢复和崩溃 repair UI
- [x] 实现诊断面板和脱敏复制
- [x] 复用现有 DS modal/toast/panel/popover/token，通过 `lint:ds`
- [ ] 完成键盘、焦点、ARIA、缩放和 Windows 高 DPI 检查
- [x] WORK/CODE 切换不丢各自任务状态，不产生两套壳 chrome

> 2026-07-12：Home 已提供 Office 工作台入口，`MainApp` 持有独立 `useWorkController` 并在现有主布局的 Home surface 槽位挂载 WORK；`App.tsx` 只新增样式导入。WORK surface 已连接真实 Tauri/controller actions，任务 sidebar、runtime/repair、消息 Markdown、reasoning、工具、审批、user-input 缺能力说明、输出文件、诊断和 Stop/Resume 均有组件与测试。Composer 已增加最多 16 个“项目文件引用”：picker 从已验证项目根打开，Core 对 start/continue 重新校验存在性、目录逃逸和 symlink，并把项目根/引用写入 Hermes instructions，不内联内容或伪装二进制上传。每轮 prompt 和引用现已作为确定性本地 `UserMessageAdded` journal-first 持久化，Hermes 同 run 的 `user.message` 回显被抑制，重启后仍能显示文件 chip。active run 期间 Composer 可继续输入并把最多 32 项 follow-up 持久化到 TaskStore，支持编辑/取消/失败重试；终态、runtime 恢复或 App 重启对账后由 Core 按队首创建同 session 新 run，失败暂停队列且不隐式重放。终态/orphaned 任务已提供“只删本地元数据”的 DS 二次确认，并明确保留项目与输出；任务侧栏补 `aria-current`/状态标签，ModalShell 补首次聚焦、Tab 环与焦点归还。Windows 高 DPI、真实缩放和完整键盘人工矩阵仍未完成，所以无障碍总项保持未勾选。浏览器 fixture 只用于可见 QA 且已删除，不替代 Tauri WebView、真实 Hermes 或 Windows 验收。

## 阶段 10：Hermes Desktop 参考能力迁移

- [x] 完成候选组件清单和来源 commit 存证
- [x] 优先重写 gateway connecting/boot failure 状态到现有 DS
- [x] 借鉴 session resume/watchdog 行为
- [ ] 借鉴 composer status/queue 和 clarify/approval 行为
- [x] 借鉴 tool progress/result summary
- [x] 评估并按需实现 PTY attach/detach 与长任务面板
- [x] 评估并按需实现 skills/memory/model 面板
- [x] 每个复制文件加来源头，更新 NOTICE/THIRD-PARTY
- [x] 移除 Electron、Node preload 和 Hermes 私有 dashboard runtime 依赖
- [x] 对复制/重写后的行为补 BlackRain 测试，不沿用上游测试数量冒充覆盖

> 2026-07-12：`references/hermes-desktop-ui-audit.md` 已锁定 Hermes `9de9c25` 的候选路径、依赖/Electron 耦合、License 和逐项复制/重写决定。首版没有复制任何 Hermes Desktop React 文件，因此来源头和 NOTICE/THIRD-PARTY 本阶段为“无复制文件、无需新增”；若后续复制，门禁仍然生效。`WorkRuntimeBanner`、TaskStore/recovery/resume、`WorkEventRow`、`WorkApprovalCard`、`WorkFollowUpQueue` 已按独立 WORK contract 重写并由 BlackRain 测试覆盖；PTY 结论是如进入产品只复用 BlackRain terminal，Skills/MCP 服从 008，model/memory 延后 002/003/阶段 15。Composer 已有 send/stop/busy/approval、项目文件引用、durable queue 和 user-input 缺能力说明，但 active clarify response 仍无上游 endpoint，所以该项保持未勾选。

## 阶段 11：工作台激活接缝（与 spec 008 联动）

- [x] 定义 `ActivatedWorkbenchContext` contract
- [x] 接收 workbench id/version、project、task、skill roots、plugins/MCP、env refs、permissions
- [x] 将 Skills 映射到专属 Hermes 环境
- [x] 注册/注销受控 MCP server，并验证 `tools/list_changed`
- [ ] 动态挂载/拔出插件时不重启当前对话，失败可恢复
- [x] 停用工作台时停止其受控进程但保留用户项目
- [x] 防止不同工作台环境变量、Skills、MCP 和 session 串台
- [x] Office 官方工作台进入 WORK surface，而不是 CODE 临时路径
- [x] 工作台未通过 008 activate/verify 时禁止创建正式任务

> 2026-07-12：shared `workbench_core` 已冻结并持久化 `ActivatedWorkbenchContext v1`，Rust/TypeScript 共用 fixture。App data 下的版本化 activation store 只提供 local-only list/read 前端命令，写入只由 008 lifecycle 调用；store 拒绝未知 schema、重复 ID、非法 context、文件/目录 symlink 和超过 1024 条记录，同一 activationId 只允许刷新 `verifiedAt`，资源变化必须签发新 ID。WORK controller 启动与前台对账会刷新 activation 列表，surface 只允许选择已验证 context；`hermes_task_start` 只接受 `activationId + prompt`，从 Core store 读取并校验完整 context，再把 activation/workbench/version/project 身份写入持久任务。没有 activation 时 Composer 禁用，前端不能传 workbench/version/project、env、MCP command、binary、host 或 port。创建/继续新 run 前，Core 将 context 的 skill roots 重新校验为存在、含 `SKILL.md`、无重复且整棵树无 symlink，然后以锁定 Hermes 原生 `skills.external_dirs` 写入专属 `HERMES_HOME/config.yaml`；binding 另存版本化非敏感 envelope，provider 更新/repair 不会抹掉它。MCP command/args/child env reference 只从 Core-owned verified plugin runtime store 解析，首版仅允许 managed stdio；config 只写 App-managed `${BLACKRAIN_MCP_SECRET_*}`，实际 provider/managed-variable 值从系统凭据注入专属 Hermes 进程，system capability 不可冒充 secret。`officecli-1.0.117` 已作为首个 Core allowlist system capability，从 App-data 受控工具根解析并仅前置当前 Hermes 子进程 PATH；缺失、unsupported 和 symlink 均 fail closed。不同 environment reference 会改变 binding 并触发空闲态 restart，旧进程环境随 supervisor 收敛；active run 期间拒绝切换。Skills 不做并集，MCP ID 一一解析，continuation 必须匹配任务持久化 activation/session，因此代码级四类串台门禁已闭合。注册/注销整个 server 仍通过受控 restart，server 内工具变化交给上游 `tools/list_changed`；新 binding readiness 失败时恢复旧 binding/config/last-good 和旧 runtime。由于整个 Hermes 进程仍会重启，“动态挂拔不重启进程”的总项保持未完成。停用命令由 Core 串行执行：拒绝其他 activation/legacy active run，尽力请求 stop 后关闭单 supervisor process tree，取消 stream，把匹配任务收敛为 cancelled，移除 Skills/MCP binding，最后删除 activation；WORK surface 使用现有 ModalShell 明示用户项目保留。官方 Office v0.1.0 现已通过 Windows x64 allowlist command、staging/版本安装、OfficeCLI SHA/version health、项目目录选择和权限确认签发正式 activation，并由同一 WORK surface 创建任务，不再依赖 CODE 临时路径。该勾选只证明代码级路由闭合；真实 Windows 安装、OfficeCLI→Hermes 工具发现、Office smoke/黄金流程、升级/回滚/卸载仍未验证。

## 阶段 12：真实模型、工具和 Office 纵切

- [ ] 锁定 Hermes 经 new-api/国产模型完成真实流式 run
- [ ] 完成至少一个安全只读工具调用
- [ ] 完成一个需要审批的写/执行工具调用
- [ ] 完成用户拒绝审批后的可解释收敛
- [ ] 完成运行中 Stop 和后续继续/重试
- [ ] 完成输出文件写入用户项目并在 UI 打开
- [ ] 完成 App 重启后恢复任务
- [ ] Office 官方工作台完成第一条黄金流程
- [ ] 逐步建立 5 场景 × 10 次 Windows 质量基线，结果同步 003/007/009

## 阶段 13：稳定性、安全和诊断

- [ ] 失败注入：断网、new-api 5xx、模型超时、SSE 断开、工具崩溃
  - [x] `POST /v1/runs` 明确返回 503 时不创建本地幽灵 run，不隐式重放，释放 operation reserve 后只允许显式重试
  - [x] `POST /v1/runs` 超时时不附着未知 run、不写用户消息 journal，并释放 operation reserve；上游是否已创建 run 无法从锁定协议确认，保留发布风险
  - [x] SSE 工具失败与 `run.failed` 经过 normalizer → journal → emit 后一致收敛为 failed，并清空 active run
  - [x] SSE 断开先查询 status，有限重连、replay 去重，耗尽后持久化 degraded/resumable
  - [ ] 真实 new-api 5xx/模型超时/断网/工具子进程崩溃 E2E
- [ ] 失败注入：端口冲突、runtime 文件损坏、config 损坏、磁盘不足
- [ ] 失败注入：App 强退、Hermes 强退、睡眠恢复、系统重启
- [ ] 审核所有日志和诊断包的 secret/用户内容脱敏
- [ ] 验证 loopback/bearer、权限和路径边界
- [ ] 验证工作台不能修改全局 `~/.hermes` / `~/.codex`
- [ ] 验证 WORK 失败不拖垮 CODE surface
- [ ] 性能分析：冷启动、事件吞吐、长会话内存、任务列表规模
- [ ] 建立上游 Hermes 升级 contract regression 流程

> 2026-07-12：阶段 13 第一组已建立跨 `client → runner/registry → TaskStore journal` 的 fake HTTP/SSE 故障矩阵。它证明明确 503、请求超时、SSE 断流和工具失败在本地状态机中的收敛行为，但不能证明真实 new-api、Hermes 工具子进程或 Windows 网络栈。尤其 create-run timeout 没有上游 run id/idempotency key，BlackRain 只能拒绝本地附着和自动重放，不能证明上游没有接受该请求，因此总项保持未完成。

## 阶段 14：Windows 发布闭环

- [ ] Windows x64 完成前端 typecheck/test/lint/DS checks
- [ ] Windows Rust `cargo check` 和相关测试通过
- [ ] 构建 NSIS 并检查 Hermes runtime、LICENSES、provenance、checksums
- [ ] 安装后无需开发工具启动 WORK surface
- [ ] Credential Manager 写读清理通过
- [ ] 真实模型、工具、审批、Stop、恢复和 Office 黄金流程通过
- [ ] 卸载后无失控 Hermes/MCP 进程
- [ ] 卸载默认保留用户项目和按策略保留 App data
- [ ] SmartScreen/签名/杀毒误报策略有真实记录
- [ ] 更新 spec 007 发布矩阵，不用本 spec 替代 Windows 总验收

## 阶段 15：核心闭环后的能力评估

- [ ] 评估 Hermes `model_routes` 是否进入工作台模型路由
- [ ] 评估多 Profile 是否映射工作台隔离，避免与 008 状态重复
- [ ] 评估 Memory provider UI 与外置共享记忆策略
- [ ] 评估 session export 是否成为交付/审计能力
- [ ] 评估 PTY、Cron、MOA、自验证的真实垂类价值
- [ ] WhatsApp/Telegram/Discord 等渠道另行决策，不默认进入桌面 MVP

## 收口纪律

- [ ] 每次 Goal/PR 更新本 tasks 和 verification，失败也记录
- [ ] 勾选项必须有代码位置、测试输出或 Windows 人工证据
- [ ] “静态 UI 存在”不得替代真实 Hermes run
- [ ] “macOS 测试通过”不得替代 Windows 发布
- [ ] “Hermes 上游支持”不得替代 BlackRain 已接入
- [ ] 与 003/007/008 冲突时同步修正或在 decisions 标待决
- [ ] 未完成风险在最终 PR 和发布说明中明确列出
