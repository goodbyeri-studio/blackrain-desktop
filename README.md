# BlackRain Desktop

BlackRain Desktop 是一个面向 Windows 的开源 Electron Codex 客户端。它使用原装的 OpenAI `codex-rs` / `codex app-server` 作为唯一 agent 内核，在 Electron main、preload 和 React renderer 中补齐桌面宿主、工程工作流与 in-app browser 能力。

项目的长期目标很明确：持续对齐官方 Codex App 的公开可观察能力，同时保持自己的开源实现、可审计边界和可替换宿主能力。官方 Codex App 是行为参考，不是代码、私有 bundle、字体、图标路径或其他专有资源的来源。

> 项目仍处于快速迭代阶段。当前 Electron native-clean 代码态和 unsigned 自动化已有 `RUN_PASS` 证据；正式签名 Windows 产品矩阵、真实站点/MFA、安装升级回滚与完整恢复验收尚未完成，不能把当前版本描述为发布就绪。

## 主要能力

- Codex 项目、thread、turn、审批、停止、恢复和模型设置
- 文件、终端、Git、diff、通知、更新与桌面系统集成
- 由 Electron main 持有的隔离 in-app browser
- Browser 的导航、snapshot、locator/CUA、截图、下载、权限与用户接管
- 标准 Codex Home，与原生 CLI 共享配置、登录态和可恢复 thread
- 可选的独立 Model Gateway，用于不直接满足 Responses 合同的模型服务

## 架构

```text
BlackRain Electron
  ├─ main       窗口、权限、Browser、更新、App Server stdio client
  ├─ preload    类型化、最小权限的 allowlist bridge
  ├─ renderer   React 产品界面与前端状态
  ├─ codex      原装 codex.exe app-server（唯一 agent runtime）
  └─ gateway    可选的独立协议翻译 sidecar
```

Browser 页面由 main 创建和持有，网页不加载 App preload，也不能获得 Node.js、原始 IPC、App Server transport 或不必要的系统权限。thread、事件、审批、停止、恢复和模型路径只有一套真源。

## 快速开始

开发与发布目标是 Windows 11 x64，要求 Node.js `22.12.x`、Git 和 PowerShell 7。macOS/Linux 可以运行静态检查和共享逻辑测试，但不能替代 Windows 产品验收。

```powershell
cd apps/desktop
npm.cmd ci
npm.cmd run typecheck
npm.cmd run test
npm.cmd run lint
npm.cmd run check:host-boundary
npm.cmd run electron:start
```

首次运行或验证锁定运行时时，按 [开发与验证命令](docs/commands.md) 准备官方 Codex Windows package、随包 Node runtime 和 Browser adapter。模型账号、provider 和可选账号后端均由本地环境变量配置；`.env.example` 只提供空模板。

## 文档入口

- [开源项目说明](docs/open-source.md)：范围、许可证、发布边界和能力状态
- [文档地图](docs/README.md)：按产品、架构、开发和 living spec 导航
- [产品形态与优先级](docs/04-产品形态.md)
- [运行时架构与里程碑](docs/09-运行时架构与里程碑.md)
- [Electron 与 Browser 实施计划](docs/10-Electron迁移与内置浏览器实现计划.md)
- [开发、测试与 Windows 发布命令](docs/commands.md)
- [产品 Electron 验收 spec](.specs/002-electron-migration/)
- [可移植 Browser Runtime spec](.specs/003-portable-electron-browser-runtime/)

## 开源边界

- BlackRain 自有代码按仓库根目录的 MIT License 发布。
- `apps/desktop/` 保留 CodexMonitor 的 MIT 归属；具体第三方来源见 [NOTICE](NOTICE) 和组件目录中的许可证文件。
- Codex runtime 来自 OpenAI 的 Apache-2.0 项目，以未修改的黑盒进程方式按锁定版本使用；它不由本仓库的源码许可证重新授权。
- 仅对齐官方 Codex App 的合法可观察行为，不复制其闭源实现或专有资源。
- 生成的 runtime、签名材料、账号信息、Cookie、日志和测试输出不进入 Git；公开发布前必须完成 Git 历史和第三方资产审计。

## 贡献与反馈

请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 和 [SECURITY.md](SECURITY.md)。功能讨论、错误报告和路线建议请使用 GitHub Issues；安全问题不要公开提交 issue。

## License

BlackRain 自有代码采用 [MIT License](LICENSE)。第三方代码、资源和运行时以各自许可证和 [NOTICE](NOTICE) 为准。BlackRain 与 OpenAI、Codex App 或 CodexMonitor 的维护者没有官方隶属关系。
