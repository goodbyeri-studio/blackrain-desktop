# Electron 全量迁移 MVP 任务

> 只记录未完成工作。完成事实必须写入 `verification.md`；每项任务要区分 `CODE_EXISTS`、`RUN_PASS`、`PRODUCT_PASS`。任务状态不能用文档描述代替。

## 使用规则

- 任务按 G0–G6 闸口执行，不得跳过前置闸口。
- 每项任务必须有对应账本条目、代码位置或删除提交、验证命令和证据路径。
- 所有 Windows 产品项必须在 Windows 11 x64 实机完成；Linux/macOS smoke 只能作辅助证据。
- 未迁移能力必须隐藏或明确禁用，禁止保留“点击后才失败”的可见入口。
- 迁移完成的判定不是“Electron 和 Tauri 并存可用”，而是产品源码、依赖、构建、用户可见文案和制品都只剩 Electron 语义；内部真源文档可保留明确标注的迁移审计事实。

## G0：盘点、冻结与版本锁

- [ ] `G0-CODE-01` 生成 `migration-ledger.md` 或等价机器可读账本，覆盖 194 个 command、53 个 direct import、Tauri events/plugins/resources/capabilities、daemon、固定端口、NSIS 和 CI。
- [ ] `G0-CODE-02` 为每个账本条目标记唯一目标：`app-server`、`electron-main/preload`、`renderer-only`、`gateway` 或 `delete`；node-pty、凭据等只作为 capability 子域。
- [ ] `G0-CODE-03` 固定 Electron/Forge/Vite/TypeScript/Node/Codex runtime、Browser adapter/client 和 Windows 最低版本；更新锁文件、hash、License/NOTICE。
- [ ] `G0-CODE-04` 删除或隐藏所有无法在 Electron MVP 中实现的可见入口，并增加回归测试防止重新出现。
- [ ] `G0-RUN-01` 运行 `npm.cmd run check:host-boundary`，确认无新增 direct import、无未分类 command。
- [ ] `G0-RUN-02` 运行 runtime、Node、Browser client lock/provenance gate，记录精确版本和摘要。
- [ ] `G0-RUN-03` 建立一次干净 worktree 的基线报告，记录 Windows build、commit、node/npm、Electron 和制品路径。

## G1：安装态可用性

- [ ] `G1-CODE-01` 修复并锁定 MSIX 安装态窗口 hit-test、透明层、材质层、焦点和自定义协议行为；为原生鼠标 click 增加自动化探针。
- [ ] `G1-CODE-02` 先创建 bootstrap window，再初始化 app-state、标准 Codex Home 和 Browser profile 的目录权限、迁移版本和失败回滚；app-server 未启动/未登录时必须显示 degraded/retry/diagnostics，不得切换到旧宿主。
- [ ] `G1-RUN-01` 生成正式签名候选 MSIX，运行 `signtool verify /pa` 和 SHA-256/manifest 校验。
- [ ] `G1-PRODUCT-01` 安装后用真实鼠标/键盘完成首启、窗口点击、设置入口、降级/重试入口和退出重启；不在 G1 验收 thread/turn、审批或 app-server 恢复。
- [ ] `G1-PRODUCT-02` 记录安装、首启、窗口点击、焦点、DPI、卸载前状态和失败日志；`PRODUCT_FAIL` 必须登记根因和复验条件。
- [ ] `G1-PRODUCT-03` 注入 app-server 未启动、初始化超时和未登录三种状态，确认窗口仍可见、用户可重试/导出诊断，且不会启动 Tauri/daemon/固定 localhost fallback。

## G2：Codex 核心链路

- [ ] `G2-CODE-01` 完成标准 `CODEX_HOME` 解析、首次登录、账户切换和 CLI 共享配置路径；Codex auth 由 app-server/标准 Home 负责，BlackRain 自有 provider/Gateway secret 才进入 safeStorage，并为每个 Home 生成稳定 `codexHomeId`。
- [ ] `G2-CODE-02` 完成 workspace create/list/update/remove 的 typed main/preload 路径和 ownership 校验。
- [ ] `G2-CODE-03` 完成 model/config、skills/apps、thread CRUD 的 typed Electron 路径；`collaboration` 仅指锁定版本 app-server 原生能力，若 `codex-cli 0.146.0` 不提供则登记为 `delete/deferred-delete`，不得引入 Session Orchestrator；删除对应 renderer Tauri 调用。
- [ ] `G2-CODE-04` 完成唯一 app-server 事件扇出：initialize、thread start/resume/subscribe、turn、item delta/completed、process exit。
- [ ] `G2-CODE-05` 完成 approval、elicitation、server request/response/cancel、turn interrupt/steer、停止和恢复状态机。
- [ ] `G2-CODE-06` 建立 pending request、消息大小、并发 turn、超时、EOF、畸形 JSON、迟到 response 和 child exit 上限。
- [ ] `G2-CODE-07` 实现 app-server 崩溃后的重启、thread 恢复、renderer 重载和 App 重启恢复，不回退 daemon。
- [ ] `G2-RUN-01` 运行 bundled app-server stdio probe、真实 Node fixture 和 app-server main 测试。
- [ ] `G2-RUN-02` 用隔离 Codex Home 验证 initialize、thread/start/resume、turn/interrupt、审批和恢复；不污染用户 Home。
- [ ] `G2-PRODUCT-01` 在正式签名 MSIX 中完成首次登录、账户切换、标准 Home 既有 thread 恢复、真实审批、停止、恢复和并发 turn。

## G3：Electron 桌面宿主

### G3A 类型化边界

- [ ] `G3A-CODE-01` 将 53 个 direct import 全部迁移到 `src/host` 或 renderer-only，baseline 归零；兼容 fallback 集中在单一文件并登记删除提交。
- [ ] `G3A-CODE-02` 为每个 preload API 定义 zod/schema、取消订阅、错误类型和 sender/window/thread/generation 校验。
- [ ] `G3A-CODE-03` 完成事件统一入口，renderer 不再直接订阅 Tauri event；所有 Browser/App Server 事件经过 main 标准化扇出。

### G3B 文件、设置和系统能力

- [ ] `G3B-CODE-01` 迁移 dialog、file picker、clipboard、资源 URL、shell.openExternal、revealPath、drag/drop。
- [ ] `G3B-CODE-02` 迁移 settings、model/config、凭据、通知、菜单、窗口、托盘、窗口生命周期和权限请求。
- [ ] `G3B-CODE-03` 所有外部链接、文件路径、shell 操作和凭据读写实现 fail-closed schema/ownership 测试。
- [ ] `G3B-RUN-01` 运行 main/preload 单测、host boundary、lint、typecheck 和 packaged settings/file/dialog smoke。
- [ ] `G3B-PRODUCT-01` 在签名 MSIX 中验证设置、文件选择、剪贴板、通知、托盘、菜单、拖放和窗口关闭/重启。

## G4：工程能力与 Browser 发布回归

### G4A Git、文件和终端

- [ ] `G4A-CODE-01` 迁移文件树、读取/写入、附件和 workspace path allowlist。
- [ ] `G4A-CODE-02` 迁移 Git status/diff/log/remote、stage/unstage/revert、branch checkout/create、commit/push/pull/fetch/sync、PR/issue 查询和评论。
- [ ] `G4A-CODE-03` 引入 Electron main `node-pty`，覆盖 ConPTY、编码、resize、退出、信号、进程树清理和 helper 资源签名。
- [ ] `G4A-RUN-01` 运行 Git integration、文件安全、terminal/ConPTY、resize/exit/process-tree 和 Windows helper 测试。
- [ ] `G4A-PRODUCT-01` 在真实 workspace 中验证文件编辑、Git 工作流、中文输入、终端交互、窗口关闭和 App 重启恢复。

### G4B 更新、深链与诊断

- [ ] `G4B-CODE-01` 按签名 MSIX/App Installer 包链实现 Electron main UpdateManager：检查 signed manifest、下载 staging、publisher/hash 校验、交给 Windows 安装器；禁止覆盖运行中文件，失败保留旧版本可启动并可重新安装上一版签名 MSIX 回滚。
- [ ] `G4B-CODE-02` 实现深链、快捷键、通知、托盘和系统睡眠/唤醒生命周期，所有操作都有 typed API。
- [ ] `G4B-CODE-03` 结构化记录 app-server、Browser、terminal、update、crash 诊断，禁止 secret/Cookie/网页正文进入日志。
- [ ] `G4B-RUN-01` 运行 update/deep-link/lifecycle/diagnostics 单测和故障注入测试。
- [ ] `G4B-PRODUCT-01` 在签名 MSIX 中验证检查更新、失败回滚、深链、快捷键、通知、睡眠恢复和崩溃恢复。

### G4C Browser 回归

- [ ] `G4C-CODE-01` 保持 main-owned WebContentsView、持久 profile、route/profile/view generation ownership 和旧布局丢弃规则。
- [ ] `G4C-CODE-02` 完成标准 stdio MCP + 随包 Node adapter + 自有 Browser client 的唯一生产路由；关闭 dynamic-tool/main self-load 发布入口。
- [ ] `G4C-CODE-03` 完成 ACL/token/client id/framing/8 MiB/断连/迟到消息/跨用户拒绝测试；必须在 Windows 11 x64 上用两个不同本地用户验证 named-pipe ACL，记录拒绝错误、pipe owner、token/generation 和清理结果。
- [ ] `G4C-CODE-04` 完成登录、MFA、权限、popup、下载 grant、用户接管、OOPIF、locator/CUA、截图、tab finalize 和崩溃恢复。
- [ ] `G4C-RUN-01` 运行 browser-client verify、app-server MCP probe、transport/security、Browser host 和 Electron E2E。
- [ ] `G4C-PRODUCT-01` 在 Windows 真实站点验证登录/MFA、同页 agent 操作、下载、权限、中文输入法、DPI、多屏、睡眠恢复和 renderer/page crash。

## G5：删除旧宿主

- [ ] `G5-CODE-01` 逐项完成账本中的 194 command 映射，未迁移项只能为明确 delete/deferred-delete，不能保留未解释 owner。
- [ ] `G5-CODE-02` 删除 renderer Tauri package/import、`src/services/tauri.ts` 永久路径、Tauri event bridge 和 fallback。
- [ ] `G5-CODE-03` 删除 `src-tauri` runtime、BlackRain daemon、固定 `127.0.0.1:4732`、Rust command/adapter、NSIS、Tauri capabilities/resources 和冻结构建入口。
- [ ] `G5-CODE-04` 从 package.json、lockfile、CI、发布脚本、README 和用户可见发布说明中删除 Tauri 唯一发布入口；内部架构/迁移审计文档可保留历史事实，但不得把 Tauri 写成当前入口；确认暂停路线资产未被重新激活。
- [ ] `G5-CODE-05` 将 renderer 组件、hooks、services、错误类型和事件名中的 Tauri 语义改成产品域/Electron-neutral 语义；旧 command 名只保留在账本。
- [ ] `G5-CODE-06` 删除 Tauri 专属图标、capability、Rust 生成目录、Rust 资源和仅为旧宿主存在的环境变量；核对最终 MSIX 资源清单。
- [ ] `G5-RUN-01` 在无 Tauri 依赖的干净 worktree 运行 typecheck、全量 test、lint、host boundary、app-server probe、package、smoke、E2E。
- [ ] `G5-RUN-02` 对删除后的包执行静态搜索，确认无 `@tauri-apps`、Tauri command、daemon、固定端口和 NSIS 发布引用。

## Native Clean Gate：从未存在 Tauri 的最终形态

- [ ] `NATIVE-CODE-01` 删除 `apps/desktop/src-tauri/` 目录及其所有 Rust/Cargo/tauri 配置；仓库生产入口只剩 Electron Forge/Vite。
- [ ] `NATIVE-CODE-02` 从 package.json、lockfile、node_modules 生产依赖、Forge 配置、脚本和 CI 删除所有 Tauri package、CLI、plugin、NSIS 和兼容 adapter。
- [ ] `NATIVE-CODE-03` 对生产源码、Electron resources、package/lock、Forge、scripts、`.github/workflows`、README 和用户可见发布说明执行禁词/文件扫描：`tauri`、`@tauri-apps`、`src-tauri`、`invoke(`、`listen(`、`blackrain_daemon`、`127.0.0.1:4732`、`transformCallback`；`.specs/**` 与 `docs/04`、`docs/09`、`docs/10`、`docs/commands` 属于内部真源，按分层规则单独检查，不要求零历史词。
- [ ] `NATIVE-CODE-04` 删除所有 Tauri 命名的公共类型、事件、错误码、日志字段、设置项、菜单项和 UI 文案；为用户可见文案增加快照/回归检查。
- [ ] `NATIVE-CODE-05` 重新生成 package manifest 和资源 allowlist；解包 MSIX 后只允许 Electron/Codex/Node/Browser/审计依赖，禁止任何 Rust/Tauri/旧宿主文件。
- [ ] `NATIVE-CODE-06` 让 host-boundary 检查切换为 final mode：任何 Tauri import、command、目录、脚本、依赖和旧端口出现即 exit 1，不再读取迁移期 baseline。
- [ ] `NATIVE-RUN-01` 在无 Tauri 文件的干净 worktree 执行 typecheck、全量 test、lint、package、smoke、E2E、make 和 release 解包扫描。
- [ ] `NATIVE-RUN-02` 对开发、production package、签名 MSIX 三种形态分别执行 Electron 启动、核心流程和重启恢复，证明没有隐藏双路由。
- [ ] `NATIVE-PRODUCT-01` 人工检查设置、错误、诊断、帮助、关于、更新、菜单和卸载流程，不出现 Tauri/Rust daemon/兼容模式术语。
- [ ] `NATIVE-PRODUCT-02` 证明 Electron 失败时只显示 Electron runtime degraded/retry/diagnostics，不启动旧宿主或 localhost daemon。

## G6：Windows MVP 发布矩阵

- [ ] `G6-CODE-01` 生成带锁定 Codex、Node、Browser adapter/client、License/NOTICE 的 release MSIX；开启 Electron fuses 并校验资源 hash。
- [ ] `G6-RUN-01` 运行 typecheck、全量测试、lint、host boundary、runtime gates、app-server probe、package、smoke、Electron E2E 和 maker。
- [ ] `G6-PRODUCT-01` 正式签名 MSIX 安装、首启、核心工作流、登录/MFA、更新、升级、回滚、卸载和残留文件/进程检查全部通过。
- [ ] `G6-PRODUCT-02` 完成输入法、DPI、多屏、窗口焦点、睡眠恢复、Browser 登录、下载、权限、崩溃恢复和终端进程清理矩阵；同时记录冷启动到首个可交互窗口 P95、app-server 恢复 P95、稳态工作集和退出后孤儿进程，阈值在发布报告冻结后才可判定通过。
- [ ] `G6-PRODUCT-03` 记录 Windows build、账户/权限、网络、Git commit/worktree、精确命令、日志、截图、制品路径和 SHA-256。
- [ ] `G6-PRODUCT-04` 由发布责任人确认 G0–G6 全部证据，才允许创建正式 release；否则保持 `PRODUCT_FAIL` 或 `RUN_PASS`。

## 收口与文档

- [ ] 更新 `requirements.md`、`design.md`、`decisions.md`、本文件和 `verification.md`，移除已完成任务但保留完成证据。
- [ ] 将当前基线 53、194、runtime lock、签名方案和最低 Windows 版本同步到内部真源 `docs/04`、`docs/09`、`docs/10`、`docs/commands.md`；同步时保留“当前 Tauri/迁移中/目标 Electron”三态标记，不把历史状态写成发布结论。
- [ ] 核对所有可见入口、package scripts、CI job、README 和发布说明只指向 Electron。
- [ ] 记录剩余风险、已知限制、回滚方式和下一版本工作；未完成项不得写成“发布可用”。
