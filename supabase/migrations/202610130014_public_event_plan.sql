-- Phase 3 · Buyer-facing seat map: latest PUBLISHED event layout + the venue's published structure, for public on-sale events only.
begin;
create or replace function public.public_event_plan(p_event uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'overlay', coalesce((select m.overlay from public.venue_maps m where m.event_id = e.id and m.status = 'published' order by m.version desc limit 1), '[]'::jsonb),
    'base', coalesce((select s.elements from public.venue_structures s where s.venue_id = e.venue_listing_id and s.status = 'published' limit 1), '[]'::jsonb))
  from public.events e where e.id = p_event and e.visibility = 'public' and e.status in ('published','on_sale','live')
$$;
revoke all on function public.public_event_plan(uuid) from public;
grant execute on function public.public_event_plan(uuid) to anon, authenticated;
commit;
