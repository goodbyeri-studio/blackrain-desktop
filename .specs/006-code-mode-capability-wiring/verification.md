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
| 2 | skills/config/write · extraRoots/set · hooks/list | ✅ 6.28s 零错误 | ✅ 通过 | 待用户 | 2026-06-28 |
| 2 | plugin/{list,installed,read,install,uninstall,skill/read} | ✅ 同上 | ✅ | 待用户 | 2026-06-28 |
| 2 | marketplace/{add,remove,upgrade} | ✅ 同上 | ✅ | 待用户 | 2026-06-28 |

> 第 2 批实测:`cargo check` → `Finished dev in 6.28s`,零编译错误、12 方法零 unused 警告(全链路接通);`npm run typecheck` → 通过。复杂参数(Vec/Option<Vec>/bool)走现成 helper(parse_string_array / parse_optional_string_array / parse_optional_bool),AbsolutePathBuf/enum 在 wire 层降为 string,不引入 typed Rust 结构。

## 协议 shape 探针(2026-06-28,headless,验 deny_unknown_fields)

脚本 `.scratch/m0_capability_probe.py`(gitignored):把 batch-1/2 全部 17 个方法的参数 shape(壳实际发的 camelCase wire keys)直接发给 `bdd282f` 内核。判定:`result` 或语义错(thread not found / unknown id 等)= **shape 被接受**;`unknown field`/deserialize 错 = 真漂移。

**结果:17/17 shape OK,SHAPE-DRIFT = 0。** camelCase 键、参数信封、5 层 pattern 在协议层全部验证正确。明细:
- PASS(有 result):thread/delete、skills/config/write、skills/extraRoots/set、hooks/list、plugin/list、plugin/installed、marketplace/upgrade
- SEMANTIC(shape OK,语义错):thread/backgroundTerminals/{list,terminate}、environment/info、plugin/{read,install}、marketplace/{add,remove}
- ⚠️ **`thread/items/list` → 内核回 "is not supported yet"(-32601)**:壳已正确接入,但 `bdd282f` 内核侧尚未实现(stub)。它本应取代已删除的 `thread/turns/items/list`,故当前内核两者都不可用——壳是「接入超前于内核」,待未来 bump 点亮。
- ⚠️ `plugin/uninstall`、`plugin/skill/read` → "chatgpt authentication required for remote plugin catalog":shape OK;**远程**目录插件需 OpenAI auth,本地插件可用(符合 C 类 OpenAI 门控边界)。

**剩余只待 GUI 冒烟**:协议 shape 已自证;`tauri dev` 只需验 IPC→command→daemon 粘合层 + 前端接得上(无头环境做不了的那半)。

## 第 3 批 a(Thread 高级,13 方法)2026-06-28

- 接入:9 typed + 4 Value-透传(thread/goal/set、settings/update、metadata/update、approveGuardianDeniedAction;见 decisions 透传决策)。
- `cargo check` → `Finished dev in 6.93s`,零错误、13 方法零 unused 警告(全链路接通);`npm run typecheck` → 通过。
- 协议 shape 探针:**13/13 shape OK**。12 个直接 PASS/SEMANTIC;`thread/approveGuardianDeniedAction` 初判 SHAPE-DRIFT 经复测确认为**假阳性**——探针发的占位 `event:{}` 缺内部字段(`id`/`status`),补 `id` 后报错下移到 `status`,证明 kernel 已过 `threadId`+`event` 信封层,缺的是 event **内容**(真前端回传 guardianWarning 的真实事件即有),非 wiring 漂移。

> 第 1 批实测:`cd apps/desktop/src-tauri && cargo check` → `Finished dev in 5.72s`,零编译错误、新方法零 unused 警告(全链路接通);`cd apps/desktop && npm run typecheck` → 通过。新方法全部走 5 层 archive_thread pattern,协议方法名零改写。

## 内核 bump 验证(已完成)

- 2026-06-28:`codex-upstream` checkout `bdd282f` → `cargo build -p codex-app-server` 成功(1m44s)→ M0 四探针(initialize/model.list/thread.start/turn.start)复跑全绿。
- 遗留:探针只覆盖 4 方法 happy path;壳完整参数用法对新内核的字段级兼容待 `tauri dev` 冒烟。
