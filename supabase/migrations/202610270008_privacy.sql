-- Data-subject requests and account deletion (release spec §88–91, UK GDPR Arts. 12–22).
-- Requests are tracked against the statutory one-month deadline (extendable by two months for complex requests, with reasons).
-- Deletion runs after a 14-day grace period: personal data is erased or anonymised; records the law requires us to keep
-- (payments, tax, disputes, audit) are retained with the person de-identified. Blockers are surfaced, never silently ignored.
create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('PR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  user_id uuid references auth.users(id) on delete set null,
  requester_email text not null,
  kind text not null check (kind in ('access','portability','erasure','rectification','restriction','objection')),
  status text not null default 'received' check (status in ('received','verifying','in_progress','extended','completed','refused','withdrawn')),
  detail text not null default '' check (length(detail) <= 4000),
  received_at timestamptz not null default now(),
  due_at timestamptz not null default (now() + interval '1 month'),
  extended_reason text,
  assigned_to uuid references auth.users(id),
  outcome text, refusal_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists privacy_requests_open_idx on public.privacy_requests(due_at) where status not in ('completed','refused','withdrawn');
alter table public.privacy_requests enable row level security;
drop policy if exists privacy_requests_read on public.privacy_requests;
create policy privacy_requests_read on public.privacy_requests for select using (user_id = (select auth.uid()) or public.has_admin_permission('support') or public.has_admin_permission('audit'));

alter table public.profiles add column if not exists deleted_at timestamptz;

create or replace function public.submit_privacy_request(p_kind text, p_detail text) returns text
language plpgsql security definer set search_path = '' as $$
declare ref text; addr text;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select email into addr from auth.users where id = auth.uid();
  if exists (select 1 from public.privacy_requests where user_id = auth.uid() and kind = p_kind and status in ('received','verifying','in_progress','extended')) then raise exception 'already_open' using errcode = '22023'; end if;
  insert into public.privacy_requests(user_id, requester_email, kind, detail, status) values (auth.uid(), addr, p_kind, left(coalesce(p_detail, ''), 4000),
    case when p_kind in ('access','portability') then 'in_progress' else 'received' end) returning reference into ref;   -- signed-in requester is already verified
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'privacy.request_submitted', jsonb_build_object('kind', p_kind, 'reference', ref));
  insert into public.notifications(user_id, kind, title, body, link) values (auth.uid(), 'security', 'We received your privacy request ' || ref,
    'We’ll respond by ' || to_char(now() + interval '1 month', 'DD Mon YYYY') || '. You can follow progress in your account.', '/account?tab=security#privacy');
  return ref;
end $$;
revoke all on function public.submit_privacy_request(text, text) from public, anon;
grant execute on function public.submit_privacy_request(text, text) to authenticated;

create or replace function public.update_privacy_request(p_id uuid, p_status text, p_note text, p_extend boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.privacy_requests;
begin
  if not public.has_admin_permission('support') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into r from public.privacy_requests where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_status not in ('verifying','in_progress','extended','completed','refused','withdrawn') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if (p_status in ('refused','extended') or p_extend) and length(trim(coalesce(p_note, ''))) < 10 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.privacy_requests set status = p_status, assigned_to = coalesce(assigned_to, auth.uid()),
    due_at = case when p_extend and extended_reason is null then received_at + interval '3 months' else due_at end,
    extended_reason = case when p_extend then left(p_note, 1000) else extended_reason end,
    refusal_reason = case when p_status = 'refused' then left(p_note, 1000) else refusal_reason end,
    outcome = case when p_status = 'completed' then left(coalesce(p_note, ''), 1000) else outcome end,
    completed_at = case when p_status in ('completed','refused','withdrawn') then now() else null end where id = p_id;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'privacy.request_' || p_status, jsonb_build_object('reference', r.reference, 'note', left(p_note, 300)));
  if r.user_id is not null then insert into public.notifications(user_id, kind, title, body, link) values (r.user_id, 'security', 'Update on privacy request ' || r.reference,
    case p_status when 'completed' then 'Your request is complete.' when 'refused' then 'We couldn’t fulfil your request: ' || left(p_note, 300) when 'extended' then 'We need more time; we’ll respond by ' || to_char(r.received_at + interval '3 months', 'DD Mon YYYY') || '.' else 'Your request is being processed.' end,
    '/account?tab=security#privacy'); end if;
end $$;
revoke all on function public.update_privacy_request(uuid, text, text, boolean) from public, anon;
grant execute on function public.update_privacy_request(uuid, text, text, boolean) to authenticated;

-- What stops an erasure going ahead. The user sees these and can resolve them (transfer a workspace, wait for an event, etc.).
create or replace function public.deletion_blockers(p_user uuid default null) returns table (code text, detail text)
language sql stable security definer set search_path = '' as $$
  with u as (select coalesce(p_user, (select auth.uid())) id)
  select 'workspace_owner', 'You own “' || w.name || '”, which has other active members. Transfer ownership or remove them first.'
    from public.workspaces w, u where w.owner_id = u.id and w.status = 'active'
      and exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id <> u.id and m.status = 'active')
  union all
  select 'open_dispute', 'A booking dispute (' || d.reference || ') is still open.' from public.booking_disputes d, u
    where d.status not in ('resolved','closed') and (d.opened_by = u.id)
  union all
  select 'upcoming_tickets', count(*)::text || ' ticket(s) for upcoming events would be cancelled. Transfer them or wait until the events have passed.'
    from public.tickets t join public.events e on e.id = t.event_id, u where t.holder_id = u.id and t.status = 'valid' and e.starts_at > now() having count(*) > 0
  union all
  select 'platform_admin', 'Platform administrator accounts are deleted by another administrator.' from public.platform_admins p, u where p.user_id = u.id;
$$;
revoke all on function public.deletion_blockers(uuid) from public, anon;
grant execute on function public.deletion_blockers(uuid) to authenticated, service_role;

-- Erasure (service role, from the deletion worker). Personal data → erased/anonymised; legally retained records keep their rows
-- with the person de-identified (financial, tax, dispute, audit). Returns a manifest for the privacy request record.
create or replace function public.erase_user_data(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m jsonb := '{}'; n integer;
begin
  if exists (select 1 from public.deletion_blockers(p_user)) then raise exception 'blocked' using errcode = 'P0001'; end if;
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
  update public.workspace_members set status = 'revoked' where user_id = p_user;
  update public.workspaces set status = 'suspended' where owner_id = p_user and status = 'active';
  delete from auth.sessions where user_id = p_user;
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'privacy.user_erased', jsonb_build_object('user', p_user, 'manifest', m));
  return m || jsonb_build_object('retained', 'payment orders, invoices, payouts, tax records (6 years), disputes, audit log — de-identified');
end $$;
revoke all on function public.erase_user_data(uuid) from public, anon, authenticated;
grant execute on function public.erase_user_data(uuid) to service_role;

-- Accounts past the 14-day grace period, for the deletion worker.
create or replace function public.due_deletions() returns table (user_id uuid, requested_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.deletion_requested_at from public.profiles p where p.deletion_requested_at < now() - interval '14 days' and p.deleted_at is null limit 50;
$$;
revoke all on function public.due_deletions() from public, anon, authenticated;
grant execute on function public.due_deletions() to service_role;

select cron.unschedule('privacy-deletions') where exists (select 1 from cron.job where jobname = 'privacy-deletions');
select cron.schedule('privacy-deletions', '17 2 * * *', $$select public.dispatch_worker('/api/cron/privacy')$$);
