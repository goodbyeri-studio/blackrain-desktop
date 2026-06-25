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

## 2026-06-25：Hermes 交付模型(形态已定,落点待决)

- 背景：codex 是单二进制,Hermes 是 git checkout + Python 3.11 + uv + Node 22 + ripgrep + ffmpeg 一整套,官方无 pip/Docker/单二进制现成产物。与「单安装包开箱即用」(docs/03)冲突,必须定一个长期形态。
- **决策(已定):制品形态 = 钉死版本的隔离镜像。** 不在「打包战术」层面四选一,而从长期原则倒推:Hermes 必须是「不可变、钉死版本、自包含、与主机隔离、可原子升级回滚、监工完全掌控」的封存制品——永远不是 live checkout/用户自管依赖/联网现攒。镜像形态是唯一同时满足这六条的形态。
- **被否的打包战术**(都不满足上述原则):
  - A. 首启联网装(`install.sh`):漂移 + 破坏本地优先,长期一无是处。
  - B. 胖安装包(嵌入 Python/Node 运行时):给确定性和离线,但**无隔离**、**永远绑死逐 OS 原生打包**、且和插件沙箱是两套基建。
  - D. PyInstaller 冻结:B 的脆弱子集(拖 Node/ffmpeg 易碎)。
- **镜像形态的长期红利**:① 确定性(digest 钉死,可支撑万台);② 隔离(关住 Hermes 大 Python 攻击面 + terminal 执行,引擎只经挂载卷碰被授权目录);③ 原子升级回滚(换镜像);④ 本地优先(本地跑镜像完全不外传);⑤ **复用同一套沙箱基建**(护城河的环境复刻/插件市场本就需要安全跑任意环境的沙箱底,引擎骑同一个底=一个隔离原语解两件事);⑥ 统一两个引擎的隔离+升级模型。
- **唯一开放项(落点)**:镜像跑在**本地 microVM** 还是**云沙箱**。**这与「插件沙箱跑哪」是同一个决策,必须一起拍**(见 memory `2049-feasibility-env-replication-engine` 的本地 libkrun vs 云 Northflank 岔路)。
  - 倾向:**本地 microVM 为默认**——「数据不出本地」是创作类垂类楔子本身,本地 microVM 同给隔离 + 不外流;代价是用户机需隐形装好的本地 hypervisor(Win 的 WSL2/Hyper-V、Mac 的 Virtualization.framework),但这笔基建为护城河本就要付、引擎与插件共担。
  - 云沙箱赢的场景:需用户机器没有的 GPU/重算力,或 B2B 客户要中心化托管。镜像形态的好处=本地与云**用同一镜像**,切换不需重打包,可并存。
- **不阻塞 spike**:这是「上线怎么发」的问题,非「架构能否跑通」。spike 阶段 Hermes 怎么快怎么来(开发机裸跑 `hermes gateway` 即可)。
- **盯上游**:若 Nous 出官方 OCI 镜像,拿它当钉死的 base image;但不把交付押在它身上,封存制品所有权永远在我方。
- 影响范围:`apps/desktop` 安装器、交付流水线、沙箱基建。
- 后续复查条件:本地 vs 云落点与插件沙箱决策一起拍时复查。

## 2026-06-25：Hermes 安全发行配方(闭源 B2B 合规两闸口)

- 决策:以「不接 Portal + 不装 `messaging`/`edge-tts`/`honcho` extra + 不开 `cua_telemetry`」配置打包,即同时过遥测闸口与依赖许可证闸口。
- 原因:trajectory 纯本地落盘无外传、无内建遥测框架(一手 `agent/trajectory.py`);传染性许可证(LGPL telegram/edge-tts)全在可选 extra,不装即规避;cua-driver 遥测 Hermes 默认已注入 `CUA_DRIVER_RS_TELEMETRY_ENABLED=0` 关闭。
- 必做人工核实:① `hindsight-client` 包 PyPI 无 license 声明(无则排除);② 若产品引导用户接 Portal,查 Portal ToS 训练/留存条款——默认不接 Portal 则此问题消失。
- 影响范围:打包配置、`docs/07` 合规、REFERENCES。
- 后续复查条件:升级 Hermes 版本时重扫依赖树(用 `pip-licenses`/`uv` 扫实际选定的 extra 子集全树)。

## 被推翻的方案

### 2026-06-25：「扔掉 codex 直接全换 Hermes」

- 原方案：短期最快，删掉 codex 只用 Hermes。
- 为什么推翻：删 codex 提速≈0（不调用即无维护成本），却卖掉两样真东西——①差异化引擎（复刻环境/造插件）的最强编码工具；②供应商分散（退路）。是不对称烂买卖。
- 替代方案：Hermes 当唯一在跑的引擎可以，但 codex **进板凳（ACP/JSON-RPC 接缝留着）而非删除**；最终演进为双引擎。

### 2026-06-25：「用 Hermes 自带的 codex runtime 实现双引擎」

- 原方案：直接用 Hermes 的 `/codex-runtime` 把编码轮次交给 codex。
- 为什么推翻：该集成 = 浅 skill（shell-out `codex exec`）+ 带 bug 的 app-server runtime；切到 codex 模式时 Hermes 自己的 `memory`/`delegate_task`/`session_search`/`todo` 失效，且碰 `~/.codex` 破坏隔离、跨轮丢上下文。
- 替代方案：双引擎编排在**我方监工壳**做；记忆/skills **外置共享存储**，不依赖任一引擎内建。
