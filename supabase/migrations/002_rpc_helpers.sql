-- Increment ticket sold count safely (used in Stripe webhook)
create or replace function increment_ticket_sold(p_ticket_type_id uuid, p_amount int)
returns void language sql security definer as $$
  update ticket_types set sold = sold + p_amount where id = p_ticket_type_id;
$$;

-- Increment promo code used count
create or replace function increment_promo_used(p_promo_id uuid)
returns void language sql security definer as $$
  update promo_codes set used_count = used_count + 1 where id = p_promo_id;
$$;

-- Get analytics summary (used by admin dashboard)
create or replace function get_analytics()
returns json language plpgsql security definer as $$
declare
  result json;
begin
  select json_build_object(
    'gross_revenue', coalesce((select sum(total) from orders where status = 'PAID'), 0),
    'refunds',       coalesce((select sum(total) from orders where status = 'REFUNDED'), 0),
    'ticket_count',  (select count(*) from tickets),
    'order_count',   (select count(*) from orders where status = 'PAID'),
    'guest_count',   (select count(*) from profiles where role in ('GUEST','VIP_GUEST'))
  ) into result;
  return result;
end;
$$;
