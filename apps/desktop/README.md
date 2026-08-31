# BlackRain Desktop 应用

此目录是开源 Codex Desktop 的 Electron 产品应用。原装 `codex app-server` / `codex-rs` 是唯一 agent runtime；Electron 负责桌面宿主与 Browser。

所有开发命令从本目录执行：

```sh
npm ci
npm run electron:start
```

本文件只是入口指引，不复述规则或命令清单：

- 架构铁律与产品边界：仓库根 [AGENTS.md](../../AGENTS.md)
- 完整命令、验证链与发布边界：[开发与发布](../../docs/development.md)
- 进程与所有权：[架构](../../docs/architecture.md)
- Browser 合同：[Browser 与 Computer Use](../../docs/browser.md)
- 领域索引：[代码地图](docs/codebase-map.md)
