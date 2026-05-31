-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 013: Per-user Apple Wallet pass + event-scoped check-in
--
-- New model: ONE Wallet pass per user. The pass QR encodes a stable, random
-- `wallet_token` (NOT the ticket QR). At the door the operator picks the event,
-- scans the user's single pass, and we check in that user's next VALID ticket
-- for the selected event.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Per-user wallet token ─────────────────────────────────────────────────
alter table profiles
  add column if not exists wallet_token text unique default uuid_generate_v4()::text;

-- Backfill any rows that pre-date the default
update profiles
set wallet_token = uuid_generate_v4()::text
where wallet_token is null;

create index if not exists profiles_wallet_token_idx on profiles(wallet_token);


-- ── 2. checkin_user_ticket ───────────────────────────────────────────────────
-- Called by: Check-In Scanner (after operator selects an event)
-- Auth: must be ADMIN / EDITOR / STAFF / SELLER / BARTENDER
-- Behaviour: checks in ONE valid ticket per scan (oldest first). Scan again to
-- admit the next person on the same buyer's order.
create or replace function checkin_user_ticket(p_wallet_token text, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text;
  v_user_id   uuid;
  v_ticket    tickets%rowtype;
  v_remaining int;
begin
  -- Authorise operator
  select role::text into v_role from profiles where id = auth.uid();
  if v_role is null or v_role not in ('ADMIN','EDITOR','STAFF','SELLER','BARTENDER') then
    return jsonb_build_object('success', false, 'message', 'Unauthorized');
  end if;

  -- Resolve user from wallet token
  select id into v_user_id from profiles where wallet_token = p_wallet_token;
  if v_user_id is null then
    return jsonb_build_object('success', false, 'message', 'Unknown pass');
  end if;

  -- Find the next VALID ticket for this user + event (oldest first)
  select t.* into v_ticket
  from tickets t
  join orders o on o.id = t.order_id
  where o.user_id = v_user_id
    and t.event_id = p_event_id
    and t.status = 'VALID'
  order by t.created_at asc
  limit 1;

  if not found then
    -- Distinguish "none for this event" vs "all already used"
    if exists (
      select 1 from tickets t
      join orders o on o.id = t.order_id
      where o.user_id = v_user_id and t.event_id = p_event_id
    ) then
      return jsonb_build_object('success', false, 'message', 'All tickets already checked in');
    end if;
    return jsonb_build_object('success', false, 'message', 'No ticket for this event');
  end if;

  -- Check in
  update tickets
  set status = 'USED', used_at = now()
  where id = v_ticket.id;

  insert into check_ins (ticket_id, event_id, checked_in_by)
  values (v_ticket.id, p_event_id, auth.uid())
  on conflict do nothing;

  -- How many valid tickets remain for this user + event after this one
  select count(*) into v_remaining
  from tickets t
  join orders o on o.id = t.order_id
  where o.user_id = v_user_id
    and t.event_id = p_event_id
    and t.status = 'VALID';

  return jsonb_build_object(
    'success',     true,
    'ticketId',    v_ticket.id,
    'holderName',  v_ticket.holder_name,
    'ticketName',  v_ticket.ticket_name,
    'tier',        v_ticket.tier::text,
    'usedAt',      now(),
    'remaining',   v_remaining
  );
end;
$$;

grant execute on function checkin_user_ticket(text, uuid) to authenticated;
