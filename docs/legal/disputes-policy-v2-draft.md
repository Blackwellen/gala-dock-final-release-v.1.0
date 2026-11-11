# Gala Dock Disputes Policy (version gd-dr-1.0-2026-11-11)

> **DRAFT — not in force. For director sign-off.**
> - Written 2026-11-11 to match migration 202611116002.
> - The deadline rules in clause 8 apply only from the date this policy is published. That date goes into `dec107_settings.dispute_rules_in_force_from`; until it is set (now NULL), no lapse or deemed-acceptance rule runs.

## 1. Scope
This policy covers disagreements between a customer and an organiser, venue or supplier about a booking or ticket made through Gala Dock. Card chargebacks are decided by the card issuer, not by Gala Dock.

## 2. Gala Dock only recommends
Gala Dock may review the evidence and the booking terms saved at the time of booking, and may issue a **non-binding recommendation**. Gala Dock never decides a dispute and never moves money on its own judgement.

## 3. How money moves
Money moves only when:
- (a) both parties accept the recommendation;
- (b) the parties settle (one offers, the other accepts);
- (c) an independent award is entered, checked by a second member of Gala Dock staff against the document;
- (d) the default rule in clause 13 applies.

Gala Dock then carries out exactly that outcome. Refunds go to the original payment method; the booking admin fee is not refunded (Payment Terms 2.3).

## 4. Opening a dispute
Open a dispute from the booking within 24 hours after the event ends. While it is open, the payment stays in the seller's Stripe balance and is not paid out.

## 5. Independent resolution
The parties file with an independent provider (for example CEDR or ProMediate) or the court **themselves**. Gala Dock does not fill in forms or pay provider fees. Either party can download a **case pack** from the dispute, containing:
- the booking terms;
- the payments;
- the timeline, with fingerprints of every statement and file;
- the recommendation;
- the settlement offers.

## 6. Consumer customers
6.1 **Claims of £5,000 or less.** Arbitration is **never** required of a consumer for a claim of £5,000 or less (Arbitration Act 1996 s.91 and the 1999 Order).
- Claims up to £250: settlement or court.
- Claims from £250 to £5,000: mediation if both agree, or court.

6.2 **Claims over £5,000.** Arbitration applies only if the consumer agrees to it after the dispute has started.

6.3 **Silence.** Silence never binds a consumer.

## 7. Business customers and sellers
Above £250, either party may refer the dispute to binding arbitration with an agreed provider.

## 8. Deadline rules
8.1 **Which disputes.** These rules apply only to disputes:
- opened after this policy is in force;
- between business parties;
- where both parties have accepted these rules.

8.2 **Deemed acceptance.** A recommendation not rejected within 7 days is treated as accepted.

8.3 **Escalation.** Escalation needs proof of filing (provider and case reference, or a court claim number) within 14 days.

8.4 **Lapse.** An opening party that does nothing for 14 days lapses its dispute.

## 13. The default rule
If a dispute is still open when the payment provider's hold limit is reached, the disputed amount is refunded to the customer and the rest is paid out to the seller (Payment Terms 8.4).
- This is not a decision on the dispute.
- The customer remains liable to the seller for the refunded amount unless a court, arbitrator or ADR body decides otherwise.

---
## Engine review (2026-11-11)

| Clause | Engine | Status |
|---|---|---|
| 2, 3 | `admin_dispute_update` refuses staff "resolved"; `decide_cancellation` refuses staff amounts; `dec107_dispute_close` | matches |
| 3(c) second-person check | `booking_dispute_awards_second_person` constraint + `adm_dispute_award_check` | matches |
| 4 | 24-hour window | matches (202611116007: `dispute_window_closed` after event end + 24 h; cancellations stay disputable; demo/QA exempt) |
| 5 case pack | `/api/disputes/[id]/case-pack` | matches |
| 6 tiers | `dispute_route` | matches |
| 8 | `dec107_dispute_deadlines` implements 8.2, 8.3 (`dispute_request_independent` / `dispute_record_filing`, withdrawn after 14 days without filing) and 8.4 (lapse after 14 days of opener inaction) | matches (202611116007), all gated by `in_force_from` (NULL) |
| 13 | `dec107_default_rule_notice` cites "Disputes Policy (version), clause 13" once in force, before that "Payment Terms clause 8.4" | matches |

Clause numbering jumps from 8 to 13 deliberately, so that the engine's citation of clause 13 holds. Renumbering needs a code change (`dec107_default_rule_notice`).
