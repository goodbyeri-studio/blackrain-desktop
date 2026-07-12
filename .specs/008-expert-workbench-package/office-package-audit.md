# Office 官方工作台包审计

审计日期：2026-07-12

## 包内内容

- `workbenches/office-agent/AGENTS.md`：官方 Office 执行规则，BlackRain 自有内容。
- 三个 `skills/*/SKILL.md`：交付物生成、格式修复和预览闭环，BlackRain 自有内容。
- `tasks/tasks.yaml`：首版三类标准任务声明。
- `validation/health.yaml`：OfficeCLI 版本健康检查声明。
- `validation/smoke/basic.yaml`：Windows Office smoke 声明；当前明确标记 `pending-windows-validation`，不能作为通过证据。

## 受控依赖：OfficeCLI 1.0.117

- 上游：`https://github.com/iOfficeAI/OfficeCLI`
- License：Apache-2.0
- 分发策略：随 BlackRain 安装包提供 release binary，不镜像完整上游源码。
- 来源真源：`apps/desktop/src-tauri/resources/office-cli/VENDOR.json`
- License 真源：`apps/desktop/src-tauri/resources/office-cli/LICENSE-OfficeCLI.txt`
- checksum 真源：`apps/desktop/src-tauri/resources/office-cli/SHA256SUMS`
- Windows x64：`ff4a790637bcd4fdaf046727752e9e44207425d5ceafe36131516d37500d9ebd`
- macOS 开发探针：在仓库外临时副本执行 `--version` 得到 `1.0.117`；这不替代 Windows 二进制实机验证。

## 当前注入路径

- Windows bundle mapping 已包含 OfficeCLI 二进制、License、VENDOR 和 checksum。
- 历史 CODE 路径仍会把 Office Skill/工作台内容同步到 App-owned `CODEX_HOME`；它不是 008 生命周期实现。
- `workbench.yaml v1` 已接首个 official-only lifecycle：复制到 App-data 版本目录、校验 OfficeCLI SHA/version、确认项目权限并签发 activation；领域 smoke 尚未执行。
- WORK/Hermes 已能将正式 activation 中的 `SystemCapability: officecli-1.0.117` 解析到 App-data 受控工具根并前置到自身子进程 `PATH`；真实 Windows Hermes 工具发现尚未验证，因此仍不能声称 Office 黄金流程可用。

## 仍未关闭的发布缺口

- Windows 二进制 `--version`、checksum、执行权限与 Office 文件 smoke 未实机验证。
- 尚无 staging/active/state、安装事务、空间检查、权限审批、签名、升级、回滚和卸载。
- 已有 Office official-only `ActivatedWorkbenchContext` producer；尚无通用第三方/第二垂类 producer、升级回滚和 Windows E2E。
- 工作台内容的商业授权文本、支持渠道和发布签名仍需产品/法务冻结。
