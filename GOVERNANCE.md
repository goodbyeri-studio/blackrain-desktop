# 项目治理

BlackRain Desktop 由维护者团队负责代码合并、发布和安全响应，社区贡献通过公开 issue、discussion 和 Pull Request 参与。

## 决策原则

1. 优先保证一个可恢复、可审计的 Codex-first 桌面工作流。
2. 只保留一个 agent runtime、一个 thread/event 真源和一个生产 Browser backend。
3. 优先公开协议、可验证行为和可替换适配器，不复制闭源实现或专有资源。
4. 用真实验证证据区分代码存在、运行通过、可移植通过和 Windows 发布就绪。

## 变更流程

- 小型 bug 修复和文档改动走普通 PR。
- 产品范围、公共 Browser contract、许可证、数据边界或发布平台变化，必须先写决策记录并同步 living spec。
- `main` 只接受通过 review 和 CI 的 PR，使用 Squash merge。
- 维护者可以拒绝超出项目范围、违反许可证或无法验证安全边界的改动。

## 版本与发布

版本、锁定的 Codex runtime、Windows 制品和发布说明必须来自可复现的 CI/本地命令。正式签名、安装升级回滚和卸载矩阵通过前，不发布“稳定版”或作出产品可用承诺。
