# 文档

文档只保留五份入口真源。实现状态以代码、实际命令输出和发布说明为准。

| 文档 | 回答的问题 |
| --- | --- |
| [产品定义](product.md) | 做什么、先做什么、明确不做什么 |
| [架构](architecture.md) | 每个进程、状态与权限由谁拥有 |
| [Browser 与 Computer Use](browser.md) | 页面如何隔离、控制与恢复 |
| [开发](development.md) | 如何开发、验证、发布和升级上游 |
| [上游与来源](upstream.md) | 哪些代码可用、哪些只可参考、许可证边界 |

架构铁律、不变量和目录纪律的真源是仓库根 [AGENTS.md](../AGENTS.md)，不在本目录内。[CLAUDE.md](../CLAUDE.md) 只补充 Claude Code 需要的工程细节（环境陷阱、门禁扫描范围、命令真实行为），不复述铁律。

深入资料： [ADR](adr/README.md) 记录长期决策；[App Server 事件](../apps/desktop/docs/app-server-events.md) 和[代码地图](../apps/desktop/docs/codebase-map.md)服务于实现定位。

所有文档都应区分 `CODE_EXISTS`、`RUN_PASS` 和 `PRODUCT_PASS`。对齐官方 Codex Desktop 只允许参考公开可观察行为，不授权复制其闭源实现或资源。
