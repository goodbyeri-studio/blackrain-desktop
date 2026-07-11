# Verification

> **记录规则**：本 spec 当前只有目标设计和任务。Hermes 上游测试、独立 spike、静态 UI、Tauri command 存在和 macOS 开发结果，都不能单独证明 Windows WORK surface 闭环或发布可交付。

## 当前状态

- Hermes Tauri 子进程纳管：不存在。
- 独立 `HERMES_HOME` 产品配置写入：不存在。
- WORK `/v1/runs` client 和 SSE bridge：不存在。
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
| 2026-07-12 | Rust config domain | named provider、bare custom 拒绝、隔离路径、原子写入/last-good/repair、loopback env、强 key、脱敏 | `cargo test hermes_core --lib` | `22 passed`（macOS） | keyring smoke 默认跳过；Windows `MoveFileExW` 分支未在本机编译 |
| 2026-07-12 | Rust 非测试构建 | Hermes contract/config/secrets 纳入 App 与 daemon shared module | `cargo check` | 通过（macOS，75/79 个 dead-code 等 warning） | 新模块尚未接 adapter，warning 符合当前阶段；不替代 Windows check |
| 2026-07-12 | TypeScript contract | shared WorkEvent fixture、raw unknown event guard、malformed event 拒绝 | `npm run test -- --run src/features/work/types.test.ts` | `4 passed`（macOS） | 与 Rust 共用 `work-event-agent-delta.json` |
| 2026-07-12 | 前端静态检查 | 新增 WORK contract types | `npm run typecheck` | 通过（macOS） | 不替代 Windows 验证 |
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

这些均不证明当前 BlackRain 客户端存在 WORK surface。

## 未验证风险

- Hermes run event schema 尚未保存为 BlackRain contract fixtures。
- Windows 预构建 venv、包体和 asyncio 降级未验证。
- App data 下 HERMES_HOME、bearer、secret 和 config writer 未实现。
- Windows process tree、休眠恢复、孤儿清理和端口冲突未验证。
- SSE replay/reconnect 和 App 重启恢复策略未定案。
- Hermes Desktop 组件尚未逐文件做 License/依赖审计。
- 工作台激活 contract 尚未在 008 实现。
- 生产 credit/new-api/BYOK 路由仍待 002/003 决策。
- Office 质量基线未跑，无法证明 Hermes 能稳定完成长链任务。
- Remote backend parity 尚未定案；首版可能明确 local-only。

## 失败记录

暂无本 spec 实现，暂无 BlackRain WORK 运行失败记录。后续失败不得只留在聊天或 CI 日志中。
