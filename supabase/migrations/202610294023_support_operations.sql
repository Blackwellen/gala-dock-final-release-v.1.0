-- Q31 remainder (lane D): support case lifecycle, SLA timers, assignment, macros, linked records, case history, safeguarding.
-- Domains 196 (Support Cases), 197 (Safeguarding), 287 (Support Access, scope limits). Additive and backward-compatible:
--   * support_cases keeps every existing column/status; `closed` and `safeguarding` are added to the CHECK lists (supersets).
--   * existing RPC signatures are unchanged (admin_reply_case / admin_assign_case / admin_update_case / admin_create_support_case /
--     contact_support are replaced in place with the same arguments and return types).
--   * SLA deadlines come from support_sla_policies when a caller does not set one (old explicit deadlines stay valid).
-- Customer-visible vs internal: support_messages.internal (RLS already hides internal notes from requesters). Safeguarding cases are
-- readable only by admins holding BOTH support and trust (Trust & Safety owns safety cases; support sees they exist via counts only).
-- Notifications are in-app only (kind 'support.*' has no email category), so nothing here sends email.

-- ── 1. Columns and constraints ──
alter table public.support_cases
  add column if not exists first_response_due_at timestamptz,
  add column if not exists first_responded_at timestamptz,
  add column if not exists first_response_breached_at timestamptz,
  add column if not exists sla_breached_at timestamptz,
  add column if not exists sla_paused_at timestamptz,
  add column if not exists sla_paused_minutes integer not null default 0,
  add column if not exists escalation_level smallint not null default 0,
  add column if not exists trust_case_id uuid references public.trust_cases(id) on delete set null,
  add column if not exists closed_at timestamptz,
  add column if not exists last_customer_reply_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version integer not null default 1;

alter table public.support_cases drop constraint if exists support_cases_status_check;
alter table public.support_cases add constraint support_cases_status_check check (status in ('open','waiting','escalated','resolved','closed'));
alter table public.support_cases drop constraint if exists support_cases_category_check;
alter table public.support_cases add constraint support_cases_category_check
  check (category in ('booking','ticketing','payment','account','technical','no_show','emergency','refund','other','safeguarding'));
alter table public.support_cases drop constraint if exists support_cases_escalation_check;
alter table public.support_cases add constraint support_cases_escalation_check check (escalation_level between 0 and 3);
create index if not exists support_cases_sla_open_idx on public.support_cases(sla_due_at) where status in ('open','waiting','escalated');
create index if not exists support_cases_first_response_idx on public.support_cases(first_response_due_at) where first_responded_at is null and status in ('open','escalated');
create index if not exists support_cases_assignee_idx on public.support_cases(assignee_id, status);

-- ── 2. SLA policies (data, editable by settings admins) ──
create table if not exists public.support_sla_policies (
  priority text primary key check (priority in ('urgent','high','medium','low')),
  first_response_minutes integer not null check (first_response_minutes between 5 and 10080),
  resolution_minutes integer not null check (resolution_minutes between 15 and 43200),
  auto_close_days integer not null default 14 check (auto_close_days between 1 and 90),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (resolution_minutes >= first_response_minutes)
);
insert into public.support_sla_policies(priority, first_response_minutes, resolution_minutes) values
  ('urgent', 15, 60), ('high', 60, 240), ('medium', 120, 480), ('low', 240, 960)
on conflict (priority) do nothing;
alter table public.support_sla_policies enable row level security;
revoke all on public.support_sla_policies from anon, authenticated;
grant select on public.support_sla_policies to authenticated;
drop policy if exists support_sla_policies_read on public.support_sla_policies;
create policy support_sla_policies_read on public.support_sla_policies for select using (public.has_admin_permission('support') or public.has_admin_permission('settings'));

-- Backfill (before the lifecycle triggers exist, so no history rows or version bumps): first-response deadline for open cases that have none (derived from policy; history is not rewritten).
update public.support_cases c set first_response_due_at = least(coalesce(c.sla_due_at, c.created_at + make_interval(mins => p.first_response_minutes)), c.created_at + make_interval(mins => p.first_response_minutes))
  from public.support_sla_policies p where p.priority = c.priority and c.first_response_due_at is null;
update public.support_cases c set first_responded_at = m.at
  from (select sm.case_id, min(sm.created_at) as at from public.support_messages sm join public.platform_admins a on a.user_id = sm.author_id
        where not sm.internal group by sm.case_id) m
  where m.case_id = c.id and c.first_responded_at is null;

-- ── 3. Case history (append-only) ──
create table if not exists public.support_case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.support_cases(id) on delete cascade,
  kind text not null check (kind in ('created','status','priority','assigned','reply','note','customer_reply','macro','linked','unlinked',
    'sla_first_response_breached','sla_breached','escalated_trust','auto_closed')),
  from_value text, to_value text,
  actor_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'admin' check (actor_type in ('admin','user','system')),
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists support_case_events_case_idx on public.support_case_events(case_id, created_at);
alter table public.support_case_events enable row level security;
revoke all on public.support_case_events from anon, authenticated;
grant select on public.support_case_events to authenticated;

create or replace function public.support_case_events_immutable() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'support_case_events_append_only' using errcode = '42501';
end $$;
drop trigger if exists support_case_events_immutable on public.support_case_events;
create trigger support_case_events_immutable before update on public.support_case_events for each row execute function public.support_case_events_immutable();

-- ── 4. Access helper: support scope; safeguarding also needs trust ──
create or replace function public.support_case_access(p_category text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_admin_permission('support') and (coalesce(p_category, '') <> 'safeguarding' or public.has_admin_permission('trust'));
$$;

drop policy if exists support_read on public.support_cases;
create policy support_read on public.support_cases for select
  using (requester_id = (select auth.uid()) or public.support_case_access(category));
drop policy if exists support_messages_read on public.support_messages;
create policy support_messages_read on public.support_messages for select using (
  exists (select 1 from public.support_cases c where c.id = support_messages.case_id and public.support_case_access(c.category))
  or (not internal and exists (select 1 from public.support_cases c where c.id = support_messages.case_id and c.requester_id = (select auth.uid()))));
drop policy if exists support_case_events_read on public.support_case_events;
create policy support_case_events_read on public.support_case_events for select
  using (exists (select 1 from public.support_cases c where c.id = support_case_events.case_id and public.support_case_access(c.category)));

-- ── 5. Macros ──
create table if not exists public.support_macros (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 3 and 80),
  body text not null check (length(btrim(body)) between 5 and 5000),
  category text check (category is null or category in ('booking','ticketing','payment','account','technical','no_show','emergency','refund','other','safeguarding')),
  internal boolean not null default false,
  set_status text check (set_status is null or set_status in ('waiting','escalated')),
  active boolean not null default true,
  usage_count integer not null default 0,
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists support_macros_title_key on public.support_macros(lower(title)) where active;
alter table public.support_macros enable row level security;
revoke all on public.support_macros from anon, authenticated;
grant select on public.support_macros to authenticated;
drop policy if exists support_macros_read on public.support_macros;
create policy support_macros_read on public.support_macros for select using (public.has_admin_permission('support'));
insert into public.support_macros(title, body, category, internal, set_status) values
  ('Ask for order reference', 'Hi {{requester_name}}, thanks for getting in touch about {{reference}}. Could you reply with your order reference (it starts with GD-) and the email address used at checkout? We will pick this up as soon as we have it.', null, false, 'waiting'),
  ('Refund timeline', 'Hi {{requester_name}}, your refund for {{reference}} has been requested. Card refunds usually reach your account within 5–10 working days, depending on your bank. We will keep this case open until it lands.', 'refund', false, null),
  ('Escalate to Tier 2', 'Escalating {{reference}} to Tier 2: needs a supervisor review before any money moves. Summary of what has been checked so far is above.', null, true, 'escalated'),
  ('Safeguarding acknowledgement', 'Hi {{requester_name}}, thank you for telling us. Your report ({{reference}}) has gone straight to our Trust & Safety team, who will contact you. If anyone is in immediate danger, call 999.', 'safeguarding', false, null)
on conflict do nothing;

-- ── 6. Linked records (canonical, validated) ──
create table if not exists public.support_case_links (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.support_cases(id) on delete cascade,
  record_type text not null check (record_type in ('event','booking','ticket_order','payment_order','transaction','workspace','user','listing','dispute','trust_case','privacy_request','risk_signal','support_case')),
  record_id text not null check (length(record_id) between 1 and 120),
  label text not null default '' check (length(label) <= 200),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (case_id, record_type, record_id)
);
alter table public.support_case_links enable row level security;
revoke all on public.support_case_links from anon, authenticated;
grant select on public.support_case_links to authenticated;
drop policy if exists support_case_links_read on public.support_case_links;
create policy support_case_links_read on public.support_case_links for select
  using (exists (select 1 from public.support_cases c where c.id = support_case_links.case_id and public.support_case_access(c.category)));

-- Resolves a record and returns a display label, or null when it does not exist.
create or replace function public.support_link_label(p_type text, p_id text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v text; u uuid;
begin
  if p_type not in ('ticket_order') then
    begin u := p_id::uuid; exception when others then return null; end;
  end if;
  case p_type
    when 'event' then select name into v from public.events where id = u;
    when 'booking' then select 'Booking ' || left(b.booking_id::text, 8) || coalesce(' · ' || b.status, '') into v from public.bookings b where b.booking_id = u limit 1;
    when 'ticket_order' then select 'Order ' || o.order_ref into v from public.checkout_orders o where o.order_ref = p_id;
    when 'payment_order' then select 'Payment ' || p.reference into v from public.payment_orders p where p.id = u;
    when 'transaction' then select 'Transaction ' || left(t.id::text, 8) into v from public.transactions t where t.id = u;
    when 'workspace' then select name into v from public.workspaces where id = u;
    when 'user' then select coalesce(nullif(p.full_name, ''), 'User ' || left(u::text, 8)) into v from auth.users a left join public.profiles p on p.id = a.id where a.id = u;
    when 'listing' then select name into v from public.listings where id = u;
    when 'dispute' then select 'Dispute ' || d.reference into v from public.booking_disputes d where d.id = u;
    when 'trust_case' then select 'Trust case ' || t.reference into v from public.trust_cases t where t.id = u;
    when 'privacy_request' then select 'Privacy request ' || r.reference into v from public.privacy_requests r where r.id = u;
    when 'risk_signal' then select 'Risk signal · ' || s.kind into v from public.risk_signals s where s.id = u;
    when 'support_case' then select 'Case ' || s.reference into v from public.support_cases s where s.id = u;
    else v := null;
  end case;
  return v;
end $$;

-- ── 7. Lifecycle triggers: SLA from policy, pause while waiting on the customer, history rows ──
create or replace function public.support_cases_before() returns trigger language plpgsql security definer set search_path = '' as $$
declare pol public.support_sla_policies; paused integer;
begin
  select * into pol from public.support_sla_policies where priority = new.priority;
  if TG_OP = 'INSERT' then
    if new.sla_due_at is null and pol.priority is not null then new.sla_due_at := new.created_at + make_interval(mins => pol.resolution_minutes); end if;
    if new.first_response_due_at is null and pol.priority is not null then
      new.first_response_due_at := least(new.sla_due_at, new.created_at + make_interval(mins => pol.first_response_minutes));
    end if;
    if new.status = 'waiting' then new.sla_paused_at := coalesce(new.sla_paused_at, now()); end if;
    return new;
  end if;
  new.updated_at := now();
  new.version := old.version + 1;
  if new.status is distinct from old.status then
    -- Pause the resolution clock while waiting on the customer; resume by pushing the deadline out by the paused time.
    if new.status = 'waiting' and old.status <> 'waiting' then new.sla_paused_at := now(); end if;
    if old.status = 'waiting' and new.status <> 'waiting' and old.sla_paused_at is not null then
      paused := greatest(0, ceil(extract(epoch from (now() - old.sla_paused_at)) / 60)::int);
      new.sla_paused_minutes := old.sla_paused_minutes + paused;
      if new.sla_due_at is not null then new.sla_due_at := old.sla_due_at + make_interval(mins => paused); end if;
      new.sla_paused_at := null;
    end if;
    if new.status = 'closed' then new.closed_at := now(); end if;
    if old.status in ('resolved','closed') and new.status in ('open','waiting','escalated') then
      new.resolved_at := null; new.closed_at := null; new.sla_breached_at := null;
      -- A reopened case gets a fresh resolution window from its policy.
      if pol.priority is not null then new.sla_due_at := now() + make_interval(mins => pol.resolution_minutes); end if;
    end if;
  end if;
  if new.priority is distinct from old.priority and pol.priority is not null and new.status not in ('resolved','closed') then
    new.sla_due_at := new.created_at + make_interval(mins => pol.resolution_minutes + new.sla_paused_minutes);
    if new.first_responded_at is null then new.first_response_due_at := least(new.sla_due_at, new.created_at + make_interval(mins => pol.first_response_minutes)); end if;
    if new.sla_due_at > now() then new.sla_breached_at := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists support_cases_before on public.support_cases;
create trigger support_cases_before before insert or update on public.support_cases for each row execute function public.support_cases_before();

create or replace function public.support_cases_after() returns trigger language plpgsql security definer set search_path = '' as $$
declare who uuid := auth.uid(); typ text := case when auth.uid() is null then 'system' when public.is_platform_admin() then 'admin' else 'user' end;
begin
  if TG_OP = 'INSERT' then
    insert into public.support_case_events(case_id, kind, to_value, actor_id, actor_type, detail)
      values (new.id, 'created', new.status, who, typ, jsonb_build_object('priority', new.priority, 'category', new.category));
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.support_case_events(case_id, kind, from_value, to_value, actor_id, actor_type) values (new.id, 'status', old.status, new.status, who, typ);
    if new.workspace_id is not null then
      insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
        values (who, typ, new.workspace_id, 'support.case_state_changed', jsonb_build_object('case_id', new.id, 'reference', new.reference, 'from', old.status, 'to', new.status));
    end if;
  end if;
  if new.priority is distinct from old.priority then
    insert into public.support_case_events(case_id, kind, from_value, to_value, actor_id, actor_type) values (new.id, 'priority', old.priority, new.priority, who, typ);
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into public.support_case_events(case_id, kind, from_value, to_value, actor_id, actor_type, detail)
      values (new.id, 'assigned', old.assignee_name, new.assignee_name, who, typ, jsonb_build_object('assignee_id', new.assignee_id));
  end if;
  return new;
end $$;
drop trigger if exists support_cases_after on public.support_cases;
create trigger support_cases_after after insert or update on public.support_cases for each row execute function public.support_cases_after();

-- ── 8. State machine (enforced; every existing path is a listed transition) ──
insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states) values
  ('support_case', 'support_cases', 'status', 'enforce', array['open','waiting','escalated','resolved']::text[], array['closed']::text[])
on conflict (machine) do update set table_name = excluded.table_name, column_name = excluded.column_name, mode = excluded.mode,
  initial_states = excluded.initial_states, terminal_states = excluded.terminal_states;
delete from public.state_transitions where machine = 'support_case';
insert into public.state_transitions(machine, from_state, to_state) values
  ('support_case','open','waiting'), ('support_case','open','escalated'), ('support_case','open','resolved'),
  ('support_case','waiting','open'), ('support_case','waiting','escalated'), ('support_case','waiting','resolved'),
  ('support_case','escalated','open'), ('support_case','escalated','waiting'), ('support_case','escalated','resolved'),
  ('support_case','resolved','open'), ('support_case','resolved','closed');
drop trigger if exists support_cases_state_guard on public.support_cases;
create trigger support_cases_state_guard before insert or update of status on public.support_cases for each row execute function public.enforce_state_transition('support_case', 'status');

-- ── 9. Admin commands (support permission + MFA; safeguarding also needs trust; reasons where consequential) ──
create or replace function public.support_case_for_admin(p_case uuid) returns public.support_cases
language plpgsql stable security definer set search_path = '' as $$
declare c public.support_cases;
begin
  perform public.admin_mfa_required();
  select * into c from public.support_cases where id = p_case;
  if not found then
    if public.has_admin_permission('support') then raise exception 'not_found' using errcode = 'P0002'; end if;
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not public.support_case_access(c.category) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return c;
end $$;

create or replace function public.admin_reply_case(p_case uuid, p_body text, p_internal boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.support_cases; who text;
begin
  c := public.support_case_for_admin(p_case);
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'body_required' using errcode = '22023'; end if;
  if c.status = 'closed' then raise exception 'case_closed' using errcode = '22023'; end if;
  who := coalesce((select nullif(full_name, '') from public.profiles where id = auth.uid()), 'Gala Dock Support');
  insert into public.support_messages(case_id, author_id, author, body, internal, role) values (p_case, auth.uid(), who, left(p_body, 5000), coalesce(p_internal, false), 'support');
  insert into public.support_case_events(case_id, kind, actor_id, actor_type, detail)
    values (p_case, case when coalesce(p_internal, false) then 'note' else 'reply' end, auth.uid(), 'admin', jsonb_build_object('length', length(p_body)));
  if not coalesce(p_internal, false) then
    update public.support_cases set first_responded_at = coalesce(first_responded_at, now()) where id = p_case;
    if c.requester_id is not null then
      perform public.notify(c.requester_id, 'support.case_reply', 'Support replied to ' || c.reference, left('We replied to your request “' || c.subject || '”. Open Help to read it.', 300),
        '/help#contact', 'support.reply:' || p_case || ':' || (select max(id) from public.support_messages where case_id = p_case));
    end if;
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'admin', c.workspace_id, 'support.case_replied', jsonb_build_object('case_id', p_case, 'internal', coalesce(p_internal, false)));
end $$;

create or replace function public.admin_assign_case(p_case uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.support_cases;
begin
  c := public.support_case_for_admin(p_case);
  if c.status = 'closed' then raise exception 'case_closed' using errcode = '22023'; end if;
  update public.support_cases set assignee_id = auth.uid(),
    assignee_name = coalesce((select nullif(full_name, '') from public.profiles where id = auth.uid()), 'Support agent') where id = p_case;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.case_assigned', jsonb_build_object('case_id', p_case));
end $$;

-- Assign to another admin. The assignee must hold support (and trust for safeguarding); the reason is audited.
create or replace function public.admin_assign_case_to(p_case uuid, p_assignee uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.support_cases; a public.platform_admins; nm text;
begin
  c := public.support_case_for_admin(p_case);
  perform public.admin_require('support', p_reason);
  if c.status = 'closed' then raise exception 'case_closed' using errcode = '22023'; end if;
  select * into a from public.platform_admins where user_id = p_assignee;
  if not found or not ('support' = any(a.permissions)) or (c.category = 'safeguarding' and not ('trust' = any(a.permissions))) then
    raise exception 'invalid_assignee' using errcode = '22023';
  end if;
  nm := coalesce((select nullif(full_name, '') from public.profiles where id = p_assignee), a.title, 'Support agent');
  update public.support_cases set assignee_id = p_assignee, assignee_name = left(nm, 120) where id = p_case;
  perform public.notify(p_assignee, 'support.case_assigned', 'Case ' || c.reference || ' assigned to you', left(c.subject, 200), '/admin/support/' || p_case, 'support.assigned:' || p_case || ':' || p_assignee || ':' || (select version from public.support_cases where id = p_case));
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'admin', c.workspace_id, 'support.case_assigned', jsonb_build_object('case_id', p_case, 'assignee', p_assignee, 'reason', left(p_reason, 300)));
end $$;

create or replace function public.admin_update_case(p_case uuid, p_status text, p_reason text, p_outcome text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.support_cases;
begin
  c := public.support_case_for_admin(p_case);
  perform public.admin_require('support', p_reason);
  if p_status not in ('open','waiting','escalated','resolved','closed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_status = 'resolved' and length(trim(coalesce(p_outcome, ''))) < 3 then raise exception 'outcome_required' using errcode = '22023'; end if;
  if c.status = p_status then raise exception 'no_change' using errcode = '22023'; end if;
  if not public.state_transition_allowed('support_case', c.status, p_status) then raise exception 'invalid_transition' using errcode = '22023'; end if;
  update public.support_cases set status = p_status, outcome = case when p_status = 'resolved' then p_outcome else outcome end,
    resolution_reason = case when p_status = 'resolved' then p_reason else resolution_reason end,
    resolved_at = case when p_status = 'resolved' then now() when p_status = 'closed' then resolved_at else null end,
    escalation_level = case when p_status = 'escalated' then greatest(escalation_level, 1) else escalation_level end
  where id = p_case;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.case_' || p_status, jsonb_build_object('case_id', p_case, 'reason', p_reason));
end $$;

create or replace function public.admin_set_case_priority(p_case uuid, p_priority text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.support_cases;
begin
  c := public.support_case_for_admin(p_case);
  perform public.admin_require('support', p_reason);
  if p_priority not in ('low','medium','high','urgent') then raise exception 'invalid_priority' using errcode = '22023'; end if;
  if c.status = 'closed' then raise exception 'case_closed' using errcode = '22023'; end if;
  if c.priority = p_priority then raise exception 'no_change' using errcode = '22023'; end if;
  update public.support_cases set priority = p_priority where id = p_case;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.case_priority', jsonb_build_object('case_id', p_case, 'from', c.priority, 'to', p_priority, 'reason', p_reason));
end $$;

create or replace function public.admin_create_support_case(p_subject text, p_category text, p_priority text, p_requester text, p_body text, p_related jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare cid uuid; ref text; n integer; cat text := coalesce(nullif(p_category, ''), 'other');
begin
  perform public.admin_mfa_required();
  if not public.has_admin_permission('support') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if cat = 'safeguarding' and not public.has_admin_permission('trust') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if cat not in ('booking','ticketing','payment','account','technical','no_show','emergency','refund','other','safeguarding') then raise exception 'invalid_category' using errcode = '22023'; end if;
  if length(trim(coalesce(p_subject, ''))) < 3 then raise exception 'invalid_subject' using errcode = '22023'; end if;
  if p_priority not in ('low','medium','high','urgent') then raise exception 'invalid_priority' using errcode = '22023'; end if;
  select coalesce(max(substring(reference from '^SUP-(\d+)$')::int), 4400) + 1 into n from public.support_cases where reference ~ '^SUP-\d+$';
  ref := 'SUP-' || n;
  insert into public.support_cases(reference, subject, category, priority, status, requester_name, related, created_at)
    values (ref, left(trim(p_subject), 200), cat, case when cat = 'safeguarding' then 'urgent' else p_priority end, 'open', left(coalesce(nullif(trim(p_requester), ''), 'Unknown requester'), 120),
      coalesce(p_related, '{}') || jsonb_build_object('source', 'Admin console', 'created_by', public.admin_actor_name()), now())
    returning id into cid;
  if length(trim(coalesce(p_body, ''))) > 0 then
    insert into public.support_messages(case_id, author_id, author, body, internal, role) values (cid, auth.uid(), public.admin_actor_name(), left(trim(p_body), 5000), true, 'support');
  end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.case_created', jsonb_build_object('case_id', cid, 'reference', ref));
  return cid;
end $$;

-- Macros: save (create/update, optimistic version), apply (placeholders, optional status), archive.
create or replace function public.admin_save_support_macro(p_id uuid, p_title text, p_body text, p_category text, p_internal boolean, p_set_status text, p_version integer default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.support_macros; mid uuid;
begin
  perform public.admin_mfa_required();
  if not public.has_admin_permission('support') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_title, ''))) not between 3 and 80 then raise exception 'invalid_title' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 5 and 5000 then raise exception 'body_required' using errcode = '22023'; end if;
  if p_set_status is not null and p_set_status not in ('waiting','escalated') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.support_macros(title, body, category, internal, set_status, created_by)
      values (btrim(p_title), btrim(p_body), nullif(p_category, ''), coalesce(p_internal, false), p_set_status, auth.uid()) returning id into mid;
  else
    select * into m from public.support_macros where id = p_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if p_version is not null and p_version <> m.version then raise exception 'stale_version' using errcode = '40001'; end if;
    update public.support_macros set title = btrim(p_title), body = btrim(p_body), category = nullif(p_category, ''), internal = coalesce(p_internal, false),
      set_status = p_set_status, version = version + 1, updated_at = now() where id = p_id returning id into mid;
  end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'support.macro_saved', jsonb_build_object('macro_id', mid, 'created', p_id is null));
  return mid;
end $$;

create or replace function public.admin_archive_support_macro(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('support', p_reason);
  update public.support_macros set active = false, version = version + 1, updated_at = now() where id = p_id and active;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'support.macro_archived', jsonb_build_object('macro_id', p_id, 'reason', left(p_reason, 300)));
end $$;

create or replace function public.admin_apply_support_macro(p_case uuid, p_macro uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.support_cases; m public.support_macros; txt text; first_name text;
begin
  c := public.support_case_for_admin(p_case);
  select * into m from public.support_macros where id = p_macro and active;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status = 'closed' then raise exception 'case_closed' using errcode = '22023'; end if;
  if m.category = 'safeguarding' and c.category <> 'safeguarding' then raise exception 'macro_category_mismatch' using errcode = '22023'; end if;
  first_name := split_part(coalesce(nullif(btrim(c.requester_name), ''), 'there'), ' ', 1);
  -- Placeholders are plain text substitutions; values come from the case record, never from user-supplied templates at run time.
  txt := replace(replace(replace(m.body, '{{requester_name}}', first_name), '{{reference}}', c.reference), '{{subject}}', c.subject);
  perform public.admin_reply_case(p_case, txt, m.internal);
  if m.set_status is not null and c.status <> m.set_status and public.state_transition_allowed('support_case', c.status, m.set_status) then
    update public.support_cases set status = m.set_status, escalation_level = case when m.set_status = 'escalated' then greatest(escalation_level, 1) else escalation_level end where id = p_case;
  end if;
  update public.support_macros set usage_count = usage_count + 1 where id = p_macro;
  insert into public.support_case_events(case_id, kind, actor_id, actor_type, detail) values (p_case, 'macro', auth.uid(), 'admin', jsonb_build_object('macro_id', p_macro, 'title', m.title));
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'admin', c.workspace_id, 'support.macro_applied', jsonb_build_object('case_id', p_case, 'macro_id', p_macro));
  return jsonb_build_object('internal', m.internal, 'status', coalesce(m.set_status, c.status));
end $$;

create or replace function public.admin_link_case_record(p_case uuid, p_type text, p_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.support_cases; lbl text; lid uuid;
begin
  c := public.support_case_for_admin(p_case);
  if c.status = 'closed' then raise exception 'case_closed' using errcode = '22023'; end if;
  if p_type = 'support_case' and p_id = p_case::text then raise exception 'invalid_link' using errcode = '22023'; end if;
  lbl := public.support_link_label(p_type, btrim(coalesce(p_id, '')));
  if lbl is null then raise exception 'record_not_found' using errcode = 'P0002'; end if;
  insert into public.support_case_links(case_id, record_type, record_id, label, created_by) values (p_case, p_type, btrim(p_id), left(lbl, 200), auth.uid())
    on conflict (case_id, record_type, record_id) do nothing returning id into lid;
  if lid is null then raise exception 'already_linked' using errcode = '23505'; end if;
  insert into public.support_case_events(case_id, kind, to_value, actor_id, actor_type, detail) values (p_case, 'linked', p_type, auth.uid(), 'admin', jsonb_build_object('record_id', p_id, 'label', lbl));
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'admin', c.workspace_id, 'support.case_linked', jsonb_build_object('case_id', p_case, 'record_type', p_type, 'record_id', p_id));
  return lid;
end $$;

create or replace function public.admin_unlink_case_record(p_link uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.support_case_links; c public.support_cases;
begin
  select * into l from public.support_case_links where id = p_link;
  if not found then
    perform public.admin_mfa_required();
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  c := public.support_case_for_admin(l.case_id);
  delete from public.support_case_links where id = p_link;
  insert into public.support_case_events(case_id, kind, from_value, actor_id, actor_type, detail) values (l.case_id, 'unlinked', l.record_type, auth.uid(), 'admin', jsonb_build_object('record_id', l.record_id));
end $$;

-- Safeguarding / fraud escalation: opens (or reuses) a Trust & Safety case about the requester and links it. trust permission.
create or replace function public.admin_escalate_case_to_trust(p_case uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.support_cases; tid uuid; ref text; n integer;
begin
  c := public.support_case_for_admin(p_case);
  perform public.admin_require('trust', p_reason);
  if c.trust_case_id is not null then raise exception 'already_escalated' using errcode = '22023'; end if;
  if c.status = 'closed' then raise exception 'case_closed' using errcode = '22023'; end if;
  select coalesce(max(substring(reference from '^TS-(\d+)$')::int), 1000) + 1 into n from public.trust_cases where reference ~ '^TS-\d+$';
  ref := 'TS-' || n;
  insert into public.trust_cases(reference, queue, category, subject_type, subject_id, subject_name, risk_score, status, reason, evidence, related)
    values (ref, 'fraud', case when c.category = 'safeguarding' then 'Safeguarding concern' else 'Escalated support case' end, 'user', c.requester_id,
      left(coalesce(nullif(c.requester_name, ''), 'Requester'), 120), case when c.category = 'safeguarding' then 80 else 50 end, 'open', left(p_reason, 1000),
      jsonb_build_array(jsonb_build_object('kind', 'support_case', 'label', 'From support case ' || c.reference, 'at', now())),
      jsonb_build_object('support_case_id', c.id, 'support_reference', c.reference))
    returning id into tid;
  update public.support_cases set trust_case_id = tid, escalation_level = 2, status = case when status = 'escalated' then status else 'escalated' end where id = p_case;
  insert into public.support_case_links(case_id, record_type, record_id, label, created_by) values (p_case, 'trust_case', tid::text, 'Trust case ' || ref, auth.uid()) on conflict do nothing;
  insert into public.support_case_events(case_id, kind, to_value, actor_id, actor_type, detail) values (p_case, 'escalated_trust', ref, auth.uid(), 'admin', jsonb_build_object('trust_case_id', tid));
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'admin', c.workspace_id, 'support.case_escalated_trust', jsonb_build_object('case_id', p_case, 'trust_case_id', tid, 'reason', left(p_reason, 300)));
  return tid;
end $$;

create or replace function public.admin_set_sla_policy(p_priority text, p_first_minutes integer, p_resolution_minutes integer, p_auto_close_days integer, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.support_sla_policies;
begin
  perform public.admin_require('settings', p_reason);
  select * into o from public.support_sla_policies where priority = p_priority for update;
  if not found then raise exception 'invalid_priority' using errcode = '22023'; end if;
  if p_first_minutes is null or p_resolution_minutes is null or p_first_minutes < 5 or p_resolution_minutes < p_first_minutes or p_resolution_minutes > 43200
     or coalesce(p_auto_close_days, 14) not between 1 and 90 then raise exception 'invalid_value' using errcode = '22023'; end if;
  update public.support_sla_policies set first_response_minutes = p_first_minutes, resolution_minutes = p_resolution_minutes, auto_close_days = coalesce(p_auto_close_days, 14),
    updated_by = auth.uid(), updated_at = now() where priority = p_priority;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'support.sla_policy_changed', jsonb_build_object('priority', p_priority,
    'before', jsonb_build_object('first', o.first_response_minutes, 'resolution', o.resolution_minutes, 'auto_close_days', o.auto_close_days),
    'after', jsonb_build_object('first', p_first_minutes, 'resolution', p_resolution_minutes, 'auto_close_days', coalesce(p_auto_close_days, 14)), 'reason', left(p_reason, 300)));
end $$;

-- ── 10. Requester commands: reply to own case (re-opens a waiting or recently resolved case); safeguarding category on contact ──
create or replace function public.support_case_reply(p_case uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.support_cases; v_name text; pol public.support_sla_policies;
begin
  if auth.uid() is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into c from public.support_cases where id = p_case for update;
  if not found or c.requester_id is distinct from auth.uid() then raise exception 'not_found' using errcode = 'P0002'; end if;   -- no existence leak
  if length(btrim(coalesce(p_body, ''))) not between 2 and 5000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if c.status = 'closed' then raise exception 'case_closed' using errcode = '22023'; end if;
  select * into pol from public.support_sla_policies where priority = c.priority;
  if c.status = 'resolved' and c.resolved_at < now() - make_interval(days => coalesce(pol.auto_close_days, 14)) then raise exception 'case_closed' using errcode = '22023'; end if;
  if not public.hit_rate_limit('support:reply:' || auth.uid(), 20, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  select coalesce(nullif(p.full_name, ''), 'Customer') into v_name from public.profiles p where p.id = auth.uid();
  insert into public.support_messages(case_id, author_id, author, body, internal, role) values (p_case, auth.uid(), left(coalesce(v_name, 'Customer'), 120), btrim(p_body), false, 'customer');
  update public.support_cases set last_customer_reply_at = now(), status = case when status in ('waiting','resolved') then 'open' else status end where id = p_case;
  insert into public.support_case_events(case_id, kind, actor_id, actor_type) values (p_case, 'customer_reply', auth.uid(), 'user');
  if c.assignee_id is not null then
    perform public.notify(c.assignee_id, 'support.customer_reply', c.reference || ': customer replied', left(c.subject, 200), '/admin/support/' || p_case, null);
  end if;
end $$;

create or replace function public.contact_support(p_subject text, p_body text, p_category text default 'other', p_workspace uuid default null, p_source text default 'Help Centre')
returns text language plpgsql security definer set search_path = '' as $$
declare v_case uuid; v_ref text; n integer; v_name text; v_ws uuid; v_ws_name text; v_cat text; v_pri text;
begin
  if auth.uid() is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_subject, ''))) not between 3 and 200 or length(btrim(coalesce(p_body, ''))) not between 10 and 5000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_cat := case when p_category in ('booking','ticketing','payment','account','technical','refund','other','safeguarding') then p_category else 'other' end;
  v_pri := case when v_cat = 'safeguarding' then 'urgent' when v_cat in ('payment','refund') then 'high' else 'medium' end;
  if not public.hit_rate_limit('support:contact:' || auth.uid(), 5, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  if p_workspace is not null and exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = auth.uid()) then
    v_ws := p_workspace; select name into v_ws_name from public.workspaces where id = v_ws;
  end if;
  select coalesce(nullif(p.full_name, ''), u.email, 'Gala Dock user') into v_name from auth.users u left join public.profiles p on p.id = u.id where u.id = auth.uid();
  select coalesce(max(substring(reference from '^SUP-(\d+)$')::int), 4400) + 1 into n from public.support_cases where reference ~ '^SUP-\d+$';
  v_ref := 'SUP-' || n;
  insert into public.support_cases(reference, subject, category, priority, status, requester_id, requester_name, workspace_id, related)
    values (v_ref, btrim(p_subject), v_cat, v_pri, 'open', auth.uid(), left(v_name, 120), v_ws,
      jsonb_build_object('source', left(coalesce(nullif(btrim(p_source), ''), 'Help Centre'), 60)) || case when v_ws is null then '{}'::jsonb else jsonb_build_object('workspace', v_ws_name) end)
    returning id into v_case;
  insert into public.support_messages(case_id, author_id, author, body, internal, role) values (v_case, auth.uid(), left(v_name, 120), btrim(p_body), false, 'customer');
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', v_ws, 'support.case_opened', jsonb_build_object('case_id', v_case, 'reference', v_ref, 'category', v_cat, 'source', p_source));
  if v_cat = 'safeguarding' then
    -- Safety reports reach Trust & Safety immediately (in-app; never email the report text).
    insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
      select a.user_id, 'support.safeguarding', 'Safeguarding report ' || v_ref, 'A safety concern was reported. Open the case to review.', '/admin/support/' || v_case, 'support.safeguarding:' || v_case || ':' || a.user_id
      from public.platform_admins a where a.permissions @> array['support','trust'] on conflict do nothing;
  end if;
  return v_ref;
end $$;

-- ── 11. SLA sweep job (every 10 minutes): first-response and resolution breaches, auto-close of resolved cases ──
create or replace function public.job_support_sla_sweep(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; fr integer := 0; br integer := 0; closed integer := 0;
begin
  for r in select c.* from public.support_cases c where c.status in ('open','escalated') and c.first_responded_at is null and c.first_response_breached_at is null
             and c.first_response_due_at < now() limit 500 for update skip locked loop
    update public.support_cases set first_response_breached_at = now() where id = r.id;
    insert into public.support_case_events(case_id, kind, actor_type, detail) values (r.id, 'sla_first_response_breached', 'system', jsonb_build_object('due', r.first_response_due_at));
    fr := fr + 1;
  end loop;
  for r in select c.* from public.support_cases c where c.status in ('open','escalated') and c.sla_breached_at is null and c.sla_due_at < now() limit 500 for update skip locked loop
    update public.support_cases set sla_breached_at = now() where id = r.id;
    insert into public.support_case_events(case_id, kind, actor_type, detail) values (r.id, 'sla_breached', 'system', jsonb_build_object('due', r.sla_due_at));
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', r.workspace_id, 'support.sla_breached', jsonb_build_object('case_id', r.id, 'reference', r.reference, 'priority', r.priority));
    -- Only fresh breaches page the assignee (historic overdue cases are marked silently, never a notification storm).
    if r.assignee_id is not null and r.sla_due_at > now() - interval '24 hours' then
      perform public.notify(r.assignee_id, 'support.sla_breached', r.reference || ' is past its SLA', left(r.subject, 200), '/admin/support/' || r.id, 'support.sla:' || r.id || ':' || r.sla_due_at);
    end if;
    br := br + 1;
  end loop;
  for r in select c.id from public.support_cases c join public.support_sla_policies p on p.priority = c.priority
             -- Auto-close applies to cases resolved after this lifecycle went live (2026-10-29); older resolved cases stay as they are.
             where c.status = 'resolved' and c.resolved_at >= timestamptz '2026-10-29 00:00:00+00' and c.resolved_at < now() - make_interval(days => p.auto_close_days)
               and (c.last_customer_reply_at is null or c.last_customer_reply_at < c.resolved_at) limit 500 for update of c skip locked loop
    update public.support_cases set status = 'closed' where id = r.id;
    insert into public.support_case_events(case_id, kind, actor_type) values (r.id, 'auto_closed', 'system');
    closed := closed + 1;
  end loop;
  return jsonb_build_object('first_response_breached', fr, 'sla_breached', br, 'auto_closed', closed);
end $$;
insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('support.sla_sweep', 'db', 'public.job_support_sla_sweep', 3, 'Q31: every 10 min; mark support SLA breaches, notify assignees, auto-close resolved cases')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, description = excluded.description, updated_at = now();
select cron.unschedule('support-sla-sweep') where exists (select 1 from cron.job where jobname = 'support-sla-sweep');
select cron.schedule('support-sla-sweep', '*/10 * * * *',
  $$select public.enqueue_job(p_kind => 'support.sla_sweep', p_payload => '{}'::jsonb, p_dedupe_key => 'support.sla_sweep:' || to_char(date_trunc('minute', now() at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:MI'))$$);

-- ── 12. Domain events ──
insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('support.case_state_changed', 1, 'support_case', 'A support case moved through its lifecycle (payload: case_id, reference, from, to).', null),
  ('support.case_assigned', 1, 'support_case', 'A support case was assigned to an admin (payload: case_id, assignee, reason).', null),
  ('support.case_replied', 1, 'support_case', 'Support replied or added an internal note (payload: case_id, internal; never the text).', null),
  ('support.sla_breached', 1, 'support_case', 'A support case passed its resolution SLA (payload: case_id, reference, priority).', null),
  ('support.macro_applied', 1, 'support_case', 'A support macro was applied to a case (payload: case_id, macro_id).', null),
  ('support.case_linked', 1, 'support_case', 'A canonical record was linked to a support case (payload: case_id, record_type, record_id).', null),
  ('support.case_escalated_trust', 1, 'support_case', 'A support case was escalated to Trust & Safety (payload: case_id, trust_case_id).', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate, active = true, updated_at = now();

-- ── 13. Grants ──
revoke all on function public.support_case_events_immutable(), public.support_case_access(text), public.support_link_label(text, text),
  public.support_cases_before(), public.support_cases_after(), public.support_case_for_admin(uuid), public.job_support_sla_sweep(public.job_queue)
  from public, anon, authenticated;
grant execute on function public.support_case_access(text) to authenticated;   -- used by RLS policies (boolean only)
grant execute on function public.job_support_sla_sweep(public.job_queue), public.support_link_label(text, text) to service_role;
revoke all on function public.admin_reply_case(uuid, text, boolean), public.admin_assign_case(uuid), public.admin_assign_case_to(uuid, uuid, text),
  public.admin_update_case(uuid, text, text, text), public.admin_set_case_priority(uuid, text, text),
  public.admin_create_support_case(text, text, text, text, text, jsonb), public.admin_save_support_macro(uuid, text, text, text, boolean, text, integer),
  public.admin_archive_support_macro(uuid, text), public.admin_apply_support_macro(uuid, uuid), public.admin_link_case_record(uuid, text, text),
  public.admin_unlink_case_record(uuid), public.admin_escalate_case_to_trust(uuid, text), public.admin_set_sla_policy(text, integer, integer, integer, text),
  public.support_case_reply(uuid, text), public.contact_support(text, text, text, uuid, text)
  from public, anon;
grant execute on function public.admin_reply_case(uuid, text, boolean), public.admin_assign_case(uuid), public.admin_assign_case_to(uuid, uuid, text),
  public.admin_update_case(uuid, text, text, text), public.admin_set_case_priority(uuid, text, text),
  public.admin_create_support_case(text, text, text, text, text, jsonb), public.admin_save_support_macro(uuid, text, text, text, boolean, text, integer),
  public.admin_archive_support_macro(uuid, text), public.admin_apply_support_macro(uuid, uuid), public.admin_link_case_record(uuid, text, text),
  public.admin_unlink_case_record(uuid), public.admin_escalate_case_to_trust(uuid, text), public.admin_set_sla_policy(text, integer, integer, integer, text),
  public.support_case_reply(uuid, text), public.contact_support(text, text, text, uuid, text)
  to authenticated;
