-- Custom drink categories so the admin can organise the bar menu freely.
-- The existing drink_category enum stays on drinks.category for legacy data;
-- drinks.category_id is the new FK that takes precedence in the UI.

create table if not exists drink_categories (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  name_hu    text,
  emoji      text        not null default '🍹',
  color      text        not null default '#374151',
  sort_order int         not null default 0,
  created_at timestamptz not null default now()
);

-- Seed with the built-in enum values so existing drinks remain consistent
insert into drink_categories (name, name_hu, emoji, color, sort_order) values
  ('Cocktail',   'Koktél',  '🍹', '#db2777', 0),
  ('Beer',       'Sör',     '🍺', '#d97706', 1),
  ('Wine',       'Bor',     '🍷', '#dc2626', 2),
  ('Spirit',     'Tömény',  '🥃', '#ea580c', 3),
  ('Soft Drink', 'Üdítő',   '🥤', '#0891b2', 4),
  ('Shot',       'Shot',    '🥊', '#9333ea', 5),
  ('Other',      'Egyéb',   '🍶', '#6b7280', 6)
on conflict do nothing;

-- Add FK to drinks (nullable so existing rows are unaffected)
alter table drinks add column if not exists category_id uuid references drink_categories(id) on delete set null;

-- RLS
alter table drink_categories enable row level security;

create policy "drink_categories_select" on drink_categories
  for select using (true);

create policy "drink_categories_admin_insert" on drink_categories
  for insert with check (get_my_role() in ('ADMIN', 'EDITOR'));

create policy "drink_categories_admin_update" on drink_categories
  for update using (get_my_role() in ('ADMIN', 'EDITOR'));

create policy "drink_categories_admin_delete" on drink_categories
  for delete using (get_my_role() in ('ADMIN', 'EDITOR'));
