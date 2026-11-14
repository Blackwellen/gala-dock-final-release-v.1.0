# Questions for counsel (ranked) (Q54, 2026-11-14)

> Prepared by an AI review for a barrister or solicitor (and, for §B, a chartered tax adviser). Each question states the facts relied on, our provisional view, and where to look. **Our provisional views are not legal advice**; the point of this list is to let counsel confirm or reject them quickly. Rank 1 = most money or regulatory exposure.
>
> Facts pack: `docs/backend/payments/dec107-gala-dock.md` (money model), `docs/legal/review-2026-11/behaviour-mismatches.md` (what the product does), `redlines/` (proposed v3 texts).

## Ranked order (answer these first)

| Rank | Question | Who |
|---|---|---|
| 1 | CQ-1 payment-services perimeter of DEC-107 (incl. e-money redemption, payout control) | payments regulatory solicitor |
| 2 | CQ-2 Gala Dock shortfall wording | solicitor |
| 3 | CQ-19 Online Safety Act scope, assessments, age | regulatory solicitor |
| 4 | CQ-3 organiser insolvency and ticket money | insolvency/commercial |
| 5 | CQ-7 booking-fee VAT characterisation, s.47(3) | tax adviser |
| 6 | CQ-8 place of supply (overseas sellers/events) | tax adviser |
| 7 | CQ-21 sanctions controls for non-paying users | sanctions solicitor |
| 8 | CQ-20 EU presence (DSA Art 13, GDPR Art 27) or UK-only | regulatory solicitor |
| 9 | CQ-4 customer–seller Standard Booking Terms | commercial barrister |
| 10 | CQ-9a platform reporting (PORR) and DAC7 | tax adviser |
| 11 | CQ-5 chargeback ticket holds fairness | consumer barrister |
| 12 | CQ-9 cancellation rights for bookings; reg 28 paragraph | consumer barrister |
| 13 | CQ-10 fee retention on organiser cancellation | commercial barrister |
| 14 | CQ-11 DMCCA drip pricing, reviews, subscriptions | consumer solicitor |
| 15 | CQ-12 resale and CRA s.90 | consumer solicitor |
| 16 | CQ-16 liability cap reasonableness | commercial barrister |
| 17 | CQ-18 jurisdiction for international users | commercial barrister |
| 18 | CQ-14 24-hour dispute window | consumer barrister |
| 19 | CQ-26 employment status / Employment Agencies Act | employment solicitor |
| 20 | CQ-17 business arbitration clause | arbitration practitioner |
| 21 | CQ-22 controller/processor split | data protection |
| 22 | CQ-23 trust documents retention | data protection |
| 23 | CQ-24 P2B status and exemptions | regulatory |
| 24 | CQ-25 defamation process for reviews | media solicitor |
| 25 | CQ-9b self-billing numbering | tax adviser |
| 26 | CQ-6 product copy "protected" | solicitor |
| 27 | CQ-15 credit expiry | consumer |
| 28 | CQ-27 DPO designation | data protection |
| 29 | CQ-13 football resale | consumer |
| 30 | CQ-29 Martyn's Law | regulatory |
| 31 | CQ-28 accessibility overclaim | consumer |


## A. Payments, regulatory perimeter and structure

**CQ-1. Payment services perimeter.** Buyers pay by Stripe direct charge into the seller's own Stripe connected account (no dashboard, manual payout schedule). Blackwellen receives only an application fee. Blackwellen's software decides **when** Stripe pays the seller's balance out to the seller's bank (release triggers: event end + 5 UK business days for tickets; customer confirmation or event end + 24 h for bookings; settlement; independent award; hold limit), applies objective reserves (10%/30 days; up to 50%/60 days on chargeback/refund thresholds), and can pause payouts on listed grounds. Staff only recommend in disputes.
(a) Is Blackwellen within PSRs 2017 Sch 1 Pt 2 para 2(j) (technical service provider never in possession of funds)? (b) Could controlling payout timing on the seller's Stripe balance be **payment initiation** (excluded from para 2(j))? (c) Is the seller's Stripe balance e-money such that a 90-day manual hold conflicts with the holder's redemption right (EMRs reg 39), and does the seller's agreement with Stripe resolve that? (d) Does a Trust & Safety suspension pausing payouts (M-17) change the analysis?
*Provisional view:* (a) yes, provided the texts stop saying Gala Dock "holds/collects/decides"; (b) unlikely, because payouts go to the seller's own account under the seller's agreement with Stripe; (c) needs checking against Stripe Payments UK's terms. Gigvora's barrister review asked the same question (decision 2).

**CQ-2. Gala Dock's shortfall promise.** Payment Terms v2 6.3 says "Any amount still uncovered is borne by Gala Dock". Owner wants Gala Dock to cover shortfalls. Does this create (a) a contractual obligation to buyers (CRA s.69) or (b) a guarantee/insurance-like obligation (regulated insurance or guarantee issues)? Is the v3 wording ("discretion, owed to no buyer, the seller's debt preserved") effective? *Provisional view:* v2 wording is risky; v3 fixes it.

**CQ-3. Organiser insolvency with ticket money in its Stripe balance.** Ticket money stays in the organiser's balance until event end + 5 business days. If the organiser enters administration or liquidation before an event is cancelled, (a) can Gala Dock instruct refunds from that balance (Insolvency Act 1986 s.127, administration moratorium), (b) does any trust arise in buyers' favour (*Re Kayford*-type), and should the Organiser Terms create one (express trust over ticket proceeds until the event) — and would that undo the perimeter analysis in CQ-1? *Provisional view:* don't create a trust in Blackwellen's name; consider requiring organisers to declare a trust of unreleased ticket proceeds in buyers' favour, or rely on chargebacks/s.75.

**CQ-4. Customer–seller contract.** Our dispute rules (deemed acceptance after 7 days, 14-day filing and lapse, business arbitration, default-rule liability statement) are in Blackwellen's terms. Do they bind customer and seller to each other without a separate contract? Is the proposed Standard Booking Terms (`redlines/24`), accepted by the seller at listing/payout set-up and by the buyer at checkout, sufficient (offer–acceptance through the platform; Contracts (Rights of Third Parties) Act 1999)?

**CQ-5. Chargeback ticket holds.** On a card dispute, tickets of that order (and gift transfers) are held; restored if the seller wins; voided with capacity resold if the buyer wins. Is this fair under CRA Part 2 (Sch 2 para 20: hindering remedies) and lawful vis-à-vis the transferee (who may have paid the original buyer off-platform)? Is the v3 Ticket Terms §8 wording adequate?

**CQ-6. Product copy.** Screens may still say "Paid · protected until delivery" (old model). Is "protected" acceptable if it means "not paid out to the seller until the trigger"? *Provisional view:* replace with "Paid · not yet released to the seller".

## B. Tax (for the tax adviser)

**CQ-7. Booking fee characterisation and s.47(3).** See `tax-and-reporting.md` §2. Confirm the disclosed-collection-agent model for the buyer's booking/admin fee; confirm no VATA s.47(3) exposure once texts say the organiser sells in its own name; any exposure for the period the old words were published (Stripe in test mode, so probably no real supplies).

**CQ-8. Place of supply.** Commission to overseas business sellers (s.7A; land-related intermediary for venues?); booking fees on overseas events/venues (Sch 4A para 10) and the non-Union OSS; recommend restricting paid ticketing/bookings to UK events for launch?

**CQ-9a. PORR 2023.** Classification of ticket sales (personal services?), equipment hire, venue hire (incl. excluded-seller threshold), merch; whether the operator must report the seller's bank account when payment runs through Stripe; first reporting year; registration steps; penalty figures. DAC7: is the UK a qualified non-Union jurisdiction?

**CQ-9b. Self-billing.** Is `GDSB-YYYYMM-<id>` acceptable or must numbering be sequential per partner? Renewal period?

## C. Consumer law

**CQ-9. Cancellation rights for bookings.** Venue hire, catering, entertainment and equipment for a private party on a specific date: within CCRs reg 28(1)(b) (leisure/catering, specific date)? Which supplier services are not (e.g., design, décor made in advance, equipment purchase)? Also confirm the correct paragraph letter: live `/ticket-terms` cites reg 28(1)(g), Customer Terms cite 28(1)(b).

**CQ-10. Fees on organiser cancellation.** Organiser Terms 2.4(b): when an organiser cancels for non-force-majeure reasons, buyers get full refunds (incl. £1 booking fee) and the organiser still pays the 5% seller fee and the refunded £1 booking fees. Reasonable under UCTA s.3(2)(b)/s.11 and not a penalty (*Cavendish v Makdessi*)? Is an express tick enough for incorporation?

**CQ-11. DMCCA.** (a) Is our booking-fee display compliant with the drip-pricing rules (fee included in the first price shown; non-refundable except listed cases)? (b) Review integrity: what "reasonable and proportionate steps" must we publish/take under the fake-review banned practices? (c) Subscription contracts regime: commencement date and what plans/credit packs must do (reminders, cooling-off, easy exit) — note plans are sold to businesses mostly; do any consumers buy them?

**CQ-12. Resale and CRA s.90.** Resale is technically an organiser buy-back: the original holder is refunded on their original charge and the buyer buys a new ticket from the organiser. (a) Is this a "secondary ticketing facility" resale at all? (b) If so, does a masked ticket reference (`GLD-••••-••XXXX`) satisfy any unique-ticket-number requirement in s.90 as amended? (c) Seller identity: is "sold by the event organiser" the right s.90(6)–(7) disclosure? (d) Status of any resale price-cap legislation.

**CQ-13. Football.** Is a category block needed for designated football matches (CJPOA 1994 s.166) for primary resale too, and do we have one?

**CQ-14. Dispute window.** Is a 24-hour post-event window for opening a platform dispute (affecting only payout timing) fair if the text states it does not limit statutory rights, chargebacks or court claims?

**CQ-15. Credit expiry.** AI credits expire after 12 months. Fair for business buyers (UCTA) and, if any consumers buy credits, under CRA Part 2?

## D. Liability, jurisdiction and arbitration

**CQ-16. Liability cap.** Business users: greater of 12 months' fees and £1,000, with misdirected/failed payout instructions uncapped at the amount misdirected. Reasonable under UCTA s.11 for sellers whose annual ticket revenue may be £100k+? Should the floor be higher?

**CQ-17. Arbitration for business disputes.** Is the v3 clause (CIArb rules, sole arbitrator, London seat, English law governing the arbitration agreement per AA 1996 s.6A as inserted by the Arbitration Act 2025, documents-only below £25,000) sound? Any problem with a unilateral option to refer?

**CQ-18. Jurisdiction for international users.** Business: E&W exclusive (Hague 2005). Consumers: home courts + mandatory law (CJJA 1982 s.15B; Brussels Ia Art 18(1); Rome I Art 6). Enforcement of English judgments in the EU under Hague 2019 (in force for the UK from 1 July 2025 — verify). Anything else for US/Canada/Australia/Japan/Singapore sellers (all supported)?

## E. Platforms, data and safety

**CQ-19. Online Safety Act.** Confirm Gala Dock is a regulated user-to-user service, the duties in `online-safety-act.md` §2, and whether a children's access assessment can conclude "not likely to attract a significant number of children" without highly effective age assurance.

**CQ-20. EU presence.** If EU sellers and consumers are accepted: DSA Art 13 legal representative; Arts 11–18; EU GDPR Art 27 representative; EU P2B. Or restrict to UK? Is restricting sellers but not buyers enough?

**CQ-21. Sanctions.** No screening of non-paying users; enquiry-only listings available to users in any non-Stripe country. Does hosting listings for persons in comprehensively sanctioned territories breach SAMLA regimes (economic resources; Russia Regs 2019 professional/advertising services prohibitions — verify)? Minimum controls?

**CQ-22. Controller/processor split.** Organiser attendee data: processor (DPA). Provider customer data: independent controllers. Is this coherent given Gala Dock also uses the same data for payments/fraud?

**CQ-23. Trust documents and retention.** Insurance/licence documents kept for listing life + 6 years; ID images held by Stripe only. Proportionate? Any criminal-offence data (none collected now)?

**CQ-24. P2B.** Is retained P2B still in force as assimilated law, and does the small-enterprise exemption (Arts 11–12) apply? Suspension notice requirements (Art 4) vs the immediate suspension we need for safety.

**CQ-25. Defamation.** Procedure under the Website Operators Regulations 2013 for reviews — adopt, or rely on s.10 and reg 19?

**CQ-26. Employment status.** Personal-service suppliers (DJs, entertainers, crew) and the Employment Agencies Act 1973 / Conduct Regs 2003 reg 26 (fees to work-seekers). Is our seller fee a fee for finding work?

**CQ-27. DPO.** The director is named DPO. Is a DPO mandatory (Art 37), and if so is there a conflict (Art 38(6))?

**CQ-28. Accessibility.** Any exposure from the 12 October "approved" accessibility md that overclaims screen-reader and 400% zoom support (never published)?

**CQ-29. Martyn's Law.** Commencement of the Terrorism (Protection of Premises) Act 2025 duties and what organisers/venues on Gala Dock must be told.
