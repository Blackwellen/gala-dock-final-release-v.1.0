-- Customer reviews (CU-012): only for fulfilled/confirmed bookings on the reviewer's own events after the event has ended.
-- One review per booking (unique build_item_id); editable for 30 days. Listing rating/count updated incrementally.
alter table public.reviews add column if not exists photos text[] not null default '{}';
alter table public.reviews add column if not exists updated_at timestamptz;

create or replace function public.submit_review(p_item uuid, p_rating int, p_ratings jsonb, p_body text, p_photos text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.build_items; e public.events; r public.reviews; rid uuid; l public.listings;
begin
  select * into b from public.build_items where id = p_item;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into e from public.events where id = b.event_id;
  if e.owner_id is distinct from auth.uid() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if b.status not in ('fulfilled','confirmed') then raise exception 'not_completed' using errcode = '22023'; end if;
  if coalesce(e.ends_at, e.starts_at) is null or coalesce(e.ends_at, e.starts_at) > now() then raise exception 'event_not_ended' using errcode = '22023'; end if;
  if p_rating not between 1 and 5 then raise exception 'invalid_rating' using errcode = '22023'; end if;
  if length(coalesce(p_body, '')) < 20 or length(p_body) > 1000 then raise exception 'invalid_body' using errcode = '22023'; end if;
  if coalesce(array_length(p_photos, 1), 0) > 5 or exists(select 1 from unnest(coalesce(p_photos, '{}')) ph where ph !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$')) then raise exception 'invalid_photos' using errcode = '22023'; end if;
  select * into r from public.reviews where build_item_id = b.id;
  if found then
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
    select * into l from public.listings where id = b.listing_id;
    insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), l.workspace_id, 'review.published', jsonb_build_object('review_id', rid, 'build_item_id', b.id, 'rating', p_rating));
  end if;
  return rid;
end $$;

create or replace function public.delete_my_review(p_review uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reviews;
begin
  select * into r from public.reviews where id = p_review and user_id = auth.uid() for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  if r.listing_id is not null and r.status = 'published' then
    update public.listings set rating = case when review_count > 1 then round(((rating * review_count - r.rating) / (review_count - 1))::numeric, 2) else rating end, review_count = greatest(0, review_count - 1) where id = r.listing_id;
  end if;
  delete from public.reviews where id = r.id;
end $$;
revoke all on function public.submit_review(uuid, int, jsonb, text, text[]) from public, anon;
revoke all on function public.delete_my_review(uuid) from public, anon;
grant execute on function public.submit_review(uuid, int, jsonb, text, text[]) to authenticated;
grant execute on function public.delete_my_review(uuid) to authenticated;
