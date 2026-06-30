# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 项目本质

2049 App 是**用国产大模型驱动、面向非开发者的中国版 Codex**。它不重写 agent 引擎，而是**复用 openai/codex 内核**（黑盒、原装），换掉模型（国产）、换掉外壳（普通人能用），再加「工作台/插件/市场」让懂业务的人也能造和卖能力。

文档以 `README.md` + `docs/README.md` + `docs/01`~`docs/09` 为权威；战略细节查那里，本文件只讲跨多文件才能理解的架构与命令。跨层新功能还要看 `.specs/` 下对应的 living spec；没有时按下方规则创建。

## 运行时拓扑（理解一切的前提）

桌面 App 是一个**监工**，看管两个长期运行的子进程：

```
2049 App（Tauri，fork 自 CodexMonitor）= 监工 + 唯一写配置的人
  ├─ 子进程：codex 内核（原装黑盒，走 app-server JSON-RPC 协议驱动）
  │     └─ 读 config.toml → 按 base_url 决定连官方 or 连网关
  └─ 子进程：模型网关（responses⇄chat 翻译，仅接国产模型时启动）
        └─ 翻译后 HTTP → DeepSeek / GLM / Qwen / Kimi ...
```

**三条铁律（违反即破坏架构）：**
1. **内核永远原装**——接国产、防协议废弃、品牌化，没有一件需要改 agent 循环。改了就丢掉「白嫖上游日更」的能力。
2. **最难的活（responses⇄chat 翻译）锁在可替换的网关进程里**——它崩不拖垮界面，它常改不碰别人。
3. **App 是唯一写配置的人，且用专属 `CODEX_HOME`**（藏在 app 数据目录），绝不碰用户机器原有的 `~/.codex`。

**网关是硬依赖，不是可选件。** 上游已删除 `wire_api="chat"`（内核硬拒该值），内核只发 Responses 协议而国产模型只懂 Chat Completions，中间**必须**有翻译。详见 [docs/09](docs/09-运行时架构与里程碑.md)、[gateway/README.md](gateway/README.md)。

## 仓库布局：三种代码，三种纪律

| 目录 | 是什么 | 纪律 |
|---|---|---|
| `apps/desktop/` | 桌面壳，**git subtree** 自 CodexMonitor（MIT）。**住在里面、持续魔改的底盘**。 | 日常直接改 + 普通 commit。魔改只砸壳外围（Providers 面板、工作台 UI），**不动保真核心**。`git subtree pull` 是维护者动作，别随手做。 |
| `gateway/` | responses⇄chat 翻译网关（`gateway.py`，纯 stdlib 零依赖）。**可行性验证原型，非生产代码**；边界与命门约束见 [gateway/README.md](gateway/README.md)。 | 可替换的 sidecar 槽位。 |
| `codex-upstream/` | codex 内核本地克隆（**gitignored，不入库**），编译产物即黑盒进程。 | 当黑盒用，钉死 commit `cfead68`（2026-06-29；历经 `51b3cd5` → `bdd282f` → `cfead68`，2026-06-30 跟进上游，协议四探针 + 17 方法能力探针复测全绿）。只读、不改循环。用 `scripts/fetch-references.sh` 克隆。 |
| `plugins/` `workbenches/` | 能力封装：放进 `CODEX_HOME` 的文件（skills/AGENTS.md/模板/工作台内容，纯 Markdown 零编译）。各自的产品概念→技术落地映射见 [plugins/README.md](plugins/README.md)、[workbenches/README.md](workbenches/README.md)。 | 还是待落地槽位（README 已定边界，内容待填）。 |
| `.specs/` | 轻量 living spec：跨层功能的 requirements/design/tasks/decisions/verification。当前已有 001–006（见下「Living Spec 纪律」索引）。 | 只给大功能/架构功能建，随实现同步更新。 |

仓库托管在 `goodbyeri-studio/BlackRain`（私有）。`apps/desktop/AGENTS.md` 是壳内部的详细 agent 契约（前后端分层、IPC 路由、import 别名、hotspots），改 `apps/desktop/**` 时**必读**。

## Living Spec 纪律

- 触发条件：跨两层以上、改变运行时边界、形成用户可感知新流程、需要多 PR/多人接手、或依赖易漂移假设（上游协议/模型能力/合规/安全）的功能，必须在 `.specs/<NNN-slug>/` 建 spec。
- 模板：复制 `.specs/_template/`，保留 `requirements.md`、`design.md`、`tasks.md`、`decisions.md`、`verification.md` 五个文件。
- 更新规则：代码、配置、脚本或 UI 改变了功能行为，就在同一个 PR 更新对应 spec；验证命令和真实结果写进 `verification.md`，关键取舍写进 `decisions.md`。
- 不滥用：文案、样式、小 bug、局部重构、只补测试，可以不建 spec；已有 spec 覆盖时只更新对应任务和验证。
- 冲突处理：总体战略以 `README.md` 与 `docs/01`~`docs/09` 为准；单功能执行以对应 spec 为准。若冲突，不要静默选择一边，必须修正文档或在 `decisions.md` 标明待决。

**现有 spec 索引（动 `apps/desktop/**` 或运行时边界前，先查相关 spec）：**

| spec | 覆盖 | 关键附加文档 |
|---|---|---|
| [001 providers-model-gateway](.specs/001-providers-model-gateway/) | M1 主线：模型网关设置页、专属 `CODEX_HOME` 写入、Gateway sidecar、对话模型选择器 | — |
| [002 accounts-credits](.specs/002-accounts-credits/) | M-A 主线：账号体系、Free/Plus/Pro 三档、credit 计量、服务端代理、BYOK 锁 Plus | — |
| [003 dual-engine-architecture](.specs/003-dual-engine-architecture/) | 定稿双引擎（WORK/CODE）选型与接法；**CODE 模式边界的真源** | [code-mode-boundary.md](.specs/003-dual-engine-architecture/code-mode-boundary.md)、[codex-capability-ledger.md](.specs/003-dual-engine-architecture/codex-capability-ledger.md)、[hermes-capability-ledger.md](.specs/003-dual-engine-architecture/hermes-capability-ledger.md) |
| [004 plugin-catalog](.specs/004-plugin-catalog/) | 插件目录两层模型、~34 打包单元（终局参考，MVP 不全做） | — |
| [005 gui-redesign](.specs/005-gui-redesign/) | 以 Codex app 为视觉范本，把 BlackRain GUI 对齐到商业级（token 表 + 逐界面清单） | — |
| [006 code-mode-capability-wiring](.specs/006-code-mode-capability-wiring/) | **当前优先级**：把 codex-rs「可用」能力全量接入并暴露到壳，为 GUI 像素级复刻铺路 | [capability-gui-mapping.md](.specs/006-code-mode-capability-wiring/capability-gui-mapping.md) |

## 文档治理

- 文档地图看 `docs/README.md`；可复制命令只维护在 `docs/commands.md`。
- 新文档默认放 `docs/`、`.specs/` 或对应模块目录，不要随手新增根目录 Markdown。
- 同一事实只维护一处：状态写 `README.md`，战略/架构写 `docs/01`~`docs/09`，功能活文档写 `.specs/`，模块细节写模块 `README.md`。
- 文档默认记录当前真实状态；过期方案不要留在正文，确需保留时放到 spec 的 `decisions.md`。
- 根规则同步维护 `AGENTS.md` 与 `CLAUDE.md`，避免不同 agent 读到不同纪律。

### 壳内部架构（改 `apps/desktop/**` 前的前提）

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

## 常用命令

### 启动本地客户端（最常用）
```bash
./scripts/dev-client.sh                          # 一键：加载 .env → 内核入 PATH → 准备 CODEX_HOME → 起网关 → tauri dev
DEV_MODEL=deepseek-v4-pro ./scripts/dev-client.sh # 指定模型（默认 deepseek-v4-flash）
```
前提：① `cp .env.example .env` 填 `DEEPSEEK_API_KEY`；② 内核已编译；③ `cd apps/desktop && npm install`。
⚠️ `tauri dev` 会开 GUI 窗口，须在有显示器的本机跑（非 SSH/无头）。Ctrl-C 退出会自动停网关。

### 内核构建（首次约 12 分钟，之后增量很快）
```bash
cd codex-upstream/codex-rs
cargo build -p codex-cli --bin codex             # 壳需要的二进制 → target/debug/codex
cargo build -p codex-app-server                  # 仅协议调试用的精简二进制
```
两个常见坑：`export CARGO_NET_GIT_FETCH_WITH_CLI=true`（内置 libgit2 拉依赖会 SSL 握手失败，dev-client.sh 已内置）；`brew install cmake`（whisper-rs 语音输入构建需要）。

### 前端壳开发与验证（在 `apps/desktop/`）
```bash
npm run typecheck                                # 始终先跑（= tsc --noEmit）
npm run test                                     # vitest，改前端行为/状态/hooks/组件后跑
npm run test -- <path-to-test-file>              # 单测试文件
npm run lint                                     # eslint . --ext .ts,.tsx
npm run lint:ds                                  # 同 lint（DS 守卫规则在 eslint 配置里）；碰共享 chrome/弹层后跑
npm run codemod:ds:dry                            # 干跑预览 DS 收敛改写（modal/panel/toast → 共享 shell）；去掉 :dry 实跑
npm run doctor:strict                            # 单独跑环境自检（macOS/Linux），不起 GUI
cd src-tauri && cargo check                      # 改 Rust 后端后跑
npm run tauri:dev                                # 含 doctor:strict 环境自检的完整启动
npm run tauri:dev:win                            # Windows 变体（用 doctor:win + windows.conf.json）
```

### 模型网关（单独起，调试用）
```bash
export DEEPSEEK_API_KEY=$(grep DEEPSEEK_API_KEY .env | cut -d= -f2)
python3 gateway/gateway.py                       # 监听 127.0.0.1:8899
#   GW_PORT=8899  STRIP_TOOLS=0(允许多轮工具调用)/1(剥工具逼纯文本)  GW_LOG=/tmp/gateway.log
```

### 协议探针（验证壳⇄内核兼容，脚本在 gitignored 的 .scratch/）
```bash
BIN="$PWD/codex-upstream/codex-rs/target/debug/codex-app-server"
python3 .scratch/m0_protocol_probe.py "$BIN" <CODEX_HOME> <工作区>   # 四探针
python3 .scratch/m0_tool_driver.py "$BIN" <CODEX_HOME> <工作区>      # 多轮工具调用
```

## 协作流程（GitHub Flow）

- `main` 永远可用，**绝不直接 push**，一切走 PR。从 `main` 切短命分支：`<type>/<短描述>`（type ∈ feat/fix/docs/refactor/chore/test）。
- 提交信息用 Conventional Commits 轻量版：`<type>: <一句话>`。
- 合并需 1 approve + CI 绿，用 **Squash 合并**（仓库已配死，禁 merge/rebase commit）+ 合并后删分支。
- ⚠️ GitHub Free 私有库**配不了分支保护**，禁直推 main 靠口头约束。

回复、写文档与代码注释默认用中文（与现有代码库一致）。
