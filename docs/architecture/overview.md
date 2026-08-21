# 架构总览

BlackRain 是一个 Electron 桌面宿主，agent 能力由原装 `codex app-server` 提供。每个特权边界只有一个所有者。

```text
React renderer
    -> typed preload API
Electron main
    ├─ app-server client (stdio JSONL)
    ├─ 文件 / Git / 终端 / 设置 / 更新
    └─ Browser backend (WebContentsView)
原装 codex app-server
    └─ codex-rs / Codex Home / thread 与 turn 状态
可选 Model Gateway
    ├─ provider 协议翻译
    └─ 多模型路由与 Auto（公开开发方向）
```

## 所有权

| 能力 | 唯一所有者 |
| --- | --- |
| thread、turn、item、审批、停止、恢复和持久化 | `codex app-server` |
| 窗口、文件、Git、终端、凭据、更新和系统集成 | Electron main |
| UI 状态和展示 | React renderer |
| 页面、session、权限、下载、CDP 和恢复 | Electron main Browser backend |
| provider 协议翻译、模型路由和 Auto 策略 | 独立 Gateway / routing 进程 |

renderer 不能直接访问 Node.js、文件系统、app-server transport 或 Browser `WebContents`。网页不能获得应用 preload 或原始 IPC。

## 数据边界

- 标准 Codex Home 保存上游配置、登录态、skills 和 thread 数据。
- Electron app state 保存窗口、workspace 索引和 UI 设置。
- Browser profile 保存网页 Cookie、Local Storage 和缓存。

模型 registry、provider 能力和路由策略属于 Gateway / routing 边界；它们不能成为第二套 thread、turn、审批或 Browser 状态真源。Auto 的路由结果应通过统一事件和诊断链路对用户可见。

三类数据分开管理；Electron 不直接修改 Codex 的 rollout/SQLite 文件，也不把 Browser 凭据写入 thread 或日志。

## 相关文档

- [Electron 宿主](electron-host.md)
- [App Server](app-server.md)
- [Browser Runtime](browser-runtime.md)
- [安全架构](security.md)
