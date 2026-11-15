-- Q75 public-report exercise (rolled back): a report without an account lands in content_reports + one Trust & Safety case,
-- a repeat from the same IP hash is refused, anon/authenticated cannot call the function, deciding it doesn't fail on the null
-- reporter, and tax_details_request / payout_paused are mandatory payments emails. Ends with EXERCISE_OK.
do $$
declare l public.listings; rid uuid; c public.content_reports; h text := encode(sha256(random()::text::bytea), 'hex'); adm uuid; ok boolean;
begin
  select x.* into l from public.listings x where x.published and not public.trust_listing_held(x.id) limit 1;
  if l.id is null then raise exception 'exercise: no published listing'; end if;
  rid := public.report_content_public('listing', l.id, 'scam_or_payment_diversion', 'asked me to pay by bank transfer', 'Someone@Example.org', h);
  select * into c from public.content_reports where id = rid;
  if c.reporter_id is not null or c.reporter_email <> 'someone@example.org' or c.case_id is null or c.priority <> 'high' then raise exception 'public report row wrong: %', row_to_json(c); end if;
  begin
    perform public.report_content_public('listing', l.id, 'spam', '', null, h);
    raise exception 'repeat from the same IP accepted';
  exception when others then if sqlerrm <> 'already_reported' then raise; end if; end;
  begin
    perform public.report_content_public('listing', l.id, 'other_policy', 'x', null, encode(sha256('other'::bytea), 'hex'));
    raise exception 'other_policy without a note accepted';
  exception when others then if sqlerrm <> 'note_required' then raise; end if; end;
  if has_function_privilege('anon', 'public.report_content_public(text,uuid,text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.report_content_public(text,uuid,text,text,text,text)', 'execute') then
    raise exception 'report_content_public is client-callable';
  end if;
  -- deciding: the outcome notification skips the anonymous reporter instead of failing on notifications.user_id
  select user_id into adm from public.platform_admins where 'trust' = any(permissions) limit 1;
  if adm is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    begin
      perform public.admin_decide_content_report(rid, 'dismissed', 'Q75 exercise decision', false);
    exception when others then
      if sqlerrm ~ 'user_id' then raise; end if;   -- MFA/session gates may refuse in a raw SQL context; a NOT NULL failure must not happen
    end;
  end if;
  select (c2.mandatory and c2.category = 'payments') into ok from public.email_category('tax_details_request') c2;
  if not ok then raise exception 'tax_details_request is not a mandatory payments email'; end if;
  select (c2.mandatory and c2.category = 'payments') into ok from public.email_category('payout_paused') c2;
  if not ok then raise exception 'payout_paused is not a mandatory payments email'; end if;
  raise exception 'EXERCISE_OK Q75 public reports';
end $$;
