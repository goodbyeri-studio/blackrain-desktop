# Requirements

> **事实状态纪律**：跨产品边界是产品与仓库决策，不自动证明 Cloud、MeiMei API、账号 broker、计费对账或生产部署已经实现。

## 背景

- BlackRain 是桌面端 SaaS：专业工作环境主要在用户 Windows 电脑运行，账号、权益、模型额度和持续运营依赖云端。
- 模型中转站将作为可独立经营的第二产品，而不是只藏在 Desktop 或 Cloud 仓库里的内部组件。
- 历史单仓曾同时包含桌面代码、Supabase 服务端资产和 `proxy.py`；2026-07-12 已按冻结边界完成仓库迁移。

## 用户目标

- 作为 BlackRain 团队，希望独立运营桌面产品和私有 SaaS 后台，并以企业客户身份购买公开模型中转服务。
- `blackrain-desktop` 与 `blackrain-cloud` 保持私有和 BlackRain 品牌完整；`MeiMei API`（`goodbyeri-studio/meimei-api`）是完全独立的公开产品，基于 New API 按 AGPLv3 合规运营并可服务第三方。
- 小团队保持清晰的产品/仓库边界，不把 Cloud 或 MeiMei API 过早拆成大量微服务。

## 非目标

- 本次资产迁移不实现 Cloud API、支付、model token broker、New API fork、生产数据迁移或双账本对账。
- Desktop 的客户端账号代码、Supabase SDK、session 与系统钥匙串不迁出。
- 本轮不决定 Plus BYOK 是否绕过 MeiMei API，也不因 New API 宣称支持 Responses 就删除 CODE 本地翻译网关。

## 成功标准

- 三个 GitHub 仓库存在且可见性正确：Desktop/Cloud 私有，MeiMei API 公开。
- Desktop 仓库与文档使用 `goodbyeri-studio/blackrain-desktop` 作为规范仓库名。
- 文档明确控制面、模型数据面、账本、数据库、密钥和 License 的归属。
- AGPL 例外只适用于独立公开的 MeiMei API；AGPL 源码不得进入 Desktop/Cloud 私有仓库。
- 未实现的 Cloud/MeiMei API 能力继续标成目标或待验证，不把仓库创建写成服务可用。
- Supabase 服务端资产只存在于 Cloud；Desktop 不再包含 migration、`service_role` RPC 部署资产或历史代理服务代码。

## 约束

- Desktop、Cloud、MeiMei API 独立仓库、独立部署、独立数据库、独立密钥域，通过版本化 API/Webhook 交互。
- Supabase 是 BlackRain 身份、套餐和商业 credit ledger 真源；MeiMei API 保存原始模型 usage、渠道成本和批发结算记录。
- Desktop 只持可撤销、可限额的 MeiMei API token，不持平台模型厂商 key 或 MeiMei API 管理凭据。
- MeiMei API 遵守 New API AGPLv3、Section 7 署名/原项目链接和网络源码提供义务；用户数据、密钥、运行配置和运营数据不因开源源码而公开。
- Cloud 首版采用模块化单体；MeiMei API 首版优先复用原装 New API，避免为“微服务”增加分布式事务。

## 开放问题

- [ ] BlackRain Cloud 向 MeiMei API 购买总额度后如何签发 per-user sub-token，及撤销/过期合同。
- [ ] usage webhook、轮询对账、幂等键、迟到事件、退款与差错补偿合同。
- [ ] Plus BYOK 是否直连模型厂商、仍经 MeiMei API 但不扣 BlackRain credit，或形成另一套餐。
- [ ] New API Responses 是否通过 codex app-server 的完整 SSE/工具调用协议探针。
