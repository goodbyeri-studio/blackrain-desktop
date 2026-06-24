# Decisions

## 2026-06-24：Codex 只连接 BlackRain Gateway

- 决策：Codex 内核侧只配置一个固定 provider：`blackrain_gateway`。
- 原因：第三方模型协议、key、base URL、模型元数据和错误处理都应由 BlackRain 管理，不能让 Codex 直接感知每一家 provider。
- 替代方案：为每个第三方 provider 都写入 Codex `config.toml`。
- 为什么不用替代方案：会让 Codex 配置膨胀，切模型时污染内核配置，也削弱 Gateway 做统一协议翻译、审计和路由的能力。
- 影响范围：`CODEX_HOME/config.toml` 写入、Gateway lifecycle、model picker、provider settings。
- 后续复查条件：如果上游 Codex 提供稳定、可扩展、产品级 provider registry，再评估是否复用一部分。

## 2026-06-24：第三方 API 配置属于 App/Gateway，不属于 Codex

- 决策：第三方 API key、base URL、模型列表由 BlackRain App 的“模型网关”设置页管理。
- 原因：App 是唯一写配置的人；产品态不能要求用户编辑 `.env`、`config.toml` 或 `~/.codex`。
- 替代方案：继续用 `DEV_MODEL` / `.env` / 手写 `config.toml` 管理模型。
- 为什么不用替代方案：这是开发态临时方案，不能成为普通用户体验。
- 影响范围：Settings UI、local secure storage、Gateway config、dev-client 脚本。
- 后续复查条件：产品态 key 存储方案定稿后更新本决策。

## 2026-06-24：模型选择器读取 Gateway registry

- 决策：每个对话的模型选择器从 Gateway/App registry 读取可用模型，而不是写死 DeepSeek 模型或读取 Codex 原始 provider 列表。
- 原因：用户选择的是 BlackRain 可用模型，不是 Codex provider；Gateway registry 才知道模型能力、启用状态和真实 provider。
- 替代方案：前端硬编码 DeepSeek 默认模型，或者只使用 Codex `model/list`。
- 为什么不用替代方案：无法支持自定义第三方 API，也无法展示能力标签和不可用状态。
- 影响范围：model picker、thread settings、provider settings、Gateway `/v1/models`。
- 后续复查条件：如果 Codex app-server `model/list` 已能完整透出 Gateway registry，可让 UI 通过 app-server 间接读取。

## 2026-06-24：M1 不做完整智能路由

- 决策：M1 只做用户可配置 provider 和手动模型选择；自动按任务路由只保留数据结构和能力标签。
- 原因：先保证链路稳定、配置可用、工具调用正确；自动路由会扩大范围并掩盖协议翻译问题。
- 替代方案：M1 同时做自动路由、成本策略、任务分类。
- 为什么不用替代方案：范围过大，且缺少足够真实模型盲测数据。
- 影响范围：Gateway registry 先存能力，不做复杂调度。
- 后续复查条件：至少两个 provider 跑通工具调用后，再建独立 spec 做模型路由策略。

## 2026-06-24：M1 只记录 `apiKeyEnv`，暂不保存真实 API key

- 决策：设置页和 Gateway registry 的 M1 实现只记录 provider 的 `apiKeyEnv`，真实 key 仍从环境变量读取。
- 原因：这能先消除“Codex 直连某 vendor”的架构问题，同时避免在未定安全存储方案前把第三方 key 明文写入普通 settings。
- 替代方案：直接在 `settings.json` 存储 API key。
- 为什么不用替代方案：普通 JSON 存储不满足产品态安全预期，也容易被日志/导出误带出。
- 影响范围：Settings UI、Gateway registry、dev-client、后续 sidecar lifecycle。
- 后续复查条件：Tauri 安全存储/系统钥匙串接入后，更新设置页为真实 key 输入与测试连接。

## 2026-06-24：公开 MVP 使用系统凭据存第三方 API key

- 决策：公开交付版 MVP 起，provider API key 通过 Rust `keyring` 写入系统凭据存储；`settings.json` 只保存 provider 元数据和 `apiKeyEnv` fallback。
- 原因：普通用户不能被要求编辑 `.env`，也不能把第三方 key 明文落进普通 JSON 配置或 Codex config。
- 替代方案：继续 env-only，或把 key 加密后写入 app settings。
- 为什么不用替代方案：env-only 不是交付体验；自研加密文件仍涉及密钥管理，安全边界弱于系统 Keychain/Credential Manager/Secret Service。
- 影响范围：Settings 模型网关页面、Tauri command、Gateway sidecar registry 生成、provider `/models` 测试。
- 后续复查条件：完成真实安装包 smoke 后，记录 macOS/Windows/Linux 各平台凭据存储可用性；如 Linux Secret Service 在无桌面环境不可用，需要明确平台支持边界。

## 2026-06-24：设置页连接测试只探测 `/models`

- 决策：M1 的“测试连接”和“刷新模型”只请求 provider 的 OpenAI-compatible `/models`，不发真实聊天请求。
- 原因：设置页测试不应消耗用户 token，也不应把 provider 测试变成一次隐藏会话。
- 替代方案：发送一条最短 Chat Completions 请求作为连通性测试。
- 为什么不用替代方案：会产生真实模型调用成本，还会把不同厂商对空 prompt、system prompt、streaming 的差异提前带进设置页。
- 影响范围：Settings UI、Tauri command、Daemon RPC、shared model gateway core。
- 后续复查条件：如果需要验证工具调用/streaming 能力，应在独立“运行时诊断”或协议探针里做，不混入普通设置页测试。

## 2026-06-24：缺省 CODEX_HOME 使用 App data

- 决策：如果外部没有显式设置 `CODEX_HOME`，App 启动时把 `CODEX_HOME` 指向 App data 下的 `codex-home`。
- 原因：App 是唯一写配置的人，不能默认写用户机器已有的 `~/.codex`；模型网关启动时需要安全写入 `blackrain_gateway` provider config。
- 替代方案：沿用 Codex 默认 `~/.codex`。
- 为什么不用替代方案：会污染用户原有 Codex CLI/App 配置，也违反 BlackRain 的配置隔离边界。
- 影响范围：AppState 初始化、Codex app-server 子进程、Gateway sidecar config 写入、agents/prompts 等读取路径。
- 后续复查条件：如果将来允许导入用户 Codex 配置，应做显式迁移/导入，而不是共享同一个 home。

## 2026-06-24：M1.5 采用 App 托管 Python sidecar

- 决策：M1.5 先由 App 托管 `gateway/gateway.py` sidecar，提供启动、停止、状态、健康检查、端口和日志路径。
- 原因：这是把模型网关从开发脚本推进到产品运行时的最短路径，同时保留翻译层可替换性。
- 替代方案：立即把 gateway 翻译逻辑移植进 Rust 进程内。
- 为什么不用替代方案：Rust 移植会扩大协议翻译风险；当前更重要的是先证明 App 托管生命周期和真实工具调用链路。
- 影响范围：Tauri command、AppState runtime、Settings 模型网关页面、Codex config 写入。
- 后续复查条件：打包安装验证通过后，再评估是否把 Python sidecar 替换成正式二进制或 Rust 内嵌实现。

## 被推翻的方案

### 2026-06-24：Codex 直接配置 DeepSeek provider

- 原方案：在 `CODEX_HOME/config.toml` 中写 `[model_providers.deepseek]`，让 Codex 直接认为自己连接 DeepSeek。
- 为什么推翻：这只适合 M1 原型验证；产品态必须支持多 provider 和自定义第三方 API。
- 替代方案：Codex 固定连接 `blackrain_gateway`，DeepSeek 只是 Gateway registry 中的一个 provider。
