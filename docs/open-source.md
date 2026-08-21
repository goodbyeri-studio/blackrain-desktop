# 开源项目说明

本文是 BlackRain Desktop 从内部产品仓库转向公开开源项目后的范围与发布边界说明。它和 [README](../README.md) 负责对外表达；具体实现状态仍以代码和对应 living spec 的验证记录为准。

## 项目定位

BlackRain Desktop 是一个开源的 Codex App 类 Electron 客户端，也是面向二次开发者的 Agent 客户端底座：

```text
OpenAI codex-rs / app-server
          + Electron 宿主能力
          + Codex App 行为对齐
          + 可审计的 Browser / 权限边界
          = BlackRain Desktop
```

我们不重新实现 agent loop，也不把多个 agent runtime 拼成平台。核心价值是把上游开源内核接到一个完整的桌面工作流中，并持续跟随公开的 Codex App 能力变化。

## 我们承诺什么

- 代码、协议适配和宿主边界尽量保持可读、可测试、可替换。
- 以公开文档和合法可观察行为建立 Codex App 能力矩阵。
- 维护单一 thread/event 真源、单一 agent runtime 和单一生产 Browser backend。
- 对 Windows 发布、Browser、权限、凭据和恢复给出具体验证证据。
- 在引入第三方代码、依赖、字体、图标和 runtime 时保留来源、版本、License 和 NOTICE。

## 我们不承诺什么

- 不复制、反编译或重新分发官方 Codex App 的闭源实现和专有资源。
- 不承诺当前版本已经完成正式签名、安装升级回滚、真实站点/MFA 或所有 Windows 设备矩阵。
- 不承诺账号后端、模型服务、云端托管、商业 SLA 或任意 provider 的可用性。
- 不承诺 Browser Runtime 当前已经是独立 npm 包或跨 revision 稳定 API；`apps/desktop` 的 `private` 标记用于阻止误发布 npm 包，不影响源码许可证。
- 不把实验性工作台、插件、Office 或 OPC 资产写成当前产品主线。

## 能力状态

| 层级 | 当前结论 |
|---|---|
| Electron native-clean 代码态 | 已存在，迁移和边界扫描有 `RUN_PASS` 证据 |
| App Server stdio 与 Browser 基础链路 | 已有实现、探针和自动化回归 |
| Browser 源码底座可移植性 | 仍按 `.specs/003-portable-electron-browser-runtime/` 收敛，不能用产品 E2E 替代 |
| Windows 正式发布 | 未完成签名、安装/升级/回滚/卸载和完整实机矩阵 |
| 公开仓库发布 | 需先完成 Git 历史、第三方资产和仓库设置审计 |

状态标签的含义见 [文档地图](README.md)。`CODE_EXISTS`、`RUN_PASS`、`PORTABILITY_PASS` 和 `PRODUCT_PASS` 不能互相替代。

## 许可证

BlackRain 自有代码按仓库根目录 MIT License 发布。`apps/desktop/` 中起源于 CodexMonitor 的代码继续保留上游 MIT 归属；锁定的 OpenAI Codex runtime 使用 Apache-2.0，并按其自身 License/NOTICE 分发。完整归属见 [NOTICE](../NOTICE)。

这份许可证只授予可以合法再分发的代码和资产。历史商业文件、生成的用户数据、签名材料、账号服务配置和未确认来源的资源不属于公开发行物。

## 依赖安全状态

2026-08-21 在 Node.js `22.23.1`、npm lockfile v3 上执行了 `npm audit`：生产依赖报告 2 个 low 级 `diff` advisory；完整开发/打包依赖还包含 Electron Forge 7 生态的 high 级 advisory。自动修复会建议跨主版本降级 Forge，未经过 Electron/MSIX 回归前不能直接采用。

这意味着当前仓库可以作为源码审阅和开发基线，但不能把依赖审计写成“零漏洞”或把它当成正式发布就绪。公开首版前应升级到兼容的 Forge/diff 修复版本，重跑 lockfile、typecheck、test、package、签名和 Windows 安装矩阵，并在 release notes 中记录结果。

## 发布闸门

真正切换 GitHub 仓库可见性前，维护者必须完成：

1. 用干净临时 clone 扫描整个 Git 历史，确认没有密钥、Cookie、客户数据、私有 URL、未授权二进制或不应公开的文档。
2. 对历史上已经删除的 Tauri/服务端/Office 资产做许可证与隐私审计；必要时重写历史或从新建公开镜像发布。
3. 重新生成并审查第三方 License/NOTICE 清单，确认每个 vendored runtime 都有可追溯来源和 hash。
4. 在 GitHub 启用 Issues、Discussions、Private Vulnerability Reporting、分支保护和 CI required checks。
5. 发布第一版前，在干净环境复现安装、测试、打包和文档中的最小开发流程。

本次代码改动只建立开源基线，不自动替维护者执行历史重写或 GitHub 可见性切换。

公开发布前，维护者必须完成历史、许可证、第三方资产、仓库设置和首版 Windows 发布矩阵审计；公开后仍需持续维护这些门禁。
