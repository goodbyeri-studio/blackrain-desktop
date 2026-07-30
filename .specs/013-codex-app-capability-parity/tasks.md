# Codex App 能力补齐任务

## 阶段 0：能力基线

- [x] 完整复核三份 2026-07-26 与一份 2026-07-29 Codex App Browser 研究稿
- [x] 决策 Codex App 是功能和 Browser 控制面第一基线
- [ ] 建立版本化能力矩阵与 evidence level
- [ ] 盘点当前 `codex-rs`、Tauri 壳和拟建 Electron 宿主的能力
- [ ] 为每项能力标记所有权、依赖和验证等级
- [ ] 建立公开来源与 License 记录
- [ ] 对锁定 app-server 验证 experimental API、dynamicTools、`item/tool/call`、取消和结果 schema
- [x] 对本机公开 `codex-cli 0.146.0-alpha.3.1` 和仓库锁定 `codex-cli 0.146.0` 完成 initialize 与 `thread/start.dynamicTools` 探针；真实 server request/tool result/cancel 仍待模型纵向切片

## 阶段 1：Browser backend 与 host

- [x] 定义 renderer/main 的 tab create/list/navigate/close 与 layout 类型合同；Browser tool 合同留在阶段 2
- [x] 建立 BrowserRegistry 与 BrowserViewManager host foundation；BrowserBackend/CDP controller 留在阶段 2/3
- [x] 创建 `persist:blackrain-browser-app` 和页面权限/下载默认拒绝策略
- [x] 实现 main-owned `WebContentsView` factory 和页面 WebContents 安全参数
- [x] 建立 owner window/thread/route/tab/view generation/WebContents 映射；Codex session/turn/debugger 映射留待 Agent 闭环
- [x] 实现 renderer bounds/visibility/layout revision/occlusion 合同、content area 裁剪和 stale revision 拒绝
- [x] 实现 tab 关闭和 window teardown 清理；retention/reparenting/恢复仍待实现
- [x] 实现 thread-scoped Browser 侧栏、tab 创建/选择/关闭、地址导航、后退/前进/刷新/停止与加载/错误/崩溃状态
- [x] 实现 main→preload typed tab 状态事件，以及 renderer ResizeObserver/visibility/modal occlusion 布局同步
- [x] 分离 route/page ownership 与实际 storage partition；所有 P0 页面只使用受管持久 session
- [x] 在创建 page WebContents 前按 owner 强制 64 tab 上限，并验证其他 owner 独立计数
- [x] 首个 host foundation 保持无 page preload；后续 annotation/selection/capture 如需 preload，必须另建固定 hash 的最小合同
- [ ] 建立 live/suspended/persisted/crashed page record、工作集预算和标准 Electron 恢复降级

## 阶段 2：真实 Agent Browser 闭环

- [x] 在 `thread/start.dynamicTools` 注册 `blackrain_browser` 的 list/goto/back/forward/reload/stop 工具
- [x] main App Server client 将 `item/tool/call` 直接路由到同一 Browser registry，并支持 cancel/deadline
- [x] 实现 dynamic-tool bootstrap 的顶层 AX snapshot、30 秒短期 ref、click、type_text 与 current viewport screenshot 受限 CDP 合同
- [ ] 将 dynamic-tool 路径标记为 bootstrap adapter，并建立生产 Browser client 替换闸口
- [ ] 跑通 tabs、navigation、snapshot、locator、CUA 和 screenshot
- [ ] 实现用户接管与 agent 控制状态机
- [ ] 验证真实 app-server Agent 与用户操作的是同一个可见 `WebContentsView` 页面；合成 dynamic tool E2E 已通过
- [ ] 将标准化事件接入可见 UI 与 thread 流程

## 阶段 3：Browser 产品化

- [ ] 实现自有 Browser skill/client 与随机 endpoint、当前用户 ACL、capability token、握手和大小限制的 named pipe JSON-RPC
- [ ] 验证公开 code-mode/node_repl 扩展接缝；不得依赖私有 `nativePipe` 或复制 bundled Browser plugin
- [ ] 为每个 Codex session 建立 backend route，实现 session/build/generation handshake 与 `session_id`/`turn_id` request binding
- [ ] 实现随机 pipe + 当前用户 ACL + capability token + 4-byte LE framing + 8 MiB 上限 + socket client id
- [ ] 固定 Browser client hash、License 和版本，并验证 endpoint/token/session context 不进入 renderer、thread 或日志
- [ ] 在 Browser client 与 dynamic-tool adapter 之间确定唯一生产主路径并删除临时双路由
- [ ] 在现有页面 target 注入 selector/actionability/增量 ARIA runtime；禁止启动独立 Playwright browser
- [ ] 实现 iframe/OOPIF ARIA snapshot 合并和 route-scoped `Target.*` 虚拟化
- [ ] 实现 input-target token、顶层 DOM 输入翻译、跨 origin target fallback 和显式失败语义
- [ ] 实现 hidden full-page capture surface、layout metrics 等待和 finally 恢复
- [ ] 实现 tab origin/claim/handoff/deliverable 与 `turnEnded`/`tabs.finalize({keep})` 收口
- [ ] 实现 frame/OOPIF target/session、dialog、console 和 debugger 恢复
- [ ] 验证 CDP/Electron input、焦点、iframe/OOPIF 和中文输入法
- [ ] 实现一次性 download grant、权限、popup、外部协议和用户 file chooser
- [ ] 实现 Developer mode full CDP、逐次审批和策略禁用
- [ ] 实现 page WebContents/renderer/app-server/App restart 恢复和 stale generation/revision 拒绝
- [ ] 实现 native view z-order、modal/menu/tooltip occlusion 和 bounds fail-closed policy

## 阶段 4：验证与发布

- [x] 单元测试 URL/navigation policy、bounds 裁剪、route ownership、旧 revision 和旧 generation；权限与下载默认拒绝由 Electron E2E/后续策略测试继续覆盖
- [ ] 单元测试跨 profile、错误 owner 和 Agent/user 控制状态机
- [x] 单元测试 AX snapshot 节点/文本上限、turn/document/TTL 失效、click/type_text 命令序列、PNG 类型/大小和 debugger teardown
- [x] Playwright Electron E2E 覆盖本地页面 create/load/layout/list/unsafe-navigation/close host foundation
- [x] Playwright Electron E2E 通过 main-only 合成 `item/tool/call` 覆盖真实可见 WebContentsView 的 snapshot/type_text/click/viewport screenshot，并确认 page id 不变
- [x] renderer 单测覆盖 Browser UI create/navigate/reload/close；Electron E2E 覆盖 UI 入口开合和 main 状态事件
- [ ] Playwright Electron E2E 从真实 thread 的 Browser UI 驱动同一 `WebContentsView`
- [ ] Windows 真实站点登录保持与下载验证
- [ ] MFA、反自动化、iframe/OOPIF、离线、权限拒绝和外部协议验证
- [ ] renderer/page WebContents/app-server 重启、隐藏运行和 App restart 恢复验证
- [ ] Browser client/backend 断连、旧 generation、turn finalize 重试和资源无残留验证
- [ ] 32 live detached pages/30 分钟保护候选的内存、GPU、挂起和恢复验证，并记录最终采用值
- [ ] sidebar resize、DPI、多屏、z-order、modal 遮挡、焦点和输入法验证
- [ ] 普通同用户进程无法访问 Browser backend 的边界测试
- [ ] 记录性能和资源基线
- [ ] 安全与隐私审计

## 阶段 5：后续能力

- [ ] 发布前删除 dynamic-tool bootstrap 或明确关闭生产入口，Browser client 成为唯一生产工具 adapter
- [ ] 增加用户可选临时 profile 和清理流程
- [ ] 根据能力矩阵选择下一批 P0/P1 差距
- [ ] 逐项建立责任层、实现 spec 和验证证据
- [ ] 保持产品文案与 `verification.md` 同步
