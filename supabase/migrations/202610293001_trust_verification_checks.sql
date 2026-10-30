-- Q08 (lane C) — Identity / business / Stripe verification checks as a guarded state machine (backend §17 Verification,
-- domains 116–117). Additive and backward-compatible:
--   • verification_checks: one row per subject (workspace or user) + kind. Status is the `verification` machine
--     (enforce): unverified → submitted → pending_review → verified / action_required / rejected / suspended, plus expired.
--     Business details (legal/trading name, company number, address, beneficial owners) are private evidence.
--   • verification_records stays the append-only history (one row per state change) — its CHECKs are widened, not narrowed.
--   • Commands (definer, audited, outbox via audit trigger + transition_state): submit (workspace settings.manage),
--     admin review (trust permission, reason required), Stripe sync (service role only; read-only mirror of webhook data).
--   • Machine rows are inserted here (the generated seed 209912310001 is already recorded); src/lib/domain/state-machines.ts
--     is the source of truth and the seed file is regenerated from it.

-- ═══ 1. Canonical check table ═══
create table if not exists public.verification_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  subject_type text not null check (subject_type in ('workspace','user')),
  kind text not null check (kind in ('identity','business','stripe_connect')),
  status text not null default 'unverified',
  -- 117.x business identity (private evidence; never exposed publicly — public sees only the derived badge).
  legal_name text check (legal_name is null or length(legal_name) <= 200),
  trading_name text check (trading_name is null or length(trading_name) <= 200),
  company_number text check (company_number is null or company_number ~ '^[A-Za-z0-9 -]{2,20}$'),
  business_address jsonb not null default '{}' check (jsonb_typeof(business_address) = 'object'),
  beneficial_owners jsonb not null default '[]' check (jsonb_typeof(beneficial_owners) = 'array'),
  evidence_document_id uuid references public.provider_documents(id) on delete set null,
  source text not null default 'manual' check (source in ('manual','stripe_webhook','admin')),
  external_ref text,
  reason_code text,
  reason text check (reason is null or length(reason) <= 500),
  expires_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((subject_type = 'workspace' and workspace_id is not null and user_id is null) or (subject_type = 'user' and user_id is not null and workspace_id is null)),
  check (kind <> 'stripe_connect' or subject_type = 'workspace')
);
create unique index if not exists verification_checks_ws_kind_uq on public.verification_checks(workspace_id, kind) where subject_type = 'workspace';
create unique index if not exists verification_checks_user_kind_uq on public.verification_checks(user_id, kind) where subject_type = 'user';
create index if not exists verification_checks_queue_idx on public.verification_checks(status, updated_at) where status in ('submitted','pending_review');
create index if not exists verification_checks_expiry_idx on public.verification_checks(expires_at) where status = 'verified' and expires_at is not null;
alter table public.verification_checks enable row level security;
revoke all on public.verification_checks from anon, authenticated;
grant select on public.verification_checks to authenticated;
-- Private: the workspace's settings managers, the user themself, or Trust & Safety admins. Writes only through the commands below.
drop policy if exists verification_checks_read on public.verification_checks;
create policy verification_checks_read on public.verification_checks for select to authenticated using (
  (workspace_id is not null and public.has_permission(workspace_id, 'settings.manage'))
  or (user_id is not null and user_id = (select auth.uid()))
  or public.has_admin_permission('trust'));

create or replace function public.verification_checks_touch() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.status is distinct from old.status then new.version := old.version + 1; end if;
  return new;
end $$;
drop trigger if exists verification_checks_touch on public.verification_checks;
create trigger verification_checks_touch before update on public.verification_checks for each row execute function public.verification_checks_touch();
revoke all on function public.verification_checks_touch() from public, anon, authenticated;

-- ═══ 2. History table: widen vocabulary (superset — existing rows and writers stay valid) ═══
alter table public.verification_records drop constraint if exists verification_records_kind_check;
alter table public.verification_records add constraint verification_records_kind_check
  check (kind in ('stripe_connect','stripe_identity','business_registration','manual_review','identity','business'));
alter table public.verification_records drop constraint if exists verification_records_status_check;
alter table public.verification_records add constraint verification_records_status_check
  check (status in ('unverified','pending','verified','action_required','restricted','suspended','submitted','pending_review','rejected','expired'));
alter table public.verification_records add column if not exists check_id uuid references public.verification_checks(id) on delete set null;
alter table public.verification_records add column if not exists from_status text;
alter table public.verification_records add column if not exists reason_code text;

-- ═══ 3. State machine (mirrors src/lib/domain/state-machines.ts `verification`) ═══
insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states)
values ('verification', 'verification_checks', 'status', 'enforce', array['unverified','submitted']::text[], array[]::text[])
on conflict (machine) do update set table_name = excluded.table_name, column_name = excluded.column_name, mode = excluded.mode,
  initial_states = excluded.initial_states, terminal_states = excluded.terminal_states;
delete from public.state_transitions where machine = 'verification';
insert into public.state_transitions(machine, from_state, to_state) values
  ('verification','unverified','submitted'), ('verification','unverified','pending_review'),
  ('verification','submitted','pending_review'), ('verification','submitted','action_required'), ('verification','submitted','rejected'), ('verification','submitted','unverified'),
  ('verification','pending_review','verified'), ('verification','pending_review','action_required'), ('verification','pending_review','rejected'), ('verification','pending_review','suspended'),
  ('verification','verified','pending_review'), ('verification','verified','action_required'), ('verification','verified','suspended'), ('verification','verified','expired'),
  ('verification','action_required','submitted'), ('verification','action_required','pending_review'), ('verification','action_required','rejected'), ('verification','action_required','suspended'),
  ('verification','rejected','submitted'),
  ('verification','suspended','pending_review'),
  ('verification','expired','submitted'), ('verification','expired','pending_review');
drop trigger if exists verification_checks_state_guard on public.verification_checks;
create trigger verification_checks_state_guard before insert or update of status on public.verification_checks
  for each row execute function public.enforce_state_transition('verification', 'status');

-- ═══ 4. Internal: one guarded step + history + audit (callers authorise first) ═══
create or replace function public.verification_step(p_check uuid, p_to text, p_actor uuid, p_actor_type text, p_reason_code text, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare c public.verification_checks; r jsonb; hist_kind text;
begin
  select * into c from public.verification_checks where id = p_check for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status = p_to then return jsonb_build_object('ok', true, 'changed', false, 'state', c.status); end if;
  r := public.transition_state('verification', p_check, p_to, c.status, p_actor, coalesce(p_actor_type, 'system'), coalesce(p_reason_code, p_reason), null);
  if not coalesce((r->>'ok')::boolean, false) then return r; end if;
  update public.verification_checks set reason_code = p_reason_code, reason = left(p_reason, 500),
    decided_by = case when p_to in ('verified','action_required','rejected','suspended') then p_actor else decided_by end,
    decided_at = case when p_to in ('verified','action_required','rejected','suspended') then now() else decided_at end
  where id = p_check;
  hist_kind := case c.kind when 'stripe_connect' then 'stripe_connect' when 'business' then 'business' else 'identity' end;
  if c.workspace_id is not null then
    insert into public.verification_records(workspace_id, kind, status, scope, evidence, decided_by, check_id, from_status, reason_code)
    values (c.workspace_id, hist_kind, p_to,
      case c.kind when 'business' then 'Business identity (legal name, company details and address) reviewed by Gala Dock. This does not verify service quality, insurance or licences.'
                  when 'stripe_connect' then 'Payment account details and identity checks completed with Stripe for receiving payouts. This does not verify service quality, insurance or licences.'
                  else 'Identity of the account holder reviewed by Gala Dock.' end,
      jsonb_build_object('source', c.source, 'reason', left(p_reason, 300)), p_actor, c.id, c.status, p_reason_code);
    insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (p_actor, coalesce(p_actor_type, 'system'), c.workspace_id, 'provider.verification_changed',
      jsonb_build_object('check_id', c.id, 'kind', c.kind, 'from', c.status, 'to', p_to, 'reason_code', p_reason_code));
  end if;
  return r;
end $$;
revoke all on function public.verification_step(uuid, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.verification_step(uuid, text, uuid, text, text, text) to service_role;

-- ═══ 5. Commands ═══
-- Provider/organizer submits (or resubmits) business identity for review. Never self-verifies.
create or replace function public.trust_submit_verification(p_workspace uuid, p_kind text, p_details jsonb default '{}', p_document uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare c public.verification_checks; d jsonb := coalesce(p_details, '{}'); r jsonb;
begin
  if p_kind not in ('business','identity') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if not public.has_permission(p_workspace, 'settings.manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_kind = 'business' and length(trim(coalesce(d->>'legal_name', ''))) < 2 then raise exception 'legal_name_required' using errcode = '22023'; end if;
  if p_document is not null and not exists (select 1 from public.provider_documents x where x.id = p_document and x.workspace_id = p_workspace) then
    raise exception 'document_not_in_workspace' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(d->'beneficial_owners', '[]')) <> 'array' or jsonb_array_length(coalesce(d->'beneficial_owners', '[]')) > 10 then raise exception 'invalid_owners' using errcode = '22023'; end if;
  insert into public.verification_checks(workspace_id, subject_type, kind, status) values (p_workspace, 'workspace', p_kind, 'unverified')
    on conflict (workspace_id, kind) where subject_type = 'workspace' do nothing;
  select * into c from public.verification_checks where workspace_id = p_workspace and kind = p_kind and subject_type = 'workspace' for update;
  if c.status in ('submitted','pending_review') then raise exception 'already_under_review' using errcode = '22023'; end if;
  if c.status = 'suspended' then raise exception 'suspended_contact_support' using errcode = '22023'; end if;
  update public.verification_checks set legal_name = left(nullif(trim(d->>'legal_name'), ''), 200), trading_name = left(nullif(trim(d->>'trading_name'), ''), 200),
    company_number = nullif(upper(trim(d->>'company_number')), ''), business_address = coalesce(d->'business_address', '{}'),
    beneficial_owners = coalesce(d->'beneficial_owners', '[]'), evidence_document_id = p_document, source = 'manual',
    submitted_by = auth.uid(), submitted_at = now()
  where id = c.id;
  if c.status = 'verified' then r := public.verification_step(c.id, 'pending_review', auth.uid(), 'user', 'refresh', 'Details changed; re-review requested');   -- 116.6 refresh
  else r := public.verification_step(c.id, 'submitted', auth.uid(), 'user', null, null); end if;
  return jsonb_build_object('check_id', c.id) || r;
end $$;

-- Trust & Safety decision. Reason required (≥5 chars); reason_code from moderation_reason_codes when present.
create or replace function public.trust_review_verification(p_check uuid, p_to text, p_reason_code text, p_reason text, p_expires_at timestamptz default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare c public.verification_checks; r jsonb;
begin
  perform public.admin_require('trust', p_reason);
  if p_to not in ('pending_review','verified','action_required','rejected','suspended') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select * into c from public.verification_checks where id = p_check for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.kind = 'stripe_connect' then raise exception 'stripe_managed' using errcode = '22023'; end if;   -- Stripe is authoritative for its own check
  r := public.verification_step(c.id, p_to, auth.uid(), 'admin', p_reason_code, p_reason);
  if p_to = 'verified' then update public.verification_checks set expires_at = p_expires_at where id = c.id; end if;
  return r;
end $$;

-- Read-only mirror of Stripe Connect state (called by syncConnectAccount from account.updated webhook data; no Stripe API).
-- Walks the guarded machine one legal step at a time so history stays truthful (e.g. unverified → pending_review → verified).
create or replace function public.trust_sync_stripe_check(p_workspace uuid, p_state text, p_account text, p_evidence jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare c public.verification_checks; target text; path text[]; s text; r jsonb := '{}';
begin
  target := case p_state when 'verified' then 'verified' when 'pending' then 'pending_review' when 'action_required' then 'action_required'
                         when 'restricted' then 'action_required' when 'suspended' then 'suspended' else 'unverified' end;
  insert into public.verification_checks(workspace_id, subject_type, kind, status, source, external_ref) values (p_workspace, 'workspace', 'stripe_connect', 'unverified', 'stripe_webhook', p_account)
    on conflict (workspace_id, kind) where subject_type = 'workspace' do nothing;
  select * into c from public.verification_checks where workspace_id = p_workspace and kind = 'stripe_connect' and subject_type = 'workspace' for update;
  update public.verification_checks set external_ref = p_account, source = 'stripe_webhook' where id = c.id and external_ref is distinct from p_account;
  if c.status = target then return jsonb_build_object('ok', true, 'changed', false, 'state', target); end if;
  -- Legal routes from any state into the target (the machine has no direct unverified → verified edge).
  path := case
    when public.state_transition_allowed('verification', c.status, target) then array[target]
    when target = 'unverified' and c.status = 'submitted' then array['unverified']
    when target = 'unverified' then array['pending_review', 'action_required']     -- Stripe lost the details: needs action
    when c.status in ('unverified','expired','action_required','suspended','verified') then array['pending_review', target]
    when c.status = 'rejected' then array['submitted', 'pending_review', target]
    when c.status = 'submitted' then array['pending_review', target]
    else array['pending_review', target] end;
  foreach s in array path loop
    if s = (select status from public.verification_checks where id = c.id) then continue; end if;
    if not public.state_transition_allowed('verification', (select status from public.verification_checks where id = c.id), s) then continue; end if;
    r := public.verification_step(c.id, s, null, 'webhook', 'stripe_' || coalesce(p_state, 'unknown'), left(coalesce(p_evidence->>'disabled_reason', ''), 300));
  end loop;
  return r;
end $$;

revoke all on function public.trust_submit_verification(uuid, text, jsonb, uuid), public.trust_review_verification(uuid, text, text, text, timestamptz),
  public.trust_sync_stripe_check(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.trust_submit_verification(uuid, text, jsonb, uuid), public.trust_review_verification(uuid, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.trust_sync_stripe_check(uuid, text, text, jsonb) to service_role;

-- ═══ 6. Backfill Stripe checks from the existing webhook mirror (no Stripe calls; history row per step) ═══
do $$ declare a record; begin
  for a in select workspace_id, stripe_account_id, verification_state, disabled_reason from public.connect_accounts loop
    perform public.trust_sync_stripe_check(a.workspace_id, a.verification_state, a.stripe_account_id, jsonb_build_object('disabled_reason', a.disabled_reason, 'backfill', true));
  end loop;
end $$;

-- ═══ 7. Event catalogue additions (mirrors src/lib/foundation/event-catalogue.ts) ═══
insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('trust.document_submitted', 1, 'provider', 'A provider submitted a compliance document for review.', null),
  ('trust.document_reviewed', 1, 'provider', 'Gala Dock reviewed a provider compliance document.', null),
  ('trust.document_expired', 1, 'provider', 'A verified provider compliance document passed its expiry date.', null),
  ('trust.eligibility_changed', 1, 'provider', 'A provider''s marketplace eligibility changed (evidence lapsed or restored).', null),
  ('trust.enforcement_applied', 1, 'provider', 'A moderation/enforcement action was applied.', null),
  ('trust.enforcement_lifted', 1, 'provider', 'A moderation/enforcement action was lifted or overturned.', null),
  ('trust.appeal_opened', 1, 'provider', 'The subject of an enforcement action appealed it.', null),
  ('review.reported', 1, 'review', 'A review was reported for moderation.', null),
  ('review.moderated', 1, 'review', 'A review was moderated.', null),
  ('reliability.recomputed', 1, 'provider', 'A provider''s versioned reliability score was recomputed.', null)
on conflict (event_type) do update set schema_version = excluded.schema_version, aggregate = excluded.aggregate, description = excluded.description,
  public_type = excluded.public_type, active = true, updated_at = now();

