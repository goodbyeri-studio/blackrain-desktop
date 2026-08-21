# 风险与限制

这里记录贡献者和用户需要知道的工程风险，以及当前的缓解方式。它不是市场分析，也不替代发布前的实际验证。

## 上游兼容

`codex-rs` 和 app-server 协议会持续变化。BlackRain 锁定版本、运行协议探针，并在升级时重跑类型检查、事件测试、Browser MCP 和 Windows smoke。上游源码存在不等于 BlackRain 已经支持该能力。

## Browser 隔离

网页内容、Cookie、下载和控制台输出都是不可信输入。Browser 页面不加载应用 preload；main 校验窗口、thread、profile、route 和 generation，并对导航、弹窗、权限、下载和高影响动作默认拒绝或要求一次性授权。

## IPC 与本地权限

renderer 和网页都不能提供任意 channel、文件路径、命令或 CDP method。preload 只暴露 typed allowlist，main 对 sender、schema 和 ownership 做二次校验。新增桌面能力必须同时增加拒绝路径和测试。

## 许可证与供应链

上游 runtime、字体、图标、二进制和 npm 依赖可能有不同许可证或安全公告。新增依赖必须记录来源、版本、许可证和必要的 NOTICE；未确认许可证的内容不进入发行物。发布前应在干净环境重新生成并审计运行时。

## Windows 发布

macOS/Linux 的测试不能替代 Windows Electron、MSIX、ConPTY、输入法、多屏、升级和卸载验证。当前仓库提供开发和自动化基线，但正式签名产品仍需要受控 Windows 矩阵。

## 数据与隐私

标准 Codex Home、Browser profile、Cookie 和用户项目属于本机用户数据。日志、诊断包和测试夹具不得包含 token、密码、Cookie 或不必要的网页正文。问题报告应先阅读 [SECURITY.md](../SECURITY.md)，不要公开提交敏感信息。
