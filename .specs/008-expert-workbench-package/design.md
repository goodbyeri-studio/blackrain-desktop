# 工作台包设计

> **状态（2026-07-26）：暂停。** 本文只保留已设计的包边界，不进入当前 P0/P1 实现。

## 包结构

```text
workbench.yaml
skills/
tasks/tasks.yaml
validation/health.yaml
validation/smoke/
```

Manifest v1 声明标识、版本、发布者、目标平台、Skills、插件、依赖、权限、任务入口、验证入口和卸载策略。解析采用严格 schema，未知字段直接拒绝。

## 生命周期

```text
inspect -> stage -> verify dependencies -> health -> smoke -> persist activation
                                                        |
                                                        +-> failure: discard staging
```

安装目录位于 App data，用户项目不复制到安装根。Core 对项目路径做 canonicalize，对受控资源拒绝 symlink/reparse point，并在全部验证通过后原子写入激活记录。

激活记录只包含经过验证的引用：工作台和组件版本、项目路径、Skill 根、插件/MCP 标识、环境引用、权限 grant 与验证时间。secret 值和任意进程命令不得进入记录。

## 卸载

卸载先移除激活记录，再按依赖引用计数清理应用托管资源。用户项目始终保留。系统级或用户提供的依赖只解除引用，不由 App 删除。

## 执行边界

包生命周期与任务执行解耦。当前 Core 只负责包和激活状态，不生成模型提示、不启动 thread、不维护会话事件。[spec 011](../011-workbench-session-orchestration/) 的 Session Orchestrator 只能消费并重新校验已验证激活记录，再通过统一 codex 会话合同执行任务。
