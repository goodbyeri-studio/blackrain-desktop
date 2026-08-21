# Browser Runtime

Browser 是 Electron 的宿主能力，不是第二个 agent runtime。main 创建、持有并销毁页面；agent 通过标准 MCP adapter 调用受控 Browser backend，用户始终可以看到并接管同一个页面。

## 页面与 session

- `WebContentsView` 只在 main 创建，renderer 只提交 bounds、visibility、active tab 和遮挡状态。
- 页面默认 `sandbox=true`、`nodeIntegration=false`、`contextIsolation=true`，不加载应用 preload。
- 持久 Browser profile 与 thread 分离；Cookie、密码和 Local Storage 不自动进入模型上下文或诊断日志。
- 每次请求校验 window、thread、route、profile、view generation 和当前 turn。

## 工具面

生产链路为：

```text
codex app-server -> 标准 stdio MCP adapter -> Browser client
                  -> 鉴权的本地 transport -> main Browser backend
```

工具优先使用 tabs、navigation、snapshot、locator、CUA、screenshot 和 download 等受控高层 API。任意 CDP 只在显式开发者模式下开放，并按当前页面和 origin 限制。

## 用户接管与恢复

用户主动输入优先于 agent 输入；点击、键盘和滚轮可以中止正在等待的 agent 操作。下载、权限、登录、发送、购买、删除等高影响动作需要 main 颁发一次性 grant。页面崩溃、窗口迁移和 app 重启都必须清理 debugger/session 资源，再按持久 profile 和导航状态恢复。
