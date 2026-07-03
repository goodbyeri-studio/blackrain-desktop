# codex 能力底账(CODE 引擎)

> 本文是 CODE 模式引擎(openai/codex 的 Rust 内核 codex-rs)的**功能事实底账**,与 [hermes-capability-ledger.md](hermes-capability-ledger.md) 并列,供双引擎能力 diff 与「CODE 模式照抄 codex 到什么颗粒度」决策用。
> 全部结论基于**本地源码逐文件核查**,分析基线为 commit `51b3cd5`(`codex-upstream/codex-rs/`,Apache-2.0,105 crate)。
> ⚠️ **2026-06-28 内核已跟进到 `bdd282f`**(协议四探针复测全绿)。相对分析基线**新增 13 个 ClientRequest/通知方法**(thread/delete、thread/items/list、thread/backgroundTerminals/{list,terminate}、currentTime/read、environment/info、externalAgentConfig/import/{progress,readHistories}、account/{workspaceMessages/read,rateLimitResetCredit/consume}、model/safetyBuffering/updated、thread/deleted、thread/realtime/appendSpeech),**删除/改名 1 个**(thread/turns/items/list → thread/items/list)。本底账正文仍按基线描述,新增能力见 [code-mode-boundary.md](code-mode-boundary.md) 接入缺口表;下次全量复核时并入正文。
> ⚠️ **2026-07-03 当前仓库锁定已更新到 `da4c8ca`**(见 `docs/REFERENCES.md` 与 `docs/updates/codex-update-verification-2026-07-03.md`)。本底账还没有按 `da4c8ca` 逐文件重核;只能作为旧基线 + 增量提示使用,不要把正文当作当前版本的完整能力清单。
> 标记:✅ 默认启用 · ○ 需 opt-in / feature flag · ⚠️ 接国产模型时的坑 · 🔒 强绑 OpenAI 后端(国产化须替换/砍掉)。

## 范围与口径

- 工具是否「模型可见」每个 turn 由 `core/src/tools/spec_plan.rs` 动态拼装,默认状态由三层决定:① `features/src/lib.rs` 的 `FeatureSpec.default_enabled`;② `model_info`(模型元数据);③ provider capabilities。
- agent 主循环在 `core/src/session/turn.rs::run_turn`;执行类工具走 `core/src/tools/orchestrator.rs`(审批→选沙箱→失败升级重试)。

---

## 一、agent 能直接调用的工具(CODE 模式的「手」)

| 工具 | 能力 | 默认 | 沙箱/审批 |
|---|---|---|---|
| `exec_command` | PTY 跑命令,返回输出或会话 id(unified_exec,统一一次性命令与交互进程) | ✅ 非 Windows | 沙箱+审批+可提权 |
| `write_stdin` | 向运行中 exec 会话写输入/轮询输出 | ✅ 随 exec_command | 沙箱+审批 |
| `shell_command` | 默认 shell 跑脚本(经典;Windows 主用) | ✅ Windows 主 | 沙箱+审批 |
| `apply_patch` | **唯一的内置文件编辑工具**(增/删/改/移,Freeform lark 语法) | ⚠️ 需模型声明 `apply_patch_tool_type` | 沙箱+审批 |
| `update_plan` | 更新任务计划(纯状态,给用户看进度) | ✅ 几乎无条件 | 无 |
| `view_image` | 读本地图片喂给模型 | ✅ 有工作区即开 | 无 |
| `request_user_input` | 抛 1-3 个选择题阻塞等用户答 | ✅ 默认开 | 无 |
| `request_permissions` | 请求额外 fs/网络权限 | ○ default false | 本身即审批 |
| `web_search`(hosted) | 联网搜索 | ⚠️ 默认 Cached,但**绑 Responses 后端能力,接国产模型基本拿不到** | hosted |
| `image_generation`(hosted) | 生成图片 | ⚠️ 同上,绑 codex 后端 auth,国产拿不到 | hosted |
| `list/read_mcp_resource` | 列/读 MCP server 资源 | ⚠️ 有 MCP server 才开 | 无 |
| `mcp__<server>__<tool>` | 调用任意 MCP server 工具(通用外部能力通道) | ⚠️ 按配置 | 视工具 |
| `spawn_agent`/`wait_agent`/`send_input`/`close_agent`/`resume_agent` | **多 agent 子 agent 编排(V1)** | ✅ Collab 默认开 | 子 agent 各自沙箱 |
| `spawn_agents_on_csv` | CSV 批量 fan-out 子 agent | ○ SpawnCsv false | 同上 |
| `tool_search` | BM25 搜惰性工具并暴露(工具太多时) | ⚠️ 需模型+provider 能力 | 无 |
| `exec`/`wait`(code mode) | V8 isolate 跑 JS 编排工具调用(无 Node/fs/net) | ○ CodeMode false | JS 沙箱 |
| `memories`(add/list/read/search) | 记忆读写 | ○ MemoryTool false | 无 |
| `get_goal`/`create_goal`/`update_goal` | 目标管理 | ○ goals_enabled | 无 |
| `list_available_plugins`/`request_plugin_install` | 发现/安装插件 | ✅ 逻辑开,需有候选 | 需确认 |

> ⚠️ 两个接国产模型的硬提醒:① **文件编辑依赖模型元数据**——`apply_patch` 仅在 `model_info.apply_patch_tool_type.is_some()`(默认 None)时注册,国产模型不声明就**没有写文件的手**;② **hosted 工具(web_search/image_generation)绑 Responses 后端能力**,走 Chat 网关的国产模型基本拿不到,要联网搜索/生图需走 MCP 自建。
> codex **没有独立 read_file/write_file 工具**:读文件靠 `exec_command` 跑 cat/sed,写改靠 `apply_patch`。

## 二、扩展机制(★CODE 模式可整套照抄,且兼容 Claude 格式)

| 机制 | 形态 | 配置位置 | 默认 |
|---|---|---|---|
| **Skill** | `SKILL.md` + YAML frontmatter(name/description)+ 可选 `agents/openai.yaml` sidecar;4 级作用域(Repo>User>System>Admin);**= agentskills.io 超集** | `.agents/skills`、`$HOME/.agents/skills`、`/etc/codex/skills`;config `[skills]` | ✅(bundled 可关) |
| **Plugin** | 打包 skills+MCP+apps+hooks;manifest `.codex-plugin/plugin.json`,**回退 `.claude-plugin/plugin.json`(Claude 插件直接能识别)**;含完整 marketplace `interface` 字段(图标/分类/截图/品牌色) | `config.toml` `[plugins."<name>@<market>"]`;装到 `CODEX_HOME/plugins/cache/` | ○ 需安装+enable |
| **Marketplace** | `marketplace.json`(`.agents/plugins/` 或 `.claude-plugin/`);源 = Local/Git URL/git-subdir;安装策略 + 鉴权策略 | 家目录/repo/HTTP | ✅(官方策展 `github.com/openai/plugins` 默认接入)🔒 |
| **MCP(client)** | `[mcp_servers.<name>]`,transport=stdio / streamable_http(**无 SSE、无 wire_api**),全 OAuth(RFC 8707) | `config.toml` | ✅(单服务可关) |
| **MCP(server)** | `codex-mcp-server` 二进制把整个 codex 暴露为 `codex` 工具(源码标 Prototype) | 外部 host 启动 | — |
| **Connectors/Apps** | ChatGPT 托管第三方集成目录,经 host-owned MCP 暴露 | 远程 | 🔒 强绑 ChatGPT 登录,国产化须砍/换 |
| **自定义 slash 命令** | ❌ **无文件式自定义命令**(固定 Rust 枚举);替代 = skill/plugin 的 `default_prompt` | 编译进二进制 | — |
| **Hooks** | 10 生命周期事件 × matcher × handler(command/prompt/agent),**与 Claude Code hooks 同构**;`allow_managed_hooks_only` 企业管控 | `hooks.json` / config / 插件 | ✅(受信任哈希门控) |
| **AGENTS.md** | Markdown;全局→项目根→cwd 逐级合并,越近越优先;`AGENTS.override.md` 优先 | `CODEX_HOME/` + 各级目录 | ✅ |

> 自进化已内建:二进制内嵌 `skill-creator`/`plugin-creator`/`skill-installer` 三个自举 skill——「让业务专家造能力并上架」的现成范本。
> 🔒 必须替换的 ChatGPT 绑定三处:remote skills、connectors、远程 plugin catalog(curated repo + ChatGPT 后端)。好消息:**本地 plugin/skill/Git marketplace 完全不依赖 OpenAI 登录,可独立运行。**

## 三、沙箱 + 审批(★CODE 模式照搬依据,codex 招牌强项)

| 维度 | 取值 | 默认 | config 键 / CLI |
|---|---|---|---|
| **沙箱档(用户面)** | `read-only` / `workspace-write` / `danger-full-access` | **`read-only`** | `sandbox_mode`;`-s` |
| **可写根** | cwd + /tmp + $TMPDIR + 显式 | 自动集 | `sandbox_workspace_write.writable_roots`;`--add-dir` |
| **可写根内强制只读** | `.git` `.agents` `.codex`(连创建都挡,防自我提权) | 恒开 | 硬编码 |
| **网络(沙箱)** | `Restricted` / `Enabled` | **`Restricted`(默认断网)** | `sandbox_workspace_write.network_access`(默认 false) |
| **网络(网关域名)** | allow/deny glob,**deny 优先** + SSRF 防护 | allowlist 空=全拒 | `allowed_domains`/`denied_domains` |
| **审批策略** | `untrusted`(=UnlessTrusted)/ `on-failure`(弃)/ `on-request` / `granular` / `never` | **`on-request`** | `approval_policy`;`--approval-mode` |
| **批准评审者** | `user` / `auto_review`(guardian 子 agent) | **`user`** | `approvals_reviewer` |
| **危险绕过** | `--dangerously-bypass-approvals-and-sandbox`(=`--yolo`)= Never + DangerFullAccess | false | CLI |
| **平台沙箱** | macOS=Seatbelt(sandbox-exec)/ Linux=bwrap(文件)+seccomp(网络)/ Windows=受限令牌 | 按 OS | 自动 |
| **Windows 沙箱级** | disabled / restricted-token / elevated | **disabled(此 commit 标 Removed)** | feature flag |

> 关键事实:① **磁盘读永远全开**,codex 隔离的是「写」和「网」不是「读」——CODE 模式若要守隐私,deny-read 要额外配;② **默认 fail-closed**(deny glob 出错按拒绝、无法施加沙箱时拒绝自动批)——照搬务必保留这条线,否则丢掉安全招牌;③ **Windows 是短板**,原生沙箱默认关,`workspace-write` 会被降级为 `read-only`,要 Windows 写操作需自补;④ `--full-auto` 已删除。
> ✅ 这套三档语义就是「危险操作照搬 codex、显式同意」定调的精确依据(见 memory `2049-danger-ops-copy-codex-consent-model`)。

## 四、app-server 协议(★我方监工壳驱动内核的命脉)

> ⚠️ **协议已转 v2 thread/turn/item 三层模型;旧 `newConversation`/`sendUserTurn`/`addConversationListener` 已从协议 crate 彻底删除。** 集成必须按 v2 写。传输:stdio(默认)/unix/ws/off。握手:`initialize`(声明 capabilities)→ `initialized` 通知。`#[experimental]` 方法需 `initialize` 时声明 `experimentalApi:true` 才可见。

驱动序列(最小闭环):`initialize` → `initialized` → `thread/start`(含 model/provider/cwd/sandbox/approval 覆盖)→ `turn/start`(input: `Vec<UserInput>`)→ 监听 `item/agentMessage/delta` + `turn/completed`;审批走应答 `item/commandExecution/requestApproval` / `item/fileChange/requestApproval`。

协议方法分类(全代码确证 `app-server-protocol/src/protocol/common.rs`):
- **Thread 生命周期**:`thread/start`、`resume`(id 或 path)、`fork`、`archive`/`unarchive`、`read`、`list`、`search`⚡、`compact/start`(手动压缩)、`rollback`、`name/set`、`goal/set`⚡、`memoryMode/set`⚡、`turns/list`⚡、`inject_items`。
- **Turn**:`turn/start`、`turn/steer`(回合中插话)、`turn/interrupt`。
- **模型/provider**:`model/list`(⚠️见下)、`modelProvider/capabilities/read`。
- **Skills/插件/市场**:`skills/list`、`hooks/list`、`marketplace/add`/`remove`/`upgrade`、`plugin/list`/`install`/`uninstall`、`app/list`。
- **审批(server→client 请求,需我方应答)**:`item/commandExecution/requestApproval`、`item/fileChange/requestApproval`、`item/permissions/requestApproval`、`mcpServer/elicitation/request`、`item/tool/call`(客户端执行动态工具)。
- **流式通知**:`item/agentMessage/delta`(助手消息增量)、`item/reasoning/*Delta`(推理流)、`item/commandExecution/outputDelta`、`turn/plan/updated`、`turn/diff/updated`、`thread/tokenUsage/updated`、**`configWarning`**(配置写错从这推回,我方必须订阅)、`model/rerouted`、`guardianWarning`。
- **文件系统/命令/进程/配置/账号/MCP/realtime⚡/远程控制⚡** 等另有数十方法。

## 五、会话 / 上下文 / 记忆 / provider

| 能力 | 形态 | 默认 |
|---|---|---|
| 会话模型 | thread→turn→item 三层(v2);旧 conversation API 已删 | — |
| 会话持久化 | 每会话 `.jsonl` rollout @ `CODEX_HOME/sessions/` + SQLite state DB 镜像;可 zstd 压缩 | ✅ |
| 上下文压缩 | token 阈值触发,模型自我总结替换历史;**国产 provider 名不匹配 → 永远走本地 inline 压缩(普通 Responses 调用,网关能照常翻译)** | ✅ |
| **跨会话记忆** | ★认知更新:codex **现在有**两阶段记忆管线 → `~/.codex/memories/{MEMORY.md,raw_memories.md,rollout_summaries/,skills/}`,独立 git baseline | ○ experimental,默认关,`/memories` 开 |
| 记忆依赖 | state DB + 后台 consolidation 子 agent(额外模型 turn)——接国产模型须单独验证不炸 | — |
| **wire_api** | ⚠️ **枚举只剩 `Responses` 一个变体**,反序列化 `"chat"` 主动抛错(指向 codex#7782);`ollama-chat` 也被删 | — |
| provider 配置 | `config.toml` `[model_providers.<id>]`(base_url/env_key/wire_api/http_headers…),merge 进内置集;`requires_openai_auth=false` 即纯 env key 读取、不碰 OpenAI 登录 | — |
| 内置 provider | 仅 openai / amazon-bedrock / ollama / lmstudio(全 Responses) | — |
| `responses-api-proxy` | ⚠️ 确认是**纯转发 + auth 头隔离**(密钥从 stdin 进),**不做 responses⇄chat 翻译**,替代不了我方网关 | — |
| ⚠️ `model/list` | 数据源是**编译进二进制的 `models.json`(清一色 gpt-5.x)**,只在 ChatGPT 账号下才联网刷新 → **接国产模型时模型菜单必须我方在壳层重写**,别指望内核吐 DeepSeek/GLM | — |

## 六、多 agent / 云任务 / 多模态 / 遥测

- ✅ **多 agent 委派(白嫖强能力)**:codex 原装自带完整 spawn/wait/邮箱(send_message)/角色(default/explorer/worker/awaiter)/fork 历史/并发深度治理/CSV fan-out 的 multi-agent 运行时,`multi_agent` 默认 Stable 开。**比 Hermes 的 `delegate_task` 更强,不需要 Hermes 补委派。** 拓扑落 `agent-graph-store`。
- ⚠️ **computer-use / 浏览器:开源 codex-rs 没有任何实现**——只有 feature 门(`InAppBrowser`/`BrowserUse`/`ComputerUse` default true)+ `@openai-bundled` 插件白名单(`chrome@openai-bundled`、`computer-use@openai-bundled`),**零 tool handler**。能力本体是 OpenAI 桌面 App 私有打包插件(很可能走 MCP),不在开源源码里。**「Hermes 有电脑操控、codex 没有」被源码强确证;这个 `@bundled` 空槽正是「环境插件市场」的真空入口。**
- 🔒 **cloud tasks**:「提交→ChatGPT 云跑→拉 diff 本地 apply」的 code-task,**完全绑死 OpenAI 云**,对 2049 无复用价值,须切掉。Coze 式「云设备后台跑」codex 无现成对标。
- `realtime-webrtc`:**macOS 限定**的 WebRTC 语音(接 OpenAI Realtime),唯一原生多模态,跨平台受限。
- `collaboration mode`:4 种系统提示词人格(default/plan/execute/pair_programming),纯 Markdown 模板,**可直接本地化**。
- `code-mode`:V8 isolate 跑 JS 编排工具(无 Node/fs/net)。
- **遥测(关系「可证明零外联」)**:① analytics 因 `auth.uses_codex_backend()` 门对国产 provider **天然失效**(白捡);② ⚠️ **OTEL metrics 用硬编码 Statsig key、release 默认开、不看登录**,会向 `ab.chatgpt.com` 发——**App 必须强制写 `otel.metrics_exporter="none"`**;③ feedback(Sentry)用户主动触发,风险低。

## 七、关键发现(影响架构决策)

1. **CODE 模式照抄面比预想大且成熟**:plugin+marketplace 是一等公民、兼容 `.claude-plugin/` 格式、自带自进化三件套——整套可照搬,正是「环境插件市场」现成骨架。
2. **多 agent 是白嫖的**:codex 原装委派比 Hermes 强,CODE 侧不需要额外造。
3. **computer-use 确认只在 Hermes**:codex 开源版没有,双引擎分工(Hermes 管电脑操控)被坐实。
4. **接国产模型四个硬坑**:① `model/list` 吐 gpt-5,模型菜单要壳层重写;② `apply_patch` 需模型声明 `apply_patch_tool_type`,否则无写文件的手;③ hosted web_search/image_gen 拿不到,要 MCP 自建;④ OTEL metrics 默认外联,必须 config 关死。
5. **协议是 v2 thread/turn**:CodexMonitor 壳若还用旧 conversation API,对 51b3cd5 内核失效——M0 协议探针必须先撞这堵墙。
6. **codex 也有记忆了**(实验性),与 Hermes MEMORY.md 对位,但默认关、依赖后台子 agent,接国产模型须验证。

## 关键源码路径(备查)

- 工具装配/循环:`core/src/tools/spec_plan.rs`、`registry.rs`、`orchestrator.rs`、`session/turn.rs`、`features/src/lib.rs`
- 扩展:`core-skills/`、`core-plugins/`(manifest/marketplace/manager/store)、`config/src/mcp_types.rs`、`hooks/`、`core/src/agents_md.rs`
- 沙箱审批:`protocol/src/{protocol.rs,permissions.rs,models.rs}`、`sandboxing/`、`linux-sandbox/`、`core/src/{safety.rs,exec_policy.rs}`、`network-proxy/`
- 协议/provider:`app-server-protocol/src/protocol/common.rs`、`model-provider-info/src/lib.rs`、`core/src/compact.rs`、`memories/`、`rollout/`、`models-manager/`
- 多 agent/云/遥测:`core/src/codex_delegate.rs`、`tools/handlers/multi_agents_spec.rs`、`cloud-tasks/`、`analytics/`、`otel/src/config.rs`
