# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 工具协作限制

- 不调用、依赖或推荐本机 `claude` CLI 参与开发、审查、调研、测试归因或文档治理；相关工作由当前 agent 使用仓库内工具和普通 Git 工作流独立完成。

## 项目本质

BlackRain 是**AI 驱动的垂类工作环境平台**：把领域高手电脑里的工具、环境、方法和验证封装成普通人可以安装的工作台，让每个高度电脑化的长尾领域都能快速拥有自己的“Codex”。它不重写 agent 引擎，而是复用 openai/codex 与 Hermes 原装黑盒；自有核心资产位于工作台包、环境复现、垂类验证和专家供给层。`2049 App` / `2049` 是历史旧称，只能出现在历史说明或尚未迁移的必要产物名中。

文档以 `README.md` + `docs/README.md` + `docs/01`~`docs/09` 为战略入口；跨层新功能还要看 `.specs/` 下对应的 living spec，没有时按下方规则创建。真源层级必须按用途区分：

- 产品形态（`Skill + 插件 + 环境 + 资源 + 验证 → 工作台 → 工作室`）以 `docs/04-产品形态.md` 为唯一真源。
- 运行时边界（双引擎、进程、配置、网关）以 `docs/09-运行时架构与里程碑.md` 为唯一真源。
- 工作台包格式、安装、激活、升级、回滚和卸载以 `.specs/008-expert-workbench-package/` 为执行真源。
- Hermes 进程纳管、`/v1/runs`、SSE、审批、任务恢复和 WORK surface 以 `.specs/009-hermes-work-surface/` 为执行真源。
- 当前实现水位以对应 spec 的 `verification.md` 与实际代码/配置为准；`tasks.md`、战略蓝图和旧调研不能替代实现证据。
- 冲突不得静默处理：修正文档；若决策尚未收敛，在对应 spec 的 `decisions.md` 明确标成待决。

**平台基线**：MVP 仅发行 Windows。macOS / iOS 只作为 post-MVP 或上游代码资产保留，当前不进发布矩阵、不作为验收依据；非 Windows 开发结果不能替代 Windows 实机验证。

## 运行时拓扑（理解一切的前提）

桌面 App 是工作台运行**监工**，按工作台选择**双引擎黑盒**（普通工作台默认 Hermes、软件开发工作台进入 codex）+ 翻译网关：

```
BlackRain（Tauri，subtree 自 CodexMonitor）= 工作台 Core + 双 surface + 唯一写配置的人
  ├─ 工作台/项目/任务入口（目标；生命周期见 spec 008）
  ├─ CODE surface（软件开发工作台/高级封装）
  │   ├─ 子进程：codex 内核（原装黑盒，app-server JSON-RPC）
  │   │     └─ 读专属 CODEX_HOME/config.toml → base_url 连网关
  │   └─ 子进程：模型网关（responses⇄chat 翻译，CODE 专用）
  │         └─ 翻译后 Chat Completions → new-api 计量 → DeepSeek / GLM ...
  │
  └─ WORK surface（普通和专家工作台默认执行器）
      └─ 子进程：Hermes Agent（HTTP /v1 黑盒，零翻译）
            └─ Chat Completions → new-api 计量 → 国产模型
```

上图是**定稿目标拓扑**，不是发布完成度声明。Hermes Desktop 到 WORK surface 的现有合同范围已在 macOS 完成代码级收口，但 Windows Tauri、Hermes/new-api、PTY、Office 和发布矩阵尚未验收；真实完成度以 [.specs/009 verification](.specs/009-hermes-work-surface/verification.md) 和实际代码为准。

**四条铁律（违反即破坏架构）：**
1. **两个引擎永远原装黑盒**——codex/Hermes 都只读、只调用、白嫖上游日更。分叉=日更能力归零。
2. **CODE 的协议翻译脏活（responses⇄chat）锁在可替换网关进程里**——它崩不拖垮界面，它常改不碰别人。**只挂在 CODE 路径**（codex→gateway→new-api），WORK 路径（Hermes→new-api）零翻译。
3. **App 是唯一写配置的人**：codex 用专属 `CODEX_HOME`（藏在 app 数据目录），绝不碰用户机器原有的 `~/.codex`；Hermes 用独立 `HERMES_HOME` / `config.yaml`。
4. **工作台必须声明环境，不依赖作者电脑的偶然状态**：依赖、权限、来源、License、安装、验证、升级和卸载都进入 008 协议；工作台不得直接成为第二个配置写入者。

**网关是 CODE 路径硬依赖，不是可选件。** 上游已删除 `wire_api="chat"`（内核硬拒该值），codex 内核只发 Responses 协议而国产模型只懂 Chat Completions，中间**必须**有翻译。详见 [docs/09](docs/09-运行时架构与里程碑.md)、[gateway/README.md](gateway/README.md)、[.specs/003 双引擎架构](.specs/003-dual-engine-architecture/)。

## 仓库布局：三种代码，三种纪律

| 目录 | 是什么 | 纪律 |
|---|---|---|
| `apps/desktop/` | 桌面壳，**git subtree** 自 CodexMonitor（MIT）。**住在里面、持续魔改的底盘**。 | 日常直接改 + 普通 commit。魔改只砸壳外围（Providers 面板、工作台 UI），**不动保真核心**。`git subtree pull` 是维护者动作，别随手做。 |
| `gateway/` | responses⇄chat 翻译网关（`gateway.py`，纯 stdlib 零依赖）。**可行性验证原型，非生产代码**；边界与命门约束见 [gateway/README.md](gateway/README.md)。 | 可替换的 sidecar 槽位。**只挂在 CODE 路径**（codex→gateway→new-api）。 |
| `codex-upstream/` | **CODE 引擎**：codex 内核本地克隆（**gitignored，不入库**），编译产物即黑盒进程。 | 目标锁定 `rust-v0.144.1` (`44918ea`，2026-07-09)。只读、不改循环；`scripts/fetch-references.sh` 会校验 tag 对应的完整 commit 并 detached checkout。当前仅完成 macOS `cargo check` 与协议方法集合审计，Windows 发布矩阵仍待跑。 |
| `hermes-upstream/` | **WORK 引擎**：Hermes Agent 本地克隆（**gitignored，不入库**），HTTP `/v1` 接缝黑盒纳管。 | 目标锁定 v2026.7.7.2 (`9de9c25`，v0.18.2，2026-07-07)。可借其 Desktop MIT React 组件（摘零件抄进来，不 fork 整个 Desktop）；`fetch-references.sh` 同样强制校验并 checkout。零翻译直入 new-api（Chat Completions）；Windows 产品验收仍以 spec 007 为准。 |
| `plugins/` | 工具/数据源/软件适配器及配套 Skills，可能包含 MCP、CLI、代码、二进制和独立进程。 | 每个第三方制品都要声明来源、License、权限和验证；不等同工作台。 |
| `workbenches/` | 专家工作台包；目标包含 Manifest、Skills、插件依赖、环境、模板、任务和验证。 | 当前 `office-agent` 只是内容/注入骨架；完整生命周期按 008 落地，不能再写成“纯 Markdown 即完整工作台”。 |
| `.specs/` | 轻量 living spec：跨层功能的 requirements/design/tasks/decisions/verification。当前已有 001–010。 | 只给大功能/架构功能建，随实现同步更新。 |

仓库托管在 `goodbyeri-studio/blackrain-desktop`（私有）。BlackRain 另有私有 `blackrain-cloud`；Cloud 以企业客户身份接入独立公开的 `MeiMei API`（`goodbyeri-studio/meimei-api`）。跨产品边界以 `.specs/010-three-project-platform/` 为真源。本仓只承载桌面产品、客户端账户层和本地运行时；Supabase 服务端资产与历史 credit proxy 已迁至 Cloud。`apps/desktop/AGENTS.md` 是壳内部的详细 agent 契约（前后端分层、IPC 路由、import 别名、hotspots），改 `apps/desktop/**` 时**必读**。

## Living Spec 纪律

- 触发条件：跨两层以上、改变运行时边界、形成用户可感知新流程、需要多 PR/多人接手、或依赖易漂移假设（上游协议/模型能力/合规/安全）的功能，必须在 `.specs/<NNN-slug>/` 建 spec。
- 模板：复制 `.specs/_template/`，保留 `requirements.md`、`design.md`、`tasks.md`、`decisions.md`、`verification.md` 五个文件。
- 更新规则：代码、配置、脚本或 UI 改变了功能行为，就在同一个 PR 更新对应 spec；验证命令和真实结果写进 `verification.md`，关键取舍写进 `decisions.md`。
- 不滥用：文案、样式、小 bug、局部重构、只补测试，可以不建 spec；已有 spec 覆盖时只更新对应任务和验证。
- 冲突处理：总体战略以 `README.md` 与 `docs/01`~`docs/09` 为准；产品形态和运行时分别服从 `docs/04`、`docs/09`；单功能执行以对应 spec 为准；当前完成度以 `verification.md` + 代码为准。若冲突，不要静默选择一边，必须修正文档或在 `decisions.md` 标明待决。

**现有 spec 索引（动 `apps/desktop/**` 或运行时边界前，先查相关 spec）：**

| spec | 覆盖 | 关键附加文档 |
|---|---|---|
| [001 providers-model-gateway](.specs/001-providers-model-gateway/) | M1 主线：模型网关设置页、专属 `CODEX_HOME` 写入、Gateway sidecar、对话模型选择器 | — |
| [002 accounts-credits](.specs/002-accounts-credits/) | M-A 主线：账号体系、Free/Plus/Pro 三档、credit 计量、服务端代理、BYOK 锁 Plus | — |
| [003 dual-engine-architecture](.specs/003-dual-engine-architecture/) | 双引擎执行边界；工作台入口与包生命周期已拆到 008 | [code-mode-boundary.md](.specs/003-dual-engine-architecture/code-mode-boundary.md)、[codex-capability-ledger.md](.specs/003-dual-engine-architecture/codex-capability-ledger.md)、[hermes-capability-ledger.md](.specs/003-dual-engine-architecture/hermes-capability-ledger.md) |
| [004 plugin-catalog](.specs/004-plugin-catalog/) | 长期插件供给账本、~34 候选工具单元（不是 MVP 清单） | — |
| [005 gui-redesign](.specs/005-gui-redesign/) | 进入软件开发工作台后的 CODE surface 商业级 GUI | [codex-ui-copy-checklist.md](.specs/005-gui-redesign/codex-ui-copy-checklist.md) |
| [006 code-mode-capability-wiring](.specs/006-code-mode-capability-wiring/) | 记录 42 个方法的历史壳层包装、当前锁重验与 GUI 交接边界；接线不等于可用 | [capability-gui-mapping.md](.specs/006-code-mode-capability-wiring/capability-gui-mapping.md) |
| [007 windows-client](.specs/007-windows-client/) | **当前优先级**:MVP 仅 Windows(macOS 推迟 post-MVP),dev-client.ps1 + NSIS 打包 + Windows 验证矩阵 | — |
| [008 expert-workbench-package](.specs/008-expert-workbench-package/) | **产品核心协议**：工作台 Manifest、依赖、权限、安装、验证、升级、回滚和卸载 | — |
| [009 hermes-work-surface](.specs/009-hermes-work-surface/) | **当前实现 P0**：Hermes 进程纳管、隔离配置、`/v1/runs`、SSE、审批、任务恢复和 Codex 风格 WORK surface | — |
| [010 three-project-platform](.specs/010-three-project-platform/) | BlackRain Desktop/Cloud 与独立 `MeiMei API` 的仓库、License、账本和 API 边界 | — |

## 文档治理

- 文档地图看 `docs/README.md`；日常启动、构建、发布与通用验证命令只维护在 `docs/commands.md`。模块文档只可保留不重复的诊断/协议探针示例，并须明确工作目录与适用范围。
- 新文档默认放 `docs/`、`.specs/` 或对应模块目录，不要随手新增根目录 Markdown。
- **做某个任务时的实现计划/检查清单/技术评估：放对应 `.specs/<功能>/` 或 `.scratch/`，不要新增 `docs/` 顶层文件**——`docs/` 只收战略/架构专题与长期运行手册（2026-07-06 治理定）。
- 同一事实只维护一处：状态写 `README.md`，战略/架构写 `docs/01`~`docs/09`，功能活文档写 `.specs/`，模块细节写模块 `README.md`。
- 文档默认记录当前真实状态；过期方案不要留在正文，确需保留时放到 spec 的 `decisions.md`。
- 根规则同步维护 `AGENTS.md` 与 `CLAUDE.md`，避免不同 agent 读到不同纪律。

### 壳内部架构（改 `apps/desktop/**` 前的前提）

外层把整个桌面 App 当「监工」，但**壳自己的后端是双运行时**——理解这点才不会写出重复逻辑：

```
src-tauri/
  ├─ src/lib.rs                         App 进程：Tauri command 注册表（桌面本地用）
  ├─ src/bin/blackrain_daemon.rs        Daemon 进程：JSON-RPC 服务（远程后端用，见 apps/desktop/REMOTE_BACKEND_POC.md）
  └─ src/shared/*                       唯一真源：跨运行时的领域逻辑（workspaces_core / git_ui_core …）
```

**铁律：领域逻辑先落 `src/shared/*`，App 与 Daemon 都只做薄适配器，禁止两边复制。** 加一个后端命令要按链路全改：`shared/*`（跨运行时核心）→ `lib.rs`（App 命令面）→ `src/services/tauri.ts`（前端 IPC 包装）→ `daemon .../rpc.rs`（Daemon RPC 面），并补测试。前端则 `App.tsx` 只做装配，状态编排进 `src/features/app/{hooks,bootstrap,orchestration}/*`，Tauri 调用只走 `src/services/tauri.ts`，事件扇出只走 `src/services/events.ts`；import 一律用别名（`@/* @app/* @settings/* @threads/* @services/* @utils/*`）。

**接一个 codex-rs 内核能力（CODE 模式主线，spec 006）走专用 5 层链路**，以 `archive_thread` 为已读真实范例：`shared/codex_core.rs`（核心 RPC 发起）→ `src/codex/mod.rs`（App 命令，带 `remote_backend` 分支）→ `lib.rs`（`invoke_handler` 注册）→ `src/services/tauri.ts`（前端 IPC 包装）→ daemon 两处（`src/bin/blackrain_daemon.rs` state 方法 + `src/bin/blackrain_daemon/rpc/codex.rs` 分发）。任务导向的「要改 X 就动 Y」全量映射见 [apps/desktop/docs/codebase-map.md](apps/desktop/docs/codebase-map.md)。

**共享外壳 chrome 必须复用 design-system 原语/token**，别在 feature CSS 里重造 modal/toast/panel/popover——有 `npm run lint:ds` 与 `codemod:ds` 守这条线。`App.tsx`、`SettingsView.tsx`、`useThreadsReducer.ts`、`git_ui_core.rs`、`workspaces_core.rs`、`rpc.rs` 是高频高复杂度热点，改动加倍小心。

## 第三方 License 红线（闭源商业 B2B，全员遵守）

> **MIT / Apache-2.0 → 可进仓库、可借代码（保留 NOTICE 署名）。
> AGPL / GPL / BSL / 无许可证 → 不得进入 Desktop/Cloud 私有仓库；唯一批准例外是独立公开的 `MeiMei API`（`goodbyeri-studio/meimei-api`），可基于 New API 按 AGPLv3 完整履责。**

Desktop/Cloud 保持严格闭源来源边界；普通 AGPL/GPL 参考项目仍放在仓库外（约定 `~/Projects/refs/`），照着重写不照抄。MeiMei API 的公开 AGPL 例外不扩散到本仓。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 命令与验证入口

- 日常启动、构建、发布与通用验证命令只维护在 [docs/commands.md](docs/commands.md)，本文件不保留第二份清单；模块 README/runbook 可保留局部诊断示例，但不能复制主流程。
- Windows 主入口不得漂移：本地客户端用 `pwsh scripts/dev-client.ps1`；壳开发/打包用 `npm run tauri:dev:win` / `npm run tauri:build:win`；正式本机构建用 `pwsh scripts/release-client-win.ps1`。
- 前端/Rust 基线命令仍是 `npm run typecheck`、`npm run test`、`npm run lint`、`npm run lint:ds`、`npm run codemod:ds:dry` 与 `cargo check`；具体工作目录和顺序见 `docs/commands.md`。
- Windows MVP 环境、NSIS、Credential Manager、真实对话、Office 自动化和安装/卸载必须在 Windows 实机验证；CI 不能替代这些验收。
- 当前 CI 按 PR diff 路由：前端相关改动在 Ubuntu 跑 JS typecheck/test/lint/DS/codemod，Rust/WORK 相关改动才在 Windows 用同一 test profile 编译并跑 Hermes/workbench/plugin 专项；文档改动不占用 Windows runner，同一 PR 的旧 run 自动取消。普通 `main` push 不重复跑，只有 Cargo 依赖文件变化时为默认分支预热 Windows cache；不含 GUI、Hermes runtime、NSIS、真实双引擎或 macOS 验证。
- Windows Rust/WORK job 由 repository variable `WINDOWS_RUNNER` 选择 runner；未设置时回退 `windows-latest`，设置为 `blackrain-windows` 时使用受控 self-hosted 开发机。fork PR 不进入开发机；NSIS、签名材料和发布实机矩阵不属于普通 PR CI。
- 非 Windows 跨平台开发边界见 [docs/cross-platform-dev.md](docs/cross-platform-dev.md)；Windows 验证矩阵见 [.specs/007-windows-client/verification.md](.specs/007-windows-client/verification.md)。

## 协作流程（GitHub Flow）

- `main` 永远可用，**绝不直接 push**，一切走 PR。从 `main` 切短命分支：`<type>/<短描述>`（type ∈ feat/fix/docs/refactor/chore/test）。
- 提交信息用 Conventional Commits 轻量版：`<type>: <一句话>`。
- 合并需 1 approve + CI 绿，用 **Squash 合并**（仓库已配死，禁 merge/rebase commit）+ 合并后删分支。
- ⚠️ GitHub Free 私有库**配不了分支保护**，禁直推 main 靠口头约束。

回复、写文档与代码注释默认用中文（与现有代码库一致）。
