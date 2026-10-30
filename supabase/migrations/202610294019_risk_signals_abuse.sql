-- Q33 Fraud / Abuse (backend domains 211–212). Lane D, 2026-10-29. Additive, backward-compatible.
-- Builds on Q22 ticket_risk_flags / checkout_risk_check, hit_rate_limit and the Q08 trust cases / enforcement / appeals.
--   1. risk_rules: data-driven thresholds and phrase lists (versioned; admin-editable with audit).
--   2. risk_signals: ONE review queue across account, payment, ticket, listing, provider, message, review, promotion and payout
--      abuse. Signals are evidence for a human decision. Detection never bans, deletes, hides or blocks by itself.
--   3. risk_holds: the only automatic consequences, both reversible, both visible to the subject (notification + my_risk_holds):
--        • payout hold — blocks Gala Dock-controlled payout releases (promoter payout approve / mark paid, resale seller refunds,
--          payout_eligible) until review. It never moves money and cannot touch Stripe-managed payouts of a seller's own
--          connected account (FCA direct-charge model: those funds are the seller's);
--        • step-up hold — sensitive actions (require_step_up) need a verified second factor (aal2) until review.
--   4. Admin commands (admin_require: trust permission + MFA + reason, audited): decide signal (clear / action / escalate to a trust
--      case), place / release holds, edit rules. Subjects can appeal a hold once (trust case queue 'appeal').
--   5. Detectors (triggers; never fail the write that fired them): off-platform payment / contact phrases and messaging velocity
--      (flag only), review velocity and same-device / provider-device reviews, duplicate / bursty / contact-laden listings,
--      shared-client promo-code use, account takeover (new device + password change + payout-destination change in a window →
--      step-up + payout hold), ticket risk flags and disputes mirrored in.
-- Risk evidence is admin-only (RLS). Subjects see that a hold exists and its plain reason, never thresholds or matched evidence.

-- ── 1. Rules ──────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.risk_rules (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  domain text not null,
  enabled boolean not null default true,
  severity text not null check (severity in ('info', 'review', 'hold')),
  params jsonb not null default '{}',
  version integer not null default 1,
  description text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.risk_rules enable row level security;
revoke all on public.risk_rules from anon, authenticated;
grant select on public.risk_rules to authenticated;
grant all on public.risk_rules to service_role;
drop policy if exists risk_rules_read on public.risk_rules;
create policy risk_rules_read on public.risk_rules for select to authenticated using (public.has_admin_permission('trust'));

insert into public.risk_rules(key, domain, severity, params, description) values
  ('message.off_platform_payment', 'message', 'review', jsonb_build_object('patterns', jsonb_build_array(
     'bank\s*transfer', 'sort\s*code', '\miban\M', 'pay\s+(me\s+)?direct(ly)?', 'pay\s+(me\s+)?(in\s+)?cash', 'paypal', 'revolut', 'monzo', 'venmo', 'cash\s*app',
     'western\s+union', 'bitcoin|\mbtc\M|\musdt\M|crypto', 'outside\s+(of\s+)?(gala\s*dock|the\s+(platform|app|site))', 'off[-\s]?platform',
     'avoid\s+(the\s+)?(fees?|commission)', 'whats\s*app\s+me', 'telegram')),
   'Messages that steer payment off Gala Dock. Flag only; the message is delivered.'),
  ('message.contact_details', 'message', 'info', jsonb_build_object('patterns', jsonb_build_array(
     '(\+44\s?7\d{3}|\m07\d{3})\s?\d{3}\s?\d{3}', '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}')),
   'Phone numbers / email addresses in messages (context for off-platform review). Flag only.'),
  ('message.spam_velocity', 'message', 'review', '{"messages_10m": 40, "conversations_10m": 12}', 'One sender, many messages or conversations in 10 minutes. Flag only.'),
  ('review.velocity', 'review', 'review', '{"reviews_24h": 5}', 'A listing received many reviews in 24 hours.'),
  ('review.same_device', 'review', 'review', '{"window_days": 30}', 'Reviews of one listing from the same device, or from a device a member of the reviewed workspace used.'),
  ('listing.duplicate_description', 'listing', 'review', '{"min_length": 80}', 'A published description identical to another workspace''s listing.'),
  ('listing.new_workspace_burst', 'listing', 'review', '{"listings_24h": 5, "workspace_age_days": 7}', 'A new workspace publishing many listings at once.'),
  ('listing.contact_in_description', 'listing', 'info', jsonb_build_object('patterns', jsonb_build_array(
     '(\+44\s?7\d{3}|\m07\d{3})\s?\d{3}\s?\d{3}', '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}', 'whats\s*app', 'bank\s*transfer')),
   'Contact or payment details in a public listing description.'),
  ('promotion.shared_client_code', 'promotion', 'review', '{"accounts_24h": 4}', 'One promo code used by many accounts from the same browser/device.'),
  ('account.takeover', 'account', 'hold', '{"window_hours": 24, "kinds": ["new_device", "password_changed", "payout_changed"]}',
   'New device + password change + payout-destination change in a short window: step-up and payout hold until review.'),
  ('payment.chargeback', 'payment', 'review', '{}', 'Card dispute on a marketplace or ticket payment.')
on conflict (key) do nothing;

create or replace function public.risk_rule(p_key text) returns public.risk_rules
language sql stable security definer set search_path = '' as $$
  select * from public.risk_rules where key = p_key and enabled
$$;

-- ── 2. Signals ────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.risk_signals (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('account', 'payment', 'ticket', 'listing', 'provider', 'message', 'review', 'referral', 'promotion', 'payout', 'signup', 'bot')),
  kind text not null check (kind ~ '^[a-z_]+$'),
  rule_key text,
  rule_version integer,
  subject_type text not null check (subject_type in ('user', 'workspace', 'listing', 'review', 'message', 'order', 'payout', 'event', 'code')),
  subject_id text not null,
  user_id uuid,
  workspace_id uuid,
  event_id uuid,
  severity text not null check (severity in ('info', 'review', 'hold')),
  score integer not null default 50 check (score between 0 and 100),
  source text not null default 'rule' check (source in ('rule', 'report', 'webhook', 'admin', 'system', 'ticket_flag')),
  evidence jsonb not null default '{}',
  dedupe_key text not null unique,
  occurrences integer not null default 1,
  last_seen_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'cleared', 'actioned', 'expired')),
  case_id uuid references public.trust_cases(id) on delete set null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists risk_signals_queue_idx on public.risk_signals(status, severity, created_at desc);
create index if not exists risk_signals_user_idx on public.risk_signals(user_id, created_at desc) where user_id is not null;
create index if not exists risk_signals_ws_idx on public.risk_signals(workspace_id, created_at desc) where workspace_id is not null;
alter table public.risk_signals enable row level security;
revoke all on public.risk_signals from anon, authenticated;
grant select on public.risk_signals to authenticated;
grant all on public.risk_signals to service_role;
drop policy if exists risk_signals_read on public.risk_signals;
create policy risk_signals_read on public.risk_signals for select to authenticated using (public.has_admin_permission('trust'));

create or replace function public.risk_severity_rank(p text) returns integer language sql immutable set search_path = '' as $$
  select case p when 'hold' then 3 when 'review' then 2 else 1 end
$$;

-- Service-only. Idempotent per dedupe key: repeats bump occurrences; a higher severity re-opens a reviewed signal.
create or replace function public.risk_raise(p_domain text, p_kind text, p_subject_type text, p_subject_id text, p_severity text, p_dedupe text,
  p_evidence jsonb default '{}', p_user uuid default null, p_workspace uuid default null, p_event uuid default null, p_score integer default 50,
  p_source text default 'rule', p_rule text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid; inserted boolean; rv integer;
begin
  if coalesce(p_dedupe, '') = '' or coalesce(p_subject_id, '') = '' then raise exception 'invalid_signal' using errcode = '22023'; end if;
  select version into rv from public.risk_rules where key = p_rule;
  insert into public.risk_signals(domain, kind, rule_key, rule_version, subject_type, subject_id, user_id, workspace_id, event_id, severity, score, source, evidence, dedupe_key)
    values (p_domain, p_kind, p_rule, rv, p_subject_type, p_subject_id, p_user, p_workspace, p_event, p_severity, greatest(0, least(100, coalesce(p_score, 50))), p_source, coalesce(p_evidence, '{}'), p_dedupe)
  on conflict (dedupe_key) do update set occurrences = public.risk_signals.occurrences + 1, last_seen_at = now(), updated_at = now(),
    evidence = public.risk_signals.evidence || excluded.evidence,
    severity = case when public.risk_severity_rank(excluded.severity) > public.risk_severity_rank(public.risk_signals.severity) then excluded.severity else public.risk_signals.severity end,
    status = case when public.risk_signals.status in ('cleared', 'expired') and public.risk_severity_rank(excluded.severity) > public.risk_severity_rank(public.risk_signals.severity) then 'open' else public.risk_signals.status end
  returning id, (xmax = 0) into sid, inserted;
  if inserted then
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', p_workspace, 'risk.signal_raised',
      jsonb_build_object('signal_id', sid, 'domain', p_domain, 'kind', p_kind, 'severity', p_severity, 'subject_type', p_subject_type));
  end if;
  return sid;
end $$;

-- ── 3. Holds ──────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.risk_holds (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('payout', 'step_up')),
  subject_type text not null check (subject_type in ('user', 'workspace')),
  subject_id uuid not null,
  reason_code text not null check (reason_code ~ '^[a-z_]+$'),
  reason_label text not null,
  signal_id uuid references public.risk_signals(id) on delete set null,
  source text not null check (source in ('rule', 'admin')),
  status text not null default 'active' check (status in ('active', 'released')),
  placed_by uuid,
  placed_at timestamptz not null default now(),
  expires_at timestamptz,
  appeal_case_id uuid references public.trust_cases(id) on delete set null,
  released_by uuid,
  released_at timestamptz,
  release_reason text,
  updated_at timestamptz not null default now()
);
create unique index if not exists risk_holds_active_uq on public.risk_holds(kind, subject_type, subject_id, reason_code) where status = 'active';
create index if not exists risk_holds_subject_idx on public.risk_holds(subject_type, subject_id) where status = 'active';
alter table public.risk_holds enable row level security;
revoke all on public.risk_holds from anon, authenticated;
grant select on public.risk_holds to authenticated;
grant all on public.risk_holds to service_role;
drop policy if exists risk_holds_read on public.risk_holds;
create policy risk_holds_read on public.risk_holds for select to authenticated using (public.has_admin_permission('trust'));

create or replace function public.risk_hold_active(p_kind text, p_subject_type text, p_subject_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_subject_id is not null and exists (select 1 from public.risk_holds h where h.kind = p_kind and h.subject_type = p_subject_type and h.subject_id = p_subject_id
    and h.status = 'active' and (h.expires_at is null or h.expires_at > now()))
$$;

-- Internal: place (idempotent per kind + subject + reason) and tell the subject. Never silent.
create or replace function public.risk_hold_place_internal(p_kind text, p_subject_type text, p_subject_id uuid, p_reason_code text, p_reason_label text,
  p_signal uuid, p_source text, p_expires timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare hid uuid; ws uuid; who uuid;
begin
  if p_subject_id is null then raise exception 'invalid_subject' using errcode = '22023'; end if;
  select id into hid from public.risk_holds where kind = p_kind and subject_type = p_subject_type and subject_id = p_subject_id and reason_code = p_reason_code and status = 'active';
  if hid is not null then return hid; end if;
  insert into public.risk_holds(kind, subject_type, subject_id, reason_code, reason_label, signal_id, source, placed_by, expires_at)
    values (p_kind, p_subject_type, p_subject_id, p_reason_code, left(p_reason_label, 300), p_signal, p_source, auth.uid(), p_expires) returning id into hid;
  ws := case when p_subject_type = 'workspace' then p_subject_id end;
  who := case when p_subject_type = 'user' then p_subject_id end;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), case when auth.uid() is null then 'system' else 'admin' end, ws, 'risk.hold_placed',
    jsonb_build_object('hold_id', hid, 'kind', p_kind, 'subject_type', p_subject_type, 'subject_id', p_subject_id, 'reason_code', p_reason_code, 'signal_id', p_signal));
  if who is not null then
    perform public.notify(who, 'security', case p_kind when 'payout' then 'Payouts paused for a security review' else 'Extra verification needed on your account' end,
      left(p_reason_label, 300) || ' You can ask for a review from your account security page.', '/account?tab=security', 'risk.hold:' || hid);
  elsif ws is not null then
    perform public.trust_notify_workspace(ws, 'trust_enforcement', 'Payouts paused for a security review',
      left(p_reason_label, 300) || ' You can ask for a review from Settings.', '/provider/settings#credentials', 'risk.hold:' || hid);
  end if;
  return hid;
end $$;

create or replace function public.risk_hold_release_internal(p_hold uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.risk_holds;
begin
  update public.risk_holds set status = 'released', released_by = auth.uid(), released_at = now(), release_reason = left(p_reason, 500), updated_at = now()
    where id = p_hold and status = 'active' returning * into h;
  if not found then raise exception 'not_active' using errcode = '22023'; end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), case when auth.uid() is null then 'system' else 'admin' end,
    case when h.subject_type = 'workspace' then h.subject_id end, 'risk.hold_released',
    jsonb_build_object('hold_id', h.id, 'kind', h.kind, 'subject_type', h.subject_type, 'subject_id', h.subject_id, 'reason', left(p_reason, 300)));
  if h.subject_type = 'user' then
    perform public.notify(h.subject_id, 'security', 'Security review complete', 'The hold on your account has been lifted.', '/account?tab=security', 'risk.hold_released:' || h.id);
  else
    perform public.trust_notify_workspace(h.subject_id, 'trust_enforcement', 'Security review complete', 'The payout hold has been lifted.', '/provider/settings#credentials', 'risk.hold_released:' || h.id);
  end if;
end $$;

-- ── 4. Admin commands (trust permission, MFA, reason; audited) ─────────────────────────────────────────────────────────
create or replace function public.risk_signal_decide(p_signal uuid, p_decision text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.risk_signals; cid uuid; n integer; h record; st text; subj_type text; subj uuid;
begin
  perform public.admin_require('trust', p_reason);
  if p_decision not in ('clear', 'action', 'escalate') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  select * into s from public.risk_signals where id = p_signal for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_decision = 'escalate' then
    if s.case_id is not null then return jsonb_build_object('ok', true, 'case_id', s.case_id, 'changed', false); end if;
    subj_type := case when s.workspace_id is not null and s.subject_type <> 'user' then 'workspace' else 'user' end;
    subj := case when subj_type = 'workspace' then s.workspace_id else s.user_id end;
    if subj is null and s.subject_type in ('listing', 'review') then subj_type := s.subject_type; subj := s.subject_id::uuid; end if;
    if subj is null then raise exception 'subject_unknown' using errcode = '22023'; end if;
    select coalesce(max(substring(reference from '^TS-(\d+)$')::int), 8600) + 1 into n from public.trust_cases where reference ~ '^TS-\d+$';
    insert into public.trust_cases(reference, queue, category, subject_type, subject_id, subject_name, risk_score, status, reason, evidence, related)
      values ('TS-' || n, 'fraud', 'Risk: ' || s.domain || ' / ' || s.kind, subj_type, subj, left(coalesce((select name from public.workspaces where id = s.workspace_id), 'Account'), 160),
        s.score, 'open', left(trim(p_reason), 2000), jsonb_build_array(jsonb_build_object('kind', 'risk_signal', 'label', s.kind, 'at', now())),
        jsonb_build_object('risk_signal_id', s.id))
      returning id into cid;
    update public.risk_signals set case_id = cid, updated_at = now() where id = s.id;
  else
    st := case p_decision when 'clear' then 'cleared' else 'actioned' end;
    update public.risk_signals set status = st, reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(trim(p_reason), 500), updated_at = now() where id = s.id;
    -- Clearing releases the holds this signal caused and lifts a mirrored ticket checkout pause.
    if p_decision = 'clear' then
      for h in select id from public.risk_holds where signal_id = s.id and status = 'active' loop perform public.risk_hold_release_internal(h.id, 'signal cleared: ' || p_reason); end loop;
      if s.source = 'ticket_flag' then
        update public.ticket_risk_flags set status = 'cleared', reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_reason, 500),
          expires_at = least(coalesce(expires_at, now()), now()) where id = (s.evidence->>'ticket_flag_id')::uuid and status = 'open';
      end if;
    elsif s.source = 'ticket_flag' then
      update public.ticket_risk_flags set status = 'actioned', reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_reason, 500)
        where id = (s.evidence->>'ticket_flag_id')::uuid and status = 'open';
    end if;
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', s.workspace_id, 'risk.signal_reviewed',
    jsonb_build_object('signal_id', s.id, 'decision', p_decision, 'domain', s.domain, 'kind', s.kind, 'case_id', cid));
  return jsonb_build_object('ok', true, 'decision', p_decision, 'case_id', cid);
end $$;

create or replace function public.risk_hold_place(p_kind text, p_subject_type text, p_subject_id uuid, p_reason text, p_signal uuid default null, p_expires timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('trust', p_reason);
  if p_kind not in ('payout', 'step_up') or p_subject_type not in ('user', 'workspace') then raise exception 'invalid_hold' using errcode = '22023'; end if;
  if p_subject_type = 'user' and not exists (select 1 from auth.users where id = p_subject_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_subject_type = 'workspace' and not exists (select 1 from public.workspaces where id = p_subject_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_expires is not null and p_expires <= now() then raise exception 'invalid_end' using errcode = '22023'; end if;
  return public.risk_hold_place_internal(p_kind, p_subject_type, p_subject_id, 'admin_review',
    'Gala Dock Trust & Safety is reviewing recent activity.', p_signal, 'admin', p_expires);
end $$;

create or replace function public.risk_hold_release(p_hold uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('trust', p_reason);
  perform public.risk_hold_release_internal(p_hold, p_reason);
end $$;

create or replace function public.risk_rule_set(p_key text, p_enabled boolean, p_params jsonb, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare r public.risk_rules;
begin
  perform public.admin_require('trust', p_reason);
  if p_params is not null and jsonb_typeof(p_params) <> 'object' then raise exception 'invalid_params' using errcode = '22023'; end if;
  update public.risk_rules set enabled = coalesce(p_enabled, enabled), params = coalesce(p_params, params), version = version + 1, updated_by = auth.uid(), updated_at = now()
    where key = p_key returning * into r;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'risk.rule_changed',
    jsonb_build_object('key', p_key, 'version', r.version, 'enabled', r.enabled, 'reason', left(p_reason, 300)));
  return r.version;
end $$;

-- ── 5. Subject view + appeal ──────────────────────────────────────────────────────────────────────────────────────────
-- The caller's own holds (and holds on workspaces they manage). Plain reason only: no evidence, thresholds or signal details.
create or replace function public.my_risk_holds() returns table (id uuid, kind text, subject_type text, subject_id uuid, reason text, status text, placed_at timestamptz, appeal_status text)
language sql stable security definer set search_path = '' as $$
  select h.id, h.kind, h.subject_type, h.subject_id, h.reason_label, h.status, h.placed_at, c.status
  from public.risk_holds h left join public.trust_cases c on c.id = h.appeal_case_id
  where (h.subject_type = 'user' and h.subject_id = (select auth.uid())) or (h.subject_type = 'workspace' and public.has_permission(h.subject_id, 'settings.manage'))
  order by h.placed_at desc limit 50
$$;

create or replace function public.risk_hold_appeal(p_hold uuid, p_statement text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare h public.risk_holds; n integer; cid uuid;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_statement, ''))) < 20 then raise exception 'statement_too_short' using errcode = '22023'; end if;
  select * into h from public.risk_holds where id = p_hold for update;
  if not found or not ((h.subject_type = 'user' and h.subject_id = auth.uid()) or (h.subject_type = 'workspace' and public.has_permission(h.subject_id, 'settings.manage'))) then
    raise exception 'not_found' using errcode = 'P0002';  -- no existence leak
  end if;
  if h.status <> 'active' then raise exception 'not_active' using errcode = '22023'; end if;
  if h.appeal_case_id is not null then raise exception 'already_appealed' using errcode = '23505'; end if;
  if not public.hit_rate_limit('risk_appeal:' || auth.uid(), 5, 86400) then raise exception 'rate_limited' using errcode = '54000'; end if;
  select coalesce(max(substring(reference from '^TS-(\d+)$')::int), 8600) + 1 into n from public.trust_cases where reference ~ '^TS-\d+$';
  insert into public.trust_cases(reference, queue, category, subject_type, subject_id, subject_name, risk_score, status, reason, evidence, related)
    values ('TS-' || n, 'appeal', 'Appeal ' || h.kind || ' hold', h.subject_type, h.subject_id,
      left(coalesce((select name from public.workspaces where id = h.subject_id), 'Account holder'), 160), 20, 'open', left(trim(p_statement), 2000),
      jsonb_build_array(jsonb_build_object('kind', 'appeal', 'label', 'Appeal statement received', 'at', now())), jsonb_build_object('risk_hold_id', h.id))
    returning id into cid;
  update public.risk_holds set appeal_case_id = cid, updated_at = now() where id = h.id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', case when h.subject_type = 'workspace' then h.subject_id end,
    'risk.appeal_opened', jsonb_build_object('hold_id', h.id, 'case_id', cid));
  return cid;
end $$;

create or replace function public.risk_appeal_decide(p_case uuid, p_outcome text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.trust_cases; h public.risk_holds;
begin
  perform public.admin_require('trust', p_reason);
  if p_outcome not in ('upheld', 'overturned') then raise exception 'invalid_outcome' using errcode = '22023'; end if;
  select * into c from public.trust_cases where id = p_case and queue = 'appeal' for update;
  if not found or (c.related->>'risk_hold_id') is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status in ('actioned', 'dismissed') then raise exception 'already_decided' using errcode = '22023'; end if;
  select * into h from public.risk_holds where id = (c.related->>'risk_hold_id')::uuid;
  if p_outcome = 'overturned' then
    if h.status = 'active' then perform public.risk_hold_release_internal(h.id, 'appeal overturned: ' || p_reason); end if;
    update public.risk_signals set status = 'cleared', reviewed_by = auth.uid(), reviewed_at = now(), review_note = left('appeal overturned: ' || p_reason, 500), updated_at = now()
      where id = h.signal_id and status in ('open', 'actioned');
  end if;
  update public.trust_cases set status = case when p_outcome = 'overturned' then 'actioned' else 'dismissed' end, decision = p_outcome || ': ' || trim(p_reason),
    decided_by = auth.uid(), decided_at = now(), updated_at = now() where id = c.id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', case when h.subject_type = 'workspace' then h.subject_id end,
    'risk.appeal_decided', jsonb_build_object('case_id', c.id, 'hold_id', h.id, 'outcome', p_outcome));
  if h.subject_type = 'user' then
    perform public.notify(h.subject_id, 'security', 'Your review request was decided', left(trim(p_reason), 300), '/account?tab=security', 'risk.appeal:' || c.id);
  end if;
end $$;

-- ── 6. Hold enforcement on Gala Dock-controlled releases ─────────────────────────────────────────────────────────────
create or replace function public.payout_eligible(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.payouts_enabled and c.transfers_capability = 'active' and c.disabled_reason is null
                     and cardinality(c.requirements_past_due) = 0
                   from public.connect_accounts c where c.workspace_id = p_workspace), false)
    and not public.risk_hold_active('payout', 'workspace', p_workspace);
$$;

create or replace function public.promoter_payout_hold_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pr record;
begin
  if new.status in ('payable', 'paid') and new.status is distinct from old.status then
    select p.user_id, e.workspace_id into pr from public.promoters p join public.events e on e.id = p.event_id where p.id = new.promoter_id;
    if public.risk_hold_active('payout', 'user', pr.user_id) or public.risk_hold_active('payout', 'workspace', pr.workspace_id) then
      raise exception 'payout_hold_active' using errcode = '55000', hint = 'A security review is in progress; payouts resume when it is complete.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists promoter_payout_hold_guard on public.promoter_payouts;
create trigger promoter_payout_hold_guard before update of status on public.promoter_payouts for each row execute function public.promoter_payout_hold_guard();

-- Resale seller refunds (organiser buy-back compensation) wait while the seller is on a payout hold.
create or replace function public.claim_resale_refunds(p_limit integer default 10) returns setof public.resale_payouts
language plpgsql security definer set search_path = '' as $$
declare p public.resale_payouts; o public.checkout_orders; count_claimed integer := 0;
begin
 for p in select * from public.resale_payouts where status = 'pending'
  or (status = 'processing' and updated_at < now() - interval '10 minutes')
  or (status = 'failed' and updated_at < now() - interval '1 hour') order by created_at for update skip locked loop
  exit when count_claimed >= greatest(1, least(p_limit, 25));
  if public.risk_hold_active('payout', 'user', p.seller_id) then continue; end if;
  select * into o from public.checkout_orders where order_ref = p.original_order_ref for update skip locked;
  if not found or o.buyer_id is distinct from p.seller_id or o.status <> 'issued' then continue; end if;
  if p.status = 'pending' and o.refund_status <> 'none' then continue; end if;
  -- Serialize all partial refunds of a purchase. Cancellation waits for an in-flight resale request to settle.
  if exists(select 1 from public.resale_payouts x where x.original_order_ref = o.order_ref and x.id <> p.id and x.status = 'processing') then continue; end if;
  update public.resale_payouts set status = 'processing', updated_at = now(), refund_error = null where id = p.id returning * into p;
  count_claimed := count_claimed + 1; return next p;
 end loop;
end $$;

create or replace function public.claim_resale_refund(p_job uuid) returns setof public.resale_payouts
language plpgsql security definer set search_path = '' as $$
declare p public.resale_payouts; o public.checkout_orders;
begin
 select * into p from public.resale_payouts where id = p_job and status = 'pending' for update skip locked;
 if not found or public.risk_hold_active('payout', 'user', p.seller_id) then return; end if;
 select * into o from public.checkout_orders where order_ref = p.original_order_ref for update skip locked;
 if not found or o.buyer_id is distinct from p.seller_id or o.status <> 'issued' or o.refund_status <> 'none' then return; end if;
 if not public.resale_refund_ready(p.id) or exists(select 1 from public.resale_payouts where original_order_ref = o.order_ref and id <> p.id and status = 'processing') then return; end if;
 update public.resale_payouts set status = 'processing', updated_at = now(), refund_error = null where id = p.id returning * into p;
 return next p;
end $$;

-- Step-up hold: after an account-takeover pattern, sensitive actions need a verified second factor until review.
create or replace function public.require_step_up(p_workspace uuid default null) returns void
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_role text; v_policy text;
begin
  if uid is null then return; end if;
  if not public.session_is_live() then raise exception 'session_revoked' using errcode = '42501'; end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then return; end if;
  if exists (select 1 from auth.mfa_factors f where f.user_id = uid and f.status = 'verified') then
    raise exception 'step_up_required' using errcode = '42501', hint = 'Verify your second factor, then retry.';
  end if;
  if public.risk_hold_active('step_up', 'user', uid) then
    raise exception 'account_review_hold' using errcode = '42501', hint = 'Set up two-step verification or wait for the security review to finish.';
  end if;
  if p_workspace is not null then
    select case when w.owner_id = uid then 'owner' else m.role end, coalesce(w.settings -> 'security' ->> 'mfa_policy', 'optional')
      into v_role, v_policy
      from public.workspaces w left join public.workspace_members m on m.workspace_id = w.id and m.user_id = uid and m.status = 'active'
     where w.id = p_workspace;
    if v_role is not null and public.mfa_required(v_policy, v_role) then
      raise exception 'mfa_required' using errcode = '42501', hint = 'This workspace requires two-step verification for your role.';
    end if;
  end if;
end
$$;

-- ── 7. Detectors ──────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.risk_matches(p_text text, p_rule text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.idx), '[]') from (
    select (p.ord - 1)::int idx from public.risk_rules r, jsonb_array_elements_text(r.params->'patterns') with ordinality p(pat, ord)
    where r.key = p_rule and r.enabled and coalesce(p_text, '') ~* p.pat) x
$$;

-- Messages: flag only. Evidence is the matched rule pattern indexes and the message id, never the body.
create or replace function public.risk_scan_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m jsonb; r public.risk_rules; n int; c int;
begin
  begin
    if new.sender_id is null or coalesce(new.body, '') = '' then return null; end if;
    m := public.risk_matches(new.body, 'message.off_platform_payment');
    if jsonb_array_length(m) > 0 then
      perform public.risk_raise('message', 'off_platform_payment', 'message', new.id::text, 'review', 'msg_offplatform:' || new.id,
        jsonb_build_object('patterns', m, 'conversation_id', new.conversation_id, 'contact', jsonb_array_length(public.risk_matches(new.body, 'message.contact_details')) > 0),
        new.sender_id, new.sender_workspace_id, null, 60, 'rule', 'message.off_platform_payment');
    end if;
    r := public.risk_rule('message.spam_velocity');
    if r.key is not null then
      select count(*), count(distinct conversation_id) into n, c from public.conversation_messages where sender_id = new.sender_id and created_at > now() - interval '10 minutes';
      if n >= coalesce((r.params->>'messages_10m')::int, 40) or c >= coalesce((r.params->>'conversations_10m')::int, 12) then
        perform public.risk_raise('message', 'spam_velocity', 'user', new.sender_id::text, 'review',
          'msg_velocity:' || new.sender_id || ':' || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24'),
          jsonb_build_object('messages_10m', n, 'conversations_10m', c), new.sender_id, new.sender_workspace_id, null, 55, 'rule', 'message.spam_velocity');
      end if;
    end if;
  exception when others then
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'risk.detector_failed', jsonb_build_object('detector', 'message', 'error', left(sqlerrm, 200)));
  end;
  return null;
end $$;
drop trigger if exists risk_scan_message on public.conversation_messages;
create trigger risk_scan_message after insert on public.conversation_messages for each row execute function public.risk_scan_message();

-- Reviews: device provenance (hashes only) + velocity + same device / provider device.
create table if not exists public.review_provenance (
  review_id uuid primary key references public.reviews(id) on delete cascade,
  listing_id uuid,
  user_id uuid,
  device_hash text,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists review_provenance_listing_idx on public.review_provenance(listing_id, created_at);
alter table public.review_provenance enable row level security;
revoke all on public.review_provenance from anon, authenticated;
grant all on public.review_provenance to service_role;

create or replace function public.risk_scan_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sess record; dh text; ih text; r public.risk_rules; n int; ws uuid; win interval; dup int; prov boolean;
begin
  begin
    ws := public.listing_workspace(new.listing_id);
    select s.ip, s.user_agent into sess from auth.sessions s where s.id::text = coalesce(auth.jwt() ->> 'session_id', '') limit 1;
    if sess.ip is not null then
      ih := encode(sha256(convert_to('ip|' || host(sess.ip), 'UTF8')), 'hex');
      dh := encode(sha256(convert_to('dev|' || host(sess.ip) || '|' || coalesce(sess.user_agent, ''), 'UTF8')), 'hex');
    end if;
    insert into public.review_provenance(review_id, listing_id, user_id, device_hash, ip_hash) values (new.id, new.listing_id, new.user_id, dh, ih) on conflict do nothing;
    r := public.risk_rule('review.velocity');
    if r.key is not null and new.listing_id is not null then
      select count(*) into n from public.reviews where listing_id = new.listing_id and created_at > now() - interval '24 hours';
      if n >= coalesce((r.params->>'reviews_24h')::int, 5) then
        perform public.risk_raise('review', 'review_velocity', 'listing', new.listing_id::text, 'review', 'review_velocity:' || new.listing_id || ':' || to_char(now(), 'YYYYMMDD'),
          jsonb_build_object('reviews_24h', n), null, ws, null, 55, 'rule', 'review.velocity');
      end if;
    end if;
    r := public.risk_rule('review.same_device');
    if r.key is not null and dh is not null then
      win := make_interval(days => coalesce((r.params->>'window_days')::int, 30));
      select count(*) into dup from public.review_provenance p where p.listing_id = new.listing_id and p.review_id <> new.id and p.user_id is distinct from new.user_id
        and p.device_hash = dh and p.created_at > now() - win;
      select exists (select 1 from auth.sessions s where host(s.ip) = host(sess.ip) and s.created_at > now() - win and s.user_id <> new.user_id
        and s.user_id in (select m.user_id from public.workspace_members m where m.workspace_id = ws and m.status = 'active' union select w.owner_id from public.workspaces w where w.id = ws)) into prov;
      if dup > 0 or prov then
        perform public.risk_raise('review', case when prov then 'review_provider_device' else 'review_same_device' end, 'review', new.id::text, 'review', 'review_device:' || new.id,
          jsonb_build_object('same_device_reviews', dup, 'provider_device', prov), new.user_id, ws, null, case when prov then 75 else 60 end, 'rule', 'review.same_device');
      end if;
    end if;
  exception when others then
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'risk.detector_failed', jsonb_build_object('detector', 'review', 'error', left(sqlerrm, 200)));
  end;
  return null;
end $$;
drop trigger if exists risk_scan_review on public.reviews;
create trigger risk_scan_review after insert on public.reviews for each row execute function public.risk_scan_review();

-- Listings: fake / low-quality listing and provider signals, evaluated when a listing is (re)published or its text changes.
create or replace function public.risk_scan_listing() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.risk_rules; norm text; n int; age int; m jsonb;
begin
  begin
    if not new.published then return null; end if;
    if tg_op = 'UPDATE' and old.published and new.description is not distinct from old.description and new.name is not distinct from old.name then return null; end if;
    norm := lower(regexp_replace(coalesce(new.description, ''), '\s+', ' ', 'g'));
    r := public.risk_rule('listing.duplicate_description');
    if r.key is not null and length(norm) >= coalesce((r.params->>'min_length')::int, 80) then
      select count(*) into n from public.listings l where l.workspace_id <> new.workspace_id and l.published and lower(regexp_replace(coalesce(l.description, ''), '\s+', ' ', 'g')) = norm;
      if n > 0 then
        perform public.risk_raise('listing', 'duplicate_description', 'listing', new.id::text, 'review', 'listing_dup:' || new.id || ':' || md5(norm),
          jsonb_build_object('other_workspaces', n), null, new.workspace_id, null, 65, 'rule', 'listing.duplicate_description');
      end if;
    end if;
    r := public.risk_rule('listing.new_workspace_burst');
    if r.key is not null then
      select extract(day from now() - w.created_at)::int into age from public.workspaces w where w.id = new.workspace_id;
      select count(*) into n from public.listings where workspace_id = new.workspace_id and published and created_at > now() - interval '24 hours';
      if age is not null and age < coalesce((r.params->>'workspace_age_days')::int, 7) and n >= coalesce((r.params->>'listings_24h')::int, 5) then
        perform public.risk_raise('provider', 'new_workspace_burst', 'workspace', new.workspace_id::text, 'review', 'listing_burst:' || new.workspace_id || ':' || to_char(now(), 'YYYYMMDD'),
          jsonb_build_object('listings_24h', n, 'workspace_age_days', age), null, new.workspace_id, null, 50, 'rule', 'listing.new_workspace_burst');
      end if;
    end if;
    m := public.risk_matches(coalesce(new.name, '') || ' ' || coalesce(new.description, ''), 'listing.contact_in_description');
    if jsonb_array_length(m) > 0 then
      perform public.risk_raise('listing', 'contact_in_description', 'listing', new.id::text, 'info', 'listing_contact:' || new.id || ':' || md5(norm),
        jsonb_build_object('patterns', m), null, new.workspace_id, null, 35, 'rule', 'listing.contact_in_description');
    end if;
  exception when others then
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'risk.detector_failed', jsonb_build_object('detector', 'listing', 'error', left(sqlerrm, 200)));
  end;
  return null;
end $$;
drop trigger if exists risk_scan_listing on public.listings;
create trigger risk_scan_listing after insert or update of published, description, name on public.listings for each row execute function public.risk_scan_listing();

-- Promo codes: one code, many accounts, one browser fingerprint (client_hash) in 24 h.
create or replace function public.risk_scan_redemption() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.risk_rules; h text; n int;
begin
  begin
    r := public.risk_rule('promotion.shared_client_code');
    if r.key is null then return null; end if;
    select client_hash into h from public.checkout_orders where order_ref = new.order_ref;
    if h is null then return null; end if;
    select count(distinct d.buyer_id) into n from public.discount_redemptions d join public.checkout_orders o on o.order_ref = d.order_ref
      where d.code_id = new.code_id and o.client_hash = h and d.created_at > now() - interval '24 hours';
    if n >= coalesce((r.params->>'accounts_24h')::int, 4) then
      perform public.risk_raise('promotion', 'shared_client_code', 'code', new.code_id::text, 'review', 'promo_shared:' || new.code_id || ':' || h || ':' || to_char(now(), 'YYYYMMDD'),
        jsonb_build_object('accounts_24h', n), new.buyer_id, null, new.event_id, 55, 'rule', 'promotion.shared_client_code');
    end if;
  exception when others then
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'risk.detector_failed', jsonb_build_object('detector', 'promotion', 'error', left(sqlerrm, 200)));
  end;
  return null;
end $$;
drop trigger if exists risk_scan_redemption on public.discount_redemptions;
create trigger risk_scan_redemption after insert on public.discount_redemptions for each row execute function public.risk_scan_redemption();

-- Ticket risk flags (Q22) mirror into the unified queue; chargebacks are payment-domain signals.
create or replace function public.risk_mirror_ticket_flag() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sid uuid; ws uuid;
begin
  begin
    if tg_op = 'INSERT' then
      select workspace_id into ws from public.events where id = new.event_id;
      perform public.risk_raise(case when new.kind = 'chargeback' then 'payment' else 'ticket' end, new.kind,
        case when new.order_ref is not null then 'order' else 'user' end, coalesce(new.order_ref, new.user_id::text, new.id::text),
        case new.severity when 'pause' then 'hold' when 'review' then 'review' else 'info' end, 'ticket_flag:' || new.id,
        new.detail || jsonb_build_object('ticket_flag_id', new.id), new.user_id, ws, new.event_id, case new.severity when 'pause' then 70 when 'review' then 55 else 30 end,
        'ticket_flag', case when new.kind = 'chargeback' then 'payment.chargeback' end);
    elsif new.status is distinct from old.status and new.status in ('cleared', 'actioned') then
      update public.risk_signals set status = new.status, reviewed_by = new.reviewed_by, reviewed_at = coalesce(new.reviewed_at, now()), review_note = new.review_note, updated_at = now()
        where dedupe_key = 'ticket_flag:' || new.id and status = 'open';
    end if;
  exception when others then
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'risk.detector_failed', jsonb_build_object('detector', 'ticket_flag', 'error', left(sqlerrm, 200)));
  end;
  return null;
end $$;
drop trigger if exists risk_mirror_ticket_flag on public.ticket_risk_flags;
create trigger risk_mirror_ticket_flag after insert or update of status on public.ticket_risk_flags for each row execute function public.risk_mirror_ticket_flag();
insert into public.risk_signals(domain, kind, subject_type, subject_id, user_id, workspace_id, event_id, severity, score, source, evidence, dedupe_key, status, created_at)
  select case when f.kind = 'chargeback' then 'payment' else 'ticket' end, f.kind, case when f.order_ref is not null then 'order' else 'user' end,
    coalesce(f.order_ref, f.user_id::text, f.id::text), f.user_id, e.workspace_id, f.event_id,
    case f.severity when 'pause' then 'hold' when 'review' then 'review' else 'info' end, 50, 'ticket_flag', f.detail || jsonb_build_object('ticket_flag_id', f.id),
    'ticket_flag:' || f.id, f.status, f.created_at
  from public.ticket_risk_flags f left join public.events e on e.id = f.event_id
  on conflict (dedupe_key) do nothing;

-- Account takeover: security events → correlation in a window → step-up + payout hold (visible, reversible).
create table if not exists public.account_security_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  kind text not null check (kind in ('new_device', 'password_changed', 'payout_changed', 'email_changed', 'mfa_removed')),
  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists account_security_events_user_idx on public.account_security_events(user_id, created_at desc);
alter table public.account_security_events enable row level security;
revoke all on public.account_security_events from anon, authenticated;
grant all on public.account_security_events to service_role;

create or replace function public.risk_security_event(p_user uuid, p_kind text, p_context jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.risk_rules; kinds text[]; have text[]; sid uuid; w record; holds int := 0;
begin
  if p_user is null then return jsonb_build_object('ok', false); end if;
  insert into public.account_security_events(user_id, kind, context) values (p_user, p_kind, coalesce(p_context, '{}'));
  r := public.risk_rule('account.takeover');
  if r.key is null then return jsonb_build_object('ok', true); end if;
  kinds := array(select jsonb_array_elements_text(coalesce(r.params->'kinds', '["new_device","password_changed","payout_changed"]')));
  select array_agg(distinct kind) into have from public.account_security_events
    where user_id = p_user and created_at > now() - make_interval(hours => coalesce((r.params->>'window_hours')::int, 24)) and kind = any(kinds);
  if not (kinds <@ coalesce(have, '{}')) then return jsonb_build_object('ok', true, 'takeover', false); end if;
  sid := public.risk_raise('account', 'account_takeover', 'user', p_user::text, 'hold', 'ato:' || p_user || ':' || to_char(now(), 'YYYYMMDD'),
    jsonb_build_object('kinds', have), p_user, null, null, 85, 'rule', 'account.takeover');
  perform public.risk_hold_place_internal('step_up', 'user', p_user, 'account_takeover_pattern',
    'We noticed a new device, a password change and a payout change close together, so sensitive actions need two-step verification until we have checked.', sid, 'rule');
  perform public.risk_hold_place_internal('payout', 'user', p_user, 'account_takeover_pattern',
    'Payouts are paused while we check recent changes to your account.', sid, 'rule');
  for w in select id from public.workspaces where owner_id = p_user and status = 'active' loop
    perform public.risk_hold_place_internal('payout', 'workspace', w.id, 'account_takeover_pattern',
      'Payouts are paused while we check recent changes to the owner''s account.', sid, 'rule');
    holds := holds + 1;
  end loop;
  return jsonb_build_object('ok', true, 'takeover', true, 'signal', sid, 'workspace_holds', holds);
end $$;

create or replace function public.risk_from_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    if new.event = 'auth.new_device_login' and new.actor_id is not null then
      perform public.risk_security_event(new.actor_id, 'new_device', jsonb_build_object('audit_id', new.id));
    end if;
  exception when others then null;   -- never block the audit write
  end;
  return null;
end $$;
drop trigger if exists risk_from_audit on public.audit_events;
create trigger risk_from_audit after insert on public.audit_events for each row when (new.event = 'auth.new_device_login') execute function public.risk_from_audit();

create or replace function public.risk_auth_user_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    if new.encrypted_password is distinct from old.encrypted_password and old.encrypted_password is not null then
      perform public.risk_security_event(new.id, 'password_changed', '{}');
    end if;
    if new.email is distinct from old.email and old.email is not null then
      perform public.risk_security_event(new.id, 'email_changed', '{}');
    end if;
  exception when others then null;   -- never block authentication
  end;
  return null;
end $$;
drop trigger if exists gd_risk_auth_user_changed on auth.users;
create trigger gd_risk_auth_user_changed after update of encrypted_password, email on auth.users for each row execute function public.risk_auth_user_changed();

create or replace function public.risk_promoter_payout_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    if new.payout_method is distinct from old.payout_method and new.user_id is not null then
      perform public.risk_security_event(new.user_id, 'payout_changed', jsonb_build_object('promoter_id', new.id));
    end if;
  exception when others then null;
  end;
  return null;
end $$;
drop trigger if exists risk_promoter_payout_changed on public.promoters;
create trigger risk_promoter_payout_changed after update of payout_method on public.promoters for each row execute function public.risk_promoter_payout_changed();

-- Stripe connected account bank/card destination changed (account.external_account.* on the Connect endpoint). Service-only.
create or replace function public.risk_payout_destination_changed(p_account text, p_event text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ws uuid; owner uuid;
begin
  select c.workspace_id, w.owner_id into ws, owner from public.connect_accounts c join public.workspaces w on w.id = c.workspace_id where c.stripe_account_id = p_account;
  if owner is null then return jsonb_build_object('ok', true, 'known', false); end if;
  return public.risk_security_event(owner, 'payout_changed', jsonb_build_object('workspace_id', ws, 'stripe_event', left(p_event, 60)));
end $$;

-- ── 8. Housekeeping job: info signals that nobody actioned expire after 90 days (evidence kept for retention rules) ──
create or replace function public.job_risk_expire(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.risk_signals set status = 'expired', updated_at = now() where status = 'open' and severity = 'info' and last_seen_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return jsonb_build_object('expired', n);
end $$;
insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('risk.expire', 'db', 'public.job_risk_expire', 3, 'Q33: daily; expire stale info-level risk signals')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, description = excluded.description, updated_at = now();
select cron.unschedule('risk-expire') where exists (select 1 from cron.job where jobname = 'risk-expire');
select cron.schedule('risk-expire', '45 3 * * *',
  $$select public.enqueue_job(p_kind => 'risk.expire', p_payload => '{}'::jsonb, p_dedupe_key => 'risk.expire:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))$$);

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('risk.signal_raised', 1, 'risk_signal', 'A fraud/abuse risk signal was raised for review (payload: signal_id, domain, kind, severity, subject_type).', null),
  ('risk.signal_reviewed', 1, 'risk_signal', 'Trust & Safety cleared, actioned or escalated a risk signal (payload: signal_id, decision, domain, kind, case_id).', null),
  ('risk.hold_placed', 1, 'risk_hold', 'A reversible payout or step-up hold was placed (payload: hold_id, kind, subject_type, subject_id, reason_code, signal_id).', null),
  ('risk.hold_released', 1, 'risk_hold', 'A payout or step-up hold was released (payload: hold_id, kind, subject_type, subject_id, reason).', null),
  ('risk.appeal_opened', 1, 'risk_hold', 'The subject of a hold asked for a review (payload: hold_id, case_id).', null),
  ('risk.appeal_decided', 1, 'risk_hold', 'A hold appeal was upheld or overturned (payload: case_id, hold_id, outcome).', null),
  ('risk.rule_changed', 1, 'risk_rule', 'A risk rule threshold or switch changed (payload: key, version, enabled, reason).', null)
on conflict (event_type) do update set description = excluded.description;

-- ── Grants ────────────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.risk_rule(text), public.risk_severity_rank(text),
  public.risk_raise(text, text, text, text, text, text, jsonb, uuid, uuid, uuid, integer, text, text),
  public.risk_hold_active(text, text, uuid), public.risk_hold_place_internal(text, text, uuid, text, text, uuid, text, timestamptz),
  public.risk_hold_release_internal(uuid, text), public.risk_matches(text, text), public.risk_scan_message(), public.risk_scan_review(), public.risk_scan_listing(),
  public.risk_scan_redemption(), public.risk_mirror_ticket_flag(), public.risk_security_event(uuid, text, jsonb), public.risk_from_audit(),
  public.risk_auth_user_changed(), public.risk_promoter_payout_changed(), public.risk_payout_destination_changed(text, text), public.job_risk_expire(public.job_queue),
  public.promoter_payout_hold_guard(), public.claim_resale_refunds(integer), public.claim_resale_refund(uuid) from public, anon, authenticated;
grant execute on function public.risk_raise(text, text, text, text, text, text, jsonb, uuid, uuid, uuid, integer, text, text),
  public.risk_hold_active(text, text, uuid), public.risk_security_event(uuid, text, jsonb), public.risk_payout_destination_changed(text, text),
  public.job_risk_expire(public.job_queue), public.claim_resale_refunds(integer), public.claim_resale_refund(uuid) to service_role;
-- risk_severity_rank is used inside an on-conflict expression evaluated as the definer; immutable and harmless.
grant execute on function public.risk_severity_rank(text) to service_role;
revoke all on function public.risk_signal_decide(uuid, text, text), public.risk_hold_place(text, text, uuid, text, uuid, timestamptz), public.risk_hold_release(uuid, text),
  public.risk_rule_set(text, boolean, jsonb, text), public.my_risk_holds(), public.risk_hold_appeal(uuid, text), public.risk_appeal_decide(uuid, text, text) from public, anon;
grant execute on function public.risk_signal_decide(uuid, text, text), public.risk_hold_place(text, text, uuid, text, uuid, timestamptz), public.risk_hold_release(uuid, text),
  public.risk_rule_set(text, boolean, jsonb, text), public.my_risk_holds(), public.risk_hold_appeal(uuid, text), public.risk_appeal_decide(uuid, text, text) to authenticated, service_role;
-- payout_eligible / require_step_up keep their existing grants (create or replace preserves them).
