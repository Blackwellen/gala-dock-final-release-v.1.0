# Legal source register

> **Draft for specialist UK legal review before production publication.** The "date checked" column records when the drafting team last consulted each source. It is not a legal opinion that the source has been applied correctly.

**Jurisdiction for all documents:** England and Wales, with UK-wide consumer and data protection law. EU users (EEA consumers) raise additional questions, flagged per document.

## Statutes and regulations relied on

| Source | Used in | Date checked | Notes |
|---|---|---|---|
| Consumer Rights Act 2015 (Parts 1–2: digital content, services, unfair terms) | Customer, Ticket, Refund, Organizer/Provider (B2C passthrough) | 11 Oct 2026 | Non-excludable liability; fairness and transparency of terms; services "with reasonable care and skill" |
| Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 | Customer, Ticket, Refund, Credit packs | 11 Oct 2026 | **Reg. 28(1)(b):** leisure services for a specific date are exempt from the 14-day cancellation right (tickets, venue hire for consumer events). Digital content consent/acknowledgement for credit packs |
| Digital Markets, Competition and Consumers Act 2024 (Part 4 consumer protection; drip pricing; fake reviews; subscription contracts regime) | Customer, Ticket, Community Standards, Organizer, Provider, plans | 11 Oct 2026 | Unavoidable fees must be included in the headline price. Fake/incentivised review prohibitions. **Subscription contract rules: confirm the commencement date and apply them to paid plans before launch** |
| Consumer Protection from Unfair Trading Regulations 2008 → replaced by DMCC Act 2024 Part 4 Ch.1 | as above | 11 Oct 2026 | Confirm transitional provisions |
| Consumer Rights Act 2015 ss.90–95 (secondary ticketing information duties) | Resale, Ticket | 11 Oct 2026 | Seller identity, seat/row, restrictions and face value must be disclosed. **Refresh immediately before release** (government consultation on resale price caps; any new law must be checked) |
| Criminal Justice and Public Order Act 1994 s.166 (football ticket touting) | Resale | 11 Oct 2026 | Resale of designated football match tickets is prohibited without authorisation; block the category |
| Breaching of Limits on Ticket Sales Regulations 2018 (bots) | Resale, AUP | 11 Oct 2026 | Using software to exceed purchase limits is an offence |
| UK GDPR and Data Protection Act 2018 | Privacy, DPA, Safeguarding, Break-glass DPIA, AI terms | 11 Oct 2026 | Arts. 5, 6, 9, 12–22, 28, 32–34, 35 |
| Privacy and Electronic Communications Regulations 2003 (as amended by the Data (Use and Access) Act 2025) | Cookies, marketing email | 11 Oct 2026 | Confirm the DUAA 2025 commencement and any expanded consent exemptions (analytics). **Open issue:** `gd_ref` promoter attribution cookie is set without consent |
| Data (Use and Access) Act 2025 | Privacy, DSAR, cookies | 11 Oct 2026 | Confirm which provisions are in force at release (complaints handling, "reasonable and proportionate" DSAR searches, automated decision-making changes) |
| Equality Act 2010; Public Sector Bodies Accessibility Regulations 2018 (not directly applicable, used as a WCAG 2.2 AA benchmark) | Accessibility | 11 Oct 2026 | Reasonable-adjustment duty for service providers |
| Electronic Commerce (EC Directive) Regulations 2002 | Platform, IP/takedown | 11 Oct 2026 | Hosting defence (reg. 19) relies on expeditious removal on actual knowledge |
| Online Safety Act 2023 | Community, Safeguarding, Messaging | 11 Oct 2026 | **Determine whether user-to-user messaging and reviews bring Gala Dock in scope as a user-to-user service.** If so: illegal content risk assessment, reporting and complaints duties |
| Payment Services Regulations 2017; Electronic Money Regulations 2011 | Payment protection | 11 Oct 2026 | Gala Dock relies on Stripe (authorised) and the commercial agent / marketplace model. **Counsel must confirm Gala Dock does not itself provide regulated payment services** given held funds and release on delivery |
| Licensing Act 2003 | Venue, Bar packages | 11 Oct 2026 | Alcohol sales require premises licence and DPS; Gala Dock doesn't hold licences |
| Value Added Tax Act 1994; HMRC VAT Notice 700/1 & 741A (place of supply of services) | Credit packs, fees, DPA billing | 11 Oct 2026 | VAT on platform fees and commission; marketplace agent vs principal treatment to be confirmed by a tax adviser |
| Copyright, Designs and Patents Act 1988 | Content/Template, IP takedown | 11 Oct 2026 | |
| Children Act 1989 / Working Together to Safeguard Children (2023) | Safeguarding | 11 Oct 2026 | Platform is not a regulated activity provider; policy covers reporting and cooperation |

## Regulator and industry guidance

| Source | Used in | Date checked |
|---|---|---|
| ICO: Guidance on cookies and similar technologies; right of access guidance; DPIA guidance; AI and data protection guidance | Cookies, DSAR, Break-glass, AI terms | 11 Oct 2026 |
| CMA: Guidance on unfair contract terms (CMA37); secondary ticketing undertakings and enforcement history; DMCC Act guidance on drip pricing and fake reviews | Customer, Ticket, Resale, Community | 11 Oct 2026 |
| W3C WCAG 2.2 | Accessibility | 11 Oct 2026 |
| Stripe Connect service agreement and documentation (separate charges and transfers; funds holding limits) | Payment protection, Provider terms | 11 Oct 2026 |

## Implementation map (code that each document describes)

| Mechanism | Code | Documents |
|---|---|---|
| Payment protection and release (delivery evidence or 48 h after the event; blocked by open dispute, chargeback or pending cancellation) | `payment_release_scan()` in `202610180001_payments.sql`; `docs/architecture/payments.md` | Payment protection, Provider, Venue, Customer |
| Cancellation quote from the provider's tiered policy; provider cancellation = full refund; force majeure → review | `cancellation_quote()` in `202610170001_marketplace.sql` | Refund policy, Customer, Provider, Venue |
| Booking disputes, evidence, admin decisions with reasons | `booking_disputes`, `decide_dispute` | Payment protection, Complaints |
| Resale at no more than the price paid, capped by the event's `resale_cap_pct`; new code issued to the buyer | `202610130016_resale.sql` | Resale terms |
| Ticket credentials (rotating QR, print credential) | `src/lib/tickets/credentials.ts` | Ticket, Resale |
| Gala Agent risk levels, approvals, credits and caps; no chain-of-thought storage | `src/lib/agent/*`, `202610270005_ai_credits.sql` | AI terms |
| Break-glass conversation access | `202610250002_break_glass.sql`, `docs/compliance/dpia-break-glass-access.md` | Privacy, Safeguarding |
| DSAR tracking and erasure | `202610270008_privacy.sql`, `/api/cron/privacy` | Privacy, DPA |
| Template publishing strips event data and private images | `publish_template()`; `publishTemplate` | Content/Template |
| Promoter attribution | `/r/[code]`, `promoter_track_click` | Promoter terms, Cookies |

## Assumptions requiring confirmation

1. **Merchant of record and payment model.** Gala Dock is merchant of record for marketplace bookings (separate charges and transfers) and acts as commercial agent for providers. Confirm this against PSRs, the agent-vs-principal VAT position and the Stripe agreement.
2. **Ticket sales.** The organiser is the seller of the ticket and Gala Dock is its agent. Confirm the organiser agreement wording and the VAT treatment of booking fees.
3. **Online Safety Act scope.** Messaging, reviews and community templates may make Gala Dock a user-to-user service.
4. **Resale law.** Refresh secondary-ticketing law and any price-cap legislation immediately before release.
5. **Subscription contracts regime** (DMCC Act Part 4 Ch.2). Confirm the commencement date, and the reminder, cooling-off and easy-exit requirements for paid plans.
6. **EU consumers.** Decide whether to target the EEA. If so, review the Omnibus Directive, the DSA (platform obligations) and EU GDPR representative requirements.
7. **Company details.** Company number, registered address, VAT number and ICO registration must be inserted from verified records.
