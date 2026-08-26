# BlackRain Desktop 应用

此目录是开源 Codex Desktop 的 Electron 产品应用。它以原装 `codex app-server` / `codex-rs` 作为唯一 agent runtime；Electron 负责桌面宿主与 Browser。

macOS 是当前发布目标。现存面向 Windows 的打包脚本是历史迁移状态，不是 macOS 发行路径。

```sh
npm ci
npm run electron:start
npm run typecheck
npm run test
npm run lint
npm run check:host-boundary
```

修改前阅读仓库根 [README](../../README.md)、[架构](../../docs/architecture.md)、[Browser 合同](../../docs/browser.md)和[开发文档](../../docs/development.md)。
