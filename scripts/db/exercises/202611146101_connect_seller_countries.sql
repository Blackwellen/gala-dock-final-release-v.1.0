-- Exercise for 202611146101 (rolled back): supported list, country resolution, enquiry-only trigger, readiness functions compile.
do $$
declare ws uuid; lst uuid; mode text; ib boolean; n int; ev uuid; r text;
begin
  select count(*) into n from public.connect_supported_countries;
  if n <> 36 then raise exception 'expected 36 supported countries, got %', n; end if;
  if not public.connect_country_supported('gb') or not public.connect_country_supported('US') then raise exception 'GB/US must be supported'; end if;
  if public.connect_country_supported('AE') or public.connect_country_supported('ZA') or public.connect_country_supported('BR') or public.connect_country_supported(null) then
    raise exception 'AE/ZA/BR/null must not be supported';
  end if;

  select l.workspace_id, l.id into ws, lst from public.listings l join public.workspaces w on w.id = l.workspace_id where w.kind = 'provider' limit 1;
  if ws is null then raise exception 'no provider listing to exercise'; end if;

  update public.workspaces set settings = jsonb_set(coalesce(settings, '{}'::jsonb) - 'country' - 'organisation', '{business}', coalesce(settings->'business', '{}'::jsonb) || '{"country":"United Kingdom"}') where id = ws;
  if public.workspace_business_country(ws) <> 'GB' or not public.workspace_payments_country_ok(ws) then raise exception 'GB workspace should resolve and be ok'; end if;
  update public.listings set booking_mode = 'request' where id = lst;
  select booking_mode into mode from public.listings where id = lst;
  if mode <> 'request' then raise exception 'supported country must keep request mode, got %', mode; end if;

  update public.workspaces set settings = jsonb_set(settings, '{business,country}', '"South Africa"') where id = ws;
  if public.workspace_business_country(ws) <> 'ZA' or public.workspace_payments_country_ok(ws) then raise exception 'ZA workspace should resolve and not be ok'; end if;
  update public.listings set booking_mode = 'instant', instant_book = true where id = lst;
  select booking_mode, instant_book into mode, ib from public.listings where id = lst;
  if mode <> 'enquiry' or ib then raise exception 'unsupported country must force enquiry-only, got % %', mode, ib; end if;
  update public.packages set booking_mode = 'instant' where workspace_id = ws;
  if exists (select 1 from public.packages where workspace_id = ws and booking_mode <> 'enquiry') then raise exception 'packages must be enquiry-only'; end if;

  update public.workspaces set settings = jsonb_set(settings, '{business,country}', '"Atlantis"') where id = ws;
  if public.workspace_business_country(ws) is not null or not public.workspace_payments_country_ok(ws) then raise exception 'unknown country must be ok (Stripe decides)'; end if;

  select id into ev from public.events limit 1;
  if ev is not null then r := public.event_payment_readiness(ev); if r not in ('ready', 'seller_not_ready') then raise exception 'event_payment_readiness: %', r; end if; end if;
  raise exception 'EXERCISE_OK seller-country gate: 36 countries, ZA forced enquiry-only, unknown country left to Stripe';
end $$;
