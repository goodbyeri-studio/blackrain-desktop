# ADR 0004：AGPL 与商业双授权

- 状态：已接受
- 日期：2026-08-25
- 范围：BlackRain 自有源码、文档和由维护者拥有版权的发行代码
- 所有者：goodbyeri-studio / BlackRain 维护者
- 依赖：根目录 `LICENSE`、`NOTICE`、`COMMERCIAL-LICENSE.md`、贡献流程
- 验证边界：许可证文件、包元数据、公开文档和第三方清单保持一致；不构成法律意见或商业合同

## 背景

BlackRain 需要让修改版和网络服务版能够回馈源码，同时保留维护者向不能接受 copyleft 条件的专有产品提供商业授权的可能。单独使用 MIT 无法要求衍生发行履行源码共享义务；将一个仓库写成“禁止商业使用”的自定义条款又不再是通常意义上的开源许可证。

## 决策

1. BlackRain 自有代码从本次变更起采用 `AGPL-3.0-only`。
2. 维护者可以对其拥有版权或已取得再许可权的部分另行签署商业授权，使专有产品在合同范围内闭源使用。
3. AGPL 仍允许遵守 AGPL 条件的商业使用；商业授权不是所有商业使用的强制前置条件，也不覆盖 `NOTICE` 中的第三方代码、运行时或资源。
4. 新贡献默认只按 AGPL 提供。贡献者若要允许维护者将其贡献纳入闭源商业授权，必须在合并前另行签署书面贡献者许可协议或版权转让文件。
5. 历史 MIT 版本已经授予的权利不能被本次变更追溯撤销；本决策只适用于变更后的版本和之后的贡献。

## 影响

- 修改并分发 BlackRain，或以网络服务形式运行修改版时，使用者需要遵守 AGPL 的相应源码和通知义务。
- 任何人都可以在 AGPL 条件下商业使用；维护者不能仅凭 README 宣称所有商业使用都必须购买授权。
- 专有集成方需要审查 BlackRain 与第三方组件的组合边界，并单独谈判商业合同、支持范围和责任条款。
- 许可证变更不会自动改变上游 CodexMonitor、OpenAI Codex runtime 或其他依赖的许可证。

## 验证

- 根目录 `LICENSE` 为完整 AGPL-3.0 文本，`apps/desktop/package.json` 的 `license` 字段为 `AGPL-3.0-only`。
- `README.md`、`NOTICE`、`CONTRIBUTING.md`、`docs/project-scope.md` 和 `COMMERCIAL-LICENSE.md` 均链接到正确的许可证与第三方边界说明。
- `node scripts/check-doc-links.mjs` 和 `git diff --check` 通过。
