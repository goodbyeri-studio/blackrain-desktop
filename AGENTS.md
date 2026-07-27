# BlackRain 仓库协作规则

## 工具协作限制

- 不调用、依赖或推荐本机 `claude` CLI；开发、审查、调研、测试与文档治理由当前 agent 使用仓库工具和普通 Git 工作流完成。

## 项目定位

BlackRain 以 OpenAI 开源 `codex-rs` 为唯一 agent 内核，自行补齐完整桌面 Codex 产品需要的宿主能力，并尽可能对齐官方 Codex App 的核心功能与体验。

当前两个并列 P0：

1. 补齐 Codex App 宿主能力，首项是 in-app browser。
2. 将 CodexMonitor 衍生的 Tauri 壳完整迁移为 Electron。

工作台、Session Orchestrator、专家市场和 OPC/工作室均已暂停。不得把它们写成当前产品第一主语、当前里程碑或近期交付承诺。`2049 App` / `2049` 只允许出现在必须保留的历史兼容制品名中。

## 真源

- 产品形态：`docs/04-产品形态.md`
- 运行时架构：`docs/09-运行时架构与里程碑.md`
- Electron 迁移：`.specs/012-electron-shell-migration/`
- Codex App 能力补齐：`.specs/013-codex-app-capability-parity/`
- 当前完成度：对应 spec 的 `verification.md` 与实际代码
- 日常命令：`docs/commands.md`

发生冲突时必须在同一改动中修正文档；尚未收敛的决策写入对应 spec 的 `decisions.md`。

## 平台与运行时

MVP 仅发行 Windows。macOS / Linux 可以用于开发和快速验证，但不能替代 Windows 实机制品验收。

目标运行时：

```text
BlackRain（Electron）
  ├─ Main / Preload / React Renderer
  ├─ Codex 功能对齐的 in-app browser（main-owned WebContentsView/session/CDP）
  └─ Rust daemon
      ├─ 原装 codex app-server（唯一 agent 内核）
      ├─ 专属 CODEX_HOME/config.toml
      └─ 可选 Model Gateway sidecar
```

当前代码仍是 Tauri。文档和 PR 必须明确区分“当前 Tauri 实现”“迁移中的 Electron 代码”和“Electron 目标态”。

运行时规则：

1. `codex-rs` 保持原装黑盒，只读、只调用、不分叉。
2. 不得引入任何第二 agent runtime。
3. thread、事件、审批、停止、恢复和模型路径只能有一套真源。
4. App 使用应用数据目录内的专属 `CODEX_HOME`，不得修改用户已有的 `~/.codex`。
5. 协议翻译只存在于独立 Gateway 进程，不进入 UI、Electron main 或内核。
6. Browser 是宿主能力；任意网页不得获得 BlackRain preload、daemon token 或非必要系统权限。
7. 行为对齐 Codex App 不授权复制闭源代码、私有 bundle、图标 path、字体或其他专有资源。

## 仓库布局

| 目录 | 当前含义 | 纪律 |
|---|---|---|
| `apps/desktop/` | CodexMonitor 衍生的 Tauri 当前实现；Electron 迁移主战场 | 修改前读 `apps/desktop/AGENTS.md`；不随手 subtree pull |
| `gateway/` | 可选模型协议翻译原型 | 保持独立 sidecar |
| `codex-upstream/` | gitignored 的 codex 只读参考克隆 | 只锁版本、构建和验证，不改内核 |
| `plugins/` | 暂停路线留下的适配器，P0 按需复用 | 不扩建插件市场 |
| `workbenches/` | 暂停的工作台资产 | 冻结，不进入 P0 |
| `.specs/` | 跨层功能 living specs | 行为、边界或状态变化时同步更新 |

## Living Spec

跨两层以上、改变运行时边界、形成用户可感知新流程、需要多 PR 接手或依赖易漂移假设的功能必须建立 spec。复制 `.specs/_template/`，保留 requirements/design/tasks/decisions/verification 五个文件。

Electron 宿主改动归 012；Codex App 能力矩阵与 in-app browser 归 013。现有 005/006 可继续记录 GUI 与 app-server 能力接线，但不得覆盖 012/013 的宿主边界。

## 桌面架构纪律

修改 `apps/desktop/**` 前必须读 `apps/desktop/AGENTS.md`。

- React renderer 只负责展示和前端状态。
- Electron main 负责窗口、权限、Browser、更新和 daemon 生命周期。
- preload 只暴露类型化 allowlist，不暴露原始 IPC 或 Node.js。
- 跨宿主领域逻辑继续放 Rust daemon/shared core。
- Browser `WebContentsView` 只由 main 创建和持有；renderer 只上报经过校验的 bounds、visibility、active tab 和 UI 遮挡状态。
- main 必须校验 route、thread、window、view generation 和 profile ownership，并强制页面 WebContents 安全参数。
- Codex App 的可观察 Browser 行为与控制面是第一实现基线；ClawX、Hermes 等项目只补充通用 Electron 工程经验。
- 迁移期兼容层必须带删除任务，不建立永久 Tauri/Electron 分叉。
- 事件扇出保持单一入口；Browser 事件也必须标准化后进入 UI。

## License

Desktop/Cloud 是闭源商业项目：

- MIT / Apache-2.0：可进入仓库，保留 NOTICE 和署名。
- AGPL / GPL / BSL / 无许可证：不得进入 Desktop/Cloud 私有仓库。
- 独立公开的 MeiMei API 可按其许可证履责，该例外不扩散到本仓。
- OpenAI 闭源客户端只作为产品行为参考，不复制其闭源实现或资源。

## 验证与 Git

当前 Tauri 基线命令仍按 `docs/commands.md` 执行。Electron 建立后，必须补 main/preload 单测、Playwright Electron E2E、Rust daemon 集成测试和 Windows 安装矩阵。

Windows 浏览器登录、权限、下载、崩溃恢复、安装、升级和卸载必须实机验证。CI 或 macOS smoke 不能替代产品验收。

`main` 永远可用且禁止直接 push。使用 `<type>/<短描述>` 短命分支、Conventional Commits、1 approve + CI 绿、Squash 合并并删除分支。

回复、文档和代码注释默认使用中文。
