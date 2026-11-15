-- Q72 internationalisation (lane i18n), part 2. Additive: one trigger.
-- A supplier/venue quote is stored in the currency the booking will actually be charged in. Marketplace payment orders charge in
-- the EVENT's currency (create payment order, 202610280005: coalesce(e.currency, 'GBP')), but provider_quotes.currency kept its
-- 'GBP' default, so a quote for a € event read "GBP" while the deposit was charged in EUR. New quote rows (drafts and every sent
-- version) now take the event currency of their build item. Existing rows are not rewritten (all pre-Q72 events are GBP).
-- Seller-currency charging for bookings (charge in the listing/Connect currency instead) is a payments-lane change (gap I18N-C05).
-- Rollback: drop trigger i18n_quote_currency on public.provider_quotes; the function is inert.
create or replace function public.i18n_quote_currency() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  select upper(e.currency) into c from public.build_items b join public.events e on e.id = b.event_id where b.id = new.build_item_id;
  if c ~ '^[A-Z]{3}$' then new.currency := c; end if;
  return new;
end $$;
revoke all on function public.i18n_quote_currency() from public, anon, authenticated;
drop trigger if exists i18n_quote_currency on public.provider_quotes;
create trigger i18n_quote_currency before insert on public.provider_quotes for each row execute function public.i18n_quote_currency();
