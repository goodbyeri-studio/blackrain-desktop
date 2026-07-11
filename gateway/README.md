# gateway —— 模型路由 / Responses⇄Chat 翻译层

架构文档 [03](../docs/03-系统架构.md) 第 ② 层、[05 模型路由](../docs/05-模型路由.md)。把国产模型统一抽象成 OpenAI 兼容客户端,**用户在模型广场手动选 provider**;并解决 codex 默认走 Responses、而国产模型多是 Chat Completions 的协议落差。

> **当前状态（2026-07-12）**：本目录服务 CODE 路径，不服务 WORK/Hermes。`gateway.py` 已证明链路可行并进入打包资源配置，但仍是生产化未完成的原型；已记录的完整工具调用只在显式 `STRIP_TOOLS=0` 的开发/探针路径通过。当前 App 托管 spawn 未覆盖默认值 `1`，普通启动会剥除工具，这是待修发布阻塞项。Windows 发布级证据看 `.specs/007-windows-client/verification.md`；配置存在不等于安装包已验收。

## 关键约束（接国产模型的命门）

codex 默认 `wire_api="responses"`，网关必须实现 `/v1/responses` 端点 + **Responses⇄Chat 双向翻译**（SSE 语义事件 / function_call / reasoning / 消息重排）。**只翻 Chat Completions 的普通网关对 codex 无效。**

⚠️ **`wire_api="chat"` 直连这条捷径已被上游删除**（2026-06 在内核 51b3cd5 实测，见 [codex#7782](https://github.com/openai/codex/discussions/7782)）。因此本翻译层**从 M1 起就是硬依赖**，不是可选的后期演进。

## `gateway.py` —— 已验证的最小原型

零依赖（纯 Python stdlib）的 responses⇄chat 翻译网关。**这是可行性验证产物，不是生产代码**——用来证明「第三方 Chat provider 经翻译能驱动 codex 内核」这条链路成立。当前内置 DeepSeek provider，并支持用环境变量追加 OpenAI-compatible provider。

### 运行

```bash
# 需先设好密钥（从仓库根 .env 或环境变量）
export DEEPSEEK_API_KEY=sk-...

# 启动网关（默认监听 127.0.0.1:8899）
python3 gateway/gateway.py
```

可配环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 默认 DeepSeek 时必填 | DeepSeek API key，从环境读，不硬编码 |
| `BLACKRAIN_MODEL_GATEWAY_PROVIDERS` / `GW_PROVIDERS_JSON` | 空 | JSON 数组，追加或覆盖 provider registry |
| `GW_PORT` | `8899` | 监听端口 |
| `STRIP_TOOLS` | `1` | `1`=剥掉 tools 逼纯文本回复（仅协议诊断）；`0`=保留工具，允许多轮工具调用。开发脚本会设为 `0`，当前 App 托管路径尚未设置 |
| `GW_LOG` | `/tmp/gateway.log` | 交互日志路径 |

codex 内核侧 `config.toml` 对应配置：

```toml
model = "deepseek-v4-flash"
model_provider = "blackrain_gateway"

[model_providers.blackrain_gateway]
name = "BlackRain Gateway"
base_url = "http://127.0.0.1:8899/v1"
env_key = "BLACKRAIN_GATEWAY_API_KEY"
wire_api = "responses"
```

第三方 OpenAI-compatible provider 示例：

```bash
export QWEN_API_KEY=sk-...
export BLACKRAIN_MODEL_GATEWAY_PROVIDERS='[
  {
    "id": "qwen",
    "name": "Qwen",
    "kind": "openai-compatible",
    "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "api_key_env": "QWEN_API_KEY",
    "models": [
      {
        "model": "qwen3-coder-plus",
        "display_name": "Qwen3 Coder Plus",
        "description": "coding model",
        "is_default": true
      }
    ]
  }
]'
python3 gateway/gateway.py
curl -s http://127.0.0.1:8899/v1/models
```

### 已验证 vs 未验证（诚实边界）

**✅ 已实测通过**（2026-06-23，内核 51b3cd5 + 真 DeepSeek key）：

- 全栈端到端：壳协议 ↔ 内核 ↔ 网关 ↔ DeepSeek
- 单工具单轮往返；**多轮工具调用 + 工具历史配对**（`tool_calls` ↔ `tool_call_id`，正是 LiteLLM 会崩的点）——实测真建出文件、`turn/completed` 干净收尾
- **真流式翻译**：DeepSeek `stream=true` 边收边译。`reasoning_content` → `response.reasoning_text.delta`（思考过程实时展开）、`content` → `output_text.delta`（逐字输出）、`tool_calls` 分片按 index 累积。实测 v4-pro 一轮收到 44 个 reasoning delta + 39 个 text delta，零 panic；流式下工具调用建文件正常

**✅ M1.5 新增实测**（2026-06-24，`blackrain_gateway` 配置 + App 托管 sidecar 代码路径）：

- `CODEX_HOME/config.toml` 固定写入 `model_provider = "blackrain_gateway"`
- App 后端具备 Gateway sidecar 启动、停止、状态、健康检查、端口、日志路径能力
- `m0_protocol_probe.py` 在 `blackrain_gateway` 配置下四探针通过
- `STRIP_TOOLS=0` 时真实 DeepSeek 工具调用通过：内核发起 `commandExecution`，创建 `hello.txt`，`turn/completed error=None`

上述工具调用是手动/开发探针证据，不是普通 App 启动证据。产品态必须先让 App spawn 显式传 `STRIP_TOOLS=0`，再在 Windows 客户端重跑。

**✅ 公开 MVP hardening 已接入**（2026-06-24）：

- 设置页可保存/清除 provider API key；真实 key 走系统凭据存储，不写入 `settings.json` 或 Codex config
- Provider `/models` 测试和 Gateway sidecar registry 会优先使用系统凭据中的 key，缺失时回退 `api_key_env`
- Tauri base/windows bundle resources 已纳入 `gateway/gateway.py`，并有 cargo test 守护配置
- macOS Keychain 真实写入/读取/清理 smoke 已通过
- macOS 无签名 app/dmg 已完成真实打包、dmg 挂载资源检查和包内二进制短启动 smoke

**❌ 未验证 / 待补**：

- 并行多工具、3+ 轮深循环
- `namespace` 工具（如 `multi_agent_v1`，当前被丢弃）
- reasoning/content 混排、缺字段和异常流的鲁棒性（单次 reasoning delta 流式样例已经通过）
- 正式签名、公证、updater 私钥配置
- provider 热重载、真实第二 provider
- Windows Credential Manager / Linux Secret Service 的人工 smoke
- `deepseek-v4-flash` / `deepseek-v4-pro` 模型元数据未注册的 warning（内核报 fallback metadata）

### 关键翻译映射（已验证版，固化自实测）

**请求侧（Responses → Chat）**：`instructions` → system msg；`input` message（`developer`→`system`）→ chat msg；`function_call` → `assistant{tool_calls[{id=call_id, function}]}`；`function_call_output` → `tool{tool_call_id=call_id}`。

**响应侧（Chat → Responses SSE）**：
- 文本：`response.created` + `output_item.added`（空 content，**必须先发，否则内核 panic "OutputTextDelta without active item"**）+ `output_text.delta` + `output_item.done` + `completed`
- 工具：`output_item.added`（function_call）+ `function_call_arguments.delta` + `output_item.done` + `completed(end_turn=false)`

## 未来生产化路线（选型）

原型证明了可行性，但要进产品需固化成正式组件。两种集成形状：

| 姿态 | 选项 | 取舍 |
|---|---|---|
| **sidecar（v1 最快）** | 把本 `gateway.py` 补全（streaming/鲁棒性）或 fork [lich0821/ccNexus](https://github.com/lich0821/ccNexus)（Go, MIT） | 独立进程，翻译逻辑隔离、可单测；代价=多一个进程 |
| **进程内（优雅终态）** | 在 `apps/desktop` 的 Rust 里独立实现翻译线程；[cc-switch](https://github.com/farion1231/cc-switch) 只能在完成许可证/NOTICE 审计后作为行为参考，不能直接移植未知许可代码 | 单一二进制单进程；代价=自己用 Rust 养翻译代码 |

> 本目录的 `gateway.py` 是 sidecar 路线的种子。下一步若走 sidecar，优先补 streaming + 模型元数据注册 + 错误处理。

## `proxy.py` —— 平台 credit 代理（M-A2，独立组件）

与 `gateway.py` **不同职责、不同协议**。见 [`.specs/002-accounts-credits/`](../.specs/002-accounts-credits/)。它是已经跑通过 Supabase/DeepSeek 计量闭环的过渡实现；生产态是否由 new-api 直接替代、继续保留为 credit 适配层，及 WORK/Hermes 如何复用同一计费口径，仍需在 002/003 中统一决策。

- `gateway.py`：本地翻译层，说 **Responses**（codex 专用），跑在用户机器上。
- `proxy.py`：平台 credit 代理，说 **Chat Completions**（OpenAI 兼容），跑在**服务端常驻主机**，持平台 DeepSeek key、按 usage 扣 credit。

**为什么分开**：翻译只留 `gateway.py` 一份（铁律 2）；代理说 Chat Completions 才能与未来 new-api 同形态、零改动顶替。代理**不做翻译**。

### credit 模式数据流

```
内核(Responses) → 本地 gateway.py(翻译成 Chat, base_url=代理, Bearer=用户 Supabase JWT)
    → proxy.py(校验 JWT + 查余额 + 注平台 key + 转发 + 计量扣 credit) → DeepSeek
```

BYOK 模式则不经代理：`gateway.py` 直连 `api.deepseek.com`、用用户自己的 key。

### 运行（本地调试）

```bash
# 从仓库根 .env 载入 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY / DEEPSEEK_API_KEY
set -a; source .env; set +a
PROXY_PORT=8800 python3 gateway/proxy.py        # 监听 127.0.0.1:8800
#   PROXY_LOG=/tmp/proxy.log  DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

接口：`POST /v1/chat/completions`（Bearer=用户 JWT）、`GET /v1/models`（带倍率）、`GET /health`。

### 已验证（2026-06-25，真实 DeepSeek + 真实 Supabase）

- 转发：用户对话经代理 → DeepSeek，SSE 流式透传成功。
- 计量：flash 0.5x，33 token → 扣 0.00165 credit，与 `credit_math` 锚定分毫不差；`credit_ledger` 落账含 token 明细。
- 门禁：余额耗尽 → 402 `insufficient_credits`；无效 JWT → 401；未知模型 → 400。
- 脱敏：日志无平台 key / JWT / 用户内容 / 完整 user_id。

单测：`cd gateway && python3 -m unittest test_proxy test_credit_math -v`（纯逻辑，不连网）。

### 计量口径

`credit_math.py`：`credits = (input+output) × 模型倍率 / 10000`（混合单价占位）。倍率 flash 0.5x / pro 1.5x，比值钉死 DeepSeek 真实价 3:1，与前端 `creditPricing.ts` 一致。正式定价改 `TOKENS_PER_CREDIT_AT_1X` 一处。

### 部署（常驻服务）

`proxy.py` 纯 stdlib，`Dockerfile` 极简（仅 `credit_math.py` + `proxy.py`）。**密钥一律运行时注入，绝不烤进镜像/入库。** 容器内设 `PROXY_HOST=0.0.0.0`（Dockerfile 已默认），平台注入 `PROXY_PORT`。

需运行时注入的环境变量：`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_ANON_KEY`、`DEEPSEEK_API_KEY`。

本地容器冒烟（已验证）：

```bash
cd gateway
docker build -t blackrain-proxy .
docker run -d --name p -p 8801:8080 \
  -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e SUPABASE_ANON_KEY=... -e DEEPSEEK_API_KEY=... blackrain-proxy
curl -s http://127.0.0.1:8801/health
```

**Fly.io**（推荐，起步基本免费）：`fly launch --no-deploy` → `fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... DEEPSEEK_API_KEY=...` → `fly deploy`。Fly 边缘自动 TLS（HTTPS）。
**Railway**：连仓库选 `gateway/` 目录，Variables 里设上述四个 secret，自动构建部署。

历史设想是 new-api 按 `base_url + Bearer <jwt>` 接缝顶替本代理；当前双引擎设计已经实际使用 new-api 做模型中转，但 Supabase JWT、余额门禁和原子扣款由谁承担尚未完成统一设计。不要把本句理解为生产迁移已经完成。
