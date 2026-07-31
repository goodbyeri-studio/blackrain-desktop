# 内置浏览器权限与隐私审计

> 审计日期：2026-08-01。范围是 Electron renderer、Browser page、原装 app-server 和 BlackRain Browser transport。结论只覆盖当前代码与自动化证据；真实站点和安装态仍按 `tasks.md` 单独验收。

## 结论

当前四个权限域没有共享原始 IPC、Node.js 全局、App preload、app-server stdio 或通用 CDP/eval 能力。Browser 工具只能通过 main-owned registry、标准 stdio MCP adapter 和受鉴权 transport 操作同一 `WebContentsView`。Cookie、Storage、密码、transport secret 和下载正文不会被自动加入模型上下文。

审计结论为 `RUN_PASS`，但不把跨 Windows 账户独立实证或真实网站流程声明为 `PRODUCT_PASS`。named pipe 使用系统默认创建者 ACL并关闭 everyone 读写；当前 threat model 不抵御已取得当前用户身份并能读取进程内存、句柄或环境的恶意代码。

## 权限域

| 权限域 | 允许 | 明确禁止 | 代码与自动化证据 |
|---|---|---|---|
| App renderer | 类型化 preload allowlist、渲染 UI、提交经 schema 校验的命令 | Node.js、原始 IPC、任意导航、popup、设备权限、Browser page attachment | `create-main-window.ts`、`app-session.ts`、`preload/index.ts`；packaged smoke 与 Electron E2E |
| Browser page | 标准网页能力、持久 Browser partition、用户确认后的有限权限/下载/file chooser | App preload、Node.js、`webviewTag`、不安全内容、任意外部协议、默认设备权限、app-server transport | `browser-view-manager.ts`；Electron security audit、popup/permission/download/file chooser E2E |
| app-server | 原装 `codex.exe app-server` stdio、标准 Home、标准 stdio MCP 启动 | renderer 直连 stdio、发布态 dynamic tools、重复/错误 workspace 审批响应 | `app-server-runtime.ts`、`agent-event-stream.ts`、`register-ipc.ts`；runtime/probe tests |
| Browser transport | 随机 endpoint、256-bit capability、8 MiB framed JSON-RPC、session/thread/turn/generation/route/tab ownership | 无 token、错误/旧 token、跨 turn/session、过期 generation、超时后响应、未注册 thread | `browser-client-transport.ts`、`browser-mcp-runtime.ts`、随包 adapter/client；transport 与 bundled app-server probes |

## 数据流

- 自动进入模型的 Browser 内容仅来自显式 snapshot、locator 结果和 screenshot；它们对应 UI 中可见的当前 origin 和控制状态。
- snapshot 使用 AX tree，不调用 Cookie、Storage、Network credential 或密码读取 API。isolated selector runtime 只保存单调递增的 DOM revision，不读取或导出页面数据。
- console 普通输出在 main 中裁剪并按 password/cookie/authorization/secret/token/key 关键词整条脱敏；source URL 清除 username/password。
- capability token 进入 Electron main 内存、app-server 启动环境和 MCP 子进程白名单环境；Codex 启动参数用增量 `shell_environment_policy.filters` 将 `BLACKRAIN_BROWSER_*` 从 agent shell 子进程环境排除。adapter 启动后立即从 `process.env` 删除 token；token 不进入命令行值、renderer、thread 或普通日志。
- 下载只有 metadata 进入 UI；同一 tab 的旧待确认请求在新请求到达时清理，所有待确认项由 main-owned TTL timer 有界回收。正文保存到用户确认的路径，不自动进入模型。file chooser 只由用户选择或确认，并绑定当前 tab/request TTL。
- Browser 持久 partition 与 App renderer session 分离；Browser session state 只保存 URL、标题、导航、claim/handoff/deliverable 和 profile 引用，不保存 Cookie、Storage 或表单正文。

## Fail-closed 路径

- renderer/page navigation、popup、外部协议和权限默认拒绝。
- Browser ownership 或任一 generation 漂移时拒绝操作；snapshot/ref 在 navigation、freeze、turn 结束或 TTL 后失效。
- 敏感动作 grant 绑定 origin、category、session/turn、view generation 和 TTL，且只能消费一次；Enter/Space 等键盘激活在输入分发前也经过同一确认路径。
- app-server request 在取消、超时、EOF、崩溃、退出或 runtime restart 后拒绝；发布态 `item/tool/call` dynamic tools 直接拒绝。
- Browser transport 在 framing 超限、握手失败、断连、deadline 或 cancel 后终止 pending 请求并释放控制权。

## 剩余人工闸口

- 使用签名安装态验证首次登录、真实站点 MFA/反自动化、系统权限提示和诊断包内容。
- 对可见 snapshot/截图中的个人信息执行产品级告知与保留策略评审。
