# 工作台会话编排需求

> **事实状态纪律**：本文定义目标执行合同，不表示代码已经完成。当前只存在 CODE 会话链路和工作台激活记录；工作台 surface、会话描述符编译和端到端启动尚未实现，真实水位见 `verification.md`。

## 背景

BlackRain 只有一个 agent 内核：原装 codex app-server。工作台不能再引入独立 agent 进程，也不能把包安装成功等同于任务可执行。平台需要一层由 App/Core 管理的会话编排，把 spec 008 产出的已验证激活记录转换为 codex 可以执行的受控会话。

## 用户目标

- 普通用户从已激活工作台选择任务、项目和输入后，进入任务导向的工作台 surface，获得进度、审批、工具活动、结果预览和可恢复历史。
- 开发者进入软件开发工作台时，继续使用完整 CODE surface。
- 两种 surface 共享同一套 thread、事件、审批、恢复、模型路由和计量能力，不暴露两套运行时差异。

## 必须满足

1. App 只能从通过校验的 `ActivatedWorkbenchContext` 启动工作台会话。
2. App 将激活记录、任务入口和用户输入编译成不可变 `WorkbenchSessionDescriptor`，工作台包不得直接拼内核参数或写配置。
3. 描述符至少绑定激活标识、项目根、任务入口、Skill 根、插件/MCP 引用、环境引用、权限 grant、模型策略和 surface 类型。
4. Session Orchestrator 通过既有 codex app-server 合同启动或恢复 thread；不得分叉、修改或复制 agent 循环。
5. 工作台 surface 与 CODE surface 共享标准化会话事件和审批合同；差异只在信息架构与可见控制项。
6. Gateway 服务所有 codex 模型会话，统一执行 Responses 到 Chat Completions 的转换、计量和错误归一化。
7. 每次恢复会话都必须重新确认激活记录、项目和权限仍有效；失效时 fail closed。
8. 工作台会话不得把 secret、任意命令、未验证二进制路径或包内可写配置注入内核。
9. Windows x64 是 MVP 唯一发布验收平台。

## 非目标

- 不自研 agent 循环，不增加第二个 agent 内核。
- 不让工作台包直接写 `CODEX_HOME`、系统 PATH 或全局环境。
- 不在本 spec 实现工作台安装、升级、回滚和卸载，这些属于 spec 008。
- 不在 MVP 实现多工作台工作室编排、第三方市场或无人值守高风险操作。

## 成功标准

- 一个已验证 Office 激活记录可以生成确定性的会话描述符。
- 工作台 surface 可以启动、继续、停止和恢复同一 codex thread，并显示工具活动、审批与成果。
- CODE surface 行为不因工作台接线回归。
- 篡改或失效的激活记录、越界项目路径、未授权工具和权限扩大均被拒绝。
- Windows 安装包内完成真实模型、OfficeCLI、审批、恢复和卸载后项目保留的 E2E。

## 约束

- `codex-upstream` 只读，协议方法名和 agent 行为不改写。
- App 是唯一配置写入者；生成物只能落在 App data。
- 008 的激活记录是输入真源，不复制另一份工作台状态数据库。
- 新增后端行为遵守 shared core -> App command -> 前端 IPC -> Daemon RPC 的接线纪律。
