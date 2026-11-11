# Gala Dock: payments and disputes setup

Status: owner's decided model for all Blackwellen marketplaces (Propvora DEC-107, 2026-11-10). It is a draft until the payments solicitor gives a written opinion, and live marketplace payments stay off until then. The shared reasoning is in the Propvora repo at `docs/requirements/payments-insulation-model.md`.

## Principle
Blackwellen Ltd never **holds** customer money and never **decides** where it goes. Money moves only on a party's instruction, a rule both parties agreed in advance, an independent award, or the card network. Gala Dock passes those instructions to an FCA-authorised payment firm as a technical service provider (PSRs 2017 Sch 1 Pt 2 para 2(j)).

## How money is held
- **Payment firm:** Stripe Payments UK Ltd, an FCA-authorised e-money institution.
- **Seller accounts:** every venue, event provider (catering, photography, décor, etc.) and ticketing organiser has a **Stripe Custom connected account**.
  - Sellers have no Stripe dashboard and cannot withdraw money themselves.
  - Payouts are **manual**.
  - Gala Dock never shows the Payouts component and never enables Instant Payouts.
- **Charges:** customers pay by **direct charge** into the seller's account. The seller is the merchant of record.
- **Gala Dock's commission:** taken only as an application fee. It is the only money that reaches Blackwellen.
- **Refunds:** come from the seller's balance.
- **Losses:**
  - the seller's bank is debited to cover a negative balance;
  - new or high-risk sellers have a reserve held in their own balance;
  - sellers are liable for chargebacks and cancellation refunds on their sales.
- **Timing:** nothing is held more than about **80 days** before the event.

## Venue and provider bookings
- **Charge:** no earlier than **80 days before the event date**. Weddings and other events booked a year or more ahead save the customer's card at booking, and it is charged automatically at 80 days.
  - Any booking deposit follows the same rule.
  - Alternatively, a provider takes its own deposit outside the platform, and the terms state that Gala Dock does not hold it.
- **Release:** automatic **24 hours after the event date**, unless the customer raises an issue in that window.

## Tickets (organiser sells to guests)
- **Charge:** at purchase, into the organiser's account. The organiser is the merchant of record.
- **Release:** 24 hours after the event.
- **Event cancelled:** the pre-agreed rule refunds ticket holders in full from the funds held. It is automatic, not a staff decision.
- **Tickets sold more than 80 days before the event** would go past the hold limit. **Owner decision needed:**
  - (a) open ticket sales only within 80 days of the event;
  - (b) release earlier sales to the organiser at purchase, with a seller reserve and the organiser liable for cancellation refunds;
  - (c) confirm with Stripe whether a longer hold is allowed for event tickets.

## Release ladder (the same for every payment)
1. The customer confirms delivery, or the event passes with no issue, and the money is released.
2. The agreed review window ends with no dispute, and the money is released automatically.
3. The customer disputes inside the window. The disputed amount stays locked by agreement, and any undisputed part is released.
4. The parties settle through platform offers, and Gala Dock carries out exactly what they agreed.
5. Either party escalates to independent resolution, and Gala Dock carries out the award.
6. The hold limit is reached first. The pre-agreed default rule applies: the disputed amount is refunded to the customer and the rest is released to the seller. Both parties get a warning 10 days before.
7. Card chargebacks remain open to the customer at all times.

**Staff only mediate and give non-binding recommendations.** An admin can move money only by entering an independent award, and that needs a document reference plus a check by a second person.

## Independent resolution tiers
| Disputed amount | Business customer | Consumer customer |
|---|---|---|
| Up to £250 | Settlement, then the default rule | Same |
| £250–£5,000 | Binding arbitration | Optional ADR. Binding only if both agree after the dispute starts (Arbitration Act 1996 ss.89–91) |
| Over £5,000 | Binding arbitration | Subject to the solicitor's review |

The fee is paid **directly to the provider**, never through Gala Dock. Candidates are CEDR and ProMediate.

## Legal notes
- **Cancellation rights:** leisure services on a specific date (events, venue hire, tickets) have no statutory 14-day cancellation right (CCR 2013 reg 28(1)(b)). Cancellation terms are contractual and must be shown before purchase.
- **Terms drafting:** ticket resale and secondary ticketing rules apply if resale is ever offered. They need checking with the solicitor before it is built.

## Build status
This model needs building into Gala Dock's payments from the start. None of it exists there yet.

## Waiting on
- The solicitor's written opinion.
- Stripe confirming the exact hold limit for manual payouts.
- The owner's ticket decision: (a), (b) or (c).
