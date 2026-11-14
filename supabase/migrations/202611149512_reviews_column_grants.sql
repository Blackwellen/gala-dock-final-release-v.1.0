-- Q51 (lane bughunt-admin): reviews.user_id, moderation_reason, moderated_by and response_moderated_by were readable by ANY
-- signed-in user through the table-wide SELECT grant. authenticated now gets the same safe column list as anon (202611147621)
-- plus response_moderation_reason (the provider reads why their own reply was removed).
-- The reviewer's own rows (with user_id) come from my_reviews() and enforcement_actions_read uses review_is_mine() (202611149511).
-- APPLY ORDER: only after the build whose account pages read own reviews through my_reviews() is deployed. The previous build
-- filters reviews by user_id as the signed-in user and would get "permission denied" on /account and /account/reviews.
-- Rollback: grant select on public.reviews to authenticated;
revoke select on public.reviews from authenticated;
grant select (id, build_item_id, listing_id, rating, ratings, body, status, created_at, photos, updated_at, provider_response, responded_at,
  moderated_at, response_status, response_updated_at, response_moderation_reason) on public.reviews to authenticated;
