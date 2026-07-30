# Design

> **状态(2026-07-31)**:本设计的 42 个方法包装已有 `cfead68` 历史验证;当前锁定 rust-v0.146.0 / `e363b08c` 只完成源码与官方 Windows package 供应链锁定,全量重验和 Windows GUI 冒烟未完成。方法包装存在不会解除上游门控。

> **迁移边界（2026-07-29）**：本设计保留为当前 Tauri wiring 说明。Electron 目标不照搬 5 层 App/daemon adapter，而由 main 的 App Server client 直接发 ClientRequest、接收 ServerRequest/Notification；具体目录、测试和删除任务见 spec 012。

## 总体方案

把 codex-rs 内核「可用」的 ClientRequest 能力,按既有 5 层接线 pattern 接进 BlackRain 壳并暴露给前端。不改内核、不改协议方法名(原装黑盒铁律)。逐簇接入、每簇 `cargo check` + `npm run typecheck` 验证。

## 当前 Tauri 5 层接线 pattern(以 `archive_thread` 为范例)

每个新方法走这 5 个落点:

1. **`src-tauri/src/shared/codex_core.rs`** — 核心 RPC 发起函数 `<name>_core(sessions, workspace_id, ...) -> Result<Value,String>`:`get_session_clone` → 拼 `params` json → `send_request_for_workspace(&workspace_id, "<wire/method>", params)`。
2. **`src-tauri/src/codex/mod.rs`** — `#[tauri::command] pub(crate) async fn <name>(...)`:先 `remote_backend::is_remote_mode` 分支(远程则 `call_remote`),否则调 `_core`。
3. **`src-tauri/src/lib.rs`** — `invoke_handler![... codex::<name>, ...]` 注册。
4. **`src/services/tauri.ts`** — `export async function <camelName>(...) { return invoke<T>("<name>", {...}) }`。
5. **daemon 两处**:`bin/blackrain_daemon.rs` 的 state `async fn <name>` 调 `codex_core::<name>_core`;`bin/blackrain_daemon/rpc/codex.rs` 的 `"<name>" => {...}` 分发(`parse_string` 取参 → `state.<name>(...)`)。

> 纯净克隆型(参数只有 threadId,如 thread/delete)直接套范例;带额外参数/需 `experimentalApi` 的方法在 params 拼装处增量,不动 pattern 骨架。

## 接入分簇与优先级

**第 1 批(A 类,bdd282f 新增,纯净克隆,最低风险,先做验证 pattern)**
- `thread/delete`(参数 `{threadId}`,clone archive)+ `thread/deleted` 通知监听
- `thread/items/list`(取代旧 thread/turns/items/list,会话历史浏览新入口;需 `experimentalApi`)
- `thread/backgroundTerminals/list` + `terminate`(后台进程查看/终止;需 `experimentalApi`)
- `environment/info`

**第 2 批(B 类头号目标:Skills/Plugin/Marketplace 管理,命中决策 #3 的"补 Skills/MCP UI")**
- `skills/config/write`、`skills/extraRoots/set`、`hooks/list`
- `plugin/{list,installed,read,install,uninstall}`、`plugin/skill/read`
- `marketplace/{add,remove,upgrade}`

**第 3 批(B 类其余)**
- Thread 高级:`thread/search`、`thread/goal/{set,get,clear}`、`thread/memoryMode/set`+`memory/reset`、`thread/metadata/update`、`thread/settings/update`、`thread/unarchive`、`thread/loaded/list`、`thread/shellCommand`、`thread/backgroundTerminals/clean`、`thread/approveGuardianDeniedAction`
- `modelProvider/capabilities/read`、`experimentalFeature/enablement/set`、`permissionProfile/list`、`account/logout`
- MCP 深度:`mcpServer/{oauth/login,resource/read,tool/call}`
- Windows 沙箱:`windowsSandbox/{setupStart,readiness}`(MVP 仅 Windows,必接)
- 外部迁移:`externalAgentConfig/{detect,import,import/readHistories,import/progress}`

## 架构边界

- 属于 `apps/desktop`:全部 5 层接线;前端只暴露 IPC 与最小调用能力,GUI 呈现由用户做像素级复刻。
- 明确不改 `codex-upstream`:协议方法名零改写,壳只在 params 层拼装。
- C/D 类(OpenAI 后端绑定 / realtime / remoteControl / feedback)不接,见 requirements 非目标。

## 失败模式

- 方法需 `experimentalApi` 但握手没声明 → 内核不暴露该方法;壳握手已发 `capabilities.experimentalApi=true`,这只证明门控条件已申请,不证明方法在当前内核有完整实现。
- `thread/items/list`:在 `bdd282f`/`cfead68` 返回 `not supported yet`,属上游 stub;在 `da4c8ca` 的状态待重验。
- 远程 plugin 目录:`plugin/skill/read` 与部分 install/uninstall/read 路径需 OpenAI/ChatGPT 认证,且上游对部分 uninstall 路径标注 under development;BlackRain 不得把它们当作国产场景无门控能力。
- Windows sandbox:`windowsSandbox/*` 包装已存在,但运行时 setup/readiness 只能在 Windows 实机结论化。
- 字段级 `deny_unknown_fields` 漂移 → 壳发了内核不认的字段会 400;靠 `tauri dev` 冒烟 + 逐簇验证暴露。
- remote 模式下某些本地能力不可用 → 沿用 `is_remote_mode` 分支,远程走 `call_remote`,本地直调 `_core`。

## 测试策略

- 每次锁定内核升级后:`cargo check`(Rust 5 层编译) + `npm run typecheck`(前端 IPC 类型)+ 全量 capability shape 探针。
- 协议层:可选用 `.scratch/m0_protocol_probe.py` 扩展探针对新方法发一次 happy-path 请求。
- 人工:Windows 上 `npm run tauri:dev:win` 冒烟,确认 IPC→command→daemon→app-server 粘合和 GUI 降级交互;macOS/iOS 不进 MVP 验收。
