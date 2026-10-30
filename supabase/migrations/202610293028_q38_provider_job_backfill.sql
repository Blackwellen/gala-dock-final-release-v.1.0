-- Q38 pass 2 (lane C): backfill the provider job for a booking line that was confirmed before the job trigger existed (or was
-- seeded already-confirmed), so the trigger create_job_for_confirmed_item never fired for it. Same row as the trigger writes
-- (reference BK-xxxxxx, commercial snapshot, venue space resolution, fee from the workspace commission), source 'marketplace',
-- through the same BEFORE-insert guards (trust_assert_can_accept, capacity/space exclusion constraints). Conflicts are raised,
-- never recovered (no payment is involved). Audited as booking.created with origin 'backfill'.
-- Service-only: EXECUTE revoked from public/anon/authenticated. Additive; nothing existing changes.
create or replace function public.service_backfill_provider_job(p_item uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare b public.build_items; l public.listings; e public.events; ws public.workspaces; fee numeric; sid uuid; ssrc text; jid uuid; dtl jsonb := '{}';
begin
  select * into b from public.build_items where id = p_item for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if b.status <> 'confirmed' or b.listing_id is null then raise exception 'item_not_confirmed' using errcode = '22023'; end if;
  select id into jid from public.provider_jobs where build_item_id = b.id;
  if jid is not null then return jid; end if;
  select * into l from public.listings where id = b.listing_id;
  select * into ws from public.workspaces where id = l.workspace_id;
  select * into e from public.events where id = b.event_id;
  if l.kind = 'venue' then
    select x.space_id, x.source into sid, ssrc from public.booking_item_space(b.id) x;
    dtl := jsonb_build_object('occupancy', case when sid is null then 'whole_venue' else 'space' end, 'space_source', coalesce(ssrc, 'unassigned'));
  end if;
  fee := round(coalesce(b.amount, 0) * ws.commission_bps / 10000.0, 2);
  insert into public.provider_jobs(reference, workspace_id, build_item_id, event_id, listing_id, space_id, mode, client_name, event_name, event_type,
      starts_at, ends_at, guests, location, status, role, value, platform_fee, net_payout, source, commercial_snapshot, details, image)
    values ('BK-' || upper(substr(replace(b.id::text, '-', ''), 1, 6)), l.workspace_id, b.id, e.id, l.id, sid, l.kind,
      coalesce(nullif(e.client_name, ''), 'Event client'), e.name, e.event_type,
      coalesce(e.starts_at, now()), coalesce(e.ends_at, coalesce(e.starts_at, now()) + interval '6 hours'), e.guest_count, coalesce(nullif(e.location, ''), e.city),
      'confirmed', b.role, coalesce(b.amount, 0), fee, coalesce(b.amount, 0) - fee,
      case when b.role = 'standby' then 'standby' else 'marketplace' end,
      coalesce(b.terms_snapshot, '{}') || jsonb_build_object('commission_bps', ws.commission_bps, 'platform_fee', fee, 'quote', b.quote, 'space_id', sid),
      dtl || jsonb_build_object('backfilled', true), coalesce(nullif(e.cover_image, ''), l.image))
    returning id into jid;
  if sid is not null and b.space_id is distinct from sid then update public.build_items set space_id = sid where id = b.id; end if;
  insert into public.audit_events(workspace_id, event, metadata) values (l.workspace_id, 'booking.created',
    jsonb_build_object('build_item_id', b.id, 'source', 'marketplace', 'origin', 'backfill', 'job_id', jid, 'space_id', sid, 'space_source', ssrc));
  return jid;
end $function$;

revoke all on function public.service_backfill_provider_job(uuid) from public, anon, authenticated;
grant execute on function public.service_backfill_provider_job(uuid) to service_role;
