# EU VAT readiness and the IE OSS runbook (Q74, 2026-11-14)

> **AI-drafted engineering note, not tax advice.** Owner decision D2 follows Gigvora's
> `docs/commercial/international-tax-registration-plan.md` (director, 2026-11-10): buyers and sellers in all supported countries
> including the EU, **consumers included**, sanctioned places excluded; Blackwellen registers for EU VAT through the **non-Union OSS
> in Ireland**, using **GB508480488** as the national tax reference. **No live Stripe registration has been created** (Stripe is in
> test mode for marketplace money; this lane used TEST mode only).

## 1. What is built (Gala Dock is the merchant: plans, credit packs, promotion boosts)

| Item | Where |
|---|---|
| `tax_id_collection` on every own-sale Checkout (plans, credit packs, boosts), whether or not automatic tax is on | `src/lib/billing/core.ts` `businessTaxIdParams`; `src/lib/ads/checkout.ts` |
| Plans and credit packs **business-only** (D15): business name required (VAT number optional) before Checkout; name + UK/EU VAT id put on the Stripe customer | `workspace_billing_details`, `billing_details_save` (202611147401); `src/lib/billing/service.ts`; `src/components/billing/business-details.tsx` |
| **Staff alert** when Stripe Tax collects nothing on a consumer sale in a zero-threshold country (`not_collecting`, or automatic tax complete with 0 tax and no tax ID) — records country, amount, currency, product, date and the OSS deadline | `src/lib/tax/eu-vat.ts` `platformSaleSignals`; `record_compliance_signal`; Stripe webhook (`checkout.session.completed`, `invoice.paid`); `/admin/compliance` |
| **Commission VAT by seller country** (B2B general rule, VATA 1994 s.7A(2)(a)): UK seller → 20% UK VAT; non-UK seller in business (trader declaration = business, or a VAT number on file) → **reverse charge**, no UK VAT; non-UK non-trader → UK VAT (verify) | `fee_vat_treatment()`, `trg_checkout_order_vat`, `trg_payment_order_vat` (202611147401); `checkout_orders.commission_vat_treatment`, `payment_orders.platform_fee_vat_treatment` |
| Boost VAT for non-UK business advertisers → reverse charge (advertiser = the boosted event's workspace) | `trg_payment_order_vat` |
| Seller statement shows the VAT treatment and, for reverse charge, the seller's VAT number | `src/app/provider/money/statement/page.tsx` |

Not changed: `BILLING_AUTOMATIC_TAX` is still an environment switch (owner sets it before live, M-82). Merch (API only) is out of scope (s.5A deemed supplier — tax-and-reporting §4).

## 2. Open tax-adviser points (TODO)
1. **Land-related commission** on venue hire (Sch 4A para 1; Notice 741A §6): if venue-hire commission is land-related, the place of supply is where the venue is, whoever the seller is. Not yet separated in `fee_vat_treatment` — **TODO(tax adviser)**.
2. **Non-UK non-trader sellers**: B2C general rule → UK VAT (s.7A(2)(b)) — confirm.
3. Evidence of business status for reverse charge: trader declaration vs VAT number — confirm what HMRC expects.

## 3. Booking-fee VAT treatment — left as is, awaiting the tax adviser (D6)
The £1 ticket booking fee and the 2.5% booking admin fee are treated as **UK VAT-inclusive** supplies by Gala Dock wherever the event or venue is (`trg_checkout_order_vat` / `trg_payment_order_vat`, marked `TODO(tax adviser)`). Under reading 1 (`tax-and-reporting.md` §2.2), the fee is an intermediary service to a consumer, supplied where the underlying supply is (Sch 4A para 10) — so a booking fee on a Paris event may be a French supply declarable through the OSS. **No code change until the adviser confirms**: (a) reading 1 vs 2; (b) place of supply for overseas events/venues; (c) whether "services connected with admission" applies. When confirmed, the change is one function (`fee_vat_treatment`-style lookup by event/venue country) plus OSS reporting of those fees.

## 4. Runbook — IE non-Union OSS registration (OWNER ACTION)
Do these in order. Never open EU consumer sales of plans/packs in live before step 1 (they are business-only for launch anyway, D15 — but boosts and future consumer products are covered by the same rule).

1. **Apply for the non-Union OSS with Irish Revenue** (ROS → "VAT – Non-Union OSS", or Revenue's OSS page). National tax reference: **GB508480488** (or 508480488 if the prefix is refused); the Corporation Tax UTR is the alternative. Deadline that keeps backdating: **by the 10th day of the month after the first EU consumer sale** (Implementing Regulation 282/2011 art 57d — verify on Revenue's page). The `/admin/compliance` alert shows that date for each sale.
2. **Record the application** (date, reference) in the finance folder and in `docs/legal/review-2026-11/eu-vat-readiness.md` §5 below.
3. **Add the Stripe Tax registration in LIVE** (a separate, approved session — this lane must not do it): `tax.registrations.create({ country: "IE", country_options: { ie: { type: "oss_non_union" } }, active_from: <first EU consumer sale date or now> })`. No OSS number is needed for Stripe.
4. Confirm Stripe Tax **threshold monitoring** notifications go to the director.
5. Mark the matching `/admin/compliance` alerts reviewed with the application reference.
6. Quarterly: file the OSS return (due by the end of the month after each quarter — verify) from Stripe Tax's OSS report; pay Revenue.
7. Revenue's confirmation arrives later; no Stripe change needed.

## 5. Register
| Date | Action | Reference | By |
|---|---|---|---|
| | IE non-Union OSS application | | |
| | Stripe Tax IE `oss_non_union` registration (live) | | |
