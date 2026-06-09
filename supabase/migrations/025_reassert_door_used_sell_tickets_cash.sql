-- Migration 025: Re-assert door-ticket auto-USED in sell_tickets_cash
--
-- WHY THIS EXISTS
--   sell_tickets_cash has been recreated several times:
--     018 — added the is_door_ticket → status='USED' + check_in branch
--     019 — fixed bundle expansion   (recreated the function)
--     020 — fixed ticket tier         (recreated the function)
--     021 — added credit award        (recreated the function, door branch kept)
--   A recreation that forgets the door branch silently regresses door tickets
--   back to status='VALID' (sold at the door but NOT auto-admitted). This file
--   re-asserts the canonical, correct definition so any prod DB stuck on a
--   pre-021 version is repaired in one run.
--
-- DOOR LOGIC IS LOAD-BEARING: the two `is_door_ticket` branches below MUST be
-- preserved by every future recreation of this function. Do not drop them.
--
-- After running: reload the PostgREST schema cache in the Supabase dashboard.

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
         -- DOOR LOGIC (load-bearing): door tickets are admitted on sale
         case when v_tt.is_door_ticket then 'USED' else 'VALID' end,
         gen_random_uuid()::text,
         case when v_tt.is_door_ticket then now() else null end)
      returning id into v_ticket_id;

      -- DOOR LOGIC (load-bearing): record the auto check-in
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
