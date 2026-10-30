# Q44 cross-workspace journeys — API/RPC level (lane C) — 2026-10-29

Spec: `tests/release/q44-cross-workspace.spec.ts` — 14/14 (no browser, no Stripe API, no AI, no email). Browser journeys: lanes A/B/D.
Fixtures: disposable p1-* users, `is_test_fixture` workspaces; payments via `payment_order_succeeded` / `checkout_order_direct_paid`; webhooks to 127.0.0.1 only.

| Journey | Steps asserted | Result |
|---|---|---|
| J1 Booking | suggested → sent → quoted; venue-first holds (supplier depends on venue) → held; deposit paid → confirmed, quote accepted, 2 provider jobs deposit_paid, 2 balanced ledger transactions, `payment.succeeded` audit, `booking_confirmed` notifications; BEO sent → approved; en_route → checked_in; jobs active → completed (`booking.*` audit); review; release scan; payout eligible only with a verified connected account | 5/5 |
| J2/J3 Ticketing + promoter | tiers, zone, 6-seat published map; `event_transition` gates (programme, tickets) → published → on_sale, audit, no override; anon hold, seat race, service-only quote; direct-charge paid (mismatch refused), balanced ledger, tickets issued; promoter commission → `promoter_payable` −800 balanced, replay 0; transfer (single use), resale (resold + nonce rotated), door scan admitted / duplicate / transferred, hybrid join (ticket unchanged, virtual check-in); refund → refunded, credential rotated, promoter reversal (net −400); reissue (admitted ticket refused, old nonce invalid, in-app notification, outbox) | 4/4 |
| J4 Compliance publish | blocked `[ops_rule_xq_permit]` (command and direct write) → licence submitted → granted → no blockers → published + public, audited | 1/1 |
| J5 Agent mission | FakeModel only (no network); approval_required → owner approves → executes once (idempotent replay, tampered args refused) → waiting_external → venue responds → queued → resumed (responded) → completed; tool-call + audit trail; in-app message to venue | 2/2 |
| J6 Privacy | DSAR export (1 guest record; others 0); legal hold → `erase_user_data` "legal_hold"; release → erasure scrubs guest data; audit | 1/1 |
| J7 API key + webhook | key owner-only; delivery fan-out tenant-scoped with allow-listed payload; signed HMAC delivery to 127.0.0.1 verified; finish; secret hidden from members; tenant B sees nothing | 1/1 |
| Cross-tenant | denial asserted at every hand-off above (RLS empty rows / not_authorized / service-only) | in each |

Limits: the webhook table requires https, so the local delivery uses HTTP to the registered loopback host (TLS not exercised); the booking request uses `transition_build_item` (the `customer_save_booking` server action is UI-only); delivery completion uses the worker's effect (build_items fulfilled). J1/J2 leave ledger-bearing fixture workspaces (ledger immutable); their events are private.
