# Requirements

## 背景

- BlackRain 的模型层不能写死 DeepSeek，也不能变成某一家模型的客户端。
- Codex 内核保持原装，只发 Responses 协议；大量第三方/国产模型仍以 Chat Completions 或 OpenAI-compatible API 为主。
- 现有 `gateway/gateway.py` 已证明 DeepSeek 经 Responses⇄Chat 翻译可以驱动 Codex 内核，但它仍是最小原型，不是产品级模型网关；后续被 App 托管、打包和 smoke 通过也不改变这一定位。
- 本 spec 覆盖 M1 主线：Providers / 模型网关设置页、专属 `CODEX_HOME` 写入、Gateway sidecar、对话模型选择器。自 003 双引擎架构定稿后，本 spec 只负责 **CODE 路径**，WORK/Hermes 不经过该翻译网关。

## 用户目标

- 作为普通用户，我可以在 App 设置里的“模型网关”页面配置第三方 API，而不是编辑命令行、`.env` 或 `config.toml`。
- 作为进阶用户，我可以添加 OpenAI-compatible 的自定义 provider，配置 base URL、API key 和模型列表。
- 作为每个对话的使用者，我可以在对话模型选择器里选择已启用的模型。
- 作为开发者，我可以继续用一条命令启动 dev app，并默认走本地 BlackRain Gateway。

## 非目标

- 不改 Codex agent loop，不把模型适配逻辑写进 `codex-upstream`。
- M1 不做完整智能自动路由；只保留任务路由所需的模型能力元数据。
- M1 不做计费、企业审计、团队共享 provider、云端同步。
- M1 不做所有模型厂商的深度适配；先支持 DeepSeek + 自定义 OpenAI-compatible provider，后续按 provider 增量补。
- 不把用户第三方 API key 写入仓库、PR、日志或用户原有 `~/.codex`。

## 成功标准

- Codex 内核侧只看到一个固定 provider：`blackrain_gateway`。
- App 是唯一写 `CODEX_HOME/config.toml` 的人，且使用专属 `CODEX_HOME`，不污染用户机器原有 `~/.codex`。
- 第三方 provider 配置由 BlackRain App 管理，Gateway 读取 App 管理的配置或通过 App 注入配置。
- Gateway 对 Codex 暴露 `/v1/responses` 和 `/v1/models`，能根据请求里的 `model` 解析到真实第三方 provider。
- 设置页能完成 provider 的新增、编辑、启用/禁用、测试连接、模型列表刷新。
- 对话模型选择器从 Gateway registry / App provider registry 获取模型列表，不再写死 `deepseek-v4-flash` / `deepseek-v4-pro`。
- DeepSeek 默认链路可真实跑通：壳 -> Codex app-server -> BlackRain Gateway -> DeepSeek -> 工具调用 -> `turn/completed`。

## 约束

- Codex `wire_api` 固定使用 `responses`；`wire_api="chat"` 已被上游删除，不能作为 fallback。
- Gateway 是硬依赖。连接国产或 Chat-only provider 时，Responses⇄Chat 翻译必须在 Gateway 完成。
- Gateway 默认只监听本机回环地址，不暴露到局域网或公网。
- API key 存储要走本地安全存储优先；开发态允许 `.env` fallback，但产品态不要求用户手动写 `.env`。
- Provider 配置和模型 registry 属于 BlackRain App/Gateway，不属于 Codex 内核配置。
- `apps/desktop/**` 改动必须遵守双运行时规则：共享领域逻辑先落 `src-tauri/src/shared/*`，App 与 Daemon 只做薄适配。
- 当前 MVP 仅发行 Windows。本文 2026-06-24 的 macOS Keychain/app/dmg 结果只作为历史工程证据；Windows Credential Manager、NSIS 包内 sidecar 运行和签名属于发布前必补证据，统一关联 007 Windows spec。
- 产品态工具调用必须由 App 托管 sidecar 显式启用。当前 `gateway.py` 默认 `STRIP_TOOLS=1`，App spawn 又未覆盖；修复前只能声称 `STRIP_TOOLS=0` 的开发/探针链路已验证，不能声称普通 App 启动后工具可用。

## 开放问题

- [x] 产品态 API key 存储方案：公开 MVP 使用系统凭据存储，开发态保留环境变量 fallback。
- [ ] Gateway sidecar 长期保留 Python，还是迁移到 Rust/Go。
- [ ] 模型 registry 是由 Gateway 提供 HTTP control API，还是由 App 直接管理配置并生成 Gateway 启动参数。
- [ ] 线程级模型覆盖当前已可持久化；长期唯一真源应是线程 metadata、App 本地 settings 还是 Codex thread settings，仍待定。
- [ ] 自定义 provider 的能力标签是否允许用户手动编辑。
- [ ] App 托管 Gateway 如何固定 `STRIP_TOOLS=0`，并防止发布配置回退到纯文本诊断模式。
