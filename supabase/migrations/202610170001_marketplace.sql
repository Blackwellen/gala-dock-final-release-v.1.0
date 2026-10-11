-- Phase 3 — marketplace booking lifecycle (master spec §33–37, §44–45).
-- Response commitments + countdown data, conditional holds, paid standby, emergency supply, booking disputes,
-- card chargebacks, the policy-driven cancellation engine and the scheduled marketplace sweep.
-- Legacy build_items states (sent/awaiting/available/quoted/held/...) stay valid; spec states are added alongside.
-- Transition rules live in src/lib/domain/state-machines.ts (seeded by 202610160002_foundation_seed.sql).
begin;

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.notify_workspace(p_ws uuid, p_roles text[], p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(user_id, kind, title, body, link)
  select m.user_id, p_kind, left(p_title, 140), left(coalesce(p_body, ''), 600), p_link
  from public.workspace_members m where m.workspace_id = p_ws and m.status = 'active' and m.role = any(p_roles);
$$;

-- Event-side recipients: the owner of a customer event, or owners/managers of the organizer workspace.
create or replace function public.notify_event(p_event uuid, p_kind text, p_title text, p_body text, p_link text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(user_id, kind, title, body, link)
  select distinct u, p_kind, left(p_title, 140), left(coalesce(p_body, ''), 600),
    coalesce(p_link, case when e.workspace_id is null then '/account/events/' || e.id || '/build' else '/organizer/events/' || e.id end)
  from public.events e
  cross join lateral (select e.owner_id union select m.user_id from public.workspace_members m
    where m.workspace_id = e.workspace_id and m.status = 'active' and m.role in ('owner','manager')) r(u)
  where e.id = p_event and u is not null;
$$;

-- Portal-correct deep link for the event side: customer events live under /account, workspace events under /organizer.
create or replace function public.event_path(p_event uuid, p_kind text, p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'booking' then case when e.workspace_id is null then '/account/events/' || e.id || '/bookings/' || p_id else '/organizer/marketplace/bookings/' || p_id end
    when 'dispute' then case when e.workspace_id is null then '/account/disputes/' || p_id else '/organizer/disputes/' || p_id end
    when 'emergency' then '/organizer/marketplace/emergency/' || p_id
    else case when e.workspace_id is null then '/account/events/' || e.id || '/build' else '/organizer/events/' || e.id end end
  from public.events e where e.id = p_event;
$$;

create or replace function public.listing_workspace(p_listing uuid) returns uuid
language sql stable security definer set search_path = '' as $$ select workspace_id from public.listings where id = p_listing $$;

revoke all on function public.notify_workspace(uuid, text[], text, text, text, text), public.notify_event(uuid, text, text, text, text),
  public.listing_workspace(uuid), public.event_path(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.notify_workspace(uuid, text[], text, text, text, text), public.notify_event(uuid, text, text, text, text),
  public.listing_workspace(uuid), public.event_path(uuid, text, uuid) to service_role;

-- ───────────────────────── §33/§34 booking states + response commitment ─────────────────────────
alter table public.build_items drop constraint if exists build_items_status_check;
alter table public.build_items add constraint build_items_status_check check (status in (
  -- legacy
  'suggested','draft','sent','awaiting','available','quoted','clarification','held','confirmed','standby','declined','unavailable','expired','cancelled','fulfilled',
  -- spec §33
  'enquiry_created','awaiting_provider','clarification_requested','quote_received','quote_revised','customer_reviewing','conditional_hold_requested',
  'conditionally_held','standby_offered','standby_accepted','awaiting_payment','awaiting_confirmation','active','completion_pending','completed',
  'cancellation_requested','cancelled_by_customer','cancelled_by_provider','replacement_required','disputed','refunded','partially_refunded','expired_no_response'));

alter table public.build_items
  add column if not exists sent_at timestamptz,
  add column if not exists responded_at timestamptz,
  add column if not exists response_status text check (response_status in ('pending','responded','expired')),
  add column if not exists response_reminders smallint not null default 0,
  add column if not exists status_before_hold text;
create index if not exists build_items_response_due_idx on public.build_items(response_deadline) where response_status = 'pending';

-- Records sent/responded timestamps and derives the deadline from the provider's response commitment (§34).
create or replace function public.build_item_response_track() returns trigger
language plpgsql security definer set search_path = '' as $$
declare hrs integer;
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    select coalesce(case when pr.emergency then least(coalesce(pr.response_hours, 2), 2) end, pr.response_hours, l.response_hours, 24) into hrs
      from (select 1) x left join public.provider_requests pr on pr.id = new.request_id left join public.listings l on l.id = new.listing_id;
    new.sent_at := now(); new.responded_at := null; new.response_status := 'pending'; new.response_reminders := 0;
    if tg_op = 'UPDATE' or new.response_deadline is null then new.response_deadline := now() + make_interval(hours => coalesce(hrs, 24)); end if;
  elsif tg_op = 'UPDATE' and old.status in ('sent','awaiting','awaiting_provider') and new.status in
      ('available','quoted','clarification','declined','unavailable','quote_received','clarification_requested','held','conditionally_held','confirmed') then
    new.responded_at := now(); new.response_status := 'responded';
  elsif tg_op = 'UPDATE' and old.status in ('sent','awaiting','awaiting_provider') and new.status in ('expired','expired_no_response') then
    new.response_status := 'expired';
  end if;
  return new;
end $$;
drop trigger if exists build_items_response_track on public.build_items;
create trigger build_items_response_track before insert or update of status on public.build_items
  for each row execute function public.build_item_response_track();

-- ───────────────────────── §35 conditional holds ─────────────────────────
create table if not exists public.conditional_holds (
  id uuid primary key default gen_random_uuid(),
  build_item_id uuid not null references public.build_items(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  depends_on_item_id uuid references public.build_items(id) on delete set null,
  dependency_state text not null default 'none' check (dependency_state in ('none','pending','met','failed')),
  held_quantity integer check (held_quantity is null or held_quantity > 0),
  starts_at timestamptz, ends_at timestamptz,
  requested_hours integer not null check (requested_hours between 2 and 336),
  expires_at timestamptz,
  price numeric(12,2) check (price is null or price >= 0),
  currency text not null default 'GBP',
  conditions text not null default '',
  provider_note text not null default '',
  source text not null default 'request' check (source in ('request','direct')),
  status text not null default 'requested',
  requested_by uuid references auth.users(id),
  responded_by uuid references auth.users(id),
  responded_at timestamptz,
  closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists conditional_holds_one_open on public.conditional_holds(build_item_id) where status in ('requested','held');
create index if not exists conditional_holds_expiry_idx on public.conditional_holds(expires_at) where status in ('requested','held');
create index if not exists conditional_holds_ws_idx on public.conditional_holds(workspace_id, status);
alter table public.conditional_holds enable row level security;
drop policy if exists conditional_holds_read on public.conditional_holds;
create policy conditional_holds_read on public.conditional_holds for select using (
  public.can_access_event(event_id) or public.is_workspace_member(workspace_id) or public.has_admin_permission('marketplace'));

-- Organizer asks the provider to hold capacity while another booking (e.g. the venue) is pending. Not a card authorisation.
create or replace function public.request_conditional_hold(p_item uuid, p_hours integer, p_depends_on uuid default null, p_conditions text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.build_items; e public.events; d public.build_items; hid uuid; ws uuid;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or not public.can_edit_event(b.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if b.listing_id is null then raise exception 'not_marketplace_item' using errcode = '22023'; end if;
  if b.status not in ('available','quoted','quote_received','quote_revised','customer_reviewing') then raise exception 'not_holdable:%', b.status using errcode = '22023'; end if;
  if p_hours is null or p_hours not between 2 and 336 then raise exception 'invalid_hold_window' using errcode = '22023'; end if;
  if p_depends_on is not null then
    select * into d from public.build_items where id = p_depends_on;
    if not found or d.event_id <> b.event_id or d.id = b.id then raise exception 'invalid_dependency' using errcode = '22023'; end if;
  end if;
  select * into e from public.events where id = b.event_id;
  ws := public.listing_workspace(b.listing_id);
  insert into public.conditional_holds(build_item_id, event_id, listing_id, workspace_id, depends_on_item_id, dependency_state, starts_at, ends_at,
      requested_hours, price, conditions, status, requested_by)
    values (b.id, b.event_id, b.listing_id, ws, p_depends_on, case when p_depends_on is null then 'none' when d.status = 'confirmed' then 'met' else 'pending' end,
      e.starts_at, e.ends_at, p_hours, b.amount, left(coalesce(p_conditions, ''), 1000), 'requested', auth.uid())
    returning id into hid;
  update public.build_items set status_before_hold = status, status = 'conditional_hold_requested', updated_at = now() where id = b.id;
  perform public.notify_workspace(ws, array['owner','manager'], 'provider.hold', 'Hold requested: ' || coalesce(e.name, 'event'),
    'The organiser asked you to hold this date for up to ' || p_hours || ' hours' || case when p_depends_on is not null then ' while another booking is confirmed.' else '.' end,
    '/provider/opportunities/' || b.id);
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'hold.requested', jsonb_build_object('hold_id', hid, 'build_item_id', b.id, 'hours', p_hours));
  return hid;
end $$;

create or replace function public.provider_respond_hold(p_hold uuid, p_accept boolean, p_hours integer default null, p_note text default '')
returns text language plpgsql security definer set search_path = '' as $$
declare h public.conditional_holds; hrs integer;
begin
  select * into h from public.conditional_holds where id = p_hold for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(h.workspace_id, array['owner','manager']);
  if h.status <> 'requested' then raise exception 'not_open:%', h.status using errcode = '22023'; end if;
  if p_accept then
    hrs := least(coalesce(p_hours, h.requested_hours), h.requested_hours);
    if hrs < 2 then raise exception 'invalid_hold_window' using errcode = '22023'; end if;
    update public.conditional_holds set status = 'held', expires_at = now() + make_interval(hours => hrs), responded_by = auth.uid(), responded_at = now(),
      provider_note = left(coalesce(p_note, ''), 1000), updated_at = now() where id = h.id;
    update public.build_items set status = 'held', hold_expires_at = now() + make_interval(hours => hrs), updated_at = now() where id = h.build_item_id;
    perform public.notify_event(h.event_id, 'provider.hold', 'Hold confirmed', 'The provider is holding the date for ' || hrs || ' hours.', public.event_path(h.event_id, 'booking', h.build_item_id));
  else
    update public.conditional_holds set status = 'declined', responded_by = auth.uid(), responded_at = now(), provider_note = left(coalesce(p_note, ''), 1000),
      closed_reason = 'declined_by_provider', updated_at = now() where id = h.id;
    update public.build_items set status = coalesce(status_before_hold, 'available'), updated_at = now() where id = h.build_item_id and status = 'conditional_hold_requested';
    perform public.notify_event(h.event_id, 'provider.hold', 'Hold declined', 'The provider could not hold the date. Their quote still stands.', public.event_path(h.event_id, 'booking', h.build_item_id));
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', h.workspace_id, case when p_accept then 'hold.accepted' else 'hold.declined' end, jsonb_build_object('hold_id', h.id));
  return case when p_accept then 'held' else 'declined' end;
end $$;

-- Either side may release an open hold.
create or replace function public.release_conditional_hold(p_hold uuid, p_reason text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare h public.conditional_holds;
begin
  select * into h from public.conditional_holds where id = p_hold for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (public.can_edit_event(h.event_id) or public.has_workspace_role(h.workspace_id, array['owner','manager'])) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if h.status not in ('requested','held') then raise exception 'not_open:%', h.status using errcode = '22023'; end if;
  update public.conditional_holds set status = 'released', closed_reason = left(coalesce(nullif(p_reason, ''), 'released'), 300), updated_at = now() where id = h.id;
  update public.build_items set status = coalesce(status_before_hold, 'available'), hold_expires_at = null, updated_at = now()
    where id = h.build_item_id and status in ('held','conditional_hold_requested','conditionally_held');
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', h.workspace_id, 'hold.released', jsonb_build_object('hold_id', h.id, 'reason', left(coalesce(p_reason, ''), 300)));
end $$;

-- Keeps hold records in step with build_items status changes made by legacy flows (direct holds, confirm, cancel).
create or replace function public.build_item_hold_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if new.status = 'held' and old.status is distinct from 'held' and new.listing_id is not null
     and not exists (select 1 from public.conditional_holds h where h.build_item_id = new.id and h.status in ('requested','held')) then
    ws := public.listing_workspace(new.listing_id);
    insert into public.conditional_holds(build_item_id, event_id, listing_id, workspace_id, requested_hours, expires_at, price, source, status, requested_by)
      values (new.id, new.event_id, new.listing_id, ws, greatest(2, least(336, ceil(extract(epoch from (coalesce(new.hold_expires_at, now() + interval '48 hours') - now())) / 3600)::int)),
        coalesce(new.hold_expires_at, now() + interval '48 hours'), new.amount, 'direct', 'held', auth.uid());
  elsif old.status in ('held','conditional_hold_requested','conditionally_held') and new.status not in ('held','conditional_hold_requested','conditionally_held') then
    update public.conditional_holds set status = case when new.status = 'confirmed' then 'converted'
        when status = 'held' and expires_at <= now() then 'expired' when new.status like 'cancelled%' then 'cancelled' else status end,
      closed_reason = coalesce(closed_reason, new.status), updated_at = now()
      where build_item_id = new.id and status in ('requested','held') and (new.status = 'confirmed' or new.status like 'cancelled%' or (status = 'held' and expires_at <= now()));
  end if;
  -- Dependency signalling: a hold waiting on this booking learns when it is confirmed or lost.
  if new.status is distinct from old.status then
    if new.status = 'confirmed' then
      update public.conditional_holds set dependency_state = 'met', updated_at = now() where depends_on_item_id = new.id and status in ('requested','held') and dependency_state = 'pending';
    elsif new.status in ('cancelled','cancelled_by_customer','cancelled_by_provider','declined','unavailable','expired','expired_no_response') then
      update public.conditional_holds set dependency_state = 'failed', updated_at = now() where depends_on_item_id = new.id and status in ('requested','held');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists build_items_hold_sync on public.build_items;
create trigger build_items_hold_sync after update of status on public.build_items for each row execute function public.build_item_hold_sync();

create or replace function public.conditional_hold_dependency_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.dependency_state is distinct from old.dependency_state and new.dependency_state in ('met','failed') then
    perform public.notify_workspace(new.workspace_id, array['owner','manager'], 'provider.hold',
      case when new.dependency_state = 'met' then 'Hold condition met' else 'Hold condition failed' end,
      case when new.dependency_state = 'met' then 'The booking your hold depended on is confirmed. Expect a confirmation request.'
        else 'The booking your hold depended on fell through. The organiser may release your hold.' end, '/provider/opportunities/' || new.build_item_id);
    perform public.notify_event(new.event_id, 'provider.hold',
      case when new.dependency_state = 'met' then 'Ready to confirm a held supplier' else 'A held supplier depends on a lost booking' end,
      case when new.dependency_state = 'met' then 'A dependency is confirmed, so you can now confirm the supplier it was holding for.'
        else 'Review the hold: its dependency was cancelled or declined.' end, public.event_path(new.event_id, 'booking', new.build_item_id));
  end if;
  return new;
end $$;
drop trigger if exists conditional_holds_dependency_notify on public.conditional_holds;
create trigger conditional_holds_dependency_notify after update of dependency_state on public.conditional_holds
  for each row execute function public.conditional_hold_dependency_notify();

-- ───────────────────────── §36 paid standby ─────────────────────────
create table if not exists public.standby_commitments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  build_item_id uuid not null references public.build_items(id) on delete cascade,
  primary_item_id uuid references public.build_items(id) on delete set null,
  listing_id uuid not null references public.listings(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null check (window_end > window_start),
  standby_fee numeric(12,2) check (standby_fee is null or standby_fee >= 0),
  activation_price numeric(12,2) check (activation_price is null or activation_price > 0),
  currency text not null default 'GBP',
  cancellation_terms text not null default '',
  organizer_note text not null default '',
  expires_at timestamptz,
  status text not null default 'requested',
  fee_status text not null default 'not_required' check (fee_status in ('not_required','due','paid','waived','refunded')),
  fee_payment_ref text,
  activated_at timestamptz, activation_reason text,
  requested_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists standby_one_open on public.standby_commitments(build_item_id) where status in ('requested','offered','accepted');
create index if not exists standby_primary_idx on public.standby_commitments(primary_item_id) where status = 'accepted';
create index if not exists standby_ws_idx on public.standby_commitments(workspace_id, status);
alter table public.standby_commitments enable row level security;
drop policy if exists standby_read on public.standby_commitments;
create policy standby_read on public.standby_commitments for select using (
  public.can_access_event(event_id) or public.is_workspace_member(workspace_id) or public.has_admin_permission('marketplace'));

create or replace function public.request_standby(p_item uuid, p_primary uuid, p_window_start timestamptz, p_window_end timestamptz, p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.build_items; p public.build_items; sid uuid; ws uuid;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or not public.can_edit_event(b.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if b.listing_id is null then raise exception 'not_marketplace_item' using errcode = '22023'; end if;
  if p_primary is not null then
    select * into p from public.build_items where id = p_primary;
    if not found or p.event_id <> b.event_id or p.id = b.id then raise exception 'invalid_primary' using errcode = '22023'; end if;
  end if;
  if p_window_start is null or p_window_end is null or p_window_end <= p_window_start or p_window_end < now() then raise exception 'invalid_window' using errcode = '22023'; end if;
  ws := public.listing_workspace(b.listing_id);
  insert into public.standby_commitments(event_id, build_item_id, primary_item_id, listing_id, workspace_id, window_start, window_end, organizer_note, expires_at, status, requested_by)
    values (b.event_id, b.id, p_primary, b.listing_id, ws, p_window_start, p_window_end, left(coalesce(p_note, ''), 1000), least(p_window_start, now() + interval '72 hours'), 'requested', auth.uid())
    returning id into sid;
  update public.build_items set role = 'standby', updated_at = now() where id = b.id;
  perform public.notify_workspace(ws, array['owner','manager'], 'provider.request', 'Paid standby requested',
    'An organiser wants you on paid standby. Set your standby fee and activation price.', '/provider/opportunities/' || b.id);
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'standby.requested', jsonb_build_object('standby_id', sid, 'build_item_id', b.id));
  return sid;
end $$;

create or replace function public.provider_offer_standby(p_standby uuid, p_fee numeric, p_activation_price numeric, p_valid_hours integer, p_terms text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.standby_commitments;
begin
  select * into s from public.standby_commitments where id = p_standby for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(s.workspace_id, array['owner','manager']);
  if s.status <> 'requested' then raise exception 'not_open:%', s.status using errcode = '22023'; end if;
  if p_fee is null or p_fee < 0 or p_activation_price is null or p_activation_price <= 0 then raise exception 'invalid_price' using errcode = '22023'; end if;
  if p_valid_hours is null or p_valid_hours not between 2 and 168 then raise exception 'invalid_validity' using errcode = '22023'; end if;
  if length(trim(coalesce(p_terms, ''))) < 10 then raise exception 'terms_required' using errcode = '22023'; end if;
  update public.standby_commitments set status = 'offered', standby_fee = round(p_fee, 2), activation_price = round(p_activation_price, 2),
    cancellation_terms = left(p_terms, 2000), expires_at = least(window_start, now() + make_interval(hours => p_valid_hours)), updated_at = now() where id = s.id;
  perform public.notify_event(s.event_id, 'quote_received', 'Standby offer received',
    'Standby fee £' || round(p_fee, 2) || ', activation price £' || round(p_activation_price, 2) || '.', public.event_path(s.event_id, 'booking', s.build_item_id));
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', s.workspace_id, 'standby.offered', jsonb_build_object('standby_id', s.id, 'fee', p_fee, 'activation_price', p_activation_price));
end $$;

create or replace function public.provider_decline_standby(p_standby uuid, p_reason text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare s public.standby_commitments;
begin
  select * into s from public.standby_commitments where id = p_standby for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(s.workspace_id, array['owner','manager']);
  if s.status not in ('requested','offered') then raise exception 'not_open:%', s.status using errcode = '22023'; end if;
  update public.standby_commitments set status = 'declined', activation_reason = left(coalesce(p_reason, ''), 300), updated_at = now() where id = s.id;
  perform public.notify_event(s.event_id, 'provider.request', 'Standby declined', 'The provider can''t offer standby for this event.', public.event_path(s.event_id, 'booking', s.build_item_id));
end $$;

-- Organizer accepts the offer. The fee (if any) is collected via payment orchestration; activation waits for it.
create or replace function public.accept_standby(p_standby uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare s public.standby_commitments;
begin
  select * into s from public.standby_commitments where id = p_standby for update;
  if not found or not public.can_edit_event(s.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if s.status <> 'offered' then raise exception 'not_offered:%', s.status using errcode = '22023'; end if;
  if s.expires_at is not null and s.expires_at < now() then
    update public.standby_commitments set status = 'expired', updated_at = now() where id = s.id;
    raise exception 'offer_expired' using errcode = '22023';
  end if;
  update public.standby_commitments set status = 'accepted', fee_status = case when coalesce(standby_fee, 0) > 0 then 'due' else 'not_required' end, updated_at = now() where id = s.id;
  perform public.notify_workspace(s.workspace_id, array['owner','manager'], 'provider.request', 'Standby accepted',
    'You are on standby for this event. Keep the window free.', '/provider/opportunities/' || s.build_item_id);
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', s.workspace_id, 'standby.accepted', jsonb_build_object('standby_id', s.id));
  return case when coalesce(s.standby_fee, 0) > 0 then 'fee_due' else 'accepted' end;
end $$;

-- Binding activation: the standby provider becomes the booked supplier at the agreed activation price.
create or replace function public.activate_standby(p_standby uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.standby_commitments;
begin
  select * into s from public.standby_commitments where id = p_standby for update;
  if not found or not public.can_edit_event(s.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if s.status <> 'accepted' then raise exception 'not_accepted:%', s.status using errcode = '22023'; end if;
  if s.fee_status = 'due' then raise exception 'standby_fee_unpaid' using errcode = '22023'; end if;
  if now() > s.window_end then raise exception 'window_closed' using errcode = '22023'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.standby_commitments set status = 'activated', activated_at = now(), activation_reason = left(p_reason, 500), updated_at = now() where id = s.id;
  update public.build_items set status = 'confirmed', role = 'primary', amount = s.activation_price, price_basis = 'fixed',
    terms_snapshot = jsonb_build_object('source', 'standby', 'standby_id', s.id, 'amount', s.activation_price, 'standby_fee', s.standby_fee,
      'cancellation', s.cancellation_terms, 'confirmed_at', now()), updated_at = now() where id = s.build_item_id;
  if s.primary_item_id is not null then
    update public.build_items set role = 'backup', updated_at = now() where id = s.primary_item_id;
    update public.build_items set status = 'replacement_required', updated_at = now() where id = s.primary_item_id and status = 'confirmed';
  end if;
  perform public.notify_workspace(s.workspace_id, array['owner','manager','member'], 'booking_confirmed', 'Standby activated — you are booked',
    'Activation price £' || s.activation_price || '. Reason: ' || left(p_reason, 200), '/provider/opportunities/' || s.build_item_id);
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', s.workspace_id, 'standby.activated', jsonb_build_object('standby_id', s.id, 'reason', left(p_reason, 500)));
end $$;

create or replace function public.release_standby(p_standby uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.standby_commitments;
begin
  select * into s from public.standby_commitments where id = p_standby for update;
  if not found or not public.can_edit_event(s.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if s.status not in ('requested','offered','accepted') then raise exception 'not_open:%', s.status using errcode = '22023'; end if;
  update public.standby_commitments set status = case when s.status = 'accepted' then 'released' else 'cancelled' end, updated_at = now() where id = s.id;
  perform public.notify_workspace(s.workspace_id, array['owner','manager'], 'provider.request', 'Standby released',
    case when s.status = 'accepted' then 'The organiser released you from standby. Your standby terms apply to the fee.' else 'The organiser withdrew the standby request.' end, '/provider/opportunities/' || s.build_item_id);
end $$;

-- Primary failure surfaces any accepted standby immediately (§36).
create or replace function public.build_item_primary_failed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  if new.status is distinct from old.status and new.status in ('cancelled','cancelled_by_provider','declined','unavailable','replacement_required','expired','expired_no_response') then
    for s in select sc.id, sc.build_item_id, l.name from public.standby_commitments sc join public.listings l on l.id = sc.listing_id
             where sc.primary_item_id = new.id and sc.status = 'accepted' loop
      perform public.notify_event(new.event_id, 'provider.request', 'Standby ready: ' || s.name,
        new.title || ' is no longer available. Activate your standby to secure cover now.', public.event_path(new.event_id, 'booking', s.build_item_id));
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists build_items_primary_failed on public.build_items;
create trigger build_items_primary_failed after update of status on public.build_items for each row execute function public.build_item_primary_failed();

-- ───────────────────────── §37 emergency supply ─────────────────────────
create table if not exists public.emergency_provider_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  categories text[] not null default '{}',
  base_lat double precision, base_lng double precision,
  radius_km integer not null default 40 check (radius_km between 1 and 500),
  response_minutes integer not null default 60 check (response_minutes in (15,30,60,120,240)),
  surcharge_pct integer not null default 0 check (surcharge_pct between 0 and 300),
  rate_notes text not null default '',
  available_now boolean not null default false,
  available_until timestamptz,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.emergency_provider_profiles enable row level security;
drop policy if exists emergency_profiles_member on public.emergency_provider_profiles;
create policy emergency_profiles_member on public.emergency_provider_profiles for select using (public.is_workspace_member(workspace_id) or public.has_admin_permission('marketplace'));

create table if not exists public.emergency_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('EM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  event_id uuid not null references public.events(id) on delete cascade,
  created_by uuid references auth.users(id),
  severity text not null check (severity in ('critical','high','standard')),
  category text not null check (length(category) between 2 and 40),
  required_arrival timestamptz not null,
  location text not null default '',
  lat double precision, lng double precision,
  original_item_id uuid references public.build_items(id) on delete set null,
  failure_reason text not null default '',
  scope text not null default '',
  budget_max numeric(12,2) check (budget_max is null or budget_max >= 0),
  currency text not null default 'GBP',
  pool_size integer not null default 0,
  status text not null default 'open',
  filled_candidate_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists emergency_requests_event_idx on public.emergency_requests(event_id, created_at desc);

create table if not exists public.emergency_candidates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.emergency_requests(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  distance_km numeric(8,1),
  status text not null default 'delivered' check (status in ('delivered','opened','interested','quoted','declined','accepted','not_selected','expired')),
  quote_amount numeric(12,2) check (quote_amount is null or quote_amount >= 0),
  eta_minutes integer check (eta_minutes is null or eta_minutes between 0 and 2880),
  note text not null default '',
  delivered_at timestamptz not null default now(),
  opened_at timestamptz, responded_at timestamptz, accepted_at timestamptz,
  build_item_id uuid references public.build_items(id) on delete set null,
  unique (request_id, workspace_id)
);
create index if not exists emergency_candidates_ws_idx on public.emergency_candidates(workspace_id, status);
alter table public.emergency_requests enable row level security;
alter table public.emergency_candidates enable row level security;
-- Definer helpers avoid mutually recursive policies between requests and candidates.
create or replace function public.is_emergency_candidate(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.emergency_candidates c where c.request_id = p_request and public.is_workspace_member(c.workspace_id));
$$;
create or replace function public.can_access_emergency_request(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.emergency_requests r where r.id = p_request and public.can_access_event(r.event_id));
$$;
revoke all on function public.is_emergency_candidate(uuid), public.can_access_emergency_request(uuid) from public, anon;
grant execute on function public.is_emergency_candidate(uuid), public.can_access_emergency_request(uuid) to authenticated, service_role;
drop policy if exists emergency_requests_read on public.emergency_requests;
create policy emergency_requests_read on public.emergency_requests for select using (
  public.can_access_event(event_id) or public.has_admin_permission('marketplace') or public.is_emergency_candidate(id));
drop policy if exists emergency_candidates_read on public.emergency_candidates;
create policy emergency_candidates_read on public.emergency_candidates for select using (
  public.is_workspace_member(workspace_id) or public.has_admin_permission('marketplace') or public.can_access_emergency_request(request_id));

create or replace function public.save_emergency_profile(p_ws uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  if jsonb_typeof(coalesce(p->'categories', '[]')) <> 'array' or jsonb_array_length(coalesce(p->'categories', '[]')) > 14 then raise exception 'invalid_categories' using errcode = '22023'; end if;
  insert into public.emergency_provider_profiles as x (workspace_id, enabled, categories, base_lat, base_lng, radius_km, response_minutes, surcharge_pct, rate_notes, available_now, available_until, updated_by, updated_at)
  values (p_ws, coalesce((p->>'enabled')::boolean, false), array(select jsonb_array_elements_text(coalesce(p->'categories', '[]'))),
    nullif(p->>'base_lat', '')::float8, nullif(p->>'base_lng', '')::float8, coalesce(nullif(p->>'radius_km', '')::int, 40), coalesce(nullif(p->>'response_minutes', '')::int, 60),
    coalesce(nullif(p->>'surcharge_pct', '')::int, 0), left(coalesce(p->>'rate_notes', ''), 1000), coalesce((p->>'available_now')::boolean, false),
    nullif(p->>'available_until', '')::timestamptz, auth.uid(), now())
  on conflict (workspace_id) do update set enabled = excluded.enabled, categories = excluded.categories, base_lat = excluded.base_lat, base_lng = excluded.base_lng,
    radius_km = excluded.radius_km, response_minutes = excluded.response_minutes, surcharge_pct = excluded.surcharge_pct, rate_notes = excluded.rate_notes,
    available_now = excluded.available_now, available_until = excluded.available_until, updated_by = auth.uid(), updated_at = now();
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', p_ws, 'emergency.profile_saved', jsonb_build_object('enabled', p->'enabled'));
end $$;

-- Controlled matching pool (§37): opted-in, currently available, in range, category match. Never a platform-wide broadcast.
create or replace function public.emergency_match(p_request uuid, p_limit integer default 8)
returns table(workspace_id uuid, listing_id uuid, distance_km numeric)
language sql stable security definer set search_path = '' as $$
  with r as (select * from public.emergency_requests where id = p_request),
  failed as (select public.listing_workspace(b.listing_id) ws from r join public.build_items b on b.id = r.original_item_id)
  select p.workspace_id, best.id, round(best.d::numeric, 1)
  from r, public.emergency_provider_profiles p
  join public.workspaces w on w.id = p.workspace_id and w.kind = 'provider' and coalesce(w.status, 'active') = 'active'
  cross join lateral (
    select l.id, case when r.lat is null or coalesce(l.lat, p.base_lat) is null then null else
      6371 * 2 * asin(sqrt(power(sin(radians(coalesce(l.lat, p.base_lat) - r.lat) / 2), 2) + cos(radians(r.lat)) * cos(radians(coalesce(l.lat, p.base_lat)))
        * power(sin(radians(coalesce(l.lng, p.base_lng) - r.lng) / 2), 2))) end d
    from public.listings l
    where l.workspace_id = p.workspace_id and l.published and l.emergency_supply and l.paused_at is null
      and coalesce(l.review_status, 'approved') not in ('restricted','suspended','rejected')
    order by (lower(coalesce(l.category, '')) = lower(r.category) or (r.category = 'venue' and l.kind = 'venue')) desc, l.rating desc nulls last
    limit 1) best
  where p.enabled and r.category = any(p.categories) and (p.available_now or p.available_until > now())
    and p.workspace_id not in (select ws from failed where ws is not null)
    and (best.d is null or best.d <= p.radius_km)
  order by best.d nulls last, p.response_minutes
  limit greatest(1, least(coalesce(p_limit, 8), 12));
$$;

create or replace function public.create_emergency_request(p_event uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare rid uuid; n integer; c record; e public.events; orig public.build_items;
begin
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event;
  if (p->>'required_arrival') is null or (p->>'required_arrival')::timestamptz < now() - interval '15 minutes' then raise exception 'invalid_arrival' using errcode = '22023'; end if;
  if (p->>'original_item_id') is not null then
    select * into orig from public.build_items where id = (p->>'original_item_id')::uuid and event_id = p_event;
    if not found then raise exception 'invalid_original' using errcode = '22023'; end if;
  end if;
  if exists (select 1 from public.emergency_requests where event_id = p_event and created_at > now() - interval '1 hour' group by event_id having count(*) >= 5) then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into public.emergency_requests(event_id, created_by, severity, category, required_arrival, location, lat, lng, original_item_id, failure_reason, scope, budget_max, status)
  values (p_event, auth.uid(), coalesce(p->>'severity', 'high'), lower(p->>'category'), (p->>'required_arrival')::timestamptz,
    left(coalesce(nullif(p->>'location', ''), e.venue_name, e.location, ''), 300),
    coalesce(nullif(p->>'lat', '')::float8, (select v.lat from public.listings v where v.id = e.venue_listing_id)),
    coalesce(nullif(p->>'lng', '')::float8, (select v.lng from public.listings v where v.id = e.venue_listing_id)),
    orig.id, left(coalesce(p->>'failure_reason', ''), 1000), left(coalesce(p->>'scope', ''), 2000), nullif(p->>'budget_max', '')::numeric, 'open')
  returning id into rid;
  insert into public.emergency_candidates(request_id, workspace_id, listing_id, distance_km)
    select rid, m.workspace_id, m.listing_id, m.distance_km from public.emergency_match(rid, coalesce(nullif(p->>'pool', '')::int, 8)) m;
  get diagnostics n = row_count;
  update public.emergency_requests set pool_size = n, status = case when n > 0 then 'matching' else 'open' end where id = rid;
  for c in select workspace_id from public.emergency_candidates where request_id = rid loop
    perform public.notify_workspace(c.workspace_id, array['owner','manager','member'], 'provider.request', 'Emergency request: ' || lower(p->>'category'),
      'Needed by ' || to_char((p->>'required_arrival')::timestamptz at time zone 'Europe/London', 'Dy DD Mon HH24:MI') || '. Respond fast to be considered.', '/provider/emergency/' || rid);
  end loop;
  if orig.id is not null and orig.status = 'confirmed' then update public.build_items set status = 'replacement_required', updated_at = now() where id = orig.id; end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'emergency.created', jsonb_build_object('request_id', rid, 'pool', n, 'category', p->>'category'));
  return rid;
end $$;

create or replace function public.provider_emergency_respond(p_candidate uuid, p_action text, p_quote numeric default null, p_eta integer default null, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare c public.emergency_candidates; r public.emergency_requests;
begin
  select * into c from public.emergency_candidates where id = p_candidate for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(c.workspace_id, array['owner','manager','member']);
  select * into r from public.emergency_requests where id = c.request_id;
  if p_action = 'open' then
    update public.emergency_candidates set opened_at = coalesce(opened_at, now()), status = case when status = 'delivered' then 'opened' else status end where id = c.id;
    return;
  end if;
  if r.status not in ('open','matching') or c.status not in ('delivered','opened','interested','quoted') then raise exception 'not_open' using errcode = '22023'; end if;
  if p_action = 'decline' then
    update public.emergency_candidates set status = 'declined', responded_at = now(), note = left(coalesce(p_note, ''), 1000) where id = c.id;
  elsif p_action in ('interested','quote') then
    if p_action = 'quote' and (p_quote is null or p_quote <= 0) then raise exception 'invalid_quote' using errcode = '22023'; end if;
    update public.emergency_candidates set status = case when p_action = 'quote' then 'quoted' else 'interested' end, quote_amount = coalesce(round(p_quote, 2), quote_amount),
      eta_minutes = coalesce(p_eta, eta_minutes), note = left(coalesce(p_note, ''), 1000), responded_at = now(), opened_at = coalesce(opened_at, now()) where id = c.id;
    perform public.notify_event(r.event_id, 'quote_received', 'Emergency response received',
      case when p_action = 'quote' then 'A provider quoted £' || round(p_quote, 2) || ' for ' || r.category || '.' else 'A provider is interested in your ' || r.category || ' request.' end,
      public.event_path(r.event_id, 'emergency', r.id));
  else raise exception 'invalid_action' using errcode = '22023';
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', c.workspace_id, 'emergency.' || p_action, jsonb_build_object('candidate_id', c.id, 'request_id', r.id));
end $$;

-- Organizer accepts one quoted candidate: creates a quoted booking line (confirmed and paid through the normal flow) and closes the pool.
create or replace function public.accept_emergency_candidate(p_candidate uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.emergency_candidates; r public.emergency_requests; l public.listings; bid uuid;
begin
  select * into c from public.emergency_candidates where id = p_candidate for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into r from public.emergency_requests where id = c.request_id for update;
  if not public.can_edit_event(r.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if r.status not in ('open','matching') then raise exception 'request_closed' using errcode = '22023'; end if;
  if c.status <> 'quoted' or c.quote_amount is null then raise exception 'not_quoted' using errcode = '22023'; end if;
  select * into l from public.listings where id = c.listing_id;
  insert into public.build_items(event_id, listing_id, category, title, package, scope, image, amount, price_basis, status, role, terms_snapshot, notes, sort)
    values (r.event_id, c.listing_id, r.category, coalesce(l.name, 'Emergency supplier'), 'Emergency supply', left(r.scope, 500), l.image, c.quote_amount, 'fixed', 'draft', 'primary',
      jsonb_build_object('source', 'emergency', 'emergency_request', r.id, 'amount', c.quote_amount, 'eta_minutes', c.eta_minutes, 'accepted_at', now()), left(c.note, 2000), 90)
    returning id into bid;
  update public.build_items set status = 'quoted', updated_at = now() where id = bid; -- organiser confirms and pays through the normal booking flow
  update public.emergency_candidates set status = 'accepted', accepted_at = now(), build_item_id = bid where id = c.id;
  update public.emergency_candidates set status = 'not_selected' where request_id = r.id and id <> c.id and status in ('delivered','opened','interested','quoted');
  update public.emergency_requests set status = 'filled', filled_candidate_id = c.id, updated_at = now() where id = r.id;
  perform public.notify_workspace(c.workspace_id, array['owner','manager','member'], 'booking_confirmed', 'Emergency booking accepted',
    'The organiser accepted your quote of £' || c.quote_amount || '. Confirm and head out.', '/provider/opportunities/' || bid);
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'emergency.accepted', jsonb_build_object('request_id', r.id, 'candidate_id', c.id, 'build_item_id', bid));
  return bid;
end $$;

create or replace function public.cancel_emergency_request(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.emergency_requests;
begin
  select * into r from public.emergency_requests where id = p_request for update;
  if not found or not public.can_edit_event(r.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if r.status not in ('open','matching') then raise exception 'request_closed' using errcode = '22023'; end if;
  update public.emergency_requests set status = 'cancelled', updated_at = now() where id = r.id;
  update public.emergency_candidates set status = 'expired' where request_id = r.id and status in ('delivered','opened','interested','quoted');
end $$;

-- ───────────────────────── §44 booking disputes (operational) ─────────────────────────
create table if not exists public.booking_disputes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('DS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  build_item_id uuid not null references public.build_items(id) on delete restrict,
  provider_job_id uuid references public.provider_jobs(id) on delete set null,
  event_id uuid not null references public.events(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  opened_by uuid references auth.users(id),
  opened_by_party text not null check (opened_by_party in ('customer','provider')),
  reason text not null check (reason in ('service_not_delivered','materially_different','provider_cancellation','cancellation_disagreement','damage','late_arrival','partial_service','venue_issue','other')),
  summary text not null check (length(summary) between 10 and 4000),
  amount_claimed numeric(12,2) check (amount_claimed is null or amount_claimed >= 0),
  status text not null default 'opened',
  item_status_at_open text not null,
  terms_snapshot jsonb not null default '{}',
  payment_snapshot jsonb not null default '{}',
  response_due_at timestamptz not null default now() + interval '72 hours',
  resolution jsonb,
  customer_accepted_at timestamptz, provider_accepted_at timestamptz,
  assignee_id uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists booking_disputes_one_open on public.booking_disputes(build_item_id) where status not in ('resolved');
create table if not exists public.booking_dispute_entries (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.booking_disputes(id) on delete cascade,
  author_id uuid references auth.users(id),
  party text not null check (party in ('customer','provider','admin','system')),
  kind text not null check (kind in ('statement','evidence','proposal','decision','status')),
  body text not null default '' check (length(body) <= 6000),
  files jsonb not null default '[]',
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists booking_dispute_entries_idx on public.booking_dispute_entries(dispute_id, created_at);
alter table public.booking_disputes enable row level security;
alter table public.booking_dispute_entries enable row level security;
drop policy if exists booking_disputes_read on public.booking_disputes;
create policy booking_disputes_read on public.booking_disputes for select using (
  public.can_access_event(event_id) or public.is_workspace_member(workspace_id) or public.has_admin_permission('support') or public.has_admin_permission('marketplace'));
drop policy if exists booking_dispute_entries_read on public.booking_dispute_entries;
create policy booking_dispute_entries_read on public.booking_dispute_entries for select using (
  public.has_admin_permission('support') or public.has_admin_permission('marketplace') or (not internal and exists (select 1 from public.booking_disputes d where d.id = dispute_id
    and (public.can_access_event(d.event_id) or public.is_workspace_member(d.workspace_id)))));

create or replace function public.dispute_party(d public.booking_disputes) returns text
language sql stable security definer set search_path = '' as $$
  select case when public.has_workspace_role(d.workspace_id, array['owner','manager']) then 'provider'
    when public.can_edit_event(d.event_id) then 'customer' else null end;
$$;

create or replace function public.open_booking_dispute(p_item uuid, p_reason text, p_summary text, p_amount numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.build_items; ws uuid; party text; did uuid; j public.provider_jobs;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or b.listing_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  ws := public.listing_workspace(b.listing_id);
  party := case when public.has_workspace_role(ws, array['owner','manager']) then 'provider' when public.can_edit_event(b.event_id) then 'customer' end;
  if party is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if b.status not in ('confirmed','active','fulfilled','completion_pending','completed','cancelled','cancelled_by_customer','cancelled_by_provider','partially_refunded') then
    raise exception 'not_disputable:%', b.status using errcode = '22023';
  end if;
  select * into j from public.provider_jobs where build_item_id = b.id order by created_at desc limit 1;
  insert into public.booking_disputes(build_item_id, provider_job_id, event_id, workspace_id, opened_by, opened_by_party, reason, summary, amount_claimed, item_status_at_open,
      terms_snapshot, payment_snapshot, status)
    values (b.id, j.id, b.event_id, ws, auth.uid(), party, p_reason, trim(p_summary), p_amount, b.status, coalesce(b.terms_snapshot, '{}'),
      jsonb_build_object('amount', b.amount, 'deposit', b.deposit, 'paid_amount', j.paid_amount, 'payment_status', j.payment_status, 'captured_at', now()), 'opened')
    returning id into did;
  insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body) values (did, auth.uid(), party, 'statement', trim(p_summary));
  if b.status in ('confirmed','active','fulfilled','completion_pending','completed') then update public.build_items set status = 'disputed', updated_at = now() where id = b.id; end if;
  if party = 'customer' then
    perform public.notify_workspace(ws, array['owner','manager'], 'provider.request', 'Dispute opened on a booking', 'Respond within 72 hours with your account and evidence.', '/provider/disputes/' || did);
  else
    perform public.notify_event(b.event_id, 'provider.request', 'Your provider opened a dispute', 'Review it and add your side within 72 hours.', public.event_path(b.event_id, 'dispute', did));
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', ws, 'dispute.opened', jsonb_build_object('dispute_id', did, 'reason', p_reason, 'party', party));
  return did;
end $$;

create or replace function public.add_dispute_entry(p_dispute uuid, p_kind text, p_body text, p_files jsonb default '[]')
returns void language plpgsql security definer set search_path = '' as $$
declare d public.booking_disputes; party text;
begin
  select * into d from public.booking_disputes where id = p_dispute for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  party := public.dispute_party(d);
  if party is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if d.status in ('resolved','escalated') then raise exception 'dispute_closed' using errcode = '22023'; end if;
  if p_kind not in ('statement','evidence') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_files, '[]')) <> 'array' or jsonb_array_length(coalesce(p_files, '[]')) > 10 then raise exception 'invalid_files' using errcode = '22023'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 and jsonb_array_length(coalesce(p_files, '[]')) = 0 then raise exception 'empty_entry' using errcode = '22023'; end if;
  -- Evidence must be the author's own private upload: blocks attaching (and so exfiltrating) someone else's file path.
  if exists (select 1 from jsonb_array_elements(coalesce(p_files, '[]')) f
             where coalesce(f->>'path', '') !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(png|jpe?g|webp|pdf)$')) then
    raise exception 'invalid_files' using errcode = '22023';
  end if;
  insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body, files) values (d.id, auth.uid(), party, p_kind, left(trim(coalesce(p_body, '')), 6000), coalesce(p_files, '[]'));
  update public.booking_disputes set status = case
      when status = 'opened' then 'evidence_collection'
      when status = 'evidence_collection' and party <> opened_by_party then 'provider_response'
      else status end, updated_at = now() where id = d.id;
end $$;

-- Platform review/mediation (admin). Resolution proposals need acceptance by both parties unless decided on escalation.
create or replace function public.admin_dispute_update(p_dispute uuid, p_status text, p_note text, p_resolution jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.booking_disputes;
begin
  if not (public.has_admin_permission('support') or public.has_admin_permission('marketplace')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into d from public.booking_disputes where id = p_dispute for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_status = 'resolution_proposed' and p_resolution is null then raise exception 'resolution_required' using errcode = '22023'; end if;
  update public.booking_disputes set status = p_status, resolution = coalesce(p_resolution, resolution), assignee_id = coalesce(assignee_id, auth.uid()),
    customer_accepted_at = case when p_status = 'resolution_proposed' then null else customer_accepted_at end,
    provider_accepted_at = case when p_status = 'resolution_proposed' then null else provider_accepted_at end,
    resolved_at = case when p_status = 'resolved' then now() end, updated_at = now() where id = d.id;
  insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body) values (d.id, auth.uid(), 'admin', case when p_resolution is not null then 'proposal' else 'status' end, left(p_note, 6000));
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', d.workspace_id, 'dispute.' || p_status, jsonb_build_object('dispute_id', d.id, 'note', left(p_note, 500)));
  perform public.notify_workspace(d.workspace_id, array['owner','manager'], 'provider.request', 'Dispute update: ' || replace(p_status, '_', ' '), left(p_note, 300), '/provider/disputes/' || d.id);
  perform public.notify_event(d.event_id, 'provider.request', 'Dispute update: ' || replace(p_status, '_', ' '), left(p_note, 300), public.event_path(d.event_id, 'dispute', d.id));
end $$;

create or replace function public.accept_dispute_resolution(p_dispute uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare d public.booking_disputes; party text;
begin
  select * into d from public.booking_disputes where id = p_dispute for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  party := public.dispute_party(d);
  if party is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if d.status <> 'resolution_proposed' then raise exception 'no_proposal' using errcode = '22023'; end if;
  update public.booking_disputes set customer_accepted_at = case when party = 'customer' then now() else customer_accepted_at end,
    provider_accepted_at = case when party = 'provider' then now() else provider_accepted_at end, updated_at = now() where id = d.id returning * into d;
  insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body) values (d.id, auth.uid(), party, 'decision', 'Accepted the proposed resolution.');
  if d.customer_accepted_at is not null and d.provider_accepted_at is not null then
    update public.booking_disputes set status = 'resolved', resolved_at = now(), updated_at = now() where id = d.id;
    return 'resolved';
  end if;
  return 'accepted';
end $$;

-- ───────────────────────── §44 card chargebacks (Stripe-authoritative) ─────────────────────────
create table if not exists public.stripe_disputes (
  stripe_dispute_id text primary key,
  charge_id text, payment_intent_id text,
  amount_minor bigint not null, currency text not null,
  reason text, status text not null,
  evidence_due_by timestamptz,
  livemode boolean not null default false,
  order_ref text,
  build_item_id uuid references public.build_items(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  evidence_submitted_at timestamptz,
  outcome text,
  is_charge_refundable boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stripe_disputes_status_idx on public.stripe_disputes(status, evidence_due_by);
alter table public.stripe_disputes enable row level security;
drop policy if exists stripe_disputes_admin on public.stripe_disputes;
create policy stripe_disputes_admin on public.stripe_disputes for select using (public.has_admin_permission('commerce') or public.has_admin_permission('support')
  or (event_id is not null and public.can_see_event_money(event_id)));

-- ───────────────────────── §45 cancellation engine ─────────────────────────
create table if not exists public.booking_cancellations (
  id uuid primary key default gen_random_uuid(),
  build_item_id uuid not null references public.build_items(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  requested_by uuid references auth.users(id),
  party text not null check (party in ('customer','provider','mutual','platform')),
  kind text not null check (kind in ('full','partial','reschedule','force_majeure')),
  reason text not null check (length(reason) between 5 and 2000),
  item_status_before text not null,
  policy_snapshot jsonb not null,
  calculation jsonb not null,
  status text not null default 'requested',
  requires_review boolean not null default false,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists booking_cancellations_one_open on public.booking_cancellations(build_item_id) where status in ('requested','manual_review');
alter table public.booking_cancellations enable row level security;
drop policy if exists booking_cancellations_read on public.booking_cancellations;
create policy booking_cancellations_read on public.booking_cancellations for select using (
  public.can_access_event(event_id) or public.is_workspace_member(workspace_id) or public.has_admin_permission('support') or public.has_admin_permission('commerce'));

-- Pure policy calculation (§45). Policy shape (terms_snapshot.cancellation, quote terms or listing details):
-- {"tiers":[{"days_before":30,"refund_pct":100},{"days_before":14,"refund_pct":50},{"days_before":0,"refund_pct":0}],
--  "deposit_refundable":false, "nonrecoverable":0}
-- No policy on record → manual review, never a blanket forfeit.
create or replace function public.cancellation_quote(p_item uuid, p_party text, p_kind text, p_at timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare b public.build_items; e public.events; j public.provider_jobs; pol jsonb; t jsonb; days numeric; pct numeric := null; paid numeric; total numeric;
  dep numeric; nonrec numeric; refund numeric; retain numeric; review boolean := false; notes text[] := '{}';
begin
  select * into b from public.build_items where id = p_item;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into e from public.events where id = b.event_id;
  select * into j from public.provider_jobs where build_item_id = b.id order by created_at desc limit 1;
  pol := coalesce(b.terms_snapshot->'cancellation',
    (select q.terms->'cancellation' from public.provider_quotes q where q.build_item_id = b.id and q.status in ('accepted','sent','viewed') order by q.version desc limit 1),
    (select l.details->'cancellation' from public.listings l where l.id = b.listing_id));
  if jsonb_typeof(pol) is distinct from 'object' then pol := null; end if;
  total := coalesce(b.amount, 0);
  paid := coalesce(j.paid_amount, case when b.status in ('confirmed','active','fulfilled') then coalesce(b.deposit, 0) else 0 end, 0);
  dep := least(coalesce(b.deposit, 0), paid);
  days := case when e.starts_at is null then null else extract(epoch from (e.starts_at - p_at)) / 86400 end;
  nonrec := least(paid, greatest(coalesce((pol->>'nonrecoverable')::numeric, 0), 0));
  if p_party = 'provider' then
    refund := paid; pct := 100; notes := notes || 'Provider cancellation: the customer is refunded in full.'::text;
  elsif p_kind = 'force_majeure' or p_party = 'platform' then
    review := true; refund := null; notes := notes || 'Force majeure or platform cancellation is decided by Gala Dock review.'::text;
  elsif p_kind = 'reschedule' then
    refund := 0; pct := null; notes := notes || 'Reschedule keeps the booking value; the provider must agree the new date.'::text;
  elsif pol is null or jsonb_typeof(pol->'tiers') <> 'array' then
    review := true; refund := null; notes := notes || 'No cancellation policy on record, so this needs review rather than an automatic forfeit.'::text;
  else
    for t in select x from jsonb_array_elements(pol->'tiers') x order by (x->>'days_before')::numeric desc loop
      if days is not null and days >= (t->>'days_before')::numeric then pct := greatest(least((t->>'refund_pct')::numeric, 100), 0); exit; end if;
    end loop;
    pct := coalesce(pct, 0);
    refund := round((paid - case when coalesce((pol->>'deposit_refundable')::boolean, true) then 0 else dep end - nonrec) * pct / 100.0, 2);
    refund := greatest(refund, 0);
    if p_party = 'mutual' then notes := notes || 'Mutual cancellation: the amounts shown apply unless both sides agree otherwise.'::text; review := false; end if;
  end if;
  if p_kind = 'partial' then review := true; notes := notes || 'Partial cancellations are agreed with the provider before any refund.'::text; end if;
  retain := case when refund is null then null else paid - refund end;
  return jsonb_build_object('paid', paid, 'total', total, 'deposit', dep, 'nonrecoverable', nonrec, 'days_before_event', round(days, 1),
    'refund_pct', pct, 'refund_amount', refund, 'provider_retains', retain, 'requires_review', review, 'policy', pol, 'notes', to_jsonb(notes),
    'event_within_72h', days is not null and days < 3);
end $$;

create or replace function public.request_cancellation(p_item uuid, p_party text, p_kind text, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.build_items; ws uuid; actor text; calc jsonb; cid uuid; st text;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or b.listing_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  ws := public.listing_workspace(b.listing_id);
  actor := case when public.has_workspace_role(ws, array['owner','manager']) then 'provider' when public.can_edit_event(b.event_id) then 'customer' end;
  if actor is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_party not in ('customer','provider','mutual') or (p_party in ('customer','provider') and p_party <> actor) then raise exception 'invalid_party' using errcode = '22023'; end if;
  if b.status not in ('confirmed','held','conditionally_held','awaiting_payment','awaiting_confirmation','active','standby_accepted') then raise exception 'not_cancellable:%', b.status using errcode = '22023'; end if;
  calc := public.cancellation_quote(b.id, p_party, p_kind);
  st := case
    when (calc->>'requires_review')::boolean then 'manual_review'
    when p_party = 'provider' and p_kind = 'full' then 'accepted'
    when p_party = 'customer' and p_kind = 'full' then 'accepted'
    else 'requested' end;
  insert into public.booking_cancellations(build_item_id, event_id, workspace_id, requested_by, party, kind, reason, item_status_before, policy_snapshot, calculation, status, requires_review)
    values (b.id, b.event_id, ws, auth.uid(), p_party, p_kind, trim(p_reason), b.status, coalesce(calc->'policy', 'null'), calc, 'requested', (calc->>'requires_review')::boolean)
    returning id into cid;
  if st <> 'requested' then update public.booking_cancellations set status = st, updated_at = now() where id = cid; end if;
  if st = 'accepted' then perform public.apply_cancellation(cid); else
    update public.build_items set status = 'cancellation_requested', updated_at = now() where id = b.id and status in ('confirmed','active');
  end if;
  if st = 'manual_review' then
    insert into public.support_cases(reference, subject, category, priority, status, requester_id, workspace_id, sla_due_at, related, amount)
      values ('SC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), 'Cancellation review: ' || b.title, 'refund',
        case when (calc->>'event_within_72h')::boolean then 'urgent' else 'high' end, 'open', auth.uid(), ws, now() + interval '24 hours',
        jsonb_build_object('cancellation_id', cid, 'build_item_id', b.id, 'event_id', b.event_id), (calc->>'paid')::numeric);
  end if;
  perform case when actor = 'customer'
    then public.notify_workspace(ws, array['owner','manager'], 'provider.request', 'Cancellation ' || case when st = 'accepted' then 'confirmed' else 'requested' end, left(p_reason, 300), '/provider/opportunities/' || b.id)
    else public.notify_event(b.event_id, 'provider.request', 'Your provider ' || case when st = 'accepted' then 'cancelled' else 'requested a cancellation' end, left(p_reason, 300), public.event_path(b.event_id, 'booking', b.id)) end;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', ws, 'cancellation.requested', jsonb_build_object('cancellation_id', cid, 'party', p_party, 'kind', p_kind, 'status', st, 'refund', calc->'refund_amount'));
  return cid;
end $$;

-- Applies consequences once a cancellation is accepted (§45): status, reliability, backup surfacing, refund due record.
create or replace function public.apply_cancellation(p_cancellation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.booking_cancellations; b public.build_items;
begin
  select * into c from public.booking_cancellations where id = p_cancellation for update;
  if c.status <> 'accepted' then raise exception 'not_accepted' using errcode = '22023'; end if;
  select * into b from public.build_items where id = c.build_item_id for update;
  if c.kind = 'reschedule' then
    update public.build_items set status = 'confirmed', updated_at = now() where id = b.id and status = 'cancellation_requested';
    update public.booking_cancellations set status = 'completed', updated_at = now() where id = c.id;
    return;
  end if;
  update public.build_items set status = case when c.party = 'provider' then 'cancelled_by_provider' else 'cancelled_by_customer' end, hold_expires_at = null,
    terms_snapshot = coalesce(terms_snapshot, '{}') || jsonb_build_object('cancellation_outcome', c.calculation, 'cancelled_at', now()), updated_at = now() where id = b.id;
  update public.provider_jobs set status = case when c.party = 'provider' then 'cancelled_by_provider' else 'cancelled_by_customer' end
    where build_item_id = b.id and status not in ('completed','cancelled','cancelled_by_customer','cancelled_by_provider');
  if c.party = 'provider' then
    update public.build_items set status = 'replacement_required', updated_at = now() where id = b.id;
    perform public.notify_event(c.event_id, 'provider.request', 'Replacement needed: ' || b.title,
      'Your provider cancelled. Activate a standby, pick a backup, or start an Emergency Supply request.', public.event_path(c.event_id, 'booking', b.id));
  end if;
  update public.booking_cancellations set status = 'completed', decided_at = coalesce(decided_at, now()), updated_at = now() where id = c.id;
  if c.party = 'provider' then perform public.recompute_reliability(c.workspace_id); end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), case when auth.uid() is null then 'system' else 'user' end, c.workspace_id, 'cancellation.applied',
      jsonb_build_object('cancellation_id', c.id, 'refund_amount', c.calculation->'refund_amount'));
end $$;

-- Counterparty (mutual/partial/reschedule) or admin (manual review) decision.
create or replace function public.decide_cancellation(p_cancellation uuid, p_accept boolean, p_note text default '', p_refund numeric default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.booking_cancellations; actor text; is_admin boolean;
begin
  select * into c from public.booking_cancellations where id = p_cancellation for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  is_admin := public.has_admin_permission('support') or public.has_admin_permission('commerce');
  actor := case when public.has_workspace_role(c.workspace_id, array['owner','manager']) then 'provider' when public.can_edit_event(c.event_id) then 'customer' end;
  if c.status = 'manual_review' and not is_admin then raise exception 'admin_review_required' using errcode = '42501'; end if;
  if is_admin and actor is null and length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  if c.status = 'requested' and (actor is null or (c.party = actor) or (c.party = 'mutual' and c.requested_by = auth.uid())) and not is_admin then raise exception 'not_authorized' using errcode = '42501'; end if;
  if c.status not in ('requested','manual_review') then raise exception 'not_open:%', c.status using errcode = '22023'; end if;
  if p_refund is not null and (not is_admin or p_refund < 0 or p_refund > coalesce((c.calculation->>'paid')::numeric, 0)) then raise exception 'invalid_refund' using errcode = '22023'; end if;
  update public.booking_cancellations set status = case when p_accept then 'accepted' else 'rejected' end, decided_by = auth.uid(), decided_at = now(),
    decision_note = left(coalesce(p_note, ''), 1000),
    calculation = case when p_refund is not null then calculation || jsonb_build_object('refund_amount', p_refund, 'provider_retains', (calculation->>'paid')::numeric - p_refund, 'decided_by_review', true) else calculation end,
    updated_at = now() where id = c.id;
  if p_accept then perform public.apply_cancellation(c.id);
  else update public.build_items set status = c.item_status_before, updated_at = now() where id = c.build_item_id and status = 'cancellation_requested';
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), case when is_admin and actor is null then 'admin' else 'user' end, c.workspace_id, 'cancellation.' || case when p_accept then 'accepted' else 'rejected' end,
      jsonb_build_object('cancellation_id', c.id, 'refund', p_refund));
end $$;

-- ───────────────────────── reliability (§32) now counts no-response, provider cancellations and disputes ─────────────────────────
create or replace function public.recompute_reliability(p_workspace uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare since timestamptz := now() - interval '180 days';
begin
  insert into public.reliability_metrics as r (workspace_id, requests_received, requests_responded, median_response_minutes, quotes_sent, bookings_confirmed, bookings_completed,
    provider_cancellations, disputes, verified_reviews, verified_rating, computed_at)
  select p_workspace,
    (select count(*) from public.build_items b join public.listings l on l.id = b.listing_id where l.workspace_id = p_workspace and coalesce(b.sent_at, b.created_at) > since and b.status not in ('suggested','draft')
       and coalesce(b.response_status, 'x') <> 'pending'),
    (select count(*) from public.build_items b join public.listings l on l.id = b.listing_id where l.workspace_id = p_workspace and coalesce(b.sent_at, b.created_at) > since
       and (b.response_status = 'responded' or (b.response_status is null and b.status not in ('suggested','draft','sent','awaiting','expired','expired_no_response')))),
    (select percentile_cont(0.5) within group (order by extract(epoch from (b.responded_at - b.sent_at)) / 60)::int from public.build_items b join public.listings l on l.id = b.listing_id
       where l.workspace_id = p_workspace and b.sent_at > since and b.responded_at is not null),
    (select count(*) from public.provider_quotes q where q.workspace_id = p_workspace and q.sent_at > since),
    (select count(*) from public.provider_jobs j where j.workspace_id = p_workspace and j.created_at > since and j.status in ('confirmed','active','completed')),
    (select count(*) from public.provider_jobs j where j.workspace_id = p_workspace and j.created_at > since and j.status = 'completed'),
    (select count(*) from public.booking_cancellations c where c.workspace_id = p_workspace and c.created_at > since and c.party = 'provider' and c.status = 'completed'),
    (select count(*) from public.booking_disputes d where d.workspace_id = p_workspace and d.created_at > since and d.opened_by_party = 'customer'),
    (select count(*) from public.reviews v join public.listings l on l.id = v.listing_id where l.workspace_id = p_workspace and v.build_item_id is not null and v.status = 'published'),
    (select round(avg(v.rating)::numeric, 2) from public.reviews v join public.listings l on l.id = v.listing_id where l.workspace_id = p_workspace and v.build_item_id is not null and v.status = 'published'),
    now()
  on conflict (workspace_id) do update set requests_received = excluded.requests_received, requests_responded = excluded.requests_responded,
    median_response_minutes = excluded.median_response_minutes, quotes_sent = excluded.quotes_sent, bookings_confirmed = excluded.bookings_confirmed,
    bookings_completed = excluded.bookings_completed, provider_cancellations = excluded.provider_cancellations, disputes = excluded.disputes,
    verified_reviews = excluded.verified_reviews, verified_rating = excluded.verified_rating, computed_at = now();
end $$;

-- ───────────────────────── scheduled sweep (pg_cron, every 5 minutes) ─────────────────────────
create or replace function public.marketplace_sweep() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; n_rem integer := 0; n_exp integer := 0; n_hold integer := 0; n_sb integer := 0; n_em integer := 0; n_ds integer := 0; ws_set uuid[] := '{}';
begin
  -- §34 escalating reminders: at half the window, then in the final hour (or final quarter for short windows).
  for r in select b.id, b.title, b.response_deadline, b.response_reminders, l.workspace_id,
             case when b.response_reminders = 0 and now() >= b.sent_at + (b.response_deadline - b.sent_at) / 2 then 1
                  when b.response_reminders <= 1 and b.response_deadline - now() <= least(interval '1 hour', (b.response_deadline - b.sent_at) / 4) then 2 end lvl
           from public.build_items b join public.listings l on l.id = b.listing_id
           where b.response_status = 'pending' and b.status in ('sent','awaiting','awaiting_provider') and b.response_deadline > now() and b.sent_at is not null loop
    continue when r.lvl is null;
    perform public.notify_workspace(r.workspace_id, array['owner','manager','member'], 'request_received',
      case when r.lvl = 2 then 'Response due soon: ' else 'Reminder: respond to ' end || r.title,
      'Respond by ' || to_char(r.response_deadline at time zone 'Europe/London', 'Dy DD Mon HH24:MI') || '. Missed deadlines affect your reliability.', '/provider/opportunities/' || r.id);
    update public.build_items set response_reminders = r.lvl where id = r.id;
    n_rem := n_rem + 1;
  end loop;
  -- Expired / No response — distinct from Declined and Unavailable (§33).
  for r in select b.id, b.event_id, b.title, l.workspace_id from public.build_items b join public.listings l on l.id = b.listing_id
           where b.status in ('sent','awaiting','awaiting_provider') and b.response_deadline < now() for update of b skip locked loop
    update public.build_items set status = 'expired', updated_at = now() where id = r.id;
    perform public.notify_event(r.event_id, 'request_received', 'No response: ' || r.title, 'The provider didn''t respond in time. You can resend or choose another provider.', public.event_path(r.event_id, 'booking', r.id));
    ws_set := ws_set || r.workspace_id; n_exp := n_exp + 1;
  end loop;
  -- Hold expiry (records and legacy held lines).
  for r in select h.id, h.build_item_id, h.event_id from public.conditional_holds h where h.status in ('requested','held') and
           ((h.status = 'held' and h.expires_at < now()) or (h.status = 'requested' and h.created_at + make_interval(hours => least(h.requested_hours, 48)) < now())) for update skip locked loop
    update public.conditional_holds set status = 'expired', closed_reason = 'expired', updated_at = now() where id = r.id;
    update public.build_items set status = coalesce(status_before_hold, 'available'), hold_expires_at = null, updated_at = now()
      where id = r.build_item_id and status in ('held','conditional_hold_requested','conditionally_held');
    perform public.notify_event(r.event_id, 'hold_expiry', 'A hold expired', 'A provider hold lapsed without confirmation. The date is no longer reserved.', public.event_path(r.event_id, 'booking', r.build_item_id));
    n_hold := n_hold + 1;
  end loop;
  update public.build_items set status = 'available', hold_expires_at = null, updated_at = now() where status = 'held' and hold_expires_at < now();
  -- Standby expiry / release after the window.
  with x as (update public.standby_commitments set status = case when status = 'accepted' then 'released' else 'expired' end, updated_at = now()
    where (status in ('requested','offered') and expires_at < now()) or (status = 'accepted' and window_end < now()) returning 1) select count(*) into n_sb from x;
  -- Emergency requests lapse at the required arrival time.
  with x as (update public.emergency_requests set status = 'expired', updated_at = now() where status in ('open','matching') and required_arrival < now() returning id),
       y as (update public.emergency_candidates c set status = 'expired' from x where c.request_id = x.id and c.status in ('delivered','opened','interested','quoted') returning 1)
  select count(*) into n_em from x;
  -- Disputes move to platform review when the response window passes.
  with x as (update public.booking_disputes set status = 'review', updated_at = now() where status in ('opened','evidence_collection','provider_response') and response_due_at < now() returning 1)
  select count(*) into n_ds from x;
  for r in select distinct unnest(ws_set) ws loop perform public.recompute_reliability(r.ws); end loop;
  return jsonb_build_object('reminders', n_rem, 'expired_requests', n_exp, 'expired_holds', n_hold, 'standby', n_sb, 'emergency', n_em, 'disputes_to_review', n_ds);
end $$;

-- ───────────────────────── grants ─────────────────────────
revoke all on function public.marketplace_sweep(), public.build_item_response_track(), public.build_item_hold_sync(), public.conditional_hold_dependency_notify(),
  public.build_item_primary_failed(), public.apply_cancellation(uuid), public.emergency_match(uuid, integer), public.dispute_party(public.booking_disputes)
  from public, anon, authenticated;
grant execute on function public.marketplace_sweep(), public.apply_cancellation(uuid), public.emergency_match(uuid, integer) to service_role;
revoke all on function public.request_conditional_hold(uuid, integer, uuid, text), public.provider_respond_hold(uuid, boolean, integer, text), public.release_conditional_hold(uuid, text),
  public.request_standby(uuid, uuid, timestamptz, timestamptz, text), public.provider_offer_standby(uuid, numeric, numeric, integer, text), public.provider_decline_standby(uuid, text),
  public.accept_standby(uuid), public.activate_standby(uuid, text), public.release_standby(uuid), public.save_emergency_profile(uuid, jsonb), public.create_emergency_request(uuid, jsonb),
  public.provider_emergency_respond(uuid, text, numeric, integer, text), public.accept_emergency_candidate(uuid), public.cancel_emergency_request(uuid),
  public.open_booking_dispute(uuid, text, text, numeric), public.add_dispute_entry(uuid, text, text, jsonb), public.admin_dispute_update(uuid, text, text, jsonb),
  public.accept_dispute_resolution(uuid), public.cancellation_quote(uuid, text, text, timestamptz), public.request_cancellation(uuid, text, text, text),
  public.decide_cancellation(uuid, boolean, text, numeric) from public, anon;
grant execute on function public.request_conditional_hold(uuid, integer, uuid, text), public.provider_respond_hold(uuid, boolean, integer, text), public.release_conditional_hold(uuid, text),
  public.request_standby(uuid, uuid, timestamptz, timestamptz, text), public.provider_offer_standby(uuid, numeric, numeric, integer, text), public.provider_decline_standby(uuid, text),
  public.accept_standby(uuid), public.activate_standby(uuid, text), public.release_standby(uuid), public.save_emergency_profile(uuid, jsonb), public.create_emergency_request(uuid, jsonb),
  public.provider_emergency_respond(uuid, text, numeric, integer, text), public.accept_emergency_candidate(uuid), public.cancel_emergency_request(uuid),
  public.open_booking_dispute(uuid, text, text, numeric), public.add_dispute_entry(uuid, text, text, jsonb), public.admin_dispute_update(uuid, text, text, jsonb),
  public.accept_dispute_resolution(uuid), public.cancellation_quote(uuid, text, text, timestamptz), public.request_cancellation(uuid, text, text, text),
  public.decide_cancellation(uuid, boolean, text, numeric) to authenticated, service_role;

grant select on public.conditional_holds, public.standby_commitments, public.emergency_provider_profiles, public.emergency_requests, public.emergency_candidates,
  public.booking_disputes, public.booking_dispute_entries, public.stripe_disputes, public.booking_cancellations to authenticated;
grant all on public.conditional_holds, public.standby_commitments, public.emergency_provider_profiles, public.emergency_requests, public.emergency_candidates,
  public.booking_disputes, public.booking_dispute_entries, public.stripe_disputes, public.booking_cancellations to service_role;

commit;

-- pg_cron schedule (outside the transaction; idempotent).
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'marketplace-sweep';
select cron.schedule('marketplace-sweep', '*/5 * * * *', 'select public.marketplace_sweep()');
