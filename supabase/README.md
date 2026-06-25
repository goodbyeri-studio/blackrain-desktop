# Supabase（002-accounts-credits 账号与 credit 后端）

账号认证 + credit 余额的后端。见 [`.specs/002-accounts-credits/`](../.specs/002-accounts-credits/)。

## 这是什么

- `migrations/` — Postgres schema 与策略，按文件名时间戳顺序执行：
  - `*_profiles_and_ledger.sql` — `profiles`（plan + credits）、`credit_ledger`（流水）+ RLS。
  - `*_signup_grant_trigger.sql` — 注册即建 free profile + 赠送占位 credit。
- 扣减 RPC（`spend_credits`）属于 M-A2（最小代理 + 计量），本阶段（M-A1，credit 只存不扣）尚未加入。

## 如何应用

云端项目已用 Supabase CLI 建好（新加坡区 `ap-southeast-1`，project ref `jhetzgklmmkekpicutlg`），并已 `link` + `db push` 两个 migration。本仓库不含任何 Supabase 密钥（service-role / access token / db 密码全在 gitignored 的根 `.env`）。

日常用 CLI 管理（凭据从根 `.env` 读，不进命令行明文）：

```bash
set -a; source .env; set +a            # 载入 SUPABASE_ACCESS_TOKEN / SUPABASE_DB_PASSWORD 等
supabase db push                        # 推新增 migration 到云端
supabase migration list --linked        # 查 Local/Remote 对齐
supabase db pull                         # 从云端拉回 schema 变更（如在控制台改过）
```

新增 migration：在 `migrations/` 下加 `<时间戳>_<名>.sql`（或 `supabase migration new <名>`），改完 `db push`。

桌面端连云后端的配置已写入 `apps/desktop/.env.local`（gitignored）：

```
VITE_SUPABASE_URL=https://jhetzgklmmkekpicutlg.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

anon key 受 RLS 约束、可公开分发；service-role key 只在平台代理服务端用（M-A2），存根 `.env`，绝不进前端。

### 本地 stack（可选，默认不用）

CLI 也支持 `supabase start` 在 Docker 起本地全栈。但本项目按 decisions 走「云端优先」：本地测不到国内可达性（最大风险），且单人 MVP 维护两套环境不划算。需要纯离线迭代 SQL 时再用。

## 安全要点（与 spec/decisions 一致）

- RLS：用户只能读自己的 `profiles` / `credit_ledger`；**写余额只允许 service-role**，前端改不动。
- 平台 DeepSeek key 只在服务端代理（M-A2），绝不打包进桌面端。
- 占位赠送额（100 credit）同时写在 `profiles.credits` default 与 trigger 的 `grant_amount`，正式定价时两处一起改。
