# Official resale, launch, waiting room and fraud controls (Q22, domains 99–102)

Migration: 202610294017_ticket_resale_launch_fraud. Tests: `tests/release/ticket-resale-launch-fraud.spec.ts` (6), `tests/marketplace/resale-policy.spec.ts`.

## Resale policy (versioned, data-driven)
`resale_policies` per jurisdiction (events.settings.jurisdiction, default GB): price_cap_pct of face value, listing_cutoff_hours, max_active_listings_per_user, required_disclosures, legal_text, legal_review_status. Published versions are immutable; only retirement and the legal-review stamp may change; a new rule = a new version. `resale_policy_for(event)` = latest published, in force.
GB v1 mirrors current behaviour (face-value cap). **Its legal text is a DRAFT flagged `needs_review`; Gala Dock never claims legal compliance.** Disclosures follow the UK secondary-ticketing information duties (face value, seat/standing area, use restrictions) pending legal review.
Enforcement: `list_ticket_for_resale` (ownership, original payment, window, platform/event switches) plus the `tickets_resale_policy_guard` trigger (cap, cut-off, listing limit) for every writer.

## Listing → sale
Listing rotates the credential and writes `ticket_resale_listings` (policy version, face value, price, tier, seat, restrictions). `resale_listings(event)` (public) adds face_value, restrictions, policy_version, jurisdiction (existing keys unchanged). `hold_resale` lets exactly one buyer reserve a listing. `issue_resale` (serialised per order) issues a new entitlement and marks the old one `resold` (credential rotated): exactly one valid entitlement at all times. The listing becomes sold / withdrawn / lapsed.

## Settlement switch
platform_settings `ticketing.resale_settlement`:
- `organiser_buyback` (default): the resale is a Q07 direct charge on the organiser's connected account (`resale_settlement_seller()`); the seller is compensated by a refund of their original payment (`resale_payouts` → refund worker). **Gap:** `src/lib/commerce/resale-refunds.ts` refunds through the platform account (legacy platform-charged originals); direct-charged originals need a refund on the connected account.
- `customer_connect`: BLOCKED until customers can onboard to Stripe Connect (owner decision). Steps: build customer Connect onboarding, then set the setting.

## Launch and waiting
- `event_launch_state`: coming_soon / countdown (settings.launch.at) / presale (settings.launch.presale_at, or only access-code tiers on sale) / on_sale / low_availability / final_release (release_kind = final) / sold_out / waitlist / ended.
- Waiting room (`launch_queue`, settings.launch.waiting_room {enabled, rate_per_minute, admit_minutes}): first-come positions, rate-based admission, single-use admission consumed when the order is created; per-IP rate limit on /api/events/{id}/queue.
- Sold-out waitlist: `notify_waitlists` (every 5 min) offers freed stock for 30 minutes (reserved as held); expiry releases it to the next person; `claim_waitlist_offer` turns the offer into a checkout hold.

## Bot / velocity controls (no silent or permanent bans)
`checkout_risk_check(event, buyer, token, client_hash)` runs before order creation (thresholds in platform_settings ticketing.velocity): 4 orders / 10 min → review flag; 8 → 15-minute pause; 4+ accounts on one client hash (sha256 of IP + user agent) per hour → review flag; event `ticket_pro.sales.max_per_customer` → purchase_limit. Chargebacks → review flag (once disputes call `ticket_order_transition(ref,'chargeback')` — being wired). Flags: `ticket_risk_flags` (organisers and admins read; only `ticket_risk_review` — admin, tickets permission, audited — clears or actions them).

## Blocked
- Customer Connect resale (owner decision).
- Legal review of GB v1 (BLOCKED_LEGAL: stamp legal_reviewed_by/at, status reviewed; a different cap/cut-off = v2).
