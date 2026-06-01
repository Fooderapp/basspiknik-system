-- ── 1. profiles.display_id  (Bass-XXXXXX) ──────────────────────────────────
alter table profiles
  add column if not exists display_id text unique;

-- Back-fill existing profiles
update profiles
set display_id = 'Bass-' || upper(substring(encode(gen_random_bytes(3), 'hex'), 1, 6))
where display_id is null;

-- Auto-generate for new profiles via trigger
create or replace function set_profile_display_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.display_id is null then
    loop
      new.display_id := 'Bass-' || upper(substring(encode(gen_random_bytes(3), 'hex'), 1, 6));
      exit when not exists (select 1 from profiles where display_id = new.display_id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_profile_display_id on profiles;
create trigger trg_set_profile_display_id
  before insert on profiles
  for each row execute function set_profile_display_id();

-- ── 2. tickets.transferred_to_user_id ───────────────────────────────────────
alter table tickets
  add column if not exists transferred_to_user_id uuid references profiles(id);

create index if not exists tickets_transferred_to_idx on tickets(transferred_to_user_id);

-- Update RLS: owner via order OR recipient of transfer
drop policy if exists "tickets_own" on tickets;
create policy "tickets_own" on tickets for select
  using (
    transferred_to_user_id = auth.uid()
    or exists (
      select 1 from orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );

-- ── 3. transfer_ticket RPC ───────────────────────────────────────────────────
-- p_to_identifier = wallet_token (UUID) OR display_id (Bass-XXXXXX)
create or replace function transfer_ticket(
  p_ticket_id    uuid,
  p_to_identifier text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := auth.uid();
  v_ticket    tickets%rowtype;
  v_order     orders%rowtype;
  v_recipient profiles%rowtype;
begin
  if v_me is null then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  -- Load ticket
  select * into v_ticket from tickets where id = p_ticket_id;
  if not found then
    return jsonb_build_object('error', 'Ticket not found');
  end if;

  if v_ticket.status <> 'VALID' then
    return jsonb_build_object('error', 'Only VALID tickets can be transferred');
  end if;

  -- Verify ownership: original order owner OR current transfer holder
  select * into v_order from orders where id = v_ticket.order_id;
  if v_order.user_id <> v_me and v_ticket.transferred_to_user_id <> v_me then
    return jsonb_build_object('error', 'You do not own this ticket');
  end if;

  -- Resolve recipient by wallet_token (UUID) or display_id (Bass-...)
  if p_to_identifier ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into v_recipient from profiles where wallet_token = p_to_identifier;
  else
    select * into v_recipient from profiles where lower(display_id) = lower(p_to_identifier);
  end if;

  if not found or v_recipient.id is null then
    return jsonb_build_object('error', 'Recipient not found');
  end if;

  if v_recipient.id = v_me then
    return jsonb_build_object('error', 'Cannot transfer to yourself');
  end if;

  -- Transfer
  update tickets
  set
    transferred_to_user_id = v_recipient.id,
    holder_name = v_recipient.name
  where id = p_ticket_id;

  return jsonb_build_object(
    'ok',            true,
    'recipientName', v_recipient.name,
    'recipientId',   v_recipient.id,
    'displayId',     v_recipient.display_id
  );
end;
$$;

grant execute on function transfer_ticket(uuid, text) to authenticated;

-- ── 4. look_up_user RPC (resolve display_id or wallet_token → name/id) ─────
create or replace function look_up_user(p_identifier text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile profiles%rowtype;
begin
  if p_identifier ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into v_profile from profiles where wallet_token = p_identifier;
  else
    select * into v_profile from profiles where lower(display_id) = lower(p_identifier);
  end if;

  if not found then
    return jsonb_build_object('error', 'User not found');
  end if;

  return jsonb_build_object(
    'id',          v_profile.id,
    'name',        v_profile.name,
    'displayId',   v_profile.display_id
  );
end;
$$;

grant execute on function look_up_user(text) to authenticated;
