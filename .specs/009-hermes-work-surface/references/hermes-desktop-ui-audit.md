# Hermes Desktop UI 候选审计

> 审计对象为 Hermes `v2026.7.7.2` / `9de9c25` 下的 `apps/desktop`。仓库根许可证为 MIT（Copyright 2025 Nous Research），但候选文件依赖 Electron、`@assistant-ui/react`、`@nous-research/ui`、xterm、Radix 等第三方包。本文只决定参考/重写边界，不授权整包复制。

## 总结

首个 WORK 纵切不复制 Hermes Desktop 源码。优先提炼状态和交互，用 BlackRain 现有 design system 重写。原因：候选组件普遍耦合 Hermes Gateway WebSocket、nanostores、Electron preload、assistant-ui runtime 或其专属 UI 包，直接复制会带来第二套 chrome 和大规模依赖。

若后续复制具体 MIT 文件，必须在同一 PR：

1. 记录源路径、完整 commit、License 和修改摘要。
2. 加来源文件头。
3. 更新仓库 NOTICE/THIRD-PARTY。
4. 独立核对该文件所引用第三方包的 License。

## 候选矩阵

| 能力 | 主要来源 | 可借鉴行为 | 耦合/依赖 | 决定 |
|---|---|---|---|---|
| Gateway connecting/boot | `src/components/gateway-connecting-overlay.tsx`、`src/app/gateway/hooks/use-gateway-boot.ts` | warm reload 不遮罩、重连退避、sleep 后恢复、boot phase/error | `window.hermesDesktop`、Hermes WebSocket store、nanostores、专属 boot store | 重写为 `WorkRuntimeStatus` + BlackRain DS overlay/status，不复制 |
| Session sidebar | `src/app/chat/sidebar/*` | 分组、虚拟列表、load more、session actions、项目层级 | Hermes session store、drag/drop、virtualizer、专属路由 | 参考信息密度；基于 BlackRain 工作台→项目→任务模型重写 |
| Session resume/cache | `src/app/session/hooks/use-route-resume.ts`、`use-session-state-cache.ts`、`use-session-actions/*` | route resume、恢复 watchdog、局部 cache | Gateway RPC/REST fallback、Hermes route/store | 借鉴失败分级；由 `HermesTaskStore` 和 run status 实现，不复制 |
| Chat assembly | `src/app/chat/index.tsx` | 外部 store runtime、message stream、模型控件、连接状态 | `@assistant-ui/react`、Hermes Gateway、TanStack Query、Hermes stores | 不复制容器；BlackRain 独立 WORK reducer 驱动现有/抽取的中立展示组件 |
| Composer | `src/app/chat/composer/index.tsx`、`hooks/use-composer-queue.ts`、`status-stack/*` | queue/status、Esc cancel、附件、draft、提交防竞态 | assistant-ui、Hermes prompt actions、voice/URL/mention 子系统 | 首版只重写输入、send/stop、busy/approval 状态；高级能力后置 |
| Tool progress/result | `src/components/assistant-ui/tool/fallback.tsx` | 紧凑工具列表、elapsed/error/result 摘要 | `@assistant-ui/react` tool parts、Hermes message shape、ANSI renderer | 参考视觉层级；按 `WorkEvent` 重写 |
| Approval | `src/components/assistant-ui/tool/approval.tsx` | canonical choices、busy、防重复、断连错误 | Gateway `approval.respond` RPC、session id、Hermes store | 行为参考；改接 `/v1/runs/{id}/approval`，不复制 |
| Clarify/user input | `src/components/assistant-ui/clarify-tool.tsx` | pending prompt、选项、过期 prompt 收敛 | Gateway `clarify.respond`、assistant-ui、session event | 阶段 9/10 重写；raw `/v1/runs` 当前没有稳定 clarify event，需 capability/未知事件策略 |
| Message/thread | `src/components/assistant-ui/thread/*` | streaming、timeline、timestamp、编辑态 | assistant-ui runtime、Hermes content parts、Streamdown | 只评估可抽象的纯展示思想；不引入整套 runtime |
| Model settings | `src/app/settings/model-settings.tsx` | model/provider controls | Hermes config/profile stores、Gateway RPC | 产品模型来源服从 002/003；不复制 |
| Skills/MCP | `src/app/skills/*` | skills hub、MCP tab、安装状态 | Hermes dashboard API、store、marketplace assumptions | 服从 spec 008 激活上下文；核心纵切后按需重写 |
| Memory | `src/app/settings/memory/connect.tsx` | provider connect 状态 | Hermes memory provider/API | 阶段 15 评估，不进入首版 |
| PTY | `src/app/right-sidebar/terminal/use-terminal-session.ts` | attach/detach、resize、serialize、WebGL fallback | `window.hermesDesktop.terminal`、`node-pty`、xterm 多 addon | 不复制；若进入产品，复用 BlackRain 现有 terminal 后端和 UI |

## 许可证结论

- Hermes 仓库根许可证允许 MIT 复用，但复制时仍须保留版权和许可文本。
- 当前阶段没有复制任何 Hermes Desktop React 源码，因此无需新增 NOTICE 条目。
- “参考行为后重写”不等于允许复制其依赖组件源码；后续每个复制候选仍需逐文件和逐依赖复核。
