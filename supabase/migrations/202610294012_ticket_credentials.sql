-- Q21 Ticket Credential / Scanner / Transfer (domains 96–98). Additive.
--
-- Credential rotation (96.7/96.8): a BEFORE UPDATE trigger on tickets rotates qr_nonce and bumps credential_version whenever
--   the entitlement changes hands or leaves the admissible states — refund, transfer, resale listing/completion, cancellation,
--   holder change — for every writer (the Q07 refund worker, resale, transfer, cancel_event_with_refunds, service role).
--   valid ↔ used (check-in / re-entry reset) keeps the credential. Every QR / print / barcode signed with the old nonce dies.
-- Printed / barcode credential (96.2/96.5): static, distinct from the 30-second wallet code (different signing domain) and
--   separately revocable: print_epoch. reissue_ticket_credentials(ticket, scope) — scope 'print' kills only printed copies
--   (lost printout), scope 'all' rotates everything (compromised / lost phone). Holder or event ticket managers; audited.
-- Offline (97.5): create_scan_snapshot() records a snapshot (who, device, when, expiry, digest); the app signs the payload with
--   the server-only secret and the device replays queued scans against it; scan_admission resolves conflicts (first valid wins).
-- Domain events: ticket.state_changed (direct writes), ticket.credential_rotated.

alter table public.tickets
  add column if not exists credential_version integer not null default 1,
  add column if not exists print_epoch integer not null default 0,
  add column if not exists credential_rotated_at timestamptz;

create or replace function public.tickets_credential_rotate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.status is distinct from old.status and not (old.status in ('valid','used') and new.status in ('valid','used')))
     or new.holder_id is distinct from old.holder_id then
    if new.qr_nonce is not distinct from old.qr_nonce then new.qr_nonce := encode(extensions.gen_random_bytes(16), 'hex'); end if;
  end if;
  if new.qr_nonce is distinct from old.qr_nonce or new.print_epoch is distinct from old.print_epoch then
    new.credential_version := old.credential_version + 1;
    new.credential_rotated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists tickets_credential_rotate on public.tickets;
create trigger tickets_credential_rotate before update on public.tickets for each row execute function public.tickets_credential_rotate();

create or replace function public.tickets_credential_outbox() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if new.status is distinct from old.status or new.credential_version is distinct from old.credential_version then
    select workspace_id into ws from public.events where id = new.event_id;
    if new.status is distinct from old.status and not (old.status = 'valid' and new.status = 'used') then   -- check-ins emit ticket.scanned
      perform public.emit_domain_event('ticket.state_changed', ws, jsonb_build_object('id', new.id, 'from', old.status, 'to', new.status, 'source', 'direct'),
        (select auth.uid()), case when (select auth.uid()) is null then 'system' else 'user' end, 'ticket', new.id::text, null, null);
    end if;
    if new.credential_version is distinct from old.credential_version then
      perform public.emit_domain_event('ticket.credential_rotated', ws, jsonb_build_object('id', new.id, 'status', new.status, 'version', new.credential_version),
        (select auth.uid()), case when (select auth.uid()) is null then 'system' else 'user' end, 'ticket', new.id::text, null, null);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists tickets_credential_outbox on public.tickets;
create trigger tickets_credential_outbox after update on public.tickets for each row execute function public.tickets_credential_outbox();

create or replace function public.reissue_ticket_credentials(p_ticket uuid, p_scope text default 'all', p_reason text default '') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); tk public.tickets; e public.events; manager boolean;
begin
  select * into tk from public.tickets where id = p_ticket for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into e from public.events where id = tk.event_id;
  manager := e.owner_id = uid or (e.workspace_id is not null and public.has_permission(e.workspace_id, 'tickets.manage'));
  if uid is null or not (tk.holder_id = uid or manager) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if tk.status <> 'valid' then raise exception 'not_reissuable' using errcode = '22023'; end if;
  if p_scope not in ('all','print') then raise exception 'invalid_scope' using errcode = '22023'; end if;
  update public.tickets set print_epoch = print_epoch + 1,
    qr_nonce = case when p_scope = 'all' then encode(extensions.gen_random_bytes(16), 'hex') else qr_nonce end where id = tk.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, e.workspace_id, 'ticket.credentials_reissued',
    jsonb_build_object('ticket_id', tk.id, 'scope', p_scope, 'reason', left(coalesce(p_reason, ''), 300), 'by_manager', manager and tk.holder_id is distinct from uid));
  if tk.holder_id is not null and tk.holder_id is distinct from uid then
    insert into public.notifications(user_id, kind, title, body, link) values (tk.holder_id, 'ticket', 'Your ticket has a new entry code',
      case when p_scope = 'print' then 'Printed copies of your ticket no longer work. Print it again or use your wallet.' else 'Your previous QR codes and printouts no longer work. Open your ticket for the new code.' end,
      '/account/tickets/' || tk.id);
  end if;
  return jsonb_build_object('ok', true, 'scope', p_scope);
end $$;

-- ── Offline snapshots ─────────────────────────────────────────────────────
create table if not exists public.scan_snapshots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  device text not null default '',
  row_count integer not null default 0,
  digest text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists scan_snapshots_event on public.scan_snapshots(event_id, created_at desc);
alter table public.scan_snapshots enable row level security;
drop policy if exists scan_snapshots_read on public.scan_snapshots;
create policy scan_snapshots_read on public.scan_snapshots for select to authenticated using (created_by = (select auth.uid()) or public.can_access_event(event_id));
revoke all on public.scan_snapshots from anon, authenticated;
grant select on public.scan_snapshots to authenticated;
grant all on public.scan_snapshots to service_role;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'check_ins_snapshot_fk') then
    alter table public.check_ins add constraint check_ins_snapshot_fk foreign key (snapshot_id) references public.scan_snapshots(id) on delete set null;
  end if;
end $$;

-- Allow-list for one scanner device: admission data only (no nonces, no emails). The app signs it and adds print fingerprints.
create or replace function public.create_scan_snapshot(p_event uuid, p_device text default '') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); sid uuid; rows_ jsonb; passes jsonb; zones jsonb; exp timestamptz := now() + interval '24 hours';
begin
  if uid is null or not public.can_scan_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('ticket_id', t.id, 'code', t.code, 'status', t.status, 'attendee', t.attendee_name, 'tier', tr.name, 'tier_id', t.tier_id,
           'seat', t.seat, 'checked_in_at', t.checked_in_at, 'v', t.credential_version, 'valid_from', tr.valid_from, 'valid_to', tr.valid_to) order by t.code), '[]')
    into rows_ from public.tickets t left join public.ticket_tiers tr on tr.id = t.tier_id
   where t.event_id = p_event and t.status in ('valid','used','resale_listed','refunded','transferred','resold','cancelled');
  select coalesce(jsonb_agg(jsonb_build_object('pass_id', p.id, 'code', p.code, 'status', p.status, 'holder', p.holder_name, 'type', p.pass_type, 'zones', p.zones,
           'valid_from', p.valid_from, 'valid_to', p.valid_to) order by p.code), '[]') into passes from public.access_passes p where p.event_id = p_event;
  select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'kind', z.kind, 'opens_at', z.opens_at, 'closes_at', z.closes_at, 'reentry', z.reentry, 'max_entries', z.max_entries,
           'rules', (select coalesce(jsonb_agg(jsonb_build_object('tier_id', r.tier_id, 'pass_type', r.pass_type, 'valid_from', r.valid_from, 'valid_to', r.valid_to)), '[]') from public.access_rules r where r.zone_id = z.id))
           order by z.sort, z.name), '[]') into zones from public.access_zones z where z.event_id = p_event and z.status = 'active';
  insert into public.scan_snapshots(event_id, created_by, device, row_count, digest, expires_at)
    values (p_event, uid, left(coalesce(p_device, ''), 60), jsonb_array_length(rows_) + jsonb_array_length(passes), md5(rows_::text || passes::text || zones::text), exp)
    returning id into sid;
  return jsonb_build_object('snapshot_id', sid, 'event_id', p_event, 'issued_at', now(), 'expires_at', exp, 'tickets', rows_, 'passes', passes, 'zones', zones,
    'reentry', coalesce((select (settings->>'reentry')::boolean from public.events where id = p_event), false));
end $$;

-- Sync gate for queued offline scans: the snapshot must exist for this event and belong to the caller.
create or replace function public.scan_snapshot_valid(p_snapshot uuid, p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.scan_snapshots s where s.id = p_snapshot and s.event_id = p_event and s.created_by = (select auth.uid())
    and s.created_at > now() - interval '8 days');
$$;

revoke all on function public.tickets_credential_rotate(), public.tickets_credential_outbox() from public, anon, authenticated;
revoke all on function public.reissue_ticket_credentials(uuid, text, text), public.create_scan_snapshot(uuid, text), public.scan_snapshot_valid(uuid, uuid) from public, anon;
grant execute on function public.reissue_ticket_credentials(uuid, text, text), public.create_scan_snapshot(uuid, text), public.scan_snapshot_valid(uuid, uuid) to authenticated, service_role;
