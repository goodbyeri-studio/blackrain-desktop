# OfficeCLI 内置交付状态

> 本文记录当前仓库中的 OfficeCLI 集成边界。历史上曾在 2026-06-23 对一个 Windows 安装包做过 OfficeCLI 创建/校验 smoke，但该结果只证明当时的资源封装，不等于当前锁定内核、账号、Gateway、WORK/Hermes、工作台生命周期和 NSIS 全链路已经发布验收。Windows 发布真源是 [spec 007 verification](../../../.specs/007-windows-client/verification.md)，工作台包真源是 [spec 008](../../../.specs/008-expert-workbench-package/)。

## 当前结论

已经落入仓库并可由代码解析的内容：

- Windows x64 OfficeCLI 二进制，使用 Git LFS 跟踪。
- macOS arm64/x64 二进制，作为 post-MVP 历史资产保留，不属于当前交付范围。
- Tauri Office runtime bridge：解析、复制和调用内置 OfficeCLI。
- Codex 子进程 PATH 注入。
- 内置 `office-cli` skill 和 `office-agent` workbench 资源。
- Windows NSIS 配置中的 OfficeCLI/plugin/workbench resource 声明。
- 前端 TypeScript 服务层的 Office runtime 命令封装。

当前尚不能据此宣称：

- WORK/Hermes 已经接入 Office 工作台。
- 当前锁定版本的 Windows 客户端已完成真实登录、对话、安装和卸载验收。
- Office 任务已经达到面向小白的端到端质量基线。
- 影子备份、回收站删除和一键还原已经实现。
- Office 资源已经具备 Manifest、安装、健康检查、升级、回滚和卸载能力。

## 关键源码位置

- Tauri Office runtime bridge：`apps/desktop/src-tauri/src/office.rs`
- Tauri 命令注册：`apps/desktop/src-tauri/src/lib.rs`
- Codex 子进程环境注入：`apps/desktop/src-tauri/src/backend/app_server.rs`
- Codex session 启动前 runtime 准备：`apps/desktop/src-tauri/src/codex/mod.rs`
- 前端服务封装：`apps/desktop/src/services/tauri.ts`
- 前端类型定义：`apps/desktop/src/types.ts`
- OfficeCLI 资源：`apps/desktop/src-tauri/resources/office-cli/`
- 内置插件：`plugins/office-cli/`
- Office Agent 工作台：`workbenches/office-agent/`
- vendor 脚本：`scripts/vendor-officecli.ps1`

## 运行时行为

应用准备 Office runtime 时：

1. 优先读取 `BLACKRAIN_OFFICECLI_BIN` 指定的开发/调试覆盖项。
2. 检查应用数据目录中已经复制的 runtime。
3. 从安装包资源中查找当前平台 OfficeCLI。
4. 把 OfficeCLI 运行目录加入 Codex 子进程的 `PATH`。
5. 把 Office skill 和 workbench 内容骨架同步到应用托管的 `CODEX_HOME`。

这条现有路径是 CODE-side 资源准备，不是 008 所定义的工作台安装/激活协议。

当前暴露的本地 Tauri 命令：

- `office_runtime_info`
- `office_run_command`
- `office_create_document`
- `office_validate_document`
- `office_view_document`
- `office_document_issues`
- `office_merge_template`

这些命令当前只支持本地 backend，不是远程 daemon 能力。

## Windows 打包边界

`apps/desktop/src-tauri/tauri.windows.conf.json` 当前只声明 NSIS，并包含：

- `office-cli/windows-x64/officecli.exe`
- `gateway/gateway.py`
- `plugins/office-cli/`
- `workbenches/office-agent/`
- 构建前生成的 Codex 和嵌入式 Python runtime 目录

配置存在只代表资源被声明；是否真正进入安装包、安装后能否调用，必须由 `.specs/007` 的 NSIS resource/install smoke 给出证据。

## 重打包入口

在真实 Windows 开发机、仓库根目录执行：

```powershell
Copy-Item .env.production.example .env.production.local
# 填写 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
pwsh scripts/release-client-win.ps1
```

脚本会先准备 Codex 与嵌入式 Python runtime，再运行类型检查、测试、Rust 检查和 `tauri:build:win`。不要从历史绝对路径、旧版本号或旧 MSI 产物推断当前构建结果。

## 发布验收口径

当前版本只有在以下项目全部写入 `.specs/007-windows-client/verification.md` 后，才能称为 Windows 可交付：

- `git lfs pull` 后 OfficeCLI 不是 LFS pointer。
- NSIS 包内包含 OfficeCLI、Gateway、plugin、workbench、Codex 和 Python runtime。
- 安装后 `officecli.exe --version` 可执行。
- 安装后能创建并校验 `.docx`、`.xlsx`、`.pptx`。
- App 能查询 Office runtime，Codex 子进程能从注入 PATH 找到 `officecli`。
- 登录、真实模型对话、安装、启动和卸载流程通过。
- WORK/Hermes Office 工作台若被作为产品卖点，还必须另有 WORK surface 和 Office 场景质量基线证据。
- 作为可安装工作台发布前，还必须通过 008 的 Manifest、权限、健康检查、升级/回滚和卸载矩阵。

## 后续事项

- WORK/Hermes 产品化、跨模式编排与 Office 质量基线：`.specs/003-dual-engine-architecture/`。
- Windows NSIS、Credential Manager、真实工具调用、安装/卸载：`.specs/007-windows-client/`。
- 工作台 Manifest、依赖、激活、升级、回滚和卸载：`.specs/008-expert-workbench-package/`。
- OfficeCLI 上游升级时重新 vendor，并同步 `SHA256SUMS` 与 `VENDOR.json`。
- Windows COM 只作为少量 Office 专有能力的兜底，不作为主路径。
