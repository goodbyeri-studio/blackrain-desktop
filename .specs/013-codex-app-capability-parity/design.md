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
  -> app-server Browser tool request
  -> Rust daemon pending request
  -> authenticated bidirectional main bridge
  -> Electron main BrowserBackend
  -> BrowserRegistry / BrowserViewManager
  -> main-owned WebContentsView
  -> page WebContents + persistent partition
  -> Electron session API / Chromium CDP
  -> thread event stream + visible browser UI
```

这套功能与控制面高度对齐三份 2026-07-26 研究稿确认的 Codex IAB。BlackRain 的差异是：app-server 由 Rust daemon 监管；P0 使用公开 dynamic tools 和双向 RPC；页面使用 main-owned `WebContentsView`；不复制私有 Browser client，也不使用 Windows 无应用层认证的 pipe。

Electron main 负责创建、挂载、隐藏、迁移和销毁 `WebContentsView`，并执行全部 Browser backend 操作。网页运行在独立 session 中，不加载 App preload。renderer 只持有 sidebar UI 状态并上报 bounds/visibility/occlusion，不能创建页面 WebContents、取得任意 Electron IPC、指定 partition 或调用未经 main 授权的 Browser API。

## Browser 工具接缝

P0 在 `initialize` 启用当前锁定 app-server 支持的 experimental API，并在 `thread/start.dynamicTools` 注册 `blackrain_browser` namespace。app-server 发出的 `item/tool/call` 由 daemon 转成有 deadline、可取消的 main request。

```text
app-server request id
  <-> daemon pending request id
  <-> appSessionId / generation
  <-> Browser API request id
```

协议漂移、未知 tool、旧 generation、thread 已停止或 Browser backend 不可用时 fail closed。任何兼容 MCP/Browser client 只能作为同一 BrowserBackend 的 adapter，不能建立第二套 tab/session/CDP 真源。

工具分层：

| 层 | P0 能力 | 默认策略 |
|---|---|---|
| tabs/navigation | new/list/select/close/goto/back/forward/reload/stop | 允许，受 thread/route 校验 |
| snapshot/locator | accessibility snapshot/find/click/fill/wait | 允许，结果大小受限 |
| CUA | mouse/keyboard/scroll/viewport | 允许，受控制状态机约束 |
| artifact | screenshot/download metadata/debug log | 受大小、敏感信息和生命周期约束 |
| CDP | 当前 tab/origin 的必要子集 | 优先高层 API |
| full CDP | 任意 Runtime/Network/Target 等 | Developer mode、显式审批、可策略禁用 |

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
preload = none
popups = disabled
partition = persist:blackrain-browser-app
```

main 建立 registry：

```text
appSessionId -> ownerWindowId/windowGeneration -> threadId/routeKey
             -> browserTabId/apiTabId -> viewId/viewGeneration
             -> webContentsId -> CDP target/session
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

## 权限与隔离

- 默认拒绝摄像头、麦克风、地理位置、通知、剪贴板写入和任意外部协议。
- 仅 sanitized clipboard write 可以作为 P0 默认例外；其他权限按 origin、用途和单次操作确认。
- 下载先取得一次性 grant，绑定 `webContentsId + appSessionId + URL + TTL`，再进入受控流程并展示来源、文件名、大小和目标路径。
- P0 禁止 agent 自动上传文件；file chooser 必须由用户主动完成。
- 新窗口默认转为受控 view 或外部浏览器，不允许任意 popup。
- CDP 只由 main 控制，调试端点不暴露到网络。
- Browser backend 只接受 main/daemon 受管连接；普通同用户进程、renderer 和网页均无 endpoint/capability。
- Cookie、密码、Local Storage、原始整页内容和下载正文不进入 daemon 日志或诊断包；只有用户授权、范围受限的 snapshot/locator/tool result 可以进入 thread。

## CDP、输入与事件

main 使用 page `webContents.debugger` 管理 debugger 1.3、frame/OOPIF target/session 和 CDP event listener。高层 locator/CUA/snapshot 负责稳定合同，不能让模型默认拼任意 CDP。

输入优先使用 CDP `Input.*` 或 Electron `sendInputEvent()`；DOM 语义操作使用受控 locator/evaluate。焦点、iframe/OOPIF、中文输入法、用户手动输入和 `isTrusted` 行为必须实测，不默认复制 Codex `<webview>` 的 translated-input 分支。

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
- view bounds/遮挡失配：立即隐藏 view，等待当前 owner window 的新 layout revision，不能让页面覆盖安全确认 UI。
- agent 与用户争夺控制：用户输入立即触发 `user_preempting` 并取消待执行 agent 输入，转换期间停止双方输入。
- 工具协议漂移：按锁定 codex 版本运行合同探针并降级为手动浏览。
