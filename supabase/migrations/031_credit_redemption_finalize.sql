-- Migration 031: Finalize credit redemption (deduct on payment success)
--
-- The web/mobile checkout reduces the Stripe charge by the redeemed credits and
-- stamps the credit count into the PaymentIntent / Checkout Session metadata.
-- When the payment succeeds, fulfillment calls this to actually debit the
-- ledger. Keyed on (order_id, reason) — the existing unique index makes webhook
-- retries idempotent (a re-delivered event can never double-debit).

create or replace function finalize_credit_redemption(
  p_order_id uuid,
  p_user_id  uuid,
  p_credits  int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_balance int;
begin
  if p_order_id is null or p_user_id is null or coalesce(p_credits, 0) <= 0 then
    return;
  end if;

  -- Clamp to the balance actually available now (guards the rare case where the
  -- same credits were spent in a parallel checkout between quote and capture).
  v_balance := coalesce((select sum(amount) from credit_transactions where user_id = p_user_id), 0);
  if v_balance < p_credits then
    p_credits := v_balance;
  end if;
  if p_credits <= 0 then
    return;
  end if;

  insert into credit_transactions(user_id, amount, reason, order_id)
  values (p_user_id, -p_credits, 'REDEEM', p_order_id)
  on conflict do nothing;  -- (order_id, reason) unique index → idempotent
end;
$$;

grant execute on function finalize_credit_redemption(uuid, uuid, int) to authenticated, service_role;
