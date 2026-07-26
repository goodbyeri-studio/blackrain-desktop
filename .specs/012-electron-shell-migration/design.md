# Electron 桌面壳迁移设计

## 目标拓扑

```text
BlackRain Electron
  ├─ Main process
  │   ├─ window / lifecycle / permissions / updates
  │   ├─ browser WebContentsView ownership
  │   └─ Rust daemon supervisor
  ├─ Preload bridge
  │   └─ typed, allowlisted IPC
  ├─ Renderer
  │   └─ existing React product UI
  └─ blackrain_daemon (Rust JSON-RPC)
      ├─ shared domain cores
      ├─ original codex app-server
      ├─ dedicated CODEX_HOME
      └─ Model Gateway supervision
```

当前 Tauri `src-tauri` 仍是代码现状。迁移过程中优先把跨宿主能力收敛到 daemon/shared core，再由 Electron main/preload 接入；不把 Tauri command 逐字翻译成 Electron main 中的业务实现。

## 进程职责

| 层 | 负责 | 不负责 |
|---|---|---|
| Electron main | App 生命周期、窗口、原生菜单、权限、浏览器视图、daemon 监管 | agent 循环、领域状态真源 |
| Preload | 最小类型化 API、事件订阅、参数校验 | 任意 IPC、文件系统直通、网页 preload |
| Renderer | 展示、交互、前端状态编排 | secret、子进程、任意系统调用 |
| Rust daemon | 领域逻辑、app-server 会话、配置、Gateway、系统能力 | 桌面窗口和网页渲染 |
| codex app-server | 原装上游 agent 行为 | BlackRain UI 和浏览器宿主实现 |

## 迁移策略

1. 建立最小 Electron main/preload/renderer 启动链。
2. 通过现有 daemon JSON-RPC 跑通一个真实 Codex thread。
3. 接入 spec 013 的持久浏览器纵向切片。
4. 按能力簇迁移窗口、文件、终端、Git、审批、设置和更新。
5. 完成 Windows 安装与恢复验证后，删除 Tauri 启动、配置和打包链。

迁移期间 React UI 可以复用，但不得形成需要长期双测的 Tauri/Electron 条件分支。临时兼容层必须有删除任务。

## IPC 与安全

- main 只注册显式命名 channel；每个 channel 校验调用来源和参数。
- preload 通过 `contextBridge` 暴露最小 API，不暴露原始 `ipcRenderer`。
- 普通 renderer 启用 Chromium sandbox；确需关闭的能力必须单独决策和威胁建模。
- in-app browser 使用独立 `WebContentsView` 和持久 partition，不加载 BlackRain preload。
- `will-navigate`、`setWindowOpenHandler`、permission handlers、downloads 和外部协议统一拦截。
- daemon 使用随机本地凭据或受限管道鉴权；端口、token 和请求正文不得写入日志。

## 失败与恢复

- daemon 崩溃：main 显示可恢复状态并有限重启，不丢 renderer 本地草稿。
- renderer 崩溃：重载 UI，重新订阅 daemon/app-server 状态。
- browser renderer 崩溃：只重建受影响视图，保留 partition 登录态。
- Electron 更新失败：保留上一版本可启动制品和明确回滚路径。
- 迁移能力未完成：保留在任务清单中，不用 Tauri 隐式兜底冒充 Electron 完成。

## 测试策略

- main/preload IPC 合同单测。
- daemon JSON-RPC 集成测试。
- Playwright Electron 测试覆盖关键用户流程。
- Windows 实机测试安装、首启、更新、卸载、权限和多屏/DPI。
- 性能基线记录首帧、首个 thread、空闲内存、对话内存和每个 browser view 增量。
