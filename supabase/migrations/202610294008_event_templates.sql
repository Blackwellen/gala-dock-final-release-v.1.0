-- Q14 Event Core 8 — event templates (domain 34) on the existing public.event_templates, sharing one structure engine with
-- duplicate_event (domain 32.3).
--
-- Shared engine (service-internal, SECURITY DEFINER, not callable by clients):
--   event_structure_snapshot(event, purpose, modules) → jsonb with every time stored as an offset (seconds) from the event anchor
--     (starts_at, else the first programme item). purpose 'duplicate' keeps the full copy set; purpose 'template' keeps only the
--     reusable allow-list: event type/overview, programme shape, task list with relative due offsets + task→task dependencies,
--     ticket tier shapes (drafts), allow-listed settings, budget CATEGORY names (no amounts), provider categories, role counts,
--     promotion channels. Never guests, tickets, orders, payments, bookings/holds, seats, shifts, incidents, files, links,
--     client name/refs, staff names, room bindings, money totals.
--   apply_event_structure(event, structure, start) → instantiates the structure on a target event at the given start.
-- duplicate_event() is rewritten on top of the engine (same behaviour and result contract; task dependencies now copied too).
--
-- Templates: versioned (family_id + version, one active version per family), workspace or platform scope, canonical event_type
-- (event_type_profiles), status active/superseded/archived, structure in `content`. Legacy rows (structure under modules.content
-- with offset_min / days_before) are still instantiated. Commands: save_event_template, archive_event_template,
-- create_event_from_template (requires a start date + timezone, idempotent per request id), apply_event_template (wizard path).

alter table public.event_templates
  add column if not exists family_id uuid,
  add column if not exists version integer not null default 1 check (version >= 1),
  add column if not exists scope text not null default 'workspace' check (scope in ('workspace','platform')),
  add column if not exists status text not null default 'active' check (status in ('active','superseded','archived')),
  add column if not exists event_type text,
  add column if not exists content jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();
update public.event_templates set family_id = id where family_id is null;
alter table public.event_templates alter column family_id set default gen_random_uuid();
alter table public.event_templates alter column workspace_id drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'event_templates_scope_owner') then
    alter table public.event_templates add constraint event_templates_scope_owner check ((scope = 'platform') = (workspace_id is null));
  end if;
end $$;
create unique index if not exists event_templates_family_version on public.event_templates(family_id, version);
create unique index if not exists event_templates_family_active on public.event_templates(family_id) where status = 'active';
create index if not exists event_templates_ws on public.event_templates(workspace_id, status);

-- Platform templates are readable by any signed-in user; writes stay with the workspace policy (platform rows: service role only).
drop policy if exists event_templates_platform_read on public.event_templates;
create policy event_templates_platform_read on public.event_templates for select to authenticated using (scope = 'platform' and status = 'active');

-- ── Shared structure engine ─────────────────────────────────────────────────
create or replace function public.event_structure_snapshot(p_event uuid, p_purpose text, p_modules jsonb default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.events; anchor timestamptz; tpl boolean := p_purpose = 'template'; m jsonb := coalesce(p_modules, '{}'::jsonb);
  on_ boolean; s jsonb; out jsonb;
  dup_keep constant text[] := array['modules','provider_categories','template_id','public_page','page_blocks','hero_title','subtitle','hero_overlay','cta','seo',
    'style','accessibility','hero_image','hero_compact','hero_compact_tabs','thumb','poster','gallery','highlights','faqs','features','objectives',
    'reentry','curfew','age_limit','entry_gate','ticket_capacity','ticketed','resale','transfers','type_settings','areas','budget_mode','budget_min',
    'budget_max','budget_lines','revenue_sources','optional_categories','virtual','planned_with_wizard','allocation'];
  tpl_keep constant text[] := array['modules','provider_categories','public_page','page_blocks','style','accessibility','highlights','faqs','features','objectives',
    'reentry','curfew','age_limit','ticket_capacity','ticketed','resale','transfers','type_settings','areas','budget_mode','optional_categories','virtual','allocation'];
begin
  if p_purpose not in ('duplicate','template') then raise exception 'invalid_purpose' using errcode = '22023'; end if;
  select * into e from public.events where id = p_event;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  anchor := coalesce(e.starts_at, (select min(x.starts_at) from public.programme_items x where x.event_id = e.id));
  -- A duplicate of an undated event keeps absolute times (offsets from the epoch); a template of one keeps none.
  if anchor is null and not tpl then anchor := 'epoch'::timestamptz; end if;
  on_ := not tpl;   -- duplicate: everything; template: by module

  select coalesce(jsonb_object_agg(k, e.settings -> k), '{}'::jsonb) into s from unnest(case when tpl then tpl_keep else dup_keep end) k where coalesce(e.settings, '{}') ? k;
  out := jsonb_build_object('v', 1, 'purpose', p_purpose, 'settings', s, 'anchor', case when tpl then null else anchor end,
    'duration_s', case when e.starts_at is not null and e.ends_at is not null then extract(epoch from e.ends_at - e.starts_at)::bigint end,
    'event', jsonb_build_object('event_type', e.event_type, 'description', e.description, 'goal', e.goal, 'capacity', e.capacity, 'guest_count', e.guest_count));

  if on_ or coalesce((m->>'tickets')::boolean, false) then
    out := out || jsonb_build_object('tiers', (select coalesce(jsonb_agg(jsonb_build_object('key', t.id, 'name', t.name, 'description', t.description, 'kind', t.kind,
        'price', t.price, 'quantity', t.quantity, 'release_name', t.release_name, 'order_limit', t.order_limit, 'allocation', t.allocation, 'badge', t.badge,
        'color', t.color, 'sort', t.sort, 'image', t.image, 'after_key', t.after_tier,
        'sale_start_s', extract(epoch from t.sale_start - anchor)::bigint, 'sale_end_s', extract(epoch from t.sale_end - anchor)::bigint,
        'valid_from_s', extract(epoch from t.valid_from - anchor)::bigint, 'valid_to_s', extract(epoch from t.valid_to - anchor)::bigint) order by t.sort, t.id), '[]')
      from public.ticket_tiers t where t.event_id = e.id));
  end if;
  if on_ or coalesce((m->>'schedule')::boolean, false) then
    out := out || jsonb_build_object('programme', (select coalesce(jsonb_agg(jsonb_build_object('start_s', extract(epoch from x.starts_at - anchor)::bigint,
        'duration_minutes', x.duration_minutes, 'title', x.title, 'detail', x.detail, 'area', x.area, 'kind', x.kind,
        'owner_name', case when tpl then '' else x.owner_name end, 'image', x.image, 'segment', x.segment, 'track', x.track,
        'space_id', case when tpl then null else x.space_id end, 'expected_attendance', x.expected_attendance) order by x.starts_at, x.id), '[]')
      from public.programme_items x where x.event_id = e.id));
  end if;
  if on_ or coalesce((m->>'plan')::boolean, false) or coalesce((m->>'risk')::boolean, false) then
    out := out || jsonb_build_object('tasks', (select coalesce(jsonb_agg(jsonb_build_object('key', x.id, 'title', x.title, 'detail', x.detail, 'category', x.category,
        'priority', x.priority, 'milestone', x.milestone, 'recurrence', x.recurrence,
        'recurrence_until_s', extract(epoch from x.recurrence_until - anchor)::bigint, 'due_s', extract(epoch from x.due_at - anchor)::bigint) order by x.due_at nulls last, x.id), '[]')
      from public.tasks x where x.event_id = e.id and x.recurrence_parent_id is null
        and (on_ or coalesce((m->>'risk')::boolean, false) or x.category not in ('risk','compliance'))));
    out := out || jsonb_build_object('dependencies', (select coalesce(jsonb_agg(jsonb_build_object('dependent_kind', d.dependent_kind, 'dependent_key', d.dependent_id,
        'prerequisite_kind', d.prerequisite_kind, 'prerequisite_key', d.prerequisite_id, 'hard', d.hard, 'lag_minutes', d.lag_minutes, 'note', d.note)), '[]')
      from public.event_dependencies d where d.event_id = e.id and d.dependent_kind in ('task','milestone','ticket_tier') and d.prerequisite_kind in ('task','milestone','ticket_tier','venue','compliance')));
  end if;
  if tpl then
    if coalesce((m->>'plan')::boolean, false) then
      out := out || jsonb_build_object('budget_categories', (select coalesce(jsonb_agg(k order by k), '[]') from jsonb_object_keys(case when jsonb_typeof(e.settings->'budget_lines') = 'object' then e.settings->'budget_lines' else '{}'::jsonb end) k));
    end if;
    if coalesce((m->>'providers')::boolean, false) then
      out := out || jsonb_build_object('providers', (select coalesce(jsonb_agg(jsonb_build_object('category', c)), '[]') from (select distinct b.category c from public.build_items b where b.event_id = e.id) z));
    end if;
    if coalesce((m->>'staffing')::boolean, false) then
      out := out || jsonb_build_object('roles', (select coalesce(jsonb_agg(jsonb_build_object('role', r, 'count', n)), '[]') from (select coalesce(nullif(s2.role, ''), 'Crew') r, sum(greatest(coalesce(s2.headcount, 1), 1))::int n from public.shifts s2 where s2.event_id = e.id group by 1) z));
    end if;
    if coalesce((m->>'promotion')::boolean, false) then
      out := out || jsonb_build_object('promotion', (select coalesce(jsonb_agg(jsonb_build_object('channel', c)), '[]') from (select distinct p.channel c from public.promotions p where p.event_id = e.id) z));
    end if;
  end if;
  return out;
end $$;

-- Instantiates a structure on p_event with every offset re-anchored at p_start. Returns counts.
create or replace function public.apply_event_structure(p_event uuid, p_structure jsonb, p_start timestamptz, p_actor uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; t jsonb; v_id uuid; tiers jsonb := '{}'; tasks jsonb := '{}'; n_t integer := 0; n_p integer := 0; n_k integer := 0; n_d integer := 0;
  at_ timestamptz := p_start; dep jsonb; dk text; pk text; did uuid; pid uuid;
begin
  select * into e from public.events where id = p_event;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  for t in select x from jsonb_array_elements(coalesce(p_structure->'tiers', '[]')) x loop
    insert into public.ticket_tiers(event_id, name, description, kind, price, quantity, sold, held, sale_start, sale_end, release_name, order_limit,
        allocation, status, badge, color, sort, image, valid_from, valid_to)
      values (p_event, t->>'name', coalesce(t->>'description', ''), coalesce(t->>'kind', 'general'), coalesce((t->>'price')::numeric, 0), greatest(coalesce((t->>'quantity')::int, 0), 0), 0, 0,
        at_ + make_interval(secs => (t->>'sale_start_s')::double precision), at_ + make_interval(secs => (t->>'sale_end_s')::double precision),
        coalesce(t->>'release_name', ''), coalesce((t->>'order_limit')::int, 10), coalesce(t->>'allocation', 'Main'), 'draft', t->>'badge', coalesce(t->>'color', '#5b5bff'),
        coalesce((t->>'sort')::int, 0), coalesce(t->>'image', ''), at_ + make_interval(secs => (t->>'valid_from_s')::double precision), at_ + make_interval(secs => (t->>'valid_to_s')::double precision))
      returning id into v_id;
    if t ? 'key' then tiers := tiers || jsonb_build_object(t->>'key', v_id); end if;
    n_t := n_t + 1;
  end loop;
  for t in select x from jsonb_array_elements(coalesce(p_structure->'tiers', '[]')) x where x->>'after_key' is not null and tiers ? (x->>'after_key') and tiers ? (x->>'key') loop
    update public.ticket_tiers set after_tier = (tiers->>(t->>'after_key'))::uuid where id = (tiers->>(t->>'key'))::uuid;
  end loop;

  perform set_config('gd.programme_copy', p_event::text, true);
  insert into public.programme_items(event_id, starts_at, duration_minutes, title, detail, area, kind, owner_name, status, image, segment, track, space_id, expected_attendance)
    select p_event, coalesce(at_, now()) + make_interval(secs => coalesce((x->>'start_s')::double precision, 0)), coalesce((x->>'duration_minutes')::int, 30), x->>'title', coalesce(x->>'detail', ''),
      coalesce(x->>'area', ''), coalesce(x->>'kind', 'programme'), coalesce(x->>'owner_name', ''), 'upcoming', coalesce(x->>'image', ''), x->>'segment', coalesce(x->>'track', ''),
      (x->>'space_id')::uuid, (x->>'expected_attendance')::int
    from jsonb_array_elements(coalesce(p_structure->'programme', '[]')) x where coalesce(x->>'title', '') <> '';
  get diagnostics n_p = row_count;
  perform set_config('gd.programme_copy', '', true);

  for t in select x from jsonb_array_elements(coalesce(p_structure->'tasks', '[]')) x where coalesce(x->>'title', '') <> '' loop
    insert into public.tasks(event_id, workspace_id, owner_id, title, detail, category, assignee_name, due_at, priority, status, milestone, recurrence, recurrence_until)
      values (p_event, e.workspace_id, p_actor, left(t->>'title', 200), coalesce(t->>'detail', ''), coalesce(t->>'category', 'general'), '',
        at_ + make_interval(secs => (t->>'due_s')::double precision), coalesce(nullif(t->>'priority', ''), 'medium'), 'todo', coalesce((t->>'milestone')::boolean, false),
        t->>'recurrence', at_ + make_interval(secs => (t->>'recurrence_until_s')::double precision))
      returning id into v_id;
    if t ? 'key' then tasks := tasks || jsonb_build_object(t->>'key', v_id); end if;
    n_k := n_k + 1;
  end loop;

  for dep in select x from jsonb_array_elements(coalesce(p_structure->'dependencies', '[]')) x loop
    dk := dep->>'dependent_kind'; pk := dep->>'prerequisite_kind';
    did := case when dk = 'ticket_tier' then (tiers->>(dep->>'dependent_key'))::uuid else (tasks->>(dep->>'dependent_key'))::uuid end;
    pid := case when pk in ('venue','compliance') then null when pk = 'ticket_tier' then (tiers->>(dep->>'prerequisite_key'))::uuid else (tasks->>(dep->>'prerequisite_key'))::uuid end;
    continue when did is null or (pk not in ('venue','compliance') and pid is null);
    insert into public.event_dependencies(event_id, dependent_kind, dependent_id, prerequisite_kind, prerequisite_id, hard, lag_minutes, note, created_by)
      values (p_event, dk, did, pk, pid, coalesce((dep->>'hard')::boolean, true), coalesce((dep->>'lag_minutes')::int, 0), coalesce(dep->>'note', ''), p_actor)
      on conflict do nothing;
    n_d := n_d + 1;
  end loop;
  return jsonb_build_object('tiers', n_t, 'programme', n_p, 'tasks', n_k, 'dependencies', n_d);
end $$;

-- Legacy template rows (modules.content: schedule offset_min, tasks days_before, tiers) → engine structure.
create or replace function public.event_template_structure(p_template public.event_templates) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(p_template.content, jsonb_build_object('v', 0, 'purpose', 'template', 'settings', '{}'::jsonb,
    'event', coalesce(p_template.modules #> '{content,overview}', '{}'::jsonb),
    'duration_s', ((p_template.modules #>> '{content,overview,duration_hours}')::numeric * 3600)::bigint,
    'tiers', (select coalesce(jsonb_agg(x || jsonb_build_object('sort', o)), '[]') from jsonb_array_elements(coalesce(p_template.modules #> '{content,tiers}', '[]')) with ordinality z(x, o)),
    'programme', (select coalesce(jsonb_agg(x || jsonb_build_object('start_s', coalesce((x->>'offset_min')::bigint, 0) * 60)), '[]') from jsonb_array_elements(coalesce(p_template.modules #> '{content,schedule}', '[]')) x),
    'tasks', (select coalesce(jsonb_agg(x || jsonb_build_object('due_s', case when x->>'days_before' is not null then -((x->>'days_before')::bigint * 86400) end)), '[]') from jsonb_array_elements(coalesce(p_template.modules #> '{content,tasks}', '[]')) x)));
$$;

-- ── duplicate_event on the shared engine (signature, checks and result unchanged) ──
create or replace function public.duplicate_event(p_source uuid, p_starts_local timestamp, p_timezone text, p_confirm boolean,
  p_name text default null, p_request_id text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.events; uid uuid := (select auth.uid()); v_new uuid; v_start timestamptz; v_anchor timestamptz; v_shift interval; v_name text;
  v_struct jsonb; v_settings jsonb; c jsonb;
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_confirm is not true then raise exception 'confirmation_required' using errcode = '22023'; end if;
  if p_starts_local is null then raise exception 'new_date_required' using errcode = '22023'; end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone) then raise exception 'invalid_timezone' using errcode = '22023'; end if;
  if p_request_id is not null and length(p_request_id) > 80 then raise exception 'invalid_request_id' using errcode = '22023'; end if;

  select * into e from public.events where id = p_source;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if e.workspace_id is null then
    if e.owner_id is distinct from uid then raise exception 'not_authorized' using errcode = '42501'; end if;
  elsif not public.has_permission(e.workspace_id, 'events.write') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_request_id is not null then
    select x.id into v_new from public.events x where x.settings ->> 'duplicate_request' = p_request_id and x.settings ->> 'duplicated_from' = e.id::text
      and x.workspace_id is not distinct from e.workspace_id limit 1;
    if v_new is not null then return jsonb_build_object('ok', true, 'id', v_new, 'replayed', true); end if;
  end if;

  v_start := p_starts_local at time zone p_timezone;
  if v_start <= now() then raise exception 'new_date_in_past' using errcode = '22023'; end if;
  v_anchor := coalesce(e.starts_at, (select min(x.starts_at) from public.programme_items x where x.event_id = e.id));
  v_shift := case when v_anchor is null then interval '0' else v_start - v_anchor end;
  v_name := left(coalesce(nullif(btrim(p_name), ''), e.name || ' (copy)'), 120);
  v_struct := public.event_structure_snapshot(e.id, 'duplicate');
  v_settings := (v_struct->'settings') || jsonb_build_object('duplicated_from', e.id, 'duplicated_at', now(), 'duplicated_by', uid)
    || case when p_request_id is not null then jsonb_build_object('duplicate_request', p_request_id) else '{}'::jsonb end;

  insert into public.events(owner_id, workspace_id, management, name, event_type, visibility, status, starts_at, ends_at, timezone, flexible_dates,
      venue_listing_id, venue_name, location, city, guest_count, adults, children, capacity, budget_total, revenue_goal, target_profit, currency,
      description, goal, cover_image, client_name, tags, priorities, settings)
    values (uid, e.workspace_id, e.management, v_name, e.event_type, 'private', 'draft', v_start,
      case when e.ends_at is not null and e.starts_at is not null then v_start + (e.ends_at - e.starts_at) end, p_timezone, false,
      e.venue_listing_id, e.venue_name, e.location, e.city, e.guest_count, e.adults, e.children, e.capacity, e.budget_total, e.revenue_goal, e.target_profit, e.currency,
      e.description, e.goal, e.cover_image, e.client_name, e.tags, e.priorities, v_settings)
    returning id into v_new;

  -- Without an anchor the source has no times to keep offsets from: items keep their own times (shift 0), as before.
  c := public.apply_event_structure(v_new, v_struct, (v_struct->>'anchor')::timestamptz + v_shift, uid);

  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (uid, e.workspace_id, 'event.duplicated', jsonb_build_object('event_id', v_new, 'source_id', e.id, 'starts_at', v_start, 'timezone', p_timezone,
      'shift_seconds', extract(epoch from v_shift)::bigint, 'tiers', c->'tiers', 'programme', c->'programme', 'tasks', c->'tasks', 'dependencies', c->'dependencies'));
  perform public.emit_domain_event('event.duplicated', e.workspace_id,
    jsonb_build_object('id', v_new, 'source_id', e.id, 'shift_seconds', extract(epoch from v_shift)::bigint), uid, 'user', 'event', v_new::text, null, null);

  return jsonb_build_object('ok', true, 'id', v_new, 'starts_at', v_start, 'shift_seconds', extract(epoch from v_shift)::bigint,
    'copied', jsonb_build_object('tiers', (c->>'tiers')::int, 'programme', (c->>'programme')::int, 'tasks', (c->>'tasks')::int, 'dependencies', (c->>'dependencies')::int),
    'not_copied', jsonb_build_array('guests', 'tickets', 'orders', 'payments', 'bookings_and_holds', 'seats', 'shifts', 'incidents', 'files', 'share_links', 'venue_confirmation', 'permits_and_insurance'));
end $$;

-- ── Template commands ───────────────────────────────────────────────────────
-- Save (or save a new version of) a template from an event. p_family = an existing template family to version.
create or replace function public.save_event_template(p_event uuid, p_name text, p_description text, p_event_types text[], p_modules jsonb, p_family uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e public.events; v_family uuid := coalesce(p_family, gen_random_uuid()); v_version integer := 1; v_id uuid; v_struct jsonb; prev public.event_templates;
  mods jsonb; k text;
begin
  select * into e from public.events where id = p_event;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if uid is null or e.workspace_id is null or not public.has_permission(e.workspace_id, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_name, ''))) < 3 or length(p_name) > 80 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if coalesce(array_length(p_event_types, 1), 0) not between 1 and 10 then raise exception 'event_types_required' using errcode = '22023'; end if;
  mods := '{}';
  for k in select jsonb_object_keys(coalesce(p_modules, '{}')) loop
    if k not in ('plan','schedule','providers','tickets','promotion','staffing','risk') then raise exception 'invalid_module' using errcode = '22023', detail = k; end if;
    mods := mods || jsonb_build_object(k, coalesce((p_modules->>k)::boolean, false));
  end loop;
  if p_family is not null then
    select * into prev from public.event_templates where family_id = p_family and status = 'active' and workspace_id = e.workspace_id for update;
    if not found then raise exception 'template_not_found' using errcode = 'P0002'; end if;
    select max(version) + 1 into v_version from public.event_templates where family_id = p_family;
    update public.event_templates set status = 'superseded', updated_at = now() where id = prev.id;
  end if;
  v_struct := public.event_structure_snapshot(e.id, 'template', mods);
  insert into public.event_templates(workspace_id, source_event_id, name, description, event_types, modules, family_id, version, scope, status, event_type, content, created_by)
    values (e.workspace_id, e.id, btrim(p_name), left(coalesce(p_description, ''), 500), p_event_types, mods, v_family, v_version, 'workspace', 'active',
      case when exists (select 1 from public.event_type_profiles p where p.event_type = e.event_type) then e.event_type else 'custom' end, v_struct, uid)
    returning id into v_id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, e.workspace_id, 'template.saved',
    jsonb_build_object('event_id', e.id, 'template_id', v_id, 'family_id', v_family, 'version', v_version, 'name', btrim(p_name)));
  perform public.emit_domain_event('event.template_saved', e.workspace_id, jsonb_build_object('id', v_id, 'family_id', v_family, 'version', v_version, 'source_event_id', e.id), uid, 'user', 'event_template', v_id::text, null, null);
  return jsonb_build_object('ok', true, 'id', v_id, 'family_id', v_family, 'version', v_version,
    'included', jsonb_build_object('tiers', jsonb_array_length(coalesce(v_struct->'tiers', '[]')), 'programme', jsonb_array_length(coalesce(v_struct->'programme', '[]')), 'tasks', jsonb_array_length(coalesce(v_struct->'tasks', '[]'))));
end $$;

create or replace function public.archive_event_template(p_template uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); t public.event_templates;
begin
  select * into t from public.event_templates where id = p_template for update;
  if not found or t.workspace_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission(t.workspace_id, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.event_templates set status = 'archived', updated_at = now() where family_id = t.family_id and status = 'active';
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, t.workspace_id, 'template.archived', jsonb_build_object('template_id', t.id, 'family_id', t.family_id));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.event_template_usable(t public.event_templates, p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select t.status = 'active' and ((t.scope = 'platform') or (t.workspace_id = p_workspace)) and public.has_permission(p_workspace, 'events.write');
$$;

-- Wizard path: instantiate a template on an event that already has its date (finishCreate). Idempotent per event + template.
create or replace function public.apply_event_template(p_event uuid, p_template uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e public.events; t public.event_templates; s jsonb; c jsonb;
begin
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into t from public.event_templates where id = p_template;
  if uid is null or e.workspace_id is null or not found or not public.event_template_usable(t, e.workspace_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.starts_at is null then raise exception 'start_date_required' using errcode = '22023'; end if;
  if e.settings->>'template_applied' = t.id::text then return jsonb_build_object('ok', true, 'replayed', true); end if;
  s := public.event_template_structure(t);
  c := public.apply_event_structure(e.id, s, e.starts_at, uid);
  update public.events set settings = coalesce(settings, '{}') || coalesce(s->'settings', '{}') || jsonb_build_object('template_id', t.id, 'template_version', t.version, 'template_applied', t.id),
    updated_at = now() where id = e.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, e.workspace_id, 'template.applied', jsonb_build_object('event_id', e.id, 'template_id', t.id, 'version', t.version, 'copied', c));
  perform public.emit_domain_event('event.template_applied', e.workspace_id, jsonb_build_object('event_id', e.id, 'template_id', t.id, 'version', t.version), uid, 'user', 'event', e.id::text, null, null);
  return jsonb_build_object('ok', true, 'copied', c);
end $$;

-- Create a new private draft event from a template at a required start (wall clock in an IANA timezone). Idempotent per request id.
create or replace function public.create_event_from_template(p_template uuid, p_workspace uuid, p_name text, p_starts_local timestamp, p_timezone text,
  p_request_id text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); t public.event_templates; s jsonb; v_start timestamptz; v_new uuid; c jsonb; v_type text; dur bigint;
begin
  select * into t from public.event_templates where id = p_template;
  if uid is null or not found or not public.event_template_usable(t, p_workspace) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_starts_local is null then raise exception 'start_date_required' using errcode = '22023'; end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone) then raise exception 'invalid_timezone' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p_request_id is not null then
    if length(p_request_id) > 80 then raise exception 'invalid_request_id' using errcode = '22023'; end if;
    select x.id into v_new from public.events x where x.workspace_id = p_workspace and x.settings->>'template_request' = p_request_id limit 1;
    if v_new is not null then return jsonb_build_object('ok', true, 'id', v_new, 'replayed', true); end if;
  end if;
  v_start := p_starts_local at time zone p_timezone;
  if v_start <= now() then raise exception 'start_in_past' using errcode = '22023'; end if;
  s := public.event_template_structure(t);
  -- Type-aware: the template's canonical type when known to event_type_profiles, else the overview type, else custom.
  v_type := coalesce((select p.event_type from public.event_type_profiles p where p.event_type = coalesce(t.event_type, s #>> '{event,event_type}')), 'custom');
  dur := nullif(s->>'duration_s', '')::bigint;
  insert into public.events(owner_id, workspace_id, management, name, event_type, visibility, status, starts_at, ends_at, timezone, flexible_dates,
      capacity, guest_count, description, goal, settings)
    values (uid, p_workspace, 'professional', left(btrim(p_name), 120), v_type, 'private', 'draft', v_start, case when dur is not null and dur > 0 then v_start + make_interval(secs => dur) end,
      p_timezone, false, nullif(s #>> '{event,capacity}', '')::int, nullif(s #>> '{event,guest_count}', '')::int, coalesce(s #>> '{event,description}', t.description), coalesce(s #>> '{event,goal}', ''),
      coalesce(s->'settings', '{}') || jsonb_build_object('template_id', t.id, 'template_version', t.version, 'template_applied', t.id)
        || case when p_request_id is not null then jsonb_build_object('template_request', p_request_id) else '{}'::jsonb end
        || case when s ? 'budget_categories' then jsonb_build_object('budget_categories', s->'budget_categories') else '{}'::jsonb end
        || case when s ? 'providers' then jsonb_build_object('provider_categories', (select coalesce(jsonb_agg(x->>'category'), '[]') from jsonb_array_elements(s->'providers') x)) else '{}'::jsonb end)
    returning id into v_new;
  c := public.apply_event_structure(v_new, s, v_start, uid);
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, p_workspace, 'event.created_from_template', jsonb_build_object('event_id', v_new, 'template_id', t.id, 'version', t.version, 'copied', c));
  perform public.emit_domain_event('event.created_from_template', p_workspace, jsonb_build_object('id', v_new, 'template_id', t.id, 'version', t.version), uid, 'user', 'event', v_new::text, null, null);
  return jsonb_build_object('ok', true, 'id', v_new, 'starts_at', v_start, 'copied', c);
end $$;

revoke all on function public.event_structure_snapshot(uuid, text, jsonb), public.apply_event_structure(uuid, jsonb, timestamptz, uuid),
  public.event_template_structure(public.event_templates), public.event_template_usable(public.event_templates, uuid) from public, anon, authenticated;
grant execute on function public.event_structure_snapshot(uuid, text, jsonb), public.apply_event_structure(uuid, jsonb, timestamptz, uuid),
  public.event_template_structure(public.event_templates), public.event_template_usable(public.event_templates, uuid) to service_role;
revoke all on function public.save_event_template(uuid, text, text, text[], jsonb, uuid), public.archive_event_template(uuid), public.apply_event_template(uuid, uuid),
  public.create_event_from_template(uuid, uuid, text, timestamp, text, text) from public, anon;
grant execute on function public.save_event_template(uuid, text, text, text[], jsonb, uuid), public.archive_event_template(uuid), public.apply_event_template(uuid, uuid),
  public.create_event_from_template(uuid, uuid, text, timestamp, text, text) to authenticated, service_role;
