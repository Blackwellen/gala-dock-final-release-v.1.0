-- Q72 internationalisation (lane i18n). Additive. Owner model (Q54 D2, Gigvora-aligned): sellers and buyers in every supported
-- country, EU included, sanctioned places excluded (Q74). Facts and rules: docs/release/i18n/gap-register.md.
--
--   1. Master data (catalog v1 rows, generated from src/lib/master-data/catalog.ts by the Q72 generator, same shape as
--      scripts/gen-master-data-sql.mjs): every Stripe Connect seller country is a business country, every two-decimal
--      Connect default currency is transactional (CAD/AUD become transactional; CHF CZK DKK HKD NOK NZD PLN RON SEK SGD added;
--      HUF/JPY listed for display only), one or more timezones per country. ref_countries.region gains 'europe' (CH, NO).
--      Existing rows are upserted, never deleted; tests/foundation/master-data.spec.ts checks DB = catalog.
--   2. Columns where missing: events.country, listings.currency/country/timezone, profiles.timezone (all nullable, checked).
--      Backfill (safe, all pre-Q72 data is UK): events in Europe/London → GB, else the workspace business country;
--      listings → GBP + the workspace business country (else GB). Nothing else is rewritten.
--   3. Defaults at insert (BEFORE INSERT triggers, security definer, search_path ''): a new listing takes the workspace's
--      currency / country / timezone; a new event takes the workspace business country. A Stripe Connect account's
--      default_currency becomes the workspace's settings.currency when the workspace has none (seller currency follows Connect).
--   4. Ticket checkout charges in the EVENT's currency (it was hard-coded GBP, so a € event was charged in £):
--      event_checkout_currency(), checkout_quote returns it (body otherwise identical to 202610294015), and a BEFORE INSERT guard
--      pins checkout_orders.currency to it and refuses currencies the quote can't price (non two-decimal).
-- Rollback: re-run checkout_quote from 202610294015; drop triggers i18n_listings_locale_defaults, i18n_events_locale_defaults,
-- i18n_connect_currency_default, checkout_orders_currency_guard; the columns, ref rows and helper functions are inert.

-- ═══ 1. Master data ═══
alter table public.ref_countries drop constraint if exists ref_countries_region_check;
alter table public.ref_countries add constraint ref_countries_region_check check (region in ('uk','eu','europe','na','mea','apac'));
insert into public.ref_currencies(code, name, symbol, minor_units, transactional, sort, catalog_version) values
  ('GBP', 'British Pound', '£', 2, true, 1, 1),
  ('EUR', 'Euro', '€', 2, true, 2, 1),
  ('USD', 'US Dollar', '$', 2, true, 3, 1),
  ('CAD', 'Canadian Dollar', '$', 2, true, 4, 1),
  ('AED', 'UAE Dirham', 'AED', 2, false, 5, 1),
  ('ZAR', 'South African Rand', 'R', 2, false, 6, 1),
  ('AUD', 'Australian Dollar', '$', 2, true, 7, 1),
  ('NZD', 'New Zealand Dollar', '$', 2, true, 8, 1),
  ('CHF', 'Swiss Franc', 'CHF', 2, true, 9, 1),
  ('CZK', 'Czech Koruna', 'Kč', 2, true, 10, 1),
  ('DKK', 'Danish Krone', 'kr', 2, true, 11, 1),
  ('HKD', 'Hong Kong Dollar', '$', 2, true, 12, 1),
  ('NOK', 'Norwegian Krone', 'kr', 2, true, 13, 1),
  ('PLN', 'Polish Zloty', 'zł', 2, true, 14, 1),
  ('RON', 'Romanian Leu', 'lei', 2, true, 15, 1),
  ('SEK', 'Swedish Krona', 'kr', 2, true, 16, 1),
  ('SGD', 'Singapore Dollar', '$', 2, true, 17, 1),
  ('HUF', 'Hungarian Forint', 'Ft', 2, false, 18, 1),
  ('JPY', 'Japanese Yen', '¥', 0, false, 19, 1)
on conflict (code) do update set name = excluded.name, symbol = excluded.symbol, minor_units = excluded.minor_units, transactional = excluded.transactional, sort = excluded.sort, active = true, catalog_version = excluded.catalog_version, updated_at = now();
insert into public.ref_countries(code, name, region, currency, tax_options, business, sort, catalog_version) values
  ('GB', 'United Kingdom', 'uk', 'GBP', array['UK VAT 20% (standard rate)', 'UK VAT 5% (reduced rate)', 'Not VAT registered']::text[], true, 1, 1),
  ('IE', 'Ireland', 'eu', 'EUR', array['Irish VAT 23%', 'Irish VAT 13.5%', 'Not VAT registered']::text[], true, 2, 1),
  ('US', 'United States', 'na', 'USD', array['Sales tax by state (set per event location)', 'Tax exempt organisation']::text[], true, 3, 1),
  ('CA', 'Canada', 'na', 'CAD', array['GST/HST by province', 'Not registered (small supplier)']::text[], true, 4, 1),
  ('DE', 'Germany', 'eu', 'EUR', array['Umsatzsteuer 19%', 'Kleinunternehmer (no VAT charged)']::text[], true, 5, 1),
  ('FR', 'France', 'eu', 'EUR', array['TVA 20%', 'Franchise en base (no VAT charged)']::text[], true, 6, 1),
  ('AE', 'United Arab Emirates', 'mea', 'AED', array['UAE VAT 5%', 'Not VAT registered']::text[], true, 7, 1),
  ('ZA', 'South Africa', 'mea', 'ZAR', array['South African VAT 15%', 'Not VAT registered']::text[], true, 8, 1),
  ('AU', 'Australia', 'apac', 'AUD', array['GST 10%', 'Not GST registered']::text[], true, 9, 1),
  ('ES', 'Spain', 'eu', 'EUR', array['IVA 21%', 'Not VAT registered']::text[], true, 10, 1),
  ('IT', 'Italy', 'eu', 'EUR', array['IVA 22%', 'Not VAT registered']::text[], true, 11, 1),
  ('NL', 'Netherlands', 'eu', 'EUR', array['BTW 21%', 'Kleineondernemersregeling (no VAT charged)']::text[], true, 12, 1),
  ('PT', 'Portugal', 'eu', 'EUR', array['IVA 23%', 'Not VAT registered']::text[], true, 13, 1),
  ('AT', 'Austria', 'eu', 'EUR', array['VAT registered', 'Not VAT registered']::text[], true, 14, 1),
  ('BE', 'Belgium', 'eu', 'EUR', array['VAT registered', 'Not VAT registered']::text[], true, 15, 1),
  ('BG', 'Bulgaria', 'eu', 'EUR', array['VAT registered', 'Not VAT registered']::text[], true, 16, 1),
  ('CY', 'Cyprus', 'eu', 'EUR', array['VAT registered', 'Not VAT registered']::text[], true, 17, 1),
  ('CZ', 'Czech Republic', 'eu', 'CZK', array['VAT registered', 'Not VAT registered']::text[], true, 18, 1),
  ('DK', 'Denmark', 'eu', 'DKK', array['VAT registered', 'Not VAT registered']::text[], true, 19, 1),
  ('EE', 'Estonia', 'eu', 'EUR', array['VAT registered', 'Not VAT registered']::text[], true, 20, 1),
  ('FI', 'Finland', 'eu', 'EUR', array['VAT registered', 'Not VAT registered']::text[], true, 21, 1),
  ('GR', 'Greece', 'eu', 'EUR', array['VAT registered', 'Not VAT registered']::text[], true, 22, 1),
  ('HU', 'Hungary', 'eu', 'HUF', array['VAT registered', 'Not VAT registered']::text[], true, 23, 1),
  ('LT', 'Lithuania', 'eu', 'EUR', array['VAT registered', 'Not VAT registered']::text[], true, 24, 1),
  ('LU', 'Luxembourg', 'eu', 'EUR', array['VAT registered', 'Not VAT registered']::text[], true, 25, 1),
  ('LV', 'Latvia', 'eu', 'EUR', array['VAT registered', 'Not VAT registered']::text[], true, 26, 1),
  ('MT', 'Malta', 'eu', 'EUR', array['VAT registered', 'Not VAT registered']::text[], true, 27, 1),
  ('PL', 'Poland', 'eu', 'PLN', array['VAT registered', 'Not VAT registered']::text[], true, 28, 1),
  ('RO', 'Romania', 'eu', 'RON', array['VAT registered', 'Not VAT registered']::text[], true, 29, 1),
  ('SE', 'Sweden', 'eu', 'SEK', array['VAT registered', 'Not VAT registered']::text[], true, 30, 1),
  ('SI', 'Slovenia', 'eu', 'EUR', array['VAT registered', 'Not VAT registered']::text[], true, 31, 1),
  ('SK', 'Slovakia', 'eu', 'EUR', array['VAT registered', 'Not VAT registered']::text[], true, 32, 1),
  ('CH', 'Switzerland', 'europe', 'CHF', array['Swiss VAT (MWST) registered', 'Not VAT registered']::text[], true, 33, 1),
  ('NO', 'Norway', 'europe', 'NOK', array['MVA registered', 'Not VAT registered']::text[], true, 34, 1),
  ('NZ', 'New Zealand', 'apac', 'NZD', array['GST 15%', 'Not GST registered']::text[], true, 35, 1),
  ('JP', 'Japan', 'apac', 'JPY', array['Consumption tax registered (qualified invoice issuer)', 'Not registered']::text[], true, 36, 1),
  ('SG', 'Singapore', 'apac', 'SGD', array['GST registered', 'Not GST registered']::text[], true, 37, 1),
  ('HK', 'Hong Kong', 'apac', 'HKD', array['No VAT/GST']::text[], true, 38, 1)
on conflict (code) do update set name = excluded.name, region = excluded.region, currency = excluded.currency, tax_options = excluded.tax_options, business = excluded.business, sort = excluded.sort, active = true, catalog_version = excluded.catalog_version, updated_at = now();
insert into public.ref_timezones(tz, label, country, sort, catalog_version) values
  ('Europe/London', '(GMT+0/+1) London', 'GB', 1, 1),
  ('Europe/Dublin', '(GMT+0/+1) Dublin', 'IE', 2, 1),
  ('America/New_York', '(GMT−5/−4) New York', 'US', 3, 1),
  ('America/Chicago', '(GMT−6/−5) Chicago', 'US', 4, 1),
  ('America/Denver', '(GMT−7/−6) Denver', 'US', 5, 1),
  ('America/Los_Angeles', '(GMT−8/−7) Los Angeles', 'US', 6, 1),
  ('America/Toronto', '(GMT−5/−4) Toronto', 'CA', 7, 1),
  ('America/Vancouver', '(GMT−8/−7) Vancouver', 'CA', 8, 1),
  ('Europe/Berlin', '(GMT+1/+2) Berlin', 'DE', 9, 1),
  ('Europe/Paris', '(GMT+1/+2) Paris', 'FR', 10, 1),
  ('Asia/Dubai', '(GMT+4) Dubai', 'AE', 11, 1),
  ('Africa/Johannesburg', '(GMT+2) Johannesburg', 'ZA', 12, 1),
  ('Australia/Sydney', '(GMT+10/+11) Sydney', 'AU', 13, 1),
  ('Australia/Perth', '(GMT+8) Perth', 'AU', 14, 1),
  ('Europe/Madrid', '(GMT+1/+2) Madrid', 'ES', 15, 1),
  ('Europe/Rome', '(GMT+1/+2) Rome', 'IT', 16, 1),
  ('Europe/Amsterdam', '(GMT+1/+2) Amsterdam', 'NL', 17, 1),
  ('Europe/Lisbon', '(GMT+0/+1) Lisbon', 'PT', 18, 1),
  ('America/Phoenix', '(GMT−7) Phoenix', 'US', 19, 1),
  ('America/Anchorage', '(GMT−9/−8) Anchorage', 'US', 20, 1),
  ('Pacific/Honolulu', '(GMT−10) Honolulu', 'US', 21, 1),
  ('America/Halifax', '(GMT−4/−3) Halifax', 'CA', 22, 1),
  ('America/Winnipeg', '(GMT−6/−5) Winnipeg', 'CA', 23, 1),
  ('America/Edmonton', '(GMT−7/−6) Edmonton', 'CA', 24, 1),
  ('Australia/Melbourne', '(GMT+10/+11) Melbourne', 'AU', 25, 1),
  ('Australia/Brisbane', '(GMT+10) Brisbane', 'AU', 26, 1),
  ('Australia/Adelaide', '(GMT+9:30/+10:30) Adelaide', 'AU', 27, 1),
  ('Atlantic/Canary', '(GMT+0/+1) Canary Islands', 'ES', 28, 1),
  ('Atlantic/Azores', '(GMT−1/+0) Azores', 'PT', 29, 1),
  ('Europe/Vienna', '(GMT+1/+2) Vienna', 'AT', 30, 1),
  ('Europe/Brussels', '(GMT+1/+2) Brussels', 'BE', 31, 1),
  ('Europe/Sofia', '(GMT+2/+3) Sofia', 'BG', 32, 1),
  ('Asia/Nicosia', '(GMT+2/+3) Nicosia', 'CY', 33, 1),
  ('Europe/Prague', '(GMT+1/+2) Prague', 'CZ', 34, 1),
  ('Europe/Copenhagen', '(GMT+1/+2) Copenhagen', 'DK', 35, 1),
  ('Europe/Tallinn', '(GMT+2/+3) Tallinn', 'EE', 36, 1),
  ('Europe/Helsinki', '(GMT+2/+3) Helsinki', 'FI', 37, 1),
  ('Europe/Athens', '(GMT+2/+3) Athens', 'GR', 38, 1),
  ('Europe/Budapest', '(GMT+1/+2) Budapest', 'HU', 39, 1),
  ('Europe/Vilnius', '(GMT+2/+3) Vilnius', 'LT', 40, 1),
  ('Europe/Luxembourg', '(GMT+1/+2) Luxembourg', 'LU', 41, 1),
  ('Europe/Riga', '(GMT+2/+3) Riga', 'LV', 42, 1),
  ('Europe/Malta', '(GMT+1/+2) Malta', 'MT', 43, 1),
  ('Europe/Warsaw', '(GMT+1/+2) Warsaw', 'PL', 44, 1),
  ('Europe/Bucharest', '(GMT+2/+3) Bucharest', 'RO', 45, 1),
  ('Europe/Stockholm', '(GMT+1/+2) Stockholm', 'SE', 46, 1),
  ('Europe/Ljubljana', '(GMT+1/+2) Ljubljana', 'SI', 47, 1),
  ('Europe/Bratislava', '(GMT+1/+2) Bratislava', 'SK', 48, 1),
  ('Europe/Zurich', '(GMT+1/+2) Zurich', 'CH', 49, 1),
  ('Europe/Oslo', '(GMT+1/+2) Oslo', 'NO', 50, 1),
  ('Pacific/Auckland', '(GMT+12/+13) Auckland', 'NZ', 51, 1),
  ('Asia/Tokyo', '(GMT+9) Tokyo', 'JP', 52, 1),
  ('Asia/Singapore', '(GMT+8) Singapore', 'SG', 53, 1),
  ('Asia/Hong_Kong', '(GMT+8) Hong Kong', 'HK', 54, 1)
on conflict (tz) do update set label = excluded.label, country = excluded.country, sort = excluded.sort, active = true, catalog_version = excluded.catalog_version, updated_at = now();


-- ═══ 2. Columns ═══
alter table public.events add column if not exists country text;
alter table public.listings add column if not exists currency text, add column if not exists country text, add column if not exists timezone text;
alter table public.profiles add column if not exists timezone text;
alter table public.events drop constraint if exists events_country_iso2;
alter table public.events add constraint events_country_iso2 check (country is null or country ~ '^[A-Z]{2}$') not valid;
alter table public.listings drop constraint if exists listings_locale_check;
alter table public.listings add constraint listings_locale_check check ((country is null or country ~ '^[A-Z]{2}$') and (currency is null or currency ~ '^[A-Z]{3}$') and (timezone is null or length(timezone) between 3 and 64)) not valid;
alter table public.profiles drop constraint if exists profiles_timezone_check;
alter table public.profiles add constraint profiles_timezone_check check (timezone is null or length(timezone) between 3 and 64) not valid;
comment on column public.events.country is 'Q72: ISO-2 country the event takes place in (drives consumer-law notices, licence packs, alcohol and resale rules). Null = workspace business country.';
comment on column public.listings.currency is 'Q72: currency the listing is priced in (price_from etc.). Defaults to the workspace currency (Connect default) at insert.';
comment on column public.listings.country is 'Q72: ISO-2 country of the venue / supplier base.';
comment on column public.listings.timezone is 'Q72: IANA zone for availability calendars; null = Europe/London (pre-Q72 behaviour).';
comment on column public.profiles.timezone is 'Q72: viewer IANA zone for emails and reminders; null = browser zone on screen, Europe/London in email.';

-- ═══ 2b. Backfill (pre-Q72 data is UK) ═══
update public.events e set country = 'GB' where e.country is null and e.timezone = 'Europe/London';
update public.events e set country = coalesce(public.workspace_business_country(e.workspace_id), 'GB') where e.country is null and e.workspace_id is not null;
update public.listings l set currency = 'GBP' where l.currency is null;
update public.listings l set country = coalesce(public.workspace_business_country(l.workspace_id), 'GB') where l.country is null;
alter table public.events validate constraint events_country_iso2;
alter table public.listings validate constraint listings_locale_check;
alter table public.profiles validate constraint profiles_timezone_check;

-- ═══ 3. Defaults at insert ═══
-- The workspace's currency for new prices: settings.currency (Connect default lands there, see below) when transactional, else
-- the business country's currency when transactional, else GBP.
create or replace function public.workspace_default_currency(p_workspace uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select upper(w.settings->>'currency') from public.workspaces w where w.id = p_workspace and public.is_currency(upper(w.settings->>'currency'), true)),
    (select r.currency from public.ref_countries r where r.code = public.workspace_business_country(p_workspace) and public.is_currency(r.currency, true)),
    'GBP')
$$;
revoke all on function public.workspace_default_currency(uuid) from public, anon, authenticated;
grant execute on function public.workspace_default_currency(uuid) to service_role;

create or replace function public.i18n_listing_locale_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tz text;
begin
  if new.workspace_id is not null then
    if new.currency is null then new.currency := public.workspace_default_currency(new.workspace_id); end if;
    if new.country is null then new.country := public.workspace_business_country(new.workspace_id); end if;
    if new.timezone is null then
      select w.settings->>'timezone' into tz from public.workspaces w where w.id = new.workspace_id;
      if tz is not null and public.is_timezone(tz) then new.timezone := tz; end if;
    end if;
  end if;
  new.currency := coalesce(upper(new.currency), 'GBP');
  return new;
end $$;
revoke all on function public.i18n_listing_locale_defaults() from public, anon, authenticated;
drop trigger if exists i18n_listings_locale_defaults on public.listings;
create trigger i18n_listings_locale_defaults before insert on public.listings for each row execute function public.i18n_listing_locale_defaults();

create or replace function public.i18n_event_locale_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.country is null and new.workspace_id is not null then new.country := public.workspace_business_country(new.workspace_id); end if;
  if new.country is null and new.timezone = 'Europe/London' then new.country := 'GB'; end if;
  return new;
end $$;
revoke all on function public.i18n_event_locale_defaults() from public, anon, authenticated;
drop trigger if exists i18n_events_locale_defaults on public.events;
create trigger i18n_events_locale_defaults before insert on public.events for each row execute function public.i18n_event_locale_defaults();

-- Seller currency follows the Connect account: the account's default currency becomes settings.currency when none is set.
create or replace function public.i18n_connect_currency_default() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.default_currency is not null and public.is_currency(upper(new.default_currency), true) then
    update public.workspaces w set settings = coalesce(w.settings, '{}'::jsonb) || jsonb_build_object('currency', upper(new.default_currency))
      where w.id = new.workspace_id and not (coalesce(w.settings, '{}'::jsonb) ? 'currency');
  end if;
  return null;
end $$;
revoke all on function public.i18n_connect_currency_default() from public, anon, authenticated;
drop trigger if exists i18n_connect_currency_default on public.connect_accounts;
create trigger i18n_connect_currency_default after insert or update of default_currency on public.connect_accounts for each row execute function public.i18n_connect_currency_default();

-- ═══ 4. Ticket checkout in the event's currency ═══
-- The event's currency when the quote can price it (transactional, two minor digits), else null.
create or replace function public.event_checkout_currency(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select c.code from public.events e join public.ref_currencies c on c.code = upper(coalesce(nullif(e.currency, ''), 'GBP'))
   where e.id = p_event and c.active and c.transactional and c.minor_units = 2
$$;
revoke all on function public.event_checkout_currency(uuid) from public, anon, authenticated;
grant execute on function public.event_checkout_currency(uuid) to service_role;

create or replace function public.checkout_order_currency_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  c := public.event_checkout_currency(new.event_id);
  if c is null then raise exception 'currency_not_supported' using errcode = '22023'; end if;
  new.currency := c;
  return new;
end $$;
revoke all on function public.checkout_order_currency_guard() from public, anon, authenticated;
drop trigger if exists checkout_orders_currency_guard on public.checkout_orders;
create trigger checkout_orders_currency_guard before insert on public.checkout_orders for each row execute function public.checkout_order_currency_guard();

-- checkout_quote: identical to 202610294015 except the currency, which is now the event's (was the literal 'GBP').
create or replace function public.checkout_quote(p_event uuid, p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare cfg jsonb := public.ticket_fee_config(); fixed_minor numeric; pct numeric; seller_bps numeric; vat_r numeric := public.vat_rate_bps() / 10000.0; incl boolean := public.vat_consumer_inclusive();
  l record; d record; lines jsonb := '[]'; codes jsonb := '[]'; gross bigint := 0; disc bigint := 0; fee numeric := 0; fee_minor bigint; fee_vat bigint; per bigint; net bigint; q int; exp timestamptz; k text := 'primary';
begin
  fixed_minor := round(coalesce((cfg->>'fixed')::numeric, 0) * 100); pct := coalesce((cfg->>'pct_bps')::numeric, 0); seller_bps := coalesce((cfg->>'seller_bps')::numeric, 0);
  if length(coalesce(p_token, '')) >= 16 then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'code', x.code, 'purpose', x.purpose, 'kind', x.kind, 'amount', x.amount, 'stackable', x.stackable) order by a.applied_at), '[]') into codes
      from public.checkout_code_applications a join public.discount_codes x on x.id = a.code_id
      where a.token = p_token and a.event_id = p_event and public.discount_code_live(x);
    for l in
      select t.id, t.name, round(t.price * 100)::bigint unit, t.sort,
        coalesce((select sum(h.qty) from public.ticket_holds h where h.token = p_token and h.event_id = p_event and h.tier_id = t.id and h.expires_at > now()), 0)::int ga,
        (select min(h.expires_at) from public.ticket_holds h where h.token = p_token and h.event_id = p_event and h.tier_id = t.id and h.expires_at > now()) ga_exp,
        coalesce((select count(*) from public.event_seats s where s.hold_token = p_token and s.event_id = p_event and s.tier_id = t.id and s.status = 'held' and s.hold_expires_at > now()), 0)::int st,
        (select min(s.hold_expires_at) from public.event_seats s where s.hold_token = p_token and s.event_id = p_event and s.tier_id = t.id and s.status = 'held' and s.hold_expires_at > now()) st_exp,
        coalesce((select jsonb_agg(coalesce(nullif(s.label, ''), s.seat_key) order by s.seat_key) from public.event_seats s where s.hold_token = p_token and s.event_id = p_event and s.tier_id = t.id and s.status = 'held' and s.hold_expires_at > now()), '[]') seats
      from public.ticket_tiers t where t.event_id = p_event order by t.sort, t.name, t.id
    loop
      q := l.ga + l.st;
      if q = 0 then continue; end if;
      per := 0;
      for d in select * from public.discount_codes x where x.id in (select (c->>'id')::uuid from jsonb_array_elements(codes) c) and x.purpose = 'discount'
          and (x.tier_ids is null or l.id = any(x.tier_ids)) order by (x.kind = 'percent') desc, x.code loop
        if d.kind = 'percent' then per := per + round((l.unit - per) * least(d.amount, 100) / 100.0)::bigint;
        else per := per + least(l.unit - per, round(d.amount * 100)::bigint); end if;
      end loop;
      net := l.unit - per;
      gross := gross + l.unit * q; disc := disc + per * q;
      if net > 0 then fee := fee + q * (fixed_minor + net * pct / 10000.0); end if;
      exp := least(exp, l.ga_exp, l.st_exp);
      lines := lines || jsonb_build_object('tier_id', l.id, 'name', l.name, 'unit_minor', l.unit, 'discount_minor', per, 'net_unit_minor', net, 'qty', q, 'seats', l.seats);
    end loop;
    if jsonb_array_length(lines) = 0 then
      -- Official resale held by this token (one order is either primary or resale).
      for l in select (r->>'tier_id')::uuid tier_id, r->>'tier' tier, round((r->>'price')::numeric * 100)::bigint unit, count(*)::int n, min((r->>'expires_at')::timestamptz) e,
            coalesce(jsonb_agg(r->>'seat') filter (where r->>'seat' is not null), '[]') seats
          from jsonb_array_elements(public.resale_holds_for(p_token)) r group by 1, 2, 3 order by 2, 3 loop
        k := 'resale';
        gross := gross + l.unit * l.n;
        if l.unit > 0 then fee := fee + l.n * (fixed_minor + l.unit * pct / 10000.0); end if;
        exp := least(exp, l.e);
        lines := lines || jsonb_build_object('tier_id', l.tier_id, 'name', l.tier || ' (resale)', 'unit_minor', l.unit, 'discount_minor', 0, 'net_unit_minor', l.unit, 'qty', l.n, 'seats', l.seats, 'resale', true);
      end loop;
    end if;
  end if;
  fee_minor := round(fee)::bigint;
  fee_vat := case when fee_minor = 0 then 0 when incl then round(fee_minor * vat_r / (1 + vat_r))::bigint else round(fee_minor * vat_r)::bigint end;
  return jsonb_build_object('kind', k, 'currency', coalesce(public.event_checkout_currency(p_event), 'GBP'), 'lines', lines, 'codes', case when k = 'resale' then '[]'::jsonb else codes end,
    'gross_minor', gross, 'discount_minor', disc, 'subtotal_minor', gross - disc,
    'fee_minor', fee_minor, 'fee_vat_minor', fee_vat, 'fee_total_minor', fee_minor + case when incl then 0 else fee_vat end,
    'commission_minor', case when k = 'resale' then 0 else round((gross - disc) * seller_bps / 10000.0)::bigint end,
    'total_minor', gross - disc + fee_minor, 'payable_minor', gross - disc + fee_minor + case when incl then 0 else fee_vat end,
    'expires_at', exp, 'quoted_at', now(),
    'fee_rule', jsonb_build_object('fixed_minor', fixed_minor, 'pct_bps', pct, 'seller_bps', seller_bps, 'vat_rate_bps', public.vat_rate_bps(), 'vat_inclusive', incl));
end $$;
