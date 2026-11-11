-- Playbook §8 demo-data switch: demo workspaces' public events and marketplace listings can be hidden from real users with one
-- setting, without deleting anything (deleting would break the QA suites that share this database). Default VISIBLE until launch.
-- Hidden means hidden from anonymous visitors and real signed-in users; demo/QA users, the workspace's own members and platform
-- admins still see them, so demo journeys keep working. Server-side only: the events_public projection and the listings read policy.
-- Additive: new table + functions; events_public re-issued with the same columns plus one condition; the listings public-read
-- policy re-issued with the same rule plus the switch.

create table if not exists public.launch_settings (
  id boolean primary key default true check (id),
  demo_public_visible boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.launch_settings(id) values (true) on conflict (id) do nothing;
alter table public.launch_settings enable row level security;
drop policy if exists launch_settings_admin_read on public.launch_settings;
create policy launch_settings_admin_read on public.launch_settings for select to authenticated using (public.is_platform_admin());
revoke all on public.launch_settings from anon, authenticated;
grant select on public.launch_settings to authenticated;

create or replace function public.demo_public_visible()
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((select s.demo_public_visible from public.launch_settings s where s.id), true);
$$;
revoke all on function public.demo_public_visible() from public;
grant execute on function public.demo_public_visible() to anon, authenticated;

/** True when this workspace's public content must be hidden from the current viewer (switch off + demo workspace + real viewer). */
create or replace function public.demo_hidden_for_viewer(p_workspace uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select not public.demo_public_visible()
     and public.is_demo_workspace(p_workspace)
     and not (auth.uid() is not null and (public.analytics_user_is_demo(auth.uid()) or public.is_workspace_member(p_workspace) or public.is_platform_admin()));
$$;
revoke all on function public.demo_hidden_for_viewer(uuid) from public;
grant execute on function public.demo_hidden_for_viewer(uuid) to anon, authenticated;

create or replace view public.events_public with (security_barrier = true) as
  select id, name, slug, description, event_type, starts_at, ends_at, timezone, venue_name, location, city, cover_image, tags, capacity, status, visibility,
         currency, venue_listing_id, series_id, series_index, occurrence_key, parent_event_id, composition_role, workspace_id, created_at, updated_at,
         public_settings as settings
    from public.events e
   where visibility = 'public' and status = any (array['published','on_sale','live'])
     and not public.demo_hidden_for_viewer(e.workspace_id);

drop policy if exists listings_public_read on public.listings;
create policy listings_public_read on public.listings for select to anon, authenticated
  using ((published and not public.demo_hidden_for_viewer(workspace_id)) or public.is_workspace_member(workspace_id));

/** Staff switch (settings permission + second factor), audited. */
create or replace function public.adm_set_demo_public_visible(p_visible boolean, p_note text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.admin_mfa_required();
  if not public.has_admin_permission('settings') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.launch_settings set demo_public_visible = p_visible, updated_at = now(), updated_by = auth.uid() where id;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'launch.demo_visibility_changed',
    jsonb_build_object('visible', p_visible, 'note', left(p_note, 300)));
end $$;
revoke all on function public.adm_set_demo_public_visible(boolean, text) from public, anon;
grant execute on function public.adm_set_demo_public_visible(boolean, text) to authenticated;
