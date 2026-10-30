-- Sponsor / exhibitor logos (owner decision 2026-10-29, lane C). Additive.
--   event_parties.logo_url: a public image URL produced by the Q04 upload path (/api/files/public-media: PNG/JPEG/WebP only by
--     magic bytes, metadata stripped, ClamAV-scanned when configured) in the event workspace's event-media folder. Stored as a URL,
--     like listings.image / events.cover_image. The CHECK accepts only https event-media URLs of an image type.
--   party_set_logo(party, url|null): organiser command (ops_event_require = can_manage_event), URL must sit in the event's own
--     workspace folder; audited. Parties have no portal edit of their details, so the portal gets no logo control.
--   public_event_extras: same signature, adds 'logo' to partners — still confirmed / completed parties of public published events only.
-- No begin/commit (migrate.mjs owns the transaction).
alter table public.event_parties add column if not exists logo_url text;
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'event_parties_logo_url_check' and conrelid = 'public.event_parties'::regclass) then
    alter table public.event_parties add constraint event_parties_logo_url_check check (logo_url is null or (length(logo_url) <= 500
      and logo_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/event-media/[0-9a-f-]{36}/[A-Za-z0-9._/-]+\.(png|jpe?g|webp)$'));
  end if;
end $c$;

create or replace function public.party_set_logo(p_party uuid, p_url text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.event_parties; e public.events; u text := nullif(btrim(coalesce(p_url, '')), '');
begin
  select * into r from public.event_parties where id = p_party;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  e := public.ops_event_require(r.event_id);
  if r.kind not in ('sponsor','exhibitor') then raise exception 'logo_sponsors_exhibitors_only' using errcode = '22023'; end if;
  if u is not null and (length(u) > 500 or position('/storage/v1/object/public/event-media/' || e.workspace_id::text || '/' in u) = 0
      or u !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/event-media/[0-9a-f-]{36}/[A-Za-z0-9._/-]+\.(png|jpe?g|webp)$') then
    raise exception 'invalid_logo_url' using errcode = '22023';
  end if;
  update public.event_parties set logo_url = u, updated_at = now() where id = r.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), e.workspace_id, 'party.logo_set', jsonb_build_object('party_id', r.id, 'event_id', e.id, 'cleared', u is null));
  return jsonb_build_object('ok', true, 'logo_url', u);
end $$;
revoke all on function public.party_set_logo(uuid, text) from public, anon;
grant execute on function public.party_set_logo(uuid, text) to authenticated;

create or replace function public.public_event_extras(p_event uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'partners', coalesce((select jsonb_agg(jsonb_build_object(
        'kind', p.kind, 'name', p.name, 'logo', p.logo_url,
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
comment on function public.public_event_extras(uuid) is 'Public event page extras (published public events only): confirmed sponsors/exhibitors (name, tier, booth, logo), approved accessibility facts, days, venues, public sub-events, passes. No contacts, money, contracts or riders.';
