-- Maintenance levels M0–M5 (release spec §9–10). M0 is "no active window". Windows are scheduled, scoped to modules and audiences,
-- and enforced in three places: the request proxy (writes), domain choke points in the DB (payments, agent), and the workers.
-- Event-day ticket validation (scan_ticket / scan_manifest / wallet display) is never blocked below M5, and at M5 only if
-- the window explicitly lists the 'checkin' module.
create table if not exists public.maintenance_windows (
  id uuid primary key default gen_random_uuid(),
  level smallint not null check (level between 1 and 5),
  modules text[] not null default '{}' check (modules <@ array['marketplace','tickets','checkout','payments','agent','media','messaging','api','auth','provider','organizer','customer','portals','checkin','resale']),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  title text not null check (length(title) between 3 and 120),
  message text not null default '' check (length(message) <= 1000),
  status_url text check (status_url is null or status_url ~ '^https://'),
  expected_restore timestamptz,
  audience text not null default 'all' check (audience in ('all','customers','organizers','providers','admins')),
  dismissible boolean not null default true,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  bypass_roles text[] not null default '{}' check (bypass_roles <@ array['platform_admin','support','operations']),
  reference text not null default '' check (length(reference) <= 60),
  created_by uuid references auth.users(id),
  ended_at timestamptz, ended_by uuid references auth.users(id), end_note text,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists maintenance_active_idx on public.maintenance_windows(starts_at) where ended_at is null;
alter table public.maintenance_windows enable row level security;
drop policy if exists maintenance_admin_read on public.maintenance_windows;
create policy maintenance_admin_read on public.maintenance_windows for select to authenticated using (public.is_platform_admin());

-- Public, banner-safe view of what is active now (anon may read: banners show on public pages and before sign-in).
create or replace function public.maintenance_state() returns table (id uuid, level smallint, modules text[], title text, message text, status_url text, expected_restore timestamptz,
  audience text, dismissible boolean, severity text, bypass_roles text[], reference text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.id, w.level, w.modules, w.title, w.message, w.status_url, w.expected_restore, w.audience, w.dismissible, w.severity, w.bypass_roles, w.reference, w.starts_at, w.ends_at
  from public.maintenance_windows w where w.ended_at is null and w.starts_at <= now() and (w.ends_at is null or w.ends_at > now())
  order by w.level desc, w.starts_at;
$$;
revoke all on function public.maintenance_state() from public;
grant execute on function public.maintenance_state() to anon, authenticated, service_role;

-- Effective level for a module (0 = normal). A window with no modules applies platform-wide. 'checkin' is only covered when named.
create or replace function public.maintenance_level(p_module text) returns smallint
language sql stable security definer set search_path = '' as $$
  select coalesce(max(w.level), 0)::smallint from public.maintenance_windows w
  where w.ended_at is null and w.starts_at <= now() and (w.ends_at is null or w.ends_at > now())
    and (p_module = any(w.modules) or (cardinality(w.modules) = 0 and p_module <> 'checkin'));
$$;
revoke all on function public.maintenance_level(text) from public;
grant execute on function public.maintenance_level(text) to anon, authenticated, service_role;

-- Raises when writes to a module are frozen for the caller (M3+ on that module, or M4+ platform-wide). Platform admins listed in
-- bypass_roles pass. Used by DB choke points; the proxy applies the same rule to HTTP writes.
create or replace function public.assert_writable(p_module text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare lvl smallint := public.maintenance_level(p_module);
begin
  if lvl >= 3 and not (public.is_platform_admin() and exists (select 1 from public.maintenance_windows w where w.ended_at is null and w.starts_at <= now()
      and (w.ends_at is null or w.ends_at > now()) and 'platform_admin' = any(w.bypass_roles))) then
    raise exception 'maintenance:%:%', p_module, lvl using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.assert_writable(text) from public;
grant execute on function public.assert_writable(text) to authenticated, service_role;

-- Admin control. M4/M5 additionally need recent step-up MFA (spec §7: maintenance/security lockdown is a sensitive action).
create or replace function public.start_maintenance(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; lvl smallint := (p->>'level')::smallint;
begin
  if not public.has_admin_permission('settings') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if lvl >= 4 and not public.bg_step_up_ok() then raise exception 'step_up_required' using errcode = '42501'; end if;
  insert into public.maintenance_windows(level, modules, starts_at, ends_at, title, message, status_url, expected_restore, audience, dismissible, severity, bypass_roles, reference, created_by)
  values (lvl, coalesce(array(select jsonb_array_elements_text(p->'modules')), '{}'), coalesce((p->>'starts_at')::timestamptz, now()), (p->>'ends_at')::timestamptz,
    p->>'title', coalesce(p->>'message', ''), nullif(p->>'status_url', ''), (p->>'expected_restore')::timestamptz, coalesce(p->>'audience', 'all'),
    case when lvl >= 4 then false else coalesce((p->>'dismissible')::boolean, true) end,
    coalesce(p->>'severity', case when lvl >= 4 then 'critical' when lvl >= 2 then 'warning' else 'info' end),
    coalesce(array(select jsonb_array_elements_text(p->'bypass_roles')), case when lvl >= 4 then array['platform_admin'] else '{}' end), coalesce(p->>'reference', ''), auth.uid())
  returning id into v;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'maintenance.started', jsonb_build_object('window_id', v, 'level', lvl, 'modules', p->'modules', 'reference', p->>'reference'));
  return v;
end $$;
create or replace function public.end_maintenance(p_window uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('settings') then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.maintenance_windows set ended_at = now(), ended_by = auth.uid(), end_note = left(coalesce(p_note, ''), 500) where id = p_window and ended_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'maintenance.ended', jsonb_build_object('window_id', p_window, 'note', left(p_note, 500)));
end $$;
revoke all on function public.start_maintenance(jsonb) from public, anon;
revoke all on function public.end_maintenance(uuid, text) from public, anon;
grant execute on function public.start_maintenance(jsonb) to authenticated, service_role;
grant execute on function public.end_maintenance(uuid, text) to authenticated, service_role;

-- DB choke points: new payment orders (checkout/payments) and agent tool execution.
create or replace function public.trg_maintenance_payment_orders() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform public.assert_writable('payments'); if public.maintenance_level('payments') >= 2 or public.maintenance_level('checkout') >= 2 then
  raise exception 'maintenance:payments' using errcode = 'P0001'; end if; return new; end $$;
drop trigger if exists maintenance_guard on public.payment_orders;
create trigger maintenance_guard before insert on public.payment_orders for each row execute function public.trg_maintenance_payment_orders();
