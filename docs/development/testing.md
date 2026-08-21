# 测试指南

最小检查在 `apps/desktop/` 执行：

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run lint
npm.cmd run check:host-boundary
```

修改 Markdown 后，从仓库根目录运行：

```powershell
node scripts/check-doc-links.mjs
```

涉及打包或运行时锁时，再执行：

```powershell
npm.cmd run electron:runtime:verify
npm.cmd run electron:node-runtime:verify
npm.cmd run electron:browser-client:verify
npm.cmd run electron:app-server:probe
npm.cmd run electron:package
npm.cmd run electron:package:audit
npm.cmd run electron:smoke
npm.cmd run electron:e2e
```

测试报告应写明操作系统、Node/npm 版本、commit、命令和未运行项目。合成 fixture 不等于真实登录、MFA、安装或升级验收。
