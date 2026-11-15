-- Dry-run exercise for 202611147401 (always rolled back by migrate.mjs). Ends with EXERCISE_OK.
--  1. Sanctions list + helpers; workspace country, listing publish and partner application refused; admin override lets them through.
--  2. Fee VAT treatment: UK → uk_vat; France + business → reverse_charge; France non-trader → uk_vat.
--  3. Platform reporting: validation errors, masked status, due-diligence steps (initial → 2 reminders → hold after 60 days),
--     hold pauses payouts (dec107_payouts_paused), saving details lifts it.
--  4. report_content: report once, duplicate refused, own content refused; the moderation queue shows it to a trust admin (aal2).
--  5. Insurance minimums: Security / AV & Production / Marquees £2m; others £1m.
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to public;

do $$
declare adm uuid; sid text; usr uuid; ws uuid; ws2 uuid; lst uuid; ca text; cu text; j jsonb; rid uuid; ok boolean;
begin
  select u.id into adm from auth.users u join public.platform_admins p on p.user_id = u.id where u.email = 'admin.demo@example.com' and 'trust' = any(p.permissions) and 'commerce' = any(p.permissions);
  select s.id::text into sid from auth.sessions s where s.user_id = adm and (s.not_after is null or s.not_after > now()) order by s.created_at desc limit 1;
  if adm is null or sid is null then raise exception 'exercise: demo admin or live session missing'; end if;
  ca := json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', sid)::text;
  -- The only accounts with live sessions are demo accounts (exempt from DEC-107 seller gates); switch the exemption off inside this
  -- rolled-back transaction so the exercise workspace behaves like a real seller.
  update public.dec107_settings set exempt_demo_qa = false where id;

  -- 1. Sanctions ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  if not public.is_sanctioned_jurisdiction('RU') or not public.is_sanctioned_jurisdiction('kp') then raise exception 'RU/KP not sanctioned'; end if;
  if not public.is_sanctioned_jurisdiction('UA', '43') or not public.is_sanctioned_jurisdiction('UA', 'UA-43') then raise exception 'Crimea region not sanctioned'; end if;
  if public.is_sanctioned_jurisdiction('UA') or public.is_sanctioned_jurisdiction('GB') or public.is_sanctioned_jurisdiction(null) then raise exception 'false positive'; end if;
  if public.resolve_country_code('Russia') <> 'RU' or public.resolve_country_code('United Kingdom') <> 'GB' then raise exception 'resolve_country_code'; end if;

  insert into public.workspaces(owner_id, kind, name, settings, onboarding_step, capabilities, onboarding_complete, status)
    values (adm, 'provider', 'Q74 exercise supplier', jsonb_build_object('business', jsonb_build_object('country', 'United Kingdom')), 'trust', array['service'], true, 'active') returning id into ws;
  begin
    update public.workspaces set settings = jsonb_build_object('business', jsonb_build_object('country', 'Russia')) where id = ws;
    raise exception 'X_SANCTION_WS';
  exception when sqlstate '22023' then null; end;
  begin
    insert into public.workspaces(owner_id, kind, name, settings, onboarding_step, capabilities)
      values (adm, 'provider', 'Q74 sanctioned', jsonb_build_object('business', jsonb_build_object('country', 'IR')), 'business', array['service']);
    raise exception 'X_SANCTION_WS_INSERT';
  exception when sqlstate '22023' then null; end;
  insert into public.sanctions_overrides(subject_type, subject_id, reason, granted_by) values ('workspace', ws, 'exercise override for testing', adm);
  update public.workspaces set settings = jsonb_build_object('business', jsonb_build_object('country', 'Russia')) where id = ws;
  if public.workspace_sanctioned(ws) then raise exception 'override ignored'; end if;
  insert into public.listings(workspace_id, name, kind, description, location, details, published) values (ws, 'Q74 listing', 'service', 'x', 'London', '{}', false) returning id into lst;
  update public.sanctions_overrides set revoked_at = now() where subject_id = ws;
  if not public.workspace_sanctioned(ws) then raise exception 'workspace_sanctioned false after revoke'; end if;
  begin update public.listings set published = true where id = lst; raise exception 'X_SANCTION_LISTING'; exception when sqlstate '22023' then null; end;
  begin
    insert into public.partner_applications(user_id, email, contact_name, business_name, business_type, country, audience, vat_registered, terms_version, self_billing_accepted, status)
      values (adm, 'x@example.com', 'X Y', 'Q74 Ltd', 'company', 'KP', '', false, 'x', true, 'pending');
    raise exception 'X_SANCTION_PARTNER';
  exception when sqlstate '22023' then null; end;
  insert into _ex values ('sanctions', 'country/region list, workspace, listing publish, partner apply refused; override honoured');

  -- 2. Fee VAT treatment ───────────────────────────────────────────────────────────────────────────────────────────────────
  update public.workspaces set settings = jsonb_build_object('business', jsonb_build_object('country', 'United Kingdom')) where id = ws;
  if public.fee_vat_treatment(ws) <> 'uk_vat' or public.fee_vat_treatment(null) <> 'uk_vat' then raise exception 'uk_vat expected'; end if;
  update public.workspaces set settings = jsonb_build_object('business', jsonb_build_object('country', 'France')) where id = ws;
  if public.fee_vat_treatment(ws) <> 'uk_vat' then raise exception 'non-trader abroad should stay uk_vat'; end if;
  insert into public.seller_trader_declarations(workspace_id, status, business_form, version, declared_by)
    values (ws, 'business', 'company', (select trader_declaration_version from public.dec107_settings where id), adm);
  if public.fee_vat_treatment(ws) <> 'reverse_charge' then raise exception 'reverse_charge expected for FR business'; end if;
  update public.workspaces set settings = jsonb_build_object('business', jsonb_build_object('country', 'United Kingdom')) where id = ws;
  insert into _ex values ('vat', 'GB uk_vat, FR non-trader uk_vat, FR business reverse_charge');

  -- 3. Platform reporting ──────────────────────────────────────────────────────────────────────────────────────────────────
  if not public.platform_reporting_required(ws) then raise exception 'provider should be reportable'; end if;
  insert into public.connect_accounts(workspace_id, stripe_account_id, livemode) values (ws, 'acct_q74exercise', public.stripe_livemode()) on conflict do nothing;
  update public.workspaces set stripe_account_id = 'acct_q74exercise' where id = ws;
  j := public.platform_reporting_due_diligence(now() - interval '61 days');                        -- initial request
  if not exists (select 1 from public.seller_tax_requests where workspace_id = ws and step = 0) then raise exception 'initial request missing'; end if;
  perform public.platform_reporting_due_diligence(now() - interval '61 days');
  if (select count(*) from public.seller_tax_requests where workspace_id = ws) <> 1 then raise exception 'request repeated'; end if;
  perform public.platform_reporting_due_diligence(now() - interval '40 days');                     -- reminder 1 (day 21)
  perform public.platform_reporting_due_diligence(now() - interval '20 days');                     -- reminder 2 (day 41)
  if (select count(*) from public.seller_tax_requests where workspace_id = ws) <> 3 then raise exception 'reminders % ', (select count(*) from public.seller_tax_requests where workspace_id = ws); end if;
  if public.dec107_payouts_paused(ws) then raise exception 'held before 60 days'; end if;
  perform public.platform_reporting_due_diligence(now());                                          -- day 61 → hold
  if not public.dec107_payouts_paused(ws) then raise exception 'tax-reporting hold missing'; end if;

  perform set_config('request.jwt.claims', ca, true); perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  begin perform public.seller_tax_profile_save(ws, '{"seller_type":"individual","legal_name":"Ann Seller","date_of_birth":"2015-01-01","tin":"AB123456C","country":"GB","address_line1":"1 High St","city":"London","confirmed_accurate":true}');
    raise exception 'X_DOB'; exception when sqlstate '22023' then null; end;
  begin perform public.seller_tax_profile_save(ws, '{"seller_type":"individual","legal_name":"Ann Seller","date_of_birth":"1990-01-01","tin":"12345","country":"GB","address_line1":"1 High St","city":"London","confirmed_accurate":true}');
    raise exception 'X_TIN'; exception when sqlstate '22023' then null; end;
  begin perform public.seller_tax_profile_save(ws, '{"seller_type":"entity","legal_name":"Ann Ltd","tin_not_issued":true,"country":"GB","address_line1":"1 High St","city":"London","confirmed_accurate":true}');
    raise exception 'X_COMPANY'; exception when sqlstate '22023' then null; end;
  j := public.seller_tax_profile_save(ws, '{"seller_type":"individual","legal_name":"Ann Seller","date_of_birth":"1990-01-01","tin":"ab 12 34 56 c","country":"GB","address_line1":"1 High St","city":"London","postal_code":"e1 6an","vat_number":"GB123456789","confirmed_accurate":true}');
  reset role;
  if (j->>'complete')::boolean is not true or j->>'tin_masked' <> '••••••56C' or (j->>'hold')::boolean then raise exception 'status after save %', j; end if;
  if public.dec107_payouts_paused(ws) then raise exception 'hold not lifted by save'; end if;
  if public.fee_vat_treatment(ws) <> 'uk_vat' then raise exception 'GB seller with VAT number must stay uk_vat'; end if;
  insert into _ex values ('porr', 'initial + 2 reminders, hold at day 61, validation, masked status, save lifts hold');

  -- 4. Reports ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  select l.id into lst from public.listings l where l.published and not exists (select 1 from public.workspace_members m where m.workspace_id = l.workspace_id and m.user_id = adm)
    and not exists (select 1 from public.workspaces w where w.id = l.workspace_id and w.owner_id = adm) limit 1;
  perform set_config('request.jwt.claims', ca, true); perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  if lst is not null then
    rid := public.report_content('listing', lst, 'misleading_listing', 'exercise');
    begin perform public.report_content('listing', lst, 'spam', ''); raise exception 'X_DUP'; exception when sqlstate '23505' then null; end;
    j := public.admin_moderation_queue('open', 50);
    if not exists (select 1 from jsonb_array_elements(j) q where q->>'subject_id' = lst::text and q->>'source' = 'content') then raise exception 'report missing from queue'; end if;
    perform public.admin_decide_content_report(rid, 'dismissed', 'exercise dismissal', false);
  end if;
  begin perform public.report_content('listing', gen_random_uuid(), 'spam', ''); raise exception 'X_NOT_FOUND'; exception when sqlstate 'P0002' then null; end;
  begin perform public.report_content('nonsense', gen_random_uuid(), 'spam', ''); raise exception 'X_SUBJECT'; exception when sqlstate '22023' then null; end;
  reset role;
  insert into _ex values ('reports', coalesce('listing ' || lst::text, 'no foreign listing') || ': report, duplicate refused, queue, decide');

  -- 5. Insurance ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (select min_cover_minor from public.trust_listing_rules('service', 'Security') where credential_key = 'public_liability') <> 200000000 then raise exception 'security £2m'; end if;
  if (select min_cover_minor from public.trust_listing_rules('service', 'Production > Staging') where credential_key = 'public_liability') <> 200000000 then raise exception 'staging £2m'; end if;
  if (select min_cover_minor from public.trust_listing_rules('service', 'Marquees') where credential_key = 'public_liability') <> 200000000 then raise exception 'marquees £2m'; end if;
  if (select min_cover_minor from public.trust_listing_rules('service', 'Catering') where credential_key = 'public_liability') <> 100000000 then raise exception 'catering £1m'; end if;
  if (select min_cover_minor from public.trust_listing_rules('venue', null) where credential_key = 'public_liability') <> 100000000 then raise exception 'venue £1m'; end if;
  insert into _ex values ('insurance', '£2m higher-risk, £1m standard');

  raise exception 'EXERCISE_OK %', (select string_agg(k || ': ' || v, ' | ') from _ex);
end $$;
