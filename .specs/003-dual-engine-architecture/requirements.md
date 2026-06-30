# Requirements

## 背景

- 这个功能为什么现在要做：选型关键期。codex-rs 内核编码强但只发 Responses 协议、且 OpenAI 不开源 app 层的 computer-use；调研发现 NousResearch 的 Hermes Agent(MIT)在「通用任务 / 记忆 / skills / 多渠道」上正是我们产品形态需要、而 codex 没有的能力。需要一次性定清「用哪个引擎、怎么接、GUI 用谁」,避免在错误底座上投入。
- 相关上游/文档/现有实现：
  - codex-upstream（内核黑盒，app-server JSON-RPC，钉 `bdd282f`；原 `51b3cd5`，06-28 跟进）
  - Hermes Agent: <https://github.com/NousResearch/hermes-agent>（MIT，Python agent loop）
  - Hermes API server（OpenAI 兼容 `:8642/v1`）: <https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server>
  - Hermes Desktop（Electron+React，MIT，`apps/desktop/`）: <https://hermes-agent.nousresearch.com/docs/user-guide/desktop>
  - 现有壳：CodexMonitor fork（Tauri），见 `docs/08`
  - 现有网关：`gateway/gateway.py`（responses⇄chat）
  - 关联 spec：`001-providers-model-gateway`、`002-accounts-credits`

## 用户目标

- 作为谁：①「业务专家」——不写代码、跑日常自动化任务的中国用户(working);②「插件/工作台创作者」——懂业务、要造/卖能力的人。
- 想完成什么：业务专家在 working 三档模式(对话/工作台/工作室)用国产模型办事;创作者(v1 先官方、v2 放开)造插件/工作台。coding 模式给会写代码的人,完全 codex app 一致。
- 成功后看到/得到什么：同一个壳里 working/coding 双引擎各取所长,工作台本地下载热拔插即用,所有模型调用经 new-api 计量形成 token 差价闭环。

## 非目标

- 本阶段明确不做：**云端工作台/容器编排(已推翻,纯本地)**;v2 才做的「市集 + 创作者上传 + 审核沙箱」;工作室模式的多 agent 自动协同;远程后端(daemon)双引擎化。
- 不改变的架构边界：codex 内核永远原装黑盒（第一铁律）；App 是唯一写配置的人、用专属 `CODEX_HOME`（第三铁律）；网关是可替换 sidecar、仅 CODE 路径（第二铁律）。
- 不 fork Hermes 仓库进我们的构建——只把它当 `/v1` 黑盒子进程 + 借其 MIT React 组件。

## 成功标准

- 功能行为：WORK 模式经 Hermes `/v1` 接国产 Chat 模型零翻译跑通；CODE 模式经 codex app-server + 专属 `CODEX_HOME` 跑通；两模式读写同一份外置记忆。
- 用户体验：WORK / CODE 是面向两拨人的两个 surface，由监工壳编排；跨模式任务（理解→造插件→带用）子任务切干净、只回传结果，不在单轮对话热切引擎。
- 安全/合规：Hermes MIT 可闭源商用；数据飞轮（trajectory/RL 外传 Nous）默认关闭；不使用 Hermes 商标；钉死所 fork/借的 commit。
- 数据立场：**不强制、用户自担**(2026-06-26 松绑)——不再强制「数据不出本地/不追高敏」。仅守两条零成本底线:BlackRain 自己不训练/不留存、new-api 中转只记计量元数据不落内容明文。详见 `docs/07`。
- 性能/稳定性：多轮不丢上下文；流式不断；function calling 不在中转层丢失；new-api 计量到量。

## 约束

- Codex 内核边界：只通过 app-server JSON-RPC 驱动，不改 agent 循环。
- `CODEX_HOME` / 配置边界：CODE 模式用 App 专属 `CODEX_HOME`，**绝不**走 Hermes 自带 codex 集成（它碰 `~/.codex`，见 decisions）。
- License / 第三方依赖：Hermes 本体 MIT；**真正闸口在其 Python 依赖树**，闭源分发前必须逐包体检（GPL/AGPL/BSL/无协议一律拦）。
- 平台差异：Hermes 官方后端为 local/Docker/SSH 等，桌面端 Electron；我方壳为 Tauri，需以子进程方式纳管 Hermes。

## 开放问题

- [x] Hermes 数据飞轮（trajectory 保存/压缩/RL）能否在配置层彻底关闭外传？→ 已确认:trajectory 纯本地落盘无外传,无内建遥测框架,cua 遥测默认关(2026-06-25 尽调)。
- [x] Hermes Python 依赖树许可证体检结果（是否混入 copyleft）？→ 已确认:核心全宽松系,LGPL 仅在可选 extra,不装即规避;待人工核实 `hindsight-client`（无 license 声明）。
- [x] **Hermes 交付模型**→ 已定(2026-06-26):**纯本地胖安装包**(内嵌 Python + 预构建 venv,不冻结),v1 基础包 ~250MB。云端/隔离镜像方案已推翻。见 decisions。
- [x] WORK 接国产模型无网关真实跑通？→ 已验(2026-06-26 spike):Hermes→new-api→DeepSeek 通、计量、流式、工具调用穿中转。
- [ ] **MCP 热拔插**:对话中途新挂/拔掉整个 MCP server(=挂/卸工作台)——工具级动态发现已确认,整 server 增删待 S5 实测。**工作台热拔插的承重假设**。
- [x] **Windows 全栈**:已收敛(2026-06-30 决策:MVP 仅发行 Windows 客户端,macOS 推迟 post-MVP)。详细 Windows 验证矩阵见 [.specs/007 windows-client](../007-windows-client/);本 spec 不再单独追踪。uvloop 在 Win 不可用的降级行为待 Hermes 集成阶段实测。
- [—] **new-api 单点**:本轮 MVP **不在架构考虑范围**(2026-06-29 拍板:信任自家 new-api 稳定性)。HA/容灾留到有真实流量规模后再评估,非 MVP 阻塞。
- [ ] **v2 悬崖**:开放创作者工作台需补「本地沙盒 + 审核」整层(沙箱验证后期事,先预留)。
- [ ] Nous Portal ToS 训练/留存条款（若产品引导接 Portal）；默认不接 Portal 则消失。
