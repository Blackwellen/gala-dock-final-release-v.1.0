-- Bind proof to the exact uploaded object, not a reusable path. Deleting and replacing
-- an object invalidates its proof even when the caller uses the same storage filename.
alter table public.verified_private_uploads add column if not exists object_id uuid references storage.objects(id) on delete cascade;
create or replace function public.guard_request_upload_version() returns trigger
language plpgsql security definer set search_path='' as $$
declare file jsonb; files jsonb:=coalesce(new.requirements->'attachments','[]'::jsonb);
begin
 if tg_op='UPDATE' and files is not distinct from coalesce(old.requirements->'attachments','[]'::jsonb) then return new;end if;
 for file in select value from jsonb_array_elements(files) loop
  if not exists(select 1 from public.verified_private_uploads v join storage.objects o on o.id=v.object_id and o.name=v.path and o.bucket_id='workspace-files'
    where v.path=file->>'path' and v.owner_id=new.created_by) then raise exception 'request_upload_not_verified' using errcode='42501';end if;
 end loop;
 return new;
end $$;
revoke all on function public.guard_request_upload_version() from public,anon,authenticated;
drop trigger if exists request_upload_version on public.provider_requests;
create trigger request_upload_version before insert or update on public.provider_requests for each row execute function public.guard_request_upload_version();
