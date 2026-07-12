# 跨平台开发指南

> **Windows-first**：BlackRain MVP 只发行 Windows。macOS / iOS 仅作为 post-MVP 或 CodexMonitor 上游资产保留；非 Windows 上的编译或测试不能证明 Windows 可交付。

## 快速结论

- Windows 是当前唯一发布、实机验收和产品承诺平台。
- React/TypeScript、部分 Rust shared core、纯 Python Gateway、Markdown 插件/工作台可在非 Windows 环境编辑和做局部检查，但只能降低风险，不能保证 Windows 行为。
- NSIS、Credential Manager、Mica/标题栏、Windows 路径/进程、真实双引擎、Office 和安装/卸载必须在 Windows 实机验证。
- iOS 当前没有 BlackRain 构建、发布或验收入口；只保留上游资产，不参与 MVP。

## 当前 CI 真相

`.github/workflows/ci.yml` 目前只有两类检查：

| Job | Runner | 覆盖 |
|---|---|---|
| `js-checks` | `ubuntu-latest` | `npm ci`、`npm run typecheck`、`npm run test` |
| `rust-check` | `windows-latest` | `apps/desktop/src-tauri` 的 `cargo check` |

CI **不包含** macOS runner，也不包含 lint、GUI、Tauri dev、NSIS、Credential Manager、真实模型对话、Hermes、Office 或安装/卸载验证。PR 中不能写“CI 绿 = Windows 客户端已验证”。

## 代码边界矩阵

### 可在非 Windows 编辑，但仍需 Windows 收口

| 组件 | 位置 | 非 Windows 能做什么 | Windows 仍要验证什么 |
|---|---|---|---|
| 前端业务逻辑 | `apps/desktop/src/features/**/*.ts(x)` | typecheck、Vitest、通用 UI 调整 | Windows 渲染、快捷键、路径、窗口与真实 IPC |
| Rust shared core | `apps/desktop/src-tauri/src/shared/**/*.rs` | 静态检查、非平台逻辑测试 | Windows target 编译与系统 API 行为 |
| IPC 包装 | `apps/desktop/src/services/tauri.ts` | 类型和单测 | App/Daemon 两运行时完整链路 |
| 设计系统 | `apps/desktop/src/design-system/**` | 组件和 token 调整 | Mica 背景下的对比度、窗口 chrome |
| CODE Gateway | `gateway/gateway.py` | 语法、协议翻译局部测试 | Windows 子进程、端口、日志、bearer、真实 codex 对话 |
| 插件/工作台 | `plugins/**`、`workbenches/**` | Markdown、资源和静态检查 | Windows 文件路径、OfficeCLI、真实任务质量 |
| 文档/spec | `docs/**`、`.specs/**` | 完整编辑 | 涉及平台事实时必须引用 Windows 证据 |

“非 Windows 可编辑”不等于“macOS 编译通过就保证 Windows 可用”。Rust feature、系统库、路径、进程、凭据、窗口与打包依赖都可能只在目标平台失败。

### Windows 专属或发布必验

| 能力 | 位置/入口 | 必验内容 |
|---|---|---|
| NSIS | `apps/desktop/src-tauri/tauri.windows.conf.json`、`scripts/release-client-win.ps1` | 构建、安装、开始菜单启动、升级/卸载、残留 |
| Credential Manager | `apps/desktop/src-tauri/src/shared/account_session_core.rs`、`apps/desktop/src-tauri/src/shared/model_gateway_secrets.rs` | key/session 写入、读取、覆盖、删除、重启恢复 |
| Mica 与自绘标题栏 | `useLiquidGlassEffect.ts`、`WindowCaptionControls.tsx`、窗口后端 | 浅/深/彩色壁纸对比度、最小化/最大化/关闭、缩放 |
| Windows 路径与进程 | Tauri 后端、脚本、Office 资源 | 反斜杠、空格路径、`.exe`、进程回收、端口占用 |
| CODE 真链路 | `codex.exe` + Gateway + App | Responses⇄Chat、多轮工具、审批、错误提示 |
| WORK 真链路 | Hermes + App | `/v1`、SSE、审批、工作台挂载/卸载 |
| Office | OfficeCLI / `office.rs` | Word/Excel/PPT/PDF 真实任务与文件恢复 |
| Windows 安全/恢复 | 对应 spec 和实现 | 当前保障、降级行为、备份/回收站/还原；未实现项不得宣传 |

## Windows 主工作流

可复制命令只维护在 [commands](commands.md)。日常顺序：

1. 在仓库根核对双引擎 `HEAD` 是否等于目标锁定版本。
2. 运行 `pwsh scripts/dev-client.ps1` 启动真实 Windows GUI。
3. 按改动范围运行 `typecheck`、`test`、`lint`、`cargo check`。
4. 涉及平台行为时完成 [.specs/007 verification](../.specs/007-windows-client/verification.md) 对应实机项。
5. 发布前运行 `pwsh scripts/release-client-win.ps1`，再手动安装、启动、对话和卸载。

## 非 Windows 辅助开发流程

macOS / Linux 可用于共享代码的快速迭代，但必须明确证据边界：

1. 只对共享逻辑、前端类型/单测、Python 语法和 Markdown 内容下结论。
2. 不宣称 Windows GUI、凭据、Office、NSIS、进程管理或安全能力通过。
3. PR 中列出仍需 Windows 验证的项目；平台影响变更在合并前交给 Windows 机器收口。
4. `scripts/dev-client.sh`、`npm run tauri:dev`、`npm run tauri:build` 是 post-MVP 历史资产，不在当前 CI 与用户文档中作为主入口。

## 常见跨平台坑

### 路径分隔符和用户目录

不要拼 `/Users/...`、`~/.config/...` 或 `C:\...` 作为业务路径。前端优先用 Tauri path API；Rust 用 `Path` / `PathBuf`。测试至少覆盖空格和非 ASCII 路径。

### 命令与可执行文件名

不要假设 `open`、`pbcopy`、`grep`、`bash` 或无扩展名二进制在 Windows 存在。优先用项目平台抽象；Windows 资源名需要处理 `.exe`。

### 快捷键

不要硬编码 `Cmd` 或 `Ctrl`。使用现有快捷键抽象，并在 Windows 实机测试菜单显示与实际触发。

### 条件编译不是验证

`cfg(target_os = "windows")` / `isWindowsPlatform()` 只说明代码分支存在，不说明分支能编译或行为正确。改到平台分支时，必须在对应 target 上跑。

### 上游引擎不是天然跨平台等价

codex 和 Hermes 都有平台特定依赖、可选 extra 和降级路径。锁版本升级后必须重跑 Windows 构建、协议与产品矩阵；其他平台的通过记录只能作为历史参考。

## UI 平台分叉速记

同一份 UI 代码仍保留上游平台适配：

1. `useLiquidGlassEffect.ts`：Windows 走 Mica；macOS 上游路径走 HudWindow/Vibrancy。
2. `useLayoutOrchestration.ts`：Windows 加 `.is-windows` class，Windows 专属装饰样式只在该 class 生效。
3. `WindowCaptionControls.tsx`：Windows 自绘窗口按钮；macOS 上游路径使用系统标题栏。

这些 macOS 分支是 post-MVP 资产，不构成当前双平台交付承诺。Windows 必须目视验证文字对比、壁纸干扰、缩放、hover/click 和窗口状态切换。

## 何时必须立即切到 Windows

| 信号 | 行动 |
|---|---|
| 改 `apps/desktop/src-tauri/tauri.windows.conf.json` / 发行脚本 | 立即构建 NSIS，并安装/卸载 |
| 改 Mica、标题栏、窗口状态 | Windows 目视和交互验证 |
| 改 `account_session_core.rs` / `model_gateway_secrets.rs` | Credential Manager 完整 CRUD + 重启恢复 |
| 改 `office.rs` / OfficeCLI 资源 | Windows Office 真实文件验证 |
| 改进程、端口、路径或 sidecar | Windows 启停、崩溃、端口占用和清理验证 |
| 升级 codex/Hermes 锁定版本 | Windows 构建 + 协议/能力矩阵 |
| 准备发布 | release 脚本 + 安装 + 启动 + 真实对话 + 卸载 |

## 参考

- Windows 命令：[commands](commands.md)
- Windows 验证矩阵：[.specs/007 verification](../.specs/007-windows-client/verification.md)
- 运行时真源：[09 运行时架构与里程碑](09-运行时架构与里程碑.md)
- 壳内部约束：`apps/desktop/AGENTS.md`
