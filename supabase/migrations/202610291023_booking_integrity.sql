-- Q10/Q11/Q12 P1 booking integrity (lane A, 2026-10-29). Additive and backward-compatible with deployed code.
--  1. Q10: a marketplace confirmation carries the space (request → quote → hold → build item → job) and runs the same
--     conflict rules as a direct booking. A venue item with no resolvable space occupies the whole venue until the provider
--     assigns a space. If the slot was taken between quote and payment, the paid confirmation is not silently double-booked:
--     the item moves to replacement_required, a booking_conflicts record is opened, both parties are notified and a full
--     platform-party cancellation is queued for the Q07 refund worker (refund on the seller's connected-account charge).
--  2. Q12: service jobs get a capacity model (provider_capacity_rules: concurrent limit, setup/teardown/travel buffers,
--     block|warn policy; default = solo supplier, 1 concurrent job, block) checked under an advisory lock; crew shifts get
--     the same lock + overlap + crew availability-block check.
--  3. Q11: blocked/maintenance availability_blocks, hard conditional holds, exclusive groups and whole-venue jobs stop
--     direct and marketplace bookings; setup/cleardown minutes join the turnaround buffer; specific conflict codes
--     (turnaround_conflict, blocked_conflict, …) are surfaced instead of collapsing to hard_conflict.
-- Concurrency: every venue booking write takes advisory lock venue_booking:<venue>; every service job write takes
-- supplier_capacity:<workspace>; crew shifts take crew_capacity:<crew>. Checks run after the lock with a fresh snapshot
-- (plpgsql volatile statements in READ COMMITTED), and provider_jobs_no_space_overlap remains the last line of defence.

-- ─── Schema ─────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.build_items add column if not exists space_id uuid references public.spaces(id) on delete set null;
create index if not exists build_items_space_idx on public.build_items(space_id) where space_id is not null;

create table if not exists public.provider_capacity_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope text not null check (scope in ('workspace','listing','crew')),
  listing_id uuid references public.listings(id) on delete cascade,
  crew_id uuid references public.crew_members(id) on delete cascade,
  concurrent_limit integer not null default 1 check (concurrent_limit between 1 and 500),
  setup_minutes integer not null default 0 check (setup_minutes between 0 and 1440),
  teardown_minutes integer not null default 0 check (teardown_minutes between 0 and 1440),
  travel_minutes integer not null default 0 check (travel_minutes between 0 and 1440),
  policy text not null default 'block' check (policy in ('block','warn')),
  active boolean not null default true,
  note text not null default '' check (length(note) <= 500),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'workspace' and listing_id is null and crew_id is null) or (scope = 'listing' and listing_id is not null and crew_id is null)
      or (scope = 'crew' and crew_id is not null and listing_id is null))
);
create unique index if not exists provider_capacity_rules_scope_key
  on public.provider_capacity_rules(workspace_id, scope, coalesce(listing_id, crew_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.provider_capacity_rules enable row level security;
drop policy if exists provider_capacity_rules_member_read on public.provider_capacity_rules;
create policy provider_capacity_rules_member_read on public.provider_capacity_rules for select to authenticated using (public.is_workspace_member(workspace_id));
revoke all on table public.provider_capacity_rules from public, anon, authenticated;
grant select on table public.provider_capacity_rules to authenticated;
grant all on table public.provider_capacity_rules to service_role;

create table if not exists public.booking_conflicts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  build_item_id uuid references public.build_items(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  space_id uuid references public.spaces(id) on delete set null,
  kind text not null check (kind in ('hard_conflict','turnaround_conflict','exclusive_conflict','blocked_conflict','venue_conflict','hold_conflict','capacity_conflict','crew_conflict')),
  detail text not null default '',
  source text not null default 'marketplace_confirmation' check (source in ('marketplace_confirmation','direct','backfill')),
  payment_order_ref text,
  cancellation_id uuid references public.booking_cancellations(id) on delete set null,
  status text not null default 'open' check (status in ('open','refund_queued','resolved','dismissed')),
  resolution text not null default '',
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists booking_conflicts_ws_idx on public.booking_conflicts(workspace_id, status, created_at desc);
create index if not exists booking_conflicts_item_idx on public.booking_conflicts(build_item_id);
alter table public.booking_conflicts enable row level security;
drop policy if exists booking_conflicts_read on public.booking_conflicts;
create policy booking_conflicts_read on public.booking_conflicts for select to authenticated
  using (public.is_workspace_member(workspace_id) or (event_id is not null and public.can_access_event(event_id)) or public.is_platform_admin());
revoke all on table public.booking_conflicts from public, anon, authenticated;
grant select on table public.booking_conflicts to authenticated;
grant all on table public.booking_conflicts to service_role;

create index if not exists provider_jobs_service_window_idx on public.provider_jobs(workspace_id, listing_id, starts_at) where mode = 'service' and role = 'primary';
create index if not exists provider_jobs_venue_window_idx on public.provider_jobs(listing_id, starts_at) where mode = 'venue' and role = 'primary';

-- ─── Space resolution: request → quote → hold → item → job ──────────────────────────────────────────────────────────
-- Returns the space a marketplace venue item books, and where it came from. Only spaces of the item's venue count.
create or replace function public.booking_item_space(p_item uuid)
returns table(space_id uuid, source text) language plpgsql stable security definer set search_path to '' as $$
declare b public.build_items; sid uuid; src text; v uuid; txt text;
begin
  select * into b from public.build_items where id = p_item;
  if not found or b.listing_id is null then return; end if;
  v := b.listing_id;
  if b.space_id is not null and exists(select 1 from public.spaces s where s.id = b.space_id and s.venue_id = v) then sid := b.space_id; src := 'item'; end if;
  if sid is null then
    txt := coalesce(nullif(b.quote->>'space_id', ''), (select nullif(q.terms->>'space_id', '') from public.provider_quotes q where q.id = nullif(b.quote->>'quote_id', '')::uuid));
    if txt ~* '^[0-9a-f-]{36}$' then select s.id into sid from public.spaces s where s.id = txt::uuid and s.venue_id = v; end if;
    if sid is not null then src := 'quote'; end if;
  end if;
  if sid is null then
    select h.space_id into sid from public.conditional_holds h join public.spaces s on s.id = h.space_id and s.venue_id = v
      where h.build_item_id = b.id and h.status in ('requested','held','converted') order by h.created_at desc limit 1;
    if sid is not null then src := 'hold'; end if;
  end if;
  if sid is null and b.request_id is not null then
    select pr.requirements->>'space_id' into txt from public.provider_requests pr where pr.id = b.request_id;
    if txt ~* '^[0-9a-f-]{36}$' then select s.id into sid from public.spaces s where s.id = txt::uuid and s.venue_id = v; end if;
    if sid is null then
      select s.id into sid from public.provider_requests pr join public.spaces s on s.venue_id = v and lower(s.name) = lower(pr.requirements->>'space')
        where pr.id = b.request_id limit 1;
    end if;
    if sid is not null then src := 'request'; end if;
  end if;
  if sid is null and (select count(*) from public.spaces s where s.venue_id = v) = 1 then
    select s.id into sid from public.spaces s where s.venue_id = v; src := 'only_space';
  end if;
  if sid is null then return; end if;
  return query select sid, src;
end $$;

-- ─── Venue rules (replaces enforce_space_rules; same trigger) ───────────────────────────────────────────────────────
create or replace function public.enforce_space_rules()
returns trigger language plpgsql set search_path to '' as $$
declare sp public.spaces; venue uuid; whole boolean; pre interval; post interval; clash text; vspaces uuid[];
begin
  if new.role <> 'primary' or new.status not in ('held','confirmed','active') then return new; end if;
  whole := new.space_id is null and new.mode = 'venue' and coalesce(new.details->>'occupancy', '') = 'whole_venue';
  if new.space_id is null and not whole then return new; end if;
  if tg_op = 'UPDATE' and old.space_id is not distinct from new.space_id and old.starts_at = new.starts_at and old.ends_at = new.ends_at
     and old.status in ('held','confirmed','active') and old.role = 'primary'
     and (old.details->>'occupancy') is not distinct from (new.details->>'occupancy') then return new; end if;
  if whole then
    venue := new.listing_id;
    select coalesce(max(make_interval(mins => coalesce(s.turnaround_minutes, 0) + coalesce((s.details->>'setup_minutes')::int, 0))), interval '0'),
           coalesce(max(make_interval(mins => coalesce(s.turnaround_minutes, 0) + coalesce((s.details->>'cleardown_minutes')::int, 0))), interval '0')
      into pre, post from public.spaces s where s.venue_id = venue;
  else
    select * into sp from public.spaces where id = new.space_id;
    venue := sp.venue_id;
    pre := make_interval(mins => coalesce(sp.turnaround_minutes, 0) + coalesce((sp.details->>'setup_minutes')::int, 0));
    post := make_interval(mins => coalesce(sp.turnaround_minutes, 0) + coalesce((sp.details->>'cleardown_minutes')::int, 0));
  end if;
  -- Serialise every booking write at this venue; the checks below then see each other's committed rows.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('venue_booking:' || coalesce(venue, new.space_id)::text, 0));
  select coalesce(array_agg(s.id), '{}') into vspaces from public.spaces s where s.venue_id = venue;

  -- Q11: blackouts and maintenance windows (space-level, or venue-wide when no space/crew is named).
  select coalesce(nullif(b.note, ''), b.kind) into clash from public.availability_blocks b
    where b.kind in ('blocked','maintenance') and tstzrange(b.starts_at, b.ends_at) && tstzrange(new.starts_at, new.ends_at)
      and (case when whole then b.space_id = any(vspaces) or (b.space_id is null and b.crew_id is null and b.listing_id = venue)
                else b.space_id = new.space_id or (b.space_id is null and b.crew_id is null and b.listing_id = venue) end)
    limit 1;
  if clash is not null then raise exception 'blocked_conflict' using errcode = '23P01', detail = clash; end if;

  if whole then
    select j.event_name into clash from public.provider_jobs j
      where j.id <> new.id and j.role = 'primary' and j.status in ('held','confirmed','active')
        and (j.space_id = any(vspaces) or (j.space_id is null and j.listing_id = venue and j.mode = 'venue'
             and (j.details->>'occupancy' = 'whole_venue' or coalesce((j.details->>'exclusive')::boolean, false))))
        and tstzrange(j.starts_at, j.ends_at) && tstzrange(new.starts_at - pre, new.ends_at + post)
      limit 1;
    if clash is not null then raise exception 'venue_conflict' using errcode = '23P01', detail = clash; end if;
    select coalesce(nullif(h.conditions, ''), 'hard hold') into clash from public.conditional_holds h
      where h.status = 'held' and h.blocking_level = 'hard' and (h.space_id = any(vspaces) or (h.space_id is null and h.listing_id = venue))
        and h.build_item_id is distinct from new.build_item_id
        and tstzrange(coalesce(h.window_start, h.starts_at), coalesce(h.window_end, h.ends_at)) && tstzrange(new.starts_at, new.ends_at)
      limit 1;
    if clash is not null then raise exception 'hold_conflict' using errcode = '23P01', detail = clash; end if;
    return new;
  end if;

  -- Same space, with turnaround + setup/cleardown buffers.
  select j.event_name into clash from public.provider_jobs j
    where j.id <> new.id and j.role = 'primary' and j.status in ('held','confirmed','active') and j.space_id = new.space_id
      and tstzrange(j.starts_at, j.ends_at) && tstzrange(new.starts_at - pre, new.ends_at + post)
    limit 1;
  if clash is not null then raise exception 'turnaround_conflict' using errcode = '23P01', detail = clash; end if;
  -- A whole-venue (or legacy exclusive-hire) job at this venue.
  select j.event_name into clash from public.provider_jobs j
    where j.id <> new.id and j.role = 'primary' and j.status in ('held','confirmed','active') and j.space_id is null and j.mode = 'venue' and j.listing_id = venue
      and (j.details->>'occupancy' = 'whole_venue' or coalesce((j.details->>'exclusive')::boolean, false))
      and tstzrange(j.starts_at, j.ends_at) && tstzrange(new.starts_at - pre, new.ends_at + post)
    limit 1;
  if clash is not null then raise exception 'venue_conflict' using errcode = '23P01', detail = clash; end if;
  -- Exclusive pairings and exclusive groups.
  select j.event_name into clash from public.provider_jobs j
    where j.id <> new.id and j.role = 'primary' and j.status in ('held','confirmed','active') and j.space_id is not null and j.space_id <> new.space_id
      and tstzrange(j.starts_at, j.ends_at) && tstzrange(new.starts_at, new.ends_at)
      and (exists(select 1 from public.space_links l where l.kind = 'exclusive'
                    and ((l.space_a = new.space_id and l.space_b = j.space_id) or (l.space_b = new.space_id and l.space_a = j.space_id)))
           or (sp.exclusive_group is not null and exists(select 1 from public.spaces x where x.id = j.space_id and x.exclusive_group = sp.exclusive_group)))
    limit 1;
  if clash is not null then raise exception 'exclusive_conflict' using errcode = '23P01', detail = clash; end if;
  -- Another booking's hard hold on this space.
  select coalesce(nullif(h.conditions, ''), 'hard hold') into clash from public.conditional_holds h
    where h.status = 'held' and h.blocking_level = 'hard' and h.space_id = new.space_id and h.build_item_id is distinct from new.build_item_id
      and tstzrange(coalesce(h.window_start, h.starts_at), coalesce(h.window_end, h.ends_at)) && tstzrange(new.starts_at, new.ends_at)
    limit 1;
  if clash is not null then raise exception 'hold_conflict' using errcode = '23P01', detail = clash; end if;
  return new;
end $$;

-- ─── Supplier capacity (Q12) ────────────────────────────────────────────────────────────────────────────────────────
-- Peak number of live service jobs overlapping [p_from, p_to) (max concurrency occurs at a start point).
create or replace function public.service_overlap_peak(p_ws uuid, p_listing uuid, p_exclude uuid, p_from timestamptz, p_to timestamptz)
returns integer language sql stable set search_path to '' as $$
  with j as (
    select starts_at, ends_at from public.provider_jobs
    where workspace_id = p_ws and mode = 'service' and role = 'primary' and status in ('held','confirmed','active') and id <> p_exclude
      and (p_listing is null or listing_id = p_listing) and tstzrange(starts_at, ends_at) && tstzrange(p_from, p_to)),
  pts as (select p_from as t union select greatest(starts_at, p_from) from j)
  select coalesce(max((select count(*) from j where j.starts_at <= pts.t and j.ends_at > pts.t)), 0)::integer from pts
$$;

create or replace function public.enforce_service_capacity()
returns trigger language plpgsql set search_path to '' as $$
declare lr public.provider_capacity_rules; wr public.provider_capacity_rules; peak integer; lim integer; pol text; pre interval; post interval; warn jsonb := '[]';
begin
  if new.mode <> 'service' or new.role <> 'primary' or new.status not in ('held','confirmed','active') or new.listing_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.mode = 'service' and old.role = 'primary' and old.status in ('held','confirmed','active') and old.starts_at = new.starts_at
     and old.ends_at = new.ends_at and old.listing_id is not distinct from new.listing_id then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('supplier_capacity:' || new.workspace_id::text, 0));
  select * into lr from public.provider_capacity_rules where workspace_id = new.workspace_id and scope = 'listing' and listing_id = new.listing_id and active;
  select * into wr from public.provider_capacity_rules where workspace_id = new.workspace_id and scope = 'workspace' and active;
  -- Per service listing: the explicit rule, or the solo-supplier default (1 concurrent job, block) when no workspace rule exists.
  if lr.id is not null or wr.id is null then
    lim := coalesce(lr.concurrent_limit, 1); pol := coalesce(lr.policy, 'block');
    pre := make_interval(mins => coalesce(lr.setup_minutes, 0) + coalesce(lr.travel_minutes, 0));
    post := make_interval(mins => coalesce(lr.teardown_minutes, 0) + coalesce(lr.travel_minutes, 0));
    peak := public.service_overlap_peak(new.workspace_id, new.listing_id, new.id, new.starts_at - pre, new.ends_at + post);
    if peak + 1 > lim then
      if pol = 'block' then raise exception 'capacity_conflict' using errcode = '23P01', detail = format('listing limit %s, %s overlapping', lim, peak); end if;
      warn := warn || jsonb_build_object('scope', 'listing', 'limit', lim, 'overlapping', peak);
    end if;
  end if;
  if wr.id is not null then
    pre := make_interval(mins => wr.setup_minutes + wr.travel_minutes); post := make_interval(mins => wr.teardown_minutes + wr.travel_minutes);
    peak := public.service_overlap_peak(new.workspace_id, null, new.id, new.starts_at - pre, new.ends_at + post);
    if peak + 1 > wr.concurrent_limit then
      if wr.policy = 'block' then raise exception 'capacity_conflict' using errcode = '23P01', detail = format('workspace limit %s, %s overlapping', wr.concurrent_limit, peak); end if;
      warn := warn || jsonb_build_object('scope', 'workspace', 'limit', wr.concurrent_limit, 'overlapping', peak);
    end if;
  end if;
  if jsonb_array_length(warn) > 0 then
    new.details := coalesce(new.details, '{}') || jsonb_build_object('capacity_warning', jsonb_build_object('checks', warn, 'at', now()));
  elsif new.details ? 'capacity_warning' then
    new.details := new.details - 'capacity_warning';
  end if;
  return new;
end $$;
drop trigger if exists provider_jobs_service_capacity on public.provider_jobs;
create trigger provider_jobs_service_capacity before insert or update on public.provider_jobs for each row execute function public.enforce_service_capacity();

-- Crew (staff) capacity: one live shift at a time per person (configurable buffer/policy), and crew availability blocks.
create or replace function public.enforce_crew_capacity()
returns trigger language plpgsql set search_path to '' as $$
declare cr public.provider_capacity_rules; clash text; pre interval; post interval; n integer;
begin
  if new.crew_id is null or new.status not in ('pending','confirmed') or new.starts_at is null or new.ends_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.crew_id is not distinct from new.crew_id and old.starts_at = new.starts_at and old.ends_at = new.ends_at
     and old.status in ('pending','confirmed') then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crew_capacity:' || new.crew_id::text, 0));
  select * into cr from public.provider_capacity_rules where scope = 'crew' and crew_id = new.crew_id and active;
  select coalesce(nullif(b.note, ''), b.kind) into clash from public.availability_blocks b
    where b.crew_id = new.crew_id and b.kind in ('blocked','maintenance') and tstzrange(b.starts_at, b.ends_at) && tstzrange(new.starts_at, new.ends_at) limit 1;
  if clash is not null and coalesce(cr.policy, 'block') = 'block' then raise exception 'crew_conflict' using errcode = '23P01', detail = 'unavailable: ' || clash; end if;
  pre := make_interval(mins => coalesce(cr.setup_minutes, 0) + coalesce(cr.travel_minutes, 0));
  post := make_interval(mins => coalesce(cr.teardown_minutes, 0) + coalesce(cr.travel_minutes, 0));
  select count(*) into n from public.shifts s where s.crew_id = new.crew_id and s.id <> new.id and s.status in ('pending','confirmed')
    and tstzrange(s.starts_at, s.ends_at) && tstzrange(new.starts_at - pre, new.ends_at + post);
  if n + 1 > coalesce(cr.concurrent_limit, 1) and coalesce(cr.policy, 'block') = 'block' then
    raise exception 'crew_conflict' using errcode = '23P01', detail = format('%s overlapping shift(s)', n);
  end if;
  return new;
end $$;
drop trigger if exists shifts_crew_capacity on public.shifts;
create trigger shifts_crew_capacity before insert or update on public.shifts for each row execute function public.enforce_crew_capacity();

-- ─── Marketplace confirmation → provider job, with conflict recovery (replaces create_job_for_confirmed_item) ───────
-- A paid confirmation that cannot be honoured: never double-book, never lose the payment record.
create or replace function public.booking_conflict_recover(p_item uuid, p_order uuid, p_kind text, p_detail text, p_space uuid)
returns uuid language plpgsql security definer set search_path to '' as $$
declare b public.build_items; po public.payment_orders; ws uuid; cid uuid; xid uuid; e public.events;
begin
  select * into b from public.build_items where id = p_item;
  select * into po from public.payment_orders where id = p_order;
  select * into e from public.events where id = b.event_id;
  ws := public.listing_workspace(b.listing_id);
  insert into public.booking_conflicts(workspace_id, build_item_id, event_id, listing_id, space_id, kind, detail, source, payment_order_ref)
    values (ws, b.id, b.event_id, b.listing_id, p_space, p_kind, left(coalesce(p_detail, ''), 500), 'marketplace_confirmation', po.reference)
    returning id into cid;
  update public.build_items set status = 'replacement_required', updated_at = now(),
      terms_snapshot = coalesce(terms_snapshot, '{}') || jsonb_build_object('booking_conflict', cid)
    where id = b.id;
  -- Full refund on the seller's charge through the Q07 path: a completed platform-party cancellation with refund_status 'due'
  -- is picked up by processPayments() → refundMerchantCharge() on the connected account (customer fee refunded too).
  if po.id is not null then
    insert into public.booking_cancellations(build_item_id, event_id, workspace_id, party, kind, reason, item_status_before, policy_snapshot, calculation, status)
      values (b.id, b.event_id, ws, 'platform', 'full', 'Automatic: the date was no longer available when payment completed (' || p_kind || ').', 'confirmed',
        jsonb_build_object('policy', 'booking_conflict_full_refund'),
        jsonb_build_object('refund_amount', po.amount_minor / 100.0, 'basis', 'booking_conflict', 'payment_order', po.reference, 'conflict_id', cid), 'requested')
      returning id into xid;
    update public.booking_cancellations set status = 'accepted', decided_at = now(), decision_note = 'Automatic: booking conflict at confirmation', updated_at = now() where id = xid;
    update public.booking_cancellations set status = 'completed', updated_at = now() where id = xid;
    update public.booking_conflicts set status = 'refund_queued', cancellation_id = xid where id = cid;
  end if;
  perform public.notify_workspace(ws, array['owner','manager'], 'request_received', 'Booking could not be confirmed: ' || coalesce(e.name, b.title),
    'The date was taken before payment completed, so this booking was not confirmed and the customer is being refunded in full.', '/provider/opportunities/' || b.id);
  perform public.notify_event(b.event_id, 'event_update', 'Booking not confirmed: ' || b.title,
    'The provider''s date was taken before your payment completed. You will be refunded in full; choose another option or a backup.',
    public.event_path(b.event_id, 'booking', b.id));
  insert into public.audit_events(actor_type, workspace_id, event, metadata)
    values ('system', ws, 'booking.conflict_detected', jsonb_build_object('build_item_id', b.id, 'conflict_id', cid, 'kind', p_kind, 'payment_order', po.reference, 'cancellation_id', xid));
  return cid;
end $$;

create or replace function public.create_job_for_confirmed_item()
returns trigger language plpgsql security definer set search_path to '' as $$
declare l public.listings; e public.events; ws public.workspaces; fee numeric; sid uuid; ssrc text; po_id uuid; jid uuid; err text; det text; dtl jsonb := '{}';
begin
  if new.status <> 'confirmed' or old.status = 'confirmed' or new.listing_id is null then return new; end if;
  if exists(select 1 from public.provider_jobs where build_item_id = new.id) then return new; end if;
  select * into l from public.listings where id = new.listing_id;
  select * into ws from public.workspaces where id = l.workspace_id;
  select * into e from public.events where id = new.event_id;
  if l.kind = 'venue' then
    select x.space_id, x.source into sid, ssrc from public.booking_item_space(new.id) x;
    dtl := jsonb_build_object('occupancy', case when sid is null then 'whole_venue' else 'space' end, 'space_source', coalesce(ssrc, 'unassigned'));
  end if;
  -- Was this confirmation produced by a payment captured in this same transaction (deposit webhook)?
  select p.id into po_id from public.payment_orders p
    where p.build_item_id = new.id and p.stripe_payment_intent is not null and p.status in ('payment_succeeded','protected_pending_delivery') and p.updated_at = now()
    order by p.created_at desc limit 1;
  fee := round(coalesce(new.amount, 0) * ws.commission_bps / 10000.0, 2);
  begin
    insert into public.provider_jobs(reference, workspace_id, build_item_id, event_id, listing_id, space_id, mode, client_name, event_name, event_type,
        starts_at, ends_at, guests, location, status, role, value, platform_fee, net_payout, source, commercial_snapshot, details, image)
      values ('BK-' || upper(substr(replace(new.id::text, '-', ''), 1, 6)), l.workspace_id, new.id, e.id, l.id, sid, l.kind,
        coalesce(nullif(e.client_name, ''), 'Event client'), e.name, e.event_type,
        coalesce(e.starts_at, now()), coalesce(e.ends_at, coalesce(e.starts_at, now()) + interval '6 hours'), e.guest_count, coalesce(nullif(e.location, ''), e.city),
        'confirmed', new.role, coalesce(new.amount, 0), fee, coalesce(new.amount, 0) - fee,
        case when new.role = 'standby' then 'standby' else 'marketplace' end,
        coalesce(new.terms_snapshot, '{}') || jsonb_build_object('commission_bps', ws.commission_bps, 'platform_fee', fee, 'quote', new.quote, 'space_id', sid),
        dtl, coalesce(nullif(e.cover_image, ''), l.image))
      returning id into jid;
  exception when exclusion_violation then
    get stacked diagnostics err = message_text, det = pg_exception_detail;
    if err not in ('turnaround_conflict','exclusive_conflict','blocked_conflict','venue_conflict','hold_conflict','capacity_conflict') then err := 'hard_conflict'; end if;
    if po_id is null then raise exception '%', err using errcode = '23P01', detail = coalesce(det, ''); end if;
    perform public.booking_conflict_recover(new.id, po_id, err, det, sid);
    return new;
  end;
  if sid is not null and new.space_id is distinct from sid then update public.build_items set space_id = sid where id = new.id; end if;
  insert into public.audit_events(workspace_id, event, metadata) values (l.workspace_id, 'booking.created',
    jsonb_build_object('build_item_id', new.id, 'source', 'marketplace', 'job_id', jid, 'space_id', sid, 'space_source', ssrc));
  return new;
end $$;

-- ─── Direct bookings: specific conflict codes; services can be booked directly too ───────────────────────────────────
create or replace function public.provider_create_booking(p_ws uuid, p jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare jid uuid; v numeric; ws public.workspaces; fee numeric; sp public.spaces; m text; lid uuid; cap integer; err text; det text;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  select * into ws from public.workspaces where id = p_ws;
  v := greatest(coalesce((p->>'value')::numeric, 0), 0);
  m := coalesce(nullif(p->>'mode', ''), 'venue');
  if m not in ('venue','service') then raise exception 'invalid_mode' using errcode = '22023'; end if;
  if length(trim(coalesce(p->>'client_name', ''))) = 0 or length(trim(coalesce(p->>'event_name', ''))) = 0 then raise exception 'client_and_event_required' using errcode = '22023'; end if;
  lid := nullif(p->>'listing_id', '')::uuid;
  if lid is not null and not exists(select 1 from public.listings where id = lid and workspace_id = p_ws) then raise exception 'listing_not_in_workspace' using errcode = '42501'; end if;
  if m = 'service' then
    if lid is null or not exists(select 1 from public.listings where id = lid and kind = 'service') then raise exception 'service_listing_required' using errcode = '22023'; end if;
    if (p->>'space_id') is not null then raise exception 'space_not_allowed_for_service' using errcode = '22023'; end if;
  end if;
  if (p->>'space_id') is not null then
    select * into sp from public.spaces where id = (p->>'space_id')::uuid and workspace_id = p_ws;
    if not found then raise exception 'space_not_in_workspace' using errcode = '42501'; end if;
    -- Layout-specific capacity when a layout is named and configured (spaces.layouts = {"theatre": 300, ...}); otherwise the larger of seated/standing.
    cap := case when coalesce(p->>'layout', '') <> '' and (sp.layouts->>lower(p->>'layout')) ~ '^\d+$' then (sp.layouts->>lower(p->>'layout'))::int
                else nullif(greatest(coalesce(sp.capacity_standing, 0), coalesce(sp.capacity_seated, 0)), 0) end;
    if nullif(p->>'guests', '')::integer > cap then raise exception 'over_capacity' using errcode = '22023'; end if;
  end if;
  fee := round(v * ws.commission_bps / 10000.0, 2);
  insert into public.provider_jobs(reference, workspace_id, listing_id, space_id, package_id, mode, client_name, client_org, client_email, event_name, event_type,
      starts_at, ends_at, guests, location, layout, status, value, platform_fee, net_payout, source, commercial_snapshot, details, created_by)
    values ('BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), p_ws, coalesce(lid, sp.venue_id), sp.id,
      nullif(p->>'package_id', '')::uuid, m, p->>'client_name', coalesce(p->>'client_org', ''), coalesce(p->>'client_email', ''), p->>'event_name',
      coalesce(nullif(p->>'event_type', ''), 'custom'), (p->>'starts_at')::timestamptz, (p->>'ends_at')::timestamptz, nullif(p->>'guests', '')::integer,
      coalesce(p->>'location', ''), coalesce(p->>'layout', ''), case when p->>'hold' = 'true' then 'held' else 'confirmed' end, v, fee, v - fee, 'direct',
      jsonb_build_object('value', v, 'commission_bps', ws.commission_bps, 'platform_fee', fee, 'deposit_pct', coalesce((p->>'deposit_pct')::integer, 30),
        'cancellation', coalesce(p->'cancellation', '{}'), 'items', coalesce(p->'items', '[]'), 'captured_at', now()),
      coalesce(p->'details', '{}') - 'occupancy' - 'capacity_warning', auth.uid())
    returning id into jid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'booking.created', jsonb_build_object('job_id', jid, 'source', 'direct', 'mode', m));
  return jid;
exception when exclusion_violation then
  get stacked diagnostics err = message_text, det = pg_exception_detail;
  if err not in ('turnaround_conflict','exclusive_conflict','blocked_conflict','venue_conflict','hold_conflict','capacity_conflict') then err := 'hard_conflict'; end if;
  raise exception '%', err using errcode = '23P01', detail = coalesce(det, '');
end $$;

-- Narrow a whole-venue marketplace job to one space (or move a job to another space of the same venue).
create or replace function public.provider_assign_job_space(p_job uuid, p_space uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare j public.provider_jobs; sp public.spaces; err text; det text;
begin
  select * into j from public.provider_jobs where id = p_job for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(j.workspace_id, array['owner','manager']);
  select * into sp from public.spaces where id = p_space and workspace_id = j.workspace_id;
  if not found or j.mode <> 'venue' or (j.listing_id is not null and sp.venue_id <> j.listing_id) then raise exception 'space_not_in_venue' using errcode = '42501'; end if;
  begin
    update public.provider_jobs set space_id = sp.id, details = coalesce(details, '{}') || jsonb_build_object('occupancy', 'space', 'space_source', 'provider') where id = j.id;
  exception when exclusion_violation then
    get stacked diagnostics err = message_text, det = pg_exception_detail;
    if err not in ('turnaround_conflict','exclusive_conflict','blocked_conflict','venue_conflict','hold_conflict') then err := 'hard_conflict'; end if;
    raise exception '%', err using errcode = '23P01', detail = coalesce(det, '');
  end;
  if j.build_item_id is not null then update public.build_items set space_id = sp.id where id = j.build_item_id; end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), j.workspace_id, 'booking.space_assigned', jsonb_build_object('job_id', j.id, 'space_id', sp.id));
end $$;

-- Capacity rules are configured through this command (owner/manager), never by direct table writes.
create or replace function public.provider_set_capacity_rule(p_ws uuid, p jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare sc text := coalesce(p->>'scope', 'listing'); lid uuid := nullif(p->>'listing_id', '')::uuid; cid uuid := nullif(p->>'crew_id', '')::uuid; rid uuid;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  if sc not in ('workspace','listing','crew') or coalesce(p->>'policy', 'block') not in ('block','warn') then raise exception 'invalid_rule' using errcode = '22023'; end if;
  if sc = 'listing' and not exists(select 1 from public.listings where id = lid and workspace_id = p_ws) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if sc = 'crew' and not exists(select 1 from public.crew_members where id = cid and workspace_id = p_ws) then raise exception 'not_authorized' using errcode = '42501'; end if;
  insert into public.provider_capacity_rules as r(workspace_id, scope, listing_id, crew_id, concurrent_limit, setup_minutes, teardown_minutes, travel_minutes, policy, active, note, created_by)
    values (p_ws, sc, case when sc = 'listing' then lid end, case when sc = 'crew' then cid end, coalesce((p->>'concurrent_limit')::int, 1),
      coalesce((p->>'setup_minutes')::int, 0), coalesce((p->>'teardown_minutes')::int, 0), coalesce((p->>'travel_minutes')::int, 0),
      coalesce(p->>'policy', 'block'), coalesce((p->>'active')::boolean, true), left(coalesce(p->>'note', ''), 500), auth.uid())
    on conflict (workspace_id, scope, coalesce(listing_id, crew_id, '00000000-0000-0000-0000-000000000000'::uuid)) do update set
      concurrent_limit = excluded.concurrent_limit, setup_minutes = excluded.setup_minutes, teardown_minutes = excluded.teardown_minutes,
      travel_minutes = excluded.travel_minutes, policy = excluded.policy, active = excluded.active, note = excluded.note, updated_at = now()
    returning r.id into rid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'capacity.rule_saved', jsonb_build_object('rule_id', rid, 'scope', sc));
  return rid;
end $$;

-- Provider/organizer can close a conflict record once handled (refund itself is the Q07 worker's job).
create or replace function public.resolve_booking_conflict(p_conflict uuid, p_status text, p_note text default '')
returns void language plpgsql security definer set search_path to '' as $$
declare c public.booking_conflicts;
begin
  select * into c from public.booking_conflicts where id = p_conflict for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(c.workspace_id, array['owner','manager']);
  if p_status not in ('resolved','dismissed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.booking_conflicts set status = p_status, resolution = left(coalesce(p_note, ''), 500), resolved_by = auth.uid(), resolved_at = now() where id = c.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), c.workspace_id, 'booking.conflict_' || p_status, jsonb_build_object('conflict_id', c.id));
end $$;

-- Backfill report (read-only): venue jobs with no space and the space each could be linked to. Never rewrites history.
create or replace function public.booking_space_backfill_report()
returns table(job_id uuid, reference text, status text, starts_at timestamptz, build_item_id uuid, candidate_space uuid, candidate_source text, venue_spaces integer)
language sql stable security definer set search_path to '' as $$
  select j.id, j.reference, j.status, j.starts_at, j.build_item_id, x.space_id, x.source, (select count(*)::int from public.spaces s where s.venue_id = j.listing_id)
  from public.provider_jobs j left join lateral public.booking_item_space(j.build_item_id) x on true
  where j.mode = 'venue' and j.space_id is null and coalesce(j.details->>'occupancy', '') <> 'whole_venue'
  order by j.starts_at
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────────────────────────────────────────────
do $$ declare f text; begin
  foreach f in array array['public.booking_item_space(uuid)', 'public.booking_conflict_recover(uuid,uuid,text,text,uuid)', 'public.booking_space_backfill_report()',
      'public.service_overlap_peak(uuid,uuid,uuid,timestamptz,timestamptz)', 'public.enforce_service_capacity()', 'public.enforce_crew_capacity()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.provider_create_booking(uuid,jsonb)', 'public.provider_assign_job_space(uuid,uuid)', 'public.provider_set_capacity_rule(uuid,jsonb)',
      'public.resolve_booking_conflict(uuid,text,text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
revoke all on function public.create_job_for_confirmed_item() from public, anon, authenticated;
revoke all on function public.enforce_space_rules() from public, anon, authenticated;

-- Catalogued domain events (parity with src/lib/foundation/event-catalogue.ts).
insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('booking.conflict_detected', 1, 'booking', 'A confirmation could not be honoured because the slot or capacity was taken; refund queued.', null),
  ('booking.space_assigned', 1, 'booking', 'A venue booking was assigned to a specific space.', null),
  ('capacity.rule_saved', 1, 'workspace', 'A supplier/staff capacity rule was saved.', null)
on conflict (event_type) do update set schema_version = excluded.schema_version, aggregate = excluded.aggregate, description = excluded.description, public_type = excluded.public_type, active = true, updated_at = now();
