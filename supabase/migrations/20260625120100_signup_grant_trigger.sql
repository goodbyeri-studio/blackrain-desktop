-- 002-accounts-credits / M-A1.2：注册赠送 trigger
-- auth.users insert → 建 free profile（占位赠送额）+ 写一条 signup_grant 流水。
-- 见 .specs/002-accounts-credits/design.md「注册赠送」。

-- 占位赠送额：与 profiles.credits default 保持一致（100 credit ≈ 1M pro-等效 token）。
-- 正式定价时改这里 + profiles default 两处。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  grant_amount numeric := 100;
begin
  insert into public.profiles (id, plan, credits)
    values (new.id, 'free', grant_amount)
    on conflict (id) do nothing;

  insert into public.credit_ledger (user_id, delta, reason)
    values (new.id, grant_amount, 'signup_grant');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
