# 愿景

> **一句话定位：开源 Codex App + Cursor 风格的多模型 Auto。**

BlackRain Desktop 的目标是把开源 Codex agent 变成一个可靠、可审计、可扩展的桌面客户端，并让开发者能够在同一个 Agent 工作流里自由选择模型或交给 Auto 路由。

## 为什么需要桌面宿主

agent runtime 提供 thread、turn、工具调用、审批和事件协议。桌面用户还需要一套宿主来处理：

- 项目和会话的可恢复界面；
- 文件、终端、Git 和系统集成；
- 与用户共享同一页面的 in-app Browser；
- 权限、凭据、下载、更新和崩溃恢复；
- 可复现的测试、打包和发布流程。

BlackRain 将这些能力放在 Electron main/preload/renderer 中，让上游内核保持原装、可替换和可升级。

## 设计原则

1. **单一 agent runtime**：只调用上游 `codex app-server`，不复制 agent 状态机。
2. **清晰的特权边界**：main 持有系统能力，preload 暴露最小 typed API，renderer 不接触 Node 或原始 IPC。
3. **同页 Browser**：用户和 agent 操作同一个受 main 管理的页面，默认隔离网页权限和应用权限。
4. **公开可验证**：协议、来源、许可证和测试结果都应能被贡献者复现或审查。
5. **行为参考而非代码复制**：参考官方 Codex App 的公开行为，不复制其闭源实现或专有资源。

## 多模型方向

Codex App 的 Agent、Browser、审批和恢复生态是 BlackRain 的基础；Cursor 风格的多模型与 Auto 是 BlackRain 希望补齐的产品体验。公开实现应支持：

- provider 和模型的可发现、可配置和可测试；
- 手动模型选择与 Auto 模式并存；
- 基于任务类型、模型能力、成本、延迟和可用性的可解释路由；
- 明确的 fallback、失败原因和用户接管；
- 路由策略可替换，但不改变 Codex 的 thread、turn、审批和 Browser 状态所有权。

Auto 的具体规则属于 BlackRain 的开源实现，不声称复制 Cursor 的内部策略；代码、评测和决策记录应让贡献者能够审查和改进它。

## 成功标准

项目的进展以可验证的工程结果衡量：核心 Codex 工作流稳定、Browser 权限边界清晰、上游升级成本可控、测试和文档可复现，以及 Windows 安装包能够经过完整产品验收。
