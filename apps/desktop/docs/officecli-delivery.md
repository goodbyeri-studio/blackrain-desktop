# OfficeCLI 内置交付文档

交付日期：2026-06-23

## 交付结论

BlackRain2049 桌面端已经完成 OfficeCLI 内置封装。用户安装 Windows 安装包后，应用安装目录内自带可执行的 OfficeCLI、Office 技能插件和 Office Agent 工作台资源，不需要用户额外安装 OfficeCLI，也不依赖系统 PATH 中预装的同名工具。

当前已完成并实测通过的是 Windows x64 安装包。macOS arm64/x64 的 OfficeCLI 二进制已经进入源码资源目录，但本次是在 Windows 环境交付，macOS 安装包仍需要在 macOS 构建机上做最终安装验证。Linux 不在本次封装范围内。

## 交付范围

已交付内容：

- OfficeCLI Windows x64 二进制内置到源码和 Windows 安装包。
- OfficeCLI macOS arm64/x64 二进制内置到源码资源目录。
- Tauri 后端新增 Office runtime bridge，负责解析、复制、调用内置 OfficeCLI。
- Codex 子进程启动时注入 OfficeCLI 路径，Agent 会话可直接使用内置能力。
- 内置 `office-cli` skill 和 `office-agent` workbench，并随安装包一起交付。
- 前端 TypeScript 服务层增加 Office runtime 和 Office 命令调用封装。
- Windows 本地打包配置已调整为不要求 updater 私钥，便于本机和交付机直接构建安装包。

不在本次范围：

- Linux OfficeCLI 打包。
- macOS 安装包实机验证。
- Office COM 原生自动化深度封装。
- UI 层 Office 操作面板的完整产品化入口。

## 关键源码位置

- Tauri Office runtime bridge：`apps/desktop/src-tauri/src/office.rs`
- Tauri 命令注册：`apps/desktop/src-tauri/src/lib.rs`
- Codex 子进程环境注入：`apps/desktop/src-tauri/src/backend/app_server.rs`
- Codex session 启动前 runtime 准备：`apps/desktop/src-tauri/src/codex/mod.rs`
- 前端服务封装：`apps/desktop/src/services/tauri.ts`
- 前端类型定义：`apps/desktop/src/types.ts`
- OfficeCLI 资源：`apps/desktop/src-tauri/resources/office-cli/`
- 内置插件资源：`plugins/office-cli/`
- 打包用插件资源副本：`apps/desktop/src-tauri/resources/plugins/office-cli/`
- Office Agent 工作台：`workbenches/office-agent/`
- 打包用工作台资源副本：`apps/desktop/src-tauri/resources/workbenches/office-agent/`
- Vendor 脚本：`scripts/vendor-officecli.ps1`

## 安装包产物

Windows 安装包已经生成：

- NSIS：`apps/desktop/src-tauri/target/release/bundle/nsis/BlackRain2049_0.7.68_x64-setup.exe`
- MSI：`apps/desktop/src-tauri/target/release/bundle/msi/BlackRain2049_0.7.68_x64_en-US.msi`

已额外复制一份安装器到桌面：

- `W:\DESKbook\BlackRain2049_0.7.68_x64-setup.exe`

已在本机安装到桌面目录：

- `W:\DESKbook\BlackRain2049`

桌面快捷方式：

- `W:\DESKbook\BlackRain2049.lnk`

## 安装后目录结构

安装后关键文件如下：

```text
W:\DESKbook\BlackRain2049\
  codex-monitor.exe
  codex_monitor_daemon.exe
  uninstall.exe
  office-cli\
    windows-x64\
      officecli.exe
    LICENSE-OfficeCLI.txt
    README.md
    SHA256SUMS
    VENDOR.json
  plugins\
    office-cli\
      .claude-plugin\plugin.json
      skills\office-cli\SKILL.md
  workbenches\
    office-agent\
      AGENTS.md
      README.md
      skills\...
```

Windows 安装后的 `office-cli` 目录只包含 `windows-x64/officecli.exe`，没有混入 Linux 或 macOS 二进制。

## 运行时行为

应用启动后会准备 Office runtime：

1. 优先读取 `BLACKRAIN_OFFICECLI_BIN` 指定的 OfficeCLI。
2. 若没有环境变量，则检查应用数据目录中已复制的 runtime。
3. 若仍不存在，则从安装包资源中查找当前平台 OfficeCLI。
4. 找到后写入运行时环境变量：
   - `BLACKRAIN_OFFICECLI_BIN`
   - `BLACKRAIN_OFFICECLI_DIR`
   - `BLACKRAIN_OFFICECLI_SOURCE`
5. Codex 子进程启动时会把 `BLACKRAIN_OFFICECLI_DIR` 加入 PATH。
6. 内置 Office skill/workbench 会同步到应用托管的 Codex 环境中。

已暴露 Tauri 命令：

- `office_runtime_info`
- `office_run_command`
- `office_create_document`
- `office_validate_document`
- `office_view_document`
- `office_document_issues`
- `office_merge_template`

## 验证记录

### 源码资源验证

从 release 资源目录运行 OfficeCLI：

```powershell
apps\desktop\src-tauri\target\release\office-cli\windows-x64\officecli.exe --version
```

结果：

```text
1.0.117
```

创建并校验 Office 文件：

- 创建 `smoke.docx` 成功。
- 创建 `smoke.xlsx` 成功。
- 创建 `smoke.pptx` 成功。
- 三个文件执行 `validate --json` 均返回 `Validation passed: no errors found.`

测试目录：

```text
apps/desktop/src-tauri/target/officecli-smoke-test
```

### 安装后验证

从安装目录运行 OfficeCLI：

```powershell
W:\DESKbook\BlackRain2049\office-cli\windows-x64\officecli.exe --version
```

结果：

```text
1.0.117
```

安装后创建并校验 Word 文档：

```powershell
W:\DESKbook\BlackRain2049\office-cli\windows-x64\officecli.exe create W:\DESKbook\BlackRain2049\officecli-installed-smoke-test\installed.docx
W:\DESKbook\BlackRain2049\office-cli\windows-x64\officecli.exe validate W:\DESKbook\BlackRain2049\officecli-installed-smoke-test\installed.docx --json
```

校验结果：

```json
{
  "success": true,
  "data": "Validation passed: no errors found.",
  "message": "Validation passed: no errors found."
}
```

测试文件：

```text
W:\DESKbook\BlackRain2049\officecli-installed-smoke-test\installed.docx
```

### 构建验证

已执行并通过：

```powershell
npm run typecheck
cargo check
npm run tauri:build:win
```

说明：

- `npm run tauri:build:win` 已成功生成 MSI 和 NSIS 安装包。
- 构建过程中存在现有代码 warning 和 Vite chunk size warning，不影响本次 OfficeCLI 交付。
- Windows 构建配置关闭了 updater artifact 签名要求，因此不需要 `TAURI_SIGNING_PRIVATE_KEY` 也能生成本地交付安装包。

## 重打包步骤

在 Windows 机器上执行：

```powershell
cd W:\DESKbook\我的项目\BlackRain\apps\desktop
npm run tauri:build:win
```

生成产物：

```text
apps/desktop/src-tauri/target/release/bundle/msi/BlackRain2049_0.7.68_x64_en-US.msi
apps/desktop/src-tauri/target/release/bundle/nsis/BlackRain2049_0.7.68_x64-setup.exe
```

如果需要更新 OfficeCLI 版本，执行：

```powershell
scripts/vendor-officecli.ps1
```

该脚本当前只处理 Windows x64、macOS arm64、macOS x64，不处理 Linux。

## 验收口径

可以按以下标准验收本次交付：

- 安装包安装后，安装目录中存在 `office-cli/windows-x64/officecli.exe`。
- 不安装外部 OfficeCLI，也能运行安装目录内的 `officecli.exe --version`。
- 安装目录内 OfficeCLI 能创建 `.docx/.xlsx/.pptx`。
- 安装目录内 OfficeCLI 能校验创建出的 Office 文件。
- 应用启动后可通过 Tauri 命令查询 Office runtime。
- Codex 子进程可通过注入的 PATH 找到内置 OfficeCLI。
- Windows 安装包不包含 Linux 二进制。

## 风险与后续事项

- macOS 二进制已入库，但 macOS 安装包仍需在 macOS 构建机完成签名、打包和安装后验证。
- 当前完成的是 runtime 和 Agent 侧能力内置，UI 层如果要做“Office 办公智能体”显式入口，还需要继续产品化。
- Windows COM 自动化没有作为主路径封装，后续只建议作为少量 Word/Excel 专有能力的兜底补充。
- OfficeCLI 上游版本更新时，需要重新 vendor 二进制并更新 `SHA256SUMS`/`VENDOR.json`。
