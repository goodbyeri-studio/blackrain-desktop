# Browser 与 Computer Use

Browser 是 Electron 宿主能力，不是第二个 agent runtime。main 创建、持有和销毁页面；用户与 agent 操作同一个可见页面。

## 隔离与所有权

- 使用 main-owned `WebContentsView`；renderer 只能上报经过 schema 校验的 bounds、visibility、active tab 和遮挡状态。
- 页面默认 `sandbox=true`、`nodeIntegration=false`、`contextIsolation=true`，且不加载 BlackRain preload。
- session、权限、下载、CDP、页面崩溃与恢复只由 main 管理。每项操作校验 window、thread、route、profile、view generation 和当前 turn。
- Cookie、密码、Local Storage、截图、下载和控制台输出均是不可信的本地敏感数据，不自动进入模型上下文、日志或诊断包。

## 控制链路

```text
codex app-server -> 标准 stdio MCP adapter -> Browser client
                  -> 鉴权的本地 transport -> main Browser backend
```

发布态使用标准 stdio MCP、随包 Node adapter 与自有鉴权 transport。测试桥接或动态 tools 只能用于测试/bootstrap，不能形成第二条生产控制链路。

Browser 工具使用 tabs、navigation、snapshot、locator、输入、screenshot、Computer Use 和 download 等受控高层能力。任意 CDP 仅在显式开发者模式下开放，并限制到当前页面和 origin。

## 用户优先与恢复

用户的点击、键盘和滚轮优先于 agent 输入。下载、权限、登录、发送、购买和删除等高影响操作默认拒绝或需要 main 颁发一次性授权。页面崩溃、窗口迁移和应用重启时必须清理 debugger/session 资源，再按持久 profile 和导航状态恢复。

通用 Browser 核心使用中性的 owner、activity、surface、page、tab、route 和 generation 标识；BlackRain adapter 才将其映射到 Codex 的窗口、thread 与 turn。它不依赖 React、BlackRain IPC 或 Codex ThreadStore。
