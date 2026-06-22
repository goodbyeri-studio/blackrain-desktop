# apps/desktop —— 2049 集成笔记

> 上游自带的 `README.md` 是 CodexMonitor 的原始说明，保持不动。本文件是 2049 侧的集成约定。

体验层（架构文档 [03](../../docs/03-系统架构.md) 第 ④ 层）的载体。这是我们**住在里面、持续魔改的底盘**，不是只读依赖。

- **上游**：[Dimillian/CodexMonitor](https://github.com/Dimillian/CodexMonitor)（MIT，Tauri2 + Rust + React19）
- **导入方式**：git subtree（`--squash`），见下「upstream 同步」
- **为什么是它**：开源里对官方 codex app 保真度最高的壳——走官方 `app-server` JSON-RPC 协议，diff/approval/会话渲染/文件树齐全。
- **内核集成**：子进程 + JSON-RPC（架构 03 第 38-47 行），内核不进本仓，在 gitignored 的 `codex-upstream/` 本地克隆。

## 我们在这里长出来的魔改（全在壳外围，不动保真核心）

- Providers 设置面板：往 codex `config.toml` 写 `[model_providers.*]`（base_url / wire_api / env_key）
  - 实读确认：上游 `src-tauri/src/shared/config_toml_core.rs` 已有 toml 读写骨架可复用；`backend/app_server.rs` 的 `spawn_workspace_session` 是注入 API key env 的点
- 接模型路由层：把 base_url 指向 `../../gateway/`（responses⇄chat 翻译）
- 工作台界面、插件管理 UI（体验层 / 能力封装层）

## upstream 同步（subtree）

```bash
# 在仓库根执行。同步上游日更：
git subtree pull --prefix apps/desktop \
  https://github.com/Dimillian/CodexMonitor main --squash
```

日常编辑：直接改 `apps/desktop/**`，正常 `git commit` 即可，无需任何 subtree 特殊操作。
