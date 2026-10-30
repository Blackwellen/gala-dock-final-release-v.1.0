-- Public event page (lane C, 2026-10-29): one anon-callable read of organiser-built features that have a public flag
-- but no public read. Same visibility rule as the page's load(): public + published / on_sale / live, otherwise null.
--   partners      Q24 sponsors / exhibitors whose deal is confirmed or completed: name, kind, package tier label, allocated booth.
--                 Never contacts, fees, package price/benefits, contracts, riders or notes.
--   accessibility Q26 facts only once the organiser approved the public summary (accessibility_approve_summary);
--                 same fields as event_compliance_public plus Changing Places / assistance dogs / companion seats flags.
--   days          Q40 scheduled event days: label, date, times.
--   venues        Q40 event venues: name, role, times; listing slug only when the listing is published.
--   sub_events    Q40 child events (stage / day / session …) that are themselves public and published.
--   passes        Q40 multi-day / season / series passes on sale or scheduled: tier name, pass kind, component event names.
-- Q25 parking / transport have no public flag (shuttles are ticket-holder only via my_event_travel), so they are not exposed.
begin;
create or replace function public.public_event_extras(p_event uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'partners', coalesce((select jsonb_agg(jsonb_build_object(
        'kind', p.kind, 'name', p.name,
        'tier', coalesce(nullif(btrim(p.package_snapshot->>'tier'), ''), nullif(btrim(p.package_snapshot->>'name'), '')),
        'booth', (select b.code || coalesce(' · ' || nullif(btrim(b.name), ''), '') from public.exhibitor_booths b
                  where b.party_id = p.id and b.event_id = e.id and b.status = 'allocated' order by b.code limit 1))
        order by p.kind desc, p.name)
      from public.event_parties p where p.event_id = e.id and p.kind in ('sponsor','exhibitor') and p.status in ('confirmed','completed')), '[]'::jsonb),
    'accessibility', (select jsonb_build_object('summary', a.public_summary, 'step_free', a.step_free, 'accessible_toilets', coalesce(a.accessible_toilets, 0) > 0,
        'changing_places', a.changing_places, 'hearing_loop', a.hearing_loop, 'bsl', a.bsl_interpretation, 'captioning', a.captioning, 'quiet_space', a.quiet_space,
        'assistance_dogs', a.assistance_dogs, 'accessible_seating', coalesce(a.accessible_seating, 0) > 0, 'companion_seats', coalesce(a.companion_seats, 0) > 0)
      from public.event_accessibility a where a.event_id = e.id and a.summary_status = 'approved' and btrim(coalesce(a.public_summary, '')) <> ''),
    'days', coalesce((select jsonb_agg(jsonb_build_object('label', d.label, 'date', d.day_date, 'starts_at', d.starts_at, 'ends_at', d.ends_at) order by d.day_date, d.starts_at)
      from public.event_days d where d.event_id = e.id and d.status = 'scheduled'), '[]'::jsonb),
    'venues', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(nullif(btrim(v.venue_name), ''), l.name), 'role', v.role, 'starts_at', v.starts_at, 'ends_at', v.ends_at,
        'listing_slug', case when l.published then coalesce(l.slug, l.id::text) end) order by v.sort, v.starts_at)
      from public.event_venues v left join public.listings l on l.id = v.listing_id where v.event_id = e.id), '[]'::jsonb),
    'sub_events', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'slug', coalesce(c.slug, c.id::text), 'role', c.composition_role, 'starts_at', c.starts_at, 'ends_at', c.ends_at) order by c.starts_at)
      from public.events c where c.parent_event_id = e.id and c.visibility = 'public' and c.status in ('published','on_sale','live')), '[]'::jsonb),
    'passes', coalesce((select jsonb_agg(jsonb_build_object('name', t.name, 'kind', t.pass_kind,
        'includes', coalesce((select jsonb_agg(distinct ce.name) from public.ticket_pass_components pc join public.ticket_tiers ct on ct.id = pc.component_tier_id
                              join public.events ce on ce.id = ct.event_id where pc.pass_tier_id = t.id and ce.visibility = 'public' and ce.status in ('published','on_sale','live')), '[]'::jsonb))
        order by t.sort)
      from public.ticket_tiers t where t.event_id = e.id and t.pass_kind is not null and t.status not in ('draft','hidden')), '[]'::jsonb))
  from public.events e where e.id = p_event and e.visibility = 'public' and e.status in ('published','on_sale','live')
$$;
revoke all on function public.public_event_extras(uuid) from public;
grant execute on function public.public_event_extras(uuid) to anon, authenticated;
comment on function public.public_event_extras(uuid) is 'Public event page extras (published public events only): confirmed sponsors/exhibitors (name, tier, booth), approved accessibility facts, days, venues, public sub-events, passes. No contacts, money, contracts or riders.';
commit;
