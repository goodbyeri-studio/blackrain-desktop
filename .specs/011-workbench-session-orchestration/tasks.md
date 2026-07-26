# 工作台会话编排任务

> **状态（2026-07-26）：暂停。** 任务不进入当前 P0/P1 排期。

## 阶段 0：冻结合同

- [x] 确认单一 codex 内核与双 surface 产品边界
- [x] 确认 spec 008 只负责包生命周期，本 spec 负责激活后的会话执行
- [x] 定义 `WorkbenchSessionDescriptor` 最小字段和禁止字段
- [ ] 对当前锁定 codex 版本验证 Skill roots、MCP、项目 cwd、审批与恢复所需协议能力

## 阶段 1：共享编排核心

- [ ] 在 `src/shared/*` 实现描述符编译与重新校验
- [ ] 实现版本化 session store 和 `activationId <-> threadId` 关联
- [ ] 复用 shared codex core 启动、继续、停止和恢复 thread
- [ ] 为 App 与 Daemon 增加薄适配器、前端 IPC 和合同测试

## 阶段 2：工作台 surface

- [ ] 实现工作台选择、任务入口、项目与输入流程
- [ ] 复用统一事件、审批和恢复状态，提供任务导向 UI
- [ ] 实现成果预览、异常清单和任务历史
- [ ] 保持 CODE surface 行为与高级控制不回归

## 阶段 3：Office 闭环

- [ ] 将 Office 激活记录编译成真实会话描述符
- [ ] 接通受控 OfficeCLI、Skills 和权限
- [ ] 完成停止、恢复、失败重试与卸载后项目保留
- [ ] 跑 Office 5 场景 x 10 次质量基线

## 阶段 4：Windows 发布验收

- [ ] 完成 NSIS 安装、首启、真实模型、审批、恢复和卸载 E2E
- [ ] 完成路径逃逸、reparse point、权限扩大和配置损坏矩阵
- [ ] 更新 `verification.md`，区分代码存在、验证通过和发布可交付
