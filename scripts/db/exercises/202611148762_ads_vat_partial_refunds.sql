-- Q56 VAT follow-up exercise (rolled back): a boost order with a quarter refunded reports three quarters of its gross and VAT on the
-- "Promotion boosts" line; supplier commission is untouched. Ends with EXERCISE_OK.
do $$
declare adm uuid; sid uuid := gen_random_uuid(); lm boolean := public.stripe_livemode(); before_g numeric; before_v numeric; after_g numeric; after_v numeric; sc_before numeric; sc_after numeric; po uuid;
begin
  select u.id into adm from auth.users u join public.platform_admins p on p.user_id = u.id where 'commerce' = any(p.permissions) limit 1;
  if adm is null then raise exception 'exercise: no commerce admin'; end if;
  insert into auth.sessions(id, user_id, created_at, updated_at) values (sid, adm, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', sid)::text, true);
  select gross, vat into before_g, before_v from public.admin_vat_summary(current_date, current_date) where source = 'Promotion boosts';
  select gross into sc_before from public.admin_vat_summary(current_date, current_date) where source = 'Supplier commission';
  insert into public.payment_orders(kind, description, amount_minor, currency, platform_fee_minor, commission, strategy, protected, idempotency_key, livemode)
    values ('platform_boost', 'Q56 VAT exercise', 4000, 'GBP', 4000, '{}', 'platform', false, 'q56-vat-ex-' || gen_random_uuid(), lm) returning id into po;
  -- trg_payment_order_vat adds 20%: 4800 gross, 800 VAT. Paid, then a quarter (1200) refunded.
  update public.payment_orders set status = 'payment_pending' where id = po;
  update public.payment_orders set status = 'payment_succeeded' where id = po;
  update public.payment_orders set refunded_minor = 1200, status = 'partially_refunded' where id = po;
  select gross, vat into after_g, after_v from public.admin_vat_summary(current_date, current_date) where source = 'Promotion boosts';
  select gross into sc_after from public.admin_vat_summary(current_date, current_date) where source = 'Supplier commission';
  if coalesce(after_g, 0) - coalesce(before_g, 0) <> 36.00 then raise exception 'boost gross not reduced pro rata: %', coalesce(after_g, 0) - coalesce(before_g, 0); end if;
  if coalesce(after_v, 0) - coalesce(before_v, 0) <> 6.00 then raise exception 'boost VAT not reduced pro rata: %', coalesce(after_v, 0) - coalesce(before_v, 0); end if;
  if sc_after is distinct from sc_before then raise exception 'supplier commission line changed'; end if;
  raise exception 'EXERCISE_OK ads vat partial refunds';
end $$;
