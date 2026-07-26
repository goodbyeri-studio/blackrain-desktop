# Codex App 能力补齐需求

> **状态（2026-07-26）**：P0，能力盘点与实现尚未开始。第一项交付是 in-app browser；“以 Codex App 为标杆”不等于已达到功能一致。

## 背景

开源 `codex-rs` 提供 agent 内核与 app-server 协议，但完整桌面产品还需要闭源 Codex App 宿主中的界面、浏览器、系统集成、恢复和产品化能力。BlackRain 的核心产品工作是识别这些差距，并在不修改原装内核的前提下补齐可合法复现的行为。

## 用户目标

- 用户获得接近 Codex App 的核心桌面工作流，而不是只能运行开源内核的技术壳。
- agent 可以在 App 内打开和操作网页，用户可以观察、接管、登录、下载并恢复浏览会话。
- 每项“能力已补齐”的声明都有当前锁定 codex 版本、目标平台和真实 E2E 证据。

## 第一项 P0：in-app browser

必须覆盖：

- 创建、切换、关闭和恢复浏览视图。
- 地址导航、后退、前进、刷新和停止。
- 持久且隔离的登录态、Cookie、存储和缓存。
- 页面截图、可观察状态和必要的 CDP 控制。
- 下载、弹窗、外部协议和权限请求。
- agent 操作与用户接管之间的明确状态。
- 导航失败、renderer 崩溃、离线和权限拒绝的恢复。
- 敏感数据、日志和网页 preload 的隔离。

## 非目标

- 不反编译、复制或分发 OpenAI 闭源代码与专有资源。
- 不声称逐字节或未公开内部实现一致。
- 不把第三方网页内容注入 BlackRain renderer 权限域。
- 不为补齐宿主能力引入任何第二 agent 内核。
- 工作台、OPC、专家市场和多 Agent 公司编排不进入当前能力清单。

## 成功标准

- 建立可追踪的能力矩阵：官方公开行为/可观察基线、BlackRain 状态、差距、spec、验证证据。
- in-app browser 在 Electron Windows 制品中完成真实站点 E2E，包括登录保持、截图、下载、权限拒绝和崩溃恢复。
- Codex thread 能调用受控浏览器工具，事件可观察、可停止、可审批。
- 用户可在 agent 执行和手动接管之间切换，不丢页面或 thread 上下文。
- 任何能力只有在 `verification.md` 有证据后才能标记为“已补齐”。

## 约束

- 唯一 agent 内核是锁定版本的原装 `codex-rs` / `codex app-server`。
- Browser 是 BlackRain/Electron 宿主能力，不写入内核 fork。
- App 使用独立 browser partition；网页不获得 BlackRain preload 或 daemon token。
- 研究只使用公开文档、公开协议、合法观察和自有实现。
- MVP 验收平台为 Windows；其他平台结果不能替代 Windows 证据。

## 开放问题

- [ ] 确定 agent 浏览器工具合同与 codex app-server 的最小接缝。
- [ ] 确定 profile/partition 与 BlackRain 账号、项目之间的隔离粒度。
- [ ] 建立 Codex App 能力基线的版本和证据更新流程。
