# Requirements

## 背景

- BlackRain2049 当前是纯本地 Tauri 壳：无账号、无后端、无计费。模型走 BYOK（用户自带 key，存系统钥匙串）经本地网关驱动 Codex 内核。
- 商业模式定调为「模型广场 token 差价 = 利润发动机（应用内消耗）」，需要账号 + credit 计量才能成立。
- 本 spec 覆盖 M-A 主线：账号体系（注册/登录）、Free/Plus/Pro 三档占位、credit 余额与计量、最小服务端代理（持平台 DeepSeek key、按真实用量扣 credit）、BYOK 锁在 Plus。
- 关联 [[001-providers-model-gateway]]：模型选择器、provider registry、网关 sidecar 已就位，本 spec 在其上加账号/计费层。

## 用户目标

- 作为新用户，我可以注册并登录一个 BlackRain 个人账号（Free）。
- 作为 Free 用户，我开箱获赠一笔 credit（暂定 100），可直接选 DeepSeek flash/pro 对话，不必自带任何 key。
- 作为使用者，我能在首页/设置看到当前 plan 和剩余 credit，余额随对话实时扣减。
- 作为 Plus 用户，我可以接入自己的第三方 API key（BYOK），用自己的额度，绕过平台 credit。
- 作为开发者，我希望账号/计费走托管方案（Supabase），不自己运维鉴权和数据库。

## 非目标

- 不做团队版 / 多租户 / 组织管理（仅个人版）。
- 不在本阶段定死 Plus/Pro 的价格与额度（先留占位字段）。
- 不在本阶段搭建完整中转站（new-api）；只做能对外的「最小服务端代理」，接缝预留以后迁移。
- 不做除 DeepSeek 外的 credit 套餐对接（BYOK 可接任意 OpenAI 兼容，但平台赠送的 credit 只覆盖 DeepSeek）。
- 不改 Codex 内核；不恢复 `wire_api="chat"`。

## 成功标准

- 用户能注册、登录、登出；会话态持久（重开 App 不必重登）。
- 账号带 plan 字段（free/plus/pro，默认 free）与 credit 余额；Free 注册即获赠 credit（暂定 100）。
- credit 计量真实：经平台代理的对话，按 DeepSeek 真实 token 用量 × 模型倍率扣 credit；倍率 flash 0.5x / pro 1.5x（比值 = DeepSeek 真实成本比 3:1）。
- 余额耗尽时，平台代理拒绝新对话并给出可读提示，不静默失败。
- 平台 DeepSeek key 只存在于服务端代理，绝不下发到桌面 App。
- BYOK 入口仅 Plus 可用；Free 用户看到入口但被引导升级。
- 前端模型选择器展示 flash/pro 两个模型及其倍率（0.5x / 1.5x）。

## 约束

- 后端用 Supabase（Auth + Postgres）；不自建鉴权。
- 平台代理是「最小 OpenAI 兼容转发 + 计量」，对外可用；以后替换为 new-api，须保留稳定接缝（base_url + 鉴权约定不变）。
- credit 计量依赖上游返回的 usage（gateway.py 已能从 DeepSeek 流式响应取 usage）。
- 计费按 token：DeepSeek 输出价 = 输入 2 倍、缓存命中输入更便宜；MVP 用混合单价近似，已知会轻微低估输出/思考重的任务（见 decisions）。
- `apps/desktop/**` 改动遵守双运行时纪律：领域逻辑先落 `src-tauri/src/shared/*`，App 与 Daemon 只做薄适配。
- 平台 key、用户 JWT、用户第三方 key 绝不写入仓库、日志、Codex config 或前端可见存储。

## 开放问题

- [ ] credit 绝对锚定：1 credit = 多少 token？（暂定「100 credit ≈ 1M pro-等效 token」，即 1 credit ≈ 1万 pro-等效 token；待定价定稿）
- [ ] Plus/Pro 的价格、月度 credit 额度、是否含 BYOK 之外的赠送额。
- [ ] 输入/输出分别计价 还是 混合单价？（MVP 倾向混合，后续精细化）
- [ ] 思考模式（DeepSeek 默认开）产生的 reasoning token 如何计入（算输出价）。

## 已定案（原开放问题，详见 decisions.md）

- 最小代理形态：复用 `gateway.py` 部署成常驻服务（不重写为 Edge Function）。
- credit 实时性：强一致——前置门禁（余额>0 才转发）+ 出对话后原子扣减；接受并发在途任务把余额扣到小幅为负，下次充值补齐。
