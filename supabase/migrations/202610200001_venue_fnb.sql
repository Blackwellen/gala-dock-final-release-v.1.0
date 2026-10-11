-- Phase 5 — Venue hire, commercial engine, venue holds, BEO, food & drink, catering build, bar (master spec §59–65).
begin;

-- ───────────────────────── §60 commercial engine: rate cards ─────────────────────────
create table if not exists public.venue_rate_cards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  venue_id uuid not null references public.listings(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete cascade,              -- null = applies venue-wide
  name text not null check (length(name) between 2 and 80),
  model text not null check (model in ('hourly','half_day','full_day','evening','flat','per_person','package','min_spend','hybrid')),
  amount numeric(12,2) not null default 0 check (amount >= 0),               -- hire charge for the model (per hour / per block / flat)
  per_person numeric(12,2) check (per_person is null or per_person >= 0),
  min_hours numeric(5,2) check (min_hours is null or min_hours >= 0),
  min_spend numeric(12,2) check (min_spend is null or min_spend >= 0),
  bar_min numeric(12,2) check (bar_min is null or bar_min >= 0),
  catering_min numeric(12,2) check (catering_min is null or catering_min >= 0),
  days_of_week smallint[] not null default '{0,1,2,3,4,5,6}',                -- 0 = Sunday
  time_from time, time_to time,                                               -- e.g. evening 18:00–00:00
  season_from text check (season_from is null or season_from ~ '^\d{2}-\d{2}$'), season_to text check (season_to is null or season_to ~ '^\d{2}-\d{2}$'),
  peak boolean not null default false,
  priority integer not null default 100,
  fees jsonb not null default '{}',   -- {setup, cleanup, overtime_hourly, security_fee, security_required, damage_deposit, booking_deposit_pct}
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists venue_rate_cards_venue_idx on public.venue_rate_cards(venue_id, active);
alter table public.venue_rate_cards enable row level security;
drop policy if exists venue_rate_cards_read on public.venue_rate_cards;
create policy venue_rate_cards_read on public.venue_rate_cards for select using (
  active and exists (select 1 from public.listings l where l.id = venue_id and l.published) or public.is_workspace_member(workspace_id));
drop policy if exists venue_rate_cards_write on public.venue_rate_cards;
create policy venue_rate_cards_write on public.venue_rate_cards for all
  using (public.has_workspace_role(workspace_id, array['owner','manager'])) with check (public.has_workspace_role(workspace_id, array['owner','manager'])
    and exists (select 1 from public.listings l where l.id = venue_id and l.workspace_id = venue_rate_cards.workspace_id and l.kind = 'venue')
    and (space_id is null or exists (select 1 from public.spaces s where s.id = space_id and s.venue_id = venue_rate_cards.venue_id)));

-- §59 conflict engine: buffers (setup/cleardown/turnaround), linked + exclusive spaces, venue-wide exclusive hire, blackouts, hours.
create or replace function public.space_conflicts(p_space uuid, p_starts timestamptz, p_ends timestamptz, p_exclude_item uuid default null)
returns table(level text, reason text, ref_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare s public.spaces; setup interval; clear interval; turn interval; win tstzrange; hrs jsonb; dow text;
begin
  select * into s from public.spaces where id = p_space;
  if not found then return; end if;
  setup := make_interval(mins => coalesce((s.details->>'setup_minutes')::int, 0));
  clear := make_interval(mins => coalesce((s.details->>'cleardown_minutes')::int, 0));
  turn := make_interval(mins => coalesce(s.turnaround_minutes, 0));
  win := tstzrange(p_starts - setup - turn, p_ends + clear + turn);
  -- Same space, linked spaces (part/whole, shared walls) and anything in the same exclusive group.
  return query
    with related as (
      select s.id sid, 'this space' why union
      select case when l.space_a = s.id then l.space_b else l.space_a end, case when l.kind = 'exclusive' then 'exclusive pairing' else 'linked space' end
        from public.space_links l where l.space_a = s.id or l.space_b = s.id union
      select x.id, 'same exclusive group' from public.spaces x where s.exclusive_group is not null and x.exclusive_group = s.exclusive_group and x.id <> s.id)
    select 'hard', 'Booked: ' || r.why, j.id, j.starts_at, j.ends_at
      from public.provider_jobs j join related r on r.sid = j.space_id
      where j.status in ('held','confirmed','active','deposit_paid') and tstzrange(j.starts_at, coalesce(j.ends_at, j.starts_at + interval '6 hours')) && win
        and (p_exclude_item is null or j.build_item_id is distinct from p_exclude_item)
    union all
    -- Exclusive venue hire blocks every space at the venue.
    select 'hard', 'Exclusive hire of the whole venue', j.id, j.starts_at, j.ends_at
      from public.provider_jobs j where j.listing_id = s.venue_id and j.space_id is null and coalesce((j.details->>'exclusive')::boolean, false)
        and j.status in ('held','confirmed','active','deposit_paid') and tstzrange(j.starts_at, coalesce(j.ends_at, j.starts_at + interval '6 hours')) && win
    union all
    select 'hard', 'Hold on this space', h.id, h.window_start, h.window_end
      from public.conditional_holds h join related r on r.sid = h.space_id
      where h.status = 'held' and h.blocking_level = 'hard' and tstzrange(h.window_start, h.window_end) && win and h.build_item_id is distinct from p_exclude_item
    union all
    select 'soft', 'Soft hold on this space', h.id, h.window_start, h.window_end
      from public.conditional_holds h join related r on r.sid = h.space_id
      where h.status = 'held' and h.blocking_level = 'soft' and tstzrange(h.window_start, h.window_end) && win and h.build_item_id is distinct from p_exclude_item
    union all
    select 'hard', initcap(replace(b.kind, '_', ' ')) || coalesce(': ' || nullif(b.note, ''), ''), b.id, b.starts_at, b.ends_at
      from public.availability_blocks b where (b.space_id = s.id or (b.space_id is null and b.listing_id = s.venue_id)) and b.kind <> 'emergency_window'
        and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts, p_ends);
  -- Business hours (details.hours = {"mon":"09:00-23:00",...}); outside hours is a soft conflict (venue may agree overtime).
  hrs := s.details->'hours';
  if jsonb_typeof(hrs) = 'object' then
    dow := lower(to_char(p_starts at time zone 'Europe/London', 'dy'));
    if hrs ? dow and coalesce(hrs->>dow, '') ~ '^\d{2}:\d{2}-\d{2}:\d{2}$' then
      if (p_starts at time zone 'Europe/London')::time < split_part(hrs->>dow, '-', 1)::time
         or ((p_ends at time zone 'Europe/London')::time > split_part(hrs->>dow, '-', 2)::time and split_part(hrs->>dow, '-', 2) <> '00:00'
             and (p_ends at time zone 'Europe/London')::date = (p_starts at time zone 'Europe/London')::date) then
        return query select 'soft'::text, ('Outside opening hours (' || (hrs->>dow) || ')')::text, null::uuid, p_starts, p_ends;
      end if;
    elsif hrs ? dow and coalesce(hrs->>dow, '') in ('closed','') then
      return query select 'hard'::text, 'Venue closed on this day'::text, null::uuid, p_starts, p_ends;
    end if;
  end if;
end $$;

-- §60 pricing: applicable rate cards for the slot → itemised quote. Never forces one model; hybrid stacks hire + minimums.
create or replace function public.venue_quote(p_space uuid, p_starts timestamptz, p_ends timestamptz, p_guests integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.spaces; c public.venue_rate_cards; hrs numeric; lines jsonb := '[]'; total numeric := 0; md text; dw smallint; tl time; card jsonb; fee jsonb;
  hire numeric; spend_min numeric := 0; deposit_pct numeric; damage numeric := 0; sec_required boolean := false;
begin
  select * into s from public.spaces where id = p_space;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_ends <= p_starts then raise exception 'invalid_window' using errcode = '22023'; end if;
  hrs := round(extract(epoch from (p_ends - p_starts)) / 3600.0, 2);
  md := to_char(p_starts at time zone 'Europe/London', 'MM-DD'); dw := extract(dow from p_starts at time zone 'Europe/London')::smallint; tl := (p_starts at time zone 'Europe/London')::time;
  select * into c from public.venue_rate_cards r
    where r.venue_id = s.venue_id and r.active and (r.space_id is null or r.space_id = s.id) and dw = any(r.days_of_week)
      and (r.time_from is null or tl >= r.time_from) and (r.time_to is null or tl < r.time_to or r.time_to <= r.time_from)
      and (r.season_from is null or (case when r.season_from <= r.season_to then md between r.season_from and r.season_to else md >= r.season_from or md <= r.season_to end))
    order by (r.space_id is not null) desc, r.peak desc, r.priority asc limit 1;
  if not found then
    -- Fall back to the space's published hourly rate so a quote is always explainable.
    if coalesce(s.rate_hourly, 0) <= 0 then return jsonb_build_object('available', false, 'reason', 'No price published for this slot — request a quote.'); end if;
    hire := round(s.rate_hourly * greatest(hrs, coalesce(s.min_hours, 0)), 2);
    return jsonb_build_object('available', true, 'card', null, 'hours', hrs, 'lines', jsonb_build_array(jsonb_build_object('label', 'Hire · ' || greatest(hrs, coalesce(s.min_hours, 0)) || 'h × ' || s.rate_hourly, 'amount', hire)),
      'total', hire, 'deposit', null, 'damage_deposit', 0, 'minimum_spend', 0);
  end if;
  fee := c.fees;
  hire := case c.model
    when 'hourly' then c.amount * greatest(hrs, coalesce(c.min_hours, s.min_hours, 0))
    when 'half_day' then c.amount * greatest(1, ceil(hrs / 5))
    when 'full_day' then c.amount * greatest(1, ceil(hrs / 10))
    when 'evening' then c.amount
    when 'flat' then c.amount
    when 'package' then c.amount
    when 'per_person' then 0
    when 'min_spend' then 0
    else c.amount end;
  if hire > 0 then lines := lines || jsonb_build_object('label', initcap(replace(c.model, '_', ' ')) || ' hire' || case when c.model = 'hourly' then ' · ' || greatest(hrs, coalesce(c.min_hours, s.min_hours, 0)) || 'h' else '' end, 'amount', round(hire, 2)); total := total + hire; end if;
  if coalesce(c.per_person, 0) > 0 then lines := lines || jsonb_build_object('label', 'Per person · ' || coalesce(p_guests, 0) || ' × ' || c.per_person, 'amount', round(c.per_person * coalesce(p_guests, 0), 2)); total := total + c.per_person * coalesce(p_guests, 0); end if;
  spend_min := coalesce(c.min_spend, 0);
  if coalesce((fee->>'setup')::numeric, 0) > 0 then lines := lines || jsonb_build_object('label', 'Setup fee', 'amount', (fee->>'setup')::numeric); total := total + (fee->>'setup')::numeric; end if;
  if coalesce((fee->>'cleanup')::numeric, 0) > 0 then lines := lines || jsonb_build_object('label', 'Cleanup fee', 'amount', (fee->>'cleanup')::numeric); total := total + (fee->>'cleanup')::numeric; end if;
  sec_required := coalesce((fee->>'security_required')::boolean, false);
  if sec_required and coalesce((fee->>'security_fee')::numeric, 0) > 0 then lines := lines || jsonb_build_object('label', 'Security (required)', 'amount', (fee->>'security_fee')::numeric); total := total + (fee->>'security_fee')::numeric; end if;
  -- Minimum spend: shortfall only when hire + per-person falls below it (hybrid venues often waive hire against F&B spend).
  if spend_min > total then lines := lines || jsonb_build_object('label', 'Minimum spend top-up', 'amount', round(spend_min - total, 2), 'note', 'Reduced by food & drink spend'); total := spend_min; end if;
  deposit_pct := coalesce((fee->>'booking_deposit_pct')::numeric, 30);
  damage := coalesce((fee->>'damage_deposit')::numeric, 0);
  return jsonb_build_object('available', true, 'card', jsonb_build_object('id', c.id, 'name', c.name, 'model', c.model, 'peak', c.peak), 'hours', hrs, 'lines', lines,
    'total', round(total, 2), 'minimum_spend', spend_min, 'bar_min', c.bar_min, 'catering_min', c.catering_min,
    'deposit', round(total * deposit_pct / 100, 2), 'deposit_pct', deposit_pct, 'damage_deposit', damage, 'security_required', sec_required,
    'overtime_hourly', fee->'overtime_hourly');
end $$;

-- ───────────────────────── §61 venue holds identify space, window, expiry, blocking level ─────────────────────────
alter table public.conditional_holds
  add column if not exists space_id uuid references public.spaces(id) on delete set null,
  add column if not exists window_start timestamptz,
  add column if not exists window_end timestamptz,
  add column if not exists blocking_level text not null default 'soft' check (blocking_level in ('soft','hard'));
create index if not exists conditional_holds_space_idx on public.conditional_holds(space_id) where status = 'held';

-- Venue places a hold directly (response option "place conditional hold"), exact space + setup/teardown window + blocking level.
create or replace function public.venue_place_hold(p_item uuid, p_space uuid, p_starts timestamptz, p_ends timestamptz, p_hours integer, p_blocking text, p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.build_items; s public.spaces; hid uuid; hard integer;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or b.listing_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into s from public.spaces where id = p_space and venue_id = b.listing_id;
  if not found then raise exception 'invalid_space' using errcode = '22023'; end if;
  perform public.require_provider_role(s.workspace_id, array['owner','manager']);
  if b.status not in ('sent','awaiting','awaiting_provider','available','quoted','quote_received','clarification','conditional_hold_requested') then raise exception 'not_holdable:%', b.status using errcode = '22023'; end if;
  if p_hours not between 2 and 336 or p_blocking not in ('soft','hard') or p_ends <= p_starts then raise exception 'invalid_hold' using errcode = '22023'; end if;
  select count(*) into hard from public.space_conflicts(p_space, p_starts, p_ends, b.id) c where c.level = 'hard';
  if hard > 0 then raise exception 'space_conflict' using errcode = '23P01'; end if;
  update public.conditional_holds set status = 'released', closed_reason = 'superseded_by_venue_hold', updated_at = now() where build_item_id = b.id and status in ('requested','held') and space_id is distinct from p_space;
  insert into public.conditional_holds(build_item_id, event_id, listing_id, workspace_id, requested_hours, expires_at, price, source, status, requested_by, responded_by, responded_at,
      space_id, window_start, window_end, blocking_level, provider_note)
    values (b.id, b.event_id, b.listing_id, s.workspace_id, p_hours, now() + make_interval(hours => p_hours), b.amount, 'direct', 'held', auth.uid(), auth.uid(), now(),
      p_space, p_starts - make_interval(mins => coalesce((s.details->>'setup_minutes')::int, 0)), p_ends + make_interval(mins => coalesce((s.details->>'cleardown_minutes')::int, 0)),
      p_blocking, left(coalesce(p_note, ''), 1000))
    on conflict do nothing returning id into hid;
  if hid is null then
    update public.conditional_holds set space_id = p_space, window_start = p_starts - make_interval(mins => coalesce((s.details->>'setup_minutes')::int, 0)),
      window_end = p_ends + make_interval(mins => coalesce((s.details->>'cleardown_minutes')::int, 0)), blocking_level = p_blocking, status = 'held',
      expires_at = now() + make_interval(hours => p_hours), responded_by = auth.uid(), responded_at = now(), updated_at = now()
      where build_item_id = b.id and status in ('requested','held') returning id into hid;
  end if;
  update public.build_items set status = 'held', hold_expires_at = now() + make_interval(hours => p_hours), updated_at = now() where id = b.id;
  perform public.notify_event(b.event_id, 'provider.hold', 'Venue holding ' || s.name, 'Held for ' || p_hours || ' hours (' || p_blocking || ' hold).', public.event_path(b.event_id, 'booking', b.id));
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', s.workspace_id, 'hold.venue_placed', jsonb_build_object('hold_id', hid, 'space', p_space, 'blocking', p_blocking));
  return hid;
end $$;

-- §61 alternatives: venue offers another space or date; organiser accepts or declines.
create table if not exists public.venue_alternatives (
  id uuid primary key default gen_random_uuid(),
  build_item_id uuid not null references public.build_items(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('space','date','both')),
  space_id uuid references public.spaces(id) on delete set null,
  starts_at timestamptz, ends_at timestamptz,
  price numeric(12,2), note text not null default '',
  status text not null default 'offered' check (status in ('offered','accepted','declined','withdrawn','expired')),
  created_by uuid references auth.users(id), decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.venue_alternatives enable row level security;
drop policy if exists venue_alternatives_read on public.venue_alternatives;
create policy venue_alternatives_read on public.venue_alternatives for select using (public.can_access_event(event_id) or public.is_workspace_member(workspace_id));

create or replace function public.venue_offer_alternative(p_item uuid, p_kind text, p_space uuid, p_starts timestamptz, p_ends timestamptz, p_price numeric, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.build_items; ws uuid; aid uuid;
begin
  select * into b from public.build_items where id = p_item;
  if not found or b.listing_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  ws := public.listing_workspace(b.listing_id);
  perform public.require_provider_role(ws, array['owner','manager']);
  if p_kind not in ('space','date','both') or (p_kind in ('space','both') and not exists (select 1 from public.spaces where id = p_space and venue_id = b.listing_id))
     or (p_kind in ('date','both') and (p_starts is null or p_ends is null or p_ends <= p_starts)) then raise exception 'invalid_alternative' using errcode = '22023'; end if;
  insert into public.venue_alternatives(build_item_id, event_id, workspace_id, kind, space_id, starts_at, ends_at, price, note, created_by)
    values (b.id, b.event_id, ws, p_kind, p_space, p_starts, p_ends, p_price, left(coalesce(p_note, ''), 1000), auth.uid()) returning id into aid;
  update public.build_items set status = 'clarification', updated_at = now() where id = b.id and status in ('sent','awaiting','awaiting_provider');
  perform public.notify_event(b.event_id, 'quote_received', 'The venue suggested an alternative', coalesce(nullif(p_note, ''), 'Review the suggested ' || p_kind || '.'), public.event_path(b.event_id, 'booking', b.id));
  return aid;
end $$;

create or replace function public.decide_venue_alternative(p_alt uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.venue_alternatives;
begin
  select * into a from public.venue_alternatives where id = p_alt for update;
  if not found or not public.can_edit_event(a.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if a.status <> 'offered' then raise exception 'not_open' using errcode = '22023'; end if;
  update public.venue_alternatives set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now() where id = a.id;
  if p_accept then
    update public.venue_alternatives set status = 'withdrawn' where build_item_id = a.build_item_id and status = 'offered' and id <> a.id;
    update public.build_items set amount = coalesce(a.price, amount), status = case when status in ('clarification','sent','awaiting') then 'quoted' else status end,
      quote = coalesce(quote, '{}') || jsonb_build_object('space_id', a.space_id, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'alternative_id', a.id), updated_at = now()
      where id = a.build_item_id;
    if a.starts_at is not null then update public.events set starts_at = a.starts_at, ends_at = coalesce(a.ends_at, ends_at), updated_at = now() where id = a.event_id and (select count(*) from public.build_items where event_id = a.event_id and status = 'confirmed') = 0; end if;
  end if;
  perform public.notify_workspace(a.workspace_id, array['owner','manager'], 'provider.request', 'Alternative ' || case when p_accept then 'accepted' else 'declined' end, '', '/provider/opportunities/' || a.build_item_id);
end $$;

-- ───────────────────────── §62 BEO / event orders (versioned) ─────────────────────────
create table if not exists public.event_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('BEO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  build_item_id uuid references public.build_items(id) on delete set null,
  provider_job_id uuid references public.provider_jobs(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  title text not null,
  status text not null default 'draft',
  current_version integer not null default 0,
  approved_version integer,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists event_orders_one_per_job on public.event_orders(provider_job_id) where provider_job_id is not null;
create table if not exists public.event_order_versions (
  order_id uuid not null references public.event_orders(id) on delete cascade,
  version integer not null,
  content jsonb not null,           -- {event, room, times, setup, layout, capacity, catering, bar, av, staffing, access, deliveries, contacts, supplier_access, special, accessibility}
  financial jsonb not null default '{}',
  note text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users(id), approved_at timestamptz,
  primary key (order_id, version)
);
alter table public.event_orders enable row level security;
alter table public.event_order_versions enable row level security;
drop policy if exists event_orders_read on public.event_orders;
create policy event_orders_read on public.event_orders for select using (public.is_workspace_member(workspace_id) or (event_id is not null and public.can_access_event(event_id) and status <> 'draft'));
drop policy if exists event_order_versions_read on public.event_order_versions;
create policy event_order_versions_read on public.event_order_versions for select using (exists (select 1 from public.event_orders o where o.id = order_id
  and (public.is_workspace_member(o.workspace_id) or (o.event_id is not null and public.can_access_event(o.event_id) and o.status <> 'draft'))));
-- Versions are append-only.
create or replace function public.event_order_versions_immutable() returns trigger language plpgsql as $$
begin
  -- Deletion is only allowed as part of removing the whole order (cascade from account/workspace deletion).
  if tg_op = 'DELETE' then
    if exists (select 1 from public.event_orders o where o.id = old.order_id) then raise exception 'event order versions are immutable' using errcode = '42501'; end if;
    return old;
  end if;
  if new.content is distinct from old.content or new.financial is distinct from old.financial or new.version <> old.version then
    raise exception 'event order versions are immutable' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists event_order_versions_guard on public.event_order_versions;
create trigger event_order_versions_guard before update or delete on public.event_order_versions for each row execute function public.event_order_versions_immutable();

create or replace function public.save_event_order(p_job uuid, p_content jsonb, p_financial jsonb, p_note text, p_send boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare j public.provider_jobs; o public.event_orders; v integer;
begin
  select * into j from public.provider_jobs where id = p_job;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(j.workspace_id, array['owner','manager','member']);
  if jsonb_typeof(p_content) <> 'object' or length(p_content::text) > 60000 then raise exception 'invalid_content' using errcode = '22023'; end if;
  select * into o from public.event_orders where provider_job_id = j.id for update;
  if not found then
    insert into public.event_orders(workspace_id, build_item_id, provider_job_id, event_id, title, created_by)
      values (j.workspace_id, j.build_item_id, j.id, j.event_id, coalesce(j.event_name, 'Event order'), auth.uid()) returning * into o;
  end if;
  v := o.current_version + 1;
  insert into public.event_order_versions(order_id, version, content, financial, note, created_by) values (o.id, v, p_content, coalesce(p_financial, '{}'), left(coalesce(p_note, ''), 500), auth.uid());
  update public.event_orders set current_version = v, status = case when p_send then 'sent' when status = 'approved' then 'revised' else status end, updated_at = now() where id = o.id;
  if p_send and o.event_id is not null then
    perform public.notify_event(o.event_id, 'provider.request', 'Event order to review: ' || o.reference, 'Version ' || v || ' is ready for your approval.', null);
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', j.workspace_id, 'beo.saved', jsonb_build_object('order', o.reference, 'version', v, 'sent', p_send));
  return o.id;
end $$;

create or replace function public.approve_event_order(p_order uuid, p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.event_orders;
begin
  select * into o from public.event_orders where id = p_order for update;
  if not found or o.event_id is null or not public.can_edit_event(o.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_version <> o.current_version or o.status not in ('sent','revised') then raise exception 'stale_version' using errcode = '22023'; end if;
  update public.event_order_versions set approved_by = auth.uid(), approved_at = now() where order_id = o.id and version = p_version;
  update public.event_orders set status = 'approved', approved_version = p_version, updated_at = now() where id = o.id;
  perform public.notify_workspace(o.workspace_id, array['owner','manager'], 'booking_confirmed', 'Event order approved: ' || o.reference, 'Version ' || p_version || ' approved by the client.', '/provider/beo/' || o.id);
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', o.workspace_id, 'beo.approved', jsonb_build_object('order', o.reference, 'version', p_version));
end $$;

-- ───────────────────────── §63 food & drink: menus ─────────────────────────
create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  name text not null check (length(name) between 2 and 100),
  kind text not null default 'food' check (kind in ('food','drink','mixed')),
  description text not null default '',
  serving_style text check (serving_style in ('plated','buffet','sharing','canapes','bowl_food','street_food','family_style','drinks_reception','self_service')),
  pricing text not null default 'per_person' check (pricing in ('per_person','fixed','quantity')),
  price numeric(12,2) check (price is null or price >= 0),
  min_guests integer check (min_guests is null or min_guests > 0), max_guests integer,
  service_window_minutes integer check (service_window_minutes is null or service_window_minutes between 0 and 1440),
  prep_requirements text not null default '',
  final_numbers_days integer not null default 7 check (final_numbers_days between 0 and 90),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_guests is null or min_guests is null or max_guests >= min_guests)
);
create table if not exists public.menu_sections (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus(id) on delete cascade,
  name text not null, choose_min integer, choose_max integer, sort integer not null default 0
);
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus(id) on delete cascade,
  section_id uuid references public.menu_sections(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  description text not null default '',
  price numeric(12,2) check (price is null or price >= 0),     -- per item/portion when pricing = quantity or as a supplement
  unit text not null default 'portion',
  dietary text[] not null default '{}' check (dietary <@ array['vegetarian','vegan','gluten_free','halal','kosher','dairy_free','nut_free','pescatarian']),
  allergens text[] not null default '{}' check (allergens <@ array['celery','gluten','crustaceans','eggs','fish','lupin','milk','molluscs','mustard','nuts','peanuts','sesame','soya','sulphites']),
  allergen_note text not null default '',
  variations jsonb not null default '[]',   -- [{name, price_delta}]
  add_ons jsonb not null default '[]',      -- [{name, price, per}]
  sort integer not null default 0,
  available boolean not null default true
);
create index if not exists menu_items_menu_idx on public.menu_items(menu_id, section_id, sort);
alter table public.menus enable row level security;
alter table public.menu_sections enable row level security;
alter table public.menu_items enable row level security;
drop policy if exists menus_read on public.menus;
create policy menus_read on public.menus for select using (status = 'published' or public.is_workspace_member(workspace_id));
drop policy if exists menus_write on public.menus;
create policy menus_write on public.menus for all using (public.has_workspace_role(workspace_id, array['owner','manager'])) with check (public.has_workspace_role(workspace_id, array['owner','manager'])
  and (listing_id is null or exists (select 1 from public.listings l where l.id = listing_id and l.workspace_id = menus.workspace_id)));
drop policy if exists menu_sections_read on public.menu_sections;
create policy menu_sections_read on public.menu_sections for select using (exists (select 1 from public.menus m where m.id = menu_id and (m.status = 'published' or public.is_workspace_member(m.workspace_id))));
drop policy if exists menu_sections_write on public.menu_sections;
create policy menu_sections_write on public.menu_sections for all using (exists (select 1 from public.menus m where m.id = menu_id and public.has_workspace_role(m.workspace_id, array['owner','manager'])))
  with check (exists (select 1 from public.menus m where m.id = menu_id and public.has_workspace_role(m.workspace_id, array['owner','manager'])));
drop policy if exists menu_items_read on public.menu_items;
create policy menu_items_read on public.menu_items for select using (exists (select 1 from public.menus m where m.id = menu_id and (m.status = 'published' or public.is_workspace_member(m.workspace_id))));
drop policy if exists menu_items_write on public.menu_items;
create policy menu_items_write on public.menu_items for all using (exists (select 1 from public.menus m where m.id = menu_id and public.has_workspace_role(m.workspace_id, array['owner','manager'])))
  with check (exists (select 1 from public.menus m where m.id = menu_id and public.has_workspace_role(m.workspace_id, array['owner','manager']))
    and (section_id is null or exists (select 1 from public.menu_sections s where s.id = section_id and s.menu_id = menu_items.menu_id)));

-- ───────────────────────── §64 catering event build ─────────────────────────
create table if not exists public.catering_selections (
  id uuid primary key default gen_random_uuid(),
  build_item_id uuid not null unique references public.build_items(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete restrict,
  guest_count integer not null check (guest_count > 0),
  items jsonb not null default '[]',              -- [{item_id, qty?, variation?, add_ons?: []}]
  dietary_counts jsonb not null default '{}',     -- {"vegan": 4, "gluten_free": 2}
  serving_style text, service_at timestamptz,
  staffing text not null default '', equipment text not null default '', notes text not null default '',
  final_numbers_due date,
  status text not null default 'draft' check (status in ('draft','submitted','confirmed','locked')),
  price_snapshot jsonb not null default '{}',
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.catering_selections enable row level security;
drop policy if exists catering_selections_read on public.catering_selections;
create policy catering_selections_read on public.catering_selections for select using (public.can_access_event(event_id)
  or exists (select 1 from public.menus m where m.id = menu_id and public.is_workspace_member(m.workspace_id)));

-- Prices a selection from the menu (server-side). Allergen info is the supplier's own declaration.
create or replace function public.catering_price(p_menu uuid, p_guests integer, p_items jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.menus; base numeric := 0; extras numeric := 0; it record; lines jsonb := '[]'; warn text[] := '{}';
begin
  select * into m from public.menus where id = p_menu;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if m.min_guests is not null and p_guests < m.min_guests then warn := warn || ('Minimum ' || m.min_guests || ' guests — priced at the minimum')::text; end if;
  if m.max_guests is not null and p_guests > m.max_guests then warn := warn || ('Above the menu maximum of ' || m.max_guests || ' guests — the caterer must confirm')::text; end if;
  base := case m.pricing when 'per_person' then coalesce(m.price, 0) * greatest(p_guests, coalesce(m.min_guests, 0)) when 'fixed' then coalesce(m.price, 0) else 0 end;
  if base > 0 then lines := lines || jsonb_build_object('label', case m.pricing when 'per_person' then greatest(p_guests, coalesce(m.min_guests, 0)) || ' × ' || m.price || ' per person' else 'Package' end, 'amount', round(base, 2)); end if;
  for it in select i.*, x.value sel from jsonb_array_elements(coalesce(p_items, '[]')) x join public.menu_items i on i.id = (x.value->>'item_id')::uuid and i.menu_id = m.id loop
    if coalesce(it.price, 0) > 0 and (m.pricing = 'quantity' or coalesce((it.sel->>'qty')::int, 0) > 0) then
      extras := extras + it.price * greatest(coalesce((it.sel->>'qty')::int, case when m.pricing = 'quantity' then p_guests else 0 end), 0);
      lines := lines || jsonb_build_object('label', it.name || ' × ' || coalesce((it.sel->>'qty')::int, p_guests), 'amount', round(it.price * coalesce((it.sel->>'qty')::int, p_guests), 2));
    end if;
  end loop;
  return jsonb_build_object('lines', lines, 'total', round(base + extras, 2), 'per_guest', case when p_guests > 0 then round((base + extras) / p_guests, 2) end, 'warnings', to_jsonb(warn),
    'allergen_disclaimer', 'Allergen and dietary information is provided by the caterer. Confirm requirements directly with them.');
end $$;

create or replace function public.save_catering_selection(p_item uuid, p_menu uuid, p_guests integer, p_items jsonb, p_dietary jsonb, p_style text, p_service_at timestamptz,
  p_staffing text, p_equipment text, p_notes text, p_submit boolean, p_accept_change boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.build_items; m public.menus; cur public.catering_selections; price jsonb; prev numeric; due date;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or not public.can_edit_event(b.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into m from public.menus where id = p_menu and status = 'published';
  if not found or m.listing_id is distinct from b.listing_id and m.workspace_id <> public.listing_workspace(b.listing_id) then raise exception 'invalid_menu' using errcode = '22023'; end if;
  if p_guests is null or p_guests < 1 or p_guests > 100000 then raise exception 'invalid_guests' using errcode = '22023'; end if;
  price := public.catering_price(p_menu, p_guests, p_items);
  select * into cur from public.catering_selections where build_item_id = b.id for update;
  if found and cur.status = 'locked' then raise exception 'final_numbers_locked' using errcode = '22023'; end if;
  -- §64: a confirmed selection whose price changes needs explicit acceptance of the consequence first.
  prev := (cur.price_snapshot->>'total')::numeric;
  if found and cur.status = 'confirmed' and prev is distinct from (price->>'total')::numeric and not p_accept_change then
    return jsonb_build_object('needs_confirmation', true, 'previous_total', prev, 'new_total', price->'total', 'difference', round((price->>'total')::numeric - coalesce(prev, 0), 2),
      'after_deadline', cur.final_numbers_due is not null and current_date > cur.final_numbers_due, 'price', price);
  end if;
  due := coalesce((select (e.starts_at at time zone 'Europe/London')::date from public.events e where e.id = b.event_id) - m.final_numbers_days, null);
  insert into public.catering_selections as c (build_item_id, event_id, menu_id, guest_count, items, dietary_counts, serving_style, service_at, staffing, equipment, notes, final_numbers_due, status, price_snapshot, updated_by)
    values (b.id, b.event_id, p_menu, p_guests, coalesce(p_items, '[]'), coalesce(p_dietary, '{}'), coalesce(p_style, m.serving_style), p_service_at, left(coalesce(p_staffing, ''), 1000),
      left(coalesce(p_equipment, ''), 1000), left(coalesce(p_notes, ''), 2000), due, case when p_submit then 'submitted' else 'draft' end, price, auth.uid())
  on conflict (build_item_id) do update set menu_id = excluded.menu_id, guest_count = excluded.guest_count, items = excluded.items, dietary_counts = excluded.dietary_counts,
    serving_style = excluded.serving_style, service_at = excluded.service_at, staffing = excluded.staffing, equipment = excluded.equipment, notes = excluded.notes,
    final_numbers_due = excluded.final_numbers_due, price_snapshot = excluded.price_snapshot, updated_by = auth.uid(), updated_at = now(),
    status = case when c.status = 'confirmed' then 'confirmed' when p_submit then 'submitted' else c.status end;
  if b.status in ('suggested','draft','sent','awaiting','available','quoted') then
    update public.build_items set amount = (price->>'total')::numeric, price_basis = 'fixed', updated_at = now() where id = b.id;
  end if;
  if found and cur.status = 'confirmed' then
    perform public.notify_workspace(m.workspace_id, array['owner','manager'], 'provider.request', 'Catering numbers changed',
      'Guests ' || cur.guest_count || ' → ' || p_guests || ' (total ' || coalesce(prev, 0) || ' → ' || (price->>'total') || ').', '/provider/opportunities/' || b.id);
  end if;
  return jsonb_build_object('saved', true, 'price', price, 'final_numbers_due', due);
end $$;

-- ───────────────────────── §65 bar system ─────────────────────────
create table if not exists public.bar_jurisdiction_rules (
  id uuid primary key default gen_random_uuid(),
  country text not null, region text,
  min_age integer not null check (min_age between 0 and 25),
  licence_label text not null,                -- e.g. "Premises licence or Temporary Event Notice (TEN)"
  latest_service time, notes text not null default '',
  active boolean not null default true,
  unique (country, region)
);
insert into public.bar_jurisdiction_rules(country, region, min_age, licence_label, notes) values
  ('GB', 'England & Wales', 18, 'Premises licence, or a Temporary Event Notice (TEN) for up to 499 people', 'Challenge 25 is common practice. Personal licence holder (DPS) required for premises licences.'),
  ('GB', 'Scotland', 18, 'Premises licence or occasional licence', 'Challenge 25 is a mandatory age-verification policy.'),
  ('GB', 'Northern Ireland', 18, 'Liquor licence or occasional licence', ''),
  ('IE', null, 18, 'Publican''s licence or occasional licence', '')
on conflict (country, region) do nothing;
alter table public.bar_jurisdiction_rules enable row level security;
drop policy if exists bar_rules_read on public.bar_jurisdiction_rules;
create policy bar_rules_read on public.bar_jurisdiction_rules for select using (true);

create table if not exists public.bar_packages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  name text not null check (length(name) between 2 and 100),
  model text not null check (model in ('cash_bar','hosted_bar','open_bar','drink_tokens','prepaid_package','minimum_spend','consumption_tab','dry_hire','mobile_bar','bartenders_only')),
  description text not null default '',
  price numeric(12,2) check (price is null or price >= 0),
  per_person numeric(12,2) check (per_person is null or per_person >= 0),
  token_price numeric(12,2), min_spend numeric(12,2), corkage_per_bottle numeric(12,2),
  glassware boolean not null default false, equipment jsonb not null default '[]',
  hours_from time, hours_to time,
  staffing text not null default '', setup_minutes integer not null default 60 check (setup_minutes between 0 and 600),
  deposit_pct integer not null default 30 check (deposit_pct between 0 and 100),
  licensing jsonb not null default '{}',       -- {jurisdiction_rule_id, licence_ref, provided_by: 'bar'|'venue'|'client', min_age}
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bar_packages enable row level security;
drop policy if exists bar_packages_read on public.bar_packages;
create policy bar_packages_read on public.bar_packages for select using (status = 'published' or public.is_workspace_member(workspace_id));
drop policy if exists bar_packages_write on public.bar_packages;
create policy bar_packages_write on public.bar_packages for all using (public.has_workspace_role(workspace_id, array['owner','manager'])) with check (public.has_workspace_role(workspace_id, array['owner','manager'])
  and (listing_id is null or exists (select 1 from public.listings l where l.id = listing_id and l.workspace_id = bar_packages.workspace_id)));

-- ───────────────────────── grants ─────────────────────────
revoke all on function public.space_conflicts(uuid, timestamptz, timestamptz, uuid), public.venue_quote(uuid, timestamptz, timestamptz, integer), public.venue_place_hold(uuid, uuid, timestamptz, timestamptz, integer, text, text),
  public.venue_offer_alternative(uuid, text, uuid, timestamptz, timestamptz, numeric, text), public.decide_venue_alternative(uuid, boolean), public.save_event_order(uuid, jsonb, jsonb, text, boolean),
  public.approve_event_order(uuid, integer), public.catering_price(uuid, integer, jsonb),
  public.save_catering_selection(uuid, uuid, integer, jsonb, jsonb, text, timestamptz, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.space_conflicts(uuid, timestamptz, timestamptz, uuid), public.venue_quote(uuid, timestamptz, timestamptz, integer), public.venue_place_hold(uuid, uuid, timestamptz, timestamptz, integer, text, text),
  public.venue_offer_alternative(uuid, text, uuid, timestamptz, timestamptz, numeric, text), public.decide_venue_alternative(uuid, boolean), public.save_event_order(uuid, jsonb, jsonb, text, boolean),
  public.approve_event_order(uuid, integer), public.catering_price(uuid, integer, jsonb),
  public.save_catering_selection(uuid, uuid, integer, jsonb, jsonb, text, timestamptz, text, text, text, boolean, boolean) to authenticated, service_role;
grant select on public.venue_rate_cards, public.venue_alternatives, public.event_orders, public.event_order_versions, public.menus, public.menu_sections, public.menu_items,
  public.catering_selections, public.bar_jurisdiction_rules, public.bar_packages to authenticated;
grant insert, update, delete on public.venue_rate_cards, public.menus, public.menu_sections, public.menu_items, public.bar_packages to authenticated;
grant select on public.menus, public.menu_sections, public.menu_items, public.bar_packages, public.bar_jurisdiction_rules, public.venue_rate_cards to anon;
grant all on public.venue_rate_cards, public.venue_alternatives, public.event_orders, public.event_order_versions, public.menus, public.menu_sections, public.menu_items,
  public.catering_selections, public.bar_jurisdiction_rules, public.bar_packages to service_role;

commit;
