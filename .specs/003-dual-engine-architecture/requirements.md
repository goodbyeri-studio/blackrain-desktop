# Requirements

## 背景

- 这个功能为什么现在要做：选型关键期。codex-rs 内核编码强但只发 Responses 协议、且 OpenAI 不开源 app 层的 computer-use；调研发现 NousResearch 的 Hermes Agent(MIT)在「通用任务 / 记忆 / skills / 多渠道」上正是我们产品形态需要、而 codex 没有的能力。需要一次性定清「用哪个引擎、怎么接、GUI 用谁」,避免在错误底座上投入。
- 相关上游/文档/现有实现：
  - codex-upstream（内核黑盒，app-server JSON-RPC，当前锁定 rust-v0.144.1 / `44918ea`；旧底账基线 `51b3cd5`/`bdd282f`，待重核）
  - Hermes Agent: <https://github.com/NousResearch/hermes-agent>（MIT，Python agent loop，当前锁定 v2026.7.7.2 / `9de9c25`；旧底账基线 `a6a28ce`，待重核）
  - Hermes API server（OpenAI 兼容 `:8642/v1`）: <https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server>
  - Hermes Desktop（Electron+React，MIT，`apps/desktop/`）: <https://hermes-agent.nousresearch.com/docs/user-guide/desktop>
  - 现有壳：CodexMonitor fork（Tauri），见 `docs/08`
  - 现有网关：`gateway/gateway.py`（responses⇄chat）
  - 关联 spec：`001-providers-model-gateway`、`002-accounts-credits`

## 用户目标

- 作为谁：①安装专业工作台的普通用户；②把成熟电脑环境资产化的领域专家；③帮助专家封装环境的工作台作者；④需要 codex 原生控制力的开发者。
- 想完成什么：用户从工作台和项目进入产品，由 Core 在后台选择 WORK/Hermes 或 CODE/codex 执行；专家工作台的包格式、安装和生命周期由 [.specs/008](../008-expert-workbench-package/) 定义。开发者进入软件开发工作台后尽量对齐 codex app 的本地半边。
- 成功后看到/得到什么：同一个壳按工作台组织专业环境，双引擎各取所长；用户不需要先理解 WORK/CODE。平台 credit 调用经 new-api/受控服务端入口计量；Plus BYOK 是否绕过 new-api，仍待与 002 统一。

## 非目标

- 本阶段明确不做：**云端工作台/容器编排（已推翻，本地优先）**；公开专家市场与任意第三方包；工作室/OPC 多工作台自动协同；远程后端 daemon 双引擎化。工作台包协议和生命周期移交 [.specs/008](../008-expert-workbench-package/)。
- 不改变的架构边界：codex 内核永远原装黑盒（第一铁律）；App 是唯一写配置的人、用专属 `CODEX_HOME`（第三铁律）；网关是可替换 sidecar、仅 CODE 路径（第二铁律）。
- 不 fork Hermes 仓库进我们的构建——只把它当 `/v1` 黑盒子进程 + 借其 MIT React 组件。

## 成功标准

- 功能行为：WORK 模式经 Hermes `/v1` 接国产 Chat 模型零翻译跑通；CODE 模式经 codex app-server + 专属 `CODEX_HOME` 跑通；两模式读写同一份外置记忆。
- 用户体验：工作台和项目是产品第一入口；WORK / CODE 是工作台进入后的两个执行 surface。跨引擎任务子任务切干净、只回传结果，不在单轮对话热切引擎。
- 安全/合规：Hermes MIT 可闭源商用；trajectory 已确认只在本地落盘、无内建外传，CUA 遥测保持关闭，不接 Nous Portal；不使用 Hermes 商标；钉死所借的 commit。
- 数据立场：**不强制、用户自担**(2026-06-26 松绑)——不再强制「数据不出本地/不追高敏」。仅守两条零成本底线:BlackRain 自己不训练/不留存、new-api 中转只记计量元数据不落内容明文。详见 `docs/07`。
- 性能/稳定性：多轮不丢上下文；流式不断；function calling 不在中转层丢失；new-api 计量到量。

## 约束

- Codex 内核边界：只通过 app-server JSON-RPC 驱动，不改 agent 循环。
- `CODEX_HOME` / 配置边界：CODE 模式用 App 专属 `CODEX_HOME`，**绝不**走 Hermes 自带 codex 集成（它碰 `~/.codex`，见 decisions）。
- License / 第三方依赖：Hermes 本体 MIT；**真正闸口在其 Python 依赖树**，闭源分发前必须逐包体检（GPL/AGPL/BSL/无协议一律拦）。
- 平台差异：Hermes 官方后端为 local/Docker/SSH 等，桌面端 Electron；我方壳为 Tauri，需以子进程方式纳管 Hermes。
- 当前 MVP 仅发行 Windows；macOS/Linux 代码保留为 post-MVP 历史资产，发布验证统一由 007 Windows spec 管理。

## 开放问题

- [x] Hermes 数据飞轮（trajectory 保存/压缩/RL）能否在配置层彻底关闭外传？→ 已确认:trajectory 纯本地落盘无外传,无内建遥测框架,cua 遥测默认关(2026-06-25 尽调)。
- [x] Hermes Python 依赖树许可证体检结果（是否混入 copyleft）？→ 已确认:核心全宽松系,LGPL 仅在可选 extra,不装即规避;待人工核实 `hindsight-client`（无 license 声明）。
- [x] **Hermes 交付模型**→ 已定(2026-06-26):**纯本地胖安装包**(内嵌 Python + 预构建 venv,不冻结),v1 基础包 ~250MB。云端/隔离镜像方案已推翻。见 decisions。
- [x] WORK 接国产模型无网关真实跑通？→ 已验(2026-06-26 spike):Hermes→new-api→DeepSeek 通、计量、流式、工具调用穿中转。
- [ ] **MCP 热拔插**：对话中途新挂/拔掉整个 MCP server——它只是插件激活机制的一部分，不再等同完整工作台安装/卸载；整 server 增删仍待 S5 实测，完整生命周期见 008。
- [x] **Windows 全栈**:已收敛(2026-06-30 决策:MVP 仅发行 Windows 客户端,macOS 推迟 post-MVP)。详细 Windows 验证矩阵见 [.specs/007 windows-client](../007-windows-client/);本 spec 不再单独追踪。uvloop 在 Win 不可用的降级行为待 Hermes 集成阶段实测。
- [—] **new-api 单点**:本轮 MVP **不在架构考虑范围**(2026-06-29 拍板:信任自家 new-api 稳定性)。HA/容灾留到有真实流量规模后再评估,非 MVP 阻塞。
- [ ] **第三方市场悬崖**：开放专家工作台需补包签名、权限、来源、审核和结算；008 先处理官方包，市场另建 spec。
- [ ] Nous Portal ToS 训练/留存条款（若产品引导接 Portal）；默认不接 Portal 则消失。
- [ ] **credit/BYOK 生产路由**：WORK/Hermes 如何接 Supabase credit，`proxy.py` 与 new-api 如何组合，以及 Plus BYOK 是否是 new-api 例外；与 002 联合定案。
