# Requirements

## 背景

- 这个功能为什么现在要做：第四轮决策 #5 定下「把 codex-rs 提供的、我们能用的全部能力接入并暴露到 BlackRain 壳,然后做 GUI 像素级复刻」。当前壳只接了 ~24 个 app-server ClientRequest(对话核心已满覆盖),但 codex-rs 还有一批方法壳没接(见 [.specs/003 code-mode-boundary.md](../003-dual-engine-architecture/code-mode-boundary.md) 附录 B 类缺口),复刻 codex-app 前必须先把这些「能用的」内核能力接全、暴露出来。
- 相关上游/文档：本 spec 实装/shape 探针基线为 `bdd282f`→`cfead68`;当前仓库锁定已更新到 `da4c8ca`(2026-07-03),下一轮 CODE 能力开发前需重跑探针并刷新缺口表;[code-mode-boundary.md](../003-dual-engine-architecture/code-mode-boundary.md) 接入缺口表;[codex-capability-ledger.md](../003-dual-engine-architecture/codex-capability-ledger.md)。
- 既有 5 层接线 pattern(以 `archive_thread` 为范例,已读真实代码):`shared/codex_core.rs`(核心 RPC 发起)→ `codex/mod.rs`(App 命令,带 remote_backend 分支)→ `lib.rs`(`invoke_handler` 注册)→ `services/tauri.ts`(前端 IPC 包装)→ daemon 两处(`codex_monitor_daemon.rs` state 方法 + `rpc/codex.rs` 分发)。

## 目标(做什么)

- 作为 BlackRain CODE 模式的开发者/壳,**能驱动 codex-rs 内核的全部「可用」ClientRequest 能力**(不含强绑 OpenAI 后端的)。
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
- 壳完整参数用法至少对 `cfead68` 的字段级兼容;当前锁定 `da4c8ca` 仍需用户跑一次 `tauri dev` 冒烟测试和能力 shape 探针确认(无头环境无法验)。
