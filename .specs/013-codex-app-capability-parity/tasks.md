# Codex App 能力补齐任务

## 阶段 0：能力基线

- [x] 完整复核三份 2026-07-26 与一份 2026-07-29 Codex App Browser 研究稿
- [x] 决策 Codex App 是功能和 Browser 控制面第一基线
- [ ] 建立版本化能力矩阵与 evidence level
- [ ] 盘点当前 `codex-rs`、Tauri 壳和拟建 Electron 宿主的能力
- [ ] 为每项能力标记所有权、依赖和验证等级
- [ ] 建立公开来源与 License 记录
- [ ] 对锁定 app-server 验证 experimental API、dynamicTools、`item/tool/call`、取消和结果 schema

## 阶段 1：Browser backend 与 host

- [ ] 定义 browser tool / main / renderer 类型合同
- [ ] 建立 BrowserBackend、BrowserRegistry、BrowserViewManager、BrowserCdpController
- [ ] 创建 `persist:blackrain-browser-app` 和页面权限默认拒绝策略
- [ ] 实现 main-owned `WebContentsView` factory 和页面 WebContents 安全参数
- [ ] 建立 owner window/thread/route/tab/view/WebContents/debugger 映射
- [ ] 实现 renderer bounds/visibility/layout revision/occlusion 合同
- [ ] 实现 view retention/reparenting、关闭和恢复
- [ ] 分离 route/page ownership 与实际 storage partition；所有 P0 页面只使用受管持久 session
- [ ] 设计专用 page preload 的 annotation/selection/capture 最小合同、hash 和 isolated-world 测试；若不需要则保持无 preload
- [ ] 建立 live/suspended/persisted/crashed page record、工作集预算和标准 Electron 恢复降级

## 阶段 2：真实 Agent Browser 闭环

- [ ] 在 `thread/start.dynamicTools` 注册 `blackrain_browser` 高层工具
- [ ] main App Server client 将 server request 直接路由到 BrowserBackend，并支持 cancel/deadline
- [ ] 将 dynamic-tool 路径标记为 bootstrap adapter，并建立生产 Browser client 替换闸口
- [ ] 跑通 tabs、navigation、snapshot、locator、CUA 和 screenshot
- [ ] 实现用户接管与 agent 控制状态机
- [ ] 验证 agent 与用户操作的是同一个可见 `WebContentsView` 页面
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

- [ ] 单元测试权限、导航和控制状态机
- [ ] 单元测试 bounds 越界、跨 thread/profile、错误 owner、旧 revision 和旧 generation
- [ ] Playwright Electron E2E 覆盖核心流程
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
