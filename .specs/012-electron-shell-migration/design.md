# Electron 桌面壳迁移设计

## 目标拓扑

```text
BlackRain Electron
  ├─ Main process
  │   ├─ window / lifecycle / security / updates
  │   ├─ App Server supervisor / StdioConnection / JSONL dispatcher
  │   ├─ browser backend / WebContentsView registry / session / CDP
  │   └─ spawn bundled codex.exe app-server
  ├─ Preload bridge
  │   └─ typed, allowlisted IPC
  ├─ Renderer
  │   └─ existing React product UI + Browser bounds/state
  ├─ bundled codex.exe app-server
  │   ├─ codex-core / tools / policy
  │   ├─ standard Codex Home / ThreadStore
  │   └─ code-mode/MCP/sandbox helper processes
  └─ optional Model Gateway
```

当前 Tauri `src-tauri` 仍是代码现状。迁移过程中先把 Tauri command 分类为 renderer、Electron host、原装 app-server 或 delete；不再把能力收敛到永久 daemon，也不把 app-server 已有领域逻辑逐字翻译进 Electron main。

## 进程职责

| 层 | 负责 | 不负责 |
|---|---|---|
| Electron main | App 生命周期、窗口、App Server client、原生菜单、权限、浏览器视图、更新 | agent 循环、ThreadStore |
| Preload | 最小类型化 API、事件订阅、参数校验 | 任意 IPC、文件系统直通、网页 preload |
| Renderer | 展示、交互、前端状态编排 | secret、子进程、任意系统调用 |
| codex app-server | thread/turn/item、工具、审批、沙箱、模型、ThreadStore 和 v2 事件投影 | BlackRain UI 和浏览器宿主实现 |

## 目录与模块边界

目标目录按职责拆分，不建立巨型 main 文件：

```text
electron/main/app/       启动、窗口、退出和协议
electron/main/app-server/ supervisor、stdio、JSONL、RPC、subscription
electron/main/browser/   backend、registry、host、CDP、下载、权限
electron/main/security/  sender、navigation、CSP、fuses
electron/main/updates/   制品、签名、更新和回滚
electron/preload/        window.blackrain 类型化 API
electron/shared/         main/preload/renderer 共用纯类型和 schema
src/host/                宿主无关 renderer client
```

目录只有在代码存在后才可写成“当前实现”。

## 本地进程协议

Electron main 直接 spawn bundled `codex.exe app-server`：

```text
Electron main <-> codex app-server stdin/stdout JSONL
Electron main <- codex app-server stderr diagnostics
```

App Server client 要求：

- 线上对象采用 JSON-RPC request/response/notification 语义，但省略 `jsonrpc` 字段并以换行 framing。
- 双端都可发起 request，并支持 response、notification 和 cancellation。
- 完成 `initialize/initialized`，再进入 thread start/resume/subscribe 和 turn 生命周期。
- stdout 只传协议，stderr 只传结构化日志；敏感字段默认脱敏。
- pending request、消息大小、队列和并发有上限；EOF、畸形 JSON 和迟到 response 有确定失败语义。
- 大截图、下载和诊断包返回受控 artifact handle，不无限塞入 JSONL。

当前 daemon 固定 `127.0.0.1:4732` 仅作 Tauri 迁移输入，目标 Electron 不复用该 transport。

## 迁移策略

1. 盘点 Tauri command/event/plugin/window/resource/NSIS/CI，建立迁移矩阵和删除闸口。
2. 建立宿主无关 renderer client 与最小 Electron main/preload/renderer 安全空壳。
3. 建立 main-owned App Server client，跑通真实 Codex thread、审批、停止和恢复。
4. 接入 spec 013 的 Codex 式单 tab Browser 纵向切片。
5. 产品化 Browser，再按能力簇迁移窗口、文件、终端、Git、设置和更新。
6. 完成 Windows 安装与恢复验证后，删除 Tauri 启动、adapter、配置、打包和 CI 链。

迁移期间 React UI 可以复用，但不得形成需要长期双测的 Tauri/Electron 条件分支。临时兼容层必须有删除任务。

## IPC 与安全

- main 只注册显式命名 channel；每个 channel 校验调用来源和参数。
- preload 通过 `contextBridge` 暴露最小 API，不暴露原始 `ipcRenderer`。
- App renderer 启用 Chromium sandbox、Node off 和 `webviewTag: false`。
- main 创建每个 `WebContentsView`，在构造时固定持久 partition、安全 preferences，默认不加载 page preload，并立即建立受管 registry。
- 页面默认无 preload；spec 013 确认需要 annotation/selection/capture 协调时，只允许 main 固定路径、固定 hash、无网页全局暴露的专用 page preload。
- renderer 只上报 bounds、visibility、active tab、window generation、layout revision 和 occlusion；main 校验并约束到所属窗口 content area。
- 产品 UI 使用 preload/main IPC；Browser 工具使用按 Codex session 隔离的鉴权 transport，两条链只能汇入同一个 main BrowserBackend/registry。
- hidden tab 保留同一个 view/WebContents；窗口间迁移由 main 在 `contentView` 之间 reparent，并递增 view generation。
- `will-navigate`、`setWindowOpenHandler`、permission handlers、downloads 和外部协议统一拦截。
- IPC sender 必须按窗口角色校验；Browser request 额外校验 owner window、thread、route、view generation、profile 和 WebContents ownership。
- modal、菜单和 tooltip 与 native view 的 z-order/遮挡通过显式 occlusion policy 处理。
- App Server stdin/stdout、RPC id 表和请求正文不得暴露给 renderer 或网页，敏感日志必须脱敏。

## 失败与恢复

- app-server 崩溃：main 显示可恢复状态并有限重启，不丢 renderer 本地草稿；所有 pending request 明确失败。
- App renderer 崩溃：main 保留 Browser views，重建 UI 后重新同步 layout；旧 window/layout generation 自动失效。
- page WebContents 崩溃：只重建受影响 tab，保留 partition 登录态，并使旧 view/debugger/session 映射失效。
- Electron 更新失败：保留上一版本可启动制品和明确回滚路径。
- 迁移能力未完成：保留在任务清单中，不用 Tauri 隐式兜底冒充 Electron 完成。

## 测试策略

- main/preload IPC 合同单测。
- App Server stdio/JSONL 双向协议与生命周期集成测试。
- Browser client 的 per-session backend、framed pipe、session/turn binding、断连/finalize 和 dynamic-tool bootstrap 删除测试。
- Playwright Electron 测试覆盖关键用户流程。
- Windows 实机测试安装、首启、更新、卸载、权限和多屏/DPI。
- 性能基线记录首帧、首个 thread、空闲内存、对话内存和每个 `WebContentsView` 增量。
- Windows E2E 覆盖 bounds、DPI、多屏、sidebar resize、z-order、modal 遮挡、焦点和中文输入法。

## 打包与更新

- 保持 npm；Electron 工程使用 Forge + Vite + TypeScript + MSIX maker，并以研究快照的 Electron `42.3.0`、Forge `7.11.1`、Vite `8.1.3`、TypeScript `5.9.3`、React `19.2.5` 为首个锁定候选。
- `codex.exe`、锁定版本要求的 `codex-code-mode-host.exe`、`codex-command-runner.exe`、自有 Browser client、可选 Gateway 和许可证文件作为签名运行资源进入 MSIX，不塞进 ASAR。
- renderer/main/App preload/可选 page preload 进入 ASAR；page preload 额外固定 hash，并启用 Electron fuses、自定义 app protocol 和生产 CSP。
- 自动更新只接受受控来源和签名制品；签名、更新源与回滚保留策略在发布前单独落决策和实机证据。
