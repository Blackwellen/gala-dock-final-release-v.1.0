-- Phase 3 · Provider workspace settings: profile, capabilities and preference sections (owners only, audited).
begin;
/**
 * p = { name?, cover_image?, capabilities?: ['venue','service'], section?: 'profile'|'booking'|'communications'|'notifications'|'agent'|'tax', value?: {...} }
 * Settings sections are merged into workspaces.settings[section]. Turning a capability off is refused while that kind still has live listings.
 */
create or replace function public.provider_save_settings(p_ws uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare caps text[]; sec text := p->>'section';
begin
  perform public.require_provider_role(p_ws, array['owner']);
  if p ? 'name' and length(trim(coalesce(p->>'name', ''))) not between 2 and 80 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p ? 'capabilities' then
    select array_agg(x) into caps from jsonb_array_elements_text(p->'capabilities') x where x in ('venue','service');
    if coalesce(cardinality(caps), 0) = 0 then raise exception 'capability_required' using errcode = '22023'; end if;
    if exists(select 1 from public.listings l where l.workspace_id = p_ws and l.published and not (l.kind = any(caps))) then raise exception 'capability_in_use' using errcode = '22023'; end if;
  end if;
  if sec is not null and sec not in ('profile','booking','communications','notifications','agent','tax') then raise exception 'invalid_section' using errcode = '22023'; end if;
  if sec = 'booking' and (p->'value'->>'response_hours')::int not in (2,4,8,12,24) then raise exception 'invalid_response_window' using errcode = '22023'; end if;
  if sec in ('profile','communications') and coalesce(p->'value'->>'email', '') <> '' and (p->'value'->>'email') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  update public.workspaces set
    name = coalesce(trim(p->>'name'), name), cover_image = coalesce(p->>'cover_image', cover_image), capabilities = coalesce(caps, capabilities),
    settings = case when sec is null then settings else coalesce(settings, '{}') || jsonb_build_object(sec, coalesce(settings->sec, '{}') || coalesce(p->'value', '{}')) end
  where id = p_ws;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), p_ws, 'settings.updated', jsonb_build_object('section', coalesce(sec, case when p ? 'capabilities' then 'capabilities' else 'workspace' end)));
end $$;
revoke all on function public.provider_save_settings(uuid, jsonb) from public, anon;
grant execute on function public.provider_save_settings(uuid, jsonb) to authenticated;
commit;
