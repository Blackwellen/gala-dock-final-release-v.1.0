# DEC-107 on Stripe for Gala Dock

Owner decision 2026-11-11: Gala Dock uses the director-approved DEC-107 model (Gigvora reference: `Built/Gigvora/docs/backend/payments/dec107-seller-direct.md`). It supersedes the Ryft/Mangopay plan in `docs/release/payments-provider-decision.md`. **Stripe stays in TEST mode** until the owner says go live; the production `STRIPE_CONNECT_SECRET_KEY` is the sandbox key.

## 1. The model

- **Sellers** (venues, suppliers, organisers selling tickets) have Stripe connected accounts with **no Stripe dashboard** and a **manual payout schedule**. Stripe collects KYC (`requirement_collection=stripe`) and bears negative balances (`losses.payments=stripe`). That is the only no-dashboard combination Stripe allows with Stripe-collected requirements (sandbox probe 2026-11-11, same answers as Gigvora). Stripe's processing fee payer is a setting (`dec107_settings.connect_fees_payer`, default `application`, so Gala Dock's seller fee covers it as DEC-107 prices it). This needs an owner decision; see §8.
- **Charges** are **direct charges on the seller's own account**. The seller is the merchant of record, and the money sits in the seller's balance, never Blackwellen's.
- **Gala Dock's fee** is the **application fee** on that same charge. It covers the seller fee (commission, capped at 8% by `dec107_settings.seller_fee_cap_bps`) plus the customer's admin or booking fee. The admin fee is VAT-inclusive for consumers and shown in the total before payment.
- **Payouts** are **manual**: the payments worker pays out of the seller's balance only on an approved trigger.

| Money | Seller account | Release trigger |
|---|---|---|
| Ticket sale | organiser | event end + `ticket_review_hours` (24 h) |
| Ticket resale (organiser buy-back) | the **same organiser** (new direct charge); the original buyer is refunded on the original charge | same as the event; **grouped under the event** (`payout_releases.event_id`) |
| Merch | organiser | event end + 24 h |
| Supplier/venue deposit, balance, standby, emergency, change order | supplier/venue | customer confirmation (item fulfilled/completed) or event end + `booking_review_hours` (24 h) |
| Organiser invoice paid by card | organiser | event end + 24 h, else charge + 24 h |
| Plans, credit packs, boosts | **platform** (Gala Dock is the merchant) | none: Gala Dock revenue |

Every release is capped by the **hold limit**. A release is due at `least(trigger, charged_at + hold_limit − 3 days)`, with the hold limit 90 days as a setting. **Funding-window formula:** `dec107_funding_lead_days()` = hold − review − recommendation (7) − escalation (14) − warning (10) = **58 days** for 90/24 h. Money charged more than 58 days before the event is either paid out at the default-rule day (`funding_window_mode = release_at_hold_limit`, the default and owner option b) or refused (`refuse`, option a). This is an owner decision; see §8.

## 2. Code and data (2026-11-11)

| Piece | Where |
|---|---|
| Settings, release model per record, `COM_SELLER_NOT_READY` backstop, releases, reserves, payout pause, sweep, invariants, payment-terms express term | migration `202611116001_dec107_manual_payouts` (+ fix `202611116003`) |
| Recommendation-only disputes, settlements, two-person awards, consumer tiers, case pack, gated deadline rules, dispute notice kinds | migration `202611116002_dec107_disputes` |
| DEC-107 seller account (dashboard none, manual payouts) + Payment Terms tick at payout set-up | `src/app/api/payouts/route.ts`, `src/components/payments/payment-terms-tick.tsx`, `connect-button.tsx`, `onboarding.tsx` |
| `payout_interval` synced from Stripe | `src/lib/commerce/connect.ts` |
| Pro-rata seller-fee refund, admin fee kept except by law; fee looked up on the platform when the charge link lags | `src/lib/payments/rules.ts` `dec107FeeRefund`, `src/lib/payments/service.ts` `refundMerchantCharge({ split })`, `stripe-client.ts` `platformFeeStripe` |
| Release worker (sweep → agreed refunds → payouts per seller × event, reserve) | `src/lib/commerce/releases.ts`, `src/lib/payments/releases-core.ts`, `src/app/api/cron/payments/route.ts` |
| Idempotency: a closed Checkout attempt frees its key | `service.ts` `createDirectMerchantCheckout` (key names the previous session) |
| Disputes UI: staff recommend and enter or check awards; parties settle; case pack | `src/app/admin/(console)/disputes/*`, `src/components/marketplace/dispute-*.tsx`, `src/app/api/disputes/[id]/case-pack/route.ts` |

**Per-record pilot.** `dec107_bind_release_model` freezes `release_model` when a record is first bound to a seller account. It is `manual_release` when that account's `payout_interval = 'manual'`, else `seller_schedule` (legacy Q07). A non-exempt record on a non-manual account is refused (`seller_not_ready`, detail `COM_SELLER_NOT_READY`). Demo and QA fixture workspaces are exempt (`exempt_demo_qa`, default on). No pilot is ever keyed by seller.

**Seller readiness timing.** Nudge, then require: the payout set-up card (Money and onboarding) asks for the Payment Terms tick and then Stripe's form. Customers see "seller finishing set-up, nothing charged" (`NOT_READY_COPY` / `SUPPLIER_NOT_READY`), and the DB refuses with `COM_SELLER_NOT_READY` as the backstop. An organiser can't sell tickets until payouts are active, because the existing honest-readiness gate (`event_payment_readiness`) blocks it. **Not built:** a separate nudge on a provider's first RFQ or quote (§8).

**Refunds** always come out of the seller's balance:
- **Seller fee on the refunded part:** goes back pro rata as an application-fee refund (`fr_…`).
- **Admin or booking fee:** goes back only on a provider, organiser or platform cancellation, a duplicate, or an expired hold, i.e. where the law requires it or it was Gala Dock's error.
- **Ordering:** a refund is refused (`application_fee_not_linked`) until the fee can be found, so the seller fee is never silently kept.

**Reserves** (`dec107_reserve_for`, objective only):
- **standard:** 10% for 30 days while the seller is in its first 90 days of releases or under £2,000 released;
- **risk:** up to 50% for up to 60 days if chargebacks exceed 0.75% by count or refunds exceed 10% by value, over 90 days and at least 5 payments.

Check constraints allow only `standard` and `risk`, cap the rate at 50%, and require `reserve_until ≤ hold_limit_at`. The terms version is copied onto each reserve.

**Payout pause.** `adm_payout_pause` requires staff with `commerce` permission and aal2. It needs a basis from the Payment Terms (court order, regulator or law enforcement, payment-provider instruction, sanctions screening, seller insolvency, seller request) plus a reference. It is audited, and the seller is notified. A paused seller is never offered to the worker, and `dec107_release_paid` refuses to record a payout for one.

**Invariants** (`dec107_invariants()`, must be empty):
- no platform transfer on direct money;
- fee ≤ gross;
- seller fee ≤ cap;
- refunds ≤ charge;
- no duplicate refund key;
- nothing released while paused;
- nothing held past the hold limit;
- no DEC-107 record on an automatic-payout account;
- no payout without a release;
- no refund instruction stuck for over a day.

## 3. Sandbox proof (2026-11-11), evidence `artifacts/release/dec107-sandbox-proof.json`

`DEC107_SANDBOX_PROOF=1 node --env-file=.env --env-file=.env.local node_modules/@playwright/test/cli.js test tests/payments/dec107-sandbox-proof.spec.ts --project=desktop --workers=1 --trace=off` → **8/8**, run `p1-dec107-mwcbaafj`, platform `acct_1UW176Ae36uXyrUn` (sandbox).

**Sellers.** The proof uses the **platform-managed** no-dashboard profile, because Stripe-collected accounts can't accept the ToS by script.
- Organiser `acct_1Uae2iAa8GuEVEY9`, bound to QA workspace "S4 Organiser".
- Supplier `acct_1Uae2iPMlfUBG509`, bound to QA workspace "Pay Test Catering".
- Both have `dashboard none` and `payouts manual`.

**Recording.** Every charge is **recorded first through the app path**: a direct-bound order, then the PaymentIntent with `metadata.order_ref`, which the production webhook records through `checkout_order_direct_paid` (`recordedBy: webhook` on every sale). Refunds and disputes therefore never reach an unknown charge: 74 webhook events, all processed.
- Supplier charges are stored as checkout orders of the proof event, because a `payment_orders` row needs a whole booking chain.

| Path | Result | Stripe ids |
|---|---|---|
| Ticket purchase (£100 + £10 fee, app fee £15) | succeeded, recorded by webhook | `pi_3Uae3gAa8GuEVEY91bt9k4ra`, `fee_1Uae3jAa8GuEVEY9oOf7EhcF` |
| Ticket refund, pro rata (customer, £25 of £50) | seller fee 125 of 250 back, booking fee kept | `re_3Uae3lAa8GuEVEY90yi18ife`, `fr_1Uae3sAa8GuEVEY9GrRVXeD6` |
| Event cancellation | whole £55 incl. fee; app fee 750 back | `re_3Uae3tAa8GuEVEY91KqcviVq`, `fr_1Uae3zAa8GuEVEY9cBd7w4VZ` |
| Resale purchase + original refund (same organiser, same event) | face value refunded, its seller fee 250 back | `pi_3Uae46Aa8GuEVEY91rmJNXrb`, `re_3Uae40Aa8GuEVEY93hqwibkH`, `fr_1Uae4CAa8GuEVEY9Ba44aqms` |
| Supplier deposit / balance | succeeded | `pi_3Uae4DPMlfUBG5091QQujsZZ`, `pi_3Uae4JPMlfUBG5091LeIea2e` |
| Change order, client-present Checkout on the seller's account | session open on the supplier; paid | `cs_test_b0CIJbYGEncrMsfbA6frUYlioBglHLYOuUdkuSs3Rr2Bpom1PFjsbMdhob`, `pi_3Uae4RPMlfUBG5090y2xcdS8` |
| Booking cancellation by provider | £307.50 incl. admin fee; app fee 3,150 back | `re_3Uae4DPMlfUBG5091YNzUNjW`, `fr_1Uae4YPMlfUBG50989YI7i5d` |
| Consumer cancellation (50% policy) | seller fee 2,800 of 5,600 back, admin fee kept | `re_3Uae4JPMlfUBG5091DAXTHD7`, `fr_1Uae4aPMlfUBG5095IsTaLy9` |
| Default rule at hold limit (Stripe side) | disputed £40 refunded, seller fee 320 back | `re_3Uae4RPMlfUBG5090KB6PByd` |
| Chargeback + evidence | dispute on the **supplier's** account, evidence submitted; its release stays blocked | `du_1Uae4fPMlfUBG509jVQ3aurB` (under_review) |
| Release on trigger (DB sweep → due → planner → payout) | 8 recorded sales due 24 h after the event; **one payout per seller for the event**; standard reserve held | organiser `po_1Uae4sAa8GuEVEY9YgFswLie` (15,391, reserve 1,709); supplier `po_1Uae4qPMlfUBG509yxkKiE1w` (26,823, reserve 3,772) |
| Covered liability | chargeback £51.25 + £20 fee already debited the supplier; its other releases paid what was there (shortfall 7,125), never platform money | (in the supplier payout above) |
| Reserve hold and release | reserve parts due (clock moved in SQL) and paid | `po_1Uae4tAa8GuEVEY91AhjB1Q6`, `po_1Uae4uPMlfUBG509eJ6PgzYw` (5,481) |
| Subscription + credit pack (platform) | Business monthly active; credit pack paid; sub cancelled after | `sub_1Uae4wAe36uXyrUnjE01ZFUt`, `in_1Uae4wAe36uXyrUnxugUEtjk`, `pi_3Uae4yAe36uXyrUn0qdjqWMF` |
| `dec107_invariants()` | **[]** | — |
| Books = provider balance | organiser 0 = 0; supplier 4,600 = 4,600 (the disputed money still held by Stripe) | — |

**Other proofs.** The DB side of the hold-limit default rule (sweep → refund instruction → notice → release), accepted settlement → refund instruction, failed payout → reopen → retry, the customer terms gate, the payout nudge and seller chargeback visibility are all proven in the rolled-back exercises `scripts/db/exercises/2026111160{01..06}_*.sql`. Unit spec `tests/payments/dec107-rules.spec.ts`: 11/11.

**Defects the proof found and fixed:**
1. **Application fee lags the charge.** The fee is created about 3 s after the charge, so `refundMerchantCharge` now looks it up on the platform by charge, and refuses rather than keeping the seller fee.
2. **Reserve release wiped its own fields.** Paying out a reserve part wiped its reserve fields (`202611116003`).
3. **Consent records refused the new purposes.** `consent_records` purpose/source checks refused the new express terms (`202611116004`).
4. **Webhooks met unrecorded proof charges.** The earlier proof versions charged before recording, so webhooks met unknown charges. The proof now records first; the 7 failed events were recorded and re-delivered, and 1 was dismissed with an audit entry.

**Not proven:**
- a real `kind=resale` DB row: it needs the resale listing chain;
- the hosted Checkout page itself (needs a browser card entry);
- the deployed cron running the release worker: production runs `1514e1f`.

## 4. Disputes (DEC-107)

**Staff recommend only.** `admin_dispute_update` refuses a staff `resolved`, and `decide_cancellation` refuses any staff-set refund amount. Money moves only on:
- both parties accepting the recommendation;
- a settlement (one party offers, only the other can accept);
- an independent award entered by one member of staff and checked by a different one (`adm_dispute_award_enter` / `adm_dispute_award_check`);
- the hold-limit default rule.

Each creates a `dec107_refund_instructions` row, which the worker executes on the seller's charge: the admin fee is kept and the seller fee goes back pro rata.

**Tiers** (`dispute_route`):
- ≤ £250: settlement or court.
- Consumers, £250–£5,000: settlement, mediation if both agree, or court. **No arbitration ≤ £5,000.**
- Consumers > £5,000: arbitration only with consent given after the dispute starts.
- Business: arbitration above £250.

Parties file with the provider themselves; the **case pack** is `/api/disputes/{id}/case-pack`, a JSON file with SHA-256 fingerprints of every statement and evidence file.

**Deadline rules** (deemed acceptance) run only when `dispute_rules_in_force_from` is set and reached (it is **NULL**). They apply only to disputes opened after that date, to business customers, and where both sides accepted `dispute_rules` (`accept_dispute_rules`). Consumers are never bound by silence.

**Notices:**
- The default-rule notice cites the clause in force, says it is **not a decision** and that the **customer remains liable**, and tells the provider it can ask for the customer's contact details.
- A warning goes out 10 days before the default-rule day.
- All dispute notices now use `dispute_*` kinds, which `email_category()` files under the mandatory `payments` category. Before this they used `provider.request`, which was filed under the optional `quotes` category, and the recipient could switch it off.

## 5. Go-live order (when the owner says so; not done)

1. Deploy this code; let the cron run on test mode.
2. Owner decisions in §8.
3. Live Connect webhook events stay as today (`account.updated`, `payout.*`, `charge.*`, `charge.dispute.*`, `checkout.session.*`, `application_fee.*`).
4. Switch `STRIPE_CONNECT_SECRET_KEY` to live.
5. Live sellers onboard fresh (DEC-107 accounts).

Rollback: `update dec107_settings set require_manual_payout_accounts = false` lets new records use legacy accounts. Existing manual-release records keep releasing.

## 6. Mismatches and gaps (honest list, updated after the gap pass)

**Closed 2026-11-11:**
- merch DEC-107 split;
- seller chargeback evidence UI (`/api/chargebacks/[id]/evidence`, Money → Stripe payouts);
- payout-pause admin screen (`/admin/commerce/payout-pauses`);
- failed payouts re-open their releases (6004);
- "Get ready to be paid" nudge (6004);
- customer Payment Terms tick on ticket checkout, bookings, pay links and merch;
- covered liability: a short balance pays what is there; the seller is told; the shortfall is audited `payout.covered_liability`.

**Still open:**
1. **Covered-liability ledger depth** (Gigvora 1013). Not built:
   - the 30-day challenge;
   - the staff confirmation per recovery step;
   - invoicing and collection for a shortfall larger than later releases.

   Today the shortfall is recovered only from the same seller's releases and Stripe's own bank debit. **Owner decision:** build the full ledger before real sellers, or accept recovery from releases only.
2. **No reserve review requests** (seller asks for an early review).
3. **No express tick for business clients' chargeback undertaking** (Gigvora: business clients only).
4. **"Require payout set-up at quote send":** owner decision. The payment backstop stays in place.
5. **Pay-link and merch terms ticks are untested in a browser.** Merch checkout has no UI caller today (API only).
6. **"Mark escalated (independent)" in the admin dispute screen** stays a status only.

## 7. Cost check

This uses Gigvora's figures for GB Stripe pricing. The seller fee (6–8% for bookings, 5% + £1 per ticket for tickets) covers card processing and Connect fees (£2 per active account plus 0.25% + 10p per payout) at £50, £500 and £2,000. The exception is a £50 booking at 6% (Business plan) on an international card with no admin fee: the shortfall is about 10p. The admin fee (2.5%, min £1) closes it. Chargeback fees (£20) fall on the seller's balance.

## 8. Owner decisions needed

1. **Tickets charged more than 58 days before the event:** (b) pay out at the hold limit (current default) or (a) refuse early sales. Option (c), asking Stripe Sales for a longer hold, can run in parallel.
2. **`connect_fees_payer`:** `application` (DEC-107: Gala Dock's seller fee covers Stripe; current default) or `account` (the seller pays Stripe on top).
3. **Platform-managed losses fallback** if Stripe refuses Stripe-managed losses in live. Gigvora's director accepted this; reserves are then mandatory.
4. **Publish date** for the Disputes Policy, which sets `dispute_rules_in_force_from`.
5. **Payment Terms text** `gd-pt-1.0-2026-11-11`: legal sign-off (see the legal pack).

## 9. Owner decisions 2026-11-11 (built: migration 202611116010)

1. **Ticket money is never released before the event.**
   - Ticket, resale and merch releases happen at event end + `ticket_payout_delay_business_days`: default 5 UK business days. Weekends and England and Wales bank holidays are excluded (`uk_bank_holidays`, migration 202611116150, seeded from gov.uk to 2028; refreshed yearly).
   - This matches the UK norm: Eventbrite pays 4–5 working days after the event, Ticketmaster about 7 days, Skiddle after the event.
   - **The sale window.** Paid tickets can go on sale only from `ticket_sales_open_from(event)` = event end + delay − (hold limit − 3 days). With today's settings that is about 82 days before the event.
   - **Enforcement.**
     - `ticket_tier_sale_window_guard` refuses on-sale or scheduled paid tiers before that date, with `tickets_on_sale_from:<date>`. Ticket Pro and Ticket Setup show "Tickets can go on sale from <date>…".
     - `dec107_bind_release_model` refuses any earlier ticket charge as a backstop.
     - Demo/QA are exempt.
   - **If an event moves after sales** so that the hold limit comes before the event, the sweep blocks the release (`hold_limit_before_event`) and alerts staff. It is never paid out before the event.
   - Raising `hold_limit_days`, for example if Stripe confirms a longer hold for GB Accounts v2, widens the window.
2. **Stripe Connect fees are paid by Gala Dock from its fee.** Confirmed: `connect_fees_payer` = `application`, and new seller accounts are created with `controller[fees][payer]=application`.
3. **Losses.**
   - The seller is responsible for chargebacks, including on tickets.
   - For tickets the whole balance is effectively the reserve until the post-event release; after that the standard reserve rules apply.
   - A shortfall is recovered from the seller's later releases first: `capGroupToAvailable`, recorded as `dec107_covered_liabilities` status `recovered`.
   - A negative seller balance opens a `recovering` liability. If it can't be recovered, staff record that Gala Dock absorbs it: `adm_covered_liability_absorb` (commerce permission, second factor, audited). This is the platform-managed fallback.
4. **Payout set-up when a provider sends a quote: not required.** The nudge only is kept, and the payment backstop stays.
5. **Checks at sign-up.** See the next list.

### Organiser checks today
- Email verification (Supabase).
- Turnstile captcha. It is due to be switched back on before launch (queue T1/T2).
- Password policy with the HIBP leaked-password check.
- MFA for admins.
- Trader-status declaration before payout set-up.
- The Payment Terms tick.
- Stripe Connect KYC by Stripe (identity, business, bank), with Stripe-collected requirements.
- Honest payment readiness: no paid tickets until payouts are active.
- The ticket sale window.
- Risk velocity flags on checkout.

Proposed extra objective step (owner): before an organiser's first paid on-sale, require a verified phone number and a published event page with venue/address. Both are objective and need no discretionary hold. Not built.

### Watch for legal risk: confirm with the payments solicitor
- That holding ticket money in the organiser's own Stripe balance until 5 business days after the event, with manual payouts, keeps Blackwellen outside the payment-services perimeter (the PSRs 2017 technical-service-provider / commercial-agent analysis). Gala Dock never holds the funds.
- That the ticket sale window (sales from about 82 days before the event) is acceptable to Stripe for GB Accounts v2. Ask Stripe Sales whether a longer hold is allowed for event tickets.
- That putting chargeback liability on the seller, with Gala Dock absorbing what can't be recovered, is correctly reflected in the Payment Terms and in Stripe's controller settings (Stripe-managed losses vs platform-managed).
- Consumer refund duties on cancelled or postponed events (CRA 2015, CMA guidance on ticket refunds), given the money sits with the organiser until after the event.

## 10. Ticket validity during card chargebacks (owner decision 2026-11-14, built: migration 202611146203)

The seller carries chargebacks (§9.3). What happens to the tickets of a disputed ticket order:

| Stripe dispute | Tickets | Capacity | Who is told |
|---|---|---|---|
| Opened (any open or inquiry status) | **Held**: `tickets.dispute_hold_at`/`dispute_hold_ref`. Same codes. Refused at the door as **"Ticket on hold — see box office"** (scan result `on_hold`; the offline snapshot carries status `on_hold`; the wallet credential API returns `on_hold` and the wallet shows "On hold"). A resale listing is withdrawn; listing, transfer and resale are refused while held (`gd_0_dispute_hold_guard`; a resale purchase in flight is refunded). | unchanged | organiser (owner/manager/finance), audit `ticket.dispute_hold` |
| Won (or inquiry closed) | Hold lifted, same codes, scan again. Order `chargeback → issued`. | unchanged | buyer, organiser, audit `ticket.dispute_hold_released` |
| Lost | **Cancelled**, `void_reason = chargeback_lost`. Order `chargeback → refunded`. | Event not ended: the seat goes back to `available`; the tier's `sold` drops; a sold-out tier inside its sale window reopens. Event ended: void only. A tier update the guards refuse is reported to staff (ops alert), the void still stands. | buyer, organiser, ops alert on capacity failure, audit `ticket.dispute_lost_void` |

- **Scope:** the disputed order's own entitlements, meaning its tickets and their gift transfers (`order_ref`, `order_ref-T…`). A ticket already resold belongs to its new holder, who paid separately, so it is never touched.
- **Idempotent:**
  - A hold is set once.
  - A win lifts only that dispute's hold.
  - A loss voids only live tickets, so capacity is returned once.
  - The webhook treats won/lost/warning_closed as final (`syncStripeDispute`), so a late "open" event can't re-hold.
- **Code:**
  - `ticket_order_dispute()` (called from `src/lib/commerce/disputes.ts`)
  - `ticket_dispute_scope()`
  - `scan_admission` / `check_in_ticket` / `create_scan_snapshot`
  - `src/app/api/tickets/[id]/credential/route.ts`
  - `src/components/tickets/rotating-qr.tsx`
  - scanner labels in `src/components/tickets/scanner.tsx` and `src/components/shared/checkin-scanner.tsx`
- **Ticket terms wording needed** (legal to approve; live text not edited):
  - "If you dispute a card payment for tickets with your card issuer, your tickets are put on hold and won't admit you until the dispute is decided. If the dispute is decided in the organiser's favour, your tickets become valid again with the same codes. If your card issuer reverses the payment, your tickets are cancelled and may be sold again."
  - It also has to say that a resale or transfer is not possible while tickets are on hold, and that a transferred ticket is cancelled if the original payment is reversed.
