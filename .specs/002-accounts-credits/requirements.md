# Requirements

> 迁移状态（2026-07-12）：Supabase 服务端资产与历史代理已迁入
> `blackrain-cloud`；本 spec 保留 2026-06-25 历史验证语境，Desktop 只继续拥有
> 账户/session 客户端和统一的本地 codex 翻译网关。

## 背景

- 本 spec 创建时（2026-06-25），BlackRain 还是无自有账号、无计费的本地 Tauri 壳；后续 M-A1/M-A2 已实现账号骨干和过渡代理，当前状态以 tasks/verification 为准。
- 商业模式定调为「模型广场 token 差价 = 利润发动机（应用内消耗）」，需要账号 + credit 计量才能成立。
- 本 spec 覆盖 M-A 主线：账号体系（注册/登录）、Free/Plus/Pro 三档占位、credit 余额与计量、已验证过渡代理（持平台 DeepSeek key、按真实用量扣 credit）、BYOK 锁在 Plus，以及 Desktop→Cloud→MeiMei API 的生产 credit 接缝。
- 关联 [[001-providers-model-gateway]]：模型选择器、provider registry、网关 sidecar 已就位；Gateway 面向所有 codex 会话，三项目与账本真源服从 [[010-three-project-platform]]。

## 用户目标

- 作为新用户，我可以注册并登录一个 BlackRain 个人账号（Free）。
- 作为 Free 用户，我开箱获赠一笔 credit（暂定 100），可直接选 DeepSeek flash/pro 对话，不必自带任何 key。
- 作为使用者，我能在首页/设置看到当前 plan 和剩余 credit，余额随对话实时扣减。
- 作为 Plus 用户，我可以接入自己的第三方 API key（BYOK），用自己的额度，绕过平台 credit。
- 作为开发者，我希望账号/计费走托管方案（Supabase），不自己运维鉴权和数据库。

## 非目标

- 不做团队版 / 多租户 / 组织管理（仅个人版）。
- 不在本阶段定死 Plus/Pro 的价格与额度（先留占位字段）。
- 不在 Desktop 仓库建设或保存生产云端代理。历史 `proxy.py` 已迁入 Cloud legacy 留档；生产目标已定为私有 BlackRain Cloud 向独立公开 MeiMei API 购买服务，具体 broker/对账仍未实现。
- 不做除 DeepSeek 外的 credit 套餐对接（BYOK 可接任意 OpenAI 兼容，但平台赠送的 credit 只覆盖 DeepSeek）。
- 不改 Codex 内核；不恢复 `wire_api="chat"`。

## 成功标准

- 用户能注册、登录、登出；会话态持久（重开 App 不必重登）。
- 账号带 plan 字段（free/plus/pro，默认 free）与 credit 余额；Free 注册即获赠 credit（暂定 100）。
- credit 计量真实：经 MeiMei API 的对话按真实 usage 进入 Cloud 商业账本；历史倍率 flash 0.5x / pro 1.5x 仅作为待重验基线。
- 余额耗尽时，平台代理拒绝新对话并给出可读提示，不静默失败。
- 平台模型 key 只存在于 MeiMei API 服务端，绝不下发到桌面 App 或 Cloud。
- BYOK 入口仅 Plus 可用；Free 用户看到入口但被引导升级。
- 前端模型选择器展示 flash/pro 两个模型及其倍率（0.5x / 1.5x）。

## 约束

- 后端用 Supabase（Auth + Postgres）；不自建鉴权。
- 已验证过渡代理是「最小 OpenAI 兼容转发 + 计量」；生产接缝改为 Supabase JWT 只向 Cloud 证明身份，Cloud 向 MeiMei API 兑换长期、可撤销、可限额的 model token。Desktop 不把 Supabase JWT 直接当 MeiMei API 常驻凭据。
- credit 计量依赖上游返回的 usage（gateway.py 已能从 DeepSeek 流式响应取 usage）。
- 计费按 token：DeepSeek 输出价 = 输入 2 倍、缓存命中输入更便宜；MVP 用混合单价近似，已知会轻微低估输出/思考重的任务（见 decisions）。
- `apps/desktop/**` 改动遵守双运行时纪律：领域逻辑先落 `src-tauri/src/shared/*`，App 与 Daemon 只做薄适配。
- 平台 key、用户 JWT、用户第三方 key 绝不写入仓库、日志、Codex config 或前端可见存储。

## 开放问题

- [ ] credit 绝对锚定是否沿用当前实现：1 credit = 10,000 个 1x 等效 token；按现倍率，100 credit ≈ 666,667 pro token 或 2,000,000 flash token。正式定价仍待拍板。
- [ ] Plus/Pro 的价格、月度 credit 额度、是否含 BYOK 之外的赠送额。
- [ ] 输入/输出分别计价 还是 混合单价？（MVP 倾向混合，后续精细化）
- [ ] 思考模式（DeepSeek 默认开）产生的 reasoning token 如何计入（算输出价）。
- [x] 生产项目拓扑：Cloud 是 MeiMei API 企业客户；MeiMei API 承担模型中转与原始 usage，Cloud 承担身份、权益和商业 credit ledger；`proxy.py` 不再是目标生产入口。
- [ ] Desktop/Gateway 如何从 Cloud broker 获得、刷新和撤销 MeiMei API token，并为两种 surface 统一商业余额和错误语义。
- [ ] Plus BYOK 是允许直连上游的 new-api 例外，还是仍经平台中转但不扣 credit。
- [ ] 当前 `auth.users after insert` trigger 会在邮箱 OTP 确认前创建 profile/赠送 credit；是否改为确认后赠送。

## 已验证的过渡方案与已定约束（详见 decisions.md）

- 过渡代理形态：独立 `gateway/proxy.py` Chat Completions 常驻服务，已完成真实 Supabase/DeepSeek/HTTPS 验证；它不是最终生产拓扑的定案。
- credit 记账约束：前置门禁（余额>0 才转发）+ 出对话后单事务扣减；单次记账原子，但没有预授权，接受并发在途任务把余额扣到小幅为负。
