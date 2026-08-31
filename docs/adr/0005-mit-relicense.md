# ADR 0005：回到 MIT

- 状态：已接受
- 日期：2026-08-31
- 范围：BlackRain 自有源码、文档和由维护者拥有版权的发行代码
- 所有者：goodbyeri-studio / BlackRain 维护者
- 依赖：根目录 `LICENSE`、`NOTICE`、贡献流程；取代 [ADR 0004](0004-agpl-dual-licensing.md)
- 验证边界：许可证文件、包元数据、公开文档和第三方清单保持一致；不构成法律意见或商业合同

## 背景

许可证历史是 MIT → AGPL-3.0-only（[ADR 0004](0004-agpl-dual-licensing.md)，2026-08-25）→ MIT（本决策）。AGPL 期间只有 6 天，没有第三方在该期间贡献代码。

ADR 0004 的目标是让修改版和网络服务版回馈源码。实践中这个选择与项目的实际定位不符：

1. **BlackRain 的定位是向开源社区贡献的项目。** 同类开源 agent 项目（[opencode](https://github.com/sst/opencode)、[Hermes Agent](https://github.com/NousResearch/hermes-agent)）普遍采用 MIT；宽松许可证是这个领域的社区预期。
2. **AGPL 的成本落在采用率上。** 部分企业用户从合规角度直接排除 AGPL 依赖；贡献者也要面对额外的许可判断。对一个需要社区规模的项目，这个摩擦大于 copyleft 带来的保护。
3. **双授权在 MIT 下不再是一个需要的概念。** MIT 本身允许闭源集成，“购买授权以豁免 copyleft”这件事失去对象。继续保留 `COMMERCIAL-LICENSE.md` 只会让用户误以为存在额外限制。
4. **copyleft 保护的对象与本仓的实际构成不匹配。** BlackRain 不拥有 agent 内核（`codex-rs` 是 Apache-2.0 上游），也不拥有模型。对一层薄外壳施加 copyleft，收益与摩擦不成比例。

## 决策

1. BlackRain 自有代码从本次变更起采用 `MIT`。
2. 删除 `COMMERCIAL-LICENSE.md`。MIT 已允许闭源商业集成，不需要单独的商业授权文件；原文件承载的联系方式与赞赏说明并入 `README.md` 的「联系与支持」。
3. 不引入 CLA 或版权转让要求。贡献默认按 MIT 提供。
4. 第三方组件不受影响：CodexMonitor 保持 MIT 归属，`codex app-server` 保持 Apache-2.0 且不被本仓重新授权，其余依赖各自许可证不变。
5. AGPL 期间（2026-08-25 至 2026-08-31）已分发版本按当时的 AGPL-3.0-only 授予的权利继续有效；本决策不追溯撤销，也不追溯施加。

## 影响

- 任何人可以在 MIT 条件下使用、修改、闭源分发 BlackRain，只需保留版权与许可证声明。
- 网络服务场景不再产生源码提供义务。本仓之外的服务端实现不再受 AGPL §13 约束，其许可证可以独立决定，与本仓解耦。
- 引入 GPL/AGPL/BSL 依赖的后果比 AGPL 时期更严重：MIT 发行物一旦混入 copyleft 依赖，整个发行边界都要重新评估。`.github/pull_request_template.md` 的相应检查项保留且更重要。
- 贡献流程简化：无 CLA、无版权转让、无“贡献是否纳入商业授权”的判断。

## 验证

- 根目录 `LICENSE` 为 MIT 全文；`apps/desktop/package.json` 与 `package-lock.json` 的 `license` 字段为 `MIT`。
- `README.md`（badge + 许可证节）、`NOTICE`、`CONTRIBUTING.md`、`AGENTS.md`、`docs/upstream.md` 与 `CLAUDE.md` 不再声明 AGPL 或商业授权。
- `COMMERCIAL-LICENSE.md` 已删除，且无文档仍链接它。
- 依赖许可证扫描：678 MIT / 53 ISC / 25 Apache-2.0 / 17 BSD-2-Clause / 11 BSD-3-Clause / 2 MPL-2.0 / 其他宽松许可；**零 GPL/AGPL/LGPL/BSL/SSPL**。
- 版权归属核对：`git log` 全部 commit 作者均为维护者本人（两个 git 身份），无外部贡献者，因此重新许可无需第三方同意。
- `node scripts/check-doc-links.mjs`、`npm run typecheck`、`npm run test`、`npm run lint`、`npm run check:host-boundary` 通过。
