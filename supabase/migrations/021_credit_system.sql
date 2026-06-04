-- Migration 021: Credit system
--
-- Users earn credits when they buy tickets and when their drink orders are
-- fulfilled. Credits can be spent on a "free spin" slot machine. A win makes
-- the current checkout free. Spin eligibility is gated per-event.
--
-- Tunables live on app_settings (global row):
--   credits_per_ticket  – credits granted per paid ticket order   (default 4)
--   credits_per_drink   – credits granted per fulfilled drink order(default 1)
--   spin_cost           – credits a single spin costs              (default 4)
--   spin_win_rate       – win chance is 1-in-N                     (default 20)
--   credits_enabled     – master on/off switch                     (default true)

-- ── Settings tunables ────────────────────────────────────────────────────────
alter table app_settings
  add column if not exists credits_per_ticket int     not null default 4,
  add column if not exists credits_per_drink  int     not null default 1,
  add column if not exists spin_cost          int     not null default 4,
  add column if not exists spin_win_rate      int     not null default 20,
  add column if not exists credits_enabled    boolean not null default true;

-- ── Ledger (balance = sum of amounts) ────────────────────────────────────────
create table if not exists credit_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  amount         int  not null,                       -- + earn, - spend
  reason         text not null check (reason in
                   ('TICKET_PURCHASE','DRINK_ORDER','SPIN','SPIN_WIN','ADJUST')),
  order_id       uuid references orders(id) on delete set null,
  drink_order_id uuid references drink_orders(id) on delete set null,
  meta           jsonb default '{}'::jsonb,
  created_at     timestamptz default now()
);

create index if not exists idx_credit_tx_user on credit_transactions(user_id);

-- Idempotency: at most one earn row per source order + reason
create unique index if not exists uniq_credit_tx_ticket
  on credit_transactions(order_id, reason) where order_id is not null;
create unique index if not exists uniq_credit_tx_drink
  on credit_transactions(drink_order_id, reason) where drink_order_id is not null;

alter table credit_transactions enable row level security;

drop policy if exists credit_tx_select_own on credit_transactions;
create policy credit_tx_select_own on credit_transactions
  for select using (user_id = auth.uid());
-- All writes go through SECURITY DEFINER functions / service role.

-- ── Per-event spin gating ────────────────────────────────────────────────────
create table if not exists event_spin_config (
  event_id                uuid primary key references events(id) on delete cascade,
  enabled                 boolean  not null default false,
  allowed_ticket_type_ids uuid[]   not null default '{}',
  min_cart_items          int      not null default 0,
  require_bundle          boolean  not null default false,
  min_bundles             int      not null default 0,
  updated_at              timestamptz default now()
);

alter table event_spin_config enable row level security;

drop policy if exists spin_cfg_select on event_spin_config;
create policy spin_cfg_select on event_spin_config for select using (true);

drop policy if exists spin_cfg_write on event_spin_config;
create policy spin_cfg_write on event_spin_config for all using (
  exists (select 1 from profiles where id = auth.uid() and role in ('ADMIN','EDITOR'))
);

-- ── Win tokens (single-use, scoped, expiring) ────────────────────────────────
create table if not exists spin_wins (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique default gen_random_uuid()::text,
  user_id       uuid not null references profiles(id) on delete cascade,
  event_id      uuid references events(id) on delete cascade,
  context       text not null check (context in ('TICKET','DRINK')),
  used          boolean not null default false,
  used_order_id uuid,
  created_at    timestamptz default now(),
  expires_at    timestamptz not null default (now() + interval '30 minutes')
);

alter table spin_wins enable row level security;

drop policy if exists spin_wins_select_own on spin_wins;
create policy spin_wins_select_own on spin_wins
  for select using (user_id = auth.uid());

-- ── Balance helper ───────────────────────────────────────────────────────────
create or replace function get_credit_balance(p_user_id uuid)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int
  from credit_transactions
  where user_id = p_user_id;
$$;

grant execute on function get_credit_balance(uuid) to authenticated;

-- ── Award credits (idempotent per source) ────────────────────────────────────
create or replace function award_credits(
  p_user_id        uuid,
  p_amount         int,
  p_reason         text,
  p_order_id       uuid default null,
  p_drink_order_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null or coalesce(p_amount, 0) = 0 then
    return;
  end if;
  insert into credit_transactions(user_id, amount, reason, order_id, drink_order_id)
  values (p_user_id, p_amount, p_reason, p_order_id, p_drink_order_id)
  on conflict do nothing;  -- partial unique indexes make re-runs no-ops
end;
$$;

grant execute on function award_credits(uuid, int, text, uuid, uuid) to authenticated;

-- ── Spin the slot machine ────────────────────────────────────────────────────
-- Returns: { win bool, token text|null, balance int, cost int }  or { error }.
-- RNG is server-side only — the client never decides the outcome.
create or replace function spin_credits(
  p_event_id uuid,
  p_context  text,    -- 'TICKET' | 'DRINK'
  p_cart     jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user       uuid := auth.uid();
  v_enabled    boolean;
  v_cost       int;
  v_rate       int;
  v_balance    int;
  v_cfg        event_spin_config%rowtype;
  v_item       jsonb;
  v_tt         ticket_types%rowtype;
  v_total_qty  int := 0;
  v_bundle_qty int := 0;
  v_win        boolean := false;
  v_token      text;
begin
  if v_user is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select credits_enabled, spin_cost, spin_win_rate
    into v_enabled, v_cost, v_rate
  from app_settings where id = 'global';

  if not coalesce(v_enabled, false) then
    return jsonb_build_object('error', 'Credits disabled');
  end if;

  -- Ticket carts must satisfy the event's spin conditions
  if p_context = 'TICKET' then
    select * into v_cfg from event_spin_config where event_id = p_event_id;
    if not found or not v_cfg.enabled then
      return jsonb_build_object('error', 'Spin not enabled for this event');
    end if;

    for v_item in select * from jsonb_array_elements(p_cart) loop
      select * into v_tt from ticket_types
      where id = (v_item->>'ticketTypeId')::uuid and event_id = p_event_id;
      if not found then
        return jsonb_build_object('error', 'Invalid cart');
      end if;

      if array_length(v_cfg.allowed_ticket_type_ids, 1) is not null
         and not (v_tt.id = any(v_cfg.allowed_ticket_type_ids)) then
        return jsonb_build_object('error', 'Cart has tickets not eligible for spin');
      end if;

      v_total_qty := v_total_qty + (v_item->>'quantity')::int;
      if v_tt.is_bundle then
        v_bundle_qty := v_bundle_qty + (v_item->>'quantity')::int;
      end if;
    end loop;

    if v_total_qty < v_cfg.min_cart_items then
      return jsonb_build_object('error', 'Not enough items in cart to spin');
    end if;
    if v_cfg.require_bundle and v_bundle_qty < greatest(v_cfg.min_bundles, 1) then
      return jsonb_build_object('error', 'Add the required bundle to spin');
    end if;
  end if;

  -- Serialize per user so concurrent spins can't double-spend
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  v_balance := coalesce((select sum(amount) from credit_transactions where user_id = v_user), 0);
  if v_balance < v_cost then
    return jsonb_build_object('error', 'Not enough credits', 'balance', v_balance, 'cost', v_cost);
  end if;

  insert into credit_transactions(user_id, amount, reason)
  values (v_user, -v_cost, 'SPIN');

  -- Win when floor(random() * rate) = 0  →  probability 1/rate
  v_win := (floor(random() * greatest(v_rate, 1))::int = 0);

  if v_win then
    insert into spin_wins(user_id, event_id, context)
    values (v_user, p_event_id, p_context)
    returning token into v_token;
  end if;

  return jsonb_build_object(
    'win',     v_win,
    'token',   v_token,
    'balance', coalesce((select sum(amount) from credit_transactions where user_id = v_user), 0),
    'cost',    v_cost
  );
end;
$$;

grant execute on function spin_credits(uuid, text, jsonb) to authenticated;

-- ── Redeem a win token (single use) ──────────────────────────────────────────
create or replace function redeem_spin_token(p_token text, p_context text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_row  spin_wins%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;

  select * into v_row from spin_wins where token = p_token for update;
  if not found             then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_row.user_id <> v_user then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v_row.used            then return jsonb_build_object('ok', false, 'error', 'used'); end if;
  if v_row.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if v_row.context <> p_context then return jsonb_build_object('ok', false, 'error', 'context'); end if;

  update spin_wins set used = true where id = v_row.id;

  return jsonb_build_object('ok', true, 'event_id', v_row.event_id, 'win_id', v_row.id);
end;
$$;

grant execute on function redeem_spin_token(text, text) to authenticated;

-- ── Award credits for cash / tap-to-pay sales (registered buyers only) ───────
-- Recreates sell_tickets_cash (from migration 020) and adds a credit award for
-- the buyer when p_buyer_user_id is supplied. Walk-in guests earn nothing.
create or replace function sell_tickets_cash(
  p_event_id       uuid,
  p_buyer_name     text  default null,
  p_buyer_email    text  default null,
  p_items          jsonb default '[]'::jsonb,
  p_buyer_user_id  uuid  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role            text;
  v_seller_id       uuid;
  v_order_id        uuid;
  v_subtotal        int  := 0;
  v_item            jsonb;
  v_tt              ticket_types%rowtype;
  v_price           int;
  v_oi_id           uuid;
  v_ticket_id       uuid;
  v_ticket_count    int  := 0;
  v_i               int;
  v_tickets_to_make int;
  v_credits_per     int;
begin
  v_seller_id := auth.uid();
  select role::text into v_role from profiles where id = v_seller_id;

  if v_role is null or v_role not in ('ADMIN','EDITOR','SELLER') then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  -- Validate availability and compute subtotal
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_tt
    from ticket_types
    where id = (v_item->>'ticketTypeId')::uuid and event_id = p_event_id;

    if not found then
      return jsonb_build_object('error', 'Ticket type not found');
    end if;

    if (v_tt.quantity - v_tt.sold) < (v_item->>'quantity')::int then
      return jsonb_build_object('error', 'Not enough tickets available for: ' || v_tt.name);
    end if;

    v_price    := case when v_tt.sale_enabled and v_tt.sale_price is not null
                       then v_tt.sale_price else v_tt.price end;
    v_subtotal := v_subtotal + v_price * (v_item->>'quantity')::int;
  end loop;

  -- Create order
  insert into orders
    (user_id, guest_name, guest_email, event_id,
     subtotal, discount_amount, tax_amount, total,
     currency, status, payment_method, seller_id)
  values
    (p_buyer_user_id, p_buyer_name, p_buyer_email, p_event_id,
     v_subtotal, 0, 0, v_subtotal,
     'EUR', 'PAID', 'CASH', v_seller_id)
  returning id into v_order_id;

  -- Create order items + tickets
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_tt from ticket_types where id = (v_item->>'ticketTypeId')::uuid;

    v_price := case when v_tt.sale_enabled and v_tt.sale_price is not null
                    then v_tt.sale_price else v_tt.price end;

    insert into order_items (order_id, ticket_type_id, quantity, unit_price, total)
    values (v_order_id, v_tt.id, (v_item->>'quantity')::int, v_price,
            v_price * (v_item->>'quantity')::int)
    returning id into v_oi_id;

    update ticket_types
    set sold = sold + (v_item->>'quantity')::int
    where id = v_tt.id;

    v_tickets_to_make := (v_item->>'quantity')::int
      * case when v_tt.is_bundle and v_tt.bundle_size is not null
             then v_tt.bundle_size else 1 end;

    for v_i in 1..v_tickets_to_make loop
      insert into tickets
        (order_id, order_item_id, event_id, ticket_type_id,
         holder_name, holder_email, ticket_name, tier,
         status, qr_code, used_at)
      values
        (v_order_id, v_oi_id, p_event_id, v_tt.id,
         coalesce(p_buyer_name, 'Walk-in'), p_buyer_email,
         v_tt.name, v_tt.tier,
         case when v_tt.is_door_ticket then 'USED' else 'VALID' end,
         gen_random_uuid()::text,
         case when v_tt.is_door_ticket then now() else null end)
      returning id into v_ticket_id;

      if v_tt.is_door_ticket then
        insert into check_ins (ticket_id, event_id, checked_in_by)
        values (v_ticket_id, p_event_id, v_seller_id)
        on conflict do nothing;
      end if;

      v_ticket_count := v_ticket_count + 1;
    end loop;
  end loop;

  -- Award credits to the buyer (registered users only)
  if p_buyer_user_id is not null then
    select credits_per_ticket into v_credits_per from app_settings where id = 'global';
    perform award_credits(p_buyer_user_id, coalesce(v_credits_per, 4),
                          'TICKET_PURCHASE', v_order_id, null);
  end if;

  return jsonb_build_object(
    'orderId',     v_order_id,
    'total',       v_subtotal,
    'ticketCount', v_ticket_count
  );
end;
$$;

grant execute on function sell_tickets_cash(uuid, text, text, jsonb, uuid) to authenticated;
