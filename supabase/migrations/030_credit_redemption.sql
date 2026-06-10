-- Migration 030: Credit redemption at checkout
--
-- Lets users apply earned credits as a discount at checkout via a slider
-- (replacing / alternative to a promo code). This migration ships the schema
-- and a SAFE, read-only quote function only. The write path (reserve on
-- payment-intent creation, refund on failure) is wired in a follow-up once it
-- is attached to the real Stripe flow.
--
-- Tunables on app_settings (global row):
--   credit_redeem_enabled  master on/off for redemption            (default false)
--   credit_value_huf       1 credit = X Ft of discount             (default 0)
--   credit_max_apply       max credits applicable per order, 0 = ∞ (default 0)
--   credit_max_pct         cap discount at N% of the order total   (default 50)
--   credit_min_redeem      min credits required to redeem any      (default 0)

-- ── Settings tunables ────────────────────────────────────────────────────────
alter table app_settings
  add column if not exists credit_redeem_enabled boolean not null default false,
  add column if not exists credit_value_huf      numeric not null default 0,
  add column if not exists credit_max_apply      int     not null default 0,
  add column if not exists credit_max_pct        int     not null default 50,
  add column if not exists credit_min_redeem     int     not null default 0;

-- ── Extend ledger reasons with redemption + refund ───────────────────────────
alter table credit_transactions
  drop constraint if exists credit_transactions_reason_check;
alter table credit_transactions
  add constraint credit_transactions_reason_check
  check (reason in (
    'TICKET_PURCHASE','DRINK_ORDER','SPIN','SPIN_WIN','ADJUST','REDEEM','REDEEM_REFUND'
  ));

-- ── Read-only redemption quote ───────────────────────────────────────────────
-- Given an order total (Ft, after any promo) and an optional requested credit
-- amount, returns the credits that MAY be applied and the resulting discount —
-- capped by balance, the absolute cap, the % cap, and the order total itself.
-- Pure read: no ledger writes. The client slider and the server both call this
-- so the cap is computed in exactly one place.
create or replace function credit_redeem_quote(
  p_order_total numeric,            -- order total in Ft (post-promo, pre-credit)
  p_requested   int default null    -- credits user wants to apply; null = max
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_user        uuid    := auth.uid();
  v_enabled     boolean;
  v_value       numeric;
  v_max_apply   int;
  v_max_pct     int;
  v_min         int;
  v_balance     int;
  v_cap_credits int;
  v_credits     int;
  v_discount    numeric;
begin
  if v_user is null then
    return jsonb_build_object('error', 'auth');
  end if;

  select credit_redeem_enabled, credit_value_huf, credit_max_apply, credit_max_pct, credit_min_redeem
    into v_enabled, v_value, v_max_apply, v_max_pct, v_min
  from app_settings where id = 'global';

  if not coalesce(v_enabled, false) or coalesce(v_value, 0) <= 0 then
    return jsonb_build_object(
      'enabled', false, 'credits', 0, 'discount', 0,
      'maxCredits', 0, 'balance', 0, 'value', 0, 'minRedeem', 0
    );
  end if;

  v_balance := coalesce((select sum(amount) from credit_transactions where user_id = v_user), 0);

  -- Largest credit amount applicable to this order:
  v_cap_credits := v_balance;
  if v_max_apply > 0 then
    v_cap_credits := least(v_cap_credits, v_max_apply);
  end if;
  if v_max_pct > 0 then
    v_cap_credits := least(v_cap_credits, floor((p_order_total * v_max_pct / 100.0) / v_value)::int);
  end if;
  -- never discount more than the order is worth
  v_cap_credits := least(v_cap_credits, floor(p_order_total / v_value)::int);
  v_cap_credits := greatest(v_cap_credits, 0);

  v_credits := coalesce(p_requested, v_cap_credits);
  v_credits := greatest(0, least(v_credits, v_cap_credits));

  -- minimum redemption threshold: applying below it applies nothing
  if v_credits > 0 and v_min > 0 and v_credits < v_min then
    v_credits := 0;
  end if;

  v_discount := v_credits * v_value;

  return jsonb_build_object(
    'enabled',    true,
    'credits',    v_credits,
    'discount',   v_discount,
    'maxCredits', v_cap_credits,
    'balance',    v_balance,
    'value',      v_value,
    'minRedeem',  v_min
  );
end;
$$;

grant execute on function credit_redeem_quote(numeric, int) to authenticated;
