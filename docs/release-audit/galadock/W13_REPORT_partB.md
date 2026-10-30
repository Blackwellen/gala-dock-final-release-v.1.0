# W13 part B: Every-control audit (customer + public)

**Run:** 2026-10-29 · Agent B (Opus) · disposable identities (`tests/phase1/helpers.ts`; cleanup hides public fixtures). Specs: new `tests/e2e/public/w13-public-controls.spec.ts` (4), `tests/e2e/customer/w13-customer-controls.spec.ts` (1) plus the existing customer suite, ticket-credentials, search, help, promotion-media — **40 passed, 1 skipped, 0 failed** (Stripe Checkout spec excluded by rule).

## Public controls
Event Save (signed out → login; signed in → `saved_items` row + toast, unsave removes); Follow organiser / city (`follows` rows, toggle removes); directory search, date windows, category strip, empty state; Register (correct refusal); RSVP bad token (uniform 404); tier + Buy up to payment (correct refusal "Online ticket sales for this event aren't open yet" — seller Stripe setup, Q07; no card submitted); cookie banner (`gd_consent` no → yes, referral value kept, httpOnly; signed-in `consent_records` row); `/api/consent` cross-site 403, malformed 400.

## Customer controls (92 from the W02 census)
Asserted 76 (including ~55 save-heart instances), remaining 9, excluded 7.
- Save/remove hearts, mark task done, plan wizard end to end, build add/remove (spec self-skips on current data), booking request without charging + owner-only refusal, add guest, send message, marketing switch, reviews (2), tickets transfer / guarded resale / attendee edit / unrelated user refused, support contact.
- **Discard draft — P2 bug found and fixed:** reported success while deleting 0 rows (customers have no DELETE on events); now archives the draft (permitted transition), hides it from My Events and Home, checks the result (`src/lib/actions/plan-wizard.ts`, `src/app/(customer)/home/page.tsx`).
- Remaining: ticket-setup step controls, create tier, guest export, reviews add photos, cancel resale (needs a paid order).
- Excluded by rule: add payment method (Stripe-hosted), deposit/resale payment, send invites (real email).

## Findings
1. P2 fixed: discard draft.
2. P3: event page offers Buy while checkout refuses (seller not ready, Q07).
3. P3: referral pages overwrite `gd_consent`, erasing the analytics choice.
4. `build-canvas` spec self-skips on current data.

## Follow-up (2026-10-29, lane B)
- Seller not ready → ticket card shows "Join the waitlist" / "Tickets on sale soon", no Buy (`seller-readiness-ticket-card` 1/1); checkout keeps its refusal.
- `gd_consent` writers (`/api/consent`, `/r/[code]/consent`, `/ref/[code]`) merge, never overwrite (`consent-cookie` 3/3).
- Asserted browser-free: reviews Add photos → `/api/uploads` (Q04) with a generated PNG: 200 + `storage_attribution`; refusals 401 / 415 / 422 (`w13-review-photo-upload` 1/1).
- Written, waiting for a browser slot (`tests/e2e/customer/w13-remaining.spec.ts`): ticket-setup model radios (Reserved, Free), refund-policy radios, Continue 1→2→3, Publish refused until agreed then `ticketing_live`; create tier; guest Export download; build canvas add/remove across categories.
- Remaining: Cancel resale (needs a Q38 paid order). Coverage 77/92 asserted, 8 written awaiting browser, 7 excluded.
- Findings 2 and 3 fixed; new open item (lane C): `notify_waitlists` should require seller readiness.
