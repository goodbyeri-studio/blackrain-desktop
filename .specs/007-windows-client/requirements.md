# Requirements

## 背景

- 这个功能为什么现在要做:此前开发全在 macOS 主机上,Windows 自检脚本 / 配置 override / 平台分叉点已落了一批(`tauri.windows.conf.json`、`doctor.mjs`、`useLiquidGlassEffect` 的 Acrylic 分支、`WindowCaptionControls`、`office.rs platform_resource_hints`、`vendor-officecli.ps1`),但**真实环境里 Windows 客户端从未跑通过**:dev 启动脚本只有 bash 版、NSIS 打包未跑、Windows Credential Manager smoke 未做、Codex 内核 Windows 构建未验。开发主机切到 Windows 后,这条主线必须补齐。
- 2026-06-30 决策:**MVP 只发行 Windows 客户端;macOS 整体推迟到 post-MVP**(见 `decisions.md` 第一条)。理由:国内用户大头在 Windows;双平台同时维护对 4 人团队是隐性税;同代码库 ≠ 同时交付——macOS 相关代码保留为历史资产,日常开发/CI/打包/发布全部按 Windows-only 推进。
- 相关上游/文档/现有实现:
  - `apps/desktop/src-tauri/tauri.windows.conf.json`(已落:`titleBarStyle: Visible`、关 windowEffects、productName=BlackRain2049、Windows-only office-cli 资源)
  - `apps/desktop/scripts/doctor.mjs`(Windows 走 choco,多检 cmake+LLVM/clang)
  - `apps/desktop/package.json` 的 `tauri:dev:win` / `tauri:build:win`
  - `scripts/dev-client.ps1`(2026-06-30 实装,PowerShell 一键启动,对等 macOS `dev-client.sh`)
  - `scripts/vendor-officecli.ps1`(PowerShell,本来给 Windows 用)
  - `.specs/003 verification.md` 历史记「Windows 全栈打包/运行 = 未跑」——本 spec 接手并结论化(macOS 移到 post-MVP,Windows 全栈是 v1 唯一目标)
  - `.specs/006 design.md` 已列 `windowsSandbox/{setupStart,readiness}` 待接

## 用户目标

- 作为 Windows 用户(BlackRain v1 目标受众):双击安装包一次就能装好、桌面起 App、登录账号、对话能跑通 DeepSeek。不要求装 brew / Python / cmake / Rust / Node 才能用。
- 作为 Windows 开发者(本仓维护者):一条 `pwsh scripts/dev-client.ps1` 把 dev 客户端起到能用状态;`tauri:build:win` 能产出可签名(或暂未签名)的 NSIS 安装包。
- 作为 v1 测试人员:跑完 Windows 验证矩阵——协议四探针、DeepSeek 真实工具调用、Credential Manager smoke、NSIS 安装包资源 smoke。

## 非目标

- 本阶段明确不做:
  - **不交付 macOS 客户端**——macOS 代码保留,但不发布、不在 CI 跑、不在用户文档列、不在「常用命令」首位。macOS 任何回归 = 已知风险,不修。
  - **不分库**——`apps/desktop/` 不砍成 win / mac 两份 fork。同代码库 + 平台分叉点这条路继续走。`isMacPlatform()` / `cfg(target_os = "macos")` 这些守卫保留作历史资产,等 post-MVP 决定复活 macOS 时再激活验证。
  - **不主动删 macOS 代码**——逐个核查 isMacPlatform 调用点要花精力且引入回归风险,保留即可。
  - **不做 Windows 签名 + 公证**(EV cert / SmartScreen 提升)——v1 用「未签名 NSIS + 用户首次安装手动放行」过审,签名提到 v2。
  - **不做 MSI**——选了 NSIS,WiX 工具链先不上。
  - **不做 Windows 沙箱(`windowsSandbox/*`)的完整 UI**——5 层接线归 `.specs/006`,本 spec 只负责把它在 Windows 真跑通(setup readiness 探针),完整向导/沙箱模式切换 UI 等 GUI 复刻阶段再做。
- 不改变的架构边界:codex 内核原装黑盒(不会因 Windows 适配改 agent 循环);三条铁律(内核原装 / 网关锁脏活 / App 唯一写配置 + 专属 `CODEX_HOME`)在 Windows 上一字不改。

## 成功标准

- 功能行为:
  - `pwsh scripts/dev-client.ps1` 在 Windows 主机一条命令把 dev 客户端起到「窗口可见、能登录、能选模型、能发一条对话拿到 DeepSeek 真实回复」状态。
  - `npm run tauri:build:win` 产出 NSIS `.exe` 安装包,资源(office-cli/windows-x64、gateway.py、plugins、workbenches)正确打入。
  - 协议四探针在 Windows 上对 `cfead68` 内核全绿。
  - 真实 DeepSeek 单工具多轮调用在 Windows 上跑通。
- 用户体验:NSIS 安装包双击装完→开始菜单图标点开→首次启动正常显示登录/首页,无需任何额外终端命令。
- 安全/合规:Windows Credential Manager 实测 API key 写入 / 读取 / 清理 / 状态查询通过(`keyring` 已支持);网关只监听 127.0.0.1,Acrylic 半透明不影响 bearer 校验。
- 性能/稳定性:dev 启动从 `pwsh scripts/dev-client.ps1` 跑起到 GUI 首帧 ≤ 120 秒(首次冷启动 Tauri 后端编译会久,后续增量秒级);冷启动后 App + codex + gateway 三进程占用合理。

## 约束

- Codex 内核边界:内核当黑盒用;只验证它在 Windows 上能编译并被壳子进程拉起,**不**因 Windows 适配改任何 codex-upstream 代码。
- `CODEX_HOME` / 配置边界:Windows 上专属 `CODEX_HOME` 落在 `%APPDATA%\cc.goodbyeri.blackrain\codex-home`(Tauri `app_data_dir()` 自动解析),不污染用户 `%USERPROFILE%\.codex`。
- License / 第三方依赖:NSIS 模板沿用 Tauri 内置版本(MIT);Windows Credential Manager 走 `keyring` crate(已在依赖里,跨平台 backend)。
- 平台差异(本 spec 仅认 Windows 一条线):窗口装饰(自绘 caption controls)、毛玻璃效果(Acrylic)、外部 App 启动方式(command)、文件路径分隔符、可执行后缀、OfficeCLI 二进制目录命名——已在 `WindowCaptionControls.tsx` / `useLiquidGlassEffect.ts` / `constants.ts` / `office.rs` 分别落了分叉,本 spec 不重做,只补缺口。macOS 分叉点保留,不验证。

## 开放问题

- [x] **Codex 内核 Windows 构建实测**:2026-06-30 已通过(8m40s 首次,产物 `target\debug\codex.exe`)。whisper-rs 0.12 + LLVM 22 的 bindgen 不兼容已记为已知问题,绕法 = Windows 走 dictation/stub.rs(详见 verification.md 失败记录)。
- [ ] **签名先后**:v1 不做 EV 签名,但要不要在 NSIS 元数据里预埋发行商字段、为后续添加签名留 hook?(倾向是,落 publisher 字段,签名 PR 时只补 `signingIdentity`。)
- [ ] **CI 触发时机**:GitHub Actions Windows build 是本 spec 范围内必做,还是单开 `.specs/008-ci-build-matrix`?(本 spec 列为「需要,且只建 windows-latest 单 runner——macOS post-MVP 才考虑」,实际拆分见 tasks。)
- [ ] **Windows 沙箱(`windowsSandbox/*`)接入位置**:5 层链路属 `.specs/006`,本 spec 只承担「Windows 上探针能跑通」环境验证;UI 复刻仍归 GUI 重做 spec。
- [ ] **whisper-rs 升级或换 STT 后端**:0.12 + LLVM 22 不兼容已绕过(Windows dictation 走 stub),真实评估升级到 0.13+ 或换 sherpa-onnx/vosk 留作独立工作项,不阻塞 v1。

