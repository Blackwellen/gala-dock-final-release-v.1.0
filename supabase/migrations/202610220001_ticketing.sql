-- Phase 7 — ticketing depth (master spec §46–51; media spec §69–79): detailed scan outcomes with re-entry and session validity,
-- offline scan reconciliation, two-step transfers, waiting lists, scan manifest for offline-safe check-in.
-- Credentials: the QR carries an opaque, HMAC-signed token (rotating in the wallet, static for print) computed in the app with a
-- server-only secret; the database checks the ticket's current nonce, which rotates on transfer/resale so stale credentials fail.
begin;

alter table public.ticket_tiers add column if not exists valid_from timestamptz, add column if not exists valid_to timestamptz;   -- day/session tickets

alter table public.check_ins drop constraint if exists check_ins_result_check;
alter table public.check_ins add constraint check_ins_result_check check (result in
  ('admitted','duplicate','invalid','revoked','readmitted','refunded','transferred','resold','wrong_event','wrong_session','resale_locked'));
alter table public.check_ins
  add column if not exists device text,
  add column if not exists offline_at timestamptz,
  add column if not exists credential text check (credential in ('wallet','print','manual','legacy')),
  add column if not exists gate text;

-- Detailed scan (§51 / media §78): Valid, Already scanned, Invalid, Refunded, Transferred, Resold, Revoked, Wrong event, Wrong session.
-- Re-entry follows events.settings.reentry (true = re-admit a used ticket and log it). p_nonce must match the ticket's current nonce.
create or replace function public.scan_ticket(p_event uuid, p_ticket uuid, p_code text, p_nonce text, p_credential text, p_device text default null, p_offline_at timestamptz default null, p_gate text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare tk public.tickets; tr public.ticket_tiers; e public.events; res text; at timestamptz := coalesce(p_offline_at, now()); reentry boolean;
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_ticket is not null then select * into tk from public.tickets where id = p_ticket for update;
  else select * into tk from public.tickets where code = upper(coalesce(p_code, '')) for update; end if;
  select * into e from public.events where id = p_event;
  if not found or tk.id is null then res := 'invalid';
  elsif tk.event_id <> p_event then res := 'wrong_event';
  elsif p_nonce is not null and tk.qr_nonce is distinct from p_nonce then
    res := case tk.status when 'transferred' then 'transferred' when 'resold' then 'resold' else 'invalid' end;   -- stale credential
  elsif tk.status = 'refunded' then res := 'refunded';
  elsif tk.status = 'transferred' then res := 'transferred';
  elsif tk.status = 'resold' then res := 'resold';
  elsif tk.status = 'cancelled' then res := 'revoked';
  elsif tk.status = 'resale_listed' then res := 'resale_locked';
  else
    select * into tr from public.ticket_tiers where id = tk.tier_id;
    if (tr.valid_from is not null and at < tr.valid_from - interval '2 hours') or (tr.valid_to is not null and at > tr.valid_to) then res := 'wrong_session';
    elsif tk.status = 'used' then
      reentry := coalesce((e.settings->>'reentry')::boolean, false);
      res := case when reentry then 'readmitted' else 'duplicate' end;
    else
      update public.tickets set status = 'used', checked_in_at = at where id = tk.id;
      res := 'admitted';
    end if;
  end if;
  insert into public.check_ins(ticket_id, event_id, scanned_by, result, device, offline_at, credential, gate)
    values (tk.id, p_event, auth.uid(), res, left(p_device, 60), p_offline_at, p_credential, left(p_gate, 60));
  return jsonb_build_object('result', res, 'ticket_id', tk.id, 'code', tk.code, 'attendee', case when tk.event_id = p_event then tk.attendee_name end,
    'tier', tr.name, 'seat', case when tk.event_id = p_event then tk.seat end, 'checked_in_at', tk.checked_in_at,
    'history', (select coalesce(jsonb_agg(jsonb_build_object('result', c.result, 'at', coalesce(c.offline_at, c.created_at), 'gate', c.gate) order by c.created_at desc), '[]')
                from (select * from public.check_ins c where c.ticket_id = tk.id order by c.created_at desc limit 5) c));
end $$;

-- Offline-safe scanning (§51): a scanner downloads a manifest (no credential secrets — just identity, status and holder) and
-- validates provisionally offline; queued scans are reconciled through scan_ticket on reconnect, which re-checks the signature.
create or replace function public.scan_manifest(p_event uuid) returns table(ticket_id uuid, code text, status text, attendee text, tier text, seat text, checked_in_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, t.code, t.status, t.attendee_name, tr.name, t.seat, t.checked_in_at
  from public.tickets t left join public.ticket_tiers tr on tr.id = t.tier_id
  where t.event_id = p_event and public.can_access_event(p_event) and t.status in ('valid','used','resale_listed','refunded','transferred','resold','cancelled');
$$;

-- Attendee lookup for manual check-in (section/table/seat/name/email/code).
create or replace function public.scan_lookup(p_event uuid, p_query text) returns table(ticket_id uuid, code text, status text, attendee text, email text, tier text, seat text, checked_in_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, t.code, t.status, t.attendee_name, t.attendee_email, tr.name, t.seat, t.checked_in_at
  from public.tickets t left join public.ticket_tiers tr on tr.id = t.tier_id
  where t.event_id = p_event and public.can_access_event(p_event) and length(trim(coalesce(p_query, ''))) >= 2
    and (t.code ilike '%' || p_query || '%' or t.attendee_name ilike '%' || p_query || '%' or t.attendee_email ilike '%' || p_query || '%' or t.seat ilike '%' || p_query || '%' or tr.name ilike '%' || p_query || '%')
  order by t.attendee_name limit 25;
$$;

-- ───────────────────────── §49 two-step transfers ─────────────────────────
create table if not exists public.ticket_transfers (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  from_user uuid not null references auth.users(id),
  to_email text not null check (to_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  to_name text not null default '',
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','cancelled','expired','declined')),
  new_ticket_id uuid references public.tickets(id),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists ticket_transfers_one_pending on public.ticket_transfers(ticket_id) where status = 'pending';
alter table public.ticket_transfers enable row level security;
drop policy if exists ticket_transfers_read on public.ticket_transfers;
create policy ticket_transfers_read on public.ticket_transfers for select using (from_user = (select auth.uid())
  or lower(to_email) = lower(coalesce((select email from auth.users where id = (select auth.uid())), '')));

-- Owner offers; the plaintext token goes only in the recipient's email link (hash stored).
create or replace function public.offer_ticket_transfer(p_ticket uuid, p_email text, p_name text, p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare tk public.tickets; tid uuid;
begin
  select * into tk from public.tickets where id = p_ticket and holder_id = auth.uid() for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  if tk.status <> 'valid' then raise exception 'not_transferable' using errcode = '22023'; end if;
  if coalesce((select (settings->>'transfers')::boolean from public.events where id = tk.event_id), true) = false then raise exception 'transfers_disabled' using errcode = '22023'; end if;
  if lower(p_email) = lower(coalesce((select email from auth.users where id = auth.uid()), '')) then raise exception 'self_transfer' using errcode = '22023'; end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_token' using errcode = '22023'; end if;
  update public.ticket_transfers set status = 'cancelled', decided_at = now() where ticket_id = tk.id and status = 'pending';
  insert into public.ticket_transfers(ticket_id, from_user, to_email, to_name, token_hash) values (tk.id, auth.uid(), lower(trim(p_email)), left(trim(coalesce(p_name, '')), 120), p_token_hash) returning id into tid;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'ticket.transfer_offered', jsonb_build_object('ticket_id', tk.id, 'transfer_id', tid));
  return tid;
end $$;

-- Recipient accepts: the old entitlement is invalidated and a new one (new code + nonce → new credential) issued atomically.
create or replace function public.accept_ticket_transfer(p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare x public.ticket_transfers; tk public.tickets; me text; new_id uuid;
begin
  select * into x from public.ticket_transfers where token_hash = p_token_hash for update;
  if not found or x.status <> 'pending' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if x.expires_at < now() then update public.ticket_transfers set status = 'expired' where id = x.id; raise exception 'expired' using errcode = '22023'; end if;
  select lower(email) into me from auth.users where id = auth.uid();
  if me is distinct from x.to_email then raise exception 'wrong_recipient' using errcode = '42501'; end if;
  select * into tk from public.tickets where id = x.ticket_id for update;
  if tk.status <> 'valid' or tk.holder_id <> x.from_user then
    update public.ticket_transfers set status = 'cancelled', decided_at = now() where id = x.id;
    raise exception 'no_longer_transferable' using errcode = '22023';
  end if;
  insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, attendee_email, order_ref, seat, price_paid)
    values ('GLD-' || upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 6)),
      tk.event_id, tk.tier_id, auth.uid(), coalesce(nullif(x.to_name, ''), tk.attendee_name), x.to_email, tk.order_ref || '-T', tk.seat, tk.price_paid)
    returning id into new_id;
  update public.tickets set status = 'transferred', replaced_by = new_id, qr_nonce = encode(extensions.gen_random_bytes(16), 'hex') where id = tk.id;
  update public.event_seats set ticket_id = new_id where ticket_id = tk.id;
  update public.ticket_transfers set status = 'accepted', new_ticket_id = new_id, decided_at = now() where id = x.id;
  insert into public.notifications(user_id, kind, title, body, link) values (x.from_user, 'ticket', 'Ticket transfer accepted', x.to_email || ' accepted your ticket. Your copy is no longer valid.', '/account/tickets');
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'ticket.transferred', jsonb_build_object('old_ticket', tk.id, 'new_ticket', new_id, 'transfer_id', x.id));
  return new_id;
end $$;

create or replace function public.cancel_ticket_transfer(p_transfer uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.ticket_transfers set status = case when from_user = auth.uid() then 'cancelled' else 'declined' end, decided_at = now()
    where id = p_transfer and status = 'pending' and (from_user = auth.uid() or lower(to_email) = (select lower(email) from auth.users where id = auth.uid()));
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- ───────────────────────── §46 waiting lists ─────────────────────────
create table if not exists public.ticket_waitlist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  tier_id uuid references public.ticket_tiers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  quantity integer not null default 1 check (quantity between 1 and 10),
  status text not null default 'waiting' check (status in ('waiting','notified','converted','cancelled')),
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists ticket_waitlist_one on public.ticket_waitlist(event_id, coalesce(tier_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id) where status in ('waiting','notified');
alter table public.ticket_waitlist enable row level security;
drop policy if exists ticket_waitlist_read on public.ticket_waitlist;
create policy ticket_waitlist_read on public.ticket_waitlist for select using (user_id = (select auth.uid()) or public.can_access_event(event_id));

create or replace function public.join_waitlist(p_event uuid, p_tier uuid, p_qty integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.events; wid uuid;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event and visibility = 'public';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if coalesce((e.settings #>> '{ticket_pro,sales,waiting_list}')::boolean, true) = false then raise exception 'waitlist_disabled' using errcode = '22023'; end if;
  if p_tier is not null and not exists (select 1 from public.ticket_tiers t where t.id = p_tier and t.event_id = p_event) then raise exception 'invalid_tier' using errcode = '22023'; end if;
  insert into public.ticket_waitlist(event_id, tier_id, user_id, quantity) values (p_event, p_tier, auth.uid(), greatest(1, least(coalesce(p_qty, 1), 10)))
    on conflict do nothing returning id into wid;
  return wid;
end $$;

-- Called by the marketplace sweep: notify waiting buyers first-come-first-served as inventory frees up (expired holds, refunds).
create or replace function public.notify_waitlists() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; w record; n integer := 0; free integer;
begin
  for r in select t.id tier_id, t.event_id, t.name, greatest(t.quantity - t.sold - t.held, 0) avail, e.name ev, e.slug from public.ticket_tiers t join public.events e on e.id = t.event_id
           where t.status in ('on_sale','sold_out') and t.quantity - t.sold - t.held > 0 and (t.sale_end is null or t.sale_end > now()) and exists (select 1 from public.ticket_waitlist wl where wl.event_id = t.event_id and (wl.tier_id = t.id or wl.tier_id is null) and wl.status = 'waiting') loop
    free := r.avail;
    -- Inventory freed (refund / expired holds) on a tier the sold-out trigger closed: reopen it before inviting the queue.
    update public.ticket_tiers set status = 'on_sale' where id = r.tier_id and status = 'sold_out';
    for w in select q.id, q.user_id, q.quantity from public.ticket_waitlist q where q.event_id = r.event_id and (q.tier_id = r.tier_id or q.tier_id is null) and q.status = 'waiting' order by q.created_at loop
      exit when free <= 0;
      update public.ticket_waitlist set status = 'notified', notified_at = now() where id = w.id;
      insert into public.notifications(user_id, kind, title, body, link) values (w.user_id, 'ticket', 'Tickets available: ' || r.ev, r.name || ' tickets are available again — first come, first served.', '/e/' || coalesce(r.slug, ''));
      free := free - w.quantity; n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

revoke all on function public.scan_ticket(uuid, uuid, text, text, text, text, timestamptz, text), public.scan_manifest(uuid), public.scan_lookup(uuid, text), public.offer_ticket_transfer(uuid, text, text, text),
  public.accept_ticket_transfer(text), public.cancel_ticket_transfer(uuid), public.join_waitlist(uuid, uuid, integer), public.notify_waitlists() from public, anon;
grant execute on function public.scan_ticket(uuid, uuid, text, text, text, text, timestamptz, text), public.scan_manifest(uuid), public.scan_lookup(uuid, text), public.offer_ticket_transfer(uuid, text, text, text),
  public.accept_ticket_transfer(text), public.cancel_ticket_transfer(uuid), public.join_waitlist(uuid, uuid, integer) to authenticated, service_role;
revoke all on function public.notify_waitlists() from authenticated; grant execute on function public.notify_waitlists() to service_role;
grant select on public.ticket_transfers, public.ticket_waitlist to authenticated;
grant all on public.ticket_transfers, public.ticket_waitlist to service_role;
commit;

-- Waiting-list notifications ride the existing 5-minute marketplace sweep.
select cron.unschedule(jobid) from cron.job where jobname = 'waitlist-notify';
select cron.schedule('waitlist-notify', '*/5 * * * *', 'select public.notify_waitlists()');
