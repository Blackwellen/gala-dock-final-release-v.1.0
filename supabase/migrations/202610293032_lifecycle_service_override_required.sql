-- Q39 remainder (lane C, 2026-10-29) — (a) service-role direct lifecycle writes now REQUIRE the audited override. Additive.
--
-- 3026 let trusted writers with no end-user JWT (auth.uid() is null: the service role over PostgREST, the Management API / cron
-- sessions) move an event INTO ready / published / on_sale past its blockers, only logging it as event_lifecycle_overrides
-- source = 'service_direct'. 63 such writes were logged on 2026-10-29, all from spec fixtures (Q20, Q21, Q22, Q26, Q40 …).
-- The specs now go through the explicit, audited, transaction-local override, so the row guard refuses the bypass:
--   * uid null + blockers -> `lifecycle_override_required: …` (22023, blockers in DETAIL). No row change.
--   * uid null + NO blockers -> allowed exactly as before (nothing to override).
--   * event_transition (gd.event_cmd) and an open override grant (event_lifecycle_override_begin) -> unchanged.
--   * Gala Dock admins outside the workspace (admin_direct) and end users -> unchanged (logged / 22023 lifecycle_preconditions).
-- Live writers checked (2026-10-29):
--   complete_ended_events (cron events-complete-ended)  -> target 'completed', never evaluated by the guard (exempt by construction);
--   admin_set_event_restriction reinstate               -> from 'suspended', not a first entry (exempt by construction);
--   create_demo_workspace, service_set_event_status      -> override;   event_transition / seed-depth/publish.mjs -> gd.event_cmd;
--   scripts/seed-demo.mjs (inserts showcase events on sale) -> moved to service_insert_event (below);
--   src/ server actions write status with the USER client (auth.uid() set) -> unaffected; no cron/worker writes event status.
--
-- New SERVICE_ONLY fixture/seed helpers (one transaction = one override grant, every row it lets through logged as 'use'):
--   service_insert_event(p_row jsonb, p_reason text)            -> setof events (insert with exactly the given columns; defaults apply)
--   service_update_events(p_ids uuid[], p_patch jsonb, p_reason) -> setof events (update the given columns; visibility untouched,
--                                                                   unlike service_set_event_status which publishes)
-- Rollback: re-apply trg_event_lifecycle_row_guard from 202610293026 (logs instead of refusing); the helpers are inert without callers.

create or replace function public.service_insert_event(p_row jsonb, p_reason text) returns setof public.events
language plpgsql security definer set search_path = '' as $$
declare cols text; bad text; v public.events; g uuid;
begin
  if p_row is null or jsonb_typeof(p_row) <> 'object' or p_row = '{}'::jsonb then raise exception 'row_required' using errcode = '22023'; end if;
  select string_agg(k, ', ') into bad from jsonb_object_keys(p_row) k
    where not exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = 'public.events'::regclass and a.attname = k and a.attnum > 0 and not a.attisdropped);
  if bad is not null then raise exception 'unknown_column: %', bad using errcode = '42703'; end if;
  select string_agg(format('%I', k), ', ') into cols from jsonb_object_keys(p_row) k;
  g := public.event_lifecycle_override_begin(coalesce(p_reason, ''));
  execute format('insert into public.events (%s) select %s from jsonb_populate_record(null::public.events, $1) returning *', cols, cols) into v using p_row;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (null, 'system', v.workspace_id, 'event.service_insert', jsonb_build_object('event_id', v.id, 'status', v.status, 'reason', p_reason, 'override', g, 'source', 'service'));
  perform public.event_lifecycle_override_end();
  return next v;
end $$;
revoke all on function public.service_insert_event(jsonb, text) from public, anon, authenticated;
grant execute on function public.service_insert_event(jsonb, text) to service_role;

create or replace function public.service_update_events(p_ids uuid[], p_patch jsonb, p_reason text) returns setof public.events
language plpgsql security definer set search_path = '' as $$
declare cols text; bad text; v public.events; g uuid; prev jsonb;
begin
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'ids_required' using errcode = '22023'; end if;
  if cardinality(p_ids) > 200 then raise exception 'too_many_ids' using errcode = '22023'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'patch_required' using errcode = '22023'; end if;
  if p_patch ? 'id' then raise exception 'id_immutable' using errcode = '22023'; end if;
  select string_agg(k, ', ') into bad from jsonb_object_keys(p_patch) k
    where not exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = 'public.events'::regclass and a.attname = k and a.attnum > 0 and not a.attisdropped);
  if bad is not null then raise exception 'unknown_column: %', bad using errcode = '42703'; end if;
  select string_agg(format('%I', k), ', ') into cols from jsonb_object_keys(p_patch) k;
  select coalesce(jsonb_object_agg(e.id, e.status), '{}') into prev from public.events e where e.id = any(p_ids);
  g := public.event_lifecycle_override_begin(coalesce(p_reason, ''));
  for v in execute format('update public.events e set (%s) = (select %s from jsonb_populate_record(e, $1)) where e.id = any($2) returning e.*', cols, cols)
    using p_patch, p_ids loop
    insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
      values (null, 'system', v.workspace_id, 'event.service_update', jsonb_build_object('event_id', v.id, 'from', prev ->> v.id::text, 'to', v.status,
        'columns', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k), 'reason', p_reason, 'override', g, 'source', 'service'));
    return next v;
  end loop;
  perform public.event_lifecycle_override_end();
end $$;
revoke all on function public.service_update_events(uuid[], jsonb, text) from public, anon, authenticated;
grant execute on function public.service_update_events(uuid[], jsonb, text) to service_role;

-- Request role for the audit row (current_user is the definer inside this SECURITY DEFINER trigger, so 3026 always logged 'postgres').
create or replace function public.lifecycle_request_role() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
                  session_user::text);
$$;
revoke all on function public.lifecycle_request_role() from public, anon, authenticated;
grant execute on function public.lifecycle_request_role() to service_role;

create or replace function public.trg_event_lifecycle_row_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_from text; b jsonb; g uuid; uid uuid := (select auth.uid()); src text; cur text;
begin
  if new.status not in ('ready', 'published', 'on_sale') then return null; end if;
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status or old.status not in ('draft', 'planning', 'ready') then return null; end if;
    v_from := old.status;
  else
    v_from := 'draft';
  end if;
  if coalesce(current_setting('gd.event_cmd', true), '') = new.id::text then return null; end if;   -- event_transition already checked
  select status into cur from public.events where id = new.id;
  if cur is distinct from new.status then return null; end if;   -- changed again since (that change is judged on its own)
  g := public.event_lifecycle_override_current();
  if g is not null then
    insert into public.event_lifecycle_overrides(kind, source, grant_id, actor_id, db_role, event_id, from_status, to_status, blockers)
      values ('use', 'override', g, uid, public.lifecycle_request_role(), new.id, case when tg_op = 'UPDATE' then old.status end, new.status,
              public.event_lifecycle_blockers_for(new.id, new.status, v_from));
    return null;
  end if;
  if uid is null then src := 'service_direct';
  elsif public.has_admin_permission('events') and not public.can_access_event(new.id) then src := 'admin_direct';
  end if;
  begin
    b := public.event_lifecycle_blockers_for(new.id, new.status, v_from);
  exception when insufficient_privilege then
    -- ops gating is member-scoped; an admin outside the workspace is recorded with the structural check unavailable.
    if src is null then raise; end if;
    b := jsonb_build_array(jsonb_build_object('key', 'unchecked', 'label', 'Blockers not evaluated for this actor.'));
  end;
  if jsonb_array_length(b) = 0 then return null; end if;
  -- Q39: a trusted writer with no end-user token must open the audited override (no silent bypass any more).
  if src = 'service_direct' then
    raise exception 'lifecycle_override_required: %', (select string_agg(x ->> 'label', ' ') from jsonb_array_elements(b) x)
      using errcode = '22023', detail = b::text,
            hint = 'Service-role / system writes: use service_set_event_status, service_insert_event or service_update_events (audited override), or event_transition.';
  end if;
  if src is not null then
    insert into public.event_lifecycle_overrides(kind, source, actor_id, db_role, event_id, from_status, to_status, blockers)
      values ('use', src, uid, public.lifecycle_request_role(), new.id, case when tg_op = 'UPDATE' then old.status end, new.status, b);
    return null;
  end if;
  raise exception 'lifecycle_preconditions: %', (select string_agg(x ->> 'label', ' ') from jsonb_array_elements(b) x)
    using errcode = '22023', detail = b::text, hint = 'Fix the blockers, or use event_transition to see them.';
end $$;
revoke all on function public.trg_event_lifecycle_row_guard() from public, anon, authenticated;
