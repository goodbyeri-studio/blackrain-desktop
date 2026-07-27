# Codex App 能力补齐决策

## 2026-07-26：以 Codex App 功能与体验对齐为目标

- 决策：BlackRain 以 Codex App 的用户可感知能力、产品体验和合法可观察控制面为第一标杆，自行实现缺失宿主能力。
- 原因：开源 `codex-rs` 是内核，不等于完整桌面产品。
- 边界：不复制、反编译或分发闭源代码和专有资源。
- 影响范围：产品路线、能力盘点、UI、Electron 宿主与验证口径。

## 2026-07-26：in-app browser 是首项 P0

- 决策：内置浏览器与 Electron 迁移并行作为第一优先级，先完成共同纵向切片。
- 原因：浏览器同时验证 Electron 选型、宿主安全边界和 agent/用户协作体验。
- 替代方案：Electron 全量迁移后再开发浏览器；不采用。
- 影响范围：spec 012 的阶段 1 和本 spec 验收顺序。

## 2026-07-26：唯一 agent 内核为 codex-rs

- 决策：能力补齐不得引入任何第二 agent 内核。
- 原因：恢复、审批、工具、事件和模型路径必须只有一套运行时真源。
- 影响范围：所有未来能力 spec 和依赖审计。

## 2026-07-27：Browser 使用 main-owned WebContentsView

- 决策：Electron main 创建并持有每个 `WebContentsView`、page WebContents、session、registry、下载和 CDP；React renderer 只同步 sidebar bounds、visibility、active tab 和 occlusion。
- 原因：Codex 的多 tab、共享页面、隐藏运行、持久 profile、Browser client/RPC、CDP、跨 frame、下载和权限能力都建立在 `WebContents`/session 控制面上，不要求 `<webview>` 标签。`WebContentsView` 可实现相同产品合同，并减少 renderer 创建 guest、attach 授权和 `webviewTag` 带来的攻击面。
- 被替代方案：renderer-created `<webview>` + main attach policy；不采用。
- 代价：native view 不受 DOM z-index、clip 和 layout 自动控制，必须实现 bounds revision、occlusion policy、view retention/reparenting，并实测 DPI、多屏、焦点和输入法。
- 影响范围：Electron webPreferences、renderer sidebar、main registry、安全测试、03/09/10 和 spec 012。

## 2026-07-27：P0 使用单一 App 专属持久 profile

- 决策：P0 使用 `persist:blackrain-browser-app`，对齐 Codex 的跨 thread、跨重启登录保持；profile 属于用户，tab/route 属于 thread。
- 原因：登录保持是 P0 核心功能，不能用每 thread 临时 profile 改写产品合同。
- 风险：已有登录态会放大网页 prompt injection 和跨任务操作风险。
- 缓解：每个 Browser request 做 thread/route ownership 校验，敏感动作确认，hidden activity 可见，P1 增加临时 profile。

## 2026-07-27：P0 Browser 纵向切片通过公开 dynamic tools 接入

- 决策：P0 使用锁定 app-server 的 experimental dynamic tools，把 `item/tool/call` 经 daemon 双向 RPC 转发到 main BrowserBackend。
- 原因：这是原装 app-server 的公开最小接缝，不要求复制 Codex 私有 `browser-client.mjs` 或依赖其专有 Node runtime。
- 漂移策略：每次升级运行协议探针；失败时关闭 agent Browser 控制并保留手动浏览。
- 产品化：验证自有 Browser skill/client + 鉴权 named pipe JSON-RPC；它必须作为同一 BrowserBackend 的 adapter，并与 dynamic-tool adapter 收敛为唯一生产主路径。

## 2026-07-27：Browser client pipe 必须有应用层认证

- 决策：dynamic-tool 纵向切片默认走 main/daemon 受管连接；自有 Browser client 若使用 Windows named pipe，必须使用随机 endpoint、当前用户 ACL、256-bit capability token、握手、frame 大小限制和方法级 ownership 校验。
- 原因：安全研究已动态证明 Codex 当前 Windows pipe 可由普通同用户进程完成 `ping -> pong`。
- 影响范围：本地 transport、capability、日志、威胁模型和边界测试。

## 2026-07-27：高层 API 默认，full CDP 进入 Developer mode

- 决策：tabs、snapshot、locator、CUA 和 artifact 是默认工具；full CDP 需要 Developer mode、显式审批并可由企业策略禁用。
- 原因：对齐 Codex 公开产品行为，并避免把 Cookie/header/任意 Runtime 能力直接交给模型。
- 影响范围：工具 schema、设置、审批、审计和 E2E。
