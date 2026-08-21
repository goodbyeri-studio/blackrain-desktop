# 文档

这里是 BlackRain Desktop 的公开文档入口。文档描述可复用的架构、开发流程和当前公开范围；它不承诺尚未验证的功能，也不包含商业计划或内部资源安排。

## 从哪里开始

1. [项目范围](project-scope.md)：项目定位、许可证和当前限制。
2. [开发命令](development/commands.md)：本地安装、测试、打包和 Windows 验证。
3. [架构总览](architecture/overview.md)：Electron、app-server、Browser 和 Gateway 的职责。
4. [贡献指南](../CONTRIBUTING.md)：提交代码、文档和问题报告的方式。

## 产品与范围

| 文档 | 内容 |
| --- | --- |
| [愿景](vision.md) | BlackRain 要解决的问题和设计原则 |
| [范围与非目标](scope-and-non-goals.md) | 当前支持边界，以及明确不复制或不承诺的内容 |
| [路线图](roadmap.md) | 面向社区的技术目标和完成标准 |
| [风险与限制](risks.md) | 安全、许可证、上游兼容和发布风险 |

## 架构

| 文档 | 内容 |
| --- | --- |
| [架构总览](architecture/overview.md) | 进程、数据和权限边界 |
| [Electron 宿主](architecture/electron-host.md) | main、preload、renderer 和系统能力 |
| [App Server](architecture/app-server.md) | stdio JSONL、事件和状态所有权 |
| [Browser Runtime](architecture/browser-runtime.md) | main-owned Browser、页面隔离和控制面 |
| [运行时生命周期](architecture/runtime.md) | 启动、运行、退出和验证状态 |
| [模型提供商](architecture/model-providers.md) | 原生 Codex 链路和可选 Gateway |
| [安全架构](architecture/security.md) | IPC、Browser、凭据和供应链约束 |

## 设计记录

- [Electron 宿主设计](design/electron-migration.md)
- [可移植 Browser Runtime 设计](design/portable-browser-runtime.md)
- [架构决策记录](adr/README.md)

设计文档表达当前公共合同，不是某个版本的内部任务清单。实现状态以代码、测试和发布说明为准。

## 开发与维护

- [开发命令](development/commands.md)
- [测试指南](development/testing.md)
- [跨平台与 Windows 边界](development/platforms.md)
- [故障排查](development/troubleshooting.md)
- [上游参考](reference/upstream-and-references.md)
- [App Server 事件参考](../apps/desktop/docs/app-server-events.md)
- [代码地图](../apps/desktop/docs/codebase-map.md)
- [上游更新清单](maintainers/upstream-updates.md)
- [仓库维护说明](maintainers/repository.md)

## 文档约定

- 默认使用中文；代码、协议字段和命令保留原文。
- “对齐 Codex App”只表示参考公开可观察行为，不表示复制闭源代码或资源。
- “已实现”“自动化通过”“Windows 产品通过”是三种不同状态，必须给出对应证据。
- 任何新 API、权限边界、依赖或用户可见行为，都应在同一个 Pull Request 中更新相关文档。
