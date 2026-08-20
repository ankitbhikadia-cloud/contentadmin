-- The 'shorts' storage bucket previously allowed any authenticated user
-- to read/write/delete any object in it, regardless of which channel it
-- belonged to. Uploaded files live at `${channelId}/${uuid}-filename`
-- (see ImportClient.tsx), so the first path segment is the channel ID —
-- scope storage access the same way the DB rows are now scoped.

drop policy if exists "authenticated read shorts bucket" on storage.objects;
drop policy if exists "authenticated write shorts bucket" on storage.objects;
drop policy if exists "authenticated update shorts bucket" on storage.objects;
drop policy if exists "authenticated delete shorts bucket" on storage.objects;

create policy "members read shorts bucket" on storage.objects for select to authenticated
  using (bucket_id = 'shorts' and is_channel_member(((storage.foldername(name))[1])::uuid));

create policy "members write shorts bucket" on storage.objects for insert to authenticated
  with check (bucket_id = 'shorts' and is_channel_member(((storage.foldername(name))[1])::uuid));

create policy "members update shorts bucket" on storage.objects for update to authenticated
  using (bucket_id = 'shorts' and is_channel_member(((storage.foldername(name))[1])::uuid));

create policy "members delete shorts bucket" on storage.objects for delete to authenticated
  using (bucket_id = 'shorts' and is_channel_member(((storage.foldername(name))[1])::uuid));
