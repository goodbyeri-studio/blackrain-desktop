# BlackRain 仓库协作规则

## 产品边界

BlackRain Desktop 是基于开源 `codex-rs` / `codex app-server` 独立实现的开源 Codex Desktop。桌面能力对标官方 Codex Desktop，但对模型开放。

两层要分清，不要混淆优先级：

- **基线**——对齐官方 Codex Desktop 的可观察功能与体验。它是达到可用标准的手段，不是终点。
- **差异化本体**——开放的模型层：多模型 Provider、Auto Router、任意第三方模型接入。这是 BlackRain 存在的理由，不是“后续扩展”。

模型层不得改变 Codex 内核：不引入第二个 agent runtime，不接管 thread、turn、审批或 Browser 状态。当前状态是 `CODE_EXISTS`（Gateway sidecar 与设置 UI 有代码，宿主 API 未接线），不得在文档或 UI 中描述为可用。

当前唯一产品发布目标是 macOS。Windows/Linux 不是当前发布承诺；历史 Windows/MSIX 脚本和证据不能推导 macOS 产品已发布。macOS 的签名、公证、安装、升级、回滚、卸载和恢复必须另行完成实机验收后，才可标记 `PRODUCT_PASS`。

托管模型、云端 Browser、团队服务和商业 SLA 不在本仓范围。本仓是桌面客户端，不含服务端实现。

**但 Desktop 侧的账号 UI 已经存在**（`src/features/accounts/`，`AccountGate` 是应用入口）：它提供登录与 credit 展示，是**可选的**。未配置 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 时走 `unconfigured` 分支直接放行，不拦截使用。**BYOK 是默认路径**——fork 本仓、自带 key 即可获得完整功能。详见[产品定义](docs/product.md)。

## 不可违反的架构规则

1. 原装 `codex-rs` / `codex app-server` 是唯一 agent runtime：只读、只调用、不 fork、不重写，不引入第二套 agent loop、thread、事件、审批、停止、恢复或模型状态机。
2. App 使用标准 Codex Home，与原生 CLI 共享配置、认证和可恢复 thread；不得创建隐藏的 BlackRain 专属 `CODEX_HOME` 作为第二状态域。
3. Electron 是唯一生产宿主。main 负责窗口、权限、更新、app-server stdio JSONL client 和 Browser；preload 只暴露类型化 allowlist；renderer 只负责 UI 与前端状态。
4. Browser `WebContentsView`、session、下载、权限、CDP 和生命周期只由 main 持有。网页不得加载 App preload、获得 App Server transport 或非必要系统权限。
5. Browser 生产链只使用标准 stdio MCP、随包 Node adapter 和自有鉴权 transport；测试桥接不能成为第二条生产路由。
6. Gateway 是可选、独立的协议翻译 sidecar。它不能拥有 thread、Browser、UI 状态或成为原生 Codex 路径的隐式依赖。
7. 对齐官方 Codex Desktop 只允许参考公开可观察行为；不得复制、反编译或再分发其闭源代码、私有 bundle、字体、图标或服务。
8. 每条 IPC 都必须校验 schema、sender、window、workspace/thread、route 和 generation ownership。renderer 不接触 Node.js、原始 IPC、secret、App Server transport、文件系统或 Browser 页面所有权。

## 线程显示不变量

- `setThreads` reconciliation 保留必要的 active/processing/ancestor anchors 与 incoming order。
- `hiddenThreadIdsByWorkspace` 优先，不得在 reconciliation 中复活隐藏 thread。
- `useThreadRows` 仅在 parent summary 可见时把 child 放在 parent 下；缺 parent 时 child 提升为 root。

## 文档真源

- [产品定义](docs/product.md)：范围、优先级与非目标。
- [架构](docs/architecture.md)：进程、状态和权限所有权。
- [Browser 与 Computer Use](docs/browser.md)：Browser 合同与控制链路。
- [开发与发布](docs/development.md)：命令、上游更新和 macOS 发布边界。
- [上游与来源](docs/upstream.md)：依赖、参考项目与许可证边界。
- [ADR](docs/adr/README.md)：长期决策。

行为、公开边界或状态变化时，在同一个改动中更新对应真源。`CODE_EXISTS`、`RUN_PASS` 与 `PRODUCT_PASS` 不能互相推导。

## 目录纪律

| 目录 | 作用 |
| --- | --- |
| `apps/desktop/` | Electron 产品主线；命令与验证链见[开发与发布](docs/development.md) |
| `gateway/` | 可选模型协议翻译原型，不是默认依赖 |
| `codex-upstream/` | gitignored 的只读上游参考克隆，不修改内核 |

CodexMonitor 仅为部分遗留文件的历史来源，正在逐域退役。不得把它写成当前产品基础，也不得在残留派生代码尚未替换并完成许可证审计前删除 NOTICE 归属。

## 验证与 Git

- 不调用、依赖或推荐本机 `claude` CLI。
- 持续补 main/preload 单测、App Server stdio 集成测试、Playwright Electron E2E，以及 macOS 实机产品验收。
- 生成的 runtime、签名材料、账号数据、Cookie、用户内容和测试输出不得提交。
- `main` 永远可用且禁止直接 push；使用短命分支、Conventional Commits、CI 和 squash 合并。维护者（分支保护 bypass 名单内）可自行合并，无需他人 review；组织外贡献者仍需 1 次 review。无论哪种情况都应等 `Required quality gate` 变绿再合并。
- BlackRain 自有代码为 MIT；完整第三方边界见 [NOTICE](NOTICE)。

回复、文档和代码注释默认使用中文。
