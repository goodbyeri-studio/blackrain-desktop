# Tauri 到 Electron 迁移矩阵

> **状态（2026-07-29）**：M0 首次静态盘点。矩阵描述当前 Tauri 输入和目标 owner，不代表 Electron 能力已实现。逐命令覆盖由 `npm run check:host-boundary` 校验；实现与验证状态仍以本 spec 的 `tasks.md` 和 `verification.md` 为准。

## 分类规则

| 当前模块 | 目标 owner | Browser-first 波次 | 删除闸口 |
|---|---|---|---|
| `codex::*` | 原装 app-server；逐命令判断直接协议映射或删除 | M2 | Electron 真实 thread、审批、停止和恢复通过后删除 daemon adapter |
| `settings/files/menu/tray/workspaces/git/prompts` | Electron main + typed preload | M1/M5 | 对应 Electron IPC 合同和回归测试通过 |
| `terminal::*` | Electron main `node-pty` | M5 | ConPTY、resize、停止和子进程清理通过 |
| `model_gateway::*` | 可选 Gateway sidecar 的 main supervisor | M5 | 随 Electron 生命周期与凭据边界验证完成 |
| `dictation/local_usage/notifications/account_session` | Electron main + 最小 preload | M5 | Windows 权限、凭据和通知测试通过 |
| `workbench/office/tailscale` | 暂停路线，默认 delete/deferred review | 不进入 P0 | 新决策明确恢复，否则删除 UI 和宿主入口 |
| 根命令 `is_mobile_runtime` | delete/deferred review | 不进入 Windows MVP | Electron Windows 入口不再消费 |

`codex::*` 不能按函数名机械翻译为 Electron IPC。thread、turn、item、审批、模型、MCP、skills、plugins、ThreadStore 和恢复优先直接使用 app-server v2 协议；只属于旧 daemon 或暂停路线的组合逻辑进入删除清单。

## 当前盘点

自动检查在 2026-07-29 识别到 194 个注册 command，其中 83 个进入 app-server 逐命令复核、75 个进入 Electron main/preload、11 个属于 Gateway sidecar 监管、4 个属于 Electron terminal、3 个属于凭据存储、18 个属于暂停或删除复核。renderer 当前有 74 个唯一“文件 + Tauri package”直接依赖基线。

| Surface | 当前入口 | 当前规模/内容 | 目标与验证 |
|---|---|---|---|
| Commands | `src-tauri/src/lib.rs` 的 `generate_handler!` | 自动审计全部注册项 | 每个命令模块必须命中上述 owner；未知模块使 CI 失败 |
| Renderer wrappers | `src/services/tauri.ts` | 集中包装大部分 invoke，但混合多个领域 | 按领域迁入 `src/host` 类型化 client，不提供 raw invoke |
| Events | `src/services/events.ts` | app-server、terminal、dictation、updater、tray、menu | 保持单一标准化入口；Electron IPC 适配替换 Tauri listen |
| Direct imports | `src/**/*.ts(x)` | Tauri API 与 liquid-glass 的既有直接引用 | 基线允许减少、拒绝新增；逐波迁入 `src/host` |
| Plugins | opener/dialog/notification/process/updater/liquid-glass | Tauri 宿主插件 | 分别迁到 shell/dialog/Notification/lifecycle/update/Windows effect owner |
| Windows | main + about WebviewWindow、tray/menu | Tauri window label 与 drag region | Electron BrowserWindow 角色、sender 和 generation 校验 |
| Resources | codex/Python/OfficeCLI 等 Tauri resources | 现有发布输入，不等于 Electron 制品 | 按 runtime/License/hash 重新审计，运行资源不进入 ASAR |
| Packaging | Tauri config + NSIS | 当前 Windows 发布入口 | Forge + Vite + MSIX 验证后删除 |
| CI/scripts | JS checks + Windows Rust/Tauri build/release | 当前基线仍有效 | M1 增 main/preload/smoke；M5 切换 MSIX 并删 Tauri 入口 |

### Plugin 与 capability

| 当前能力 | 来源 | 目标 |
|---|---|---|
| opener | Rust/JS Tauri plugin | Electron `shell` 的固定方法 allowlist，不暴露任意协议执行 |
| dialog | Rust/JS Tauri plugin | Electron main dialog + typed preload |
| notification | Rust/JS Tauri plugin | Electron Notification + Windows 实机权限验证 |
| process | Rust/JS Tauri plugin | 只保留受管 lifecycle/relaunch，不暴露 raw process |
| updater | desktop Tauri plugin + GitHub endpoint | M5 更新、签名与回滚模块；方案锁定前不迁移旧 endpoint |
| window-state | desktop Rust plugin | Electron BrowserWindow 状态与恢复模块 |
| liquid-glass | Rust/JS plugin | Windows MVP 删除/降级；不进入 Browser 前置链 |

当前 capability 文件同时授权 `main/about` 桌面窗口，并保留 mobile main 权限。Electron M1 只建立 Windows app renderer 角色；旧 mobile capability 不进入当前发布目标。当前 Tauri CSP 为 `null` 且 asset protocol scope 为 `**/*`，只能作为迁移风险输入，不能复制到 Electron 安全空壳。

### Window、resource 与制品入口

| 类型 | 当前输入 | 迁移处理 |
|---|---|---|
| Window | 配置创建 `main`；menu 动态创建 `about` | M1 建立显式窗口角色、sender 校验和 generation；Browser page 不属于这两个 preload 角色 |
| Windows bundle | NSIS，`BlackRain2049` 历史标题 | M5 替换为 MSIX；历史兼容名不得进入新产品文案 |
| Codex | `resources/codex/windows-x64` | M2 按锁定版本、hash、签名、helper 和 License 重新 vendor |
| Python | `resources/python/windows-x64` | 不属于 Browser/App Server 必需链；用途审计后迁移或删除 |
| Gateway | `gateway/gateway.py` | 可选 sidecar，保持独立，不进入 ASAR 或 Browser backend |
| OfficeCLI/plugin/workbench | `resources/office-cli`、`plugins/office-cli`、`workbenches/office-agent` | 暂停路线，不进入 P0 Electron/Browser 制品 |
| Icons/macOS/iOS | Tauri icons、entitlements、Info.plist 与移动脚本 | Windows MVP 不迁移；保留为历史开发资产直到 M5 删除闸口 |

## Browser-first 实施波次

### M0：边界冻结

- 以本矩阵和自动检查阻止新增 Tauri 直连。
- 锁定 Electron/Node/Codex 候选并完成 License 与协议探针。
- 只建立 Browser 纵向切片需要的宿主合同，不迁移 Git、终端、更新等剩余能力。

### M1：Browser 安全空壳

- 建立 Electron main/preload/renderer。
- 建立窗口角色、sender validation、CSP、导航和 popup policy。
- 建立 Browser bounds、visibility、layout revision、occlusion 的类型合同。

### M2：最小 App Server client

- 实现 initialize、双向 request/response/notification、thread/turn、dynamic tool、cancel、stderr 和 EOF。
- 只迁移真实 Browser 闭环所需的 thread 流程；其余当前能力保留为迁移输入。

### M3：单 tab Browser 闭环

- main 创建并持有 `WebContentsView`、持久 session 和 registry。
- 跑通 navigate、snapshot、locator click/type、screenshot、停止和用户抢占。
- 证明 agent 与用户操作同一可见 page WebContents，不启动旁路 browser。

## 临时兼容层

| 兼容层 | 允许用途 | 禁止用途 | 删除任务 |
|---|---|---|---|
| `src/services/tauri.ts` | 当前 Tauri 回归与迁移 adapter | 新增目标态 API | 每个领域迁入 Electron 后删除对应 wrapper；M5 删除文件 |
| `src/services/events.ts` 的 Tauri listen | 当前事件输入 | 新增第二事件中心 | M1 引入 host event adapter，M5 删除 Tauri 实现 |
| Rust daemon / remote backend | 当前 Tauri 运行基线 | Electron main 的永久中间层 | M2 真实 thread 通过后开始删除，M5 完成 |
| dynamic tool Browser adapter | M3 bootstrap | 正式发布的双 Browser 路由 | M4 自有 Browser client 通过后关闭或删除 |

## 自动检查

在 `apps/desktop` 运行：

```powershell
npm run check:host-boundary
```

检查保证：

- `generate_handler!` 中新增命令必须有目标 owner 分类。
- renderer 新增 Tauri package 直接依赖会失败。
- 删除既有直接依赖不会失败，基线可随迁移持续收缩。

该检查只证明盘点覆盖和债务不增长，不证明 Electron 功能、协议或 Windows 制品可用。
