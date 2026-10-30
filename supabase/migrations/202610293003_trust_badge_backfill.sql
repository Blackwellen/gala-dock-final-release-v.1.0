-- Q08 (lane C) — One-time recompute of the derived trust caches (listings.verified, workspaces.verification_status) from current
-- evidence, using trust_refresh_workspace() from 202610293002. Before this, both were hand-set/seeded booleans; afterwards they
-- equal the computed source (trust_listing_badge_calc / trust_workspace_status_calc) and the guards keep them that way.
-- Expected effect on the shared project (measured in the dry run): no listing keeps "Verified" because no provider has verified,
-- current compliance evidence; workspaces with a verified Stripe Connect mirror become verified. Q38 seeds real demo evidence.
-- Audit: one system audit row with the before/after counts.
do $$
declare w record; lv_before integer; lv_after integer; wv_before integer; wv_after integer;
begin
  select count(*) filter (where verified) into lv_before from public.listings;
  select count(*) filter (where verification_status = 'verified') into wv_before from public.workspaces;
  for w in select id from public.workspaces loop perform public.trust_refresh_workspace(w.id); end loop;
  select count(*) filter (where verified) into lv_after from public.listings;
  select count(*) filter (where verification_status = 'verified') into wv_after from public.workspaces;
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'trust.badges_recomputed',
    jsonb_build_object('listings_verified_before', lv_before, 'listings_verified_after', lv_after, 'workspaces_verified_before', wv_before, 'workspaces_verified_after', wv_after));
end $$;
