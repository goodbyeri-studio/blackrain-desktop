# BlackRain 仓库协作规则

## 工具协作限制

- 不调用、依赖或推荐本机 `claude` CLI；开发、审查、调研、测试与文档治理由当前 agent 使用仓库工具和普通 Git 工作流完成。

## 项目定位

BlackRain 以 OpenAI 开源 `codex-rs` 为唯一 agent 内核，自行补齐完整桌面 Codex 产品需要的宿主能力，并尽可能对齐官方 Codex App 的核心功能与体验。

当前重点是完成 BlackRain Windows Electron 客户端的正式签名与产品发布矩阵。Electron 代码态和 Browser 自动化已有 `RUN_PASS` 证据，但不得据此推导客户端已可发布；正式签名、安装、升级、回滚、卸载和完整设备矩阵仍需单独验收。锁定的 Codex runtime 通过标准 stdio MCP 与随包 Node adapter 接入 Browser client，测试桥接不属于第二生产路由。

`plugins/` 与 `workbenches/` 只保留实验性资源，不属于当前产品入口或默认发布依赖。不要把实验目录中的草案写成已支持能力。

## 真源

- Electron 宿主设计：`docs/design/electron-migration.md`
- 可移植 Browser Runtime 设计：`docs/design/portable-browser-runtime.md`
- 产品范围与路线图：`docs/project-scope.md`、`docs/roadmap.md`
- 运行时架构：`docs/architecture/overview.md`
- 当前完成度：实际代码、测试结果和公开发布说明
- 日常命令：`docs/development/commands.md`

发生冲突时必须在同一改动中修正文档；尚未收敛的公共决策写入对应 ADR。

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

当前生产代码只保留 Electron 路径。文档和 PR 必须明确区分“Electron 代码态 `RUN_PASS`”与“正式签名 Windows 产品态 `PRODUCT_PASS`”；历史迁移事实不是当前入口或公共 API。

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
| `apps/desktop/` | CodexMonitor 起源的 Electron Desktop 实现 | 修改前读 `apps/desktop/AGENTS.md`；不随手 subtree pull |
| `gateway/` | 可选模型协议翻译原型 | 保持独立 sidecar |
| `codex-upstream/` | gitignored 的 codex 只读参考克隆 | 只锁版本、构建和验证，不改内核 |
| `plugins/` | 实验性适配器与资源 | 不自动进入产品发布依赖 |
| `workbenches/` | 实验性内容样例 | 不自动进入产品入口 |
| `docs/design/`、`docs/adr/` | 公共设计合同与架构决策 | 行为、边界或状态变化时同步更新 |

## 设计合同

公共架构合同写在 `docs/design/`，长期取舍写在 `docs/adr/`。每份文档必须声明范围、所有权、依赖和验证边界；设计存在不等于代码实现或产品发布通过。任务清单和逐项迁移账本不作为公开入口。

## 桌面架构纪律

修改 `apps/desktop/**` 前必须读 `apps/desktop/AGENTS.md`。

- React renderer 只负责展示和前端状态。
- Electron main 负责窗口、权限、Browser、更新和原装 app-server 生命周期，并直接实现 stdio JSONL App Server client。
- preload 只暴露类型化 allowlist，不暴露原始 IPC 或 Node.js。
- agent 能力交给原装 app-server，桌面宿主能力放入 Electron main/preload；不得新增第二套 daemon 或状态机。
- Browser `WebContentsView` 只由 main 创建和持有；renderer 只上报经过校验的 bounds、visibility、active tab 和 UI 遮挡状态。
- 可移植 Browser Runtime 核心不得依赖 BlackRain `AppServerRuntime`、总 `BlackRainHostApi`、BlackRain IPC channel 或 React UI；这些依赖只能位于 BlackRain/Codex adapter。
- 通用源码底座使用中性的 owner/activity/surface 标识；BlackRain adapter 负责映射 thread/turn/route，不在核心中固化 Codex 生命周期。
- Browser 页面不得加载 App preload；确需页面协调时，只允许 main 固定路径、固定 hash、无网页全局暴露的专用最小 page preload。
- Browser 工具生产链按 Codex session/turn 绑定到唯一 main backend；发布态只使用进程级注册的标准 stdio MCP + 随包 Node adapter + 自有鉴权 transport，dynamic tools 只作测试/bootstrap。
- main 必须校验 route、thread、window、view generation 和 profile ownership，并强制页面 WebContents 安全参数。
- Codex App 的可观察 Browser 行为与控制面是第一实现基线；ClawX、Hermes 等项目只补充通用 Electron 工程经验。
- 迁移期兼容层必须带删除任务，不建立永久双宿主分叉。
- 事件扇出保持单一入口；Browser 事件也必须标准化后进入 UI。

## License

BlackRain Desktop 是 MIT 许可的开源项目；第三方组件仍按各自许可证分发：

- MIT / Apache-2.0：可进入仓库，保留 NOTICE 和署名。
- AGPL / GPL / BSL / 无许可证：未经单独法律审查和分发方案确认不得进入仓库。
- 任何生成的 runtime、签名材料、账号数据或用户内容都不是公开源码制品。
- OpenAI 闭源客户端只作为产品行为参考，不复制其闭源实现或资源。

仓库根 [LICENSE](LICENSE) 适用于 BlackRain 自有代码；完整来源和第三方边界见
[NOTICE](NOTICE) 与 [项目范围](docs/project-scope.md)。

## 验证与 Git

Electron 日常与发布命令按 `docs/development/commands.md` 执行。必须持续补 main/preload 单测、App Server stdio 集成测试、Playwright Electron E2E 和 Windows MSIX 安装矩阵。

Windows 浏览器登录、权限、下载、崩溃恢复、安装、升级和卸载必须实机验证。CI 或 macOS smoke 不能替代产品验收。

`main` 永远可用且禁止直接 push。使用 `<type>/<短描述>` 短命分支、Conventional Commits、CI 绿、Squash 合并并删除分支。

回复、文档和代码注释默认使用中文。
