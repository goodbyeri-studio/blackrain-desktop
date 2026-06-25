-- 002-accounts-credits / M-A1.1：账号 profile 与 credit 流水表 + RLS
-- 见 .specs/002-accounts-credits/design.md「数据模型」。
-- 关键约束：用户只能读自己的行；余额只允许服务端 service-role 改（前端无法改 credits）。

-- ---------------------------------------------------------------------------
-- profiles：与 auth.users 一对一。plan + credit 余额。
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  plan       text        not null default 'free'
               check (plan in ('free', 'plus', 'pro')),
  -- 占位赠送额：100 credit ≈ 1M pro-等效 token（正式定价时集中改这里，不散落代码）。
  credits    numeric     not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is '用户档案：plan 与 credit 余额。余额写入仅限 service-role。';
comment on column public.profiles.credits is '占位赠送额，正式定价时集中调整。负数表示并发超卖，下次充值补齐。';

-- ---------------------------------------------------------------------------
-- credit_ledger：每次扣减/赠送/充值一条流水，便于审计与对账。
-- ---------------------------------------------------------------------------
create table if not exists public.credit_ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid        not null references auth.users (id) on delete cascade,
  delta         numeric     not null,            -- 负=消耗，正=赠送/充值
  model         text,                            -- deepseek-v4-flash | deepseek-v4-pro | null
  input_tokens  integer,
  output_tokens integer,
  reason        text        not null,            -- 'chat' | 'signup_grant' | 'topup' | ...
  created_at    timestamptz not null default now()
);

comment on table public.credit_ledger is 'credit 流水：每次扣减/赠送/充值一条，用于审计对账。';

create index if not exists credit_ledger_user_id_created_at_idx
  on public.credit_ledger (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS：用户只能读自己的行；写入一律走 service-role（绕过 RLS）。
-- 不对 authenticated 授予任何 INSERT/UPDATE/DELETE 策略 → 前端无法改余额。
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.credit_ledger enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "credit_ledger_select_own" on public.credit_ledger;
create policy "credit_ledger_select_own"
  on public.credit_ledger for select
  to authenticated
  using (auth.uid() = user_id);

-- updated_at 自动维护
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
