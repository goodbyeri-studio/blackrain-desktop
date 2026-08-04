# apps/desktop —— BlackRain 桌面壳迁移边界

> 文件名因兼容已有引用暂保留；`2049` 不是当前产品名。当前实现是 CodexMonitor 衍生的 Tauri + React + Rust，目标宿主是 Electron。产品交付合同见仓库根 `.specs/002-electron-migration/`，可移植 Browser Runtime 源码底座见 `.specs/003-portable-electron-browser-runtime/`，完整迁移路线见 `docs/09` 和 `docs/10`。

## 当前与目标

| 层 | 当前 | 目标 |
|---|---|---|
| 宿主 | Tauri | Electron main/preload |
| UI | React/Vite | 复用到 Electron renderer |
| 后端 | Tauri Rust App + daemon | Electron main App Server client |
| 内核 | 原装 codex app-server | 原装 codex app-server |
| Browser | 尚无产品级 in-app browser | 隔离 WebContentsView/session |

## 保留的 BlackRain 资产

- CODE surface、项目/thread 状态和现有设计系统
- Rust shared core、daemon JSON-RPC 与 app-server 接缝（迁移输入）
- 当前自定义 `CODEX_HOME` 与模型 Gateway 原型
- 已有文件、Git、终端、审批和事件合同

这些资产不是 Electron 已完成的证据。目标态按 Codex App 架构由 Electron main 直接驱动原装 app-server；当前 daemon/shared core 逐项分类迁移并最终删除。

## Electron 目标职责

- main：App Server client、窗口、Browser、权限、下载、弹窗和更新
- preload：最小类型化 allowlist
- renderer：React 产品界面和 Browser chrome
- Browser：独立 partition、CDP、截图、下载、用户接管和恢复

网页不加载 BlackRain preload，不获得 App Server transport 或非必要系统权限。不得引入任何第二 agent 内核。

## 上游与 License

`apps/desktop/` 起源于 [Dimillian/CodexMonitor](https://github.com/Dimillian/CodexMonitor)，既有 MIT 归属按实际代码保留。日常不随手执行 subtree pull；上游同步必须审计差异、License 和迁移影响。Codex App 的闭源代码与专有资源不进入本仓。

## 当前完成度

Electron 工程、Browser 工具合同、WebContentsView、Electron IPC、Windows Electron 打包和完整迁移均未完成。当前 `npm run tauri:*` 只代表旧 Tauri 开发入口，不能写成目标发布命令。
