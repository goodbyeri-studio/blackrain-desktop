# BlackRain Desktop

BlackRain Desktop 是一个面向 Windows 的开源 Electron Codex 客户端。它使用 OpenAI 开源的 `codex-rs` / `codex app-server` 作为唯一 agent runtime，在 Electron main、preload 和 React renderer 中提供桌面工作流与 main-owned in-app Browser。

项目参考官方 Codex App 的公开可观察行为，但不复制闭源实现、私有 bundle、字体、图标或其他专有资源。BlackRain 与 OpenAI、官方 Codex App 或 CodexMonitor 维护者没有官方隶属关系。

> 当前仍处于快速迭代阶段。自动化检查已有开发基线；正式签名 Windows 产品、真实站点/MFA、安装升级回滚和完整恢复矩阵需要单独验收。

## 能力

- Codex 项目、thread、turn、审批、停止、恢复和模型设置
- 文件、终端、Git、diff、通知、更新和桌面系统集成
- 由 Electron main 持有的隔离 in-app Browser
- Browser 导航、snapshot、受控 locator/CUA、截图、下载、权限和用户接管
- 标准 Codex Home，与原生 CLI 共享配置、登录态和可恢复 thread
- 可选的独立 Model Gateway，用于协议翻译，不拥有 agent 或 Browser 状态

## 架构

```text
React renderer
    -> typed preload
Electron main
    ├─ codex app-server client (stdio JSONL)
    ├─ 文件 / Git / 终端 / 设置 / 更新
    └─ Browser backend (WebContentsView)
原装 codex app-server
    └─ codex-rs / Codex Home / thread 状态
```

网页不加载应用 preload，renderer 不接触 Node.js、原始 IPC 或 app-server transport。详细边界见 [架构总览](docs/architecture/overview.md) 和 [安全架构](docs/architecture/security.md)。

## 快速开始

开发目标是 Windows 11 x64，需要 Node.js 22、Git 和 PowerShell 7。macOS/Linux 可以运行共享逻辑测试和静态检查，但不能替代 Windows 产品验收。

```powershell
Set-Location apps/desktop
npm.cmd ci
npm.cmd run typecheck
npm.cmd run test
npm.cmd run lint
npm.cmd run check:host-boundary
npm.cmd run electron:start
```

运行时锁定、Browser adapter 和完整验证命令见 [开发命令](docs/development/commands.md)。

## 文档

- [项目范围](docs/project-scope.md)：定位、边界、许可证和公开状态
- [文档地图](docs/README.md)：产品、架构、开发、设计和维护入口
- [愿景](docs/vision.md) / [路线图](docs/roadmap.md)：公开技术方向
- [架构总览](docs/architecture/overview.md) / [Browser Runtime](docs/architecture/browser-runtime.md)
- [开发与测试](docs/development/commands.md) / [测试指南](docs/development/testing.md)
- [贡献指南](CONTRIBUTING.md) / [安全策略](SECURITY.md)

## 贡献

请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 和 [SECURITY.md](SECURITY.md)。功能提案、错误报告和路线讨论使用 GitHub Issues/Discussions；安全问题不要公开提交 issue。

## 许可证

BlackRain 自有代码采用 [MIT License](LICENSE)。第三方代码、资源和 runtime 以各自许可证和 [NOTICE](NOTICE) 为准。
