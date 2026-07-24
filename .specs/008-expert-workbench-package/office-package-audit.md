# Office 工作台包审计

## 当前组成

- `workbenches/office-agent/workbench.yaml`
- 三个 Office Skills
- `plugins/office-cli/`
- `tasks/tasks.yaml`
- health 与 smoke 声明

## 已确认

- 包和插件使用独立标识与版本。
- OfficeCLI 作为应用托管依赖声明固定版本、来源、校验和和卸载策略。
- 文件权限采用用户选择目录，网络域与可启动进程显式声明。
- 安装事务在全部验证通过后才写入激活记录。
- 用户项目不进入安装根，卸载保持项目目录不变。

## 发布阻塞项

- Windows 真实 OfficeCLI smoke 尚未完成。
- NSIS 资源包含、安装与卸载尚未形成发布证据。
- spec 011 的会话编排、工作台 surface 与 Office 质量基线尚未接入。
