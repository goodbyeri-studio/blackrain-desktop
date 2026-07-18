# Hermes Desktop 前端迁移矩阵

> 源基线：Hermes `v2026.7.7.2` / `9de9c25` 的 `apps/desktop`。目标不是运行或嵌入 Electron App，而是在 BlackRain WORK domain/controller 上复刻其 Agent 前端；复刻完成后再讨论 BlackRain 个性化。本文只跟踪前端迁移，不扩展 Hermes API、Agent loop 或具体工作台业务。

## 完成口径

每项必须分别记录：

1. `结构`：页面、区域和响应式布局已存在。
2. `状态`：loading/empty/error/offline/running/waiting/terminal 状态齐全。
3. `交互`：键盘、焦点、菜单、队列和面板切换可用。
4. `数据`：只消费现有 BlackRain WORK controller；没有接口时显示真实空态，不使用 fixture 冒充生产数据。
5. `视觉`：壳层、密度、排版、颜色、侧栏、Composer 和状态栏先对齐锁定 Hermes Desktop；共享 modal/toast 等基础原语继续复用 BlackRain DS，不引入 Electron preload 或第二个宿主 App。
6. `验证`：组件测试、typecheck、lint:ds 和 Windows Tauri 人工检查均有证据。

只有六项全部满足才能标记“完成”。静态组件、截图相似或上游已有功能都不能单独算完成。

## 主执行界面

| Hermes Desktop 区域 | 上游主要来源 | BlackRain 目标 | 当前状态 |
|---|---|---|---|
| App/chat shell | `app/shell/app-shell.tsx`、`app/chat/index.tsx` | 单一 BlackRain chrome 内的三栏 WORK shell | 结构已迁移，视觉/Windows 待验收 |
| Session sidebar | `app/chat/sidebar/*` | 任务列表、搜索、状态、选择、新建、紧凑布局 | 已接 TaskStore、状态分组、rename、pin、archive/restore 和响应式导航；fork 会结束上游父 session，需先冻结 BlackRain lineage 状态，不能直接暴露 |
| Chat timeline | `components/assistant-ui/thread/*` | 消息、流式文本、reasoning、工具、审批、错误、输出 | 已接 GFM/链接、项目内文件打开、复制、工具/审批/输出；独立 rich-content 事件合同不存在 |
| Composer | `app/chat/composer/*` | 文件引用、draft、send/stop、queue、编辑/取消、状态行 | 已接操作菜单、`/Skill` completion、项目文件 picker/拖放、durable queue 和 BlackRain 本地听写；URL 上下文与 Hermes voice conversation 无合同入口不伪造 |
| Queue panel | `composer/queue-panel.tsx` | 持久队列、编辑、取消、失败重试 | 已接 BlackRain durable follow-up queue |
| Approval | `components/assistant-ui/tool/approval.tsx` | pending/busy/canonical choices/error | 已接 `/v1/runs/{id}/approval` |
| Clarify | `components/assistant-ui/clarify-tool.tsx` | 提问、选项、Other、过期收敛 | 已展示 prompt/choices 和能力说明；现有 `/v1/runs` 无 response endpoint，不能提交 |
| Scroll affordance | `chat/scroll-to-bottom-button.tsx` | 长时间线回到底部、未读提示 | 已迁移滚动跟随和回到最新按钮 |
| Drop overlay | `chat/chat-drop-overlay.tsx` | 项目文件拖入反馈与拒绝状态 | 已接 Tauri drag/drop、项目根校验、拒绝反馈和 16 文件上限；Windows 待验收 |

## 右侧工作区

| Hermes Desktop 区域 | 上游主要来源 | BlackRain 目标 | 当前状态 |
|---|---|---|---|
| Files rail | `app/right-sidebar/files/*` | 当前任务引用/输出文件、项目入口 | 已接由 `taskId + relativePath` 驱动的受控项目树；Core 拒绝逃逸、symlink/reparse point 并限制 1000 条目录项 |
| Preview | `app/chat/right-rail/preview-*` | 文本/图片/Office 输出预览与打开 | 已接 1 MiB UTF-8 文本、10 MiB 常见图片预览和系统打开；Office/其他二进制不在 WebView 解析 |
| Artifacts | `app/artifacts/*` | 结构化成果列表和选择 | 已接真实 `outputAvailable` 列表和打开动作；不从文本猜测输出 |
| Terminal rail | `app/right-sidebar/terminal/*` | 终端活动、attach/detach、长任务状态 | 已复用 BlackRain `portable_pty + xterm`，由 task Core 解析项目根，显式启动/停止，切换 rail 仅 detach；Agent 工具活动另行保留 |
| Review | `app/right-sidebar/review/*` | 文件变化/结果审阅和确认 | 已按非 Git 语义汇总真实成果、工具、告警和状态；确认/驳回缺 controller 合同 |
| Rail collapse/tabs | `app/right-sidebar/index.tsx` | Files/Tools/Terminal tabs、收起/恢复、窄屏 overlay | 已完成代码级结构 |

## Overlay 与全局入口

| Hermes Desktop 能力 | 上游主要来源 | BlackRain 目标 | 当前状态 |
|---|---|---|---|
| Session picker/switcher | `app/session-picker-overlay.tsx`、`session-switcher.tsx` | 快速任务切换和搜索 | 已迁移 overlay、搜索、键盘选择和 `Ctrl/Cmd+P` |
| Command palette | `app/command-palette/*` | WORK 页面和任务命令导航 | 已迁移 `Ctrl/Cmd+K`、搜索、键盘选择与现有动作路由 |
| Agents/Subagents | `app/agents/*`、`store/subagents.ts` | 展示当前任务的 delegation tree、状态与统计 | 已补 WORK Agent 真实空态；锁定 `/v1/runs` 事件合同没有稳定 Agents tree，当前无数据接线，不能计为功能完成 |
| Model picker | `app/model-picker-overlay.tsx`、`model-visibility-overlay.tsx` | 展示 App 允许模型及当前模型 | 已接当前 Hermes runtime `/v1/models`、搜索/键盘选择与 start/continue/follow-up 模型持久化；不混用 CODE 模型目录 |
| Gateway/runtime status | `app/gateway/*`、`shell/gateway-menu-panel.tsx` | runtime boot/degraded/repair/diagnostics | 已接 BlackRain supervisor/controller |
| Context usage | `shell/context-usage-panel.tsx` | 当前 task token/context 状态 | 已归一化 `run.completed.usage` 并在 timeline/statusbar 展示 input/output/total；上游未给 context window 时不伪造百分比 |
| Status bar | `shell/statusbar-controls.tsx` | runtime、activation、task 状态 | 第一版已迁移 |

## 管理页面

| Hermes Desktop 页面 | BlackRain 迁移边界 | 当前状态 |
|---|---|---|
| Skills hub / MCP tab | 展示当前 activation 的 Skills、plugins、MCP；写操作仍由 Core/008 管理 | WORK Agent + 右 rail 只读视图已接；安装/写操作不在本轮伪造 |
| Model/provider settings | 视觉容器迁移；数据只来自 BlackRain account/provider 合同 | Models & Context 已显示 runtime models、当前模型与真实 run usage；账号级 provider catalog/配置仍待 002 数据合同 |
| Memory settings | 视觉容器和真实禁用/空态；不自行启用跨工作台 memory | 已迁移真实禁用态，明确不读取 Hermes SQLite/不跨工作台共享 |
| Computer-use settings | 展示已安装能力和权限；不在前端安装驱动 | activation permission 视图已接；专用 capability 数据待接 |
| Session settings | BlackRain TaskStore 保留/删除设置，不读取 Hermes SQLite | 已迁移 task/session/status/保留策略、rename、pin、archive/restore；fork 的 parent/child 生命周期仍需 BlackRain lineage 决策 |
| Appearance/notifications/about | 复用 BlackRain 全局设置，不复制第二套设置状态 | WORK Agent 与命令中心已接 BlackRain 全局 Settings 入口 |
| Profiles | 不复制 Hermes profile CRUD；未来多 runtime slot 由 Core 合同决定 | 不进入本轮前端重复实现 |
| Cron/messaging | 页面结构可在对应 BlackRain 工作室 spec 后迁移；当前不制造无后端入口 | 后置，不计 WORK MVP 前端完成条件 |

## 不做字面复制的上游页面

- `pet-*`、`starmap`、marketplace theme 等 Hermes 品牌/娱乐页面不是 Agent 工作界面，不迁移。
- Hermes Electron window controller、preload、Gateway nanostore 和专属更新器不进入 BlackRain。
- 上游 Settings 中与 Hermes 自安装、自卸载、自写 config 相关的入口不迁移；BlackRain App/Core 保持唯一生命周期和配置写入者。
- 上述排除不减少 Agent 前端能力覆盖，只避免引入第二个宿主 App。

## 当前收口结论

现有 BlackRain WORK controller/Event/Activation 合同范围内的 Hermes Desktop Agent 页面、状态容器和前端交互已完成代码级覆盖迁移；没有引入 Electron、Gateway nanostore、第二套设置或伪造数据。此前缺口中的 rename/pin/archive、runtime model picker、run usage、受控项目树、文本/图片预览、WORK PTY 和本地听写已形成真实纵切；WORK Agent 面板也已改为消费真实 model/usage。仍不能宣称“所有 Hermes 功能已接通”：Agents/Subagents 只有真实缺能力态，锁定 run 事件没有稳定 tree 数据；Clarify response 没有提交端点；native session fork 会结束父 session，需先设计 BlackRain task lineage 防止串话；结果确认也没有稳定 controller 合同。Windows Tauri 视觉、键盘和高 DPI 最终验收由用户执行，这些边界不能靠继续画按钮消除。
