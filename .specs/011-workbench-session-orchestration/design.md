# 工作台会话编排设计

> **状态（2026-07-26）：暂停。** 本文定义的编排层不进入当前运行时主链。

> 本文描述目标拓扑。当前实现只有 CODE 会话链路和工作台包生命周期，不能据此宣称工作台任务已可执行。

## 总体方案

BlackRain 使用单一 codex app-server 承担所有 agent 执行。Workbench Core 产出已验证激活记录；Session Orchestrator 将其编译成只读会话描述符，再通过统一会话合同启动 codex thread。前端根据 `surface` 渲染任务导向的工作台界面或完整 CODE 界面。

```text
工作台包 --inspect/install/verify--> ActivatedWorkbenchContext
                                           |
用户选择项目/任务/输入 ---------------------+
                                           v
                                Session Orchestrator
                                           |
                              WorkbenchSessionDescriptor
                                           |
                                  codex app-server
                                           |
                                      Model Gateway
                                           |
                              Relay/new-api/模型提供商

同一 thread/event contract -> Workbench surface 或 CODE surface
```

## 组件边界

### Workbench Core

- 负责 Manifest、依赖、权限、安装、验证、激活和卸载。
- 签发并持久化 `ActivatedWorkbenchContext`。
- 不启动 thread，不生成 prompt，不维护会话事件。

### Session Orchestrator

- 读取激活记录，重新校验项目、权限和资源有效性。
- 解析 Manifest 中已验证的任务入口。
- 生成不可变会话描述符，并建立 `activationId <-> threadId` 关联。
- 通过现有 codex shared core 启动、继续、停止和恢复 thread。
- 将插件、MCP、Skill 和环境引用解析为 App 管理的受限会话输入。
- 不持有另一套 agent 状态机。

### Surface

- `workbench`：显示任务入口、必要输入、执行进度、审批、工具活动、成果和异常；隐藏与任务无关的开发控制项。
- `code`：保留完整开发者界面、diff、终端、分支和高级内核控制。
- 两者消费同一标准化 thread/event 数据，不各自实现运行协议。

### Gateway

- 服务所有 codex 发起的模型请求，不按 surface 分叉。
- 只处理 Responses/Chat 转换、流式事件、工具调用、认证转发、计量和错误映射。
- 不读取工作台 Manifest，不处理项目权限，不维护 UI 状态。

## 会话描述符

目标最小结构：

```text
WorkbenchSessionDescriptor
  schemaVersion
  sessionId
  activationId
  surface: workbench | code
  projectRoot
  taskEntry
  skillRoots[]
  pluginRefs[]
  mcpServerRefs[]
  environmentRefs[]
  permissionGrantId
  modelPolicy
  createdAt
```

描述符只保存已验证引用，不保存 secret、任意命令、环境变量值或可执行路径。App 在启动瞬间解析引用，并把最小必要环境传给子进程。

## 数据流

1. 用户从“我的工作台”选择已激活工作台和项目。
2. App 读取激活记录并验证其版本、项目根、权限 grant 和依赖健康状态。
3. App 读取对应任务声明，校验用户输入并生成会话描述符。
4. Session Orchestrator 通过 shared codex core 创建 thread，并记录会话与激活的关联。
5. codex 只看到 App 提供的项目、Skills、工具能力和授权边界。
6. 模型请求统一经过 Gateway；事件统一回到 App 事件层。
7. 前端按 surface 渲染同一会话状态。
8. 恢复时重复第 2 步；激活或权限失效则阻止继续执行并提示重新验证。

## 配置与文件

- 全局内核配置：App data 下专属 `CODEX_HOME/config.toml`。
- 工作台安装与激活：spec 008 规定的 App data 目录。
- 会话描述符与关联：App data 下版本化 session store，原子写入。
- secret：系统凭据存储，仅通过引用解析。
- 用户项目：始终位于安装根之外，升级和卸载默认保留。

## 失败模式

- 激活记录缺失或被篡改：拒绝启动/恢复，要求重新激活。
- 项目目录移动、越界或成为 reparse point：拒绝执行。
- Skill、插件或依赖版本不匹配：健康检查失败，禁止生成会话。
- Gateway 或模型不可用：保留本地会话与项目状态，展示可重试错误。
- codex thread 中断：使用统一恢复合同，不创建平行任务库。
- 权限请求超出 grant：在 App 审批层阻断，不由工作台自行放宽。

## 测试策略

- 单元：描述符确定性、字段白名单、路径/权限/引用校验、恢复前重验。
- 集成：激活记录 -> 描述符 -> codex thread start -> 标准事件 -> surface reducer。
- 回归：CODE surface、Gateway 和现有 thread 行为不变。
- 安全：篡改记录、路径逃逸、无效 secret 引用、未授权工具和权限扩大。
- Windows E2E：Office 任务、真实模型、OfficeCLI、审批、停止、恢复、成果预览和项目保留。
