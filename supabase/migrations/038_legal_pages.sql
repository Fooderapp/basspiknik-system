-- Migration 038: Legal pages — Privacy Policy, ÁSZF, Impresszum
-- Content is editable from the admin dashboard.
-- Publicly readable; only ADMINs can write.

create table if not exists legal_pages (
  slug        text primary key,       -- 'privacy-policy' | 'aszf' | 'impresszum'
  title_hu    text not null default '',
  title_en    text not null default '',
  content_hu  text not null default '',
  content_en  text not null default '',
  updated_at  timestamptz not null default now()
);

alter table legal_pages enable row level security;

create policy "legal_pages_public_read"
  on legal_pages for select using (true);

create policy "legal_pages_admin_write"
  on legal_pages for all
  using (get_my_role() = 'ADMIN')
  with check (get_my_role() = 'ADMIN');

-- Seed default rows (empty content — admin fills in the dashboard)
insert into legal_pages (slug, title_hu, title_en) values
  ('privacy-policy', 'Adatvédelmi Szabályzat', 'Privacy Policy'),
  ('aszf',           'ÁSZF',                   'Terms and Conditions'),
  ('impresszum',     'Impresszum',              'Imprint')
on conflict (slug) do nothing;
