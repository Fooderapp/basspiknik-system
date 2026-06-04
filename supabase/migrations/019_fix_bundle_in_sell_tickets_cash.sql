-- Migration 019: Fix sell_tickets_cash to handle bundle tickets
--
-- Previously the RPC created exactly quantity tickets per item.
-- Bundles must create quantity × bundle_size individual tickets.
-- Door ticket logic from 018 is preserved.

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

    -- sold tracks bundle units purchased, not individual tickets
    update ticket_types
    set sold = sold + (v_item->>'quantity')::int
    where id = v_tt.id;

    -- Bundles create bundle_size tickets per unit ordered
    v_tickets_to_make := (v_item->>'quantity')::int
      * case when v_tt.is_bundle and v_tt.bundle_size is not null
             then v_tt.bundle_size else 1 end;

    for v_i in 1..v_tickets_to_make loop
      insert into tickets
        (order_id, order_item_id, event_id, ticket_type_id,
         holder_name, ticket_name, status, qr_code, used_at)
      values
        (v_order_id, v_oi_id, p_event_id, v_tt.id,
         coalesce(p_buyer_name, 'Walk-in'), v_tt.name,
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

  return jsonb_build_object(
    'orderId',     v_order_id,
    'total',       v_subtotal,
    'ticketCount', v_ticket_count
  );
end;
$$;

grant execute on function sell_tickets_cash(uuid, text, text, jsonb, uuid) to authenticated;
