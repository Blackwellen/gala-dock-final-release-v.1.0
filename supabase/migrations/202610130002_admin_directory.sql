-- Phase 3: Admin identity directory and session revocation.
-- auth.users is never exposed to clients; these functions return only the fields Admin screens need and
-- require the 'users' (or 'support' for read) permission. Raw credentials and payment instruments are never returned.
begin;

create or replace function public.admin_user_directory(p_search text default '', p_filter text default 'all', p_limit integer default 10, p_offset integer default 0)
returns table(id uuid, email text, full_name text, avatar_url text, status text, identity_verified boolean, created_at timestamptz,
  last_active_at timestamptz, account_type text, workspaces bigint, workspace_name text, events bigint, upcoming_events bigint,
  tickets bigint, used_tickets bigint, trust_flag text, open_cases bigint, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_admin_permission('users') or public.has_admin_permission('support')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  with base as (
    select u.id, u.email::text, p.full_name, p.avatar_url, p.status, p.identity_verified, u.created_at, coalesce(p.last_active_at, u.last_sign_in_at) as last_active_at,
      case when exists(select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where m.user_id = u.id and w.kind = 'provider') then 'provider'
           when exists(select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where m.user_id = u.id and w.kind = 'organizer') then 'organizer'
           when exists(select 1 from public.platform_admins a where a.user_id = u.id) then 'admin' else 'consumer' end as account_type,
      (select count(*) from public.workspace_members m where m.user_id = u.id and m.status = 'active') as workspaces,
      (select w.name from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where m.user_id = u.id order by m.created_at limit 1) as workspace_name,
      (select count(*) from public.events e where e.owner_id = u.id) as events,
      (select count(*) from public.events e where e.owner_id = u.id and e.starts_at > now()) as upcoming_events,
      (select count(*) from public.tickets t where t.holder_id = u.id) as tickets,
      (select count(*) from public.tickets t where t.holder_id = u.id and t.status = 'used') as used_tickets,
      (select tc.category || ' (' || count(*) over () || ')' from public.trust_cases tc where tc.subject_type = 'user' and tc.subject_id = u.id and tc.status in ('open','in_review') limit 1) as trust_flag,
      (select count(*) from public.support_cases c where c.requester_id = u.id and c.status <> 'resolved') as open_cases
    from auth.users u left join public.profiles p on p.id = u.id
    where (coalesce(p_search, '') = '' or u.email ilike '%' || p_search || '%' or p.full_name ilike '%' || p_search || '%' or u.id::text = p_search)
  ), filtered as (
    select * from base b where p_filter = 'all' or (p_filter = 'restricted' and b.status = 'restricted') or (p_filter = 'verified' and b.identity_verified)
  )
  select f.*, count(*) over () as total_count from filtered f
  order by f.last_active_at desc nulls last limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset);
end $$;

-- Summary counts for the Users KPI strip (identities only; no personal data).
create or replace function public.admin_user_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_admin_permission('users') or public.has_admin_permission('support')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'total', (select count(*) from auth.users),
    'total_prev', (select count(*) from auth.users where created_at < now() - interval '30 days'),
    'verified', (select count(*) from public.profiles where identity_verified),
    'restricted', (select count(*) from public.profiles where status = 'restricted'),
    'with_events', (select count(distinct owner_id) from public.events),
    'with_tickets', (select count(distinct holder_id) from public.tickets where holder_id is not null),
    'signups_by_day', (select coalesce(jsonb_agg(n order by d), '[]') from (select date_trunc('day', created_at) d, count(*) n from auth.users where created_at > now() - interval '30 days' group by 1) s));
end $$;

create or replace function public.admin_user_identity(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u auth.users;
begin
  if not (public.has_admin_permission('users') or public.has_admin_permission('support')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into u from auth.users where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', u.id, 'email', u.email, 'email_confirmed', u.email_confirmed_at is not null, 'phone', u.phone,
    'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
    'mfa_factors', (select count(*) from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
    'active_sessions', (select count(*) from auth.sessions s where s.user_id = u.id and (s.not_after is null or s.not_after > now())),
    'providers', coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb));
end $$;

-- Revokes every session for a user (forces sign-in everywhere). Requires 'users' permission and a reason.
create or replace function public.admin_revoke_sessions(p_user uuid, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.admin_require('users', p_reason);
  if p_user = auth.uid() then raise exception 'cannot_restrict_self' using errcode = '42501'; end if;
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.sessions_revoked', jsonb_build_object('user_id', p_user, 'sessions', n, 'reason', p_reason));
  return n;
end $$;

revoke all on function public.admin_user_directory(text, text, integer, integer), public.admin_user_stats(), public.admin_user_identity(uuid),
  public.admin_revoke_sessions(uuid, text) from public, anon;
grant execute on function public.admin_user_directory(text, text, integer, integer), public.admin_user_stats(), public.admin_user_identity(uuid),
  public.admin_revoke_sessions(uuid, text) to authenticated;
commit;
