# 跨平台与 Windows 边界

Windows x64 是当前产品发布平台。macOS/Linux 可以运行共享逻辑和静态检查，但不能替代 Windows 产品验收。

## 可跨平台验证

- TypeScript typecheck、Vitest 和 ESLint；
- app-server transport/fixture 的纯 Node 测试；
- Gateway 协议映射；
- 文档、schema、许可证和静态边界检查。

## 必须在 Windows 验证

- Electron production package、MSIX、fuses、原生输入和 WebContentsView；
- ConPTY、凭据存储、通知、深链、睡眠/唤醒和进程清理；
- 签名安装包的安装、升级、回滚、卸载和残留；
- 登录/MFA、审批、Browser 站点、IME、DPI、多屏和多用户权限。

自动化 `RUN_PASS` 只说明指定环境的检查通过；发布候选还需要 `PRODUCT_PASS` 的 Windows 证据。
