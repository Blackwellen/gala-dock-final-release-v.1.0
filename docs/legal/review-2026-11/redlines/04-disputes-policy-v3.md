# Gala Dock Disputes Policy (v3 draft, gd-dr-1.1)

> **DRAFT v3: not in force, not published.** Q54 legal review, 2026-11-14 (AI review, not legal advice). Builds on `disputes-policy-v2-draft.md` (matches the engine, migration 202611116002/6007). **Changes:** 4.2 the window doesn't limit rights; 7 a complete business arbitration clause; 9 incorporation through the Standard Booking Terms; 10–12 ADR, costs, confidentiality and data. Clause 13 keeps its number because `dec107_default_rule_notice` cites it.

## 1. Scope
This policy covers disagreements between a buyer (customer or organiser) and a seller (organiser, venue or supplier) about a booking or ticket made through Gala Dock. Card chargebacks are decided by the card issuer, not Gala Dock. Disputes between you and Gala Dock follow the Complaints Policy.

## 2. Gala Dock only recommends
Gala Dock may review the evidence and the terms saved with the booking and may give a **non-binding recommendation**. Gala Dock never decides a dispute and never moves money on its own judgement.

## 3. How money moves
Money moves only when: (a) both parties accept the recommendation; (b) the parties settle (one offers, the other accepts); (c) an independent award is entered and checked by a second member of Gala Dock staff against the award document; or (d) the default rule in clause 13 applies. Gala Dock then carries out exactly that outcome. Refunds go to the original payment method. Fees follow Payment Terms 2.3.

## 4. Opening a dispute
4.1 Open a dispute from the booking or ticket within **24 hours after the event ends**. Cancellations can be disputed at any time before they are completed. While a dispute is open, the payment stays in the seller's Stripe balance and isn't paid out.
4.2 **This window only affects payout timing.** If you don't open a dispute in time, the seller may be paid, but you keep all your legal rights against the seller, including going to court, and your right to ask your card issuer for a chargeback.

## 5. Independent resolution
5.1 The parties file with an independent provider (for example CEDR, ProMediate or CIArb) or the court **themselves**. Gala Dock doesn't fill in forms or pay provider fees.
5.2 Either party can download a **case pack** from the dispute: the booking terms, payments, timeline with fingerprints of every statement and file, the recommendation and settlement offers.

## 6. Consumer buyers
6.1 **£5,000 or less:** arbitration is **never** required of a consumer (Arbitration Act 1996 s.91 and the Unfair Arbitration Agreements (Specified Amount) Order 1999). Up to £250: settlement or court (small claims). £250–£5,000: mediation if both agree, or court.
6.2 **Over £5,000:** arbitration applies only if the consumer agrees to it in writing after the dispute has started.
6.3 **Silence never binds a consumer.** A consumer's dispute runs to settlement, award, court or the default rule.

## 7. Business buyers and sellers: arbitration
7.1 For a dispute over £250 between business parties who have both accepted these rules, either party may refer the dispute to arbitration by notice to the other with a copy to Gala Dock.
7.2 The arbitration is under the **Arbitration Rules of the Chartered Institute of Arbitrators** [counsel: or CEDR Rules] in force at the date of the notice; one arbitrator appointed by agreement within 14 days, failing which by the President of the Chartered Institute of Arbitrators; the **seat is London**; the language is English; the law governing this arbitration agreement is the law of England and Wales.
7.3 Claims up to £25,000 are decided on documents only unless the arbitrator directs a hearing.
7.4 Either party may still go to court for urgent interim relief.
7.5 Each party bears its own costs unless the arbitrator decides otherwise. Gala Dock is not a party and pays no fees.

## 8. Deadline rules (business parties only)
8.1 These rules apply only to disputes opened after this policy is in force, between business parties, where both have accepted these rules (express tick at the first commercial step).
8.2 **Deemed acceptance.** A recommendation not rejected within 7 days is treated as accepted.
8.3 **Escalation.** Rejecting a recommendation requires proof of filing (provider and case reference, or a court claim number) within 14 days; otherwise the rejection is withdrawn and 8.2 applies.
8.4 **Lapse.** An opening party that does nothing for 14 days lapses its dispute.

## 9. How these rules bind buyer and seller
Every booking and ticket includes the **Standard Booking Terms**, under which buyer and seller each agree with the other to this policy (as it applies to them). Sellers accept them when they publish their first listing or set up payouts; buyers at checkout.

## 10. Alternative dispute resolution
Gala Dock isn't a member of an ADR scheme for buyer–seller disputes. Sellers may name an ADR body in their listing. Consumers may use any ADR body the seller agrees to, and the courts.

## 11. Confidentiality and data
Statements, evidence and the case pack are confidential to the parties, Gala Dock and any independent body or court the parties use. Gala Dock keeps dispute records for 6 years after closure (Data Retention Schedule).

## 12. Conduct
Gala Dock may restrict a party that is abusive, files fabricated evidence or harasses the other party, under the Acceptable Use Policy.

## 13. The default rule
If a dispute is still open when the payment provider's hold limit is reached, the disputed amount is refunded to the customer and the rest is paid out to the seller (Payment Terms 8.4). This is **not a decision on the dispute**. The customer remains liable to the seller for the refunded amount unless a court, arbitrator or ADR body decides otherwise or the parties agree.

---
*Engine:* unchanged clauses match `dispute_route`, `dec107_dispute_deadlines`, two-person award constraint and the case pack. New: 7.1 referral notice can be the existing "request independent" action; 9 needs the seller-side acceptance at listing/payout set-up (currently `accept_dispute_rules` RPC has no UI tick).
