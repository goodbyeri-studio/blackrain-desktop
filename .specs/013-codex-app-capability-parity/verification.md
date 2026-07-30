# Codex App 能力补齐验证

> 当前完成研究复核、目标控制面、首个 Electron Browser host/UI foundation、受限 CDP bootstrap，以及 Windows 本地和 CI 页面 E2E。真实 app-server thread 的 UI→同一页面闭环、完整 locator/OOPIF/CUA、登录/授权下载/恢复和发布矩阵仍未完成。

## 验证矩阵

| 日期 | 范围 | 方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-07-26 | 唯一内核与 P0 边界 | 文档静态审阅 | 已记录 | 不代表运行能力 |
| 2026-07-27 | 三份 Codex App Browser 研究稿 | 完整原文复核 | 已记录 | 包含静态安全/实现与动态 IAB 时序；不代表 BlackRain 已实现 |
| 2026-07-27 | Browser view/registry/tool/transport 目标合同 | 静态设计审阅 | 已记录 | 采用 Codex 功能控制面 + main-owned WebContentsView |
| 2026-07-29 | Browser tool transport 与 Codex Desktop 主进程拓扑对齐 | 静态设计审阅 | 已记录 | main App Server client 直达 BrowserBackend 只作 bootstrap；不代表代码存在 |
| 2026-07-29 | Codex IAB 页面宿主、per-session backend、pipe、注入式 Playwright、turn/tab 与页面工作集调研 | 完整原文复核 + 文档对齐 | 已记录 | 保留 WebContentsView 差异，补齐其余合同；不代表代码存在 |
| 2026-07-29 | Browser renderer→main 布局合同 | Zod schema + 3 个 layout store 单测 | PASS | bounds/visibility/occlusion、active tab、window/view generation、单调 revision；尚未创建 WebContentsView |
| 2026-07-30 | main-owned Browser host foundation | 4 个 Browser 纯单测 + Electron typecheck + packaged Playwright E2E | PASS | 真实创建 `WebContentsView`；固定持久 partition；无 page preload；sandbox/Node off/context isolation；owner/thread/route/view generation；bounds 裁剪；popup、权限、下载和非 http(s) 默认拒绝；create/list/navigate/close 通过本地 HTTP fixture |
| 2026-07-30 | Browser UI foundation | renderer 单测 + production bundle Playwright Electron E2E | PASS | 当前 thread scope 的侧栏、tab、地址栏、back/forward/reload/stop、加载/错误/崩溃状态、typed 状态事件和 ResizeObserver/visibility/modal occlusion 已接线；E2E 验证 UI 入口开合、7 次 tab 状态事件和 reload，真实 app-server thread 闭环仍未跑 |
| 2026-07-30 | app-server Browser bootstrap 接缝 | fixture 纵向测试 + 本机 codex 协议探针 | 部分通过 | initialize experimental API、`thread/start.dynamicTools`、`item/tool/call` 结果、cancel/deadline 和同 registry list/goto/navigation 已验证；仓库采用版本锁定和真实模型 tool call 未跑 |
| 2026-07-30 | 受限 CDP Browser tools | controller/adapter 单测 + Electron typecheck + 本机 codex schema 探针 | 部分通过 | 顶层 AX snapshot（500 节点/64 KiB）、30 秒 ref、turn/tab/view/document/URL 绑定、click、type_text、输入触发导航、5 MiB viewport PNG、取消和 debugger teardown 通过 fake transport；iframe/OOPIF、locator/actionability、input-target token 和真实模型共页未跑 |
| 2026-07-30 | dynamic tool 同一可见页面 E2E | Playwright Electron + main-only 合成 `item/tool/call` | PASS | 开发态显式 E2E harness 穿过真实 adapter/registry/CDP controller；AX ref 输入、点击后 DOM 结果、viewport PNG 和前后相同 `webContents.id` 已验证；harness 不进入 renderer 且 packaged 强制禁用，仍不代表真实 app-server/model tool call 已通过 |
| 2026-07-30 | Browser owner 容量边界 | 4 个 BrowserRegistry 单测 + 全量 Vitest + packaged Electron E2E | PASS | main 在创建 page WebContents 前拒绝同 owner 第 65 个 tab；其他 owner 独立计数；尚未锁定 live/suspended page 工作集预算 |
| 2026-07-30 | Windows CI Browser foundation 回归 | GitHub Actions run `30531502333` / `windows-latest` | PASS | production package、packaged smoke、显式 Electron runtime、Playwright host/UI/同页 dynamic-tool/受限 CDP E2E 与 unsigned MSIX make 通过；CI 使用 DOM 挂载断言且不做虚拟桌面截图，不替代真实站点、签名或安装矩阵 |
| 待执行 | 能力矩阵 | 上游协议 + 公开产品行为盘点 | 未跑 | 需要版本化证据 |
| 待执行 | Browser UI 真实 thread 闭环 | Playwright Electron + bundled app-server | 未跑 | 基础 UI 已通过单测和壳层 E2E；仍需真实 thread 选择、页面交互、切换恢复和 Agent 共页验证 |
| 待执行 | Agent 浏览闭环 | 真实 Codex thread E2E | 未跑 | bootstrap 工具合同已有 list/goto/navigation/top-level snapshot/click/type_text/viewport screenshot；完整 locator/CUA/OOPIF 和真实共页待完成 |
| 待执行 | Browser client transport | Windows pipe 集成测试 | 未跑 | session/build/generation、token/ACL、4-byte LE、8 MiB、断连 |
| 待执行 | DOM/ARIA/OOPIF | 真实页面 + 注入 runtime | 未跑 | 同一 WebContents、无外部 Chromium、route-scoped targets |
| 待执行 | turn/tab finalize | app-server + Browser backend 集成 | 未跑 | close/handoff/deliverable/release/资源清理 |
| 待执行 | page working set | Windows 多 tab 资源测试 | 未跑 | 32/30m 仅为候选，需锁最终预算和恢复降级 |
| 待执行 | Windows 发布体验 | 实机登录/下载/恢复/权限 | 未跑 | P0 发布闸口 |

## 未验证风险

- 已用本机公开 `codex-cli 0.146.0-alpha.3.1` 证明 initialize 和 `thread/start.dynamicTools`，但仓库尚未升级并锁定采用版本，仍须在 bundled 制品上重跑完整探针。
- 尚未证明公开 code-mode/node_repl runtime 可承载自有 Browser client；私有 `nativePipe` 和 bundled plugin 不可作为实现依赖。
- main-owned `WebContentsView`、registry、Browser UI、dynamic-tool adapter 和受限顶层 CDP controller 已有实现，合成 dynamic tool 已验证操作同一可见页面；窗口间 reparenting、App restart 恢复、完整 CDP/OOPIF backend 和真实 app-server UI thread route 仍未实现。
- 尚未验证登录站点对 Electron session、反自动化策略和多因素认证的兼容性。
- 尚未验证 native Browser view 与 App UI 在多屏、DPI、z-order、modal 遮挡、焦点和中文输入法下的体验。
- typed UI IPC 已验证 sender window、thread/route、view generation 和 stale layout；普通同用户进程、Browser tool transport、真实 thread route 和跨 profile 边界仍未验证。
- dynamic-tool adapter 与 snapshot ref 已校验 thread/active turn；尚未实现生产 framed pipe、Browser client session handshake、注入式 selector/ARIA、input-target token、turn finalize 或工作集淘汰。
- 标准 Electron 是否足以替代 Owl live adoption/page snapshot 尚未验证，必须保留明确降级。
- 尚未完成与 Codex App 的版本化能力差距账本。
