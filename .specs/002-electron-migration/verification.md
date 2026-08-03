# Electron 全量迁移验证

> `CODE_EXISTS`、`RUN_PASS`、`PACKAGE_PASS` 和 `PRODUCT_PASS` 不互相替代。Browser 旧 spec 的完整历史由 Git 保留；这里仅携带影响当前迁移判定的证据。

## 当前矩阵

| 日期 | 等级 | 范围 | 命令/证据 | 结果 | 剩余边界 |
|---|---|---|---|---|---|
| 2026-08-03 | `CODE_EXISTS` | Electron 基础与 Browser runtime | main `74e88a2`；历史详见 Git 中 `.specs/001-in-app-browser/verification.md` | Electron 安全壳、bundled app-server、Browser host/MCP/恢复和 Windows package 代码存在 | 不代表全量迁移或发布通过 |
| 2026-08-03 | `PRODUCT_FAIL` | 开发签名 MSIX 安装态 | 制品曾完成签名、安装和 AUMID 首启；结果文件 `apps/desktop/output/verification/2026-08-03-msix-install-result.json` | 窗口可渲染，但用户人工确认整个页面无法点击 | 核心产品流程、升级、回滚、卸载未执行 |
| 2026-08-03 | `RUN_PASS` | 首批 shell/opener 迁移 | 分支 `fix/electron-installed-usability`，基线 `74e88a2`，dirty worktree；`npm.cmd run typecheck`；6 个目标文件 37 tests；目标 ESLint；`npm.cmd run check:host-boundary` | 均 exit 0；renderer 直接 Tauri 依赖从 74 降至 59；194 个 command 已分类且无新增未登记依赖 | 尚未重跑 package/smoke/E2E；Tauri fallback 仍存在 |
| 2026-08-03 | `RUN_PASS` | dialog/file picker 与设置副作用收敛 | 6 个 dialog/file 目标文件 136 tests；SettingsView 45 tests；目标 ESLint；`npm.cmd run typecheck`；`npm.cmd run check:host-boundary` | typed `dialog.confirm`、`dialog.message`、`files.pick` 已接入；renderer 直接 Tauri 依赖从 59 降至 53 | 53 个直接依赖和单点 Tauri fallback 仍待迁移 |
| 2026-08-03 | `RUN_PASS` | Electron packaged 设置点击、Browser 与恢复回归 | `npm.cmd run electron:package`；`node scripts/electron-smoke.mjs`；`node scripts/electron-e2e-supervisor.mjs`；阶段日志 `apps/desktop/output/verification/2026-08-03-electron-e2e-stage.log` | 设置点击通过；Browser host/tool/敏感操作/takeover/电源恢复/安全/关闭/重启恢复全部通过 | 不是签名 MSIX 的 `PRODUCT_PASS`，仍需安装态人工复验 |

## 已验证

- Electron main-owned `shell.openExternal` 只允许 `http`、`https`、`mailto`，`revealPath` 只接受绝对路径。
- renderer 的 opener 使用已收敛到 `src/host/desktop.ts`，Electron 使用 typed preload，Tauri 使用单点兼容回退。
- Electron main-owned dialog/file picker 已覆盖确认框、消息框、目录与文件选择入口。
- 当前 host boundary 精确报告 53 个 renderer 直接依赖和 194 个已分类 Tauri command。
- 全页面点击故障的直接闭环是终端退出订阅：不稳定的 `onSessionExit` 在 Electron 下反复触发缺失 Tauri `transformCallback` 的错误，并持续写入 debug state；回调稳定化后 packaged 设置点击和完整 Electron E2E 通过。

## 未验证风险

- 签名 MSIX 尚未用真实鼠标复验，因此历史 `PRODUCT_FAIL` 不能仅凭 packaged E2E 升级为 `PRODUCT_PASS`。
- 标准 Home、首次登录、真实审批、终端、Git、更新和 Windows 发布矩阵尚未通过。

## 失败记录

### 2026-08-03：签名 MSIX 全页面不可点击

- 现象：安装和 AUMID 首启成功，renderer 可见，但原生鼠标点击无法触发设置或其他页面操作。
- 证据：`apps/desktop/output/verification/2026-08-03-msix-install-result.json` 及 Git 中旧 Browser verification 的 `PRODUCT_FAIL` 记录。
- 根因：终端退出订阅的 inline callback 在每次 MainApp render 后变化；Electron 下 Tauri event bridge 不存在，订阅错误写入 debug state 后触发下一轮 render，形成同步忙循环。
- 当前状态：代码根因已修复，packaged Electron 设置点击和完整 E2E 已通过；签名 MSIX 产品态复验仍未完成。
