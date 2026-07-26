# 文档地图

本仓库文档走轻量、标准化路线：入口少、职责清、同一事实只维护一处。`BlackRain` 是当前规范产品名；`2049 App` / `2049` 只保留在历史说明或尚未迁移的必要产物名中。新文档默认不要放仓库根，除非它是全仓入口或工具约定。

## 真源与判定顺序

| 要回答的问题 | 真源 |
|---|---|
| BlackRain 现在是什么、全局进度到哪 | `README.md` |
| Skill、插件、环境、工作台、工作室、项目如何定义 | `docs/04-产品形态.md` |
| Desktop 运行时如何组织、谁写配置、Gateway 挂在哪 | `docs/09-运行时架构与里程碑.md` |
| 工作台 Manifest、安装、升级、回滚和卸载怎样实现 | `.specs/008-expert-workbench-package/` |
| 工作台激活后怎样进入受控会话、两种 surface 怎样共享内核 | `.specs/011-workbench-session-orchestration/` |
| BlackRain Desktop/Cloud 与独立 MeiMei API 怎样分工 | `.specs/010-three-project-platform/` |
| 某个跨层功能应该怎样实现 | 对应 `.specs/<NNN-slug>/requirements.md`、`design.md`、`decisions.md` |
| 某功能当前真的完成了什么 | 对应 `verification.md` + 实际代码/配置 |

`tasks.md` 勾选、战略蓝图、调研结论和旧测试不能替代当前实现证据。发生冲突时先按问题类型找到真源；仍无法收敛的，在对应 `decisions.md` 明确写成待决，不要静默选边。

## 先读顺序

1. [README](../README.md)：项目一句话、当前状态、目录入口。
2. [AGENTS](../AGENTS.md)：agent 工作契约、架构铁律、常用验证命令。
3. [commands](commands.md)：本地启动、构建、网关、探针、GitHub Flow 命令。
4. 对应专题文档或 `.specs/<功能>/`。

## 文档分层

| 层级 | 位置 | 职责 | 更新时机 |
|---|---|---|---|
| 全仓入口 | `README.md` | 一句话定位、当前状态、关键入口 | 里程碑或目录结构变化 |
| 文档地图 | `docs/README.md` | 文档体系、去哪里写、去哪里查 | 文档规则变化 |
| 战略/架构专题 | `docs/01`~`docs/09` | 产品愿景、竞品、系统架构、模型路由、市场、风险、运行时 | 战略或架构判断变化 |
| 活 spec | `.specs/<NNN-slug>/` | 跨层功能的需求、设计、任务、决策、验证 | 功能实现和验证同步更新 |
| 模块说明 | `gateway/README.md`、`plugins/README.md`、`workbenches/README.md`、`apps/desktop/README.2049.md`（历史兼容文件名） | 某个目录的本地边界、运行方式、注意事项 | 模块行为或命令变化 |
| agent 契约 | `AGENTS.md`、`CLAUDE.md`、`apps/desktop/AGENTS.md` | 给 coding agent 的硬规则和热点路径 | 工作规则或热点变化 |
| 协作流程 | `CONTRIBUTING.md`、`.github/pull_request_template.md` | 分支、PR、license、密钥、review 纪律 | 团队流程变化 |
| 命令速查 | `docs/commands.md` | 可复制命令和验证入口 | 命令变化或新增验证入口 |
| 工程运行手册 | `docs/upstream-update-checklist.md`、`docs/cross-platform-dev.md` | 上游引擎跟进节奏、跨平台开发边界与烟测 | 流程或平台策略变化 |

## 专题文档索引

| 文档 | 内容 |
|---|---|
| [01 产品愿景](01-产品愿景.md) | 我们要做什么、为谁做、为什么是现在 |
| [02 市场与竞品](02-市场与竞品.md) | 通用 Agent 与专家数字工作环境的错位竞争、长尾垂类路径 |
| [03 系统架构](03-系统架构.md) | Core、工作台运行层、验证、工作室和专家市场分层 |
| [04 产品形态](04-产品形态.md) | **产品形态唯一真源**：`Skill + 插件 + 环境 + 资源 + 验证 → 工作台 → 工作室` |
| [05 模型路由](05-模型路由.md) | 模型作为可替换执行资源、统一 codex 模型路由和真实验证边界 |
| [06 专家经济与工作台市场](06-市场与创作者经济.md) | 专家供给、封装者、市场冷启动、审核和分成 |
| [07 护城河与风险](07-护城河与风险.md) | 环境复现、专家资产、垂类验证与主要风险 |
| [08 仓库结构与上游策略](08-仓库结构与上游策略.md) | 内核黑盒 vs 壳底盘、CodexMonitor subtree |
| [09 运行时架构与里程碑](09-运行时架构与里程碑.md) | Workbench Core、Session Orchestrator、双 surface、codex 与 Gateway |
| [.specs/008 工作台包](../.specs/008-expert-workbench-package/) | Manifest、依赖、权限、安装、验证、升级、回滚和卸载 |
| [.specs/011 工作台会话编排](../.specs/011-workbench-session-orchestration/) | 激活记录、受控会话描述符、双 surface 与统一执行合同 |
| [.specs/010 跨产品边界](../.specs/010-three-project-platform/) | BlackRain Desktop/Cloud 与独立 MeiMei API 的仓库、License、账本和 API 边界 |
| [REFERENCES](REFERENCES.md) | 参考项目登记、锁定版本、许可证 |
| [上游更新检查清单](upstream-update-checklist.md) | codex 上游升级、能力复验和 Windows 验收 |
| [跨平台开发指南](cross-platform-dev.md) | Windows-first 开发/发布边界、非 Windows 资产、平台分叉点和实机烟测 |

## 去哪里写

- 新的跨层功能：建 `.specs/<NNN-slug>/`，不要先写长篇散文。
- 新的长期战略/架构判断：更新 `docs/01`~`docs/09` 中最接近的一篇。
- **做某个任务时的实现计划/检查清单/技术评估：放对应 `.specs/<功能>/`（无对应 spec 就先建，或放 `.scratch/`），不要新增 `docs/` 顶层文件**——`docs/` 只收战略/架构专题与长期运行手册（2026-07-06 治理定）。
- 新的日常启动、构建、发布或通用验证命令：更新 `docs/commands.md`。模块专属且不重复主流程的诊断/协议探针，可留在模块 README/runbook，但必须标明工作目录、适用范围和真源链接。
- 某个目录自己的运行方式：更新该目录 `README.md`。
- agent 必须遵守的规则：更新对应 `AGENTS.md`，根规则同步到 `CLAUDE.md`。
- 临时实验、探针、日志：放 `.scratch/`，不要写进正式文档，除非验证结果需要沉淀到 spec。

## 写作规则

- 默认中文，短句，结论先行。
- 产品名默认写 `BlackRain`；引用历史旧称或旧文件名时必须显式说明其历史/兼容性质。
- 产品第一主语是工作台，不把模型广场或“通用办公助手”写成核心定位。
- 正式关系写成 `Skill + 插件 + 环境 + 资源 + 验证 → 工作台 → 工作室`；对外价值台阶可简写为 `Skill → 插件 → 工作台 → 工作室`。
- 工作台不是纯 Markdown；描述现状时必须区分内容骨架、Manifest 存在、Windows 安装通过和可发布。
- MVP 只写 Windows 交付口径；macOS / iOS 只能标成 post-MVP 或上游资产，不能写成当前发布承诺。
- 记录当前真实状态，不保留过期方案当正文；被推翻的方案放到 spec 的 `decisions.md`。
- 实测结论必须带具体日期、命令或证据位置。
- 不复制大段主流程命令到多个文件。权威日常/build/release 命令放 `docs/commands.md`；模块文档只保留必要且不重复的局部诊断/协议探针。
- 文档改动和代码改动同 PR 维护；不要留“以后补文档”的悬空状态。
