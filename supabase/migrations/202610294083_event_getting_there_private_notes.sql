-- Getting-there notes out of events.settings (lane D follow-up, 2026-10-29). events.settings is anon-readable for public events, so
-- notes saved with the public switch OFF were readable through REST. They now live in a private table:
--   event_getting_there (event_id pk) — notes jsonb (7 whitelisted keys), public bool, updated_by / updated_at.
--   RLS: event members read (can_access_event); no client write policies — managers write through event_getting_there_save.
--   anon has no privilege on the table at all.
-- event_getting_there_save: writes the table and drops any legacy settings.getting_there key of that event.
-- public_event_getting_there: notes only when public; reads the table, falls back to legacy settings.getting_there only while an event
--   has no table row (transition; the backfill below leaves none).
-- Backfill: copies existing settings.getting_there into the table, then removes the key with an idempotent update bounded to rows that
-- still carry it (settings ? 'getting_there'); nothing else in settings is touched.

create table if not exists public.event_getting_there (
  event_id uuid primary key references public.events(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  notes jsonb not null default '{}'::jsonb check (jsonb_typeof(notes) = 'object'),
  public boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
comment on table public.event_getting_there is 'Ops › Logistics public getting-there notes (transit, parking, accessible, dropoff, shuttle, rideshare, cycle). Private until public = true; written only by event_getting_there_save; read publicly only through public_event_getting_there.';
alter table public.event_getting_there enable row level security;
revoke all on table public.event_getting_there from anon, authenticated;
grant select on table public.event_getting_there to authenticated;
drop policy if exists event_getting_there_member_read on public.event_getting_there;
create policy event_getting_there_member_read on public.event_getting_there for select to authenticated using (public.can_access_event(event_id));

create or replace function public.event_getting_there_save(p_event uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.events; notes jsonb := '{}'::jsonb; k text; v text; pk uuid[]; sh uuid[]; bad int; pub boolean;
begin
  e := public.ops_event_require(p_event);
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  foreach k in array array['parking', 'transit', 'shuttle', 'dropoff', 'accessible', 'cycle', 'rideshare'] loop
    if p ? k and jsonb_typeof(p -> k) not in ('string', 'null') then raise exception 'invalid_input' using errcode = '22023', detail = k; end if;
    v := btrim(coalesce(p ->> k, ''));
    if length(v) > 500 then raise exception 'note_too_long' using errcode = '22023', detail = k; end if;
    if v <> '' then notes := notes || jsonb_build_object(k, v); end if;
  end loop;
  pub := coalesce((p ->> 'public')::boolean, false);

  if jsonb_typeof(p -> 'parking_ids') = 'array' then
    select coalesce(array_agg(x::uuid), '{}') into pk from jsonb_array_elements_text(p -> 'parking_ids') x;
    select count(*) into bad from unnest(pk) i where not exists (select 1 from public.parking_areas a where a.id = i and a.event_id = e.id and a.kind in ('general', 'accessible', 'mixed'));
    if bad > 0 then raise exception 'parking_not_public' using errcode = '22023', detail = 'Only general, accessible or mixed areas of this event can be public.'; end if;
    update public.parking_areas set public_page = (id = any(pk)) where event_id = e.id and public_page is distinct from (id = any(pk));
  end if;
  if jsonb_typeof(p -> 'shuttle_ids') = 'array' then
    select coalesce(array_agg(x::uuid), '{}') into sh from jsonb_array_elements_text(p -> 'shuttle_ids') x;
    select count(*) into bad from unnest(sh) i where not exists (select 1 from public.transport_movements m where m.id = i and m.event_id = e.id and m.kind = 'shuttle');
    if bad > 0 then raise exception 'transport_not_public' using errcode = '22023', detail = 'Only shuttles of this event can be public.'; end if;
    update public.transport_movements set public_page = (id = any(sh)) where event_id = e.id and public_page is distinct from (id = any(sh));
  end if;

  insert into public.event_getting_there(event_id, workspace_id, notes, public, updated_by, updated_at)
    values (e.id, e.workspace_id, notes, pub, (select auth.uid()), now())
    on conflict (event_id) do update set notes = excluded.notes, public = excluded.public, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  update public.events set settings = settings - 'getting_there' where id = e.id and settings ? 'getting_there';
  return jsonb_build_object('public', pub, 'notes', (select count(*) from jsonb_object_keys(notes)),
    'parking', (select count(*) from public.parking_areas a where a.event_id = e.id and a.public_page),
    'shuttles', (select count(*) from public.transport_movements m where m.event_id = e.id and m.public_page));
end $$;
revoke all on function public.event_getting_there_save(uuid, jsonb) from public;
grant execute on function public.event_getting_there_save(uuid, jsonb) to authenticated;

create or replace function public.public_event_getting_there(p_event uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with src as (
    select e.id, coalesce(g.public, (e.settings -> 'getting_there' -> 'public') = 'true'::jsonb, false) as pub,
           coalesce(g.notes, e.settings -> 'getting_there', '{}'::jsonb) as notes
      from public.events e left join public.event_getting_there g on g.event_id = e.id
     where e.id = p_event and ((e.visibility = 'public' and e.status in ('published', 'on_sale', 'live')) or public.holds_ticket_for(e.id)))
  select jsonb_build_object(
    'notes', case when s.pub then
        coalesce((select jsonb_object_agg(k, btrim(s.notes ->> k))
                    from unnest(array['parking', 'transit', 'shuttle', 'dropoff', 'accessible', 'cycle', 'rideshare']) k
                   where jsonb_typeof(s.notes -> k) = 'string' and btrim(s.notes ->> k) <> ''), '{}'::jsonb)
      else '{}'::jsonb end,
    'parking', coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'kind', a.kind, 'accessible_spaces', a.accessible_spaces, 'opens_at', a.opens_at, 'closes_at', a.closes_at) order by a.name)
      from public.parking_areas a where a.event_id = s.id and a.public_page and a.status = 'active' and a.kind in ('general', 'accessible', 'mixed')), '[]'::jsonb),
    'shuttles', coalesce((select jsonb_agg(jsonb_build_object('from', m.from_place, 'to', m.to_place, 'pickup', nullif(btrim(m.pickup_point), ''), 'departs_at', m.departs_at, 'arrives_at', m.arrives_at) order by m.departs_at)
      from public.transport_movements m where m.event_id = s.id and m.public_page and m.kind = 'shuttle' and m.status in ('planned', 'confirmed', 'en_route')), '[]'::jsonb))
  from src s
$$;
revoke all on function public.public_event_getting_there(uuid) from public;
grant execute on function public.public_event_getting_there(uuid) to anon, authenticated;

-- Backfill (idempotent): legacy notes → table, then drop only the getting_there key from rows that still have it.
insert into public.event_getting_there(event_id, workspace_id, notes, public, updated_at)
  select e.id, e.workspace_id,
         coalesce((select jsonb_object_agg(k, btrim(e.settings -> 'getting_there' ->> k)) from unnest(array['parking', 'transit', 'shuttle', 'dropoff', 'accessible', 'cycle', 'rideshare']) k
                    where jsonb_typeof(e.settings -> 'getting_there' -> k) = 'string' and btrim(e.settings -> 'getting_there' ->> k) <> ''), '{}'::jsonb),
         (e.settings -> 'getting_there' -> 'public') = 'true'::jsonb,
         coalesce(case when (e.settings -> 'getting_there' ->> 'updated_at') ~ '^\d{4}-\d{2}-\d{2}' then (e.settings -> 'getting_there' ->> 'updated_at')::timestamptz end, now())
    from public.events e where e.settings ? 'getting_there' and jsonb_typeof(e.settings -> 'getting_there') = 'object'
  on conflict (event_id) do nothing;
update public.events set settings = settings - 'getting_there' where settings ? 'getting_there';
