# Electron 桌面壳迁移决策

## 2026-07-26：Electron 是唯一目标桌面宿主

- 决策：BlackRain 从 CodexMonitor 衍生的 Tauri 壳完整迁移到 Electron，不维护两个正式宿主。
- 原因：in-app browser、持久 session、WebContentsView、CDP、下载和权限控制是 P0；Electron 提供更直接、可产品化的宿主原语。
- 替代方案：继续在 Tauri/WebView2 上建设原生浏览器控制层；不采用。
- 影响范围：桌面进程、IPC、打包、更新、CI、Windows 验收和文档体系。

## 2026-07-26：保留 React 和 Rust daemon

- 决策：复用现有 React UI；现有 Rust shared core 和 daemon 继续承担领域逻辑与 codex app-server 监管。
- 原因：迁移目标是替换桌面宿主，不是把已经存在的 Rust 能力重写成 TypeScript。
- 替代方案：Electron main 全面重写 Rust 后端；不采用。
- 影响范围：迁移顺序、RPC 合同、目录布局和测试策略。

## 2026-07-26：先完成真实纵向切片

- 决策：全量迁移前必须先证明 Electron + Rust daemon + Codex thread + 持久浏览器在 Windows 上成立。
- 原因：浏览器生命周期、安全隔离、打包和资源开销是决定迁移质量的关键风险。
- 影响范围：第一阶段任务和 go/no-go 证据。
