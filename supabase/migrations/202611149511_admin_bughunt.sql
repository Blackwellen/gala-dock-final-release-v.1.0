-- Q51 admin bug hunt (lane bughunt-admin, 2026-11-14). Additive: create-or-replace of existing functions with the same signatures,
-- one new self-scoped read function, and column-level SELECT grants on public.reviews.
--
-- 1. reviews: reviewer ids and moderation fields were readable by ANY signed-in user through the table-wide SELECT grant
--    (anon already had a column list since 202611147621). This file adds what the narrower grant (202611149512) needs: the
--    reviewer's own rows, including user_id, come from my_reviews(); enforcement_actions_read stops referencing reviews.user_id
--    directly (a policy subquery is privilege-checked as the caller) and uses the definer helper review_is_mine().
-- 2. contact_profile: the workspace avatar used settings.brand.logo, a PRIVATE workspace-files storage path. It is used only
--    when it is already a public URL (https:// or a site path); otherwise the public cover image.
-- 3. moderate_review_response: also runs admin_mfa_required() (revoked admin sessions are refused, like every admin mutation).
-- 4. admin_rollback_setting: the reason was prefixed before admin_publish_setting checked its length, so an empty reason passed.
--    Permission and reason are now checked first.
-- 5. admin_unlink_case_record: wrote no audit_events row (every other case mutation does).
-- 6. admin_user_stats: "Verified" counted profiles.identity_verified while the directory, its Verified filter and the user
--    pages use verification_checks (user_identity_verified, Q59), so the tab count and the list disagreed.

-- 1. reviews: the readers the column grants need. The REVOKE itself is 202611149512 (applied only after the build that reads
--    own reviews through my_reviews() is deployed — the deployed account pages still filter reviews by user_id).
create or replace function public.my_reviews()
returns setof public.reviews
language sql stable security definer set search_path = ''
as $$
  select r.* from public.reviews r where r.user_id = (select auth.uid()) and (select auth.uid()) is not null;
$$;
revoke all on function public.my_reviews() from public, anon;
grant execute on function public.my_reviews() to authenticated;
comment on function public.my_reviews() is 'Q51: the signed-in reviewer''s own reviews (all columns). reviews.user_id is not column-granted to authenticated.';

create or replace function public.review_is_mine(p_review uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.reviews r where r.id = p_review and r.user_id = (select auth.uid()));
$$;
revoke all on function public.review_is_mine(uuid) from public, anon;
grant execute on function public.review_is_mine(uuid) to authenticated;

drop policy if exists enforcement_actions_read on public.enforcement_actions;
create policy enforcement_actions_read on public.enforcement_actions for select to authenticated using (
  ((workspace_id is not null) and (public.has_permission(workspace_id, 'settings.manage') or public.has_permission(workspace_id, 'listings.manage')))
  or ((subject_type = 'review') and public.review_is_mine(subject_id))
  or ((subject_type = 'user') and (subject_id = (select auth.uid())))
  or public.has_admin_permission('trust'));

-- 2. contact_profile: no private storage paths as avatars
create or replace function public.contact_profile(p_type text, p_id uuid, p_seat uuid default null::uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare r jsonb; saved boolean;
begin
  if (select auth.uid()) is null or p_type not in ('user','workspace') or not public.may_contact(p_type, p_id) then return null; end if;
  if p_seat is not null and not public.is_workspace_member(p_seat) then return null; end if;
  select exists (select 1 from public.saved_contacts s where s.target_type = p_type and s.target_id = p_id
    and ((p_seat is null and s.owner_user = (select auth.uid())) or s.owner_workspace = p_seat)) into saved;
  if p_type = 'user' then
    select jsonb_build_object('type', 'user', 'id', p.id, 'name', coalesce(nullif(p.full_name, ''), 'Member'), 'avatar', p.avatar_url, 'about', coalesce(p.bio, ''),
      'since', to_char(p.created_at, 'FMMonth YYYY'),
      'roles', coalesce((select jsonb_agg(distinct w.name) from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
        where m.user_id = p.id and m.status = 'active' and (public.is_workspace_member(w.id) or exists (select 1 from public.listings l where l.workspace_id = w.id and l.published))), '[]'))
      into r from public.profiles p where p.id = p_id;
  else
    -- Q51: settings.brand.logo is a private workspace-files path (onboarding brand step); only a public URL may be shown.
    select jsonb_build_object('type', 'workspace', 'id', w.id, 'name', w.name, 'kind', w.kind,
      'avatar', case when coalesce(w.settings #>> '{brand,logo}', '') ~ '^(https://|/[^/])' then w.settings #>> '{brand,logo}' else nullif(w.cover_image, '') end,
      'cover', w.cover_image, 'about', coalesce(w.settings #>> '{profile,about}', w.settings ->> 'description', ''), 'location', coalesce(w.settings ->> 'location', ''),
      'verified', w.verification_status = 'verified', 'since', to_char(w.created_at, 'FMMonth YYYY'),
      'listings', coalesce((select jsonb_agg(x) from (select l.id, l.name, l.kind, l.slug from public.listings l where l.workspace_id = w.id and l.published order by l.created_at limit 6) x), '[]'),
      'events', coalesce((select jsonb_agg(x) from (select e.id, e.name, e.slug, e.starts_at from public.events e where e.workspace_id = w.id and e.visibility = 'public'
        and e.status in ('published','on_sale','live') and e.starts_at > now() order by e.starts_at limit 4) x), '[]'))
      into r from public.workspaces w where w.id = p_id;
  end if;
  return r || jsonb_build_object('saved', saved);
end $function$;

-- 3. moderate_review_response: admin session/aal2 gate first
create or replace function public.moderate_review_response(p_review uuid, p_hide boolean, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r public.reviews; ws uuid;
begin
  perform public.admin_mfa_required();
  if not (public.has_admin_permission('trust') or public.has_admin_permission('marketplace')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into r from public.reviews where id = p_review for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_hide and r.provider_response is null then raise exception 'no_reply' using errcode = '22023'; end if;
  ws := public.listing_workspace(r.listing_id);
  -- Hidden text leaves the publicly readable row; the admin audit keeps it as evidence.
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', ws,
    case when p_hide then 'review.response_hidden' else 'review.response_allowed' end,
    jsonb_build_object('review_id', r.id, 'reason', left(btrim(p_reason), 500)) || case when p_hide then jsonb_build_object('hidden_text', r.provider_response) else '{}'::jsonb end);
  update public.reviews set
    provider_response = case when p_hide then null else provider_response end,
    response_status = case when p_hide then 'hidden' else null end,
    response_moderation_reason = left(btrim(p_reason), 500), response_moderated_by = auth.uid(), response_moderated_at = now(), updated_at = now()
  where id = r.id;
  if ws is not null then
    perform public.notify_workspace(ws, array['owner','manager'], 'review_reply_moderated',
      case when p_hide then 'Your reply to a review was removed' else 'You can reply to the review again' end, left(btrim(p_reason), 600), '/provider/reviews');
  end if;
end $function$;

-- 4. admin_rollback_setting: permission + reason before the prefix
create or replace function public.admin_rollback_setting(p_section text, p_version integer, p_reason text)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare val jsonb;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not public.has_admin_permission('settings') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;   -- Q51: was satisfied by the 'Rollback to vN: ' prefix
  select value into val from public.platform_settings where section = p_section and version = p_version;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return public.admin_publish_setting(p_section, val, 'Rollback to v' || p_version || ': ' || btrim(p_reason));
end $function$;

-- 5. admin_unlink_case_record: audited like the link
create or replace function public.admin_unlink_case_record(p_link uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare l public.support_case_links; c public.support_cases;
begin
  select * into l from public.support_case_links where id = p_link;
  if not found then
    perform public.admin_mfa_required();
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  c := public.support_case_for_admin(l.case_id);
  delete from public.support_case_links where id = p_link;
  insert into public.support_case_events(case_id, kind, from_value, actor_id, actor_type, detail) values (l.case_id, 'unlinked', l.record_type, auth.uid(), 'admin', jsonb_build_object('record_id', l.record_id));
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'admin', c.workspace_id, 'support.case_unlinked', jsonb_build_object('case_id', l.case_id, 'record_type', l.record_type, 'record_id', l.record_id));
end $function$;

-- 6. admin_user_stats: verified from verification checks (same rule as user_identity_verified)
create or replace function public.admin_user_stats()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not (public.has_admin_permission('users') or public.has_admin_permission('support')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'total', (select count(*) from auth.users),
    'total_prev', (select count(*) from auth.users where created_at < now() - interval '30 days'),
    'verified', (select count(*) from auth.users u where u.id in (
        select c.user_id from public.verification_checks c where c.status = 'verified' and (c.expires_at is null or c.expires_at > now()) and c.user_id is not null
        union
        select w.owner_id from public.verification_checks c join public.workspaces w on w.id = c.workspace_id
          where c.subject_type = 'workspace' and c.status = 'verified' and (c.expires_at is null or c.expires_at > now()))),
    'restricted', (select count(*) from public.profiles where status = 'restricted'),
    'with_events', (select count(distinct owner_id) from public.events),
    'with_tickets', (select count(distinct holder_id) from public.tickets where holder_id is not null),
    'signups_by_day', (select coalesce(jsonb_agg(n order by d), '[]') from (select date_trunc('day', created_at) d, count(*) n from auth.users where created_at > now() - interval '30 days' group by 1) s));
end $function$;
