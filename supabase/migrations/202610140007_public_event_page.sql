-- Public event page (/events/[slug]): line-up (programme items only, never the internal run sheet) and the
-- organiser's public profile card for public, on-sale events.
drop policy if exists programme_public_read on public.programme_items;
create policy programme_public_read on public.programme_items for select to anon, authenticated using (
  kind = 'programme' and exists(select 1 from public.events e where e.id = programme_items.event_id and e.visibility = 'public' and e.status in ('published','on_sale','live')));
grant select on public.programme_items to anon;

create or replace function public.public_organizer(p_event uuid)
returns table(name text, cover_image text, verified boolean, events_count bigint, followers bigint)
language sql stable security definer set search_path = '' as $$
  select w.name, w.cover_image, w.verification_status = 'verified',
    (select count(*) from public.events x where x.workspace_id = w.id and x.visibility = 'public' and x.status in ('published','on_sale','live','completed')),
    (select count(*) from public.saved_items s join public.events x on s.item_key = 'event:' || x.id where x.workspace_id = w.id)
  from public.events e join public.workspaces w on w.id = e.workspace_id
  where e.id = p_event and e.visibility = 'public' and e.status in ('published','on_sale','live');
$$;
revoke all on function public.public_organizer(uuid) from public;
grant execute on function public.public_organizer(uuid) to anon, authenticated;
