# 模型提供商

BlackRain 以原装 Codex Responses 链路为默认路径。模型 provider 的协议差异由独立 Gateway 处理，不进入 renderer、Electron main 或 agent 状态机。

## 默认路径

用户在标准 Codex 配置中选择可用模型和账号。main 只把 app-server 的公开请求投影到 UI，不读取或复制 Codex auth 文件。

## 可选 Gateway

Gateway 可以把特定 provider 的 Chat Completions 等协议翻译为上游可接受的格式。它必须是独立进程：

- 不拥有 thread、turn、Browser 或 UI 状态；
- 不接收 Browser Cookie、密码或不必要的网页正文；
- secret 只从本机安全配置读取，不写入命令行、日志或仓库；
- 没有 Gateway 时，客户端仍能使用原生 Codex 路径或清晰的降级状态。

Gateway 的实现和配置见 [`gateway/`](../../gateway/)；新增 provider 需要补协议、错误和许可证测试。
