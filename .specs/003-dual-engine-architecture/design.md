# Design

## 总体方案

一个监工壳（Tauri，fork 自 CodexMonitor）指挥**两个引擎黑盒**——Hermes 管 WORK、codex 管 CODE——所有模型调用汇入 new-api 计量形成 token 差价闭环。**全部纯本地交付**（工作台/公司本地下载 + 热拔插，云端已推翻）；唯一的服务器件是 new-api 中转。codex 深集成与专属 `CODEX_HOME` 是我方已领先 Hermes 的资产。

## 产品形态全景（一壳·两引擎·一闭环·四层·三档）

```text
┌──────────────────────────────────────────────────────────┐
│ 监工壳 (Tauri, 纯本地)                                       │
│   coding surface (=codex app)      working surface          │
│   会写代码的人、重开发              非开发者、对话即完成        │
│                                    ├ ① 对话模式 (类 codex)    │
│                                    ├ ② 工作台模式 (挂1个)     │
│                                    └ ③ 公司模式 (挂多个/Pro)  │
└──────┬──────────────────────────────────┬──────────────────┘
   codex app-server JSON-RPC          Hermes HTTP /v1
   (+ 专属 CODEX_HOME)                (+ 独立 HERMES_HOME)
       │                                  │
       ▼ Responses→gateway→Chat           ▼ Chat (零翻译)
       └──────────────► new-api 中转(计量/差价) ◄──┘
                              ▼
                       国产模型 (DeepSeek/GLM…)

四层能力(粒度递增):
  skill / mcp / acp  = 两引擎共用的原子积木(非面向用户的产品包)
        ↓ 拼装
  插件   = 当前对话 @xxx,复用当前引擎,资产即装(轻)
  工作台 = 预打包本地环境(便携包),挂到对话热拔插(重,自带环境)
  公司   = 同时挂多个工作台,Pro 专属,一人公司
```

- **引擎路由**:coding→codex(无工作台/公司概念);working→Hermes(三档模式)。称呼:对话的 AI=专家,多 agent=专家团。
- **插件 vs 工作台铁规则**:要整套预装环境/隔离→工作台;只给当前对话加能力→插件。
- **工作台 = 可挂载的 MCP 环境**:挂载=起便携包进程 + 给活会话动态注册 skill/MCP;拔掉=注销+杀进程;数据在用户项目文件夹(运行时无状态,拔掉不丢)。v1 官方工作台可信、**不用容器**。
- **公司 v1**:多工作台并存 + 手动指派 + 闲时挂起(本地多容器吃内存,故 Pro);**不做**多 agent 自动协同(留后期)。

## 三层纪律（防两种反向误读）

切分不是「引擎 vs GUI」，是三层。守住它，既不会手痒去改引擎（失血），也不会以为自己只能做个皮（没护城河）。

| 层 | 例子 | 纪律 | 能自定义吗 |
|---|---|---|---|
| **引擎(黑盒)** | codex、Hermes | 成千上万人维护的成熟内核，**绝不分叉**，只读/只调用/白嫖上游日更。分叉=日更能力当场归零。 | ❌ 碰都不碰 |
| **产品层(全自建)** | 监工壳编排、双引擎路由、外置记忆/skills、computer-use 接入、**插件市场、环境复刻引擎、token 差价闭环、网关** | 100% 我方代码，随便造。**护城河全在这层**，比 GUI 更该投入。 | ✅ 主战场 |
| **借来的零件(抄进来)** | Hermes Desktop 的 React 组件 | **摘零件，不搬房子**：单独抄具体组件进我方 Tauri 壳（保留 MIT 署名），并把数据源重接到我方双引擎。不 fork 整个 Desktop。 | ✅ 抄一段≠fork 整个 |

要点：① **「不分叉引擎」≠「不写代码」**——不写引擎代码，但写海量包在引擎外的产品层代码。② **GUI 只是产品层最显眼的一块**，真正值钱的是插件市场/环境复刻/token 闭环。③ **抄 Desktop = 抄 UI 的样子，重接数据线**（WORK→Hermes `/v1`、CODE→codex），不是把 Electron 单体搬来当壳。

## 架构边界

- 属于 `apps/desktop` 的逻辑：监工壳；WORK/CODE 两个 surface；编排器（跨模式任务的子任务切分与回传）；纳管 Hermes 子进程（启停 + `/v1` 调用）；驱动 codex app-server（已有）。借 Hermes Desktop 的 MIT React 组件（skills/memory/provider 面板）。
- 属于 `gateway` 的逻辑：responses⇄chat 翻译，**只挂在 CODE 路径**（codex→Responses→翻译→Chat→new-api）。
- 属于 `plugins` / `workbenches` 的内容：CODE 模式产出的插件；外置记忆/skills 共享存储的读写约定。
- 明确不改 `codex-upstream` 的部分：agent 循环、协议层；codex 仍为原装黑盒。

## 数据流

```text
WORK（业务专家）                       CODE（插件创作者）
  -> 监工壳 WORK surface                 -> 监工壳 CODE surface
  -> HTTP /v1 (Hermes 黑盒子进程)         -> app-server JSON-RPC (codex + 专属 CODEX_HOME)
  -> Chat Completions (零翻译)            -> Responses
  -> new-api 计量 ─┐                      -> gateway responses⇄chat
                   │                      -> Chat -> new-api 计量
  国产模型 <───────┴──────────────────────────────┘

跨模式编排：监工壳 = 大脑
  WORK(Hermes 理解需求) → 切出干净子任务 → CODE(codex 造插件) → 回传结果 → WORK(带用户用)
  记忆/skills：两引擎都读写同一份外置共享存储（不住任何引擎肚子里）
```

## 接口与配置

- Tauri command / JSON-RPC：
  - CODE：沿用现有 codex app-server JSON-RPC 链路（`shared/*` → `lib.rs` → `services/tauri.ts` → daemon `rpc.rs`）。
  - WORK：新增 Hermes 子进程纳管 + HTTP `/v1` 客户端（`/v1/chat/completions`、`/api/sessions`）。
- `config.toml` / `CODEX_HOME`：CODE 用 App 专属 `CODEX_HOME`；Hermes 用独立配置 `~/.hermes/config.yaml`（命名 `providers:` 块接 new-api）。
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
| 数据飞轮（trajectory/RL 外传 Nous） | 闭源商用前配置层关闭外传，读源码确认 |

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

打包时按此配置即可同时过合规两闸口:
- **不接 Nous Portal**,只用客户自己的国产模型 key(从架构上消除 Portal ToS 训练/留存问题)。
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

### 交付模型(纯本地胖安装包)

codex 是单二进制;Hermes 是 Python 3.11 + uv + (可选 Node/ffmpeg)。产品转向**纯本地**后(云端工作台已推翻,见 decisions),交付 = **胖安装包:Tauri 壳 + codex 单二进制 + 内嵌 Python + 预构建 Hermes venv,不冻结**。Tauri 像纳管 codex 一样 spawn `hermes gateway` 子进程。

- **实测体量(见 verification)**:venv 104MB + CPython ~55MB,无重物。**v1 基础包 ≈ 230-250MB**(砍 Node/ffmpeg),全功能 ~350-380MB;工作台独立下载不进主包。属轻量。
- **不冻结**(PyInstaller/Nuitka 会破坏 Hermes 的动态 import / 插件热加载)、**不用容器**(Docker on Windows 对小白是天堑)。
- **CI 多平台各构建一份 venv**(原生 wheel 平台相关);uvloop 在 Windows 不可用,自动降级 asyncio。
- API server 依赖 **aiohttp**(单装,Apache-2.0),非 fastapi。

## 测试策略

- 单元测试：壳侧 Hermes `/v1` 客户端、编排器子任务切分逻辑。
- 集成测试：WORK 接 GLM 无网关跑通；CODE 经网关跑通；两模式共读一份记忆。
- 协议探针：沿用 `.scratch/m0_*.py` 验 codex app-server 兼容；新增 Hermes `/v1` 探针。
- 人工验证：跨模式任务「Hermes 理解→codex 造插件→回 Hermes 带用」端到端。
