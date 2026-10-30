-- Q40 Advanced Event Composition, part 2 (lane A, 2026-10-29): shared tickets across occurrences/days/venues and the lifecycle
-- cascade. Additive, backward compatible.
--   * Pass tiers (ticket_tiers.pass_kind: season | multi_day | multi_venue | series) are ordinary Q20 tiers on the anchor /
--     parent event. ticket_pass_components binds a pass to component tiers (other occurrences, days, children). Every unit
--     held or sold on the pass commits units on each component (ticket_tiers.pass_committed) under row locks taken in a
--     fixed order, so a pass and a single-date ticket can never oversell a date (sold + held + pass_committed ≤ quantity,
--     CHECK + 'sold_out' from the trigger). Releasing/refunding the pass returns the units.
--   * ticket_tier_reserved (Q20, replaced) now also counts pass_committed, so hold_tickets / public availability see it.
--   * pass_entitlements: one row per pass ticket × component (created on issue, revoked on refund/transfer/resale);
--     pass_entitlement_check(ticket, event) for the scanner (lane D hook).
--   * event_composition_blockers(event, to) — service-only, for lane C's event_lifecycle_blockers: a child cannot publish
--     before its parent, a parent cannot cancel/complete/archive/postpone with unhandled children, archived series block
--     publishing, pass components affected by a cancellation are flagged.
--   * cascade_event_transition(parent, to, child_action same|detach, reason) handles children explicitly, then the parent.

-- ═══ 1. Pass tiers ═══
alter table public.ticket_tiers add column if not exists pass_kind text check (pass_kind is null or pass_kind in ('season','multi_day','multi_venue','series'));
alter table public.ticket_tiers add column if not exists pass_committed integer not null default 0 check (pass_committed >= 0);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ticket_tiers_pass_capacity' and conrelid = 'public.ticket_tiers'::regclass) then
    alter table public.ticket_tiers add constraint ticket_tiers_pass_capacity check (sold + held + pass_committed <= quantity) not valid;
    alter table public.ticket_tiers validate constraint ticket_tiers_pass_capacity;
  end if;
end $$;

create table if not exists public.ticket_pass_components (
  pass_tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  component_tier_id uuid not null references public.ticket_tiers(id) on delete restrict,
  units integer not null default 1 check (units between 1 and 10),
  created_at timestamptz not null default now(),
  primary key (pass_tier_id, component_tier_id),
  check (pass_tier_id <> component_tier_id)
);
create index if not exists ticket_pass_components_component on public.ticket_pass_components(component_tier_id);
alter table public.ticket_pass_components enable row level security;
revoke all on table public.ticket_pass_components from public, anon, authenticated;
grant select on table public.ticket_pass_components to anon, authenticated;
grant all on table public.ticket_pass_components to service_role;
drop policy if exists ticket_pass_components_read on public.ticket_pass_components;
create policy ticket_pass_components_read on public.ticket_pass_components for select using (exists (select 1 from public.ticket_tiers t where t.id = pass_tier_id));

-- Unused reserved units on a tier (Q20) + units committed to passes. Same signature as the deployed function.
create or replace function public.ticket_tier_reserved(p_tier uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select (coalesce((select sum(greatest(0, a.quantity - public.ticket_allocation_used(a.id))) from public.ticket_allocations a where a.tier_id = p_tier and a.status = 'active'), 0)
        + coalesce((select t.pass_committed from public.ticket_tiers t where t.id = p_tier), 0))::int
$$;

-- Composition rule for components: same workspace, and the component event is the pass event, a descendant of it, or an
-- occurrence of the same series; never another pass; never after the pass sold anything.
create or replace function public.set_pass_components(p_pass_tier uuid, p_kind text, p_components jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare p public.ticket_tiers; pe public.events; x jsonb; c public.ticket_tiers; ce public.events; n int := 0;
begin
  select * into p from public.ticket_tiers where id = p_pass_tier for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into pe from public.events where id = p.event_id;
  if pe.workspace_id is null or not public.has_permission(pe.workspace_id, 'tickets.manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_kind not in ('season','multi_day','multi_venue','series') then raise exception 'invalid_pass_kind' using errcode = '22023'; end if;
  if p.sold + p.held > 0 then raise exception 'pass_already_selling' using errcode = '22023'; end if;
  delete from public.ticket_pass_components where pass_tier_id = p.id;
  for x in select * from jsonb_array_elements(p_components) loop
    select * into c from public.ticket_tiers where id = (x->>'tier_id')::uuid;
    if not found or c.pass_kind is not null then raise exception 'invalid_component' using errcode = '22023'; end if;
    select * into ce from public.events where id = c.event_id;
    if ce.workspace_id is distinct from pe.workspace_id
       or not (ce.id = pe.id or ce.id in (select id from public.event_children(pe.id)) or (pe.series_id is not null and ce.series_id = pe.series_id)) then
      raise exception 'component_not_composed' using errcode = '22023';
    end if;
    insert into public.ticket_pass_components(pass_tier_id, component_tier_id, units) values (p.id, c.id, coalesce((x->>'units')::int, 1));
    n := n + 1;
  end loop;
  if n < 2 then raise exception 'pass_needs_two_components' using errcode = '22023'; end if;
  update public.ticket_tiers set pass_kind = p_kind where id = p.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), pe.workspace_id, 'ticket.pass_configured', jsonb_build_object('tier_id', p.id, 'kind', p_kind, 'components', n));
  return jsonb_build_object('ok', true, 'components', n);
end $$;

-- Every writer that changes a pass tier's sold/held commits or releases the units on each component in one transaction.
create or replace function public.ticket_pass_propagate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d int := (new.sold + new.held) - (old.sold + old.held); c record; avail int;
begin
  if d = 0 then return new; end if;
  for c in select pc.component_tier_id id, pc.units from public.ticket_pass_components pc where pc.pass_tier_id = new.id order by pc.component_tier_id loop
    if d > 0 then
      perform 1 from public.ticket_tiers where id = c.id for update;
      select t.quantity - t.sold - t.held - public.ticket_tier_reserved(t.id) into avail from public.ticket_tiers t where t.id = c.id;
      if d * c.units > avail then raise exception 'sold_out' using errcode = '22023', detail = 'pass component ' || c.id || ' has no capacity'; end if;
      update public.ticket_tiers set pass_committed = pass_committed + d * c.units where id = c.id;
    else
      update public.ticket_tiers set pass_committed = greatest(0, pass_committed + d * c.units) where id = c.id;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists ticket_pass_propagate on public.ticket_tiers;
create trigger ticket_pass_propagate before update of sold, held on public.ticket_tiers for each row when (new.pass_kind is not null) execute function public.ticket_pass_propagate();

-- ═══ 2. Entitlements ═══
create table if not exists public.pass_entitlements (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  pass_tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  component_tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  component_event_id uuid not null references public.events(id) on delete cascade,
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(), revoked_at timestamptz, revoked_reason text,
  unique (ticket_id, component_tier_id)
);
create index if not exists pass_entitlements_event on public.pass_entitlements(component_event_id, status);
alter table public.pass_entitlements enable row level security;
revoke all on table public.pass_entitlements from public, anon, authenticated;
grant select on table public.pass_entitlements to authenticated;
grant all on table public.pass_entitlements to service_role;
drop policy if exists pass_entitlements_read on public.pass_entitlements;
create policy pass_entitlements_read on public.pass_entitlements for select to authenticated using (
  exists (select 1 from public.tickets t where t.id = ticket_id and t.holder_id = (select auth.uid())) or public.can_access_event(component_event_id));

create or replace function public.tickets_pass_entitlements() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pass_entitlements(ticket_id, pass_tier_id, component_tier_id, component_event_id)
      select new.id, pc.pass_tier_id, pc.component_tier_id, t.event_id from public.ticket_pass_components pc join public.ticket_tiers t on t.id = pc.component_tier_id
       where pc.pass_tier_id = new.tier_id
    on conflict do nothing;
  elsif new.status is distinct from old.status and new.status in ('refunded','transferred','resold','void','cancelled') then
    update public.pass_entitlements set status = 'revoked', revoked_at = now(), revoked_reason = new.status where ticket_id = new.id and status = 'active';
  elsif new.status is distinct from old.status and new.status in ('valid','used') and old.status in ('refunded','void','cancelled') then
    update public.pass_entitlements set status = 'active', revoked_at = null, revoked_reason = null where ticket_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists tickets_pass_entitlements on public.tickets;
create trigger tickets_pass_entitlements after insert or update of status on public.tickets for each row execute function public.tickets_pass_entitlements();

-- Scanner hook (service-only): may this ticket be admitted at this event? Own-event tickets → 'own_event' (normal Q18 path).
create or replace function public.pass_entitlement_check(p_ticket uuid, p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.tickets; e public.pass_entitlements; ev public.events;
begin
  select * into t from public.tickets where id = p_ticket;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_ticket'); end if;
  if t.event_id = p_event then return jsonb_build_object('ok', true, 'reason', 'own_event'); end if;
  if t.status not in ('valid','used','resale_listed') then return jsonb_build_object('ok', false, 'reason', 'ticket_' || t.status); end if;
  select * into e from public.pass_entitlements where ticket_id = t.id and component_event_id = p_event;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_entitled'); end if;
  if e.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'entitlement_' || e.status); end if;
  select * into ev from public.events where id = p_event;
  if ev.status in ('cancelled','archived','postponed') then return jsonb_build_object('ok', false, 'reason', 'event_' || ev.status); end if;
  return jsonb_build_object('ok', true, 'reason', 'pass', 'component_tier_id', e.component_tier_id, 'pass_tier_id', e.pass_tier_id);
end $$;

create or replace function public.event_pass_inventory(p_pass_tier uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.ticket_tiers;
begin
  select * into p from public.ticket_tiers where id = p_pass_tier;
  if not found or not public.can_access_event(p.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object('pass_tier_id', p.id, 'kind', p.pass_kind, 'quantity', p.quantity, 'sold', p.sold, 'held', p.held,
    'available', greatest(0, least(p.quantity - p.sold - p.held - public.ticket_tier_reserved(p.id),
       coalesce((select min((t.quantity - t.sold - t.held - public.ticket_tier_reserved(t.id)) / pc.units) from public.ticket_pass_components pc join public.ticket_tiers t on t.id = pc.component_tier_id where pc.pass_tier_id = p.id), 0))),
    'components', coalesce((select jsonb_agg(jsonb_build_object('tier_id', t.id, 'event_id', t.event_id, 'name', t.name, 'quantity', t.quantity, 'sold', t.sold, 'held', t.held,
        'pass_committed', t.pass_committed, 'available', greatest(0, t.quantity - t.sold - t.held - public.ticket_tier_reserved(t.id)), 'units', pc.units))
      from public.ticket_pass_components pc join public.ticket_tiers t on t.id = pc.component_tier_id where pc.pass_tier_id = p.id), '[]'));
end $$;

-- ═══ 3. Lifecycle composition rules (for lane C's event_lifecycle_blockers) ═══
create or replace function public.event_composition_blockers(p_event uuid, p_to text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; p public.events; b jsonb := '[]'; kids jsonb; n int;
begin
  select * into e from public.events where id = p_event;
  if not found then return b; end if;
  if p_to in ('published','on_sale','live') then
    if e.parent_event_id is not null then
      select * into p from public.events where id = e.parent_event_id;
      if p.status not in ('published','on_sale','live') then
        b := b || jsonb_build_object('key', 'parent_not_published', 'severity', 'block', 'label', 'Publish the parent event "' || p.name || '" first', 'fix', '/organizer/events/' || p.id);
      end if;
    end if;
    if e.series_id is not null and exists (select 1 from public.event_series s where s.id = e.series_id and s.status = 'archived') then
      b := b || jsonb_build_object('key', 'series_archived', 'severity', 'block', 'label', 'This date belongs to an archived series', 'fix', '/organizer/events/' || e.id);
    end if;
    if exists (select 1 from public.ticket_tiers t join public.ticket_pass_components pc on pc.pass_tier_id = t.id join public.ticket_tiers c on c.id = pc.component_tier_id
                join public.events ce on ce.id = c.event_id where t.event_id = e.id and t.status not in ('draft','hidden') and ce.status in ('cancelled','archived')) then
      b := b || jsonb_build_object('key', 'pass_component_cancelled', 'severity', 'block', 'label', 'A pass on this event includes a cancelled date — update the pass first', 'fix', '/organizer/events/' || e.id || '?tab=sell');
    end if;
  end if;
  if p_to in ('cancelled','archived','completed','closed','postponed') then
    select count(*), coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status)), '[]') into n, kids
      from public.events c where c.parent_event_id = e.id
       and c.status not in ('cancelled','archived','closed') and not (c.status = 'completed' and p_to in ('completed','closed','archived'))
       and not (p_to = 'postponed' and c.status in ('draft','planning','ready','postponed'));
    if n > 0 then
      b := b || jsonb_build_object('key', 'children_unhandled', 'severity', 'block', 'count', n, 'children', kids,
        'label', n || ' sub-event(s) still open — cancel, complete or detach them first (or use the cascade command)', 'fix', '/organizer/events/' || e.id || '?tab=plan');
    end if;
    if p_to = 'cancelled' and exists (select 1 from public.pass_entitlements x where x.component_event_id = e.id and x.status = 'active') then
      b := b || jsonb_build_object('key', 'pass_holders_affected', 'severity', 'warning',
        'count', (select count(*) from public.pass_entitlements x where x.component_event_id = e.id and x.status = 'active'),
        'label', 'Pass holders are entitled to this date — decide credit or partial refunds for their passes', 'fix', '/organizer/events/' || e.id || '?tab=money');
    end if;
  end if;
  return b;
end $$;

-- Explicit cascade: children first (same transition or detach), then the parent through event_transition.
create or replace function public.cascade_event_transition(p_event uuid, p_to text, p_child_action text, p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; c record; res jsonb := '[]'; r jsonb; bl jsonb;
begin
  select * into e from public.events where id = p_event;
  if not found or e.workspace_id is null or not public.has_workspace_role(e.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_child_action not in ('same','detach') then raise exception 'invalid_child_action' using errcode = '22023'; end if;
  for c in select x.id, x.status from public.events x where x.parent_event_id = e.id and x.status not in ('cancelled','archived','closed') order by x.starts_at loop
    if p_child_action = 'detach' then
      update public.events set parent_event_id = null, composition_role = 'standalone' where id = c.id;
      res := res || jsonb_build_object('id', c.id, 'action', 'detached');
    elsif public.state_transition_allowed('event', c.status, p_to) or c.status = p_to then
      begin
        r := public.event_transition(c.id, p_to, c.status, coalesce(p_reason, 'parent ' || p_to));
        res := res || jsonb_build_object('id', c.id, 'action', p_to, 'result', r);
      exception when others then
        res := res || jsonb_build_object('id', c.id, 'action', 'failed', 'error', left(sqlerrm, 200));
      end;
    else
      res := res || jsonb_build_object('id', c.id, 'action', 'skipped', 'reason', 'illegal_from_' || c.status);
    end if;
  end loop;
  bl := (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements(public.event_composition_blockers(e.id, p_to)) x where x->>'severity' = 'block');
  if jsonb_array_length(bl) > 0 then return jsonb_build_object('ok', false, 'error', 'preconditions', 'blockers', bl, 'children', res); end if;
  r := public.event_transition(e.id, p_to, e.status, p_reason);
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), e.workspace_id, 'event.composition_cascaded', jsonb_build_object('event_id', e.id, 'to', p_to, 'child_action', p_child_action, 'children', jsonb_array_length(res)));
  return jsonb_build_object('ok', coalesce((r->>'ok')::boolean, false), 'result', r, 'children', res);
end $$;

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('ticket.pass_configured', 1, 'ticket_tier', 'A pass tier''s components were set (payload: tier_id, kind, components).', null),
  ('event.composition_cascaded', 1, 'event', 'A parent event transition was cascaded to its sub-events (payload: event_id, to, child_action, children).', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate;

revoke all on function public.ticket_pass_propagate(), public.tickets_pass_entitlements(), public.pass_entitlement_check(uuid, uuid), public.event_composition_blockers(uuid, text) from public, anon, authenticated;
grant execute on function public.pass_entitlement_check(uuid, uuid), public.event_composition_blockers(uuid, text) to service_role;
revoke all on function public.set_pass_components(uuid, text, jsonb), public.event_pass_inventory(uuid), public.cascade_event_transition(uuid, text, text, text) from public, anon;
grant execute on function public.set_pass_components(uuid, text, jsonb), public.event_pass_inventory(uuid), public.cascade_event_transition(uuid, text, text, text) to authenticated, service_role;
-- ticket_tier_reserved keeps its existing grants (service_role only).
