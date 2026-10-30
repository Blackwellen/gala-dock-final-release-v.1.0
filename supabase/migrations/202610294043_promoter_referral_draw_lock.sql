-- Lane D4 / B2 follow-up to 202610294042. Additive only; grants unchanged.
-- promoter_sales_allocation_draw() took FOR UPDATE on the tier row, but the promoter_sales INSERT that fires it already holds
-- FOR KEY SHARE on that tier (promoter_sales.tier_id FK). Two concurrent attribute_referral calls for the same tier therefore
-- deadlocked; the handler skipped the draw, so concurrent referral sales weren't counted until the next sync. FOR NO KEY UPDATE
-- doesn't conflict with KEY SHARE but still conflicts with the FOR UPDATE that hold_tickets / issue_checkout / sync take, so
-- draws stay serialised with every reservation path. Nothing else changes.
create or replace function public.promoter_sales_allocation_draw() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.ticket_allocations; room int;
begin
  if new.order_ref is null or new.tier_id is null or new.status = 'reversed' then return null; end if;
  begin
    select * into a from public.ticket_allocations x where x.promoter_id = new.promoter_id and x.tier_id = new.tier_id and x.source = 'promoter_mirror' and x.status = 'active'
      order by x.created_at limit 1;
    if a.id is null then return null; end if;
    perform 1 from public.ticket_tiers where id = a.tier_id for no key update;              -- tier first, like every reservation path
    select * into a from public.ticket_allocations where id = a.id and status = 'active' for update;
    if a.id is null then return null; end if;
    room := a.quantity - public.ticket_allocation_used(a.id);
    perform public.promoter_referral_draw(a.id, least(coalesce(new.quantity, 0), room), new.order_ref);
  exception when others then
    raise warning 'promoter referral draw skipped for sale %: %', new.id, sqlerrm;
  end;
  return null;
end $$;
