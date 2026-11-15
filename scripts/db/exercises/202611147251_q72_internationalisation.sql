-- Q72 exercise (rolled back): master data covers every Connect country; listing/event locale defaults at insert; Connect default
-- currency fills settings.currency only when unset; checkout_quote + the order guard use the event currency. Ends with EXERCISE_OK.
do $$
declare ws uuid; ws2 uuid; uid uuid; ev uuid; l_cur text; l_cty text; l_tz text; e_cty text; q jsonb; s jsonb; n int;
begin
  -- 1. master data
  select count(*) into n from public.ref_countries r join public.connect_supported_countries c on c.code = r.code where r.active and r.business;
  if n <> (select count(*) from public.connect_supported_countries) then raise exception 'not every Connect country is a business country (%)', n; end if;
  if not public.is_currency('CHF', true) or not public.is_currency('AUD', true) or public.is_currency('JPY', true) or public.is_currency('AED', true) then raise exception 'transactional currency set wrong'; end if;
  if not public.is_timezone('Asia/Tokyo', true) or not public.is_timezone('Europe/Zurich', true) then raise exception 'timezones missing'; end if;
  select count(*) into n from public.ref_countries r where r.business and r.active and not exists (select 1 from public.ref_timezones z where z.country = r.code and z.active);
  if n > 0 then raise exception '% business countries have no timezone', n; end if;

  -- 2. fixtures: a French organiser workspace and a UK one
  select id into uid from auth.users order by created_at limit 1;
  insert into public.workspaces(name, kind, owner_id, onboarding_complete, settings) values ('Q72 FR', 'organizer', uid, true, jsonb_build_object('organisation', jsonb_build_object('country', 'France'), 'timezone', 'Europe/Paris')) returning id into ws;
  insert into public.workspaces(name, kind, owner_id, onboarding_complete, settings) values ('Q72 GB', 'organizer', uid, true, jsonb_build_object('currency', 'GBP')) returning id into ws2;
  if public.workspace_default_currency(ws) <> 'EUR' then raise exception 'FR default currency %', public.workspace_default_currency(ws); end if;
  if public.workspace_default_currency(ws2) <> 'GBP' then raise exception 'GB default currency'; end if;

  -- 3. listing defaults at insert
  insert into public.listings(workspace_id, kind, name, slug, category) values (ws, 'venue', 'Q72 Salle', 'q72-salle-' || substr(md5(random()::text), 1, 8), 'Event Space')
    returning currency, country, timezone into l_cur, l_cty, l_tz;
  if l_cur <> 'EUR' or l_cty <> 'FR' or l_tz <> 'Europe/Paris' then raise exception 'listing defaults % % %', l_cur, l_cty, l_tz; end if;

  -- 4. Connect default currency → settings.currency only when unset
  insert into public.connect_accounts(workspace_id, stripe_account_id, country, default_currency) values (ws, 'acct_q72test' || substr(md5(random()::text), 1, 8), 'FR', 'eur');
  select settings into s from public.workspaces where id = ws;
  if s->>'currency' <> 'EUR' then raise exception 'connect currency not applied: %', s; end if;
  insert into public.connect_accounts(workspace_id, stripe_account_id, country, default_currency) values (ws2, 'acct_q72tst2' || substr(md5(random()::text), 1, 8), 'GB', 'usd');
  if (select settings->>'currency' from public.workspaces where id = ws2) <> 'GBP' then raise exception 'existing currency overwritten'; end if;

  -- 5. event defaults + checkout currency
  insert into public.events(owner_id, workspace_id, name, management, status, currency, timezone, starts_at, ends_at)
    values (uid, ws, 'Q72 Soirée', 'professional', 'draft', 'EUR', 'Europe/Paris', now() + interval '60 days', now() + interval '60 days 4 hours') returning id, country into ev, e_cty;
  if e_cty <> 'FR' then raise exception 'event country %', e_cty; end if;
  if public.event_checkout_currency(ev) <> 'EUR' then raise exception 'event checkout currency'; end if;
  q := public.checkout_quote(ev, 'q72-token-that-is-long-enough');
  if q->>'currency' <> 'EUR' then raise exception 'quote currency %', q->>'currency'; end if;
  update public.events set currency = 'JPY' where id = ev;
  if public.event_checkout_currency(ev) is not null then raise exception 'JPY must not be checkout-capable yet'; end if;
  begin
    insert into public.checkout_orders(order_ref, event_id, buyer_id, token, amount, fee, currency, status, lines) values ('GD-Q72X' || substr(md5(random()::text), 1, 5), ev, uid, 'q72-token-that-is-long-enough', 0, 0, 'GBP', 'pending', '[]');
    raise exception 'guard did not refuse JPY';
  exception when others then if sqlerrm not like '%currency_not_supported%' then raise; end if; end;
  update public.events set currency = 'EUR' where id = ev;

  -- 6. backfill held: no London event left without a country
  select count(*) into n from public.events where country is null and timezone = 'Europe/London';
  if n > 0 then raise exception '% London events without a country', n; end if;
  select count(*) into n from public.listings where currency is null;
  if n > 0 then raise exception '% listings without a currency', n; end if;

  raise exception 'EXERCISE_OK q72 master data, locale defaults, connect currency, checkout currency';
end $$;
