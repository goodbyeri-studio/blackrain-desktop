# 文档

BlackRain Desktop 的公开文档按产品、架构、开发、设计和维护组织。文档描述公共合同与验证边界；实现状态以代码、测试结果和发布说明为准。

## 开始阅读

- [项目范围](project-scope.md)：项目定位、维护范围和当前限制
- [架构总览](architecture/overview.md)：Electron、app-server、Browser 和 Gateway 的职责
- [开发命令](development/commands.md)：安装、测试、打包和验证
- [贡献指南](../CONTRIBUTING.md)：提交代码、文档和问题报告

## 产品

| 文档 | 内容 |
| --- | --- |
| [愿景](vision.md) | 产品方向和设计原则 |
| [范围与非目标](scope-and-non-goals.md) | 哪些改动属于项目范围 |
| [路线图](roadmap.md) | 公开技术计划，不承诺日期 |
| [风险与限制](risks.md) | 安全、许可证、上游和发布风险 |

## 架构

| 文档 | 内容 |
| --- | --- |
| [架构总览](architecture/overview.md) | 进程、数据和权限边界 |
| [Electron 宿主](architecture/electron-host.md) | main、preload、renderer 和系统能力 |
| [App Server](architecture/app-server.md) | stdio JSONL、事件和状态所有权 |
| [Browser Runtime](architecture/browser-runtime.md) | main-owned Browser 和控制面 |
| [模型提供商](architecture/model-providers.md) | provider、Gateway 和模型路由 |
| [安全架构](architecture/security.md) | IPC、Browser、凭据和供应链约束 |

## 开发与设计

- [开发命令](development/commands.md)
- [测试指南](development/testing.md)
- [平台边界](development/platforms.md)
- [故障排查](development/troubleshooting.md)
- [Electron 宿主设计](design/electron-migration.md)
- [可移植 Browser Runtime 设计](design/portable-browser-runtime.md)
- [架构决策记录](adr/README.md)

## 维护与参考

- [发布维护](maintainers/release.md)
- [仓库维护](maintainers/repository.md)
- [上游更新](maintainers/upstream-updates.md)
- [许可证与商业授权](../COMMERCIAL-LICENSE.md)
- [上游与参考项目](reference/upstream-and-references.md)
- [第三方来源](reference/third-party.md)
- [App Server 事件](../apps/desktop/docs/app-server-events.md)
- [代码地图](../apps/desktop/docs/codebase-map.md)

## 阅读约定

- “已实现”、`RUN_PASS` 和 `PRODUCT_PASS` 是不同状态，不能相互替代。
- “对标 Codex App”只表示参考公开可观察行为，不表示复制闭源代码或资源。
- 新的公共 API、权限边界、依赖和用户可见行为，应在同一个 PR 中更新文档。

## 私人笔记边界

公开仓库只保存可复现、适合贡献者审查的产品和工程文档。个人学习笔记、未发布方案、私人日记、带个人信息的截图和临时调研不要放入公开文档树；本地临时笔记可以放在被忽略的 `docs/private/` 目录中，但该目录不会进入 Git，也不会成为项目公共文档的一部分。
