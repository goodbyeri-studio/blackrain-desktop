# BlackRain 仓库协作规则

本文件与根 [AGENTS.md](AGENTS.md) 使用同一契约。若内容冲突，以 `AGENTS.md` 为准并在同一改动中同步本文件。

## 项目目标

- 唯一 agent 内核是原装开源 `codex-rs` / `codex app-server`。
- 产品 P0：将 CodexMonitor 衍生的 Tauri 壳完整迁移到 Electron，并交付 Windows 客户端；Browser 是产品发布回归能力。
- 并行源码底座线：把 Electron Browser 整理为适合其他 Electron Agent 二次开发的低耦合源码模块。
- 工作台、Session Orchestrator、专家市场和 OPC/工作室暂停。
- 不引入任何第二内核。

## 实施边界

- 产品形态以 `docs/04-产品形态.md` 为准。
- 运行时以 `docs/09-运行时架构与里程碑.md` 为准。
- BlackRain 产品交付 spec 是 `.specs/002-electron-migration/`。
- 可移植 Browser Runtime 源码底座 spec 是 `.specs/003-portable-electron-browser-runtime/`。
- 完整 Electron 迁移路线保留在 `docs/09-运行时架构与里程碑.md` 和 `docs/10-Electron迁移与内置浏览器实现计划.md`；两个 spec 并行但不共享完成状态。
- 当前代码仍是 Tauri；目标 Electron 拓扑不得冒充已实现状态。
- 保留 React UI；目标 Electron main 按 Codex App 架构直接启动并驱动原装 `codex app-server`，当前 Rust daemon/shared core 只作迁移输入并最终删除。
- 沿用 Codex 标准 Home 与 CLI 共享配置和 thread，不建立 BlackRain 专属 `CODEX_HOME`。
- Browser 网页不得获得 App preload、App Server transport 或任意系统权限。
- 不复制 OpenAI 闭源代码与专有资源。
- 修改 `apps/desktop/**` 前阅读 `apps/desktop/AGENTS.md`。

## 协作与验证

- 不调用、依赖或推荐本机 `claude` CLI。
- 保留用户无关改动，不 reset、覆盖或清理未授权文件。
- 当前命令见 `docs/commands.md`；Electron 命令只有实现存在后才能加入。
- Windows 实机是安装、Browser、权限、恢复和发布能力的最终验收环境。
- 使用短命分支、Conventional Commits、PR review、CI 绿和 Squash merge；禁止直接 push `main`。
- 回复、文档和代码注释默认使用中文。
