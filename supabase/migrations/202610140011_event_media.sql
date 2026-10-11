-- ORG-015 poster/media builder: public event-media bucket; uploads only inside a workspace folder the caller belongs to.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('event-media', 'event-media', true, 10485760, array['image/png','image/jpeg','image/webp'])
  on conflict (id) do update set public = true, file_size_limit = 10485760, allowed_mime_types = array['image/png','image/jpeg','image/webp'];
drop policy if exists event_media_insert on storage.objects;
drop policy if exists event_media_delete on storage.objects;
create policy event_media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'event-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy event_media_delete on storage.objects for delete to authenticated using (
  bucket_id = 'event-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
