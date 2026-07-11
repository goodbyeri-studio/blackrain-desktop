# Design

## 总体方案

Codex 内核永远只连本地 BlackRain Gateway；第三方 provider、API key、模型列表和协议差异全部由 BlackRain App + Gateway 管理。前端模型选择器显示的是 BlackRain Gateway registry 中的模型，而不是 Codex 原生 provider 列表。

当前边界（2026-07-11）：该 Gateway 只挂在 CODE 路径；WORK/Hermes 使用原生 Chat Completions，不经过 Responses⇄Chat 翻译。`gateway.py` 仍是可替换的可行性原型，本文记录的是其接缝和已验证行为，不宣称它已经达到生产网关标准。

```text
对话模型选择器
  -> App provider/model registry
  -> Codex thread/turn 使用 model id
  -> Codex 内核请求 blackrain_gateway /v1/responses
  -> BlackRain Gateway 按 model id 解析真实 provider
  -> DeepSeek / Qwen / GLM / Kimi / OpenAI-compatible API
```

## 架构边界

- 属于 `apps/desktop` 的逻辑：
  - 模型网关设置页。
  - provider 配置的读写、校验、key 存储协调。
  - 专属 `CODEX_HOME/config.toml` 写入。
  - Gateway sidecar 生命周期管理。
  - 对话模型选择器的数据源和 per-thread model 选择。
- 属于 `gateway` 的逻辑：
  - `/v1/responses` Responses⇄Chat / Responses passthrough 适配。
  - `/v1/models` 聚合模型列表。
  - provider/model registry 的运行时解析。
  - 第三方 API 错误归一化、SSE 事件顺序、工具调用历史转译。
- 属于 `plugins` / `workbenches` 的内容：
  - 本阶段不直接处理。
  - 后续工作台可以声明推荐模型或能力需求，但不能绕过 Gateway。
- 明确不改 `codex-upstream` 的部分：
  - agent loop、tools、sandbox、approval、app-server 协议。
  - 不新增内核 provider，不恢复 `wire_api="chat"`。

## Codex 配置形状

App 写入专属 `CODEX_HOME/config.toml` 时固定为 BlackRain Gateway：

```toml
model = "deepseek-v4-flash"
model_provider = "blackrain_gateway"

[model_providers.blackrain_gateway]
name = "BlackRain Gateway"
base_url = "http://127.0.0.1:<managed-port>/v1"
env_key = "BLACKRAIN_GATEWAY_API_KEY"
wire_api = "responses"
```

说明：

- `model` 是 Gateway registry 中的模型 ID，不等于 Codex provider。
- `<managed-port>` 由 App 分配和托管。
- `BLACKRAIN_GATEWAY_API_KEY` 是 App 与本地 Gateway 之间的本地能力 token，不是第三方模型 key。
- 第三方模型 key 不进入 Codex `config.toml`。

## Provider Registry

逻辑模型：

```ts
type ProviderKind = "responses" | "chat_completions" | "openai_compatible_chat";

type ProviderConfig = {
  id: string;
  displayName: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKeyRef: string;
  enabled: boolean;
  models: GatewayModel[];
};

type GatewayModel = {
  id: string;
  displayName: string;
  providerId: string;
  enabled: boolean;
  contextWindow?: number;
  capabilities: {
    tools?: boolean;
    reasoning?: boolean;
    vision?: boolean;
    streaming?: boolean;
    longContext?: boolean;
  };
  tags?: string[];
};
```

Registry 约束：

- 模型 ID 必须全局唯一。推荐格式：`<provider-id>/<model-id>`；为了兼容早期默认值，可为 DeepSeek 暂留别名 `deepseek-v4-flash`。
- Provider disabled 时，其模型不出现在对话模型选择器里。
- 模型能力标签用于 UI 展示和未来路由，不代表 M1 自动路由已经完成。

## 设置页

入口：`Settings -> 模型网关`。

M1 最小页面能力：

- provider 列表：启用状态、display name、base URL、模型数量、最近测试结果。
- provider 表单：display name、kind、base URL、API key、模型列表。
- 操作：
  - 新增自定义 provider。
  - 编辑 provider。
  - 启用/禁用 provider。
  - 测试连接。
  - 刷新 `/models`，失败时允许手动添加模型。
  - 设置全局默认模型。

## 对话模型选择器

- 新线程默认使用全局默认模型。
- 单线程/单对话可以覆盖模型。
- 模型列表按 provider 分组，优先展示推荐/默认模型。
- 模型项显示能力标签：工具调用、长上下文、推理、视觉、低成本、实验。
- 已有线程恢复时应尽量保留原模型 ID；如果模型被禁用，UI 显示不可用并要求用户选择替代模型。

## Gateway API 边界

Codex-facing surface：

- `GET /v1/models`
- `POST /v1/responses`

App-facing control surface（形状待实现时定稿）：

- 读取 gateway runtime status。
- 测试 provider 连接：由 App 后端直接探测 provider `/models`，不发真实聊天请求。
- 刷新 provider 模型列表：由 App 后端读取 provider `/models` 并回写 settings。
- 读取已启用模型 registry。

M1 可以先由 App 直接读写配置并重启 Gateway；不强制第一版做完整 HTTP control API。provider 测试和刷新必须同时暴露 Tauri command 与 Daemon RPC，避免本地/远程后端能力分叉。

## 失败模式

- Gateway 未启动：App 显示本地模型网关不可用，并提供重启操作。
- Provider key 错误：设置页测试失败，模型选择器保留但标记不可用。
- Provider `/models` 不兼容：允许手动添加模型。
- 第三方 API 返回非 SSE 或格式异常：Gateway 转成 `response.failed`，避免 Codex 内核 panic。
- 工具调用转译失败：Gateway fail closed，返回可读错误，不伪造成功。
- 配置损坏：App 保留上一份可用配置，或者回退到默认 DeepSeek provider（仅当 key 可用）。

## 测试策略

- 单元测试：
  - Provider registry 解析、模型 ID 去重、disabled 过滤。
  - config.toml 写入固定 BlackRain Gateway provider。
  - Gateway Responses⇄Chat 关键映射。
- 集成测试：
  - App 启动 Gateway，并确认 `/v1/models` 返回 registry。
  - Codex app-server 使用专属 `CODEX_HOME` 走 Gateway。
  - Windows MVP 在真实 NSIS 安装环境中使用随包运行时启动 sidecar，并完成 Credential Manager、端口、日志、进程回收 smoke（尚未完成，细项关联 007）。
- 协议探针：
  - `m0_protocol_probe.py` 验证 initialize / model list / thread start / turn start。
  - `m0_tool_driver.py` 验证真实工具调用。
- 人工验证：
  - 设置页新增 provider。
  - 对话模型选择器切换模型。
  - DeepSeek 默认链路跑通一轮文件创建或读取任务。
  - 当前发布平台只认 Windows 实机证据；下文已有 macOS smoke 仅保留为历史证据。
