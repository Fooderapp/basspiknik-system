-- ── Rename min_cart_items → max_cart_items in event_spin_config ─────────────
-- Spin eligibility changes from "cart has AT LEAST N items"
-- to "cart has AT MOST N items (0 = no limit)".

alter table event_spin_config
  add column if not exists max_cart_items int not null default 0;

-- Copy existing min values so existing configs keep their intent flipped
update event_spin_config set max_cart_items = min_cart_items where min_cart_items > 0;

alter table event_spin_config
  drop column if exists min_cart_items;

-- ── Replace spin_credits RPC with max_cart_items check ───────────────────────
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

    -- Max cart check: 0 = no limit
    if v_cfg.max_cart_items > 0 and v_total_qty > v_cfg.max_cart_items then
      return jsonb_build_object('error', 'Too many items in cart to spin');
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
