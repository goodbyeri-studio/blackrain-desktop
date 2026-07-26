# Electron 桌面壳迁移验证

> 当前只有文档决策，没有 Electron 实现或运行证据。

## 验证矩阵

| 日期 | 范围 | 方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-07-26 | 架构与优先级文档 | 静态审阅 | 已记录 | 不代表实现 |
| 待执行 | Electron 启动与 IPC | 自动化 + Windows 实机 | 未跑 | main/preload/renderer 尚未建立 |
| 待执行 | Codex thread 纵向切片 | 真实 app-server 对话 | 未跑 | 必须覆盖恢复与审批 |
| 待执行 | in-app browser | spec 013 矩阵 | 未跑 | P0 闸口 |
| 待执行 | Windows 制品 | 安装/升级/回滚/卸载 | 未跑 | 发布闸口 |

## 未验证风险

- Electron 打包、签名、自动更新和 Windows 安装方案未选定。
- Rust daemon 与 Electron main 的生产鉴权、退出和恢复合同未验证。
- 多 browser view 的内存、GPU、DPI 和崩溃恢复未测量。
- 当前 Tauri 代码存在不能作为 Electron 进度证据。
