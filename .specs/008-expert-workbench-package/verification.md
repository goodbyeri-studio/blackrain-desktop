# 工作台包验证

## 当前证据

| 日期 | 范围 | 命令 | 结果 |
|---|---|---|---|
| 2026-07-12 | Manifest v1 严格解析与路径校验 | `cargo test workbench_core --lib` | 代码级通过 |
| 2026-07-12 | Office 官方包安装、版本检查、smoke 与激活持久化 | `cargo test workbench_core --lib` | 代码级通过 |
| 2026-07-24 | 单一运行时边界与工作台生命周期前端合同 | `npm run typecheck` | 通过 |
| 2026-07-24 | 桌面前端完整回归 | `npm run test` | 通过 |
| 2026-07-24 | 前端代码与设计系统约束 | `npm run lint`、`npm run lint:ds`、`npm run codemod:ds:dry` | 通过；Lint 保留 5 条既有 Hook 警告，codemod 报告 1 个既有候选 |
| 2026-07-24 | 工作台 IPC 与主页入口回归 | `npx vitest run src/features/home/components/Home.test.tsx src/services/tauri.test.ts` | 76 项通过 |
| 2026-07-24 | 运行时边界文字、路径、API 与结构字段扫描 | 不区分大小写的全工作树扫描 | 零命中 |
| 2026-07-24 | Markdown 相对链接完整性 | 全仓 Markdown 链接检查 | 零断链 |
| 2026-07-24 | Rust 静态检查 | `cargo check` | 本机缺少 MSVC `link.exe`，未进入项目代码诊断 |

## 尚未完成

- Windows x64 真实 OfficeCLI health/smoke
- NSIS 安装、升级、回滚与卸载
- Windows reparse point 和权限失败矩阵
- 依赖引用计数与资源垃圾回收
- spec 011 的 Session Orchestrator、工作台 surface 及领域质量基线
