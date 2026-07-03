# 2049 App

> 用国产大模型驱动、面向非开发者的中国版 Codex,也是一个面向办公场景的桌面级 agent 助手。
> 把「会写代码的 agent」复刻成「会在你电脑上替你把活干完的 agent」,对标 WorkBuddy、Trae Work、Coze 的下一代办公入口,让 agent 能在电脑上替知识工作者把文档、表格、网页、系统操作和跨应用流程做完。
> 用「工作台」打包成普通人点开就能用的岗位,用「市场」让办公能力人人可造、可传、可赚钱。

---

## 这是什么

Codex 这类 AI agent 真正难造、值钱的部分,是一套**能安全地在真实电脑上干活**的引擎:agent 循环、工具调用、沙箱执行、审批机制。但它今天只有程序员玩得转——因为它是个终端黑框,且要你会写精确指令。2049 App 要做的「非开发者版 Codex / 中国版 Codex」,本质上就是把这套能力产品化成一个面向办公场景的桌面级 agent 助手,让它稳定控制浏览器、文件、Office/PDF、企业系统等真实办公环境。

2049 App 做的事:**复用并产品化这套 Codex 级引擎,换掉模型(国产)、换掉外壳(普通人能用)、加上一层「工作台」把能力翻译成岗位任务,再用一个「市场」让懂业务的人(而非程序员)也能造和卖办公能力。**

## 交付形态（一句话先讲清）

本项目的**目标产品形态**是：**一个桌面安装包，内置 CODE(codex) / WORK(Hermes) 双引擎、模型网关和默认运行时资源，用户安装后直接可用；但运行时内部仍是「桌面 App + 引擎子进程 + 网关子进程」的多进程结构。**

换句话说：

- **对用户**：应当像普通 Windows / macOS 软件一样，安装完即可用，不要求用户另装 `codex`、Node、Python 或手动配 `~/.codex`。
- **对工程实现**：不追求“单进程单二进制”，而是坚持 **子进程 + 协议** 的运行时拓扑，把 CODE 引擎、WORK 引擎和 CODE 专用网关都锁在 app 内部，不暴露给用户。
- **对当前仓库状态**：开发态仍需本地编译内核、启动网关；这不代表产品态也必须如此。v1 的目标是从“开发态外置依赖”升级到“产品态随 app 打包”。详见 [09 运行时架构与里程碑](docs/09-运行时架构与里程碑.md)。

一句话类比:

> 以前只有厨师有厨房、厨具、食材,顾客想吃得等他炒好端上桌。
> 现在每个顾客都有厨具(2049 引擎),所以我们不传播「炒好的菜(成品)」,
> 只传播「厨房(工作台)+ 菜谱(技能)」,食材让 AI 自己上网找。

## 目录结构

轻量 monorepo。只创建有实际内容的目录;其余为**约定位置**,动工时再落地。运行时拓扑见 [docs/09](docs/09-运行时架构与里程碑.md)。

```
2049-app/
├── README.md              全仓入口 + 当前状态
├── docs/                  文档地图、产品文档、命令速查
├── apps/
│   └── desktop/           桌面外壳，fork 自 CodexMonitor（git subtree，持续魔改的底盘）
├── .specs/                轻量 living spec（大功能的需求/设计/任务/决策/验证）
├── gateway/               模型路由 / Responses⇄Chat 翻译层（可替换的 sidecar 槽位）
├── plugins/               能力封装：插件 / 工作台模板（放进 CODEX_HOME 的文件）
├── workbenches/           ★ 核心产出：工作台内容（纯 Markdown）
├── scripts/               工具脚本
│
│   —— 约定位置，动工时创建 ——
├── codex-upstream/        CODE 引擎：Codex 内核本地克隆（.gitignore，不入库，黑盒子进程）
└── hermes-upstream/       WORK 引擎：Hermes Agent 本地克隆（.gitignore，不入库，黑盒子进程）
```

> 引擎 = vendor 式黑盒（`codex-upstream/` / `hermes-upstream/`，只读、不入库）;壳 = fork 式底盘（`apps/desktop/`，subtree 入库、持续魔改）。这个区分及上游同步策略详见 [docs/08](docs/08-仓库结构与上游策略.md) 与 [docs/REFERENCES](docs/REFERENCES.md)。

## 文档索引

| 文档 | 内容 |
|---|---|
| [文档地图](docs/README.md) | 文档分层、写作规则、去哪里写 |
| [快捷命令行](docs/commands.md) | 启动客户端、构建内核、网关、探针、GitHub Flow |
| [01 产品愿景](docs/01-产品愿景.md) | 我们要做什么、为谁做、为什么是现在 |
| [02 市场与竞品](docs/02-市场与竞品.md) | 竞争格局、字节 Coze 的威胁、我们的差异化 |
| [03 系统架构](docs/03-系统架构.md) | 六层架构（含验证层）、复用 Codex 哪些、自建哪些 |
| [04 产品形态](docs/04-产品形态.md) | **产品形态唯一真源**:双入口(WORK/CODE)、技能/插件/工作台/工作室四词定义及 v1 状态、带护栏的发挥、成熟度路径 |
| [05 模型路由](docs/05-模型路由.md) | v1 用户在模型广场手动选;Auto-Mode 大后期;网关翻译为硬依赖 |
| [06 市场与创作者经济](docs/06-市场与创作者经济.md) | 应用市场、冷启动、分成、GPT Store 教训 |
| [07 护城河与风险](docs/07-护城河与风险.md) | 四处护城河（含验证层）、三大硬风险、诚实的边界 |
| [08 仓库结构与上游策略](docs/08-仓库结构与上游策略.md) | 内核黑盒 vs 壳底盘、CodexMonitor 用 subtree 导入 |
| [09 运行时架构与里程碑](docs/09-运行时架构与里程碑.md) | 双引擎监工模型、三条铁律、引擎形态、M0-M3 里程碑 |
| [REFERENCES](docs/REFERENCES.md) | 参考项目登记（怎么拿源码、锁哪个版本）|
| [.specs](.specs/README.md) | 跨层功能的轻量 living spec 规则与模板 |
| [.specs/004 插件目录](.specs/004-plugin-catalog/) | 两层模型、~34 打包单元、粒度与切分规则、验证脚手架 |
| [.specs/007 Windows 客户端](.specs/007-windows-client/) | **MVP 仅 Windows**:dev-client.ps1 + NSIS + Windows 验证矩阵 |

## 当前状态

- **产品形态**:已定型(2026-06-28)。双引擎 = 两个平级入口:**WORK(Hermes,办公小白)+ CODE(codex,开发者,复刻 codex-app)**。术语台阶 = 技能 → 插件 → 工作台 → 工作室。唯一真源见 [04 产品形态](docs/04-产品形态.md)。
- **MVP 范围**:WORK 侧**只做 office 工作台**(通用办公:文档/表格/PPT/PDF);CODE 侧**复刻 codex-app**(GUI + 功能,基于 codex-rs)。漫剧及其他垂类、创作者市场(06)、插件目录全量(.specs/004,~34 单元属终局参考)均**往后放**。
- **首发平台**:**MVP 仅发行 Windows 客户端**(2026-06-30 决策);macOS 推迟到 post-MVP。受众大头在 Windows,4 人团队不同时维护两个平台。详见 [.specs/007 windows-client](.specs/007-windows-client/)。
- **能力底账**:两个引擎的功能已源码逐文件核查并沉淀——[Hermes 能力底账](.specs/003-dual-engine-architecture/hermes-capability-ledger.md)、[codex 能力底账](.specs/003-dual-engine-architecture/codex-capability-ledger.md)。
- **仓库骨架**:`apps/desktop/` 用 git subtree 导入 CodexMonitor 壳(BlackRain GUI 正在复刻 codex-app);`gateway/` 已作为 CODE 路径 responses⇄chat sidecar 原型;`plugins/`、`workbenches/office-agent/` 已有 office 工作台/OfficeCLI 资源骨架,市场化内容仍后置。
- **CODE M0(壳↔codex 打通)**:✅ 已验证(macOS)。协议四探针(initialize / model·list / thread·start / turn·start)全绿;Windows 实测待跑。
- **M1 可行性(接国产模型)**:✅ 已实测(macOS)。`wire_api="chat"` 已被上游删除,必须走翻译网关;自写最小 responses⇄chat 网关已让 **DeepSeek 真正驱动内核跑通多轮工具调用**;Windows 上同套验证矩阵待跑(见 [.specs/007 verification](.specs/007-windows-client/verification.md))。详见 [09 运行时架构](docs/09-运行时架构与里程碑.md)。
- **当前优先级**:① **Windows 客户端落地**(dev-client.ps1 + NSIS 打包 + Windows 验证矩阵,见 [.specs/007](.specs/007-windows-client/)) → ② 同步刷新双引擎能力底账/探针版本到当前锁定版本 → ③ CODE 复刻收尾(品牌切割、Skills/MCP 管理 UI、真实国产模型端到端烟测)。

## 参与开发

协作流程见 [CONTRIBUTING](CONTRIBUTING.md)。一句话：采用 **GitHub Flow**——从 `main` 切短命功能分支，开 PR，1 人 Review + CI 绿后 Squash 合并。

常用命令速查见 [docs/commands.md](docs/commands.md)（启动客户端、构建内核、起网关等）。

## 合规

本项目计划 Fork 的 [openai/codex](https://github.com/openai/codex) 为 Apache-2.0 许可。商业 Fork 合法,但须保留原始版权与 `NOTICE`、声明修改、不得用 OpenAI 商标为本产品背书。详见 [07 护城河与风险](docs/07-护城河与风险.md)。
