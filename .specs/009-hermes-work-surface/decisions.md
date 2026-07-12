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

- 决策：App data 下建立 `plugins/runtimes.v1.json` 和 `plugins/installed/` 管理根。只有未来 008 install/verify pipeline 能持久化 `VerifiedPluginRuntime`；普通前端、工作台包和 activation 都只能引用 plugin/version/MCP id，不能提交 command、args、env、cwd 或 transport。首版仅允许 managed stdio MCP，执行前重新验证绝对路径、插件版本目录、managed root、完整祖先链无 symlink、文件存在、参数/超时/数量有界和资源身份不可变。
- 原因：activation 只证明引用被授权，不应同时成为可执行配置来源；否则前端或包内容可以绕过安装验证启动任意进程。运行前复核还能防止已验证后磁盘路径被 symlink 替换。
- 替代方案：把 MCP command 放进 activation/Manifest 后直接写入 Hermes config，或允许用户界面添加任意本地 MCP server。
- 影响范围：`plugin_core.rs`、008 install/verify 接缝、Hermes binding 和后续插件管理 UI。
- 后续复查条件：008 正式 installer 接通后，将 `persist_verified` 收口进安装事务并增加签名、hash、权限和卸载 ownership；不得开放通用写命令。

## 2026-07-12：整体 MCP server 变更使用空闲态受控重启

- 决策：已注册 server 内部的工具增删交给锁定 Hermes 原生 `notifications/tools/list_changed`；新增、删除或改变整个 server 时，Core 只在不存在 active WORK run 时替换版本化 workbench binding。若 Hermes 已 Ready，则取消受控 stream、重启 Hermes 并重新做 task recovery；session/task metadata 保留。binding 变更前保存旧 binding/config/last-good 的内存回滚快照；新 runtime readiness 失败时恢复旧文件并尝试重新拉起旧 runtime，返回结构化 `hermes_mcp_transition_failed` 和回滚/恢复状态。任一 active run 存在时在写 config 前 fail closed。Skills-only 变化不触发重启。
- 原因：锁定 `/v1` surface 没有 server register/unregister/reload endpoint，而直接在对话执行中杀进程会丢失不可重放的 SSE。空闲态重启能复用原装 Hermes 的启动注册路径，并确保旧 stdio 子进程随 Windows process tree 收敛。
- 替代方案：修改 Hermes Agent loop、伪造 registry、运行中直接改 config 并假设生效、或调用未进入锁定 HTTP contract 的 CLI `/reload-mcp`。
- 影响范围：阶段 4/11、task start/continue、App exit、Windows process tree 和 deactivate。
- 后续复查条件：上游提供稳定且可鉴权的动态 server 生命周期 API，并完成运行中无事件丢失的真实验证后，可去掉 restart；在此之前“动态挂拔不重启进程”仍未完成。Windows 还必须故障注入验证新旧 MCP 子进程都随对应 process tree 收敛。

## 2026-07-12：deactivate 先收敛执行资源，最后移除 activation

- 决策：`workbench_activation_deactivate` 为 local-only Core 生命周期命令，并与 task start/continue 共用 activation 串行锁。它先拒绝任何不同 activation 或 legacy active run；对目标 activation 的 run 尽力请求 upstream stop，随后停止单 Hermes supervisor process tree、取消受控 SSE，把仍挂载的 task run 持久收敛为 cancelled；再把 Hermes config 恢复为 provider-only、删除 workbench binding，最后从 activation store 移除记录。命令返回被停止的 task id 和原项目路径，并明确 `projectPreserved=true`。WORK UI 必须通过现有 DS ModalShell 二次确认。
- 原因：先删 activation 会让重试失去资源身份，先解绑但不停止进程又会留下旧 MCP/Skills。项目是用户资产，生命周期命令只能删除 Core-owned activation/binding，不能递归触碰项目目录。
- 替代方案：前端直接删除 activation JSON、只隐藏入口、停用时删除项目、或在另一个 activation 仍运行时停止共享 supervisor。
- 影响范围：008 deactivate 接缝、`workbench_core`、TaskStore、Tauri command、WORK controller/surface 和 Windows process tree 验收。
- 后续复查条件：多 profile supervisor 落地后按 profile 精确停止；正式 008 lifecycle state 还需增加 generation/audit/installer ownership。Windows 必须验证 `taskkill /T` 覆盖真实 MCP 子进程，本地单测不能替代。

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

## 2026-07-12：恢复到前台或网络在线时只重新对账并挂接已有 run

- 决策：WORK controller 监听 window focus、document visible 和 browser online，250ms 去抖后并行刷新 runtime/tasks/recovery；只有 runtime Ready 且 TaskStore 返回 `degraded + activeRunId` 时才调用现有 resume command。多个同时到达的环境事件合并成一次对账，组件卸载时清理监听器和 timer。
- 原因：系统休眠或网络中断可能让有限 SSE 重连耗尽，但上游 run 仍在执行。resume command 会先 GET status，再挂接同一 run 的 events；它不创建新 run、不重放 prompt，符合幂等和黑盒边界。仅靠浏览器 online 不能判断 Hermes 进程健康，因此必须先查询受控 runtime。
- 替代方案：窗口聚焦就重新 POST run、自动重放上一条 prompt、对所有 running/waiting task 重复 attach、或完全依赖用户手工点击恢复。
- 影响范围：`useWorkController`、阶段 4 休眠/网络恢复、阶段 9 connection UI 和阶段 13 故障注入。
- 后续复查条件：Windows 提供稳定的 Tauri/native power-resume signal 后，把它加入同一 schedule 入口；当前 focus/visibility/online 仍需 Windows 睡眠实机验证后才能勾选总项。

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

## 2026-07-12：Skills 使用 Hermes 原生 external_dirs，单 runtime 切换时 fail closed

- 决策：不复制 Skills 到 Hermes 自有目录，也不修改 Agent loop。Core 在创建或继续新 run 前，将 activation 的受控 `skillRoots` 写入专属 `HERMES_HOME/config.yaml` 的原生 `skills.external_dirs`，并把非敏感 binding 持久化为 `workbench-desired-state.v1.json`。绑定前递归拒绝不存在、无 `SKILL.md`、重复、超过 50,000 项/32 层或包含 symlink 的技能树；provider credential ref 必须匹配当前 App-owned provider。provider 更新、runtime restart 和 repair 都保留并重新验证该 binding。
- 原因：锁定 Hermes 已原生支持 external dirs，并按 config mtime 重新解析；使用它能继续白嫖上游而不 fork。复制目录会制造第二份生命周期和更新真源；把多个工作台 roots 合并则会让 skill catalog 串台。当前 supervisor 只有一个进程/端口，因此在另一 activation 存在 active run 时拒绝切换，比静默并存更安全。
- 替代方案：复制/软链到 `HERMES_HOME/skills`、把所有 activation roots 做并集、让前端传任意 external dirs、运行 `/reload-skills` 伪装成隔离，或立即引入多 profile supervisor。
- 影响范围：Hermes config/runtime、task start/continue、AppState activation gate、阶段 11 Skills 隔离和未来多 profile 评估。
- 后续复查条件：真实 Windows 并行工作台需求出现时，评估每 activation/profile 独立 `HERMES_HOME + port + supervisor`；在此之前不得放松 active-run 冲突门禁。MCP/env/session 仍需独立实现和验证，不能用本决策冒充整项隔离完成。

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
