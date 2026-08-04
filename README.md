# BlackRain

BlackRain 是一款以 OpenAI 开源 `codex-rs` 为唯一 agent 内核的桌面 AI 编程产品。项目自行补齐完整桌面 App 所需的闭源宿主能力，目标是在合法、可验证的边界内，尽可能对齐官方 Codex App 的核心功能和使用体验。

## 当前目标

唯一产品交付 P0 是完成 Tauri 到 Electron 的全量迁移、删除旧宿主并交付 Windows Electron 客户端。Browser runtime/功能链路已闭环，后续作为 Electron 发布回归矩阵的一部分。

仓库同时启动独立的 **可移植 Electron Browser Runtime 源码底座**开发线：把现有 in-app browser 整理为适合其他 Electron 编程工具和桌面 Agent 二次开发的低耦合源码模块。它不改变 BlackRain 的产品 P0，不引入第二 Agent runtime，也不承诺安装即用插件或通用 UI。

工作台、Session Orchestrator、专家市场和 OPC/工作室全部暂停，不进入当前 P0/P1 路线。已有代码与 specs 作为冻结资产保留，但不能再被描述为当前产品第一主语或近期交付目标。

## 唯一内核

```text
BlackRain Electron（目标态）
  ├─ Main：窗口、App Server client、Browser WebContentsView/registry/CDP、权限、更新
  ├─ Preload：类型化最小权限 IPC
  ├─ Renderer：Codex App 风格的 React 产品界面和 Browser sidebar controls
  ├─ bundled codex.exe app-server：stdio JSONL 机器入口、codex-core 唯一内核、标准 Codex Home
  └─ Model Gateway（需要非 Responses 模型时，可选 sidecar）
```

运行时只允许一套 agent thread、事件、审批、停止和恢复路径。不得引入任何第二 agent 内核；不得把宿主能力写成内核 fork。

## 当前实现

当前完整产品主流程仍是 CodexMonitor 衍生的 Tauri + React + Rust。仓库同时已经建立 Electron 42/Forge/Vite 安全空壳、main-owned `WebContentsView` Browser host/UI、App Server stdio client、锁定的 bundled `codex-cli 0.146.0` runtime、受限 CDP/OOPIF 和自有 Browser client/transport foundation。

真实模型 Agent 共页、用户接管、权限/下载拦截和 page/App restart 恢复已有 Windows 证据；packaged Electron Browser E2E 已有自动化通过记录，但正式签名 MSIX、真实站点和完整 Windows 发布矩阵仍未完成。Browser 源码底座目前也仍与 BlackRain/Codex/IPC/UI 接线耦合，尚未通过独立 consumer 的可移植性验收。目标架构、代码存在、验证通过、可移植和发布可用必须分开陈述。

## 仓库

```text
apps/desktop/      当前 Tauri 产品实现 + 迁移中的 Electron main/preload/renderer/Browser
gateway/           可选模型协议翻译 sidecar
codex-upstream/    gitignored 的 codex 只读参考克隆
plugins/           冻结/按需复用的工具适配器
workbenches/       暂停的工作台资产
.specs/            跨层功能 living specs
docs/              产品、架构与运行手册
```

## 真源

- Electron 产品迁移与发布：[.specs/002-electron-migration/](.specs/002-electron-migration/)
- 可移植 Browser Runtime 源码底座：[.specs/003-portable-electron-browser-runtime/](.specs/003-portable-electron-browser-runtime/)
- 产品形态：[docs/04-产品形态.md](docs/04-产品形态.md)
- 运行时与里程碑：[docs/09-运行时架构与里程碑.md](docs/09-运行时架构与里程碑.md)
- Electron 与 Browser 实施计划：[docs/10-Electron迁移与内置浏览器实现计划.md](docs/10-Electron迁移与内置浏览器实现计划.md)
- 日常命令：[docs/commands.md](docs/commands.md)

## 架构纪律

1. `codex-rs` / `codex app-server` 保持原装、只读、可跟随上游升级。
2. Electron 是唯一目标桌面宿主；Tauri 只是迁移起点。
3. React UI 优先复用；Electron main 直接实现 App Server client，当前 Rust daemon/shared core 只作为迁移输入，不进入目标运行时。
4. App 沿用 Codex 标准 Home 并与原生 CLI 共享配置、技能、插件和可恢复 thread；Electron/Chromium user-data 保持独立。
5. Browser 高度对齐 Codex App 的共享 IAB 功能与控制面；main 创建并控制 `WebContentsView`、session 和 CDP，网页与 App 权限域严格隔离。
6. 不复制 OpenAI 闭源代码、私有 bundle 或专有资源；只对齐合法可观察的行为与体验。
7. 当前完成度只以实际代码和对应 `verification.md` 为准。

协作规则见 [AGENTS.md](AGENTS.md)，License 边界见 [CONTRIBUTING.md](CONTRIBUTING.md)。
