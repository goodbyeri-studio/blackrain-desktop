# Design

## 总体方案

在现有本地壳（Codex 内核 + 本地网关，见 [[001-providers-model-gateway]]）之上，加一层**账号 + credit 计量**。两类用户跑两条链路：

- **credit 用户（Free/Plus/Pro 用平台赠送额）**：对话经**平台云端代理**，代理持平台 DeepSeek key、按真实 token 用量扣 credit。
- **BYOK 用户（仅 Plus+）**：对话走**本地网关**，用用户自己的 key，不消耗平台 credit。

账号、plan、credit 余额由 **Supabase（Auth + Postgres）** 管理，桌面 App 通过 Supabase JS SDK 登录、读余额；服务端代理用 Supabase service-role 校验 JWT、扣余额。

```text
注册/登录:   桌面 App --Supabase SDK--> Supabase Auth (邮箱+密码)
对话(credit): 桌面 -> 本地网关(Responses⇄Chat) -> 平台代理(校验JWT+查余额+持平台key+计量扣credit) -> DeepSeek
对话(BYOK):   桌面 -> 本地网关(Responses⇄Chat, 用户key) -> DeepSeek            (Plus 才可配)
余额展示:     桌面 --Supabase SDK--> profiles.credits
```

## 架构边界

- 属于 `apps/desktop`（前端）：登录/注册 UI、会话态持久、首页/设置展示 plan 与 credit、模型选择器显示倍率、BYOK 入口的 Plus 门禁。
- 属于 `apps/desktop`（Tauri 后端）：Supabase 会话 token 的安全存取（钥匙串）、把「当前模式（credit/BYOK）」翻译成网关 provider 配置。
- 属于**平台代理**（新增，独立部署）：OpenAI 兼容转发、校验 Supabase JWT、查/扣 credit、持平台 DeepSeek key、usage 计量、余额耗尽拦截。
- 属于 **Supabase**：用户认证、`profiles`（plan + credits）、`credit_ledger`（流水）、RLS 策略。
- 明确不改 `codex-upstream`：内核只发 Responses，仍只连本地网关。
- 与 new-api 的接缝：平台代理对桌面暴露的 `base_url + Bearer` 约定固定；以后用 new-api 顶替代理实现，桌面侧零改动。

## 关键判断：平台 key 必须只在服务端

credit 用户花的是平台的钱，平台 DeepSeek key **绝不能**打包进桌面 App（会被扒包白嫖）。因此 credit 链路**必须**经服务端代理。这是「送 token」的硬性物理约束，没有纯本地的捷径。

- 本地网关在 credit 模式下，`base_url` 指向平台代理（如 `https://proxy.blackrain.app/v1`），`Authorization` 带用户 Supabase JWT（不是 DeepSeek key）。
- 平台代理用 JWT 认出用户 → 查余额 → 转发到真实 DeepSeek（注入平台 key）→ 读 usage → 扣 credit。
- BYOK 模式下，本地网关 `base_url` 指向 `https://api.deepseek.com`、`Authorization` 带用户自己的 key，完全不经代理。

## Credit 模型

- 面向用户的唯一单位是 **credit**。每个模型有「每 token 扣多少 credit」的费率，费率比值由 DeepSeek 真实价钉死。
- DeepSeek 实测：pro 输入/输出均为 flash 的 **3 倍**（输入 1→3 元、输出 2→6 元 / 1M，缓存未命中）。故倍率 **flash 0.5x / pro 1.5x**（比值 3:1）成立。
- 暂定锚定：**100 credit ≈ 1M pro-等效 token**，即 `1 credit ≈ 1万 pro-等效 token`。等效换算：
  - pro：1.5x → 1 credit ≈ 6,667 pro token
  - flash：0.5x → 1 credit ≈ 20,000 flash token（同样 100 credit 可用约 3M flash token）
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
- 注册赠送：用 Supabase trigger（`auth.users` insert → 建 profile + 写一条 `signup_grant`）。

## 平台代理接口（最小面，固定接缝）

Codex-facing（本地网关在 credit 模式转发到这里）：

- `POST /v1/chat/completions`（OpenAI 兼容）：
  - 入站头 `Authorization: Bearer <supabase-jwt>`。
  - 代理：校验 JWT → 查 `profiles.credits` → 若 ≤0 拒绝（见失败模式）→ 注入平台 DeepSeek key 转发 → 流式透传 → 收尾读 usage → 按倍率算 credit 消耗 → 原子扣 `profiles.credits` + 写 `credit_ledger`。
  - `stream=true` 时用 `stream_options.include_usage` 拿 usage（gateway.py 现有能力）。
- `GET /v1/models`：返回平台允许的模型（flash/pro）及倍率元数据。

约定：以后 new-api 顶替时，保持同样的 `base_url` 与 `Bearer <jwt>` 约定，桌面侧零改动。

## 代理部署形态（定案）

最小代理 = 现有 `gateway.py` + 一层鉴权计量，部署成**常驻服务**（Fly.io / Railway / 小 VPS）。同一份 `gateway.py` 两处部署：

- 本地（BYOK 模式）：翻译 + 用户 key，不计量。
- 远端（credit 模式）：翻译 + 平台 key + 校验 JWT + 计量扣 credit。

不重写为 Supabase Edge Function：翻译层是最易碎、已验证的部分（铁律 2，不重写）；计量须看完整流，agent 长任务会撞 edge 执行时限。详见 decisions。

## Credit 强一致扣减（定案）

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

- **并发取舍**：同一用户并发多轮可能都过门禁、各自扣到负——**接受**小幅为负，下次充值补齐（桌面单用户并发低）。不上预授权冻结（列为后续可选）。
- 扣减只允许服务端 service-role 调用；前端无权改余额（RLS）。

## 模式切换（桌面 → 网关 provider 配置）

App 按「当前账号 + 是否启用 BYOK」决定写入网关的 provider：

| 模式 | base_url | Authorization | 计 credit |
|---|---|---|---|
| credit（Free/Plus/Pro 用赠送额） | 平台代理 `…/v1` | 用户 Supabase JWT | 是 |
| BYOK（仅 Plus+） | `https://api.deepseek.com` | 用户自己的 key | 否 |

- 默认 credit 模式；Plus 用户在设置里开 BYOK 后切到 BYOK 模式。
- JWT 过期：App 用 Supabase SDK 静默刷新；刷新失败则提示重登。

## 失败模式

- 未登录：首页/对话入口引导登录，不进对话。
- credit 耗尽：代理返回结构化错误（如 402 + `{code:"insufficient_credits"}`），网关转成 Codex 可消费的 `response.failed`，前端提示「额度不足，去升级/充值」。
- JWT 无效/过期：代理 401；App 触发刷新或要求重登。
- 代理不可达：前端提示平台服务不可用；BYOK 用户不受影响（走本地直连）。
- Supabase 不可达：登录态走本地缓存的 session；余额展示降级为「暂不可用」，但不放行无计量对话（credit 模式必须能扣才放行）。
- BYOK 误用：Free 用户尝试启用 BYOK → 前端门禁拦截 + 升级引导（后端代理也不为 BYOK 请求计费，天然隔离）。

## 测试策略

- 单元测试：
  - credit 费率换算（token × 倍率 → credit），flash/pro 比值 3:1。
  - 模式切换 → provider 配置（base_url/Authorization）正确。
  - 余额耗尽判定与结构化错误。
- 集成测试：
  - 注册 → trigger 建 profile + 赠送 credit。
  - 代理：JWT 校验、扣余额原子性、ledger 落账。
  - RLS：前端无法改 `credits`。
- 人工验证：
  - 注册 → 登录 → 首页看余额 → 选 flash/pro 对话 → 余额按用量下降。
  - Plus 开 BYOK → 对话不扣 credit。
  - 余额耗尽 → 对话被拦 + 提示。

