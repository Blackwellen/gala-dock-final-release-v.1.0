-- Q14 Event Core 9 — canonical event brief (domain 39). Non-AI, structured, versioned (append-only; one current version).
-- Sections: goals, client needs, scope, audience (guest profile: counts/ages/notes, never names), budget range, location, venue,
-- supplier needs per category, style, must-haves, constraints, accessibility, success measures.
--   * event team (owner / workspace events.write) edits through save_event_brief with optimistic concurrency (expected version);
--   * team reads every version (RLS: can_access_event);
--   * a booked provider reads provider_event_brief(build_item): a scoped projection — no client name/contact, no budget,
--     no other categories' supplier needs, no internal notes;
--   * RFQs reference the version they were written from (provider_requests.brief_version_id, nullable) and
--     event_brief_requirements(event, category) gives Q10's requirement builder a prefill by reference;
--   * audit_events + domain_outbox (event.brief_updated) per version.

create table if not exists public.event_briefs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  version integer not null check (version >= 1),
  is_current boolean not null default true,
  goals jsonb not null default '[]' check (jsonb_typeof(goals) = 'array'),
  client_needs text not null default '' check (length(client_needs) <= 4000),
  scope text not null default '' check (length(scope) <= 4000),
  audience jsonb not null default '{}' check (jsonb_typeof(audience) = 'object'),
  budget_min numeric(14,2) check (budget_min >= 0),
  budget_max numeric(14,2) check (budget_max >= 0),
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  location_needs text not null default '' check (length(location_needs) <= 2000),
  venue_needs jsonb not null default '{}' check (jsonb_typeof(venue_needs) = 'object'),
  supplier_needs jsonb not null default '{}' check (jsonb_typeof(supplier_needs) = 'object'),
  style jsonb not null default '{}' check (jsonb_typeof(style) = 'object'),
  must_haves jsonb not null default '[]' check (jsonb_typeof(must_haves) = 'array'),
  constraints jsonb not null default '[]' check (jsonb_typeof(constraints) = 'array'),
  accessibility jsonb not null default '{}' check (jsonb_typeof(accessibility) = 'object'),
  success_measures jsonb not null default '[]' check (jsonb_typeof(success_measures) = 'array'),
  internal_notes text not null default '' check (length(internal_notes) <= 4000),
  change_note text not null default '' check (length(change_note) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (budget_max is null or budget_min is null or budget_max >= budget_min),
  unique (event_id, version)
);
create unique index if not exists event_briefs_current on public.event_briefs(event_id) where is_current;
alter table public.event_briefs enable row level security;
drop policy if exists event_briefs_team_read on public.event_briefs;
create policy event_briefs_team_read on public.event_briefs for select to authenticated using (public.can_access_event(event_id));
revoke all on public.event_briefs from anon, authenticated;
grant select on public.event_briefs to authenticated;
grant all on public.event_briefs to service_role;

alter table public.provider_requests add column if not exists brief_version_id uuid references public.event_briefs(id) on delete set null;

-- Shape validation: bounded lists of short strings / small objects; no free-form blobs.
create or replace function public.event_brief_valid_list(p jsonb, p_max integer) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(coalesce(p, '[]')) = 'array' and jsonb_array_length(coalesce(p, '[]')) <= p_max
    and not exists (select 1 from jsonb_array_elements(coalesce(p, '[]')) x where not (jsonb_typeof(x) = 'string' and length(x #>> '{}') between 1 and 300)
      and not (jsonb_typeof(x) = 'object' and length(x::text) <= 1000));
$$;

create or replace function public.save_event_brief(p_event uuid, p_brief jsonb, p_expected_version integer default null, p_change_note text default '') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e public.events; cur public.event_briefs; v_id uuid; v integer; b jsonb := coalesce(p_brief, '{}');
begin
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if uid is null or not ((e.workspace_id is null and e.owner_id = uid) or (e.workspace_id is not null and public.has_permission(e.workspace_id, 'events.write'))) then
    raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(b) <> 'object' or length(b::text) > 60000 then raise exception 'invalid_brief' using errcode = '22023'; end if;
  if not (public.event_brief_valid_list(b->'goals', 20) and public.event_brief_valid_list(b->'must_haves', 30) and public.event_brief_valid_list(b->'constraints', 30)
          and public.event_brief_valid_list(b->'success_measures', 20)) then raise exception 'invalid_brief' using errcode = '22023', detail = 'lists'; end if;
  for v_id in select null::uuid from jsonb_each(coalesce(b->'supplier_needs', '{}')) x where jsonb_typeof(x.value) not in ('string','object') or length(x.value::text) > 4000 loop
    raise exception 'invalid_brief' using errcode = '22023', detail = 'supplier_needs';
  end loop;
  select * into cur from public.event_briefs where event_id = e.id and is_current for update;
  if p_expected_version is not null and coalesce(cur.version, 0) <> p_expected_version then
    return jsonb_build_object('ok', false, 'conflict', true, 'current', coalesce(cur.version, 0));
  end if;
  v := coalesce(cur.version, 0) + 1;
  update public.event_briefs set is_current = false where id = cur.id;
  insert into public.event_briefs(event_id, version, is_current, goals, client_needs, scope, audience, budget_min, budget_max, currency, location_needs, venue_needs,
      supplier_needs, style, must_haves, constraints, accessibility, success_measures, internal_notes, change_note, created_by)
    values (e.id, v, true, coalesce(b->'goals', '[]'), coalesce(b->>'client_needs', ''), coalesce(b->>'scope', ''),
      -- guest profile: counts, ages, notes — names/emails/phones are stripped
      coalesce(b->'audience', '{}') - 'names' - 'emails' - 'phones' - 'guest_list',
      nullif(b->>'budget_min', '')::numeric, nullif(b->>'budget_max', '')::numeric, upper(coalesce(nullif(b->>'currency', ''), e.currency, 'GBP')),
      coalesce(b->>'location_needs', ''), coalesce(b->'venue_needs', '{}'), coalesce(b->'supplier_needs', '{}'), coalesce(b->'style', '{}'),
      coalesce(b->'must_haves', '[]'), coalesce(b->'constraints', '[]'), coalesce(b->'accessibility', '{}'), coalesce(b->'success_measures', '[]'),
      coalesce(b->>'internal_notes', ''), left(coalesce(p_change_note, ''), 300), uid)
    returning id into v_id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, e.workspace_id, 'event.brief_updated', jsonb_build_object('event_id', e.id, 'brief_id', v_id, 'version', v));
  perform public.emit_domain_event('event.brief_updated', e.workspace_id, jsonb_build_object('event_id', e.id, 'id', v_id, 'version', v), uid, 'user', 'event', e.id::text, null, null);
  return jsonb_build_object('ok', true, 'id', v_id, 'version', v);
end $$;

-- Booked provider's scoped view (least privilege): only for a booking of a listing in the caller's workspace on this event.
create or replace function public.provider_event_brief(p_build_item uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.build_items; ws uuid; br public.event_briefs; e public.events;
begin
  select * into b from public.build_items where id = p_build_item;
  if not found or b.listing_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select workspace_id into ws from public.listings where id = b.listing_id;
  if not public.is_workspace_member(ws) or b.status in ('suggested','draft','declined','unavailable','expired','cancelled','cancelled_by_customer') then
    raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into br from public.event_briefs where event_id = b.event_id and is_current;
  if not found then return null; end if;
  select * into e from public.events where id = b.event_id;
  return jsonb_build_object('version', br.version, 'event', jsonb_build_object('name', e.name, 'event_type', e.event_type, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'city', e.city),
    'goals', br.goals, 'scope', br.scope,
    'audience', jsonb_strip_nulls(jsonb_build_object('size', br.audience->'size', 'adults', br.audience->'adults', 'children', br.audience->'children', 'ages', br.audience->'ages', 'profile', br.audience->'profile')),
    'style', br.style, 'must_haves', br.must_haves, 'constraints', br.constraints, 'accessibility', br.accessibility,
    'location_needs', br.location_needs, 'venue_needs', case when b.category = 'venue' then br.venue_needs else '{}'::jsonb end,
    'supplier_needs', coalesce(br.supplier_needs -> b.category, 'null'::jsonb));
end $$;

-- Requirement prefill for an RFQ in one category (Q10's builder links the returned brief_version_id).
create or replace function public.event_brief_requirements(p_event uuid, p_category text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare br public.event_briefs;
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into br from public.event_briefs where event_id = p_event and is_current;
  if not found then return null; end if;
  return jsonb_build_object('brief_version_id', br.id, 'version', br.version, 'goals', br.goals, 'must_haves', br.must_haves, 'constraints', br.constraints,
    'accessibility', br.accessibility, 'style', br.style, 'audience_size', br.audience->'size',
    'needs', case when p_category = 'venue' then br.venue_needs else coalesce(br.supplier_needs -> p_category, 'null'::jsonb) end,
    'budget', case when public.can_see_event_money(p_event) then jsonb_build_object('min', br.budget_min, 'max', br.budget_max, 'currency', br.currency) end);
end $$;

revoke all on function public.event_brief_valid_list(jsonb, integer) from public, anon, authenticated;
grant execute on function public.event_brief_valid_list(jsonb, integer) to service_role;
revoke all on function public.save_event_brief(uuid, jsonb, integer, text), public.provider_event_brief(uuid), public.event_brief_requirements(uuid, text) from public, anon;
grant execute on function public.save_event_brief(uuid, jsonb, integer, text), public.provider_event_brief(uuid), public.event_brief_requirements(uuid, text) to authenticated, service_role;
