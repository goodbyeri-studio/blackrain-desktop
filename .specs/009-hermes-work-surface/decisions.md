# Decisions

> 决策记录不证明代码或验证已完成。实现推翻决策时必须同步 requirements/design/tasks/verification，并保留被推翻方案。

## 2026-07-12：WORK surface 是当前产品实现 P0

- 决策：在 CODE surface 非阻塞收尾之前，优先完成 Hermes WORK surface 的真实端到端闭环。
- 原因：普通和专家工作台默认依赖 Hermes，但当前壳内实现为零；没有 WORK surface，BlackRain 仍只是 Codex 壳，无法验证新的产品定位。
- 替代方案：继续优先打磨 CODE GUI、市场或完整工作台安装器。
- 影响范围：`apps/desktop`、003、007、008 和 Office 官方工作台。
- 后续复查条件：WORK 已完成 Windows 真实闭环并能承载 Office 黄金流程。

## 2026-07-12：spec 009 是长期完整闭环，不按单次 Goal 时长裁剪

- 决策：tasks 覆盖从 runtime、进程、协议、UI、工作台激活到 Windows 发布的完整长期任务；Goal 每次推进可完成部分。
- 原因：为“一晚能做完”裁剪 spec 会丢失长期边界并制造重复规划。spec 是持续真源，不是单次执行计划。
- 替代方案：只记录最小聊天页面和短期里程碑。
- 影响范围：tasks、verification 和后续 Goal 工作方式。
- 后续复查条件：无；只允许按真实实现调整任务，不按时间预算删除闭环要求。

## 2026-07-12：视觉统一使用 Codex/BlackRain，功能结构参考 Hermes Desktop

- 决策：WORK surface 使用现有 BlackRain/Codex App 风格；Hermes Desktop 用于功能、状态和交互参考。
- 原因：用户应感知一个产品；直接嵌入 Hermes Electron UI 会形成两套 chrome、状态和技术栈。
- 替代方案：直接运行 Hermes Desktop、iframe/嵌入其页面、完整复制主题。
- 影响范围：前端组件、design system、信息架构和 MIT 复用流程。
- 后续复查条件：现有 DS 无法表达某类 Hermes 任务状态时扩展 DS，而不是引入第二套主题。

## 2026-07-12：先做真实纵切，再移植高级面板

- 决策：runtime→run→SSE→tool→approval→output 的真实链路优先于 Skills/Memory/Provider/Cron/MOA 等完整 Dashboard。
- 原因：静态页面不能验证执行器；高级面板会扩大范围并掩盖核心链路缺失。
- 替代方案：先复制 Hermes Desktop 大量页面，再接后端。
- 影响范围：tasks 阶段顺序和 PR 拆分。
- 后续复查条件：核心纵切稳定后按产品价值启用阶段 10/15。

## 2026-07-12：产品任务主通道使用 `/v1/runs`

- 决策：WORK 正式任务使用 `/v1/runs` + structured SSE + approval/stop；`/v1/chat/completions` 只用于诊断或兼容。
- 原因：危险工具和长任务需要审批、停止、状态和恢复；无状态 chat 接口不能形成可靠产品闭环。
- 替代方案：用 Chat Completions 模拟所有工具生命周期。
- 影响范围：Rust client、event model、UI 和测试 fixtures。
- 后续复查条件：Hermes 发布更稳定且等价的新任务协议。

## 2026-07-12：Hermes 原始协议不进入现有 Codex thread reducer

- 决策：为 WORK 建立独立 domain model/reducer，只共享 engine-neutral 展示组件。
- 原因：两个协议的身份、生命周期和恢复语义不同；强行伪装会污染 CODE 保真链路并形成大量条件分支。
- 替代方案：把 Hermes 事件转换成假 app-server events，完全复用 Codex 状态层。
- 影响范围：`src/features/work`、Tauri contract 和消息组件抽取。
- 后续复查条件：未来形成经过两个 surface 验证的统一 task model 时再上移，不提前抽象。

## 2026-07-12：Hermes 是 App 纳管的本地黑盒

- 决策：App spawn 锁定 Hermes gateway，使用独立 `HERMES_HOME`、loopback 和 bearer；不运行系统服务，不读用户全局 Hermes 配置。
- 原因：符合唯一配置写入者、可卸载、可诊断和工作台隔离要求。
- 替代方案：要求用户预装 Hermes、连接任意远程 URL、复用 `~/.hermes`、安装系统服务。
- 影响范围：runtime packaging、process supervisor、config 和安全边界。
- 后续复查条件：企业版明确需要受管远程 WORK backend 时新增 adapter，不改变本地默认。

## 2026-07-12：首版允许 WORK local-only，但必须显式标记

- 决策：共享领域逻辑落 `shared/*`；本地 Tauri App 完成 supervisor，Daemon/remote backend 可暂时返回明确 unsupported。
- 原因：当前产品目标是 Windows 本地客户端；为了形式 parity 提前实现远程进程管理会扩大风险。
- 替代方案：首个 PR 同时实现 App/Daemon 全 parity，或完全把逻辑写死在 App adapter。
- 影响范围：后端 command 和远程错误处理。
- 后续复查条件：远程 backend 成为正式产品路线或 WORK 需要远程执行。

## 2026-07-12：工作台只提供激活上下文，不能写 Hermes 配置

- 决策：008 输出结构化 `ActivatedWorkbenchContext`，009/Core 将其映射到 Hermes。
- 原因：保持 App 是唯一配置写入者，避免工作台之间污染和恶意扩大权限。
- 替代方案：每个工作台附任意脚本直接修改 `config.yaml`、`.env` 或全局 Skills/MCP。
- 影响范围：008/009 接缝、权限和插件激活。
- 后续复查条件：无。

## 2026-07-12：复制 Hermes UI 必须逐文件存证

- 决策：默认参考行为并用现有 DS 重写；复制源码时记录路径、commit、License 和修改，更新 NOTICE/THIRD-PARTY。
- 原因：Hermes Desktop 虽为 MIT，但文件可能依赖 Electron 或其他第三方组件；整包复制会增加合规和维护风险。
- 替代方案：认为同仓 MIT 即可无差别复制所有前端源码。
- 影响范围：阶段 0/10、代码注释和发行 NOTICE。
- 后续复查条件：Hermes 上游许可证或目录结构变化。

## 2026-07-12：Hermes runtime 属于 BlackRain 基础包

- 决策：Windows Hermes runtime 由 BlackRain 固定版本、vendor、校验、打包、升级和卸载；不作为某个工作台通过 008 自行安装的 managed runtime。
- 原因：Hermes 是所有普通/专家工作台的默认执行底座，必须由唯一配置写入者统一保证来源、版本、进程和卸载安全。
- 替代方案：每个工作台携带自己的 Hermes/venv，或首次激活时从公网安装。
- 影响范围：阶段 3、spec 007 resources/NSIS、spec 008 runtime dependency 表达。
- 后续复查条件：未来允许多个经过签名和兼容性验证的 Hermes runtime channel；即使如此仍由 Core 管理，工作台不能直接写入。

## 2026-07-12：任务映射使用版本化快照加事件 journal

- 决策：首版在 App data 下使用 `work/tasks.v1.json` 原子快照和 `work/events/<task_id>.ndjson` 归一化事件 journal，保存 BlackRain task ↔ workbench/project ↔ Hermes session/run 映射。事件提交顺序固定为先 append+sync journal、后原子替换 snapshot；启动时从 journal 修复 snapshot sequence/终态。EOF 处未换行且无法解析的截断尾可丢弃，完整损坏行、倒序/重复 sequence 和 event id 冲突必须 fail closed；metadata 删除允许重试清理已脱离 snapshot 的孤立 journal。
- 原因：当前仓库没有 SQLite 依赖；低频任务元数据适合原子 JSON，高频事件需只追加，不能每个 delta 重写整份文件。journal-first 允许 snapshot 写失败或 App 强退后恢复；对任意损坏都静默跳过则会掩盖中段数据丢失，只有可证明是最后一次未完成写入的 EOF 截断可以安全修复。
- 替代方案：只用 localStorage、只存 Hermes session id、每事件重写单一 JSON、立即引入 SQLite。
- 影响范围：阶段 6、恢复、诊断和卸载数据保留策略。
- 后续复查条件：性能/一致性测试证明 journal compaction、并发 writer 或 SQLite 是必要条件时迁移物理后端，但保持 `WorkTask`/`WorkEvent` contract。

## 2026-07-12：锁定 Hermes SSE 不具备断点重放

- 决策：将 v2026.7.7.2 `/v1/runs/{id}/events` 视为无 cursor、无 replay 的单消费事件流；BlackRain 不把重连描述成上游续流。
- 原因：锁定源码在 consumer 结束时删除 `_run_streams` 队列，协议没有 `Last-Event-ID` 或事件查询接口。
- 替代方案：断线后无条件重新 GET 同一 events URL并假设会补齐历史事件。
- 影响范围：fake server、normalizer、task journal、断流恢复和 orphaned/degraded UI。
- 后续复查条件：上游提供有测试保证的 cursor/replay contract 后重新审计并升级 fixtures。

## 2026-07-12：商业计量与 BYOK 不在 WORK 客户端隐式定案

- 决策：credit/套餐/BYOK 服从 spec 002，WORK→new-api 路径服从 spec 003；009 只接收结构化 provider/model desired state 和 secret reference。
- 当前实现校准：Hermes config/keyring/launch primitive 已存在，但产品代码尚无 App-owned producer 调用 `configure_runtime_desired_state` 与 `provider_secret_set`。因此首次 runtime start 会诚实返回未配置/缺凭据，不能把底层 primitive 写成端到端 provider 已接通。
- 原因：客户端私自固化 provider key、模型路由或套餐判断会绕过服务端计量和统一配置边界。
- 替代方案：为了先跑通，在 Hermes config 中直接写死生产 key 或 BYOK 策略。
- 影响范围：阶段 2、5、11、12 和设置 UI。
- 后续复查条件：002/003 对生产认证、模型目录和 BYOK 权限做出正式决策。

## 2026-07-12：Hermes secret 只通过 keyring 和进程环境注入

- 决策：`config.yaml` 只保存命名 provider、`key_env` 和非敏感模型配置；`API_SERVER_KEY` 与 provider API key 使用独立 keyring namespace，启动时注入受控子进程环境，不生成 Hermes `.env`。
- 原因：`.env` 会把长期 secret 以明文落到 App data；工作台、诊断包或错误日志更容易误读。keyring 与短期进程环境符合 App/Core 唯一配置写入者和 Windows Credential Manager 目标。
- 替代方案：把 key 写入 `config.yaml`、Hermes `.env`、项目目录或工作台包。
- 影响范围：阶段 2、4、5、Windows Credential Manager 验收和诊断脱敏。
- 后续复查条件：企业 secret broker 成为正式能力时，把 keyring 实现替换为 secret reference resolver；仍不得把明文写入工作台或项目。

## 2026-07-12：Windows runtime 使用锁定基础依赖、MCP extra 和最小 API server 补包

- 决策：Windows x64 runtime 使用 uv-managed CPython 3.12.8，按 Hermes `uv.lock` 执行 `uv sync --frozen --no-dev --no-editable --extra mcp`；另外仅从锁定的 `messaging` 解析结果中约束并安装 API server 直接需要的 `aiohttp==3.14.1`。manifest 额外冻结并由 vendor/doctor 精确检查 `mcp==1.26.0`、`starlette==1.0.1` 和 `aiohttp==3.14.1`。
- 原因：`gateway.platforms.api_server` 直接 import `aiohttp`；工作台插件接入又依赖 Hermes 原生 `tools.mcp_tool` 和 MCP SDK。若保持无 extra，MCP config 会成为无法注册工具的空壳。启用完整 `messaging` 仍会引入 Telegram、Discord、Slack 等桌面 MVP 不需要的渠道依赖，扩大包体、License 和攻击面。
- 替代方案：安装 `hermes-agent[messaging]`、随首启联网安装、PyInstaller/Nuitka 单文件封装、要求用户预装 Python。
- 影响范围：`windows-x64.manifest.json`、`vendor-hermes-runtime.ps1`、release、doctor、NSIS resources 和第三方清单。
- 后续复查条件：锁定 Hermes 将 API server 依赖移入 core，或 BlackRain 正式决定支持某个消息渠道；任何变更都需重新生成 inventory/checksum 并跑 Windows 矩阵。

## 2026-07-12：MCP 可执行配置只来自 Core verified plugin runtime store

- 决策：App data 下建立 `plugins/runtimes.v1.json` 和 `plugins/installed/` 管理根。只有未来 008 install/verify pipeline 能持久化 `VerifiedPluginRuntime`；普通前端、工作台包和 activation 都只能引用 plugin/version/MCP/environment id，不能提交 command、args、env value/config fragment、cwd 或 transport。verified runtime 可声明受限 child env key → typed environment reference 映射，但不保存值。首版仅允许 managed stdio MCP，执行前重新验证绝对路径、插件版本目录、managed root、完整祖先链无 symlink、文件存在、参数/超时/数量有界和资源身份不可变。
- 原因：activation 只证明引用被授权，不应同时成为可执行配置来源；否则前端或包内容可以绕过安装验证启动任意进程。运行前复核还能防止已验证后磁盘路径被 symlink 替换。
- 替代方案：把 MCP command 放进 activation/Manifest 后直接写入 Hermes config，或允许用户界面添加任意本地 MCP server。
- 影响范围：`plugin_core.rs`、008 install/verify 接缝、Hermes binding 和后续插件管理 UI。
- 后续复查条件：008 正式 installer 接通后，将 `persist_verified` 收口进安装事务并增加签名、hash、权限和卸载 ownership；不得开放通用写命令。

## 2026-07-12：整体 MCP server 变更使用空闲态受控重启（已被 App-managed router 决策取代）

- 历史决策：已注册 server 内部的工具增删交给锁定 Hermes 原生 `notifications/tools/list_changed`；新增、删除或改变整个 server 时曾采用 idle-only binding replacement + Hermes restart。该方案在 router 实现前保持正确性，但不能满足当前对话存活的产品目标，现已由下方 App-managed router 实现取代。project safe root 等进程环境变化仍必须受控重启。
- 锁定协议证据：`hermes-upstream` 当前为 tag `v2026.7.7.2` / commit `9de9c25f620ff7f1ce0fd5457d596052d5159596`。`tui_gateway/server.py` 确有私有 RPC `reload.mcp`、`skills.reload`，CLI 也有 `/reload-mcp`、`/reload-skills`；但 BlackRain 产品接入的 `gateway/platforms/api_server.py` 注册路由中没有 MCP/Skills register、unregister 或 reload endpoint。`notifications/tools/list_changed` 只通知已连接 server 内部工具集合改变，不能新增或移除整个 server。
- 原因：锁定 `/v1` surface 没有 server register/unregister/reload endpoint，而直接在对话执行中杀进程会丢失不可重放的 SSE。空闲态重启能复用原装 Hermes 的启动注册路径，并确保旧 stdio 子进程随 Windows process tree 收敛。
- 替代方案：修改 Hermes Agent loop、伪造 registry、运行中直接改 config 并假设生效、或调用未进入锁定 HTTP contract 的 CLI `/reload-mcp`。
- 影响范围：阶段 4/11、task start/continue、App exit、Windows process tree 和 deactivate。
- 后续复查条件：上游提供稳定且可鉴权的动态 server 生命周期 API，并完成运行中无事件丢失的真实验证后，可去掉 restart；在此之前“动态挂拔不重启进程”仍未完成。Windows 还必须故障注入验证新旧 MCP 子进程都随对应 process tree 收敛。

## 2026-07-12：整 server 热挂拔需要 App-managed MCP router 和 activation 升级合同

- 决策：不通过 `/v1/runs` 发送伪造的 `/reload-mcp` 用户输入，也不调用 TUI/消息 gateway 私有 reload 接口。若要在 Hermes 进程与当前对话存活时增加/移除整个 MCP server，目标架构是让 Hermes 始终只连接一个 BlackRain-owned MCP router；App 通过 loopback + 高熵 bearer 的内存控制面向 router 提交 Core 已验证的 server runtime 与短期 secret，router 先连接新子进程再原子切换工具集合，并向 Hermes 发 `notifications/tools/list_changed`。
- 原因：锁定 `9de9c25` 的 `tools/list_changed` 只刷新已建立 MCP connection 内的工具；API Server `/v1` 没有 reload endpoint，`/v1/runs` 直接构造 AIAgent，不经过 GatewayRunner slash-command 分发。与此同时，008 activation 不可变且资源变化必须签发新 ID，现有 task continuation 又必须匹配旧 activation；没有 generation 迁移合同就热改工具会破坏任务来源证据。
- 替代方案：调用 `tui_gateway reload.mcp`、把 `/reload-mcp now` 当用户 run、让工作台直接改 `config.yaml`、把新 secret 写入 router desired-state 文件，或静默改写旧 activation。
- 影响范围：spec 008 activation upgrade、009 task/session identity、Hermes config、plugin runtime、router 制品与 Windows process tree/secret 验证。
- 后续复查条件：008 已冻结并实现 `old activation → new generation` 的 shared Core、task/session 迁移和补偿接缝；router/control/connect-before-swap/子进程回收与真实 MCP ClientSession E2E 已实现，仍需验证锁定 Hermes next-turn 与真实 runtime/Windows 回滚。

> 008 已冻结前置合同：新 `activationId` 表达不可变 generation；task 默认 pinned，只能在终态、无 active run、同 workbench/project 且目标资源完整验证时显式迁移；session 可保留但下一 run 使用新 generation；runtime/router 失败必须恢复旧 task activation 与工具集合。合同冻结检查点当时不代表 migration Core 或 router 已实现；当前代码水位见下方实现更新。

> 实现更新：generation migration Core、task snapshot audit 与 local-only Tauri/TS 接缝已落地；命令只接受 task、target activation 和 reason enum，并在 runtime binding/router readiness 后 commit。router 与代码级补偿已实现，真实锁定 Hermes next-turn 和 Windows 补偿回滚仍未验证，因此动态热挂拔总项仍不完成。

## 2026-07-12：Hermes 始终只连接一个 App-managed MCP router

- 决策：Hermes `config.yaml` 只注册 loopback Streamable HTTP `blackrain-router`，Authorization 只写 `${BLACKRAIN_MCP_ROUTER_BEARER}` 占位符。App 使用随包 Hermes Python 启动 BlackRain 自有 router；MCP endpoint 与 control endpoint 使用不同随机端口和不同高熵 bearer，所有 bearer 只驻内存。下游仍限 Core verified managed stdio runtime；App 从 credential store 临时解析 child env value，经 control PUT 提交内存 generation，router 在新集合全部连接/list 成功后才原子 swap，并向现存 Hermes session 发送 `notifications/tools/list_changed`。
- 原因：锁定 Hermes `/v1` 没有整个 server reload API，直接重启会打断当前对话；让 Hermes 长期连接稳定 router 可以在不 fork Agent loop、不调用私有 API 的前提下动态改变工具集合。双 bearer 避免 Hermes 获得 App control 权限；下游 secret 不再进入 Hermes config、Hermes process env、项目或 lease。
- 替代方案：继续 idle-only restart、让 Hermes 直接连接全部下游、给 Hermes control bearer、把 generation/secret 落盘、调用 TUI reload，或 fork Hermes MCP registry。
- 影响范围：Hermes runtime resource/vendor/doctor、config/launch environment、App supervisor/exit/startup audit、verified plugin runtime、task start/continue、activation migration 与 Windows process tree。
- 后续复查条件：Python 与 Rust 自动化已覆盖真实 stdio/HTTP client、connect-before-swap、失败保留、remove cleanup、notification、双 bearer、无 secret lease 和 supervisor 生命周期；锁定 Hermes 真实 next-turn 已补证，仍需 Windows bundled runtime/NSIS/强退/process tree 与 Office 工具验证。完成这些证据前不勾选阶段 11 总项。

## 2026-07-12：router 保留只读状态工具作为 Hermes next-turn 刷新锚点

- 决策：App-managed router 始终发布 `blackrain_workbench_status`。它不代理任何下游能力，只返回当前 generation id、server id 和公开工具名；输入为空对象，结果不含 bearer、环境值、路径、credential reference 或 secret。下游工具总量上限包含该锚点。
- 原因：锁定 Hermes 收到 `tools/list_changed` 后会立即更新全局 registry，但 `build_turn_context` 的下一轮刷新先调用 `has_registered_mcp_tools()`。移除最后一个下游工具会使该检查为 false，旧 agent snapshot 因而无法删除最后一个工具。稳定锚点让 registry 始终非空，同时保持 Hermes 原装黑盒；真实集成探针已证明同一 agent/session 在下一 turn 完成空集合→新增→真实调用→再次空集合的快照收敛。
- 替代方案：修改 Hermes 的 `has_registered_mcp_tools`、调用私有 reload、重启 Hermes、保留已经移除的下游假工具、或假设每个工作台永远至少有两个 MCP 工具。
- 影响范围：router 公开工具 contract、总工具数量门禁、Hermes prompt 工具表、阶段 11 集成测试与 Windows runtime hash。
- 后续复查条件：若上游稳定版本允许已连接零工具 server 触发 agent snapshot rebuild，可评估移除锚点；在此之前不得删除。Windows 仍需验证 bundled Python/MCP SDK、最后一个 child process tree 回收和 App 强退。

## 2026-07-12：run 创建失败按“未附着”收敛，超时不猜测上游结果

- 决策：只有 `POST /v1/runs` 返回可解析的 `run_id` 后，Core 才把 run/session 和本地用户消息 journal 原子附着到 task。明确 4xx/5xx 或连接错误会释放 registry reserve；不会创建本地 active run，也不会在 client/runner 内自动重放。请求超时时同样保持 task 原状态，但明确记录“上游可能已接受、BlackRain 无法确认”的协议风险。
- 原因：锁定 `/v1/runs` 没有 idempotency key，也没有按 BlackRain request id 查询 run 的 endpoint。超时可能发生在上游创建 run 之后、响应到达之前；此时自动重试会产生重复执行，凭空生成本地 run id 又会破坏身份核对。
- 替代方案：超时后自动重发 prompt、把 request id 当 run id、扫描所有 session 猜测对应 run，或把未知请求直接标成成功。
- 影响范围：`client.rs`、`runner.rs`、TaskStore、follow-up queue、阶段 12/13 真实模型故障矩阵。
- 后续复查条件：Hermes 提供正式 idempotency key 或 request-id→run 查询 contract 后，增加可证明的创建对账；在此之前 UI 只能提示创建结果不确定并允许用户显式检查/重试，不能声称 exactly-once。

## 2026-07-12：run id 返回后本地持久化失败必须停止上游

- 决策：`POST /v1/runs` 成功后，若 TaskStore 无法 journal-first 写入本地用户消息或 snapshot，runner 立即取消本地 stream token、best-effort 调用 `/stop`、释放 registry，并把持久化错误返回调用方。没有耐久 task/run 映射时不启动 SSE、不向前端 emit，也不把 task 标为 running。
- 原因：Hermes 已经可能开始执行工具；若只返回磁盘错误而不停止，上游会形成用户看不见、App 无法恢复的失控 run。反过来，先把 UI 标 running 再异步写 journal 会破坏“持久化后可见”铁律。
- 替代方案：忽略 journal 错误继续 stream、只在内存保存 run id、或等 App 下次启动扫描 session 猜测对应 run。
- 影响范围：`runner.rs`、TaskStore、阶段 13 磁盘/权限故障注入和 Windows App-data 验收。
- 后续复查条件：Windows 实机注入磁盘不足、只读 App data、杀进程和 stop 请求失败；当前 fake server 只证明 stop 被尝试以及本地状态不附着，不能证明上游一定及时停止。

## 2026-07-12：Hermes supervisor 拥有完整子进程树

- 决策：App `ExitRequested` 先取消受控 SSE，再等待 Hermes supervisor stop 完成后真正退出。Windows 继续使用 `taskkill /T`（超时后 `/F`）处理 Hermes 及其 stdio MCP 后代；Unix 开发运行把 Hermes 放入独立 process group，graceful stop 对整组发送 SIGTERM，父进程退出后仍对残留组发送 SIGKILL。
- 原因：只终止 Hermes 父 PID 时，父进程可能先退出并把 MCP child 留成孤儿；App 退出回调若不等待 stop，又可能在清理完成前结束进程。
- 替代方案：只依赖 `Child::kill_on_drop`、只删除 PID lease、让每个 MCP 自行退出，或在 App 下次启动时才清理正常退出遗留。
- 影响范围：Hermes spawn/stop、App exit、MCP server 变更、deactivate 和 Windows process-tree 验收。
- 后续复查条件：Windows 实机需用真实 Hermes+MCP 注入正常退出、超时和强退故障；若引入 Windows Job Object，可将其作为首要生命周期所有权机制，但保留 lease 审计。

## 2026-07-12：Ready 后任意非受控进程退出都属于 crash

- 决策：supervisor 仅在 `stop()` 已持有 start gate、取走 child 并主动终止进程时进入 `Stopped`。仍由 supervisor 持有的 Ready child 被 `try_wait()` 发现退出时，无论 exit code 是否为 0，一律进入 `Crashed`，保存 retryable `hermes_process_exited`、清空 pid/port 并移除 runtime lease。
- 原因：Hermes 自行以 0 退出也会让 WORK surface、活跃 SSE 和受控 MCP 突然消失；把它当正常停止会隐藏故障、让 UI 不展示 repair/restart，并误导恢复策略。
- 替代方案：exit 0 视为 stopped、只在非零退出时记录错误，或等下一次任务请求失败再更新 runtime。
- 影响范围：`process.rs`、runtime status/diagnostics、前台恢复对账和阶段 13 Hermes 强退矩阵。
- 后续复查条件：Windows 实机注入 Console close、taskkill、进程崩溃和系统重启；当前 Unix fixture 证明状态机与 lease 收敛，不证明 Windows 退出通知时序或子进程树行为。

## 2026-07-12：诊断采用结构白名单，不保存 Hermes 子进程正文

- 决策：Hermes stdout/stderr 属于不可信内容源，内存和滚动文件只记录 `<redacted Hermes process output>`，不尝试靠关键词猜测 prompt、工具参数或模型输出。supervisor 自有日志只使用固定文案和有界 error code。HTTP error envelope 的 message 不进入 WorkError；code 和 response request id 仅接受 ASCII token 白名单。可复制 diagnostics 进一步把 runtime error message 改为固定文案、清空 details 和不安全 request id，仅保留 kind/code/retryable/status。
- 原因：裸用户文本可能没有 `prompt=`、JSON key 或已知 secret，关键词替换无法给出“不含用户内容”的证明；上游/插件也可以把私密内容放进 error code、request id 或 details。诊断需要的是状态、路径形状、错误码和时序，不需要原始对话正文。
- 替代方案：继续维护敏感词表、允许用户手动勾选后复制完整日志、或把 stdout/stderr 原文只写磁盘不展示 UI。
- 影响范围：`process.rs`、`client.rs`、`runtime.rs`、WORK diagnostics 面板和阶段 13 隐私审计。
- 后续复查条件：若未来需要更丰富的上游诊断，只能增加结构化、逐字段白名单事件，不得恢复任意 stdout/stderr 或 HTTP body；Windows 需检查 App-data 滚动日志、剪贴板和 crash dump。

## 2026-07-12：Hermes 用户目录与文件写入范围双重隔离

- 决策：启动 Hermes 前将 `HOME`、`USERPROFILE`、`APPDATA`、`LOCALAPPDATA` 全部重定向到 App-data `HERMES_HOME/process-home`，并从父环境白名单移除这些变量以及任何 `HERMES_HOME`/`CODEX_HOME`。`ActivatedWorkbenchContext.project.path` 进入 Core-owned workbench binding，runtime 启动时映射为锁定 Hermes 原生 `HERMES_WRITE_SAFE_ROOT`。project root 改变属于 process environment change，只能在无 active run 时受控 restart；失败复用完整 binding/runtime 回滚。旧 binding 若缺 `projectRoot` 只允许读取以便 rebind/unbind，runtime 启动仍 fail closed；下一次当前 activation 重绑会原子升级该字段。
- 原因：仅设置 `HERMES_HOME` 不能证明某个上游模块或子工具不会用 `Path.home()`、Windows AppData 或默认 `~/.hermes` 回落；仅靠 prompt 又不能阻止 file tool 写出项目。进程 home 隔离保护默认目录，`HERMES_WRITE_SAFE_ROOT` 则让 `write_file`/`patch` 在项目外直接拒绝。
- 替代方案：继承用户 HOME/AppData、只在 instructions 中要求“不要越界”、由前端传 safe root、或让不同项目共用一个旧进程环境。
- 影响范围：activation→Hermes desired state、config binding、runtime launch environment、supervisor spawn、空闲态 restart/rollback 和阶段 13 权限矩阵。
- 后续复查条件：锁定 Hermes 的 terminal 仍依赖 dangerous-path approval 而非 OS sandbox；Windows 必须覆盖显式绝对路径、NTFS reparse point、拒绝审批和用户原有 `.hermes/.codex` 未变。若要限制项目外读取，需要独立 Windows sandbox/受控工具策略，不能把 write-safe-root 夸大为完整读隔离。

## 2026-07-12：deactivate 先收敛执行资源，最后移除 activation

- 决策：`workbench_activation_deactivate` 为 local-only Core 生命周期命令，并与 task start/continue 共用 activation 串行锁。它先拒绝任何不同 activation 或 legacy active run；对目标 activation 的 run 尽力请求 upstream stop，随后停止单 Hermes supervisor process tree、取消受控 SSE，把仍挂载的 task run 持久收敛为 cancelled；再把 Hermes config 恢复为 provider-only、删除 workbench binding，最后从 activation store 移除记录。命令返回被停止的 task id 和原项目路径，并明确 `projectPreserved=true`。WORK UI 必须通过现有 DS ModalShell 二次确认。
- 原因：先删 activation 会让重试失去资源身份，先解绑但不停止进程又会留下旧 MCP/Skills。项目是用户资产，生命周期命令只能删除 Core-owned activation/binding，不能递归触碰项目目录。
- 替代方案：前端直接删除 activation JSON、只隐藏入口、停用时删除项目、或在另一个 activation 仍运行时停止共享 supervisor。
- 影响范围：008 deactivate 接缝、`workbench_core`、TaskStore、Tauri command、WORK controller/surface 和 Windows process tree 验收。
- 后续复查条件：多 profile supervisor 落地后按 profile 精确停止；正式 008 lifecycle state 还需增加 generation/audit/installer ownership。Windows 必须验证 `taskkill /T` 覆盖真实 MCP 子进程，本地单测不能替代。

## 2026-07-12：MCP environment 使用系统凭据加 router 内存注入

- 决策：verified plugin runtime 只声明 child env key、reference kind 和 reference id；activation 必须显式授予完全相同的 typed reference。Core 在提交 router generation 时从系统凭据服务读取 `providerCredential` 或 `managedVariable`，缺失即以 `hermes_mcp_environment_required` fail closed；实际值只进入 control request、router 内存和对应 stdio child env。`systemCapability` 永不转换为 secret。持久 binding 中的 `BLACKRAIN_MCP_SECRET_<digest>` 只作为非秘密兼容身份，不再绑定到 Hermes config/process env；Hermes 只获得自身 MCP endpoint bearer。
- 原因：把实际 token 写进 Hermes config、desired state、activation、插件 store 或 Hermes process env 都会扩大泄漏面；由 router 精确注入目标 child 可以避免不同工作台和 Hermes 内建工具读取下游 secret，同时无需修改 Agent loop。
- 替代方案：生成 `.env`、把值写入 `mcp_servers.*.env`、继承用户 shell、让插件直接读 Windows Credential Manager、或把 system capability 当字符串注入。
- 影响范围：plugin runtime schema、activation→router mapping、credential store、router control、下游 child env、diagnostics 和阶段 11 隔离。
- 后续复查条件：正式 008 credential UI/installer 接通时只新增 managed-variable 写入事务，不开放任意 process env；Windows Credential Manager 与真实 MCP child env 必须实测。

## 2026-07-12：runtime 完整性使用全文件 checksum 覆盖

- 决策：生成制品包含 `packages.lock.txt`、`LICENSES/`、`NOTICE.txt`、`provenance/` 和 `SHA256SUMS`；doctor 除校验 hash 外，还拒绝路径穿越、重复条目、符号链接、未被清单覆盖的额外文件和与冻结源 manifest 不一致的制品。
- 原因：只检查几个入口文件无法证明打包目录完整，额外未登记文件也可能绕过依赖和 License 审计。
- 替代方案：仅检查 `hermes.exe` 是否存在，或只依赖 NSIS 构建成功。
- 影响范围：vendor 脚本、doctor、发布证据和后续上游升级回归。
- 后续复查条件：未来引入签名制品清单时，可在 checksum 之上增加签名验证，但不能降低全文件覆盖。

## 2026-07-12：Hermes client 使用脱敏 trace、可取消 SSE 和有界队列

- 决策：共享 client 统一限制为 `http://127.0.0.1:<managed-port>`、必需 bearer、request id、版本 User-Agent 和有限响应体；supervisor 持有共享 trace sink，每个真实请求只记录 request id/method/受校验 path/status/outcome/elapsed，并通过 runtime diagnostics 暴露，不记录 header、bearer 或 body。SSE 支持 watch-based 主动取消，pending frame queue 上限为 1024；连接/超时错误标记为可重试，但 `create run`、approval、stop 和 session create 不在 client 内自动重放。
- 原因：锁定协议没有为这些 POST 提供 BlackRain 可验证的幂等键；网络断开时自动重试可能创建重复 run、重复审批或错误停止状态。无界 SSE queue 会在高频工具事件下拖垮 App；轮询取消又无法及时唤醒阻塞 read。重试必须由任务层结合本地 journal 和上游状态显式决策。
- 替代方案：记录完整 HTTP header/body、对所有 5xx/timeout 做通用指数退避、允许 SSE 无限缓存，或允许工作台传入任意 Hermes URL。
- 影响范围：`client.rs`、阶段 6 task store/恢复、阶段 8 actions 和故障注入测试。
- 后续复查条件：Hermes 提供正式 idempotency key/cursor contract，或任务层完成能证明安全的请求去重；阶段 7/9 将 diagnostics 接入前端时保持当前脱敏字段白名单。

## 2026-07-12：supervisor 清空继承环境并拒绝接管未知端口实例

- 决策：spawn Hermes 前执行 `env_clear`，只继承 Windows/Python 启动所需的最小系统变量，再注入 App 生成的 `HERMES_HOME`、loopback、bearer、provider secret 和 telemetry 开关；受控端口已有 listener 时不自动接管，即使它能响应 Hermes health，也必须区分未知实例和 bearer mismatch 后 fail closed。
- 原因：继承用户 shell 中的 Hermes/provider/telemetry 变量会破坏唯一配置写入者和工作台隔离；仅凭 health 接管旧进程无法证明 PID、配置、版本和密钥归 App 所有。
- 替代方案：完整继承父进程环境、随机换端口绕过冲突、发现 Hermes health 就直接复用。
- 影响范围：`process.rs`、后续 PID lease/orphan recovery、诊断 UI 和 Windows 故障矩阵。
- 后续复查条件：阶段 4 持久化受签名/受校验的 PID lease 后，可安全接管明确属于同一 App/profile 的孤儿实例；未知实例仍不得复用。

## 2026-07-12：异常退出恢复使用 PID lease 加多重身份验证

- 决策：spawn 成功后在独立 `HERMES_HOME` 写入版本化 `runtime-lease.v1.json`，记录 instance id、PID、受控端口、入口路径和 Hermes 版本；正常 stop/已知退出删除 lease。下次 Windows 启动先通过 `Get-CimInstance` 核对 executable/command line，再按端口状态验证 health、锁定版本、bearer 和 required capabilities，最后才允许 `taskkill /T /F` 清理。
- 原因：只保存 PID 会遭遇 PID reuse 误杀；只看端口/health 又不能证明进程属于当前 App。进程身份、lease 和 bearer 三者组合才能在不修改 Hermes 黑盒的前提下形成保守恢复边界。
- 替代方案：发现 lease 就无条件 kill、随机换端口遗忘旧进程、把 bearer 明文写进 lease、自动接管任何 Hermes health 实例。
- 影响范围：supervisor、App Windows 启动审计、repair UI、强退/系统重启测试和卸载清理。
- 后续复查条件：Windows Job Object 可稳定覆盖 Hermes 及受控工具进程时，lease 仍保留作诊断/重启恢复，但异常退出的首要回收可转为 kill-on-job-close。

## 2026-07-12：runtime commands 只消费 App-owned desired state

- 决策：runtime status/start/stop/restart/repair/diagnostics 命令不接受任意 host、port、binary 或 env；Hermes 固定使用 App 管理端口 `8642`，start/repair 只从独立 `HERMES_HOME/desired-state.v1.json` 和 keyring 解析运行配置与 secret。desired state 只保存非敏感 provider/model 配置，并先于派生的 `config.yaml` 落盘，使中途写入失败仍可显式 repair。
- 原因：允许前端或工作台直接传进程参数会绕过唯一配置写入者、loopback/bearer 和 bundled runtime 边界；固定受控端口也让 lease、冲突诊断和孤儿审计具有稳定身份。desired state 与 config 不一致时必须 fail closed，不能静默覆盖用户可见故障。
- 替代方案：每次 start 由前端传完整 launch options、随机选择端口、把 key 写入 desired state，或发现 config 漂移后自动覆盖。
- 影响范围：`config.rs`、`runtime.rs`、Tauri adapter、后续 Providers/工作台激活接缝和 repair UI。
- 后续复查条件：支持多并行 Hermes profile 时，由 Core 分配受控端口和 profile namespace；仍不允许工作台或普通前端调用方指定 binary/env。

## 2026-07-12：normalizer 使用确定性 event id 与有界无值诊断

- 决策：`WorkEvent.event_id` 由完整 raw event 的稳定序列化做 128-bit 确定性 fingerprint，再加同一 raw event 的输出索引；sequence 从 task store 提供的最后序号继续递增。进程内保留最近 20,000 个 fingerprint 去重，未知/损坏事件诊断最多 200 条，只保存受白名单约束的 event type、payload 字段名、时间和原因，不保存 payload 值。
- 原因：锁定 Hermes SSE 没有 upstream event id/cursor/replay；随机 ID 会使 App 重启后的 journal 无法识别重复事件。完整保存未知 raw payload 又可能把用户输入、命令或文件内容带入诊断。确定性 ID 允许后续 task journal 在 normalizer 重建后继续幂等。
- 替代方案：以到达 sequence 直接充当 event id、随机 UUID、完整 raw JSON 写诊断、未知事件直接报错终止 stream。
- 影响范围：`events.rs`、阶段 6 task journal/recovery、阶段 7 event bridge 和阶段 8 reducer。
- 后续复查条件：Hermes 上游提供稳定 event id/cursor 后优先采用上游 ID，同时保留 schema migration 和旧 journal 去重兼容。

## 2026-07-12：恢复采用本地先行、runtime Ready 后远端对账

- 决策：App load 只用 snapshot/journal 做无网络本地审计；managed Hermes 经 start/restart 达到 Ready 后，在不阻塞 runtime command 返回的后台任务中，用同一受控 base URL、bearer 和共享脱敏 trace 查询每个 active run。`completed`/`failed`/`cancelled` 清空 active run，运行/审批/停止态标为 resumable；只有明确 404 才标 orphaned，连接、鉴权、5xx 和未知新状态保留 active run 并降级为 degraded。远端对账只更新 task recovery metadata，不生成合成 `WorkEvent`。
- 原因：`AppState::load` 是同步装配阶段且 Hermes 默认未启动，不能把 App 装配或 runtime 启动响应阻塞在历史任务数量和网络超时上；暂时不可达不等于 run 消失，误清 active run 会破坏恢复。status 对账不是事件 replay，伪造消息/工具/审批事件会造成 UI 重复。
- 替代方案：App load 同步启动 Hermes 并查询、任何请求失败都标 orphaned、根据 status 合成完整事件流、或直接相信本地 running 状态。
- 影响范围：`recovery.rs`、TaskStore、runtime start/restart commands、后续任务列表与断流恢复。
- 后续复查条件：上游提供 cursor/replay 或正式 resume endpoint 后，将事件补齐与 status 对账组合，但仍以稳定 event id 做幂等门禁。

## 2026-07-12：WORK 事件先持久化后扇出

- 决策：shared runner 负责 task operation reserve、创建 run、task/run attach 和 SSE 消费；每批 normalized events 必须先经过 TaskStore journal-first append，Tauri adapter 只把 `appended_events` 发到单一 `work-event` channel。前端 `events.ts` 对该 channel 建一个底层 listener，再向多个消费者 fanout。runtime 停止、重启、repair 和 App exit 统一取消并清空受控 stream registry。
- 原因：如果先 emit 后写 journal，App 强退会出现 UI 看过但无法恢复的事件；如果 replay 事件也 emit，消息、工具和审批会重复。把 runner 留在 adapter 又会使 App/Daemon 未来产生两套领域编排。
- 替代方案：每个 hook 单独 `listen`、raw Hermes event 直接发前端、先 emit 再异步持久化、或把 run 生命周期全部写进 Tauri command。
- 影响范围：`runner.rs`、TaskStore append result、Hermes App adapter、`src/services/{tauri,events}.ts` 和阶段 8 reducer。
- 后续复查条件：高频 delta 需要 batching 时，只能在持久化/幂等门禁之后做有界批处理，不能改变事件先落盘再可见的顺序。

## 2026-07-12：WORK 使用独立 reducer，并缓冲先于 task metadata 到达的事件

- 决策：WORK 前端状态只存在 `src/features/work/`，不进入 Codex thread reducer。bootstrap 并行读取 runtime/tasks/recovery；`work-event` 按稳定 event id 幂等并按 sequence 合并。若新 run 的 SSE 事件先于 `hermes_task_start` promise 返回，先进入最多 100 个 task、每 task 1024 条的 orphan buffer，收到 task metadata 后再投影状态并清空 buffer。所有同 task mutation 使用同步 ref gate 串行化。
- 原因：Tauri command spawn stream 后才返回，快速 Hermes 可能让事件先于 task metadata 到达；直接丢弃未知 task 事件会让第一段消息或审批永久消失。仅靠 React state 的 pending flag 需要下一次 render 才生效，挡不住同一 tick 的双击。
- 替代方案：复用 Codex reducer、未知 task 事件直接丢弃、无限 orphan buffer、或只靠按钮 disabled state 防重复。
- 影响范围：阶段 8 reducer/selectors/controller hooks、后续任务 UI 和长任务性能优化。
- 后续复查条件：event envelope 增加完整 task metadata 或 start command 提供 preallocated task acknowledgement 时，可缩小 orphan buffer，但仍保留有界乱序保护。

## 2026-07-12：继续与重试创建新 run，active user-input 不伪造

- 决策：终态 task 的继续/显式重试必须复用持久化 `hermes_session_id`，通过新的 `POST /v1/runs` 创建 run；不自动重放旧 prompt，也不把 retry 做成隐式 POST。locked Hermes `/v1` 当前没有响应 active `user_input.request` 的正式 endpoint，因此 UI/commands 暂不声称支持该动作。
- 原因：run create 没有可验证 idempotency key，自动 retry 可能重复执行工具；TaskStore 也不把用户 prompt 额外复制成 retry payload。使用 session id 能保留上游会话 scope，同时让每次继续都是明确的用户动作。把不存在的 user-input endpoint 映射成 approval 或新 run 会破坏语义。
- 替代方案：失败后自动重发上一请求、把 run id 当长期 session 覆盖旧 session、用 approval endpoint 回填任意文本、或在 active run 旁创建并行 run。
- 影响范围：shared runner、task continue command、TS IPC/controller，以及阶段 8/9 Composer 行为。
- 后续复查条件：上游提供正式 user-input response 或幂等 retry contract 后，先更新锁定 contract/fixtures，再接 command 和 UI。

## 2026-07-12：SSE 断流先查 status，再有限退避重连

- 决策：live runner 遇到 retryable 连接/截断或 active run 的非终态 EOF 时，先 `GET /v1/runs/{run_id}`；若终态或 404 立即收敛，若仍活跃则按 250ms/750ms/1500ms 最多三次退避重连。收到真实新事件后可重置连续失败计数；replay 事件由进程内 raw fingerprint、TaskStore stable event id 和前端 reducer 三层幂等。非 retryable 错误不重连。
- 原因：锁定 SSE 没有 cursor/replay，盲目无限重连会形成热循环且无法判断 run 是否已结束；完全不重连则把短暂网络抖动变成手工恢复。先查 status 能区分终态、orphaned 和仍活跃任务。
- 替代方案：无限立即重连、固定轮询 status 不再订阅事件、任何断流直接 failed、或假设每次 SSE 都完整 replay。
- 影响范围：shared runner、恢复状态、重复事件门禁和阶段 8/9 连接状态 UI。
- 后续复查条件：上游提供 cursor、Last-Event-ID 或明确 stream resume contract 后，改为协议级断点恢复，并保留当前有界 fallback。

## 2026-07-12：WORK 复用主壳 Home surface 槽位并由 MainApp 持有 controller

- 决策：Office 入口先进入现有 Home surface 槽位；`MainApp` 持有唯一 `useWorkController`，WORK 组件只消费 controller，`App.tsx` 不承载 WORK 状态机。进入 CODE workspace 时现有布局自然隐藏 Home/WORK，返回后 controller 和任务状态仍在。
- 原因：现有桌面壳已经把 Home、workspace、phone/tablet/desktop 装配集中在 `MainApp`/layout hooks；新建第二套 window chrome 或把 Hermes 状态塞进 `App.tsx` 都会破坏上游壳同步和 CODE/WORK 状态隔离。
- 替代方案：为 WORK 新建独立 Tauri window、复用 Codex thread reducer、在 `App.tsx` 写顶层路由状态机，或先交付未接 controller 的静态页面。
- 影响范围：`Home.tsx`、`MainApp.tsx`、`useMainAppLayoutSurfaces.ts`、`features/work/components/*` 和后续 008 激活入口。
- 后续复查条件：spec 008 提供正式 `ActivatedWorkbenchContext` 与工作台导航后，将 Home 入口升级为通用工作台路由；controller 所有权和单壳原则保持不变。

## 2026-07-12：WORK 渲染故障使用 feature 级边界，不升级为 App 故障

- 决策：只在 `MainApp` 的 WORK surface 槽位包裹 `WorkSurfaceBoundary`；Hermes runtime/API/task 错误继续进入独立 WORK state，React 子树发生未预期渲染异常时则显示固定脱敏 fallback，允许用户返回 CODE 或显式重试 WORK。边界不打印原始 error message/component stack，不重置 MainApp、Codex sessions 或 WORK controller。
- 原因：Hermes 已是独立子进程，但没有 React feature boundary 时，WORK 组件缺陷仍可能卸载整个主 App 树，违背“CODE surface 不因 WORK 失败而不可用”。固定 fallback 同时避免把用户任务内容随异常文本泄漏到界面或诊断。
- 替代方案：只依赖 runtime sidecar 隔离、使用 App 顶层全局 error boundary、WORK 崩溃后自动切换执行引擎、或展示原始 React 错误和 stack。
- 影响范围：`MainApp.tsx`、`WorkSurfaceBoundary.tsx`、WORK 样式和阶段 13 CODE/WORK 故障隔离验证。
- 后续复查条件：Windows 实机仍需在真实 CODE thread 活跃时强杀 Hermes、注入 WORK API/渲染故障并确认 CODE 对话、输入和 app-server session 持续可用；当前 jsdom 只证明 React 树隔离。

## 2026-07-12：WORK 首版 UI 全量重写并只复用 engine-neutral 展示基础

- 决策：首版 WORK surface 不复制 Hermes Desktop React 文件；复用 BlackRain 的 Markdown、按钮、Panel primitives、token 和 Codex 风格密度，Hermes 事件保持独立 domain model。诊断只显示 Core 已脱敏的结构化字段，user input 缺少上游 response endpoint 时明确只读说明。
- 原因：这能避免 Electron/preload 耦合和逐文件第三方迁移负担，同时不把不存在的上游能力伪装成可操作 UI；浏览器 QA 也证明现有 design system 足以承载消息、工具、审批和诊断状态。
- 替代方案：直接复制 Hermes Desktop session/composer/tool 组件、建立第二套 WORK design system、或用 approval/new run 冒充 user input response。
- 影响范围：阶段 9/10、NOTICE/THIRD-PARTY、组件测试和视觉验证。
- 后续复查条件：仅当现有组件无法覆盖已确认的产品行为时，再逐文件评估 Hermes MIT 源码并记录来源；否则继续重写。

## 2026-07-12：高频 WORK event 在单 listener 后按帧分批进入 reducer

- 决策：保持 TaskStore 持久化和 `appended_events` 门禁不变；前端唯一 `work-event` listener 只负责排队，以 16ms 间隔、每批最多 256 个事件 dispatch。reducer 新增批量 action，按 task 去重、排序、合并并一次更新 task 投影；积压继续排下一批，卸载时取消 timer 并清空仅属于已卸载视图的内存队列。
- 原因：Hermes 工具进度和 text delta 可能在短时间产生大量事件；逐事件 dispatch 会制造同量 React render/reducer clone。事件在进入 listener 前已经 journal-first 持久化，因此 UI 内存队列无需承担可靠存储职责，也不能把节流前移到持久化门禁之前。
- 替代方案：丢弃中间 delta、在 Tauri adapter 未持久化前合并、每个事件立即 dispatch、无限单批处理全部积压，或在 reducer 中反复递归单事件 action。
- 影响范围：`useWorkController`、WORK reducer/tests、长任务 UI 性能和阶段 13 性能基线。
- 后续复查条件：Windows WebView 长会话性能数据证明 256/16ms 不合适时可调整批大小/节奏；不得降低事件幂等和持久化顺序。

## 2026-07-12：性能门禁区分代码级防退化与 Windows 产品基线

- 决策：代码级常驻 guardrail 使用生产批大小 256 连续归并 10,000 个事件、投影长消息、统计序列化状态体积，并对 5,000 个任务执行 hydration/排序选择；Rust supervisor fixture 记录 spawn 到 health/capabilities/models Ready 的冷启动。阈值刻意宽松，只阻止数量级退化；本机实测值写入 verification。真实 Hermes、Windows WebView heap/CPU、包体和冷启动另建产品基线，不用 fixture/Node 数字替代。
- 原因：没有可重复支架时性能结论只是一组容易失效的手工数字；但把 macOS debug fixture 或 Node object serialization 当作 Windows 产品 SLA 同样会制造虚假完成。两层证据必须分开。
- 替代方案：只写一次性 stopwatch 结果、在普通单测里设置紧凑毫秒阈值、用 serialized JSON 直接声称真实 heap 占用、或等到 Windows 发布前才发现 reducer/任务列表数量级退化。
- 影响范围：WORK reducer/selectors、Hermes supervisor test、阶段 13 性能分析和阶段 14 Windows 发布验收。
- 后续复查条件：Windows 实机必须测冷启动 P50/P95、Hermes/受控 MCP RSS、WebView 长会话 heap、事件积压/掉帧和 5,000 任务可交互性；获得三轮稳定数据后再制定产品 SLA，并据此调整当前宽松 guardrail。

## 2026-07-12：Hermes 升级必须通过单一 contract regression 入口

- 决策：`scripts/check-hermes-contract.py` 是 Hermes 锁升级的可执行门禁。静态层交叉校验 Windows runtime manifest、`fetch-references.sh`、干净 exact-tag checkout、MIT LICENSE/pyproject/uv.lock SHA-256、从上游 Python AST 提取的必需路由、当前 tag fixtures 与必需 capabilities；完整层继续运行锁定上游 API/Windows/Skills/file safety/approval pytest、BlackRain Hermes Rust tests 和前端 types/events/Tauri wrapper tests。日常命令只维护在 `docs/commands.md`。
- 原因：只校验 commit 或只跑 BlackRain fake fixtures，都无法发现上游 route、事件、安全门禁、依赖锁或许可证变化；手工复制多条命令又容易漏项。单入口让升级 PR 可以先 fail closed，再基于明确 diff 更新 contract。
- 替代方案：跟随 Hermes `main`、只跑 `cargo check`、直接覆盖旧 fixtures、依赖 README 路由清单、或由 runtime vendor 阶段才发现许可证/依赖漂移。
- 影响范围：Hermes 版本升级、Windows runtime manifest/vendor、spec 003/009 verification、fixtures 与维护者 runbook。
- 后续复查条件：上游测试重命名或协议升级时必须先让旧入口失败，再审阅上游 diff、更新 route/feature/fixture allowlist 和存证；脚本通过仍不替代真实 new-api/Windows/Office 产品验收。

## 2026-07-12：Windows 正式发布脚本必须执行 WORK 专项门禁

- 决策：`release-client-win.ps1` 在任何 vendor/build 前无条件运行 Hermes static contract；未使用 `-SkipChecks` 时必须运行前端 typecheck/test/lint/DS/codemod、`doctor:win`、Rust `cargo check` 以及 Hermes/workbench/plugin 专项测试，再允许 NSIS build。`-SkipChecks` 只用于已明确承担风险的本地重试，不能绕过上游锁/hash/route/fixture 静态门禁和 runtime vendor。
- 原因：旧发布脚本只跑 typecheck/test/cargo check，可能在 WORK 主链专项、DS 或 Hermes 上游 contract 已坏时仍产出安装包；Windows 是唯一 MVP 发布线，正式入口必须覆盖核心执行器。
- 替代方案：依赖开发者手工先跑命令、只靠 Ubuntu/Windows CI 的现有部分检查、或等安装后人工发现 runtime/contract 缺失。
- 影响范围：spec 007/009 Windows verification、release script、Hermes runtime vendor 与 NSIS 构建前置条件。
- 后续复查条件：首次 Windows 实跑需记录耗时和失败点；若专项总时长不可接受，只能通过缓存/CI 复用证据优化，不得静默删除发布门禁。

## 2026-07-12：Windows CI 先覆盖代码级 WORK contract，不冒充 runtime E2E

- 决策：现有 Windows runner 扩充前端 typecheck/test/lint/DS/codemod 与 Rust check/Hermes/workbench/plugin 专项；不在普通 PR job vendor Hermes runtime、启动 `/v1`、打 NSIS 或宣称真实 WORK 可用。
- 原因：这能让 Windows cfg、文件语义和 WORK contract 在合并前至少编译/测试，同时保持“CI 不能替代 runtime/GUI/安装实测”的证据边界。
- 替代方案：只保留 macOS/Ubuntu 共享测试、每个 PR 构建完整胖包、或把 workflow 配置存在直接勾成 Windows 产品通过。
- 影响范围：`.github/workflows/ci.yml`、spec 007/009 verification 和根 agent 规则。
- 后续复查条件：首次 workflow run 后才能填写 Windows 通过证据；runtime/NSIS 未来进入 CI 时必须单列 job/制品与失败边界。

## 2026-07-12：系统恢复、前台或网络在线时只重新对账并挂接已有 run

- 决策：Tauri 在 `RunEvent::Resumed` 发出唯一 `work-environment-reconcile` 事件；WORK controller 将它与 window focus、document visible 和 browser online 合并，250ms 去抖后并行刷新 runtime/tasks/recovery/activations。只有 runtime Ready 且 TaskStore 返回 `degraded + activeRunId` 时才调用现有 resume command。多个同时到达的环境事件合并成一次对账，组件卸载时清理 Tauri/browser listener 和 timer。
- 原因：系统休眠或网络中断可能让有限 SSE 重连耗尽，但上游 run 仍在执行。resume command 会先 GET status，再挂接同一 run 的 events；它不创建新 run、不重放 prompt，符合幂等和黑盒边界。仅靠浏览器 online 不能判断 Hermes 进程健康，因此必须先查询受控 runtime。
- 替代方案：窗口聚焦就重新 POST run、自动重放上一条 prompt、对所有 running/waiting task 重复 attach、或完全依赖用户手工点击恢复。
- 影响范围：`useWorkController`、阶段 4 休眠/网络恢复、阶段 9 connection UI 和阶段 13 故障注入。
- 后续复查条件：当前已接 Tauri runtime resume，但仍需 Windows 实机确认系统睡眠确实产生该事件，并覆盖离线→在线、Hermes 存活/退出和 SSE 已耗尽三种组合；代码完成不能替代产品验收。

## 2026-07-12：ActivatedWorkbenchContext 只由 Core 签发且不携带可执行配置

- 决策：008→009 使用版本化 `ActivatedWorkbenchContext v1`。它携带 activation/workbench/project/task 身份、绝对 skill roots、插件/MCP ID、无值 environment references、permission grant 和 verified timestamp；不携带 secret、任意 env value、MCP command/args、binary path、host 或 port。009 只能把已验证 context 单向降维成 `WorkbenchHermesDesiredState`。
- 原因：如果前端或工作台包能直接传进程/环境配置，就会绕过 008 install/verify/permission 和 App 唯一配置写入者。环境只传 reference，MCP 必须引用已激活 plugin，文件 grant 必须覆盖项目，才能让 WORK task 的来源可审计。
- 替代方案：继续由 Home 硬编码 workbench/version、把完整 manifest 直接传 Hermes、允许前端传 env map/MCP command，或只用一个未经验证的 workbench id。
- 影响范围：shared `workbench_core`、Hermes desired state、008 activation store、009 task start 和后续 App/Daemon commands。
- 后续复查条件：008 Manifest v1 和 activation persistence 冻结后，可扩展签名摘要/activation generation；必须通过 schema version 升级，不能给 v1 偷加可执行字段。

## 2026-07-12：正式 WORK task 只接受 Core 持久化的 activationId

- 决策：`hermes_task_start` 不再接收前端提供的 workbench id/version/project path，只接受 `activationId + prompt`。App 从 `%APPDATA%/BlackRain/workbenches/activations.v1.json` 对应的 Tauri App data 路径读取完整 context，重新校验后创建任务；新 `WorkTask` 持久化 `activationId`，旧任务迁移时允许该字段为 `null`。前端只能 list/read，不能写 activation；`persist_verified` 仅供未来 008 install/verify pipeline 内部调用。
- 原因：只在 UI 隐藏入口不能形成安全门禁，任意前端调用仍可伪造项目和工作台身份。由 Core-owned store 读取且任务保留 activation 身份，才能支持后续停用、隔离、审计和升级归属；旧任务必须继续可恢复，不能为了新增证据字段破坏现有 snapshot。
- 替代方案：继续接收前端 workbench/version/project、把完整 context 作为 command payload、为开发方便暴露 activation 写命令，或新增字段后拒绝所有旧任务。
- 影响范围：`workbench_core` store、AppState/Tauri commands、Hermes task start/TaskStore contract、WORK controller/surface 和 spec 008 activation producer。
- 后续复查条件：008 完成正式 install/verify/activate/deactivate 后，将内部写入入口接入生命周期状态机，并在 deactivate 时按 `activationId` 收敛任务和受控进程；普通前端仍不得获得任意写权限。

## 2026-07-12：项目上下文与文件引用由 Core 注入 Hermes instructions

- 决策：每次 start/continue 都从持久 activation 生成 Core-owned instructions，包含 workbench/version、已验证项目根和 permission grant。Composer 可选择最多 16 个项目内现有文件，但前端只提交结构化 `projectFileRefs`；shared `workbench_core` 重新校验绝对路径、项目包含关系、存在/regular file、重复和完整相对链无 symlink 后，才把引用路径加入 instructions。用户 prompt 保持原文。
- 原因：Hermes 进程 cwd 是独立 `HERMES_HOME`，只发送 prompt 会让 agent 不知道用户项目；在前端拼绝对路径既无法形成信任边界，也会让 transcript 混入内部上下文。锁定 `/v1/runs` 会把 multipart input 展平成文本，不支持 BlackRain 可依赖的二进制附件 contract。
- 替代方案：把 Hermes cwd 改成项目目录、允许前端传任意 instructions/path、读取文件内容后内联进 prompt，或把项目文件引用伪装成上传附件。
- 影响范围：activation→run、task start/continue contract、WORK Composer、项目文件安全门禁和阶段 9 消息/附件体验。
- 后续复查条件：上游提供版本化 multimodal/file input 后另建 typed content contract；当前仍只表达项目内文件引用，不升级为二进制附件。

## 2026-07-12：每轮用户消息由 BlackRain journal-first，Hermes 回显只作兼容输入

- 决策：`POST /v1/runs` 返回真实 run id 后，shared TaskStore 用确定性 `<run_id>:local-user-message` 事件把原始 prompt 与已验证 `projectFileRefs` 写入同一任务 journal，并在 snapshot 写失败时回滚本次 journal append；成功后 App 才向前端 emit。新 run 的 SSE consumer 检测到该本地事件时抑制同 run 的上游 `user.message`，旧任务没有本地事件时仍保留上游 normalizer fallback。
- 原因：文件引用如果只停留在 Composer React state，发送后和 App 重启后都会消失；如果依赖 Hermes 回显，又无法保证引用元数据存在，并会与本地即时展示产生重复气泡。BlackRain 是工作台 transcript 的持久化真源，必须先落盘再展示。
- 替代方案：前端乐观插入临时消息、把引用拼进 prompt、无条件删除 normalizer 的 `user.message` 支持、或同时展示本地与上游两条用户消息。
- 影响范围：TaskStore run attach、runner SSE 门禁、Rust↔TypeScript `WorkEvent` contract、WORK 消息 UI 和 App 重启恢复。
- 后续复查条件：durable follow-up queue 也必须复用 Core-owned 持久化语义；不得退回仅存在 React state 的队列。若上游未来提供事件 cursor/idempotency，应继续保留单一 transcript 真源并升级去重依据。

## 2026-07-12：follow-up 使用 Core 持久队列，starting 不自动重放

- 决策：每个 task 使用独立版本化 follow-up envelope，最多 32 项；队列项保存 prompt、已验证项目文件引用、可选 instructions/model、状态、attempt id 和脱敏错误。active run 期间只执行 enqueue/edit/cancel；当前 run 终态后 Core 将队首先标记 `starting`，再创建同 session 新 run，成功后移除，失败则标 `failed` 并暂停后续项。App 启动、runtime 远端恢复和前台对账只派发明确 `queued` 的队首；遗留 `starting` 若没有派发凭证转为失败，绝不自动 POST replay。
- 原因：锁定 Hermes `/v1` 没有 active-run steer/user-input endpoint，也没有 create-run 幂等键。React 内存 queue 会在重启时丢失；网络重连自动 POST 会重复执行工具；跳过失败队首会破坏用户顺序。`UserMessageAdded.sourceFollowUpId` 将成功 attach 的 run 与队列项关联，App 即使在 run 创建后、队列删除前退出，恢复审计也能识别已派发项而不制造可重试副本。
- 替代方案：复用 CODE 的内存 `useQueuedSend`、把 follow-up 当 active steer、SSE 重连时重发、失败后自动跳到下一项、或只在 UI 乐观删除队列项。
- 影响范围：TaskStore follow-up envelope、AppState 恢复、runner terminal 收敛、Hermes Tauri commands、独立 queue event fanout、WORK reducer/controller/Composer 和停用流程。
- 后续复查条件：真实 Hermes/Tauri/Windows 需验证两条以上队列、App 在 create/attach/queue-remove 各窗口强退、模型 5xx 后 retry、Stop 后队列、工作台停用和输出文件顺序；上游若增加正式 steer/idempotency，先更新 contract 再决定是否改变队列语义。

## 2026-07-12：任务删除只清理 Core-owned 本地记录

- 决策：WORK surface 只在终态或 orphaned task 上显示“删除记录”，通过 DS ModalShell 二次确认后调用现有 `hermes_task_delete_local_metadata`。删除范围限于 task snapshot、event journal 和 follow-up envelope；项目目录、用户输出、activation、Hermes session 上游数据均不删除。ModalShell 统一把焦点移入对话框、约束 Tab 环并在卸载后归还焦点；是否响应 Escape 由调用方显式决定。
- 原因：任务历史是 Core-owned 可清理元数据，项目与输出是用户资产；把两者混成“删除任务”会制造不可逆误删。运行中 task 需要先 Stop/收敛，不能让 UI 用删除动作绕过受控 run 生命周期。焦点规则进入共享 DS 后，停用与删除确认保持同一产品行为。
- 替代方案：侧栏直接无确认删除、递归删除项目目录、同时删除 activation、运行中强制删除、或每个 WORK modal 自己实现一套焦点逻辑。
- 影响范围：WORK header/action、TaskStore 既有 metadata removal、共享 ModalShell 可访问性、阶段 9 键盘/焦点验证。
- 后续复查条件：Windows Tauri WebView 需人工验证屏幕阅读器、Escape、Tab/Shift+Tab、200% 缩放和删除后的下一任务焦点；在这些证据完成前不勾选阶段 9 无障碍总项。

## 2026-07-12：高缩放触发窄布局时保留完整任务导航

- 决策：`760px` 以下不再隐藏 WORK task sidebar，而是把同一 DS panel/nav 原语重排为有界高度、可横向滚动的紧凑任务导航；`520px` 以下只收紧 header 文案，不移除新建、任务切换、停用或删除命令。approval 出现时默认聚焦“拒绝”，新建/编辑后聚焦 Composer，非模态诊断抽屉负责 Escape 关闭与焦点归还，transcript 使用 `role=log`。
- 原因：Windows 125%–200% 缩放和窄窗口会落入相同 CSS breakpoint；直接 `display:none` 会让用户失去任务列表和新建入口。安全审批需要明确可发现的键盘起点，诊断抽屉也不能在关闭后把焦点丢到 document。
- 替代方案：窄布局完全隐藏 task sidebar、另建第二套 mobile navigation、自动聚焦“本任务允许”、把诊断改成无焦点管理的绝对定位浮层，或只依赖鼠标。
- 影响范围：WORK task navigation、Composer、approval、diagnostics、共享 Panel primitive 属性透传和阶段 9 无障碍验证。
- 后续复查条件：当前证据只覆盖 jsdom contract 和 CSS breakpoint；必须在 Windows Tauri WebView 实测高 DPI、浏览器缩放等效场景、Tab 顺序、屏幕阅读器播报和无重叠后，才能勾选阶段 9 总项。

## 2026-07-12：Skills 使用 Hermes 原生 external_dirs，单 runtime 切换时 fail closed

- 决策：不复制 Skills 到 Hermes 自有目录，也不修改 Agent loop。Core 在创建或继续新 run 前，将 activation 的受控 `skillRoots` 写入专属 `HERMES_HOME/config.yaml` 的原生 `skills.external_dirs`，并把非敏感 binding 持久化为 `workbench-desired-state.v1.json`。绑定前递归拒绝不存在、无 `SKILL.md`、重复、超过 50,000 项/32 层或包含 symlink 的技能树；provider credential ref 必须匹配当前 App-owned provider。provider 更新、runtime restart 和 repair 都保留并重新验证该 binding。
- 原因：锁定 Hermes 已原生支持 external dirs，并按 config mtime 重新解析；使用它能继续白嫖上游而不 fork。复制目录会制造第二份生命周期和更新真源；把多个工作台 roots 合并则会让 skill catalog 串台。当前 supervisor 只有一个进程/端口，因此在另一 activation 存在 active run 时拒绝切换，比静默并存更安全。
- 替代方案：复制/软链到 `HERMES_HOME/skills`、把所有 activation roots 做并集、让前端传任意 external dirs、运行 `/reload-skills` 伪装成隔离，或立即引入多 profile supervisor。
- 影响范围：Hermes config/runtime、task start/continue、AppState activation gate、阶段 11 Skills 隔离和未来多 profile 评估。
- 后续复查条件：真实 Windows 并行工作台需求出现时，评估每 activation/profile 独立 `HERMES_HOME + port + supervisor`；在此之前不得放松 active-run 冲突门禁。当前代码级隔离仍需真实 Windows 多 activation/MCP/credential E2E 才能升级为产品验收结论。

## 2026-07-12：OfficeCLI 运行路径由 Core allowlist 解析并只注入 Hermes 子进程

- 决策：`SystemCapability: officecli-1.0.117` 只作为无值资源身份进入 activation/binding。Hermes runtime 启动时由 Core 将其解析为 BlackRain App data 下的 `tools/officecli`，逐级拒绝路径逃逸、缺失、目录或可执行文件 symlink，并要求存在 `officecli.exe` 或 `officecli`；通过后仅前置到受控 Hermes 子进程的 `PATH`。不写系统 PATH，不向 config 写二进制路径，也不把 capability 当 secret 解析。
- 原因：Hermes 需要通过正常工具发现机制调用 OfficeCLI，但 activation 不应获得任意进程路径注入能力。Core allowlist 能把“已验证依赖身份”与实际安装位置绑定，同时保持 App 唯一配置写入者和可升级边界。
- 替代方案：让工作台传 PATH、在用户环境中查找任意 OfficeCLI、把路径写进 prompt/config，或让 Office 工作台直接 spawn 二进制。
- 影响范围：`hermes_core/config.rs`、`hermes_core/runtime.rs`、008 Office install/verify/activation producer 和阶段 12 Office 黄金流程。
- 后续复查条件：008 producer 已完成首个代码纵切；Windows 实测仍必须证明受控安装、SHA-256、`--version`、权限、真实 Hermes 工具发现与卸载行为。在这些证据完成前不得声称 Office 可发布。

## 2026-07-12：首版不启用任意 Hermes model_routes

- 决策：当前 task/continue/follow-up 的可选 `model` 只允许等于 App-owned `desired-state.v1.json` 的默认模型；其他值在创建 run 前以 `hermes_model_route_unavailable` fail closed。首版不生成 `platforms.api_server.extra.model_routes`，也不展示可自由选择的 WORK 模型目录。
- 原因：锁定 Hermes `/v1/runs` 只有 `model` 命中 `model_routes` alias 时才覆盖全局 provider/model；未知字符串会继续使用默认模型，造成 UI 声称切换但实际没切。route 本身支持 `provider: custom:blackrain-new-api` 并通过 provider `key_env` 解析 secret，可以在未来安全使用，但 alias 必须来自 002 account broker/new-api 的可信允许目录，而不是前端或工作台自由输入。
- 替代方案：把任意 new-api 模型名原样发给 `/v1/runs`、在 route 中写 inline `api_key`、让工作台包定义 provider/base URL，或现在硬编码 flash/pro 并假设生产 token 一定允许。
- 影响范围：Hermes runtime model gate、task/follow-up commands、未来模型选择器、config renderer 和 002 provider producer。
- 后续复查条件：account broker 返回版本化 allowed-model catalog 后，App 可生成只含 alias/model/`custom:blackrain-new-api` provider 的 routes，并以 `/v1/models` 真实发现结果驱动 UI；必须补 route 切换、token model limit、未知 alias 和 secret 不落盘验证。

## 2026-07-12：首版不把工作台映射为 Hermes named Profile

- 决策：首版继续使用单个 App-owned `HERMES_HOME`、单 supervisor 和单受控 API Server。工作台隔离由 008 的不可变 activation generation、Core-owned binding、task/session 身份和 active-run 冲突门禁完成；不创建、切换、克隆、导入或删除 Hermes named Profile，也不向工作台或前端暴露 `hermes profile` 命令。Hermes Profile 不作为 workbench、project、user 或账号的产品身份。
- 原因：锁定 Hermes Profile 是完整独立状态树，拥有自己的 config、`.env`、provider key、memory、session、skills、cron、logs 和 gateway；它解决“同机运行多个独立 Hermes agent”，但不提供文件系统 sandbox。把每个 activation 再映射为 Profile 会复制 008 的安装/升级/迁移/卸载状态，产生第二个配置写入者，并把上游 CLI alias、sticky active profile、gateway service 和端口生命周期带进 BlackRain。当前单 runtime 已在 run 边界原子重绑 generation，并在另一 activation 有 active run 时 fail closed，因此首版没有引入这套并发复杂度的必要。
- 替代方案：每个工作台一个 named Profile、每个项目一个 Profile、直接启用上游 multiplex gateway，或把用户账号映射为 Profile。multiplex 主要按入站 platform/profile 路由，仍会扩展 `/p/<profile>`、credential、session namespace 和 port-binding contract，不能替代 BlackRain 的 activation 权限边界。
- 影响范围：HermesPaths 保持单 `hermes-home`；App 不增加 Profile UI/API；008 activation store 继续是工作台 generation 真源；Memory/session 的产品策略不能借 Profile 隐式决定。
- 后续复查条件：只有真实需求证明多个工作台必须并发运行，且单 runtime 的切换门禁不可接受时，才设计 Core-owned 多 runtime slot。届时每个 slot 必须使用不透明 ID、独立 `HERMES_HOME + port + supervisor + credential namespace`，补资源上限、进程回收、任务路由、Windows 包体/内存和跨 slot 串台矩阵；仍不得让工作台直接写 Profile。

## 2026-07-12：首版关闭 Hermes 持久记忆和跨 session 搜索

- 决策：App-owned Hermes managed config 必须把 `memory.memory_enabled`、`memory.user_profile_enabled` 设为 false，`memory.provider` 设为空，并在 `agent.disabled_toolsets` 中同时关闭 `memory` 与 `session_search`。首版不提供 Memory provider 选择/配置 UI，不安装 provider 的 lazy dependency，也不把某个工作台的记忆自动共享给其他工作台。专业知识由 008 管理的 Skills/资源交付，用户对话历史由 BlackRain TaskStore 按 task/activation 保存。
- 原因：锁定 Hermes 默认同时启用 `MEMORY.md` 和 `USER.md`，在 session 启动时注入快照，并允许 agent 主动写入；external provider 还会逐 turn 同步、抽取并注入上下文。当前不同 activation 复用同一个 App-owned `HERMES_HOME`，默认行为会让 Office 工作台学到的用户内容进入另一个工作台，`session_search` 也可能搜索同 home 的其他任务。Hermes Profile 能隔离这些文件但会与 008 状态重复，不能用它掩盖 scope 缺失。
- 替代方案：保留 built-in memory 只关闭 provider、把 `USER.md` 当全局账号偏好、按工作台切换时清空 memory、让用户自行选择 Honcho/Mem0/Hindsight，或依赖 prompt 要求 agent 不读取其他工作台。上述方案都缺少可执行的数据 scope、同意、来源、保留和删除合同。
- 影响范围：managed `config.yaml` 渲染/漂移检查、运行时 repair、未来 Memory UI、任务隐私边界和 Windows 多 activation 串台验证。旧 managed config 缺少显式禁用块时按 drift fail closed，并由显式 repair 重写。
- 后续复查条件：只有 App 定义并实现至少 `user/workbench/project` scope、数据来源、写入审批、敏感信息策略、保留期、查看/纠错/删除/导出和 provider 凭据/地域/License 后，才能评估外置共享记忆；启用前必须用两个 activation 做双向零串台 E2E。

## 2026-07-12：首版不把 session export 作为交付或审计能力

- 决策：首版不增加 session export command/UI，不读取 Hermes 内部 `state.db` 或调用 `SessionDB.export_session*`。工作台交付物是用户项目中的真实输出文件；WORK transcript 只由 BlackRain TaskStore normalized journal 提供显示、恢复和本地记录。产品文案不能把当前 journal 称为不可篡改审计证据。
- 原因：锁定 API Server 只有 session list/create/read/messages 等资源，没有稳定 export 端点；上游 `hermes_state.py` 的 export 方法是内部 SQLite API，数据 shape 会随上游变化且可能包含 raw message/tool 内容。BlackRain journal 有 task、activation、run、sequence 和稳定 event id，但为隐私主动不保存 raw event、完整工具参数/结果和部分诊断，也没有签名、时间戳证明或 custody chain，无法证明完整性。把聊天导出当交付还会弱化“真实文件落到用户项目”的工作台成功标准。
- 替代方案：直接复制 Hermes SQLite/JSONL、导出上游 raw session、把诊断包改名审计包、默认自动上传 transcript，或把 Markdown 聊天记录视为 Office 任务交付。
- 影响范围：首版 WORK UI 不增加导出入口；阶段 12 仍以项目输出文件验收；未来 enterprise audit、支持诊断和用户数据导出必须分开设计。
- 后续复查条件：真实客户需要任务交接或监管留痕时，另建 living spec，从 Core-owned 单 task/activation 生成显式用户触发的 Markdown 与版本化 JSON；必须冻结字段白名单、reasoning/tool 参数与文件引用策略、脱敏预览、权限、导出位置、hash/signature、保留/删除和 schema migration，并证明不会越过 activation 或混入其他 session。

## 被推翻的方案

### 2026-07-12：先做一个静态 WORK 页面再说

- 原方案：先复制聊天界面和侧栏，后续再接 Hermes。
- 为什么推翻：容易形成演示性假完成，无法验证审批、工具、停止、恢复和崩溃处理。
- 替代方案：以最薄真实纵切为第一实现目标，UI 和 runtime 同步推进。

### 2026-07-12：直接使用 Hermes Desktop 作为 WORK surface

- 原方案：启动或嵌入 Hermes Electron Desktop，BlackRain 只负责跳转。
- 为什么推翻：形成双桌面壳、双配置写入者和两套品牌；无法与工作台/Core/账号/权限统一。
- 替代方案：原装 Hermes Agent 作为黑盒，BlackRain 自建 Tauri WORK surface。

### 2026-07-12：把 Hermes 事件伪造成 Codex app-server 事件

- 原方案：最大化复用现有 threads reducer，把 Hermes payload 转成假的 codex payload。
- 为什么推翻：协议语义不同，长期会在 CODE 保真核心堆积 WORK 特例并破坏上游同步。
- 替代方案：独立 adapter/reducer，共享纯展示组件。
