# Design

## 总体方案

一个监工壳（Tauri，fork 自 CodexMonitor）指挥**两个引擎黑盒**——Hermes 管 WORK、codex 管 CODE——记忆/skills/computer-use 全部**外置共享**，所有模型调用汇入 new-api 计量形成 token 差价闭环。架构与 Hermes 自身「壳+引擎分离」同形，但 codex 深集成与专属 `CODEX_HOME` 是我方已领先 Hermes 的资产。

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

### 交付模型(与 codex 最大裂缝,待决)

codex 是单二进制;Hermes 是 git checkout + Python 3.11 + uv + Node 22 + ripgrep + ffmpeg 一整套,官方无 pip/Docker/单二进制现成产物。与「单安装包开箱即用」(docs/03)冲突,四个候选见 `decisions.md` 的待决项,倾向容器化(与 microVM 沙箱基建合流)。

## 测试策略

- 单元测试：壳侧 Hermes `/v1` 客户端、编排器子任务切分逻辑。
- 集成测试：WORK 接 GLM 无网关跑通；CODE 经网关跑通；两模式共读一份记忆。
- 协议探针：沿用 `.scratch/m0_*.py` 验 codex app-server 兼容；新增 Hermes `/v1` 探针。
- 人工验证：跨模式任务「Hermes 理解→codex 造插件→回 Hermes 带用」端到端。
