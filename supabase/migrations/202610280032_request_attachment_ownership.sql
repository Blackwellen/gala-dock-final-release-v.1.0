-- Guard the source metadata used to authorize private request attachment downloads.
create or replace function public.guard_request_attachment_ownership() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); files jsonb; file jsonb;
begin
 if tg_op='UPDATE' and new.created_by is distinct from old.created_by then raise exception 'request_creator_immutable' using errcode='42501'; end if;
 if tg_op='INSERT' and actor is not null and actor<>new.created_by then raise exception 'request_creator_mismatch' using errcode='42501'; end if;
 files:=coalesce(new.requirements->'attachments','[]'::jsonb);
 if tg_op='UPDATE' and files is not distinct from coalesce(old.requirements->'attachments','[]'::jsonb) then return new;end if;
 if jsonb_typeof(files)<>'array' or jsonb_array_length(files)>6 then raise exception 'invalid_request_attachments' using errcode='22023';end if;
 if jsonb_array_length(files)>0 and actor is not null and actor<>new.created_by then raise exception 'request_attachments_owner_only' using errcode='42501';end if;
 for file in select value from jsonb_array_elements(files) loop
  if (file->>'path') is null or (file->>'path') !~ ('^'||new.created_by::text||'/[0-9a-f-]{36}\.(png|jpg|webp|pdf)$') or coalesce(length(file->>'name'),0) not between 1 and 120
   or not exists(select 1 from storage.objects where bucket_id='workspace-files' and name=file->>'path') then
   raise exception 'invalid_request_attachment' using errcode='42501';
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.guard_request_attachment_ownership() from public,anon,authenticated;
drop trigger if exists request_attachment_ownership on public.provider_requests;
create trigger request_attachment_ownership before insert or update on public.provider_requests for each row execute function public.guard_request_attachment_ownership();
