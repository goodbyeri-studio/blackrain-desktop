# 上游引擎更新检查清单

**频率**：每 2 周；安全修复随时插队

**最后检查**：2026-07-18

**MVP 平台**：Windows-only

> 目标锁定版本：codex `87db9bc` / rust-v0.144.5，Hermes `9de9c25` / v2026.7.7.2。`scripts/fetch-references.sh` 会校验 tag 对应的完整 SHA 并 detached checkout；这只证明源码版本一致，不能替代 Windows 构建和产品验收。目标锁与风险见 [REFERENCES](REFERENCES.md)，可复制构建命令见 [commands](commands.md)。

## 0. 开始前

- [ ] 在仓库根执行，不依赖上一次命令留下的当前目录。
- [ ] `git status --short --branch` 确认 BlackRain 工作树状态；不要把上游克隆或 `.scratch/` 加入主仓。
- [ ] 分别记录 `codex-upstream` / `hermes-upstream` 的完整 `HEAD`、remote URL、是否 shallow。
- [ ] 如果本地 `HEAD` 不等于目标锁，先区分“本机漂移”与“准备升级”，不要直接拿它生成发布证据。
- [ ] 本轮只做评估时，不 checkout、不构建、不修改锁版本文档。

## 1. Hermes 检查

```powershell
git -C hermes-upstream fetch origin --tags --prune
git -C hermes-upstream rev-parse HEAD
git -C hermes-upstream log HEAD..origin/main --oneline --max-count=10
git -C hermes-upstream tag -l "v2026.*" --sort=-version:refname | Select-Object -First 5
```

检查重点：

- [ ] 是否有 release / 安全修复 / Windows gateway 改进。
- [ ] `LICENSE` 是否仍为 MIT；release 快照和许可证证据是否可存档。
- [ ] Python 依赖树是否新增 GPL / AGPL / BSL / 无许可证包。
- [ ] `/v1`、SSE、审批、MCP、skills、记忆或配置 schema 是否 breaking。
- [ ] Windows 下 `uvloop`、路径、进程退出、scale-to-zero 是否有变化。
- [ ] Desktop React 组件若要借用，是否仍满足 MIT 与 NOTICE/署名要求。

## 2. Codex 检查

```powershell
git -C codex-upstream fetch origin --tags --prune
git -C codex-upstream rev-parse HEAD
git -C codex-upstream log HEAD..origin/main --oneline --max-count=10
git -C codex-upstream diff 44918ea..origin/main -- codex-rs/app-server-protocol
```

检查重点：

- [ ] RUSTSEC / sandbox / app-server / multi-agent 安全修复。
- [ ] `app-server-protocol`、配置 schema、model metadata、审批事件是否 breaking。
- [ ] Windows build、dictation stub、路径和进程行为是否变化。
- [ ] `wire_api`、Responses、tools/history、`apply_patch` 元数据是否变化。
- [ ] LICENSE / NOTICE / 商标相关文件是否变化。
- [ ] quick-xml 0.39.4 豁免和上游修复状态。

## 3. quick-xml 0.39.4 专项

```powershell
Select-String -Path codex-upstream\codex-rs\Cargo.lock -Pattern 'name = "quick-xml"' -Context 0,3
Select-String -Path codex-upstream\codex-rs\deny.toml -Pattern 'RUSTSEC-2026-0194|RUSTSEC-2026-0195'
```

2026-07-12 在 rust-v0.144.1 的复核结果：0.39.4 仍由 `plist`（syntect/TUI 路径）与 `wayland-scanner`（Linux 构建期）引入，且 OpenAI 仍在 `deny.toml` 中保留 `RUSTSEC-2026-0194` / `RUSTSEC-2026-0195` 豁免。BlackRain Windows MVP 不走 Wayland 路径，但每次升级仍要复查依赖路径和攻击面，不能永久照抄旧结论。

如果上游依赖已修复：

- [ ] 在候选 commit 上更新依赖并确认 0.39.4 消失。
- [ ] 删除不再需要的 RUSTSEC 豁免。
- [ ] 重新构建 `codex.exe` / `codex-app-server.exe`。
- [ ] 跑 Windows 协议与产品验证矩阵。

## 4. 决定是否升级

| 变更类型 | 优先级 | 原则 |
|---|---|---|
| 安全修复 | P0 | 立即评估；完成 Windows 回归后尽快跟进 |
| Breaking protocol/config | P1 | 先做接缝影响分析和迁移方案，不直接推锁 |
| Windows 关键修复 | P1 | 优先候选，必须实机复现旧问题并验证新行为 |
| 小功能增强 | P2 | 按产品优先级决定，不为追新而追新 |
| 文档/测试 | P3 | 可选，不单独触发升级 |

决定跟进时必须写清：旧锁、新锁、关键 commit、许可证变化、安全影响、协议影响、预计回归范围。无法判断的项在对应 spec `decisions.md` 标成待决。

## 5. 候选版本验证（Windows）

1. 显式 checkout 候选 commit/tag，记录完整 SHA；不要只依赖分支名。
2. 按 [commands](commands.md) 构建目标引擎制品。
3. 运行适用的协议/能力探针；`.scratch/` 脚本仅是本地工具，不可提交。
4. 运行真实 BlackRain Windows GUI：启动、创建任务、流式响应、工具调用、审批、错误与退出清理。
5. 涉及 Hermes 时验证 `/v1`、SSE、工作台/MCP、审批和进程回收。
6. 涉及打包时生成 NSIS，并完成安装、开始菜单启动、Credential Manager、真实对话、Office（如涉及）和卸载。
7. 将可复用命令、环境和真实结果写入对应 spec `verification.md`；失败也要记录。

macOS / Linux 结果只能作为补充历史证据，不能替代 Windows MVP 验收。iOS 不在当前矩阵。

## 6. 文档与锁版本收口

升级通过后同步检查：

- [ ] `docs/REFERENCES.md`：目标锁、日期、关键变更、许可证。
- [ ] `AGENTS.md` 与 `CLAUDE.md`：两份根规则同时更新，核心正文保持一致。
- [ ] 相关 `.specs/*/decisions.md`：升级理由、取舍、被推翻假设。
- [ ] 相关 `.specs/*/verification.md`：Windows 命令、环境、真实结果与失败记录。
- [ ] `README.md`：只有全局当前状态或优先级变化时才更新。
- [ ] `docs/09`：只有运行时边界变化时才更新。
- [ ] `docs/commands.md`：只有正式可复制命令变化时才更新。

`.scratch/` 已被 `.gitignore` 排除，**不得 `git add .scratch/`**。临时日志里的有效结论要整理进 spec；密钥、JWT、cookie、私有 URL 和用户内容必须脱敏。

## 7. PR 检查

- [ ] PR 标题和提交使用 Conventional Commits。
- [ ] 明确列出上游来源、许可证与 NOTICE/署名处理。
- [ ] 明确列出 Windows 实机验证与未验证项。
- [ ] 没有修改两个上游的 agent 循环；若 B2B 合规触发最小 fork，已有独立 decision/spec。
- [ ] 没有把 gitignored 上游克隆、二进制、venv 或 `.scratch/` 加入主仓。
- [ ] 没有泄露密钥或未脱敏日志。

## 历史更新记录

| 日期 | 引擎 | 版本 | 原因 | 证据口径 |
|---|---|---|---|---|
| 2026-07-18 | Codex | rust-v0.144.5 / `87db9bc` | 同 0.144 patch 线保守跟进；`app-server-protocol`、features、浏览器相关文件相对 0.144.1 无变化，纯 bug fix + Windows 沙箱与 `is_dangerous_command` 修复；LICENSE/NOTICE/quick-xml 0.39.4 状态不变 | 仅源码 re-pin：本地 detached checkout 到 `87db9bc` + diff 评估；**未构建、未跑 cargo check、未做 Windows 验收**；0.144.1 的旧证据不继承。Windows 沙箱/审批行为变更需后续实机复验 |
| 2026-07-12 | Hermes | v2026.7.7.2 / `9de9c25` | 同步最新稳定版；保留 `/v1` Chat/Responses/runs 接缝，加入 model routes 等增强 | 315 个 API Server/Windows 相关测试在 macOS 通过；Tauri 接入与 Windows 产品矩阵未跑 |
| 2026-07-12 | Codex | rust-v0.144.1 / `44918ea` | 同步最新稳定版；app-server 方法集合无增删，payload schema 扩展 | `codex-app-server-protocol` + `codex-app-server` macOS `cargo check` 通过；Windows 协议/GUI 未跑 |
| 2026-07-03 | Hermes | v2026.7.1 / `7c1a029` | 目标生产锁（MOA + self-verification） | 上游/spike 证据；Windows 产品化矩阵仍需看 spec verification |
| 2026-07-03 | Codex | `da4c8ca` | quick-xml DoS 安全修复 + multi-agent v2 | 目标锁；Windows 产品矩阵仍需看 spec verification |
| 2026-06-30 | Codex | `cfead68` | 旧锁升级 | 协议探针历史证据，非当前 Windows 发布结论 |

## 资源

- BlackRain 上游登记：[REFERENCES](REFERENCES.md)
- 双引擎架构：[.specs/003](../.specs/003-dual-engine-architecture/)
- Windows 客户端验证：[.specs/007 verification](../.specs/007-windows-client/verification.md)
- Codex Issues: <https://github.com/openai/codex/issues>
- Hermes Issues: <https://github.com/NousResearch/hermes-agent/issues>
