# Decisions

## 2026-06-25：引擎策略 = 双引擎，不二选一

- 决策：保留 codex 内核当 **CODE 引擎**（强编码），引入 Hermes 当 **WORK 引擎**（通用任务/记忆/skills/多渠道）。引擎躲在协议接缝后（CODE 走 app-server JSON-RPC，WORK 走 HTTP `/v1`），可并存、可换。
- 原因：codex 与 Hermes 的能力在**相反方向**上都强——codex 有 LSP/AST/沙箱/apply_patch，Hermes 有跨会话记忆/自进化 skills/cron/多渠道。我们产品形态（给非开发者办事 + 创作者造插件）两边都要。
- 替代方案：① 纯 codex（缺通用 agent 能力，且接国产必须网关）；② 纯 Hermes（编码弱是结构性短板，见下）。
- 影响范围：`apps/desktop`（壳新增 WORK surface + Hermes 子进程纳管）、`gateway`（仅 CODE 路径）、外置记忆存储（新建）。
- 后续复查条件：Hermes 编码能力大幅提升、或 codex 官方补齐通用 agent 能力时复查。

## 2026-06-25：Hermes License = MIT，可闭源商用；真闸口在依赖树

- 决策：Hermes 本体可二创、闭源、商业售卖（已读仓库 LICENSE 逐字确认为标准 MIT，版权 Nous Research 2025，无附加条款）。
- 原因：MIT 明确授予修改/闭源/再分发/出售权，唯一义务是保留许可证文本与版权声明（放 NOTICE 即可，不影响闭源）。
- 必做功课：① 钉死所 fork/借的 commit 并存证（MIT 对快照不可撤销，防 Nous 未来版本转 BSL/商业授权）；② **逐包体检 Python 依赖树**（GPL/AGPL/BSL/无协议一律拦——这才是会破坏闭源商业模式的东西）；③ 不使用 Hermes 商标/Logo/品牌名。
- 影响范围：合规边界，关联 `docs/07`、`CONTRIBUTING.md`、memory `codex-fork-license-obligations`。
- 后续复查条件：升级所借 Hermes 版本时重验 LICENSE 与依赖树。

## 2026-06-25：token 闭环 = WORK 零网关、CODE 经网关，全汇 new-api

- 决策：利润发动机是 new-api 计量 + 差价。WORK 路径 Hermes→Chat Completions 直入 new-api（**网关消失**）；CODE 路径 codex→Responses→网关翻译→Chat→new-api。
- 原因：中转站（new-api/one-api）成熟计量锁在 `/v1/chat/completions`，对 `/v1/responses` 基本空白。Hermes 默认 Chat-native，国产模型零翻译；codex 只发 Responses，必须先翻译才能进中转计量。
- 替代方案：让 codex 直连中转——不可行，Responses 在中转层无计量。
- 影响范围：`gateway` 定位收窄为「仅 CODE 路径」；关联 spec `001`、`002`。
- 后续复查条件：new-api 若正式支持 Responses 计量，可重新评估 CODE 路径是否还需网关。

## 2026-06-25：GUI = 留 CodexMonitor/Tauri 壳，借 Hermes Desktop 的 MIT 组件，不 fork 其壳

- 决策：壳继续用我方 CodexMonitor/Tauri；从 Hermes Desktop（Electron+React，MIT）**摘 React 组件**（skills/memory/provider 面板）放进我方壳。不 fork Hermes Desktop 当壳。
- 原因（完整因果链，供一秒复述）：
  1. codex 内核强到**连 Hermes 自己都来集成**（它有 codex skill / app-server runtime 尝试）——这是 codex 价值的最强外部背书 → codex 当 CODE 引擎。
  2. 但真正把 codex app 协议对接**做对**的是 CodexMonitor，**不是** Hermes Desktop——Hermes 自己接 codex 是坏的（#5879 打错端点 / #7806 碰 `~/.codex` / #41905 丢上下文）。
  3. 壳要扛**两条接缝**：难的（codex app-server + 专属 `CODEX_HOME`，我方已驯服、是核心资产）+ 易的（Hermes HTTP `/v1`）。
  4. 留 CodexMonitor 底座 = 难接缝已驯服，补个易接缝（接 Hermes）= **顺势**；换 Hermes Desktop 底座 = 要在陌生 Electron 单体（1800 issue）里**重做别人没做成的难活**且逆其「Hermes 自己是引擎」的纹理 = **逆势**。两个方向技术上都能接通，但**难度极不对称**。
  5. 独立加固：CodexMonitor 是 Tauri（轻、单二进制、好分发）且已做首页 Codex 像素对齐（沉没成本）；换 Hermes Desktop = 换重 Electron + 丢对齐 + 反向 re-skin。
- 替代方案：fork Hermes Desktop——仅在「砍掉 CODE 模式、产品只剩 Hermes work 引擎」时才成立。
- 影响范围：`apps/desktop`。
- 后续复查条件：若放弃 codex 编码引擎则复查。

## 2026-06-25：Hermes 不是竞品，是上游供应商

- 决策：把 Hermes 定位为「MIT 上游 / 免费 R&D」，不当竞争对手。
- 原因：架构同形 ≠ 竞品（形态非护城河）。三层不沾：① 卖给谁（Hermes=全球开发者/极客；我们=中国非开发者业务专家）；② 怎么赚钱（Hermes=给 Nous 模型/Portal 引流+攒训练数据；我们=国产 token 差价）；③ 护城河（Hermes=开源可抄的 skills；我们=环境复刻引擎+中文垂类插件市场+AI 带小白用）。它修好的 codex 集成我们能 MIT 白嫖。
- 真竞品：国内 no-code agent 平台（字节 Coze 系），见 `docs/02`、memory `no-code-agent-platform-landscape-2026`。
- 后续复查条件：Nous 若转身做中文+非开发者+国产模型闭环（战略掉头，概率极低，有长预警期）则升级为竞品。

## 2026-06-26：交付模型 = 纯本地,Hermes 胖安装包(内嵌 Python + 预构建 venv)

- 背景：codex 是单二进制好办;Hermes 是 Python 3.11 + uv + (可选 Node/ffmpeg) 一整套。早先一度结论为「隔离镜像 + 本地microVM vs 云待拍」,**现已推翻**(见被推翻方案「云端工作台/容器编排」)。产品转向**纯本地**后,交付问题收敛成一个常规打包活。
- **决策(已定):胖安装包 = Tauri 壳 + codex 单二进制 + 内嵌 Python + 预构建 Hermes venv,不冻结。**
  - Tauri 像纳管 codex 一样 spawn `hermes gateway` 子进程,和现有「监工管子进程」架构同构。
  - **不用 PyInstaller/Nuitka 冻结**:Hermes 大型多模块 + 动态 import(插件/skill/MCP 热加载),冻结动态导入极易碎,会破坏插件加载。
  - **不用容器**:Docker on Windows 对非开发者是天堑,已否。
- **实测体量(2026-06-26 spike 真装,见 verification)**:Hermes venv(核心+web/cli/mcp+aiohttp)=104MB,uv 装的 CPython≈55MB,无 torch/whisper 重物。
  - **v1 基础包 ≈ 230-250MB**(壳15 + codex 60-80 + 内嵌Python 40 + venv 104 + ripgrep 5),**砍掉 Node/ffmpeg**(浏览器自动化/语音是可选功能,v1 不需要)。
  - 全功能(+Node 40 +ffmpeg 80)≈ 350-380MB。参照 VS Code ~90MB / Electron 应用 150-300MB,**250MB 属轻量,用户可接受**(用户语:500MB 以下都算轻量)。
  - 工作台(office 等)**独立按需下载,不进主包**。
- **真实工程活**:CI 为 Win/Mac/Linux **各构建一份 venv**(原生 wheel 平台相关:cryptography/PIL/pydantic_core/uvloop)。注意 **uvloop 在 Windows 不可用**(Hermes 自动降级 asyncio,不阻断)。
- **API server 依赖**:实测要 **aiohttp**(Apache-2.0,单装合规),**不是** fastapi——而 aiohttp 只在 messaging extra 里捆 LGPL 包,故单装 `aiohttp` 本体、不装整个 extra。
- 影响范围:`apps/desktop` 安装器、CI 打包流水线。
- 后续复查条件:Hermes 升级或 v1 需启用 Node/ffmpeg 功能时重算体量。

## 2026-06-25：Hermes 安全发行配方(闭源 B2B 合规两闸口)

- 决策:以「不接 Portal + 不装 `messaging`/`edge-tts`/`honcho` extra + 不开 `cua_telemetry`」配置打包,即同时过遥测闸口与依赖许可证闸口。
- 原因:trajectory 纯本地落盘无外传、无内建遥测框架(一手 `agent/trajectory.py`);传染性许可证(LGPL telegram/edge-tts)全在可选 extra,不装即规避;cua-driver 遥测 Hermes 默认已注入 `CUA_DRIVER_RS_TELEMETRY_ENABLED=0` 关闭。
- 必做人工核实:① `hindsight-client` 包 PyPI 无 license 声明(无则排除);② 若产品引导用户接 Portal,查 Portal ToS 训练/留存条款——默认不接 Portal 则此问题消失。
- 影响范围:打包配置、`docs/07` 合规、REFERENCES。
- 后续复查条件:升级 Hermes 版本时重扫依赖树(用 `pip-licenses`/`uv` 扫实际选定的 extra 子集全树)。

## 2026-06-26：产品形态 = 四层能力 + 三档 working 模式

- 决策：四层能力按粒度递增 **skill/mcp/acp(原子积木)→ 插件 → 工作台 → 公司**;working surface 内三档运行模式。
- 四层定义(注意 skill/mcp/acp 是**两引擎共用的底层积木**,不是与后三者并列的产品包):
  - **插件**:当前对话里 `@xxx`,**复用当前引擎**,资产即时装(codex app 体验)。轻、即装即用、无独立环境。
  - **工作台**:一个**预打包好的本地环境**(便携包),挂到对话上常驻直到取消。重、自带完整环境(如 office 工作台带 LibreOffice)。
  - **公司**:同时挂多个工作台,Pro 专属,面向「一人公司」。
- **铁规则(划清插件 vs 工作台)**:需要一整套预装环境/隔离 → 工作台;只给当前对话加能力 → 插件。
- 三档 working 模式(同时也是「隐私↔便利」光谱,顺带解决了早先「本地 vs 云」的纠结):
  1. **对话模式**:最直接,agent 按需装东西(类 codex),掌控最强。
  2. **工作台模式**:右侧面板选一个工作台,环境预配好;同时只一个,可热切换;免费用户靠切换「接近」公司体验(白嫖福利)。
  3. **公司模式**:可同时多个工作台,Pro 专属。v1 只做**多工作台并存 + 手动指派 + 闲时挂起**,**不做**多 agent 自动协同(留后期)。
- 引擎路由:**coding = codex(完全 codex app 一致,重代码,无工作台/公司概念);working = Hermes(工作台/公司,对话即完成,用户不需懂代码)**。coding 入口要与 working 明显隔开,避免「对话模式 vs coding」混淆。
- 称呼:和用户对话的 AI = **专家**;多 agent = **专家团**。
- 影响范围:`apps/desktop`(working surface 三档 UI + coding surface)。

## 2026-06-26：工作台 = 本地便携包 + 对话挂载热拔插(MCP 机制)

- 决策：工作台是**可挂载到一段对话的环境+工具包**,本质 = codex/Claude Code 的 MCP 范式(挂一个 MCP server,agent 就多一套工具)。
- 运行机制:① 运行时无状态(便携 binary + MCP server 进程),数据全在用户项目文件夹(bind/读写分层);② 挂载 = 起进程 + 给活着的 Hermes 会话动态注册 skill+MCP;拔掉 = 注销 + 杀进程;③ 拔掉不丢数据(成果在文件夹),重挂 = 新进程重读文件夹。
- **v1 不用容器**:官方工作台**可信**,打包成便携包 + 起进程即可,避开 Docker on Windows 的小白门槛。
- 承重假设(spike 已部分验证,见 verification):Hermes 原生支持 `tools/list_changed` 动态工具发现 + 自动重连(已挂载工作台中途变工具 ✅);**对话中途新挂/拔掉整个 MCP server** 仍需 spike 实测(高度可能,底层标准 MCP)。
- 影响范围:`apps/desktop`(右侧工作台面板)、工作台打包规范。

## 2026-06-26：交付定位 = 纯本地,云端工作台/公司全部砍掉

- 决策：工作台/公司**全部本地下载 + 热拔插,不走云端**。容器不托管在云,运行时跑在用户机器。
- 原因:一刀砍掉三座工程山——① 本地↔云文件桥(原工程大头);② 云容器即消即毁编排(最不成熟,需 K8S);③ 每用户云容器的 compute/存储成本。代价仅「下载几百 MB 工作台」,极划算。且数据天然不进我方云,数据立场矛盾自然消解。
- 认下的取舍:① 失去网页版「零门槛试用」引流(可选:留一个极薄的官方工作台在线 demo 橱窗,v1 可不做);② 首个工作台下载是流失点(压体积)。
- **唯一减不掉的服务器负担 = new-api 中转**(token 差价闭环物理前提),它是全产品命脉单点,需 HA/容灾(见待攻坚)。
- 影响范围:砍掉云沙箱/容器编排整块基建。

## 2026-06-26：数据立场松绑 = 不强制,用户自担

- 决策：不再强制「数据不出本地/不追高敏垂类」。用户使用云端类能力(或高敏场景)的风险由用户自担,不再限制产品。
- 原因:纯本地形态下,对话模式数据本就不出本地;是否碰高敏由用户自选,产品不替其兜底,也不设限。
- 仍守(零成本底线,与高敏无关):BlackRain 自己不训练/不留存用户内容;new-api 中转只记计量元数据、不落内容明文。
- 影响范围:`docs/07` 数据立场段需相应放宽(从「不追高敏」改为「不强制、用户自担」)。

## 2026-06-26：工作台市集 = CDN 分发 + 审核(沙箱验证留后期)

- 决策：开放用户创作工作台时,市集 = **用户上传 → 审核 → 进 CDN → 他人下载**,纯分发,不提供运行计算(下载者本地跑)。
- 分阶段:**v1 只有官方工作台(可信,免审核/免沙箱)**;**v2 才开放创作者上传**,届时建审核 + 分发。**先冷启动、官方先行**(no-code 平台死于冷启动的教训)。
- 信任负担未消失只变形:工作台是带可执行环境的包、下载到他人机器跑,故 v2 审核 = **专门的沙箱验证**(自动跑、看行为),不只人工扫;配签名 + 来源可信标记。**沙箱验证是后期事,本文档先预留,不展开。**
- CDN 是带宽成本(几百 MB × 下载数),非零成本;国内需备案/选服务商。
- 影响范围:v2 新建市集 + 审核流水线 + 本地沙箱层(那道「v1便携包→自造需隔离」的悬崖在此跨越)。

## 被推翻的方案

### 2026-06-25：「扔掉 codex 直接全换 Hermes」

- 原方案：短期最快，删掉 codex 只用 Hermes。
- 为什么推翻：删 codex 提速≈0（不调用即无维护成本），却卖掉两样真东西——①差异化引擎（复刻环境/造插件）的最强编码工具；②供应商分散（退路）。是不对称烂买卖。
- 替代方案：Hermes 当唯一在跑的引擎可以，但 codex **进板凳（ACP/JSON-RPC 接缝留着）而非删除**；最终演进为双引擎。

### 2026-06-25：「用 Hermes 自带的 codex runtime 实现双引擎」

- 原方案：直接用 Hermes 的 `/codex-runtime` 把编码轮次交给 codex。
- 为什么推翻：该集成 = 浅 skill（shell-out `codex exec`）+ 带 bug 的 app-server runtime；切到 codex 模式时 Hermes 自己的 `memory`/`delegate_task`/`session_search`/`todo` 失效，且碰 `~/.codex` 破坏隔离、跨轮丢上下文。
- 替代方案：双引擎编排在**我方监工壳**做；记忆/skills **外置共享存储**，不依赖任一引擎内建。

### 2026-06-26：「云端托管工作台/公司 + 即消即毁容器编排」

- 原方案：工作台/公司跑在云端容器(K8S 弹性伸缩、即消即毁、每用户一个),点开即用;早先「交付模型」一度定为「隔离镜像 + 本地microVM vs 云待拍」。
- 为什么推翻:① 引入本地↔云**文件桥**(工程大头);② 云容器即消即毁编排在 agent 领域**很不成熟**(需 K8S、冷启动延迟、瞬时拉起/销毁仍实验性);③ 每用户云容器的 **compute/存储/带宽成本**随用量线性涨;④ 文件上云与「数据不出本地」卖点冲突。换来的好处(点开即用)用「本地下载几百 MB」即可替代。
- 替代方案:**工作台/公司全部纯本地下载 + 热拔插**;云端最多保留一个极薄的官方 demo 橱窗引流(v1 可不做)。「本地 vs 云」这个早先的开放岔路就此**收敛为本地**。

### 2026-06-26：「强制数据不出本地 / 不追高敏垂类」

- 原方案:锁死「不承诺推理级隐私 + 不追会计/医疗类高敏垂类」,受众只锚创作类。
- 为什么推翻:用户决定放宽——是否碰高敏/云端类能力由用户自担风险,产品不再设限。
- 替代方案:仅守两条零成本底线(BlackRain 不训练/不留存 + 中转不落明文);`docs/07` 从「不追高敏」改为「不强制、用户自担」。
