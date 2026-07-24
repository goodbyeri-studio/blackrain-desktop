# Decisions

> 决策记录不自动证明仓库、服务、部署或商业闭环已完成。

## 2026-07-12：BlackRain 采用三项目独立运营

- 决策：平台由 `blackrain-desktop`、`blackrain-cloud`、`blackrain-relay` 三个独立仓库/产品组成。Desktop/Cloud 私有，Relay 公开。
- 原因：三个产品有不同的信任边界、密钥权限、发布节奏、故障域、许可证和独立商业价值；Relay 需要服务 BlackRain 之外的客户。
- 替代方案：继续单仓；只拆 Desktop/Cloud 两仓；按每个微服务拆仓。
- 影响范围：仓库命名、文档真源、账号/计费、模型路由、License、部署和运营。
- 后续复查条件：团队扩大后可以继续拆部署单元，但不以仓库数量冒充微服务成熟度。

## 2026-07-12：Cloud 是 Relay 的企业客户

- 决策：Cloud 使用企业/service account 从 Relay 购买能力，为 BlackRain 用户兑换受限 model token；模型数据面不经过 Cloud。
- 原因：Relay 可以独立运营，Cloud 不成为模型吞吐单点，Desktop 也不获得 Relay 管理凭据。
- 替代方案：Relay 直接识别 Supabase JWT；Cloud 代理每个模型请求；共享数据库。
- 影响范围：account broker、token lifecycle、usage 对账、错误语义和隐私边界。
- 后续复查条件：冻结 token/usage API 后，以真实 CODE 长任务验证刷新、撤销和离线行为。

## 2026-07-12：Supabase 与 Relay 分别拥有商业账本和执行账本

- 决策：Supabase 是 BlackRain 套餐、充值、赠送、消费、退款和创作者收益的商业真源；Relay 保存原始 usage、渠道成本、执行额度和批发结算。两者通过幂等 API/Webhook 对账。
- 原因：New API quota 不能表达 BlackRain 全部商业事件；Supabase 也不应承担高吞吐模型路由和 token 限流。
- 替代方案：双边都维护最终余额；Relay 直接写 Supabase 表；Cloud 直接写 Relay 数据库。
- 影响范围：credit ledger、request id、迟到/重复事件、退款、报表和人工差错处理。
- 后续复查条件：对账合同需在 Cloud/Relay 实现前另行冻结字段和补偿事务。

## 2026-07-12：Relay 采用公开 AGPL New API 路线

- 决策：`blackrain-relay` 可以基于 New API 公开 fork/运营，遵守 AGPLv3、Section 7 署名/原项目链接和网络源码提供义务。AGPL 源码不得进入私有 Desktop/Cloud。
- 原因：Relay 自身就是独立公开产品，AGPL 不是商业运营阻塞；隔离后 BlackRain 核心产品仍通过 HTTP API 使用服务并保持私有。
- 替代方案：只部署不修改官方镜像；购买商业许可；用 Apache/MIT 网关自研商业层。
- 影响范围：组织 License 规则、仓库可见性、源码发布、NOTICE、品牌和升级流程。
- 后续复查条件：每次上游 License 变化或跨仓共享代码前复核；正式上线前完成法律意见。

## 2026-07-12：三个仓库不等于过早微服务化

- 决策：Cloud 首版采用模块化单体；Relay 首版围绕一个 New API 部署和必要适配运行。只有独立扩容、故障隔离或团队所有权出现真实需求时才拆服务。
- 原因：小团队需要清晰产品边界，但不需要分布式事务、服务发现和多套运维负担。
- 替代方案：账号、计费、broker、admin、webhook 各自拆服务。
- 影响范围：Cloud/Relay 初始目录、部署和数据一致性策略。
- 后续复查条件：容量、SLA、合规或团队规模出现可量化瓶颈。

## 2026-07-12：Supabase 真源与历史代理迁入 Cloud

- 决策：Desktop 的 `supabase/` 受控资产迁入 Cloud 正式路径；历史 proxy 及其 credit 计算、测试和镜像文件迁入 Cloud `legacy/credit-proxy/`，Desktop 删除对应服务端文件。
- 原因：Desktop 可以使用 Supabase 登录和 Cloud API，但不能拥有 migration、`service_role` 账本合同或云端代理部署资产。
- 替代方案：两仓复制；立即删除历史代理证据；继续从 Desktop 部署代理。
- 影响范围：仓库真源、文档、验证命令和后续 Cloud/Relay 接口接线。
- 后续复查条件：正式 Cloud/Relay API 覆盖历史行为后，单独决定是否删除 Cloud legacy 留档。

## 被推翻的方案

### 2026-07-12：New API 只是 BlackRain Cloud 的内部基础设施

- 原方案：在 Cloud 内部部署 New API，不把中转站作为独立产品。
- 为什么推翻：用户明确要独立经营中转站并服务第三方；其许可证、账本和商业模型也与 BlackRain SaaS 不同。
- 替代方案：公开 `blackrain-relay` 独立运营，Cloud 作为企业客户接入。
