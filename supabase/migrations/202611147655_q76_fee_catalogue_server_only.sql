-- Q76 i18n phase 2, part 5 (lane i18n-phase2): ref_fee_catalogue is server-only. 202611147651 created it anon/authenticated-readable;
-- the Q45 sweep (public tables) flagged it. Nothing in the browser reads it: fees are priced by definer functions
-- (fee_fixed_minor_in, checkout_quote, create_payment_order) and the display copy is src/lib/i18n/money.ts FEE_CATALOGUE (checked
-- against the seed in tests/release/q76-i18n-phase2.spec.ts). The table is one day old and has no client callers, so this
-- narrowing breaks nothing (review note for the lint `revoke` warning).
-- Rollback: grant select on public.ref_fee_catalogue to anon, authenticated (the read policy is kept).
revoke select on public.ref_fee_catalogue from anon, authenticated;
