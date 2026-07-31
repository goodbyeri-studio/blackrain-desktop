# Codex App 能力补齐验证

> 当前已完成 Electron Browser host/UI、受限 CDP bootstrap、权限/下载/popup、用户接管、窗口/页面/App 重启恢复，以及 bundled Codex 真实模型操作同一可见页面的纵向切片。生产 Browser client、完整 locator/OOPIF/CUA、真实站点登录/授权下载和发布矩阵仍未完成。

## 验证矩阵

| 日期 | 范围 | 方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-07-26 | 唯一内核与 P0 边界 | 文档静态审阅 | 已记录 | 不代表运行能力 |
| 2026-07-27 | 三份 Codex App Browser 研究稿 | 完整原文复核 | 已记录 | 包含静态安全/实现与动态 IAB 时序；不代表 BlackRain 已实现 |
| 2026-07-27 | Browser view/registry/tool/transport 目标合同 | 静态设计审阅 | 已记录 | 采用 Codex 功能控制面 + main-owned WebContentsView |
| 2026-07-29 | Browser tool transport 与 Codex Desktop 主进程拓扑对齐 | 静态设计审阅 | 已记录 | main App Server client 直达 BrowserBackend 只作 bootstrap；不代表代码存在 |
| 2026-07-29 | Codex IAB 页面宿主、per-session backend、pipe、注入式 Playwright、turn/tab 与页面工作集调研 | 完整原文复核 + 文档对齐 | 已记录 | 保留 WebContentsView 差异，补齐其余合同；不代表代码存在 |
| 2026-07-29 | Browser renderer→main 布局合同 | Zod schema + 3 个 layout store 单测 | PASS | bounds/visibility/occlusion、active tab、window/view generation、单调 revision；尚未创建 WebContentsView |
| 2026-07-30 | main-owned Browser host foundation | 4 个 Browser 纯单测 + Electron typecheck + production bundle Playwright E2E | PASS | 真实创建 `WebContentsView`；固定持久 partition；无 page preload；sandbox/Node off/context isolation；owner/thread/route/view generation；bounds 裁剪；popup、权限、下载和非 http(s) 默认拒绝；create/list/navigate/close 通过 Electron Browser session 内置 HTTP fixture |
| 2026-07-30 | Browser UI foundation | renderer 单测 + production bundle Playwright Electron E2E | PASS | 当前 thread scope 的侧栏、tab、地址栏、back/forward/reload/stop、加载/错误/崩溃状态、typed 状态事件和 ResizeObserver/visibility/modal occlusion 已接线；E2E 验证 UI 入口开合、tab 状态事件和 reload/stop，真实 app-server thread 闭环仍未跑 |
| 2026-07-30 | app-server Browser bootstrap 接缝 | fixture 纵向测试 + bundled codex 协议探针 | 部分通过 | fixture 已验证 initialize experimental API、`thread/start.dynamicTools`、`item/tool/call` 结果、cancel/deadline 和同 registry list/goto/navigation；`new_tab` 空 route 由 dynamic-tool adapter 单测覆盖。2026-07-31 `npm run electron:app-server:probe` 已从生产资源布局直接 spawn 锁定 `codex-cli 0.146.0`，并通过 initialize、`thread/start.dynamicTools` 和优雅退出，真实模型 tool call 未跑 |
| 2026-07-30 | 受限 CDP Browser tools | controller/adapter 单测 + Electron typecheck + 本机 codex schema 探针 | 部分通过 | 顶层 AX snapshot（500 节点/64 KiB）、30 秒 ref、turn/tab/view/document/URL 绑定、click、type_text、输入触发导航、5 MiB viewport PNG、取消和 debugger teardown 通过 fake transport；iframe/OOPIF、locator/actionability、input-target token 和真实模型共页未跑 |
| 2026-07-30 | dynamic tool 同一可见页面 E2E | Playwright Electron + main-only 合成 `item/tool/call` | PASS | 开发态显式 E2E harness 穿过真实 adapter/registry/CDP controller；AX ref 输入、点击后 DOM 结果、viewport PNG 和前后相同 `webContents.id` 已验证；harness 不进入 renderer 且 packaged 强制禁用，仍不代表真实 app-server/model tool call 已通过 |
| 2026-07-30 | Browser owner 容量边界 | 4 个 BrowserRegistry 单测 + 全量 Vitest + packaged Electron E2E | PASS | main 在创建 page WebContents 前拒绝同 owner 第 65 个 tab；其他 owner 独立计数；尚未锁定 live/suspended page 工作集预算 |
| 2026-07-30 | Windows CI Browser foundation 回归 | GitHub Actions run `30531502333` / `windows-latest` | PASS | production package、packaged smoke、显式 Electron runtime、Playwright host/UI/同页 dynamic-tool/受限 CDP E2E 与 unsigned MSIX make 通过；CI 使用 DOM 挂载断言且不做虚拟桌面截图，不替代真实站点、签名或安装矩阵 |
| 2026-07-31 | Browser 控制权与宿主恢复 | Browser/main 单测 + 真实子进程 fixture + `npm run electron:e2e` | PASS | Agent 首次输入认领 tab；CDP 合成输入的延迟 Electron input event 在当前事件循环内保持 Agent 标记，不再误触发用户接管；真实用户输入、显式接管、turn 完成或 app-server 异常退出均释放控制权并阻止旧 turn 再输入。页面事件按 reparent 后 record owner 动态发送；窗口 detach/reparent、page crash reload、App 重启恢复 tab id 且 generation 递增均通过 |
| 2026-07-31 | 权限、下载与 popup 产品流 | Browser/main/renderer 单测 + `npm run electron:e2e` | PASS | 权限请求和下载进入 typed tab state；UI 支持拒绝/允许一次、取消/保存；popup 转同 route 受控 tab。E2E 已覆盖权限拒绝和下载 pending/取消，native 保存对话框后的实际文件写入仍待实机验收 |
| 2026-07-31 | bundled Codex 真实模型共页 | `BLACKRAIN_ELECTRON_REAL_AGENT_E2E=1 node scripts/electron-e2e-supervisor.mjs` | PASS | 标准 Codex Home 登录态下真实 thread/turn 调用 `blackrain_browser.screenshot`，命中同一可见 `WebContentsView`；Agent 控制与 turn 释放、页面/App 重启恢复均通过 |
| 2026-07-31 | Browser client framed transport 与制品 | 7 个 transport/socket/子进程测试 + 2 个制品完整性测试 + Electron typecheck + release 校验/package + `make --skip-package`/ZIP 条目检查 | 部分通过 | 自有 client 与 main transport 已实现随机 endpoint、256-bit token、build/session/generation handshake、`session_id`/`turn_id`、4-byte LE、8 MiB、client id、deadline、断连/新 turn 取消；client 版本/hash/License 固定，packaged 摘要与 manifest 一致，MSIX 含三个 `app/resources/browser-client` 文件。renderer/preload/shared 源码扫描无 endpoint/token。Node `net` 无法证明当前用户 ACL，公开 code-mode 接缝和唯一生产切换仍未完成 |
| 2026-07-31 | iframe/OOPIF snapshot 与操作 | 14 个 CDP controller 测试 + production bundle Playwright Electron E2E | PASS | `Page.getFrameTree` + `TargetInfo.parentFrameId` 将 target 限定到当前 page route，排除其他 App/page target；ARIA 树合并、child-session click/type、二次 snapshot、失败路径 detach 和 page/tab teardown 回收通过。Electron 42 下正常 snapshot 失效不主动 detach child session，避免连带关闭 page target。输入前以同一远端 object id 重新验证 activeElement/isConnected，漂移时拒绝 `Input.insertText` |
| 待执行 | 能力矩阵 | 上游协议 + 公开产品行为盘点 | 未跑 | 需要版本化证据 |
| 2026-07-31 | Browser UI 真实 thread 纵向切片 | Playwright Electron + bundled app-server | PASS | workspace 入口、真实 thread/turn、同页 screenshot、控制权和 App 重启恢复已贯通；完整审批和多 thread 并发矩阵仍待执行 |
| 待执行 | Agent 浏览完整闭环 | 真实 Codex thread E2E | 部分通过 | 真实模型共页已通过；完整 locator/CUA/OOPIF、对话框和多页工作集待完成 |
| 待执行 | Browser client transport | Windows pipe + runtime 集成 | 部分通过 | framing/token/session/build/generation/断连和自有 client 子进程已通过；当前用户 ACL、公开 runtime 接缝与唯一生产 adapter 待完成 |
| 2026-07-31 | DOM/ARIA/OOPIF bootstrap | 真实跨站 iframe + CDP controller | PASS | 同一 `WebContentsView` 中跨站 iframe 的 ARIA snapshot、ref click、type_text 和输入结果回读通过；完整 selector/actionability runtime 与中文输入法仍待完成 |
| 待执行 | turn/tab finalize | app-server + Browser backend 集成 | 未跑 | close/handoff/deliverable/release/资源清理 |
| 待执行 | page working set | Windows 多 tab 资源测试 | 未跑 | 32/30m 仅为候选，需锁最终预算和恢复降级 |
| 待执行 | Windows 发布体验 | 实机登录/下载/恢复/权限 | 未跑 | P0 发布闸口 |

## 未验证风险

- 已通过生产资源布局中的 `codex-cli 0.146.0` 完成 initialize、`thread/start.dynamicTools`、真实模型 `item/tool/call` 和同页 screenshot E2E；server request 取消、审批和并发 turn 矩阵仍须继续验证。
- 自有 Browser client、framed transport、固定 hash/License/version 和独立子进程集成已有实现；尚未证明公开 code-mode/node_repl runtime 可承载该 client，且 Node `net` 尚无当前用户 ACL 证据，因此不能替代 dynamic-tool 生产入口。私有 `nativePipe` 和 bundled plugin 仍不可作为实现依赖。
- main-owned `WebContentsView`、registry、Browser UI、dynamic-tool adapter、受限顶层 CDP、窗口 reparent、App/page crash 恢复和真实 app-server/model 共页已有实现；完整 CDP/OOPIF backend、生产 Browser client 和独立进程崩溃矩阵仍未完成。
- 尚未验证登录站点对 Electron session、反自动化策略和多因素认证的兼容性。
- 尚未验证 native Browser view 与 App UI 在多屏、DPI、z-order、modal 遮挡、焦点和中文输入法下的体验。
- typed UI IPC 已验证 sender window、thread/route、view generation 和 stale layout；普通同用户进程、Browser tool transport、真实 thread route 和跨 profile 边界仍未验证。
- dynamic-tool adapter 与 snapshot ref 已校验 thread/active turn；framed transport、Browser client handshake、OOPIF ARIA 合并和 input-target revalidation 已实现。注入式 selector/actionability runtime、ACL/生产接缝、完整 turn finalize 和工作集淘汰仍未完成。
- 标准 Electron 是否足以替代 Owl live adoption/page snapshot 尚未验证，必须保留明确降级。
- 尚未完成与 Codex App 的版本化能力差距账本。
