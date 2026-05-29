-- App-wide settings (single row, always id = 'global')
create table if not exists app_settings (
  id       text primary key default 'global',
  currency text not null default 'EUR',   -- EUR | USD | HUF
  language text not null default 'en',    -- en  | hu
  updated_at timestamptz default now(),
  updated_by uuid references profiles(id) on delete set null
);

-- Seed the default row so the app always has something to read
insert into app_settings (id) values ('global')
  on conflict (id) do nothing;

-- Only admins can read / write settings
alter table app_settings enable row level security;

create policy "settings_select" on app_settings
  for select using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'ADMIN'
    )
  );

create policy "settings_update" on app_settings
  for update using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'ADMIN'
    )
  );
