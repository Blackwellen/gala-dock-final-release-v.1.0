-- Q15 follow-up (lane A, 2026-10-29): build_add_package / build_add_backup declared a variable named id, which is ambiguous
-- with build_items.id / listings.id inside their queries (42702 at runtime). Same contracts; variable renamed. Additive.

create or replace function public.build_add_package(p_event uuid, p_package uuid, p_role text default 'primary')
returns uuid language plpgsql security definer set search_path to '' as $$
declare e public.events; k public.packages; l public.listings; cat text; guests integer; est numeric; nid uuid; n integer;
begin
  select * into e from public.events where id = p_event for update;
  if not found or not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.status in ('completed','cancelled','archived') then raise exception 'event_closed' using errcode = '22023'; end if;
  if p_role not in ('primary','backup') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select * into k from public.packages where id = p_package and status = 'published';
  if not found then raise exception 'package_unavailable' using errcode = '22023'; end if;
  select * into l from public.listings where id = k.listing_id and published and paused_at is null;
  if not found then raise exception 'package_unavailable' using errcode = '22023'; end if;
  guests := greatest(coalesce(e.guest_count, 0), 1);
  if (k.min_guests is not null and guests < k.min_guests) or (k.max_guests is not null and guests > k.max_guests) then
    raise exception 'package_guest_range:%-%', coalesce(k.min_guests, 0), coalesce(k.max_guests, 0) using errcode = '22023';
  end if;
  if exists(select 1 from public.build_items b where b.event_id = p_event and b.listing_id = l.id and public.build_budget_bucket(b.status) <> 'excluded') then
    raise exception 'already_in_build' using errcode = '23505';
  end if;
  select coalesce(t.meta->>'build', case when l.kind = 'venue' then 'venue' else 'extras' end) into cat
    from (select 1) x left join public.taxonomy_terms t on t.taxonomy = 'service_category' and t.key = lower(l.category);
  if l.kind = 'venue' then cat := 'venue'; end if;
  est := case when k.price_basis in ('per_person','per_guest','per_head') then k.base_price * guests else k.base_price end;
  select count(*) into n from public.build_items where event_id = p_event;
  insert into public.build_items(event_id, listing_id, category, title, package, scope, image, amount, price_basis, quote, status, role, sort)
    values (p_event, l.id, cat, l.name, k.name, left(coalesce(k.description, ''), 500), coalesce(nullif(k.image, ''), l.image), round(est, 2),
      case when k.price_basis in ('per_person','per_guest','per_head') then 'per_person' else 'estimate' end,
      jsonb_build_object('package_id', k.id, 'package_name', k.name, 'base_price_minor', round(k.base_price * 100)::bigint, 'price_basis', k.price_basis,
        'guests', guests, 'deposit_pct', k.deposit_pct, 'inclusions', coalesce(k.inclusions, '[]'), 'add_ons', coalesce(k.add_ons, '[]'), 'snapshotted_at', now()),
      'suggested', p_role, n + 1)
    returning build_items.id into nid;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', e.workspace_id, 'build_engine.package_added', jsonb_build_object('event_id', p_event, 'build_item_id', nid, 'package_id', k.id));
  return nid;
end $$;

create or replace function public.build_add_backup(p_primary uuid, p_listing uuid)
returns uuid language plpgsql security definer set search_path to '' as $$
declare p public.build_items; l public.listings; nid uuid;
begin
  select * into p from public.build_items where id = p_primary;
  if not found or not public.can_edit_event(p.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into l from public.listings where id = p_listing and published and paused_at is null;
  if not found then raise exception 'listing_unavailable' using errcode = '22023'; end if;
  if l.id = p.listing_id or (p.listing_id is not null and l.workspace_id = public.listing_workspace(p.listing_id)) then raise exception 'backup_same_provider' using errcode = '22023'; end if;
  if exists(select 1 from public.build_items b where b.event_id = p.event_id and b.listing_id = l.id and public.build_budget_bucket(b.status) <> 'excluded') then
    raise exception 'already_in_build' using errcode = '23505';
  end if;
  insert into public.build_items(event_id, listing_id, category, title, package, image, amount, price_basis, quote, status, role, sort)
    values (p.event_id, l.id, p.category, l.name, l.category, l.image, l.price_from, 'estimate', jsonb_build_object('backup_for', p.id), 'suggested', 'backup', p.sort)
    returning build_items.id into nid;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'build_engine.backup_added', jsonb_build_object('primary', p.id, 'backup', nid));
  return nid;
end $$;

revoke all on function public.build_add_package(uuid,uuid,text) from public, anon;
grant execute on function public.build_add_package(uuid,uuid,text) to authenticated, service_role;
revoke all on function public.build_add_backup(uuid,uuid) from public, anon;
grant execute on function public.build_add_backup(uuid,uuid) to authenticated, service_role;
