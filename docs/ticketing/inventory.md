# Ticket inventory, checkout and the Ticket Order (Q20, domains 92–95)

Migrations: 202610294015_ticket_inventory_checkout, 202610294016_ticket_issue_serialise. Tests: `tests/release/ticket-inventory-checkout.spec.ts` (10).

## Configuration
- `ticket_tiers`: price, quantity, sold, held (CHECK sold + held <= quantity), sale_start/sale_end, order_limit, min_per_order, per_customer_limit, release_kind (standard | presale | early_bird | general | final), access_code_required, after_tier (release chain: `ticket_tier_open_dependants` opens the next tier when one sells out). Tiers go sold_out only on real sales (fixes an undersell where lapsed holds kept a tier sold out).
- Seats: `event_seats` (available | held | sold | blocked = kill seat; `accessible` flag). Seat tiers follow the tier sale window and access rule.
- Reserved inventory: `ticket_allocations` (promoter | accessible | guest | comp | vip | partner | hold), per tier, can't exceed the tier. Unused reserved units are excluded from public availability; drawn only through an access code with `allocation_id`. Organisers manage them under RLS (`can_access_event`). Gap: `promoters.ticket_allocation` is not yet mirrored into rows.
- Organiser view: `event_ticket_inventory(event)`.

## Codes
`discount_codes`: purpose discount | access, kind percent | amount (off each eligible ticket, never below zero), tier_ids scope, max_uses, per_customer_limit, stackable (two discount codes combine only when both are stackable; access codes always combine; never on resale). Applied per checkout token (`checkout_apply_code`, service-only, via the rate-limited `applyCode` / `removeCode` server actions). Uses are reserved in `discount_redemptions` when the order is created (row lock → max_uses holds under concurrency), redeemed on issue, released on expiry/failure/cancellation. **Checkout UI has no code input yet.**

## Holds and checkout
- `hold_tickets` / `hold_seats` (anon, token-gated): tier row lock / SKIP LOCKED seat pick make check + increment atomic. Errors: sold_out, seat_unavailable, not_on_sale, order_limit, below_minimum, access_code_required, allocation_exhausted.
- Holds last 10 min (extended to the Stripe session window at payment); `ticket_inventory_sweep()` every minute (pg_cron `ticket-inventory-sweep`) releases lapsed holds and expires unpaid orders that hold nothing.
- `checkout_quote(event, token)` (service-only) prices in pence: lines (unit, discount, net), booking fee per paid ticket (commerce.ticket_fee fixed + pct), VAT (commerce.vat, inclusive by default), seller commission. `summarise()` reads it. The order insert must equal the quote (`quote_mismatch`), checks per-customer limits (`customer_limit`) and snapshots the quote (`quote_snapshot`, *_minor columns).
- Payment confirmation: Q07 direct charge (`checkout_order_direct_paid`, idempotent per PaymentIntent). Issuance (`issue_checkout` / `issue_resale`) is serialised per order ref (4016), so redirect + webhook can't double-issue or refund an issued order (race found in deployed code and fixed).

## Ticket Order state machine (`ticket_order` on `checkout_orders.order_state`, enforce)
draft → inventory_held → payment_pending → paid → issued; expired / failed / cancelled; refund_pending → refunded / partially_refunded; chargeback → refunded / issued. Late payment for a lapsed reservation: expired → paid → refund_pending. Deployed code still writes status / refund_status / stripe_session; `checkout_order_lifecycle_sync` mirrors those writes when allowed and otherwise records a `state_violations` row (never blocks). Explicit writes and `ticket_order_transition(ref, to, expected, reason)` (compare-and-set; cancel/expire releases inventory) are enforced. Every change emits `ticket_order.state_changed`.

## Evidence
Load: 24 buyers / 3 GA → 3 holds, 21 sold_out, double issuance → 3 tickets; 24 buyers / 3 seats → 1 per seat; 20 buyers asking 1–2 of 3 → never > 3 held; 10 orders on a max_uses=1 code → 1; 5 duplicate confirmations → 1 ledger transaction. 32/32 twice.
