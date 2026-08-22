# BlackRain Desktop

> **开源 Codex App (ChatGPT) 客户端，对标其闭源能力，支持 Cursor 的多模型 & Auto 路由。**

[![CI](https://github.com/goodbyeri-studio/blackrain-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/goodbyeri-studio/blackrain-desktop/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> Auto 路由开发中；Windows 正式发行版尚未发布。

## 能力

- Codex thread、审批、停止、恢复和标准 Codex Home
- 文件、终端、Git、diff、通知、更新和 in-app Browser
- 多 provider、模型选择与独立 Model Gateway

## 快速开始

需要 Windows 11 x64、Node.js 22、Git 和 PowerShell 7。

```powershell
Set-Location apps/desktop
npm.cmd ci
npm.cmd run electron:start
```

完整命令见[开发命令](docs/development/commands.md)。

## 文档

[文档地图](docs/README.md) · [项目范围](docs/project-scope.md) · [架构总览](docs/architecture/overview.md) · [模型与 Auto 路由](docs/architecture/model-providers.md)

## 参与贡献

阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，从 [Issue #95](https://github.com/goodbyeri-studio/blackrain-desktop/issues/95) 或 [Good first issue](https://github.com/goodbyeri-studio/blackrain-desktop/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) 开始。

## 许可证

BlackRain 自有代码采用 [MIT License](LICENSE)，第三方归属见 [NOTICE](NOTICE)。项目独立于 OpenAI、ChatGPT 和 Cursor，不复制其闭源代码或专有资源。
