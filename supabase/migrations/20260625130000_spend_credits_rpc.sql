-- 002-accounts-credits / M-A2：credit 原子扣减 RPC
-- 见 .specs/002-accounts-credits/design.md「Credit 强一致扣减」。
-- 单事务内：扣 profiles.credits + 写 credit_ledger 一条，返回新余额。
--
-- 安全：security definer 绕 RLS 写余额，但 **只授权 service_role**（平台代理）调用；
-- 撤销 anon/authenticated 的执行权，防止用户自己调它给自己加 credit。
-- cost 由代理按 usage × 模型倍率算好传入（正数=消耗）。允许扣到负（并发超卖，
-- 下次充值补齐——decisions「接受并发小幅超卖」）。

create or replace function public.spend_credits(
  uid     uuid,
  cost    numeric,
  model   text,
  in_tok  integer,
  out_tok integer
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance numeric;
begin
  -- 防御：cost 必须为非负数（扣费）。负 cost（变相加额）一律拒，避免误用/滥用。
  if cost is null or cost < 0 then
    raise exception 'spend_credits: cost 必须为非负数，收到 %', cost;
  end if;

  update public.profiles
     set credits = credits - cost
   where id = uid
   returning credits into new_balance;

  if not found then
    raise exception 'spend_credits: 找不到用户 profile %', uid;
  end if;

  insert into public.credit_ledger (user_id, delta, model, input_tokens, output_tokens, reason)
    values (uid, -cost, model, in_tok, out_tok, 'chat');

  return new_balance;
end;
$$;

-- 收回默认执行权，仅 service_role 可调（前端 anon/authenticated 无权）。
revoke all on function public.spend_credits(uuid, numeric, text, integer, integer) from public;
revoke all on function public.spend_credits(uuid, numeric, text, integer, integer) from anon, authenticated;
grant execute on function public.spend_credits(uuid, numeric, text, integer, integer) to service_role;
