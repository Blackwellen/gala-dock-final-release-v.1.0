-- Q76 exercise (rolled back): fee catalogue (GBP unchanged, EUR local), booking admin fee per currency, release dates per
-- country (GB = the previous function on every day of a holiday/DST span; FR/US weekdays in their zone), the ticket release
-- helper equals the old expression for UK events, bookings charge in the seller's currency (payment order + quote), resale
-- allowed in the event currency and still refused for a mismatched order, settlement currency recorded on release + reserve,
-- and dec107_invariants unchanged. Ends with EXERCISE_OK.
do $$
declare uid uuid; ws_fr uuid; ws_gb uuid; ev_gb uuid; ev_eur uuid; lst uuid; bi uuid; po public.payment_orders; q_cur text; n int; inv0 int; inv1 int;
  t timestamptz; a timestamptz; b timestamptz; tier uuid; ref text; tk uuid; rid uuid; r public.payout_releases; cq jsonb;
begin
  select count(*) into inv0 from public.dec107_invariants();

  -- 1. fee catalogue
  if public.fee_fixed_minor_in('ticket_fixed', 100, 'GBP') <> 100 or public.fee_fixed_minor_in('ticket_fixed', 49, 'gbp') <> 49 then raise exception 'GBP fee changed'; end if;
  if public.fee_fixed_minor_in('ticket_fixed', 100, 'EUR') <> 120 then raise exception 'EUR catalogue fee %', public.fee_fixed_minor_in('ticket_fixed', 100, 'EUR'); end if;
  if public.fee_fixed_minor_in('ticket_fixed', 150, 'EUR') <> 170 then raise exception 'EUR converted fee %', public.fee_fixed_minor_in('ticket_fixed', 150, 'EUR'); end if;
  if public.fee_fixed_minor_in('ticket_fixed', 100, 'SEK') <> 1500 or public.fee_fixed_minor_in('ticket_fixed', 0, 'EUR') <> 0 then raise exception 'SEK/zero fee'; end if;
  if public.fee_fixed_minor_in('ticket_fixed', 100, 'XXX') <> 100 then raise exception 'unknown currency must keep the GBP amount'; end if;
  select count(*) into n from public.ref_currencies c where c.transactional and c.active and not exists (select 1 from public.ref_fee_catalogue f where f.currency = c.code);
  if n > 0 then raise exception '% transactional currencies without a catalogue row', n; end if;
  for n in 0..40 loop
    if public.booking_admin_fee_minor((n * 1737)::bigint, 'GBP') <> public.booking_admin_fee_minor((n * 1737)::bigint) then raise exception 'GBP admin fee changed at %', n * 1737; end if;
  end loop;
  if public.booking_admin_fee_minor(1000, 'EUR') <> 120 or public.booking_admin_fee_minor(100000, 'EUR') <> 2500 then raise exception 'EUR admin fee'; end if;

  -- 2. release dates: GB/London identical to the previous function for every start in a span with bank holidays and both DST changes
  t := '2026-03-20 18:30+00';
  while t < '2027-01-10 00:00+00' loop
    if public.dec107_add_business_days_in(t, 3, 'Europe/London', 'GB') <> public.dec107_add_business_days(t, 3)
       or public.dec107_add_business_days_in(t, 3, 'Europe/London', null) <> public.dec107_add_business_days(t, 3)
       or public.dec107_add_business_days_in(t, 3, null, null) <> public.dec107_add_business_days(t, 3) then
      raise exception 'GB business days differ at %', t;
    end if;
    t := t + interval '13 hours 7 minutes';
  end loop;
  -- Christmas 2026 (Fri 25 Dec; Boxing Day substitute Mon 28 Dec): GB skips both, France counts weekdays only
  if public.dec107_add_business_days_in('2026-12-24 18:00+00', 2, 'Europe/London', 'GB') <> '2026-12-30 18:00+00' then raise exception 'GB christmas %', public.dec107_add_business_days_in('2026-12-24 18:00+00', 2, 'Europe/London', 'GB'); end if;
  if public.dec107_add_business_days_in('2026-12-24 18:00+00', 2, 'Europe/Paris', 'FR') <> '2026-12-28 18:00+00' then raise exception 'FR christmas'; end if;
  -- New York weekend: Fri 23:30 EST is Sat in UTC/London; counting in the event zone lands on Tue 04:30Z, not Mon
  if public.dec107_add_business_days_in('2026-11-21 04:30+00', 1, 'America/New_York', 'US') <> '2026-11-24 04:30+00' then raise exception 'US zone weekend %', public.dec107_add_business_days_in('2026-11-21 04:30+00', 1, 'America/New_York', 'US'); end if;
  -- an invalid zone falls back to London
  if public.dec107_add_business_days_in('2026-11-21 04:30+00', 1, 'Mars/Base', 'GB') <> public.dec107_add_business_days('2026-11-21 04:30+00', 1) then raise exception 'invalid zone'; end if;

  -- 3. fixtures
  select id into uid from auth.users order by created_at limit 1;
  insert into public.workspaces(name, kind, owner_id, onboarding_complete, settings, capabilities) values ('Q76 FR venue', 'provider', uid, true,
    jsonb_build_object('organisation', jsonb_build_object('country', 'France'), 'timezone', 'Europe/Paris'), array['venue','service']) returning id into ws_fr;
  insert into public.workspaces(name, kind, owner_id, onboarding_complete, settings) values ('Q76 GB org', 'organizer', uid, true, jsonb_build_object('currency', 'GBP')) returning id into ws_gb;
  insert into public.events(owner_id, workspace_id, name, management, status, currency, timezone, starts_at, ends_at)
    values (uid, ws_gb, 'Q76 London gala', 'professional', 'draft', 'GBP', 'Europe/London', now() + interval '20 days', now() + interval '20 days 5 hours') returning id into ev_gb;
  if public.dec107_ticket_release_at(ev_gb) <> (select public.dec107_add_business_days(e.ends_at, s.ticket_payout_delay_business_days) from public.events e, public.dec107_settings s where e.id = ev_gb and s.id) then
    raise exception 'ticket release helper differs for a UK event';
  end if;
  if public.ticket_sales_open_from(ev_gb) <> (select public.dec107_add_business_days(e.ends_at, s.ticket_payout_delay_business_days) - make_interval(days => s.hold_limit_days - s.default_rule_margin_days)
       from public.events e, public.dec107_settings s where e.id = ev_gb and s.id) then raise exception 'ticket_sales_open_from changed for a UK event'; end if;

  -- 4. seller currency: a French venue (EUR) booked for a GBP event charges EUR, quotes are EUR
  insert into public.listings(workspace_id, kind, name, slug, category) values (ws_fr, 'venue', 'Q76 Salle', 'q76-salle-' || substr(md5(random()::text), 1, 8), 'Event Space') returning id into lst;
  if public.listing_charge_currency(lst) <> 'EUR' then raise exception 'listing currency %', public.listing_charge_currency(lst); end if;
  insert into public.build_items(event_id, listing_id, category, title, amount, price_basis, status, role) values (ev_gb, lst, 'Venue', 'Q76 Salle', 1000, 'fixed', 'draft', 'primary') returning id into bi;
  update public.build_items set status = 'quoted' where id = bi;
  if public.booking_charge_currency(bi) <> 'EUR' then raise exception 'booking currency %', public.booking_charge_currency(bi); end if;
  insert into public.provider_quotes(workspace_id, build_item_id, version, reference) values (ws_fr, bi, 1, 'Q76-' || substr(md5(random()::text), 1, 8)) returning currency into q_cur;
  if q_cur <> 'EUR' then raise exception 'quote currency %', q_cur; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  select * into po from public.create_payment_order('deposit', bi, null);
  if po.currency <> 'EUR' then raise exception 'payment order currency %', po.currency; end if;
  if po.customer_fee_minor <> public.booking_admin_fee_minor(po.amount_minor, 'EUR') then raise exception 'admin fee not in EUR'; end if;
  -- the balance follows the deposit's currency even if the listing currency changes later
  update public.listings set currency = 'CHF' where id = lst;
  if public.booking_charge_currency(bi) <> 'EUR' then raise exception 'currency drifted after an order existed'; end if;

  -- 5. ticket fee in the event currency + resale guards
  insert into public.events(owner_id, workspace_id, name, management, status, currency, timezone, starts_at, ends_at, visibility)
    values (uid, ws_gb, 'Q76 Paris soirée', 'professional', 'draft', 'EUR', 'Europe/Paris', now() + interval '30 days', now() + interval '30 days 4 hours', 'public') returning id into ev_eur;
  cq := public.checkout_quote(ev_eur, 'q76-token-that-is-long-enough');
  if (cq->'fee_rule'->>'fixed_minor')::numeric <> public.fee_fixed_minor_in('ticket_fixed', round(coalesce((public.ticket_fee_config()->>'fixed')::numeric, 0) * 100)::bigint, 'EUR') then raise exception 'quote fee rule %', cq->'fee_rule'; end if;
  cq := public.checkout_quote(ev_gb, 'q76-token-that-is-long-enough');
  if (cq->'fee_rule'->>'fixed_minor')::numeric <> round(coalesce((public.ticket_fee_config()->>'fixed')::numeric, 0) * 100) then raise exception 'GBP quote fee changed'; end if;
  insert into public.ticket_tiers(event_id, name, price, quantity) values (ev_eur, 'Q76 GA', 25, 10) returning id into tier;
  ref := 'GD-Q76' || upper(substr(md5(random()::text), 1, 6));
  insert into public.checkout_orders(order_ref, event_id, buyer_id, token, amount, fee, currency, status, lines, stripe_session)
    values (ref, ev_eur, uid, 'q76-token-that-is-long-enough', 25, 1.2, 'EUR', 'issued', '[]', 'cs_test_q76');
  insert into public.tickets(event_id, tier_id, order_ref, holder_id, status, price_paid, code)
    values (ev_eur, tier, ref, uid, 'valid', 25, 'Q76' || upper(substr(md5(random()::text), 1, 10))) returning id into tk;
  update public.tickets set status = 'resale_listed' where id = tk;   -- was refused (GBP only) before Q76
  if (select status from public.tickets where id = tk) <> 'resale_listed' then raise exception 'EUR resale not listed'; end if;
  update public.tickets set status = 'valid' where id = tk;
  update public.checkout_orders set currency = 'GBP' where order_ref = ref;   -- an order not in the event's currency stays refused
  begin
    update public.tickets set status = 'resale_listed' where id = tk;
    raise exception 'mismatched order currency was not refused';
  exception when others then if sqlerrm not like '%original_payment_required%' then raise; end if; end;

  -- 6. settlement currency on release + reserve part
  insert into public.payout_releases(source_type, source_ref, part, workspace_id, stripe_account_id, sale_kind, currency, livemode, charged_at, hold_limit_at, trigger, status, due_at)
    values ('checkout_order', 'q76-ex-' || substr(md5(random()::text), 1, 6), 'main', ws_gb, 'acct_q76ex', 'ticket_sale', 'EUR', false, now() - interval '10 days', now() + interval '60 days', 'event_completed_review', 'due', now())
    returning id into rid;
  perform public.dec107_release_paid(jsonb_build_array(jsonb_build_object('id', rid, 'amount_minor', 950, 'currency', 'gbp', 'reserve_kind', 'standard', 'reserve_bps', 500, 'reserve_minor', 50, 'reserve_days', 7)), 'po_q76ex', 'g');
  select * into r from public.payout_releases where id = rid;
  if r.status <> 'paid_out' or r.settlement_currency <> 'GBP' or r.currency <> 'EUR' then raise exception 'main release %', r; end if;
  select * into r from public.payout_releases where source_ref = r.source_ref and part = 'reserve';
  if not found or r.currency <> 'GBP' or r.reserve_minor <> 50 then raise exception 'reserve part currency %', r; end if;
  -- an item without a currency keeps the charge currency (pre-Q76 worker)
  insert into public.payout_releases(source_type, source_ref, part, workspace_id, stripe_account_id, sale_kind, currency, livemode, charged_at, hold_limit_at, trigger, status, due_at)
    values ('checkout_order', 'q76-ex2-' || substr(md5(random()::text), 1, 6), 'main', ws_gb, 'acct_q76ex', 'ticket_sale', 'GBP', false, now() - interval '10 days', now() + interval '60 days', 'event_completed_review', 'due', now())
    returning id into rid;
  perform public.dec107_release_paid(jsonb_build_array(jsonb_build_object('id', rid, 'amount_minor', 100)), 'po_q76ex2', 'g2');
  if (select settlement_currency from public.payout_releases where id = rid) <> 'GBP' then raise exception 'default settlement currency'; end if;

  -- 7. invariants unchanged
  select count(*) into inv1 from public.dec107_invariants();
  if inv1 <> inv0 then raise exception 'dec107_invariants % → %', inv0, inv1; end if;

  raise exception 'EXERCISE_OK q76 fee catalogue, admin fee, release days per country, seller currency, resale currency, settlement currency, invariants %', inv1;
end $$;
