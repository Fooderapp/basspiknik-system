-- Migration 042: drink delete fix + PREORDER status + preorder registrations + push tokens

-- ── 1. Fix drink delete: make FK nullable + SET NULL so historical orders survive ──
alter table drink_order_items alter column drink_id drop not null;
alter table drink_order_items drop constraint if exists drink_order_items_drink_id_fkey;
alter table drink_order_items
  add constraint drink_order_items_drink_id_fkey
  foreign key (drink_id) references drinks(id) on delete set null;

-- ── 2. Add PREORDER to event_status enum ──
alter type event_status add value if not exists 'PREORDER';

-- ── 3. Allow PREORDER events to be publicly readable ──
drop policy if exists "events_public_read" on events;
create policy "events_public_read" on events
  for select using (status in ('PUBLISHED', 'PREORDER'));

-- ── 4. Preorder registrations ──
create table if not exists event_preorders (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  email      text not null,
  name       text,
  user_id    uuid references auth.users(id) on delete set null,
  notified   boolean not null default false,
  created_at timestamptz not null default now(),
  unique(event_id, email)
);

alter table event_preorders enable row level security;

create policy "event_preorders_insert" on event_preorders
  for insert with check (true);

create policy "event_preorders_own_read" on event_preorders
  for select using (user_id = auth.uid());

create policy "event_preorders_admin" on event_preorders
  for all using (get_my_role() in ('ADMIN', 'EDITOR'));

-- ── 5. Push notification tokens ──
create table if not exists push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null,
  platform   text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  unique(user_id, token)
);

alter table push_tokens enable row level security;

create policy "push_tokens_own" on push_tokens
  for all using (user_id = auth.uid());

create policy "push_tokens_admin_read" on push_tokens
  for select using (get_my_role() in ('ADMIN'));
