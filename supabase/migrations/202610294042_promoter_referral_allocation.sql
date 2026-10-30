-- Lane D4 / B2: promoter referral sales consume the promoter's mirrored allocation (Q20/Q27 gap). Additive only.
-- Before: a promoter's mirror allocation (202610294036) reserved what they still had to sell, but only sales through the
-- allocation's access code counted as used. Referral-link sales (checkout_orders.ref_code → attribute_referral → promoter_sales,
-- promoters.tickets_sold) were sold from public stock while the mirror kept the full reservation, so the promoter's remaining
-- quota was reserved twice until the next manual sync.
-- Now:
--   1. When attribute_referral records a promoter sale, the referral tickets of that order on the mirror's tier are drawn from
--      the mirror (tickets.allocation_id), under the tier → allocation row locks every reservation path already takes, never past
--      the allocation's quantity. This only ever lowers the reserved count, so public availability never drops and nothing new
--      is sold. It runs in attribute_referral's own transaction after issue — no new lock on hold/quote/issue (the hot path).
--      Failures never block the promoter credit (sync reconciles later).
--   2. promoter_allocation_sync_internal reconciles: it draws any not-yet-counted referral tickets for that promoter (idempotent:
--      only tickets with no allocation), and now locks tier → allocation (same order as hold_tickets / issue / the draw above),
--      so a sync can't deadlock with checkout or a referral draw. The rest of the rule is unchanged.
--   3. promoter_allocation_referrals(event): per-allocation referral-used counts for Sell › Inventory & allocations.
-- Grants: internal functions service_role only; the read is authenticated + service_role (event access checked). Nothing to anon.

-- Referral tickets of one promoter on one tier that are not drawn from any allocation yet (refunded/cancelled/void excluded).
create or replace function public.promoter_referral_tickets_unallocated(p_promoter uuid, p_tier uuid, p_order_ref text default null) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.tickets t
  where t.tier_id = p_tier and t.allocation_id is null and t.status not in ('refunded', 'cancelled', 'void')
    and (p_order_ref is null or t.order_ref = p_order_ref)
    and t.order_ref in (select ps.order_ref from public.promoter_sales ps join public.promoters p on p.id = ps.promoter_id
                        join public.checkout_orders o on o.order_ref = ps.order_ref
                        where ps.promoter_id = p_promoter and ps.tier_id = p_tier and ps.status <> 'reversed' and ps.order_ref is not null
                          and (p_order_ref is null or ps.order_ref = p_order_ref)
                          and o.event_id = p.event_id and o.kind = 'primary' and o.status = 'issued' and upper(coalesce(o.ref_code, '')) = upper(p.code))
  order by t.id;
$$;

-- Draw up to p_max referral tickets into allocation a (caller holds the tier and allocation locks). Returns the number drawn.
create or replace function public.promoter_referral_draw(p_allocation uuid, p_max int, p_order_ref text default null) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare a public.ticket_allocations; n int;
begin
  select * into a from public.ticket_allocations where id = p_allocation;
  if not found or a.promoter_id is null or a.source <> 'promoter_mirror' or a.status <> 'active' or coalesce(p_max, 0) <= 0 then return 0; end if;
  update public.tickets t set allocation_id = a.id
    where t.id in (select x from public.promoter_referral_tickets_unallocated(a.promoter_id, a.tier_id, p_order_ref) x limit p_max)
      and t.allocation_id is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- 1. On a recorded promoter sale (attribute_referral, service role): draw that order's referral tickets into the mirror.
create or replace function public.promoter_sales_allocation_draw() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.ticket_allocations; room int;
begin
  if new.order_ref is null or new.tier_id is null or new.status = 'reversed' then return null; end if;
  begin
    select * into a from public.ticket_allocations x where x.promoter_id = new.promoter_id and x.tier_id = new.tier_id and x.source = 'promoter_mirror' and x.status = 'active'
      order by x.created_at limit 1;
    if a.id is null then return null; end if;
    perform 1 from public.ticket_tiers where id = a.tier_id for update;                     -- tier first, like every reservation path
    select * into a from public.ticket_allocations where id = a.id and status = 'active' for update;
    if a.id is null then return null; end if;
    room := a.quantity - public.ticket_allocation_used(a.id);
    perform public.promoter_referral_draw(a.id, least(coalesce(new.quantity, 0), room), new.order_ref);
  exception when others then
    raise warning 'promoter referral draw skipped for sale %: %', new.id, sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists promoter_sales_allocation_draw on public.promoter_sales;
create trigger promoter_sales_allocation_draw after insert on public.promoter_sales for each row execute function public.promoter_sales_allocation_draw();

-- 2. Sync with referral reconciliation and tier → allocation lock order. Same targets/caps as 202610294036.
create or replace function public.promoter_allocation_sync_internal(p_promoter uuid, p_tier uuid default null, p_create boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare p public.promoters; a public.ticket_allocations; t public.ticket_tiers; v_tier uuid; used int := 0; target int; manual_unused int; others int; free int; room int; qty int;
  pending int := 0; drawn int := 0;
begin
  select * into p from public.promoters where id = p_promoter;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into a from public.ticket_allocations x where x.promoter_id = p.id and x.source = 'promoter_mirror' and x.status = 'active' order by x.created_at limit 1;
  select coalesce(sum(greatest(0, x.quantity - public.ticket_allocation_used(x.id))), 0) into manual_unused
    from public.ticket_allocations x where x.promoter_id = p.id and x.source = 'manual' and x.status = 'active';
  target := case when p.status = 'paused' then 0 else greatest(0, coalesce(p.ticket_allocation, 0) - coalesce(p.tickets_sold, 0) - manual_unused) end;
  if a.id is null then
    if not p_create or target = 0 then return jsonb_build_object('ok', true, 'promoter_id', p.id, 'name', p.name, 'action', 'none', 'target', target); end if;
    v_tier := coalesce(p_tier, (select x.id from public.ticket_tiers x where x.event_id = p.event_id and x.pass_kind is null and x.status in ('on_sale', 'scheduled', 'draft')
      order by (x.kind = 'general') desc, (x.status = 'on_sale') desc, x.sort, x.name limit 1));
    if v_tier is null then return jsonb_build_object('ok', false, 'promoter_id', p.id, 'name', p.name, 'reason', 'no_tier'); end if;
  else
    v_tier := a.tier_id;
  end if;
  select * into t from public.ticket_tiers where id = v_tier and event_id = p.event_id for update;
  if not found then return jsonb_build_object('ok', false, 'promoter_id', p.id, 'name', p.name, 'reason', 'tier_not_in_event'); end if;
  if a.id is not null then
    select * into a from public.ticket_allocations where id = a.id and status = 'active' for update;
    if a.id is null then return jsonb_build_object('ok', false, 'promoter_id', p.id, 'name', p.name, 'reason', 'concurrent_change'); end if;
  end if;
  select coalesce(sum(x.quantity), 0) into others from public.ticket_allocations x where x.tier_id = t.id and x.status = 'active' and x.id is distinct from a.id;
  -- Referral tickets already sold (inside t.sold) that the mirror should count; never more than the tier guard allows.
  select count(*) into pending from public.promoter_referral_tickets_unallocated(p.id, t.id);
  if a.id is not null then
    used := public.ticket_allocation_used(a.id);
    drawn := public.promoter_referral_draw(a.id, least(pending, greatest(0, t.quantity - others - used)));
    used := used + drawn;
  else
    used := least(pending, greatest(0, t.quantity - others));   -- drawn after the insert below
  end if;
  -- Guard rule (sum of active allocations ≤ tier quantity) and stock: never reserve units that are sold, held, committed to
  -- passes or reserved by another allocation.
  free := t.quantity - t.sold - t.held - public.ticket_tier_reserved(t.id) + case when a.id is null then 0 else greatest(0, a.quantity - used) end;
  room := least(t.quantity - others, used + greatest(0, free));
  qty := greatest(used, least(used + target, room));
  if a.id is null then
    if qty = 0 then return jsonb_build_object('ok', true, 'promoter_id', p.id, 'name', p.name, 'action', 'none', 'target', target, 'capped', true, 'tier_id', t.id); end if;
    insert into public.ticket_allocations(event_id, tier_id, kind, promoter_id, label, quantity, status, source)
      values (p.event_id, t.id, 'promoter', p.id, left('Promoter: ' || p.name, 80), qty, 'active', 'promoter_mirror') returning * into a;
    drawn := public.promoter_referral_draw(a.id, used);
    return jsonb_build_object('ok', true, 'promoter_id', p.id, 'name', p.name, 'action', 'created', 'allocation_id', a.id, 'tier_id', t.id, 'quantity', qty, 'used', drawn,
      'referral_drawn', drawn, 'target', target, 'capped', qty < used + target);
  end if;
  if qty = 0 then
    update public.ticket_allocations set status = 'released' where id = a.id;
    return jsonb_build_object('ok', true, 'promoter_id', p.id, 'name', p.name, 'action', 'released', 'allocation_id', a.id, 'tier_id', t.id, 'quantity', 0, 'used', 0, 'target', target);
  end if;
  if qty <> a.quantity then update public.ticket_allocations set quantity = qty, label = left('Promoter: ' || p.name, 80) where id = a.id; end if;
  return jsonb_build_object('ok', true, 'promoter_id', p.id, 'name', p.name, 'action', case when qty <> a.quantity or drawn > 0 then 'updated' else 'unchanged' end, 'allocation_id', a.id,
    'tier_id', t.id, 'quantity', qty, 'used', used, 'referral_drawn', drawn, 'target', target, 'capped', qty < used + target);
end $$;

-- 3. Referral-used counts per allocation of the event (event editors / finance with event access, or Gala Dock tickets admins).
create or replace function public.promoter_allocation_referrals(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.can_access_event(p_event) or public.has_admin_permission('tickets')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('allocation_id', a.id, 'promoter_id', a.promoter_id,
      'referral_used', (select count(*) from public.tickets t where t.allocation_id = a.id and t.status not in ('refunded', 'cancelled', 'void')
        and exists (select 1 from public.promoter_sales ps where ps.order_ref = t.order_ref and ps.promoter_id = a.promoter_id and ps.status <> 'reversed')))
    order by a.created_at)
    from public.ticket_allocations a where a.event_id = p_event and a.promoter_id is not null), '[]');
end $$;

-- ═══ Grants ═══
revoke all on function public.promoter_referral_tickets_unallocated(uuid, uuid, text), public.promoter_referral_draw(uuid, int, text),
  public.promoter_sales_allocation_draw(), public.promoter_allocation_sync_internal(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.promoter_referral_tickets_unallocated(uuid, uuid, text), public.promoter_referral_draw(uuid, int, text),
  public.promoter_allocation_sync_internal(uuid, uuid, boolean) to service_role;
revoke all on function public.promoter_allocation_referrals(uuid) from public, anon;
grant execute on function public.promoter_allocation_referrals(uuid) to authenticated, service_role;
