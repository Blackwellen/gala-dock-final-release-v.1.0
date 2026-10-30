-- Q32 Privacy / Deletion / Retention / Legal Hold (backend domains 201–205, 269–270, 288). Lane D, 2026-10-29. Additive.
-- Already in place and kept: privacy_requests + submit/update_privacy_request (statutory deadline, extension with reason),
-- deletion_blockers, erase_user_data, due_deletions + /api/cron/privacy (14-day grace), /api/account/export (RLS-scoped DSAR),
-- storage_attribution.retention_until / legal_hold + files.retention_sweep (Q04).
-- New here:
--   1. data_classifications — data inventory per table/column (public / internal / personal / financial / sensitive / restricted).
--   2. data_retention_rules + privacy.retention_sweep job — data-driven schedule; each rule maps to ONE whitelisted handler.
--      Destructive rules that need a legal decision ship DISABLED (legal_review_required); financial/audit records are 'retain'
--      (never deleted; de-identified on erasure). Every handler skips data under an active legal hold. Runs are recorded.
--   3. legal_holds / legal_hold_subjects — block erasure and retention purge (and pin the subject's files) while active.
--   4. consent_records — append-only consent history (marketing email, cookies, recording, partner sharing, terms).
--   5. privacy_subject_export() — DSAR completeness for the Q14–Q22 tables the subject can't read through RLS (guest records,
--      guest care, registrations, passes, check-ins, transfers, resale listings, waiting room, risk holds, consents).
--   6. erase_user_data: legal hold check + anonymisation of the Q14–Q22 personal data; financial records retained, pseudonymous.
--   7. privacy_audit_report() — inventory coverage, retention runs, overdue requests, active holds (admin, recorded).
-- Legal text: retention periods and bases below are DRAFTS for legal review. Nothing here claims legal compliance.

-- ── Admin permission for privacy operations: dedicated `privacy`, or `audit` until it is granted ────────────────────
create or replace function public.privacy_admin_require(p_reason text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.has_admin_permission('privacy') then perform public.admin_require('privacy', p_reason);
  else perform public.admin_require('audit', p_reason); end if;
end $$;
create or replace function public.privacy_admin_can_read() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_admin_permission('privacy') or public.has_admin_permission('audit')
$$;

-- ── 1. Classification ─────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.data_classifications (
  table_name text not null,
  column_name text not null default '',
  classification text not null check (classification in ('public', 'internal', 'personal', 'financial', 'sensitive', 'restricted')),
  personal_data boolean not null default false,
  retention_key text,
  dsar_section text,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (table_name, column_name)
);
alter table public.data_classifications enable row level security;
revoke all on public.data_classifications from anon, authenticated;
grant select on public.data_classifications to authenticated;
grant all on public.data_classifications to service_role;
drop policy if exists data_classifications_read on public.data_classifications;
create policy data_classifications_read on public.data_classifications for select to authenticated using (public.privacy_admin_can_read());

insert into public.data_classifications(table_name, column_name, classification, personal_data, retention_key, dsar_section, notes) values
  ('profiles', '', 'personal', true, null, 'profile', 'Account profile; erased/anonymised on deletion.'),
  ('profiles', 'date_of_birth', 'sensitive', true, null, 'profile', ''),
  ('notifications', '', 'personal', true, 'notifications.read', 'notifications', ''),
  ('recently_viewed', '', 'personal', true, 'recently_viewed.stale', 'recently_viewed', ''),
  ('saved_items', '', 'personal', true, null, 'saved', ''),
  ('conversation_messages', '', 'personal', true, null, 'messages_sent', 'Redacted on erasure; retained for counterparties otherwise.'),
  ('email_outbox', '', 'personal', true, null, null, 'Admins read metadata only (Q31).'),
  ('events', '', 'internal', false, null, 'events_owned', 'Personal events of customers are personal data.'),
  ('event_briefs', '', 'personal', true, null, 'privacy_subject_records', 'Briefs of personal (customer) events.'),
  ('guests', '', 'personal', true, 'guests.after_event', 'privacy_subject_records', 'Organiser is controller for guest lists.'),
  ('guests', 'dietary', 'sensitive', true, 'guests.after_event', 'privacy_subject_records', 'Legacy column; scrubbed to guest_care (manager-only) by 202610294021.'),
  ('guest_care', '', 'sensitive', true, 'guest_care.after_event', 'privacy_subject_records', 'Dietary / allergy / accessibility (health-related): owner + managers only.'),
  ('registrations', '', 'personal', true, 'registrations.after_event', 'privacy_subject_records', ''),
  ('registration_private', '', 'sensitive', true, 'registrations.after_event', 'privacy_subject_records', ''),
  ('access_passes', '', 'personal', true, 'access_passes.after_event', 'privacy_subject_records', ''),
  ('check_ins', '', 'personal', true, 'check_ins.device', 'privacy_subject_records', ''),
  ('tickets', '', 'personal', true, null, 'tickets', 'Entitlements; attendee details anonymised on erasure.'),
  ('ticket_transfers', '', 'personal', true, 'ticket_transfers.closed', 'privacy_subject_records', ''),
  ('ticket_resale_listings', '', 'financial', true, null, 'privacy_subject_records', 'Disclosure snapshots of sales.'),
  ('launch_queue', '', 'personal', true, 'launch_queue.after_event', 'privacy_subject_records', ''),
  ('ticket_risk_flags', '', 'restricted', true, null, 'privacy_subject_records', 'Fraud prevention; subject sees kind/status only.'),
  ('risk_signals', '', 'restricted', true, 'risk_signals.closed', 'privacy_subject_records', 'Fraud prevention evidence: admin-only.'),
  ('risk_holds', '', 'restricted', true, null, 'privacy_subject_records', ''),
  ('review_provenance', '', 'restricted', true, 'review_provenance.stale', null, 'Device / IP hashes only.'),
  ('account_security_events', '', 'restricted', true, 'account_security_events.stale', 'privacy_subject_records', ''),
  ('rate_limits', '', 'internal', true, 'rate_limits.stale', null, 'Keys may contain user ids.'),
  ('consent_records', '', 'personal', true, 'consent_records.retain', 'privacy_subject_records', 'Proof of consent; append-only.'),
  ('privacy_requests', '', 'personal', true, 'privacy_requests.retain', 'privacy_requests', ''),
  ('checkout_orders', '', 'financial', true, 'finance.retain', 'orders', 'Retained; pseudonymous after erasure.'),
  ('payment_orders', '', 'financial', true, 'finance.retain', null, ''),
  ('ledger_transactions', '', 'financial', false, 'finance.retain', null, 'Immutable accounting memo; never deleted.'),
  ('ledger_entries', '', 'financial', false, 'finance.retain', null, 'Immutable; never deleted.'),
  ('invoices', '', 'financial', true, 'finance.retain', null, ''),
  ('stripe_disputes', '', 'financial', true, 'finance.retain', null, ''),
  ('resale_payouts', '', 'financial', true, 'finance.retain', null, ''),
  ('connect_accounts', '', 'financial', false, 'finance.retain', null, 'Stripe mirror; no bank details stored.'),
  ('audit_events', '', 'restricted', true, 'audit.retain', null, 'Append-only evidence; de-identified by opaque ids.'),
  ('reviews', '', 'public', true, null, 'reviews', 'Published reviews are public; body redacted on erasure.'),
  ('listings', '', 'public', false, null, null, ''),
  ('workspaces', '', 'internal', false, null, 'workspace_memberships', ''),
  ('storage_attribution', '', 'internal', true, null, null, 'File retention / legal hold (Q04).')
on conflict (table_name, column_name) do nothing;

-- ── 2. Retention schedule ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.data_retention_rules (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  table_name text not null,
  action text not null check (action in ('delete', 'anonymise', 'redact', 'retain')),
  retention_days integer not null check (retention_days > 0),
  basis text not null,
  enabled boolean not null default false,
  legal_review_required boolean not null default true,
  batch_limit integer not null default 5000 check (batch_limit between 1 and 50000),
  version integer not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.data_retention_rules enable row level security;
revoke all on public.data_retention_rules from anon, authenticated;
grant select on public.data_retention_rules to authenticated;
grant all on public.data_retention_rules to service_role;
drop policy if exists data_retention_rules_read on public.data_retention_rules;
create policy data_retention_rules_read on public.data_retention_rules for select to authenticated using (public.privacy_admin_can_read());

insert into public.data_retention_rules(key, table_name, action, retention_days, basis, enabled, legal_review_required) values
  ('rate_limits.stale', 'rate_limits', 'delete', 2, 'Abuse-control counters are only needed for their window.', true, false),
  ('notifications.read', 'notifications', 'delete', 180, 'In-app notices already read are no longer needed.', true, false),
  ('recently_viewed.stale', 'recently_viewed', 'delete', 365, 'Browsing convenience history.', true, false),
  ('launch_queue.after_event', 'launch_queue', 'delete', 30, 'Waiting-room positions after the event.', true, false),
  ('account_security_events.stale', 'account_security_events', 'delete', 180, 'Account-takeover correlation inputs (DRAFT period).', true, false),
  ('review_provenance.stale', 'review_provenance', 'delete', 365, 'Review-manipulation device hashes (DRAFT period).', true, false),
  ('guest_care.after_event', 'guest_care', 'delete', 90, 'Health-related guest needs after the event (DRAFT — legal review).', false, true),
  ('guests.after_event', 'guests', 'anonymise', 730, 'Organiser guest lists (DRAFT — legal review; organiser is controller).', false, true),
  ('registrations.after_event', 'registrations', 'anonymise', 730, 'Registration answers (DRAFT — legal review).', false, true),
  ('access_passes.after_event', 'access_passes', 'anonymise', 365, 'Pass holder contact details (DRAFT — legal review).', false, true),
  ('check_ins.device', 'check_ins', 'redact', 365, 'Scanner device identifiers on admissions (DRAFT — legal review).', false, true),
  ('ticket_transfers.closed', 'ticket_transfers', 'anonymise', 365, 'Recipient email of closed transfers (DRAFT — legal review).', false, true),
  ('risk_signals.closed', 'risk_signals', 'redact', 730, 'Evidence of cleared/expired fraud signals (DRAFT — legal review).', false, true),
  ('finance.retain', 'ledger_entries', 'retain', 2190, 'Financial / tax records: retained at least 6 years, pseudonymous after erasure (DRAFT — legal review).', false, true),
  ('audit.retain', 'audit_events', 'retain', 2190, 'Security and accountability evidence (DRAFT — legal review).', false, true),
  ('consent_records.retain', 'consent_records', 'retain', 2190, 'Proof of consent and withdrawal (DRAFT — legal review).', false, true),
  ('privacy_requests.retain', 'privacy_requests', 'retain', 2190, 'Record of rights requests and responses (DRAFT — legal review).', false, true)
on conflict (key) do nothing;

create table if not exists public.retention_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  preview boolean not null default false,
  results jsonb not null default '{}',
  error text
);
alter table public.retention_runs enable row level security;
revoke all on public.retention_runs from anon, authenticated;
grant select on public.retention_runs to authenticated;
grant all on public.retention_runs to service_role;
drop policy if exists retention_runs_read on public.retention_runs;
create policy retention_runs_read on public.retention_runs for select to authenticated using (public.privacy_admin_can_read());

-- ── 3. Legal holds ────────────────────────────────────────────────────────────────────────────────────────────────────
create sequence if not exists public.legal_hold_ref_seq start 1001;
create table if not exists public.legal_holds (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  matter text not null check (length(matter) between 3 and 200),
  reason text not null check (length(reason) between 5 and 2000),
  status text not null default 'active' check (status in ('active', 'released')),
  created_by uuid,
  created_at timestamptz not null default now(),
  released_by uuid,
  released_at timestamptz,
  release_reason text,
  updated_at timestamptz not null default now()
);
create table if not exists public.legal_hold_subjects (
  hold_id uuid not null references public.legal_holds(id) on delete cascade,
  subject_type text not null check (subject_type in ('user', 'workspace', 'event')),
  subject_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (hold_id, subject_type, subject_id)
);
create index if not exists legal_hold_subjects_subject_idx on public.legal_hold_subjects(subject_type, subject_id);
alter table public.legal_holds enable row level security;
alter table public.legal_hold_subjects enable row level security;
revoke all on public.legal_holds, public.legal_hold_subjects from anon, authenticated;
grant select on public.legal_holds, public.legal_hold_subjects to authenticated;
grant all on public.legal_holds, public.legal_hold_subjects to service_role;
drop policy if exists legal_holds_read on public.legal_holds;
create policy legal_holds_read on public.legal_holds for select to authenticated using (public.privacy_admin_can_read());
drop policy if exists legal_hold_subjects_read on public.legal_hold_subjects;
create policy legal_hold_subjects_read on public.legal_hold_subjects for select to authenticated using (public.privacy_admin_can_read());
alter table public.storage_attribution add column if not exists legal_hold_ref uuid;
revoke all on sequence public.legal_hold_ref_seq from anon, authenticated;

create or replace function public.legal_hold_covers(p_type text, p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_id is not null and exists (select 1 from public.legal_hold_subjects s join public.legal_holds h on h.id = s.hold_id
    where h.status = 'active' and s.subject_type = p_type and s.subject_id = p_id)
$$;
-- A user is covered by a hold on them or on a workspace they own.
create or replace function public.legal_hold_covers_user(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.legal_hold_covers('user', p_user)
    or exists (select 1 from public.workspaces w where w.owner_id = p_user and public.legal_hold_covers('workspace', w.id))
$$;
-- An event is covered by a hold on it, its workspace or its owner.
create or replace function public.legal_hold_covers_event(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and (public.legal_hold_covers('event', e.id)
    or public.legal_hold_covers('workspace', e.workspace_id) or public.legal_hold_covers('user', e.owner_id)))
$$;

create or replace function public.legal_hold_place(p_matter text, p_reason text, p_subjects jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare hid uuid; s jsonb; t text; i uuid; n int := 0;
begin
  perform public.privacy_admin_require(p_reason);
  if length(trim(coalesce(p_matter, ''))) < 3 then raise exception 'matter_required' using errcode = '22023'; end if;
  if jsonb_typeof(p_subjects) <> 'array' or jsonb_array_length(p_subjects) = 0 or jsonb_array_length(p_subjects) > 200 then raise exception 'invalid_subjects' using errcode = '22023'; end if;
  insert into public.legal_holds(reference, matter, reason, created_by) values ('LH-' || nextval('public.legal_hold_ref_seq'), left(trim(p_matter), 200), left(trim(p_reason), 2000), auth.uid())
    returning id into hid;
  for s in select * from jsonb_array_elements(p_subjects) loop
    t := s->>'type'; i := (s->>'id')::uuid;
    if t not in ('user', 'workspace', 'event') then raise exception 'invalid_subject_type' using errcode = '22023'; end if;
    if (t = 'user' and not exists (select 1 from auth.users where id = i)) or (t = 'workspace' and not exists (select 1 from public.workspaces where id = i))
       or (t = 'event' and not exists (select 1 from public.events where id = i)) then raise exception 'not_found' using errcode = 'P0002'; end if;
    insert into public.legal_hold_subjects(hold_id, subject_type, subject_id) values (hid, t, i) on conflict do nothing;
    -- Pin the subject's stored files (Q04 retention sweep and erasure skip legal_hold rows).
    update public.storage_attribution set legal_hold = true, legal_hold_ref = coalesce(legal_hold_ref, hid)
      where deleted_at is null and not legal_hold and ((t = 'user' and user_id = i) or (t = 'workspace' and workspace_id = i));
    n := n + 1;
  end loop;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'privacy.legal_hold_placed',
    jsonb_build_object('hold_id', hid, 'subjects', n));
  return hid;
end $$;

create or replace function public.legal_hold_release(p_hold uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.legal_holds;
begin
  perform public.privacy_admin_require(p_reason);
  update public.legal_holds set status = 'released', released_by = auth.uid(), released_at = now(), release_reason = left(trim(p_reason), 1000), updated_at = now()
    where id = p_hold and status = 'active' returning * into h;
  if not found then raise exception 'not_active' using errcode = '22023'; end if;
  -- Unpin only the files this hold pinned and no other active hold still covers.
  update public.storage_attribution a set legal_hold = false, legal_hold_ref = null
    where a.legal_hold_ref = p_hold and not (public.legal_hold_covers('user', a.user_id) or public.legal_hold_covers('workspace', a.workspace_id));
  update public.storage_attribution a set legal_hold_ref = (select s.hold_id from public.legal_hold_subjects s join public.legal_holds x on x.id = s.hold_id
      where x.status = 'active' and ((s.subject_type = 'user' and s.subject_id = a.user_id) or (s.subject_type = 'workspace' and s.subject_id = a.workspace_id)) limit 1)
    where a.legal_hold_ref = p_hold;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'privacy.legal_hold_released',
    jsonb_build_object('hold_id', p_hold, 'reason', left(p_reason, 300)));
end $$;

-- ── 4. Consent records (append-only) ──────────────────────────────────────────────────────────────────────────────────
create table if not exists public.consent_records (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  purpose text not null check (purpose in ('marketing_email', 'cookies_analytics', 'cookies_marketing', 'recording', 'partner_sharing', 'terms', 'privacy_notice')),
  granted boolean not null,
  policy_version text not null default '' check (length(policy_version) <= 40),
  source text not null check (source in ('settings', 'signup', 'cookie_banner', 'profile', 'admin', 'import', 'event_registration')),
  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists consent_records_user_idx on public.consent_records(user_id, purpose, created_at desc);
alter table public.consent_records enable row level security;
revoke all on public.consent_records from anon, authenticated;
grant select on public.consent_records to authenticated;
grant all on public.consent_records to service_role;
drop policy if exists consent_records_read on public.consent_records;
create policy consent_records_read on public.consent_records for select to authenticated using (user_id = (select auth.uid()) or public.privacy_admin_can_read());

create or replace function public.consent_records_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'consent_records_append_only' using errcode = '55000';
end $$;
drop trigger if exists consent_records_append_only on public.consent_records;
create trigger consent_records_append_only before update or delete on public.consent_records for each row execute function public.consent_records_append_only();

create or replace function public.record_consent(p_purpose text, p_granted boolean, p_version text default '', p_source text default 'settings') returns bigint
language plpgsql security definer set search_path = '' as $$
declare rid bigint;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_source not in ('settings', 'signup', 'cookie_banner', 'event_registration') then raise exception 'invalid_source' using errcode = '22023'; end if;
  if p_granted is null then raise exception 'invalid_choice' using errcode = '22023'; end if;
  if not public.hit_rate_limit('consent:' || auth.uid(), 60, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into public.consent_records(user_id, purpose, granted, policy_version, source) values (auth.uid(), p_purpose, p_granted, left(coalesce(p_version, ''), 40), p_source)
    returning id into rid;
  if p_purpose = 'marketing_email' then
    perform set_config('gd.consent_recorded', 'on', true);
    update public.profiles set marketing_opt_in = p_granted, marketing_opt_in_at = case when p_granted then now() else marketing_opt_in_at end where id = auth.uid();
    perform set_config('gd.consent_recorded', '', true);
  end if;
  return rid;
end $$;

create or replace function public.my_consents() returns table (purpose text, granted boolean, policy_version text, source text, recorded_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (c.purpose) c.purpose, c.granted, c.policy_version, c.source, c.created_at from public.consent_records c
  where c.user_id = (select auth.uid()) order by c.purpose, c.created_at desc
$$;

-- Existing UI writes profiles.marketing_opt_in directly: record those changes as consent history too.
create or replace function public.profiles_marketing_consent_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('gd.consent_recorded', true), '') = 'on' then return null; end if;
  if new.marketing_opt_in is distinct from old.marketing_opt_in and new.deleted_at is null then
    insert into public.consent_records(user_id, purpose, granted, source, context) values (new.id, 'marketing_email', coalesce(new.marketing_opt_in, false), 'profile', '{"via":"profiles.marketing_opt_in"}');
  end if;
  return null;
exception when others then return null;   -- never block a profile save on history capture
end $$;
drop trigger if exists profiles_marketing_consent_history on public.profiles;
create trigger profiles_marketing_consent_history after update of marketing_opt_in on public.profiles for each row execute function public.profiles_marketing_consent_history();
-- Baseline: current opt-in state and accepted terms become the first history rows (source 'import').
insert into public.consent_records(user_id, purpose, granted, policy_version, source, context, created_at)
  select p.id, 'marketing_email', true, '', 'import', '{"baseline":"profiles.marketing_opt_in"}', coalesce(p.marketing_opt_in_at, p.created_at)
  from public.profiles p where p.marketing_opt_in and p.deleted_at is null
    and not exists (select 1 from public.consent_records c where c.user_id = p.id and c.purpose = 'marketing_email');
insert into public.consent_records(user_id, purpose, granted, policy_version, source, context, created_at)
  select p.id, 'terms', true, p.terms_version, 'import', '{"baseline":"profiles.terms_version"}', p.terms_accepted_at
  from public.profiles p where p.terms_accepted_at is not null and coalesce(p.terms_version, '') <> '' and p.deleted_at is null
    and not exists (select 1 from public.consent_records c where c.user_id = p.id and c.purpose = 'terms');

-- ── 5. DSAR completeness (records about the caller that RLS doesn't show them) ────────────────────────────────────────
create or replace function public.privacy_subject_export() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mail text; g uuid[];
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select lower(email) into mail from auth.users where id = uid;
  g := array(select id from public.guests where mail <> '' and lower(email) = mail);
  return jsonb_build_object(
    'note', 'Records other Gala Dock users (event organisers) hold about you as a guest, attendee or applicant, plus account security and consent history. Fraud-prevention evidence is summarised (kind and status), not disclosed in full.',
    'guest_records', (select coalesce(jsonb_agg(jsonb_build_object('event', e.name, 'event_date', e.starts_at, 'name', x.name, 'email', x.email, 'phone', x.phone, 'status', x.status,
        'plus_one', x.plus_one, 'rsvp_note', x.rsvp_note, 'rsvp_responded_at', x.rsvp_responded_at, 'checked_in_at', x.checked_in_at, 'invited_at', x.invited_at)), '[]')
      from public.guests x join public.events e on e.id = x.event_id where x.id = any(g)),
    'guest_care', (select coalesce(jsonb_agg(jsonb_build_object('event', e.name, 'dietary', c.dietary, 'allergies', c.allergies, 'accessibility', c.accessibility,
        'access_flags', c.access_flags, 'notes', c.notes, 'consent_at', c.consent_at, 'updated_at', c.updated_at)), '[]')
      from public.guest_care c join public.events e on e.id = c.event_id where c.guest_id = any(g)),
    'registrations', (select coalesce(jsonb_agg(jsonb_build_object('event', e.name, 'name', r.name, 'email', r.email, 'status', r.status, 'answers', r.answers,
        'private_answers', (select p.answers from public.registration_private p where p.registration_id = r.id), 'decided_at', r.decided_at, 'decision_reason', r.decision_reason, 'created_at', r.created_at)), '[]')
      from public.registrations r join public.events e on e.id = r.event_id where r.user_id = uid or (mail <> '' and lower(r.email) = mail)),
    'access_passes', (select coalesce(jsonb_agg(jsonb_build_object('event', e.name, 'pass_type', a.pass_type, 'holder_name', a.holder_name, 'holder_email', a.holder_email,
        'status', a.status, 'valid_from', a.valid_from, 'valid_to', a.valid_to, 'checked_in_at', a.checked_in_at, 'created_at', a.created_at)), '[]')
      from public.access_passes a join public.events e on e.id = a.event_id where a.user_id = uid or (mail <> '' and lower(a.holder_email) = mail) or a.guest_id = any(g)),
    'admissions', (select coalesce(jsonb_agg(jsonb_build_object('event', e.name, 'at', k.created_at, 'result', k.result, 'gate', k.gate, 'direction', k.direction, 'subject', k.subject_kind)), '[]')
      from public.check_ins k join public.events e on e.id = k.event_id
      where k.ticket_id in (select t.id from public.tickets t where t.holder_id = uid) or k.guest_id = any(g)
        or k.pass_id in (select a.id from public.access_passes a where a.user_id = uid or (mail <> '' and lower(a.holder_email) = mail))),
    'ticket_transfers', (select coalesce(jsonb_agg(jsonb_build_object('direction', case when t.from_user = uid then 'sent' else 'received' end, 'to_name', t.to_name,
        'status', t.status, 'created_at', t.created_at, 'decided_at', t.decided_at)), '[]')
      from public.ticket_transfers t where t.from_user = uid or (mail <> '' and lower(t.to_email) = mail)),
    'resale_listings', (select coalesce(jsonb_agg(jsonb_build_object('event_id', l.event_id, 'tier', l.tier_name, 'seat', l.seat, 'face_value_minor', l.face_value_minor,
        'price_minor', l.price_minor, 'status', l.status, 'listed_at', l.listed_at, 'closed_at', l.closed_at)), '[]')
      from public.ticket_resale_listings l where l.seller_id = uid),
    'waiting_rooms', (select coalesce(jsonb_agg(jsonb_build_object('event_id', q.event_id, 'position', q.position, 'joined_at', q.joined_at, 'admitted_at', q.admitted_at)), '[]')
      from public.launch_queue q where q.user_id = uid),
    'personal_event_briefs', (select coalesce(jsonb_agg(jsonb_build_object('event', e.name, 'version', b.version, 'goals', b.goals, 'client_needs', b.client_needs, 'scope', b.scope,
        'budget_min', b.budget_min, 'budget_max', b.budget_max, 'created_at', b.created_at)), '[]')
      from public.event_briefs b join public.events e on e.id = b.event_id where e.owner_id = uid and e.workspace_id is null),
    'risk_reviews', (select coalesce(jsonb_agg(jsonb_build_object('area', s.domain, 'kind', s.kind, 'status', s.status, 'created_at', s.created_at)), '[]')
      from public.risk_signals s where s.user_id = uid),
    'account_holds', (select coalesce(jsonb_agg(jsonb_build_object('kind', h.kind, 'reason', h.reason_label, 'status', h.status, 'placed_at', h.placed_at, 'released_at', h.released_at)), '[]')
      from public.risk_holds h where h.subject_type = 'user' and h.subject_id = uid),
    'security_events', (select coalesce(jsonb_agg(jsonb_build_object('kind', a.kind, 'at', a.created_at)), '[]') from public.account_security_events a where a.user_id = uid),
    'consents', (select coalesce(jsonb_agg(jsonb_build_object('purpose', c.purpose, 'granted', c.granted, 'policy_version', c.policy_version, 'source', c.source, 'at', c.created_at) order by c.created_at), '[]')
      from public.consent_records c where c.user_id = uid)
  );
end $$;

-- ── 6. Erasure: legal hold + Q14–Q22 personal data ────────────────────────────────────────────────────────────────────
create or replace function public.erase_user_data(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m jsonb := '{}'; n integer; mail text; g uuid[];
begin
  if exists (select 1 from public.deletion_blockers(p_user)) then raise exception 'blocked' using errcode = 'P0001'; end if;
  if public.legal_hold_covers_user(p_user) then raise exception 'legal_hold' using errcode = 'P0001'; end if;
  select lower(email) into mail from auth.users where id = p_user;
  g := array(select id from public.guests where coalesce(mail, '') <> '' and lower(email) = mail and not public.legal_hold_covers_event(event_id));
  update public.profiles set full_name = 'Deleted user', phone = null, bio = '', date_of_birth = null, avatar_url = '', home_area = '', interests = '{}',
    notifications = '{}', marketing_opt_in = false, calendar_token = null, last_workspace_id = null, deleted_at = now() where id = p_user;
  delete from public.saved_items where user_id = p_user; get diagnostics n = row_count; m := m || jsonb_build_object('saved_items', n);
  delete from public.recently_viewed where user_id = p_user; get diagnostics n = row_count; m := m || jsonb_build_object('recently_viewed', n);
  delete from public.notifications where user_id = p_user; get diagnostics n = row_count; m := m || jsonb_build_object('notifications', n);
  delete from public.email_outbox where user_id = p_user;
  delete from public.mfa_recovery_codes where user_id = p_user;
  delete from public.user_tasks where user_id = p_user; get diagnostics n = row_count; m := m || jsonb_build_object('user_tasks', n);
  delete from public.template_saves where user_id = p_user;
  delete from public.ticket_waitlist where user_id = p_user;
  delete from public.design_shares where user_id = p_user;
  update public.designs set deleted_at = coalesce(deleted_at, now()) where owner_id = p_user and workspace_id is null; get diagnostics n = row_count; m := m || jsonb_build_object('personal_designs', n);
  update public.reviews set body = '[removed at the author’s request]' where user_id = p_user; get diagnostics n = row_count; m := m || jsonb_build_object('reviews_redacted', n);
  update public.conversation_messages set body = '[message removed — account deleted]' where sender_id = p_user; get diagnostics n = row_count; m := m || jsonb_build_object('messages_redacted', n);
  update public.conversation_participants set left_at = coalesce(left_at, now()) where user_id = p_user;
  update public.tickets set attendee_name = 'Deleted user', attendee_email = null where holder_id = p_user;
  -- Q14–Q22: guest records held by organisers, care data, registrations, passes, transfers, waiting room, device hashes.
  delete from public.guest_care where guest_id = any(g); get diagnostics n = row_count; m := m || jsonb_build_object('guest_care', n);
  update public.guests set name = 'Deleted guest', email = '', phone = '', rsvp_note = '', dietary = '' where id = any(g); get diagnostics n = row_count; m := m || jsonb_build_object('guest_records', n);
  delete from public.registration_private p using public.registrations r where p.registration_id = r.id and (r.user_id = p_user or (coalesce(mail, '') <> '' and lower(r.email) = mail))
    and not public.legal_hold_covers_event(r.event_id);
  update public.registrations set name = 'Deleted user', email = 'erased+' || id || '@users.invalid', answers = '{}'
    where (user_id = p_user or (coalesce(mail, '') <> '' and lower(email) = mail)) and not public.legal_hold_covers_event(event_id); get diagnostics n = row_count; m := m || jsonb_build_object('registrations', n);
  update public.access_passes set holder_name = 'Deleted user', holder_email = ''
    where (user_id = p_user or (coalesce(mail, '') <> '' and lower(holder_email) = mail)) and not public.legal_hold_covers_event(event_id); get diagnostics n = row_count; m := m || jsonb_build_object('access_passes', n);
  update public.ticket_transfers set to_email = 'erased+' || id || '@users.invalid', to_name = '' where coalesce(mail, '') <> '' and lower(to_email) = mail; get diagnostics n = row_count; m := m || jsonb_build_object('transfers_received', n);
  delete from public.launch_queue where user_id = p_user;
  delete from public.review_provenance where user_id = p_user;
  delete from public.account_security_events where user_id = p_user;
  update public.workspace_members set status = 'revoked' where user_id = p_user;
  update public.workspaces set status = 'suspended' where owner_id = p_user and status = 'active';
  delete from auth.sessions where user_id = p_user;
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'privacy.user_erased', jsonb_build_object('user', p_user, 'manifest', m));
  return m || jsonb_build_object('retained', 'payment orders, invoices, payouts, ledger, tax records (6 years), disputes, consent and audit history, fraud-prevention records — pseudonymous (opaque id only)');
end $$;

-- ── 7. Retention sweep (whitelisted handlers; legal holds always win) ─────────────────────────────────────────────────
create or replace function public.retention_apply(p_key text, p_preview boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare r public.data_retention_rules; cutoff timestamptz; n integer := 0;
begin
  select * into r from public.data_retention_rules where key = p_key;
  if not found then raise exception 'unknown_rule' using errcode = 'P0002'; end if;
  if r.action = 'retain' then return 0; end if;
  cutoff := now() - make_interval(days => r.retention_days);
  case p_key
  when 'rate_limits.stale' then
    if p_preview then select count(*) into n from public.rate_limits where window_start < cutoff;
    else delete from public.rate_limits where ctid in (select ctid from public.rate_limits where window_start < cutoff limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'notifications.read' then
    if p_preview then select count(*) into n from public.notifications x where x.read_at < cutoff and not public.legal_hold_covers_user(x.user_id);
    else delete from public.notifications where id in (select x.id from public.notifications x where x.read_at < cutoff and not public.legal_hold_covers_user(x.user_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'recently_viewed.stale' then
    if p_preview then select count(*) into n from public.recently_viewed x where x.viewed_at < cutoff and not public.legal_hold_covers_user(x.user_id);
    else delete from public.recently_viewed where ctid in (select x.ctid from public.recently_viewed x where x.viewed_at < cutoff and not public.legal_hold_covers_user(x.user_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'launch_queue.after_event' then
    if p_preview then select count(*) into n from public.launch_queue q join public.events e on e.id = q.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and not public.legal_hold_covers_event(e.id);
    else delete from public.launch_queue where ctid in (select q.ctid from public.launch_queue q join public.events e on e.id = q.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and not public.legal_hold_covers_event(e.id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'account_security_events.stale' then
    if p_preview then select count(*) into n from public.account_security_events x where x.created_at < cutoff and not public.legal_hold_covers_user(x.user_id);
    else delete from public.account_security_events where id in (select x.id from public.account_security_events x where x.created_at < cutoff and not public.legal_hold_covers_user(x.user_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'review_provenance.stale' then
    if p_preview then select count(*) into n from public.review_provenance x where x.created_at < cutoff and not public.legal_hold_covers_user(x.user_id);
    else delete from public.review_provenance where review_id in (select x.review_id from public.review_provenance x where x.created_at < cutoff and not public.legal_hold_covers_user(x.user_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'guest_care.after_event' then
    if p_preview then select count(*) into n from public.guest_care c join public.events e on e.id = c.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and not public.legal_hold_covers_event(e.id);
    else delete from public.guest_care where guest_id in (select c.guest_id from public.guest_care c join public.events e on e.id = c.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and not public.legal_hold_covers_event(e.id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'guests.after_event' then
    if p_preview then select count(*) into n from public.guests x join public.events e on e.id = x.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and x.email <> 'anonymised' and not public.legal_hold_covers_event(e.id);
    else update public.guests set name = 'Guest', email = 'anonymised', phone = '', rsvp_note = '', dietary = '' where id in (select x.id from public.guests x join public.events e on e.id = x.event_id
      where coalesce(e.ends_at, e.starts_at) < cutoff and x.email <> 'anonymised' and not public.legal_hold_covers_event(e.id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'registrations.after_event' then
    if p_preview then select count(*) into n from public.registrations x join public.events e on e.id = x.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and x.answers <> '{}' and not public.legal_hold_covers_event(e.id);
    else
      delete from public.registration_private p using public.registrations x, public.events e where p.registration_id = x.id and e.id = x.event_id and coalesce(e.ends_at, e.starts_at) < cutoff and not public.legal_hold_covers_event(e.id);
      update public.registrations set name = 'Attendee', email = 'anonymised+' || id || '@users.invalid', answers = '{}' where id in (select x.id from public.registrations x join public.events e on e.id = x.event_id
        where coalesce(e.ends_at, e.starts_at) < cutoff and x.answers <> '{}' and not public.legal_hold_covers_event(e.id) limit r.batch_limit); get diagnostics n = row_count;
    end if;
  when 'access_passes.after_event' then
    if p_preview then select count(*) into n from public.access_passes x join public.events e on e.id = x.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and x.holder_email <> '' and not public.legal_hold_covers_event(e.id);
    else update public.access_passes set holder_email = '' where id in (select x.id from public.access_passes x join public.events e on e.id = x.event_id
      where coalesce(e.ends_at, e.starts_at) < cutoff and x.holder_email <> '' and not public.legal_hold_covers_event(e.id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'check_ins.device' then
    if p_preview then select count(*) into n from public.check_ins x where x.created_at < cutoff and x.device is not null and not public.legal_hold_covers_event(x.event_id);
    else update public.check_ins set device = null where id in (select x.id from public.check_ins x where x.created_at < cutoff and x.device is not null and not public.legal_hold_covers_event(x.event_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'ticket_transfers.closed' then
    if p_preview then select count(*) into n from public.ticket_transfers x where x.status <> 'pending' and coalesce(x.decided_at, x.expires_at, x.created_at) < cutoff and x.to_email not like 'erased+%';
    else update public.ticket_transfers set to_email = 'erased+' || id || '@users.invalid', to_name = '' where id in (select x.id from public.ticket_transfers x
      where x.status <> 'pending' and coalesce(x.decided_at, x.expires_at, x.created_at) < cutoff and x.to_email not like 'erased+%' and not public.legal_hold_covers_user(x.from_user) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'risk_signals.closed' then
    if p_preview then select count(*) into n from public.risk_signals x where x.status in ('cleared', 'expired') and x.updated_at < cutoff and x.evidence <> '{}' and not public.legal_hold_covers_user(x.user_id);
    else update public.risk_signals set evidence = '{}' where id in (select x.id from public.risk_signals x where x.status in ('cleared', 'expired') and x.updated_at < cutoff and x.evidence <> '{}'
      and not public.legal_hold_covers_user(x.user_id) and not public.legal_hold_covers('workspace', x.workspace_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  else raise exception 'no_handler:%', p_key using errcode = '22023';
  end case;
  return n;
end $$;

create or replace function public.retention_sweep_run(p_preview boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; res jsonb := '{}'; rid uuid; n integer;
begin
  insert into public.retention_runs(preview) values (p_preview) returning id into rid;
  for r in select key, enabled from public.data_retention_rules where action <> 'retain' order by key loop
    if not p_preview and not r.enabled then continue; end if;
    begin
      n := public.retention_apply(r.key, p_preview);
      res := res || jsonb_build_object(r.key, jsonb_build_object('rows', n, 'enabled', r.enabled));
    exception when others then
      res := res || jsonb_build_object(r.key, jsonb_build_object('error', left(sqlerrm, 200)));
    end;
  end loop;
  update public.retention_runs set finished_at = now(), results = res where id = rid;
  if not p_preview then insert into public.audit_events(actor_type, event, metadata) values ('system', 'privacy.retention_swept', jsonb_build_object('run_id', rid, 'results', res)); end if;
  return jsonb_build_object('run_id', rid, 'preview', p_preview, 'results', res);
end $$;

create or replace function public.job_privacy_retention_sweep(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return public.retention_sweep_run(false);
end $$;

-- Admin: preview counts (changes nothing) and edit a rule (audited). Enabling a legal-review rule needs that review recorded.
create or replace function public.privacy_retention_preview() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.privacy_admin_can_read() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return public.retention_sweep_run(true);
end $$;

create or replace function public.data_retention_rule_set(p_key text, p_enabled boolean, p_days integer, p_reason text, p_legal_reviewed boolean default false) returns integer
language plpgsql security definer set search_path = '' as $$
declare r public.data_retention_rules;
begin
  perform public.privacy_admin_require(p_reason);
  select * into r from public.data_retention_rules where key = p_key for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if coalesce(p_enabled, r.enabled) and r.legal_review_required and not coalesce(p_legal_reviewed, false) then raise exception 'legal_review_required' using errcode = '22023'; end if;
  if p_days is not null and p_days < 1 then raise exception 'invalid_days' using errcode = '22023'; end if;
  update public.data_retention_rules set enabled = coalesce(p_enabled, enabled), retention_days = coalesce(p_days, retention_days),
    legal_review_required = case when coalesce(p_legal_reviewed, false) then false else legal_review_required end,
    version = version + 1, updated_by = auth.uid(), updated_at = now() where key = p_key returning * into r;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'privacy.retention_rule_changed',
    jsonb_build_object('key', p_key, 'version', r.version, 'enabled', r.enabled, 'days', r.retention_days, 'legal_reviewed', coalesce(p_legal_reviewed, false), 'reason', left(p_reason, 300)));
  return r.version;
end $$;

insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('privacy.retention_sweep', 'db', 'public.job_privacy_retention_sweep', 3, 'Q32: daily; apply enabled data_retention_rules (legal holds excluded), record retention_runs')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, description = excluded.description, updated_at = now();
select cron.unschedule('privacy-retention-sweep') where exists (select 1 from cron.job where jobname = 'privacy-retention-sweep');
select cron.schedule('privacy-retention-sweep', '5 4 * * *',
  $$select public.enqueue_job(p_kind => 'privacy.retention_sweep', p_payload => '{}'::jsonb, p_dedupe_key => 'privacy.retention_sweep:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))$$);

-- ── 8. Privacy audit ──────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.privacy_audit_runs (
  id uuid primary key default gen_random_uuid(),
  run_by uuid,
  report jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.privacy_audit_runs enable row level security;
revoke all on public.privacy_audit_runs from anon, authenticated;
grant select on public.privacy_audit_runs to authenticated;
grant all on public.privacy_audit_runs to service_role;
drop policy if exists privacy_audit_runs_read on public.privacy_audit_runs;
create policy privacy_audit_runs_read on public.privacy_audit_runs for select to authenticated using (public.privacy_admin_can_read());

create or replace function public.privacy_audit_report() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare rep jsonb;
begin
  if not public.privacy_admin_can_read() and auth.uid() is not null then raise exception 'not_authorized' using errcode = '42501'; end if;
  rep := jsonb_build_object(
    'generated_at', now(),
    'tables_total', (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'),
    'tables_classified', (select count(distinct table_name) from public.data_classifications),
    'unclassified_tables', (select coalesce(jsonb_agg(t.table_name order by t.table_name), '[]') from information_schema.tables t
      where t.table_schema = 'public' and t.table_type = 'BASE TABLE' and not exists (select 1 from public.data_classifications c where c.table_name = t.table_name)),
    'personal_without_retention_rule', (select coalesce(jsonb_agg(distinct c.table_name), '[]') from public.data_classifications c
      where c.personal_data and c.retention_key is null),
    'retention_rules', (select jsonb_agg(jsonb_build_object('key', key, 'action', action, 'days', retention_days, 'enabled', enabled, 'legal_review_required', legal_review_required) order by key) from public.data_retention_rules),
    'last_retention_run', (select jsonb_build_object('at', finished_at, 'results', results) from public.retention_runs where not preview order by started_at desc limit 1),
    'privacy_requests_open', (select count(*) from public.privacy_requests where status not in ('completed', 'refused', 'withdrawn')),
    'privacy_requests_overdue', (select count(*) from public.privacy_requests where status not in ('completed', 'refused', 'withdrawn') and due_at < now()),
    'legal_holds_active', (select count(*) from public.legal_holds where status = 'active'),
    'erasures_failed_30d', (select count(*) from public.audit_events where event = 'privacy.erasure_failed' and created_at > now() - interval '30 days'),
    'admin_break_glass_30d', (select count(*) from public.audit_events where event like 'admin.break_glass%' and created_at > now() - interval '30 days'),
    'consent_records', (select count(*) from public.consent_records),
    'legal_review', 'Retention periods, bases and DSAR wording are drafts pending legal review. This report does not certify compliance.');
  insert into public.privacy_audit_runs(run_by, report) values (auth.uid(), rep);
  return rep;
end $$;

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('privacy.legal_hold_placed', 1, 'legal_hold', 'A legal hold was placed (payload: hold_id, subjects).', null),
  ('privacy.legal_hold_released', 1, 'legal_hold', 'A legal hold was released (payload: hold_id, reason).', null),
  ('privacy.retention_swept', 1, 'retention_run', 'The retention schedule ran (payload: run_id, results per rule).', null),
  ('privacy.retention_rule_changed', 1, 'retention_rule', 'A retention rule changed (payload: key, version, enabled, days, legal_reviewed, reason).', null)
on conflict (event_type) do update set description = excluded.description;

-- ── Grants ────────────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.privacy_admin_require(text), public.privacy_admin_can_read(), public.legal_hold_covers(text, uuid), public.legal_hold_covers_user(uuid),
  public.legal_hold_covers_event(uuid), public.legal_hold_place(text, text, jsonb), public.legal_hold_release(uuid, text), public.consent_records_append_only(),
  public.record_consent(text, boolean, text, text), public.my_consents(), public.profiles_marketing_consent_history(), public.privacy_subject_export(),
  public.erase_user_data(uuid), public.retention_apply(text, boolean), public.retention_sweep_run(boolean), public.job_privacy_retention_sweep(public.job_queue),
  public.privacy_retention_preview(), public.data_retention_rule_set(text, boolean, integer, text, boolean), public.privacy_audit_report() from public, anon, authenticated;
-- privacy_admin_can_read is evaluated by RLS policies as the caller.
grant execute on function public.privacy_admin_can_read() to authenticated, service_role;
grant execute on function public.legal_hold_place(text, text, jsonb), public.legal_hold_release(uuid, text), public.record_consent(text, boolean, text, text),
  public.my_consents(), public.privacy_subject_export(), public.privacy_retention_preview(), public.data_retention_rule_set(text, boolean, integer, text, boolean),
  public.privacy_audit_report() to authenticated, service_role;
grant execute on function public.legal_hold_covers(text, uuid), public.legal_hold_covers_user(uuid), public.legal_hold_covers_event(uuid), public.erase_user_data(uuid),
  public.retention_apply(text, boolean), public.retention_sweep_run(boolean), public.job_privacy_retention_sweep(public.job_queue) to service_role;
