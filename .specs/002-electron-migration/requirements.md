# Electron 原生重建与全量迁移 MVP 需求

> 本 spec 是 BlackRain 产品交付 living spec。`代码/配置存在`、`运行验证通过`、`发布可交付` 必须分开记录；任何一项都不能由另一项推导。可移植 Browser Runtime 源码底座由并行的 `003-portable-electron-browser-runtime` 管理。

## 1. 背景与问题

BlackRain 的生产代码已切换为 React/Vite + Electron main/preload，并由 main 直接监管原装 `codex.exe app-server`。迁移输入与当前水位为：

- 历史 194 个 command 与 53 个 renderer direct import 已逐项登记，当前生产边界为 0/0；
- Native Clean Gate、typecheck、全量测试、lint、runtime provenance、App Server/MCP probe 当前通过；
- production package、原生点击、smoke、Electron E2E 和 unsigned MSIX maker 已有 `RUN_PASS` 证据；
- 开发签名 MSIX 曾安装成功，但真实安装态全页面点击仍为 `PRODUCT_FAIL`；
- 首次登录、真实审批/停止/恢复、双用户 ACL、真实站点及正式签名安装/升级/回滚/卸载矩阵尚未完成。

本阶段唯一目标是交付一份“从一开始就由 Electron 实现”的 Windows Electron MVP：旧 Tauri 只作为行为盘点和迁移输入，不能进入最终应用的运行时、源代码、依赖、构建、用户界面或发布制品。Browser 作为 Electron 发布回归的一部分保留，不再单独形成第二路线。

## 2. 原生重建原则

最终态不是“Electron 外面包着 Tauri 兼容层”，而是以下不可违反的不变量：

- `apps/desktop` 的生产源码、package、lockfile、Forge/Vite 配置、脚本、CI 和 release 文档中不存在 Tauri runtime、Tauri package、Tauri command、Tauri event、Tauri plugin、Rust daemon、固定本地端口或 fallback adapter。
- renderer 的组件、hooks、services、事件模型和错误语义不再以 Tauri API 为抽象；它们只依赖产品域 API 和 `window.blackrain` typed contract。
- Electron main/preload 从自己的生命周期、窗口、权限、文件、Git、终端、更新和 Browser 模型出发实现能力，不复制 Tauri command 名称作为永久 IPC。
- 用户可见的设置、错误、诊断、帮助、菜单、更新和关于页面不得出现 Tauri、Rust daemon、兼容模式或旧宿主术语。
- release package 解包后只包含 Electron main/preload/renderer、随包 Codex/Node/Browser 资源和明确允许的第三方运行库；任何 Tauri/Rust 运行时文件都视为发布阻塞。Clean Gate 对内部架构文档采用分层规则，不以全仓库字符串为唯一判定。
- `.specs/**` 与 `docs/04`、`docs/09`、`docs/10`、`docs/commands` 可以保留“从 Tauri 迁移”的内部审计事实，但必须明确当前态/迁移态/目标态；最终产品代码、用户可见文案和制品不得依赖这些历史。

## 3. 用户目标

作为 Windows 用户，只安装 BlackRain Electron MSIX，即可完成以下闭环：

1. 安装、首启、升级、回滚、卸载和残留清理。
2. 使用标准 Codex Home 完成首次登录、账户切换、配置和既有 thread 恢复。
3. 添加/移除 workspace，创建、恢复、删除和切换 thread。
4. 发起最小 turn，接收流式事件，处理审批和 server request，停止、恢复并处理并发 turn。
5. 浏览文件、读取/写入附件，执行 Git status/diff/branch/commit/push/pull/PR 工作流。
6. 打开 Electron main-owned 终端，覆盖 Windows ConPTY、resize、退出和进程树清理。
7. 使用设置、凭据、通知、菜单、快捷键、深链和更新功能。
8. 在同一个可见 `WebContentsView` 页面完成 Browser 登录/MFA、导航、locator/CUA、下载、权限、用户接管和恢复。

## 4. 非目标

- 不修改、分叉或重新实现 `codex-rs` agent loop；不引入第二 agent runtime。
- 不把 Gateway 协议翻译并入 Electron main 或 renderer。
- 不复制 Codex App 闭源代码、私有 bundle、私有 client、字体、图标 path 或其他专有资源。
- 不恢复工作台、Session Orchestrator、专家市场、OPC/工作室和插件市场路线。
- 不保留 Tauri 作为发布降级入口；迁移期兼容 fallback 只能存在于单一模块并带删除任务。
- macOS/Linux/iOS 不作为 MVP 发布验收平台。

## 5. MVP 成功标准

### 5.1 代码/配置存在

- Electron main 直接监管随包 `codex.exe app-server`，通过 stdio JSONL 提供唯一 agent/thread/turn/审批/恢复状态源。
- renderer 只通过类型化 `window.blackrain` allowlist 访问宿主能力；无 Node、原始 IPC、App Server transport 或任意 channel 暴露。
- Browser `WebContentsView`、session、权限、下载、CDP 和页面生命周期全部由 main 持有。
- 194 个 command 和 53 个 direct import 均有逐项迁移账本，目标归属只能是 `app-server`、`electron-main/preload`、`renderer-only`、`gateway` 或 `delete`；node-pty、凭据等子域只能作为 owner 的 capability 字段，不能另造 owner 枚举。
- Tauri package、Rust runtime、BlackRain daemon、固定 `127.0.0.1:4732`、NSIS 和兼容 adapter 均有删除提交和删除后构建证明。
- 生产树通过“零 Tauri 残留”审计：源码、依赖、脚本、配置、CI、用户可见文案和 release 解包结果均为零；`.specs/**`、`docs/04`、`docs/09`、`docs/10`、`docs/commands` 与 Git 历史按内部真源 allowlist 保留迁移审计文字。

### 5.2 运行验证通过

在 Windows 11 x64、记录了 Windows build、Git commit、runtime lock 和精确命令的环境中，以下全部通过：

- `electron:typecheck`、全量单测、lint、host boundary、bundled app-server probe；
- production package、Electron smoke、Playwright Electron E2E；
- 标准 Codex Home 的登录、配置、thread 恢复、审批、停止、恢复、并发 turn；
- Git、文件、终端、设置、凭据、通知、快捷键、更新和崩溃恢复；
- Browser 登录/MFA、同页 agent 操作、用户接管、下载、权限、OOPIF、输入法、DPI、多屏和 renderer/page crash 恢复。

### 5.3 发布/交付可用

- 正式签名 MSIX 通过 `signtool verify /pa` 和 Authenticode 检查。
- 同一制品通过安装、首启、核心流程、升级、回滚、卸载、残留文件/进程检查。
- 安装态所有可见入口均可操作；未迁移能力必须被隐藏或明确禁用。
- 更新失败时旧版本仍可启动，失败版本可回滚；app-server、Browser、终端异常不会留下不可终止进程。
- `verification.md` 记录日期、Windows build、commit/worktree、命令、日志、制品路径和 SHA-256。

### 5.4 安全、合规、性能

- preload 只暴露 typed allowlist；main 校验 sender、window、route、thread、profile、generation 和参数 schema。
- 网页无 App preload、`window.blackrain`、Node、原始 IPC 或 App Server transport。
- Browser transport 使用随机 endpoint、目标用户 ACL、256-bit capability token、client id、8 MiB frame 上限和断连清理。
- BlackRain 自有 provider secret、credit token 和 Gateway 运行时凭据只进入 Windows DPAPI/Electron `safeStorage` 或其专用运行时桥；磁盘和日志不保存明文 token、Cookie、密码或网页正文。Codex 登录 auth 的规范副本仍由原装 `codex.exe app-server`/标准 `CODEX_HOME` 按 Codex 原生语义管理，Electron 不读取、复制或改写该文件。
- 记录 Windows 冷启动到首个可交互窗口 P95、app-server 恢复 P95、内存/GPU、终端进程、Browser 页面工作集和退出后孤儿进程；参考机器、样本数和允许阈值必须在 G6 报告中先冻结再执行测试，超出阈值必须阻止 release。

### 5.5 原生体验一致性

- 应用启动、窗口创建、菜单、快捷键、拖放、对话框、通知、文件路径、终端、更新和崩溃恢复全部遵循 Electron/Windows 语义，不通过兼容层模拟 Tauri 行为。
- 同一功能在开发、打包、安装和升级态使用同一 Electron 实现；不得存在“开发走 Electron、安装走 Tauri”或隐藏 fallback。
- 旧 Tauri 的 command 名称、事件名和数据结构只允许在账本中作为迁移来源，不能成为 renderer/main 的公共 API。

## 6. 约束

- Windows 是唯一 MVP 发布平台；其他平台只可做开发 smoke。
- 默认使用用户已有的标准 `CODEX_HOME`；不得自动创建隐藏的 BlackRain 专属第二状态域。
- `codex-upstream/` 只读、只锁版本、只构建和验证；不得修改内核。
- Electron 自有 `app-state` 与 Browser profile 独立于 Codex Home，不能写入 Codex rollout JSONL/SQLite。
- 新依赖必须通过许可证、供应链摘要和 Windows 打包审计；禁止 AGPL/GPL/BSL/无许可证进入 Desktop/Cloud。
- 活跃 CI 不能替代 Windows 实机安装、升级、回滚、卸载、登录和输入矩阵。

## 7. 发布闸口

只有 G0–G6 和 Native Clean Gate 全部通过，才能把 Electron 标记为 MVP 可交付：

| 闸口 | 内容 | 必须证明 |
|---|---|---|
| G0 | 盘点与冻结 | 194/53 逐项账本、版本锁、无新增 Tauri 依赖 |
| G1 | 安装态基础可用 | 正式签名 MSIX 可安装、首启、窗口点击、降级/重试入口通过；不承担 app-server 核心流程 |
| G2 | Codex 核心 | 标准 Home、登录、thread/turn、审批、停止/恢复通过 |
| G3 | 宿主能力 | 文件/Git/终端/设置/凭据/通知/快捷键/深链/更新通过 |
| G4 | Browser 回归 | 同页 Browser、登录/MFA、接管、下载、权限、恢复通过 |
| G5 | 删除旧宿主 | Tauri/daemon/NSIS/fallback 删除，Electron 为唯一入口 |
| Native Clean Gate | 原生重建收口 | 生产源码、依赖、脚本、CI、用户可见文案和 release 解包零 Tauri 残留；内部真源文档按分层规则扫描，UI 不含旧宿主术语 |
| G6 | Windows 发布 | 签名、安装、升级、回滚、卸载、残留和性能矩阵通过 |

## 8. 开放问题

- [ ] 关闭签名 MSIX 全页面不可点击的最终 Windows 环境结论，并完成 G1 重验。
- [ ] 关闭生产更新通道、代码签名证书/runner、回滚策略和发布审批责任人；MVP 不允许应用内覆盖正在运行的二进制。
- [ ] 确定 MVP 支持的最低 Windows 版本、DPI/多屏设备矩阵和性能阈值。
