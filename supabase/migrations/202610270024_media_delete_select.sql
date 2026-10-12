-- Let workspace members delete their own event/listing images. Storage deletes first SELECT the object, and these public buckets had no
-- select policy for signed-in users (public reads go through public URLs), so removes silently matched nothing. Scope: own workspace folder.
drop policy if exists event_media_select on storage.objects;
create policy event_media_select on storage.objects for select to authenticated
  using (bucket_id = 'event-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
drop policy if exists listing_media_select on storage.objects;
create policy listing_media_select on storage.objects for select to authenticated
  using (bucket_id = 'listing-media' and public.can_write_listing_media(name));
