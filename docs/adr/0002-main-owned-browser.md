# ADR 0002：由 main 持有 Browser 页面

- 状态：已接受
- 日期：2026-08-22

## 背景

Browser 页面同时需要用户可见性、网页隔离、权限、下载和 agent 控制。让 renderer 或网页直接持有页面会扩大权限面，也难以保证用户与 agent 操作同一页面。

## 决策

Electron main 创建和持有 `WebContentsView`、session、权限、下载、debugger 和生命周期。renderer 只提交经过校验的布局与可见性状态；网页不加载应用 preload。

## 影响

所有 Browser API 都必须通过 main backend 做 owner/thread/profile/generation 校验。UI 覆盖层需要显式同步遮挡状态，不能依赖 DOM z-index。
