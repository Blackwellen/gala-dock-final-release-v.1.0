-- Q76 exercise (rolled back): fmt_money / fmt_money_minor match money.ts formatMoney(…, { decimals: true }) in en-GB; zone
-- abbreviations across DST; fmt_event_time keeps London copy unlabelled; local_tz fallbacks; an invoice payment note in EUR
-- and a Paris shift notification use the new helpers. Ends with EXERCISE_OK.
do $$
declare uid uuid; ws uuid; ev uuid; inv uuid; crew uuid; body text; s text;
begin
  -- 1. money (expected strings = Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: 2 }))
  if public.fmt_money(1234.5, 'GBP') <> '£1,234.50' then raise exception 'GBP %', public.fmt_money(1234.5, 'GBP'); end if;
  if public.fmt_money(1234.5, 'eur') <> '€1,234.50' or public.fmt_money(90, 'USD') <> 'US$90.00' or public.fmt_money(12, 'CAD') <> 'CA$12.00'
     or public.fmt_money(12, 'AUD') <> 'A$12.00' or public.fmt_money(12, 'NZD') <> 'NZ$12.00' or public.fmt_money(12, 'HKD') <> 'HK$12.00' then raise exception 'symbol currencies'; end if;
  if public.fmt_money(1234.5, 'CHF') <> 'CHF 1,234.50' or public.fmt_money(99.999, 'SEK') <> 'SEK 100.00' or public.fmt_money(5, 'PLN') <> 'PLN 5.00' then raise exception 'code currencies %', public.fmt_money(1234.5, 'CHF'); end if;
  if public.fmt_money(1234.5, 'JPY') <> 'JP¥1,235' or public.fmt_money(-1234.5, 'GBP') <> '-£1,234.50' or public.fmt_money(0, null) <> '£0.00' then raise exception 'jpy/negative/default'; end if;
  if public.fmt_money(1234567.891, 'EUR') <> '€1,234,567.89' or public.fmt_money(null, 'EUR') is not null then raise exception 'large/null'; end if;
  if public.fmt_money_minor(123450, 'EUR') <> '€1,234.50' or public.fmt_money_minor(1235, 'JPY') <> 'JP¥1,235' or public.fmt_money_minor(5, 'GBP') <> '£0.05' then raise exception 'minor'; end if;

  -- 2. zones (summer / winter)
  if public.fmt_tz_abbrev('2026-07-01 12:00+00', 'Europe/London') <> 'BST' or public.fmt_tz_abbrev('2026-12-01 12:00+00', 'Europe/London') <> 'GMT' then raise exception 'London abbrev'; end if;
  if public.fmt_tz_abbrev('2026-07-01 12:00+00', 'Europe/Paris') <> 'CEST' or public.fmt_tz_abbrev('2026-12-01 12:00+00', 'Europe/Berlin') <> 'CET' then raise exception 'CE abbrev'; end if;
  if public.fmt_tz_abbrev('2026-07-01 12:00+00', 'Europe/Athens') <> 'EEST' or public.fmt_tz_abbrev('2026-07-01 12:00+00', 'Europe/Dublin') <> 'IST' then raise exception 'EE/IE abbrev'; end if;
  if public.fmt_tz_abbrev('2026-07-01 12:00+00', 'America/New_York') <> 'EDT' or public.fmt_tz_abbrev('2026-12-01 12:00+00', 'America/Los_Angeles') <> 'PST' then raise exception 'US abbrev'; end if;
  if public.fmt_tz_abbrev('2026-07-01 12:00+00', 'Australia/Sydney') <> 'AEST' or public.fmt_tz_abbrev('2026-12-01 12:00+00', 'Australia/Sydney') <> 'AEDT' then raise exception 'AU abbrev'; end if;
  if public.fmt_tz_abbrev('2026-07-01 12:00+00', 'Asia/Kolkata') <> 'UTC+5:30' or public.fmt_tz_abbrev('2026-07-01 12:00+00', 'Asia/Tokyo') <> 'JST' then raise exception 'offset abbrev %', public.fmt_tz_abbrev('2026-07-01 12:00+00', 'Asia/Kolkata'); end if;
  -- DST change days: 29 Mar 2026 01:00Z London jumps; Paris 19:00 local after the change is 17:00Z
  if public.fmt_event_time('2026-03-29 00:30+00', 'Europe/London', 'HH24:MI') <> '00:30' or public.fmt_event_time('2026-03-29 01:30+00', 'Europe/London', 'HH24:MI') <> '02:30' then raise exception 'London DST'; end if;
  if public.fmt_event_time('2026-06-12 17:00+00', 'Europe/Paris', 'Dy DD Mon HH24:MI', true) <> 'Fri 12 Jun 19:00 CEST' then raise exception 'Paris label %', public.fmt_event_time('2026-06-12 17:00+00', 'Europe/Paris', 'Dy DD Mon HH24:MI', true); end if;
  if public.fmt_event_time('2026-06-12 17:00+00', 'Europe/London', 'Dy DD Mon HH24:MI', true) <> 'Fri 12 Jun 18:00' then raise exception 'London must stay unlabelled'; end if;
  if public.fmt_event_time('2026-06-12 17:00+00', 'Not/AZone', 'HH24:MI') <> '18:00' or public.fmt_event_time(null, 'Europe/Paris') is not null then raise exception 'fallback zone'; end if;
  if to_char(timestamptz '2026-06-12 17:00+00' at time zone 'Europe/London', 'Dy DD Mon YYYY HH24:MI') <> public.fmt_event_time('2026-06-12 17:00+00', 'Europe/London') then raise exception 'default format'; end if;

  -- 3. fixtures: a Paris workspace and event
  select id into uid from auth.users order by created_at limit 1;
  insert into public.workspaces(name, kind, owner_id, onboarding_complete, settings) values ('Q76 Paris', 'organizer', uid, true,
    jsonb_build_object('organisation', jsonb_build_object('country', 'France'), 'timezone', 'Europe/Paris', 'currency', 'EUR')) returning id into ws;
  insert into public.events(owner_id, workspace_id, name, management, status, currency, timezone, starts_at, ends_at)
    values (uid, ws, 'Q76 Soirée', 'professional', 'draft', 'EUR', 'America/New_York', now() + interval '40 days', now() + interval '40 days 3 hours') returning id into ev;
  if public.local_tz(ev, null) <> 'America/New_York' or public.local_tz(null, ws) <> 'Europe/Paris' or public.local_tz(null, null) <> 'Europe/London' then raise exception 'local_tz'; end if;
  if public.dispute_currency(gen_random_uuid()) <> 'GBP' then raise exception 'dispute currency default'; end if;

  -- 4. bodies: invoice payment note (EUR) and a shift notification (event zone, labelled)
  insert into public.invoices(workspace_id, event_id, number, client_name, currency, status, subtotal, tax, total, amount_paid)
    values (ws, ev, 'Q76-' || substr(md5(random()::text), 1, 6), 'Client SA', 'EUR', 'sent', 1000, 200, 1200, 0) returning id into inv;
  perform public.record_invoice_payment(inv, 250.5, 'bank transfer', null);
  select detail into body from public.invoice_events where invoice_id = inv order by created_at desc limit 1;
  if body <> '€250.50 received via bank transfer' then raise exception 'invoice note %', body; end if;
  insert into public.crew_members(workspace_id, user_id, name, role) values (ws, uid, 'Q76 Crew', 'Host') returning id into crew;
  insert into public.shifts(workspace_id, event_id, crew_id, role, title, starts_at, ends_at, status)
    values (ws, ev, crew, 'Host', 'Q76 shift', '2026-12-30 23:00+00', '2026-12-31 03:00+00', 'confirmed');
  select n.body into body from public.notifications n where n.user_id = uid and n.kind = 'shift_assigned' order by n.created_at desc limit 1;
  if body is null or body not like 'Host · Wed 30 Dec 18:00–22:00 EST%' then raise exception 'shift body %', body; end if;

  raise exception 'EXERCISE_OK q76 fmt_money, zones, fmt_event_time, local_tz, invoice + shift bodies';
end $$;
