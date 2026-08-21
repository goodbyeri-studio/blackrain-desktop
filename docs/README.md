# 文档地图

BlackRain 的公开文档分为四层：

1. **对外项目说明**：README、[open-source.md](open-source.md)、License、NOTICE、安全和贡献治理文件。
2. **产品与架构真源**：产品形态、运行时架构、Browser 方案和上游策略。
3. **开发与发布手册**：命令、环境变量、runtime 锁、Windows 验收和故障诊断。
4. **Living specs**：跨层需求、设计、任务、决策和真实验证记录。

## 先读顺序

1. [根 README](../README.md)
2. [开源项目说明](open-source.md)
3. [产品形态与优先级](04-产品形态.md)
4. [运行时架构与里程碑](09-运行时架构与里程碑.md)
5. [开发与验证命令](commands.md)
6. 与改动对应的 `.specs/` 目录

## 产品与架构

| 文档 | 职责 |
|---|---|
| [01 产品愿景](01-产品愿景.md) | 为什么把开源 Codex 内核做成完整桌面客户端 |
| [02 市场与竞品](02-市场与竞品.md) | 官方 Codex App、开源客户端和 Electron 宿主的定位 |
| [03 系统架构](03-系统架构.md) | main/preload/renderer、app-server、Browser 与 Gateway 分层 |
| [04 产品形态](04-产品形态.md) | Codex-first 产品入口、优先级和暂停范围的唯一真源 |
| [05 模型路由](05-模型路由.md) | 原装 Responses 链路与可选 Gateway 边界 |
| [06 暂缓路线](06-市场与创作者经济.md) | 工作台、插件、Office 和 OPC 的冻结边界 |
| [07 护城河与风险](07-护城河与风险.md) | 上游吸收、桌面宿主、Browser 安全与复刻风险 |
| [08 仓库与上游](08-仓库结构与上游策略.md) | 目录所有权、第三方来源和上游升级流程 |
| [09 运行时与里程碑](09-运行时架构与里程碑.md) | 当前唯一运行时真源和交付状态 |
| [10 Electron 与 Browser 实施计划](10-Electron迁移与内置浏览器实现计划.md) | 迁移波次、协议和验收闸口 |

## 开发与参考

- [日常命令](commands.md)
- [跨平台开发边界](cross-platform-dev.md)
- [上游更新清单](upstream-update-checklist.md)
- [上游参考与锁定版本](REFERENCES.md)
- [Gateway README](../gateway/README.md)
- [apps/desktop README](../apps/desktop/README.md)
- [App Server 事件映射](../apps/desktop/docs/app-server-events.md)
- [Renderer/host 代码地图](../apps/desktop/docs/codebase-map.md)

## Living specs

- [002 Electron 全量迁移](../.specs/002-electron-migration/)：产品 Electron、Browser 回归和 Windows 发布。
- [003 可移植 Electron Browser Runtime](../.specs/003-portable-electron-browser-runtime/)：中性 Browser 核心、adapter、reference host 和可移植性。

## 写作规则

- 默认中文，结论先行；对外入口保持简短，细节进入对应专题。
- 明确区分目标架构、代码存在、运行通过、可移植通过和发布可用。
- “对齐 Codex App”只表示对齐公开行为与体验，不表示复制闭源实现或资源。
- 新命令、新边界和新状态必须在同一 PR 更新相应文档或 living spec。
- Windows 是产品发布验收平台；其他平台 smoke 不能替代 Windows 证据。
