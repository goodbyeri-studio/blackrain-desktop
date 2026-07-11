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

- 决策：首版在 App data 下使用 `work/tasks.v1.json` 原子快照和 `work/events/<task_id>.ndjson` 归一化事件 journal，保存 BlackRain task ↔ workbench/project ↔ Hermes session/run 映射。
- 原因：当前仓库没有 SQLite 依赖；低频任务元数据适合原子 JSON，高频事件需只追加，不能每个 delta 重写整份文件；该结构也能支持 App 重启恢复和 schema migration。
- 替代方案：只用 localStorage、只存 Hermes session id、每事件重写单一 JSON、立即引入 SQLite。
- 影响范围：阶段 6、恢复、诊断和卸载数据保留策略。
- 后续复查条件：性能/一致性测试证明 journal compaction 或 SQLite 是必要条件时迁移物理后端，但保持 `WorkTask`/`WorkEvent` contract。

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

## 2026-07-12：Windows runtime 使用锁定基础依赖加最小 API server 补包

- 决策：Windows x64 runtime 使用 uv-managed CPython 3.12.8，按 Hermes `uv.lock` 执行 `uv sync --frozen --no-dev --no-editable`，不启用任何 extra；仅从锁定的 `messaging` 解析结果中约束并额外安装 API server 直接需要的 `aiohttp==3.14.1`。
- 原因：`gateway.platforms.api_server` 直接 import `aiohttp`，但启用完整 `messaging` 会同时引入 Telegram、Discord、Slack 等桌面 MVP 不需要的渠道依赖，扩大包体、License 和攻击面。
- 替代方案：安装 `hermes-agent[messaging]`、随首启联网安装、PyInstaller/Nuitka 单文件封装、要求用户预装 Python。
- 影响范围：`windows-x64.manifest.json`、`vendor-hermes-runtime.ps1`、release、doctor、NSIS resources 和第三方清单。
- 后续复查条件：锁定 Hermes 将 API server 依赖移入 core，或 BlackRain 正式决定支持某个消息渠道；任何变更都需重新生成 inventory/checksum 并跑 Windows 矩阵。

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
