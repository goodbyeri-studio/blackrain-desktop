# Design

> 本文描述目标项目边界。仓库存在不等于服务实现、部署或发布可用；真实状态以 [verification.md](verification.md) 为准。

## 总体方案

BlackRain 由 Desktop 和 Cloud 两个私有产品组成，并以企业客户身份接入独立的公开 AGPL 模型中转产品 MeiMei API。各服务内部保持克制：Desktop 是 Windows 胖客户端，Cloud 是私有模块化单体，MeiMei API 独立运营。

```text
blackrain-desktop（private）
  ├─ 本地项目、Workbench Core、Session Orchestrator
  ├─ Workbench surface / CODE surface、codex
  ├─ 统一本地 Responses 翻译网关
  └─ Supabase 登录 / Cloud API client / MeiMei API scoped token
            │
            ├─ 身份、权益、token exchange ──► blackrain-cloud（private）
            │                                    ├─ Supabase Auth/Postgres
            │                                    ├─ 套餐、支付、credit ledger
            │                                    └─ MeiMei API 企业客户/broker/对账
            │
            └─ 模型请求 ─────────────────────► MeiMei API（独立 public AGPL）
                                                 ├─ New API
                                                 ├─ 渠道、路由、模型、token
                                                 └─ usage、限流、批发结算
                                                          │
                                                          ▼
                                              DeepSeek / GLM / Qwen / Kimi ...
```

## 项目边界

| 项目 | 所有权与可见性 | 负责 | 不负责 |
|---|---|---|---|
| `blackrain-desktop` | BlackRain 私有 | 桌面 UI/Core、工作台生命周期、会话编排、双 surface、codex、本地 sidecar、项目文件、系统凭据、云端 API client | service-role、平台模型 key、支付 webhook、MeiMei API 管理面 |
| `blackrain-cloud` | BlackRain 私有 | `supabase/` 真源、账号、套餐、商业 credit ledger、支付、工作台市场、创作者结算、account broker、MeiMei API 对账 | 模型协议翻译、高吞吐内容转发、New API 源码；迁入的历史 proxy 只留档 |
| MeiMei API（`goodbyeri-studio/meimei-api`） | 独立公开 AGPL 产品 | 模型渠道、协议中转、token、模型限制、usage、限流、渠道成本、独立客户和开放 API | BlackRain 品牌、工作台业务、Desktop 用户项目、Cloud 商业账本 |

## 控制面与数据面

```text
控制面：Desktop -> Supabase/Cloud -> 身份与权益 -> MeiMei API 管理 API -> scoped model token
数据面：Desktop -> 本地翻译网关 -> MeiMei API
计量面：MeiMei API usage -> 版本化事件/对账 API -> Cloud 幂等 credit ledger
```

- Cloud 是 MeiMei API 的企业客户，不与 MeiMei API 共享数据库。
- MeiMei API 可同时服务 BlackRain 和第三方客户；BlackRain 用户身份不直接成为 MeiMei API 的全功能运营账号。
- Cloud 不代理模型内容，避免把账号后台变成吞吐和隐私单点。
- MeiMei API token 必须携带或映射稳定外部主体、模型白名单、额度、过期和撤销状态。

## License 边界

- MeiMei API 可以公开 fork/修改 New API，并按 AGPLv3 提供对应网络服务源码、保留署名与原项目链接。
- Desktop/Cloud 不复制、链接或派生 New API 源码，只调用其 HTTP/API 合同，因此保持私有；正式上线前仍需法律复核实际组合方式。
- MeiMei API 的开源义务不包含数据库内容、API key、环境变量、部署 secret、用户数据或运营数据。

## 失败模式

- Cloud 不可用：已签发且未过期的 MeiMei API token 是否继续可用，必须由后续 broker 合同明确。
- MeiMei API 不可用：Desktop 展示模型服务不可用，本地文件和不依赖模型的能力不应被破坏。
- usage 迟到/重复：Cloud 以 MeiMei API request/usage id 幂等记账，并提供日终对账与人工差错处理。
- 余额漂移：Supabase 商业账本与 MeiMei API 执行额度职责分开，不允许两边都自称用户最终余额真源。
- License 漂移：MeiMei API 升级 New API 前复核 LICENSE、Section 7、依赖和公开源码路径。

## 测试策略

- 仓库层：名称、可见性、远端 URL、默认分支和 License 静态核对。
- 合同层：JWT exchange、token 签发/撤销、model allowlist、usage webhook 幂等与对账。
- 数据面：Desktop Responses 经本地翻译网关进入 MeiMei API 并完成计量。
- 发布层：Cloud/MeiMei API 独立部署、备份、恢复、密钥轮换和故障降级。
