# Electron 全量迁移 MVP 验证

> `CODE_EXISTS`、`RUN_PASS`、`PRODUCT_PASS` 不互相替代。只有目标 Windows 制品完成产品矩阵并满足 G0–G6，才能宣称 MVP 可交付。

## 当前验证矩阵

| 日期 | 等级 | 范围 | 命令/证据 | 结果 | 剩余边界 |
|---|---|---|---|---|---|
| 2026-08-03 | `CODE_EXISTS` | Electron 基础与 Browser runtime | main `74e88a2`；历史 Browser 证据见 Git | 安全壳、bundled app-server、Browser host/MCP/恢复代码存在 | 不代表全量迁移或发布通过 |
| 2026-08-03 | `PRODUCT_FAIL` | 开发签名 MSIX 安装态 | `apps/desktop/output/verification/2026-08-03-msix-install-result.json` | 可安装、AUMID 首启、窗口可渲染；人工确认全页面无法点击 | G1 安装态基础流程、G2 核心流程、升级、回滚、卸载均未完成 |
| 2026-08-03 | `RUN_PASS` | shell/opener/dialog/file 首批迁移 | `npm.cmd run typecheck`、目标单测、ESLint、`npm.cmd run check:host-boundary` | 直接 Tauri 依赖分阶段降至当前 53；194 command 无未分类项 | 仍有 53 个 direct import 和 Tauri fallback |
| 2026-08-03 | `RUN_PASS` | packaged 设置点击、Browser 和恢复回归 | `npm.cmd run electron:package`、`node scripts/electron-smoke.mjs`、`node scripts/electron-e2e-supervisor.mjs` | 设置点击、Browser host/tool/敏感操作/takeover/电源恢复/安全/关闭/重启恢复通过 | 不是签名 MSIX `PRODUCT_PASS` |
| 2026-08-04 | `RUN_PASS` | 当前 host boundary 与 Electron 类型 | `npm.cmd run check:host-boundary`、`npm.cmd run electron:typecheck` | 194 command 已分类；53 个 direct import 在基线内；类型检查通过 | 不代表功能迁移、删除旧宿主或发布可用 |

## G0–G6 目标验收矩阵

| 闸口 | 必须覆盖 | 当前状态 | 证据要求 |
|---|---|---|---|
| G0 | 194 command、53 import、插件/资源/CI/版本锁逐项账本 | 未完成 | 账本、lock/hash、干净 worktree 报告 |
| G1 | 正式签名 MSIX 安装、首启、窗口点击、降级/重试入口 | `PRODUCT_FAIL` | 安装制品、真实鼠标/键盘录像或截图、日志、结果 JSON；不承担 app-server 核心流程 |
| G2 | 标准 Home、登录/账户、thread/turn、审批、停止/恢复、并发 | 未完成 | Windows 实机流程、app-server 日志、thread 恢复结果 |
| G3 | 文件、Git、终端、设置、凭据、窗口、通知、菜单、快捷键、深链、更新 | 未完成 | 单测、集成测试、签名包人工矩阵 |
| G4 | Browser 登录/MFA、同页 agent、接管、下载、权限、OOPIF、crash/恢复 | 部分已有自动化 | 真实 Windows 站点和安装态结果 |
| G5 | Tauri/daemon/NSIS/fallback/package/CI 删除 | 未完成 | 删除提交、静态搜索、无 Tauri package 的干净构建 |
| Native Clean Gate | 生产源码、依赖、脚本、CI、用户可见文案和 release 解包零 Tauri 残留；内部真源按分层 allowlist 审计 | 未完成 | 禁词/文件扫描、解包清单、开发/打包/安装三态同一路径 |
| G6 | 签名、安装、升级、回滚、卸载、残留、性能/资源矩阵 | 未完成 | 正式制品 hash、Windows build、完整发布报告 |

## 验证命令基线

```powershell
Set-Location apps/desktop
npm.cmd run typecheck
npm.cmd run test
npm.cmd run lint
npm.cmd run check:host-boundary
npm.cmd run electron:runtime:verify
npm.cmd run electron:node-runtime:verify
npm.cmd run electron:browser-client:verify
npm.cmd run electron:app-server:probe
npm.cmd run electron:package
npm.cmd run electron:smoke
npm.cmd run electron:e2e
npm.cmd run electron:make:release
```

产品矩阵必须在 Windows 11 x64 实机执行，不能由 CI、macOS、Linux 或 unsigned MSIX 替代。每条记录必须同时写明：

```text
日期 / Windows build / 用户权限和账户 / Git commit/worktree
精确命令或人工步骤 / 制品绝对路径 / SHA-256
日志和截图路径 / 结果等级 / 失败原因与复验条件
若涉及 Browser transport：pipe/endpoint owner、运行用户 SID、第二 Windows 用户 SID、ACL 拒绝错误、token/generation 摘要和 teardown 结果
若涉及性能：参考机器、采样次数、冷启动/恢复 P95、稳态工作集、孤儿进程结果和已冻结阈值
```

## 已验证

- Electron main/preload 基础和 Browser runtime 代码存在。
- `check:host-boundary` 当前报告 194 个 Tauri command 已分类、53 个 renderer direct import 在基线内。
- `electron:typecheck` 当前通过。
- packaged Electron 设置点击、Browser host/tool、敏感操作确认/拒绝、下载、用户接管、电源恢复、安全边界、关闭和重启恢复已有自动化通过证据。
- 标准 stdio MCP、随包 Node adapter、metadata 透传、backend 命中、token/generation 拒绝已有探针证据。

## 未验证风险

- 正式签名 MSIX 的真实鼠标点击和 G1 安装态基础流程仍未通过；thread/turn 等 G2 核心流程尚未进入 G1 结论。
- 标准 Codex Home、首次登录、账户切换、真实审批、停止/恢复、并发 turn 尚未通过 Windows 产品验收。
- Codex auth 与 BlackRain 自有 provider/Gateway secret 的分域合同、`codexHomeId`/`profileId` 跨域拒绝和首次未登录 bootstrap window 尚未有实现级证据。
- Git、`node-pty`/ConPTY 终端、更新/回滚、深链、通知、托盘和完整诊断尚未通过。
- Tauri runtime、daemon、NSIS、依赖、兼容 fallback 尚未删除。
- 原生重建收口尚未完成：生产源码、用户文档、脚本和 release package 仍保留旧宿主痕迹，尚未执行 zero-tolerance 扫描。
- Browser 真实站点登录/MFA、另一个 Windows 用户账户的 named-pipe ACL、输入法/DPI/多屏/睡眠和资源性能矩阵尚未完成。
- 更新通道已冻结为签名 MSIX/App Installer 包链，但证书/runner、上一版制品保留和真实回滚演练尚未完成；性能阈值也尚未在 G6 报告中冻结。
- 当前文档历史阶段仍可能出现 59 的旧基线；当前有效基线以本文件 53 和命令实测为准，其他文档必须同步。

## 失败记录

### 2026-08-03：签名 MSIX 全页面不可点击

- 现象：安装和 AUMID 首启成功，renderer 可见，但原生鼠标点击无法触发设置或其他页面操作。
- 证据：`apps/desktop/output/verification/2026-08-03-msix-install-result.json`。
- 已知根因：终端退出订阅 inline callback 在 MainApp render 后变化；Electron 下不存在 Tauri `transformCallback`，错误写入 debug state 后触发同步忙循环。
- 当前处理：回调稳定化后 packaged 设置点击和完整 Electron E2E 通过。
- 未关闭条件：正式签名 MSIX 仍需真实鼠标复验，直到 G1 `PRODUCT_PASS` 前不能宣称修复完成。

## 证据记录模板

### YYYY-MM-DD：`Gx / CODE_EXISTS|RUN_PASS|PRODUCT_PASS|PRODUCT_FAIL`

- 环境：Windows build、用户权限、硬件、网络、Git commit/worktree。
- 范围：对应任务 ID 和账本 ID。
- 命令/人工步骤：完整命令或可复现步骤。
- 制品/日志：绝对路径、SHA-256、日志和截图。
- 结果：通过/失败；失败原因、影响范围、临时降级和下一次复验条件。
