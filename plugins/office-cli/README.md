# office-cli

内置 Office 文档能力插件。产品上属于“安装即自带”的运行时能力,工程上仍按插件组织,便于后续升级与维护。

## 作用

- 为 agent 提供统一的 Word / Excel / PowerPoint 文件处理能力
- 约定所有办公文档操作优先走内置 `OfficeCLI`
- 作为 `office-agent` 工作台的底层工具积木

## 运行时约定

- 桌面应用会在启动时探测并准备内置 `OfficeCLI`
- `codex` 子进程会自动继承 `OfficeCLI` 所在目录到 `PATH`
- agent 可直接调用 `officecli ...`

## 版本策略

- 用户不需要单独安装或升级
- 二进制版本由 BlackRain 安装包统一锁定
- 若后续要补 Windows COM 兜底,仍应保持本插件为默认主路径
