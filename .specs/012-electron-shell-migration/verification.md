# Electron 桌面壳迁移验证

> 当前已完成 M0 迁移盘点、M1 Electron 安全空壳、M2 stdio/JSONL transport/typed thread runtime/process supervisor fixture、首个 Browser host + UI + dynamic-tool/受限 CDP foundation，以及 unsigned MSIX 基础生成；bundled codex 制品、真实模型 turn、Agent 共页 E2E、签名与安装矩阵仍未完成或验证。

## 验证矩阵

| 日期 | 范围 | 方式 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-07-26 | 架构与优先级文档 | 静态审阅 | 已记录 | 不代表实现 |
| 2026-07-27 | 三份 Codex App 研究稿与 Electron/Browser 计划 | 完整原文复核 + 静态设计 | 已记录 | 采用 Codex 式控制面；不代表代码存在 |
| 2026-07-29 | Codex Desktop App 技术栈、进程、协议、持久化与 Windows helper 调研 | 完整原文复核 + 文档对齐 | 已记录 | 目标改为 main 直连 app-server；不代表代码存在 |
| 2026-07-29 | Codex IAB per-session backend、Browser client、注入式 Playwright、turn/tab 与工作集调研 | 完整原文复核 + 文档对齐 | 已记录 | 保留 WebContentsView 差异；不代表代码存在 |
| 2026-07-29 | Tauri 能力迁移矩阵与宿主边界冻结 | `npm run check:host-boundary` + 静态 owner review | PASS | 194 个 command 模块已分类，74 个 renderer 直接依赖纳入只减不增基线；83 个 codex command 仍需协议级逐项复核 |
| 2026-07-29 | Electron 42.3.0 + Forge/Vite 安全空壳 | `npm run typecheck`、5 个 Electron 单测、`npm run electron:smoke` | PASS | Windows x64 production-fuse package 加载自定义协议，runtime WebPreferences 为 sandbox/context isolation/Node off；typed preload/IPC 与 renderer Node 隔离由下一项 E2E 覆盖；不是 MSIX 或产品验收 |
| 2026-07-29 | Playwright Electron 壳层 E2E | `npm run electron:e2e` | PASS | Windows 上重建 production bundles/package 后，由开发 Electron 启动同一 app 入口；验证自定义协议、typed preload、IPC revision、Node 隔离、导航和 popup 拒绝；production fuse 由 packaged smoke 独立覆盖 |
| 2026-07-29 | Electron 依赖审计 | npm registry License + `npm audit --omit=dev` | 有条件通过 | 直接新增依赖为 MIT/Apache-2.0；production 为 2 low、0 high/critical；Forge/MSIX dev toolchain 有 40 high/2 critical 传递告警，发布前必须升级或处置 |
| 2026-07-30 | main/app-server stdio、数据目录与 Home 选择 | Electron typecheck + 目标测试 + packaged smoke + Playwright E2E | PASS | supervisor 默认保留标准 Codex Home 环境；BlackRain 只创建 `browser-data`/`app-state`/logs/artifacts 宿主目录。未使用 bundled codex |
| 2026-07-30 | Browser `WebContentsView` host foundation | Browser 纯单测 + packaged Playwright Electron E2E | PASS | 本地 HTTP 页在 main-owned view 中加载；持久 session 路径、安全 WebPreferences、无 preload、bounds 裁剪、stale revision、popup/非法导航拒绝和 close cleanup 通过；尚无 UI/Agent 工具闭环 |
| 2026-07-30 | Browser renderer UI foundation | renderer 单测 + production bundle Playwright Electron E2E | PASS | 当前 thread scope 下的侧栏、tab、地址导航、后退/前进/刷新/停止、加载/错误/崩溃状态、typed 状态事件及 ResizeObserver/visibility/modal occlusion 布局同步已接线；E2E 验证入口开合和 host 状态事件，尚未通过真实 app-server thread 从 UI 驱动同一页面 |
| 2026-07-30 | App Server dynamic Browser adapter | 11 files / 35 tests + 本机 codex 协议探针 | 部分通过 | typed main API 覆盖 thread start/resume、turn start/interrupt；fixture 跑通 dynamicTools → `item/tool/call` → 同一 Browser registry → result，并覆盖 thread/turn/generation、取消和 30s deadline；本机 `codex-cli 0.146.0-alpha.3.1` 接受 initialize 与真实 `thread/start.dynamicTools`。尚非仓库锁定 bundled 版本，也未跑真实模型工具调用 |
| 2026-07-30 | Browser 受限 CDP bootstrap | controller/adapter 单测 + 全量 Vitest + Electron typecheck + 本机 codex schema 探针 | 部分通过 | 同一 page debugger 上的顶层 AX snapshot/ref、click、type_text、viewport PNG、turn/document generation、TTL/大小限制和 teardown 已通过纯测试；真实可见 `WebContentsView` 由下一项 E2E 覆盖，真实模型共页、OOPIF/locator/CUA/hidden full-page capture 未验收 |
| 2026-07-30 | Browser dynamic tool 同页 E2E | Playwright Electron + 开发态 main-only harness | PASS | 合成 `item/tool/call` 穿过真实 adapter/registry/controller，对可见 fixture page 完成 AX snapshot、type_text、click 和 PNG；前后 `webContents.id` 不变。packaged 强制禁用 harness；真实 app-server/model 共页仍未验收 |
| 2026-07-30 | 标准 Codex Home 回归 | Electron Home/data-path 单测 + Tauri 静态检查 | 部分通过 | Electron 默认保留标准 Home 环境并停止创建 `agent-data`；Tauri `AppState` 已删除 app-data `codex-home` 全局注入。`cargo check` 已尝试，但本机缺少 MSVC `link.exe`，未完成 Rust 编译验证 |
| 2026-07-29 | Gateway 配置与 credit JWT 状态域收口 | 静态审阅 + Rust 纯测试源码 + `rustfmt --edition 2021` | 部分通过 | 已停止持久写共享 `config.toml`，改为进程级 override；凭据规范副本/运行时桥分别归系统凭据库/BlackRain app-data。`cargo check --tests` 在依赖构建阶段因本机缺少 MSVC `link.exe` 阻塞，3 项新增纯测试尚未执行 |
| 2026-07-30 | App Server 异常 spawn 生命周期 | 3 个 process supervisor Vitest + 全量 Vitest + Electron typecheck | PASS | `error`/`exit`/`close` 幂等结算；不存在的 executable 会拒绝 start，后续 stop 可完成且 onExit 只调用一次；bundled `codex.exe` 与 Windows 进程树仍未验收 |
| 2026-07-30 | Gateway 本地边界与并发 | 8 个 Python unittest + Rust 源码审阅 + `rustfmt --check` | 部分通过 | 固定 bearer 已改为每进程随机 capability；JWT 使用同目录原子替换；长请求不阻塞 health；健康失败清理 child。Rust 编译仍被本机缺少 MSVC `link.exe` 阻塞 |
| 2026-07-30 | Electron unsigned MSIX 与生产源码边界 | `npm run electron:make` + packaged smoke + Playwright Electron E2E + ASAR 条目检查 | PASS | Windows x64 生成 `codex-monitor.msix`（152,833,198 bytes）；manifest 指向 `BlackRain.exe`；ASAR 含 main/preload bundle但不含对应 `.map`。未签名、未安装，且 codex 资源目录仍无锁定二进制 |
| 2026-07-30 | CI 门禁与 `windows-latest` 实跑 | GitHub Actions runs `30525783917` / `30528857360` / `30529234179` / `30529634781` / `30529985702` / `30530578031` / `30530974949` + 本地隔离回归 | 部分通过 | Windows Rust、JS、Gateway 已获 PASS；Browser 侧栏在 CI 已完成打开、挂载与收起，但无交互桌面对收起后 opener 的 visible 判定超时，MSIX make 被跳过。UI 合同改为 DOM 挂载断言，截图仅在本地生成；远端继续验证 host、受限 Browser 控制和 MSIX，待复验 |
| 待执行 | bundled codex app-server 接线 | 锁定 `codex.exe` Node 集成测试 | 未跑 | bundled 路径/制品、真实 initialize、subscription、退出与 Windows 子进程树 |
| 待执行 | Agent Data / ThreadStore | bundled codex + CLI 兼容模式 | 未跑 | 标准共享 Home、自定义绝对 Home、首次登录与恢复 |
| 待执行 | Windows helper 与沙箱 | 进程树 + restricted/elevated 工具执行 | 未跑 | code-mode host/command runner/ConPTY |
| 待执行 | Codex thread 纵向切片 | 真实 app-server 对话 | 未跑 | 必须覆盖恢复与审批 |
| 待执行 | in-app browser | spec 013 矩阵 | 未跑 | P0 闸口 |
| 待执行 | Browser client/runtime 制品 | pipe 集成 + MSIX 解包/启动 | 未跑 | session/turn、framing、ACL/token、hash、License、清理 |
| 待执行 | Windows 制品 | 安装/升级/回滚/卸载 | 未跑 | 发布闸口 |

## 未验证风险

- Electron Forge/MSIX 已通过本地 unsigned make；签名、安装、自动更新源和回滚尚未验证。
- Forge `start` 在当前 Node 24 开发环境未完成 main 入口 smoke；锁定目标为 Node 22。当前证据来自 Windows packaged Electron smoke 与开发 Electron 驱动 production bundles 的 Playwright E2E，仍不等于 MSIX 安装验收。
- Forge/MSIX/ESLint dev toolchain 的 npm audit 高危/严重传递依赖尚未清零，不能据当前 package 结果宣称发布供应链通过。
- Tauri surface 已建立模块级 owner 和自动覆盖，但 codex command 尚未完成逐命令 app-server 映射/删除判定，74 个 renderer 直接依赖尚未迁走。
- Electron main 的 App Server transport 与 supervisor 已通过 fixture；bundled `codex.exe` 直接 spawn、锁定协议、Windows 子进程树退出和恢复仍未验证。
- 默认 Agent Data 与 Electron/Browser 数据目录已在路径和 supervisor 单测中通过；真实 bundled codex 的首次登录、ThreadStore 恢复、备份和卸载仍未验证。
- 共享 CLI Home 模式下的并发配置更新、版本/schema 兼容和同一 active turn 冲突尚未验证；BlackRain 不得直接改写 `config.toml`、rollout 或 SQLite 来规避该问题。
- Home 选择设置 UI、默认/共享/自定义模式互切和显式导入尚未接线。
- Gateway Python 并发/凭据读取测试已通过；Gateway/credit JWT 的 Rust 纯测试仍受本机缺少 MSVC linker 阻塞，需在 Visual Studio Build Tools 环境运行后才能登记 Rust PASS。
- codex-code-mode-host、codex-command-runner 等 helper 是否为当前锁定版本所需以及如何打包尚未验证。
- main-owned `WebContentsView` factory、registry、bounds/occlusion、Browser UI 和首批 Agent adapter 已实现；窗口间 reparenting、App 重启恢复、真实 UI thread 路由和模型驱动共页尚无完整实现。
- Forge 最终制品复制曾连续两次被 GitHub `ECONNRESET`/`ETIMEDOUT` 中断；后续重跑已成功完成 Windows x64 package、packaged smoke 和 Playwright Electron E2E。`resources/codex/windows-x64` 布局已进入 package，但当前只有 `.gitkeep`，不构成 bundled codex 制品验收。
- 公开 code-mode/node_repl 接缝能否承载自有 Browser client、以及标准 Electron 对 Owl page persistence 的降级能力尚未验证。
- 多 view 的内存、GPU、DPI、z-order、modal 遮挡、输入法和崩溃恢复未测量。
- 当前 Tauri 代码存在不能作为 Electron 进度证据。
