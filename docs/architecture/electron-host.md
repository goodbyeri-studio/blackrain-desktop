# Electron 宿主

## Main

Electron main 负责窗口生命周期、权限、文件/Git/终端、更新、系统集成，以及 `codex app-server` 和 Browser backend 的进程编排。每个 IPC handler 都校验 sender、窗口角色、参数 schema、workspace/thread ownership 和当前 generation。

## Preload

preload 通过 `contextBridge` 暴露命名的 typed API 和订阅取消函数。它不暴露原始 `ipcRenderer`、Node API、文件路径解析器、`webContents.id` 或任意 channel。

## Renderer

React renderer 只负责产品界面、前端状态和用户意图。它通过 `src/services/desktop.ts` 使用宿主无关的 client，不创建 Browser 页面，不决定 session partition、安全参数或权限结果。

## Browser 页面

main 创建并持有 `WebContentsView`。默认启用 sandbox、context isolation、`nodeIntegration=false` 和安全导航策略；网页使用独立 session，不加载应用 preload。renderer 只同步经过 schema 校验的 bounds、可见性和遮挡状态。

## 失败语义

app-server、Browser 或子进程异常时，main 发送结构化的 degraded/retry/diagnostics 状态。不会静默启动另一个 runtime，也不会把原始错误、token 或 Cookie 写入 renderer 日志。
