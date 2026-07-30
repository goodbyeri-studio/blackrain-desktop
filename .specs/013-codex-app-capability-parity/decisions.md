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

## 2026-07-29：确认 Codex 使用 `<webview>`，BlackRain 仍保留 WebContentsView 差异

- 新证据：Codex Electron `26.721.41059` 的 renderer bundle 直接创建 `<webview>`，main 通过 attach policy 接管；构建产物未创建 `WebContentsView`。
- 决策：BlackRain 继续使用 main-owned `WebContentsView`，但文档必须将其标为有意差异，不能再称为页面宿主同构。
- 必须保留：单一持久 profile、session/turn backend、同一页面控制、route/ID 映射、隐藏 capture、tab finalization、注入式 locator runtime 和恢复/工作集合同。
- 复查条件：首个 Windows 纵向切片若无法满足隐藏截图、焦点、输入法、retention 或恢复合同，必须重新评估 `<webview>`，不能用功能缺失掩盖宿主差异。

## 2026-07-27：P0 使用单一 App 专属持久 profile

- 决策：P0 使用 `persist:blackrain-browser-app`，对齐 Codex 的跨 thread、跨重启登录保持；profile 属于用户，tab/route 属于 thread。
- 原因：登录保持是 P0 核心功能，不能用每 thread 临时 profile 改写产品合同。
- 风险：已有登录态会放大网页 prompt injection 和跨任务操作风险。
- 缓解：每个 Browser request 做 thread/route ownership 校验，敏感动作确认，hidden activity 可见，P1 增加临时 profile。

## 2026-07-27：P0 Browser 纵向切片通过公开 dynamic tools 接入（仅作临时 bootstrap）

- 决策：P0 使用锁定 app-server 的 experimental dynamic tools，由 Electron main 的 App Server client 把 `item/tool/call` 直接路由到 main BrowserBackend。
- 原因：这是原装 app-server 的公开最小接缝，不要求复制 Codex 私有 `browser-client.mjs` 或依赖其专有 Node runtime。
- 漂移策略：每次升级运行协议探针；失败时关闭 agent Browser 控制并保留手动浏览。
- 产品化：自有 Browser skill/client + 鉴权 named pipe JSON-RPC 是 Codex 架构对齐的生产目标；它必须作为同一 BrowserBackend 的 adapter，并在发布前替代 dynamic-tool bootstrap。

## 2026-07-27：Browser client pipe 必须有应用层认证

- 决策：dynamic-tool 纵向切片默认走 main 内部 App Server client；自有 Browser client 若使用 Windows named pipe，必须使用随机 endpoint、当前用户 ACL、256-bit capability token、握手、frame 大小限制和方法级 ownership 校验。
- 原因：安全研究已动态证明 Codex 当前 Windows pipe 可由普通同用户进程完成 `ping -> pong`。
- 影响范围：本地 transport、capability、日志、威胁模型和边界测试。

## 2026-07-29：Browser client 按 session/turn 绑定并采用有界 framed JSON-RPC

- 决策：每个 Codex session 建立独立 backend route；discovery/handshake 校验 session、build 和 generation，请求继续携带 `session_id`、`turn_id` 与受限 context。
- framing：Windows 初始合同为 4-byte little-endian 长度 + UTF-8 JSON-RPC，单帧最多 8 MiB；每个 socket 分配 client id。
- 加固：随机 pipe endpoint、当前用户 ACL、256-bit capability token 和方法级 ownership 继续保留；不照搬只靠 runtime bridge/session filter 的信任假设。
- 边界：只自研可审计 client 和协议，不复制 OpenAI `browser-client.mjs`、私有 `nativePipe` 或 bundled plugin。

## 2026-07-29：Playwright 只作为现有页面的注入式语义运行时

- 决策：复用或自研许可兼容的 selector、ARIA、actionability runtime，并注入当前 `WebContentsView` 页面 target；禁止启动第二个 Playwright Chromium 或建立旁路 `connectOverCDP` browser。
- snapshot：默认输出面向模型的增量 ARIA 语义树并递归合并 iframe/OOPIF，不传完整 HTML。
- 输入：locator 解析与执行之间使用 input-target token 防止焦点/目标漂移；跨 origin frame 走对应 CDP target session。

## 2026-07-29：turn completion 是 Browser tab 和资源的强制收口点

- 决策：`turn/completed`、interrupt、显式 `tabs.finalize({ keep })` 和 backend teardown 共享确定性 finalize 协议。
- 语义：临时 agent tab 关闭；handoff 保留给用户；deliverable/user tab release；debugger、target session、cursor 和 capture surface 必须清理。
- 页面预算：32 个 detached live pages 与 30 分钟 selected protection 只作首个候选；实现值由 Windows 资源验证锁定。Owl snapshot/adoption 不可复制，必须设计标准 Electron 降级。

## 2026-07-27：高层 API 默认，full CDP 进入 Developer mode

- 决策：tabs、snapshot、locator、CUA 和 artifact 是默认工具；full CDP 需要 Developer mode、显式审批并可由企业策略禁用。
- 原因：对齐 Codex 公开产品行为，并避免把 Cookie/header/任意 Runtime 能力直接交给模型。
- 影响范围：工具 schema、设置、审批、审计和 E2E。

## 2026-07-30：首个 CDP 切片使用原生 AX tree 与短期 ref

- 决策：dynamic-tool bootstrap 先在同一 `WebContentsView` 的 page debugger 上实现有界 `Accessibility.getFullAXTree`、ref click、固定函数 + `Input.insertText` 和 current viewport PNG；不暴露任意 CDP。
- 绑定：snapshot/ref 同时绑定 thread、active turn、tab、view generation、document generation、URL 和 30 秒 TTL；每个页面只保留最新 snapshot。
- 上限：最多处理 500 个 AX 节点、输出 64 KiB 文本，PNG 二进制最多 5 MiB，保证结果低于 App Server 8 MiB frame 候选上限。
- 明确未完成：iframe/OOPIF、locator/actionability、input-target token、hidden full-page capture、用户抢占和真实模型共页仍按后续任务推进。

## 2026-07-30：Browser tab 容量由 main 在创建前强制执行

- 决策：每个 owner window generation 最多持有 64 个 Browser tab；main 在创建 `WebContentsView` 前检查容量，不能只依赖 preload/Zod 返回 schema 拒绝超长列表。
- 原因：客户端 schema 失败发生在 page WebContents 创建之后会留下不可管理的页面与状态事件；容量必须在资源所有者处 fail closed。
- 隔离：不同 owner 独立计数；现值与 typed tab list 的 64 项上限一致。后续 page working set 的 live/suspended 预算仍需另行实测锁定。
