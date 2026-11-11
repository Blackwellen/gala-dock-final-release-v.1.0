# Gala Dock Payment Terms (version gd-pt-1.0-2026-11-11)

> **DRAFT — not in force. For director sign-off.**
> - Written 2026-11-11 to match the DEC-107 engine (`docs/backend/payments/dec107-gala-dock.md`, migrations 202611116001–6006).
> - It replaces `payment-protection-terms.md` (version 2026-10). That document describes Gala Dock holding money on its own Stripe balance, which is no longer true.
> - The version string is the one the app records at the express ticks (`dec107_settings.payment_terms_version`). Changing this text means a new version and new acceptance.

These terms apply to every payment made through Gala Dock for:
- tickets and ticket resales;
- merchandise;
- venue and supplier bookings (deposits, balances, standby and emergency fees, change orders);
- organisers' invoices paid by card.

They form part of the Customer Terms, Organiser Terms, Provider Marketplace Terms and Venue Marketplace Terms. Gala Dock's own plans and credit packs are sold by Gala Dock and are covered by the subscription terms instead.

## 1. Who you pay
1.1 **The seller is the merchant.** The organiser, venue or supplier ("the seller") sells to you. Your payment goes, through Stripe Payments UK Ltd, directly into the seller's own Stripe account, and the seller is the merchant of record.

1.2 **Gala Dock's role.** Blackwellen Limited (trading as Gala Dock) runs the marketplace. Its only money from your payment is its fee, which Stripe deducts from the same payment as an application fee. Gala Dock never holds your money and never decides where it goes.

1.3 **Fees are shown upfront.** All prices shown to consumers include VAT. The total you pay, including Gala Dock's booking fee or booking admin fee, is shown from the first price display and again before you pay.

## 2. Fees
2.1 **Sellers** pay Gala Dock a seller fee (commission) at the rate recorded on the sale. It is never more than 8% of the seller's price, plus any fixed per-ticket fee shown in the Fee Schedule.

2.2 **Buyers** pay a booking fee on paid tickets, or a booking admin fee on venue and supplier bookings, as shown before payment.

2.3 **Refunds and fees.** When any part of a payment is refunded:
- (a) the seller fee on the refunded part goes back to the seller, in proportion to the amount refunded;
- (b) the buyer's booking fee or admin fee is not refundable, except where the seller or Gala Dock cancels, where the payment was a duplicate or Gala Dock's error, or where the law requires a refund.

## 3. When the seller is paid
3.1 **Manual payouts.** Payments stay in the seller's own Stripe balance. Gala Dock instructs Stripe to pay them out to the seller's bank only when one of these release triggers is met:
- (a) **tickets, resales and merchandise:** 5 UK business days after the event ends. Ticket money is never paid out before the event;
- (b) **bookings:** the customer confirms the booking was delivered, or the event has ended and 24 hours have passed with no issue raised;
- (c) the parties settle a dispute, or both accept Gala Dock's recommendation;
- (d) an independent award (ADR, arbitration or court) is entered;
- (e) the payment provider's hold limit is reached (clause 8).

3.2 **Grouping.** Payouts for one event are grouped together. Ticket resales are paid to the organiser under the same event.

3.3 **What stops a release.** A release waits while one of these is open: a booking dispute, a card chargeback, or a cancellation request. It always waits no later than the hold limit.

## 4. Seller set-up
4.1 **Set-up before the first payment.** A seller must finish Stripe set-up before any customer can pay them. Until then, customers see that the seller is finishing set-up and nothing is charged.

4.2 **Seller accounts.** Sellers' Stripe accounts have no Stripe dashboard. Stripe carries out identity and business checks.

## 5. Reserves
5.1 **Standard reserve.** 10% of each release stays in the seller's own Stripe balance for 30 days, while the seller is in its first 90 days of releases or has had less than £2,000 released, whichever ends later.

5.2 **Risk reserve.** Up to 50% of each release stays for up to 60 days, but only where, over the last 90 days and at least 5 payments:
- chargebacks exceed 0.75% of payments by count; or
- refunds exceed 10% by value.

5.3 **Limits on reserves.** A reserve:
- never extends past the hold limit;
- always stays in the seller's own balance;
- is never applied for suspicion alone.

## 6. Refunds and chargebacks
6.1 **Where refunds come from.** Refunds go back to the original payment method, from the seller's balance.

6.2 **Chargebacks.** The seller is the merchant, so a card chargeback is debited by Stripe from the seller's balance. The seller can submit evidence from Money in Gala Dock. Chargebacks remain open to customers at all times.

6.3 **Shortfalls.** The seller is responsible for chargebacks and refunds on its sales, including tickets. If a chargeback or refund leaves the seller's balance short, the shortfall is recovered from the seller's reserve and later releases first, and Stripe may debit the seller's bank account. Any amount still uncovered is borne by Gala Dock, which keeps the right to recover it from the seller.

6.4 **Ticket money until the event.** For ticket sales, the whole ticket balance stays in the seller's own Stripe balance until the post-event release (clause 3.1(a)). This works as a reserve that covers refunds if the event is cancelled. After the event, clause 5 applies to what is released.

## 7. Disputes
Disputes follow the Gala Dock Disputes Policy. Gala Dock only recommends. Money moves only under clause 3.1(c)–(e).

## 8. The hold limit and the default rule
8.1 **The hold limit.** The payment provider limits how long money can wait in a seller's balance. Gala Dock currently treats this limit as 90 days from the charge.

8.2 **Early charges.**
- **Tickets:** paid tickets can only go on sale from the date when the post-event payout (event end + 5 UK business days) falls inside the hold limit. Ticket money is never paid out before the event. If an event moves so that the hold limit would come first, the money stays where it is and Gala Dock works with the organiser to refund buyers or confirm the new date.
- **Bookings:** money charged more than 58 days before an event may be paid out at the hold limit, before the event takes place. The seller remains liable to refund the customer if the booking does not go ahead.

8.3 **Warning.** Both parties are warned 10 days before the hold limit.

8.4 **The default rule.** If a booking dispute is still open at the hold limit, the disputed amount is refunded to the customer and the rest is paid out to the seller. Ticket money is never paid out before the event under this rule (clause 8.2).
- This is **not a decision on the dispute**.
- The customer remains liable to pay the seller the refunded amount unless a court, arbitrator or ADR body decides otherwise, or the parties agree otherwise.
- The seller can ask Gala Dock for the customer's contact details.

## 9. Pausing payouts
9.1 **Grounds.** Gala Dock may pause a seller's payouts only on one of these grounds, recorded with a reference:
- (a) a court or tribunal order;
- (b) a request from a regulator or law-enforcement body that Gala Dock must follow;
- (c) an instruction from the payment provider;
- (d) a sanctions-screening match pending review;
- (e) the seller's insolvency;
- (f) the seller's own request.

9.2 **Suspicion.** Suspicion alone is never a ground. On suspicion, Gala Dock may suspend the account, refuse new sales and report to the payment provider, card schemes or authorities, but the money stays in the seller's own balance.

9.3 **Notice and audit.** The seller is told when payouts are paused and when they resume. Every pause is audited.

## 10. Changes
Gala Dock gives business users at least **15 days' notice** of changes to these terms (Platform-to-Business Regulation 2019/1150 as retained in UK law). A changed text gets a new version and must be accepted again.

---
## Engine review (2026-11-11): text vs code

| Clause | Engine | Status |
|---|---|---|
| 1.2 application fee only | direct charges with `application_fee_amount`; no platform transfer (invariant `platform_transfer_on_direct_charge`) | matches |
| 2.1 seller fee ≤ 8% | `dec107_settings.seller_fee_cap_bps` 800, invariant `seller_fee_over_cap` | matches for bookings. Tickets: 5% + £1 buyer fee, within the cap |
| 2.3 pro-rata seller fee / admin fee kept | `dec107FeeRefund`, proven in the sandbox | matches |
| 3.1 triggers | `dec107_release_sweep` | matches (24 h = `ticket_review_hours`/`booking_review_hours`) |
| 3.3 waits | sweep step (d) | matches |
| 4.1 set-up first | `COM_SELLER_NOT_READY` backstop + customer copy | matches |
| 5 reserves | `dec107_reserve_for` + check constraints | matches |
| 6.3 shortfall | `capGroupToAvailable` (releases.ts) | matches. No covered-liability ledger yet (owner decision) |
| 8.1–8.4 | `hold_limit_days` 90, funding lead 58, warning 10, `dec107_default_rule_notice` cites "clause 8.4" | matches |
| 9 | `adm_payout_pause` basis list | matches |
| 10 | no in-app 15-day notice mechanism yet | **gap**: set effective date = publish + 15 days |

Placeholders: none. Draft markers: the header above, which must be removed at publication.
