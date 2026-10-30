-- A readable event-file record must not become a signing proxy for arbitrary storage paths.
alter table public.media_assets add column if not exists storage_object_id uuid;
alter table public.media_assets add column if not exists source_verified boolean not null default false;

-- Capture existing objects without certifying historical upload bytes. The download
-- route retains uploader access and the old explicit /events/<event>/ source scope.
update public.media_assets a set storage_object_id=o.id
from storage.objects o where o.bucket_id='workspace-files' and o.name=a.url and a.storage_object_id is null;

create or replace function public.guard_media_file_source() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); source_id uuid; source_owner uuid;
begin
 if tg_op='UPDATE' and new.url is not distinct from old.url then
  if new.storage_object_id is distinct from old.storage_object_id or new.source_verified is distinct from old.source_verified then
   raise exception 'private_file_source_immutable' using errcode='42501';
  end if;
  return new;
 end if;
 new.storage_object_id:=null;new.source_verified:=false;
 if new.url ~ '^[0-9a-f-]{36}/' then
  if actor is not null and split_part(new.url,'/',1)<>actor::text then raise exception 'private_file_source_not_owned' using errcode='42501';end if;
  if actor is null then
   -- Trusted server exports produce their own bytes after authorizing the publisher.
   select id into source_id from storage.objects where bucket_id='workspace-files' and name=new.url;
  else
   select v.object_id,v.owner_id into source_id,source_owner from public.verified_private_uploads v
    join storage.objects o on o.id=v.object_id and o.name=v.path and o.bucket_id='workspace-files'
    where v.path=new.url and v.owner_id=actor;
  end if;
  if source_id is null then raise exception 'private_file_source_unverified' using errcode='42501';end if;
  new.storage_object_id:=source_id;new.source_verified:=true;
 end if;
 return new;
end $$;
revoke all on function public.guard_media_file_source() from public,anon,authenticated;
drop trigger if exists media_file_source_guard on public.media_assets;
create trigger media_file_source_guard before insert or update on public.media_assets for each row execute function public.guard_media_file_source();

create or replace function public.event_file_object_matches(p_asset uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.media_assets a join storage.objects o on o.id=a.storage_object_id and o.name=a.url and o.bucket_id='workspace-files'
  where a.id=p_asset and ((a.event_id is not null and public.can_access_event(a.event_id)) or (a.workspace_id is not null and public.is_workspace_member(a.workspace_id)))
 );
$$;
revoke all on function public.event_file_object_matches(uuid) from public,anon;
grant execute on function public.event_file_object_matches(uuid) to authenticated;
