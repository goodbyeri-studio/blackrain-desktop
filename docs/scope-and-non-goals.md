# 范围与非目标

这份文档帮助贡献者判断一个想法是否属于 BlackRain Desktop 的公共技术范围。

## 当前范围

- Codex 项目、thread、turn、审批、停止和恢复的桌面界面。
- Electron main/preload 与 React renderer 的安全宿主边界。
- 文件、终端、Git、设置、通知、更新和诊断等桌面能力。
- main-owned Browser 的导航、快照、受控定位器、输入、下载、权限和用户接管。
- 公开 app-server 协议、标准 Codex Home 和可选模型 provider 的适配。
- 多模型 registry、手动模型选择、Auto 路由、fallback 和路由诊断；实现状态以对应代码和测试为准。

## 非目标

- 另造 agent loop、会话存储或第二套 thread/event 真源。
- 复制官方 Codex App 的闭源代码、私有协议实现或专有资源。
- 让网页获得 BlackRain preload、Node.js、原始 IPC 或任意本地文件/进程权限。
- 把 Gateway、插件或外部服务变成 UI、Browser 或 agent runtime 的隐式依赖；Auto 必须能够清晰降级并说明 provider 不可用原因。
- 在没有独立设计和安全审查的情况下承诺移动端、云端托管或多用户服务。

## 如何处理新提案

提案应说明它属于哪个进程、哪个公共 API、依赖哪些上游能力，以及怎样测试和回滚。无法归入这些边界的功能先作为 GitHub Discussion 讨论，不直接进入主线代码。
