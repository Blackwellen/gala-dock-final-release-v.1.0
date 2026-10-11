-- Phase 1: identity, invitations, onboarding, trust and audit hardening.
-- Additive: existing rows are preserved; new columns have safe defaults.
begin;

-- Profiles: consent evidence and last authorised context.
alter table public.profiles
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists marketing_opt_in_at timestamptz,
  add column if not exists last_workspace_id uuid references public.workspaces(id) on delete set null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  marketing boolean := coalesce((meta->>'marketing_opt_in')::boolean, false);
begin
  insert into public.profiles(id, full_name, terms_version, terms_accepted_at, marketing_opt_in, marketing_opt_in_at)
  values (
    new.id,
    left(coalesce(meta->>'full_name', ''), 100),
    nullif(left(meta->>'terms_version', 20), ''),
    case when meta->>'terms_version' is not null then now() end,
    marketing,
    case when marketing then now() end
  ) on conflict do nothing;
  insert into public.audit_events(actor_id, event) values (new.id, 'auth.registered');
  return new;
end;
$$;

-- Audit history. Written only by trusted functions; readable by the actor or workspace owner.
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  event text not null check (event ~ '^[a-z_]+\.[a-z_]+$'),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists audit_events_actor_idx on public.audit_events(actor_id, created_at desc);
create index if not exists audit_events_workspace_idx on public.audit_events(workspace_id, created_at desc);
alter table public.audit_events enable row level security;

-- Workspaces: provider capabilities, account status, trust and payout state.
alter table public.workspaces
  add column if not exists capabilities text[] not null default '{}',
  add column if not exists status text not null default 'active',
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists payout_status text not null default 'not_connected',
  add column if not exists stripe_account_id text;
do $$ begin
  alter table public.workspaces add constraint workspaces_status_check check (status in ('active','suspended'));
  alter table public.workspaces add constraint workspaces_verification_check check (verification_status in ('unverified','pending','verified','rejected'));
  alter table public.workspaces add constraint workspaces_payout_check check (payout_status in ('not_connected','incomplete','pending','active','restricted'));
  alter table public.workspaces add constraint workspaces_capabilities_check check (capabilities <@ array['venue','service']::text[]);
exception when duplicate_object then null; end $$;
-- Retries can never create a second draft of the same workspace type.
create unique index if not exists workspaces_one_draft_per_kind on public.workspaces(owner_id, kind) where not onboarding_complete;

-- Memberships: status supports suspension and revocation without deleting history.
alter table public.workspace_members
  add column if not exists status text not null default 'active',
  add column if not exists created_at timestamptz not null default now();
do $$ begin
  alter table public.workspace_members add constraint workspace_members_status_check check (status in ('active','suspended','revoked'));
exception when duplicate_object then null; end $$;

-- Invitations: hashed single-use tokens with explicit terminal states.
alter table public.workspace_invites
  add column if not exists token_hash text,
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists declined_at timestamptz,
  add column if not exists revoked_at timestamptz;
alter table public.workspace_invites drop column if exists token;
delete from public.workspace_invites where token_hash is null;
alter table public.workspace_invites alter column token_hash set not null;
do $$ begin
  alter table public.workspace_invites add constraint workspace_invites_token_hash_key unique (token_hash);
  alter table public.workspace_invites add constraint workspace_invites_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$');
  alter table public.workspace_invites add constraint workspace_invites_email_lower check (email = lower(email));
exception when duplicate_object then null; end $$;
create unique index if not exists workspace_invites_one_pending on public.workspace_invites(workspace_id, email)
  where accepted_at is null and declined_at is null and revoked_at is null;

-- Server-side rate limiting buckets (service role only).
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
alter table public.rate_limits enable row level security;

-- Membership checks only honour active memberships of active workspaces.
create or replace function public.is_workspace_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.workspaces w
    where w.id = target and w.status = 'active' and (
      w.owner_id = (select auth.uid())
      or exists(select 1 from public.workspace_members m
                where m.workspace_id = w.id and m.user_id = (select auth.uid()) and m.status = 'active')
    )
  );
$$;
create or replace function public.is_workspace_owner(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.workspaces where id = target and owner_id = (select auth.uid()) and status = 'active');
$$;

-- Every workspace gets its owner membership in the same transaction.
create or replace function public.handle_new_workspace() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workspace_members(workspace_id, user_id, role, status)
  values (new.id, new.owner_id, 'owner', 'active')
  on conflict (workspace_id, user_id) do update set role = 'owner', status = 'active';
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
  values (new.owner_id, new.id, 'workspace.created', jsonb_build_object('kind', new.kind));
  return new;
end;
$$;
drop trigger if exists gala_new_workspace on public.workspaces;
create trigger gala_new_workspace after insert on public.workspaces for each row execute function public.handle_new_workspace();
insert into public.workspace_members(workspace_id, user_id, role)
  select id, owner_id, 'owner' from public.workspaces on conflict do nothing;

-- Owners keep their own read access to suspended workspaces so the access page can explain the state.
drop policy if exists workspaces_member_read on public.workspaces;
create policy workspaces_member_read on public.workspaces for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_workspace_member(id));
drop policy if exists workspaces_owner_update on public.workspaces;
create policy workspaces_owner_update on public.workspaces for update to authenticated
  using (owner_id = (select auth.uid()) and status = 'active') with check (owner_id = (select auth.uid()));

-- Membership writes happen only in trusted functions (owner trigger, invite acceptance).
drop policy if exists members_owner_manage on public.workspace_members;
drop policy if exists members_read on public.workspace_members;
create policy members_read on public.workspace_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_workspace_member(workspace_id));

-- Invites: owners create and revoke; nobody can read token hashes of others' workspaces.
drop policy if exists invites_owner_manage on public.workspace_invites;
create policy invites_owner_read on public.workspace_invites for select to authenticated using (public.is_workspace_owner(workspace_id));
create policy invites_owner_insert on public.workspace_invites for insert to authenticated
  with check (public.is_workspace_owner(workspace_id) and invited_by = (select auth.uid())
    and exists(select 1 from public.workspaces w where w.id = workspace_id and w.onboarding_complete));
create policy invites_owner_revoke on public.workspace_invites for update to authenticated
  using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));

create policy audit_read on public.audit_events for select to authenticated
  using (actor_id = (select auth.uid()) or (workspace_id is not null and public.is_workspace_owner(workspace_id)));

-- Column-level privileges: trust, payout, status and publication cannot be set by clients.
revoke insert, update on public.workspaces from authenticated;
grant insert (owner_id, name, kind, settings, onboarding_step, capabilities) on public.workspaces to authenticated;
grant update (name, settings, onboarding_step, capabilities) on public.workspaces to authenticated;
revoke insert, update, delete on public.workspace_members from authenticated;
revoke insert, update, delete on public.workspace_invites from authenticated;
grant insert (workspace_id, email, role, token_hash, invited_by, expires_at) on public.workspace_invites to authenticated;
grant update (revoked_at) on public.workspace_invites to authenticated;
revoke insert, update on public.listings from authenticated;
grant insert (workspace_id, name, kind, description, location, details) on public.listings to authenticated;
grant update (name, kind, description, location, details) on public.listings to authenticated;
revoke insert, update on public.profiles from authenticated;
grant update (full_name, home_area, currency, interests, notifications) on public.profiles to authenticated;
revoke all on public.audit_events from anon, authenticated;
grant select on public.audit_events to authenticated;
revoke all on public.rate_limits from anon, authenticated;

-- Invite preview for the public invite page: minimal, privacy-safe fields only.
create or replace function public.invite_preview(p_token_hash text)
returns table(workspace_name text, workspace_kind text, role text, invited_by_name text, expires_at timestamptz, state text)
language sql stable security definer set search_path = '' as $$
  select w.name, w.kind, i.role, coalesce(nullif(p.full_name, ''), 'A workspace owner'), i.expires_at,
    case when i.revoked_at is not null or w.status <> 'active' then 'revoked'
         when i.accepted_at is not null then 'used'
         when i.declined_at is not null then 'declined'
         when i.expires_at < now() then 'expired'
         else 'valid' end
  from public.workspace_invites i
  join public.workspaces w on w.id = i.workspace_id
  left join public.profiles p on p.id = i.invited_by
  where i.token_hash = p_token_hash;
$$;

-- Atomic, idempotent invite acceptance. Never replaces an existing role.
create or replace function public.respond_to_invite(p_token_hash text, p_invite_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  user_email text;
  inv public.workspace_invites;
  ws public.workspaces;
  existing public.workspace_members;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select lower(email) into user_email from auth.users where id = uid;
  select * into inv from public.workspace_invites
    where (p_token_hash is not null and token_hash = p_token_hash) or (p_token_hash is null and id = p_invite_id)
    for update;
  if not found then return jsonb_build_object('result', 'unavailable'); end if;
  if inv.email <> user_email then return jsonb_build_object('result', 'mismatch'); end if;
  select * into ws from public.workspaces where id = inv.workspace_id;
  if inv.revoked_at is not null or ws.status <> 'active' then return jsonb_build_object('result', 'revoked'); end if;
  if inv.accepted_at is not null then
    return jsonb_build_object('result', 'used', 'kind', ws.kind, 'workspace_id', ws.id);
  end if;
  if inv.declined_at is not null then return jsonb_build_object('result', 'declined'); end if;
  if inv.expires_at < now() then return jsonb_build_object('result', 'expired'); end if;
  -- The inviter must still own the workspace for the invitation to carry authority.
  if inv.invited_by is distinct from ws.owner_id then return jsonb_build_object('result', 'revoked'); end if;

  if not p_accept then
    update public.workspace_invites set declined_at = now() where id = inv.id;
    insert into public.audit_events(actor_id, workspace_id, event) values (uid, ws.id, 'invite.declined');
    return jsonb_build_object('result', 'declined');
  end if;

  select * into existing from public.workspace_members where workspace_id = ws.id and user_id = uid;
  if found and existing.status = 'active' then
    update public.workspace_invites set accepted_at = now() where id = inv.id;
    insert into public.audit_events(actor_id, workspace_id, event, metadata)
      values (uid, ws.id, 'invite.accepted', jsonb_build_object('role_kept', existing.role));
    return jsonb_build_object('result', 'already_member', 'kind', ws.kind, 'workspace_id', ws.id);
  elsif found then
    -- Suspended or revoked members cannot reinstate themselves with an old invite.
    return jsonb_build_object('result', 'revoked');
  end if;
  insert into public.workspace_members(workspace_id, user_id, role, status) values (ws.id, uid, inv.role, 'active');
  update public.workspace_invites set accepted_at = now() where id = inv.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (uid, ws.id, 'invite.accepted', jsonb_build_object('role', inv.role));
  return jsonb_build_object('result', 'accepted', 'kind', ws.kind, 'workspace_id', ws.id);
end;
$$;

-- Pending invitations addressed to the signed-in user (for the onboarding entry screen).
create or replace function public.my_pending_invites()
returns table(id uuid, workspace_name text, workspace_kind text, role text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, w.name, w.kind, i.role, i.expires_at
  from public.workspace_invites i join public.workspaces w on w.id = i.workspace_id
  where i.email = (select lower(email) from auth.users where id = auth.uid())
    and i.accepted_at is null and i.declined_at is null and i.revoked_at is null
    and i.expires_at > now() and w.status = 'active' and i.invited_by = w.owner_id;
$$;

-- Every workspace context the signed-in user holds, including suspended ones (for the access page).
create or replace function public.my_workspace_access()
returns table(id uuid, name text, kind text, role text, member_status text, workspace_status text, onboarding_complete boolean)
language sql stable security definer set search_path = '' as $$
  select w.id, w.name, w.kind, m.role, m.status, w.status, w.onboarding_complete
  from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
  where m.user_id = auth.uid()
  order by w.created_at desc;
$$;

-- Activates a draft workspace. Ownership is checked against the caller.
create or replace function public.complete_workspace_onboarding(p_workspace uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare ws public.workspaces;
begin
  select * into ws from public.workspaces where id = p_workspace and owner_id = auth.uid() and status = 'active' for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  if ws.kind = 'provider' and cardinality(ws.capabilities) = 0 then
    raise exception 'capability_required' using errcode = '22023';
  end if;
  if not ws.onboarding_complete then
    update public.workspaces set onboarding_complete = true, onboarding_step = 'complete' where id = ws.id;
    update public.profiles set onboarding_complete = true, last_workspace_id = ws.id where id = auth.uid();
    insert into public.audit_events(actor_id, workspace_id, event, metadata)
      values (auth.uid(), ws.id, 'workspace.activated', jsonb_build_object('kind', ws.kind, 'capabilities', ws.capabilities));
  end if;
end;
$$;

-- Marks the customer profile complete (the column is not client-writable).
create or replace function public.complete_customer_onboarding()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set onboarding_complete = true where id = auth.uid();
$$;

-- Records the last workspace the caller opened, only if they can access it.
create or replace function public.remember_workspace(p_workspace uuid)
returns void language sql security definer set search_path = '' as $$
  update public.profiles set last_workspace_id = p_workspace
  where id = auth.uid() and public.is_workspace_member(p_workspace);
$$;

-- Readiness is computed from server-controlled state only.
create or replace function public.listing_readiness(p_listing uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l public.listings; ws public.workspaces; missing text[] := '{}';
begin
  select * into l from public.listings where id = p_listing;
  if not found or not public.is_workspace_member(l.workspace_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into ws from public.workspaces where id = l.workspace_id;
  if length(trim(l.name)) < 3 then missing := missing || 'listing_name'; end if;
  if length(trim(l.description)) < 40 then missing := missing || 'listing_description'; end if;
  if length(trim(l.location)) = 0 then missing := missing || 'listing_location'; end if;
  if coalesce(jsonb_array_length(l.details->'photos'), 0) = 0 then missing := missing || 'listing_photo'; end if;
  if not ws.onboarding_complete then missing := missing || 'workspace_setup'; end if;
  if ws.verification_status <> 'verified' then missing := missing || 'verification'; end if;
  if ws.payout_status <> 'active' then missing := missing || 'payouts'; end if;
  return jsonb_build_object('eligible', cardinality(missing) = 0, 'missing', to_jsonb(missing),
    'verification_status', ws.verification_status, 'payout_status', ws.payout_status, 'published', l.published);
end;
$$;

-- Publishing re-checks eligibility inside the transaction; ineligible listings stay drafts.
create or replace function public.publish_listing(p_listing uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.listings; readiness jsonb;
begin
  select * into l from public.listings where id = p_listing for update;
  if not found or not public.is_workspace_owner(l.workspace_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  readiness := public.listing_readiness(p_listing);
  if not (readiness->>'eligible')::boolean then return readiness; end if;
  update public.listings set published = true where id = p_listing;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), l.workspace_id, 'listing.published', jsonb_build_object('listing_id', l.id));
  return readiness || jsonb_build_object('published', true);
end;
$$;

-- Client-reportable security events, attributed to the caller.
create or replace function public.log_auth_event(p_event text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_event not in ('auth.login', 'auth.mfa_verified', 'auth.mfa_enrolled', 'auth.password_reset', 'auth.signed_out', 'auth.email_verified') then
    return;
  end if;
  insert into public.audit_events(actor_id, event) values (auth.uid(), p_event);
end;
$$;

-- Fixed-window rate limiter used by server routes with the service role.
create or replace function public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_hits integer;
begin
  insert into public.rate_limits(key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else public.rate_limits.hits + 1 end,
    window_start = case when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else public.rate_limits.window_start end
  returning hits into current_hits;
  return current_hits <= p_max;
end;
$$;

revoke all on function public.handle_new_workspace(), public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
revoke all on function public.invite_preview(text), public.respond_to_invite(text, uuid, boolean), public.my_pending_invites(),
  public.my_workspace_access(), public.complete_workspace_onboarding(uuid), public.complete_customer_onboarding(),
  public.remember_workspace(uuid), public.listing_readiness(uuid), public.publish_listing(uuid), public.log_auth_event(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;
grant execute on function public.respond_to_invite(text, uuid, boolean), public.my_pending_invites(), public.my_workspace_access(),
  public.complete_workspace_onboarding(uuid), public.complete_customer_onboarding(), public.remember_workspace(uuid),
  public.listing_readiness(uuid), public.publish_listing(uuid), public.log_auth_event(text) to authenticated;

commit;
