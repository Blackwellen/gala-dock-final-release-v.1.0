-- Phase 3 · Space rules: linked/exclusive space pairs and booking enforcement of exclusivity + turnaround buffers.
begin;

-- Canonical pair (space_a < space_b). 'exclusive' pairs can never hold overlapping commitments; 'linked' pairs are suggested together.
create table if not exists public.space_links (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  space_a uuid not null references public.spaces(id) on delete cascade,
  space_b uuid not null references public.spaces(id) on delete cascade,
  kind text not null check (kind in ('linked','exclusive')),
  created_at timestamptz not null default now(),
  primary key (space_a, space_b, kind),
  check (space_a < space_b)
);
create index if not exists space_links_b_idx on public.space_links(space_b);
alter table public.space_links enable row level security;
drop policy if exists space_links_member_read on public.space_links;
create policy space_links_member_read on public.space_links for select to authenticated
  using (public.is_workspace_member(workspace_id) or public.is_platform_admin());

-- Replace a space's links in one call. Partners must be spaces in the same venue.
create or replace function public.provider_set_space_links(p_ws uuid, p_space uuid, p_linked uuid[], p_exclusive uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid; bad int;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  select venue_id into v from public.spaces where id = p_space and workspace_id = p_ws;
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select count(*) into bad from unnest(coalesce(p_linked, '{}') || coalesce(p_exclusive, '{}')) x
    where x = p_space or not exists(select 1 from public.spaces s where s.id = x and s.venue_id = v);
  if bad > 0 then raise exception 'invalid_space_link' using errcode = '22023'; end if;
  delete from public.space_links where space_a = p_space or space_b = p_space;
  insert into public.space_links(workspace_id, space_a, space_b, kind)
    select p_ws, least(p_space, x), greatest(p_space, x), 'linked' from unnest(coalesce(p_linked, '{}')) x
    union select p_ws, least(p_space, x), greatest(p_space, x), 'exclusive' from unnest(coalesce(p_exclusive, '{}')) x
    on conflict do nothing;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), p_ws, 'space.links_updated', jsonb_build_object('space_id', p_space, 'linked', p_linked, 'exclusive', p_exclusive));
end $$;
revoke all on function public.provider_set_space_links(uuid, uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.provider_set_space_links(uuid, uuid, uuid[], uuid[]) to authenticated;

-- Hard commitments respect exclusive partner spaces and the space's turnaround buffer.
-- (Same-space overlap without buffer is already covered by provider_jobs_no_space_overlap.)
create or replace function public.enforce_space_rules() returns trigger language plpgsql set search_path = '' as $$
declare buf interval; clash text;
begin
  if new.space_id is null or new.role <> 'primary' or new.status not in ('held','confirmed','active') then return new; end if;
  if tg_op = 'UPDATE' and old.space_id is not distinct from new.space_id and old.starts_at = new.starts_at and old.ends_at = new.ends_at
     and old.status in ('held','confirmed','active') then return new; end if;
  select make_interval(mins => turnaround_minutes) into buf from public.spaces where id = new.space_id;
  select j.event_name into clash from public.provider_jobs j
    where j.id <> new.id and j.role = 'primary' and j.status in ('held','confirmed','active') and j.space_id = new.space_id
      and tstzrange(j.starts_at, j.ends_at) && tstzrange(new.starts_at - coalesce(buf, interval '0'), new.ends_at + coalesce(buf, interval '0'))
    limit 1;
  if clash is not null then raise exception 'turnaround_conflict' using errcode = '23P01', detail = clash; end if;
  select j.event_name into clash from public.provider_jobs j
    join public.space_links l on l.kind = 'exclusive' and ((l.space_a = new.space_id and l.space_b = j.space_id) or (l.space_b = new.space_id and l.space_a = j.space_id))
    where j.id <> new.id and j.role = 'primary' and j.status in ('held','confirmed','active') and tstzrange(j.starts_at, j.ends_at) && tstzrange(new.starts_at, new.ends_at)
    limit 1;
  if clash is not null then raise exception 'exclusive_conflict' using errcode = '23P01', detail = clash; end if;
  return new;
end $$;
drop trigger if exists provider_jobs_space_rules on public.provider_jobs;
create trigger provider_jobs_space_rules before insert or update on public.provider_jobs for each row execute function public.enforce_space_rules();

commit;
