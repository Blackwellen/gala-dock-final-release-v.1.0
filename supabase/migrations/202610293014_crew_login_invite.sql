-- Q17 (lane C, 2026-10-29): crew login invitations through a command. Client roles only hold SELECT on workspace_invites
-- (least-privilege grants), so the crew invite is created by this owner-only function (same authority rule as
-- respond_to_invite: the inviter must own the workspace). The token is generated and hashed by the server; only the
-- SHA-256 hash is stored. Accepting links crew_members.user_id (trg_invite_crew_link, migration 202610293011).
create or replace function public.crew_invite_login(p_crew uuid, p_token_hash text, p_role text default 'member') returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare m public.crew_members; iid uuid; em text;
begin
  select * into m from public.crew_members where id = p_crew;
  if not found or not public.is_workspace_owner(m.workspace_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_role not in ('member','manager','finance') then raise exception 'invalid_role' using errcode = '22023'; end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'invalid_token' using errcode = '22023'; end if;
  em := lower(btrim(coalesce(m.email, '')));
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'crew_email_required' using errcode = '22023'; end if;
  insert into public.workspace_invites(workspace_id, email, role, token_hash, invited_by, crew_id)
    values (m.workspace_id, em, p_role, p_token_hash, auth.uid(), m.id) returning id into iid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), m.workspace_id, 'team.login_invited', jsonb_build_object('crew_id', m.id, 'invite_id', iid, 'role', p_role));
  return iid;
end $$;
revoke all on function public.crew_invite_login(uuid, text, text) from public, anon;
grant execute on function public.crew_invite_login(uuid, text, text) to authenticated, service_role;
