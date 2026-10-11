-- MFA recovery codes and workspace MFA policy (release spec §7–8).
-- Supabase Auth has TOTP factors but no recovery codes: codes are generated server-side, only SHA-256 hashes are stored, each is
-- single-use, and redeeming one removes the user's factors so they can sign in and enrol a new authenticator (never a silent bypass).
create table if not exists public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, code_hash)
);
create index if not exists mfa_recovery_codes_user_idx on public.mfa_recovery_codes(user_id) where used_at is null;
alter table public.mfa_recovery_codes enable row level security;   -- no policies: service role only

create or replace function public.my_recovery_code_count() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.mfa_recovery_codes where user_id = (select auth.uid()) and used_at is null;
$$;
revoke all on function public.my_recovery_code_count() from public, anon;
grant execute on function public.my_recovery_code_count() to authenticated;

-- Workspace policy lives in workspaces.settings.security.mfa_policy: optional | admins | finance | all.
create or replace function public.mfa_required(p_policy text, p_role text) returns boolean language sql immutable as $$
  select case coalesce(p_policy, 'optional')
    when 'all' then true
    when 'admins' then p_role in ('owner','manager')
    when 'finance' then p_role in ('owner','manager','finance')
    else false end;
$$;

create or replace function public.set_workspace_mfa_policy(p_workspace uuid, p_policy text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_workspace_role(p_workspace, array['owner']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_policy not in ('optional','admins','finance','all') then raise exception 'invalid_policy' using errcode = '22023'; end if;
  -- The owner setting a requirement must already be protected, so they can't lock the workspace into a state they can't satisfy.
  if p_policy <> 'optional' and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then raise exception 'owner_mfa_required' using errcode = '42501'; end if;
  update public.workspaces set settings = jsonb_set(coalesce(settings, '{}'), '{security}', coalesce(settings->'security', '{}') || jsonb_build_object('mfa_policy', p_policy)) where id = p_workspace;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', p_workspace, 'workspace.mfa_policy_changed', jsonb_build_object('policy', p_policy));
end $$;
revoke all on function public.set_workspace_mfa_policy(uuid, text) from public, anon;
grant execute on function public.set_workspace_mfa_policy(uuid, text) to authenticated;
