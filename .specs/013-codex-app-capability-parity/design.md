# Codex App 能力补齐设计

## 能力账本

能力矩阵至少包含：

| 字段 | 含义 |
|---|---|
| capability | 用户可感知能力 |
| reference | 官方公开说明或合法可观察基线 |
| upstream | 当前锁定 `codex-rs` 是否提供 |
| host | Electron 宿主需要实现什么 |
| status | absent / designed / code-exists / verified / release-ready |
| evidence | spec、测试和人工验证位置 |

协议方法存在、壳层包装存在、UI 存在、E2E 通过和发布可用是五种不同状态。

## Browser 架构

```text
Codex thread
  -> app-server / code-mode tool execution
  -> BlackRain 自有 Browser client（生产目标）
  -> authenticated per-session local transport
  -> Electron main BrowserBackend
  -> BrowserRegistry / BrowserViewManager
  -> main-owned WebContentsView
  -> page WebContents + persistent partition
  -> Electron session API / Chromium CDP
  -> thread event stream + visible browser UI
```

这套功能与控制面高度对齐 Codex App 研究。Electron main 按 Codex Desktop App 架构直接监管 app-server，并为每个 Codex session 建立受管 Browser backend。最早纵向切片可使用公开 dynamic tools 直达同一个 BrowserBackend；生产目标是自有 Browser client + 鉴权本地 transport。两条 adapter 不得长期并存，也不复制私有 Browser client、`nativePipe` 或 Owl 扩展。

Electron main 负责创建、挂载、隐藏、迁移和销毁 `WebContentsView`，并执行全部 Browser backend 操作。网页运行在独立 session 中，不加载 App preload。renderer 只持有 sidebar UI 状态并上报 bounds/visibility/occlusion，不能创建页面 WebContents、取得任意 Electron IPC、指定 partition 或调用未经 main 授权的 Browser API。

Browser 有两条职责不同的控制链：

```text
产品 UI：React renderer <-> preload/contextBridge <-> Electron main
工具控制：Browser client <-> authenticated local transport <-> Electron main BrowserBackend
```

两条链只能共享 main 内的 registry、policy、tab/page record 和事件出口，不能各自维护页面或 CDP 真源。

## Browser 工具接缝

P0 在 `initialize` 启用当前锁定 app-server 支持的 experimental API，并在 `thread/start.dynamicTools` 注册 `blackrain_browser` namespace。main 的 App Server client 直接把 `item/tool/call` 转成有 deadline、可取消的 BrowserBackend request。

```text
app-server request id
  <-> appSessionId / generation
  <-> Browser API request id
```

协议漂移、未知 tool、旧 generation、thread 已停止或 Browser backend 不可用时 fail closed。任何兼容 MCP/Browser client 只能作为同一 BrowserBackend 的 adapter，不能建立第二套 tab/session/CDP 真源。

dynamic-tool 路径只用于最早纵向切片。生产 Browser client 必须在公开、可分发的受信任 runtime 接缝上实现，并满足：

- 每个 Codex session 对应独立 backend route；discovery/handshake 校验 app build、`codexSessionId` 和 backend generation。
- 每个请求携带 `session_id`、`turn_id` 和受限 session context，main 再做 thread/route/page ownership 校验。
- Windows pipe frame 使用 4-byte little-endian payload length + UTF-8 JSON-RPC，单帧上限初始锁为 8 MiB；每个 socket 有 client id，response 只返回请求连接，事件按策略定向或广播。
- endpoint 使用随机后缀和当前用户 ACL，握手使用 256-bit capability token；session/build 过滤不能替代认证。
- client bundle 固定 hash、License 和版本；token、endpoint、请求正文与网页数据不进入 renderer、thread 或日志。

工具分层：

| 层 | P0 能力 | 默认策略 |
|---|---|---|
| tabs/navigation | new/list/select/close/goto/back/forward/reload/stop | 允许，受 thread/route 校验 |
| snapshot/locator | accessibility snapshot/find/click/fill/wait | 允许，结果大小受限 |
| CUA | mouse/keyboard/scroll/viewport | 允许，受控制状态机约束 |
| artifact | screenshot/download metadata/debug log | 受大小、敏感信息和生命周期约束 |
| CDP | 当前 tab/origin 的必要子集 | 优先高层 API |
| full CDP | 任意 Runtime/Network/Target 等 | Developer mode、显式审批、可策略禁用 |

snapshot/locator 在现有页面 target 中注入自有或许可兼容的 selector/ARIA/actionability runtime；禁止调用 `chromium.launch()` 或 `connectOverCDP()` 创建旁路浏览器。DOM snapshot 默认输出增量 ARIA/可访问性文本树，并递归合并可见 iframe/OOPIF，不把完整 HTML 直接塞入模型上下文。

dynamic-tool bootstrap 的首个 CDP 切片先直接读取顶层页面 `Accessibility.getFullAXTree`，最多处理 500 个节点并输出最多 64 KiB 文本；每个页面只保留最新 snapshot，ref 的 TTL 为 30 秒，并绑定 thread、turn、tab、view generation、document generation 与 URL。`click` 只按 ref 的 `backendDOMNodeId` 读取 box model 并发送受限鼠标事件；`type_text` 只运行固定的可编辑元素选择函数和 `Input.insertText`；screenshot 只截当前 viewport 的 PNG，二进制上限 5 MiB。导航、崩溃、关闭、过期和 ownership 漂移均 fail closed。该切片不代表 locator/actionability runtime、iframe/OOPIF 合并、input-target token、中文输入法或 hidden full-page capture 已完成。

## WebContentsView、布局与 registry

renderer 只能发送经过类型约束的用户意图和布局状态：

```text
threadId / browserTabId
windowGeneration / layoutRevision
bounds in DIP
visible / occluded
```

main 校验 sender window、thread/route/profile ownership 后创建 `WebContentsView`，并在构造时固定：

```text
sandbox = true
nodeIntegration = false
nodeIntegrationInSubFrames = false
nodeIntegrationInWorker = false
contextIsolation = true
webSecurity = true
allowRunningInsecureContent = false
webviewTag = false
plugins = false
preload = none | fixed browser-page-preload
popups = disabled
partition = persist:blackrain-browser-app
```

默认保持无 preload。若 annotation、selection、页面 runtime 状态或 capture surface 协调需要专用 page preload，它必须与 App preload 分离、路径由 main 固定、进入制品 hash 校验、只在 isolated world 运行，且不向网页暴露 Node、IPC、token 或 `window.blackrain`。

main 建立 registry：

```text
appSessionId -> ownerWindowId/windowGeneration -> threadId/routeKey
             -> codexSessionId/turnId/backendGeneration
             -> browserTabId/apiTabId -> viewId/viewGeneration
             -> webContentsId -> targetId/debuggerSessionId
```

每次创建、布局、迁移和 Browser API 调用都重新校验该映射。旧 layout revision、旧 window/view generation、跨 thread/profile、错误 owner 和已 teardown route 一律拒绝。

main 把 bounds 约束在窗口 content area 内，再调用 `setBounds()` / `setVisible()`。隐藏运行保留同一个 view/WebContents；tab 迁移由 main 从旧窗口 `contentView` 移除并挂载到目标窗口，同时更新 owner 和 view generation。renderer modal、菜单和 tooltip 不能依赖 DOM z-index 覆盖 native view，必须通过 `occluded` policy 隐藏、裁剪或重新布局页面。

## 浏览器状态

- `appSessionId`：一次 Electron App 运行实例。
- `ownerWindowId` / `windowGeneration`：当前承载 view 的可信窗口和重建代数。
- `profileId`：P0 固定映射到 `persist:blackrain-browser-app`，不包含 secret。
- `routeKey`：thread 与 Browser sidebar 的逻辑路由。
- `browserTabId`：产品 tab 标识；与 API tab 和 Electron id 分离。
- `apiTabId`：Browser tool 对外使用的短生命周期 tab 标识。
- `viewId` / `viewGeneration`：main 内部 view 生命周期和迁移代数。
- `webContentsId`：main 内部页面映射，不暴露 renderer/tool。
- `layoutRevision`：renderer 单调递增的布局版本，阻止旧 bounds 覆盖新布局。
- `controlMode`：`idle`、`agent_requesting`、`agent`、`user_preempting`、`user`、`suspended`、`crashed`。
- `navigationState`：URL、title、loading、canGoBack、canGoForward、crashed。
- `artifact`：截图、下载和用户明确保存的导出物。

sidebar 隐藏不销毁 view/WebContents；hidden agent 活动必须在 thread 中显示 origin、控制方、进度和停止入口。

逻辑 route/page ownership 与 Chromium storage 必须分离。P0 所有页面实际使用同一个 `persist:blackrain-browser-app` session；`routeKey`、`browserStorageId`、generation 和 page record 只用于授权、恢复与生命周期映射，不能被误当成每 tab 独立 Cookie partition。

page record 至少保存 URL、navigation entries、origin、browserStorageId、restore policy、live/suspended/crashed 状态和最后活动时间。初始工作集候选对齐观察值：最多 32 个 detached live pages、选中页面保护约 30 分钟；采用值必须通过 Windows 内存/GPU 测量后锁定。超预算页面进入 suspended/persisted，恢复能力优先使用标准 Electron 可实现路径；不可复制的 Owl snapshot/adoption 必须有 reload + session state 降级语义。

## Tab、Turn 与控制生命周期

- tab origin 区分 `agent` 与 `user`；用户 tab 只有经显式 claim 才进入当前 agent route。
- `turn/completed`、中断、backend teardown 和 `tabs.finalize({ keep })` 统一进入 `turnEnded(sessionId, turnId)` 收口。
- 未保留的 agent 临时 tab 关闭；handoff tab 留给用户；deliverable 与用户来源 tab 从 agent 控制 release，但不自动关闭。
- 收口必须释放 debugger listeners、OOPIF target sessions、cursor overlay、capture surface 和 browser-use-active 状态。
- UI tab id、Browser API tab id、Electron webContents id、CDP target/session id 保持分层，任何一层都不能直接作为另一层的授权依据。

## 权限与隔离

- 默认拒绝摄像头、麦克风、地理位置、通知、剪贴板写入和任意外部协议。
- 仅 sanitized clipboard write 可以作为 P0 默认例外；其他权限按 origin、用途和单次操作确认。
- 下载先取得一次性 grant，绑定 `webContentsId + appSessionId + URL + TTL`，再进入受控流程并展示来源、文件名、大小和目标路径。
- P0 禁止 agent 自动上传文件；file chooser 必须由用户主动完成。
- 新窗口默认转为受控 view 或外部浏览器，不允许任意 popup。
- CDP 只由 main 控制，调试端点不暴露到网络。
- Browser backend 只接受临时 dynamic-tool adapter、通过认证的 Browser client 和经验证的 renderer 意图；普通同用户进程、任意 renderer 和网页均无 endpoint/capability。
- Cookie、密码、Local Storage、原始整页内容和下载正文不进入 Electron/App Server 日志或诊断包；只有用户授权、范围受限的 snapshot/locator/tool result 可以进入 thread。

## CDP、输入与事件

main 使用 page `webContents.debugger` 管理 debugger 1.3、frame/OOPIF target/session 和 CDP event listener。跨进程 iframe 使用 `Target.attachToTarget({ flatten: true })` 建立独立 session；`Target.getTargets`、`Target.closeTarget` 等必须按当前 Browser route 虚拟化，不能向模型暴露整个 App target tree。高层 locator/CUA/snapshot 负责稳定合同，不能让模型默认拼任意 CDP。

顶层 DOM/locator 输入优先使用受控 page runtime 翻译，并携带 input-target token；执行前重新确认 locator 解析后的目标、焦点和 generation 未漂移。跨 origin/OOPIF 走对应 debugger session 的 CDP input 路径；不支持的组合明确失败，不能静默点击或输入到其他元素。Electron `sendInputEvent()` 仅作为经过验证的页面路径。焦点、中文输入法、用户手动输入和 `isTrusted` 行为必须在 Windows 实测。

隐藏页面执行全页截图前，main 建立临时 capture surface/viewport，轮询 `Page.getLayoutMetrics` 达到目标尺寸后截图，并在 finally 中恢复原 bounds、visibility 和 surface。用户工具栏的 `capturePage()` 与 agent 的 CDP/full-page screenshot 是两条合同，不能混用。

Browser 事件由 main 标准化为 tab、navigation、control、permission、download、dialog、console、crash 和 artifact 事件，进入现有 `src/services/events.ts` 单一入口。原始 Cookie、header、密码和无限 console 正文不进入事件流。

## 能力补齐流程

1. 用公开材料和可观察行为定义用户合同。
2. 判断能力属于上游内核、Electron 宿主、BlackRain UI 还是 Gateway。
3. 为跨层能力建或更新 spec。
4. 实现最小纵向切片。
5. 自动化验证加 Windows 人工验收。
6. 只有证据齐全才更新能力状态和产品文案。

## 失败模式

- 页面不可达：展示网络错误并允许重试/返回。
- 登录过期：保留页面，让用户手动重新认证，不收集凭据。
- renderer 崩溃：main 保留 Browser views；renderer 恢复后以新 window/layout generation 重新同步 bounds，旧布局消息失效。
- page WebContents 崩溃：移除 debugger 与 registry 映射，保留 partition，按用户选择重建 tab。
- Browser client/backend 断开：失败当前 pending request，撤销 agent 控制并保留用户页面；旧 backend generation 的迟到 response/notification 一律丢弃。
- turn 收口失败：进入可重试 teardown 队列；不能遗留 debugger session、cursor overlay 或仍可接收 agent 输入的 tab。
- view bounds/遮挡失配：立即隐藏 view，等待当前 owner window 的新 layout revision，不能让页面覆盖安全确认 UI。
- agent 与用户争夺控制：用户输入立即触发 `user_preempting` 并取消待执行 agent 输入，转换期间停止双方输入。
- 工具协议漂移：按锁定 codex 版本运行合同探针并降级为手动浏览。
