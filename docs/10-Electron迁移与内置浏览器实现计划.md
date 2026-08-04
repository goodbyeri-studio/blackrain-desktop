# 10 Electron 迁移与内置浏览器实现计划

> **状态（2026-08-04）**：Electron 原生重建是唯一产品交付 P0，产品任务与验收看 [002 Electron 全量迁移](../.specs/002-electron-migration/)。Browser runtime/功能链路已闭环并转为发布回归；其可移植源码底座另由 [003 可移植 Electron Browser Runtime](../.specs/003-portable-electron-browser-runtime/) 管理，不改变本计划的产品发布闸口。当前有效迁移基线为 194 个 Tauri command 和 53 个 renderer 直接依赖，开发签名 MSIX 的全页面点击失败仍是第一产品阻塞。历史阶段曾为 59 个 direct import，不作为当前基线。最终必须通过 Native Clean Gate，生产源码、用户可见文案、依赖、构建和 release 解包不得留下 Tauri 痕迹；本内部计划文档可保留迁移审计事实，但不能把 Tauri 写成目标入口。

## 结论

BlackRain 以 Codex App 的可观察行为和 Browser 控制面作为第一实现基线：

```text
原装 codex app-server
  -> 标准 stdio MCP 工具调用
  -> BlackRain Node Browser adapter
  -> BlackRain Browser client
  -> authenticated per-session local transport
  -> Electron main Browser backend
  -> browser session / route / tab / page registry
  -> main 创建并持有 WebContentsView
  -> page WebContents
  -> Electron API / Chromium CDP
```

迁移不是把 Tauri command 逐条改写为 Electron IPC，也不是重新实现 Codex 内核。目标直接采用 Codex App 的 Electron/React/App Server 分层：保留 React 产品界面，Electron main 直接启动并驱动原装 `codex app-server`，当前 Rust daemon/shared core 只作为迁移输入并最终删除。

## 研究基线

本计划综合以下 2026-07-26 本机研究快照：

- `codex-app-browser-security-architecture.md`：进程权限、guest 隔离、attach 校验、profile、pipe 和供应链边界。
- `codex-app-implementation-architecture.md`：Electron、app-server、dynamic tools、Browser client、registry、CDP 和 hidden host 分层。
- `codex-iab-live-implementation-study.md`：真实验证 `renderer -> webview -> guest WebContents -> debugger` 的创建和操作时序。
- 2026-07-29《Codex App 内置浏览器技术架构深度调研》：确认 `<webview>` 页面宿主、per-session backend、pipe framing、注入式 Playwright/ARIA、OOPIF、输入翻译、turn/tab 收口和页面工作集。

并以 2026-07-29《Codex Desktop App 技术栈与实现架构深度调研》补齐非 Browser 主链：Electron main 直接启动 `codex.exe app-server`、stdio JSONL、App Server 生命周期、Thread/Turn/Item 投影、Windows helper、ThreadStore、rollout JSONL 与 SQLite。

观察对象为 Codex Electron `26.721.41059`、Electron `42.3.0`、Chromium `150.0.7871.128`。研究快照不是 OpenAI 私有源码授权，也不是永恒协议；每次更新锁定 Codex 版本都必须重跑协议与行为探针。

证据优先级：

1. Codex App 官方公开行为和本机合法可观察行为。
2. 当前锁定 `codex-rs` 的公开 app-server 协议。
3. Electron 官方 API、安全限制和 Windows 行为。
4. ClawX、Hermes Desktop 等开源项目的通用工程经验。

ClawX 与 Hermes 不定义 BlackRain Browser 产品架构。ClawX 可参考 webview policy、崩溃恢复和打包；Hermes 可参考 sidecar 启动、动态 endpoint、Windows 子进程和更新恢复。两者的可见 Electron 页面与 agent browser 分离，不满足 BlackRain 的共享 IAB 合同。

## 技术栈基线

首个 Electron 工程按 2026-07-29 本机 Codex App 快照锁定候选：

| 层 | 目标基线 |
|---|---|
| 宿主 | Electron `42.3.0` / Chromium `150.0.7871.128` |
| 构建与打包 | Electron Forge `7.11.1`、Vite `8.1.3`、TypeScript `5.9.3`、MSIX maker |
| UI | React `19.2.5`、React Router、CodeMirror |
| Renderer/Main 边界 | preload、`contextBridge`、类型化 IPC |
| App Server client | Node `child_process.spawn`、JSONL parser、RPC dispatcher |
| 本地桌面能力 | `node-pty`；Electron 自有结构化状态需要时使用 `better-sqlite3`，不得混写 Codex SQLite |
| schema/config | `zod`、`smol-toml`、YAML |
| 可观测性 | Sentry Electron/Node、OpenTelemetry API/SDK |

`ws`、`yjs` 等仅在报告中证明依赖存在、未证明具体产品用途；迁移任务只做 License 与用途审计，不在没有能力需求时预装或扩建。

## Codex 对齐矩阵

| Codex 可观察实现 | BlackRain 目标实现 | 对齐方式 |
|---|---|---|
| Electron main 监管 `codex.exe app-server` | Electron main 直接监管 bundled `codex.exe app-server` | 同构进程边界 |
| app-server stdio JSONL/JSON-RPC | main 通过 stdin/stdout JSONL 双向通信，stderr 独立诊断 | 同构 transport 与 framing |
| 标准 Codex Home 合同 | 默认沿用 CLI 标准 Home 解析和父进程显式 `CODEX_HOME` | 共享 config/auth/thread，Electron/Browser 宿主状态独立 |
| Forge + Vite + TypeScript + MSIX | 使用 npm、Forge、Vite、TypeScript 与 MSIX maker | 同构 Windows 工程主线 |
| renderer 创建 `<webview>` | main 创建 `WebContentsView`，renderer 只同步 sidebar bounds/state | 功能对齐，使用 Electron 推荐的 main ownership |
| main 持有 guest `WebContents` | main Browser backend 持有 view/page WebContents | 同一控制面 |
| conversation/route/generation/storage 校验 | owner window/thread/route/view generation/profile 校验 | 同类服务端授权 |
| hidden Browser host 与 WebContents adoption | view retention、visibility 和 main reparenting | 保留同一页面与登录态 |
| 单一持久 `persist:codex-browser-app` | P0 使用 `persist:blackrain-browser-app` | 登录保持与 App renderer 隔离 |
| Browser client + named pipe | BlackRain 自有 Browser bridge + 鉴权本地 transport | 不复制私有 client，修复 Windows 对端认证缺口 |
| 每 Codex session 一个 backend，request 绑定 session/turn | per-session backend route + session/turn/generation ownership | 同构路由和生命周期边界 |
| 4-byte LE + JSON-RPC pipe frame，8 MiB 上限 | 同 framing + 随机 endpoint/ACL/token/client id | 同类 transport，并补应用层认证 |
| 注入式 Playwright selector/ARIA，不启动 browser | 在现有 page target 注入许可兼容 runtime | 同一页面语义层，无旁路 Chromium |
| `turn/completed` + finalize/handoff/deliverable | 确定性 tab/resource finalize | 同构 turn 结束语义 |
| live page working set + persisted restore | 可配置 live/suspended/persisted 工作集 | 32/30m 作候选，Owl 能力使用标准 Electron 降级 |
| main 管理 download grant | 一次性 download grant | 同类服务端授权 |
| full CDP 独立开关 | Developer mode + 显式审批 + 企业禁用 | 对齐公开产品边界 |

## 目标进程拓扑

```text
BlackRain Electron
  ├─ Main
  │   ├─ WindowManager
  │   ├─ AppServerSupervisor
  │   ├─ StdioConnection / JSONL dispatcher
  │   ├─ BrowserBackend
  │   │   ├─ BrowserRegistry
  │   │   ├─ BrowserSessionBackendRegistry
  │   │   ├─ BrowserClientTransport
  │   │   ├─ BrowserViewManager
  │   │   ├─ BrowserViewFactory
  │   │   ├─ PermissionPolicy
  │   │   ├─ DownloadManager
  │   │   └─ CdpController
  │   ├─ UpdateManager
  │   └─ OS integrations
  ├─ Preload
  │   └─ window.blackrain：类型化 allowlist
  ├─ React renderer
  │   ├─ Codex product UI
  │   └─ Browser sidebar controls / bounds / state
  ├─ bundled codex.exe app-server
  │   ├─ codex-core / tools / policy
  │   ├─ standard Codex Home / ThreadStore
  │   └─ code-mode/MCP/sandbox helper processes
  ├─ BlackRain Node stdio MCP adapter（随包 Node 22 runtime）
  ├─ BlackRain Browser client
  │   └─ authenticated per-session local transport -> main BrowserBackend
  └─ optional Model Gateway
```

## main、preload、renderer 与 app-server

### Electron main

main 拥有桌面特权、App Server client 和进程编排：窗口、Browser `WebContentsView`、page WebContents、session、权限、下载、CDP、app-server、更新和系统集成。App Server client 与 Browser backend 按领域拆分，禁止形成单个巨型 `main.ts`。

每个 IPC handler 必须校验 sender、窗口角色、参数 schema、thread ownership 和当前 generation。main 不接受 renderer 提供任意 channel、partition、preload 路径、CDP method 或文件路径。

### Preload

preload 只暴露命名方法和取消订阅函数，例如 `threads.start()`、`browser.navigate()`、`browser.setViewportState()`。不暴露原始 `ipcRenderer`、Node API、App Server transport 或 `webContents.id`。

### React renderer

renderer 继续负责产品 UI、Browser toolbar、侧边栏占位和接管状态。它通过类型化 IPC 上报 bounds、visibility、active tab、window generation 和 modal/遮挡状态，不创建 Browser WebContents，不决定 partition、安全参数、CDP 或服务端 ownership。

### 原装 app-server

原装 app-server 是 thread、turn、item、工具、审批、停止、恢复和持久化真源。main 只消费 app-server 的 v2 产品投影，不解析 TUI，不复制 Core event translator，也不在遗留 daemon 中保留第二套会话状态。

## 本地协议

### main 与 app-server

main 直接执行：

```text
resources/codex.exe -c features.code_mode_host=true app-server --analytics-default-enabled
```

连接合同：

- `spawn(..., { stdio: ["pipe", "pipe", "pipe"] })`；stdin/stdout 只传逐行 JSON 协议，stderr 单独进入日志与诊断。
- request 有 `id/method/params`，response 关联 `id`，notification 无 `id`；线上 frame 省略 `jsonrpc` 字段。
- 协议双向；main 必须处理 approval、elicitation、dynamic tool 等 server request 并返回 response。
- 初始化与会话状态机覆盖 `initialize/initialized`、thread start/resume/subscribe/unsubscribe、turn start/interrupt/completed 和进程退出。
- pending request、消息大小、并发和事件队列有上限；EOF、畸形 JSON、迟到 response、stderr 洪泛和 child exit 都有确定失败语义。
- renderer 永远看不到 stdin/stdout、RPC id 表或原始连接。

当前固定 `127.0.0.1:4732` 与 `blackrain_daemon` 只属于 Tauri 迁移起点，目标生产架构不保留该网络入口或中间进程。

### Browser 工具与 main backend

第一个可验证接缝使用当前公开 app-server 的 experimental dynamic tools：

```text
initialize.capabilities.experimentalApi = true
thread/start.params.dynamicTools += blackrain_browser.*
app-server item/tool/call
  -> main BrowserBackend
  -> app-server tool result
```

每个锁定版本必须先做协议探针。若 dynamic tools schema 或 server request 不匹配，Browser agent 控制必须 fail closed 并降级为手动浏览，不能静默改走第二 agent runtime。

dynamic tools 只作 bootstrap。已验证的生产链路是：

```text
codex-core MCP tool execution
  -> BlackRain Node stdio MCP adapter
  -> BlackRain Browser client
  -> authenticated local transport
  -> per-session Browser backend route
  -> main BrowserBackend
```

Browser adapter/client 基于公开、可分发的标准 stdio MCP 自行实现，不复制 OpenAI `node_repl.exe`、`browser-client.mjs`、私有 `nativePipe` 或 bundled plugin。adapter 从 codex-core 注入的 `_meta.threadId` 与 `x-codex-turn-metadata` 读取可信 session/thread/turn，main transport 再校验 app build、capability、active turn 和 backend generation。

这条生产链路已在锁定 Windows `codex-cli 0.146.0` 上通过进程级探针：`-c mcp_servers.blackrain_browser.*` 配置、MCP ready/tool discovery、`mcpServer/tool/call`、可信 metadata 透传和 backend 命中均通过。code-mode V8 的 Node import 失败只证明 V8 不承担 `.mjs` 加载；独立 Node MCP 才是加载层。0.146.0 会清空 MCP 子进程环境，bootstrap 变量通过公开 `env_vars` 名称白名单转发，secret 值不进入命令行。

Electron 发布入口始终注册 MCP adapter，生产 `thread/start` 不再提交 dynamic tools；main 自加载 client 已退出产品入口。正式包锁定 Node.js `22.23.2` Windows x64，只携带 `node.exe` 与 MIT `LICENSE`，并对 Node、adapter 和 client 执行 SHA-256 gate；Electron `RunAsNode` fuse 保持关闭。

Windows transport 初始合同为：随机 pipe endpoint、仅目标用户/系统 ACL、256-bit capability token、4-byte little-endian payload length、UTF-8 JSON-RPC、8 MiB 单帧上限和每 socket client id。response 只返回发起连接，事件按 route 定向或受控广播；session/build filter 不能代替认证。这是 BlackRain 自有 v1 协议，不与 OpenAI 私有 pipe 互操作；长度前缀和上限是独立的有界解析选择。ACL 只证明用户边界，token 拒绝未持有 capability 的 client，不声称抵御可读取同用户进程内存或环境的恶意代码。

目标高层 API 对齐 Codex Browser 的能力分层：

- `tabs`：new、list、select、close。
- `navigation`：goto、back、forward、reload、stop。
- `snapshot`：accessibility/DOM snapshot、URL、title、frame 信息。
- `locator`：find、click、fill、select、wait、evaluate 的受控子集。
- `cua`：mouse、keyboard、scroll、viewport。
- `artifact`：screenshot、download metadata、debug log。
- `cdp`：默认受限到当前 tab/origin；full CDP 只在 Developer mode。

snapshot/locator 在现有页面 target 注入许可兼容的 selector、actionability 和增量 ARIA runtime，递归合并 iframe/OOPIF 语义树；禁止 `chromium.launch()` 或 `connectOverCDP()` 建立旁路 browser。早期 P0 曾用 dynamic tools 完成纵向切片；当前已切换到标准 stdio MCP、随包 Node adapter 和自有 Browser client，dynamic-tool 生产入口已关闭，发布态不得重新形成双路由。

## Codex 功能对齐的 Browser view

### WebContentsView 创建与 registry

Browser `WebContentsView` 只由 main 创建。renderer 发起 `browser.openTab` 意图时，main：

1. 校验 sender window、`threadId`、route、profile 和调用权限。
2. 从受管的 `persist:blackrain-browser-app` session 创建 `WebContentsView`。
3. 在构造时固定 `sandbox=true`、`nodeIntegration=false`、`contextIsolation=true`、`webSecurity=true`、`allowRunningInsecureContent=false`；默认无 preload，确需 annotation/selection/capture 协调时只加载 main 固定路径、固定 hash、无网页全局暴露的专用 page preload。
4. 注册 navigation、popup、permission、download、crash 和 debugger handler。
5. 建立 registry，并在 renderer 提供有效 sidebar bounds 后挂载到目标窗口 `contentView`。

```text
appSessionId
  -> ownerWindowId / windowGeneration
  -> threadId / routeKey
  -> codexSessionId / turnId / backendGeneration
  -> browserTabId / apiTabId
  -> viewId / viewGeneration
  -> webContentsId
  -> targetId / debuggerSessionId
```

每次布局、迁移和 Browser API 调用都重新校验 owner、route 和 generation。renderer 不能提供任意 `webContentsId`、partition、preload、文件路径或 CDP method。

### Bounds、隐藏与迁移

React sidebar 使用 `ResizeObserver`、窗口状态和可见性状态生成单调递增的布局更新：

```text
windowGeneration + layoutRevision + browserTabId
+ bounds in DIP + visible + occluded
```

main 丢弃旧 revision，把 bounds 约束在所属窗口 content area 内，再调用 `setBounds()` 和 `setVisible()`。窗口 resize、DPI、多屏和 sidebar 拖拽必须合并更新，避免 IPC 洪泛与页面抖动。

Browser panel 隐藏时，main 保留同一个 view/WebContents，只设为不可见或从当前布局树临时移除，不调用 `destroy()`。tab 在窗口间迁移时，main 从旧 `contentView` 移除并重新挂载到目标窗口，更新 owner 和 view generation；旧窗口的布局消息失效。

Native view 不受普通 DOM z-index 控制。打开 modal、菜单、tooltip 或覆盖层时，renderer 必须上报 `occluded`，main 按策略隐藏、裁剪或调整 view；禁止让 Browser 页面遮住确认对话框。隐藏运行不等于无提示运行，UI 必须持续显示 thread 的 Browser 活动、当前 origin、控制方和停止入口。

隐藏页面执行全页截图前，main 建立临时 capture surface/viewport，轮询 `Page.getLayoutMetrics` 达到目标尺寸后截图，并在 finally 中恢复原 bounds、visibility 和 surface。用户工具栏 `capturePage()` 与 agent 的 CDP/full-page screenshot 是两条合同。

### Profile

P0 使用一个 App 专属持久 profile `persist:blackrain-browser-app`，对齐 Codex 的登录保持行为。profile 属于用户，不属于 thread；thread 只拥有 route/tab 控制权。Cookie、Local Storage、认证 token、密码和浏览历史不被自动读取或写入 thread、模型上下文、App Server 日志或诊断包；显式 snapshot/ARIA/截图中的用户可见内容可能进入模型，产品必须显示 origin、控制方和活动状态。

逻辑 route/page ownership 与实际 storage partition 分离。`routeKey`、`browserStorageId`、generation 和 page record 用于授权、恢复和生命周期映射，所有 P0 页面仍使用同一个持久 session，不能把 route id 当成每 tab Cookie partition。

高风险任务的临时 profile 属于 P1，不能用它削弱 P0 对登录保持的验收。

### 页面工作集与恢复

page record 至少保存 URL、navigation entries、origin、browserStorageId、restore policy、live/suspended/crashed 状态和最后活动时间。初始资源候选为最多 32 个 detached live pages、选中页面保护约 30 分钟；它只是 Codex 观察值，必须经 BlackRain Windows 内存/GPU 实测后锁定。

超预算页面进入 suspended/persisted，再按标准 Electron 可实现能力恢复。Codex 的 Owl live adoption/page snapshot 属于不可复制私有扩展；BlackRain 必须定义 reload + persistent session + navigation state 的降级路径，不能把未知序列化能力写成已具备。

### CDP 与输入

main 通过页面 `webContents.debugger` 管理 debugger 1.3、target/session、frame/OOPIF 和 event listener。跨进程 iframe 使用 `Target.attachToTarget({ flatten: true })` 建立独立 session；`Target.getTargets`、`Target.closeTarget` 等按当前 route 虚拟化，不能暴露整个 App target tree。默认优先高层 locator/CUA API，不向模型暴露任意 CDP。

顶层 DOM/locator 输入优先通过受控 page runtime 翻译，并携带 input-target token；执行前重新确认 locator 目标、焦点和 generation 未漂移。跨 origin/OOPIF 走对应 debugger session 的 CDP input；不支持的组合明确失败，不能静默输入到其他元素。Electron `sendInputEvent()` 只作为经过验证的页面路径。焦点、中文输入法、用户手动输入和 `isTrusted` 行为必须在 Windows 实机验证。

### 权限、下载和文件

- 页面权限默认拒绝；P0 仅可默认允许 sanitized clipboard write。
- 摄像头、麦克风、地理位置、通知和外部协议按 origin、用途和单次操作确认。
- popup 默认阻止；允许时转换为受管 tab 或显式外部打开。
- 下载必须先取得一次性 grant，绑定 `webContentsId + appSessionId + URL + TTL`。
- agent 自动文件上传在 P0 禁止；文件选择必须由用户主动完成。
- 登录、授权、发送、发布、购买、删除及其他不可逆或高影响动作使用 main-owned 一次性 grant，绑定 origin、动作类别、session/turn、TTL 和 generation；网页或模型不能自行批准。
- Browser 页面、截图、下载和 console 都是不可信输入。

### 控制状态机

```text
idle -> agent_requesting -> agent
agent -> user_preempting -> user
user -> agent_requesting -> agent
任意状态 -> suspended / crashed
```

用户主动输入拥有最高优先级，键盘、点击、滚轮和上下文菜单可立即中止待执行 agent 输入；被动鼠标移动/进入/离开不表示接管意图。转换期间不接受双方主动输入；每次转换产生标准化事件，并可由 thread 的停止操作取消。

### Tab 与 turn 收口

- tab origin 区分 `agent` 与 `user`；用户 tab 只有经过显式 claim 才进入当前 agent route。
- `turn/completed`、interrupt、backend teardown 和 `tabs.finalize({ keep })` 统一进入 `turnEnded(sessionId, turnId)`。
- 未保留的临时 agent tab 关闭；handoff 留给用户；deliverable 和用户来源 tab 从 agent 控制 release，但不自动关闭。
- finalize 必须清理 debugger listeners、OOPIF target sessions、cursor overlay、capture surface 和 browser-use-active 状态；失败进入有界重试 teardown，不允许留下仍可接收 agent 输入的 tab。

## Tauri 到 Electron 的迁移波次

> **当前排序**：M0-M4 是已经建立的 Electron/Browser 基础；M5 剩余宿主能力、旧宿主删除和 Windows 发布现为唯一当前 P0。Browser 的真实站点与 Windows 场景作为 M5 发布回归执行。

### M0：盘点与冻结（基础已建立）

- 盘点 Tauri commands、events、plugins、windows、resources、capabilities、NSIS 和 CI。
- 为每项能力标记唯一 owner：`renderer-only`、`electron-main/preload`、`app-server`、`gateway` 或 `delete`；node-pty、credential-store、deferred-delete 只能写入 capability 子域。
- 建立宿主无关 TypeScript client，禁止新增直接 Tauri 调用。
- 锁定 Codex、Electron、Node、Rust 与 Windows 构建版本。
- 将 codex 上游锁升级到或超过调研基线 `d06c7ac055920c7cb140c25ebda3f3db20197b45`，并以实际采用的 release/tag/SHA 重跑协议、构建和 Windows 探针。

退出闸口：迁移矩阵完整，每个兼容层有删除任务，dynamic tools 探针有记录。

### M1：Electron 空壳与安全基线（代码基础存在，历史运行待补证）

- 建立 main/preload/renderer 入口，复用现有 Vite renderer。
- 配置 sandbox、context isolation、CSP、自定义 app protocol、导航和 popup 策略。
- 建立 typed IPC、sender validation、结构化日志和 crash diagnostics。
- 为高频流式 notification 和大消息建立有上限的队列、分块/确认或 artifact 合同。
- 建立 main/preload 单测及最小 Playwright Electron smoke。

退出闸口：Windows 可启动、无 Node renderer、非法 IPC 和导航被拒绝；app-server 未启动/未登录时仍能显示 degraded/retry/diagnostics。

### M2：App Server client 与真实 Codex thread（代码基础存在，历史运行待补证）

- Codex auth 的规范副本由原装 app-server/标准 `CODEX_HOME` 管理并与 CLI 共享；BlackRain 自有 provider/Gateway secret 使用 `safeStorage`，Electron 不复制或改写 Codex auth 文件。
- `app-state` 的 workspace/thread 索引带 `codexHomeId` 与 Browser `profileId`，切换 Home/profile 时禁止跨域恢复。

- main 直接监管 bundled `codex.exe app-server`，实现 StdioConnection 与 JSONL dispatcher。
- 建立双向 request/response/notification、初始化、取消、deadline、订阅、退出和重启状态机。
- 迁移项目打开、thread start/resume、turn、流式事件、审批、停止和恢复。
- 分开验证 approval policy 与 sandbox/permission profile，覆盖 app-server server request 和 Windows 工具子进程权限。
- 默认沿用标准 Codex Home，验证与 CLI 共享 config/skills/plugins/thread 恢复；自定义 Home 只作用户显式模式，并始终保持 `browser-data`/`app-state` 独立。
- 验证 rollout JSONL/SQLite 由原装 ThreadStore 管理，Electron 不直接修改持久化文件。

退出闸口：真实模型 thread 在 Electron 中端到端通过，app-server 崩溃、renderer 崩溃和 App 重启可恢复。

### M3：单 tab Browser 纵向切片（代码基础存在，历史运行待补证）

- 建立 Browser backend、registry、main-owned `WebContentsView` 和 bounds/visibility 同步。
- 跑通持久 profile、tab 创建、挂载、隐藏、导航、snapshot、click、type、screenshot。
- 通过 dynamic tool 从真实 Codex thread 操作同一个可见页面 WebContents。
- 实现用户抢占、停止和活动可见性。
- 将 dynamic-tool adapter 标记为 bootstrap，并为 Browser client 替换建立删除闸口。

退出闸口：用户和 agent 共享同一 `WebContentsView` 页面，不存在独立 headless browser；modal 不被 native view 遮挡。

### M4：Browser 产品化（runtime/功能闭环已建立）

- 多 tab、view retention/reparenting、live/suspended/persisted 工作集、恢复、frame/OOPIF、download grant、权限和 popup。
- 标准 stdio MCP + 随包 Node adapter 已通过锁定 `0.146.0` 实制品探针并完成生产切换；继续禁止私有 `nativePipe`、复制 bundled plugin 或永久 dynamic tools。
- 完成 per-session backend、session/turn binding、随机 pipe、目标用户 ACL、无 token/旧 token 拒绝、4-byte LE framing、8 MiB 上限、client id 和断连恢复，并替换 dynamic-tool bootstrap。
- 完成注入式 selector/actionability/增量 ARIA、OOPIF snapshot、route-scoped targets、input-target token 和 hidden capture surface。
- 完成 tab origin/claim/handoff/deliverable、turn/finalize 收口与资源无残留验证。
- 合成站点敏感购买确认/拒绝、实际下载、file chooser 和 App restart 已有 E2E；继续完成真实站点登录、MFA、反自动化、权限、离线和 renderer crash 实测。
- raw CDP Developer mode、企业禁用和审计记录。
- 验证 32 live pages/30 分钟保护候选并锁定实际工作集；记录内存、GPU、DPI、多屏、焦点和输入法基线。

退出闸口：Browser runtime/功能闭环已作为迁移基础接受；Windows 产品矩阵转入 M5 发布回归。

### M5：剩余宿主能力与发布（唯一当前 P0）

- M5 的验收顺序固定为：G1 安装态基础壳（窗口/降级/重试）→ G2 app-server/标准 Home 核心 → G3 宿主能力 → G4 Browser Windows 回归 → G5 删除旧宿主 → Native Clean Gate → G6 签名发布矩阵。
- 迁移文件、Git、终端、设置、凭据、通知、菜单、快捷键、深链和更新。
- 按 Codex App 分层把终端迁移到 Electron main 的 `node-pty` 能力，并把 Electron 自有状态与 Codex ThreadStore 分库、分目录管理。
- 使用 Electron Forge + Vite + MSIX maker 完成 Windows 打包验证。
- `codex.exe`、锁定版本要求的 code-mode/sandbox helper、自有 Browser client、可选 Gateway 和许可证文件作为签名运行资源进入 MSIX；main/App preload/可选 page preload/renderer 进入 ASAR，page preload 额外固定 hash，并启用 Electron fuses 和制品校验。
- 完成安装、首启、升级、回滚、卸载和 Windows 子进程清理；UpdateManager 只校验签名 MSIX/App Installer manifest 并交给 Windows 安装器，不覆盖运行中文件，失败时重新安装上一版签名包回滚。

退出闸口：Electron 成为唯一发布入口，Tauri runtime、adapter、打包和 CI 被删除。

## 建议目录边界

```text
apps/desktop/
  electron/
    main/
      app/
      app-server/
      browser/
      security/
      updates/
    preload/
    shared/
    browser-client/
  src/
    host/
    features/browser/
  src-tauri/
    ...                # 迁移完成前的当前实现
```

目录只有在代码建立后才算存在；本文不构成完成度声明。

## 发布前不可跳过的验证

- 锁定 app-server 版本的 initialize、thread、MCP ready/tool call/metadata 和 dynamic-tools bootstrap 探针。
- Browser bounds 越界、旧 layout revision、旧 window/view generation、跨 thread/profile 和错误 owner 拒绝测试。
- 页面 WebContents 内 `require`、`process`、`window.blackrain` 和 App preload 均不可见；可选 page preload 不向网页暴露全局对象或原始 IPC。
- 未授权本地进程不能调用 Browser backend。
- Browser client 的 session/build/generation、token/ACL、framing、大小限制、断连和迟到消息测试通过。
- 登录保持、用户接管、隐藏运行提示、下载 grant 和权限拒绝通过。
- 注入式 ARIA/locator 不启动外部 Chromium；iframe/OOPIF、input-target、隐藏全页截图、焦点、中文输入法、DPI、多屏、z-order、modal 遮挡和页面 WebContents crash 通过。
- turn/finalize 的 close/handoff/deliverable/release、debugger/cursor/capture/target 清理和工作集恢复通过。
- Electron、app-server、helper 和 Browser 日志不含 token、Cookie、密码或网页正文。
- Windows 安装、更新、回滚、卸载和残留进程矩阵通过。

任何一项只有写入对应 `verification.md` 的日期、版本、环境、命令、制品和结果后，才能从“目标态”升级为“已验证”。
