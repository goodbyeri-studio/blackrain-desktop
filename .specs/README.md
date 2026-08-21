# BlackRain Living Specs

当前维护两个边界不同的业务 spec：

- [002 Electron 全量迁移](002-electron-migration/)：BlackRain 产品交付 P0，包含 Tauri 能力迁移、旧宿主删除、产品 Browser 回归和 Windows Electron 发布验收。
- [003 可移植 Electron Browser Runtime](003-portable-electron-browser-runtime/)：面向其他 Electron 编程/桌面 Agent 二次开发的源码底座，包含核心去耦、宿主/Agent 适配合同、最小参考宿主和可移植性验证。

`002-electron-migration/migration-ledger.md` 是该 spec 的辅助能力账本；它必须覆盖每个 Tauri command、renderer direct import、兼容入口和删除证明，但不构成完成状态本身。

Gateway、账号、插件、GUI、Windows Tauri、工作台和平台编排的旧 spec 已从当前树删除；历史内容仍可从 Git 读取，但不构成当前路线图。`003` 不是插件市场或第二 Agent runtime 的恢复。

## 规则

1. 可以并行维护多个业务 spec，但交付物、代码所有权、依赖关系和验证边界必须互斥且写明。
2. `002` 的 Windows 产品发布状态与 `003` 的源码可移植状态分别验收，任何一方通过都不能替代另一方。
3. 同时改变 BlackRain 产品行为和 Browser Runtime 公共合同的改动必须同步两个 spec。
4. `tasks.md` 只放未完成任务；完成事实写入对应 `verification.md`。
5. 每个业务 spec 必须保留 requirements/design/tasks/decisions/verification 五个主文件；逐项迁移需要时可增加 machine-readable ledger 等辅助文件，但辅助文件不替代任务或验证状态。
6. 新增 spec 前先更新产品和架构真源；完成、取消、合并或拆分 spec 时在 `decisions.md` 记录关系。
