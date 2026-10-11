-- Phase 3 · Public listing media (venue/space/package photos). Readable by anyone; writable only by a provider workspace's owners/managers,
-- and only inside that workspace's folder: listing-media/<workspace_id>/<file>.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-media', 'listing-media', true, 10485760, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_write_listing_media(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when (storage.foldername(object_name))[1] ~ '^[0-9a-f-]{36}$'
    then exists(select 1 from public.workspaces w where w.id = ((storage.foldername(object_name))[1])::uuid and w.kind = 'provider')
         and public.has_workspace_role(((storage.foldername(object_name))[1])::uuid, array['owner','manager'])
    else false end
$$;
revoke all on function public.can_write_listing_media(text) from public, anon;
grant execute on function public.can_write_listing_media(text) to authenticated;

drop policy if exists listing_media_insert on storage.objects;
create policy listing_media_insert on storage.objects for insert to authenticated with check (bucket_id = 'listing-media' and public.can_write_listing_media(name));
drop policy if exists listing_media_delete on storage.objects;
create policy listing_media_delete on storage.objects for delete to authenticated using (bucket_id = 'listing-media' and public.can_write_listing_media(name));
commit;
