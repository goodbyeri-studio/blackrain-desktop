# 跨平台开发指南

> MVP 主力是 Win11，但大部分代码在 macOS 上开发也能保证 Windows 可用。本文档明确哪些可以跨平台开发，哪些必须在 Windows 上验证。

## 快速结论

✅ **可以在 macOS 上开发并保证 Windows 可用**：
- 前端 React/TypeScript 代码（90%+）
- Rust 后端业务逻辑（shared/* 核心）
- 模型网关 Python 代码（gateway/）
- 插件和工作台内容（plugins/、workbenches/）
- 文档和 spec

❌ **必须在 Windows 上验证/开发**：
- Windows 专属 UI（毛玻璃、自绘标题栏）
- NSIS 打包和安装流程
- Windows Credential Manager 集成
- Office 自动化测试（officecli.exe）

## 代码库跨平台矩阵

### ✅ 完全跨平台（macOS 改完 Windows 直接可用）

| 组件 | 位置 | 说明 |
|---|---|---|
| **双引擎核心** | `codex-upstream/`、`hermes-upstream/` | Rust/Python 跨平台，macOS 编译通过 = Windows 能编译 |
| **模型网关** | `gateway/gateway.py` | 纯 stdlib Python，无平台依赖 |
| **前端业务逻辑** | `apps/desktop/src/features/**/*.ts(x)` | React hooks、状态管理、业务流程 100% 跨平台 |
| **Rust 后端核心** | `apps/desktop/src-tauri/src/shared/**/*.rs` | 跨运行时领域逻辑，不含平台 API |
| **IPC 层** | `apps/desktop/src/services/tauri.ts` | Tauri command 封装，跨平台 |
| **设计系统** | `apps/desktop/src/design-system/**` | UI 组件、token、原语，跨平台 |
| **插件内容** | `plugins/**/*.md`、`workbenches/**` | Markdown 技能定义，零平台依赖 |
| **测试** | `apps/desktop/src/**/*.test.ts(x)` | Vitest 单元测试，跨平台 |
| **文档** | `docs/**`、`.specs/**` | Markdown 文档，跨平台 |

### ⚠️ 有平台分叉点（需理解差异，但可在 macOS 开发）

| 组件 | 位置 | macOS 行为 | Windows 行为 | 开发建议 |
|---|---|---|---|---|
| **毛玻璃效果** | `useLiquidGlassEffect.ts` | 用 Vibrancy | 用 Mica | macOS 改逻辑，Windows 自动走 Mica 分支 |
| **窗口标题栏** | `WindowCaptionControls.tsx` | 系统原生 | 自绘（红绿灯按钮） | 条件渲染已处理，改布局无风险 |
| **快捷键** | `shortcuts.ts` | Cmd | Ctrl | 用 `isMacPlatform()` 包装，逻辑跨平台 |
| **文件管理器** | `constants.ts` | Finder | Explorer | `fileManagerName()` 抽象，改逻辑不破坏 |
| **打开编辑器** | `constants.ts` | `kind: "app"` | `kind: "command"` | macOS 用 bundle ID，Windows 用 PATH 命令 |
| **Office CLI** | `office.rs` | `officecli` | `officecli.exe` | `is_office_executable_name()` 已统一 |

**关键**：这些分叉点都有 `cfg!(target_os = "windows")` 或 `isWindowsPlatform()` 守卫，改业务逻辑不会破坏平台差异。

### ❌ Windows 专属（必须在 Win11 上开发/验证）

| 组件 | 位置 | 为什么 Windows 专属 | 开发建议 |
|---|---|---|---|
| **NSIS 打包** | `tauri.windows.conf.json`、`scripts/release-client-win.ps1` | NSIS bundle 只在 Windows 上跑 | 打包、安装、卸载必须 Win11 实机测 |
| **Credential Manager** | `src-tauri/src/credentials.rs` | Windows 系统密钥链 API | macOS 用 Keychain 模拟，真实行为需 Win11 验证 |
| **Mica 材质效果** | `tauri-plugin-liquid-glass` | Win11 独有视觉效果 | macOS 看不到效果，需 Win11 看实际渲染 |
| **自绘标题栏** | `WindowCaptionControls.tsx` + `window.rs` | Win11 自定义 chrome 交互 | macOS 用系统栏，交互细节需 Win11 测 |
| **Windows 沙箱** | `windowsSandbox/*` 探针（待实现） | Win11 沙箱权限管理 | 完全 Windows 专属，macOS 无法模拟 |

## 实战开发流程

### 在 macOS 上开发新功能（推荐主工作流）

```bash
# 1. 在 macOS 上正常开发
./scripts/dev-client.sh
cd apps/desktop
npm run typecheck && npm run test && npm run lint

# 2. 提交前自检清单
✅ TypeScript 类型通过
✅ 单元测试全绿
✅ 设计系统 lint 通过
✅ 没有硬编码 macOS 路径（/Users、~/Library）
✅ 没有硬编码 macOS 命令（open、pbcopy）
✅ 平台分叉用 isWindowsPlatform() / cfg!(target_os = "windows")

# 3. Git 提交 → CI 会跑 macOS 验证
git add -p && git commit -m "feat: xxx"
git push

# 4. 通知 Windows 团队成员做烟测（见下节）
```

### Windows 团队成员烟测流程

当 macOS 开发的功能合并到 `main` 后，Windows 团队成员应该：

```powershell
# 1. 拉取最新代码
git pull

# 2. 启动开发环境
pwsh scripts/dev-client.ps1

# 3. 验证核心功能（~5 分钟）
- [ ] GUI 正常启动，无白屏/黑屏
- [ ] Mica 毛玻璃效果正常
- [ ] 自绘标题栏按钮可点击
- [ ] 能创建对话并收到回复
- [ ] 快捷键正常（Ctrl+N / Ctrl+K）
- [ ] Office CLI 能找到（如涉及）

# 4. 如果功能涉及打包，跑完整验证
pwsh scripts/release-client-win.ps1
# 双击 .exe 安装 → 开始菜单启动 → 卸载干净
```

### 必须在 Windows 上做的任务

| 任务 | 命令 | 频率 |
|---|---|---|
| **NSIS 打包验证** | `pwsh scripts/release-client-win.ps1` | 每个发布前 |
| **Credential Manager 测试** | 手动测 API key 存取 | 改 credentials.rs 后 |
| **Mica 效果验证** | 目视 GUI | 改窗口样式后 |
| **协议探针（Windows 内核）** | `python3 .scratch/m0_protocol_probe.py` | 升级 codex 版本后 |
| **Office 自动化验证** | 手动测 Word/Excel/PPT 操作 | 改 office.rs 后 |

## 常见坑与规避

### ❌ 容易踩的坑

1. **路径分隔符硬编码**
   ```typescript
   // ❌ 错误：硬编码 Unix 路径
   const configPath = `${home}/.config/app/config.toml`;
   
   // ✅ 正确：用 Tauri path API
   import { join } from "@tauri-apps/api/path";
   const configPath = await join(await appDataDir(), "config.toml");
   ```

2. **命令行工具假设**
   ```typescript
   // ❌ 错误：假设 Unix 命令存在
   await invoke("execute_command", { cmd: "open", args: [path] });
   
   // ✅ 正确：用平台抽象
   import { isWindowsPlatform } from "@/utils/platformPaths";
   const cmd = isWindowsPlatform() ? "explorer" : "open";
   ```

3. **快捷键写死**
   ```typescript
   // ❌ 错误：硬编码 Cmd
   const SHORTCUT = "Cmd+K";
   
   // ✅ 正确：用 shortcuts.ts
   import { modKey } from "@/utils/shortcuts";
   const SHORTCUT = `${modKey()}+K`; // macOS = Cmd, Win = Ctrl
   ```

4. **假设系统 API 存在**
   ```rust
   // ❌ 错误：无条件调用 macOS API
   use cocoa::appkit::NSApp;
   
   // ✅ 正确：条件编译
   #[cfg(target_os = "macos")]
   use cocoa::appkit::NSApp;
   
   #[cfg(target_os = "windows")]
   use windows::Win32::UI::WindowsAndMessaging::*;
   ```

### ✅ 安全模式

- **用 Tauri 内置 API**：`@tauri-apps/api/path`、`@tauri-apps/api/os` 天然跨平台
- **用项目封装**：`platformPaths.ts`、`shortcuts.ts` 已抽象平台差异
- **写条件分支**：前端用 `isWindowsPlatform()`，Rust 用 `cfg!(target_os = "windows")`
- **测试覆盖**：有条件分支的代码，单测必须覆盖两个分支

## 何时必须切到 Windows 开发

| 信号 | 行动 |
|---|---|
| 改了 `tauri.windows.conf.json` | 立即 Win11 打包验证 |
| 改了 `useLiquidGlassEffect` | Win11 目视效果 |
| 改了 `WindowCaptionControls` | Win11 测交互（最小化/最大化/关闭） |
| 改了 `credentials.rs` | Win11 测 Credential Manager 读写 |
| 改了 `office.rs` | Win11 测 Office 自动化 |
| 升级 `codex-rs` 锁定版本 | Win11 跑协议探针 |
| 准备发布 | Win11 跑完整打包 → 安装 → 卸载流程 |

## 团队协作建议

**4 人团队，2 macOS + 2 Windows（假设）**

- **日常开发**：所有人都在各自平台开发，走各自的 `dev-client.sh` / `dev-client.ps1`
- **功能合并前**：macOS 开发者跑 `typecheck + test + lint`，Windows 开发者跑 5 分钟烟测
- **发布前**：Windows 开发者跑完整 `release-client-win.ps1` + 安装验证
- **平台专属功能**：谁的平台谁负责（Mica/Credential → Win 开发者；Vibrancy → Mac 开发者）

**你当前在 macOS**：
- ✅ 可以开发 90%+ 功能（前端、Rust 核心、网关、插件、文档）
- ✅ 提交前跑 `typecheck + test + lint` 保证质量
- ⚠️ 涉及 Windows 专属功能时，推给 Windows 团队成员验证/完成
- ❌ 不要尝试在 macOS 上打 Windows 包（Tauri 不支持交叉编译 NSIS）

## UI 层平台自动切换（机制速记）

> 原 `docs/macos-windows-ui-cross-platform.md` 已并入本节（2026-07-06 文档治理），同一事实只维护一处。

同一份 UI 代码在两平台自动适配，链路只有三处分叉：

1. **毛玻璃材质**：`useLiquidGlassEffect.ts` 按 `navigator.userAgent` 分流——Windows → `Effect.Mica`（Win11 DWM 原生；Win10 不支持，降级纯色）；macOS → `Effect.HudWindow`。视觉差异：Mica 透的是**桌面壁纸**（偏"实"），HudWindow 透的是**后面的窗口**（偏"透"）。
2. **Windows 专属装饰层**：`useLayoutOrchestration.ts` 在 Windows 上给根节点加 `.is-windows` class；`base.css` 的 `::before/::after`（径向渐变 + 噪点纹理 + 呼吸动画）只在该 class 下生效，用来补偿 Mica 比 Acrylic 更"实"的视觉落差（决策见 [.specs/007 decisions](../.specs/007-windows-client/decisions.md)）。macOS 上这层不存在——想在 Mac 上预览只能用 devtools 手动加 class，或让 Windows 成员截图。
3. **窗口标题栏**：`WindowCaptionControls.tsx` 条件渲染——Windows 自绘最小化/最大化/关闭按钮，macOS 用系统原生红绿灯。

**Win11 必须实测的 UI 边界**（在 macOS 上看不出问题的地方）：

- **文字对比度**：Mica 透明度与 HudWindow 不同且透出桌面壁纸——浅色/深色/彩色壁纸各测一遍，防浅色文字发虚、暗色 UI 看不清。皮肤硬约束沿用 [spec 005](../.specs/005-gui-redesign/design.md)：文字对比必须拉够，玻璃/噪点致发糊就降透明度加底色，清晰优先。
- 一切 `.is-windows` 专属样式（macOS 上根本不渲染）。
- 自绘标题栏交互（点击/hover/窗口状态切换）。

## 参考

- 平台抽象工具：`apps/desktop/src/utils/platformPaths.ts`、`shortcuts.ts`
- Windows 配置：`apps/desktop/src-tauri/tauri.windows.conf.json`
- Windows 验证矩阵：`.specs/007-windows-client/verification.md`
- 平台分叉点清单：`apps/desktop/src/features/app/constants.ts`、`office.rs`
