# 内置浏览器需求

> **状态（2026-07-31）**：唯一当前 P0。Electron、App Server 和 Windows 制品工作只有在直接服务内置浏览器交付时才属于本 spec。

## 背景

BlackRain 使用原装 `codex-rs` / `codex app-server` 作为唯一 agent 内核。开源内核不包含完整桌面 Browser 宿主，因此 BlackRain 在 Electron main 中自行实现可见、可接管、可恢复的 in-app browser，并对齐 Codex App 的公开功能和合法可观察行为。

Electron 迁移代码中已存在安全壳、bundled `codex-cli 0.146.0`、App Server stdio client、main-owned `WebContentsView`、持久 session、Browser UI、受限 CDP/OOPIF、用户接管、page/App 恢复逻辑和真实模型共页 E2E 入口；当前完整产品流程仍由 Tauri 承载。代码存在和历史 E2E 摘要不等于当前运行验证或 Browser 已可发布。

## 用户目标

- 用户在 BlackRain 内打开、登录和操作网页，不跳转到旁路浏览器。
- agent 与用户操作同一个可见页面和 tab，用户可随时接管或停止。
- agent 能完成导航、snapshot、locator/CUA、输入、截图、下载和受控权限流程。
- tab、登录态和必要页面状态在隐藏、窗口切换和 App 重启后可预测恢复。
- Browser 活动、控制方、来源、错误和停止入口在产品 UI 中可见。

## 非目标

- 不完成项目、Git、终端、设置等 Tauri 能力的全量 Electron 迁移。
- 不交付工作台、插件市场、专家市场、OPC 或多 Agent 编排。
- 不修改或分叉 `codex-rs`，不引入第二 agent runtime。
- 不复制 OpenAI 私有 Browser client、bundle、协议密钥、图标、字体或其他专有资源。
- 不启动与可见页面分离的 Playwright/headless agent browser。
- 不把任意网页放入 BlackRain renderer 或 preload 权限域。

## 成功标准

### 功能

- 锁定 runtime 通过标准 stdio MCP 启动随包 Node adapter，由 adapter 加载自有 Browser client；隔离 code-mode V8 只负责调用 MCP 工具，不直接加载 Node 模块。
- 真实 bundled app-server turn 通过唯一生产 Browser adapter 操作用户看到的同一个 `WebContentsView`。
- 创建、切换、关闭、隐藏、恢复、多 tab、导航、snapshot、locator/CUA、截图、下载、权限和用户接管完整可用。
- iframe/OOPIF、dialog、popup、外部协议、file chooser、输入法和 debugger 生命周期有明确行为。
- turn 完成后按 origin/claim/handoff/deliverable/finalize 规则收口 tab 和资源。

### 安全

- Browser 请求绑定 window、thread、route、session、turn、backend generation、tab、view 和 profile ownership。
- renderer、网页、其他 thread、旧 generation，以及未持有当前 capability token 的进程不能越权控制 Browser backend。
- 页面保持 sandbox、Node off、context isolation、web security，不加载 App preload。
- Cookie、Local Storage、认证 token、密码、endpoint 和 capability token 不被自动读取或写入模型上下文、thread、普通日志或诊断包。用户可见 DOM、ARIA snapshot 和截图属于显式 Browser 工具输入，必须在 UI 中可见其来源和作用范围。
- 下载正文不自动进入模型上下文；后续读取下载文件必须经过正常文件工具权限与用户策略。
- 登录、授权、发送、发布、购买、删除及其他不可逆或高影响网页动作执行前，按动作类别和 origin 取得用户确认；页面文本不能自行授予该权限。

本 spec 的本地进程威胁模型依赖 Windows 默认创建者 ACL，不把跨 Windows 账户的独立红队实证列为 P0；也不声称抵御已经取得当前用户身份并能读取其他进程内存、句柄或环境的恶意代码。若产品需要提升到这些攻击者模型，必须先引入独立的进程隔离或原生 ACL broker，并重新评审本 spec。

### Windows 交付

- 真实站点登录保持、MFA/反自动化降级、实际下载、权限拒绝、崩溃恢复通过 Windows 实机验证。
- DPI、多屏、z-order、modal 遮挡、焦点、中文输入法、内存和 GPU 有可复测基线。
- Windows suspend/resume 期间 App Server、Browser transport、页面控制与 CDP observer 有明确的停机和恢复行为，并由真实睡眠/唤醒实机验收。
- release package/MSIX 包含锁定 Codex runtime、Node runtime、Browser MCP adapter 与 Browser client，并通过 hash、License、启动和清理检查。
- `verification.md` 记录具体日期、环境、命令、制品和未验证风险。

## 约束

- Electron 是唯一目标宿主；当前 Tauri 只作产品基线和迁移输入。
- Electron main 直接监管 bundled `codex.exe app-server`；thread、turn、审批、工具路由和 ThreadStore 留在原装内核。
- 默认沿用标准 Codex Home，与 CLI 共享 auth、config、sessions 和可恢复 thread；Browser 数据独立存放。
- P0 使用 App 专属持久 partition `persist:blackrain-browser-app`。
- 标准 Electron 下的最低恢复保证是恢复 tab/route 元数据、URL、可获得的导航记录和持久 session 后重新加载页面；未验证前不承诺恢复 JS heap、未提交表单、滚动位置或 Codex Owl page snapshot。
- full CDP 仅限 Developer mode、逐次审批且可被策略禁用。
- MVP 只以 Windows 实机制品作为发布验收平台。

## 开放问题

- [x] 锁定 `0.146.0` 通过标准 stdio MCP 承载自有 Node Browser adapter；code-mode V8 不加载 `.mjs`，也不依赖 OpenAI 私有 `node_repl`/`nativePipe`。
- [x] Windows named pipe 沿用系统默认创建者 ACL并显式关闭 everyone 读写；P0 以无 token、错误 token、旧 token/generation 和跨 session/turn 自动化作为发布闸口，不要求另一 Windows 账户实证。
- [ ] 标准 Electron 对隐藏 capture、页面挂起和恢复可提供到什么程度；除最低 reload 合同外还能稳定保留哪些状态。
- [ ] 敏感网页动作的分类、确认 TTL、origin 绑定和企业策略覆盖范围。
