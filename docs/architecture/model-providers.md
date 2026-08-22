# 模型提供商

BlackRain 以原装 Codex Responses 链路为默认路径。模型 provider 的协议差异由独立 Gateway 处理，不进入 renderer、Electron main 或 agent 状态机。

> **开源 Codex App (ChatGPT) 客户端，对标其闭源能力，支持 Cursor 的多模型 & Auto 路由。**

## 默认路径

用户在标准 Codex 配置中选择可用模型和账号。main 只把 app-server 的公开请求投影到 UI，不读取或复制 Codex auth 文件。

## 可选 Gateway

Gateway 可以把特定 provider 的 Chat Completions 等协议翻译为上游可接受的格式。它必须是独立进程：

- 不拥有 thread、turn、Browser 或 UI 状态；
- 不接收 Browser Cookie、密码或不必要的网页正文；
- secret 只从本机安全配置读取，不写入命令行、日志或仓库；
- 没有 Gateway 时，客户端仍能使用原生 Codex 路径或清晰的降级状态。

Gateway 的实现和配置见 [`gateway/`](../../gateway/)；新增 provider 需要补协议、错误和许可证测试。

## 多模型与 Auto

公开的模型体验包含两种模式：

- **手动选择**：用户明确选择 provider 和模型，看到可用性、能力和限制；
- **Auto**：由开源、可配置、可解释的路由策略，根据任务类型、模型能力、成本、延迟和实时可用性选择模型。

路由器可以选择调用原生 Codex provider 或 Gateway，但不能接管 thread、turn、审批、Browser 或 UI 状态。模型切换、fallback 和失败原因必须进入统一事件与诊断链路，不能在 renderer 中偷偷维护第二套状态。

当前状态：Gateway 已有协议翻译原型；模型 registry、能力评测、路由策略和 Auto UI 是公开开发方向，尚未宣称全部完成或达到生产发布标准。
