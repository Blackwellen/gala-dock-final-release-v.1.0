-- Platform Admin B (AD-010..AD-018): Commerce, Trust & Safety, Support, Partners, Agent & Integrations, Analytics, Settings.
-- Additive only. Builds on 202610130001_provider_admin.sql (support/trust/partners/integrations/platform_settings + admin RPCs).
--   * admin_money_requests: refund / payout-retry / partner-payout REQUESTS. No money moves here: a request stays pending until
--     the payment processor (Stripe) executes it. Every request carries a reason and is audited.
--   * admin_notes: internal notes on admin records (transactions, partners, trust and support cases).
--   * analytics_daily: daily platform metric rollups read by Admin Analytics.
--   * Versioned settings gain a draft workflow (save draft → publish with reason → rollback) and a platform release label.
begin;

-- ════════════════════════ Columns ════════════════════════
alter table public.transactions add column if not exists details jsonb not null default '{}';
alter table public.trust_cases
  add column if not exists assignee_id uuid references auth.users(id) on delete set null,
  add column if not exists assignee_name text not null default '',
  add column if not exists related jsonb not null default '{}',
  add column if not exists updated_at timestamptz not null default now();
alter table public.support_messages add column if not exists role text not null default '';
do $$ begin
  alter table public.support_messages add constraint support_messages_role_check check (role in ('','customer','support','provider','system'));
exception when duplicate_object then null; end $$;
alter table public.platform_settings
  add column if not exists release text,
  add column if not exists summary text not null default '';
alter table public.agent_runs
  add column if not exists agent_name text not null default '',
  add column if not exists run_type text not null default '',
  add column if not exists triggered_by text not null default '',
  add column if not exists reference text;

-- ════════════════════════ Tables ════════════════════════
create table if not exists public.admin_money_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('refund','payout_retry','partner_payout')),
  status text not null default 'pending' check (status in ('pending','processing','completed','rejected','cancelled')),
  transaction_id uuid references public.transactions(id) on delete set null,
  partner_id uuid references public.partners(id) on delete set null,
  case_id uuid references public.support_cases(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'GBP',
  reason text not null check (length(trim(reason)) >= 5),
  processor text not null default 'stripe',
  processor_ref text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_name text not null default '',
  decided_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admin_money_requests_tx_idx on public.admin_money_requests(transaction_id);
create index if not exists admin_money_requests_case_idx on public.admin_money_requests(case_id);

create table if not exists public.admin_notes (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('transaction','partner','trust_case','support_case')),
  entity_id uuid not null,
  body text not null check (length(body) between 1 and 4000),
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists admin_notes_entity_idx on public.admin_notes(entity_type, entity_id, created_at desc);

create table if not exists public.analytics_daily (
  day date not null,
  metric text not null,
  dim text not null default '',
  value numeric not null default 0,
  primary key (day, metric, dim)
);

alter table public.admin_money_requests enable row level security;
alter table public.admin_notes enable row level security;
alter table public.analytics_daily enable row level security;
drop policy if exists money_requests_admin_read on public.admin_money_requests;
create policy money_requests_admin_read on public.admin_money_requests for select to authenticated
  using (public.has_admin_permission('commerce') or public.has_admin_permission('support') or public.has_admin_permission('partners'));
drop policy if exists admin_notes_read on public.admin_notes;
create policy admin_notes_read on public.admin_notes for select to authenticated using (public.is_platform_admin());
drop policy if exists analytics_daily_read on public.analytics_daily;
create policy analytics_daily_read on public.analytics_daily for select to authenticated using (public.has_admin_permission('analytics'));
revoke all on public.admin_money_requests, public.admin_notes, public.analytics_daily from anon;
grant select on public.admin_money_requests, public.admin_notes, public.analytics_daily to authenticated;

-- ════════════════════════ Settings release labels ════════════════════════
-- Each publish bumps the platform configuration release (minor; rollbacks bump patch).
create or replace function public.platform_settings_release() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cur text; maj integer := 1; mi integer := 0; pa integer := 0;
begin
  if new.status = 'published' and new.release is null then
    select release into cur from public.platform_settings where release ~ '^\d+\.\d+\.\d+$'
      order by string_to_array(release, '.')::int[] desc limit 1;
    if cur is not null then maj := split_part(cur, '.', 1)::int; mi := split_part(cur, '.', 2)::int; pa := split_part(cur, '.', 3)::int; end if;
    if new.change_reason like 'Rollback%' then pa := pa + 1; else mi := mi + 1; pa := 0; end if;
    new.release := maj || '.' || mi || '.' || pa;
  end if;
  return new;
end $$;
drop trigger if exists platform_settings_release on public.platform_settings;
create trigger platform_settings_release before insert or update of status on public.platform_settings
  for each row execute function public.platform_settings_release();

-- ════════════════════════ Helpers ════════════════════════
create or replace function public.admin_actor_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select nullif(full_name, '') from public.profiles where id = auth.uid()), 'Platform Admin');
$$;

-- ════════════════════════ Commerce / money requests ════════════════════════
-- Records a refund, payout retry or partner payout request. It never moves money: it stays 'pending' until the processor executes it.
create or replace function public.admin_request_money(p_kind text, p_transaction uuid, p_partner uuid, p_case uuid, p_amount numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t public.transactions; rid uuid; already numeric;
begin
  if p_kind = 'partner_payout' then perform public.admin_require('partners', p_reason);
  elsif p_case is not null and public.has_admin_permission('support') then perform public.admin_require('support', p_reason);
  else perform public.admin_require('commerce', p_reason); end if;
  if p_kind not in ('refund','payout_retry','partner_payout') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if p_kind in ('refund','payout_retry') then
    if p_transaction is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    select * into t from public.transactions where id = p_transaction;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if p_kind = 'refund' then
      if t.kind not in ('income','payment') or t.status not in ('completed','partial') then raise exception 'not_refundable' using errcode = '22023'; end if;
      select coalesce(sum(amount), 0) into already from public.admin_money_requests where transaction_id = t.id and kind = 'refund' and status in ('pending','processing','completed');
      if already + p_amount > abs(t.amount) then raise exception 'refund_exceeds_amount' using errcode = '22023'; end if;
    elsif t.kind <> 'payout' or t.status <> 'failed' and t.status <> 'pending' then raise exception 'not_retryable' using errcode = '22023'; end if;
  elsif p_partner is null or not exists(select 1 from public.partners where id = p_partner) then raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.admin_money_requests(kind, transaction_id, partner_id, case_id, amount, reason, requested_by, requested_by_name)
    values (p_kind, p_transaction, p_partner, p_case, round(p_amount, 2), trim(p_reason), auth.uid(), public.admin_actor_name()) returning id into rid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), t.workspace_id, 'admin.money_request_' || p_kind,
    jsonb_build_object('request_id', rid, 'transaction_id', p_transaction, 'partner_id', p_partner, 'case_id', p_case, 'amount', p_amount, 'reason', p_reason));
  if p_case is not null then
    insert into public.support_messages(case_id, author_id, author, body, internal, role)
      values (p_case, auth.uid(), public.admin_actor_name(), 'Refund request of £' || to_char(p_amount, 'FM999999990.00') || ' recorded (pending processor). Reason: ' || left(trim(p_reason), 300), true, 'support');
  end if;
  return rid;
end $$;

create or replace function public.admin_cancel_money_request(p_request uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.admin_money_requests;
begin
  select * into r from public.admin_money_requests where id = p_request for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.admin_require(case when r.kind = 'partner_payout' then 'partners' else 'commerce' end, p_reason);
  if r.status <> 'pending' then raise exception 'invalid_transition' using errcode = '22023'; end if;
  update public.admin_money_requests set status = 'cancelled', decided_reason = p_reason, updated_at = now() where id = r.id;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.money_request_cancelled', jsonb_build_object('request_id', r.id, 'reason', p_reason));
end $$;

-- ════════════════════════ Notes ════════════════════════
create or replace function public.admin_add_note(p_entity_type text, p_entity uuid, p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare perm text; nid bigint;
begin
  perm := case p_entity_type when 'transaction' then 'commerce' when 'partner' then 'partners' when 'trust_case' then 'trust' when 'support_case' then 'support' end;
  if perm is null then raise exception 'invalid_entity' using errcode = '22023'; end if;
  if not public.has_admin_permission(perm) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'body_required' using errcode = '22023'; end if;
  insert into public.admin_notes(entity_type, entity_id, body, author_id, author_name) values (p_entity_type, p_entity, left(trim(p_body), 4000), auth.uid(), public.admin_actor_name()) returning id into nid;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.note_added', jsonb_build_object('entity_type', p_entity_type, 'entity_id', p_entity));
  return nid;
end $$;

-- ════════════════════════ Support ════════════════════════
create or replace function public.admin_create_support_case(p_subject text, p_category text, p_priority text, p_requester text, p_body text, p_related jsonb default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid; ref text; n integer;
begin
  if not public.has_admin_permission('support') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_subject, ''))) < 3 then raise exception 'invalid_subject' using errcode = '22023'; end if;
  if p_priority not in ('low','medium','high','urgent') then raise exception 'invalid_priority' using errcode = '22023'; end if;
  select coalesce(max(substring(reference from '^SUP-(\d+)$')::int), 4400) + 1 into n from public.support_cases where reference ~ '^SUP-\d+$';
  ref := 'SUP-' || n;
  insert into public.support_cases(reference, subject, category, priority, status, requester_name, sla_due_at, related, created_at)
    values (ref, left(trim(p_subject), 200), p_category, p_priority, 'open', left(coalesce(nullif(trim(p_requester), ''), 'Unknown requester'), 120),
      now() + (case p_priority when 'urgent' then 1 when 'high' then 2 when 'medium' then 8 else 16 end) * interval '1 hour',
      coalesce(p_related, '{}') || jsonb_build_object('source', 'Admin console', 'created_by', public.admin_actor_name()), now())
    returning id into cid;
  if length(trim(coalesce(p_body, ''))) > 0 then
    insert into public.support_messages(case_id, author_id, author, body, internal, role) values (cid, auth.uid(), public.admin_actor_name(), left(trim(p_body), 5000), true, 'support');
  end if;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.case_created', jsonb_build_object('case_id', cid, 'reference', ref));
  return cid;
end $$;

-- ════════════════════════ Trust & Safety ════════════════════════
create or replace function public.admin_create_trust_case(p_queue text, p_category text, p_subject_type text, p_subject_name text, p_risk integer, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid; n integer;
begin
  perform public.admin_require('trust', p_reason);
  if p_queue not in ('verification','reliability','fraud','appeal') then raise exception 'invalid_queue' using errcode = '22023'; end if;
  if p_subject_type not in ('user','workspace','listing','event','ticket','review') then raise exception 'invalid_subject' using errcode = '22023'; end if;
  if length(trim(coalesce(p_subject_name, ''))) < 2 then raise exception 'invalid_subject' using errcode = '22023'; end if;
  select coalesce(max(substring(reference from '^TS-(\d+)$')::int), 8600) + 1 into n from public.trust_cases where reference ~ '^TS-\d+$';
  insert into public.trust_cases(reference, queue, category, subject_type, subject_name, risk_score, status, reason, evidence, assignee_id, assignee_name)
    values ('TS-' || n, p_queue, left(coalesce(p_category, ''), 80), p_subject_type, left(trim(p_subject_name), 160), greatest(0, least(100, coalesce(p_risk, 0))), 'open', trim(p_reason),
      jsonb_build_array(jsonb_build_object('kind', 'note', 'label', 'Case opened: ' || left(trim(p_reason), 300), 'at', now())), auth.uid(), public.admin_actor_name())
    returning id into cid;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.trust_created', jsonb_build_object('case_id', cid, 'reason', p_reason));
  return cid;
end $$;

create or replace function public.admin_assign_trust(p_case uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('trust') then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.trust_cases set assignee_id = auth.uid(), assignee_name = public.admin_actor_name(), updated_at = now() where id = p_case;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.trust_assigned', jsonb_build_object('case_id', p_case));
end $$;

create or replace function public.admin_request_trust_evidence(p_case uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('trust', p_reason);
  update public.trust_cases set status = case when status in ('actioned','dismissed') then status else 'in_review' end,
    evidence = evidence || jsonb_build_array(jsonb_build_object('kind', 'request', 'label', 'Evidence requested: ' || left(trim(p_reason), 300), 'at', now(), 'by', public.admin_actor_name())),
    updated_at = now() where id = p_case;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.trust_evidence_requested', jsonb_build_object('case_id', p_case, 'reason', p_reason));
end $$;

-- ════════════════════════ Partners ════════════════════════
create or replace function public.admin_set_partner_terms(p_partner uuid, p_commission_bps integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare old integer;
begin
  perform public.admin_require('partners', p_reason);
  if p_commission_bps is null or p_commission_bps < 0 or p_commission_bps > 5000 then raise exception 'invalid_rate' using errcode = '22023'; end if;
  select commission_bps into old from public.partners where id = p_partner for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.partners set commission_bps = p_commission_bps where id = p_partner;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.partner_terms', jsonb_build_object('partner_id', p_partner, 'from_bps', old, 'to_bps', p_commission_bps, 'reason', p_reason));
end $$;

-- ════════════════════════ Settings drafts ════════════════════════
create or replace function public.admin_save_setting_draft(p_section text, p_value jsonb, p_summary text default '') returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer; d public.platform_settings;
begin
  if not public.has_admin_permission('settings') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_section not in ('general','commerce','marketplace','ticketing','trust','agent','communications','integrations') then raise exception 'invalid_section' using errcode = '22023'; end if;
  if jsonb_typeof(p_value) <> 'object' then raise exception 'invalid_value' using errcode = '22023'; end if;
  select * into d from public.platform_settings where section = p_section and status = 'draft' order by version desc limit 1 for update;
  if found then
    update public.platform_settings set value = p_value, summary = coalesce(nullif(trim(p_summary), ''), summary), created_by = auth.uid(), created_at = now() where id = d.id;
    v := d.version;
  else
    select coalesce(max(version), 0) + 1 into v from public.platform_settings where section = p_section;
    insert into public.platform_settings(section, version, status, value, change_reason, summary, created_by) values (p_section, v, 'draft', p_value, '', coalesce(trim(p_summary), ''), auth.uid());
  end if;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.setting_draft_saved', jsonb_build_object('section', p_section, 'version', v));
  return v;
end $$;

create or replace function public.admin_publish_setting_draft(p_section text, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare d public.platform_settings; v integer; rel text;
begin
  perform public.admin_require('settings', p_reason);
  select * into d from public.platform_settings where section = p_section and status = 'draft' order by version desc limit 1 for update;
  if not found then raise exception 'no_draft' using errcode = 'P0002'; end if;
  select coalesce(max(version), 0) + 1 into v from public.platform_settings where section = p_section;
  update public.platform_settings set status = 'superseded' where section = p_section and status = 'published';
  update public.platform_settings set status = 'published', version = v, change_reason = trim(p_reason), summary = coalesce(nullif(summary, ''), trim(p_reason)),
    effective_at = now(), approved_by = auth.uid() where id = d.id returning release into rel;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.setting_published', jsonb_build_object('section', p_section, 'version', v, 'release', rel, 'reason', p_reason));
  return rel;
end $$;

create or replace function public.admin_discard_setting_draft(p_section text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('settings', p_reason);
  delete from public.platform_settings where section = p_section and status = 'draft';
  if not found then raise exception 'no_draft' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.setting_draft_discarded', jsonb_build_object('section', p_section, 'reason', p_reason));
end $$;

-- ════════════════════════ Grants ════════════════════════
revoke all on function public.platform_settings_release(), public.admin_actor_name(),
  public.admin_request_money(text, uuid, uuid, uuid, numeric, text), public.admin_cancel_money_request(uuid, text),
  public.admin_add_note(text, uuid, text), public.admin_create_support_case(text, text, text, text, text, jsonb),
  public.admin_create_trust_case(text, text, text, text, integer, text), public.admin_assign_trust(uuid), public.admin_request_trust_evidence(uuid, text),
  public.admin_set_partner_terms(uuid, integer, text), public.admin_save_setting_draft(text, jsonb, text),
  public.admin_publish_setting_draft(text, text), public.admin_discard_setting_draft(text, text) from public, anon;
grant execute on function public.admin_request_money(text, uuid, uuid, uuid, numeric, text), public.admin_cancel_money_request(uuid, text),
  public.admin_add_note(text, uuid, text), public.admin_create_support_case(text, text, text, text, text, jsonb),
  public.admin_create_trust_case(text, text, text, text, integer, text), public.admin_assign_trust(uuid), public.admin_request_trust_evidence(uuid, text),
  public.admin_set_partner_terms(uuid, integer, text), public.admin_save_setting_draft(text, jsonb, text),
  public.admin_publish_setting_draft(text, text), public.admin_discard_setting_draft(text, text) to authenticated;

commit;
