-- Q01 (lane A): foundation for feature flags (domain 24), data-residency metadata (269) and secret metadata (210/267).
-- Reuses platform_settings (versioned, draft -> published, admin-audited via admin_publish_setting / admin_rollback_setting)
-- instead of adding a parallel configuration store. Additive and idempotent.

-- 1. Allow the new canonical settings sections.
alter table public.platform_settings drop constraint if exists platform_settings_section_check;
alter table public.platform_settings add constraint platform_settings_section_check check (section = any (array[
  'general','commerce','marketplace','ticketing','trust','agent','communications','integrations','flags','residency']));

-- 2. Feature flags: ONE canonical place. Definitions live in the published platform_settings 'flags' section as
--    { "<flag_key>": { "enabled": bool, "description": text, "rollout_pct": 0-100, "plans": [plan], "kinds": [workspace kind],
--                      "workspaces": [uuid], "users": [uuid], "beta": bool, "emergency_off": bool } }.
--    Per-workspace overrides live in workspaces.settings.flags.<flag_key> (bool) and can only be written server-side
--    (guard_workspace_protected_settings). Evaluation order: unknown -> false; emergency_off -> false; workspace override;
--    user allow-list; workspace allow-list; plan/kind/beta gates; deterministic percentage rollout; enabled.
insert into public.platform_settings(section, version, status, value, effective_at, change_reason)
select 'flags', 1, 'published', '{}'::jsonb, now(), 'Q01: canonical feature-flag registry (empty)'
where not exists (select 1 from public.platform_settings where section = 'flags');

create or replace function public.feature_enabled(p_flag text, p_workspace uuid default null)
returns boolean
language plpgsql
stable security definer
set search_path to ''
as $function$
declare def jsonb; w public.workspaces; uid uuid := auth.uid(); ov jsonb; subject text;
begin
  if p_flag is null or p_flag !~ '^[a-z0-9_.-]{2,64}$' then return false; end if;
  select value -> p_flag into def from public.platform_settings where section = 'flags' and status = 'published' order by version desc limit 1;
  if def is null or jsonb_typeof(def) <> 'object' then return false; end if;
  if coalesce((def ->> 'emergency_off')::boolean, false) then return false; end if;
  -- A caller can only evaluate a workspace they belong to; otherwise the flag is evaluated without workspace context (no leak).
  if p_workspace is not null and (uid is null and coalesce(auth.role(), '') = 'service_role' or public.is_workspace_member(p_workspace)) then
    select * into w from public.workspaces where id = p_workspace;
  end if;
  if w.id is not null then
    ov := w.settings -> 'flags' -> p_flag;
    if jsonb_typeof(ov) = 'boolean' then return ov::text = 'true'; end if;
  end if;
  if uid is not null and coalesce(def -> 'users', '[]'::jsonb) ? uid::text then return true; end if;
  if w.id is not null and coalesce(def -> 'workspaces', '[]'::jsonb) ? w.id::text then return true; end if;
  if jsonb_array_length(coalesce(def -> 'plans', '[]'::jsonb)) > 0 and (w.id is null or not (def -> 'plans') ? coalesce(w.plan, 'starter')) then return false; end if;
  if jsonb_array_length(coalesce(def -> 'kinds', '[]'::jsonb)) > 0 and (w.id is null or not (def -> 'kinds') ? w.kind) then return false; end if;
  if coalesce((def ->> 'beta')::boolean, false) and (w.id is null or not coalesce((w.settings ->> 'beta')::boolean, false)) then return false; end if;
  if def ? 'rollout_pct' then
    subject := coalesce(w.id::text, uid::text);
    if subject is null then return false; end if;
    return abs(hashtext(p_flag || ':' || subject)) % 100 < greatest(least(coalesce((def ->> 'rollout_pct')::int, 0), 100), 0);
  end if;
  return coalesce((def ->> 'enabled')::boolean, false);
end
$function$;
revoke execute on function public.feature_enabled(text, uuid) from public;
grant execute on function public.feature_enabled(text, uuid) to anon, authenticated, service_role;

-- Workspace flag overrides and beta enrolment are an admin operation (audited, reason required, step-up via admin_require).
create or replace function public.admin_set_workspace_flag(p_ws uuid, p_flag text, p_value boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.admin_require('workspaces', p_reason);
  if p_flag is null or p_flag !~ '^[a-z0-9_.-]{2,64}$' then raise exception 'invalid_flag' using errcode = '22023'; end if;
  update public.workspaces set settings = case when p_value is null
      then jsonb_set(coalesce(settings, '{}'), '{flags}', coalesce(settings -> 'flags', '{}') - p_flag)
      else jsonb_set(coalesce(settings, '{}'), '{flags}', coalesce(settings -> 'flags', '{}') || jsonb_build_object(p_flag, p_value)) end
   where id = p_ws;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'admin', p_ws, 'admin.workspace_flag_set', jsonb_build_object('flag', p_flag, 'value', p_value, 'reason', p_reason));
end
$function$;
revoke execute on function public.admin_set_workspace_flag(uuid, text, boolean, text) from public, anon;
grant execute on function public.admin_set_workspace_flag(uuid, text, boolean, text) to authenticated, service_role;

-- 3. Data residency metadata. The workspace's declared region; processing/storage regions per region live in the published
--    'residency' settings section. Seeded as UNVERIFIED: nothing here claims a region that has not been confirmed with the provider.
alter table public.workspaces add column if not exists data_region text not null default 'uk';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workspaces_data_region_check' and conrelid = 'public.workspaces'::regclass) then
    alter table public.workspaces add constraint workspaces_data_region_check check (data_region in ('uk','eu','us'));
  end if;
end $$;
insert into public.platform_settings(section, version, status, value, effective_at, change_reason)
select 'residency', 1, 'published', jsonb_build_object(
    'default_region', 'uk',
    'regions', jsonb_build_object('uk', jsonb_build_object(
      'database', jsonb_build_object('provider', 'supabase', 'region', null, 'verified', false),
      'object_storage', jsonb_build_object('provider', 'cloudflare_r2', 'jurisdiction', null, 'verified', false),
      'email', jsonb_build_object('provider', 'resend', 'region', null, 'verified', false),
      'ai', jsonb_build_object('provider', 'azure_openai', 'region', null, 'verified', false))),
    'export_requires_admin_permission', 'workspaces'), now(), 'Q01: residency metadata (unverified until confirmed with each provider)'
where not exists (select 1 from public.platform_settings where section = 'residency');

create or replace function public.admin_set_workspace_region(p_ws uuid, p_region text, p_reason text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare old text;
begin
  perform public.admin_require('workspaces', p_reason);
  if p_region not in ('uk','eu','us') then raise exception 'invalid_region' using errcode = '22023'; end if;
  select data_region into old from public.workspaces where id = p_ws for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.workspaces set data_region = p_region where id = p_ws;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'admin', p_ws, 'admin.workspace_region_changed', jsonb_build_object('from', old, 'to', p_region, 'reason', p_reason));
end
$function$;
revoke execute on function public.admin_set_workspace_region(uuid, text, text) from public, anon;
grant execute on function public.admin_set_workspace_region(uuid, text, text) to authenticated, service_role;

-- 4. Secret metadata — NEVER secret values. Inventory of environment/KMS-held secrets with version and rotation evidence.
create table if not exists public.secret_metadata (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name ~ '^[A-Z0-9_]{2,80}$'),
  purpose text not null default '',
  store text not null default 'env' check (store in ('env','supabase_vault','kms')),
  key_version integer not null default 1 check (key_version >= 1),
  status text not null default 'active' check (status in ('active','rotating','retired','compromised')),
  rotated_at timestamptz,
  rotate_every_days integer check (rotate_every_days is null or rotate_every_days > 0),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.secret_metadata enable row level security;
drop policy if exists secret_metadata_admin_read on public.secret_metadata;
create policy secret_metadata_admin_read on public.secret_metadata for select to authenticated using (public.has_admin_permission('settings'));
revoke all on table public.secret_metadata from anon;
revoke insert, update, delete, truncate, references, trigger on table public.secret_metadata from authenticated;

insert into public.secret_metadata(name, purpose, rotate_every_days) values
  ('SUPABASE_SERVICE_ROLE_KEY', 'Server-side Supabase access (trusted workers only)', 365),
  ('STRIPE_CONNECT_SECRET_KEY', 'Stripe API (payments, Connect)', 365),
  ('STRIPE_WEBHOOK_SECRET', 'Stripe webhook signature verification', 365),
  ('CRON_SECRET', 'Scheduled worker authentication', 180),
  ('TICKET_QR_SECRET', 'Rotating ticket credential signing', 365),
  ('FIELD_ENCRYPTION_KEYS', 'Application field/token encryption key ring (AES-256-GCM)', 365),
  ('CALENDAR_TOKEN_KEY', 'Legacy calendar OAuth token encryption key (superseded by FIELD_ENCRYPTION_KEYS)', 365),
  ('RESEND_API_KEY', 'Transactional email', 365),
  ('CLAMAV_SCAN_TOKEN', 'Shared malware-scanning gateway', 180),
  ('GOOGLE_CLIENT_SECRET', 'Google sign-in OAuth client', 365),
  ('AZURE_OPENAI_API_KEY', 'Gala Agent model access', 365)
on conflict (name) do nothing;
