# Verification

> **记录规则**：本 spec 当前只有目标设计和任务。Hermes 上游测试、独立 spike、静态 UI、Tauri command 存在和 macOS 开发结果，都不能单独证明 Windows WORK surface 闭环或发布可交付。

## 当前状态

- Hermes process supervisor：shared 状态机、AppState 持有、spawn/readiness/stop/日志和正常退出清理已实现；尚无产品命令、旧 PID 恢复和 Windows 实机证据。
- 独立 `HERMES_HOME` 配置域：shared 实现与单元测试已存在，尚未由 supervisor/产品命令调用。
- Windows Hermes runtime：版本/依赖策略、生成脚本、Tauri resource 和 doctor 门禁已存在；Windows venv 尚未生成和执行。
- WORK `/v1/runs` shared client 与增量 SSE decoder：已实现并通过 fake HTTP server 测试；尚未接 Tauri event bridge/任务层。
- WORK 前端 feature/reducer/UI：不存在。
- 工作台激活到 WORK 的接缝：不存在。
- Windows NSIS 内 Hermes runtime：未验证。

## 验证矩阵

| 日期 | 层级 | 范围 | 命令/方式 | 结果 | 备注 |
|---|---|---|---|---|---|
| 2026-07-12 | 文档 | spec 五件套存在 | 静态检查 | 存在 | 只证明长期任务已建立 |
| 2026-07-12 | 上游 contract | Hermes v2026.7.7.2 runs/SSE/approval/stop 源码审计 | `git -C hermes-upstream rev-parse HEAD` + 静态源码/测试核对 | 通过 | commit `9de9c25f620ff7f1ce0fd5457d596052d5159596`；发现 SSE 无 cursor/replay，见 `references/hermes-v2026.7.7.2-contract.md` |
| 2026-07-12 | Fixtures | capabilities/models/runs/events/approval/stop/error/SSE 无敏感样例 | `find ... -name '*.json' -print0 \| xargs -0 -n1 jq empty` | 通过（26 个 JSON，34 个 fixture 文件） | 只证明样例格式，不证明网络运行 |
| 2026-07-12 | UI/Runtime 审计 | Hermes Desktop 候选、BlackRain 可复用基础设施、Windows 缺口 | 静态路径/依赖/脚本核对 | 通过 | 当前决定全部重写，未复制上游 React 源码 |
| 2026-07-12 | Rust contract/fake server | raw protocol、SSE、正常 run、approval allow/deny、stop、auth/model/tool/capability failure、断流、重复/未知/乱序、terminal reconnect | `cargo test hermes_core --lib` | `12 passed`（macOS） | 222 tests filtered；故障注入支架，不证明真实 Hermes client/supervisor |
| 2026-07-12 | Rust config domain | named provider、bare custom 拒绝、App data 隔离路径、原子写入/repair、loopback env、强 key、结构化 secret ref、任意 env 拒绝 | `cargo test hermes_core --lib` | `25 passed`（macOS） | keyring smoke 默认跳过；Windows `MoveFileExW` 分支未在本机编译 |
| 2026-07-12 | Rust 非测试构建 | Hermes contract/config/credential store 纳入 App 与 daemon shared module，`AppState` 持有 app-data 派生路径 | `cargo check` | 通过（macOS，78/83 个 dead-code 等 warning） | 新模块尚未接 adapter，warning 符合当前阶段；不替代 Windows check |
| 2026-07-12 | TypeScript contract | shared WorkEvent fixture、raw unknown event guard、malformed event 拒绝 | `npm run test -- --run src/features/work/types.test.ts` | `4 passed`（macOS） | 与 Rust 共用 `work-event-agent-delta.json` |
| 2026-07-12 | 前端静态检查 | 新增 WORK contract types | `npm run typecheck` | 通过（macOS） | 不替代 Windows 验证 |
| 2026-07-12 | Windows runtime 冻结 | Python 3.12.8、Hermes tag/commit、`pyproject.toml`/`uv.lock` hash、无 extra、仅补 `aiohttp==3.14.1` | manifest 与锁文件 hash 静态核对；`uv export --frozen --no-dev --extra messaging --no-emit-project` | 通过（macOS 静态） | export 确认 aiohttp 锁为 3.14.1；只作为 constraint，不安装 messaging 全量 |
| 2026-07-12 | Windows 依赖解析 | Hermes core 的 Windows x64 冻结解析和禁止分发包检查 | `uv sync --dry-run --frozen --no-dev --no-editable --python-platform x86_64-pc-windows-msvc --python 3.12` | 通过（64 个 core distribution，无禁止包/uvloop） | 使用本机 uv 0.11.12；dry-run 不是 Windows 安装或 import 证据 |
| 2026-07-12 | Runtime vendor 静态检查 | inventory、JSON、Node 语法、diff whitespace | `python3 -m py_compile scripts/hermes-runtime-inventory.py`; inventory 临时 smoke；`node --check apps/desktop/scripts/doctor.mjs`; `jq empty ...`; `git diff --check` | 通过（macOS） | 本机无 `pwsh`，PowerShell 语法及 Windows runtime 生成未执行 |
| 2026-07-12 | 前端基线 | runtime doctor 改动后的 TypeScript、全量 Vitest 和 ESLint 基线 | `npm run typecheck`; `npm run test`; `npm run lint` | 通过（146 files / 1071 tests；lint 0 error、5 个既有 hook warning） | 测试有既有 React `act(...)`/canvas stderr；lint warning 位于未修改文件 |
| 2026-07-12 | Hermes shared client | loopback/bearer、health/capabilities/models、run create/status/events/approval/stop、session seams、OpenAI error、request id/UA、SSE 分块/断流 | `cargo test hermes_core --lib` | `31 passed`（macOS） | fake HTTP server；不证明真实 Hermes、Windows runtime、Tauri bridge 或自动恢复 |
| 2026-07-12 | Rust 非测试构建 | reqwest JSON/stream client 纳入 App 与 daemon shared module | `cargo check` | 通过（macOS，既有 dead-code warning） | client 尚未由 adapter 调用；不替代 Windows check |
| 2026-07-12 | Hermes supervisor | runtime 缺失、状态机、并发 start 单 spawn、环境隔离、滚动脱敏日志、health→capabilities→models readiness、bearer mismatch、stop | `cargo test hermes_core --lib` | `37 passed`（macOS） | 使用 fixture 可执行文件和 fake HTTP server；Windows `taskkill /T`、真实 runtime、旧 PID/睡眠恢复未验证 |
| 2026-07-12 | App 生命周期 | `AppState` 解析 bundled/dev runtime 并持有 supervisor；`ExitRequested` 无论 daemon 保留设置都先 stop Hermes | `cargo check` + 静态调用链核对 | 通过（macOS 编译） | 尚未启动真实 Hermes；受控 MCP 清理未接入 |
| 2026-07-12 | 上游 | Hermes 锁定版本 API/Windows 相关测试 | 见 spec 003 verification | `315 passed`（macOS） | 证明上游候选基础健康，不证明 BlackRain 接入 |
| 2026-06-26 | 独立 spike | Hermes→new-api→DeepSeek、流式、工具调用 | 见 spec 003 verification | 通过（macOS） | 早于当前 Hermes 锁，且未经过 Tauri/WORK UI |
| YYYY-MM-DD | contract | fake server runs/SSE/approval/stop | Rust/TS tests | 未跑 | 覆盖断流、重复、乱序、恢复 |
| YYYY-MM-DD | 配置 | 独立 HERMES_HOME/config/secret | unit + static inspection | 未跑 | 不触碰用户全局目录 |
| YYYY-MM-DD | 进程 | supervisor start/health/stop/crash | integration tests | 未跑 | 标明平台 |
| YYYY-MM-DD | 前端 | WORK reducer/components/actions | `npm run test` | 未跑 | 静态截图不算通过 |
| YYYY-MM-DD | 壳集成 | 真实 run + SSE + tool + approval + stop | Tauri dev | 未跑 | macOS 只作开发证据 |
| YYYY-MM-DD | 工作台 | 008 activate → WORK context | integration/E2E | 未跑 | Manifest 存在不能替代激活 |
| YYYY-MM-DD | Windows runtime | 无系统 Python/uv 启动 Hermes | Win11 x64 | 未跑 | 基础发布门槛 |
| YYYY-MM-DD | Windows 产品 | Office 黄金流程 | Win11 x64 GUI | 未跑 | 必须产生真实用户项目输出 |
| YYYY-MM-DD | Windows 发布 | NSIS 安装/首启/崩溃清理/卸载 | 人工矩阵 | 未跑 | 同步 spec 007 |

## 每轮实现验证入口

根据实际修改范围运行，不把未涉及命令写成通过：

```powershell
# Windows / apps/desktop
npm run typecheck
npm run test
npm run lint
npm run lint:ds
npm run codemod:ds:dry

# Rust backend
cd src-tauri
cargo check
```

新增 Hermes 专项测试后，把稳定命令补到 `docs/commands.md`；本文件记录日期、平台、版本和真实输出，不维护重复的通用命令清单。

## 必须保存的证据

- BlackRain commit 和 Hermes commit/tag。
- Windows 版本、架构和是否干净环境。
- Python/runtime/venv 版本和 checksum。
- `/v1/capabilities` 脱敏快照。
- fake/real run 的无敏感数据事件 fixture。
- typecheck/test/lint/cargo 的真实结果。
- NSIS 包内资源、LICENSES、NOTICE 和 provenance。
- Office 黄金流程输入、断言和结果摘要；用户敏感内容不入仓。
- 失败日志的脱敏摘要、根因和处理。

## 发布级过关矩阵

以下全部完成前不得称 WORK surface 发布可用：

- [ ] Windows 安装后无系统 Python/uv 依赖
- [ ] Hermes 由 App 启动并完成 health/capabilities
- [ ] 真实国产模型文本流式稳定
- [ ] 工具 start/progress/result UI 正确
- [ ] approval approve/deny 正确
- [ ] Stop 能收敛并可继续/重试
- [ ] App 重启恢复不重复事件
- [ ] 输出文件位于用户项目且可打开
- [ ] 工作台 Skills/MCP/环境隔离
- [ ] runtime/config/log secret 脱敏
- [ ] App 退出/卸载无失控进程
- [ ] Office 至少一条黄金流程通过
- [ ] spec 007 对应 Windows/NSIS 项同步通过

## 已验证

- 产品和架构层已确认 WORK surface 是普通工作台默认执行界面。
- Hermes 锁定版本存在 `/health`、capabilities/models、runs/SSE、approval 和 stop 接口。
- 独立历史 spike 证明 Hermes 经 new-api 接国产模型、流式和工具调用在开发环境可行。
- 本 spec 五件套已创建。
- Hermes config/credential shared domain 已实现并通过 macOS 单元测试，但尚未接入 supervisor。
- Windows runtime 的冻结 manifest、可复现 vendor 流程、License/NOTICE/provenance/checksum 生成逻辑、Tauri resource 声明和 doctor 完整性门禁已进入仓库并通过可用的静态检查。
- Hermes shared client 已对所有核心 run 端点和 session 接缝完成 fake server HTTP contract 测试；SSE decoder 支持 UTF-8 跨 chunk、CRLF、comment、完整终帧和截断错误。
- Hermes supervisor 已在 macOS 测试中完成 fixture 子进程从启动到 readiness 再 stop，并证明并发失败启动只 spawn 一次、stdout secret 不进入内存/磁盘日志。

这些均不证明当前 BlackRain 客户端存在 WORK surface。

## 未验证风险

- Windows 预构建 venv、PowerShell 实际执行、relocatable 搬移、包体和 asyncio 降级未验证。
- App data 下 HERMES_HOME、bearer、secret 和 config writer 尚未接入 supervisor/产品命令；Windows Credential Manager 未验证。
- Windows process tree、休眠恢复和孤儿清理未验证；端口冲突/bearer mismatch 只有 fake server 证据。
- SSE 已确认无 cursor/replay；本地 journal、断流收敛和 App 重启恢复尚未实现。
- client 尚未接统一脱敏 tracing、取消 token、任务层幂等/安全重试和 Tauri event fanout。
- Hermes Desktop 组件尚未逐文件做 License/依赖审计。
- 工作台激活 contract 尚未在 008 实现。
- 生产 credit/new-api/BYOK 路由仍待 002/003 决策。
- Office 质量基线未跑，无法证明 Hermes 能稳定完成长链任务。
- Remote backend parity 尚未定案；首版可能明确 local-only。

## 失败记录

- 2026-07-12：首次组合静态检查从 `apps/desktop` 错误使用仓库根相对路径，导致 `py_compile`/`node --check`/`jq` 报找不到文件；修正工作目录后全部通过。该错误不是产品实现失败，未计入通过证据。
- 尚无真实 BlackRain WORK 运行记录。后续失败不得只留在聊天或 CI 日志中。
