-- Migration 017: Accept wallet pass OR ticket QR; proper multi-entry handling
--
-- Changes to checkin_user_ticket:
--   1. p_wallet_token now also accepts tickets.qr_code (tries wallet_token first)
--   2. Multi-entry tickets (entries_per_ticket > 1) are NOT marked USED on first
--      scan — each scan creates a check_in row; USED only when all entries done
--   3. Returns additional fields:
--        isMultiEntry  bool  – true when entries_per_ticket > 1
--        entriesLeft   int   – remaining entry slots on this ticket (multi-entry only)
--        remaining     int   – remaining VALID tickets for this user at this event
--                             (wallet-pass path only; null for direct ticket QR scans)

create or replace function checkin_user_ticket(p_wallet_token text, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role               text;
  v_user_id            uuid;
  v_ticket             tickets%rowtype;
  v_entries_per_ticket int;
  v_entries_used       int;
  v_entries_left       int;
  v_remaining          int;
  v_is_wallet_scan     bool := false;
begin
  -- Authorise operator
  select role::text into v_role from profiles where id = auth.uid();
  if v_role is null or v_role not in ('ADMIN','EDITOR','STAFF','SELLER','BARTENDER') then
    return jsonb_build_object('success', false, 'message', 'Unauthorized');
  end if;

  -- ── Path A: wallet pass (resolve user by wallet_token) ───────────────────────
  select id into v_user_id from profiles where wallet_token = p_wallet_token;

  if v_user_id is not null then
    v_is_wallet_scan := true;

    -- Find this user's next valid ticket for the selected event
    select t.* into v_ticket
    from tickets t
    join orders o on o.id = t.order_id
    where o.user_id = v_user_id
      and t.event_id = p_event_id
      and t.status = 'VALID'
    order by t.created_at asc
    limit 1;

    if not found then
      if exists (
        select 1 from tickets t
        join orders o on o.id = t.order_id
        where o.user_id = v_user_id and t.event_id = p_event_id
      ) then
        return jsonb_build_object('success', false, 'message', 'All tickets already checked in');
      end if;
      return jsonb_build_object('success', false, 'message', 'No ticket for this event');
    end if;

  else
    -- ── Path B: individual ticket QR (tickets.qr_code) ──────────────────────────
    select t.* into v_ticket from tickets t where t.qr_code = p_wallet_token;

    if not found then
      return jsonb_build_object('success', false, 'message', 'Unknown pass');
    end if;

    if v_ticket.event_id <> p_event_id then
      return jsonb_build_object('success', false, 'message', 'Ticket is for a different event');
    end if;

    if v_ticket.status in ('CANCELLED', 'REFUNDED') then
      return jsonb_build_object('success', false, 'message', 'Ticket cancelled');
    end if;

    -- Get buyer for the remaining-count query later
    select o.user_id into v_user_id from orders o where o.id = v_ticket.order_id;
  end if;

  -- ── Get ticket type entries_per_ticket ────────────────────────────────────────
  select coalesce(tt.entries_per_ticket, 1) into v_entries_per_ticket
  from ticket_types tt where tt.id = v_ticket.ticket_type_id;

  v_entries_per_ticket := coalesce(v_entries_per_ticket, 1);

  -- ── Count existing check-ins for this ticket ──────────────────────────────────
  select count(*) into v_entries_used from check_ins where ticket_id = v_ticket.id;

  -- Already exhausted?
  if v_entries_used >= v_entries_per_ticket then
    if v_entries_per_ticket > 1 then
      return jsonb_build_object('success', false, 'message', 'All entries used');
    else
      return jsonb_build_object('success', false, 'message', 'Already checked in');
    end if;
  end if;

  -- ── Insert check-in ───────────────────────────────────────────────────────────
  insert into check_ins (ticket_id, event_id, checked_in_by)
  values (v_ticket.id, p_event_id, auth.uid())
  on conflict do nothing;

  v_entries_left := v_entries_per_ticket - v_entries_used - 1;

  -- Mark USED only when all entries are consumed
  if v_entries_left <= 0 then
    update tickets set status = 'USED', used_at = now() where id = v_ticket.id;
  end if;

  -- ── Remaining valid tickets for this user at this event (wallet scan only) ────
  if v_is_wallet_scan and v_entries_per_ticket = 1 then
    select count(*) into v_remaining
    from tickets t
    join orders o on o.id = t.order_id
    where o.user_id = v_user_id
      and t.event_id = p_event_id
      and t.status = 'VALID';
  end if;

  return jsonb_build_object(
    'success',      true,
    'ticketId',     v_ticket.id,
    'holderName',   v_ticket.holder_name,
    'ticketName',   v_ticket.ticket_name,
    'tier',         v_ticket.tier::text,
    'usedAt',       now(),
    'isMultiEntry', v_entries_per_ticket > 1,
    'entriesLeft',  case when v_entries_per_ticket > 1 then v_entries_left else null end,
    'remaining',    case when v_is_wallet_scan and v_entries_per_ticket = 1 then v_remaining else null end
  );
end;
$$;

grant execute on function checkin_user_ticket(text, uuid) to authenticated;
