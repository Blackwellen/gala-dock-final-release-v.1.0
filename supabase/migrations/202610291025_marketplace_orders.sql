-- Q10 Marketplace Request / Quote / Hold / Booking (lane A, 2026-10-29). Additive; deployed code keeps working.
--  1. Marketplace Request as its own state machine (Q03 gap): provider_requests.status gains awaiting / clarification /
--     quote_received / declined / expired_no_response, derived from the request's recipient items by
--     marketplace_request_refresh() (trigger on build_items). Machine 'marketplace_request' (audit mode: legacy writers such as
--     payment_order_succeeded still set 'closed' directly, which is a legal transition).
--  2. Parent order group + child bookings (§13.14, cards 113–114): order_groups / order_group_items. The parent's status and
--     totals are always DERIVED from its children (never written independently), so one child's failure, cancellation or
--     refund can never corrupt the parent. Each child keeps its own direct-charge payment order on its seller's connected
--     account (Q07; payment_orders.order_group carries the group reference); nothing is pooled.
--  3. Canonical booking record (Q00 gap): view public.bookings (security_invoker) over build_items + provider_jobs with one
--     canonical status vocabulary (booking_canonical_status), plus order-group membership.
--  4. Quote expiry (card 109.5): sent quotes past valid_until become 'expired' (daily cron) and the organiser is told.

-- ─── 1. Marketplace Request machine ─────────────────────────────────────────────────────────────────────────────────
alter table public.provider_requests drop constraint if exists provider_requests_status_check;
alter table public.provider_requests add constraint provider_requests_status_check
  check (status in ('draft','sent','awaiting','clarification','quote_received','declined','expired_no_response','closed','cancelled'));
alter table public.provider_requests add column if not exists status_changed_at timestamptz;

insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states)
  values ('marketplace_request', 'provider_requests', 'status', 'audit', array['draft','sent'], array['cancelled'])
  on conflict (machine) do update set table_name = excluded.table_name, column_name = excluded.column_name, mode = excluded.mode,
    initial_states = excluded.initial_states, terminal_states = excluded.terminal_states;
delete from public.state_transitions where machine = 'marketplace_request';
insert into public.state_transitions(machine, from_state, to_state) values
  ('marketplace_request','draft','sent'), ('marketplace_request','draft','cancelled'),
  ('marketplace_request','sent','awaiting'), ('marketplace_request','sent','clarification'), ('marketplace_request','sent','quote_received'),
  ('marketplace_request','sent','declined'), ('marketplace_request','sent','expired_no_response'), ('marketplace_request','sent','closed'), ('marketplace_request','sent','cancelled'),
  ('marketplace_request','awaiting','clarification'), ('marketplace_request','awaiting','quote_received'), ('marketplace_request','awaiting','declined'),
  ('marketplace_request','awaiting','expired_no_response'), ('marketplace_request','awaiting','closed'), ('marketplace_request','awaiting','cancelled'),
  ('marketplace_request','clarification','awaiting'), ('marketplace_request','clarification','quote_received'), ('marketplace_request','clarification','declined'),
  ('marketplace_request','clarification','expired_no_response'), ('marketplace_request','clarification','closed'), ('marketplace_request','clarification','cancelled'),
  ('marketplace_request','quote_received','clarification'), ('marketplace_request','quote_received','closed'), ('marketplace_request','quote_received','cancelled'),
  ('marketplace_request','declined','sent'), ('marketplace_request','declined','closed'), ('marketplace_request','declined','cancelled'),
  ('marketplace_request','expired_no_response','sent'), ('marketplace_request','expired_no_response','closed'), ('marketplace_request','expired_no_response','cancelled'),
  ('marketplace_request','closed','sent'), ('marketplace_request','closed','cancelled');
drop trigger if exists provider_requests_state_guard on public.provider_requests;
create trigger provider_requests_state_guard before insert or update of status on public.provider_requests
  for each row execute function public.enforce_state_transition('marketplace_request', 'status');

-- Request-level state from its recipients: any usable answer → quote_received; else clarification; else still waiting;
-- else all declined/unavailable → declined; else (some recipient timed out) → expired_no_response (§33: never collapsed).
create or replace function public.marketplace_request_refresh(p_request uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare r public.provider_requests; target text; n_total int; n_answer int; n_clar int; n_wait int; n_decl int; n_exp int;
begin
  select * into r from public.provider_requests where id = p_request for update;
  if not found or r.status in ('draft','closed','cancelled') then return r.status; end if;
  select count(*),
         count(*) filter (where status in ('available','quoted','quote_received','quote_revised','customer_reviewing','held','conditionally_held','conditional_hold_requested',
                                           'awaiting_payment','awaiting_confirmation','confirmed','active','fulfilled','completion_pending','completed','standby','standby_offered','standby_accepted')),
         count(*) filter (where status in ('clarification','clarification_requested')),
         count(*) filter (where status in ('sent','awaiting','awaiting_provider','requested','enquiry_created','hold')),
         count(*) filter (where status in ('declined','unavailable')),
         count(*) filter (where status in ('expired','expired_no_response'))
    into n_total, n_answer, n_clar, n_wait, n_decl, n_exp
    from public.build_items where request_id = p_request;
  target := case when n_total = 0 then r.status when n_answer > 0 then 'quote_received' when n_clar > 0 then 'clarification'
                 when n_wait > 0 then 'awaiting' when n_exp > 0 then 'expired_no_response' when n_decl > 0 then 'declined' else r.status end;
  if target is distinct from r.status
     and exists(select 1 from public.state_transitions t where t.machine = 'marketplace_request' and t.from_state = r.status and t.to_state = target) then
    update public.provider_requests set status = target, status_changed_at = now() where id = r.id;
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'marketplace_request.state_changed',
      jsonb_build_object('request_id', r.id, 'from', r.status, 'to', target, 'event_id', r.event_id));
    return target;
  end if;
  return r.status;
end $$;

-- ─── 2. Order groups ────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.order_groups (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('OG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  event_id uuid not null references public.events(id) on delete cascade,
  created_by uuid references auth.users(id),
  status text not null default 'open' check (status in ('open','partially_confirmed','confirmed','partially_failed','failed','cancelled','completed')),
  currency text not null default 'GBP',
  totals jsonb not null default '{}',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_groups_event_idx on public.order_groups(event_id);
create table if not exists public.order_group_items (
  group_id uuid not null references public.order_groups(id) on delete cascade,
  build_item_id uuid not null references public.build_items(id) on delete cascade,
  seller_workspace_id uuid references public.workspaces(id) on delete set null,
  sequence integer not null default 0,
  depends_on_item_id uuid references public.build_items(id) on delete set null,
  required boolean not null default true,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (group_id, build_item_id)
);
-- A booking belongs to at most one live group.
create unique index if not exists order_group_items_live_key on public.order_group_items(build_item_id) where removed_at is null;
create index if not exists order_group_items_seller_idx on public.order_group_items(seller_workspace_id);

alter table public.order_groups enable row level security;
alter table public.order_group_items enable row level security;
drop policy if exists order_groups_read on public.order_groups;
create policy order_groups_read on public.order_groups for select to authenticated using (public.can_access_event(event_id) or public.is_platform_admin());
drop policy if exists order_group_items_read on public.order_group_items;
-- The buyer sees every child; a seller sees only its own child rows (never other sellers' lines).
create policy order_group_items_read on public.order_group_items for select to authenticated
  using (public.is_workspace_member(seller_workspace_id) or public.is_platform_admin()
         or exists(select 1 from public.order_groups g where g.id = group_id and public.can_access_event(g.event_id)));
revoke all on table public.order_groups, public.order_group_items from public, anon, authenticated;
grant select on table public.order_groups, public.order_group_items to authenticated;
grant all on table public.order_groups, public.order_group_items to service_role;

create or replace function public.booking_child_state(p_status text)
returns text language sql immutable set search_path to '' as $$
  select case
    when p_status in ('confirmed','active','fulfilled','completion_pending') then 'confirmed'
    when p_status = 'completed' then 'completed'
    when p_status in ('declined','unavailable','expired','expired_no_response','replacement_required','cancelled_by_provider') then 'failed'
    when p_status in ('cancelled','cancelled_by_customer','refunded','partially_refunded') then 'cancelled'
    when p_status = 'disputed' then 'disputed'
    else 'pending' end
$$;

-- Recompute a group from its children. Pure derivation: safe to call any number of times, from any child change.
create or replace function public.order_group_refresh(p_group uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare g public.order_groups; st text; tot jsonb; n int; n_conf int; n_done int; n_fail_req int; n_fail int; n_canc int; n_pend int; blocked jsonb; ws uuid;
begin
  select * into g from public.order_groups where id = p_group for update;
  if not found then return null; end if;
  with c as (
    select i.build_item_id, i.required, i.seller_workspace_id, i.depends_on_item_id, b.title, b.status, coalesce(b.amount, 0) amount, public.booking_child_state(b.status) cs
    from public.order_group_items i join public.build_items b on b.id = i.build_item_id where i.group_id = g.id and i.removed_at is null)
  select count(*), count(*) filter (where cs = 'confirmed'), count(*) filter (where cs = 'completed'),
         count(*) filter (where cs = 'failed' and required), count(*) filter (where cs = 'failed'), count(*) filter (where cs = 'cancelled'),
         count(*) filter (where cs in ('pending','disputed')),
         jsonb_build_object(
           'children', count(*),
           'confirmed_amount', coalesce(sum(amount) filter (where cs in ('confirmed','completed')), 0),
           'pending_amount', coalesce(sum(amount) filter (where cs in ('pending','disputed')), 0),
           'failed_amount', coalesce(sum(amount) filter (where cs = 'failed'), 0),
           'cancelled_amount', coalesce(sum(amount) filter (where cs = 'cancelled'), 0),
           'by_state', coalesce((select jsonb_object_agg(cs, k) from (select cs, count(*) k from c group by cs) x), '{}'),
           'by_seller', coalesce((select jsonb_agg(jsonb_build_object('workspace_id', seller_workspace_id, 'amount', a, 'state', s) order by s)
                                  from (select seller_workspace_id, sum(amount) a, string_agg(distinct cs, ',') s from c group by seller_workspace_id) y), '[]'),
           'needs_replacement', coalesce((select jsonb_agg(jsonb_build_object('build_item_id', build_item_id, 'title', title, 'status', status)) from c where cs = 'failed' and required), '[]'))
    into n, n_conf, n_done, n_fail_req, n_fail, n_canc, n_pend, tot from c;
  -- Dependants whose dependency failed (e.g. suppliers waiting on a lost venue).
  select coalesce(jsonb_agg(i.build_item_id), '[]') into blocked from public.order_group_items i join public.build_items d on d.id = i.depends_on_item_id
    where i.group_id = g.id and i.removed_at is null and public.booking_child_state(d.status) in ('failed','cancelled');
  tot := tot || jsonb_build_object('dependency_failed', blocked);
  st := case
    when n = 0 then 'open'
    when n_canc = n then 'cancelled'
    when n_done > 0 and n_done + n_canc = n then 'completed'
    when n_fail_req > 0 and n_conf + n_done = 0 and n_pend = 0 then 'failed'
    when n_fail_req > 0 then 'partially_failed'
    when n_pend = 0 and n_conf + n_done > 0 then 'confirmed'
    when n_conf + n_done > 0 then 'partially_confirmed'
    else 'open' end;
  if st is distinct from g.status or tot is distinct from g.totals then
    update public.order_groups set status = st, totals = tot, version = version + 1, updated_at = now() where id = g.id;
    if st is distinct from g.status then
      select e.workspace_id into ws from public.events e where e.id = g.event_id;
      insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', ws, 'order_group.status_changed',
        jsonb_build_object('order_group', g.reference, 'from', g.status, 'to', st, 'event_id', g.event_id));
      if st in ('partially_failed','failed') then
        perform public.notify_event(g.event_id, 'event_update', 'Part of your booking needs attention',
          'One or more providers in this order could not be confirmed. Confirmed bookings are unaffected; choose a replacement.', null);
      end if;
    end if;
  end if;
  return st;
end $$;

create or replace function public.build_item_marketplace_sync()
returns trigger language plpgsql security definer set search_path to '' as $$
declare gid uuid;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  if new.request_id is not null then perform public.marketplace_request_refresh(new.request_id); end if;
  for gid in select i.group_id from public.order_group_items i where i.build_item_id = new.id and i.removed_at is null loop
    perform public.order_group_refresh(gid);
  end loop;
  return null;
end $$;
drop trigger if exists build_items_marketplace_sync on public.build_items;
create trigger build_items_marketplace_sync after insert or update of status on public.build_items for each row execute function public.build_item_marketplace_sync();

-- Commands (buyer side: anyone who can access the event). Children must belong to the event and have a listing.
create or replace function public.order_group_create(p_event uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare gid uuid; x jsonb; b public.build_items; seq int := 0;
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then raise exception 'items_required' using errcode = '22023'; end if;
  insert into public.order_groups(event_id, created_by) values (p_event, auth.uid()) returning id into gid;
  for x in select * from jsonb_array_elements(p_items) loop
    select * into b from public.build_items where id = (x->>'build_item_id')::uuid;
    if not found or b.event_id <> p_event or b.listing_id is null then raise exception 'item_not_in_event' using errcode = '22023'; end if;
    if nullif(x->>'depends_on', '') is not null and not exists(select 1 from public.build_items d where d.id = (x->>'depends_on')::uuid and d.event_id = p_event) then
      raise exception 'dependency_not_in_event' using errcode = '22023';
    end if;
    begin
      insert into public.order_group_items(group_id, build_item_id, seller_workspace_id, sequence, depends_on_item_id, required)
        values (gid, b.id, public.listing_workspace(b.listing_id), seq, nullif(x->>'depends_on', '')::uuid, coalesce((x->>'required')::boolean, true));
    exception when unique_violation then raise exception 'item_already_grouped' using errcode = '23505';
    end;
    seq := seq + 1;
  end loop;
  perform public.order_group_refresh(gid);
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), (select workspace_id from public.events where id = p_event), 'order_group.created', jsonb_build_object('order_group_id', gid, 'children', seq));
  return gid;
end $$;

-- Recovery: add a replacement child (or another supplier) to a live group; remove a child that failed/cancelled/never confirmed.
create or replace function public.order_group_set_item(p_group uuid, p_item uuid, p_action text, p_depends_on uuid default null, p_required boolean default true)
returns text language plpgsql security definer set search_path to '' as $$
declare g public.order_groups; b public.build_items;
begin
  select * into g from public.order_groups where id = p_group for update;
  if not found or not public.can_access_event(g.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into b from public.build_items where id = p_item;
  if not found or b.event_id <> g.event_id or b.listing_id is null then raise exception 'item_not_in_event' using errcode = '22023'; end if;
  if p_action = 'add' then
    begin
      insert into public.order_group_items(group_id, build_item_id, seller_workspace_id, sequence, depends_on_item_id, required)
        values (g.id, b.id, public.listing_workspace(b.listing_id), coalesce((select max(sequence) + 1 from public.order_group_items where group_id = g.id), 0), p_depends_on, p_required)
        on conflict (group_id, build_item_id) do update set removed_at = null, depends_on_item_id = excluded.depends_on_item_id, required = excluded.required;
    exception when unique_violation then raise exception 'item_already_grouped' using errcode = '23505';
    end;
  elsif p_action = 'remove' then
    -- A confirmed booking leaves the group only through its own cancellation (request_cancellation), never by editing the parent.
    if public.booking_child_state(b.status) in ('confirmed','completed','disputed') then raise exception 'cancel_booking_first' using errcode = '22023'; end if;
    update public.order_group_items set removed_at = now() where group_id = g.id and build_item_id = b.id and removed_at is null;
  else raise exception 'invalid_action' using errcode = '22023';
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), (select workspace_id from public.events where id = g.event_id), 'order_group.item_' || p_action, jsonb_build_object('order_group_id', g.id, 'build_item_id', b.id));
  return public.order_group_refresh(g.id);
end $$;

-- ─── 3. Canonical bookings view ─────────────────────────────────────────────────────────────────────────────────────
create or replace function public.booking_canonical_status(p_status text)
returns text language sql immutable set search_path to '' as $$
  select case
    when p_status in ('draft','suggested','enquiry_created','sent','awaiting','awaiting_provider','requested','clarification','clarification_requested','conditional_hold_requested') then 'requested'
    when p_status in ('available','quoted','quote_received','quote_revised','customer_reviewing') then 'quoted'
    when p_status in ('held','hold','conditionally_held','standby','standby_offered','standby_accepted') then 'held'
    when p_status in ('awaiting_payment','awaiting_confirmation') then 'awaiting_payment'
    when p_status in ('confirmed','deposit_paid') then 'confirmed'
    when p_status = 'active' then 'active'
    when p_status in ('fulfilled','completion_pending') then 'completion_pending'
    when p_status = 'completed' then 'completed'
    when p_status = 'cancellation_requested' then 'cancellation_requested'
    when p_status in ('cancelled','cancelled_by_customer','cancelled_by_provider','refunded','partially_refunded') then 'cancelled'
    when p_status in ('declined','unavailable') then 'declined'
    when p_status in ('expired','expired_no_response') then 'expired'
    when p_status in ('disputed','replacement_required','no_show') then p_status
    else p_status end
$$;

create or replace view public.bookings with (security_invoker = true) as
  select b.id as booking_id, 'marketplace'::text as source, b.id as build_item_id, j.id as provider_job_id, b.event_id,
    e.workspace_id as buyer_workspace_id, e.owner_id as buyer_user_id, coalesce(j.workspace_id, l.workspace_id) as seller_workspace_id,
    b.listing_id, coalesce(j.space_id, b.space_id) as space_id, coalesce(j.mode, l.kind) as mode, b.role,
    coalesce(j.starts_at, e.starts_at) as starts_at, coalesce(j.ends_at, e.ends_at) as ends_at, b.amount, coalesce(j.currency, 'GBP') as currency,
    public.booking_canonical_status(b.status) as status, b.status as buyer_status, j.status as provider_status, j.payment_status,
    gi.group_id as order_group_id, b.created_at, b.updated_at
  from public.build_items b
  left join public.provider_jobs j on j.build_item_id = b.id
  left join public.events e on e.id = b.event_id
  left join public.listings l on l.id = b.listing_id
  left join public.order_group_items gi on gi.build_item_id = b.id and gi.removed_at is null
  where b.listing_id is not null and b.status not in ('suggested','draft')
  union all
  select j.id, j.source, null, j.id, j.event_id, null, null, j.workspace_id, j.listing_id, j.space_id, j.mode, j.role, j.starts_at, j.ends_at, j.value, j.currency,
    public.booking_canonical_status(j.status), null, j.status, j.payment_status, null, j.created_at, j.created_at
  from public.provider_jobs j where j.build_item_id is null;
revoke all on table public.bookings from public, anon, authenticated;
grant select on table public.bookings to authenticated, service_role;

-- ─── 4. Quote expiry ────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.marketplace_quote_expiry_sweep()
returns integer language plpgsql security definer set search_path to '' as $$
declare r record; n integer := 0;
begin
  for r in select q.id, q.build_item_id, b.event_id, b.title from public.provider_quotes q join public.build_items b on b.id = q.build_item_id
           where q.status = 'sent' and q.valid_until < current_date for update of q skip locked loop
    update public.provider_quotes set status = 'expired' where id = r.id;
    perform public.notify_event(r.event_id, 'quote_received', 'Quote expired: ' || r.title, 'The quote passed its valid-until date. Ask the provider to re-quote.',
      public.event_path(r.event_id, 'booking', r.build_item_id));
    n := n + 1;
  end loop;
  return n;
end $$;

do $$ declare f text; begin
  foreach f in array array['public.marketplace_request_refresh(uuid)', 'public.order_group_refresh(uuid)', 'public.build_item_marketplace_sync()',
      'public.marketplace_quote_expiry_sweep()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.order_group_create(uuid,jsonb)', 'public.order_group_set_item(uuid,uuid,text,uuid,boolean)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

select cron.schedule('marketplace-quote-expiry', '15 1 * * *', 'select public.marketplace_quote_expiry_sweep()');

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('marketplace_request.state_changed', 1, 'request', 'A marketplace request moved state (derived from its recipients).', null),
  ('order_group.created', 1, 'order_group', 'A multi-vendor order group was created.', null),
  ('order_group.status_changed', 1, 'order_group', 'A multi-vendor order group''s derived status changed.', null)
on conflict (event_type) do update set schema_version = excluded.schema_version, aggregate = excluded.aggregate, description = excluded.description, public_type = excluded.public_type, active = true, updated_at = now();

-- Bring existing requests to their derived state once (only legal transitions are applied).
select public.marketplace_request_refresh(id) from public.provider_requests where status = 'sent';
