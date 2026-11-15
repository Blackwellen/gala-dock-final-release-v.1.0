-- Dry-run exercise for 202611150101 (always rolled back by migrate.mjs). Ends with EXERCISE_OK.
--  1. Before publication: nothing published, nothing pending, no notice.
--  2. legal_publish_pack: 26 versions with dates (consumer now, business London midnight + 16 days), DEC-107 express versions follow,
--     one notice + one legal email per real account (demo/QA excluded), sign-up backfill; refuses a second run and a changed text.
--  3. Organiser (demo fixture opted in): pending items per role, consumer docs required now, business docs after the notice period,
--     express ticks enforced, stale version refused, acceptance recorded with version (+ DEC-107 seller/dispute ticks), append-only.
--  4. Demo identity without the opt-in is exempt; sign-up trigger records the customer documents; version helpers follow the pack.
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to public;

do $$
declare org uuid; cust uuid; j jsonb; r jsonb; n integer; biz timestamptz; nb integer; ob integer; man jsonb; items jsonb; ok boolean; nu uuid;
begin
  -- 1 ─────────────────────────────────────────────────────────────────────────────────────────────
  if exists (select 1 from public.legal_current_versions()) then raise exception 'published before publish'; end if;
  select u.id into org from auth.users u where u.email = 'alex.events@example.com';
  select u.id into cust from auth.users u where u.email like '%@example.com' and not exists (select 1 from public.workspaces w where w.owner_id = u.id)
    and not exists (select 1 from public.partners p where p.user_id = u.id) and not exists (select 1 from public.promoters p where p.user_id = u.id) limit 1;
  if org is null or cust is null then raise exception 'exercise: demo organiser or customer missing'; end if;
  if not exists (select 1 from public.workspaces w where w.owner_id = org and w.kind = 'organizer') then raise exception 'exercise: demo organiser owns no organizer workspace'; end if;
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"legal_gate":"on"}' where id = org;
  if public.legal_pending(org) <> '[]'::jsonb then raise exception 'pending before publish'; end if;
  insert into _ex values ('before', 'nothing published or pending');

  -- 2 ─────────────────────────────────────────────────────────────────────────────────────────────
  select jsonb_build_object('pack', '2026-11-v3', 'documents', jsonb_agg(jsonb_build_object('slug', d.slug,
      'version', case d.slug when 'terms' then 'gd-tos-3.0' when 'payment-terms' then 'gd-pt-1.1' when 'disputes-policy' then 'gd-dr-1.1' when 'partner-terms' then 'gd-ptn-3.0' else 'ex-' || d.slug || '-3.0' end,
      'label', '3.0', 'previous', '2026-10', 'sha256', encode(sha256(convert_to(d.slug, 'UTF8')), 'hex'))))
    into man from public.legal_documents d;
  select count(*) into nb from public.notifications where kind = 'legal_terms_update';
  select count(*) into ob from public.email_outbox where category = 'legal';
  r := public.legal_publish_pack('2026-11-v3', man, 'exercise');
  if (r ->> 'documents_published')::int <> 26 or (select count(*) from public.legal_document_versions) <> 26 then raise exception 'versions %', r; end if;
  biz := (r ->> 'business_effective_at')::timestamptz;
  if biz <> ((date_trunc('day', now() at time zone 'Europe/London') + interval '16 days') at time zone 'Europe/London') then raise exception 'business date %', biz; end if;
  if (select effective_at from public.legal_document_versions where slug = 'privacy') <> now() or (select business_effective_at from public.legal_document_versions where slug = 'privacy') <> now() then raise exception 'consumer dates'; end if;
  if (select effective_at from public.legal_document_versions where slug = 'organiser-terms') <> biz then raise exception 'business doc dates'; end if;
  if (select effective_at from public.legal_document_versions where slug = 'terms') <> now() or (select business_effective_at from public.legal_document_versions where slug = 'terms') <> biz then raise exception 'all-audience dates'; end if;
  if (select payment_terms_version from public.dec107_settings where id) <> 'gd-pt-1.1' or (select dispute_rules_version from public.dec107_settings where id) <> 'gd-dr-1.1' then raise exception 'dec107 versions'; end if;
  n := (r -> 'notices' ->> 'total')::int;
  if n <> (select count(*) from public.legal_notice_audience()) then raise exception 'notice count %', r; end if;
  if (select count(*) from public.notifications where kind = 'legal_terms_update') - nb <> n then raise exception 'notifications'; end if;
  if (select count(*) from public.email_outbox where category = 'legal') - ob <> n then raise exception 'legal emails queued % of %', (select count(*) from public.email_outbox where category = 'legal') - ob, n; end if;
  if exists (select 1 from public.notifications nn join auth.users u on u.id = nn.user_id where nn.kind = 'legal_terms_update' and public.analytics_user_is_demo(u.id)) then raise exception 'demo user notified'; end if;
  insert into _ex values ('publish', format('26 versions; business from %s; notices %s', to_char(biz at time zone 'Europe/London', 'YYYY-MM-DD'), r -> 'notices'));
  begin perform public.legal_publish_pack('2026-11-v3', man, 'exercise'); raise exception 'X_TWICE'; exception when sqlstate '55000' then null; end;
  begin
    perform public.legal_publish_pack('2026-11-v4', jsonb_set(man, '{documents,0,sha256}', to_jsonb(repeat('a', 64))), 'exercise');
    raise exception 'X_CHANGED_TEXT';
  exception when sqlstate '55000' then null; end;
  if public.partner_terms_version() <> 'gd-ptn-3.0' or public.legal_terms_version() <> 'gd-tos-3.0' then raise exception 'version helpers'; end if;
  insert into _ex values ('refusals', 'second run and changed text under an existing version refused');

  -- 3 ─────────────────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', org, 'role', 'authenticated')::text, true);
  j := public.legal_pending_for_me();
  if not exists (select 1 from jsonb_array_elements(j) x where x ->> 'slug' = 'organiser-terms' and x ->> 'role' = 'organiser' and not (x ->> 'required')::boolean and x -> 'express' ? 'cancellation_fees') then raise exception 'organiser terms item %', j; end if;
  if not exists (select 1 from jsonb_array_elements(j) x where x ->> 'slug' = 'customer-terms' and (x ->> 'required')::boolean) then raise exception 'consumer doc required now'; end if;
  if not exists (select 1 from jsonb_array_elements(j) x where x ->> 'slug' = 'disputes-policy' and x ->> 'role' = 'organiser' and x -> 'express' ? 'dispute_deadline_rules') then raise exception 'disputes business role'; end if;
  if exists (select 1 from jsonb_array_elements(j) x where x ->> 'slug' in ('privacy', 'cookies', 'supplier-terms', 'partner-terms')) then raise exception 'notice-only or other-role doc pending'; end if;
  select jsonb_agg(jsonb_build_object('slug', x ->> 'slug', 'version', x ->> 'version', 'express', x -> 'express')) into items from jsonb_array_elements(j) x;
  begin perform public.legal_accept(jsonb_build_array(jsonb_build_object('slug', 'organiser-terms', 'version', 'ex-organiser-terms-3.0', 'express', '[]'::jsonb))); raise exception 'X_EXPRESS';
  exception when sqlstate '22023' then null; end;
  begin perform public.legal_accept(jsonb_build_array(jsonb_build_object('slug', 'terms', 'version', '2026-10'))); raise exception 'X_STALE';
  exception when sqlstate '22023' then null; end;
  n := public.legal_accept(items);
  if n <> jsonb_array_length(j) then raise exception 'accepted % of %', n, jsonb_array_length(j); end if;
  if public.legal_pending_for_me() <> '[]'::jsonb then raise exception 'still pending after accept'; end if;
  if not exists (select 1 from public.legal_acceptances where user_id = org and slug = 'organiser-terms' and version = 'ex-organiser-terms-3.0' and express = 'cancellation_fees' and role = 'organiser') then raise exception 'express row'; end if;
  if not public.payment_terms_accepted('seller') then raise exception 'payment terms tick not shared with payout set-up'; end if;
  if not exists (select 1 from public.consent_records where user_id = org and purpose = 'dispute_rules' and policy_version = 'gd-dr-1.1') then raise exception 'dispute rules tick'; end if;
  begin update public.legal_acceptances set version = 'x' where user_id = org; raise exception 'X_APPEND_ONLY'; exception when sqlstate '55000' then null; end;
  begin update public.legal_document_versions set label = 'x' where slug = 'terms'; raise exception 'X_IMMUTABLE'; exception when sqlstate '55000' then null; end;
  insert into _ex values ('accept', format('%s documents accepted with express ticks; DEC-107 ticks shared; append-only', n));

  -- 4 ─────────────────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  if public.legal_pending_for_me() <> '[]'::jsonb then raise exception 'demo identity not exempt'; end if;
  if jsonb_array_length(public.legal_pending(cust, true)) <> 9 then raise exception 'customer documents % (expected 9)', jsonb_array_length(public.legal_pending(cust, true)); end if;
  nu := gen_random_uuid();
  insert into auth.users(instance_id, id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', nu, 'authenticated', 'authenticated', 'p1-legal-ex-' || left(replace(nu::text, '-', ''), 8) || '@gala-dock.test',
            '{"full_name":"Legal exercise","terms_version":"gd-tos-3.0"}', '{}', now(), now());
  if not exists (select 1 from public.profiles where id = nu) then
    insert into public.profiles(id, full_name, terms_version, terms_accepted_at) values (nu, 'Legal exercise', 'gd-tos-3.0', now());
  end if;
  select count(*) into n from public.legal_acceptances where user_id = nu and source = 'signup';
  if n <> 9 then raise exception 'sign-up acceptances %', n; end if;
  if jsonb_array_length(public.legal_pending(nu, true)) <> 0 then raise exception 'new sign-up still pending'; end if;
  insert into _ex values ('signup', '9 customer documents recorded at sign-up; nothing pending');
  j := public.legal_notice_counts();
  insert into _ex values ('audience', j::text);

  raise exception 'EXERCISE_OK %', (select string_agg(k || ': ' || v, ' | ') from _ex);
end $$;
