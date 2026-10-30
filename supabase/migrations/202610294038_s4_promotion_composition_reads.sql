-- Lane D · S4 (W03 organiser UI, 2026-10-29): two read helpers the organiser screens need. Additive only; no table changes.
--   * media_assets_problems(workspace, event?) — the Q23 public-use problems (alt text, licence, credit, approval, Q04 file
--     decision) for each asset the caller's workspace owns, so the media library can show badges before anyone publishes.
--     media_public_problems() itself stays service-only; this wrapper checks workspace membership first.
--   * campaign_setup_blockers(campaign) — the current campaign_blockers() list for a campaign the caller can read, so the
--     5-step wizard can show blockers on load without saving a step (save_campaign_setup bumps the version).
-- Both SECURITY DEFINER, search_path '', authenticated + service_role only (no anon).

create or replace function public.media_assets_problems(p_workspace uuid, p_event uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_workspace_member(p_workspace) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_event is not null and not exists (select 1 from public.events e where e.id = p_event and e.workspace_id = p_workspace) then raise exception 'event_not_in_workspace' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('asset_id', a.id, 'problems', to_jsonb(public.media_public_problems(a))) order by a.created_at desc)
    from public.media_assets a
   where (a.workspace_id = p_workspace or a.event_id in (select e.id from public.events e where e.workspace_id = p_workspace))
     and (p_event is null or a.event_id = p_event)), '[]'::jsonb);
end $$;

create or replace function public.campaign_setup_blockers(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.promotion_campaigns;
begin
  select * into c from public.promotion_campaigns where id = p_campaign;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if (select auth.uid()) is null or not public.campaign_can(c.workspace_id, 'read') then raise exception 'not_authorized' using errcode = '42501'; end if;
  return public.campaign_blockers(c.id);
end $$;

revoke all on function public.media_assets_problems(uuid, uuid), public.campaign_setup_blockers(uuid) from public, anon;
grant execute on function public.media_assets_problems(uuid, uuid), public.campaign_setup_blockers(uuid) to authenticated, service_role;
