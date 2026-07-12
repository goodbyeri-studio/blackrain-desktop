# Supabase（002-accounts-credits 账号与 credit 后端）

账号认证 + credit 余额的后端。见 [`.specs/002-accounts-credits/`](../.specs/002-accounts-credits/)。

## 这是什么

- `migrations/` — Postgres schema 与策略，按文件名时间戳顺序执行：
  - `*_profiles_and_ledger.sql` — `profiles`（plan + credits）、`credit_ledger`（流水）+ RLS。
  - `*_signup_grant_trigger.sql` — 注册即建 free profile + 赠送占位 credit。
  - `*_spend_credits_rpc.sql` — service-role 专用的原子扣减 + ledger 写入 RPC。

M-A1/M-A2 的数据库与过渡代理骨干已经实现并有 2026-06-25 的历史真实云端验证；桌面 Windows E2E、BYOK 和双引擎统一计费仍未完成。最新状态以 `.specs/002-accounts-credits/verification.md` 为准。

## 如何应用

历史验证使用的新加坡区项目 ref 为 `jhetzgklmmkekpicutlg`：M-A1 先 `link` + `db push` 前两条 migration（profiles/ledger、signup trigger），M-A2 随后应用第三条 `spend_credits` migration 并实测 RPC。本仓库不含任何 Supabase 密钥（service-role / access token / db 密码全在 gitignored 的根 `.env`）。外部项目、代理和 TLS 状态会漂移，不能只凭本段认定当前线上仍健康；需要运维时应重新探测并回填 spec verification。

日常用 CLI 管理（凭据从根 `.env` 读，不进命令行明文）：

```bash
set -a; source .env; set +a            # 载入 SUPABASE_ACCESS_TOKEN / SUPABASE_DB_PASSWORD 等
supabase db push                        # 推新增 migration 到云端
supabase migration list --linked        # 查 Local/Remote 对齐
supabase db pull                         # 从云端拉回 schema 变更（如在控制台改过）
```

新增 migration：在 `migrations/` 下加 `<时间戳>_<名>.sql`（或 `supabase migration new <名>`），改完 `db push`。

开发机可在 `apps/desktop/.env.local`（gitignored）配置桌面端云后端：

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
