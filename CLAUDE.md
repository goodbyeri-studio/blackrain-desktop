# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目本质

2049 App 是**用国产大模型驱动、面向非开发者的中国版 Codex**。它不重写 agent 引擎，而是**复用 openai/codex 内核**（黑盒、原装），换掉模型（国产）、换掉外壳（普通人能用），再加「工作台/插件/市场」让懂业务的人也能造和卖能力。

文档以 `README.md` + `docs/README.md` + `docs/01`~`docs/09` 为权威；战略细节查那里，本文件只讲跨多文件才能理解的架构与命令。跨层新功能还要看 `.specs/` 下对应的 living spec；没有时按下方规则创建。

## 运行时拓扑（理解一切的前提）

桌面 App 是一个**监工**，看管**双引擎黑盒**（Hermes 管 WORK、codex 管 CODE）+ 翻译网关：

```
2049 App（Tauri，fork 自 CodexMonitor）= 监工 + 双 surface + 唯一写配置的人
  ├─ CODE surface（开发者/插件创作）
  │   ├─ 子进程：codex 内核（原装黑盒，app-server JSON-RPC）
  │   │     └─ 读专属 CODEX_HOME/config.toml → base_url 连网关
  │   └─ 子进程：模型网关（responses⇄chat 翻译，CODE 专用）
  │         └─ 翻译后 Chat Completions → new-api 计量 → DeepSeek / GLM ...
  │
  └─ WORK surface（办公非开发者/业务专家）
      └─ 子进程：Hermes Agent（HTTP /v1 黑盒，零翻译）
            └─ Chat Completions → new-api 计量 → 国产模型
```

**三条铁律（违反即破坏架构）：**
1. **两个引擎永远原装黑盒**——codex/Hermes 都只读、只调用、白嫖上游日更。分叉=日更能力归零。改了就丢掉「白嫖上游日更」的能力。
2. **最难的活（responses⇄chat 翻译）锁在可替换的网关进程里**——它崩不拖垮界面，它常改不碰别人。**只挂在 CODE 路径**（codex→gateway→new-api），WORK 路径（Hermes→new-api）零翻译。
3. **App 是唯一写配置的人**：codex 用专属 `CODEX_HOME`（藏在 app 数据目录），绝不碰用户机器原有的 `~/.codex`；Hermes 用独立 `HERMES_HOME` / `config.yaml`。

**网关是 CODE 路径硬依赖，不是可选件。** 上游已删除 `wire_api="chat"`（内核硬拒该值），codex 内核只发 Responses 协议而国产模型只懂 Chat Completions，中间**必须**有翻译。详见 [docs/09](docs/09-运行时架构与里程碑.md)、[gateway/README.md](gateway/README.md)、[.specs/003 双引擎架构](.specs/003-dual-engine-architecture/)。

## 仓库布局：三种代码，三种纪律

| 目录 | 是什么 | 纪律 |
|---|---|---|
| `apps/desktop/` | 桌面壳，**git subtree** 自 CodexMonitor（MIT）。**住在里面、持续魔改的底盘**。 | 日常直接改 + 普通 commit。魔改只砸壳外围（Providers 面板、工作台 UI），**不动保真核心**。`git subtree pull` 是维护者动作，别随手做。 |
| `gateway/` | responses⇄chat 翻译网关（`gateway.py`，纯 stdlib 零依赖）。**可行性验证原型，非生产代码**；边界与命门约束见 [gateway/README.md](gateway/README.md)。 | 可替换的 sidecar 槽位。**只挂在 CODE 路径**（codex→gateway→new-api）。 |
| `codex-upstream/` | **CODE 引擎**：codex 内核本地克隆（**gitignored，不入库**），编译产物即黑盒进程。 | 当黑盒用，锁定 `da4c8ca`（2026-07-02；含安全修复 quick-xml DoS + multi-agent v2 改进）。只读、不改循环。用 `scripts/fetch-references.sh` 克隆。 |
| `hermes-upstream/` | **WORK 引擎**：Hermes Agent 本地克隆（**gitignored，不入库**），HTTP `/v1` 接缝黑盒纳管。 | 当黑盒用，锁定 v2026.7.1 (`7c1a029`，2026-07-01，MOA+self-verification+Windows原生支持)。可借其 Desktop MIT React 组件（摘零件抄进来，不 fork 整个 Desktop）。零翻译直入 new-api（Chat Completions）。 |
| `plugins/` `workbenches/` | 能力封装：skills/AGENTS.md/模板/工作台内容，纯 Markdown 零编译。各自的产品概念→技术落地映射见 [plugins/README.md](plugins/README.md)、[workbenches/README.md](workbenches/README.md)。 | MVP `office-agent` / OfficeCLI 已有骨架；市场化插件/更多垂类待落地。 |
| `.specs/` | 轻量 living spec：跨层功能的 requirements/design/tasks/decisions/verification。当前已有 001–007（见下「Living Spec 纪律」索引）。 | 只给大功能/架构功能建，随实现同步更新。 |

仓库托管在 `goodbyeri-studio/BlackRain`（私有）。**双引擎架构**：codex（CODE，开发者）+ Hermes（WORK，办公非开发者），详见 [.specs/003](.specs/003-dual-engine-architecture/)。

## 文档导航（改代码前先查）

| 查什么 | 去哪看 |
|---|---|
| 双引擎架构（WORK/CODE 分工、数据流、兼容策略） | [`.specs/003-dual-engine-architecture/`](.specs/003-dual-engine-architecture/) |
| 双引擎能力底账（Hermes / codex 逐文件源码核查） | [hermes-capability-ledger.md](.specs/003-dual-engine-architecture/hermes-capability-ledger.md)、[codex-capability-ledger.md](.specs/003-dual-engine-architecture/codex-capability-ledger.md) |
| CODE 模式边界（复刻 codex-app 上限与当前进度） | [code-mode-boundary.md](.specs/003-dual-engine-architecture/code-mode-boundary.md) |
| 壳内部详细架构（前后端分层、IPC 路由、import 别名、hotspots） | [`apps/desktop/AGENTS.md`](apps/desktop/AGENTS.md) |
| 任务导向文件映射（改 X 就动 Y） | [`apps/desktop/docs/codebase-map.md`](apps/desktop/docs/codebase-map.md) |
| 产品愿景、架构、模型路由、护城河 | [`docs/01`](docs/01-产品愿景.md)–[`docs/09`](docs/09-运行时架构与里程碑.md) |
| 可复制命令速查 | [`docs/commands.md`](docs/commands.md) |
| 上游引擎克隆指南（codex/Hermes 锁定版本） | [`docs/REFERENCES.md`](docs/REFERENCES.md) |
| 协作流程、License 红线、密钥管理 | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

**改 `apps/desktop/**` 前必读** [`apps/desktop/AGENTS.md`](apps/desktop/AGENTS.md)，它定义了：
- 后端双运行时（App 进程 vs Daemon 进程）与共享核心 `src/shared/*` 规则
- 前端状态编排、IPC 包装、事件扇出的约束
- Thread 层级不变量、follow-up 行为映射、设计系统规则
- 热点文件清单与验证矩阵

## 跨 Agent 协作

Claude Code 可以调用本机 `codex` / 其他本地 CLI 作为协作开发/审查助手；反向地，Codex 也可以调用本机 `claude` CLI 做文档核查、代码审查、迁移方案对照、测试失败归因。调用前必须先明确任务边界，不把密钥、未脱敏日志或不该出仓库的私有上下文交给子进程。

硬约束：Codex 调用 Claude CLI 时必须显式指定 **Sonnet 5 1M** 模型与 `--effort max`，不得省略 effort 或降级。默认使用非交互 `-p/--print` 形式，例如：

```bash
claude -p --model sonnet5-1m --effort max "<具体任务>"
```

若本机 CLI 的模型别名不同，先用 `claude --help` 或团队已确认的别名校正，但仍必须满足「Sonnet 5 1M + max effort」。外部 agent 输出只能作为辅助意见；最终改动、验证和风险判断由当前 agent 负责。

**协作场景示例**：
- 文档一致性核查：让另一个 agent 交叉验证文档间的矛盾
- 代码审查第二意见：对关键架构变更获取独立视角
- 大规模重构方案对照：并行探索不同技术路线
- 测试失败根因分析：多角度诊断复杂问题

## Living Spec 纪律

- 触发条件：跨两层以上、改变运行时边界、形成用户可感知新流程、需要多 PR/多人接手、或依赖易漂移假设（上游协议/模型能力/合规/安全）的功能，必须在 `.specs/<NNN-slug>/` 建 spec。
- 模板：复制 `.specs/_template/`，保留 `requirements.md`、`design.md`、`tasks.md`、`decisions.md`、`verification.md` 五个文件。
- 更新规则：代码、配置、脚本或 UI 改变了功能行为，就在同一个 PR 更新对应 spec；验证命令和真实结果写进 `verification.md`，关键取舍写进 `decisions.md`。
- 不滥用：文案、样式、小 bug、局部重构、只补测试，可以不建 spec；已有 spec 覆盖时只更新对应任务和验证。
- 文档位置纪律：做某个任务时的实现计划/检查清单/技术评估，放对应 `.specs/<功能>/` 或 `.scratch/`，**不要新增 `docs/` 顶层文件**——`docs/` 只收战略/架构专题与长期运行手册（详见 [docs/README.md](docs/README.md)「去哪里写」）。
- 冲突处理：总体战略以 `README.md` 与 `docs/01`~`docs/09` 为准；单功能执行以对应 spec 为准。若冲突，不要静默选择一边，必须修正文档或在 `decisions.md` 标明待决。

**现有 spec 索引（动 `apps/desktop/**` 或运行时边界前，先查相关 spec）：**

| spec | 覆盖 | 关键附加文档 |
|---|---|---|
| [001 providers-model-gateway](.specs/001-providers-model-gateway/) | M1 主线：模型网关设置页、专属 `CODEX_HOME` 写入、Gateway sidecar、对话模型选择器 | — |
| [002 accounts-credits](.specs/002-accounts-credits/) | M-A 主线：账号体系、Free/Plus/Pro 三档、credit 计量、服务端代理、BYOK 锁 Plus | — |
| [003 dual-engine-architecture](.specs/003-dual-engine-architecture/) | 定稿双引擎（WORK/CODE）选型与接法；**CODE 模式边界的真源** | [code-mode-boundary.md](.specs/003-dual-engine-architecture/code-mode-boundary.md)、[codex-capability-ledger.md](.specs/003-dual-engine-architecture/codex-capability-ledger.md)、[hermes-capability-ledger.md](.specs/003-dual-engine-architecture/hermes-capability-ledger.md) |
| [004 plugin-catalog](.specs/004-plugin-catalog/) | 插件目录两层模型、~34 打包单元（终局参考，MVP 不全做） | — |
| [005 gui-redesign](.specs/005-gui-redesign/) | 以 Codex app 为视觉范本，把 BlackRain GUI 对齐到商业级（token 表 + 逐界面清单） | [codex-ui-copy-checklist.md](.specs/005-gui-redesign/codex-ui-copy-checklist.md) |
| [006 code-mode-capability-wiring](.specs/006-code-mode-capability-wiring/) | 把 codex-rs「可用」能力全量接入并暴露到壳，为 GUI 像素级复刻铺路 | [capability-gui-mapping.md](.specs/006-code-mode-capability-wiring/capability-gui-mapping.md) |
| [007 windows-client](.specs/007-windows-client/) | **当前优先级**:MVP 仅 Windows(macOS 推迟 post-MVP),dev-client.ps1 + NSIS 打包 + Windows 验证矩阵 | — |

## 常用命令

> **平台(2026-06-30 决策)**:MVP 仅发行 Windows;macOS 推迟 post-MVP(代码保留作历史资产,不在 CI 跑、不在用户文档列、不主动验证)。下方命令以 Windows 为主;macOS 段标 post-MVP 参考,知道当前不交付。

### 核心开发工作流（最常见操作）

```powershell
# 1. 克隆双引擎（首次设置）
./scripts/fetch-references.sh   # 克隆 codex-upstream + hermes-upstream

# 2. 编译内核（首次约 12 分钟，之后增量 1-3 分钟）
cd codex-upstream\codex-rs
$env:CARGO_NET_GIT_FETCH_WITH_CLI = "true"
cargo build -p codex-cli --bin codex
cd ..\..

# 3. 安装壳依赖（首次）
cd apps\desktop
npm install
cd ..\..

# 4. 启动开发环境
pwsh scripts/dev-client.ps1

# 5. 提交前验证
cd apps\desktop
npm run typecheck && npm run test && npm run lint
cd src-tauri && cargo check
```

### 首次设置（Windows）

```powershell
# 1. 复制 .env 模板并填 API key
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY

# 2. 安装必需工具
winget install Kitware.CMake LLVM.LLVM
# 或 choco install cmake llvm

# 3. 克隆双引擎（codex-upstream + hermes-upstream）
./scripts/fetch-references.sh   # 或手动按 docs/REFERENCES.md 克隆

# 4. 编译 codex 内核（首次约 12 分钟）
cd codex-upstream\codex-rs
$env:CARGO_NET_GIT_FETCH_WITH_CLI = "true"
cargo build -p codex-cli --bin codex
cargo build -p codex-app-server
cd ..\..

# 5. Hermes 环境（Python，当前 spike 探路阶段）
# 详见 .specs/003-dual-engine-architecture/hermes-capability-ledger.md

# 6. 安装壳依赖
cd apps\desktop
npm install
cd ..\..
```

### 日常开发（Windows，最常用）

```powershell
# 一键启动客户端（加载 .env → 内核入 PATH → 准备 CODEX_HOME → 起网关 → tauri dev:win）
pwsh scripts/dev-client.ps1

# 指定模型（默认 deepseek-v4-flash）
$env:DEV_MODEL = "deepseek-v4-pro"; pwsh scripts/dev-client.ps1

# Ctrl-C 退出会自动停网关
```

⚠️ `tauri dev:win` 会开 GUI 窗口,须在有显示器的本机跑(非 SSH/无头)。

### 日常开发（macOS/Linux，post-MVP 参考）

```bash
# 一键启动客户端
./scripts/dev-client.sh

# 指定模型
DEV_MODEL=deepseek-v4-pro ./scripts/dev-client.sh
```

### 提交前验证（改什么跑什么）

```powershell
cd apps\desktop

# 始终先跑（= tsc --noEmit），任何改动都要通过
npm run typecheck

# 改前端行为/状态/hooks/组件后跑
npm run test
npm run test -- <path-to-test-file>    # 单测试文件

# 改共享 chrome/弹层后跑（DS 守卫规则在 eslint 配置里）
npm run lint                             # = npm run lint:ds
npm run codemod:ds:dry                   # 预览 DS 收敛改写（去掉 :dry 实跑）

# 改 Rust 后端后跑
cd src-tauri
cargo check
cd ..
```

**通用验证顺序**（推荐流程）：
1. `npm run typecheck` — 所有改动必过（TypeScript 类型检查）
2. `npm run test` — 前端行为改动时（Vitest 单元测试）
3. `cd src-tauri && cargo check` — Rust 改动时（Rust 编译检查）
4. `npm run lint` — 共享 UI 改动时（设计系统规则守卫）

### 内核增量重构建（内核代码更新后，约 1-3 分钟）

```powershell
cd codex-upstream\codex-rs
$env:CARGO_NET_GIT_FETCH_WITH_CLI = "true"
cargo build -p codex-cli --bin codex
cargo build -p codex-app-server
```

常见坑（Windows）：
- ① `winget install Kitware.CMake LLVM.LLVM`（whisper-rs 需要 cmake 和 LLVM，doctor.mjs 会预检）
- ② 缺 `LIBCLANG_PATH` 时手动设：`$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"`
- ③ whisper-rs 0.12 + LLVM 22 已绕过（Cargo.toml 把它守卫成非 Windows，Windows dictation 走 stub）

### 打包发布（Windows）

```powershell
cd apps\desktop
npm run tauri:build:win      # → src-tauri\target\release\bundle\nsis\*.exe
```

### 模型网关（单独调试）

```bash
# PowerShell/bash 共用（bash 语法示例）
export DEEPSEEK_API_KEY=$(grep DEEPSEEK_API_KEY .env | cut -d= -f2)
python3 gateway/gateway.py   # 监听 127.0.0.1:8899

# 可选环境变量：
#   GW_PORT=8899
#   STRIP_TOOLS=0(允许多轮工具调用)/1(剥工具逼纯文本)
#   GW_LOG=/tmp/gateway.log
```

### 协议探针（验证壳⇄内核兼容，脚本在 gitignored 的 .scratch/）

```bash
BIN="$PWD/codex-upstream/codex-rs/target/debug/codex-app-server"
python3 .scratch/m0_protocol_probe.py "$BIN" <CODEX_HOME> <工作区>   # 四探针
python3 .scratch/m0_tool_driver.py "$BIN" <CODEX_HOME> <工作区>      # 多轮工具调用
```

### macOS / Linux（post-MVP 参考，当前不交付）

```bash
# 一键启动客户端
./scripts/dev-client.sh
DEV_MODEL=deepseek-v4-pro ./scripts/dev-client.sh

# 内核构建
cd codex-upstream/codex-rs
export CARGO_NET_GIT_FETCH_WITH_CLI=true
cargo build -p codex-cli --bin codex
cargo build -p codex-app-server

# 前端验证（同 Windows，跨平台共享）
cd apps/desktop
npm run doctor:strict
npm run typecheck
npm run test
npm run lint
cd src-tauri && cargo check

# 启动完整客户端
npm run tauri:dev        # macOS/Linux 完整启动(含 doctor:strict)

# 打包
npm run tauri:build      # dmg/app/AppImage
```

## 壳内部架构（改 `apps/desktop/**` 前的前提）

外层把整个桌面 App 当「监工」，但**壳自己的后端是双运行时**——理解这点才不会写出重复逻辑：

```
src-tauri/
  ├─ src/lib.rs                         App 进程：Tauri command 注册表（桌面本地用）
  ├─ src/bin/codex_monitor_daemon.rs    Daemon 进程：JSON-RPC 服务（远程后端用，见 apps/desktop/REMOTE_BACKEND_POC.md）
  └─ src/shared/*                       唯一真源：跨运行时的领域逻辑（workspaces_core / git_ui_core …）
```

**铁律：领域逻辑先落 `src/shared/*`，App 与 Daemon 都只做薄适配器，禁止两边复制。** 加一个后端命令要按链路全改：`shared/*`（跨运行时核心）→ `lib.rs`（App 命令面）→ `src/services/tauri.ts`（前端 IPC 包装）→ `daemon .../rpc.rs`（Daemon RPC 面），并补测试。前端则 `App.tsx` 只做装配，状态编排进 `src/features/app/{hooks,bootstrap,orchestration}/*`，Tauri 调用只走 `src/services/tauri.ts`，事件扇出只走 `src/services/events.ts`；import 一律用别名（`@/* @app/* @settings/* @threads/* @services/* @utils/*`）。

**接一个 codex-rs 内核能力（CODE 模式主线，spec 006）走专用 5 层链路**，以 `archive_thread` 为已读真实范例：`shared/codex_core.rs`（核心 RPC 发起）→ `src/codex/mod.rs`（App 命令，带 `remote_backend` 分支）→ `lib.rs`（`invoke_handler` 注册）→ `src/services/tauri.ts`（前端 IPC 包装）→ daemon 两处（`codex_monitor_daemon.rs` state 方法 + `rpc/codex.rs` 分发）。任务导向的「要改 X 就动 Y」全量映射见 [apps/desktop/docs/codebase-map.md](apps/desktop/docs/codebase-map.md)。

**共享外壳 chrome 必须复用 design-system 原语/token**，别在 feature CSS 里重造 modal/toast/panel/popover——有 `npm run lint:ds` 与 `codemod:ds` 守这条线。`App.tsx`、`SettingsView.tsx`、`useThreadsReducer.ts`、`git_ui_core.rs`、`workspaces_core.rs`、`rpc.rs` 是高频高复杂度热点，改动加倍小心。

## 第三方 License 红线（闭源商业 B2B，全员遵守）

> **MIT / Apache-2.0 → 可进仓库、可借代码（保留 NOTICE 署名）。
> AGPL / GPL / BSL / 无许可证 → 只能看架构、自己重写；绝不进仓库、绝不复制源码、绝不 fork 到组织账号。**

AGPL/GPL 有传染性，进了产品会要求整个 SaaS 开源，摧毁商业模式。参考类（AGPL/GPL）项目放在**仓库外、产品目录外**（约定 `~/Projects/refs/`），照着重写不照抄。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 协作流程（GitHub Flow）

- `main` 永远可用，**绝不直接 push**，一切走 PR。从 `main` 切短命分支：`<type>/<短描述>`（type ∈ feat/fix/docs/refactor/chore/test）。
- 提交信息用 Conventional Commits 轻量版：`<type>: <一句话>`。
- 合并需 1 approve + CI 绿，用 **Squash 合并**（仓库已配死，禁 merge/rebase commit）+ 合并后删分支。
- ⚠️ GitHub Free 私有库**配不了分支保护**，禁直推 main 靠口头约束。

回复、写文档与代码注释默认用中文（与现有代码库一致）。

## 常见问题（troubleshooting）

| 问题 | 解决 |
|---|---|
| `codex.exe` 找不到 | 确保已编译内核：`cd codex-upstream\codex-rs; cargo build -p codex-cli --bin codex`；确保 `dev-client.ps1` 成功把内核加入 PATH |
| codex-upstream / hermes-upstream 不存在 | 运行 `./scripts/fetch-references.sh` 或按 [docs/REFERENCES.md](docs/REFERENCES.md) 手动克隆双引擎 |
| whisper-rs / bindgen 编译错误（Windows） | 安装 LLVM：`winget install LLVM.LLVM`；设 `$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"`；已在 Windows 上绕过（Cargo.toml 守卫为非 Windows） |
| libgit2 SSL 握手失败 | 设 `$env:CARGO_NET_GIT_FETCH_WITH_CLI = "true"` 再 cargo build（dev-client.ps1 已内置） |
| `apps/desktop` 依赖未安装 | `cd apps\desktop; npm install` |
| `.env` 缺失或 key 为空 | `cp .env.example .env` 并填 `DEEPSEEK_API_KEY` |
| TypeScript 类型错误 | 先 `npm run typecheck`；检查 `src/types.ts` 与 `src-tauri/src/types.rs` 是否同步 |
| 设计系统冲突（重复 modal/toast） | `npm run codemod:ds:dry` 查看建议；`npm run codemod:ds` 自动收敛；手动复用 design-system 原语 |
| 改后端命令但前端调不到 | 检查 5 层链路：`shared/*` → `lib.rs` → `src/services/tauri.ts` → daemon `rpc.rs` + `rpc/*`；确保 Tauri command 在 `invoke_handler` 注册 |
| WORK 引擎 (Hermes) 相关问题 | 当前 spike 探路阶段，详见 [.specs/003](.specs/003-dual-engine-architecture/)；已知坑与处理见 [design.md 兼容策略](.specs/003-dual-engine-architecture/design.md) |
