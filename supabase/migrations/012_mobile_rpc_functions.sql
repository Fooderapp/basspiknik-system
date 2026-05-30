-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 012: Supabase RPC functions for the mobile app
-- The mobile app calls these directly instead of going through Vercel/Next.js.
-- All functions use SECURITY DEFINER so they bypass RLS and handle auth
-- internally — equivalent to the createAdminClient() pattern in the web API.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. checkin_ticket ────────────────────────────────────────────────────────
-- Called by: Check-In Scanner screen
-- Auth: must be ADMIN / EDITOR / STAFF / SELLER / BARTENDER
create or replace function checkin_ticket(p_qr_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket   tickets%rowtype;
  v_role     text;
begin
  -- Authorise
  select role::text into v_role from profiles where id = auth.uid();
  if v_role is null or v_role not in ('ADMIN','EDITOR','STAFF','SELLER','BARTENDER') then
    return jsonb_build_object('success', false, 'message', 'Unauthorized');
  end if;

  -- Find ticket
  select * into v_ticket from tickets where qr_code = p_qr_code;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Ticket not found');
  end if;

  -- Guard status
  if v_ticket.status = 'USED' then
    return jsonb_build_object('success', false, 'message', 'Already checked in', 'usedAt', v_ticket.used_at);
  end if;
  if v_ticket.status <> 'VALID' then
    return jsonb_build_object('success', false, 'message', 'Ticket is ' || v_ticket.status::text);
  end if;

  -- Check in
  update tickets
  set status = 'USED', used_at = now()
  where id = v_ticket.id;

  -- Log check-in
  insert into check_ins (ticket_id, event_id, checked_in_by)
  values (v_ticket.id, v_ticket.event_id, auth.uid())
  on conflict do nothing;

  return jsonb_build_object(
    'success',     true,
    'ticketId',    v_ticket.id,
    'holderName',  v_ticket.holder_name,
    'ticketName',  v_ticket.ticket_name,
    'tier',        v_ticket.tier::text,
    'usedAt',      now()
  );
end;
$$;

grant execute on function checkin_ticket(text) to authenticated;


-- ── 2. place_bar_order ───────────────────────────────────────────────────────
-- Called by: Bar Menu screen (place order button)
-- Auth: public (anon or authenticated)
-- p_items: [{"drinkId": "uuid", "quantity": 2, "notes": "no ice"}]
create or replace function place_bar_order(
  p_guest_name text    default null,
  p_notes      text    default null,
  p_items      jsonb   default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_qr_token text;
  v_total    int  := 0;
  v_is_vip   boolean := false;
  v_user_id  uuid;
  v_item     jsonb;
  v_drink    drinks%rowtype;
  v_price    int;
begin
  v_user_id  := auth.uid();
  v_qr_token := upper(substring(md5(random()::text || clock_timestamp()::text) for 8));

  -- VIP check
  if v_user_id is not null then
    select (role = 'VIP_GUEST') into v_is_vip from profiles where id = v_user_id;
    v_is_vip := coalesce(v_is_vip, false);
  end if;

  -- Validate items + calculate total
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_drink
    from drinks
    where id = (v_item->>'drinkId')::uuid and available = true;

    if not found then
      return jsonb_build_object('error', 'Drink unavailable: ' || coalesce(v_item->>'drinkId', '?'));
    end if;

    v_price := case when v_drink.sale_enabled and v_drink.sale_price is not null
                    then v_drink.sale_price else v_drink.price end;
    v_total := v_total + v_price * (v_item->>'quantity')::int;
  end loop;

  if v_total = 0 then
    return jsonb_build_object('error', 'Empty order');
  end if;

  -- Insert order
  insert into drink_orders
    (user_id, guest_name, qr_token, qr_expires_at, status, is_vip, paid_online, total, notes)
  values
    (v_user_id, p_guest_name, v_qr_token, now() + interval '4 hours',
     'PENDING', v_is_vip, false, v_total, p_notes)
  returning id into v_order_id;

  -- Insert items
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_drink from drinks where id = (v_item->>'drinkId')::uuid;
    v_price := case when v_drink.sale_enabled and v_drink.sale_price is not null
                    then v_drink.sale_price else v_drink.price end;

    insert into drink_order_items
      (drink_order_id, drink_id, quantity, unit_price, notes)
    values
      (v_order_id, v_drink.id,
       (v_item->>'quantity')::int, v_price,
       v_item->>'notes');
  end loop;

  return jsonb_build_object('id', v_order_id, 'qrToken', v_qr_token, 'total', v_total);
end;
$$;

grant execute on function place_bar_order(text, text, jsonb) to anon, authenticated;


-- ── 3. cancel_bar_order ──────────────────────────────────────────────────────
-- Called by: Order Status screen (cancel button)
-- Auth: owner by user_id OR by qr_token (for anonymous orders)
create or replace function cancel_bar_order(
  p_order_id uuid,
  p_qr_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order drink_orders%rowtype;
begin
  select * into v_order from drink_orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Order not found');
  end if;

  -- Ownership check: must match user_id OR qr_token
  if not (
    (auth.uid() is not null and v_order.user_id = auth.uid())
    or v_order.qr_token = p_qr_token
  ) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  if v_order.status <> 'PENDING' then
    return jsonb_build_object('ok', false, 'error', 'Only PENDING orders can be cancelled');
  end if;

  update drink_orders set status = 'CANCELLED' where id = p_order_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function cancel_bar_order(uuid, text) to anon, authenticated;


-- ── 4. sell_tickets_cash ─────────────────────────────────────────────────────
-- Called by: Seller POS screen
-- Auth: ADMIN / EDITOR / SELLER
-- p_items: [{"ticketTypeId": "uuid", "quantity": 2}]
create or replace function sell_tickets_cash(
  p_event_id    uuid,
  p_buyer_name  text  default null,
  p_buyer_email text  default null,
  p_items       jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role         text;
  v_seller_id    uuid;
  v_order_id     uuid;
  v_subtotal     int  := 0;
  v_item         jsonb;
  v_tt           ticket_types%rowtype;
  v_price        int;
  v_oi_id        uuid;
  v_ticket_count int  := 0;
  v_i            int;
begin
  v_seller_id := auth.uid();
  select role::text into v_role from profiles where id = v_seller_id;

  if v_role is null or v_role not in ('ADMIN','EDITOR','SELLER') then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  -- Validate + total
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
    (guest_name, guest_email, event_id,
     subtotal, discount_amount, tax_amount, total,
     currency, status, payment_method, seller_id)
  values
    (p_buyer_name, p_buyer_email, p_event_id,
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

    -- Increment sold count
    update ticket_types
    set sold = sold + (v_item->>'quantity')::int
    where id = v_tt.id;

    -- Issue individual tickets
    for v_i in 1..(v_item->>'quantity')::int loop
      insert into tickets
        (order_id, order_item_id, event_id, ticket_type_id,
         ticket_name, tier, status, qr_code,
         holder_name, holder_email)
      values
        (v_order_id, v_oi_id, p_event_id, v_tt.id,
         v_tt.name, v_tt.tier, 'VALID',
         upper(substring(md5(random()::text || clock_timestamp()::text || v_i::text) for 12)),
         p_buyer_name, p_buyer_email);

      v_ticket_count := v_ticket_count + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'id',          v_order_id,
    'total',       v_subtotal,
    'ticketCount', v_ticket_count
  );
end;
$$;

grant execute on function sell_tickets_cash(uuid, text, text, jsonb) to authenticated;
