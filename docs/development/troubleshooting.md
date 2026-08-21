# 故障排查

## app-server 无法启动

先运行 `electron:runtime:verify`，确认锁定的 runtime、文件 hash 和许可证存在；再运行 `electron:app-server:probe`。不要把本机 debug build 或旧配置复制到包内。

## Browser 页面空白或无法操作

检查 main 日志中的窗口、route、profile 和 generation；确认 renderer 只发送有效 bounds，且页面没有加载应用 preload。优先运行 Browser client 验证和 Electron smoke。

## Windows 包无法安装

区分 unsigned maker 结果和签名产品结果。记录 MSIX hash、签名状态、Windows build、安装/卸载日志；不要把 macOS/Linux package 结果当作安装证据。

## 需要报告问题

删除 token、Cookie、账号信息和网页正文后，再附上最小复现、版本、平台和相关日志。安全问题请按 [SECURITY.md](../../SECURITY.md) 私下报告。
