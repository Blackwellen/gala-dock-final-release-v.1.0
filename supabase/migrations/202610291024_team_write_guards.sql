-- W06 P1s routed to Q12 (lane A, 2026-10-29). Additive; reads unchanged.
--  1. Assignment race: shifts are serialised per crew member by enforce_crew_capacity (migration 1023, advisory lock
--     crew_capacity:<crew>); draft shifts now count as occupying the person too (and are themselves checked).
--  2. Staff-role bypass: crew_members / shifts writes were open to every workspace member (is_workspace_member). Reads stay
--     member-wide; INSERT/UPDATE/DELETE now need owner or manager (has_workspace_role), matching the team RPCs and actions.
--  3. Q01: owner-only revoke/suspend/reinstate of a workspace membership, audited (no RPC existed).

create or replace function public.enforce_crew_capacity()
returns trigger language plpgsql set search_path to '' as $$
declare cr public.provider_capacity_rules; clash text; pre interval; post interval; n integer;
begin
  if new.crew_id is null or new.status not in ('draft','pending','confirmed') or new.starts_at is null or new.ends_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.crew_id is not distinct from new.crew_id and old.starts_at = new.starts_at and old.ends_at = new.ends_at
     and old.status in ('draft','pending','confirmed') then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crew_capacity:' || new.crew_id::text, 0));
  select * into cr from public.provider_capacity_rules where scope = 'crew' and crew_id = new.crew_id and active;
  select coalesce(nullif(b.note, ''), b.kind) into clash from public.availability_blocks b
    where b.crew_id = new.crew_id and b.kind in ('blocked','maintenance') and tstzrange(b.starts_at, b.ends_at) && tstzrange(new.starts_at, new.ends_at) limit 1;
  if clash is not null and coalesce(cr.policy, 'block') = 'block' then raise exception 'crew_conflict' using errcode = '23P01', detail = 'unavailable: ' || clash; end if;
  pre := make_interval(mins => coalesce(cr.setup_minutes, 0) + coalesce(cr.travel_minutes, 0));
  post := make_interval(mins => coalesce(cr.teardown_minutes, 0) + coalesce(cr.travel_minutes, 0));
  select count(*) into n from public.shifts s where s.crew_id = new.crew_id and s.id <> new.id and s.status in ('draft','pending','confirmed')
    and tstzrange(s.starts_at, s.ends_at) && tstzrange(new.starts_at - pre, new.ends_at + post);
  if n + 1 > coalesce(cr.concurrent_limit, 1) and coalesce(cr.policy, 'block') = 'block' then
    raise exception 'crew_conflict' using errcode = '23P01', detail = format('%s overlapping shift(s)', n);
  end if;
  return new;
end $$;
revoke all on function public.enforce_crew_capacity() from public, anon, authenticated;

drop policy if exists crew_members_rw on public.crew_members;
drop policy if exists crew_members_member_read on public.crew_members;
drop policy if exists crew_members_manager_insert on public.crew_members;
drop policy if exists crew_members_manager_update on public.crew_members;
drop policy if exists crew_members_manager_delete on public.crew_members;
create policy crew_members_member_read on public.crew_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy crew_members_manager_insert on public.crew_members for insert to authenticated with check (public.has_workspace_role(workspace_id, array['owner','manager']));
create policy crew_members_manager_update on public.crew_members for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','manager'])) with check (public.has_workspace_role(workspace_id, array['owner','manager']));
create policy crew_members_manager_delete on public.crew_members for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner','manager']));

drop policy if exists shifts_rw on public.shifts;
drop policy if exists shifts_member_read on public.shifts;
drop policy if exists shifts_manager_insert on public.shifts;
drop policy if exists shifts_manager_update on public.shifts;
drop policy if exists shifts_manager_delete on public.shifts;
create policy shifts_member_read on public.shifts for select to authenticated using (public.is_workspace_member(workspace_id));
create policy shifts_manager_insert on public.shifts for insert to authenticated with check (public.has_workspace_role(workspace_id, array['owner','manager']));
create policy shifts_manager_update on public.shifts for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','manager'])) with check (public.has_workspace_role(workspace_id, array['owner','manager']));
create policy shifts_manager_delete on public.shifts for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner','manager']));

-- Owner-only membership status change (revoke = access removed; suspended = paused; active = reinstated). Never the owner row.
create or replace function public.revoke_workspace_member(p_ws uuid, p_user uuid, p_status text default 'revoked', p_reason text default '')
returns void language plpgsql security definer set search_path to '' as $$
declare w public.workspaces; m public.workspace_members;
begin
  select * into w from public.workspaces where id = p_ws;
  if not found or w.owner_id is distinct from auth.uid() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_status not in ('revoked','suspended','active') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_user = w.owner_id then raise exception 'cannot_change_owner' using errcode = '22023'; end if;
  select * into m from public.workspace_members where workspace_id = p_ws and user_id = p_user for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if m.role = 'owner' then raise exception 'cannot_change_owner' using errcode = '22023'; end if;
  update public.workspace_members set status = p_status where workspace_id = p_ws and user_id = p_user;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), p_ws, 'workspace.member_' || case p_status when 'active' then 'reinstated' else p_status end,
      jsonb_build_object('user_id', p_user, 'from', m.status, 'to', p_status, 'role', m.role, 'reason', left(coalesce(p_reason, ''), 300)));
end $$;
revoke all on function public.revoke_workspace_member(uuid, uuid, text, text) from public, anon;
grant execute on function public.revoke_workspace_member(uuid, uuid, text, text) to authenticated, service_role;
