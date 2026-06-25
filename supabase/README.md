# Supabase（002-accounts-credits 账号与 credit 后端）

账号认证 + credit 余额的后端。见 [`.specs/002-accounts-credits/`](../.specs/002-accounts-credits/)。

## 这是什么

- `migrations/` — Postgres schema 与策略，按文件名时间戳顺序执行：
  - `*_profiles_and_ledger.sql` — `profiles`（plan + credits）、`credit_ledger`（流水）+ RLS。
  - `*_signup_grant_trigger.sql` — 注册即建 free profile + 赠送占位 credit。
- 扣减 RPC（`spend_credits`）属于 M-A2（最小代理 + 计量），本阶段（M-A1，credit 只存不扣）尚未加入。

## 如何应用

本仓库不含 Supabase 项目密钥（service-role key 绝不入库）。你需要：

1. 在 [supabase.com](https://supabase.com) 建一个项目（个人版即可）。
2. 应用 migration（任选其一）：
   - **Dashboard**：SQL Editor 里按文件名顺序粘贴执行每个 `.sql`。
   - **CLI**：`supabase link --project-ref <ref>` 后 `supabase db push`。
3. 把项目的 URL 与 anon key 填进桌面端本地环境（**不要提交**）：
   ```
   # apps/desktop/.env.local
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-key>
   ```
   anon key 受 RLS 约束、可公开分发；service-role key 只在平台代理服务端用（M-A2），绝不进前端。

## 安全要点（与 spec/decisions 一致）

- RLS：用户只能读自己的 `profiles` / `credit_ledger`；**写余额只允许 service-role**，前端改不动。
- 平台 DeepSeek key 只在服务端代理（M-A2），绝不打包进桌面端。
- 占位赠送额（100 credit）同时写在 `profiles.credits` default 与 trigger 的 `grant_amount`，正式定价时两处一起改。
