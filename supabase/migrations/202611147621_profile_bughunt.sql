-- Q62 profile builders bug hunt (lane bughunt-profiles), incl. the Q49 add-on "provider review replies".
--  1. Review replies: respond_to_review existed (§94) but nothing called it, it accepted replies to unpublished/removed reviews, silently
--     cut replies over 2,000 characters, overwrote the first-reply time on every edit and told nobody. Now: one reply per review
--     (the provider's first reply, then edits of that same reply), published reviews only, length checked, rate limited, audited
--     (first reply vs edit), the reviewer is notified once on the first reply. Moderation: trust/marketplace admins can hide a reply
--     (text removed from the public row; kept in the admin audit) and later allow a new one; the workspace is told why.
--     New reviews notify the provider's owners/managers so they can reply (in-app; no email category).
--  2. listing_trust() was executable by signed-in users only, so anonymous visitors (most of a listing's audience) never saw the
--     trust-calculated "Verified" or "Insurance verified" badges the trust lane built for public display. Non-insiders only receive
--     the public fields (badge, identity_verified, insurance_verified), so anon may call it.
--  3. public_organizer_profile() (public_organizer(p_event) is the event page's card): the organiser profile showed none of what the organiser edits in Settings (description, website, brand
--     colour). Same visibility rule as public_workspace (only workspaces with public events, not suspended, demo rule honoured);
--     contact email/phone are never returned (no public opt-in exists).

alter table public.reviews
  add column if not exists response_status text check (response_status is null or response_status in ('published', 'hidden')),
  add column if not exists response_updated_at timestamptz,
  add column if not exists response_moderation_reason text check (response_moderation_reason is null or length(response_moderation_reason) <= 500),
  add column if not exists response_moderated_by uuid references auth.users(id),
  add column if not exists response_moderated_at timestamptz;
-- anon reads reviews through column grants: the public page needs the reply state, never the moderation fields.
grant select (response_status, response_updated_at) on public.reviews to anon;

create or replace function public.respond_to_review(p_review uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reviews; ws uuid; v_body text := btrim(coalesce(p_body, '')); lname text; first boolean;
begin
  select * into r from public.reviews where id = p_review for update;
  if not found or r.listing_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  ws := public.listing_workspace(r.listing_id);
  perform public.require_provider_role(ws, array['owner','manager']);
  if r.status <> 'published' then raise exception 'review_not_published' using errcode = '22023'; end if;
  if r.response_status = 'hidden' then raise exception 'reply_hidden' using errcode = '22023'; end if;
  if length(v_body) < 2 then raise exception 'empty' using errcode = '22023'; end if;
  if length(v_body) > 2000 then raise exception 'reply_too_long' using errcode = '22023'; end if;
  if r.provider_response is not distinct from v_body then return; end if;   -- unchanged edit: nothing to record
  if not public.hit_rate_limit('review_reply:' || auth.uid(), 30, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  first := r.provider_response is null;
  update public.reviews set provider_response = v_body, responded_at = coalesce(responded_at, now()), response_updated_at = now(),
    response_status = 'published', updated_at = now() where id = r.id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', ws, case when first then 'review.responded' else 'review.response_edited' end, jsonb_build_object('review_id', r.id));
  if first and r.user_id is not null then
    select name into lname from public.listings where id = r.listing_id;
    perform public.notify(r.user_id, 'review_reply', left(coalesce(lname, 'The provider') || ' replied to your review', 200),
      left(v_body, 300), '/account/reviews?tab=submitted', 'review_reply:' || r.id);
  end if;
end $$;

create or replace function public.moderate_review_response(p_review uuid, p_hide boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reviews; ws uuid;
begin
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
end $$;

create or replace function public.trg_review_notify_provider() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ws uuid; lname text;
begin
  if new.listing_id is null or new.status <> 'published' then return new; end if;
  select workspace_id, name into ws, lname from public.listings where id = new.listing_id;
  if ws is not null then
    perform public.notify_workspace(ws, array['owner','manager'], 'review_new', left('New ' || new.rating || '-star review of ' || coalesce(lname, 'your listing'), 140),
      'Read it and reply from Reviews.', '/provider/reviews');
  end if;
  return new;
exception when others then return new;   -- a notification must never block a review
end $$;
drop trigger if exists trg_review_notify_provider on public.reviews;
create trigger trg_review_notify_provider after insert on public.reviews for each row execute function public.trg_review_notify_provider();

revoke all on function public.respond_to_review(uuid, text), public.moderate_review_response(uuid, boolean, text) from public, anon;
grant execute on function public.respond_to_review(uuid, text), public.moderate_review_response(uuid, boolean, text) to authenticated, service_role;
revoke all on function public.trg_review_notify_provider() from public, anon, authenticated;

-- 2
grant execute on function public.listing_trust(uuid) to anon;

-- 3
create or replace function public.public_organizer_profile(p_workspace uuid)
returns table(id uuid, name text, cover_image text, verified boolean, created_at timestamptz, events_count bigint, upcoming bigint,
  description text, website text, brand_color text)
language sql stable security definer set search_path = '' as $$
  select w.id, w.name, w.cover_image, w.verification_status = 'verified', w.created_at,
    count(e.id) filter (where e.status in ('published','on_sale','live','completed')),
    count(e.id) filter (where e.status in ('published','on_sale','live') and e.starts_at > now()),
    nullif(left(btrim(coalesce(w.settings ->> 'description', '')), 600), ''),
    case when btrim(coalesce(w.settings ->> 'website', '')) ~* '^(https?://)?([a-z0-9-]+\.)+[a-z]{2,}(/[^\s<>"'']*)?$' then btrim(w.settings ->> 'website') end,
    public.workspace_brand_color(w.id)
  from public.workspaces w join public.events e on e.workspace_id = w.id and e.visibility = 'public'
  where w.id = p_workspace and w.status <> 'suspended' and not public.demo_hidden_for_viewer(w.id)
  group by w.id;
$$;
revoke all on function public.public_organizer_profile(uuid) from public;
grant execute on function public.public_organizer_profile(uuid) to anon, authenticated, service_role;
