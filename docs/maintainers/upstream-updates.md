# 上游更新清单

## 更新前

- 记录当前和目标 Codex commit/tag、runtime lock、Node/Electron 版本和回退点。
- 阅读 app-server protocol、配置、schema、helper 和许可证变化。
- 确认更新不会引入第二 agent runtime、未审查二进制或新的网页特权。

## 更新后

- 更新 runtime lock、必需文件 hash、License/NOTICE 和公开参考文档。
- 运行 `electron:runtime:verify`、`electron:node-runtime:verify`、`electron:browser-client:verify` 和 `electron:app-server:probe`。
- 运行 typecheck、test、lint、host boundary、package、smoke；受影响时补 E2E 和 Windows 安装矩阵。
- 在 Pull Request 中记录精确命令、环境、制品 hash、失败边界和未验证项。

协议或公共 Browser 合同变化时，同时更新 `docs/architecture/`、`docs/design/` 和对应 fixture；不要用旧版本观察结果声称当前版本已支持。
