# Tasks

> 本清单覆盖 Hermes WORK surface 长期完整闭环，不按单次 Goal 时长裁剪。Goal 每轮从最早未完成且未阻塞的任务继续；只在 `verification.md` 有对应证据时勾选。部分完成写子项和验证，不用“差不多完成”跳阶段。

## 阶段 0：边界、上游和现状审计

- [x] 阅读根 `AGENTS.md`、`apps/desktop/AGENTS.md`、spec 003/007/008 和模板
- [x] 确认 Hermes 锁定 v2026.7.7.2 / `9de9c25`
- [x] 确认目标协议包含 `/health`、`/v1/capabilities`、`/v1/models`、`/v1/runs`、events、approval、stop
- [x] 创建本 spec 五件套
- [x] 逐项记录锁定 Hermes 的 run event schema 和示例 payload，建立无敏感数据 fixtures
- [x] 盘点 Hermes Desktop 中 session、composer、tool、approval、gateway status、PTY、skills/memory 面板的真实来源文件
- [x] 为每个 UI 候选记录复制/重写决定、Electron 耦合、第三方依赖和 MIT 署名要求
- [x] 盘点现有 Tauri 子进程、sidecar、process tree、keyring、App data、event fanout 可复用基础设施
- [x] 盘点当前 Windows resource/vendor/release 脚本中 Hermes runtime 的缺口
- [x] 决定并记录 local-only 与 Daemon parity 边界
- [x] 决定 Hermes runtime 属于基础包还是 008 managed runtime
- [x] 决定 BlackRain task ↔ Hermes session/run 的持久映射格式
- [x] 将生产 credit/new-api/BYOK 未决项链接到 002/003，不在实现中偷偷定案

## 阶段 1：协议 contract 和 fake server

- [x] 定义版本化 Hermes raw protocol types，只覆盖实际使用字段并保留 unknown event
- [x] 定义稳定 `WorkEvent`、`WorkTask`、`WorkRuntimeStatus`、`WorkError` contract
- [x] 保存锁定版本 capabilities/models/runs/SSE/approval/stop fixtures
- [x] 实现 fake Hermes HTTP/SSE server 测试支架
- [x] 覆盖正常 run：创建 → stream → tool → completion
- [x] 覆盖 approval：pending → approve/deny → continue/terminate
- [x] 覆盖 stop、模型错误、工具错误、鉴权失败和 capability 缺失
- [x] 覆盖断流、重复事件、未知事件、乱序、重连和已结束 run
- [x] 冻结 Rust↔TypeScript 序列化 contract 测试

## 阶段 2：隔离配置和凭据

- [x] 新建 shared Hermes config domain，不在 `lib.rs` 直接拼 YAML/.env
- [x] 使用 Tauri App data API 解析独立 `HERMES_HOME`
- [x] 实现 config schema 和原子写入
- [x] 只生成命名 `providers:`，增加禁止 bare `custom` 的测试
- [x] 配置 `127.0.0.1`、受控端口、`API_SERVER_ENABLED=true` 和非空 bearer
- [x] 生成高熵 `API_SERVER_KEY`，实现安全保存/轮换策略
- [x] 对接模型/平台 secret reference，不在配置、日志或项目中落明文
- [x] 注入 `CUA_DRIVER_RS_TELEMETRY_ENABLED=0`，默认不接 Nous Portal
- [x] 实现脱敏 config/runtime summary
- [x] 配置损坏时保留上一个可用版本并输出 repair plan
- [x] 为工作台激活定义受限 desired-state 输入，禁止任意全局环境覆盖

## 阶段 3：Windows Hermes runtime 制品

- [ ] 冻结 Python 版本、Hermes commit、核心 extra 和直接/传递依赖清单
- [ ] 排除 `messaging`、`edge-tts`、`honcho`、未核实 `hindsight` 等不允许依赖
- [ ] 生成 Windows x64 预构建 venv，不使用 PyInstaller/Nuitka
- [ ] 验证 Windows 无 `uvloop` 时可靠降级 asyncio
- [ ] 建立 runtime provenance、checksums、LICENSES 和 NOTICE
- [ ] 实现 `vendor-hermes-runtime.ps1` 或等价可复现脚本
- [ ] 将 runtime 加入 Tauri Windows resources 和 release script
- [ ] 更新 doctor 检查 runtime 完整性、Python 可执行和关键 import
- [ ] 干净 Windows 环境验证无需系统 Python/uv/Node
- [ ] 记录实际包体、冷启动和内存基线

## 阶段 4：Hermes 进程 supervisor

- [ ] 新建 `src-tauri/src/shared/hermes_core` 及 process supervisor
- [ ] 实现 runtime 状态机和线程安全共享状态
- [ ] 实现并发 start 去重
- [ ] spawn 前台 `hermes gateway` 并注入专属环境
- [ ] 捕获并滚动保存脱敏 stdout/stderr
- [ ] health + capabilities readiness，日志字符串只作辅助
- [ ] 处理启动超时、端口冲突、旧 PID 和 bearer 不匹配实例
- [ ] 实现 graceful stop、超时强杀和 Windows process tree 回收
- [ ] App 正常退出时清理 Hermes 和受控 MCP 子进程
- [ ] App 异常退出/下次启动时审计并清理或安全接管孤儿进程
- [ ] 处理系统休眠/恢复和网络变化
- [ ] 暴露 runtime status、start、stop、restart、repair、logs Tauri commands
- [ ] local-only 时为 remote backend 返回显式 unsupported
- [ ] 补 supervisor 单元、并发和失败注入测试

## 阶段 5：Hermes API client

- [ ] 实现 loopback + bearer HTTP client 和统一超时
- [ ] 实现 `/health`、`/v1/capabilities`、`/v1/models`
- [ ] 实现 `POST /v1/runs`
- [ ] 实现 `GET /v1/runs/{run_id}`
- [ ] 实现 `GET /v1/runs/{run_id}/events` SSE consumer
- [ ] 实现 `POST /v1/runs/{run_id}/approval`
- [ ] 实现 `POST /v1/runs/{run_id}/stop`
- [ ] 实现闭环所需 session list/read/create/resume 接口
- [ ] 将 HTTP/上游错误映射为结构化 `WorkError`
- [ ] 为每次请求加入 request id、版本 User-Agent 和脱敏 tracing
- [ ] 对取消、超时、重试、幂等和 backpressure 建立测试

## 阶段 6：事件 normalizer 和任务存储

- [ ] 实现 raw Hermes event → `WorkEvent` 映射
- [ ] 实现稳定 event id/sequence 和重复事件去重
- [ ] 实现 text delta 聚合与 completed message 收敛
- [ ] 实现 tool start/progress/result/error 生命周期
- [ ] 实现 approval request/resolution 生命周期
- [ ] 实现 user input、file/media output、warning/error 映射
- [ ] 未知事件进入诊断，不使 stream/reducer 崩溃
- [ ] 实现 task/session/run 持久映射和 schema migration
- [ ] 实现 App 重启后的恢复审计
- [ ] 区分 resumable/completed/failed/orphaned 状态
- [ ] 恢复时不重复消息、工具和审批
- [ ] 高事件频率下增加批处理/节流，避免 UI 卡顿

## 阶段 7：Tauri commands 和事件桥

- [ ] 在 App adapter 暴露 runtime、task、approval、stop、resume、diagnostics commands
- [ ] 在 `lib.rs` 注册命令，保持 adapter 薄
- [ ] 在 `src/services/tauri.ts` 增加唯一前端 IPC 包装
- [ ] 在 `src/services/events.ts` 增加 WORK event 单 listener fanout
- [ ] 定义前后端 types 并增加 contract 测试
- [ ] 远程 backend 分支按 decision 显式处理，不静默落本地
- [ ] 审核命令参数不允许任意 host、port、binary、env 或路径穿越

## 阶段 8：WORK 前端状态层

- [ ] 新建独立 `src/features/work/`，不复用 Codex thread reducer 存储 Hermes 状态
- [ ] 实现 runtime hook 和启动/修复状态
- [ ] 实现 tasks list/load/create/resume/delete-local-metadata
- [ ] 实现 `WorkEvent` reducer 和 selectors
- [ ] 实现 send/stop/retry/approval/user-input actions
- [ ] 防止重复发送、重复审批和 stop 竞态
- [ ] 实现断流恢复和 App 重启恢复状态
- [ ] 为 reducer/hooks/actions 建立完整测试

## 阶段 9：Codex 风格 WORK surface UI

- [ ] 把工作台/项目/任务路由接入现有 App 装配，不让 `App.tsx` 承担状态机
- [ ] 实现 WORK task sidebar 和空状态
- [ ] 实现 Codex 风格消息流和 Markdown/附件显示
- [ ] 实现 Composer、发送、排队/禁用、Stop 和继续任务
- [ ] 实现 reasoning/progress 呈现，避免暴露不应展示的内部内容
- [ ] 实现 tool call 卡片、参数摘要、进度、结果、错误和耗时
- [ ] 实现 approval UI，展示工具来源、影响、参数和 approve/deny
- [ ] 实现 user input request UI
- [ ] 实现 file/media/output 卡片和打开项目文件入口
- [ ] 实现 runtime status、连接恢复和崩溃 repair UI
- [ ] 实现诊断面板和脱敏复制
- [ ] 复用现有 DS modal/toast/panel/popover/token，通过 `lint:ds`
- [ ] 完成键盘、焦点、ARIA、缩放和 Windows 高 DPI 检查
- [ ] WORK/CODE 切换不丢各自任务状态，不产生两套壳 chrome

## 阶段 10：Hermes Desktop 参考能力迁移

- [ ] 完成候选组件清单和来源 commit 存证
- [ ] 优先重写 gateway connecting/boot failure 状态到现有 DS
- [ ] 借鉴 session resume/watchdog 行为
- [ ] 借鉴 composer status/queue 和 clarify/approval 行为
- [ ] 借鉴 tool progress/result summary
- [ ] 评估并按需实现 PTY attach/detach 与长任务面板
- [ ] 评估并按需实现 skills/memory/model 面板
- [ ] 每个复制文件加来源头，更新 NOTICE/THIRD-PARTY
- [ ] 移除 Electron、Node preload 和 Hermes 私有 dashboard runtime 依赖
- [ ] 对复制/重写后的行为补 BlackRain 测试，不沿用上游测试数量冒充覆盖

## 阶段 11：工作台激活接缝（与 spec 008 联动）

- [ ] 定义 `ActivatedWorkbenchContext` contract
- [ ] 接收 workbench id/version、project、task、skill roots、plugins/MCP、env refs、permissions
- [ ] 将 Skills 映射到专属 Hermes 环境
- [ ] 注册/注销受控 MCP server，并验证 `tools/list_changed`
- [ ] 动态挂载/拔出插件时不重启当前对话，失败可恢复
- [ ] 停用工作台时停止其受控进程但保留用户项目
- [ ] 防止不同工作台环境变量、Skills、MCP 和 session 串台
- [ ] Office 官方工作台进入 WORK surface，而不是 CODE 临时路径
- [ ] 工作台未通过 008 activate/verify 时禁止创建正式任务

## 阶段 12：真实模型、工具和 Office 纵切

- [ ] 锁定 Hermes 经 new-api/国产模型完成真实流式 run
- [ ] 完成至少一个安全只读工具调用
- [ ] 完成一个需要审批的写/执行工具调用
- [ ] 完成用户拒绝审批后的可解释收敛
- [ ] 完成运行中 Stop 和后续继续/重试
- [ ] 完成输出文件写入用户项目并在 UI 打开
- [ ] 完成 App 重启后恢复任务
- [ ] Office 官方工作台完成第一条黄金流程
- [ ] 逐步建立 5 场景 × 10 次 Windows 质量基线，结果同步 003/007/009

## 阶段 13：稳定性、安全和诊断

- [ ] 失败注入：断网、new-api 5xx、模型超时、SSE 断开、工具崩溃
- [ ] 失败注入：端口冲突、runtime 文件损坏、config 损坏、磁盘不足
- [ ] 失败注入：App 强退、Hermes 强退、睡眠恢复、系统重启
- [ ] 审核所有日志和诊断包的 secret/用户内容脱敏
- [ ] 验证 loopback/bearer、权限和路径边界
- [ ] 验证工作台不能修改全局 `~/.hermes` / `~/.codex`
- [ ] 验证 WORK 失败不拖垮 CODE surface
- [ ] 性能分析：冷启动、事件吞吐、长会话内存、任务列表规模
- [ ] 建立上游 Hermes 升级 contract regression 流程

## 阶段 14：Windows 发布闭环

- [ ] Windows x64 完成前端 typecheck/test/lint/DS checks
- [ ] Windows Rust `cargo check` 和相关测试通过
- [ ] 构建 NSIS 并检查 Hermes runtime、LICENSES、provenance、checksums
- [ ] 安装后无需开发工具启动 WORK surface
- [ ] Credential Manager 写读清理通过
- [ ] 真实模型、工具、审批、Stop、恢复和 Office 黄金流程通过
- [ ] 卸载后无失控 Hermes/MCP 进程
- [ ] 卸载默认保留用户项目和按策略保留 App data
- [ ] SmartScreen/签名/杀毒误报策略有真实记录
- [ ] 更新 spec 007 发布矩阵，不用本 spec 替代 Windows 总验收

## 阶段 15：核心闭环后的能力评估

- [ ] 评估 Hermes `model_routes` 是否进入工作台模型路由
- [ ] 评估多 Profile 是否映射工作台隔离，避免与 008 状态重复
- [ ] 评估 Memory provider UI 与外置共享记忆策略
- [ ] 评估 session export 是否成为交付/审计能力
- [ ] 评估 PTY、Cron、MOA、自验证的真实垂类价值
- [ ] WhatsApp/Telegram/Discord 等渠道另行决策，不默认进入桌面 MVP

## 收口纪律

- [ ] 每次 Goal/PR 更新本 tasks 和 verification，失败也记录
- [ ] 勾选项必须有代码位置、测试输出或 Windows 人工证据
- [ ] “静态 UI 存在”不得替代真实 Hermes run
- [ ] “macOS 测试通过”不得替代 Windows 发布
- [ ] “Hermes 上游支持”不得替代 BlackRain 已接入
- [ ] 与 003/007/008 冲突时同步修正或在 decisions 标待决
- [ ] 未完成风险在最终 PR 和发布说明中明确列出
