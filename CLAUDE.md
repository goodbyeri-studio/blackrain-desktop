# BlackRain 仓库协作规则

## 工具协作限制

- 不调用、依赖或推荐本机 `claude` CLI；开发、审查、调研、测试与文档治理由当前 agent 使用仓库工具和普通 Git 工作流完成。

## 项目定位

BlackRain 是 AI 驱动的垂类工作环境平台：把领域工具、环境、方法和验证封装成普通人可以安装的工作台。平台不修改 agent 内核，自有资产位于工作台包、环境复现、垂类验证和专家供给层。

`2049 App` / `2049` 仅允许出现在尚未迁移且必须保留的制品名中。文档默认描述当前状态，不保留废弃方案或迁移历史。

## 真源

- 产品形态：`docs/04-产品形态.md`
- 运行时架构：`docs/09-运行时架构与里程碑.md`
- 工作台包生命周期：`.specs/008-expert-workbench-package/`
- 工作台会话编排：`.specs/011-workbench-session-orchestration/`
- 当前完成度：对应 spec 的 `verification.md` 与实际代码
- 日常命令：`docs/commands.md`

发生冲突时必须修正文档；决策未收敛时写入对应 spec 的 `decisions.md`。

## 平台与运行时

MVP 仅发行 Windows。macOS / iOS 属于 post-MVP 或上游资产，不进入当前发布矩阵，也不能替代 Windows 实机验收。

桌面 App 是工作台 Core、统一会话编排器、双 surface 和唯一配置写入者：

```text
BlackRain（Tauri）
  ├─ 工作台包生命周期
  ├─ Session Orchestrator（已验证激活记录 -> 受控会话）
  ├─ 工作台 surface / CODE surface
  ├─ codex 内核（唯一原装黑盒，app-server JSON-RPC）
  │   └─ 专属 CODEX_HOME/config.toml
  └─ 模型网关（Responses -> Chat Completions）
      └─ new-api 计量 -> 模型提供商
```

运行时规则：

1. codex 内核保持原装黑盒，只读、只调用，不分叉。
2. 两种 surface 共享同一 codex thread、事件、审批、恢复和模型路径，不形成运行时分叉。
3. 协议翻译只存在于独立模型网关进程。
4. App 使用应用数据目录内的专属 `CODEX_HOME`，不得修改用户已有的 `~/.codex`。
5. 工作台必须声明依赖、权限、来源、License、安装、验证、升级和卸载，不得成为第二个配置写入者。
6. 激活后的任务执行必须经 Session Orchestrator 消费已验证激活记录；当前该层尚未实现，不得宣称工作台任务已可运行。

## 仓库布局

| 目录 | 内容 | 纪律 |
|---|---|---|
| `apps/desktop/` | Tauri 桌面壳，subtree 自 CodexMonitor（MIT） | 日常直接改；不随手执行 subtree pull |
| `gateway/` | CODE 协议翻译网关原型 | 独立 sidecar，不把翻译逻辑写进 UI 或内核 |
| `codex-upstream/` | gitignored 的 codex 只读参考克隆 | 锁定版本由 `scripts/fetch-references.sh` 校验 |
| `plugins/` | 工具、数据源和软件适配器 | 声明来源、License、权限和验证 |
| `workbenches/` | 专家工作台包 | 遵守 spec 008 生命周期 |
| `.specs/` | 跨层功能 living spec | 行为变化时同步更新 |

本仓为私有 `goodbyeri-studio/blackrain-desktop`。Cloud 和公开 Relay 的边界以 `.specs/010-three-project-platform/` 为准。

## Living Spec

跨两层以上、改变运行时边界、形成用户可感知新流程、需要多 PR 接手或依赖易漂移假设的功能必须建立 spec。复制 `.specs/_template/`，保留 requirements/design/tasks/decisions/verification 五个文件。

文案、样式、小 bug、局部重构和只补测试可以不建 spec。已有 spec 覆盖时只更新对应 spec。

## 桌面壳架构

修改 `apps/desktop/**` 前必须读 `apps/desktop/AGENTS.md`。

```text
src-tauri/
  ├─ src/lib.rs                  Tauri App 命令注册
  ├─ src/bin/blackrain_daemon.rs Daemon JSON-RPC
  └─ src/shared/*                跨运行时领域逻辑真源
```

领域逻辑先落 `src/shared/*`，App 与 Daemon 只做薄适配器。新增后端命令按 shared core -> App command -> `src/services/tauri.ts` -> Daemon RPC 全链路接线并补测试。

前端 `App.tsx` 只做装配；状态编排放 `src/features/app/{hooks,bootstrap,orchestration}/*`；Tauri 调用只走 `src/services/tauri.ts`；事件扇出只走 `src/services/events.ts`；import 使用既有别名。

共享外壳 chrome 必须复用 design-system 原语和 token。热点文件包括 `App.tsx`、`SettingsView.tsx`、`useThreadsReducer.ts`、`git_ui_core.rs`、`workspaces_core.rs` 和 `rpc.rs`。

## License

Desktop/Cloud 是闭源商业项目：

- MIT / Apache-2.0：可进入仓库，保留 NOTICE 和署名。
- AGPL / GPL / BSL / 无许可证：不得进入 Desktop/Cloud 私有仓库。
- 独立公开的 Relay 可按其许可证完整履责，该例外不扩散到本仓。

## 验证与 Git

前端/Rust 基线包括 `npm run typecheck`、`npm run test`、`npm run lint`、`npm run lint:ds`、`npm run codemod:ds:dry` 与 `cargo check`，工作目录和顺序见 `docs/commands.md`。

Windows 环境、NSIS、Credential Manager、真实对话、Office 自动化及安装/卸载必须在 Windows 实机验证。CI 不能替代产品验收。

`main` 永远可用且禁止直接 push。使用 `<type>/<短描述>` 短命分支、Conventional Commits、1 approve + CI 绿、Squash 合并并删除分支。

回复、文档和代码注释默认使用中文。
