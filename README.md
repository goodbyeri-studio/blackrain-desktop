# BlackRain

> **把领域高手电脑里的工具、环境和工作流，封装成普通人可以安装和使用的 AI 工作台。**

BlackRain 是一个由 AI 驱动的垂类工作环境平台。它不和大厂正面争夺“最全能的通用助手”，而是提供工作台的封装、安装、运行和分发底座，让每个可电脑化领域都能快速拥有自己的“Codex”。

`BlackRain` 是当前规范产品名。历史文档、提交和少数尚未迁移的产物名里可能仍出现 `2049 App` / `2049`；它们只表示旧称。

## 一句话理解

Codex 大幅降低了软件开发门槛，因为它进入的不是一个空白聊天框，而是程序员已经配置好的项目、工具链、依赖、命令、测试和工程规范。

BlackRain 把这套范式推广到其他领域：

```text
强 Agent 底座
  + 领域高手筛选过的工具与环境
  + 方法、模板、数据连接和标准流程
  + 验证、审批和恢复能力
= 可安装的专业工作台
```

例如，股票研究工作台不是“回答股票问题的聊天机器人”，而是已配置好的数据源、研究框架、分析脚本、回测工具、报告模板和风险检查，再交给 AI 操作。Office、GIS、CAD、电商运营、学术研究等电脑化领域都适用同一模型。

## 产品层级

对外可以使用容易理解的价值台阶：

> **Skill → 插件 → 工作台 → 工作室（OPC 一人公司）**

正式架构不是严格的单链继承，而是：

```text
Skill + 插件 + 环境 + 资源 + 验证
                    ↓
                 工作台
                    ↓
            工作室（OPC 一人公司）
```

- **Skill**：复制高手的方法，告诉 AI 应该怎样做。
- **插件**：复制高手的工具，打开软件、数据源和系统的“机器门”。
- **工作台**：复制高手的电脑，是面向一个岗位或领域的可复现数字工作环境，也是 BlackRain 的核心商品。
- **工作室**：复制高手的团队，让多个工作台围绕同一个业务目标分工、交接和验收。

完整定义以 [04 产品形态](docs/04-产品形态.md) 为唯一真源；工作台包格式的目标设计见 [.specs/008](.specs/008-expert-workbench-package/)。

## 对用户和工程分别意味着什么

### 对用户

- 安装一个普通 Windows 软件，不要求自己配置 Codex、Hermes、Python、Node 或 `~/.codex`。
- 从“工作台货架”选择专业环境，而不是先理解模型、引擎或命令行。
- 进入工作台后看到任务、项目、专业工具和结果，而不是一个空白对话框。
- AI 负责操作环境；关键动作有审批，结果有来源、检查和恢复能力。

### 对工程

- BlackRain Core 负责 Agent、模型、权限、安装、更新、进程和工作台生命周期。
- 工作台可以声明 Skills、插件、运行时、工具依赖、模板、目录、数据连接、权限和验证规则。
- 底层继续复用原装黑盒引擎：WORK 路径用 Hermes，CODE 路径用 codex；双引擎是运行实现，不是品牌第一认知。
- CODE 的 Responses⇄Chat 翻译仍由独立 Gateway sidecar 承担；App 是唯一写引擎配置的人。

## 首批产品策略

- **MVP 平台**：仅发行 Windows；macOS / iOS 属于 post-MVP 或上游资产。
- **第一套参考工作台**：Office。它用于打通工作台安装、工具注入、文件处理、验证和交付闭环，不代表 BlackRain 的最终定位只是办公助手。
- **软件开发能力**：CODE surface 保留，作为“程序员垂类已经成立”的参考实例和高级入口；不与 Codex、Claude Code、Trae 正面争夺编码市场。
- **市场**：MVP 先发官方工作台；领域专家上传、交易、分成属于 post-MVP。
- **增长方式**：不铺一个大而全的通用助手，而是逐个选择“高度电脑化、环境搭建难、流程可复用、结果可验证”的长尾垂类。

## 目录结构

```text
BlackRain/
├── README.md              全仓入口、产品定位和当前状态
├── docs/                  产品战略、架构、市场和运行手册
├── .specs/                跨层功能的 living specs
├── apps/desktop/          Windows 桌面壳与监工运行时
├── gateway/               CODE 路径 Responses⇄Chat 翻译 sidecar
├── plugins/               可复用工具能力、适配器与其 Skills
├── workbenches/           工作台包和参考工作台
├── scripts/               开发、打包和验证脚本
├── codex-upstream/        CODE 引擎本地克隆（gitignored、只读）
└── hermes-upstream/       WORK 引擎本地克隆（gitignored、只读）
```

## 文档真源

- **产品愿景与核心命题**：[01 产品愿景](docs/01-产品愿景.md)
- **市场位置与竞争方式**：[02 市场与竞品](docs/02-市场与竞品.md)
- **平台分层与自建边界**：[03 系统架构](docs/03-系统架构.md)
- **Skill / 插件 / 工作台 / 工作室定义**：[04 产品形态](docs/04-产品形态.md)
- **运行时拓扑**：[09 运行时架构与里程碑](docs/09-运行时架构与里程碑.md)
- **工作台包协议**：[.specs/008](.specs/008-expert-workbench-package/)
- **当前实现水位**：对应 spec 的 `verification.md` + 实际代码/配置

完整地图见 [docs/README.md](docs/README.md)。

## 当前真实状态

- 产品定位已在 2026-07-12 重构为“专家数字工作环境平台”；现有代码尚未因此自动获得工作台安装、升级和市场能力。
- `apps/desktop/` 已有 CODE 主链和大量 codex app-server 能力接线；CODE 功能水位不等于 WORK/工作台产品已经完成。
- `gateway/` 已证明 DeepSeek 可经翻译驱动 codex 工具调用，但 App 托管 spawn 尚未显式设置 `STRIP_TOOLS=0`，普通产品路径仍会剥除工具，是发布阻塞项。
- Hermes→new-api→国产模型已有独立 spike 证据；Hermes 进程纳管、Tauri WORK surface 和工作台生命周期尚未形成产品闭环。
- `workbenches/office-agent/`、OfficeCLI 资源和注入骨架存在，但 Windows NSIS 构建、安装、首启、Office 质量基线尚未完成。
- `.specs/008` 当前只定义目标工作台包格式，尚无完整 manifest、安装器、升级/回滚和签名验证实现。
- 专家工作台市场属于 post-MVP，当前没有上传、审核、分发、结算实现。

## 当前优先级

1. 修复 CODE Gateway 产品启动路径并完成 Windows 发布矩阵。
2. 打通 Hermes WORK surface 和工作台生命周期最小闭环。
3. 用 Office 参考工作台验证“安装环境 → 执行任务 → 验证结果 → 恢复失败”的完整链路。
4. 落地 `.specs/008` 的最小工作台 manifest、依赖检查、安装、验证和卸载协议。
5. 选择第二套真正用于市场切入的垂类工作台；市场和工作室在单工作台模型成立后再推进。

## 架构红线

1. codex 与 Hermes 的 Agent 循环保持原装黑盒，不为品牌或国产模型硬 fork。
2. CODE 的协议翻译只放 Gateway sidecar；WORK 原生走 Chat Completions。
3. App 是唯一写 `CODEX_HOME` / `HERMES_HOME` 和工作台激活配置的人。
4. 工作台不得静默安装、越权访问或隐藏第三方 License；环境、权限和数据出境必须可解释。
5. “工具和环境可复制”不等于“专家判断和收益可保证”；金融、医疗、法律等高责任领域必须单独收紧边界。

## 参与开发

协作流程见 [CONTRIBUTING.md](CONTRIBUTING.md)，常用命令见 [docs/commands.md](docs/commands.md)。采用 GitHub Flow：从 `main` 切短命分支，经 Review 和 CI 后 Squash 合并。
