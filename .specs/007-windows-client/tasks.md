# Tasks

> **范围(2026-06-30 决策)**:MVP 仅发行 Windows;macOS 推迟到 post-MVP。所有任务只跟 Windows 这一条线。macOS 等价项不在本 spec 范围。

## 阶段 0:确认边界

- [x] 阅读 `docs/09 运行时架构`、`.specs/003 / 006` 的「首发 Windows」表述,确认与本 spec 不矛盾。
- [x] 盘点已落的 Windows 分叉点(tauri.windows.conf.json / doctor.mjs / useLiquidGlassEffect / WindowCaptionControls / office.rs / vendor-officecli.ps1)——见 `requirements.md` 背景段。
- [x] 确认不改 `codex-upstream`,只验证内核能在 Windows 编译。
- [x] 列出 Windows 实测需要的命令清单(see verification.md skeleton)。

## 阶段 1:dev 启动可用(本仓维护者能用)

- [x] **新建 `scripts/dev-client.ps1`**(2026-06-30 实装,对照 `dev-client.sh` 一比一搬,POSIX 工具替换为 PowerShell 等价)。
  - [x] `.env` 解析 + 环境变量注入。
  - [x] 前置依赖自检(node_modules / python3 / cmake / codex.exe)。
  - [x] 准备 `.scratch\dev-codex-home\config.toml`。
  - [x] 起 `gateway.py` 后台 + `/health` 就绪轮询。
  - [x] `Ctrl-C` 触发 `Stop-Process` 清理。
  - [x] 失败提示用 `choco install cmake llvm` / winget 而非 brew。
- [x] **实测 Codex 内核 Windows 构建**(2026-06-30 通过,8m40s,产物 `target\debug\codex.exe`)。
- [x] **whisper-rs 0.12 + LLVM 22 兼容性绕过**(2026-06-30):Cargo.toml 把 `whisper-rs` 守卫成「非 Windows」;`dictation/mod.rs` Windows 走 `stub.rs`。dictation 在 Windows 上暂不可用,不阻塞 dev。
- [ ] **实测 `pwsh scripts/dev-client.ps1`**:GUI 起来 → 登录 → 选 DeepSeek → 发对话拿真实回复。
- [ ] **`docs/commands.md` 重排**:把 Windows 段提到首位,macOS 段标记为「post-MVP 历史参考,当前不交付」。

## 阶段 2:NSIS 打包

- [ ] **`tauri.windows.conf.json` 加 bundle 配置**:显式 `targets = ["nsis"]`、publisher、shortcut name。
- [ ] **跑 `npm run tauri:build:win`**:产出 `.exe` 安装包,记打包时长 / 体积。
- [ ] **安装包资源 smoke**:解包验证 `office-cli/windows-x64/officecli.exe`、`gateway/gateway.py`、`plugins/office-cli/`、`workbenches/office-agent/` 都在。
- [ ] **双击安装实测**:装到默认路径 → 开始菜单图标 → 启动 App → 登录 → 对话。
- [ ] **卸载实测**:控制面板卸载 → `%ProgramFiles%\BlackRain2049\` 删干净 → `%APPDATA%\cc.goodbyeri.blackrain\` 决策(保留用户配置 vs 全清,默认保留)。

## 阶段 3:Windows 专属能力实测

- [ ] **Windows Credential Manager smoke**:写 / 读 / 状态 / 清理 API key 全跑(`keyring` crate 已支持,只需实测)。
- [ ] **协议四探针 Windows 实测**:`python3 .scratch/m0_protocol_probe.py` 对 `cfead68` 全绿。
- [ ] **真实 DeepSeek 工具调用 Windows 实测**:`m0_tool_driver.py` 生成 hello.txt 内容为 2049。
- [ ] **`windowsSandbox/{setupStart,readiness}` 探针**(`.specs/006` 链路在 Windows 上首次实跑):验证内核能正确回应 setup 流程,UI 复刻不在本 spec。
- [ ] **doctor.mjs 提示文案完善**:LLVM/clang 缺失 / `LIBCLANG_PATH` 未设 / cmake 旧版本等场景的明确指引。

## 阶段 4:CI(单 Windows runner)

- [ ] 评估在本 spec 内完成 vs 拆 `.specs/008-ci-build-matrix`:本 spec 优先级在 dev + NSIS,CI 可后置。
- [ ] 决定后,要么本 spec 加任务:GitHub Actions workflow `windows-latest` 单 runner 跑 `cargo check` + `npm run typecheck` + `npm run test` + (可选)`tauri build --debug`,要么记到 decisions「拆出」。
- [ ] **明确不建 macos-latest runner**——decisions 已锁,CI 与代码库节奏同步。

## 阶段 5:文档同步

- [x] **`README.md`**:「当前状态」段「首发平台」行改为「MVP 仅 Windows,macOS 推迟到 post-MVP」(2026-06-30)。
- [x] **`AGENTS.md` / `CLAUDE.md`**:「常用命令」段把 Windows 提到首位,macOS 段标 post-MVP 历史参考;spec 索引行同步「MVP 仅 Windows」措辞(2026-06-30)。
- [ ] **`apps/desktop/AGENTS.md`**:dev 命令 quick runbook 段以 Windows 为主。
- [x] **`.specs/003 verification.md`**:Windows 全栈打包/运行 = post-MVP 结论化,不再标「未跑」(2026-06-30)。
- [x] **`.specs/003 requirements.md`** 开放问题:Windows 全栈条目 = 「已收敛,MVP 只做 Windows,见 `.specs/007`」(2026-06-30)。
- [x] **`.specs/006` 关于「首发 Windows」表述**:与本 spec 第一条决策对齐,改「MVP 仅 Windows」措辞(2026-06-30,design.md / capability-gui-mapping.md / code-mode-boundary.md 三处)。

## 阶段 6:收口

- [ ] 把 verification.md 的真实命令 / 实测日期 / 结果填齐(不写「应该可以」)。
- [ ] 列未解决风险(签名、CI、`windowsSandbox` UI、whisper-rs 升级等)。
- [ ] 清掉所有「macOS 已验、Windows 未验」类历史悬挂状态;改为「macOS 验证 = post-MVP」明确结论。

