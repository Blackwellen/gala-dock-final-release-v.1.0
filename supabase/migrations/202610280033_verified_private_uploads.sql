-- Server-only upload provenance: storage folder ownership alone does not prove sanitization.
create table if not exists public.verified_private_uploads (
 path text primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 mime text not null,
 size_bytes integer not null check(size_bytes>0 and size_bytes<=10485760),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 verified_at timestamptz not null default now()
);
alter table public.verified_private_uploads enable row level security;
revoke all on public.verified_private_uploads from public,anon,authenticated;
grant select on public.verified_private_uploads to authenticated;
grant all on public.verified_private_uploads to service_role;
drop policy if exists verified_upload_owner_read on public.verified_private_uploads;
create policy verified_upload_owner_read on public.verified_private_uploads for select to authenticated using(owner_id=(select auth.uid()));

create or replace function public.guard_request_attachment_ownership() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); files jsonb; file jsonb;
begin
 if tg_op='UPDATE' and new.created_by is distinct from old.created_by then raise exception 'request_creator_immutable' using errcode='42501';end if;
 if tg_op='INSERT' and actor is not null and actor<>new.created_by then raise exception 'request_creator_mismatch' using errcode='42501';end if;
 files:=coalesce(new.requirements->'attachments','[]'::jsonb);
 if tg_op='UPDATE' and files is not distinct from coalesce(old.requirements->'attachments','[]'::jsonb) then return new;end if;
 if jsonb_typeof(files)<>'array' or jsonb_array_length(files)>6 then raise exception 'invalid_request_attachments' using errcode='22023';end if;
 if jsonb_array_length(files)>0 and actor is not null and actor<>new.created_by then raise exception 'request_attachments_owner_only' using errcode='42501';end if;
 for file in select value from jsonb_array_elements(files) loop
  if (file->>'path') is null or (file->>'path') !~ ('^'||new.created_by::text||'/[0-9a-f-]{36}\.(png|jpg|webp|pdf)$') or coalesce(length(file->>'name'),0) not between 1 and 120
    or not exists(select 1 from public.verified_private_uploads v join storage.objects o on o.name=v.path and o.bucket_id='workspace-files'
      where v.path=file->>'path' and v.owner_id=new.created_by and v.mime in ('application/pdf','image/png','image/jpeg','image/webp')) then
   raise exception 'invalid_request_attachment' using errcode='42501';
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.guard_request_attachment_ownership() from public,anon,authenticated;
