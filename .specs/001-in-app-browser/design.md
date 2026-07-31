# 内置浏览器设计

> 本文描述 Electron 目标设计。已存在和已验证范围只以 `verification.md` 为准。

## 运行时拓扑

```text
React renderer
  -> typed preload IPC（用户 UI 控制面）
  -> Electron main Browser backend
       -> Browser registry / policy / session / CDP
       -> main-owned WebContentsView
       -> page WebContents

codex.exe app-server
  -> 标准 stdio MCP
  -> BlackRain Node Browser adapter
  -> BlackRain Browser client
  -> authenticated per-session local transport
  -> 同一个 Electron main Browser backend
```

产品 UI 与 agent 工具是两条权限不同的控制链，但最终必须落到同一个 registry 和 page WebContents。dynamic tools 只保留为迁移 bootstrap，不能成为发布态第二 adapter。

## 页面宿主选择

- 调研基线中的 Codex App 使用 renderer `<webview>`；BlackRain 主动改用标准 Electron、main-owned `WebContentsView`，只对齐可观察的同页、隐藏运行、接管和恢复行为，不宣称宿主原语相同。
- renderer 只提交带 `window_generation`、`layout_revision` 和 `view_generation` 的 bounds/visibility/occlusion；main 校验并裁剪后更新 native view。
- modal、菜单和其他遮挡期间由 main 隐藏或裁剪 view。若 hidden capture、输入、遮挡或最低恢复无法稳定通过，按 `decisions.md` 重开宿主选择。

## 所有权

| 层 | 职责 |
|---|---|
| `codex app-server` | thread、turn、审批、停止、工具路由、沙箱和 ThreadStore |
| Electron main | App Server client、Browser backend、view、session、CDP、权限、下载、恢复 |
| preload | 类型化 allowlist 和事件订阅 |
| React renderer | Browser sidebar、tab、地址栏、状态和用户决策 UI |
| page WebContents | 不可信网页；无 Node、无 App preload、无 App Server transport |

## 标识与状态

- 每个工具请求绑定 `window_id`、`thread_id`、`route_id`、`session_id`、`turn_id`、`backend_generation`、`tab_id`、`view_generation` 和 profile。
- UI tab、API tab、WebContents id、CDP target/session id 分层保存，不互相冒充。
- P0 使用单一持久 profile；profile 属于用户，tab/route 属于 thread。
- tab 状态至少包含 origin、claim、control owner、handoff、deliverable、visibility、page lifecycle 和 debugger 状态。

## 生产工具链

- 锁定 `codex-cli 0.146.0` 通过进程级 `-c mcp_servers.blackrain_browser.*` 注册随包 Node stdio MCP；不修改共享 `config.toml`。
- adapter 只暴露窄类型高层 Browser 工具，不提供通用 `js`/eval；它从 codex-core 注入的 `_meta.threadId` 与 `x-codex-turn-metadata` 取得可信 session/thread/turn 并要求三者一致。
- app-server 父进程只为标准 MCP launcher 持有 bootstrap 变量；MCP launcher 会清空 adapter 子进程环境，并通过公开 `env_vars` 白名单只转发所需变量。启动参数同时向 `shell_environment_policy.filters` 增量加入 `BLACKRAIN_BROWSER_* = exclude`，阻止 Codex shell 子进程继承 capability token，且不覆盖用户已有过滤规则。token 的值不进入命令行、renderer、thread 或日志。
- transport 使用随机 endpoint、Windows 系统默认创建者 ACL、显式 `readableAll:false`/`writableAll:false`、256-bit capability token、握手和 4-byte LE framed JSON-RPC。
- 单帧上限 8 MiB；连接分配 client id；方法级再次验证 session/turn/route/page ownership。
- endpoint、token 和 bootstrap 只进入 Electron main、app-server 启动环境及白名单 MCP adapter 环境；adapter 启动后立即删除自身 `process.env` 中的 token，agent shell 由上述 filter 强制排除这些变量。
- 线协议是 BlackRain 自有 v1 合同；长度前缀和上限服务于有界解析，不承担与 Codex 私有 backend 兼容的职责。
- OS ACL 提供默认账户边界，token 证明调用者持有当前 capability。P0 自动化覆盖无 token、错误/旧 token、旧 generation 和跨 session/turn client；不要求创建另一 Windows 账户，也不把任意同用户代码执行视为已隔离。
- Electron 生产入口只注册 MCP adapter，`thread/start` 不再提交 dynamic tools；dynamic adapter 仅保留 fixture/E2E bootstrap，不形成发布态第二路由。
- dynamic tools bootstrap 必须由测试/探针显式开启；Browser MCP resolver 缺项或与 bootstrap 同时配置时，App Server runtime 在构造期 fail closed，禁止静默降级或双路由。
- 生产 app-server 发起的审批和 `item/tool/requestUserInput` 不进入 Browser adapter。main 通过有界事件流转发到现有 UI，并以类型化 IPC 接受一次性响应；响应绑定 workspace 和原 RPC request id，取消、超时、进程退出或 runtime generation 变化后失效。

## 页面控制

- 高层默认 API 是 tabs、navigation、snapshot、locator/CUA、screenshot、artifact 和 finalize。
- selector/actionability runtime 注入当前 page/OOPIF 的 CDP isolated world，不启动第二个 Chromium。isolated runtime 只维护语义 DOM revision；main 缓存完整 AX tree、合并 `Accessibility.nodesUpdated`，revision 不变时复用缓存，变化或导航时刷新。
- 当前 locator 以 AX role/name 唯一匹配为语义 selector，支持 `attached`、`visible`、`actionable`、0-10 秒 deadline；`visible/actionable` 在目标页面 realm 内跨两个 animation frame 复核连接、样式和 box 稳定性，歧义立即失败、未出现/未稳定按 deadline 失败、取消和导航单独失败。
- locator 轮询复用当前 page 派生的 OOPIF child session；frame 离开 route 或 document generation 变化时丢弃缓存，禁止每次 poll 重复 attach 或按 URL 全局复用。
- OOPIF 只附着可追溯到当前 page frame tree 的 target；不得按 URL 或 origin 全局放行。
- 输入执行前重新验证 document、generation、ref、active element 和 actionability。
- hidden full-page capture 持有 main-owned visibility hold，临时隐藏 native view 后使用 CDP capture surface；所有成功、失败和取消路径都按当前 layout 期望恢复 view 可见性。
- `about:blank` 和受管错误页只可作为内部初始/降级页面；产品导航仅允许校验后的 `http(s)` URL。

## 生命周期与恢复

- 用户键盘输入、点击、滚轮和上下文菜单等主动输入立即抢占 agent；被动 `mouseMove`/`mouseEnter`/`mouseLeave` 不表示接管意图，避免页面或视图合成事件误取消操作。turn 完成、interrupt、app-server 退出和显式接管释放 agent 控制权。
- `turnEnded` 与 `tabs.finalize({keep})` 统一处理 close、handoff、deliverable、release 和资源清理。
- page record 使用 live/suspended/persisted/crashed 状态。每个 owner 的普通 live 预算为 8；可见页和正在执行工具的页面优先保留 live，其余按最近活动时间通过 `Page.setWebLifecycleState(frozen)` 进入 suspended，显示或工具操作前恢复 active。窗口释放后关闭 WebContents，只保留 v2 reload 状态作为 persisted；崩溃页单独标记 crashed。
- Windows 资源 probe 直接采样 Electron `app.getAppMetrics()` 与 GPU feature status，至少记录 1 tab、10 tab（8 live/2 suspended）、清理后、suspended resume 和 App restart recovery；数值是指定机器的回归基线，不是跨设备硬上限。
- persisted v2 最低保存 tab/route id、origin、最后 claim、handoff/deliverable、URL、可获得的 navigation entries/active index、`reload` restore policy、最后活动时间和 Browser storage/profile 引用。v1 状态只读迁移到安全默认值；恢复时提升 view generation、释放旧 agent claim，并在同一持久 session 中 reload。
- 默认不承诺恢复 JS heap、未提交表单、滚动位置或私有 page snapshot；新增保证必须有标准 Electron 的 Windows 证据。
- page renderer、App renderer、Browser client、app-server 和 App restart 分别验证；旧 generation 一律 fail closed。
- Electron `powerMonitor.suspend/resume` 由 main 的单一串行协调器处理。睡眠前等待进行中的 runtime 启动完成并快照 thread/workspace/cwd ownership，再停止此前运行的 app-server 和 Browser MCP transport、使 pending request/grant 失效、释放 Agent 控制并冻结存活页面；唤醒后只重启睡眠前已运行的 app-server，逐个 `thread/resume` 恢复原订阅和 Browser thread registration，重建 CDP observer，崩溃页 reload，并按 visibility/8-live 预算恢复页面。开发 E2E 只能调用同一协调器验证顺序与恢复合同，不能替代真实 Windows 睡眠 PRODUCT_PASS。
- Windows 上 app-server 超过 graceful deadline 后使用 `taskkill /T /F` 回收整棵 Codex/code-mode/MCP 进程树；测试 fixture 必须证明后代进程不会遗留。

## 安全策略

- 页面仅允许受控 `http(s)` 导航；popup 转为受管 tab；外部协议默认拒绝。
- 权限默认拒绝；下载确认请求按 tab 只保留最新一项并由 main-owned timer 在 60 秒后清理，保存必须取得一次性 grant；file chooser 由用户发起或确认。
- App renderer 与页面使用隔离 session/CSP/preload；`webviewTag` 关闭。
- Developer mode full CDP 必须逐次批准、记录审计且可由策略关闭。
- Cookie、Local Storage、认证 token、密码和 transport secret 不被 Browser 工具自动读取。snapshot/ARIA/截图中的可见页面内容可以进入模型，但 UI 必须显示 origin、控制方和活动状态。
- 登录、授权、发送、发布、购买、删除等敏感 click，以及可激活按钮或提交表单的 Enter/Space 键，使用 main-owned 一次性 grant，绑定 origin、动作分类、session/turn、TTL 和 generation；网页或模型不能自行批准。

## 测试策略

- Vitest：schema、ownership、transport、framing、CDP、OOPIF、状态机、恢复和清理。
- runtime probe：标准 stdio MCP client 加载、调用、取消、turn end、进程退出和 packaged 资源解析；code-mode seam gate 则要求 V8 执行/取消/清理成功且 Node 模块加载保持不可用，防止误建第二条生产路由。任一合同失败即阻止生产切换。
- Playwright Electron：真实 `WebContentsView`、UI、同页操作、popup/权限/下载、重启和多窗口。
- bundled app-server：initialize、thread/turn、tool call、审批、取消、停止、崩溃和恢复。
- Windows 安全探针：无 token、错误/旧 token、旧 generation、跨 session/turn、token 不落日志，以及敏感动作 grant 的 origin/TTL/单次消费。
- Windows 人工矩阵：登录、MFA、敏感动作确认、实际下载、权限、DPI、多屏、z-order、焦点、中文输入法和资源。
