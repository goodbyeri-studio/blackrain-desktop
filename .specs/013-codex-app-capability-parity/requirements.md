# Codex App 能力补齐需求

> **状态（2026-07-27）**：P0，已根据三份 Codex App 本机研究稿重建 Browser 合同，实现尚未开始。第一项交付是 in-app browser；“已设计”不等于功能一致或发布可用。

## 背景

开源 `codex-rs` 提供 agent 内核与 app-server 协议，但完整桌面产品还需要 Codex App 宿主中的界面、浏览器、系统集成、恢复和产品化能力。BlackRain 以 Codex App 的官方公开功能和合法可观察实现为第一基线，在不修改原装内核、不复制私有代码的前提下自行实现同类控制面。

2026-07-26 三份本机研究稿静态与动态确认：Codex IAB 使用共享页面 WebContents、Browser registry、隐藏运行、单一持久 profile、Electron session/download API 和 `webContents.debugger`；Agent 经 Browser client 与本地 RPC 间接控制 main。BlackRain 采用这些功能与控制面，但以 main-owned `WebContentsView` 实现页面宿主，不采用 renderer `<webview>` 或 ClawX/Hermes 的独立 headless agent browser。

## 用户目标

- 用户获得接近 Codex App 的核心桌面工作流，而不是只能运行开源内核的技术壳。
- agent 可以在 App 内打开和操作网页，用户可以观察、接管、登录、下载并恢复浏览会话。
- 用户与 agent 操作同一个 `WebContentsView` 页面；切换 tab、thread、窗口或 sidebar 不创建旁路页面。
- 每项“能力已补齐”的声明都有当前锁定 codex 版本、目标平台和真实 E2E 证据。

## 第一项 P0：in-app browser

必须覆盖：

- 创建、切换、关闭和恢复浏览视图。
- 地址导航、后退、前进、刷新和停止。
- 持久且隔离的登录态、Cookie、存储和缓存。
- `WebContentsView` retention/reparenting、隐藏运行和 App 重启后的恢复。
- tabs、snapshot、locator、CUA、页面截图、debug log 和必要的 CDP 控制。
- iframe/OOPIF、dialog、console、焦点、输入法和 debugger target/session 生命周期。
- 下载、弹窗、外部协议和权限请求。
- agent 操作与用户接管之间的明确状态。
- hidden agent 活动的 origin、控制方、进度和停止入口。
- 导航失败、renderer 崩溃、离线和权限拒绝的恢复。
- 敏感数据、日志和网页 preload 的隔离。

## 非目标

- 不反编译、复制或分发 OpenAI 闭源代码与专有资源。
- 不声称逐字节或未公开内部实现一致。
- 不把第三方网页内容注入 BlackRain renderer 权限域。
- 不复制 Codex 私有 `browser-client.mjs`、named-pipe 实现、bundle、协议密钥或专有资源。
- 不为补齐宿主能力引入任何第二 agent 内核。
- 不建立与可见 IAB 分离的 Playwright/headless agent browser。
- 工作台、OPC、专家市场和多 Agent 公司编排不进入当前能力清单。

## 成功标准

- 建立可追踪的能力矩阵：官方公开行为/可观察基线、BlackRain 状态、差距、spec、验证证据。
- in-app browser 在 Electron Windows 制品中完成真实站点 E2E，包括登录保持、截图、下载、权限拒绝和崩溃恢复。
- Codex thread 能调用受控浏览器工具，事件可观察、可停止、可审批。
- Browser tool call、owner window、route、tab、view、page WebContents 和 debugger target 均有服务端 ownership 映射与校验。
- 用户可在 agent 执行和手动接管之间切换，不丢页面或 thread 上下文。
- 未授权 renderer、旧 generation、跨 thread 请求和普通同用户进程不能控制 Browser backend。
- 任何能力只有在 `verification.md` 有证据后才能标记为“已补齐”。

## 约束

- 唯一 agent 内核是锁定版本的原装 `codex-rs` / `codex app-server`。
- Browser 是 BlackRain/Electron 宿主能力，通过公开 app-server 接缝接入，不写入内核 fork。
- P0 使用 App 专属持久 partition `persist:blackrain-browser-app`；网页不获得 BlackRain preload、Node、daemon endpoint 或 token。
- `webviewTag` 保持关闭；页面 WebContents 由 main 创建并强制 sandbox、Node off、context isolation、web security 和默认拒绝页面权限。
- full CDP 只在 Developer mode 中逐次批准，并可由策略禁用。
- 研究只使用公开文档、公开协议、合法观察和自有实现。
- MVP 验收平台为 Windows；其他平台结果不能替代 Windows 证据。

## 开放问题

- [ ] 用锁定 codex 版本验证 experimental dynamic tools、server request、tool result 和取消合同。
- [ ] 确定 P1 临时 profile 的产品入口、清理策略和与持久 profile 的切换体验。
- [ ] 在 P0 productization 中验证 BlackRain 自有 Browser skill/client、鉴权 named pipe JSON-RPC，并在其与 dynamic-tool adapter 之间确定唯一生产主路径。
- [ ] 建立 Codex App 能力基线的版本和证据更新流程。
