# office-cli

> **状态（2026-07-26）：暂停资产。** 这是旧 Office/工作台路线的工具依赖，不是当前 Codex-first P0。只维护影响构建、安全或 License 的问题；不得据此宣称 Office 工作台已恢复或可发布。

Office 文档能力插件资源。它是 Office 参考工作台的一项工具依赖，不是完整工作台。当前资源、受控安装代码、工作台 Manifest 与 NSIS mapping 已存在，但尚未完成当前 Windows 安装包的 build/unpack/install smoke，也未接入 spec 011 的受控会话执行。

## 作用

- 为 agent 提供统一的 Word / Excel / PowerPoint 文件处理能力
- 约定所有办公文档操作优先走内置 `OfficeCLI`
- 作为 `office-agent` 工作台的底层工具积木

## 运行时约定

- 代码路径会在启动时探测并准备 `OfficeCLI`
- 准备成功后，`codex` 子进程继承 `OfficeCLI` 所在目录到 `PATH`
- 只有资源实际进入安装包且运行时准备成功后，agent 才能直接调用 `officecli ...`

当前代码包含受控安装、版本检查与 smoke 接缝，但 Session Orchestrator 和工作台 surface 尚未接入，因此不要把本插件已内置表述为“Office 工作台任务已可运行”。完整包边界见 [.specs/008](../../.specs/008-expert-workbench-package/)，激活后的执行合同见 [.specs/011](../../.specs/011-workbench-session-orchestration/)。

## 版本策略

- 产品目标是不要求用户单独安装或升级；当前安装包行为仍待 007 验证
- 二进制版本由仓库资源元数据和未来 BlackRain 安装包统一锁定
- 若后续要补 Windows COM 兜底,仍应保持本插件为默认主路径
