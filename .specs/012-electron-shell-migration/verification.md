# Electron 桌面壳迁移验证

> 当前只有研究、文档决策和迁移合同，没有 Electron 实现或运行证据。

## 验证矩阵

| 日期 | 范围 | 方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-07-26 | 架构与优先级文档 | 静态审阅 | 已记录 | 不代表实现 |
| 2026-07-27 | 三份 Codex App 研究稿与 Electron/Browser 计划 | 完整原文复核 + 静态设计 | 已记录 | 采用 Codex 式控制面；不代表代码存在 |
| 待执行 | Tauri 能力迁移矩阵 | 静态盘点 + owner review | 未跑 | 必须覆盖 command/event/plugin/resource/CI |
| 待执行 | Electron 启动与 IPC | 自动化 + Windows 实机 | 未跑 | main/preload/renderer 尚未建立 |
| 待执行 | main/daemon 双向协议 | Rust/Node 集成测试 | 未跑 | handshake/cancel/deadline/generation |
| 待执行 | Codex thread 纵向切片 | 真实 app-server 对话 | 未跑 | 必须覆盖恢复与审批 |
| 待执行 | in-app browser | spec 013 矩阵 | 未跑 | P0 闸口 |
| 待执行 | Windows 制品 | 安装/升级/回滚/卸载 | 未跑 | 发布闸口 |

## 未验证风险

- electron-builder/NSIS 只是实施方向，签名、自动更新源和回滚尚未验证。
- Rust daemon 与 Electron main 的生产鉴权、退出和恢复合同未验证。
- main-owned `WebContentsView` factory、registry、bounds/occlusion 同步和 view reparenting 尚无代码。
- 多 view 的内存、GPU、DPI、z-order、modal 遮挡、输入法和崩溃恢复未测量。
- 当前 Tauri 代码存在不能作为 Electron 进度证据。
