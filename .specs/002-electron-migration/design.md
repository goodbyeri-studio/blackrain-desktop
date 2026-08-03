# Electron 全量迁移设计

> 目标拓扑不代表发布通过。当前代码、运行和产品证据只以 `verification.md` 为准。

## 总体方案

保留 React 产品 UI，以 Electron main/preload 取代 Tauri 宿主；agent、thread、turn、审批和 ThreadStore 直接交给原装 `codex app-server`，桌面特权能力按领域进入 Electron main。

```text
React renderer
  -> typed window.blackrain allowlist
  -> Electron preload
  -> sender/schema/ownership 校验
  -> Electron main host services
       -> codex.exe app-server (stdio JSONL)
       -> files / Git / terminal / settings / credentials / updates
       -> main-owned Browser WebContentsView
```

## 所有权

| 能力 | 目标所有者 |
|---|---|
| thread、turn、审批、工具、沙箱、恢复、ThreadStore | 原装 app-server / codex-core |
| 窗口、菜单、文件对话框、通知、快捷键、更新 | Electron main |
| 文件、Git、终端、系统凭据 | Electron main 的独立领域模块 |
| 最小类型桥和输入/输出 schema | preload + `electron/shared` |
| UI 与前端交互状态 | React renderer |
| Browser 页面、session、权限、下载、CDP | Electron main |
| 非 Responses 模型协议翻译 | 可选 Gateway sidecar |

## 迁移波次

1. E0 安装态可用性：修复原生点击，建立真实 MSIX 核心流程 gate。
2. E1 核心 Codex 产品链路：workspace、标准 Home、账户、模型/config、thread/turn、审批、停止、恢复。
3. E2 桌面宿主：shell、dialog、window、menu、drag/drop、notification、settings、files。
4. E3 工程能力：Git、diff、终端 `node-pty`、快捷键、深链、更新。
5. E4 删除旧宿主：renderer Tauri 依赖归零，删除 Tauri commands、daemon、Rust 打包、NSIS 和兼容 adapter。
6. E5 Windows 发布：正式签名、安装、升级、回滚、卸载、恢复和资源矩阵。

每一波都必须减少可量化的 Tauri 基线；不允许只新增 Electron 旁路而永久保留双实现。

## Typed Host API

- renderer 通过 `src/host/*` 使用宿主无关 API。
- Electron 路径只调用 `window.blackrain`；Tauri fallback 集中在兼容模块并随着波次删除。
- main handler 校验主 frame、窗口角色、schema、workspace/thread ownership 和 generation。
- 外部链接只允许显式协议；文件路径必须是规范化绝对路径或属于已登记 workspace。
- 任何 raw channel、任意文件路径、任意 shell 命令、任意 CDP method 都不得透传给 renderer。

## 状态与存储

- Codex Home：沿用 CLI 标准解析，不由 BlackRain 自动建立第二状态域。
- Electron app-state：窗口、workspace 索引、非 Codex UI 设置和迁移状态。
- Electron browser-data：Cookie、Cache、Service Worker 和 Browser profile。
- 凭据：Windows DPAPI / Electron safeStorage；磁盘不保存明文 session。

## 失败模式

- app-server 不可用：UI 显示单一 runtime 状态并允许重试，不回退 daemon。
- Electron 能力未迁移：隐藏入口或明确禁用，不在点击后才加载 Tauri 并失败。
- host schema/ownership 失败：fail closed，记录不含 secret 的诊断。
- native module/package 失败：阻止 release package，不降级到 Tauri 制品。
- 更新失败：保持当前版本可启动，并保留明确回滚路径。

## 测试策略

- 单元：main service、preload schema、renderer host adapter 和状态 reducer。
- 集成：bundled app-server stdio、标准 Home、审批、进程树、终端和 Git。
- E2E：production bundle 的 Electron UI、Browser、workspace/thread/turn 和系统对话框。
- 产品：签名 MSIX 的安装、首启、升级、回滚、卸载及 Windows 实机输入/显示矩阵。
