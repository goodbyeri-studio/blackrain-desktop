# Verification

## 验证矩阵

| 日期 | 范围 | 命令/方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-06-30 | spec 创建 | 文档落地 | 通过 | 五件套就位,尚未改实现代码 |
| 2026-06-30 | Codex 内核 Windows 构建 | `cd codex-upstream\codex-rs; $env:CARGO_NET_GIT_FETCH_WITH_CLI="true"; cargo build -p codex-cli --bin codex` | 通过 | 8 分 40 秒首次完成,产物 `target\debug\codex.exe`;LLVM 22.1.8 + CMake 4.3.3 + Rust(scoop) 工具链通过 |
| 2026-06-30 | dictation/whisper-rs Windows 兼容 | `cargo build` 试编 | **失败 → 已绕过** | whisper-rs 0.12 的 bindgen 与 LLVM 22 不兼容(`whisper_full_params` 全字段被打成 `_address`,72 errors)。绕法:Cargo.toml 把 whisper-rs 守卫成「非 Windows」+ `dictation/mod.rs` Windows 走 `stub.rs`。dictation 在 Windows 上暂不可用,不阻塞 dev。详见「失败记录 2026-06-30」 |
| 2026-07-03 | Codex 版本锁定更新 | `codex-upstream` checkout `da4c8ca`;`codex.exe --version` | 部分通过 | CLI 编译与 quick-xml 安全修复已确认;app-server 编译、协议四探针、Windows 客户端 E2E 仍未跑,下方矩阵继续追 |
| YYYY-MM-DD | doctor.mjs 实跑 | `cd apps\desktop; npm run doctor:win` | 未跑 | 缺 cmake / clang 时应给出 choco 提示 |
| YYYY-MM-DD | dev-client.ps1 启动 | `pwsh scripts/dev-client.ps1` | 未跑 | 期望 90 秒内 GUI 首帧 + 能选模型 |
| YYYY-MM-DD | dev 模式真实对话 | dev-client.ps1 起后 GUI 内手发一条对话 | 未跑 | DeepSeek flash 走 BlackRain Gateway 返回真实回复 |
| YYYY-MM-DD | 前端 typecheck (Windows) | `cd apps\desktop; npm run typecheck` | 未跑 | macOS 已通过,Windows 是首次 |
| YYYY-MM-DD | 前端 test (Windows) | `cd apps\desktop; npm run test` | 未跑 | 期望 1032 tests 全绿 |
| YYYY-MM-DD | Rust 后端 cargo check (Windows) | `cd apps\desktop\src-tauri; cargo check` | 未跑 | 期望只有仓库既有 dead_code warnings |
| YYYY-MM-DD | model_gateway cargo test (Windows) | `cd apps\desktop\src-tauri; cargo test model_gateway` | 未跑 | 6+1 tests,与 macOS 同 |
| YYYY-MM-DD | 协议四探针 (Windows) | `python3 .scratch/m0_protocol_probe.py "<CODEX_HOME>" "<工作区>"` | 未跑 | 对当前锁定 `da4c8ca` 验 initialize / model-list / thread-start / turn-start 全绿 |
| YYYY-MM-DD | 真实 DeepSeek 工具调用 (Windows) | `BLACKRAIN_GATEWAY_API_KEY=local-test-gateway python3 .scratch/m0_tool_driver.py ...` + `STRIP_TOOLS=0` Gateway | 未跑 | 期望生成 hello.txt 内容 `2049`,对等 macOS 2026-06-24 |
| YYYY-MM-DD | Windows Credential Manager smoke | `cd apps\desktop\src-tauri; $env:BLACKRAIN_KEYCHAIN_SMOKE="1"; cargo test real_system_credential_store_smoke_when_enabled -- --nocapture` | 未跑 | lib + daemon 目标真实写读清理 |
| YYYY-MM-DD | NSIS 打包 | `cd apps\desktop; npm run tauri:build:win` | 未跑 | 期望产出 `BlackRain2049_<ver>_x64-setup.exe` |
| YYYY-MM-DD | NSIS 安装包资源 smoke | 解包 .exe 检查 `office-cli/windows-x64/officecli.exe` / `gateway/gateway.py` / `plugins/office-cli/` / `workbenches/office-agent/` | 未跑 | 与 macOS dmg 资源 smoke 对等 |
| YYYY-MM-DD | NSIS 安装实测 | 双击安装 → 开始菜单点击 → 启动 → 登录 → 对话 | 未跑 | SmartScreen 警告页应能点「仍要运行」放行 |
| YYYY-MM-DD | NSIS 卸载实测 | 控制面板卸载 | 未跑 | `%ProgramFiles%\BlackRain2049\` 清空;`%APPDATA%` 决策默认保留 |
| YYYY-MM-DD | `windowsSandbox/*` 探针 | 扩展 `.scratch/m0_protocol_probe.py` 加 `windowsSandbox/setupStart` + `readiness` | 未跑 | `.specs/006` 链路在 Windows 上首次实跑;UI 复刻不在本 spec |

## 已知历史验证(macOS,本 spec 不重做)

- 2026-06-23:协议四探针 macOS 全绿。
- 2026-06-24:macOS Keychain 写读清理 smoke 通过。
- 2026-06-24:macOS 真实 DeepSeek 工具调用通过(`commandExecution` + 生成 `hello.txt = 2049`)。
- 2026-06-24:macOS 无签名 app/dmg 打包 + dmg 挂载资源 smoke + 包内二进制短启动 smoke 全通过。

这些 macOS 验证记录在 `.specs/001 verification.md` / `.specs/002 verification.md`,本 spec 只在 Windows 上跑等价矩阵,不重做 macOS。

## 已验证

- spec 目录和五个文档已创建。
- Windows 边界已明确:**MVP 仅发行 Windows**(2026-06-30 决策)、NSIS 不签名、同代码库不分库、macOS 代码保留作历史资产。
- 已盘点的现有 Windows 分叉点(不属本 spec 改动范围,只列在 requirements.md 背景段作 baseline)。

## 未验证风险

- **dictation(语音输入)在 Windows 上不可用**(2026-06-30 决策):whisper-rs 0.12 + LLVM 22 bindgen 不兼容,临时让 Windows 走 stub.rs。等价 macOS/Linux 仍走 real.rs,功能不受影响。
- **Codex 内核 Windows 构建**:已通过(2026-06-30,8m40s)。
- **NSIS 打包默认 targets**:`tauri.windows.conf.json` 当前 `bundle` 段未显式锁 targets,继承上层 `tauri.conf.json` 的 `"all"` 可能触发 MSI 工具链。本 spec 要先显式锁 NSIS。
- **Mica + bearer 校验交互**:网关 bearer 校验逻辑跨平台相同,但 Mica 窗口 + Webview2 fetch 跨 origin 行为未实测。
- **whisper-rs 在 Windows ARM64**:doctor.mjs 检 LLVM 但 ARM64 wheel/clang-cl 是否全可用未实测。
- **SmartScreen 实际通过率**:未签名 NSIS 在 Win11 SmartScreen 的真实用户体验未做。
- **uvloop 在 Windows 不可用**(`.specs/003` 已知问题):本仓 gateway.py 是纯 stdlib 不依赖 uvloop,但若将来切 Hermes Python 引擎要重检。
- **CI 缺失**:`.github/workflows/` 不存在,Windows build 仅靠开发主机本地跑,容易回归。

## 失败记录

### 2026-06-30:whisper-rs 0.12 在 Windows + LLVM 22 上 bindgen 失败

- 现象:`cargo build` 编 `apps/desktop/src-tauri` 时,`whisper-rs 0.12.0` 报 72 个 `E0609 no field on type whisper_full_params`(`greedy` / `beam_search` / `n_threads` / `language` 等所有字段全打成 `_address` 占位)。
- 命令/日志:`pwsh scripts/dev-client.ps1` → npm tauri:dev:win → `cargo build` 阶段失败。`cargo: error[E0609]: no field 'greedy' on type 'whisper_full_params' ... available field is: '_address'`(共 72 例)。
- 原因:`whisper-rs 0.12.0` 的 build.rs 用 bindgen 从 whisper.cpp C 头文件生成 Rust 绑定;LLVM 22(2025+)的 libclang 对该头文件的解析行为与 0.12 期望的不一致,导致字段被压平成不透明的 `_address` 占位。这是 whisper-rs 0.12 + LLVM 22 主流版本的已知不兼容,不是仓库逻辑问题。
- 处理(2026-06-30):
  1. [apps/desktop/src-tauri/Cargo.toml](../../apps/desktop/src-tauri/Cargo.toml):把 `whisper-rs = "0.12"` 从「非 iOS/Android」拆出,新增一个 `cfg(all(not(...), not(target_os = "windows")))` 块,只在 macOS/Linux 编入。
  2. [apps/desktop/src-tauri/src/dictation/mod.rs](../../apps/desktop/src-tauri/src/dictation/mod.rs):cfg-attr 里把 `target_os = "windows"` 加进走 `stub.rs` 的那个 OR 组,与 ios/android 并列。
  3. dictation 命令在 Windows 上返回 `UNSUPPORTED_MESSAGE`("Dictation is not available on mobile builds.")——文案没改(stub 本是 mobile 用),桌面 Windows 短期沿用即可。
- 后续:升级 whisper-rs 到 0.13+ 或换 STT 后端(如 sherpa-onnx / vosk)的真实评估,留作独立工作项,不阻塞 v1 Windows dev/打包。

### YYYY-MM-DD:失败标题

- 现象:
- 命令/日志:
- 原因:
- 处理:
