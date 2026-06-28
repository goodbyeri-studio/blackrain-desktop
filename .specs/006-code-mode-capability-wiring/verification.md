# Verification

> 记录每批接入的实测命令与结果。无头环境能验 `cargo check` + `npm run typecheck`;字段级兼容与 GUI 需用户 `tauri dev` 冒烟。

## 验证命令

```bash
cd apps/desktop/src-tauri && cargo check          # Rust 5 层编译
cd apps/desktop && npm run typecheck              # 前端 IPC 类型
cd apps/desktop && npm run test                   # 改前端行为/hooks 后
# 协议探针(可选,对新方法发 happy-path 请求):
BIN="$PWD/codex-upstream/codex-rs/target/debug/codex-app-server"
python3 .scratch/m0_protocol_probe.py "$BIN" <CODEX_HOME> <工作区>
```

## 结果记录

| 批次 | 方法 | cargo check | typecheck | tauri dev 冒烟 | 日期 |
|---|---|---|---|---|---|
| 1 | thread/delete | ✅ 5.72s 零错误 | ✅ 通过 | 待用户 | 2026-06-28 |
| 1 | thread/items/list | ✅ 同上 | ✅ | 待用户 | 2026-06-28 |
| 1 | thread/backgroundTerminals/list | ✅ 同上 | ✅ | 待用户 | 2026-06-28 |
| 1 | thread/backgroundTerminals/terminate | ✅ 同上 | ✅ | 待用户 | 2026-06-28 |
| 1 | environment/info | ✅ 同上 | ✅ | 待用户 | 2026-06-28 |
| 1 | thread/deleted(通知) | 免代码(泛化转发) | — | 待用户 | 2026-06-28 |

> 第 1 批实测:`cd apps/desktop/src-tauri && cargo check` → `Finished dev in 5.72s`,零编译错误、新方法零 unused 警告(全链路接通);`cd apps/desktop && npm run typecheck` → 通过。新方法全部走 5 层 archive_thread pattern,协议方法名零改写。

## 内核 bump 验证(已完成)

- 2026-06-28:`codex-upstream` checkout `bdd282f` → `cargo build -p codex-app-server` 成功(1m44s)→ M0 四探针(initialize/model.list/thread.start/turn.start)复跑全绿。
- 遗留:探针只覆盖 4 方法 happy path;壳完整参数用法对新内核的字段级兼容待 `tauri dev` 冒烟。
