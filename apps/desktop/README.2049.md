# apps/desktop —— BlackRain 集成约定

> `README.md`、`README.zh-CN.md` 与 `docs/index.html` / `docs/changelog.html` 是 CodexMonitor 上游原始材料，作为 subtree 同步资产保留，不代表 BlackRain 的产品范围、平台优先级或当前完成度。BlackRain 的真源顺序是仓库根 `README.md`、`docs/04-产品形态.md`、`docs/09-运行时架构与里程碑.md`、工作台包 spec 008 和对应 `.specs/*/verification.md`。

体验层（架构文档 [03](../../docs/03-系统架构.md) 第 ⑤ 层）的载体。这是我们**住在里面、持续魔改的底盘**，不是只读依赖。

- **上游**：[Dimillian/CodexMonitor](https://github.com/Dimillian/CodexMonitor)（MIT，Tauri2 + Rust + React19）
- **导入方式**：git subtree（`--squash`），见下「upstream 同步」
- **为什么是它**：开源里对官方 codex app 保真度最高的壳——走官方 `app-server` JSON-RPC 协议，diff/approval/会话渲染/文件树齐全。
- **内核集成**：子进程 + JSON-RPC（见 [03 系统架构](../../docs/03-系统架构.md) 的“集成方式”），内核不进本仓，在 gitignored 的 `codex-upstream/` 本地克隆。

## BlackRain 在这里长出来的改造（全在壳外围，不动保真核心）

- Providers 设置面板：管理 App/Gateway provider registry；Codex `config.toml` 只写固定 `blackrain_gateway` provider（base_url / wire_api / env_key）
  - 实读确认：上游 `src-tauri/src/shared/config_toml_core.rs` 已有 toml 读写骨架可复用；`backend/app_server.rs` 的 `spawn_workspace_session` 是注入 API key env 的点
- 接模型路由层：把 Codex provider 的 `base_url` 指向 App 托管的本地 HTTP 端点（例如 `http://127.0.0.1:8899/v1`）；翻译实现位于仓库根 `gateway/`
- 规划中的工作台货架、安装计划、权限预览和生命周期 UI（产品核心层；见 `.specs/008`，尚未实现）
- 插件管理 UI（工具能力层；尚未完成，以对应 spec verification 为准）

## 当前实现边界

- CODE 壳、模型网关、账号/credit、OfficeCLI runtime 和多项 codex RPC 接线已有实现。
- Office skill/workbench 当前同步到专属 `CODEX_HOME`，属于已接入的本地能力资源；这不等于 Office 已成为可安装工作台，也不等于 WORK/Hermes surface 已产品化。
- 工作台应成为用户第一入口，WORK/CODE 是进入工作台后的执行 surface；当前壳尚未完成该信息架构。
- Git 跟踪代码中尚无 Hermes 子进程纳管和 WORK/CODE 双 surface；对应产品化任务与验证见 `.specs/003-dual-engine-architecture/`。
- MVP 只发行 Windows；上游文档中的 macOS、Linux、iOS 路线均不构成 BlackRain 当前交付承诺。

## upstream 同步（subtree）

```bash
# 在仓库根执行。同步上游日更：
git subtree pull --prefix apps/desktop \
  https://github.com/Dimillian/CodexMonitor main --squash
```

日常编辑：直接改 `apps/desktop/**`，正常 `git commit` 即可，无需任何 subtree 特殊操作。
