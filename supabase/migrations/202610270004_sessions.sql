-- Session visibility, revocation and new-device sign-in detection (release spec §6).
create or replace function public.my_sessions() returns table (id uuid, created_at timestamptz, last_active timestamptz, user_agent text, ip text, aal text, current boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.created_at, coalesce(s.refreshed_at, s.updated_at, s.created_at), left(coalesce(s.user_agent, ''), 300), host(s.ip), s.aal::text,
    s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
  from auth.sessions s where s.user_id = (select auth.uid()) and (s.not_after is null or s.not_after > now())
  order by coalesce(s.refreshed_at, s.updated_at, s.created_at) desc limit 50;
$$;
revoke all on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;

-- Signs out every other device (refresh tokens cascade with the session). The current session is kept.
create or replace function public.revoke_other_sessions() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  delete from auth.sessions where user_id = auth.uid() and id::text <> coalesce(auth.jwt() ->> 'session_id', '');
  get diagnostics n = row_count;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'auth.sessions_revoked', jsonb_build_object('count', n));
  return n;
end $$;
revoke all on function public.revoke_other_sessions() from public, anon;
grant execute on function public.revoke_other_sessions() to authenticated;

-- New-device detection: a sign-in from an IP not seen for this user in 90 days is audited and the user notified;
-- for platform admins it also raises a trust signal for review.
create or replace function public.trg_session_new_device() returns trigger language plpgsql security definer set search_path = '' as $$
declare seen boolean; is_admin boolean;
begin
  if new.ip is null then return new; end if;
  select exists (select 1 from auth.sessions s where s.user_id = new.user_id and s.id <> new.id and s.ip = new.ip and s.created_at > now() - interval '90 days') into seen;
  if not seen then
    select exists (select 1 from public.audit_events a where a.actor_id = new.user_id and a.event = 'auth.new_device_login' and a.metadata ->> 'ip' = host(new.ip) and a.created_at > now() - interval '90 days') into seen;
  end if;
  if seen then return new; end if;
  -- First-ever session isn't "new device".
  if not exists (select 1 from public.audit_events a where a.actor_id = new.user_id and a.event like 'auth.%' and a.created_at < now() - interval '1 minute')
     and not exists (select 1 from auth.sessions s where s.user_id = new.user_id and s.id <> new.id) then return new; end if;
  select exists (select 1 from public.platform_admins p where p.user_id = new.user_id) into is_admin;
  insert into public.audit_events(actor_id, actor_type, event, metadata)
    values (new.user_id, 'user', 'auth.new_device_login', jsonb_build_object('ip', host(new.ip), 'user_agent', left(coalesce(new.user_agent, ''), 200), 'admin', is_admin));
  insert into public.notifications(user_id, kind, title, body, link)
    values (new.user_id, 'security', 'New sign-in to your account', 'From ' || host(new.ip) || coalesce(' · ' || left(new.user_agent, 80), '') || '. If this wasn’t you, sign out other sessions and change your password.', '/account?tab=security#sessions');
  return new;
exception when others then return new;   -- never block a sign-in on detection failure
end $$;
drop trigger if exists gd_session_new_device on auth.sessions;
create trigger gd_session_new_device after insert on auth.sessions for each row execute function public.trg_session_new_device();
