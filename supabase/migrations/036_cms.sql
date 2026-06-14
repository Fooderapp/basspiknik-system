-- Migration 036: Public site CMS — artists, gallery, homepage content
--
-- Powers the Bass Piknik public site (festival-style homepage + artist pages),
-- editable from the dashboard. All three tables are publicly readable (the
-- public site renders them) and admin/editor-writable.

-- ── Artists (lineup) ─────────────────────────────────────────────────────────
create table if not exists artists (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  genre       text,
  bio         text,
  photo_url   text,
  socials     jsonb not null default '{}'::jsonb,  -- {instagram, soundcloud, spotify, website, facebook}
  featured    boolean not null default false,
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── Gallery ──────────────────────────────────────────────────────────────────
create table if not exists gallery_images (
  id          uuid primary key default gen_random_uuid(),
  image_url   text not null,
  caption     text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ── Homepage content (single row) ────────────────────────────────────────────
create table if not exists site_content (
  id             text primary key default 'home',
  hero_title     text,
  hero_subtitle  text,
  hero_image_url text,
  hero_cta_label text,
  about_title    text,
  about_body     text,
  socials        jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);
insert into site_content (id) values ('home') on conflict (id) do nothing;

-- ── RLS: public read, admin/editor write ─────────────────────────────────────
alter table artists enable row level security;
drop policy if exists artists_read on artists;
create policy artists_read on artists for select using (true);
drop policy if exists artists_write on artists;
create policy artists_write on artists for all using (
  exists (select 1 from profiles where id = auth.uid() and role in ('ADMIN','EDITOR'))
);

alter table gallery_images enable row level security;
drop policy if exists gallery_read on gallery_images;
create policy gallery_read on gallery_images for select using (true);
drop policy if exists gallery_write on gallery_images;
create policy gallery_write on gallery_images for all using (
  exists (select 1 from profiles where id = auth.uid() and role in ('ADMIN','EDITOR'))
);

alter table site_content enable row level security;
drop policy if exists site_read on site_content;
create policy site_read on site_content for select using (true);
drop policy if exists site_write on site_content;
create policy site_write on site_content for all using (
  exists (select 1 from profiles where id = auth.uid() and role in ('ADMIN','EDITOR'))
);

notify pgrst, 'reload schema';
