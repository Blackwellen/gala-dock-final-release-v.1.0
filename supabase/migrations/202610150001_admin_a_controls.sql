-- Phase 3 · Platform Admin AD-001..AD-009 controls (users, workspaces, events, marketplace, tickets).
-- Every state change: security definer, per-area permission, a typed reason (admin_require), and an audit_events row.
-- Reads stay on the existing RLS policies (is_platform_admin / has_admin_permission).
begin;

-- ════════════════════════ Internal notes on platform records ════════════════════════
-- Separate from admin_notes (commerce/partners/trust/support) so each area owns its own entity list.
create table if not exists public.admin_record_notes (
  id bigint generated always as identity primary key,
  subject_type text not null check (subject_type in ('user','workspace','event','listing')),
  subject_id uuid not null,
  body text not null check (length(body) between 1 and 2000),
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists admin_record_notes_subject_idx on public.admin_record_notes(subject_type, subject_id, created_at desc);
alter table public.admin_record_notes enable row level security;
drop policy if exists admin_record_notes_read on public.admin_record_notes;
create policy admin_record_notes_read on public.admin_record_notes for select to authenticated using (
  (subject_type = 'user' and (public.has_admin_permission('users') or public.has_admin_permission('support')))
  or (subject_type = 'workspace' and public.has_admin_permission('workspaces'))
  or (subject_type = 'event' and (public.has_admin_permission('events') or public.has_admin_permission('tickets')))
  or (subject_type = 'listing' and public.has_admin_permission('marketplace')));
revoke all on public.admin_record_notes from anon, authenticated;
grant select on public.admin_record_notes to authenticated;

create or replace function public.admin_add_record_note(p_subject_type text, p_subject uuid, p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare perm text; nid bigint; who text;
begin
  perm := case p_subject_type when 'user' then 'users' when 'workspace' then 'workspaces' when 'event' then 'events' when 'listing' then 'marketplace' end;
  if perm is null then raise exception 'invalid_entity' using errcode = '22023'; end if;
  if not public.has_admin_permission(perm) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_body, ''))) < 2 then raise exception 'body_required' using errcode = '22023'; end if;
  select coalesce(nullif(p.full_name, ''), 'Admin') into who from public.profiles p where p.id = auth.uid();
  insert into public.admin_record_notes(subject_type, subject_id, body, author_id, author_name)
    values (p_subject_type, p_subject, left(trim(p_body), 2000), auth.uid(), coalesce(who, 'Admin')) returning id into nid;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.note_added', jsonb_build_object('entity_type', p_subject_type, 'entity_id', p_subject));
  return nid;
end $$;

-- ════════════════════════ Workspaces: plan and commission ════════════════════════
create or replace function public.admin_set_workspace_plan(p_ws uuid, p_plan text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare old text;
begin
  perform public.admin_require('workspaces', p_reason);
  if p_plan not in ('starter','pro','business','enterprise') then raise exception 'invalid_plan' using errcode = '22023'; end if;
  select plan into old from public.workspaces where id = p_ws for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.workspaces set plan = p_plan where id = p_ws;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'admin.workspace_plan_changed', jsonb_build_object('from', old, 'to', p_plan, 'reason', p_reason));
end $$;

-- Commission is a commercial term, so it needs the commerce permission as well as a reason.
create or replace function public.admin_set_workspace_commission(p_ws uuid, p_bps integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare old integer;
begin
  perform public.admin_require('commerce', p_reason);
  if p_bps is null or p_bps < 0 or p_bps > 5000 then raise exception 'invalid_rate' using errcode = '22023'; end if;
  select commission_bps into old from public.workspaces where id = p_ws for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.workspaces set commission_bps = p_bps where id = p_ws;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'admin.workspace_commission_changed', jsonb_build_object('from_bps', old, 'to_bps', p_bps, 'reason', p_reason));
end $$;

-- ════════════════════════ Events: restrict / reinstate, featured ════════════════════════
-- Restricting suspends the event (hidden from discovery, sales stop) and remembers the prior status for reinstatement.
create or replace function public.admin_set_event_restriction(p_event uuid, p_restrict boolean, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare e public.events; nxt text;
begin
  perform public.admin_require('events', p_reason);
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_restrict then
    if e.status = 'suspended' then raise exception 'invalid_transition' using errcode = '22023'; end if;
    nxt := 'suspended';
    update public.events set status = 'suspended', updated_at = now(),
      settings = coalesce(settings, '{}') || jsonb_build_object('admin_restriction', jsonb_build_object('previous_status', e.status, 'reason', p_reason, 'at', now(), 'by', auth.uid()))
      where id = e.id;
    update public.ticket_tiers set status = 'paused' where event_id = e.id and status in ('on_sale','scheduled');
  else
    if e.status <> 'suspended' then raise exception 'invalid_transition' using errcode = '22023'; end if;
    nxt := coalesce(e.settings->'admin_restriction'->>'previous_status', 'draft');
    update public.events set status = nxt, updated_at = now(), settings = coalesce(settings, '{}') - 'admin_restriction' where id = e.id;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), e.workspace_id, case when p_restrict then 'admin.event_restricted' else 'admin.event_reinstated' end,
      jsonb_build_object('event_id', e.id, 'from', e.status, 'to', nxt, 'reason', p_reason, 'appealable', p_restrict));
  return nxt;
end $$;

create or replace function public.admin_set_event_featured(p_event uuid, p_featured boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.events;
begin
  perform public.admin_require('events', p_reason);
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_featured and (e.visibility <> 'public' or e.status in ('suspended','cancelled','archived')) then raise exception 'invalid_transition' using errcode = '22023'; end if;
  update public.events set settings = coalesce(settings, '{}') || jsonb_build_object('featured', p_featured), updated_at = now() where id = e.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), e.workspace_id, case when p_featured then 'admin.event_featured' else 'admin.event_unfeatured' end, jsonb_build_object('event_id', e.id, 'reason', p_reason));
end $$;

-- ════════════════════════ Tickets: pause / resume sales ════════════════════════
create or replace function public.admin_set_ticket_sales(p_event uuid, p_pause boolean, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare e public.events; n integer;
begin
  perform public.admin_require('tickets', p_reason);
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_pause then
    update public.ticket_tiers set status = 'paused' where event_id = e.id and status in ('on_sale','scheduled');
  else
    if e.status = 'suspended' then raise exception 'invalid_transition' using errcode = '22023'; end if;
    update public.ticket_tiers set status = case when sold + held >= quantity then 'sold_out' else 'on_sale' end where event_id = e.id and status = 'paused';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'invalid_transition' using errcode = '22023'; end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), e.workspace_id, case when p_pause then 'admin.ticket_sales_paused' else 'admin.ticket_sales_resumed' end, jsonb_build_object('event_id', e.id, 'tiers', n, 'reason', p_reason));
  return n;
end $$;

revoke all on function public.admin_add_record_note(text, uuid, text), public.admin_set_workspace_plan(uuid, text, text),
  public.admin_set_workspace_commission(uuid, integer, text), public.admin_set_event_restriction(uuid, boolean, text),
  public.admin_set_event_featured(uuid, boolean, text), public.admin_set_ticket_sales(uuid, boolean, text) from public, anon;
grant execute on function public.admin_add_record_note(text, uuid, text), public.admin_set_workspace_plan(uuid, text, text),
  public.admin_set_workspace_commission(uuid, integer, text), public.admin_set_event_restriction(uuid, boolean, text),
  public.admin_set_event_featured(uuid, boolean, text), public.admin_set_ticket_sales(uuid, boolean, text) to authenticated;

commit;
