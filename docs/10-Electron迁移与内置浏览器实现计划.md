# 10 Electron 迁移与内置浏览器实现计划

> **状态（2026-07-27）**：目标架构与实施顺序已决策，代码尚未开始。本文是 [运行时真源](09-运行时架构与里程碑.md) 的实施展开；需求、决策和验收分别以 [spec 012](../.specs/012-electron-shell-migration/) 与 [spec 013](../.specs/013-codex-app-capability-parity/) 为准。

## 结论

BlackRain 以 Codex App 的可观察行为和 Browser 控制面作为第一实现基线：

```text
原装 codex app-server
  -> Browser 工具调用
  -> BlackRain 自有、可审计的本地桥
  -> Electron main Browser backend
  -> browser session / route / tab / page registry
  -> main 创建并持有 WebContentsView
  -> page WebContents
  -> Electron API / Chromium CDP
```

迁移不是把 Tauri command 逐条改写为 Electron IPC，也不是重新实现 Codex 内核。迁移只替换桌面宿主，保留 React 产品界面、Rust daemon/shared core 和原装 `codex-rs`。

## 研究基线

本计划综合以下 2026-07-26 本机研究快照：

- `codex-app-browser-security-architecture.md`：进程权限、guest 隔离、attach 校验、profile、pipe 和供应链边界。
- `codex-app-implementation-architecture.md`：Electron、app-server、dynamic tools、Browser client、registry、CDP 和 hidden host 分层。
- `codex-iab-live-implementation-study.md`：真实验证 `renderer -> webview -> guest WebContents -> debugger` 的创建和操作时序。

观察对象为 Codex Electron `26.721.41059`、Electron `42.3.0`、Chromium `150.0.7871.128`。研究快照不是 OpenAI 私有源码授权，也不是永恒协议；每次更新锁定 Codex 版本都必须重跑协议与行为探针。

证据优先级：

1. Codex App 官方公开行为和本机合法可观察行为。
2. 当前锁定 `codex-rs` 的公开 app-server 协议。
3. Electron 官方 API、安全限制和 Windows 行为。
4. ClawX、Hermes Desktop 等开源项目的通用工程经验。

ClawX 与 Hermes 不定义 BlackRain Browser 产品架构。ClawX 可参考 webview policy、崩溃恢复和打包；Hermes 可参考 sidecar 启动、动态 endpoint、Windows 子进程和更新恢复。两者的可见 Electron 页面与 agent browser 分离，不满足 BlackRain 的共享 IAB 合同。

## Codex 对齐矩阵

| Codex 可观察实现 | BlackRain 目标实现 | 对齐方式 |
|---|---|---|
| Electron main 监管 `codex.exe app-server` | Electron main 监管 Rust daemon，daemon 监管原装 app-server | 保留现有 Rust 领域边界，多一层可审计 supervisor |
| app-server stdio JSONL/JSON-RPC | main/daemon 与 daemon/app-server 均为子进程双向协议 | 不开放固定 TCP 生产入口 |
| renderer 创建 `<webview>` | main 创建 `WebContentsView`，renderer 只同步 sidebar bounds/state | 功能对齐，使用 Electron 推荐的 main ownership |
| main 持有 guest `WebContents` | main Browser backend 持有 view/page WebContents | 同一控制面 |
| conversation/route/generation/storage 校验 | owner window/thread/route/view generation/profile 校验 | 同类服务端授权 |
| hidden Browser host 与 WebContents adoption | view retention、visibility 和 main reparenting | 保留同一页面与登录态 |
| 单一持久 `persist:codex-browser-app` | P0 使用 `persist:blackrain-browser-app` | 登录保持与 App renderer 隔离 |
| Browser client + named pipe | BlackRain 自有 Browser bridge + 鉴权本地 transport | 不复制私有 client，修复 Windows 对端认证缺口 |
| 高层 Playwright/CUA/DOM API + CDP | 高层 Browser API + 受控 CDP | 功能和审批分层对齐 |
| main 管理 download grant | 一次性 download grant | 同类服务端授权 |
| full CDP 独立开关 | Developer mode + 显式审批 + 企业禁用 | 对齐公开产品边界 |

## 目标进程拓扑

```text
BlackRain Electron
  ├─ Main
  │   ├─ WindowManager
  │   ├─ DaemonSupervisor
  │   ├─ BrowserBackend
  │   │   ├─ BrowserRegistry
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
  └─ blackrain_daemon
      ├─ shared domain core
      ├─ original codex app-server
      ├─ dedicated CODEX_HOME
      └─ optional Model Gateway
```

## main、preload、renderer 与 daemon

### Electron main

main 只拥有桌面特权和进程编排：窗口、Browser `WebContentsView`、page WebContents、session、权限、下载、CDP、daemon、更新和系统集成。Browser backend 按领域拆分，禁止形成单个巨型 `main.ts`。

每个 IPC handler 必须校验 sender、窗口角色、参数 schema、thread ownership 和当前 generation。main 不接受 renderer 提供任意 channel、partition、preload 路径、CDP method 或文件路径。

### Preload

preload 只暴露命名方法和取消订阅函数，例如 `threads.start()`、`browser.navigate()`、`browser.setViewportState()`。不暴露原始 `ipcRenderer`、Node API、daemon endpoint、token 或 `webContents.id`。

### React renderer

renderer 继续负责产品 UI、Browser toolbar、侧边栏占位和接管状态。它通过类型化 IPC 上报 bounds、visibility、active tab、window generation 和 modal/遮挡状态，不创建 Browser WebContents，不决定 partition、安全参数、CDP 或服务端 ownership。

### Rust daemon

daemon 保留项目、文件、Git、终端、配置和 app-server 会话真源。它把 app-server 的 Browser tool request 转发给 Electron main，并把结果返回同一 Agent loop；不控制 Chromium，不持有 Cookie，不实现 UI。

## 本地协议

### main 与 daemon

目标 transport 是 main 启动 daemon 后的双向 stdio JSON-RPC：

- stdin/stdout 只传协议，日志只写 stderr。
- 握手包含 `protocolVersion`、`appSessionId`、`generation` 和 capability 集合。
- 两端均可发起 request、response、notification 和 cancellation。
- 所有 request 带 deadline；进程重启后旧 generation 的 response 一律丢弃。
- 截图和下载不无限内嵌 JSON；大对象通过有大小、路径和生命周期约束的 artifact handle 返回。
- renderer 永远看不到 transport 凭据或原始连接。

当前固定 `127.0.0.1:4732` 只属于 Tauri 迁移起点。若第一个切片短期复用 TCP，必须使用 `127.0.0.1:0`、256-bit 随机 capability token，并同时登记删除任务；生产目标不保留固定端口。

### app-server 与 Browser 工具

第一个可验证接缝使用当前公开 app-server 的 experimental dynamic tools：

```text
initialize.capabilities.experimentalApi = true
thread/start.params.dynamicTools += blackrain_browser.*
app-server item/tool/call
  -> daemon pending request
  -> main BrowserBackend
  -> daemon response
  -> app-server tool result
```

每个锁定版本必须先做协议探针。若 dynamic tools schema 或 server request 不匹配，Browser agent 控制必须 fail closed 并降级为手动浏览，不能静默改走第二 agent runtime。

目标高层 API 对齐 Codex Browser 的能力分层：

- `tabs`：new、list、select、close。
- `navigation`：goto、back、forward、reload、stop。
- `snapshot`：accessibility/DOM snapshot、URL、title、frame 信息。
- `locator`：find、click、fill、select、wait、evaluate 的受控子集。
- `cua`：mouse、keyboard、scroll、viewport。
- `artifact`：screenshot、download metadata、debug log。
- `cdp`：默认受限到当前 tab/origin；full CDP 只在 Developer mode。

P0 先用 dynamic tools 完成纵向切片，再验证 BlackRain 自有 Browser skill/client。自有 client 若进入生产，应通过随机 endpoint、当前用户 ACL、256-bit capability token、握手和大小限制保护的 Windows named pipe JSON-RPC 连接同一个 BrowserBackend；client 文件必须固定 hash，token 不进入 renderer 或日志。产品化前必须在 dynamic-tool adapter 与 Browser client adapter 中确定唯一 Browser 工具主路径，不能形成两套 Browser backend 或长期双路由。

## Codex 功能对齐的 Browser view

### WebContentsView 创建与 registry

Browser `WebContentsView` 只由 main 创建。renderer 发起 `browser.openTab` 意图时，main：

1. 校验 sender window、`threadId`、route、profile 和调用权限。
2. 从受管的 `persist:blackrain-browser-app` session 创建 `WebContentsView`。
3. 在构造时固定 `sandbox=true`、`nodeIntegration=false`、`contextIsolation=true`、`webSecurity=true`、`allowRunningInsecureContent=false` 和无 preload。
4. 注册 navigation、popup、permission、download、crash 和 debugger handler。
5. 建立 registry，并在 renderer 提供有效 sidebar bounds 后挂载到目标窗口 `contentView`。

```text
appSessionId
  -> ownerWindowId / windowGeneration
  -> threadId / routeKey
  -> browserTabId / apiTabId
  -> viewId / viewGeneration
  -> webContentsId
  -> debugger target/session
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

### Profile

P0 使用一个 App 专属持久 profile `persist:blackrain-browser-app`，对齐 Codex 的登录保持行为。profile 属于用户，不属于 thread；thread 只拥有 route/tab 控制权。Cookie、Local Storage、密码和浏览历史不写入 thread、模型上下文、daemon 日志或诊断包。

高风险任务的临时 profile 属于 P1，不能用它削弱 P0 对登录保持的验收。

### CDP 与输入

main 通过页面 `webContents.debugger` 管理 debugger 1.3、target/session、frame/OOPIF 和 event listener。默认优先高层 locator/CUA API，不向模型暴露任意 CDP。

鼠标键盘优先使用 CDP `Input.*` 或 Electron `sendInputEvent()`；DOM 语义操作使用受控 locator/evaluate。焦点、iframe/OOPIF、中文输入法、用户手动输入和 `isTrusted` 行为必须在 Windows 实机验证，不默认复制 Codex `<webview>` 的 translated-input 分支。

### 权限、下载和文件

- 页面权限默认拒绝；P0 仅可默认允许 sanitized clipboard write。
- 摄像头、麦克风、地理位置、通知和外部协议按 origin、用途和单次操作确认。
- popup 默认阻止；允许时转换为受管 tab 或显式外部打开。
- 下载必须先取得一次性 grant，绑定 `webContentsId + appSessionId + URL + TTL`。
- agent 自动文件上传在 P0 禁止；文件选择必须由用户主动完成。
- Browser 页面、截图、下载和 console 都是不可信输入。

### 控制状态机

```text
idle -> agent_requesting -> agent
agent -> user_preempting -> user
user -> agent_requesting -> agent
任意状态 -> suspended / crashed
```

用户输入拥有最高优先级，可立即中止待执行 agent 输入。转换期间不接受双方输入；每次转换产生标准化事件，并可由 thread 的停止操作取消。

## Tauri 到 Electron 的迁移波次

### M0：盘点与冻结

- 盘点 Tauri commands、events、plugins、windows、resources、capabilities、NSIS 和 CI。
- 为每项能力标记 `renderer-only`、`Electron host`、`daemon/shared` 或 `delete`。
- 建立宿主无关 TypeScript client，禁止新增直接 Tauri 调用。
- 锁定 Codex、Electron、Node、Rust 与 Windows 构建版本。

退出闸口：迁移矩阵完整，每个兼容层有删除任务，dynamic tools 探针有记录。

### M1：Electron 空壳与安全基线

- 建立 main/preload/renderer 入口，复用现有 Vite renderer。
- 配置 sandbox、context isolation、CSP、自定义 app protocol、导航和 popup 策略。
- 建立 typed IPC、sender validation、结构化日志和 crash diagnostics。
- 建立 main/preload 单测及最小 Playwright Electron smoke。

退出闸口：Windows 可启动、无 Node renderer、非法 IPC 和导航被拒绝。

### M2：daemon 与真实 Codex thread

- main 监管 daemon，daemon 监管 app-server。
- 建立双向 RPC、握手、取消、deadline、重启 generation 和退出顺序。
- 迁移项目打开、thread start/resume、turn、流式事件、审批、停止和恢复。
- 保持 App 专属 `CODEX_HOME`，验证不读写用户 `~/.codex`。

退出闸口：真实模型 thread 在 Electron 中端到端通过，daemon/app-server 崩溃可恢复。

### M3：单 tab Browser 纵向切片

- 建立 Browser backend、registry、main-owned `WebContentsView` 和 bounds/visibility 同步。
- 跑通持久 profile、tab 创建、挂载、隐藏、导航、snapshot、click、type、screenshot。
- 通过 dynamic tool 从真实 Codex thread 操作同一个可见页面 WebContents。
- 实现用户抢占、停止和活动可见性。

退出闸口：用户和 agent 共享同一 `WebContentsView` 页面，不存在独立 headless browser；modal 不被 native view 遮挡。

### M4：Browser 产品化

- 多 tab、view retention/reparenting、恢复、frame/OOPIF、download grant、权限和 popup。
- 验证自有 Browser skill/client + 鉴权 named pipe JSON-RPC，并收敛唯一生产工具 adapter。
- 登录、MFA、反自动化、下载、离线、renderer crash 和 App restart 实测。
- raw CDP Developer mode、企业禁用和审计记录。
- 内存、GPU、DPI、多屏、焦点和输入法基线。

退出闸口：spec 013 的 Windows Browser 矩阵通过。

### M5：剩余宿主能力与发布

- 迁移文件、Git、终端、设置、凭据、通知、菜单、快捷键、深链和更新。
- 采用 Electron Builder/NSIS 方向完成打包验证；最终选型以 spec 012 决策和 License 审计为准。
- daemon、codex 和 Gateway 放 `extraResources`，不塞入 ASAR；启用 ASAR、Electron fuses 和签名制品校验。
- 完成安装、首启、升级、回滚、卸载和 Windows 子进程清理。

退出闸口：Electron 成为唯一发布入口，Tauri runtime、adapter、打包和 CI 被删除。

## 建议目录边界

```text
apps/desktop/
  electron/
    main/
      app/
      daemon/
      browser/
      security/
      updates/
    preload/
    shared/
  src/
    host/
    features/browser/
  src-tauri/
    ...                # 迁移完成前的当前实现
```

目录只有在代码建立后才算存在；本文不构成完成度声明。

## 发布前不可跳过的验证

- 锁定 app-server 版本的 initialize、thread、server request 和 dynamic tools 探针。
- Browser bounds 越界、旧 layout revision、旧 window/view generation、跨 thread/profile 和错误 owner 拒绝测试。
- 页面 WebContents 内 `require`、`process`、`window.blackrain` 和 preload 均不可见。
- 未授权本地进程不能调用 Browser backend。
- 登录保持、用户接管、隐藏运行提示、下载 grant 和权限拒绝通过。
- iframe/OOPIF、焦点、中文输入法、DPI、多屏、z-order、modal 遮挡和页面 WebContents crash 通过。
- Electron、daemon、app-server 和 Browser 日志不含 token、Cookie、密码或网页正文。
- Windows 安装、更新、回滚、卸载和残留进程矩阵通过。

任何一项只有写入对应 `verification.md` 的日期、版本、环境、命令、制品和结果后，才能从“目标态”升级为“已验证”。
