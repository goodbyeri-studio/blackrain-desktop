# Requirements

> **归属（2026-07-26）**：本 spec 继续记录原装 `codex-rs` 能力的协议接线和重验；宿主从 Tauri 迁移到 Electron 归 [spec 012](../012-electron-shell-migration/)，Codex App 缺失能力和 in-app browser 归 [spec 013](../013-codex-app-capability-parity/)。不得引入第二内核。

> **迁移修正（2026-07-29）**：下述 5 层 pattern 只描述当前 Tauri/daemon 实现。目标 Electron 由 main 直接持有 App Server client，不复制 daemon 两层；已有方法必须映射到 main/preload/renderer 合同，并按 spec 012 删除 Tauri/daemon adapter。

> **事实状态(2026-07-26)**:42 个方法的 5 层包装代码与编译/shape 记录已存在,但完整 capability 验证基线最新只到 `cfead68`;当前文档锁定 rust-v0.144.5 / `87db9bc` 只完成源码差异与协议方法集合静态审计,尚未构建、重跑能力探针或完成 Windows GUI 冒烟。「包装代码存在」、「当前内核验证通过」、「GUI 可用」是三个不同状态。

## 背景

- 这个功能为什么保留:第四轮决策 #5 定下「把 codex-rs 提供的、我们能用的全部能力接入并暴露到 BlackRain 壳,然后做 GUI 复刻」。42 个方法的包装已完成历史实装,本 spec 继续负责记录当前锁定内核的重验、门控/stub 和 GUI 交接边界。
- 相关上游/文档:本 spec 实装/shape 探针基线为 `bdd282f`→`cfead68`;当前锁定已更新到 rust-v0.144.5 / `87db9bc`,下一轮 CODE GUI 开发前必须重跑探针并刷新缺口表;运行时边界见 [docs/09](../../docs/09-运行时架构与里程碑.md)。
- 当前 Tauri 既有 5 层接线 pattern(以 `archive_thread` 为范例,已读真实代码):`shared/codex_core.rs`(核心 RPC 发起)→ `codex/mod.rs`(App 命令,带 remote_backend 分支)→ `lib.rs`(`invoke_handler` 注册)→ `services/tauri.ts`(前端 IPC 包装)→ daemon 两处(`blackrain_daemon.rs` state 方法 + `blackrain_daemon/rpc/codex.rs` 分发)。该 pattern 不进入目标 Electron 架构。

## 目标(做什么)

- 作为 BlackRain CODE 模式的壳,为 codex-rs 的候选 ClientRequest 能力提供完整 5 层包装,并显式标出 `experimentalApi`、OpenAI 认证、上游 stub 与 Windows-only 运行时门控;不把「协议中存在」等同于「产品可用」。
- 接入范围按 code-mode-boundary 的分类:**B 类真缺口全接**(Skills/Plugin/Marketplace 管理、Thread 高级、Windows 沙箱 setup、实验特性开关、权限档、MCP 深度、外部迁移)+ **bdd282f 新增 A 类 6 个**(thread/delete、thread/items/list、backgroundTerminals/{list,terminate}、environment/info、thread/deleted 通知)。
- 每个接入方法走完整 5 层链路,且 `cargo check` + `npm run typecheck` 通过。

## 非目标(不做什么)

- **C 类强绑 OpenAI 后端的不接**:account/workspaceMessages/read、account/rateLimitResetCredit/consume(国产场景失效)。
- **D 类 v1 不做**:realtime/* 语音(含 appendSpeech)、remoteControl/*(壳已用 tailscale 自实现)、environment/add 远程环境编排。
- **应主动去掉的**:feedback/upload、account/sendAddCreditsNudgeEmail(OpenAI 专有)。
- **不做 GUI 像素级复刻**(那是用户的活,本 spec 只负责「接入+暴露」后端能力面)。
- **不改 codex 内核**(原装黑盒)。

## 验收

- 每簇接入后 `cd apps/desktop/src-tauri && cargo check` 通过、`cd apps/desktop && npm run typecheck` 通过。
- 壳完整参数用法有 `cfead68` 的历史字段级兼容记录;当前锁定 `87db9bc` 必须重跑能力 shape 探针,并在 Windows 上跑 `tauri:dev:win` GUI 冒烟。重验前不得把 42 个方法宣称为当前全量可用。
