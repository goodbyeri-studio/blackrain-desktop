# Requirements

> **事实状态(2026-07-12)**:42 个方法的 5 层包装代码与编译/shape 记录已存在,但完整 capability 验证基线最新只到 `cfead68`;当前文档锁定 rust-v0.144.1 / `44918ea` 只完成方法集合审计与 app-server macOS `cargo check`,尚未重跑能力探针与 Windows GUI 冒烟。「包装代码存在」、「当前内核验证通过」、「GUI 可用」是三个不同状态。

## 背景

- 这个功能为什么保留:第四轮决策 #5 定下「把 codex-rs 提供的、我们能用的全部能力接入并暴露到 BlackRain 壳,然后做 GUI 复刻」。42 个方法的包装已完成历史实装,本 spec 继续负责记录当前锁定内核的重验、门控/stub 和 GUI 交接边界。
- 相关上游/文档:本 spec 实装/shape 探针基线为 `bdd282f`→`cfead68`;当前锁定已更新到 rust-v0.144.5 / `87db9bc`(2026-07-15),下一轮 CODE GUI 开发前必须重跑探针并刷新缺口表;[code-mode-boundary.md](../003-dual-engine-architecture/code-mode-boundary.md);[codex-capability-ledger.md](../003-dual-engine-architecture/codex-capability-ledger.md)。
- 既有 5 层接线 pattern(以 `archive_thread` 为范例,已读真实代码):`shared/codex_core.rs`(核心 RPC 发起)→ `codex/mod.rs`(App 命令,带 remote_backend 分支)→ `lib.rs`(`invoke_handler` 注册)→ `services/tauri.ts`(前端 IPC 包装)→ daemon 两处(`blackrain_daemon.rs` state 方法 + `blackrain_daemon/rpc/codex.rs` 分发)。

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
- 壳完整参数用法有 `cfead68` 的历史字段级兼容记录;当前锁定 `44918ea` 必须重跑能力 shape 探针,并在 Windows 上跑 `tauri:dev:win` GUI 冒烟。重验前不得把 42 个方法宣称为当前全量可用。
