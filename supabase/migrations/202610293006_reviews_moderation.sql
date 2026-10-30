-- Q08 (lane C) — Reviews eligibility, review reports, moderation/enforcement with reason codes, evidence, appeal path and audit
-- (domains 121–122). Additive; existing RPC signatures are kept (submit_review, moderate_review, respond_to_review).
--   • submit_review: only the event owner, only for a completed booking (completed/fulfilled/completion_pending, or a legacy
--     confirmed booking whose event has ended), one review per booking (unique build_item_id), never by the provider's own team.
--   • report_review: one report per user per review, reason code required, opens a Fraud/Abuse trust case. Reports never
--     auto-hide a review (no opaque automatic punishment) — Trust & Safety decides.
--   • trust_enforce / trust_lift_enforcement: Trust & Safety actions on workspaces, listings, reviews and content with reason code +
--     note + evidence, optional end date, appeal deadline (14 days when the reason is appealable), audit + outbox + notice.
--   • trust_appeal / trust_decide_appeal: the affected party appeals once; overturning reverses the effect.

-- ═══ 1. Review reports ═══
create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason_code text not null references public.moderation_reason_codes(code),
  note text not null default '' check (length(note) <= 1000),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  case_id uuid references public.trust_cases(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);
create index if not exists review_reports_review_idx on public.review_reports(review_id, status);
alter table public.review_reports enable row level security;
revoke all on public.review_reports from anon, authenticated;
grant select on public.review_reports to authenticated;
drop policy if exists review_reports_read on public.review_reports;
create policy review_reports_read on public.review_reports for select to authenticated using (reporter_id = (select auth.uid()) or public.has_admin_permission('trust'));

create or replace function public.report_review(p_review uuid, p_reason_code text, p_note text default '') returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare r public.reviews; rid uuid; cid uuid; n integer; ws uuid; lname text;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into r from public.reviews where id = p_review;
  if not found or not (r.status = 'published' or (r.listing_id is not null and public.is_listing_provider(r.listing_id))) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.user_id = auth.uid() then raise exception 'cannot_report_own_review' using errcode = '22023'; end if;
  if not exists (select 1 from public.moderation_reason_codes c where c.code = p_reason_code and c.active and 'review' = any(c.applies_to)) then raise exception 'invalid_reason_code' using errcode = '22023'; end if;
  if not public.hit_rate_limit('review_report:' || auth.uid(), 20, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into public.review_reports(review_id, reporter_id, reason_code, note) values (p_review, auth.uid(), p_reason_code, left(coalesce(trim(p_note), ''), 1000))
    on conflict (review_id, reporter_id) do nothing returning id into rid;
  if rid is null then raise exception 'already_reported' using errcode = '23505'; end if;
  ws := public.listing_workspace(r.listing_id);
  select name into lname from public.listings where id = r.listing_id;
  -- One open Fraud/Abuse case per review collects every report.
  select id into cid from public.trust_cases where subject_type = 'review' and subject_id = p_review and status in ('open','in_review') limit 1;
  if cid is null then
    select coalesce(max(substring(reference from '^TS-(\d+)$')::int), 8600) + 1 into n from public.trust_cases where reference ~ '^TS-\d+$';
    insert into public.trust_cases(reference, queue, category, subject_type, subject_id, subject_name, risk_score, status, reason, evidence, related)
      values ('TS-' || n, 'fraud', 'Review report', 'review', p_review, left('Review of ' || coalesce(lname, 'a listing'), 160), 30, 'open',
        (select label from public.moderation_reason_codes where code = p_reason_code),
        jsonb_build_array(jsonb_build_object('kind', 'report', 'label', 'Reported: ' || p_reason_code, 'at', now())),
        jsonb_build_object('review_id', p_review, 'listing_id', r.listing_id, 'workspace_id', ws))
      returning id into cid;
  else
    update public.trust_cases set evidence = evidence || jsonb_build_array(jsonb_build_object('kind', 'report', 'label', 'Reported: ' || p_reason_code, 'at', now())),
      risk_score = least(100, risk_score + 10), updated_at = now() where id = cid;
  end if;
  update public.review_reports set case_id = cid where id = rid;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', ws, 'review.reported',
    jsonb_build_object('review_id', p_review, 'report_id', rid, 'reason_code', p_reason_code, 'case_id', cid));
  return rid;
end $$;

-- ═══ 2. Review eligibility (signature unchanged) ═══
create or replace function public.submit_review(p_item uuid, p_rating int, p_ratings jsonb, p_body text, p_photos text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.build_items; e public.events; r public.reviews; rid uuid; l public.listings;
begin
  select * into b from public.build_items where id = p_item;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into e from public.events where id = b.event_id;
  if e.owner_id is distinct from auth.uid() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if b.status not in ('completed','fulfilled','completion_pending','confirmed','active') then raise exception 'not_completed' using errcode = '22023'; end if;
  if coalesce(e.ends_at, e.starts_at) is null or coalesce(e.ends_at, e.starts_at) > now() then raise exception 'event_not_ended' using errcode = '22023'; end if;
  select * into l from public.listings where id = b.listing_id;
  -- No reviews of your own business (owner or team member of the provider workspace).
  if l.id is not null and (exists (select 1 from public.workspaces w where w.id = l.workspace_id and w.owner_id = auth.uid())
      or exists (select 1 from public.workspace_members m where m.workspace_id = l.workspace_id and m.user_id = auth.uid() and m.status = 'active')) then
    raise exception 'self_review' using errcode = '42501';
  end if;
  if p_rating not between 1 and 5 then raise exception 'invalid_rating' using errcode = '22023'; end if;
  if p_ratings is not null and (jsonb_typeof(p_ratings) <> 'object' or exists (select 1 from jsonb_each(p_ratings) x where x.key not in ('quality','value','communication','reliability','professionalism','venue','food')
      or jsonb_typeof(x.value) <> 'number' or (x.value)::text::numeric not between 1 and 5)) then raise exception 'invalid_ratings' using errcode = '22023'; end if;
  if length(coalesce(p_body, '')) < 20 or length(p_body) > 1000 then raise exception 'invalid_body' using errcode = '22023'; end if;
  if coalesce(array_length(p_photos, 1), 0) > 5 or exists(select 1 from unnest(coalesce(p_photos, '{}')) ph where ph !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$')) then raise exception 'invalid_photos' using errcode = '22023'; end if;
  select * into r from public.reviews where build_item_id = b.id for update;
  if found then
    if r.user_id is distinct from auth.uid() then raise exception 'not_authorized' using errcode = '42501'; end if;
    if r.status = 'removed' then raise exception 'review_removed' using errcode = '22023'; end if;
    if r.created_at < now() - interval '30 days' then raise exception 'edit_window_closed' using errcode = '22023'; end if;
    update public.reviews set rating = p_rating, ratings = coalesce(p_ratings, '{}'), body = trim(p_body), photos = coalesce(p_photos, '{}'), updated_at = now() where id = r.id;
    if b.listing_id is not null and r.status = 'published' then
      update public.listings set rating = round(greatest(1, least(5, (rating * greatest(review_count, 1) - r.rating + p_rating) / greatest(review_count, 1)))::numeric, 2) where id = b.listing_id;
    end if;
    return r.id;
  end if;
  insert into public.reviews(user_id, build_item_id, listing_id, rating, ratings, body, status, photos)
    values (auth.uid(), b.id, b.listing_id, p_rating, coalesce(p_ratings, '{}'), trim(p_body), 'published', coalesce(p_photos, '{}')) returning id into rid;
  if b.listing_id is not null then
    update public.listings set rating = round(((rating * review_count + p_rating) / (review_count + 1))::numeric, 2), review_count = review_count + 1 where id = b.listing_id;
    insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), l.workspace_id, 'review.published', jsonb_build_object('review_id', rid, 'build_item_id', b.id, 'rating', p_rating));
  end if;
  return rid;
end $$;

-- Listing aggregate kept incremental (seeded aggregates are not recomputed from scratch).
create or replace function public.trust_review_aggregate(p_listing uuid, p_rating integer, p_delta integer) returns void
language sql volatile security definer set search_path = '' as $$
  update public.listings set
    rating = case when p_delta > 0 then round(((rating * review_count + p_rating) / (review_count + 1))::numeric, 2)
                  when review_count > 1 then round(((rating * review_count - p_rating) / (review_count - 1))::numeric, 2) else rating end,
    review_count = greatest(0, review_count + p_delta)
  where id = p_listing and p_listing is not null;
$$;

-- Moderation (signature unchanged): status vocabulary checked, aggregates kept in step, workspace audit (outbox).
create or replace function public.moderate_review(p_review uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reviews;
begin
  if not (public.has_admin_permission('trust') or public.has_admin_permission('marketplace')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_status not in ('published','pending','removed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select * into r from public.reviews where id = p_review for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status = p_status then return; end if;
  update public.reviews set status = p_status, moderation_reason = left(p_reason, 500), moderated_by = auth.uid(), moderated_at = now(), updated_at = now() where id = r.id;
  if r.status = 'published' then perform public.trust_review_aggregate(r.listing_id, r.rating, -1);
  elsif p_status = 'published' then perform public.trust_review_aggregate(r.listing_id, r.rating, 1); end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', public.listing_workspace(r.listing_id), 'review.moderated',
    jsonb_build_object('review_id', r.id, 'from', r.status, 'to', p_status, 'reason', left(p_reason, 500)));
end $$;

-- ═══ 3. Enforcement ═══
create sequence if not exists public.enforcement_action_ref_seq start 1001;

create or replace function public.trust_apply_effect(a public.enforcement_actions, p_on boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r public.reviews; l record;
begin
  if a.action = 'listing_hidden' or a.action = 'workspace_suspended' then
    if p_on then
      for l in select id, published, workspace_id from public.listings
               where (a.action = 'listing_hidden' and id = a.subject_id) or (a.action = 'workspace_suspended' and workspace_id = a.subject_id) loop
        insert into public.trust_listing_holds(listing_id, workspace_id, source, reason_code, detail, enforcement_action_id, was_published)
          values (l.id, l.workspace_id, 'enforcement', a.reason_code, left(a.note, 300), a.id, l.published) on conflict do nothing;
        if l.published then update public.listings set published = false where id = l.id; end if;
      end loop;
    else
      for l in update public.trust_listing_holds set released_at = now(), release_reason = 'enforcement_' || a.status
               where enforcement_action_id = a.id and released_at is null returning listing_id, was_published loop
        if l.was_published and not exists (select 1 from public.trust_listing_holds h where h.listing_id = l.listing_id and h.released_at is null) then
          update public.listings set published = true where id = l.listing_id and not published;
        end if;
      end loop;
    end if;
  elsif a.action in ('review_removed','review_hidden') then
    select * into r from public.reviews where id = a.subject_id for update;
    if found then
      if p_on and r.status <> 'removed' then
        update public.reviews set status = 'removed', moderation_reason = left(a.note, 500), moderated_by = a.decided_by, moderated_at = now(), updated_at = now() where id = r.id;
        if r.status = 'published' then perform public.trust_review_aggregate(r.listing_id, r.rating, -1); end if;
      elsif not p_on and r.status = 'removed' then
        update public.reviews set status = 'published', moderation_reason = null, updated_at = now() where id = r.id;
        perform public.trust_review_aggregate(r.listing_id, r.rating, 1);
      end if;
    end if;
  end if;
end $$;

create or replace function public.trust_enforce(p_subject_type text, p_subject_id uuid, p_action text, p_reason_code text, p_note text,
  p_evidence jsonb default '[]', p_ends_at timestamptz default null, p_case uuid default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare rc public.moderation_reason_codes; ws uuid; a public.enforcement_actions; author uuid;
begin
  perform public.admin_require('trust', p_note);
  if p_subject_type not in ('workspace','listing','review','user','event','message','media','template') then raise exception 'invalid_subject' using errcode = '22023'; end if;
  if p_action not in ('warning','listing_hidden','workspace_suspended','booking_block','review_removed','review_hidden','content_removed') then raise exception 'invalid_action' using errcode = '22023'; end if;
  if (p_action = 'listing_hidden' and p_subject_type <> 'listing') or (p_action in ('workspace_suspended','booking_block') and p_subject_type <> 'workspace')
     or (p_action in ('review_removed','review_hidden') and p_subject_type <> 'review') then raise exception 'action_subject_mismatch' using errcode = '22023'; end if;
  select * into rc from public.moderation_reason_codes where code = p_reason_code and active;
  if not found or not (p_subject_type = any(rc.applies_to) or (p_subject_type = 'workspace' and 'verification' = any(rc.applies_to))) then raise exception 'invalid_reason_code' using errcode = '22023'; end if;
  if p_evidence is not null and jsonb_typeof(p_evidence) <> 'array' then raise exception 'invalid_evidence' using errcode = '22023'; end if;
  if p_ends_at is not null and p_ends_at <= now() then raise exception 'invalid_end' using errcode = '22023'; end if;
  ws := case p_subject_type
    when 'workspace' then (select id from public.workspaces where id = p_subject_id)
    when 'listing' then (select workspace_id from public.listings where id = p_subject_id)
    when 'review' then (select public.listing_workspace(listing_id) from public.reviews where id = p_subject_id)
    when 'event' then (select workspace_id from public.events where id = p_subject_id)
    else null end;
  if p_subject_type in ('workspace','listing','review') and ws is null and not exists (select 1 from public.reviews where id = p_subject_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.enforcement_actions(reference, case_id, workspace_id, subject_type, subject_id, action, reason_code, note, evidence, ends_at, appealable, appeal_deadline, decided_by)
    values ('EA-' || nextval('public.enforcement_action_ref_seq'), p_case, ws, p_subject_type, p_subject_id, p_action, p_reason_code, trim(p_note), coalesce(p_evidence, '[]'),
      p_ends_at, rc.appealable, case when rc.appealable then now() + interval '14 days' end, auth.uid())
    returning * into a;
  perform public.trust_apply_effect(a, true);
  if p_case is not null then
    update public.trust_cases set status = 'actioned', decision = trim(p_note), decided_by = auth.uid(), decided_at = now(),
      related = related || jsonb_build_object('enforcement_action_id', a.id) where id = p_case;
    update public.review_reports set status = 'actioned' where case_id = p_case and status = 'open';
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', ws, 'trust.enforcement_applied',
    jsonb_build_object('action_id', a.id, 'reference', a.reference, 'subject_type', p_subject_type, 'subject_id', p_subject_id, 'action', p_action, 'reason_code', p_reason_code, 'appeal_deadline', a.appeal_deadline));
  -- Notice with reason and appeal path.
  if ws is not null and p_subject_type in ('workspace','listing') then
    perform public.trust_notify_workspace(ws, 'trust_enforcement', 'Gala Dock Trust & Safety action: ' || replace(p_action, '_', ' '),
      rc.label || case when rc.appealable then '. You can appeal within 14 days from Settings → Trust & credentials.' else '.' end, '/provider/settings#credentials', 'trust.enforcement:' || a.id);
  elsif p_subject_type = 'review' then
    select user_id into author from public.reviews where id = p_subject_id;
    if author is not null then perform public.notify(author, 'trust_enforcement', 'Your review was moderated', rc.label || case when rc.appealable then '. You can appeal within 14 days.' else '.' end,
      '/account/reviews', 'trust.enforcement:' || a.id || ':' || author); end if;
  end if;
  return a.id;
end $$;

create or replace function public.trust_lift_internal(p_action uuid, p_outcome text, p_reason text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare a public.enforcement_actions;
begin
  if p_outcome not in ('lifted','overturned') then raise exception 'invalid_outcome' using errcode = '22023'; end if;
  update public.enforcement_actions set status = p_outcome, lifted_by = auth.uid(), lifted_at = now(), lift_reason = left(p_reason, 500), updated_at = now()
    where id = p_action and status = 'active' returning * into a;
  if not found then raise exception 'not_active' using errcode = '22023'; end if;
  perform public.trust_apply_effect(a, false);
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', a.workspace_id, 'trust.enforcement_lifted',
    jsonb_build_object('action_id', a.id, 'outcome', p_outcome, 'reason', left(p_reason, 500)));
end $$;

create or replace function public.trust_lift_enforcement(p_action uuid, p_reason text, p_outcome text default 'lifted') returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.admin_require('trust', p_reason);
  perform public.trust_lift_internal(p_action, p_outcome, p_reason);
end $$;

-- The affected party appeals once, before the deadline. Opens an Appeals case; the action stays in force until decided.
create or replace function public.trust_appeal(p_action uuid, p_statement text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare a public.enforcement_actions; allowed boolean; cid uuid; n integer; sname text;
begin
  if length(trim(coalesce(p_statement, ''))) < 20 then raise exception 'statement_too_short' using errcode = '22023'; end if;
  select * into a from public.enforcement_actions where id = p_action for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  allowed := case a.subject_type
    when 'review' then exists (select 1 from public.reviews r where r.id = a.subject_id and r.user_id = auth.uid())
    when 'user' then a.subject_id = auth.uid()
    else a.workspace_id is not null and public.has_permission(a.workspace_id, 'settings.manage') end;
  if not coalesce(allowed, false) then raise exception 'not_found' using errcode = 'P0002'; end if;    -- no existence leak
  if a.status <> 'active' then raise exception 'not_active' using errcode = '22023'; end if;
  if not a.appealable then raise exception 'not_appealable' using errcode = '22023'; end if;
  if a.appeal_deadline is not null and a.appeal_deadline < now() then raise exception 'appeal_window_closed' using errcode = '22023'; end if;
  if a.appeal_case_id is not null then raise exception 'already_appealed' using errcode = '23505'; end if;
  sname := coalesce((select name from public.workspaces where id = a.workspace_id), 'Review author');
  select coalesce(max(substring(reference from '^TS-(\d+)$')::int), 8600) + 1 into n from public.trust_cases where reference ~ '^TS-\d+$';
  insert into public.trust_cases(reference, queue, category, subject_type, subject_id, subject_name, risk_score, status, reason, evidence, related)
    values ('TS-' || n, 'appeal', 'Appeal ' || a.reference, case when a.subject_type in ('workspace','listing','review','user','event') then a.subject_type else 'workspace' end,
      a.subject_id, left(sname, 160), 20, 'open', left(trim(p_statement), 2000),
      jsonb_build_array(jsonb_build_object('kind', 'appeal', 'label', 'Appeal statement received', 'at', now())),
      jsonb_build_object('enforcement_action_id', a.id, 'workspace_id', a.workspace_id))
    returning id into cid;
  update public.enforcement_actions set appeal_case_id = cid, updated_at = now() where id = a.id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', a.workspace_id, 'trust.appeal_opened',
    jsonb_build_object('action_id', a.id, 'case_id', cid));
  return cid;
end $$;

create or replace function public.trust_decide_appeal(p_case uuid, p_outcome text, p_reason text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare c public.trust_cases; a public.enforcement_actions; who uuid;
begin
  perform public.admin_require('trust', p_reason);
  if p_outcome not in ('upheld','overturned') then raise exception 'invalid_outcome' using errcode = '22023'; end if;
  select * into c from public.trust_cases where id = p_case and queue = 'appeal' for update;
  if not found or (c.related->>'enforcement_action_id') is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status in ('actioned','dismissed') then raise exception 'already_decided' using errcode = '22023'; end if;
  select * into a from public.enforcement_actions where id = (c.related->>'enforcement_action_id')::uuid;
  if p_outcome = 'overturned' and a.status = 'active' then perform public.trust_lift_internal(a.id, 'overturned', p_reason); end if;
  update public.trust_cases set status = case when p_outcome = 'overturned' then 'actioned' else 'dismissed' end, decision = p_outcome || ': ' || trim(p_reason),
    decided_by = auth.uid(), decided_at = now() where id = c.id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', a.workspace_id, 'admin.trust_appeal_decided',
    jsonb_build_object('case_id', c.id, 'action_id', a.id, 'outcome', p_outcome));
  if a.workspace_id is not null and a.subject_type in ('workspace','listing') then
    perform public.trust_notify_workspace(a.workspace_id, 'trust_appeal', 'Appeal ' || case when p_outcome = 'overturned' then 'upheld — action reversed' else 'reviewed — action stays' end,
      left(trim(p_reason), 300), '/provider/settings#credentials', 'trust.appeal:' || c.id);
  elsif a.subject_type = 'review' then
    select user_id into who from public.reviews where id = a.subject_id;
    if who is not null then perform public.notify(who, 'trust_appeal', 'Your appeal was reviewed', left(trim(p_reason), 300), '/account/reviews', 'trust.appeal:' || c.id || ':' || who); end if;
  end if;
end $$;

revoke all on function public.trust_review_aggregate(uuid, integer, integer), public.trust_apply_effect(public.enforcement_actions, boolean),
  public.trust_lift_internal(uuid, text, text) from public, anon, authenticated;
grant execute on function public.trust_review_aggregate(uuid, integer, integer), public.trust_apply_effect(public.enforcement_actions, boolean),
  public.trust_lift_internal(uuid, text, text) to service_role;
revoke all on function public.report_review(uuid, text, text), public.submit_review(uuid, int, jsonb, text, text[]), public.moderate_review(uuid, text, text),
  public.trust_enforce(text, uuid, text, text, text, jsonb, timestamptz, uuid), public.trust_lift_enforcement(uuid, text, text),
  public.trust_appeal(uuid, text), public.trust_decide_appeal(uuid, text, text) from public, anon;
grant execute on function public.report_review(uuid, text, text), public.submit_review(uuid, int, jsonb, text, text[]), public.moderate_review(uuid, text, text),
  public.trust_enforce(text, uuid, text, text, text, jsonb, timestamptz, uuid), public.trust_lift_enforcement(uuid, text, text),
  public.trust_appeal(uuid, text), public.trust_decide_appeal(uuid, text, text) to authenticated, service_role;
revoke all on sequence public.enforcement_action_ref_seq from anon, authenticated;
