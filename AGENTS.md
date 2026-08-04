# BlackRain 仓库协作规则

## 工具协作限制

- 不调用、依赖或推荐本机 `claude` CLI；开发、审查、调研、测试与文档治理由当前 agent 使用仓库工具和普通 Git 工作流完成。

## 项目定位

BlackRain 以 OpenAI 开源 `codex-rs` 为唯一 agent 内核，自行补齐完整桌面 Codex 产品需要的宿主能力，并尽可能对齐官方 Codex App 的核心功能与体验。

唯一当前 P0 是完成 Tauri 到 Electron 的全量迁移、删除旧宿主并交付 Windows Electron 客户端。Browser P0 的 runtime/功能链路已闭环，后续作为 Electron 发布回归矩阵的一部分；不得用 Browser 已闭环推导 Electron 客户端已可发布。锁定 `codex-cli 0.146.0` 已通过标准 stdio MCP + BlackRain 随包 Node adapter 接入自有 Browser client；code-mode V8 不直接加载 Node 模块。dynamic tools 和 main 自加载 bridge 只保留测试/bootstrap，不得进入发布态第二路由。

工作台、Session Orchestrator、专家市场和 OPC/工作室均已暂停。不得把它们写成当前产品第一主语、当前里程碑或近期交付承诺。`2049 App` / `2049` 只允许出现在必须保留的历史兼容制品名中。

## 真源

- Electron 产品迁移与发布 spec：`.specs/002-electron-migration/`
- 可移植 Browser Runtime 源码底座 spec：`.specs/003-portable-electron-browser-runtime/`
- 产品形态：`docs/04-产品形态.md`
- 运行时架构：`docs/09-运行时架构与里程碑.md`
- 当前完成度：对应 spec 的 `verification.md` 与实际代码
- 日常命令：`docs/commands.md`

发生冲突时必须在同一改动中修正文档；尚未收敛的决策写入对应 spec 的 `decisions.md`。

## 平台与运行时

MVP 仅发行 Windows。macOS / Linux 可以用于开发和快速验证，但不能替代 Windows 实机制品验收。

目标运行时：

```text
BlackRain（Electron）
  ├─ Main
  │   ├─ App Server client / window / permissions / updates
  │   └─ spawn bundled codex.exe app-server（stdio JSONL）
  ├─ Preload / React Renderer
  ├─ Codex 功能对齐的 in-app browser（main-owned WebContentsView/session/CDP）
  ├─ 原装 codex.exe app-server（机器协议入口）
  │   ├─ codex-core（唯一 agent 内核）
  │   ├─ 标准 Codex Home：config/auth/sessions/rollout/SQLite
  │   └─ 按需启动 code-mode/MCP/sandbox helper
  └─ 可选 Model Gateway sidecar
```

当前代码仍是 Tauri。文档和 PR 必须明确区分“当前 Tauri 实现”“迁移中的 Electron 代码”和“Electron 目标态”。

运行时规则：

1. `codex-rs` 保持原装黑盒，只读、只调用、不分叉。
2. 不得引入任何第二 agent runtime。
3. thread、事件、审批、停止、恢复和模型路径只能有一套真源。
4. App 沿用 Codex 标准 Home 解析并与原生 CLI 共享配置、能力和可恢复 thread；不得再创建隐藏的 BlackRain 专属 `CODEX_HOME` 作为第二状态域。
5. 协议翻译只存在于独立 Gateway 进程，不进入 UI、Electron main 或内核。
6. Browser 是宿主能力；任意网页不得获得 BlackRain preload、App Server transport 或非必要系统权限。
7. 行为对齐 Codex App 不授权复制闭源代码、私有 bundle、图标 path、字体或其他专有资源。

## 仓库布局

| 目录 | 当前含义 | 纪律 |
|---|---|---|
| `apps/desktop/` | CodexMonitor 衍生的 Tauri 当前实现；Electron 迁移主战场 | 修改前读 `apps/desktop/AGENTS.md`；不随手 subtree pull |
| `gateway/` | 可选模型协议翻译原型 | 保持独立 sidecar |
| `codex-upstream/` | gitignored 的 codex 只读参考克隆 | 只锁版本、构建和验证，不改内核 |
| `plugins/` | 暂停路线留下的适配器 | 不进入迁移 P0，不扩建插件市场 |
| `workbenches/` | 暂停的工作台资产 | 冻结，不进入 P0 |
| `.specs/` | 跨层功能 living specs | 行为、边界或状态变化时同步更新 |

## Living Spec

允许同时维护多个边界互斥的业务 living spec，但每个 spec 必须声明自己的交付物、代码所有权、依赖关系和验证边界，不得用一个 spec 的完成状态替代另一个 spec 的验收。

- `002-electron-migration` 仍是 BlackRain Windows Electron 产品交付 P0，覆盖 Tauri/daemon 删除、产品 Browser 回归和发布验收。
- `003-portable-electron-browser-runtime` 是独立源码底座开发线，覆盖 Browser 核心去 BlackRain/Codex 耦合、宿主/Agent 适配合同、最小参考宿主和二次开发验证。
- 同时影响 BlackRain 产品行为和源码底座公共合同的改动必须同步两个 spec；仅有通用 fixture 通过不得写成 BlackRain 产品发布通过，BlackRain E2E 通过也不得写成源码底座已可移植。
- 新 spec 使用 `.specs/_template/` 建立；完成或取消后的目录治理由对应决策记录，不用删除正在进行的其他 spec。

## 桌面架构纪律

修改 `apps/desktop/**` 前必须读 `apps/desktop/AGENTS.md`。

- React renderer 只负责展示和前端状态。
- Electron main 负责窗口、权限、Browser、更新和原装 app-server 生命周期，并直接实现 stdio JSONL App Server client。
- preload 只暴露类型化 allowlist，不暴露原始 IPC 或 Node.js。
- 当前 Rust daemon/shared core 只是 Tauri 迁移输入；目标态按 Codex App 分层把 agent 能力交给原装 app-server，把桌面宿主能力放入 Electron main/preload，不保留永久 BlackRain daemon。
- Browser `WebContentsView` 只由 main 创建和持有；renderer 只上报经过校验的 bounds、visibility、active tab 和 UI 遮挡状态。
- 可移植 Browser Runtime 核心不得依赖 BlackRain `AppServerRuntime`、总 `BlackRainHostApi`、BlackRain IPC channel 或 React UI；这些依赖只能位于 BlackRain/Codex adapter。
- 通用源码底座使用中性的 owner/activity/surface 标识；BlackRain adapter 负责映射 thread/turn/route，不在核心中固化 Codex 生命周期。
- Browser 页面不得加载 App preload；当前迁移 spec 证明需要时，只允许 main 固定路径、固定 hash、无网页全局暴露的专用最小 page preload。
- Browser 工具生产链按 Codex session/turn 绑定到唯一 main backend；发布态只使用进程级注册的标准 stdio MCP + 随包 Node adapter + 自有鉴权 transport，dynamic tools 只作测试/bootstrap。
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

Electron 迁移命令按 `docs/commands.md` 执行；涉及尚未删除的 Tauri 基线时才运行对应 Rust/NSIS 回归。必须持续补 main/preload 单测、App Server stdio 集成测试、Playwright Electron E2E 和 Windows MSIX 安装矩阵。

Windows 浏览器登录、权限、下载、崩溃恢复、安装、升级和卸载必须实机验证。CI 或 macOS smoke 不能替代产品验收。

`main` 永远可用且禁止直接 push。使用 `<type>/<短描述>` 短命分支、Conventional Commits、CI 绿、Squash 合并并删除分支。

回复、文档和代码注释默认使用中文。
