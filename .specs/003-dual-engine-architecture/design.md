# Design

## 总体方案

一个监工壳（Tauri，fork 自 CodexMonitor）按工作台和项目组织用户体验，并指挥**两个引擎黑盒**——普通工作台默认由 Hermes 承载，软件开发工作台进入 codex surface。平台 credit 模型调用目标是汇入 new-api/受控服务端入口计量；Plus BYOK 是否允许直连、`proxy.py` 是否保留为 Supabase 适配层，仍待 002/003 联合定案。工作台的 Manifest、安装、激活、升级和卸载由 [.specs/008](../008-expert-workbench-package/) 定义；本 spec 只负责双引擎运行边界。

> 当前实现状态（2026-07-11）：WORK 只完成了 2026-06-26 的独立 Hermes→new-api→DeepSeek spike；尚未接入 Tauri 壳，S3 外置记忆、S4 跨模式、S5 整 MCP server 热拔插和 office 质量基线均未完成。CODE 壳能力约 90%、当前记录为 42 个 RPC 接入，但能力底账仍是旧 commit 基线。

> WORK 引擎(Hermes)的完整功能事实底账见 [hermes-capability-ledger.md](hermes-capability-ledger.md)(旧分析基线 `a6a28ce`;当前锁定 v2026.7.7.2 / `9de9c25`,待重核)。
> CODE 引擎(codex-rs)的完整功能事实底账见 [codex-capability-ledger.md](codex-capability-ledger.md)(旧分析基线 `51b3cd5`;当前锁定 rust-v0.144.1 / `44918ea`,待重核)。
> CODE 模式的边界、复刻 codex-app 的上限、当前 BlackRain 复刻进度见 [code-mode-boundary.md](code-mode-boundary.md)(当前 `apps/desktop` 真实代码 + 官方 codex-app 调研)。

## 产品与引擎关系（一壳·工作台入口·双执行器）

```text
┌──────────────────────────────────────────────────────────┐
│ 监工壳 (Tauri，本地 Core)                                   │
│   工作台货架 → 项目 → 任务                                  │
│        ├ 软件开发工作台 → CODE surface (=codex app)          │
│        └ 其他官方工作台 → WORK surface                       │
└──────┬──────────────────────────────────┬──────────────────┘
   codex app-server JSON-RPC          Hermes HTTP /v1
   (+ 专属 CODEX_HOME)                (+ 独立 HERMES_HOME)
       │                                  │
       ▼ Responses→gateway→Chat           ▼ Chat (零翻译)
       └──────────────► new-api/受控 credit 入口 ◄──┘
                              ▼
                       国产模型 (DeepSeek/GLM…)

产品关系（术语定义见 docs/04）：
  Skill + 插件 + 环境 + 资源 + 验证 → 工作台 → 工作室
```

- **引擎路由**：工作台声明推荐 surface，Core 决定进入 Hermes 或 codex；用户不先选择引擎。
- **插件激活不等于工作台安装**：MCP server 动态注册只是工作台生命周期中的一个动作，Manifest、依赖、权限、验证和卸载属于 008。
- **工作室**：多工作台目标、交接、共享状态和验收属于 post-MVP，本 spec 不实现。

## 三层纪律（防两种反向误读）

切分不是「引擎 vs GUI」，是三层。守住它，既不会手痒去改引擎（失血），也不会以为自己只能做个皮（没护城河）。

| 层 | 例子 | 纪律 | 能自定义吗 |
|---|---|---|---|
| **引擎(黑盒)** | codex、Hermes | 成千上万人维护的成熟内核，**绝不分叉**，只读/只调用/白嫖上游日更。分叉=日更能力当场归零。 | ❌ 碰都不碰 |
| **产品层(全自建)** | 工作台包与生命周期、环境复现、垂类验证、监工壳编排、双引擎路由、专家市场、账号计费、网关 | 100% 我方代码。核心资产在工作台层，不在引擎 fork。 | ✅ 主战场 |
| **借来的零件(抄进来)** | Hermes Desktop 的 React 组件 | **摘零件，不搬房子**：单独抄具体组件进我方 Tauri 壳（保留 MIT 署名），并把数据源重接到我方双引擎。不 fork 整个 Desktop。 | ✅ 抄一段≠fork 整个 |

要点：① **「不分叉引擎」≠「不写代码」**——不写引擎代码，但写海量包在引擎外的产品层代码。② **GUI 只是产品层最显眼的一块**，真正值钱的是插件市场/环境复刻/token 闭环。③ **抄 Desktop = 抄 UI 的样子，重接数据线**（WORK→Hermes `/v1`、CODE→codex），不是把 Electron 单体搬来当壳。

## 架构边界

- 属于 `apps/desktop` 的逻辑：监工壳；WORK/CODE 两个 surface；编排器（跨模式任务的子任务切分与回传）；纳管 Hermes 子进程（启停 + `/v1` 调用）；驱动 codex app-server（已有）。借 Hermes Desktop 的 MIT React 组件（skills/memory/provider 面板）。
- 属于 `gateway` 的逻辑：responses⇄chat 翻译，**只挂在 CODE 路径**（codex→Responses→翻译→Chat→new-api）。
- 属于 `plugins` / `workbenches` 的内容：工具适配器、Skills、模板、任务和工作台声明；完整包边界见 008。
- 明确不改 `codex-upstream` 的部分：agent 循环、协议层；codex 仍为原装黑盒。

## 数据流

```text
WORK（普通/专家工作台）                 CODE（软件开发工作台/高级封装）
  -> 监工壳 WORK surface                 -> 监工壳 CODE surface
  -> HTTP /v1 (Hermes 黑盒子进程)         -> app-server JSON-RPC (codex + 专属 CODEX_HOME)
  -> Chat Completions (零翻译)            -> Responses
  -> new-api 计量 ─┐                      -> gateway responses⇄chat
                   │                      -> Chat -> new-api 计量
  国产模型 <───────┴──────────────────────────────┘

跨模式编排：监工壳 = 大脑
  工作台任务 → 按边界切出干净子任务 → WORK/CODE 执行 → 回传结果
  记忆/skills：两引擎都读写同一份外置共享存储（不住任何引擎肚子里）
```

## 接口与配置

- Tauri command / JSON-RPC：
  - CODE：沿用现有 codex app-server JSON-RPC 链路（`shared/*` → `lib.rs` → `services/tauri.ts` → daemon `rpc.rs`）。
  - WORK：新增 Hermes 子进程纳管 + HTTP `/v1` 客户端（`/v1/chat/completions`、`/api/sessions`）。
- `config.toml` / `CODEX_HOME`：CODE 用 App 专属 `CODEX_HOME`；Hermes 用 App data 下专属 `HERMES_HOME`，配置路径为 `$HERMES_HOME/config.yaml`（命名 `providers:` 块接 new-api），绝不默认写用户 `~/.hermes`。
- 环境变量：Hermes provider 用 `api_key_env_vars` / `base_url_env_var`；配 `model.default_headers` 覆盖 SDK 默认头防中转/WAF 拦截。
- 文件布局：外置记忆/skills 共享存储（待定具体形态，见开放问题），两引擎都按「数据」读写。

## 失败模式

- 上游协议失败：codex app-server 协议漂移 → 协议探针先行（见 `verification`）。
- 模型/网关失败：网关崩只影响 CODE 路径，WORK 路径（Chat 直入 new-api）不受牵连——双引擎天然隔离。
- 配置损坏：Hermes bare `custom` provider 不解析 base_url 会**静默 fallback 到 OpenRouter**（issue #14676）——必须用命名 provider 块。
- 权限/沙箱失败：computer-use 经独立 MCP sidecar，权限在该层统一管。
- 用户可见降级：CODE 不可用时 WORK 仍可独立工作，反之亦然。

## 兼容策略（Hermes 已知坑 → 处理）

| 坑（Hermes issue） | 处理 |
|---|---|
| #5879 自带 `openai-codex` provider 坏（打 chatgpt.com 内部端点） | 不用它；CODE 走我方 codex app-server 集成 |
| #7806 codex 集成吃 `~/.codex` 共享 token、坏其他客户端 | 用 App 专属 `CODEX_HOME`，不走 Hermes codex 路径 |
| #41905 app-server runtime 跨轮丢上下文 | 不用 Hermes 的 codex runtime；跨模式编排在我方壳做、子任务切干净 |
| #14676 bare `custom` 静默 fallback OpenRouter | 用命名 `providers:` 块 + `custom:name` 引用 |
| #40403 SDK 默认头被 WAF/中转拦（502） | 配 `model.default_headers` 覆盖 `User-Agent`/`X-Stainless-*` |
| #21522 / #25723 custom provider 流式静默失败 | new-api SSE 必须标准；spike 必测流式 |
| trajectory / 遥测 | trajectory 已确认纯本地落盘、无内建外传；保持 CUA 遥测关闭，不接 Nous Portal |

## Hermes 集成机制(2026-06-25 尽调,一手仓库证据)

### 进程模型与监工纳管

- **没有 `hermes serve`**:OpenAI 兼容 API server 寄生在 `hermes gateway` 进程里,靠 `.env` 的 `API_SERVER_ENABLED=true` 点亮,监听 `127.0.0.1:8642`。
- **专属目录**:设环境变量 `HERMES_HOME=<app数据目录>/hermes-home`,config/.env/sessions/memory/skills/PID/logs 全 scope 到该目录——`CODEX_HOME` 的孪生,第三铁律一字不改成立。
- **鉴权**:Bearer token,来自 `.env` 的 `API_SERVER_KEY`,**强制必填**(API 暴露 terminal 执行,绝不能留空)。监工生成随机串写入它管理的 `.env`。
- **就绪探测**:轮询 `GET /health`(带 Bearer)直到 `{"status":"ok"}`,再 `GET /v1/capabilities` 校验所需 feature。
- **对话**:监工面板首选 `POST /v1/runs` + `GET /v1/runs/{id}/events`(SSE,可中断、可过审批门);带记忆任务可用 `POST /v1/responses` + `previous_response_id`。
- **生命周期**:监工直接 spawn 前台 `hermes gateway` 并持句柄,退出发 SIGTERM/SIGINT——与管 codex 子进程同一套打法,**不要用 systemd/launchd**(会脱离监工管控)。

监工纳管步骤草图:
```text
1. 安装(一次性):设 HERMES_HOME → 跑 install.sh 或我们二次封装
2. 写配置(监工唯一写):$HERMES_HOME/.env 写 API_SERVER_ENABLED=true / API_SERVER_KEY=<随机> / PORT=8642
   + 配好 LLM provider(命名 providers 块接 new-api)
3. spawn `hermes gateway`(前台,捕获 stdout/stderr),等 "API server listening on ..."
4. 轮询 /health 就绪 → /v1/capabilities 校验
5. 对话:POST /v1/runs + SSE 事件流
6. 关闭:SIGTERM
```

### 安全发行配方(闭源 B2B 红线)

打包时按此配置可通过当前已核查的合规两闸口:
- **不接 Nous Portal**。客户自带国产模型 key 是一种安全发行 profile；平台 credit profile 仍经我方受控服务端入口，二者的产品路由待与 002 统一。
- **不装** `messaging`(LGPL python-telegram-bot)、`edge-tts`(LGPL)、`honcho`/`hindsight`(license 未声明)extra。
- **不开** `computer_use.cua_telemetry`(默认即关,注入 `CUA_DRIVER_RS_TELEMETRY_ENABLED=0`)。
- trajectory 纯本地落盘,无外传——确认无内建遥测框架。
- MPL-2.0 的 `certifi`/`pathspec` 是文件级弱 copyleft,未修改分发合规,可用。

### Desktop 组件复用规范(借零件,非搬房子)

Hermes Desktop(`hermes-upstream/apps/desktop/`,Electron+React+Vite,MIT)与引擎**同仓库**:fetch 一次 `hermes-upstream/` 引擎与 Desktop 源码全有,不另拉、不另加 gitignore。但二者纪律相反:

- **引擎 = 黑盒**(只跑 `hermes gateway`、不改、不入库,留在 gitignored 的 `hermes-upstream/`)。
- **Desktop 的 React 组件 = 借来的零件**(抄进我方 Tauri 壳、变成我方代码、入库)。

复用动作(属阶段 2 产品化,**非 spike**):
1. **抄**:从 `hermes-upstream/apps/desktop/src/` 挑具体组件(skills 面板 / memory 浏览 / provider 切换器)源文件,复制进 `apps/desktop/src/`。
2. **重接数据线**:Hermes 组件原连其 dashboard 私有 API;抄进来后数据源换成我方——WORK 面板接 Hermes `/v1`、CODE 面板接 codex。**抄的是 UI 的样子,不是连到哪**。
3. **署名(MIT 合规,别漏)**:每个抄来的文件加头部注释标明来源 commit;仓库建 `THIRD-PARTY`/`NOTICE` 收 MIT 全文。
4. **隔离运行时差异**:Hermes Desktop 是 Electron、我方是 Tauri;纯 UI 组件多可直接搬,凡触碰 Electron API(ipcRenderer/preload 等)处必须改写为 Tauri 等价(`@/services/tauri.ts` / `events.ts`)。

铁律:**整个 Hermes Desktop app 我方永不运行、永不分发——它只是「组件捐献者」**。绝不把它当壳跑起来(GUI 底座是 CodexMonitor/Tauri,见 decisions)。

### 交付模型（Windows 本地胖安装包）

codex 是单二进制;Hermes 是 Python 3.11 + uv + (可选 Node/ffmpeg)。产品转向**本地工作台**后(云端工作台已推翻,见 decisions),Windows MVP 交付目标 = **胖安装包:Tauri 壳 + codex 单二进制 + 内嵌 Python + 预构建 Hermes venv,不冻结**。Tauri 像纳管 codex 一样 spawn `hermes gateway` 子进程。这里的“本地”指文件、编排和工作台运行在用户机器；模型 prompt/输出仍会发送到用户选择的云模型服务。

- **实测体量(见 verification)**:venv 104MB + CPython ~55MB,无重物。**v1 基础包 ≈ 230-250MB**(砍 Node/ffmpeg),全功能 ~350-380MB;工作台独立下载不进主包。属轻量。
- **不冻结**(PyInstaller/Nuitka 会破坏 Hermes 的动态 import / 插件热加载)、**不用容器**(Docker on Windows 对小白是天堑)。
- **MVP 只构建/验证 Windows venv**（原生 wheel 平台相关）；uvloop 在 Windows 不可用，需实测降级 asyncio。macOS/Linux venv 构建推迟到 post-MVP。
- API server 依赖 **aiohttp**(单装,Apache-2.0),非 fastapi。

## 测试策略

- 单元测试：壳侧 Hermes `/v1` 客户端、编排器子任务切分逻辑。
- 集成测试：WORK 接 GLM 无网关跑通；CODE 经网关跑通；两模式共读一份记忆。
- 协议探针：沿用 `.scratch/m0_*.py` 验 codex app-server 兼容；新增 Hermes `/v1` 探针。
- 人工验证：跨模式任务「Hermes 理解→codex 造插件→回 Hermes 带用」端到端。
- Windows office 质量基线：5 个核心场景 × 10 次，目标 ≥8/10 无人工干预完成；该结果出来前不得把 WORK 写成产品化完成。
