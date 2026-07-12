# CODE 模式边界与复刻上限

> 本文回答:CODE 模式的边界在哪、复刻 codex-app(GUI + 功能)的上限到哪、当前 BlackRain 已复刻到哪。
> 与 [hermes-capability-ledger](hermes-capability-ledger.md)、[codex-capability-ledger](codex-capability-ledger.md) 并列,构成 CODE 侧第三份底账。
> 依据:2026-06-28 三路源码+官方调研(当前 `apps/desktop` 真实代码 + 官方 codex-app 调研)。分析基线内核 `51b3cd5`;**内核已于 2026-06-28 跟进到 `bdd282f`**(四探针复测全绿,新增 13 方法见 [codex-capability-ledger](codex-capability-ledger.md) 头部 bump 注记)。
> ⚠️ **当前仓库锁定 codex 已更新到 rust-v0.144.1 / `44918ea`**。本文的复刻边界仍以 2026-06-28 的 GUI/协议核查为基线；附录 23/24 ClientRequest 是历史快照。2026-07-06 当前代码状态记录为 **42 个 RPC 已接入、约 90%**；2026-07-12 仅完成新锁方法集合审计与 app-server macOS `cargo check`，能力全集仍待重跑探针和刷新缺口表。

## 一句话结论

**CODE 模式 = 复刻 codex-app 的「本地半边」,而当前 BlackRain 已复刻了它的约 90%，记录为 42 个 RPC 接入。** 复刻上限 = app-server v2 协议 + 本地 git/文件系统能驱动的一切;真正够不到的「云半边」恰好全在已定的 v1 边界外。剩下的是收尾(品牌切割、个别管理 UI)+ 决定要不要碰「官方也做得烂」的机会点。

## 一、复刻上限 = codex-app 的「本地半边」(可复刻)

这些全靠开源 codex-rs + app-server v2 协议 + 本地能力驱动,可像素级照抄:

| 功能 | 驱动来源 | 当前状态 |
|---|---|---|
| 对话/会话(thread/turn/item) | 协议原生 | ✅ 已复刻(messages 全 item 类型) |
| diff 审阅 | 协议下发 item | ✅ 已复刻(PierreDiffBlock) |
| approval 审批交互 | 协议反向请求 | ✅ 已复刻(ApprovalToasts 三按钮) |
| plan 计划展示 | 协议 item | ✅ 已复刻(PlanPanel) |
| 文件/工作区/终端/沙箱 | 内核脏活,壳渲染 | ✅ 已复刻(files/terminal/workspaces) |
| worktree 隔离 + 本地多 agent | git 操作 + 多内核进程 | ✅ 大体已有(workspaces + 子 agent 树) |
| 模型选择 | config.toml 换 base_url | ✅ 已魔改(旁路网关 registry) |
| Skills/AGENTS.md/MCP 管理 | 文件系统 + Markdown | ◐ 部分(skills/apps 走 RPC,管理 UI 待补) |
| settings | 本地配置 | ✅ 已复刻 + 2 新增区 |
| slash commands | 客户端行为 | ✅ 已复刻(composer) |
| collaboration modes | 协议 RPC | ✅ 已复刻(default/plan/code) |
| 自定义 prompt | 写 CODEX_HOME | ✅ 已复刻(prompts 面板) |
| 语音输入 dictation | 端侧 whisper | ✅ 已复刻 |

## 二、复刻不了的「云半边」(全部落在 v1 边界外,正好不用纠结)

这些绑死 OpenAI 专有云后端 / ChatGPT 账号,第三方壳复刻不了——但它们恰好全在已定的「v1 不做云」边界外:

| 功能 | 为什么复刻不了 | 对 BlackRain |
|---|---|---|
| cloud 环境 / 后台云任务(chatgpt.com/codex) | OpenAI 自有云沙箱 + ChatGPT 账号 | v1 不做云(已定);对标只能自建 |
| cloud threads 跨设备同步 / 手机远控 | 绑 OpenAI 账号体系 | v1 不做 |
| GitHub `@codex` 自动 PR 审查 | OpenAI 云服务 + GitHub App | 可自后端重写但工程量大,后期 |
| best-of-N 云端并行尝试 | 依赖云算力 | 后期 |
| computer-use / 浏览器 | 闭源 bundled 插件,开源 codex-rs 没有 | WORK 侧靠 Hermes(已定);CODE 侧无 |
| GPT-5.x-Codex 模型本身 | OpenAI 专有 | **不是缺失而是差异化**——换国产模型正是我们要做的 |

## 三、当前 BlackRain 已长出的产品改造（全在壳外围，不动保真核心）

源码确证,魔改高度集中在「模型来源 / 账号积分 / 网关 / 品牌」四处:

1. **模型来源旁路**(`models/hooks/useModels.ts:209-212`):显式丢弃内核 `model/list`(它吐 gpt-*),只用网关 registry,兜底 DeepSeek。这正是预期的「壳层重写 model」。
2. **账号 + 积分体系**(`accounts/*`,spec 002):Supabase 登录门禁、积分额度条、三档套餐占位、登录态→网关 credit 模式同步。
3. **模型网关**(`model_gateway.rs` + `settings/SettingsModelGatewaySection.tsx`):spawn `gateway.py`(responses⇄chat 翻译真实存在)、写内核 config `wire_api="responses"`、provider 密钥入钥匙串、CODE credit 模式可切过渡 `proxy.py`。credit 代码骨架已存在但 GUI E2E 未跑；Plus BYOK 权益和路由尚未实现，生产 new-api/`proxy.py` 组合待 002/003 定案。
4. **office 工作台骨架**(`office.rs`):vendoring 第三方 Apache-2.0 的 OfficeCLI 二进制(33MB,历史三平台资产已入库),通过「skill 教内核调 CLI」而非壳直接渲染。二进制、7 命令和 skill/workbench 注入骨架已存在，但 WORK/Hermes 壳集成与 5×10 质量基线未完成，不能称产品端到端可用。
5. **首页重皮 + 品牌**:home 套 codex 外观但自绘；base `productName` 已是 BlackRain，但 Windows title、About、tray、keyring service 仍残留 `BlackRain2049` 兼容旧名，链接切割和凭据迁移待收尾。

## 四、CODE 模式边界定义(给优先级 3 用)

- **边界内(CODE 模式该做、且照抄 codex-app)**:codex-app 本地半边的全部 GUI+功能。这就是复刻上限,且已 ~90% 完成。
- **边界外(CODE 模式不做)**:云半边(云任务/跨设备/GitHub审查/computer-use)——落在 v1 不做云边界外。
- **差异化叠加（非 codex 原生，由 BlackRain 在壳外围增加）**：国产模型 registry、账号积分、模型网关、工作台货架与生命周期。Office 参考工作台默认走 WORK，但其 OfficeCLI 注入链路目前位于同一壳；软件开发工作台进入本 CODE surface。
- **协议纪律**:当前记录为壳⇄内核 42 个 RPC 接入，均保留 app-server 原始方法名，只在 params 层做策略翻译/过滤——符合「内核永远原装」铁律。精确方法集合以当前代码/spec 006 为准。

## 五、剩余待办(复刻收尾,非从零造)

1. **品牌切割收尾**:About 页 GitHub/Twitter/footer 链接仍指上游 CodexMonitor/Dimillian。
2. **Skills/MCP 管理 UI**：目前 skills/apps 走 RPC 有数据，但管理界面待补。公开专家市场已顺延；工作台安装管理则由 008 单独负责。
3. **端到端验证**:对话像不像 codex 已不是问题(已很像);真正待验证的是**模型旁路 + 网关 credit 链路在真实国产模型下端到端跑通**——落在网关进程(M1 已部分实测 DeepSeek 通)。
4. **官方也做得烂的机会点(可选差异化)**:granular diff 的 hunk 级 accept/reject(官方 IDE 直接 apply、无此功能)、app 内联编辑(官方要跳 VS Code)——照抄纪律下应先对齐,后期可作差异化。

## 关键源码路径(备查)

- 壳⇄内核集成：`apps/desktop/src-tauri/src/backend/app_server.rs`、`shared/codex_core.rs`（当前方法集合以 spec 006 和代码为准，记录为 42 个 RPC 接入）
- 模型旁路:`apps/desktop/src/features/models/hooks/useModels.ts:209-212`
- 网关/计费:`src-tauri/src/model_gateway.rs`、`shared/model_gateway_core.rs`、`gateway/gateway.py`
- office 工作台:`src-tauri/src/office.rs`、`plugins/office-cli/skills/`、`workbenches/office-agent/`
- 账号积分:`src-tauri/src/account_session.rs`、`src/features/accounts/*`(spec 002)
- 对话渲染:`src/features/messages/components/MessageRows.tsx`、`threads/hooks/useThreads.ts`、`composer/components/Composer.tsx`

---

# 附录:功能接入覆盖表（2026-06-28 历史快照）

> 目的(第四轮决策 #5):当时用于核对壳是否暴露 codex-rs ClientRequest。该表没有同步 2026-07-06 的 42 RPC 现状，也未按 `da4c8ca` 重核；不得再作为当前完成数量真源。
> 方法:codex-rs `app-server-protocol/src/protocol/common.rs` 提取 179 个 wire 方法 → 与 `shared/codex_core.rs` 实际发起的 ~24 个 ClientRequest 做 diff。
> 钉内核 `51b3cd5`。ClientRequest 集为高置信(读 send 站点);「壳已自实现」分类含推断(据 files.rs/terminal.rs 存在)。

## A. 当时已接入（~24 ClientRequest，历史快照）

initialize · thread/{start,resume,read,fork,list,archive,rollback,compact/start,name/set} · turn/{start,steer,interrupt} · review/start · model/list · collaborationMode/list · experimentalFeature/list · mcpServerStatus/list · skills/list · app/list · account/{read,rateLimits/read,login/start,login/cancel} · (+ respond_to_server_request 应答审批)

## B. 真缺口 —— 内核有、壳没接、且符合 CODE 复刻(★该补)

| 簇 | 未接 ClientRequest | 为什么该补 |
|---|---|---|
| **Skills/Plugin/Marketplace 管理**(★命中决策#3) | skills/config/write、skills/extraRoots/set、hooks/list、plugin/{list,installed,read,install,uninstall}、plugin/skill/read、marketplace/{add,remove,upgrade} | 决策#3 要补的 Skills/MCP 管理 UI,后端 RPC 就在这簇;codex-app 有完整管理界面 |
| **Thread 高级** | thread/search、thread/goal/{set,get,clear}、thread/memoryMode/set + memory/reset、thread/turns/{list,items/list}、thread/metadata/update、thread/settings/update、thread/unarchive、thread/loaded/list、thread/shellCommand、thread/backgroundTerminals/clean、thread/approveGuardianDeniedAction | codex-app 有会话搜索/目标/记忆开关/历史浏览;像素级复刻要补 |
| **模型能力探测** | modelProvider/capabilities/read | 探测 provider 支持 web_search/image/namespace_tools——对模型广场有用 |
| **实验特性开关** | experimentalFeature/enablement/set | 只接了 list、没接 set,等于能看不能开关 feature |
| **权限档** | permissionProfile/list | codex 沙箱权限档列表 |
| **账号** | account/logout、account/usage/read | logout 缺失值得注意 |
| **MCP 深度** | mcpServer/{oauth/login,resource/read,tool/call} | 只接了 status/list;OAuth 登录 + 资源读 + 工具调用未接 |
| **Windows 沙箱**(★命中 MVP 仅 Windows 决策) | windowsSandbox/{setupStart,readiness} | MVP 仅 Windows,沙箱 setup 流程必接 |
| **外部迁移**(获客钩子) | externalAgentConfig/{detect,import} | 从 Claude/其他 agent 导入配置——拉新利器 |

## C. 壳已自实现(非缺口,但像素级复刻要决定走哪条)

| 簇 | 协议方法 | 壳现状 | 决策点 |
|---|---|---|---|
| 文件系统 | fs/{readFile,writeFile,createDirectory,getMetadata,readDirectory,remove,copy,watch,unwatch} | 壳有 `files.rs` 自实现 | 功能等价;codex-app 行为是否走内核 fs,验证保真时再定 |
| 命令/进程 | command/exec(+write/terminate/resize)、process/{spawn,writeStdin,kill,resizePty} | 壳有 `terminal.rs` 自实现 PTY | 同上 |
| 配置 | config/{read,value/write,batchWrite}、configRequirements/read、config/mcpServer/reload | 壳直接写 config.toml(唯一写配置铁律) | 故意旁路,合理;但 codex-app 的 settings 行为要逐项比对 |

## D. 边界外(v1 不做 / 已有替代 / 应去掉)

| 簇 | 协议方法 | 处置 |
|---|---|---|
| 实时语音 | thread/realtime/*(start/appendAudio/appendText/stop/listVoices) | 后期,v1 不做 |
| 远程控制 | remoteControl/*(enable/disable/pairing/client…) | 壳用 tailscale/remote_backend 自实现,不走内核这套 |
| 远程环境 | environment/add | 远程 exec server,v1 不做 |
| OpenAI 专有 | feedback/upload、account/sendAddCreditsNudgeEmail | 去掉(OpenAI 反馈/充值) |
| 模糊搜索 | fuzzyFileSearch/* | 壳可能有自己的 @ 文件搜索,核实后定 |

## 结论(给像素级复刻)

- 本附录的缺口排序只代表 2026-06-28；当前接入状态以代码与 spec 006 为准，重核 `da4c8ca` 后再刷新。
- **最大的一块连贯缺口 = Skills/Plugin/Marketplace 管理簇**,且恰好命中决策 #3(要补 Skills/MCP UI)。这是接入工作的头号目标。
- **第二梯队 = Thread 高级 + Windows 沙箱 setup + 实验特性开关 + 外部迁移**——都是 codex-app 有、壳没接的真能力,像素级复刻必补。
- **C 类「壳自实现」不是缺口**,但要在复刻时逐项验证「壳自己的 files/terminal/config 行为」和 codex-app 是否一致;不一致再决定切内核 RPC。
- **D 类边界外**,v1 不接,部分(feedback/充值)应主动去掉。
