-- Storage bucket for event cover images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-covers',
  'event-covers',
  true,
  10485760,  -- 10 MB
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

-- Anyone can read (public bucket)
create policy "event_covers_public_read" on storage.objects
  for select using (bucket_id = 'event-covers');

-- Admins/Editors can upload
create policy "event_covers_editor_insert" on storage.objects
  for insert with check (
    bucket_id = 'event-covers'
    and public.get_my_role() in ('ADMIN','EDITOR')
  );

-- Admins/Editors can update/delete their uploads
create policy "event_covers_editor_update" on storage.objects
  for update using (
    bucket_id = 'event-covers'
    and public.get_my_role() in ('ADMIN','EDITOR')
  );

create policy "event_covers_editor_delete" on storage.objects
  for delete using (
    bucket_id = 'event-covers'
    and public.get_my_role() in ('ADMIN','EDITOR')
  );
