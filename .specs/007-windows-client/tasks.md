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
- [x] **`docs/commands.md` 重排**:Windows 段已提到首位，macOS 段标记为「post-MVP 历史参考,当前不交付」。（2026-07-11 文档治理）

## 阶段 2:NSIS 打包

- [x] **NSIS target + Windows 资源映射代码已落**:`tauri.windows.conf.json` 已显式 `targets = ["nsis"]`,并映射 codex/Python/gateway/OfficeCLI/plugins/workbench。此勾选只表示配置存在。
- [ ] **NSIS 元数据收口**:publisher / shortcut / 签名 hook 依签名待决结论落地。
- [ ] **Windows 品牌元数据收口**:窗口标题、About、tray、Credential Manager service 从 `BlackRain2049` 迁到 `BlackRain`；凭据 service 改名必须设计兼容读取/迁移，不能让已有登录/key 静默丢失。
- [x] **本机发布脚本已落**:`scripts/release-client-win.ps1` 已会跑 Hermes static contract、vendor Windows/Hermes runtime、执行 typecheck/test/lint/DS/doctor 与 cargo check/Hermes/workbench/plugin 专项，再调 `tauri:build:win`;尚未有本 spec 的 Windows 实跑记录。
- [ ] **跑 `npm run tauri:build:win`**:产出 `.exe` 安装包,记打包时长 / 体积。
- [ ] **安装包资源 smoke**:解包验证 `office-cli/windows-x64/officecli.exe`、`gateway/gateway.py`、`plugins/office-cli/`、`workbenches/office-agent/` 都在。
- [ ] **区分资源存在与工作台可安装**：在 verification 明确记录 Office 目录入包只属于静态资源 smoke，不得标记 008 的 inspect/install/activate/verify/uninstall 已完成。
- [ ] **第三方归属 smoke**:安装包内保留 OfficeCLI `LICENSE-OfficeCLI.txt` / `VENDOR.json`，并在发行 NOTICE/third-party attribution 登记 OfficeCLI upstream 与 Apache-2.0。
- [ ] **双击安装实测**:装到默认路径 → 开始菜单图标 → 启动 App → 登录 → 对话。
- [ ] **卸载实测**:控制面板卸载 → `%ProgramFiles%\BlackRain\` 删干净 → `%APPDATA%\cc.goodbyeri.blackrain\` 决策(保留用户配置 vs 全清,默认保留)。

## 阶段 3:Windows 专属能力实测

- [ ] **Windows Credential Manager smoke**:写 / 读 / 状态 / 清理 API key 全跑(`keyring` crate 已支持,只需实测)。
- [ ] **协议四探针 Windows 实测**:`python3 .scratch/m0_protocol_probe.py` 对当前锁定 rust-v0.144.1 / `44918ea` 全绿。
- [ ] **真实 DeepSeek 工具调用 Windows 实测**:`m0_tool_driver.py` 生成 hello.txt 内容为 2049。
- [ ] **App 托管 sidecar 工具调用实测**:不由 dev 脚本预起 Gateway，让 App 自己 spawn；确认 `STRIP_TOOLS=0` 生效并完成真实 `commandExecution`。当前代码未覆盖默认值，是发布阻塞项。
- [ ] **`windowsSandbox/{setupStart,readiness}` 探针**(`.specs/006` 链路在 Windows 上首次实跑):验证内核能正确回应 setup 流程,UI 复刻不在本 spec。
- [ ] **doctor.mjs 提示文案完善**:LLVM/clang 缺失 / `LIBCLANG_PATH` 未设 / cmake 旧版本等场景的明确指引。

## 阶段 4:CI(已有部分检查,发布矩阵待补)

- [x] `.github/workflows/ci.yml` 已存在：Ubuntu 先按 diff 分流，前端相关改动跑 JS typecheck/test/lint/DS/codemod；Rust/WORK 相关改动才启用 Windows Hermes/workbench/plugin 专项。此勾选只表示 workflow 接线存在。
- [x] Windows runner 只承担无法由 Ubuntu 替代的 Rust/WORK 代码级回归；同一 PR 旧 run 自动取消，普通 `main` push 不重复跑，Cargo 依赖变化才预热默认分支 cache。暂不加入 Tauri/NSIS build，避免把未签名制品和实机验收混入普通 PR CI。
- [ ] NSIS 正式包仍只在 Windows 本机构建;若未来改为 CI 出包,需单独处理制品签名与密钥。
- [ ] **明确不建 macos-latest runner**——decisions 已锁,CI 与代码库节奏同步。

## 阶段 5:文档同步

- [x] **`README.md`**:「当前状态」段「首发平台」行改为「MVP 仅 Windows,macOS 推迟到 post-MVP」(2026-06-30)。
- [x] **`AGENTS.md` / `CLAUDE.md`**:「常用命令」段把 Windows 提到首位,macOS 段标 post-MVP 历史参考;spec 索引行同步「MVP 仅 Windows」措辞(2026-06-30)。
- [x] **`apps/desktop/AGENTS.md`**:dev 命令 quick runbook 段已改为 Windows 为主。（2026-07-11 文档治理）
- [x] **`.specs/003 verification.md`**:平台策略已收口为「Windows 是 MVP 唯一全栈验收线;macOS 打包/运行是 post-MVP」。Windows 未跑项仍必须保留。
- [x] **`.specs/003 requirements.md`** 开放问题:Windows 全栈条目 = 「已收敛,MVP 只做 Windows,见 `.specs/007`」(2026-06-30)。
- [x] **`.specs/006` 关于「首发 Windows」表述**:与本 spec 第一条决策对齐,改「MVP 仅 Windows」措辞(2026-06-30,design.md / capability-gui-mapping.md / code-mode-boundary.md 三处)。
- [x] **`.specs/008` 工作台包**：2026-07-12 已新建；本 spec 继续负责 BlackRain 基础 NSIS，008 负责工作台生命周期。

## 阶段 6:收口

- [ ] 把 verification.md 的真实命令 / 实测日期 / 结果填齐(不写「应该可以」)。
- [ ] 列未解决风险(签名、CI、`windowsSandbox` UI、whisper-rs 升级等)。
- [ ] 将 macOS/iOS 历史证据标为 post-MVP/上游资产,但不删除或掩盖任何 Windows 未验项。
