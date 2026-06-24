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

## 2026-06-25：网关强制 bearer 校验，且不对外开 CORS

- 决策：`gateway.py` 对 `/v1/models` 和 `/v1/responses` 强制校验 `Authorization: Bearer <BLACKRAIN_GATEWAY_API_KEY>`；移除此前的 `Access-Control-Allow-Origin: *` 与 OPTIONS 预检；`/health` 仍免鉴权供 App 存活探测。
- 原因：网关只服务本地 Codex 内核（进程间），不是浏览器端点。开 `*` CORS 且无鉴权时，用户访问的任意网页都能跨域 POST `/v1/responses`，用钥匙串里的第三方 key 盗刷 token 并读取模型输出。
- 替代方案：保留 CORS 但收紧 Origin 白名单；或只加鉴权不动 CORS。
- 为什么不用替代方案：网关没有任何合法的浏览器调用方，最稳妥是直接不输出 CORS 头（预检即被浏览器拦死），鉴权作为对本地非浏览器攻击者的纵深防御。
- 影响范围：`gateway.py` 请求处理、App spawn 网关时注入的 `BLACKRAIN_GATEWAY_API_KEY`、内核 config 的 `env_key`、dev-client.sh。
- 一致性约束：App 侧 `ensure_gateway_token()` 解析出的 token 必须同时注入网关进程与 App 进程环境，使内核继承到的 bearer 与网关校验值一致；token 为空时（手动调试起网关）跳过校验。
- 后续复查条件：若将来需要合法的本地浏览器调用方，再评估收紧的 Origin 白名单方案。

## 2026-06-25：provider 测试/刷新的密钥来源下沉到 shared core

- 决策：`fetch_provider_models`（shared core）统一走「内联 key → 系统凭据 → 环境变量」解析；删除 App 侧的 `hydrate_provider_probe_input` 包装。
- 原因：原实现里 App 命令会先 hydrate 钥匙串再调 core，而 Daemon RPC 直接调 core 只能读环境变量，导致远程后端模式下「测试连接/刷新模型」对钥匙串中的 key 不可见，违反 spec 要求的 Tauri/Daemon 能力对齐。
- 替代方案：在 Daemon RPC 侧复制一份 hydrate 逻辑。
- 为什么不用替代方案：违反「领域逻辑先落 shared、App/Daemon 只做薄适配」纪律，两份逻辑易漂移。
- 影响范围：`shared/model_gateway_core.rs`、`model_gateway.rs`（App 命令）、`rpc/model_gateway.rs`（Daemon）。
- 后续复查条件：无。

## 2026-06-25：对话模型选择器只用网关 registry，不信任内核 model/list

- 决策：`useModels` 的数据源收敛为 App 模型网关 registry（+ config.toml 模型兜底），不再 merge 内核 `model/list` 的返回。
- 原因：内核 `model/list` 在 `blackrain_gateway`（非 ChatGPT 后端、无 codex auth）下回落到内核自带 `models.json`（gpt-5.5 等 OpenAI 目录），网关 `resolve_model_route` 无法路由这些 id，选中即 `response.failed`。这正是 PR#10 当初 `void response` 要消灭、却在 model gateway MVP 里被 merge 重新引入的回归。
- 替代方案：保留 merge，但按 `providerId` 过滤内核返回。
- 为什么不用替代方案：内核从不回吐网关 registry，过滤后内核项永远为空，等于多写一层无效逻辑；registry 才是唯一真源。
- 影响范围：`features/models/hooks/useModels.ts`（删 `mergeModelOptions`/`parseModelListResponse` 引用）、`useModels.test.tsx`。
- 遗留同源项：设置页 Codex/Agents 区的 `useSettingsDefaultModels` 仍读内核目录，属本 PR 未触及的既有 surface，单独评估。

## 2026-06-25：网关 /health 身份标记 + 子进程端口追踪

- 决策：`/health` 返回 `service: blackrain-gateway` 标记，`gateway_health` 校验该标记才视为「我们的网关」；`ModelGatewayRuntime` 增加 `child_port` 记录子进程实际启动端口，settings 端口变更后 refresh 主动收掉旧端口上的残留进程。
- 原因：原 `gateway_health` 只看 HTTP 2xx，端口上任意进程都会被误判为 Running，使内核被指向陌生端点；改端口时旧子进程不被回收。
- 替代方案：health 阶段不做内容校验，仅靠「必须有 child 才算 Running」。
- 为什么不用替代方案：dev-client.sh 会独立起网关并让 App 复用（App 不持有 child），「必须有 child」会导致 dev 模式重复 spawn 撞端口；用 service 标记既能拒陌生进程，又能识别同款网关。
- 影响范围：`gateway.py` `/health`、`model_gateway.rs`（`gateway_health`/`refresh_runtime`/`stop_runtime_child`/spawn）、`state.rs`（`ModelGatewayRuntime`）。
- 后续复查条件：若将来给 health 加更强的实例指纹（pid/uuid），可在此基础上扩展。

## 2026-06-25：写 Codex config 与 sidecar 启动解耦

- 决策：`start_model_gateway_runtime` 中把 `persist_blackrain_gateway_codex_config` 提到 `gateway_registry_env_with_secrets`（缺 key 即 Err）之前。
- 原因：原顺序下，缺 key 时 registry 构建先 return Err，导致 `blackrain_gateway` provider 配置永远不写入 `CODEX_HOME/config.toml`；内核侧配置缺失。
- 替代方案：维持原顺序，靠设置页 readiness 拦住启动。
- 为什么不用替代方案：readiness 只挡 UI 上的「启动」按钮，自动启动路径仍会让 config 缺失；配置持久化不该依赖 sidecar 能否起。
- 影响范围：`model_gateway.rs` `start_model_gateway_runtime`。
- 后续复查条件：无。

## 2026-06-25：设置页默认模型来源也收敛到网关 registry

- 决策：设置页 Codex/Agents 区的 `useSettingsDefaultModels` 改为从网关 registry 同步派生（复用新抽出的 `features/models/utils/gatewayModelOptions.ts`），不再异步读内核 `model/list`。同时把 `OWN_MODELS`/`modelGatewayToOptions`/`publicGatewayModelId` 从 `useModels.ts` 抽到该共享工具，对话选择器与设置页单一真源。
- 原因：这是已修 #2 的同源 surface——内核 `model/list` 在 `blackrain_gateway` 下回落到自带 OpenAI 目录（gpt-*），设置页选中会把网关路由不了的 gpt 模型写进 `lastComposerModelId` / agent 配置。
- 替代方案：保留内核来源，只在设置页按 `providerId` 过滤。
- 为什么不用替代方案：内核从不回吐网关 registry，过滤后恒为空；且会与对话选择器逻辑分叉。
- 影响范围：`useSettingsDefaultModels`（改为入参 `gateway`、同步派生、返回 `hasModels`）、`useSettingsCodexSection`（去掉 `projects`，改喂 `appSettings.modelGateway`）、`useSettingsAgentsSection`（加 `appSettings`，仍保留 `projects` 供 generateAgentDescription）、`SettingsCodexSection` 文案与 disabled 判定、`gatewayModelOptions.ts`（新）、`useModels.ts`（改用共享工具）。
- 遗留：Codex 区「默认模型」下拉与模型网关设置页的「默认模型」都写 `lastComposerModelId`，存在功能重叠；本次只统一数据源，未合并这两个入口，留待后续。
- 后续复查条件：无。

## 2026-06-25：两个「默认模型」入口统一写双字段，消除漂移

- 决策：Codex 设置区的「默认模型」下拉与模型网关页的「默认模型」选择器，切换时都同时写 `lastComposerModelId` 和 `modelGateway.defaultModel`。
- 原因：此前 Codex 区下拉只写 `lastComposerModelId`，而模型网关页写两者；从 Codex 区改默认模型会让 `modelGateway.defaultModel`（决定写入 `config.toml` 的 `model =`）悄悄漂移，两个入口显示不一致。
- 替代方案：删掉 Codex 区下拉，只留模型网关页一个入口（彻底合并）。
- 为什么不用替代方案：会动到刚合并（#27）的可用 UI 与测试，且 Codex 区「默认参数」组（模型/推理 effort/访问模式/审查模式）放一起对用户是连贯的；当前先消除数据漂移这个真实缺陷，入口彻底合并留作 UX 打磨。
- 影响范围：`SettingsCodexSection`（下拉 onChange 双写）、`SettingsView.test.tsx`（断言双写）。
- 后续复查条件：若决定彻底合并入口，再评估把 Codex 区改为只读展示 + 跳转模型网关页。

## 被推翻的方案

### 2026-06-24：Codex 直接配置 DeepSeek provider

- 原方案：在 `CODEX_HOME/config.toml` 中写 `[model_providers.deepseek]`，让 Codex 直接认为自己连接 DeepSeek。
- 为什么推翻：这只适合 M1 原型验证；产品态必须支持多 provider 和自定义第三方 API。
- 替代方案：Codex 固定连接 `blackrain_gateway`，DeepSeek 只是 Gateway registry 中的一个 provider。
