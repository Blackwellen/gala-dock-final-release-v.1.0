# Insulation map: how Gala Dock is protected, scenario by scenario (Q54, 2026-11-14)

> **AI review, not legal advice.** For each risk: the clause that protects Blackwellen Limited today, how strong it is, the gap, and the v3 fix. "Today" means the texts actually incorporated into user contracts: only `/terms`, `/ticket-terms`, `/privacy` and the express Payment Terms tick (once v2 is published). Repo-only documents are listed as "not incorporated" (behaviour-mismatches M-01).
>
> Strength: **Strong** = likely to work as drafted. **Moderate** = works if incorporated and found reasonable. **Weak** = arguable at best. **None** = no protection.

## The five layers of insulation

1. **Structure (DEC-107).** The seller is merchant of record on its own Stripe account; Blackwellen never holds buyer money; staff only recommend. This is the strongest protection and is built. The words must match it (they don't yet).
2. **Contract allocation.** Seller-is-responsible clauses, indemnities, caps and exclusions in published, accepted business terms.
3. **Statutory safe harbours.** e-Commerce Regulations 2002 reg 19 (hosting), Defamation Act 2013 s.5 and s.10, OSA compliance as a defence to Ofcom enforcement, PSRs technical-service exclusion.
4. **Money mechanics.** Ticket balances kept in the organiser's balance until event end + 5 UK business days; reserves; chargeback holds; refunds from the seller's balance; Stripe-managed losses.
5. **Insurance** (not yet arranged, as far as the repo shows): Blackwellen's own tech E&O/professional indemnity, cyber, public liability and D&O. Contract terms can't replace insurance for the losses the law won't let you exclude.

## Scenario map

### S1. Event cancelled and the organiser is insolvent

| | |
|---|---|
| **What happens** | Buyers are owed refunds. Ticket money sits in the organiser's own Stripe balance until event end + 5 UK business days (dec107 §9.1). On insolvency, the balance is the organiser's asset; an administrator/liquidator controls it; dispositions after a winding-up petition may be void (Insolvency Act 1986 s.127). Buyers claim chargebacks or CCA s.75 (cash price per item over £100). |
| **Protecting clauses** | Payment Terms v2 1.1–1.2 (seller is merchant; we never hold money), 6.1–6.3 (refunds and chargebacks come from the seller), 6.4 (ticket balance as reserve); `/terms` §1 (contract is with the organiser); Organizer 9.4–9.5 (not incorporated). |
| **Strength** | Structure: **Strong** — Blackwellen holds no buyer money, so it is not a debtor to buyers for ticket refunds. Contract: **Weak** today because of the v2 6.3 sentence. |
| **Gap** | (1) **Payment Terms v2 6.3: "Any amount still uncovered is borne by Gala Dock."** A consumer could argue (CRA s.69, most favourable meaning) that this guarantees refunds the organiser can't pay. (2) Live `/terms` §1 and `/ticket-terms` say Gala Dock "collects payments"/"sells tickets on the organiser's behalf" — a buyer could plead Gala Dock as the contracting seller or an undisclosed principal. (3) No statement that a refund depends on the organiser's balance. (4) With Stripe-managed losses (`losses.payments=stripe`), Stripe bears negative balances; if live falls back to platform-managed losses, Blackwellen's own balance takes Stripe's reserve (cross-brand §1). |
| **Fix (v3)** | Payment Terms v3 6.4: "As between Gala Dock and the seller … Gala Dock may decide to absorb … This is not a promise to any buyer, and Gala Dock is not liable to pay any refund that a seller owes." Ticket Terms v3 §3: refunds come from the organiser; if the organiser cannot pay, the buyer keeps chargeback and s.75 rights; Gala Dock will provide the case records. Organiser Terms v3 §9 insolvency notice duty + Payment Terms 9.1(e) pause on insolvency. Owner decision D3 on platform-managed losses. |

### S2. Supplier no-show

| | |
|---|---|
| **What happens** | Customer wants a refund and maybe consequential losses (replacement supplier, guests' costs). Money is still in the supplier's balance (release waits for customer confirmation or event end + 24 h; dispute blocks release). |
| **Protecting clauses** | `/terms` §1 (contract with provider; provider responsible), §5.5 (provider liable, indemnifies us), §10.2 (consumer: provider not us); Provider 10.3–10.4 (not incorporated); Payment Terms 3.3 (dispute blocks release), Disputes Policy (recommend only; settlement; default rule). |
| **Strength** | **Moderate.** Structure protects money; liability for consequential loss sits with the supplier. |
| **Gap** | (1) No customer–seller contract carries the dispute rules (X-3). (2) `/terms` §9 still says Gala Dock decides (P1). (3) Refund Policy 3.1 "no policy → Gala Dock review" makes us the decider. (4) Gala Dock "replacement/standby" suggestions could create an assumption of responsibility if presented as guaranteed. (5) If the dispute stays open to the hold limit, the default rule refunds the customer — fine. |
| **Fix** | Standard Booking Terms [24] (supplier no-show = full refund of amounts paid for that booking; consequential losses between the parties); Disputes v3; Customer Terms v3 §10.3; Provider v3 §10 indemnity incorporated by tick at first listing. |

### S3. Chargeback larger than the reserve

| | |
|---|---|
| **What happens** | Stripe debits the seller's balance; if short, the balance goes negative. With Stripe-managed losses, Stripe bears the negative balance and may pursue the seller; with platform-managed losses, Stripe debits Blackwellen's platform balance. |
| **Protecting clauses** | Payment Terms v2 6.2–6.3 (seller liable; recovery order: reserve, later releases, Stripe bank debit); reserves §5; `capGroupToAvailable` and `dec107_covered_liabilities`; Organizer 9.5 / Provider 10.4 indemnities (not incorporated). |
| **Strength** | **Moderate** (seller liability is clear) but **Weak** on recovery beyond later releases: no invoice/collection steps (covered-liability ledger depth not built, dec107 §6 item 1). |
| **Gap** | (1) v2 6.3 "borne by Gala Dock" (see S1) also reads as a waiver of the seller debt. (2) No contractual debt-collection step, interest or costs. (3) No 30-day challenge step (Gigvora 11.2), which weakens a fairness/reasonableness defence. (4) Seller account closure survives? Not stated. |
| **Fix** | Payment Terms v3 6.3–6.6: recovery order incl. invoice payable in 14 days, statutory interest (Late Payment of Commercial Debts (Interest) Act 1998 for business sellers), costs of recovery; 30-day challenge; survival; Gala Dock absorption is discretionary and preserves the debt. Owner decision D3. |

### S4. Injury at a venue

| | |
|---|---|
| **What happens** | Attendee injured (crowd crush, food allergy, collapse). Claims against occupier (Occupiers' Liability Act 1957), organiser and supplier in negligence. A claimant may join Gala Dock alleging it "verified" the venue/supplier, showed an "insurance badge", or set the capacity on its seat plan. |
| **Protecting clauses** | `/terms` §5.2–5.5 (licences, insurance, providers liable, indemnity); §10.1 (we don't exclude death/PI from our negligence — correct, CRA s.65/UCTA s.2(1)); Venue 1.2, 2.1–2.3; Provider 4.3 (PL insurance), 10.3 (not incorporated); Provider 2.3 badges "not a guarantee" (not incorporated). |
| **Strength** | **Moderate.** Gala Dock is not occupier and doesn't control the event; duty of care unlikely absent assumption of responsibility. Indemnity useful only if the indemnifier is solvent and insured. |
| **Gap** | (1) Badges: published wording must say exactly what was checked and when (CRA s.50 / *Hedley Byrne*). (2) Insurance minimum text £2m vs code £1m (M-50). (3) Seat-map/venue-plan tools: capacity numbers come from the venue; terms must say Gala Dock doesn't validate capacity or fire safety. (4) No Gala Dock public liability / professional indemnity insurance evidenced. (5) Martyn's Law duties for qualifying events not mentioned (verify commencement). |
| **Fix** | Venue v3 §1–2 (capacity/fire safety responsibility, Gala Dock tools don't check compliance); Supplier v3 §4.3 (PL £[1m/2m], EL where required, product liability for food; insurer named as able to respond); Community v3 badge definitions; owner to buy Blackwellen PL + PI/tech E&O cover (D12). |

### S5. Defamatory review

| | |
|---|---|
| **What happens** | A supplier says a customer review is false and defamatory and sues Gala Dock as publisher. |
| **Protecting clauses** | Customer Terms 8 and Community §3 (not incorporated); e-Commerce Regs 2002 reg 19 (hosting defence: no actual knowledge, act expeditiously); Defamation Act 2013 s.10 (court has no jurisdiction against a non-author unless not reasonably practicable to sue the author) and s.5 (website operator defence if it follows the Website Operators Regulations 2013 notice procedure). |
| **Strength** | **Moderate** statutory protection, **Weak** procedurally: no s.5 notice-of-complaint process, no review report button (M-70). |
| **Gap** | (1) s.5 requires passing the complaint to the poster within 48 hours and acting on the response (SI 2013/3028) — no process. (2) Gala Dock actively curates reviews ("Verified booking" label; reliability score); editing beyond moderation risks losing hosting status. (3) Indemnity from the reviewer (consumer) is weak and shouldn't be relied on. |
| **Fix** | Community v3 §3.6 (s.5 procedure, timings, poster's choice to keep or remove); report button on every review; moderation log; Terms v3 §7 licence + user warranty. |

### S6. Illegal content (fraud listing, hate, CSEA, terrorism, illegal ticket touting)

| | |
|---|---|
| **What happens** | Ofcom enforcement for failing OSA duties (fines up to £18m or 10% of qualifying worldwide revenue — verify), criminal exposure for senior managers in some information-offence cases, civil claims by victims of fraud listings. |
| **Protecting clauses** | `/terms` §6 (AUP), AUP/Community/Safeguarding (not incorporated); reg 19 hosting defence (civil/criminal liability for content, not OSA duties). |
| **Strength** | **Weak.** OSA duties are regulatory duties; terms don't discharge them. No illegal content risk assessment or children's access assessment recorded; no user report flow for most content. |
| **Gap** | See `online-safety-act.md`. |
| **Fix** | Do the assessments; build report + complaints; name an accountable senior person; v3 Terms §8 and AUP §§8–11; record-keeping (OSA s.23). |

### S7. Data breach

| | |
|---|---|
| **What happens** | ICO enforcement (UK GDPR fines up to £17.5m/4%); claims by data subjects (Art 82; *Lloyd v Google* [2021] UKSC 50 limits representative actions; low-value claims still possible); organisers claim against Gala Dock as processor. |
| **Protecting clauses** | Privacy §10; DPA Annex 2, §4 (48 h notice) (not incorporated); Organizer 9.2–9.3 cap and data-loss exclusion (not incorporated); `/terms` §10.3 cap for business users. |
| **Strength** | **Weak** vis-à-vis organisers (no binding DPA, so Gala Dock is also in breach of Art 28(3)); cap applies only through `/terms`. |
| **Gap** | (1) Publish the DPA (X-1). (2) DPA silent on liability; data-loss exclusion "except where we failed to apply reasonable backup" not present. (3) Privacy notice inaccuracies (Anthropic etc.) are themselves Art 13 breaches. (4) No cyber insurance evidenced. (5) Backups retention statement missing. |
| **Fix** | DPA v3 §10 (cap applies; Art 82 apportionment; controller indemnity for unlawful instructions); Privacy v3; cyber insurance (D12). |

### S8. Tax reassessment on fees

| | |
|---|---|
| **What happens** | HMRC argues (a) Gala Dock supplied tickets/bookings in its own name (VATA s.47(3)) → output VAT on the full price; or (b) the booking fee is the organiser's consideration, not Gala Dock's; or (c) place of supply wrong (overseas sellers/events); or (d) PORR penalties; or (e) deemed supplier of merch goods (s.5A). |
| **Protecting clauses** | None effective. Organizer 6.5 / Provider 5.5 VAT clauses (not incorporated; Provider has a "[Tax adviser]" placeholder). |
| **Strength** | **None/Weak.** |
| **Gap** | See `tax-and-reporting.md`. Live words ("Gala Dock sells tickets on the organiser's behalf", "collect payments on their behalf") support HMRC argument (a). |
| **Fix** | v3 Ticket/Organiser/Payment terms: organiser sells in its own name; Gala Dock is a disclosed agent only to conclude contracts in the organiser's name and to collect its own booking fee through the seller's charge. Seller tax indemnity (business users). Tax adviser opinion before live (D6). |

### S9. Seller in a blocked or sanctioned country

| | |
|---|---|
| **What happens** | (a) Unsupported Connect country: enquiry-only listings, off-platform payment, consumer loses money, blames Gala Dock. (b) Sanctioned country/person: Gala Dock makes "economic resources" (listings, promotion) available to a designated person, or provides restricted services (e.g., advertising services to persons connected with Russia — verify the Russia Regs 2019 professional-services prohibitions). |
| **Protecting clauses** | Product: enquiry-only trigger; checkout refusal copy. Terms: none (country rules absent; off-platform payments prohibited, which contradicts the product). |
| **Strength** | **Weak** for (a); **None** for (b) (no screening or block; payout-pause basis cites screening that doesn't exist). |
| **Gap** | M-51–M-53. |
| **Fix** | Terms v3 §2.2 (eligibility: not a sanctioned person; not resident in a comprehensively sanctioned territory), §4A (country rules, enquiry-only, off-platform payments not covered by Gala Dock, buyer warning); block comprehensively sanctioned territories at sign-up and listing (D4); Payment Terms 9.1(d) reworded. |

### S10. Partner fraud

| | |
|---|---|
| **What happens** | Self-referrals, fake accounts, stolen cards to buy plans, commission harvested before chargebacks land, partner disappears with commission later clawed back. |
| **Protecting clauses** | Built: 60-day earning hold, click-time cookie attribution, fingerprinting, clawback, negative carry-forward, transfer reversal, risk holds. Text: Partner Terms 2.2 (no fees on fraud/self-referral) — accepted by tick but text unpublished and silent on hold, clawback, set-off and reversal. |
| **Strength** | **Moderate** technically; **Weak** contractually (clawback and reversal have no clear contractual basis; recovering a paid commission falls back on restitution/unjust enrichment). |
| **Gap** | M-30–M-43. Self-billing agreement missing (VAT). No right to withhold on investigation with time limit; no audit right; no indemnity for partner marketing breaches (PECR spam, CAP). |
| **Fix** | Partner v3 §§5–10 (hold, minimum, clawback, set-off against future commission only, transfer reversal consent, investigation hold up to 90 days with reasons, audit, PECR/CAP indemnity, termination for fraud with forfeiture of unearned commission), Schedule 1 self-billing. |

## Additional scenarios worth mapping

| # | Scenario | Protection today | Gap | Fix |
|---|---|---|---|---|
| S11 | Buyer chargeback on a ticket, buyer turned away | Built hold/restore/void | No ticket-terms clause (M-19); transferee loses ticket | Ticket Terms v3 §8; transfer warning §4 |
| S12 | Organiser sues over a held or delayed payout | Payment Terms 3, 8, 9 (on acceptance) | Trust-suspension pause not a listed ground (M-17); cap wording "money we hold" | Payment Terms v3 9.1(g); Terms v3 §12.5 misdirected-instruction carve-out |
| S13 | FCA says Gala Dock provides payment services | DEC-107 structure | Admissions in live/repo texts (X-2); manual payout control as possible payment initiation (verify) | Remove admissions; perimeter opinion (CQ-1) |
| S14 | CMA action on fees/reviews (DMCCA direct enforcement, fines up to 10% global turnover) | Built drip-pricing fixes; Verified booking fix | No published review-integrity policy; non-refundable booking fee transparency | Community v3 §3; Ticket/Customer v3 fee wording |
| S15 | EU consumer sues in their home court; EU regulator (DSA) | `/terms` §13 (E&W law) | Brussels Ia Art 18(1) lets EU consumers sue at home; Rome I Art 6 mandatory rules; DSA Art 13 representative missing | D2 decision; Terms v3 §15 |
| S16 | Gala Agent autopilot sends a binding quote in error | AI Terms 3.4 (not incorporated) | Not incorporated; no express term at enabling autopilot | AI Terms v3 3.5 tick |
| S17 | Employment status claim by an entertainer/DJ | Provider 1.1–1.2 (not incorporated) | Indemnity for the seller's own status claim would be void (ERA s.203); controls list missing | Supplier v3 §1 (Gigvora 2.7 model); no such indemnity |
