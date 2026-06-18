-- Map venues: admin-managed map markers with popup content
create table if not exists map_venues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  lat         double precision not null,
  lng         double precision not null,
  maps_url    text not null default '',
  description_hu text not null default '',
  description_en text not null default '',
  images      text[] not null default '{}',
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table map_venues enable row level security;

-- Public read (active venues shown on landing page)
create policy "map_venues_public_read" on map_venues
  for select using (active = true);

-- Admins can do anything
create policy "map_venues_admin_all" on map_venues
  for all using (get_my_role() = 'ADMIN')
  with check (get_my_role() = 'ADMIN');

-- Seed with the existing hardcoded venue so the map still works after migration
insert into map_venues (name, lat, lng, maps_url, description_hu, description_en, images, sort_order)
values (
  'Tó-Part Panzió',
  47.3975366,
  16.535894,
  'https://www.google.com/maps/place/T%C3%B3-Part+Panzi%C3%B3/@47.3975366,16.535894,17z',
  'A Bass Piknik tóparti otthona. Egy nyugodt tó partján Kőszeg mellett, Nyugat-Magyarországon, erdővel és nyílt éggel körülölelve. Sátorozz a víz mellett, táncolj a csillagok alatt.',
  'Our lakeside home for Bass Piknik. Set on the calm shore of a lake just outside Kőszeg in Western Hungary, wrapped in forest and open sky. Camp by the water, dance under the stars.',
  '{}',
  0
);
