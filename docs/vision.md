# 愿景

BlackRain Desktop 的目标是把开源 Codex agent 变成一个可靠、可审计、可扩展的桌面客户端。

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

## 成功标准

项目的进展以可验证的工程结果衡量：核心 Codex 工作流稳定、Browser 权限边界清晰、上游升级成本可控、测试和文档可复现，以及 Windows 安装包能够经过完整产品验收。
