# Electron 桌面壳迁移验证

> 当前只有研究、文档决策和迁移合同，没有 Electron 实现或运行证据。

## 验证矩阵

| 日期 | 范围 | 方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-07-26 | 架构与优先级文档 | 静态审阅 | 已记录 | 不代表实现 |
| 2026-07-27 | 三份 Codex App 研究稿与 Electron/Browser 计划 | 完整原文复核 + 静态设计 | 已记录 | 采用 Codex 式控制面；不代表代码存在 |
| 2026-07-29 | Codex Desktop App 技术栈、进程、协议、持久化与 Windows helper 调研 | 完整原文复核 + 文档对齐 | 已记录 | 目标改为 main 直连 app-server；不代表代码存在 |
| 2026-07-29 | Codex IAB per-session backend、Browser client、注入式 Playwright、turn/tab 与工作集调研 | 完整原文复核 + 文档对齐 | 已记录 | 保留 WebContentsView 差异；不代表代码存在 |
| 待执行 | Tauri 能力迁移矩阵 | 静态盘点 + owner review | 未跑 | 必须覆盖 command/event/plugin/resource/CI |
| 待执行 | Electron 启动与 IPC | 自动化 + Windows 实机 | 未跑 | main/preload/renderer 尚未建立 |
| 待执行 | main/app-server stdio JSONL | Node 集成测试 | 未跑 | initialize、双向 request、subscription、cancel、stderr、EOF |
| 待执行 | Codex Home / ThreadStore | CLI + App 交叉恢复 | 未跑 | config/thread 共享，Electron user-data 独立 |
| 待执行 | Windows helper 与沙箱 | 进程树 + restricted/elevated 工具执行 | 未跑 | code-mode host/command runner/ConPTY |
| 待执行 | Codex thread 纵向切片 | 真实 app-server 对话 | 未跑 | 必须覆盖恢复与审批 |
| 待执行 | in-app browser | spec 013 矩阵 | 未跑 | P0 闸口 |
| 待执行 | Browser client/runtime 制品 | pipe 集成 + MSIX 解包/启动 | 未跑 | session/turn、framing、ACL/token、hash、License、清理 |
| 待执行 | Windows 制品 | 安装/升级/回滚/卸载 | 未跑 | 发布闸口 |

## 未验证风险

- Electron Forge/MSIX 只是已决策目标，签名、自动更新源和回滚尚未验证。
- Electron main 的 App Server client、直接 spawn、退出和恢复合同未验证。
- 标准 Codex Home 共享、ThreadStore 恢复以及 Electron user-data 分离尚未验证。
- codex-code-mode-host、codex-command-runner 等 helper 是否为当前锁定版本所需以及如何打包尚未验证。
- main-owned `WebContentsView` factory、registry、bounds/occlusion 同步和 view reparenting 尚无代码。
- 公开 code-mode/node_repl 接缝能否承载自有 Browser client、以及标准 Electron 对 Owl page persistence 的降级能力尚未验证。
- 多 view 的内存、GPU、DPI、z-order、modal 遮挡、输入法和崩溃恢复未测量。
- 当前 Tauri 代码存在不能作为 Electron 进度证据。
