# Electron 桌面壳迁移决策

## 2026-07-26：Electron 是唯一目标桌面宿主

- 决策：BlackRain 从 CodexMonitor 衍生的 Tauri 壳完整迁移到 Electron，不维护两个正式宿主。
- 原因：in-app browser、持久 session、`WebContentsView`、CDP、下载和权限控制是 P0；Electron 提供更直接、可产品化的宿主原语。
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

## 2026-07-27：Codex App 是 Electron 与 Browser 第一实现基线

- 决策：三份 2026-07-26 本机研究稿确认的 Codex App 进程边界和 Browser 控制面，优先级高于 ClawX、Hermes 等开源 Electron 项目。
- 原因：BlackRain 的产品目标是补齐完整 Codex App 宿主能力；ClawX/Hermes 的可见页面与 agent browser 分离，不满足共享 IAB。
- 允许差异：必须使用自有代码、公开 app-server 合同和可审计 transport，不复制私有 bundle、Browser client 或资源。
- 影响范围：012/013、03/04/09/10、Browser 宿主原语和验证矩阵。

## 2026-07-27：main/daemon 生产连接收敛为双向 stdio

- 决策：Electron main 作为父进程启动 daemon，目标生产连接为双向 stdio JSON-RPC；固定 `127.0.0.1:4732` 不进入 Electron 生产态。
- 原因：本地 sidecar 不需要网络监听；Browser tool server request 要求 daemon 能主动请求 main；子进程管道还可减少同用户端口发现与 token 泄漏面。
- 迁移例外：首个切片若复用 TCP，只允许动态 loopback endpoint + 随机 token，并必须同时建立删除任务。
- 影响范围：daemon transport、日志、恢复、集成测试和打包。

## 2026-07-27：Windows 打包采用 npm + electron-builder/NSIS 方向

- 决策：保留现有 npm/`package-lock.json`；Windows MVP 以 `electron-builder` + NSIS 为打包实现方向，daemon/codex/Gateway 使用 `extraResources`。
- 原因：与现有前端包管理一致，且 ClawX/Hermes 已提供成熟 Electron Windows 工程参考。
- 未决：签名证书、更新制品源、发布密钥和回滚保留策略仍需独立验证后落档。
- 影响范围：构建目录、CI、ASAR、fuses、签名、更新和 License。
