-- Q76 exercise (rolled back): provider_save_listing writes country / timezone / currency (validated), listing calendars use the
-- listing's zone (London unchanged), resale_policy_for picks the event country's published policy, else GB, and an explicit
-- jurisdiction still wins. Ends with EXERCISE_OK.
do $$
declare uid uuid; ws uuid; lid uuid; l public.listings; ev uuid; ev2 uuid; ev3 uuid; p public.resale_policies; j jsonb;
begin
  select id into uid from auth.users order by created_at limit 1;
  insert into public.workspaces(name, kind, owner_id, onboarding_complete, settings, capabilities) values ('Q76 NY venue', 'provider', uid, true,
    jsonb_build_object('organisation', jsonb_build_object('country', 'United States')), array['venue','service']) returning id into ws;
  insert into public.workspace_members(workspace_id, user_id, role) values (ws, uid, 'owner') on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);

  -- 1. venue form shape (details.country_code / details.timezone) is copied
  lid := public.provider_save_listing(ws, null, jsonb_build_object('kind', 'venue', 'name', 'Q76 Loft', 'details', jsonb_build_object('country_code', 'US', 'timezone', 'America/Chicago')));
  select * into l from public.listings where id = lid;
  if l.country <> 'US' or l.timezone <> 'America/Chicago' or l.currency <> 'USD' then raise exception 'listing locale % % %', l.country, l.timezone, l.currency; end if;
  -- explicit keys, validated
  perform public.provider_save_listing(ws, lid, jsonb_build_object('country', 'ca', 'timezone', 'America/Toronto', 'currency', 'cad'));
  select * into l from public.listings where id = lid;
  if l.country <> 'CA' or l.timezone <> 'America/Toronto' or l.currency <> 'CAD' then raise exception 'explicit locale % % %', l.country, l.timezone, l.currency; end if;
  begin perform public.provider_save_listing(ws, lid, jsonb_build_object('currency', 'JPY')); raise exception 'JPY accepted';
  exception when others then if sqlerrm not like '%invalid_currency%' then raise; end if; end;
  begin perform public.provider_save_listing(ws, lid, jsonb_build_object('timezone', 'Mars/Base')); raise exception 'bad zone accepted';
  exception when others then if sqlerrm not like '%invalid_timezone%' then raise; end if; end;
  begin perform public.provider_save_listing(ws, lid, jsonb_build_object('country', 'ZZ')); raise exception 'bad country accepted';
  exception when others then if sqlerrm not like '%invalid_country%' then raise; end if; end;
  -- an invalid stored details.timezone (old form data) is ignored, not an error
  perform public.provider_save_listing(ws, lid, jsonb_build_object('name', 'Q76 Loft 2', 'details', jsonb_build_object('timezone', 'Nowhere/Here')));
  if (select timezone from public.listings where id = lid) <> 'America/Toronto' then raise exception 'details zone overwrote'; end if;

  -- 2. calendars in the listing zone
  if public.listing_timezone(lid) <> 'America/Toronto' or public.listing_timezone(gen_random_uuid()) <> 'Europe/London' then raise exception 'listing_timezone'; end if;
  update public.listings set published = true, details = details || '{"public_availability": true}'::jsonb where id = lid;
  j := public.public_listing_availability(lid, current_date, current_date + 3);
  if j->>'timezone' <> 'America/Toronto' then raise exception 'availability zone %', j->>'timezone'; end if;
  update public.listings set timezone = null where id = lid;
  j := public.public_listing_availability(lid, current_date, current_date + 3);
  if j->>'timezone' <> 'Europe/London' then raise exception 'availability fallback %', j->>'timezone'; end if;

  -- 3. resale policy per jurisdiction
  insert into public.events(owner_id, workspace_id, name, management, status, currency, timezone, starts_at, ends_at, country)
    values (uid, ws, 'Q76 Paris', 'professional', 'draft', 'EUR', 'Europe/Paris', now() + interval '30 days', now() + interval '30 days 3 hours', 'FR') returning id into ev;
  insert into public.events(owner_id, workspace_id, name, management, status, currency, timezone, starts_at, ends_at, country)
    values (uid, ws, 'Q76 Berlin', 'professional', 'draft', 'EUR', 'Europe/Berlin', now() + interval '30 days', now() + interval '30 days 3 hours', 'DE') returning id into ev2;
  insert into public.events(owner_id, workspace_id, name, management, status, currency, timezone, starts_at, ends_at, country, settings)
    values (uid, ws, 'Q76 Dublin', 'professional', 'draft', 'EUR', 'Europe/Dublin', now() + interval '30 days', now() + interval '30 days 3 hours', 'IE', '{"jurisdiction": "GB"}') returning id into ev3;
  p := public.resale_policy_for(ev);
  if p.jurisdiction <> 'FR' or p.price_cap_pct <> 100 or p.legal_review_status <> 'needs_review' or p.legal_text not like '%(verify)%' then raise exception 'FR policy %', p.jurisdiction; end if;
  if (public.resale_policy_for(ev2)).jurisdiction <> 'GB' then raise exception 'DE should fall back to GB'; end if;
  if (public.resale_policy_for(ev3)).jurisdiction <> 'GB' then raise exception 'explicit jurisdiction must win'; end if;
  if (select count(*) from public.resale_policies where jurisdiction in ('IE','BE','IT','FR') and status = 'published' and price_cap_pct = 100) <> 4 then raise exception 'seed'; end if;

  raise exception 'EXERCISE_OK q76 listing locale, listing calendars zone, resale policies per jurisdiction';
end $$;
