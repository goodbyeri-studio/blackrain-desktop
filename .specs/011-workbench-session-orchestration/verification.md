# 工作台会话编排验证

## 当前状态

| 日期 | 范围 | 命令/方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-07-24 | 架构合同 | README、docs 03/04/05/08/09、spec 001/002/004/008/010/011 及模块 README 一致性审阅 | 通过 | 单一 codex、Session Orchestrator、双 surface、统一 Gateway 和当前实现水位口径一致 |
| 2026-07-24 | 退役路线残余 | 对除 `.git` 外的完整工作区做大小写不敏感的正文、二进制、路径名及旧合同标识扫描 | 通过 | 0 命中；生成依赖与构建缓存已移出工作区 |
| 2026-07-24 | 文档链接 | 全仓 Markdown 相对链接解析 | 通过 | 0 断链 |
| 2026-07-24 | CODE 前端基线 | `npm run typecheck`、`npm run test`、`npm run lint`、`npm run lint:ds` | 通过 | 工作台 surface 尚未实现 |
| 2026-07-24 | Rust 编译 | `cargo check` | 阻塞 | 本机缺少 MSVC `link.exe`，未进入项目代码诊断 |

## 已有可复用代码

- codex app-server 的 App/Daemon/shared core 接缝。
- 前端 thread、事件、审批、停止与恢复相关基础能力。
- Gateway sidecar 和专属 `CODEX_HOME`。
- spec 008 的工作台 Manifest、Office 安装事务与激活记录。

以上只是可复用基础，不表示工作台会话编排已经存在。

## 尚未验证

- `WorkbenchSessionDescriptor` 编译、持久化与恢复前重验。
- 激活记录到 codex thread 的真实接线。
- 工作台 surface 的任务、审批、工具活动、成果和恢复流程。
- OfficeCLI 在受限会话环境中的真实调用。
- Windows NSIS 安装后的端到端闭环。
