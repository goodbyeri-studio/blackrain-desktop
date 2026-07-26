# Verification

> 记录每批接入的实测命令与结果。下文最新完整能力基线是 `cfead68`;当前锁定 rust-v0.144.5 / `87db9bc` 只完成源码差异与协议方法集合静态审计,尚未构建,全量 capability 重验和 Windows GUI 冒烟仍未跑。「shape 被接受」不代表方法无认证/stub/平台门控。

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
| 1 | thread/delete | ✅ 5.72s 零错误 | ✅ 通过 | 未跑 | 2026-06-28 |
| 1 | thread/items/list | ✅ 同上 | ✅ | 未跑 | 2026-06-28 |
| 1 | thread/backgroundTerminals/list | ✅ 同上 | ✅ | 未跑 | 2026-06-28 |
| 1 | thread/backgroundTerminals/terminate | ✅ 同上 | ✅ | 未跑 | 2026-06-28 |
| 1 | environment/info | ✅ 同上 | ✅ | 未跑 | 2026-06-28 |
| 1 | thread/deleted(通知) | 免代码(泛化转发) | — | 未跑 | 2026-06-28 |
| 2 | skills/config/write · extraRoots/set · hooks/list | ✅ 6.28s 零错误 | ✅ 通过 | 未跑 | 2026-06-28 |
| 2 | plugin/{list,installed,read,install,uninstall,skill/read} | ✅ 同上 | ✅ | 未跑 | 2026-06-28 |
| 2 | marketplace/{add,remove,upgrade} | ✅ 同上 | ✅ | 未跑 | 2026-06-28 |

> 第 2 批实测:`cargo check` → `Finished dev in 6.28s`,零编译错误、12 方法零 unused 警告(全链路接通);`npm run typecheck` → 通过。复杂参数(Vec/Option<Vec>/bool)走现成 helper(parse_string_array / parse_optional_string_array / parse_optional_bool),AbsolutePathBuf/enum 在 wire 层降为 string,不引入 typed Rust 结构。

## 协议 shape 探针(2026-06-28,headless,验 deny_unknown_fields)

脚本 `.scratch/m0_capability_probe.py`(gitignored):把 batch-1/2 全部 17 个方法的参数 shape(壳实际发的 camelCase wire keys)直接发给 `bdd282f` 内核。判定:`result` 或语义错(thread not found / unknown id 等)= **shape 被接受**;`unknown field`/deserialize 错 = 真漂移。

**结果:17/17 shape OK,SHAPE-DRIFT = 0。** camelCase 键、参数信封、5 层 pattern 在协议层全部验证正确。明细:
- PASS(有 result):thread/delete、skills/config/write、skills/extraRoots/set、hooks/list、plugin/list、plugin/installed、marketplace/upgrade
- SEMANTIC(shape OK,语义错):thread/backgroundTerminals/{list,terminate}、environment/info、plugin/{read,install}、marketplace/{add,remove}
- ⚠️ **`thread/items/list` → 内核回 "is not supported yet"(-32601)**:壳已正确接入,但 `bdd282f` 内核侧尚未实现(stub)。它本应取代已删除的 `thread/turns/items/list`,故当前内核两者都不可用——壳是「接入超前于内核」,待未来 bump 点亮。
- ⚠️ `plugin/uninstall`、`plugin/skill/read` → "chatgpt authentication required for remote plugin catalog":shape OK;**远程**目录插件需 OpenAI auth,本地插件可用(符合 C 类 OpenAI 门控边界)。

**该批次在当时基线还缺 GUI 冒烟**：协议 shape 已自证，但 IPC→command→daemon 粘合和前端交互没有实跑。当前还必须额外对 `87db9bc` 重跑 shape，并复核认证、stub、实验开关与 Windows 运行时门控。

## 第 3 批 a(Thread 高级,13 方法)2026-06-28

- 接入:9 typed + 4 Value-透传(thread/goal/set、settings/update、metadata/update、approveGuardianDeniedAction;见 decisions 透传决策)。
- `cargo check` → `Finished dev in 6.93s`,零错误、13 方法零 unused 警告(全链路接通);`npm run typecheck` → 通过。
- 协议 shape 探针:**13/13 shape OK**。12 个直接 PASS/SEMANTIC;`thread/approveGuardianDeniedAction` 初判 SHAPE-DRIFT 经复测确认为**假阳性**——探针发的占位 `event:{}` 缺内部字段(`id`/`status`),补 `id` 后报错下移到 `status`,证明 kernel 已过 `threadId`+`event` 信封层,缺的是 event **内容**(真前端回传 guardianWarning 的真实事件即有),非 wiring 漂移。

## 第 3 批 b(模型/实验/权限/MCP深度/Windows沙箱/外部迁移,12 方法)2026-06-28

- 接入:10 typed + 2 Value(`experimentalFeature/enablement/set` 的 enablement map、`externalAgentConfig/import` 的 migrationItems 嵌套)。
- `cargo check` → `Finished dev in 6.37s`,零错误、12 方法零 unused 警告(全链路接通);`npm run typecheck` → 通过。
- 协议 shape 探针:**12/12 shape OK,SHAPE-DRIFT = 0**。9 PASS;`mcpServer/{oauth/login,resource/read,tool/call}` 3 个 SEMANTIC("unknown MCP server 'fake'" = 过了反序列化、是语义错)。

## #3 总计(batch-1 + 2 + 3a + 3b)

**42 个方法在当时基线走完 5 层包装**,`cargo check` + `npm run typecheck` 双绿、协议 shape 探针 0 真漂移。明细:batch-1=5、batch-2=12、batch-3a=13、batch-3b=12。
- 已知门控:`thread/items/list` 在 `cfead68` 为上游 stub;`plugin/skill/read` 与部分远程 plugin 路径需 OpenAI auth;MCP 只验到 fake server 的参数 shape;Windows sandbox 未在 Windows 运行。
- **剩余不只是 GUI 冒烟**:还有 `87db9bc` 全量重验、Windows 运行时门控验证和 spec 005 GUI 落地。

> 第 1 批实测:`cd apps/desktop/src-tauri && cargo check` → `Finished dev in 5.72s`,零编译错误、新方法零 unused 警告(全链路接通);`cd apps/desktop && npm run typecheck` → 通过。新方法全部走 5 层 archive_thread pattern,协议方法名零改写。

## 历史内核 bump 验证(截止 `cfead68`)

- 2026-06-28:`codex-upstream` checkout `bdd282f` → `cargo build -p codex-app-server` 成功(1m44s)→ M0 四探针(initialize/model.list/thread.start/turn.start)复跑全绿。
- 遗留:探针只覆盖 4 方法 happy path;壳完整参数用法对新内核的字段级兼容待 `tauri dev` 冒烟。

### 2026-06-30:bump `bdd282f` → `cfead68`(上游 main 最新)

- 上游区间 `bdd282f...cfead68` = 9 提交;唯一碰协议契约的是 `protocol/src/openai_models.rs`,且**纯增量向后兼容**:`ReasoningEffort` 加 `Max` 变体(未知值本就 fall through 到 `Custom`)、`ModelInfo` 加 `include_skills_usage_instructions: bool`(带 `#[serde(default)]`)。其余 8 提交不碰 app-server JSON-RPC 契约。
- 行为默认值变化(不影响协议,记录备查):`#30297` 远程插件改默认开、`#30467` `max` 推理档升为一等公民。
- 重建:`cargo build -p codex-app-server`(50s)+ `codex-cli --bin codex`(1m11s)成功;二进制时间戳 2026-06-30 16:48 / 16:46。
- **协议四探针**(initialize/model.list/thread.start/turn.start)→ 全 PASS。
- **能力 shape 探针 17 方法** → SHAPE-DRIFT = **0**;所有 SEMANTIC 均为预期语义错(fake id/未认证),shape 全被接受。`thread/items/list` 在 `cfead68` 仍回「not supported yet」(-32601)——与 `bdd282f` 同状态,未点亮也未退化,「接入超前于内核」记录依然成立。
- 钉定真源已同步:`scripts/fetch-references.sh`、`CLAUDE.md`、`AGENTS.md`。
- 遗留:同上,字段级完整参数兼容 + GUI 待 `tauri dev` 冒烟(无头环境做不了的那半)。

## 历史锁定 rust-v0.144.1 / `44918ea` 重验

- 2026-07-12：相对 `da4c8ca`，ClientRequest、ServerRequest、ServerNotification 方法集合无增删；现有 65 个壳层 outgoing 方法没有出现“上游方法删除”。
- 2026-07-12：`cargo check -p codex-app-server-protocol -p codex-app-server` 在 macOS 通过。
- payload schema 有扩展：`AuthMode` 新增 `headers`，`AppToolApproval` 新增 `writes`，login 参数增加可选品牌/hosted success page，web search/image generation 类型被抽取但字段结构保持兼容。
- 未完成：42 项 capability shape、认证/stub/实验门控重验、Windows GUI 冒烟与真实 Gateway 工具调用。

| 范围 | 结果 | 备注 |
|---|---|---|
| 上游 `codex-app-server-protocol` + `codex-app-server` `cargo check` | 通过（macOS） | 只证明候选上游源码基础编译健康 |
| BlackRain 壳 `cargo check` + `npm run typecheck` | 未跑/未记录 | 本轮未修改壳代码；不沿用 `cfead68` 结论 |
| 42 方法 capability shape 探针 | 未跑 | 需刷新 stub/认证/实验门控 |
| Windows `tauri:dev:win` GUI 冒烟 | 未跑 | 只有此项通过后才能声称对应 GUI 可用 |

## 当前锁定 rust-v0.144.5 / `87db9bc` 静态审计

- 2026-07-26：官方 tag 解引用为 `87db9bc18ba5bc82c1cb4e4381b44f693ee35623`；`app-server-protocol`、feature 开关、浏览器/Computer Use 相关文件相对 0.144.1 无变化，LICENSE/NOTICE 无变化。
- 2026-07-26：0.144.6 另含 bundled model metadata、基础提示词和上下文窗口变化，本轮未采用。
- 未完成：0.144.5 构建、42 项 capability shape、Windows GUI、真实 Gateway 工具调用、NSIS 与安装/卸载验证。
