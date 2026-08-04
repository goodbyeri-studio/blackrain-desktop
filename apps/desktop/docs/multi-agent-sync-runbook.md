# 多 Agent 同步历史说明

Session Orchestrator、工作台多角色编排和相关同步路线已暂停。当前 BlackRain 只投影锁定 Codex app-server 原生提供的 thread/child-thread/collaboration 事件，不维护第二套 agent registry、生命周期或远程 daemon。

当前实现位于 `electron/main/app-server/`、`electron/shared/agent.ts` 和 `src/features/threads/`。恢复产品级编排前必须新建立 spec；不得把历史 runbook 写成当前里程碑。
