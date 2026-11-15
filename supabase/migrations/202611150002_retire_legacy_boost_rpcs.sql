-- Q75 (Q56 note): retire the legacy anonymous boost RPCs. PENDING — apply only AFTER the build in which nothing calls them is deployed.
-- The deployed build's /discover still calls active_boosts and /api/boosts/[id]/click still calls record_boost_event (docs/marketplace/
-- advertising.md "still used by the deployed page"); the working tree serves sponsored slots through serve_ad_slots / record_ad_view /
-- record_ad_click only, and /api/boosts/[id]/click is now a plain same-site redirect that records nothing.
-- Callers checked 2026-11-14: src/ has no call to either function. Tests that still call them: tests/release/boost-delivery.spec.ts
-- (tests 1–2) and tests/marketplace/ad-inventory.spec.ts (the "legacy anon counter" lines) — remove those assertions in the same change.
-- Allowlists: remove "active_boosts" and "record_boost_event" from ANON_DEFINER_ALLOWLIST in tests/release/tenant-security.spec.ts and
-- regenerate artifacts/security/q45-authz-sweep*.json (they become non-callable for anon/authenticated).
-- Apply: copy to supabase/migrations/<next free version>_retire_legacy_boost_rpcs.sql → migrate.mjs lint → dry-run → review (waive
-- "revoke": intended narrowing, no deployed caller) → apply → verify → db:parity.
-- Rollback: grant execute on function public.active_boosts(text, text, text, integer), public.record_boost_event(uuid, text) to anon, authenticated;
revoke execute on function public.active_boosts(text, text, text, integer) from anon, authenticated, public;
revoke execute on function public.record_boost_event(uuid, text) from anon, authenticated, public;
grant execute on function public.active_boosts(text, text, text, integer), public.record_boost_event(uuid, text) to service_role;
