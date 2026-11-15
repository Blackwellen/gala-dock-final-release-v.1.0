-- Q76 i18n phase 2, part 4 (lane i18n-phase2): listing_timezone() becomes SECURITY INVOKER. Additive (same signature and grants).
-- 202611147653 made it a definer readable by `authenticated`, so the Q45 sweep flagged it: an outsider could read the zone of any
-- listing, including unpublished ones. As an invoker it reads listings under the caller's RLS (published listings, or the caller's
-- own): listing_availability_local (invoker) keeps working for every listing the caller can see, and public_listing_availability
-- (definer) still resolves every zone because it runs as the owner. Unknown / invisible listings fall back to Europe/London.
-- Rollback: re-run the 202611147653 definition (security definer); nothing else depends on the attribute.
create or replace function public.listing_timezone(p_listing uuid) returns text
language sql stable security invoker set search_path = '' as $$
  select coalesce((select l.timezone from public.listings l where l.id = p_listing and public.fmt_safe_tz(l.timezone) = l.timezone), 'Europe/London')
$$;
revoke all on function public.listing_timezone(uuid) from public, anon;
grant execute on function public.listing_timezone(uuid) to authenticated;
