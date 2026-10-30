-- Q31 maintenance (W08 S3, S4). Additive and backward-compatible with the deployed app.
--
-- S3  start_/end_maintenance go through admin_require: settings permission, live aal2 session, written reason; M4/M5 still need a
--     fresh second factor (bg_step_up_ok). The deployed form sends no 'reason' key yet: until it ships, a payload without the key
--     is accepted with the reason derived from the title and audited with legacy_reason=true. A payload WITH the key must carry a
--     real reason (>= 5 chars).
-- S4  enforcement honours the window's audience. A window applies to a request/write when audience = 'all' or the audience is one
--     of the actor's audiences. New audience 'qa' is test-only: never in the public feed (maintenance_state), never in the legacy
--     one-argument level/assert functions, never matched by a real user's audiences, and refused by start_maintenance. It lets
--     tests/release/maintenance.spec.ts exercise live SQL evaluation without affecting anyone.

alter table public.maintenance_windows drop constraint if exists maintenance_windows_audience_check;
alter table public.maintenance_windows add constraint maintenance_windows_audience_check
  check (audience = any (array['all', 'customers', 'organizers', 'providers', 'admins', 'qa']));

-- Public feed (banner + proxy): real audiences only.
create or replace function public.maintenance_state()
returns table(id uuid, level smallint, modules text[], title text, message text, status_url text, expected_restore timestamptz, audience text,
  dismissible boolean, severity text, bypass_roles text[], reference text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.id, w.level, w.modules, w.title, w.message, w.status_url, w.expected_restore, w.audience, w.dismissible, w.severity, w.bypass_roles, w.reference, w.starts_at, w.ends_at
  from public.maintenance_windows w where w.ended_at is null and w.starts_at <= now() and (w.ends_at is null or w.ends_at > now()) and w.audience <> 'qa'
  order by w.level desc, w.starts_at;
$$;

-- Legacy (ops view): any real-audience window covering the module.
create or replace function public.maintenance_level(p_module text)
returns smallint language sql stable security definer set search_path = '' as $$
  select coalesce(max(w.level), 0)::smallint from public.maintenance_windows w
  where w.ended_at is null and w.starts_at <= now() and (w.ends_at is null or w.ends_at > now()) and w.audience <> 'qa'
    and (p_module = any(w.modules) or (cardinality(w.modules) = 0 and p_module <> 'checkin'));
$$;

-- Audience-aware level: windows for everyone plus windows for one of the given audiences.
create or replace function public.maintenance_level(p_module text, p_audiences text[])
returns smallint language sql stable security definer set search_path = '' as $$
  select coalesce(max(w.level), 0)::smallint from public.maintenance_windows w
  where w.ended_at is null and w.starts_at <= now() and (w.ends_at is null or w.ends_at > now())
    and ((w.audience = 'all') or w.audience = any(coalesce(p_audiences, '{}')))
    and (p_module = any(w.modules) or (cardinality(w.modules) = 0 and p_module <> 'checkin'));
$$;
revoke all on function public.maintenance_level(text, text[]) from public;
grant execute on function public.maintenance_level(text, text[]) to anon, authenticated, service_role;

-- Which maintenance audiences a user belongs to (never 'qa'). Unknown actor → every real audience (conservative).
create or replace function public.maintenance_audiences(p_user uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select case when p_user is null then array['customers', 'organizers', 'providers'] else
    array['customers']
    || case when exists (select 1 from public.workspaces w left join public.workspace_members m on m.workspace_id = w.id and m.user_id = p_user and m.status = 'active'
                          where w.kind = 'organizer' and (w.owner_id = p_user or m.user_id is not null)) then array['organizers'] else '{}'::text[] end
    || case when exists (select 1 from public.workspaces w left join public.workspace_members m on m.workspace_id = w.id and m.user_id = p_user and m.status = 'active'
                          where w.kind = 'provider' and (w.owner_id = p_user or m.user_id is not null)) then array['providers'] else '{}'::text[] end
    || case when exists (select 1 from public.platform_admins a where a.user_id = p_user) then array['admins'] else '{}'::text[] end
  end;
$$;
revoke all on function public.maintenance_audiences(uuid) from public, anon, authenticated;
grant execute on function public.maintenance_audiences(uuid) to service_role;

create or replace function public.assert_writable(p_module text, p_audiences text[])
returns void language plpgsql stable security definer set search_path = '' as $$
declare lvl smallint := public.maintenance_level(p_module, p_audiences);
begin
  if lvl >= 3 and not (public.is_platform_admin() and exists (select 1 from public.maintenance_windows w where w.ended_at is null and w.starts_at <= now()
      and (w.ends_at is null or w.ends_at > now()) and w.audience <> 'qa' and 'platform_admin' = any(w.bypass_roles))) then
    raise exception 'maintenance:%:%', p_module, lvl using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.assert_writable(text, text[]) from public, anon;
grant execute on function public.assert_writable(text, text[]) to authenticated, service_role;

-- Legacy one-argument form: the caller's audiences.
create or replace function public.assert_writable(p_module text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_writable(p_module, public.maintenance_audiences((select auth.uid())));
end $$;

-- Payment orders: the payer's audiences. A boost is bought by a workspace, so the customer audience does not apply to it.
create or replace function public.trg_maintenance_payment_orders()
returns trigger language plpgsql security definer set search_path = '' as $$
declare aud text[] := public.maintenance_audiences(new.payer_id);
begin
  if new.kind = 'platform_boost' and cardinality(array_remove(aud, 'customers')) > 0 then aud := array_remove(aud, 'customers'); end if;
  perform public.assert_writable('payments', aud);
  if public.maintenance_level('payments', aud) >= 2 or public.maintenance_level('checkout', aud) >= 2 then
    raise exception 'maintenance:payments' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- S3: start/end through admin_require.
create or replace function public.start_maintenance(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid; lvl smallint := (p->>'level')::smallint; legacy boolean := not (p ? 'reason');
  v_reason text := case when p ? 'reason' then trim(coalesce(p->>'reason', '')) else 'Scheduled: ' || coalesce(p->>'title', '') end;
  v_aud text := coalesce(nullif(p->>'audience', ''), 'all');
begin
  perform public.admin_require('settings', v_reason);
  if lvl >= 4 and not public.bg_step_up_ok() then raise exception 'step_up_required' using errcode = '42501'; end if;
  if v_aud not in ('all', 'customers', 'organizers', 'providers', 'admins') then raise exception 'invalid_audience' using errcode = '22023'; end if;
  insert into public.maintenance_windows(level, modules, starts_at, ends_at, title, message, status_url, expected_restore, audience, dismissible, severity, bypass_roles, reference, created_by)
  values (lvl, coalesce(array(select jsonb_array_elements_text(p->'modules')), '{}'), coalesce((p->>'starts_at')::timestamptz, now()), (p->>'ends_at')::timestamptz,
    p->>'title', coalesce(p->>'message', ''), nullif(p->>'status_url', ''), (p->>'expected_restore')::timestamptz, v_aud,
    case when lvl >= 4 then false else coalesce((p->>'dismissible')::boolean, true) end,
    coalesce(p->>'severity', case when lvl >= 4 then 'critical' when lvl >= 2 then 'warning' else 'info' end),
    coalesce(array(select jsonb_array_elements_text(p->'bypass_roles')), case when lvl >= 4 then array['platform_admin'] else '{}' end), coalesce(p->>'reference', ''), auth.uid())
  returning id into v;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'maintenance.started',
    jsonb_build_object('window_id', v, 'level', lvl, 'modules', p->'modules', 'audience', v_aud, 'reference', p->>'reference', 'reason', left(v_reason, 500), 'legacy_reason', legacy));
  return v;
end $$;

create or replace function public.end_maintenance(p_window uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('settings', p_note);
  update public.maintenance_windows set ended_at = now(), ended_by = auth.uid(), end_note = left(coalesce(p_note, ''), 500) where id = p_window and ended_at is null and audience <> 'qa';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'maintenance.ended', jsonb_build_object('window_id', p_window, 'note', left(p_note, 500)));
end $$;
