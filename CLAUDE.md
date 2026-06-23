# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目本质

2049 App 是**用国产大模型驱动、面向非开发者的中国版 Codex**。它不重写 agent 引擎，而是**复用 openai/codex 内核**（黑盒、原装），换掉模型（国产）、换掉外壳（普通人能用），再加「工作台/插件/市场」让懂业务的人也能造和卖能力。

文档以 `docs/01`~`docs/09` + `README.md` 为权威；战略细节查那里，本文件只讲跨多文件才能理解的架构与命令。

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
| `gateway/` | responses⇄chat 翻译网关（`gateway.py`，纯 stdlib 零依赖）。**可行性验证原型，非生产代码**。 | 可替换的 sidecar 槽位。 |
| `codex-upstream/` | codex 内核本地克隆（**gitignored，不入库**），编译产物即黑盒进程。 | 当黑盒用，钉死 commit `51b3cd5`。只读、不改循环。用 `scripts/fetch-references.sh` 克隆。 |
| `plugins/` `workbenches/` | 能力封装：放进 `CODEX_HOME` 的文件（skills/AGENTS.md/模板，纯 Markdown）。 | 还是待落地槽位。 |

仓库托管在 `goodbyeri-studio/BlackRain`（私有）。`apps/desktop/AGENTS.md` 是壳内部的详细 agent 契约（前后端分层、IPC 路由、import 别名、hotspots），改 `apps/desktop/**` 时**必读**。

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
cd src-tauri && cargo check                      # 改 Rust 后端后跑
npm run tauri:dev                                # 含 doctor:strict 环境自检的完整启动
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

