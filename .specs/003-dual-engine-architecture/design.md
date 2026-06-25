# Design

## 总体方案

一个监工壳（Tauri，fork 自 CodexMonitor）指挥**两个引擎黑盒**——Hermes 管 WORK、codex 管 CODE——记忆/skills/computer-use 全部**外置共享**，所有模型调用汇入 new-api 计量形成 token 差价闭环。架构与 Hermes 自身「壳+引擎分离」同形，但 codex 深集成与专属 `CODEX_HOME` 是我方已领先 Hermes 的资产。

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

## 测试策略

- 单元测试：壳侧 Hermes `/v1` 客户端、编排器子任务切分逻辑。
- 集成测试：WORK 接 GLM 无网关跑通；CODE 经网关跑通；两模式共读一份记忆。
- 协议探针：沿用 `.scratch/m0_*.py` 验 codex app-server 兼容；新增 Hermes `/v1` 探针。
- 人工验证：跨模式任务「Hermes 理解→codex 造插件→回 Hermes 带用」端到端。
