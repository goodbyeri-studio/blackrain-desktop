# 跨平台开发与 Windows 验收边界

BlackRain Desktop 的 MVP 只发行 Windows x64。macOS/Linux 可用于 React、TypeScript、协议和纯 Node 测试，但不能替代 Windows Electron、MSIX 或产品验收。

## 可跨平台验证

- TypeScript typecheck、Vitest、ESLint。
- 不启动 Windows bundled runtime 的纯 App Server transport/fixture 测试。
- Gateway 单测与协议映射。
- 文档、schema、License 和静态边界检查。

## 必须在 Windows 验证

- 官方 Codex/Node Windows runtime 的 hash、License 和 Authenticode。
- Electron production package、fuses、原生窗口输入、WebContentsView、OOPIF 和 GPU/资源行为。
- ConPTY、Credential Manager、通知、托盘、菜单、深链、睡眠/唤醒和进程树清理。
- 正式签名 MSIX 的安装、首启、升级、回滚、卸载和残留。
- 真实登录/MFA、审批、Browser 站点、双本地用户 named-pipe ACL、IME、DPI 和多屏。

## CI

`.github/workflows/windows-checks.yml` 在 `windows-latest` 执行 Electron 的 typecheck/lint/test、Native Clean、runtime lock 和 Browser client gates。它是 `RUN_PASS` 证据，不是产品验收；正式 runtime vendor、package、签名和安装矩阵必须按 [commands.md](commands.md) 手动或在受控发布 workflow 中执行。

正式发布 workflow 尚未作为公开 CI 的默认路径启用。签名配置或证书缺失时 `electron:make:release` 必须 fail closed；任何未来发布 workflow 都必须删除临时 PFX，并要求人工产品矩阵通过后才能发布 artifact。

## 本机入口

完整命令只维护在 [commands.md](commands.md)。Windows 命令一律以 `C:\Program Files\PowerShell\7\pwsh.exe` 执行。

结果分级：

- `CODE_EXISTS`：代码存在。
- `RUN_PASS`：指定自动化和环境通过。
- `PRODUCT_PASS`：正式签名候选在目标 Windows 产品矩阵通过。

三者不得互相替代。
