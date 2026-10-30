-- Lane B (W02 P1): customer writes to build_items failed with "permission denied for function fixture_purge_active".
-- 4031 made the client guards of build_items, provider_jobs, ranking_models, map_rule_packs, event_order_versions, talent_riders,
-- talent_rider_items, safety_plans and consent_records call public.fixture_purge_active(). Those trigger functions are not
-- SECURITY DEFINER, so they run as the calling role, but 4022 granted EXECUTE on fixture_purge_active() to service_role only.
-- PL/pgSQL evaluates the call even for INSERTs, so every client insert/update/delete on those tables raised 42501
-- (e.g. Plan wizard "Create Event & Continue to Build" → "Could not add the recommendations.").
-- Additive and safe: fixture_purge_active() is SECURITY DEFINER with an empty search_path, takes no arguments and returns true
-- only when a fixture_purges row was created in the CURRENT transaction (txid-bound), which clients cannot create. It exposes
-- nothing; granting EXECUTE restores the guards' intended behaviour (bypass only inside an audited purge) for client roles.
grant execute on function public.fixture_purge_active() to authenticated, anon;
