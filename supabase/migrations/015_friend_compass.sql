-- Friend Compass
-- compass_groups: bidirectional event-scoped friend pairs (created by QR scan)
-- event_locations: fuzzed GPS position per user per event

create table if not exists compass_groups (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  user_id_a   uuid not null references profiles(id) on delete cascade,
  user_id_b   uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (event_id, user_id_a, user_id_b)
);

create index if not exists compass_groups_a_idx on compass_groups(event_id, user_id_a);
create index if not exists compass_groups_b_idx on compass_groups(event_id, user_id_b);

create table if not exists event_locations (
  user_id     uuid primary key references profiles(id) on delete cascade,
  event_id    uuid not null references events(id) on delete cascade,
  fuzzy_lat   double precision not null,
  fuzzy_lng   double precision not null,
  updated_at  timestamptz not null default now()
);

create index if not exists event_locations_event_idx on event_locations(event_id);

-- RLS
alter table compass_groups enable row level security;
alter table event_locations enable row level security;

-- compass_groups: visible only to the two members
create policy "compass_groups_members" on compass_groups for select
  using (auth.uid() = user_id_a or auth.uid() = user_id_b);

create policy "compass_groups_insert" on compass_groups for insert
  with check (auth.uid() = user_id_a);

create policy "compass_groups_delete" on compass_groups for delete
  using (auth.uid() = user_id_a or auth.uid() = user_id_b);

-- event_locations: only visible to users who share a compass_group in same event
create policy "event_locations_select" on event_locations for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from compass_groups cg
      where cg.event_id = event_locations.event_id
        and (
          (cg.user_id_a = auth.uid() and cg.user_id_b = event_locations.user_id)
          or
          (cg.user_id_b = auth.uid() and cg.user_id_a = event_locations.user_id)
        )
    )
  );

create policy "event_locations_upsert" on event_locations for insert
  with check (auth.uid() = user_id);

create policy "event_locations_update" on event_locations for update
  using (auth.uid() = user_id);

create policy "event_locations_delete" on event_locations for delete
  using (auth.uid() = user_id);

-- RPC: add friend by wallet_token (called after QR scan)
-- Creates both directions of the pair atomically.
create or replace function add_compass_friend(
  p_wallet_token text,
  p_event_id     uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_friend   uuid;
  v_name     text;
begin
  if v_me is null then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  select id, name into v_friend, v_name
  from profiles where wallet_token = p_wallet_token;

  if v_friend is null then
    return jsonb_build_object('error', 'User not found');
  end if;

  if v_friend = v_me then
    return jsonb_build_object('error', 'Cannot add yourself');
  end if;

  -- Insert both directions (ignore conflicts)
  insert into compass_groups (event_id, user_id_a, user_id_b)
  values (p_event_id, v_me, v_friend)
  on conflict do nothing;

  insert into compass_groups (event_id, user_id_a, user_id_b)
  values (p_event_id, v_friend, v_me)
  on conflict do nothing;

  return jsonb_build_object('ok', true, 'name', v_name, 'id', v_friend);
end;
$$;

grant execute on function add_compass_friend(text, uuid) to authenticated;

-- RPC: upsert my fuzzed location (±40m noise applied server-side)
create or replace function upsert_my_location(
  p_event_id uuid,
  p_lat      double precision,
  p_lng      double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  -- ~40m of noise: 1 degree lat ≈ 111km, so 0.00036 deg ≈ 40m
  v_noise_m double precision := 0.00036;
  v_fuzzy_lat double precision;
  v_fuzzy_lng double precision;
begin
  if v_me is null then return; end if;

  -- Add deterministic-ish noise per user so position doesn't jump each update
  v_fuzzy_lat := p_lat + (random() - 0.5) * v_noise_m;
  v_fuzzy_lng := p_lng + (random() - 0.5) * v_noise_m;

  insert into event_locations (user_id, event_id, fuzzy_lat, fuzzy_lng, updated_at)
  values (v_me, p_event_id, v_fuzzy_lat, v_fuzzy_lng, now())
  on conflict (user_id) do update
    set event_id   = excluded.event_id,
        fuzzy_lat  = excluded.fuzzy_lat,
        fuzzy_lng  = excluded.fuzzy_lng,
        updated_at = now();
end;
$$;

grant execute on function upsert_my_location(uuid, double precision, double precision) to authenticated;
