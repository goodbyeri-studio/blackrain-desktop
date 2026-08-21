# Electron 全量迁移 MVP 验证

> `CODE_EXISTS`、`RUN_PASS`、`PRODUCT_PASS` 不互相替代。当前最高结论是 **`RUN_PASS`**：Electron 原生代码和 unsigned Windows 制品自动化通过，但正式签名与 Windows 产品矩阵未完成。

## 当前验证矩阵

| 日期 | 等级 | 范围 | 结果 | 剩余边界 |
|---|---|---|---|---|
| 2026-08-03 | `PRODUCT_FAIL` | 开发签名 MSIX 安装态 | 可安装、AUMID 首启、窗口可渲染；人工确认全页面无法点击 | 历史失败待正式签名候选复验关闭 |
| 2026-08-05 | `CODE_EXISTS` + `RUN_PASS` | Electron native-clean | 789 个生产边界文件中旧宿主残留 0；旧 runtime/daemon/固定端口/安装器和 renderer direct import 已删除 | 当前工作树未提交，删除 commit 待 Git 流程补证 |
| 2026-08-05 | `RUN_PASS` | App Server / Browser 生产接缝 | bundled `codex-cli 0.146.0` initialize/thread/优雅退出及标准 stdio MCP tool discovery/call/可信 metadata 通过 | 真实登录、审批、并发 turn 和双 Windows 用户 ACL 未验收 |
| 2026-08-05 | `RUN_PASS` | package / native input / Electron E2E | production package、原生点击、设置点击、Browser/OOPIF/敏感操作/下载/file chooser/接管/电源周期/重启恢复通过 | 自动化不替代签名安装态、真实站点和 Windows 人工矩阵 |
| 2026-08-05 | `RUN_PASS` | unsigned MSIX | Forge maker、ASAR/资源审计、manifest identity/publisher/hash 通过 | `NotSigned`，不得发布 |

## G0-G6 状态

| 闸口 | 当前状态 | 已有证据 | 升级到 `PRODUCT_PASS` 仍需 |
|---|---|---|---|
| G0 盘点与锁 | `CODE/RUN_PASS` | 历史 194 command/53 import 逐项账本；当前 0/0；Codex/Node/Browser lock 通过 | 干净 release worktree 的 commit/环境报告 |
| G1 安装态 | `CODE/RUN_PASS` + 历史 `PRODUCT_FAIL` | native-input probe、degraded/retry/diagnostics 测试、unsigned manifest | 正式签名、`signtool verify /pa`、安装态真实输入与故障注入 |
| G2 Codex 核心 | `CODE/RUN_PASS` | typed stdio lifecycle、thread/turn/approval/review/fork/compact/rollback/MCP status、fixture 与 bundled probe | 登录/账户/既有 thread/真实审批/停止恢复/并发 turn |
| G3 桌面宿主 | `CODE/RUN_PASS` | typed preload；文件/设置/凭据/窗口/菜单/托盘/深链/更新单测和 E2E | 签名安装态人工矩阵 |
| G4 Git/终端/Browser | `CODE/RUN_PASS` | Git/文件/terminal、Browser host/transport/security、OOPIF 和恢复自动化 | 真实 workspace/ConPTY、真实站点/MFA、第二 Windows 用户 ACL |
| G5 旧宿主删除 | `CODE/RUN_PASS` | final-mode Native Clean Gate、package audit、旧目录/依赖/入口删除 | 合入 commit 证据 |
| Native Clean Gate | `CODE/RUN_PASS` | 生产边界 0 残留；5 个顶层资源、350 个 ASAR 条目审计通过 | 正式签名 MSIX 解包及安装态人工文案检查 |
| G6 Windows 发布 | `RUN_PASS` | unsigned x64 MSIX 和全回归 | 正式签名、安装/升级/回滚/卸载/残留/性能矩阵及负责人批准 |

## 2026-08-05 本机证据

环境：Windows x64 `10.0.26200`，Electron `42.3.0`，Codex `rust-v0.146.0`，Node runtime `22.23.2`。工作树位于 `main` 且包含未提交迁移改动，因此不能填写 release commit。

以下命令均以 `C:\Program Files\PowerShell\7\pwsh.exe` 启动并退出 0：

```powershell
Set-Location apps/desktop
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run check:host-boundary
npm.cmd run electron:runtime:verify
npm.cmd run electron:node-runtime:verify
npm.cmd run electron:browser-client:verify
npm.cmd run electron:app-server:probe
npm.cmd run electron:package
npm.cmd run electron:package:audit
npm.cmd run electron:native-input:probe
npm.cmd run electron:smoke
npm.cmd run electron:e2e
npm.cmd run electron:make
```

结果摘要：

- TypeScript 无错误；ESLint 0 error、5 条既有 hooks warning。
- 全量 Vitest 通过；`SettingsView` 46 tests 中 20 个暂停路线历史测试 skip，另有回归断言确认对应入口在 Electron MVP 不可见。
- Native Clean Gate：扫描 789 个 production-boundary 文件，残留 0。
- App Server probe：2 files / 2 tests 通过，覆盖 bundled app-server 与标准 stdio Browser MCP。
- package audit：5 个顶层资源、350 个 ASAR 条目；最终 maker 目录存在 1 个新 MSIX，另有 1 个同级历史备份。
- native-input：production package 窗口可聚焦、可原生点击。
- smoke：`blackrain://app/index.html`，sandbox/contextIsolation 开，Node integration 关。
- Electron E2E：设置点击、typed host、同页 Browser、跨站 OOPIF、敏感操作确认/拒绝、下载、file chooser、接管、页面生命周期与 App restart recovery 通过；启动约 2108 ms，十 tab live/suspended 为 8/2。该采样不是已冻结的发布性能阈值。

## Unsigned MSIX

```text
路径: W:\DESKbook\我的项目\BlackRain\apps\desktop\out\electron\make\msix\x64\blackrain.msix
大小: 338624616 bytes
SHA-256: 185BB059C76D296AF5A70A31C3C7AA64F201CB46A97C863C8D6B2139DE757702
SignatureStatus: NotSigned
Identity: cc.goodbyeri.blackrain
Publisher: CN=goodbyeri-studio
Version: 0.7.68.0
Architecture: x64
```

该制品只证明 maker、资源布局和 manifest，不能安装为正式发布候选，也不能关闭 2026-08-03 的 `PRODUCT_FAIL`。

## 未验证风险

- 正式签名证书、受控发布 runner、`signtool verify /pa` 和发布审批未具备。
- 首次登录、账户切换、标准 Home 既有 thread、真实审批/停止/恢复/并发 turn 未做产品验收。
- Browser 真实站点登录/MFA、第二 Windows 用户 named-pipe ACL、IME/DPI/多屏/睡眠/crash 未完成。
- 正式安装、升级、回滚、卸载、证书/文件/进程残留和性能阈值未完成。
- 2026-08-03 测试包和临时信任条目仍需在最终验收后清理并记录。

## 失败记录

### 2026-08-03：开发签名 MSIX 全页面不可点击

- 现象：安装和 AUMID 首启成功，renderer 可见，但原生鼠标点击无法触发设置或其他页面操作。
- 历史机器输出已从公开源码树移除，避免携带本地路径、进程和安装身份；当前结论以本节文字、对应 commit 和重新执行的验证命令为准。
- 根因：终端退出订阅 inline callback 在 render 后变化；旧 callback bridge 不存在时错误写入 debug state，触发同步忙循环。
- 当前代码证据：回调稳定化后 native-input probe、packaged 设置点击和 Electron E2E 通过。
- 关闭条件：在正式签名候选 MSIX 上重跑真实鼠标/键盘矩阵并记录 `PRODUCT_PASS`；开发 package 自动化不能直接关闭。

## 产品证据模板

```text
日期 / Windows build / 用户权限与 SID / Git commit 和 clean worktree
命令或人工步骤 / 正式制品绝对路径 / SHA-256 / signtool 结果
日志与截图 / 结果等级 / 失败原因与复验条件
Browser transport: pipe owner / 第二用户 SID / ACL 拒绝 / token-generation 摘要 / teardown
性能: 机器 / 采样次数 / 冷启动与恢复 P95 / 工作集 / 孤儿进程 / 冻结阈值
```
