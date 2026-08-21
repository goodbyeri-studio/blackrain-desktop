# 发布维护

发布分为三个证据层级：

1. `CODE_EXISTS`：源码、配置和测试入口存在。
2. `RUN_PASS`：指定环境中的自动化检查通过。
3. `PRODUCT_PASS`：目标 Windows 签名安装包通过安装、核心流程、升级、回滚、卸载和残留检查。

只有第三层完成，才能发布稳定版本。CI 或 macOS/Linux smoke 不能替代 Windows 实机验收。

## 发布前

- 在干净工作树和临时 clone 中运行文档列出的最小检查。
- 验证 runtime lock、第三方许可证、NOTICE、制品 hash 和签名身份。
- 确认日志、artifact 和 release notes 不含 token、Cookie、密码或用户内容。
- 记录未验证项目，不用目标拓扑或旧截图代替结果。

## 版本说明

Release notes 应包含用户可见变化、已知限制、支持平台、升级/回滚注意事项和安全修复。尚未完成的功能写成“实验性”或“未验证”，不要使用“已发布”措辞。
