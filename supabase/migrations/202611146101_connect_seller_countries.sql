-- Seller-country gate for Stripe Connect (owner request 2026-11-14: "for suppliers and venue there are location payout
-- restrictions with stripe connect so fix the site for that as some countries won't verify").
--
-- DEC-107: UK platform, DIRECT charges on the seller's connected account + application fee, no-dashboard accounts with
-- card_payments + transfers. Stripe only supports that for some seller countries (sources + reasons: the single source of truth
-- src/lib/payments/connect-countries.ts; tests/release/connect-countries.spec.ts fails if this list and that file drift).
--
-- Additive:
--   1. public.connect_supported_countries — read-only reference list (36 countries, checked 2026-11-14).
--   2. connect_country_supported(code), workspace_business_country(ws), workspace_payments_country_ok(ws) helpers.
--      Unknown business country (null / unresolvable) = ok: Stripe decides at account creation, as before.
--   3. Listings and packages of a workspace whose business country is set and unsupported are kept enquiry-only
--      (BEFORE INSERT/UPDATE trigger: booking_mode 'enquiry', instant_book false). No live rows match today (checked 2026-11-14).
--   4. listing_readiness: 'payouts' is not required where payments through Gala Dock can't exist (the listing is enquiry-only);
--      adds payments_country_supported to the result. Otherwise identical to 202610293002.
--   5. event_payment_readiness: also requires the connected account's country to be supported (null country = older cache row).
--      Otherwise identical to 202610295001.
-- Rollback: re-run the previous definitions of listing_readiness (202610293002) and event_payment_readiness (202610295001),
-- drop the two triggers; the table and helpers are inert.

create table if not exists public.connect_supported_countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  checked_on date not null,
  source_url text not null
);
comment on table public.connect_supported_countries is 'Seller business countries where Gala Dock (UK platform, DEC-107 direct charges, no-dashboard Connect accounts) can take payments. Mirror of src/lib/payments/connect-countries.ts.';
alter table public.connect_supported_countries enable row level security;
drop policy if exists connect_supported_countries_read on public.connect_supported_countries;
create policy connect_supported_countries_read on public.connect_supported_countries for select to anon, authenticated using (true);
grant select on public.connect_supported_countries to anon, authenticated;

insert into public.connect_supported_countries (code, name, checked_on, source_url) values
  ('AT', 'Austria', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('AU', 'Australia', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('BE', 'Belgium', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('BG', 'Bulgaria', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('CA', 'Canada', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('CH', 'Switzerland', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('CY', 'Cyprus', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('CZ', 'Czech Republic', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('DE', 'Germany', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('DK', 'Denmark', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('EE', 'Estonia', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('ES', 'Spain', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('FI', 'Finland', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('FR', 'France', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('GB', 'United Kingdom', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('GR', 'Greece', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('HK', 'Hong Kong', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('HU', 'Hungary', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('IE', 'Ireland', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('IT', 'Italy', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('JP', 'Japan', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('LT', 'Lithuania', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('LU', 'Luxembourg', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('LV', 'Latvia', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('MT', 'Malta', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('NL', 'Netherlands', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('NO', 'Norway', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('NZ', 'New Zealand', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('PL', 'Poland', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('PT', 'Portugal', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('RO', 'Romania', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('SE', 'Sweden', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('SG', 'Singapore', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('SI', 'Slovenia', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('SK', 'Slovakia', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts'),
  ('US', 'United States', '2026-11-14', 'https://docs.stripe.com/connect/custom-accounts')
on conflict (code) do update set name = excluded.name, checked_on = excluded.checked_on, source_url = excluded.source_url;

create or replace function public.connect_country_supported(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.connect_supported_countries c where c.code = upper(trim(coalesce(p_code, ''))));
$$;

-- The workspace's business country as ISO-2 (settings.organisation.country, settings.business.country, then settings.country —
-- master-data names or ISO-2 codes), or null when none is set or it can't be resolved. Same order as workspaceCountryValue().
create or replace function public.workspace_business_country(p_workspace uuid) returns text
language sql stable security definer set search_path = '' as $$
  with v as (
    select nullif(trim(coalesce(w.settings->'organisation'->>'country', w.settings->'business'->>'country', w.settings->>'country')), '') val
    from public.workspaces w where w.id = p_workspace
  )
  select coalesce(
    (select r.code from public.ref_countries r, v where r.code = upper(v.val) or lower(r.name) = lower(v.val) limit 1),
    (select c.code from public.connect_supported_countries c, v where c.code = upper(v.val) or lower(c.name) = lower(v.val) limit 1),
    (select upper(v.val) from v where v.val ~ '^[A-Za-z]{2}$'))
$$;

-- True unless the business country is known AND unsupported (unknown = Stripe decides, as before this migration).
create or replace function public.workspace_payments_country_ok(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when c is null then true else public.connect_country_supported(c) end
  from (select public.workspace_business_country(p_workspace) c) x;
$$;

revoke all on function public.connect_country_supported(text), public.workspace_business_country(uuid), public.workspace_payments_country_ok(uuid) from public;
grant execute on function public.connect_country_supported(text) to anon, authenticated, service_role;
grant execute on function public.workspace_business_country(uuid), public.workspace_payments_country_ok(uuid) to authenticated, service_role;

-- Listings / packages of an unsupported-country seller stay enquiry-only (no on-platform booking or deposit can be taken).
create or replace function public.enforce_seller_country_booking_mode() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.workspace_id is not null and new.booking_mode is distinct from 'enquiry' and not public.workspace_payments_country_ok(new.workspace_id) then
    new.booking_mode := 'enquiry';
    if tg_table_name = 'listings' then new.instant_book := false; end if;
  end if;
  return new;
end $$;
revoke all on function public.enforce_seller_country_booking_mode() from public;

drop trigger if exists listings_seller_country_booking_mode on public.listings;
create trigger listings_seller_country_booking_mode before insert or update of booking_mode, instant_book, published, workspace_id on public.listings
  for each row execute function public.enforce_seller_country_booking_mode();
drop trigger if exists packages_seller_country_booking_mode on public.packages;
create trigger packages_seller_country_booking_mode before insert or update of booking_mode, workspace_id on public.packages
  for each row execute function public.enforce_seller_country_booking_mode();

create or replace function public.listing_readiness(p_listing uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l public.listings; ws public.workspaces; missing text[] := '{}'; e jsonb; reasons jsonb; country_ok boolean;
begin
  select * into l from public.listings where id = p_listing;
  if not found or not public.is_workspace_member(l.workspace_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into ws from public.workspaces where id = l.workspace_id;
  country_ok := public.workspace_payments_country_ok(l.workspace_id);
  if length(trim(l.name)) < 3 then missing := array_append(missing, 'listing_name'); end if;
  if length(trim(l.description)) < 40 then missing := array_append(missing, 'listing_description'); end if;
  if length(trim(l.location)) = 0 then missing := array_append(missing, 'listing_location'); end if;
  if coalesce(jsonb_array_length(l.details->'photos'), 0) = 0 then missing := array_append(missing, 'listing_photo'); end if;
  if not ws.onboarding_complete then missing := array_append(missing, 'workspace_setup'); end if;
  if ws.verification_status <> 'verified' then missing := array_append(missing, 'verification'); end if;
  -- Unsupported seller country: the listing is enquiry-only (trigger above), so no payout account is needed to publish it.
  if ws.payout_status <> 'active' and country_ok then missing := array_append(missing, 'payouts'); end if;
  e := public.trust_eligibility_internal(l.workspace_id, l.id);
  reasons := coalesce(e->'blockers', '[]');
  if exists (select 1 from jsonb_array_elements(reasons) x where x->>'code' like 'credential_%') then missing := array_append(missing, 'credentials'); end if;
  if exists (select 1 from jsonb_array_elements(reasons) x where x->>'code' like 'enforcement_%') then missing := array_append(missing, 'trust_hold'); end if;
  return jsonb_build_object('eligible', cardinality(missing) = 0, 'missing', to_jsonb(missing),
    'verification_status', ws.verification_status, 'payout_status', ws.payout_status, 'published', l.published, 'trust_blockers', reasons,
    'payments_country_supported', country_ok);
end;
$$;

create or replace function public.event_payment_readiness(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.connect_accounts ca where ca.workspace_id = public.event_seller_workspace(p_event)
      and ca.livemode = public.stripe_livemode()
      and ca.stripe_account_id is not null and ca.charges_enabled and ca.card_payments_capability = 'active' and ca.disabled_reason is null
      and coalesce(array_length(ca.requirements_past_due, 1), 0) = 0
      and (ca.country is null or public.connect_country_supported(ca.country))) then 'ready' else 'seller_not_ready' end;
$$;
