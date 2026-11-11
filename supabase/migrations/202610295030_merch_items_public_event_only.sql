-- Q45 regression run 3 (2026-10-30): merch_items_public allowed anon/authenticated to read every on_sale item, even for private
-- or draft events (the RLS leak probe found "S4 Tee" on a private draft event). Public merch must belong to a public, published
-- event. event_is_public() is the SECURITY DEFINER helper from 202610294084, so the check keeps working once the events base table
-- is closed to anon (staged 202610294085). Members keep merch_items_members. Additive: the policy is re-created with the same name.
drop policy if exists merch_items_public on public.merch_items;
create policy merch_items_public on public.merch_items for select to anon, authenticated
  using (status = 'on_sale' and public.event_is_public(event_id));
