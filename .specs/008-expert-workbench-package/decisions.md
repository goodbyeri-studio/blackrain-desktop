# Decisions

> 决策只说明选了什么，不证明实现完成。若后续代码推翻本设计，必须同步 requirements/design/tasks/verification。

## 2026-07-12：BlackRain 的核心商品是工作台

- 决策：把工作台定义为“可安装的专家数字工作环境”，而不是 Prompt、Markdown 文件夹或插件集合。
- 原因：BlackRain 的差异化在于复制高手电脑里的工具、环境、方法和验证，而不是再做一个通用 Agent。
- 替代方案：继续以通用办公 Agent、双引擎或模型广场作为产品第一主语。
- 影响范围：README、docs/01～09、工作台目录、插件边界、UI 信息架构、市场和路线图。
- 后续复查条件：Office 和第二套垂类工作台都无法通过统一包协议复现时，重新评估抽象层级。

## 2026-07-12：保留四级价值台阶，但正式关系改为组合

- 决策：对外保留 `Skill → 插件 → 工作台 → 工作室`；正式架构写成 `Skill + 插件 + 环境 + 资源 + 验证 → 工作台 → 工作室`。
- 原因：Skill 是方法，插件是工具，两者平级；环境和验证不能被隐藏成实现细节。
- 替代方案：把 Skill 严格视为插件的下一级，或新增更多营销层级。
- 影响范围：产品术语、Manifest、市场商品和工作室设计。
- 后续复查条件：用户研究显示四词台阶造成持续误解。

## 2026-07-12：工作台与用户项目分离

- 决策：工作台是版本化可分发模板和环境；项目是用户运行实例。升级/卸载默认不得删除用户项目。
- 原因：否则工作台更新会破坏用户资产，也无法安全回滚。
- 替代方案：把工作台直接复制进每个项目并允许任意修改。
- 影响范围：安装路径、升级、fork、备份和卸载语义。
- 后续复查条件：需要支持用户深度修改工作台时，设计显式 fork/overlay。

## 2026-07-12：App 保持唯一配置写入者

- 决策：工作台只声明需要的 Skills、插件、环境和权限，由 Core 映射到 Hermes/codex；工作台脚本不得直接写全局引擎配置。
- 原因：保持现有运行时铁律，避免多个包互相污染和触碰用户 `~/.codex`。
- 替代方案：允许每个工作台运行任意安装脚本修改引擎配置。
- 影响范围：激活接口、权限和安装沙盒。
- 后续复查条件：无。

## 2026-07-12：首版只支持官方 Windows x64 工作台

- 决策：首版协议先为官方 Office 参考工作台服务，不同时开放第三方市场和跨平台。
- 原因：环境复现、安全、License 和卸载本身已足够复杂；先用真实工作台验证最小抽象。
- 替代方案：一开始设计完整跨平台 marketplace package manager。
- 影响范围：schema、测试矩阵和发布范围。
- 后续复查条件：Office 工作台完整闭环通过后，用第二垂类检验抽象。

## 2026-07-12：依赖分为四种来源

- 决策：依赖使用 `bundled`、`managed`、`system`、`user-provided` 四类。
- 原因：同时覆盖可随包工具、受控下载、商业宿主软件和用户账号/License，避免假装所有环境都能打进安装包。
- 替代方案：所有依赖随包，或全部要求用户手工安装。
- 影响范围：Manifest、安装计划、License 和卸载。
- 后续复查条件：第二垂类出现无法表达的依赖类型。

## 2026-07-12：Manifest v1 使用严格 YAML contract，首版只 inspect 官方 Windows x64 包

- 决策：`workbench.yaml` v1 使用 UTF-8 YAML，由 maintained `serde_yaml_ng` 解析；每层结构拒绝未知字段。v1 只接受 Windows x64 与 WORK engine，包内文件必须是无 symlink、无 `..` 的相对路径，bundled/managed 依赖必须提供 SHA-256 且安装范围为 App-managed。首个 App command 只按官方 allowlist id 定位随包资源，不接受前端任意 package path；当前只读 inspect，不签发 activation。
- 原因：YAML 适合专家/封装者维护，但宽松解析、任意路径和前端传包根都会直接扩大执行面。先冻结可审计的官方包最小 schema，可在不伪造 installer 的前提下让 UI 展示真实依赖、权限和保留策略。`serde_yaml` 原包已 deprecated，因此不用它作为新长期真源。
- 替代方案：JSON-only Manifest、手写 YAML 解析、直接把 YAML 透传引擎、接受任意本地路径、或在 schema/health 尚未验证时直接写 activation store。
- 影响范围：shared workbench manifest core、Office 包结构、bundled inspect Tauri command、WORK 未激活空状态和后续 install plan。
- 后续复查条件：进入 install PR 前补 BlackRain semver、磁盘空间、签名/信任根、dependency resolver、Daemon RPC 和正式 permission approval；第二垂类验证后才允许扩展平台/engine 枚举。

## 2026-07-12：激活产物与 Manifest 分离为受限运行 contract

- 决策：Manifest 仍描述工作台最大声明；Core 在 install/verify/permission 全部通过后，另行签发版本化 `ActivatedWorkbenchContext v1` 给执行 surface。context 只包含身份、受控路径、资源引用、无值 environment ref 和 permission grant，不包含 secret、环境值或任意命令。
- 原因：直接把 Manifest 或前端输入交给 Hermes/codex 会让未验证声明进入运行时，也无法证明当前项目、权限和激活版本对应。独立 activation context 是静态包与运行实例之间的安全接缝。
- 替代方案：把 Manifest 原样传引擎、让工作台启动时自行生成 env/MCP 配置，或只传 workbench id 后由各 surface 猜测资源。
- 影响范围：阶段 2 activation store、App/Daemon RPC、009 WORK surface、未来 CODE 工作台激活。
- 后续复查条件：Manifest schema v1 冻结时补齐从 active state 生成 context 的字段映射和持久化签名；v1 不允许加入可执行配置。

## 2026-07-12：activation store 由 Core 独占写入，surface 只读

- 决策：activation context 持久化在 Tauri App data 下版本化 `workbenches/activations.v1.json`；Core 提供原子替换、容量、schema、重复 ID 和 symlink 门禁。同一 `activationId` 的资源身份不可变，只允许刷新 `verifiedAt`；项目、版本、Skills、插件、权限等变化必须签发新 ID。执行 surface 只能通过 local-only list/read command 消费；普通前端没有 create/update/delete 命令。内部 `persist_verified` 预留给阶段 2 install/verify/permission 全部成功后的生命周期状态机。
- 原因：如果 surface 或工作台包能自行写 activation，就能伪造“已验证”状态，门禁只剩命名。先冻结只读接缝，可以让 009 停止接受前端任意项目路径，同时不谎称 008 安装器已经存在。
- 替代方案：把 context 放在项目目录、允许前端写 JSON、由每个 surface 维护自己的 activation store，或在 008 完成前继续硬编码 Office 身份。
- 影响范围：阶段 2生命周期、009 WORK task start、未来 CODE surface、deactivate/upgrade/rollback 和审计。
- 后续复查条件：正式 activate/deactivate 实现时，将内部写入方法收口进状态机并补 generation/signature/revision 证据；不得为 UI 方便开放通用写命令。

## 2026-07-12：插件安装产物与 activation 引用分离

- 决策：Core 在 App data 下维护版本化 `plugins/runtimes.v1.json`，记录已安装且已验证的 plugin/version、managed install root、受控 MCP server 和 child env key→typed reference 描述；activation 只携带 plugin/version/MCP/environment reference，不携带 command、args、cwd、env value 或 transport。009 在创建/继续 run 前从该 store 解析并复核路径，实际值只从系统凭据进入当前 Hermes 进程。当前 `persist_verified` 只是未来 install/verify pipeline 的内部底层接缝，不对前端暴露，也不代表安装生命周期已经完成。
- 原因：Manifest 是最大声明，activation 是权限收敛后的运行引用，verified runtime 才是可执行制品真源。三者合并会让包声明或 UI 输入直接变成任意进程启动能力。
- 替代方案：让工作台把 MCP command 直接写进 Hermes config，或由每个 surface 自己管理插件安装状态。
- 影响范围：阶段 2 install/verify/activate、插件卸载 ownership、009 MCP binding 和未来 CODE surface。
- 后续复查条件：正式 installer 实现时补齐 hash/signature/License/permission/rollback/uninstall 事务，并让 store 只由该事务写入。

## 2026-07-12：deactivate 不等于 uninstall，且绝不删除用户项目

- 决策：首个 009 消费侧 deactivate 接缝只移除 activation 和引擎 binding，并停止该运行实例的受控任务/进程；不删除工作台安装版本、插件 runtime 或用户项目。activation 记录最后删除，使前序失败可重试。完整 uninstall 仍需未来 installer 根据资源 ownership 和共享引用单独执行。
- 原因：停用是运行状态变化，卸载是受控制品所有权变化；混为一个命令会误删共享插件或用户资产，也破坏升级/回滚。
- 影响范围：阶段 2 deactivate、阶段 3 uninstall、009 WORK command 和 UI 文案。
- 后续复查条件：正式 lifecycle state machine 接通后，deactivate 先写入 generation/audit；uninstall 仅清理明确归 Core 所有且引用为零的资源。

## 2026-07-12：system capability 只携带 Core allowlist 资源身份

- 决策：activation 中的 `systemCapability` 只保存 Core 认识的无值资源 ID。首个 allowlist 项为 `officecli-1.0.117`；009 只能把它解析到 BlackRain App data 下的受控 OfficeCLI 安装根，并在启动 Hermes 时前置到该子进程的 `PATH`。Manifest、前端和工作台均不能提供可执行路径或任意 PATH 片段。
- 原因：系统能力不是 secret，也不是任意环境变量。如果 activation 可以携带路径，包声明或 UI 就能绕过 install/verify，将任意目录提升为 Hermes 工具来源。
- 替代方案：把 OfficeCLI 绝对路径写入 activation、使用通用 `PATH` environment reference、继承用户 shell 中偶然存在的 OfficeCLI，或将 system capability 交给凭据解析器。
- 影响范围：008 dependency install/verify/activation producer、009 Hermes launch environment 和 Office 黄金流程。
- 后续复查条件：正式 installer 必须把 OfficeCLI 安装到版本化受控目录，校验锁定 SHA-256 与 `--version` 后才签发该 capability；升级时通过新 activation/generation 切换，不能就地复用未经复验的身份。

## 2026-07-12：首个 Office lifecycle 使用显式权限确认和确定性项目 activation

- 决策：官方 Office v0.1.0 只接受 `workbenchId + 用户通过系统目录选择器选中的既有项目目录`。Core 从 App allowlist 解析包和 Windows x64 OfficeCLI，先复制到受控 staging/版本目录、校验 SHA-256 与 `--version`，再在 App-data 临时目录执行 create→文件存在→validate smoke；不在用户项目制造安装探针文件。只有全部通过，才以规范化项目路径的稳定摘要生成 activation/project/grant ID。`active.json`/`state.json` 只记录已验证安装版本，多个项目实例分别持久化为 `ActivatedWorkbenchContext`，互不覆盖。前端必须通过 DS modal 展示项目读写、OfficeCLI 进程、网络声明和项目保留语义后才调用。App 启动不再自动准备 OfficeCLI。
- 原因：项目路径是首版唯一必须由用户提供的运行实例输入；其他安装路径、二进制和权限上限都应来自 Core/Manifest。稳定 ID 让同一包与项目的失败重试保持幂等，同时避免普通前端获得 activation store 写权限。
- 替代方案：App 启动即复制 OfficeCLI、让前端传 Skill/二进制路径、随机创建重复 activation、在未跑 health 时直接写 store，或继续把 Office 交给 CODE 临时注入。
- 影响范围：shared lifecycle、App command、WORK controller/surface、Office 资源准备和 009 阶段 11。
- 后续复查条件：当前只支持首次安装/复用同版本，不代表升级事务。进入升级前必须增加 generation、旧 active 备份、失败回滚、共享依赖引用计数和崩溃恢复；Windows 实机证据仍是发布门禁。

## 2026-07-12：activation generation 不可变，任务只在 run 边界显式迁移

- 决策：继续用新 `activationId` 表达每个不可变 generation，不给旧 activation 增加可变资源 revision。既有 task 默认 pinned 到原 activation；只有同 workbench、同规范化 project、无 active run 且目标 activation 的 install / verify / permission 全部通过时，Core 才能显式迁移。Hermes session 可保留，但下一次 run 必须从新 activation 生成 binding。迁移先持久化 pending audit，再以 connect-before-swap 准备 runtime/router；失败时原子恢复旧 task binding、旧 active generation 和旧工具集合。
- 原因：资源热更新、工作台升级和任务继续共享同一身份问题。静默改写 activation 会让历史任务无法证明执行时使用的 Skills、插件、权限和环境；active run 中迁移又会混合两个工具集合并破坏审批与事件归属。
- 替代方案：就地修改 `activations.v1.json`、所有任务自动跟随 active version、运行中切换 generation、创建新 session 才允许升级、或由工作台/surface 自行迁移。
- 影响范围：activation store、TaskStore、生命周期状态机、009 Hermes binding、动态 MCP router、升级/回滚/卸载引用和审计 UI。
- 后续复查条件：shared Core migration 状态机、audit schema、router connect-before-swap 与代码级补偿已实现；仍需锁定 Hermes next-turn、配置回滚失败、App 强退恢复和 Windows process-tree 验证。代码存在不代表产品验证完成。

> 实现更新：`WorkTask` 使用可选 `activationMigrations` 历史，旧 snapshot 通过 `serde(default)` 兼容；成功迁移把 task activation/version 与 completed audit 同文件原子写入，失败记录不改变 source generation。App command 仅接受 task、target activation 和枚举 reason，并在 `hermes_activation_gate` 内完成 verified target/plugin 复核、router connect-before-swap、binding/readiness、commit 与补偿回滚。当前没有升级 UI，也不把代码级补偿逻辑当作真实 Hermes/Windows 回滚证据。

## 被推翻的方案

### 2026-07-12：工作台主要是纯 Markdown

- 原方案：工作台主要由 AGENTS.md、Skills、模板和少量插件组成，近似零编译内容包。
- 为什么推翻：无法表达预装环境、专业工具、商业宿主软件、依赖、权限、升级和验证，也无法兑现“复制高手电脑”。
- 替代方案：工作台是声明式专业环境包；Markdown/Skills 只是其中一类资源。

### 2026-07-12：双引擎是用户第一层产品分类

- 原方案：WORK 与 CODE 是两个平级首页入口，工作台只属于 WORK。
- 为什么推翻：用户购买的是专业环境，不应先理解执行引擎；软件开发本身也可以被理解为一套官方专业工作台。
- 替代方案：用户优先按工作台和项目进入；Core 根据工作台选择 WORK/CODE surface，底层仍保持双引擎边界。
