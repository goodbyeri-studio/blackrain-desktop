# BlackRain

BlackRain 是一款以 OpenAI 开源 `codex-rs` 为唯一 agent 内核的桌面 AI 编程产品。项目自行补齐完整桌面 App 所需的闭源宿主能力，目标是在合法、可验证的边界内，尽可能对齐官方 Codex App 的核心功能和使用体验。

## 当前目标

两个并列 P0：

1. **Codex App 能力补齐**：建立开源内核与完整桌面产品之间的能力差距账本，首先交付 in-app browser，包括持久登录态、页面控制、用户接管、CDP、截图、下载、权限和恢复。
2. **Electron 壳迁移**：把 CodexMonitor 衍生的 Tauri 壳完整迁移到 Electron，保留 React 前端与 Rust daemon/shared core，不长期维护双宿主。

工作台、Session Orchestrator、专家市场和 OPC/工作室全部暂停，不进入当前 P0/P1 路线。已有代码与 specs 作为冻结资产保留，但不能再被描述为当前产品第一主语或近期交付目标。

## 唯一内核

```text
BlackRain Electron（目标态）
  ├─ Main：窗口、Browser WebContentsView/registry/CDP、权限、更新、daemon supervisor
  ├─ Preload：类型化最小权限 IPC
  ├─ Renderer：Codex App 风格的 React 产品界面和 Browser sidebar controls
  └─ Rust daemon
      ├─ 原装 codex app-server / codex-rs
      ├─ App 专属 CODEX_HOME
      └─ Model Gateway（需要非 Responses 模型时）
```

运行时只允许一套 agent thread、事件、审批、停止和恢复路径。不得引入任何第二 agent 内核；不得把宿主能力写成内核 fork。

## 当前实现

当前 checkout 仍是 Tauri + React + Rust，来源于 CodexMonitor subtree。它已经包含 CODE 界面、app-server 接缝、daemon/shared core 和模型网关原型，但 **Electron 工程与 in-app browser 尚未实现**。目标架构、代码存在、运行验证和发布可用必须分开陈述。

## 仓库

```text
apps/desktop/      当前 Tauri 实现；将迁移为 Electron 桌面客户端
gateway/           可选模型协议翻译 sidecar
codex-upstream/    gitignored 的 codex 只读参考克隆
plugins/           冻结/按需复用的工具适配器
workbenches/       暂停的工作台资产
.specs/            跨层功能 living specs
docs/              产品、架构与运行手册
```

## 真源

- 产品形态：[docs/04-产品形态.md](docs/04-产品形态.md)
- 运行时与里程碑：[docs/09-运行时架构与里程碑.md](docs/09-运行时架构与里程碑.md)
- Electron 与 Browser 实施计划：[docs/10-Electron迁移与内置浏览器实现计划.md](docs/10-Electron迁移与内置浏览器实现计划.md)
- Electron 迁移：[.specs/012-electron-shell-migration/](.specs/012-electron-shell-migration/)
- Codex App 能力补齐与 Browser：[.specs/013-codex-app-capability-parity/](.specs/013-codex-app-capability-parity/)
- codex 能力接线：[.specs/006-code-mode-capability-wiring/](.specs/006-code-mode-capability-wiring/)
- 跨产品边界：[.specs/010-three-project-platform/](.specs/010-three-project-platform/)
- 日常命令：[docs/commands.md](docs/commands.md)

## 架构纪律

1. `codex-rs` / `codex app-server` 保持原装、只读、可跟随上游升级。
2. Electron 是唯一目标桌面宿主；Tauri 只是迁移起点。
3. React UI 与 Rust daemon/shared core 优先复用，领域逻辑不迁入 renderer。
4. App 只使用应用数据目录中的专属 `CODEX_HOME`，不污染用户 `~/.codex`。
5. Browser 高度对齐 Codex App 的共享 IAB 功能与控制面；main 创建并控制 `WebContentsView`、session 和 CDP，网页与 App 权限域严格隔离。
6. 不复制 OpenAI 闭源代码、私有 bundle 或专有资源；只对齐合法可观察的行为与体验。
7. 当前完成度只以实际代码和对应 `verification.md` 为准。

协作规则见 [AGENTS.md](AGENTS.md)，License 边界见 [CONTRIBUTING.md](CONTRIBUTING.md)。
