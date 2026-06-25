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
- 原因：壳要扛**两条接缝**，难的那条（codex app-server + 专属 `CODEX_HOME`）我方已掌握、是核心资产，且正是 Hermes 自己做坏的部分（#5879/#7806/#41905）。留己壳=保住难接缝再 bolt 上易接缝（HTTP 接 Hermes）；换 Hermes 壳=把难接缝移植进不熟的 Electron 单体（1800 issue）且逆其纹理。叠加沉没成本（首页 Codex 像素对齐进行中）、Tauri 比 Electron 轻。
- 替代方案：fork Hermes Desktop——仅在「砍掉 CODE 模式、产品只剩 Hermes work 引擎」时才成立。
- 影响范围：`apps/desktop`。
- 后续复查条件：若放弃 codex 编码引擎则复查。

## 2026-06-25：Hermes 不是竞品，是上游供应商

- 决策：把 Hermes 定位为「MIT 上游 / 免费 R&D」，不当竞争对手。
- 原因：架构同形 ≠ 竞品（形态非护城河）。三层不沾：① 卖给谁（Hermes=全球开发者/极客；我们=中国非开发者业务专家）；② 怎么赚钱（Hermes=给 Nous 模型/Portal 引流+攒训练数据；我们=国产 token 差价）；③ 护城河（Hermes=开源可抄的 skills；我们=环境复刻引擎+中文垂类插件市场+AI 带小白用）。它修好的 codex 集成我们能 MIT 白嫖。
- 真竞品：国内 no-code agent 平台（字节 Coze 系），见 `docs/02`、memory `no-code-agent-platform-landscape-2026`。
- 后续复查条件：Nous 若转身做中文+非开发者+国产模型闭环（战略掉头，概率极低，有长预警期）则升级为竞品。

## 被推翻的方案

### 2026-06-25：「扔掉 codex 直接全换 Hermes」

- 原方案：短期最快，删掉 codex 只用 Hermes。
- 为什么推翻：删 codex 提速≈0（不调用即无维护成本），却卖掉两样真东西——①差异化引擎（复刻环境/造插件）的最强编码工具；②供应商分散（退路）。是不对称烂买卖。
- 替代方案：Hermes 当唯一在跑的引擎可以，但 codex **进板凳（ACP/JSON-RPC 接缝留着）而非删除**；最终演进为双引擎。

### 2026-06-25：「用 Hermes 自带的 codex runtime 实现双引擎」

- 原方案：直接用 Hermes 的 `/codex-runtime` 把编码轮次交给 codex。
- 为什么推翻：该集成 = 浅 skill（shell-out `codex exec`）+ 带 bug 的 app-server runtime；切到 codex 模式时 Hermes 自己的 `memory`/`delegate_task`/`session_search`/`todo` 失效，且碰 `~/.codex` 破坏隔离、跨轮丢上下文。
- 替代方案：双引擎编排在**我方监工壳**做；记忆/skills **外置共享存储**，不依赖任一引擎内建。
