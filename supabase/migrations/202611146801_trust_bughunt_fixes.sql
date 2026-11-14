-- Q59 trust bug hunt (lane bughunt-trust). Additive: CREATE OR REPLACE with unchanged signatures, one new helper, one new trigger.
--  1. A listing with an active Trust & Safety hold can never be published (helper trust_listing_held + BEFORE trigger), so every
--     surface that reads `published` (organiser marketplace, Discover, public pages, provider search, global search) hides it.
--  2. Time-boxed restrictions that run out now reverse their effect (holds released, listings republished, reviews restored) and the
--     provider is told; the daily job uses the London date.
--  3. Verifying a document needs an expiry date when the credential expires and a cover amount when a minimum cover applies;
--     the provider is notified of every verify/reject decision (the admin toast already claimed so).
--  4. Unknown cover never satisfies a minimum cover (was treated as sufficient).
--  5. Provider inserts can't set renewal/supersede/reminder bookkeeping columns.
--  6. A submitted identity/business check can be verified (submitted -> pending_review -> verified); the workspace is notified.
--  7. Listing "Verified" badge also honours country-specific required credentials (e.g. UK premises licence for venues).
--  8. listing_trust() reports insurance_verified (public liability reviewed, current, cover met) for public display.

-- 1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.trust_listing_held(p_listing uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trust_listing_holds h where h.listing_id = p_listing and h.released_at is null);
$$;
revoke all on function public.trust_listing_held(uuid) from public;
grant execute on function public.trust_listing_held(uuid) to anon, authenticated, service_role;

create or replace function public.listings_trust_hold_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.published and (tg_op = 'INSERT' or not coalesce(old.published, false)) and public.trust_listing_held(new.id) then
    new.published := false;
  end if;
  return new;
end $$;
revoke all on function public.listings_trust_hold_guard() from public;
grant execute on function public.listings_trust_hold_guard() to authenticated, service_role;
drop trigger if exists listings_trust_hold_guard on public.listings;
create trigger listings_trust_hold_guard before insert or update of published on public.listings
  for each row execute function public.listings_trust_hold_guard();

-- 2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.job_trust_expiry_daily(p_job public.job_queue)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare d record; c record; a public.enforcement_actions; pol public.trust_policy; expired_docs integer := 0; expired_checks integer := 0; reminders integer := 0; lifted integer := 0; label text; thr integer;
  today date := (now() at time zone 'Europe/London')::date;
begin
  select * into pol from public.trust_policy limit 1;
  -- 1. Lapsed documents (expiry dates are London calendar days).
  for d in update public.provider_documents set status = 'expired', expired_at = now()
           where status = 'verified' and expires_on < today returning id, workspace_id, credential_key, expires_on loop
    expired_docs := expired_docs + 1;
    select t.label into label from public.credential_types t where t.key = d.credential_key;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', d.workspace_id, 'trust.document_expired',
      jsonb_build_object('document_id', d.id, 'credential_key', d.credential_key, 'expires_on', d.expires_on));
    perform public.trust_notify_workspace(d.workspace_id, 'trust_document_expired', coalesce(label, 'A document') || ' has expired',
      public.trust_reason_text(coalesce(label, 'A document'), 'expired', d.expires_on, null), '/provider/settings#credentials', 'trust.expired:' || d.id);
  end loop;
  -- 2. Lapsed identity/business checks.
  for c in select id from public.verification_checks where status = 'verified' and expires_at is not null and expires_at < now() for update skip locked loop
    perform public.verification_step(c.id, 'expired', null, 'system', 'document_expired', 'Verification evidence passed its expiry date');
    expired_checks := expired_checks + 1;
  end loop;
  -- 3. Reminders (largest threshold first so a late first run sends one reminder, not four).
  for d in select x.id, x.workspace_id, x.credential_key, x.expires_on, x.last_reminder_days, (x.expires_on - today) as left_days
           from public.provider_documents x
           where x.status = 'verified' and x.expires_on is not null and x.expires_on >= today
             and (x.expires_on - today) <= (select max(v) from unnest(pol.reminder_days) v)
             and not exists (select 1 from public.provider_documents r where r.renewal_of = x.id and r.status in ('submitted','in_review','verified')) loop
    select min(v) into thr from unnest(pol.reminder_days) v where v >= d.left_days;
    if thr is null or (d.last_reminder_days is not null and d.last_reminder_days <= thr) then continue; end if;
    select t.label into label from public.credential_types t where t.key = d.credential_key;
    perform public.trust_notify_workspace(d.workspace_id, 'trust_document_expiring', coalesce(label, 'A document') || ' expires in ' || d.left_days || ' day' || case when d.left_days = 1 then '' else 's' end,
      'Upload the renewed document before ' || to_char(d.expires_on, 'FMDD Mon YYYY') || ' so your listings stay visible.', '/provider/settings#credentials',
      'trust.expiring:' || d.id || ':' || thr);
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', d.workspace_id, 'provider.document_expiring',
      jsonb_build_object('document_id', d.id, 'credential_key', d.credential_key, 'expires_on', d.expires_on, 'days_left', d.left_days, 'threshold', thr));
    update public.provider_documents set last_reminder_days = thr where id = d.id;
    reminders := reminders + 1;
  end loop;
  -- 4. Time-boxed enforcement that has run its course: end it AND reverse its effect (holds, unpublished listings, hidden reviews).
  for a in update public.enforcement_actions set status = 'expired', updated_at = now() where status = 'active' and ends_at is not null and ends_at <= now() returning * loop
    perform public.trust_apply_effect(a, false);
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', a.workspace_id, 'trust.enforcement_expired',
      jsonb_build_object('action_id', a.id, 'reference', a.reference, 'action', a.action));
    if a.workspace_id is not null and a.subject_type in ('workspace','listing') then
      perform public.trust_notify_workspace(a.workspace_id, 'trust_enforcement', 'Trust & Safety restriction ended: ' || replace(a.action, '_', ' '),
        'The time-limited restriction ' || coalesce(a.reference, '') || ' has ended.', '/provider/settings#credentials', 'trust.enforcement_end:' || a.id);
    end if;
    lifted := lifted + 1;
  end loop;
  return jsonb_build_object('expired_documents', expired_docs, 'expired_checks', expired_checks, 'reminders', reminders, 'enforcement_expired', lifted);
end $function$;

-- 3 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.trust_review_document(p_document uuid, p_status text, p_reason_code text, p_reason text, p_expires_on date DEFAULT NULL::date, p_cover_amount_minor bigint DEFAULT NULL::bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare d public.provider_documents; t public.credential_types; decision text; exp date; cover bigint; needs_cover boolean;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not public.has_admin_permission('trust') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_status not in ('in_review','verified','rejected') then raise exception 'invalid status' using errcode = '22023'; end if;
  if p_status = 'rejected' and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_reason_code is not null and not exists (select 1 from public.moderation_reason_codes c where c.code = p_reason_code) then raise exception 'invalid_reason_code' using errcode = '22023'; end if;
  if p_cover_amount_minor is not null and p_cover_amount_minor <= 0 then raise exception 'invalid_cover' using errcode = '22023'; end if;
  select * into d from public.provider_documents where id = p_document for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into t from public.credential_types where key = d.credential_key;
  if d.status in ('superseded','expired') and p_status <> 'rejected' then raise exception 'document_not_reviewable' using errcode = '22023'; end if;
  exp := coalesce(p_expires_on, d.expires_on); cover := coalesce(p_cover_amount_minor, d.cover_amount_minor);
  if p_status = 'verified' then
    decision := public.file_access_decision('workspace-files', d.file_path);
    if decision <> 'ok' then raise exception 'file_not_cleared: %', decision using errcode = '22023', hint = 'The file must pass the malware scan before it can be verified.'; end if;
    if exp is not null and exp < (now() at time zone 'Europe/London')::date then raise exception 'already_expired' using errcode = '22023'; end if;
    -- A credential that expires must carry its expiry date, or it would never lapse or send renewal reminders.
    if coalesce(t.expires, true) and exp is null then raise exception 'expiry_required' using errcode = '22023', hint = 'Enter the expiry date shown on the document.'; end if;
    -- Insurance with a minimum cover anywhere in the rules must carry its cover amount, or the minimum can't be checked.
    needs_cover := t.category = 'insurance' and exists (select 1 from public.credential_requirements r where r.credential_key = d.credential_key and r.min_cover_minor is not null);
    if needs_cover and cover is null then raise exception 'cover_required' using errcode = '22023', hint = 'Enter the cover amount shown on the certificate.'; end if;
  end if;
  update public.provider_documents set status = p_status, review_reason_code = p_reason_code,
    rejection_reason = case when p_status = 'rejected' then left(p_reason, 500) end,
    expires_on = exp, cover_amount_minor = cover,
    cover_currency = case when p_cover_amount_minor is not null then coalesce(cover_currency, 'GBP') else cover_currency end,
    last_reminder_days = case when p_expires_on is not null and p_expires_on is distinct from d.expires_on then null else last_reminder_days end,
    reviewed_by = auth.uid(), reviewed_at = now() where id = p_document;
  if p_status = 'verified' then
    update public.provider_documents o set status = 'superseded', superseded_by = d.id
      where o.workspace_id = d.workspace_id and o.credential_key = d.credential_key and o.id <> d.id and o.status in ('verified','expired');
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, actor_type, metadata)
    values (auth.uid(), d.workspace_id, 'trust.document_reviewed', 'admin', jsonb_build_object('document_id', d.id, 'credential_key', d.credential_key, 'status', p_status, 'reason_code', p_reason_code));
  if p_status in ('verified','rejected') then
    perform public.trust_notify_workspace(d.workspace_id, 'trust_document_reviewed',
      coalesce(t.label, 'Your document') || case when p_status = 'verified' then ' verified' else ' was not accepted' end,
      case when p_status = 'verified' then 'Gala Dock reviewed and verified it' || coalesce(' (valid to ' || to_char(exp, 'FMDD Mon YYYY') || ')', '') || '.'
           else 'Reason: ' || left(trim(p_reason), 400) || ' Upload a valid document in Settings → Trust & credentials.' end,
      '/provider/settings#credentials', 'trust.reviewed:' || d.id || ':' || p_status);
  end if;
  return jsonb_build_object('document_id', d.id, 'status', p_status, 'eligibility', public.trust_eligibility_internal(d.workspace_id, null));
end $function$;

-- 4 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.trust_credential_eval(p_workspace uuid, p_key text, p_min_cover bigint)
 returns table(status text, expires_on date, pending_renewal boolean, lapsed boolean, current_document uuid, cover_amount_minor bigint)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare cur public.provider_documents; latest public.provider_documents; lapsed_doc public.provider_documents;
begin
  select * into cur from public.provider_documents d where d.workspace_id = p_workspace and d.credential_key = p_key and d.status = 'verified'
    and (d.expires_on is null or d.expires_on >= current_date) order by d.created_at desc limit 1;
  select * into latest from public.provider_documents d where d.workspace_id = p_workspace and d.credential_key = p_key and d.status <> 'superseded' order by d.created_at desc limit 1;
  if cur.id is not null then
    -- Unknown cover never meets a minimum (Q59): only a recorded amount at or above the minimum counts.
    if p_min_cover is not null and coalesce(cur.cover_amount_minor, 0) < p_min_cover then
      return query select 'insufficient_cover'::text, cur.expires_on, coalesce(latest.id is distinct from cur.id and latest.status in ('submitted','in_review'), false), true, cur.id, cur.cover_amount_minor; return;
    end if;
    return query select 'verified'::text, cur.expires_on, coalesce(latest.id is distinct from cur.id and latest.status in ('submitted','in_review'), false), false, cur.id, cur.cover_amount_minor; return;
  end if;
  select * into lapsed_doc from public.provider_documents d where d.workspace_id = p_workspace and d.credential_key = p_key
    and (d.status = 'expired' or (d.status = 'verified' and d.expires_on < current_date)) order by d.created_at desc limit 1;
  if lapsed_doc.id is not null then
    return query select 'expired'::text, lapsed_doc.expires_on, coalesce(latest.status in ('submitted','in_review'), false), true, null::uuid, lapsed_doc.cover_amount_minor; return;
  end if;
  if latest.id is not null then
    return query select latest.status, latest.expires_on, false, false, null::uuid, latest.cover_amount_minor; return;
  end if;
  return query select 'missing'::text, null::date, false, false, null::uuid, null::bigint;
end $function$;

-- 5 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.provider_documents_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare actor uuid := auth.uid(); cur uuid;
begin
  if tg_op = 'INSERT' then
    if actor is not null then
      if new.uploaded_by is distinct from actor then raise exception 'uploader_mismatch' using errcode = '42501'; end if;
      if not exists (select 1 from public.verified_private_uploads v where v.path = new.file_path and v.owner_id = actor) then
        raise exception 'upload_not_verified' using errcode = '42501';
      end if;
      new.status := 'submitted'; new.reviewed_by := null; new.reviewed_at := null; new.rejection_reason := null;
      -- Q59: review bookkeeping is the platform's, never the submitter's.
      new.renewal_of := null; new.superseded_by := null; new.expired_at := null; new.last_reminder_days := null; new.review_reason_code := null;
      new.verification_method := 'manual_review';
    end if;
    if new.cover_amount_minor is not null and new.cover_currency is null then new.cover_currency := 'GBP'; end if;
    select d.id into cur from public.provider_documents d where d.workspace_id = new.workspace_id and d.credential_key = new.credential_key and d.status = 'verified' order by d.created_at desc limit 1;
    new.renewal_of := coalesce(new.renewal_of, cur);
    update public.storage_attribution set file_class = 'sensitive' where bucket = 'workspace-files' and name = new.file_path and file_class <> 'sensitive';
    return new;
  end if;
  new.updated_at := now();
  return new;
end $function$;

-- 6 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.trust_review_verification(p_check uuid, p_to text, p_reason_code text, p_reason text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare c public.verification_checks; r jsonb;
begin
  perform public.admin_require('trust', p_reason);
  if p_to not in ('pending_review','verified','action_required','rejected','suspended') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select * into c from public.verification_checks where id = p_check for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.kind = 'stripe_connect' then raise exception 'stripe_managed' using errcode = '22023'; end if;   -- Stripe is authoritative for its own check
  if p_to = 'verified' and p_expires_at is not null and p_expires_at <= now() then raise exception 'already_expired' using errcode = '22023'; end if;
  -- The machine has no submitted -> verified/suspended edge: a reviewer's decision passes through pending_review (Q59).
  if c.status = 'submitted' and p_to in ('verified','suspended') then
    perform public.verification_step(c.id, 'pending_review', auth.uid(), 'admin', p_reason_code, p_reason);
  end if;
  r := public.verification_step(c.id, p_to, auth.uid(), 'admin', p_reason_code, p_reason);
  if p_to = 'verified' then update public.verification_checks set expires_at = p_expires_at where id = c.id; end if;
  if c.workspace_id is not null and p_to in ('verified','action_required','rejected','suspended') then
    perform public.trust_notify_workspace(c.workspace_id, 'trust_verification_reviewed',
      initcap(c.kind) || ' verification ' || case p_to when 'verified' then 'approved' when 'action_required' then 'needs more information' when 'rejected' then 'was not approved' else 'suspended' end,
      case when p_to = 'verified' then 'Gala Dock verified your ' || c.kind || ' details.' else 'Reason: ' || left(trim(p_reason), 400) end,
      '/provider/settings#credentials', 'trust.verification:' || c.id || ':' || p_to || ':' || extract(epoch from now())::bigint);
  end if;
  return r;
end $function$;

-- 7 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.trust_listing_badge_calc(p_workspace uuid, p_listing uuid, p_kind text, p_category text, p_review_status text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(p_review_status, '') = 'approved'
    and public.trust_identity_verified(p_workspace)
    and not exists (select 1 from public.trust_active_enforcement(p_workspace, p_listing))
    and not exists (select 1 from public.trust_listing_rules(p_kind, p_category) x
                    cross join lateral public.trust_credential_eval(p_workspace, x.credential_key, x.min_cover_minor) e
                    where x.requirement = 'required' and e.status <> 'verified')
    -- Q59: country-specific required credentials for this kind/category (e.g. a UK venue's premises licence) count too.
    and not exists (select 1 from public.trust_workspace_rules(p_workspace) w
                    join public.credential_requirements r on r.credential_key = w.credential_key and r.country is not null and r.requirement = 'required'
                      and (r.capability is null or r.capability = p_kind)
                      and (r.category is null or lower(r.category) = lower(coalesce(p_category, '')) or lower(coalesce(p_category, '')) = any(r.category_aliases))
                    cross join lateral public.trust_credential_eval(p_workspace, w.credential_key, w.min_cover_minor) e
                    where w.requirement = 'required' and e.status <> 'verified');
$function$;

-- 8 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.listing_trust(p_listing uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare l public.listings; e jsonb; insider boolean; pl_min bigint; insured boolean;
begin
  select * into l from public.listings where id = p_listing;
  if not found or not (l.published or public.is_workspace_member(l.workspace_id) or public.has_admin_permission('trust')) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insider := public.is_workspace_member(l.workspace_id) or public.has_admin_permission('trust');
  e := public.trust_eligibility_internal(l.workspace_id, l.id);
  -- Public liability reviewed by Gala Dock, in date, and (where a minimum applies to this listing) at or above it.
  select x.min_cover_minor into pl_min from public.trust_listing_rules(l.kind, l.category) x where x.credential_key = 'public_liability';
  select ev.status = 'verified' into insured from public.trust_credential_eval(l.workspace_id, 'public_liability', pl_min) ev;
  return jsonb_build_object('listing_id', l.id, 'badge', public.trust_listing_badge_calc(l.workspace_id, l.id, l.kind, l.category, l.review_status),
      'identity_verified', e->'identity_verified', 'insurance_verified', coalesce(insured, false), 'computed_at', e->'computed_at')
    || case when insider then jsonb_build_object('can_publish', e->'can_publish', 'can_accept', e->'can_accept', 'blockers', e->'blockers',
         'holds', coalesce((select jsonb_agg(jsonb_build_object('source', h.source, 'reason_code', h.reason_code, 'detail', h.detail, 'held_at', h.held_at))
                            from public.trust_listing_holds h where h.listing_id = l.id and h.released_at is null), '[]')) else '{}'::jsonb end;
end $function$;
