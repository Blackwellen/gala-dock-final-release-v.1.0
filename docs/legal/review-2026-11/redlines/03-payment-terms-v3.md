# Gala Dock Payment Terms (v3 draft, gd-pt-1.1)

> **DRAFT v3: not in force, not published.** Q54 legal review, 2026-11-14 (AI review, not legal advice). Builds on `docs/legal/payment-terms-v2-draft.md` (gd-pt-1.0-2026-11-11), which matched the engine. Replaces the Marketplace Payment Protection Terms (2026-10), which must be withdrawn.
>
> **Changes from v2:** 2A booking-fee collection (VAT); 5.4 reserve review; 6.2 Stripe's dispute fee; **6.4 Gala Dock shortfall wording rewritten (v2 said "borne by Gala Dock")**; 6.5–6.7 recovery, interest, challenge, our-error carve-out; 8.2 consumer warning for long-lead bookings; **9.1(g) trust suspension and 9.1(h) tax reporting holds added (built behaviour)**; 9.1(d) sanctions reworded; 9A seller insolvency; 11 payment instructions; 12 changes for consumers. Engine changes needed are marked **[ENGINE]**.

These terms apply to every payment made through Gala Dock for tickets and ticket resales; merchandise; venue and supplier bookings (deposits, balances, standby and emergency fees, change orders); and organisers' invoices paid by card. They form part of the Terms of Service and the Customer, Organiser, Supplier and Venue Terms. Gala Dock's own plans and credit packs are covered by the Subscription and Credits Terms.

Sellers confirm these terms with a tick at payout set-up; buyers at their first payment.

## 1. Who you pay

1.1 **The seller is the merchant.** The organiser, venue or supplier ("the seller") sells to you in its own name. Your payment goes, through Stripe Payments UK Ltd, directly into the seller's own Stripe account. The seller is the merchant of record.

1.2 **Gala Dock's role.** Blackwellen Limited (trading as Gala Dock) runs the marketplace and software. Its only money from your payment is its fee, which Stripe deducts from the same payment as an application fee. Gala Dock never holds your money and never decides where it goes.

1.3 **Fees shown upfront.** Prices shown to consumers include VAT. The total, including Gala Dock's booking fee or booking admin fee, is shown from the first price display and again before payment.

1.4 **Not escrow or insurance.** This is not an escrow service and not insurance. It doesn't cover consequential losses (such as travel or lost earnings) and doesn't replace event insurance.

## 2. Fees

2.1 **Sellers** pay Gala Dock a seller fee at the rate recorded on the sale. It is never more than 8% of the seller's price, plus any fixed per-ticket fee in the Fee Schedule. It is a charge for the marketplace, software and payment tools, not a fee for finding work. Gala Dock pays Stripe's processing and Connect fees out of its own fee.

2.2 **Buyers** pay a booking fee on paid tickets, or a booking admin fee on venue and supplier bookings, as shown before payment.

2.3 **Refunds and fees.** When any part of a payment is refunded: (a) the seller fee on the refunded part goes back to the seller in proportion; (b) the buyer's booking fee or admin fee is not refundable, except where the seller or Gala Dock cancels, the seller fails to provide the ticket or service, the payment was a duplicate or Gala Dock's error, a hold expired, or the law requires a refund.

## 2A. How Gala Dock's buyer fees are collected

2A.1 The booking fee and booking admin fee are Gala Dock's own charges to the buyer for Gala Dock's booking service. The seller collects them **as Gala Dock's agent** as part of the single card payment, and they are passed to Gala Dock through the application fee. They are not the seller's income, and the seller must not include them in its turnover or invoices.

2A.2 Gala Dock issues VAT invoices or statements for its seller fee to sellers, and accounts for VAT on its fees where due. VAT on the seller's own prices is the seller's responsibility.

## 3. When the seller is paid

3.1 **Manual payouts.** Payments stay in the seller's own Stripe balance. Gala Dock instructs Stripe to pay them to the seller's bank only when a release trigger is met:
- (a) **tickets, resales and merchandise:** 5 UK business days after the event ends (excluding weekends and bank holidays in England and Wales). Ticket money is never paid out before the event;
- (b) **bookings:** the customer confirms delivery, or the event has ended and 24 hours have passed with no dispute opened;
- (c) the parties settle a dispute, or both accept Gala Dock's recommendation;
- (d) an independent award (ADR, arbitration or court) is entered and checked;
- (e) the payment provider's hold limit is reached (clause 8).

3.2 Payouts for one event are grouped. Ticket resales are paid to the organiser under the same event.

3.3 **What stops a release.** A release waits while a booking dispute, card chargeback or cancellation request is open, or a pause under clause 9 applies, but never beyond the hold limit.

## 4. Seller set-up
4.1 A seller must finish Stripe set-up before any customer can pay it. Until then customers see that the seller is finishing set-up and nothing is charged.
4.2 Sellers' Stripe accounts have no Stripe dashboard. Stripe carries out identity and business checks under its own obligations.
4.3 Sellers must be established in a supported country (Terms of Service §4A).

## 5. Reserves
5.1 **Standard reserve.** 10% of each release stays in the seller's own Stripe balance for 30 days, while the seller is in its first 90 days of releases or has had less than £2,000 released, whichever ends later.
5.2 **Risk reserve.** Up to 50% of each release stays for up to 60 days, only where, over the last 90 days and at least 5 payments, chargebacks exceed 0.75% of payments by count or refunds exceed 10% by value.
5.3 A reserve never extends past the hold limit, always stays in the seller's own balance, is used only for that seller's own refunds and chargebacks, and is never applied for suspicion alone.
5.4 **Review.** A seller may ask, once every 30 days, for the reason, percentage and threshold of a reserve, and for a person to check the measurement. We reply within 5 UK business days. **[ENGINE: request + admin view]**

## 6. Refunds, chargebacks and shortfalls
6.1 Refunds go to the original payment method, from the seller's balance.
6.2 **Chargebacks.** The seller is the merchant, so Stripe debits a chargeback, and Stripe's dispute fee (currently £20), from the seller's balance. The seller can submit evidence from Money in Gala Dock. Whether a chargeback succeeds is decided by the card issuer. Buyers' chargeback and section 75 rights are never limited by these terms.
6.3 **The seller's liability.** The seller is responsible for refunds and chargebacks on its sales, including tickets ("Covered Liabilities").
6.4 **Recovery order.** A Covered Liability is met only from, in this order: (a) the seller's available balance from released amounts; (b) its reserve; (c) its later releases; (d) a debit of its bank account by Stripe under the seller's agreement with Stripe; (e) an invoice from Gala Dock, payable within 14 days; (f) collection or legal proceedings. It is never met from another seller's or buyer's money. **[ENGINE: invoice step, dec107 §6 item 1]**
6.5 **Gala Dock's discretion.** As between Gala Dock and the seller, Gala Dock may decide in a particular case to bear some or all of a Covered Liability that can't be recovered from the seller. That decision is made case by case and recorded. It doesn't release the seller's debt, which Gala Dock may still recover. **It is not a promise to any buyer: Gala Dock is not liable to pay any refund or other amount that a seller owes a buyer.**
6.6 **Notice and challenge.** We tell the seller of each Covered Liability with the amount, reason and source before it is met, or as soon as we know if Stripe debits it directly. The seller may challenge it within 30 days at support@galadock.com; a person replies within 10 UK business days. **[ENGINE: challenge state]**
6.7 **Our errors.** A seller is not liable for a refund or chargeback caused by Gala Dock's error or breach, except to the extent the seller contributed.
6.8 **Interest and costs.** Overdue amounts payable by a business seller carry interest under the Late Payment of Commercial Debts (Interest) Act 1998, and reasonable recovery costs.
6.9 **Ticket money until the event.** For ticket sales, the whole ticket balance stays in the organiser's own Stripe balance until the post-event release. It works as a reserve for refunds if the event is cancelled. It is the organiser's money held by Stripe, not money held by Gala Dock.

## 7. Disputes
Disputes follow the Disputes Policy and the Standard Booking Terms. Gala Dock only recommends. Money moves only under clause 3.1(c)–(e).

## 8. Hold limit and default rule
8.1 **Hold limit.** The payment provider limits how long money can wait in a seller's balance. Gala Dock currently treats this as 90 days from the charge.
8.2 **Early charges.**
- **Tickets:** paid tickets can go on sale only from the date when the post-event payout falls inside the hold limit (about 82 days before the event). If an event moves so that the hold limit would come first, the money isn't paid out; Gala Dock works with the organiser to refund buyers or confirm the new date.
- **Bookings:** money charged more than 58 days before an event may be paid out at the hold limit, **before the event**. The seller remains liable to refund the customer if the booking doesn't go ahead. **Consumers are told this before paying such a deposit.** **[ENGINE: checkout notice]**
8.3 Both parties are warned 10 days before the hold limit.
8.4 **Default rule.** If a booking dispute is still open at the hold limit, the disputed amount is refunded to the customer and the rest paid out to the seller. Ticket money is never paid out before the event. This is **not a decision on the dispute**; the customer remains liable to pay the seller the refunded amount unless a court, arbitrator or ADR body decides otherwise or the parties agree; the seller can ask Gala Dock for the customer's contact details.

## 9. Pausing payouts
9.1 **Grounds.** Gala Dock pauses a seller's payouts only on one of these grounds, recorded with a reference:
- (a) a court or tribunal order;
- (b) a request from a regulator or law-enforcement body that Gala Dock must follow, including while consent is sought under the Proceeds of Crime Act 2002;
- (c) an instruction or restriction from the payment provider;
- (d) a sanctions restriction by the payment provider, or a match from sanctions screening that Gala Dock is required by law to carry out, pending review;
- (e) the seller's insolvency (clause 9A);
- (f) the seller's own request;
- (g) **a suspension of the seller's workspace** under the Terms of Service §11 for a listed ground, decided by a person after review and notified with reasons. Refunds to buyers continue; payouts resume automatically when the suspension ends;
- (h) **tax reporting:** the seller hasn't given the information that the Platform Operators (Due Diligence and Reporting Requirements) Regulations 2023 require after the reminders those Regulations require, to the extent they require. **[ENGINE: PORR basis]**
9.2 **Suspicion.** Suspicion alone is never a ground. On suspicion, Gala Dock may restrict new sales and report to the payment provider, card schemes or authorities, but money already in the seller's balance continues to follow clause 3. **[ENGINE: automatic `risk_hold_active('payout', …)` must not stop a DEC-107 release; see behaviour-mismatches M-17]**
9.3 **Notice and audit.** The seller is told when payouts are paused and when they resume, with the ground and reference, unless the law forbids it. Every pause is audited.

## 9A. Seller insolvency and closure
9A.1 A seller must tell us immediately if it becomes insolvent or enters any insolvency procedure. Gala Dock then follows the lawful instructions of the insolvency office-holder and the payment provider, and pauses payouts (9.1(e)).
9A.2 Clauses 6 and 9 survive closure of a seller's account until all Covered Liabilities are settled.

## 10. Payment instructions
Gala Dock's duty is to send Stripe the instructions these terms require, accurately and on time. If it fails to send one, or sends a wrong one, its liability is the amount misdirected or wrongly delayed, plus interest a court awards, and is not capped (Terms of Service §12.4).

## 11. Changes
11.1 Business users get at least **15 days'** notice of changes (30 days for fees and reserves), unless required sooner by law. A changed text has a new version and must be accepted again.
11.2 Consumers: a change never applies to a payment already made.

## Schedule 1: Express terms confirmed by tick
| # | Who | When | Term |
|---|---|---|---|
| 1 | Seller | payout set-up | Payment Terms (whole), incl. reserves (5), recovery order and Stripe bank debit (6.4), pause grounds (9), hold limit and default rule (8) |
| 2 | Buyer | first payment | Payment Terms (whole), incl. default rule (8.4) and that refunds come from the seller (6) |
| 3 | Buyer | each ticket checkout | chargeback holds (Ticket Terms §8) |
| 4 | Buyer | deposit charged > 58 days before event | early payout warning (8.2) |
| 5 | Business buyer and seller | first commercial step | Disputes Policy deadline rules |

---
*Engine review vs v2:* unchanged clauses match (`v2` engine table). New engine items: 5.4, 6.4(e), 6.6, 8.2 notice, 9.1(h), 9.2 risk-hold separation.
