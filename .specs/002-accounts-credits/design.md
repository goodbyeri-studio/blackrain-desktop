# Design

> 迁移状态（2026-07-12）：本文中的 `gateway/proxy.py` 是历史路径；对应代码现位于
> `blackrain-cloud/legacy/credit-proxy/`。Desktop 不再承载该服务端实现。

## 总体方案

在现有本地壳之上加一层**账号 + credit 计量**。2026-06-25 已真实验证的是 CODE surface 的过渡链路；目标架构中两种 surface 共用同一 Gateway 和计量合同。生产项目边界现已定为私有 Cloud 负责身份/权益/商业账本，公开 MeiMei API 基于 New API 负责模型中转与原始 usage，执行真源见 [010](../010-three-project-platform/)。

- **credit 过渡实现（仅 CODE surface 已验证）**：Codex → 本地翻译网关 → `proxy.py` → DeepSeek；代理持平台 key 并按真实 usage 扣 credit。
- **BYOK（仅 Plus+，尚未实现）**：目标是不消耗平台 credit；直连上游还是仍经 new-api，尚待决策。

账号、plan、credit 余额由 **Supabase（Auth + Postgres）** 管理，桌面 App 通过 Supabase JS SDK 登录、读余额；当前过渡代理用 Supabase service-role 校验 JWT、扣余额。

```text
注册/登录:       桌面 App --Supabase SDK--> Supabase Auth (邮箱+密码+OTP)
credit(仅 CODE surface 已验): Codex -> 本地网关(Responses⇄Chat) -> proxy.py(过渡) -> DeepSeek
BYOK(待实现):     Plus+ 权益门禁 + 路由待定；不消耗平台 credit
余额展示:         桌面 --Supabase SDK--> profiles.credits
```

## 架构边界

- 属于 `apps/desktop`（前端）：登录/注册 UI、会话态持久、首页/设置展示 plan 与 credit、模型选择器显示倍率、BYOK 入口的 Plus 门禁。
- 属于 `apps/desktop`（Tauri 后端）：Supabase 会话 token 的安全存取（钥匙串）、把「当前模式（credit/BYOK）」翻译成网关 provider 配置。
- 属于**历史过渡代理**（现归档于 `blackrain-cloud/legacy/credit-proxy/`）：历史 CODE 可行性链路；不再作为目标生产入口。
- 属于 **BlackRain Cloud `supabase/`**：用户认证、`profiles`（plan + credits）、`credit_ledger`（流水）、RLS 策略与 migration 真源。
- 属于 **BlackRain Cloud**：验证 Supabase 身份、套餐/权益、商业 credit ledger、MeiMei API 企业客户凭据、model token broker 和对账。
- 属于 **MeiMei API**：New API 模型渠道、路由、scoped token、原始 usage、限流与批发结算；不直接写 Supabase。
- 明确不改 `codex-upstream`：内核只发 Responses，仍只连本地网关。
- 与 MeiMei API 的接缝目标：桌面侧保持 `base_url + Bearer <model token>`；Supabase JWT 只用于 Cloud 身份兑换。Cloud/MeiMei API 独立数据库，通过版本化管理 API 和 usage 对账事件交互。

## 关键判断：平台 key 必须只在服务端

credit 用户花的是平台的钱，平台模型 key **绝不能**打包进桌面 App（会被扒包白嫖）。因此 credit 数据面必须经过 MeiMei API；Cloud 只负责身份、权益、broker 和商业账本，不代理模型内容。

- 当前 CODE 过渡实现中，本地网关把 `base_url` 指向 `proxy.py`，`Authorization` 带用户 Supabase JWT（不是 DeepSeek key）。
- 过渡代理用 JWT 认出用户 → 查余额 → 转发到真实 DeepSeek（注入平台 key）→ 读 usage → 扣 credit。
- Plus BYOK 的最终路由尚未实现，不在本文静默假定。

## Credit 模型

- 面向用户的唯一单位是 **credit**。每个模型有「每 token 扣多少 credit」的费率，费率比值由 DeepSeek 真实价钉死。
- DeepSeek 实测：pro 输入/输出均为 flash 的 **3 倍**（输入 1→3 元、输出 2→6 元 / 1M，缓存未命中）。故倍率 **flash 0.5x / pro 1.5x**（比值 3:1）成立。
- 当前实现锚定：**1 credit = 10,000 个 1x 等效 token**，即 `cost = tokens × multiplier / 10000`。换算：
  - pro：1.5x → 1 credit ≈ 6,667 pro token；100 credit ≈ 666,667 pro token
  - flash：0.5x → 1 credit = 20,000 flash token；100 credit = 2,000,000 flash token
- 上述绝对数都是**占位**，正式定价时在代理配置/Supabase 里集中改，不散落代码。
- MVP 用「混合单价」（输入+输出按一个等效价），已知会轻微低估输出/思考重的任务；后续可拆输入/输出分计（见 decisions 待定项）。

## 数据模型（Supabase Postgres）

```sql
-- profiles：与 auth.users 一对一
profiles (
  id uuid pk references auth.users,
  plan text not null default 'free',     -- free | plus | pro
  credits numeric not null default 100,  -- 占位赠送额
  created_at timestamptz default now()
)

-- credit_ledger：每次扣减/赠送一条，便于审计与对账
credit_ledger (
  id bigint pk,
  user_id uuid references auth.users,
  delta numeric not null,                -- 负=消耗，正=赠送/充值
  model text,                            -- deepseek-v4-flash | -pro
  input_tokens int, output_tokens int,
  reason text,                           -- 'chat' | 'signup_grant' | ...
  created_at timestamptz default now()
)
```

- RLS：用户只能读自己的 `profiles` / `credit_ledger`；**写余额只允许服务端 service-role**（代理），前端无法改余额。
- 注册赠送当前实现：Supabase trigger 在 `auth.users` insert 后立即建 profile + 写一条 `signup_grant`。邮箱 OTP 控制确认/登录，但当前 trigger **不是确认后才赠送**；是否调整为确认后赠送列为待决。

## 过渡代理接口（已验证的最小面）

Codex-facing（本地网关在 credit 模式转发到这里）：

- `POST /v1/chat/completions`（OpenAI 兼容）：
  - 入站头 `Authorization: Bearer <supabase-jwt>`。
  - 代理：校验 JWT → 查 `profiles.credits` → 若 ≤0 拒绝（见失败模式）→ 注入平台 DeepSeek key 转发 → 流式透传 → 收尾读 usage → 按倍率算 credit 消耗 → 原子扣 `profiles.credits` + 写 `credit_ledger`。
  - `stream=true` 时用 `stream_options.include_usage` 拿 usage（gateway.py 现有能力）。
- `GET /v1/models`：返回平台允许的模型（flash/pro）及倍率元数据。

目标约定：生产迁移尽量保持相同 `base_url` 与 `Bearer <jwt>` 客户端形状；是否需要在 new-api 前后保留 Supabase 鉴权/扣款适配层，待实现验证。

## 代理部署形态（已验证过渡形态，非最终生产定案）

过渡代理 = 独立的 **OpenAI Chat Completions 转发器**（`gateway/proxy.py`），已按常驻服务完成真实部署验证。职责单一：校验 JWT + 查/扣 credit + 注入平台 DeepSeek key + usage 计量。

**协议边界（关键）：代理入站/出站都说 Chat Completions，不做 responses⇄chat 翻译。** 翻译只留本地网关 `gateway.py` 一份（铁律 2）。两种模式的数据流：

- BYOK 模式：内核(Responses) → 本地网关(翻译成 Chat，用**用户 key**) → DeepSeek。不经代理、不计量。
- credit 模式：内核(Responses) → 本地网关(翻译成 Chat，base_url 指代理、Authorization 带**用户 JWT**) → 平台代理(校验 JWT + 查余额 + 注**平台 key** + 计量扣 credit) → DeepSeek。

代理与 gateway.py 仅共享小工具（日志脱敏、流式读取惯例），**不共享翻译**。这样代理与 new-api 同形态（皆 Chat Completions），以后按 `base_url + Bearer <jwt>` 接缝零改动顶替。

不重写为 Supabase Edge Function：计量须看完整流（usage 在 `chunk.usage`），agent 长任务会撞 edge 执行时限。详见 decisions。

## Credit 前置门禁 + 后置原子记账（已验证）

- **转发前门禁**：查 `profiles.credits > 0` 才转发；≤0 直接拒（`insufficient_credits`）。
- **转发后原子扣减**：拿到 usage 后，调 Supabase Postgres RPC，在**单事务**内扣余额 + 写流水：

```sql
-- 单事务：扣减并落账。cost = (input+output 等效 token) × 模型倍率换算
create function spend_credits(uid uuid, cost numeric, model text, in_tok int, out_tok int)
returns numeric language plpgsql security definer as $$
declare new_balance numeric;
begin
  update profiles set credits = credits - cost where id = uid returning credits into new_balance;
  insert into credit_ledger(user_id, delta, model, input_tokens, output_tokens, reason)
    values (uid, -cost, model, in_tok, out_tok, 'chat');
  return new_balance;
end $$;
```

- **一致性边界**：`spend_credits` 保证单次扣款与流水在一个事务内原子；它不是预授权/余额冻结。同一用户并发多轮可能都过门禁、各自扣到负——当前接受小幅为负，下次充值补齐。
- 扣减只允许服务端 service-role 调用；前端无权改余额（RLS）。

## 模式切换

当前代码只完成 credit provider override；未完成项不得按已实现理解：

| 模式 | base_url | Authorization | 计 credit |
|---|---|---|---|
| 平台 credit（代码接线完成，GUI E2E 未跑） | 过渡代理 `…/v1` | 用户 Supabase JWT | 是 |
| BYOK（仅 Plus+，待实现） | 直连或经 new-api 待决 | 用户自己的 key | 否 |

- 默认 credit 模式；Plus 用户的 BYOK 权益、路由和模式切换尚未完成。
- JWT 过期：App 用 Supabase SDK 静默刷新；刷新失败则提示重登。

## 失败模式

- 未登录：开屏全屏登录页（`AccountGate`），无缓存会话不进 App；可在此注册。
- 会话优先：有钥匙串缓存会话则开屏直接进，不必每次登录。
- 离线宽限：缓存会话已恢复但后端连不上时仍进 App，credit 按 `online` 降级（余额「暂不可用」、credit 对话失败才提示），BYOK/本地/git 不受影响。
- credit 耗尽：代理返回结构化错误（如 402 + `{code:"insufficient_credits"}`），网关转成 Codex 可消费的 `response.failed`，前端提示「额度不足，去升级/充值」。
- JWT 无效/过期：代理 401；App 触发刷新或要求重登。
- 生产 credit 入口不可达：前端提示平台服务不可用；BYOK 的目标是不受平台 credit 服务影响，但其直连或 new-api 路由尚未定案。
- Supabase 不可达：登录态走本地缓存的 session；余额展示降级为「暂不可用」，但不放行无计量对话（credit 模式必须能扣才放行）。
- BYOK 误用（目标行为，未实现）：Free 用户尝试启用 BYOK → 权益门禁拦截 + 升级引导；不能只依赖隐藏 UI。

## 测试策略

- 单元测试：
  - credit 费率换算（token × 倍率 → credit），flash/pro 比值 3:1。
  - 模式切换 → provider 配置（base_url/Authorization）正确。
  - 余额耗尽判定与结构化错误。
- 集成测试：
  - 注册 → trigger 建 profile + 赠送 credit。
  - 代理：JWT 校验、扣余额原子性、ledger 落账。
  - RLS：前端无法改 `credits`。
  - 平台 credit 使用统一余额与错误语义；生产 new-api/适配层组合确定后补。
- 人工验证：
  - 注册 → 登录 → 首页看余额 → 选 flash/pro 对话 → 余额按用量下降。
  - Plus 开 BYOK → 对话不扣 credit。
  - 余额耗尽 → 对话被拦 + 提示。
  - Windows 桌面实机完成会话恢复、平台 credit、BYOK 权益门禁与余额刷新。
