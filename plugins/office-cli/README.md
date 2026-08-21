# office-cli

> **状态：实验性资源。** 这是文档工具适配器样例，不是当前产品默认依赖。只维护影响构建、安全或 License 的问题；不得据此宣称它已进入发行包。

Office 文档能力插件资源。它是实验性内容样例的一项工具依赖，不是完整产品功能。当前资源和受控安装代码尚未完成 Windows 安装包的 build/unpack/install smoke。

## 作用

- 为 agent 提供统一的 Word / Excel / PowerPoint 文件处理能力
- 约定所有办公文档操作优先走内置 `OfficeCLI`
- 作为 `office-agent` 内容样例的底层工具积木

## 运行时约定

- 代码路径会在启动时探测并准备 `OfficeCLI`
- 准备成功后，`codex` 子进程继承 `OfficeCLI` 所在目录到 `PATH`
- 只有资源实际进入安装包且运行时准备成功后，agent 才能直接调用 `officecli ...`

当前代码包含受控安装、版本检查与 smoke 接缝，但尚未接入产品入口，因此不要把本插件表述为已发布的 Office 功能。

## 版本策略

- 产品包是否携带该工具仍待单独设计和验证
- 二进制版本由仓库资源元数据和未来 BlackRain 安装包统一锁定
- 若后续增加 Windows 兼容路径，应保持权限和许可证边界清晰
