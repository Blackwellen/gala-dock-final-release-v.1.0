-- Q40 part 5 (lane A, 2026-10-29): Lost Property (255) and Sustainability (256). Additive, backward compatible.
--   * lost_reports (attendee-submitted; machine lost_report) and found_items (event team; machine found_item); explainable
--     matching lost_property_matches(report): hard filters (same event, same category, found inside the loss window + 24 h)
--     then weighted features (colour 2, brand 2, shared description words ≤ 3, location 1), model 'lp-v1', features returned.
--   * lost_claims: pending → verified | failed | manual_review | expired; evidence stays private (team only); the reporter
--     sees only the derived status of their own report. Collection closes report, item and claim together. Daily job
--     expires stale claims (14 d) and reports (60 d) and flags items past their disposal date.
--   * sustainability_factors (versioned, indicative UK factors) and sustainability_entries (measured/estimated waste,
--     energy, water, travel, supplier data + notes); event_sustainability_report derives kg CO2e with factor provenance,
--     recycling rate, per-attendee figures and supplier metrics; estimate_attendee_travel from issued tickets.

-- ═══ 1. Lost property ═══
create table if not exists public.lost_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  contact_email text check (contact_email is null or contact_email = lower(contact_email)),
  category text not null check (category in ('phone','wallet','bag','keys','clothing','jewellery','documents','electronics','other')),
  description text not null check (length(btrim(description)) between 3 and 1000),
  colour text, brand text, location text,
  lost_from timestamptz, lost_to timestamptz,
  status text not null default 'submitted' check (status in ('submitted','matched','verified','collected','closed','expired')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (lost_to is null or lost_from is null or lost_to >= lost_from)
);
create table if not exists public.found_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  logged_by uuid,
  category text not null check (category in ('phone','wallet','bag','keys','clothing','jewellery','documents','electronics','other')),
  description text not null check (length(btrim(description)) between 3 and 1000),
  colour text, brand text, location text, storage_location text,
  found_at timestamptz not null default now(),
  dispose_after timestamptz not null default now() + interval '90 days',
  status text not null default 'logged' check (status in ('logged','matched','claimed','collected','disposed')),
  created_at timestamptz not null default now()
);
create table if not exists public.lost_claims (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.lost_reports(id) on delete cascade,
  item_id uuid not null references public.found_items(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','verified','failed','manual_review','expired','collected')),
  score integer, features jsonb, evidence jsonb not null default '{}',
  decided_by uuid, decided_at timestamptz, created_at timestamptz not null default now(),
  unique (report_id, item_id)
);
create unique index if not exists lost_claims_one_verified on public.lost_claims(item_id) where status in ('verified','collected');

delete from public.state_transitions where machine in ('lost_report','found_item');
delete from public.state_machines where machine in ('lost_report','found_item');
insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states) values
  ('lost_report', 'lost_reports', 'status', 'enforce', array['submitted']::text[], array['collected','closed','expired']::text[]),
  ('found_item', 'found_items', 'status', 'enforce', array['logged']::text[], array['collected','disposed']::text[]);
insert into public.state_transitions(machine, from_state, to_state) values
  ('lost_report','submitted','matched'),('lost_report','submitted','closed'),('lost_report','submitted','expired'),
  ('lost_report','matched','verified'),('lost_report','matched','submitted'),('lost_report','matched','closed'),('lost_report','matched','expired'),
  ('lost_report','verified','collected'),('lost_report','verified','matched'),('lost_report','verified','closed'),
  ('found_item','logged','matched'),('found_item','logged','disposed'),
  ('found_item','matched','claimed'),('found_item','matched','logged'),('found_item','matched','disposed'),
  ('found_item','claimed','collected'),('found_item','claimed','logged');
drop trigger if exists lost_reports_state_guard on public.lost_reports;
create trigger lost_reports_state_guard before insert or update of status on public.lost_reports for each row execute function public.enforce_state_transition('lost_report', 'status');
drop trigger if exists found_items_state_guard on public.found_items;
create trigger found_items_state_guard before insert or update of status on public.found_items for each row execute function public.enforce_state_transition('found_item', 'status');

create or replace function public.report_lost_item(p_event uuid, p_report jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); v uuid;
begin
  if uid is not null and not (public.holds_ticket_for(p_event) or public.can_access_event(p_event)) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if uid is null and nullif(p_report->>'contact_email', '') is null then raise exception 'contact_required' using errcode = '22023'; end if;
  if not public.hit_rate_limit('lost:' || coalesce(uid::text, p_report->>'contact_email'), 10, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into public.lost_reports(event_id, reporter_id, contact_email, category, description, colour, brand, location, lost_from, lost_to)
    values (p_event, uid, lower(nullif(p_report->>'contact_email', '')), p_report->>'category', btrim(p_report->>'description'), lower(nullif(p_report->>'colour', '')), lower(nullif(p_report->>'brand', '')),
      p_report->>'location', (p_report->>'lost_from')::timestamptz, (p_report->>'lost_to')::timestamptz) returning id into v;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (uid, case when uid is null then 'system' else 'user' end, (select workspace_id from public.events where id = p_event),
    'lost_property.reported', jsonb_build_object('event_id', p_event, 'report_id', v, 'category', p_report->>'category'));
  return jsonb_build_object('ok', true, 'id', v);
end $$;

create or replace function public.log_found_item(p_event uuid, p_item jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v uuid; e public.events;
begin
  select * into e from public.events where id = p_event;
  if not found or e.workspace_id is null or not (public.has_permission(e.workspace_id, 'checkin.scan') or public.has_permission(e.workspace_id, 'events.write')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  insert into public.found_items(event_id, logged_by, category, description, colour, brand, location, storage_location, found_at, dispose_after)
    values (p_event, (select auth.uid()), p_item->>'category', btrim(p_item->>'description'), lower(nullif(p_item->>'colour', '')), lower(nullif(p_item->>'brand', '')), p_item->>'location',
      p_item->>'storage_location', coalesce((p_item->>'found_at')::timestamptz, now()), coalesce((p_item->>'dispose_after')::timestamptz, now() + interval '90 days')) returning id into v;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), e.workspace_id, 'lost_property.found_logged', jsonb_build_object('event_id', p_event, 'item_id', v));
  return jsonb_build_object('ok', true, 'id', v);
end $$;

create or replace function public.lost_property_team(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and e.workspace_id is not null
    and (public.has_permission(e.workspace_id, 'checkin.scan') or public.has_permission(e.workspace_id, 'events.write')))
$$;

create or replace function public.lost_property_matches(p_report uuid, p_limit integer default 10) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.lost_reports;
begin
  select * into r from public.lost_reports where id = p_report;
  if not found or not public.lost_property_team(r.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object('model', 'lp-v1', 'hard_filters', jsonb_build_array('same_event', 'same_category', 'found_within_loss_window_plus_24h', 'item_available'),
    'matches', coalesce((select jsonb_agg(m order by (m->>'score')::int desc, m->>'found_at') from (
      select jsonb_build_object('item_id', i.id, 'description', i.description, 'found_at', i.found_at, 'storage_location', i.storage_location,
        'score', f.colour + f.brand + f.words + f.loc,
        'features', jsonb_build_object('colour', f.colour, 'brand', f.brand, 'shared_words', f.words, 'location', f.loc)) m
        from public.found_items i
        cross join lateral (select
           case when r.colour is not null and i.colour = r.colour then 2 else 0 end colour,
           case when r.brand is not null and i.brand = r.brand then 2 else 0 end brand,
           least(3, (select count(distinct w) from regexp_split_to_table(lower(r.description), '[^a-z0-9]+') w
                      where length(w) >= 4 and w = any(regexp_split_to_array(lower(i.description), '[^a-z0-9]+'))))::int words,
           case when r.location is not null and i.location is not null and lower(i.location) = lower(r.location) then 1 else 0 end loc) f
       where i.event_id = r.event_id and i.category = r.category and i.status in ('logged','matched')
         and (r.lost_from is null or i.found_at >= r.lost_from) and (r.lost_to is null or i.found_at <= r.lost_to + interval '24 hours')
       order by 1 limit least(greatest(coalesce(p_limit, 10), 1), 50)) q), '[]'::jsonb));
end $$;

create or replace function public.claim_found_item(p_report uuid, p_item uuid, p_evidence jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.lost_reports; i public.found_items; c uuid; m jsonb; sc int; ft jsonb;
begin
  select * into r from public.lost_reports where id = p_report for update;
  select * into i from public.found_items where id = p_item for update;
  if r.id is null or i.id is null or i.event_id <> r.event_id or not public.lost_property_team(r.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if i.status not in ('logged','matched') then raise exception 'item_unavailable' using errcode = '22023'; end if;
  select x into m from jsonb_array_elements(public.lost_property_matches(r.id, 50)->'matches') x where (x->>'item_id')::uuid = i.id;
  if m is null then raise exception 'not_a_candidate' using errcode = '22023'; end if;
  sc := (m->>'score')::int; ft := m->'features';
  insert into public.lost_claims(report_id, item_id, score, features, evidence) values (r.id, i.id, sc, ft, coalesce(p_evidence, '{}'))
    on conflict (report_id, item_id) do update set evidence = excluded.evidence returning id into c;
  if r.status = 'submitted' then update public.lost_reports set status = 'matched', updated_at = now() where id = r.id; end if;
  if i.status = 'logged' then update public.found_items set status = 'matched' where id = i.id; end if;
  return jsonb_build_object('ok', true, 'id', c, 'score', sc, 'features', ft);
end $$;

create or replace function public.decide_lost_claim(p_claim uuid, p_decision text, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare c public.lost_claims; r public.lost_reports;
begin
  select * into c from public.lost_claims where id = p_claim for update;
  select * into r from public.lost_reports where id = c.report_id for update;
  if c.id is null or not public.lost_property_team(r.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_decision not in ('verified','failed','manual_review','collected') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  if p_decision = 'collected' then
    if c.status <> 'verified' then raise exception 'claim_not_verified' using errcode = '22023'; end if;
    update public.lost_claims set status = 'collected', decided_by = (select auth.uid()), decided_at = now() where id = c.id;
    update public.lost_reports set status = 'collected', updated_at = now() where id = r.id;
    update public.found_items set status = 'collected' where id = c.item_id;
  elsif p_decision = 'verified' then
    if c.status not in ('pending','manual_review') then raise exception 'claim_closed' using errcode = '22023'; end if;
    update public.lost_claims set status = 'verified', decided_by = (select auth.uid()), decided_at = now(), evidence = evidence || jsonb_build_object('note', p_note) where id = c.id;
    update public.lost_reports set status = 'verified', updated_at = now() where id = r.id;
    update public.found_items set status = 'claimed' where id = c.item_id;
    update public.lost_claims set status = 'failed', decided_at = now() where item_id = c.item_id and id <> c.id and status in ('pending','manual_review');
  else
    update public.lost_claims set status = p_decision, decided_by = (select auth.uid()), decided_at = now(), evidence = evidence || jsonb_build_object('note', p_note) where id = c.id;
    if p_decision = 'failed' and not exists (select 1 from public.lost_claims x where x.report_id = r.id and x.status in ('pending','manual_review','verified')) then
      update public.lost_reports set status = 'submitted', updated_at = now() where id = r.id and status = 'matched';
    end if;
    if p_decision = 'failed' and not exists (select 1 from public.lost_claims x where x.item_id = c.item_id and x.status in ('pending','manual_review','verified')) then
      update public.found_items set status = 'logged' where id = c.item_id and status = 'matched';
    end if;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), (select workspace_id from public.events where id = r.event_id), 'lost_property.claim_decided',
    jsonb_build_object('claim_id', c.id, 'decision', p_decision));
  return jsonb_build_object('ok', true, 'status', p_decision);
end $$;

-- Reporter view: own reports, derived status only (never other items or evidence).
create or replace function public.my_lost_reports() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'event_id', r.event_id, 'category', r.category, 'description', r.description, 'created_at', r.created_at,
      'status', case r.status when 'submitted' then 'searching' when 'matched' then 'possible_match' when 'verified' then 'ready_to_collect' else r.status end) order by r.created_at desc), '[]'::jsonb)
    from public.lost_reports r where r.reporter_id = (select auth.uid())
$$;

create or replace function public.job_lost_property_sweep(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c int; r int; d int;
begin
  update public.lost_claims set status = 'expired' where status in ('pending','manual_review') and created_at < now() - interval '14 days'; get diagnostics c = row_count;
  update public.lost_reports set status = 'expired', updated_at = now() where status in ('submitted','matched') and created_at < now() - interval '60 days'; get diagnostics r = row_count;
  select count(*) into d from public.found_items where status in ('logged','matched') and dispose_after < now();
  return jsonb_build_object('claims_expired', c, 'reports_expired', r, 'items_due_for_disposal', d);
end $$;
insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('lost_property.sweep', 'db', 'public.job_lost_property_sweep', 3, 'Q40: daily; expire stale lost-property claims/reports, count items due for disposal')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, description = excluded.description, updated_at = now();

-- ═══ 2. Sustainability ═══
create table if not exists public.sustainability_factors (
  key text not null, version integer not null default 1,
  kind text not null check (kind in ('waste','energy','water','travel')),
  unit text not null, kg_co2e_per_unit numeric not null check (kg_co2e_per_unit >= 0),
  source text not null, valid_from date not null default current_date, active boolean not null default true,
  primary key (key, version)
);
insert into public.sustainability_factors(key, version, kind, unit, kg_co2e_per_unit, source) values
  ('waste_general', 1, 'waste', 'kg', 0.467, 'Indicative UK 2024 (landfill, mixed) — confirm before reporting'),
  ('waste_recycled', 1, 'waste', 'kg', 0.021, 'Indicative UK 2024 (closed-loop recycling) — confirm before reporting'),
  ('waste_food_compost', 1, 'waste', 'kg', 0.009, 'Indicative UK 2024 (composting) — confirm before reporting'),
  ('electricity_grid', 1, 'energy', 'kWh', 0.207, 'Indicative UK 2024 grid average — confirm before reporting'),
  ('diesel_generator', 1, 'energy', 'litre', 2.51, 'Indicative UK 2024 diesel — confirm before reporting'),
  ('water_supply', 1, 'water', 'm3', 0.177, 'Indicative UK 2024 supply + treatment — confirm before reporting'),
  ('travel_car', 1, 'travel', 'km', 0.166, 'Indicative UK 2024 average car — confirm before reporting'),
  ('travel_rail', 1, 'travel', 'km', 0.035, 'Indicative UK 2024 national rail — confirm before reporting'),
  ('travel_bus', 1, 'travel', 'km', 0.102, 'Indicative UK 2024 local bus — confirm before reporting'),
  ('travel_van', 1, 'travel', 'km', 0.250, 'Indicative UK 2024 diesel van — confirm before reporting')
on conflict (key, version) do nothing;

create table if not exists public.sustainability_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('waste','energy','water','travel','supplier','note')),
  factor_key text, factor_version integer,
  quantity numeric check (quantity is null or quantity >= 0), unit text,
  method text not null default 'measured' check (method in ('measured','estimated')),
  supplier_listing_id uuid references public.listings(id) on delete set null,
  note text check (note is null or length(note) <= 2000),
  created_by uuid, created_at timestamptz not null default now(),
  check ((kind = 'note' and note is not null) or (kind <> 'note' and quantity is not null)),
  foreign key (factor_key, factor_version) references public.sustainability_factors(key, version)
);
create index if not exists sustainability_entries_event on public.sustainability_entries(event_id, kind);

create or replace function public.record_sustainability(p_event uuid, p_entries jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare x jsonb; f public.sustainability_factors; n int := 0; e public.events;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  for x in select * from jsonb_array_elements(p_entries) loop
    f := null;
    if x ? 'factor_key' then
      select * into f from public.sustainability_factors where key = x->>'factor_key' and active order by version desc limit 1;
      if f.key is null then raise exception 'unknown_factor' using errcode = '22023'; end if;
      if coalesce(x->>'unit', f.unit) <> f.unit then raise exception 'unit_mismatch' using errcode = '22023'; end if;
    end if;
    insert into public.sustainability_entries(event_id, kind, factor_key, factor_version, quantity, unit, method, supplier_listing_id, note, created_by)
      values (p_event, coalesce(x->>'kind', f.kind), f.key, f.version, (x->>'quantity')::numeric, coalesce(x->>'unit', f.unit), coalesce(x->>'method', 'measured'),
        nullif(x->>'supplier_listing_id', '')::uuid, x->>'note', (select auth.uid()));
    n := n + 1;
  end loop;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), e.workspace_id, 'sustainability.recorded', jsonb_build_object('event_id', p_event, 'entries', n));
  return jsonb_build_object('ok', true, 'entries', n);
end $$;

-- Attendee travel estimate from issued tickets × assumed mode split and average distance (stored as 'estimated').
create or replace function public.estimate_attendee_travel(p_event uuid, p_avg_km numeric, p_split jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare att int; k text; share numeric; total numeric := 0;
begin
  if not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_avg_km is null or p_avg_km <= 0 or p_avg_km > 2000 then raise exception 'invalid_distance' using errcode = '22023'; end if;
  select count(*) into att from public.tickets where event_id = p_event and status in ('valid','used');
  delete from public.sustainability_entries where event_id = p_event and kind = 'travel' and method = 'estimated' and note = 'attendee_travel_estimate';
  for k, share in select key, value::numeric from jsonb_each_text(p_split) loop
    if k not in ('car','rail','bus') then raise exception 'invalid_mode' using errcode = '22023'; end if;
    total := total + share;
    insert into public.sustainability_entries(event_id, kind, factor_key, factor_version, quantity, unit, method, note, created_by)
      select p_event, 'travel', f.key, f.version, round(att * share * p_avg_km * 2, 1), 'km', 'estimated', 'attendee_travel_estimate', (select auth.uid())
        from public.sustainability_factors f where f.key = 'travel_' || k and f.active order by f.version desc limit 1;
  end loop;
  if abs(total - 1) > 0.01 then raise exception 'split_must_total_1' using errcode = '22023'; end if;
  return jsonb_build_object('ok', true, 'attendees', att, 'round_trip_km_each', p_avg_km * 2);
end $$;

create or replace function public.event_sustainability_report(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare att int; tot numeric; w_all numeric; w_rec numeric;
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select count(*) into att from public.tickets where event_id = p_event and status in ('valid','used');
  select coalesce(sum(s.quantity * f.kg_co2e_per_unit), 0) into tot from public.sustainability_entries s join public.sustainability_factors f on f.key = s.factor_key and f.version = s.factor_version where s.event_id = p_event;
  select coalesce(sum(quantity) filter (where factor_key like 'waste_%'), 0), coalesce(sum(quantity) filter (where factor_key in ('waste_recycled','waste_food_compost')), 0)
    into w_all, w_rec from public.sustainability_entries where event_id = p_event and kind = 'waste';
  return jsonb_build_object('event_id', p_event, 'attendees', att, 'kg_co2e_total', round(tot, 2), 'kg_co2e_per_attendee', case when att > 0 then round(tot / att, 3) end,
    'by_kind', coalesce((select jsonb_object_agg(kind, jsonb_build_object('kg_co2e', round(k, 2), 'entries', n, 'estimated', est)) from (
        select s.kind, sum(s.quantity * coalesce(f.kg_co2e_per_unit, 0)) k, count(*) n, bool_or(s.method = 'estimated') est
          from public.sustainability_entries s left join public.sustainability_factors f on f.key = s.factor_key and f.version = s.factor_version where s.event_id = p_event and s.kind <> 'note' group by s.kind) q), '{}'::jsonb),
    'waste_kg', w_all, 'recycling_rate', case when w_all > 0 then round(w_rec / w_all, 3) end,
    'suppliers', coalesce((select jsonb_agg(jsonb_build_object('listing_id', q.id, 'name', q.name, 'kg_co2e', round(q.k, 2), 'entries', q.n)) from (
        select s.supplier_listing_id id, l.name, sum(s.quantity * coalesce(f.kg_co2e_per_unit, 0)) k, count(*) n
          from public.sustainability_entries s join public.listings l on l.id = s.supplier_listing_id left join public.sustainability_factors f on f.key = s.factor_key and f.version = s.factor_version
         where s.event_id = p_event group by s.supplier_listing_id, l.name) q), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('note', note, 'at', created_at) order by created_at) from public.sustainability_entries where event_id = p_event and kind = 'note'), '[]'::jsonb),
    'provenance', coalesce((select jsonb_agg(distinct jsonb_build_object('factor', f.key, 'version', f.version, 'source', f.source))
        from public.sustainability_entries s join public.sustainability_factors f on f.key = s.factor_key and f.version = s.factor_version where s.event_id = p_event), '[]'::jsonb));
end $$;

-- ═══ RLS ═══
alter table public.lost_reports enable row level security;
alter table public.found_items enable row level security;
alter table public.lost_claims enable row level security;
alter table public.sustainability_factors enable row level security;
alter table public.sustainability_entries enable row level security;
revoke all on table public.lost_reports, public.found_items, public.lost_claims, public.sustainability_factors, public.sustainability_entries from public, anon, authenticated;
grant select on table public.lost_reports, public.found_items, public.lost_claims, public.sustainability_factors, public.sustainability_entries to authenticated;
grant all on table public.lost_reports, public.found_items, public.lost_claims, public.sustainability_factors, public.sustainability_entries to service_role;
drop policy if exists lost_reports_read on public.lost_reports;
create policy lost_reports_read on public.lost_reports for select to authenticated using (public.lost_property_team(event_id));
drop policy if exists found_items_read on public.found_items;
create policy found_items_read on public.found_items for select to authenticated using (public.lost_property_team(event_id));
drop policy if exists lost_claims_read on public.lost_claims;
create policy lost_claims_read on public.lost_claims for select to authenticated using (exists (select 1 from public.lost_reports r where r.id = report_id and public.lost_property_team(r.event_id)));
drop policy if exists sustainability_factors_read on public.sustainability_factors;
create policy sustainability_factors_read on public.sustainability_factors for select to authenticated using (true);
drop policy if exists sustainability_entries_read on public.sustainability_entries;
create policy sustainability_entries_read on public.sustainability_entries for select to authenticated using (public.can_access_event(event_id));

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('lost_property.reported', 1, 'lost_report', 'A lost item was reported (payload: event_id, report_id, category).', null),
  ('lost_property.found_logged', 1, 'found_item', 'A found item was logged (payload: event_id, item_id).', null),
  ('lost_property.claim_decided', 1, 'lost_claim', 'A lost-property claim was decided (payload: claim_id, decision).', null),
  ('lost_report.state_changed', 1, 'lost_report', 'A lost report changed status.', null),
  ('found_item.state_changed', 1, 'found_item', 'A found item changed status.', null),
  ('sustainability.recorded', 1, 'event', 'Sustainability entries were recorded (payload: event_id, entries).', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate;

revoke all on function public.lost_property_team(uuid), public.job_lost_property_sweep(public.job_queue) from public, anon, authenticated;
grant execute on function public.lost_property_team(uuid) to authenticated, service_role;
grant execute on function public.job_lost_property_sweep(public.job_queue) to service_role;
revoke all on function public.report_lost_item(uuid, jsonb), public.log_found_item(uuid, jsonb), public.lost_property_matches(uuid, integer), public.claim_found_item(uuid, uuid, jsonb),
  public.decide_lost_claim(uuid, text, text), public.my_lost_reports(), public.record_sustainability(uuid, jsonb), public.estimate_attendee_travel(uuid, numeric, jsonb),
  public.event_sustainability_report(uuid) from public, anon;
grant execute on function public.report_lost_item(uuid, jsonb), public.log_found_item(uuid, jsonb), public.lost_property_matches(uuid, integer), public.claim_found_item(uuid, uuid, jsonb),
  public.decide_lost_claim(uuid, text, text), public.my_lost_reports(), public.record_sustainability(uuid, jsonb), public.estimate_attendee_travel(uuid, numeric, jsonb),
  public.event_sustainability_report(uuid) to authenticated, service_role;
