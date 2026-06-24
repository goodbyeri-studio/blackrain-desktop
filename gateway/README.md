# gateway —— 模型路由 / Responses⇄Chat 翻译层

架构文档 [03](../docs/03-系统架构.md) 第 ② 层、[05 模型路由](../docs/05-模型路由.md)。把国产模型统一抽象成 OpenAI 兼容客户端，按任务路由；并解决 codex 默认走 Responses、而国产模型多是 Chat Completions 的协议落差。

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
| `STRIP_TOOLS` | `1` | `1`=剥掉 tools 逼纯文本回复（调试用）；`0`=保留工具，允许多轮工具调用 |
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

**✅ 公开 MVP hardening 已接入**（2026-06-24）：

- 设置页可保存/清除 provider API key；真实 key 走系统凭据存储，不写入 `settings.json` 或 Codex config
- Provider `/models` 测试和 Gateway sidecar registry 会优先使用系统凭据中的 key，缺失时回退 `api_key_env`
- Tauri base/windows bundle resources 已纳入 `gateway/gateway.py`，并有 cargo test 守护配置
- macOS Keychain 真实写入/读取/清理 smoke 已通过
- macOS 无签名 app/dmg 已完成真实打包、dmg 挂载资源检查和包内二进制短启动 smoke

**❌ 未验证 / 待补**：

- 并行多工具、3+ 轮深循环
- `namespace` 工具（如 `multi_agent_v1`，当前被丢弃）
- reasoning 内容、错误鲁棒性
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
| **进程内（优雅终态）** | 在 `apps/desktop` 的 Rust 里写翻译线程，移植 [cc-switch](https://github.com/farion1231/cc-switch) 的转译逻辑 | 单一二进制单进程；代价=自己用 Rust 养翻译代码 |

> 本目录的 `gateway.py` 是 sidecar 路线的种子。下一步若走 sidecar，优先补 streaming + 模型元数据注册 + 错误处理。
