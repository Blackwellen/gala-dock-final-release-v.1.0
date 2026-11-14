# Clause register: every clause of every Gala Dock legal text (Q54, 2026-11-14)

> **This is an AI review, not legal advice.** It is written so a barrister or solicitor can confirm or correct it quickly. Points marked **(verify)** depend on a statutory detail, commencement date or figure that counsel must check against current law before anyone relies on it. Nothing here is published. The live pages and `src/lib/legal.ts` were **not** changed.

## How to read this

- **Rating:** **H** = could cause a material loss, a regulatory finding, or an unenforceable protection. **M** = should be fixed before v3. **L** = drafting or clarity.
- **Law** gives the main source. Abbreviations: CRA = Consumer Rights Act 2015; CCRs = Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013; DMCCA = Digital Markets, Competition and Consumers Act 2024; UCTA = Unfair Contract Terms Act 1977; MA = Misrepresentation Act 1967; AA = Arbitration Act 1996 (as amended by the Arbitration Act 2025); OSA = Online Safety Act 2023; PSRs = Payment Services Regulations 2017; EMRs = Electronic Money Regulations 2011; P2B = Regulation (EU) 2019/1150 as retained in UK law (verify current status as assimilated law); DSA = Regulation (EU) 2022/2065; PECR = Privacy and Electronic Communications (EC Directive) Regulations 2003; DUAA = Data (Use and Access) Act 2025; VATA = Value Added Tax Act 1994; PORR = Platform Operators (Due Diligence and Reporting Requirements) Regulations 2023 (SI 2023/817).
- **Redline** gives the fix. The full text is in `redlines/` (file number in brackets).
- Cross-cutting findings that apply to many clauses are stated once in section 0 and referenced as X-n.

Documents covered (25): live `/terms`, `/ticket-terms`, `/privacy`, `/cookies`, `/data-retention`, `/accessibility` (draft banner); repo-only Customer, Organizer, Provider, Venue, Resale, Payment Protection, Cancellation & Refund, DPA, AUP, Community, Content & Template, IP & Takedown, Safeguarding, Complaints, Partner, Promoter, AI Terms; drafts Payment Terms v2, Disputes Policy v2, Live-text corrections v2.

---

## 0. Cross-cutting findings

| ID | Rating | Finding | Law | Fix |
|---|---|---|---|---|
| X-1 | **H** | **Most texts are not incorporated.** Only six pages are published; sign-up records one `terms_version`. Organizer, Provider, Venue, Customer, Partner, Promoter, DPA, AUP and the policies exist only in the repo. Their caps, indemnities, fee-retention rule, non-circumvention and DPA cannot bind anyone who never saw them. | Contract formation and incorporation (*Parker v South Eastern Railway*; *Thornton v Shoe Lane Parking*; *Interfoto v Stiletto* for onerous terms needing fair notice); UK GDPR Art 28(3) (DPA must be in a binding contract) | Publish v3 at stable URLs (`/legal/<slug>`), one acceptance per role at the first relevant step (organiser: first publish/payout set-up; provider: first listing; partner: application), recorded with version, user, time and IP. Prominent separate ticks for onerous terms (fee retention, indemnity, non-circumvention, chargeback holds). |
| X-2 | **H** | **Old money model in force.** Live and repo texts say Gala Dock collects, holds, protects and decides money, is merchant of record, and that payment to Gala Dock discharges the buyer. DEC-107 is direct charges on the seller's account, recommendation-only. | PSRs 2017 Sch 1 Pt 2 para 2(j) (technical service providers) and para 2(b) (commercial agents); CRA s.50 (statements bind the trader) | Remove every "hold/decide/protect/merchant of record/discharge" sentence. v3 Payment Terms is the single money text; every other document points to it. |
| X-3 | **H** | **No customer–seller contract carries the dispute rules.** Deemed acceptance, lapse, business arbitration and the default-rule liability statement are written in Gala Dock's terms, which are bilateral (user ↔ Blackwellen). Nothing binds the customer and the seller to each other on them. | Privity; Contracts (Rights of Third Parties) Act 1999; AA s.6, s.5 (arbitration agreement must be in writing) | New **Standard Booking Terms** (redline 24) incorporated into every booking and ticket contract at acceptance, with the seller's agreement given at listing/payout set-up. |
| X-4 | **H** | **No EU/international framework** although EU sellers are supported and anyone can buy. No DSA legal representative, no EU GDPR Art 27 representative, no mandatory-consumer-law saving for EU consumers in most texts, no DAC7 position. | DSA Art 13 (no micro-enterprise exemption), Arts 11, 12, 14, 16, 17; EU GDPR Art 3(2), Art 27; Rome I Art 6; Brussels Ia Art 18(1); EU Directive 2021/514 (DAC7) | Owner decision D2: restrict to UK (simplest) or appoint representatives. v3 Terms §15 adds the consumer saving and the geography clause. |
| X-5 | **H** | **Online Safety Act duties not reflected.** Gala Dock is a regulated user-to-user service (messages, reviews, listings, event pages, public templates). Terms have no OSA provisions; no user reporting for most content; no complaints procedure under OSA. | OSA ss.3, 4, 9, 10, 20, 21, 23, 35–37; Ofcom Illegal Content Codes (in force 17 March 2025) | See `online-safety-act.md`; v3 Terms §8, AUP §§8–10. |
| X-6 | **H** | **VAT characterisation and place of supply not reflected** (booking fee under direct charges; UK VAT on all commission; overseas events). | VATA ss.5A, 7A, 8, 47(3), Sch 4A para 10 | See `tax-and-reporting.md`; v3 Payment Terms §2A. |
| X-7 | **H** | **No platform-reporting clause** (PORR 2023) and no data collection. | PORR 2023 regs (seller due diligence, reporting by 31 January) | v3 Provider/Venue/Organiser terms clause "Tax reporting"; build data capture. |
| X-8 | M | **No order of precedence / definitions / legal documents list.** Twenty-five texts with overlaps (Customer vs Platform vs Refund vs Payment Protection) and contradictions. | CRA s.69 (consumer: most favourable meaning prevails); contra proferentem | v3 Terms §0 defines the set and priority: Payment Terms and Disputes Policy prevail on money; consumer statutory rights always prevail. |
| X-9 | M | **No non-reliance / entire-agreement clause** for business users. | MA s.3 (clause must be reasonable: *First Tower Trustees v CDS* [2018] EWCA Civ 1396) | v3 Terms §14.4 (business users only). |
| X-10 | M | **No Gala Dock force majeure** (only the organiser fee waiver). | Common law (no implied FM) | v3 Terms §14.1. |
| X-11 | M | **No time limit for business claims, no CPA 1987 carve-out.** | Limitation Act 1980 (contractual shortening allowed for B2B if reasonable under UCTA); Consumer Protection Act 1987 s.7 | v3 Terms §12.6, §12.1(d). |
| X-12 | M | **P2B items missing:** ranking main parameters (Art 5), data access (Art 9), reasons before suspension/termination (Art 4: 30 days' notice for termination), differentiated treatment (Art 7). Complaint handling (Art 11) and mediators (Art 12) — small-enterprise exemption likely applies (verify headcount/turnover). | UK P2B (verify status) | v3 Terms Schedule 1 (ranking), §11 (notice), §13A (data access). |
| X-13 | M | **"Approved for publication" banners** on texts never published and containing placeholders (Provider 5.5 "[Tax adviser: …]", Resale 3.3 "[Counsel/finance …]", Promoter 4, DPA Annex 3, AI 5.1). | Accuracy of records; CRA s.50 | Remove banners; v3 drafts carry a DRAFT banner only. |
| X-14 | M | **Gala Agent described to customers.** Owner decision: no AI in the customer workspace. | CRA s.50; UK GDPR Art 13 | Remove from Customer Terms and the customer parts of Privacy; keep AI Terms for organisers/providers. |

---

## 1. Platform Terms of Service (`/terms`, live, version 2026-10)

| Clause | Rating | Issue | Law | Redline [01] |
|---|---|---|---|---|
| Intro ("agreement between you and Blackwellen Limited") | M | No acceptance mechanics, no list of documents, no priority; "Ticket Terms also apply" but other role terms not named. | Incorporation; X-1, X-8 | §0 Legal Documents, priority, express terms. |
| §1 What Gala Dock is | **H** | "collect payments on their behalf" contradicts DEC-107 and is a perimeter admission. "help resolve disputes" is fine. Independent-business wording good. | PSRs Sch 1 Pt 2 para 2(j); X-2 | §1.4: "Payments go directly to the seller's own Stripe account. We never hold your money." |
| §2 Accounts (18+) | M | Self-declaration only; no age assurance. OSA children's access assessment must be recorded; Ofcom guidance treats only highly effective age assurance as preventing access (verify). | OSA ss.35–37 | §2.1 + OSA assessment. Keep 18+. |
| §2 workspace owner responsible for members | L | OK. Add: actions through API/agent are the workspace's. | — | §2.4. |
| §3.1 providers set prices, cancellation terms | M | Provider cancellation tiers bind consumers; must be transparent and fair; Gala Dock refusal right is in Provider terms only (repo-only). | CRA ss.62, 68; Sch 2 paras 5, 6 | §3.2 + Standard Booking Terms §4. |
| §3.2 booking confirmed when accepted + deposit paid; terms saved | L | Good evidence practice. | CCRs reg 16 (durable medium confirmation) | Keep; add confirmation by email. |
| §3.3–3.4 expiry, holds | L | OK. | — | Keep. |
| §3.5 cancellations follow saved terms; refunds to original method | L | OK. | — | Keep. |
| §4.1 "platform usage fees" | M | Label is fine for status purposes, but VAT and PSR analysis turn on substance, not labels. | — | §4 keeps label; adds who supplies what. |
| §4.2 tickets: buyer £1, seller 5% | M | Under direct charges the buyer's whole payment lands in the organiser's account. Who supplies the booking fee to the buyer for VAT? Text implies Gala Dock. | VATA s.47(3); X-6 | §4.3: seller collects the booking fee as Gala Dock's disclosed collection agent. |
| §4.3 bookings: commission 8/7/6% + VAT; admin fee 2.5% (min £1) | M | Same as above; VAT on commission for overseas sellers wrong (reverse charge). | VATA s.7A, s.8 | §4.4. |
| §4.4 subscriptions; business prices exclude VAT | M | Subscription terms don't exist. | DMCCA Part 4 Ch 2 (verify commencement) | Points to Subscription Terms [23]. |
| §4.5 organiser cancels → buyers refunded incl. fee; organiser owes fees unless FM | **H** | Fee retention after the organiser refunds everyone: onerous term buried in a list; not in a contract the organiser expressly accepted (Organizer Terms repo-only). Charging fees on refunded tickets is defensible as a charge for services performed (not a penalty), but needs prominence. | *Interfoto*; UCTA s.3(2)(b), s.11; *Cavendish v Makdessi* [2015] UKSC 67 (primary obligation, not penalty) | Moved to Organiser Terms §4.3 with an express tick. |
| §4.6 Stripe processes; payouts after holding period minus fees, refunds, chargebacks | **H** | "Holding period" implies Gala Dock holds. | X-2 | §4.6 refers to Payment Terms. |
| §4.7 no off-platform payment | **H** | Contradicts the enquiry-only path for unsupported-country sellers (M-51); open-ended period; no consumer distinction. Applying a non-circumvention restriction to consumers is likely unfair. | CRA s.62; competition law (Chapter I CA 1998) only if restrictive beyond necessary | §4.8: business users only, 12 months from real contact, enquiry-only carve-out. |
| §5.1–5.3 provider obligations | L | OK. | — | Keep. |
| §5.4 provider/organiser is controller of attendee data | M | Contradicts Organizer Terms 4.1 and the DPA (Gala Dock processor for organiser's attendee data) and Provider 9 (independent controllers). Pick one per data set. | UK GDPR Arts 4(7), 26, 28 | §5.4 states the split by data set; DPA for processor cases. |
| §5.5 "You are responsible, and liable … You indemnify us" | M | One-line indemnity with no scope, no conduct-of-claims, no carve-out for our fault; enforceable B2B if reasonable, but vague. Must not apply to consumers. | UCTA s.4 (indemnities by consumers — now CRA for consumers); s.3 | §12A full business indemnity. |
| §6 acceptable use; "withhold payouts while we investigate" | **H** | "Withhold payouts while we investigate" = payout pause on suspicion, contradicting Payment Terms 9.2 and DEC-107. | X-2; P2B Art 4 | §6.3: content/listing/account restrictions; payouts only per Payment Terms §9. |
| §7 content licence | M | Licence "only to run and promote the service" ends on deletion; but templates (sub-licence to other users) and reviews (we may keep showing) need specific rules. No moral-rights waiver; no warranty of rights. | CDPA 1988 ss.77–80 (moral rights), s.87 (waiver) | §7 with template sub-licence, review licence survival, warranty. |
| §8 Gala Agent | M | Applies to customers, who have no AI. Liability for automatic actions within policy not addressed. | X-14 | §10: organisers/providers only; AI Terms govern. |
| §9 Disputes "we may decide how the funds we hold are released" | **H** | False statement (B1/P1). | X-2; CRA s.50 | §9 per P1 + Disputes Policy. |
| §10.1 non-excludable liability | L | Good. Add CPA 1987 and "fraudulent misrepresentation". | CRA s.65; UCTA s.2(1) | §12.1. |
| §10.2 consumer foreseeable loss; organisers responsible | M | "Organisers and providers, not Gala Dock, are responsible …" good; but Gala Dock's own statements (badges, "verified", "insurance badge", "Paid · protected") create its own duties. | CRA s.50; *Hedley Byrne* | §12.3 + badge definitions in Community Standards. |
| §10.3 business cap: greater of fees in 12 months and £1,000; money held not counted | **H** | (a) "Money we hold that is payable to you" contradicts DEC-107. (b) Cap reasonableness is weaker where Gala Dock's own error misdirects or delays a seller's payout; carve that out uncapped at the amount misdirected (Gigvora 17.2) to make the rest defensible. (c) No exclusion of seller–buyer acts. | UCTA s.3, s.11(1), (4) (resources, insurance); *Goodlife Foods v Hall Fire* [2018] EWCA Civ 1371 | §12.4–12.6. |
| §11 suspension; reasons "where safe and lawful" | M | P2B Art 4: statement of reasons for suspension (at or before effect) and 30 days' notice for termination of business users, with exceptions. | P2B Art 4 | §11. |
| §12 changes, "reasonable notice" | M | Business users: 15 days (P2B Art 3); consumers: specific valid reasons and right to end (CRA Sch 2 paras 11–13). | P2B Art 3; CRA Sch 2 | §13. |
| §13 law and courts | M | No exclusive jurisdiction for business users; no EU consumer saving; no arbitration route for B2B with Gala Dock. | CJJA 1982 s.15B; Hague 2005; Rome I Art 6 | §15. |
| (missing) assignment, notices, severance, waiver, third-party rights, FM, non-reliance, time limit | M | Absent. | X-9–X-11 | §14. |
| (missing) OSA provisions | **H** | ToS must explain how users are protected from illegal content, reporting and complaints. | OSA ss.10(5)–(7), 20, 21 | §8. |
| (missing) sanctions and geography | **H** | No eligibility restriction for sanctioned persons/countries. | SAMLA 2018 regimes; Russia (Sanctions) (EU Exit) Regs 2019 | §2.2, §4A. |
| (missing) tax reporting | **H** | PORR notice to sellers. | PORR | §4B. |

## 2. Ticket Purchase & Resale Terms (`/ticket-terms`, live)

| Clause | Rating | Issue | Law | Redline [02] |
|---|---|---|---|---|
| Intro "Gala Dock sells tickets on the organiser's behalf" | **H** | Inconsistent with DEC-107 (organiser is merchant). For VAT, an agent acting in its own name is treated as buying and supplying (s.47(3)). | VATA s.47(3); X-2 | "The organiser sells you the ticket. Gala Dock runs the platform." |
| §1.1 price, £1 fee and total shown before paying | L | Good; DMCCA requires total price incl. unavoidable fees from first display (built). | DMCCA s.230 and Sch 20 (verify section) | Keep; say "from the first price you see". |
| §1.2 checkout hold countdown | L | OK. | — | Keep. |
| §1.3 purchase limit | L | OK; bots offence. | Breaching of Limits on Ticket Sales Regs 2018 | Keep + bots warning. |
| §1.4 confirmed only when payment succeeds; refund if hold lapsed | L | Good. | — | Keep. |
| §1.5 organiser conditions form part of the ticket | M | They form part of the contract only if shown before purchase. Must include resale/transfer cancellation term if organiser wants s.91 cancellation right. | CRA s.91(2)–(3) | Keep + "shown before you pay". |
| §2 no 14-day cancellation, "regulation 28(1)(g)" | M | Paragraph letter disagrees with Customer Terms 28(1)(b) (verify). Exemption covers leisure services for a specific date; for **online/virtual** events with no specific date it may not. | CCRs reg 28(1) | Cite reg 28(1)(b) (verify) or "regulation 28"; carve out on-demand content. |
| §3 cancelled: full refund incl. fee | L | Good; matches engine. | CRA; CMA guidance on cancelled events | Keep; add who pays (organiser, from its balance) and the time limit. |
| §3 postponed: refund window ≥14 days | M | Mechanism unverified (M-24). Consumer may have a right to a refund for material change irrespective of organiser policy. | CRA s.49–50, s.54–56 (services remedies) | Keep with "at least 14 days after we tell you". |
| §3 materially changed: "depends on organiser's policy and your statutory rights" | M | Vague. | CRA s.68 transparency | State: material change → refund option. |
| §4 QR, transfer until shortly before the event, one entry | L | OK. Transferred tickets inherit chargeback risk (M-19) — warn. | — | Add. |
| §5 resale capped at original price paid; s.90 information | M | Price basis wording (M-21); missing unique ticket number / seller identity points (M-23); payout wording wrong (M-22). | CRA ss.90–91 (verify UTN amendment) | §7. |
| §5 touted tickets may be cancelled | M | Cancellation for resale only if the original contract term allowed it and the term is not unfair. | CRA s.91 | Tie to organiser conditions shown at purchase. |
| §6 seated events: organiser may move seats to equal or better | L | Reasonable. | CRA Sch 2 para 13 | Keep. |
| §7 help | L | OK. | — | Keep. |
| (missing) chargeback holds | **H** | Built behaviour has no contractual basis (M-19). | CRA s.62; contract | §8 (owner wording, tightened). |
| (missing) entry refusal, age/alcohol, conduct, ejection without refund | M | Organiser's area, but platform text should say conditions bind. | Licensing Act 2003 | §5. |
| (missing) liability | M | No platform liability statement in ticket terms (relies on /terms). | CRA s.57 | §10. |

## 3. Privacy Policy (`/privacy`, live)

| Clause | Rating | Issue | Law | Redline [13] |
|---|---|---|---|---|
| Intro / §1 controller, DPO | M | Is the DPO a designated Art 37 DPO? If the director is DPO, conflict of interest risk (Art 38(6)); if not mandatory, call him "privacy lead" or keep DPO but confirm independence. | UK GDPR Arts 37–39 | §1 note; counsel CQ-27. |
| §2 data collected | M | Missing: trader status declarations, risk signals/scores, Turnstile device data, payout and tax-reporting data (PORR), chargeback hold state, insurance/licence documents, partner VAT data, location for maps. | Arts 13–14 | §2 expanded. |
| §3 organiser/provider as controller | M | Provider customer data: Provider Terms say independent controllers; this says processor. Inconsistent. | Arts 4, 26, 28 | §3 by data set. |
| §4 lawful bases table | M | (a) "Marketing … consent" fine; soft opt-in under PECR reg 22(3) possible for customers. (b) Risk scoring under legitimate interests needs an LIA; Art 22 statement good. (c) Trust documents may include special category (health in access needs) and criminal-offence data if ever collected — Art 9/10 conditions and an Appropriate Policy Document needed (DPA 2018 Sch 1 Part 4). (d) Tax reporting = legal obligation. | Arts 6, 9, 10, 22; DPA 2018 s.10, Sch 1 | §4 table rows added. |
| §5 sharing: "Anthropic" | **H** | False (M-60). | Art 13(1)(e) | Remove. |
| §5 maps "OpenStreetMap" | M | MapTiler is the provider (M-61). | Art 13 | Name MapTiler (server-side proxy) and OSM. |
| §5 omits Cloudflare, Resend, Google Fonts, video hosts, AV-scan, HMRC | M | M-62. | Art 13(1)(e) | Add. |
| §5 calendar integrations (Google Limited Use) | L | Good. | Google API policy | Keep. |
| §6 transfers | M | Name each transfer and mechanism (DPF UK Extension for certified US vendors; IDTA/Addendum otherwise); TRA. | Arts 44–49; DPA 2018 s.17A–17C | §6 table. |
| §7 staff access to messages | L | Strong; DPIA exists. | Art 35 | Keep. |
| §8 retention examples; no backups | M | Add backup statement (P3). | Art 5(1)(e) | §8. |
| §9 rights; one month | L | Good; DUAA "reasonable and proportionate searches" (verify commencement). | Arts 12–22; DUAA | Keep. |
| §10 security | L | OK. | Art 32 | Keep. |
| §11 children: 18+ | M | Ticket buyers may provide minors' names (attendees). OSA/ICO Children's Code: if service likely to be accessed by children, Age Appropriate Design Code applies (verify scope). | ICO AADC (DPA 2018 s.123) | §11 + assessment. |
| §12 complaints | M | DUAA introduces a duty for controllers to handle complaints and acknowledge within 30 days (verify commencement). | DUAA | §12. |
| §13 changes | L | OK. | — | Keep. |
| (missing) Art 27 EU representative | **H** if EU users accepted | — | EU GDPR Art 27 | §1A placeholder blocked by publish check (decision D2). |

## 4. Cookie Policy (`/cookies`, live)

| Clause | Rating | Issue | Law | Redline [14] |
|---|---|---|---|---|
| Intro: no advertising or cross-site tracking cookies | M | True for first-party; but YouTube/Vimeo embeds and Google Fonts may set or read identifiers. | PECR reg 6 | Name them; use privacy-enhanced embeds or consent gate. |
| Table rows (auth, remember, checkout, consent) | L | Strictly necessary — fine. 400-day remember is long but user-chosen. | PECR reg 6(4) | Keep. |
| `gd_ref`, `gd_partner` consent | L | Consent-gated (good). | PECR reg 6 | Keep. |
| Local storage prefs | L | "Strictly necessary"/preference — user-requested; acceptable. | PECR reg 6(4)(b) | Keep. |
| Third parties: Stripe; maps | M | Add Cloudflare Turnstile (security; strictly necessary arguable), embedded video. | PECR | Add rows. |
| Analytics "off until allowed; no own cookie" | L | DUAA added exemptions for some analytics with opt-out (verify commencement); current consent model is safe. | DUAA; PECR | Keep. |

## 5. Data Retention Schedule (`/data-retention`, live)

| Row | Rating | Issue | Law | Redline [15] |
|---|---|---|---|---|
| Account 14 days after deletion request | L | OK. | Art 5(1)(e) | Keep. |
| Financial 6 years after FY | L | OK (Companies Act s.388: 3 years for private companies; HMRC VAT records 6 years — VATA Sch 11 para 6). | — | Keep. |
| Bookings 6 years after event | L | OK. | Limitation Act 1980 s.5 | Keep. |
| Disputes 6 years after close | L | OK. | LA 1980 | Keep. |
| Provider verification docs: listing + 6 years | M | Rules built but disabled (M-54). ID images are held by Stripe, not Gala Dock — say so. Insurance certificates contain limited personal data; 6 years is defensible. | Art 5(1)(c),(e) | Keep; enable after sign-off. |
| Marketing consent: 2 years after withdrawal | L | OK. | PECR; Art 7(1) | Keep. |
| Security logs 12 months | L | OK. | Art 32 | Keep. |
| (missing) backups, PORR records (6 years), partner self-billing (6 years), chargeback-hold records, OSA records (s.23), complaint records (3 years per Complaints Policy) | M | Add rows. | PORR; VATA; OSA s.23 | Rows added. |

## 6. Accessibility Statement (`/accessibility`, draft banner; repo-only md 2026-10)

| Clause | Rating | Issue | Law | Redline [25] |
|---|---|---|---|---|
| Repo md 2026-10 claims screen-reader support and 400% zoom | M | Unsupported by audit; the live draft rightly withdraws them. Overclaiming accessibility is a misleading action. | DMCCA s.226 (misleading actions) (verify); Equality Act 2010 s.29 | Withdraw md; publish the live draft after the phone/tablet sweep. |
| Live draft | L | Honest; good. EASS reference fine. | Equality Act 2010 s.20 | Publish after owner approval. |

## 7. Customer Terms (repo-only)

| Clause | Rating | Issue | Law | Redline [08] |
|---|---|---|---|---|
| Intro: priority over Platform Terms on customer matters | L | Good, but Customer Terms aren't published. | X-1 | Publish; fold into Terms §0. |
| 1.1–1.3 marketplace, not organiser/provider | M | "We act as their commercial agent to take your payment and … hold it" (X-2). 1.3 "responsible for … handling your payments as described" — keep but describe DEC-107. | X-2 | 1.2 rewritten. |
| 2.1 18+ | L | OK. | — | Keep. |
| 2.3 deletion 14-day grace | L | OK. | — | Keep. |
| 3.1 all compulsory charges included | L | Good (DMCCA). | DMCCA | Keep. |
| 3.2–3.3 fees; admin fee refunded if provider cancels | L | Matches engine. | — | Keep. |
| 3.5 payment confirmed only when provider confirms | L | OK. | — | Keep. |
| 4.1 booking formed on acceptance + deposit | L | OK. | — | Keep; add Standard Booking Terms. |
| 4.2–4.3 holds, accurate details | L | OK. | — | Keep. |
| 5.1 no 14-day right (reg 28(1)(b)) for tickets **and bookings** | **H** | Venue/supplier bookings for a specific date: leisure? Catering for a private event "services related to leisure activities" and "catering" are within the exception if a specific date is fixed (verify). Non-date services (e.g., design work, equipment purchase) are not. If the right applies and info wasn't given, cancellation period extends to 12 months and the consumer pays nothing for services supplied (CCRs regs 31, 36(6)). | CCRs regs 28, 29–36, Sch 2 | 5.1 limited to date-specific leisure/catering/venue; otherwise 14-day right with express-request and acknowledgement ticks (regs 36). Counsel CQ-9. |
| 5.2 organiser/provider cancels → full refund | L | OK. | — | Keep. |
| 5.3 AI credits | M | Customers have no AI (X-14). | — | Delete. |
| 6.1 payment protection | **H** | X-2. | — | Rewritten: money waits in the seller's account until payout triggers. |
| 6.2 dispute within 48 h | **H** | Engine is 24 h (M-15); must not read as a time bar on statutory remedies. | CRA Sch 2 para 20 | 24 h, payout-timing only. |
| 6.3 "we give reasons for our decision" | **H** | We recommend only. | X-2 | Rewritten. |
| 7 tickets; "every 30 seconds" | L | M-25. | — | "regularly". |
| 8 reviews: only genuine, no incentives | M | DMCCA Sch 20 banned practices on fake reviews include publishing reviews without taking reasonable and proportionate steps to prevent fakes (verify para). Need a published review policy. | DMCCA Sch 20 (paras on consumer reviews) | 8 + Community Standards §3. |
| 9 Gala Agent | M | X-14. | — | Delete. |
| 10.1–10.4 liability | L | Good consumer drafting. 10.4 "only domestic and private use" — fine. | CRA ss.57, 65 | Keep. |
| 11 suspension | L | OK. | — | Keep. |
| 12 changes 30 days | L | OK. | CRA Sch 2 para 11 | Keep + right to close account. |
| 13 complaints; law; Scotland/NI | M | Add EU/overseas consumer saving. | Rome I Art 6 | Add. |

## 8. Organizer Terms (repo-only)

| Clause | Rating | Issue | Law | Redline [05] |
|---|---|---|---|---|
| Intro: incorporates Payment Protection Terms etc. | **H** | Incorporates withdrawn texts; not published. | X-1, X-2 | Incorporates v3 set. |
| 1.0 independent businesses | L | Good. | — | Keep. |
| 1.1–1.2 accounts, roles, credential responsibility | L | Good. | — | Keep. |
| 1.3 plan limits pause capability | L | M-56 nuance. | — | Reword. |
| 2.1 "You are the seller … Gala Dock acts as your commercial agent to sell tickets, take payment" | **H** | Seller is merchant of record (DEC-107); "take payment" wrong; agent-in-own-name VAT risk. | X-2; VATA s.47(3) | 2.1: organiser is seller and merchant of record; Gala Dock is a disclosed agent only for (a) concluding contracts in the organiser's name on its checkout and (b) collecting the booking fee for itself. |
| 2.2 obligations to attendees | L | Good. Add accessibility info, age/alcohol, Martyn's Law (Terrorism (Protection of Premises) Act 2025) for qualifying events (verify commencement). | Terrorism (Protection of Premises) Act 2025 | Add. |
| 2.3 pricing incl. compulsory fees | L | OK. | DMCCA | Keep. |
| 2.4(a) buyers always refunded in full | L | Good; matches. | — | Keep. |
| 2.4(b) fees on sold tickets remain payable when organiser cancels | M | Defensible as charge for services performed (not penalty — *Cavendish*), but the £1 buyer fees "refunded to buyers on your behalf" being charged to the organiser needs clear wording; onerous → express tick. | UCTA s.3; *Cavendish*; *Interfoto* | 4.3 with tick. |
| 2.4(c) force majeure definition | L | Good, objective. Add "amber" warning test is generous — owner choice. | — | Keep. |
| 2.4(d)–(f) Gala Dock cancellations; claim process; postponement | L | Good. | — | Keep. |
| 2.4(g) indemnity for refunds, chargebacks | M | OK; consolidate. | — | §12. |
| 2.5 settlement schedule; discretionary hold "material risk" | **H** | Contradicts DEC-107 (always held until event end + 5 business days, no discretion). Discretion undermines perimeter. | X-2 | Delete; refer to Payment Terms 3.1(a). |
| 2.6 resale cap at or below face | L | OK. | — | Keep. |
| 2.7 check-in; scanner results; on_hold | M | Add chargeback "on hold" result: organiser must not admit held tickets (or bears the loss). | — | 2.7. |
| 3.1 marketplace payment protection | **H** | X-2. | — | Payment Terms. |
| 3.2–3.3 accurate info; cancellation per policy | L | OK. | — | Keep. |
| 3.4 non-circumvention 12 months from first contact | M | Reasonable for B2B; define contact; carve-out enquiry-only; fee not damages. | CA 1998 Ch I (low risk); restraint of trade | 3.4. |
| 4.1 organiser controller / Gala Dock processor | M | Inconsistent with /terms §5.4 wording; OK substance. | Art 28 | Keep; DPA [16]. |
| 4.2 lawful basis, PECR | L | OK. | — | Keep. |
| 5 content licence "reasonable period afterwards" | L | Uncertain; specify (e.g., 90 days, cached copies). | — | 90 days. |
| 6.1 fees are platform usage fees | L | OK. | — | Keep. |
| 6.2 ticket fees: £1 buyer, 5% + VAT seller; resale buyer fee only | M | VAT on 5% for non-UK organisers (X-6). | VATA s.7A | 6.2 + VAT clause. |
| 6.3 booking admin fee | L | OK. | — | Keep. |
| 6.4 subscriptions; set-off against amounts we hold | **H** | "Amounts we hold for you" — we hold nothing; set-off against seller balance would be Gala Dock controlling seller funds for its own debts (Gigvora C-03). | X-2 | No set-off against seller balances; plan fees charged to card or invoiced. |
| 6.5 VAT | M | Correct for UK businesses; wrong for overseas businesses (reverse charge) and booking fees on overseas events. | VATA ss.7A, 8; Sch 4A para 10 | 6.5. |
| 6.6 30 days' fee change notice | L | OK (P2B 15 days minimum). | — | Keep. |
| 7 Gala Agent | L | OK; reference AI Terms incl. automatic actions. | — | Keep. |
| 8.1 suspension grounds | M | P2B Art 4 statement of reasons. | P2B | 11. |
| 8.2 closing workspace | L | OK. | — | Keep. |
| 9.1–9.2 liability exclusions | L | Good. Add CPA. | — | Keep. |
| 9.3 cap greater of fees / £1,000; "ticket proceeds held for you" | **H** | Held-for-you wording false; carve out misdirected payout instructions. | UCTA s.11 | 12.4–12.5. |
| 9.4 responsibility for events | L | Good. | — | Keep. |
| 9.5 indemnity | M | Add conduct of claims, regulator fines "to the extent lawful" (fines for one's own criminal acts can't be indemnified: *Safeway v Twigger* [2010] EWCA Civ 1472). | *Safeway v Twigger* | 12. |
| 10 law, exclusive E&W jurisdiction, assignment | L | Good. Add arbitration option? Courts fine. | Hague 2005 | Keep. |
| (missing) tax reporting (PORR) | **H** | Ticket sales likely not reportable; merch (goods) is (verify). | PORR | 6.7. |
| (missing) chargeback holds | **H** | — | — | 2.8. |
| (missing) trader status declaration | M | Built; add clause. | CCRs; DMCCA | 1.4. |

## 9. Provider Marketplace Terms (suppliers; repo-only)

| Clause | Rating | Issue | Law | Redline [06] |
|---|---|---|---|---|
| 1.1–1.2 independent business | M | Good; add Gigvora 2.7 "controls we apply and why", no exclusivity, no obligation to accept, and that Gala Dock does not find work (Employment Agencies Act 1973 / Conduct Regs 2003 reg 26 fee-to-work-seeker risk applies mainly to individuals supplying personal services, e.g., DJs, entertainers, staffing (verify)). | ERA 1996 s.230; *Uber v Aslam* [2021] UKSC 5; EAA 1973; Conduct Regs 2003 reg 26 | 1.1–1.5. |
| 1.3 limited agent to collect payments; payment to Gala Dock discharges customer | **H** | False under DEC-107 and a perimeter admission. | X-2 | Delete; Payment Terms. |
| 2.1–2.3 listings, verification badges not a guarantee | L | Good. | — | Keep. |
| 3.1–3.5 respond, quotes binding, holds, standby, emergency | L | Good. Quotes must give CCRs Sch 2 info for consumers. | CCRs reg 13, Sch 2 | Keep + info duty. |
| 4.1–4.2 delivery, law compliance | L | Good. Add food (Natasha's Law for PPDS), allergens. | Food Information (Amendment) (England) Regs 2019 | Keep. |
| 4.3 insurance PL £2m | M | Code requires £1m (M-50). Add employers' liability (compulsory if employees), product liability for food. | ELCIA 1969 | Owner decision D10. |
| 5.1–5.2 funds held, released after 48 h | **H** | X-2, M-14. | — | Payment Terms. |
| 5.3 commission 8/7/6% + VAT | M | VAT for overseas sellers (X-6). | — | 5.3. |
| 5.3A admin fee | L | OK. | — | Keep. |
| 5.4 payout onboarding; "funds stay protected" | M | Under DEC-107 a seller can't be paid at all until onboarded (no charge happens). | — | 5.4. |
| 5.5 VAT; "[Tax adviser: confirm invoicing model]" | **H** | Placeholder in approved text; invoicing model undecided. | VAT Regs 1995 regs 13–14 | 5.5: Gala Dock issues VAT invoices for its fees; seller issues its own invoices to customers. |
| 6.1–6.2 cancellations | L | OK. | — | Keep. |
| 6.3 "Our decision about money held by Gala Dock is final" | **H** | False and dangerous (decider + holder). | X-2 | Disputes Policy. |
| 6.4 reverse transfers, set-off against future payouts, repay in 14 days | M | "Reverse transfers" is the old model; under DEC-107 refunds come from the seller's balance; recovery order per Payment Terms 6. | — | 6.4. |
| 7 reviews and reliability | M | P2B Art 5 ranking parameters; DMCCA fake reviews. | P2B Art 5 | 7 + Schedule. |
| 8 non-circumvention 12 months | M | Enquiry-only carve-out; consumer side not restricted. | — | 8. |
| 9 data: independent controllers | M | Inconsistent with Privacy §3 (processor). | Arts 4, 26 | 9. |
| 10.1 suspension of listings or payouts | **H** | Payout suspension outside Payment Terms §9 grounds (M-17). | X-2 | 10.1. |
| 10.2 closing | L | OK. | — | Keep. |
| 10.3 sole responsibility incl. injury | L | Good vis-à-vis Gala Dock. | — | Keep. |
| 10.4 indemnity | M | As Organizer 9.5. | — | 12. |
| 10.5 cap; "booking funds held for you" | **H** | False wording; carve-out for misdirected instructions. | UCTA | 12. |
| 10.6 governing law | L | Add jurisdiction. | — | Keep. |
| (missing) tax reporting PORR | **H** | Supplier services = "personal services"; reportable. | PORR | 5.7. |
| (missing) country restrictions/enquiry-only | **H** | M-52. | — | 5.8. |
| (missing) trader declaration, sanctions, ownership changes | M | Gigvora 4.9, 23. | — | 1.6, 13. |
| (missing) agencies/staff responsibility, right to work, IR35 | M | Gigvora 4.4, 5. | ITEPA 2003 Pt 2 Ch 10; IANA 2006 | 4.5. |
| (missing) time limit for claims, FM | M | X-10, X-11. | — | Terms §14. |

## 10. Venue Marketplace Terms (repo-only)

| Clause | Rating | Issue | Law | Redline [07] |
|---|---|---|---|---|
| 1.1 right to hire | L | Good. | — | Keep. |
| 1.2 accurate capacities within licence/FRA | L | Good. | Regulatory Reform (Fire Safety) Order 2005 | Keep. |
| 1.3 floor plans; overlays organiser's responsibility | L | Good. | — | Keep. |
| 2.1 Gala Dock holds no licence | L | Good. | Licensing Act 2003 | Keep. |
| 2.2 bar packages, Challenge 21/25 | L | Age verification policy is a mandatory licensing condition. | Mandatory Licensing Conditions Order 2014 (verify) | Keep. |
| 2.3 safety info | L | Good; add Martyn's Law duties for qualifying premises (verify commencement). | Terrorism (Protection of Premises) Act 2025 | Add. |
| 3.1–3.3 rate cards, holds, conflicts; full refund if can't honour | L | Good. | — | Keep. |
| 4 BEOs, allergens | L | Good. | Food Information Regs 2014 | Keep. |
| 5 damage deposits outside Gala Dock; claims within 7 days | M | A deposit taken through Gala Dock would be a charge on the seller's account like any other; deposits held by the venue off-platform are outside protection. 7-day window for venue claims fine (B2C fairness: must be transparent). | CRA Sch 2 | 5. |
| 6 staged release for long-lead bookings | M | Old model; under DEC-107 bookings charged > 58 days before the event may be paid out at the hold limit (Payment Terms 8.2). | — | 6. |
| (missing) PORR rental of immovable property | **H** | Venue hire = rental of immovable property: reportable, with property address/land registry number. | PORR | 7. |

## 11. Official Ticket Resale Terms (repo-only)

| Clause | Rating | Issue | Law | Redline [10] |
|---|---|---|---|---|
| 1.1 organiser enables | L | OK. | — | Keep. |
| 1.2 no designated football resale | L | Good. | CJPOA 1994 s.166 | Keep; check the category block exists (CQ-13). |
| 1.3 only Gala Dock tickets | L | OK. | — | Keep. |
| 2.1 price ≤ paid, lower of cap | M | M-21. | — | Reworded. |
| 2.2 buyer booking fee | L | OK. | — | Keep (£1 incl. VAT). |
| 3.1 withdraw until checkout | L | OK. | — | Keep. |
| 3.2 old ticket cancelled, new issued | L | Good. | — | Keep. |
| 3.3 proceeds as payout; "[Counsel/finance …]" | M | M-22; placeholder. | — | Refund route. |
| 4 information; seller identity not revealed | M | M-23; s.90(6)–(7) seller identity disclosure where seller is trader/organiser; masked UTN. | CRA s.90 | 4. |
| 5 seller rules; traders must identify | L | Good. | CRA s.90; DMCCA | Keep. |
| 6 event cancelled after resale: buyer refunded, seller sale stands | L | Consistent with buy-back model (organiser refunds the resale buyer). | — | Keep. |
| 7 liability | L | OK. | — | Keep. |
| (missing) resale price cap legislation | M | Government consulted (2025) on capping resale prices (verify outcome and commencement). Face-value cap likely compliant. | (verify) | Note. |

## 12. Marketplace Payment Protection Terms (repo-only, 2026-10)

| Clause | Rating | Issue | Law | Redline |
|---|---|---|---|---|
| 1.1–1.4 merchant of record, held on platform balance, discharge | **H** | Entirely superseded; perimeter admissions. | PSRs; X-2 | **Withdraw**; replaced by Payment Terms v3 [03]. |
| 2 release on delivery/48 h | **H** | Superseded. | — | Withdraw. |
| 3 disputes "a Gala Dock reviewer decides" | **H** | Superseded. | — | Withdraw. |
| 4–5 refunds/chargebacks reversed from connected account | **H** | Superseded. | — | Withdraw. |
| 6 limits; not insurance; not escrow | L | Keep the "not insurance, not escrow" statements in v3. | — | Moved to Payment Terms 1.5. |
| 7 screen states "Paid · protected until delivery" | M | Check product copy no longer says "protected" in a way implying Gala Dock holds money. | CRA s.50; DMCCA misleading actions | CQ-6 for product copy. |

## 13. Cancellation & Refund Policy (repo-only)

| Clause | Rating | Issue | Law | Redline [09] |
|---|---|---|---|---|
| 1 who sets rules | L | OK. | — | Keep. |
| 2 ticket refunds table | L | Good; refund timing "5–10 working days of approval". Consumer refunds under CRA s.56 must be without undue delay and within 14 days of agreement (services) (verify). | CRA s.56(4)–(6) | 14 days. |
| 3.1 tiered provider policy computed by days | M | Tiers like "under 30 days: 0%" may be unfair where the provider can re-let or hasn't incurred cost (CMA37 on cancellation charges reflecting actual loss). Gala Dock "may refuse unfair policies". | CRA s.62, Sch 2 paras 5–6; CMA37 | 3.1 + default fair tiers; non-refundable deposits only if proportionate. |
| 3.1 no recorded policy → "goes to Gala Dock for review" | **H** | Gala Dock decides refund amount — contradicts recommendation-only. | X-2 | No-policy default: statutory position (refund less provider's actual reasonable costs), else dispute route. |
| 3.2 provider cancels → full refund | L | OK. | — | Keep. |
| 3.3 rescheduling | L | OK. | — | Keep. |
| 3.4 force majeure "reviewed by Gala Dock" | **H** | Same: Gala Dock decides. Frustration (Law Reform (Frustrated Contracts) Act 1943 s.1(2)–(3)) governs absent agreement. | LR(FC)A 1943 | Standard Booking Terms §6: default rule written into the customer–seller contract; Gala Dock recommends. |
| 3.5 recover provider's share from released funds | M | Old model. | — | Payment Terms 6. |
| 4 48-hour dispute window | **H** | M-15. | — | 24 h. |
| 5 chargebacks "stays protected" | M | Old model; ask customers to contact us first is fine (can't require). | CCA s.75 | Reworded. |
| 6 fees, plans, credits | M | Booking fee refunded when organiser cancels (good). Subscription "no part-period refunds" fine. AI credits 12-month expiry: fairness of expiry of prepaid credit (CMA has challenged expiry of prepaid balances) — moderate risk for business buyers only. | CRA Sch 2; DMCCA subscription rules | Moved to Subscription Terms. |

## 14. Data Processing Addendum (repo-only)

| Clause | Rating | Issue | Law | Redline [16] |
|---|---|---|---|---|
| Not published | **H** | Art 28(3) requires a binding contract; currently none with organisers (X-1). | Art 28(3), (9) | Publish and accept with Organiser/Provider Terms. |
| 1.1–1.2 processor vs independent controller | L | Clear. | Art 28 | Keep. |
| 2 Annex 1 | L | OK; special category note good. | Art 9 | Keep. |
| 3 processor obligations | L | Mirrors Art 28(3)(a)–(h). | — | Keep. |
| 4 breach notice 48 h | L | Commercially fine (controller has 72 h to ICO). | Art 33 | 36 h preferred by controllers; keep 48 h. |
| 5 sub-processors, 30 days' notice, objection → terminate + refund | L | OK. | Art 28(2), (4) | Keep. |
| 6 transfers | L | OK. | Ch V | Keep. |
| 7 break-glass | L | Good. | — | Keep. |
| 8 audits | L | OK. | Art 28(3)(h) | Keep. |
| 9 deletion 30 + 60 days; backups ordinary cycle | L | State 65-day backup expiry. | — | Add. |
| (missing) liability | M | DPA silent on liability; Organiser Terms cap applies only if DPA is part of them — say so; Art 82 joint liability regardless. | Art 82 | §10: cap applies; controller indemnity for unlawful instructions. |
| Annex 3 placeholders; Anthropic absent (good); Supabase "UK (London)" | M | Verify every region; remove "(when enabled)". | Art 28(2) | Annex 3. |

## 15. Acceptable Use Policy (repo-only)

| Clause | Rating | Issue | Law | Redline [17] |
|---|---|---|---|---|
| Intro | L | OK. | — | Keep. |
| §1 illegal and harmful | M | Map to OSA priority offences (fraud, terrorism, CSEA, threats, harassment, intimate image abuse, unlawful immigration services, weapons, drugs, sanctions). | OSA Schs 5–7 | §1. |
| §2 marketplace integrity incl. off-platform | M | Enquiry-only carve-out (M-51). | — | §2. |
| §3 tickets: bots, above-cap resale | L | Good. | 2018 Regs | Keep. |
| §4 security misuse; responsible disclosure | L | Good. | Computer Misuse Act 1990 | Keep. |
| §5 communications | L | OK. | PECR | Keep. |
| §6 content | L | OK. | — | Keep. |
| §7 enforcement; "funds held … handled under Payment Protection Terms" | **H** | Old model. | X-2 | Payment Terms §9. |
| §8 reporting "Report option in the app" | **H** | Not built for most content (M-70). | OSA s.20 | Build; then reference. |
| (missing) OSA complaints, statement of reasons, appeals, freedom of expression | **H** | — | OSA ss.21–22; DSA Arts 16–17, 20 | §§9–11. |

## 16. Community & Marketplace Standards (repo-only)

| Clause | Rating | Issue | Law | Redline [18] |
|---|---|---|---|---|
| §1 honest listings | L | Good. | DMCCA misleading actions | Keep. |
| §2 reliable conduct; reliability score; "Sponsored" | M | P2B Art 5: main ranking parameters and relative importance must be described; payments that influence ranking disclosed. | P2B Art 5; CAP Code | §2 + Schedule. |
| §3 reviews: only booked/attended; no incentives; removal reasons | M | DMCCA Sch 20 requires reasonable and proportionate steps to prevent and remove fake reviews and not to mislead about how reviews are collected (verify paras). "Verified booking" label fixed (Q57). | DMCCA Sch 20; CMA guidance on fake reviews | §3 adds a review-integrity statement. |
| §3 business response once | L | OK. | — | Keep. |
| §4 respectful comms | L | OK. | — | Keep. |
| §5 templates auto-hidden at 3 reports | L | Fine; abuse of reporting risk acknowledged. | — | Keep. |
| §6 enforcement ladder | M | Add statement of reasons and appeal (OSA/P2B). | — | §6. |
| (missing) defamation notice process for reviews | M | Defamation Act 2013 s.5 defence requires following the Website Operators Regulations 2013 procedure. | Defamation Act 2013 s.5; SI 2013/3028 | §3.6. |

## 17. Content & Template Policy (repo-only)

| Clause | Rating | Issue | Law | Redline [19] |
|---|---|---|---|---|
| 1.1–1.4 ownership, rights, fonts, AI images | L | Good. Note "Gala Dock doesn't generate photographs of real people" — keep true. | CDPA | Keep. |
| 2 private by default | L | Good. | — | Keep. |
| 3.1–3.2 publishing strips event data | L | Good. | — | Keep. |
| 3.3 licence to every user, indefinite for copies | M | Perpetual sub-licence from publisher to other users — Gala Dock needs the right to grant it (Terms §7). Moral rights waiver. | CDPA s.87, s.90 | §3.3. |
| 3.4 unpublish | L | OK. | — | Keep. |
| 4 not allowed | L | OK. | — | Keep. |
| 5 reports and moderation | L | OK. | — | Keep. |

## 18. IP & Takedown (repo-only)

| Clause | Rating | Issue | Law | Redline [20] |
|---|---|---|---|---|
| Intro reg 19 hosting defence | L | Good. | e-Commerce Regs 2002 reg 19 | Keep. |
| 1 notice contents | L | Good. | — | Keep. |
| 2 action within 2 working days | L | "Expeditious" — fine. | — | Keep. |
| 3 counter-notice | L | OK. | — | Keep. |
| 4 repeat infringers | L | OK. | — | Keep. |
| 5 misuse | L | OK. | — | Keep. |
| 6 Gala Dock IP | L | OK. | — | Keep. |
| (missing) DSA Art 16 elements for EU notices | M | — | DSA | Note. |

## 19. Safeguarding & Abuse Policy (repo-only)

| Clause | Rating | Issue | Law | Redline [21] |
|---|---|---|---|---|
| Header: no deputy | M | Single point of failure; OSA expects a named accountable individual (Ofcom code ICU A2) — fine, but cover absences. | OSA codes | Appoint deputy or external cover. |
| §1 scope | L | Good. | — | Keep. |
| §2–3 principles, user expectations | L | OK. | — | Keep. |
| §4 response; break-glass; referral; DPA 2018 Sch 1 para 18 | L | Good. | DPA 2018 Sch 1 paras 18–19 | Keep. |
| §5 notifying users | L | Good. | — | Keep. |
| §6 training | L | OK. | — | Keep. |
| §7 review | L | OK. | — | Keep. |
| (missing) CSEA reporting to NCA | M | OSA s.66 requires UK providers to report detected CSEA content to the NCA (verify commencement of the regulations). | OSA s.66 | §4.7. |

## 20. Complaints Policy (repo-only)

| Clause | Rating | Issue | Law | Redline [22] |
|---|---|---|---|---|
| Event/provider complaints → dispute | M | References Payment Protection Terms. | X-2 | Disputes Policy. |
| How to complain | L | Good (postal address). | — | Keep. |
| Timescales 2/10/28 days; review 28 days | L | OK. | — | Keep. |
| Appeals against moderation "or decided a dispute" | **H** | We don't decide disputes; appeals on recommendations removed (DEC-107). | X-2 | Appeals only for moderation/enforcement; dispute escalation goes to independent route. |
| Data protection complaints | L | DUAA complaint duty (verify). | DUAA | Keep. |
| ADR: "not signed up" | L | Compliant with ADR Regs 2015 reg 19 info duty. DMCCA Part 4 Ch 4 ADR reforms (verify commencement). | ADR Regs 2015 | Keep. |
| Record keeping 3 years | M | Conflicts with 6-year dispute retention; pick by type. | — | 3 years complaints, 6 years if linked to a dispute. |
| (missing) OSA complaints | **H** | OSA s.21 complaint types (illegal content, wrongful takedown, non-compliance). | OSA s.21 | §OSA. |

## 21. Affiliate & Partner Terms (repo-only; accepted by tick but unpublished)

| Clause | Rating | Issue | Law | Redline [11] |
|---|---|---|---|---|
| 1.1 approved by Gala Dock | M | Self-signup + approval (M-30). | — | 2. |
| 1.2 partner types | L | OK. | — | Keep. |
| 2.1 referral counts within 60 days | M | M-38. | — | 4.1. |
| 2.1A grades; clear 14 days; paid monthly | **H** | 60-day hold, £50 minimum, Connect (M-31–M-35). | — | 5–7. |
| 2.2 no fees on refunds, fraud, self-referral, existing customers | **H** | Clawback/negative carry-forward not stated (M-36); recovering a paid commission without a clause is a debt claim only. | Contract | 6. |
| (missing) VAT, self-billing | **H** | M-03, M-34. | VAT Regs 1995 reg 13(3); Notice 700/62 | Schedule 1. |
| 3 acting for clients | L | OK. | — | Keep. |
| 4 API | L | OK. | — | Keep. |
| 5 brand; CAP Code disclosure | M | Add affiliate disclosure and honest claims (DMCCA; CAP Code 2.1). | CAP Code; DMCCA | 8. |
| 6 confidentiality; aggregated data | L | Matches totals-only. | — | Keep. |
| 7 term, 30 days; liability cap £1,000/fees; governing law | M | Add jurisdiction, P2B? (partners are not business users of a P2B service in the same sense — likely outside). Tax: partners resident abroad, sanctions. | — | 11–13. |
| (missing) Commercial Agents Regs 1993 | L | Partners refer subscriptions (services), not goods → Regs unlikely to apply (verify). | CAR 1993 reg 2 | Statement of non-agency. |

## 22. Promoter Terms (repo-only)

| Clause | Rating | Issue | Law | Redline [12] |
|---|---|---|---|---|
| 1.1–1.3 invite, 30-day cookie, paid primary orders | L | OK; consent-based cookie. | PECR | Keep. |
| 2.1 organiser owes commission; paid from proceeds after event | M | Who pays: organiser (from its balance) — Gala Dock only records/instructs. Clarify Gala Dock is not liable for organiser's non-payment. | X-2 | 2. |
| 2.2 own tax | L | OK. | — | Keep. |
| 3 rules; #ad | L | Good. | CAP Code; DMCCA | Keep. |
| 4 cookie; counsel note | M | Resolved in product (consent). | PECR | Update. |
| 5 ending | L | OK. | — | Keep. |
| (missing) liability, law, data | M | — | — | Add. |

## 23. AI / Gala Agent Terms (repo-only)

| Clause | Rating | Issue | Law | Redline [25] |
|---|---|---|---|---|
| 1.1 Azure OpenAI | L | Correct provider. | — | Keep. |
| 1.2 AI labelled | L | Good. | — | Keep. |
| 1.3 not professional advice | L | Good. | — | Keep. |
| 2 accuracy, prompt-injection | L | Good. | — | Keep. |
| 3.1–3.4 risk levels, autonomy incl. autopilot, responsibility | M | Automatic actions under policy autopilot: liability allocation exists (3.4) — add express term at enabling autopilot (Gigvora #12). | UCTA s.3 | 3.5. |
| 4 credits, caps | M | Expiry and overage in Subscription Terms. | — | Cross-ref. |
| 5.1 UK/EEA processing, no training; counsel note | M | Region unverified (M-67); Azure abuse-monitoring retention (verify; can be waived on approval). | Art 13; Ch V | 5.1. |
| 5.2–5.4 storage, no CoT, no Art 22 decisions | L | Good. | Art 22 | Keep. |
| 6–8 AUP, ownership, availability | L | OK; AI output copyright under CDPA s.9(3) computer-generated works (verify). | CDPA s.9(3) | Keep. |
| Scope | M | Must say: not available to customers (X-14). | — | Intro. |

## 24. Payment Terms v2 draft (gd-pt-1.0-2026-11-11)

| Clause | Rating | Issue | Law | Redline [03] |
|---|---|---|---|---|
| Scope | L | Good. | — | Keep. |
| 1.1 seller is merchant | L | Correct. | — | Keep. |
| 1.2 Gala Dock never holds money, never decides | L | Correct; keep. | PSRs para 2(j) | Keep. |
| 1.3 fees upfront, VAT incl. | L | Good. | DMCCA | Keep. |
| 2.1 seller fee ≤ 8% | L | Good. | — | Keep. |
| 2.2 buyer fees | M | Missing: who supplies the booking fee; seller collects it for Gala Dock (VAT). | VATA s.47(3) | 2A. |
| 2.3 refunds and fees; buyer fee non-refundable except seller/Gala cancels, duplicate, error, law | M | Non-refundable booking fee on a consumer's partial refund for seller's breach: if the consumer receives a price reduction for poor service, keeping the booking fee is arguably fine (our service performed). Fair if transparent. | CRA s.62 | Keep; add "or where the seller fails to provide the service". |
| 3.1 release triggers | L | Matches. | — | Keep. |
| 3.2 grouping | L | OK. | — | Keep. |
| 3.3 what stops a release | L | OK. | — | Keep. |
| 4.1–4.2 seller set-up first; no dashboard | L | OK. | — | Keep. |
| 5 reserves | L | Objective; good for perimeter. | — | Keep. |
| 6.1–6.2 refunds and chargebacks from seller | L | Good. | — | Keep. |
| 6.3 shortfall: "Any amount still uncovered is borne by Gala Dock" | **H** | Open-ended assumption of liability; under CRA s.69 a consumer could read it as a guarantee of refunds; inconsistent with Stripe-managed losses. | CRA s.69; contra proferentem | 6.4: discretion, owed to no buyer, no admission. |
| 6.4 ticket balance as reserve until event | M | Good; add that it is not held by Gala Dock and is not trust money. | — | 6.5. |
| 7 disputes | L | Good. | — | Keep. |
| 8.1–8.4 hold limit, early charges, warning, default rule | M | 8.4 consumer "remains liable" statement fine. 8.2 bookings charged > 58 days paid at hold limit before the event: tell consumers clearly at booking (it changes their protection). | CRA s.50; CCRs Sch 2 | Add pre-contract disclosure. |
| 9.1 pause grounds | **H** | M-17, M-18. | X-2 | 9.1(g) suspension; (d) reworded. |
| 9.2 suspicion | M | Keep principle; align code. | — | Keep. |
| 9.3 notice and audit | L | Good. | — | Keep. |
| 10 15 days' notice | L | Good; consumer changes need CRA-fair mechanism. | P2B Art 3 | Keep + consumers. |
| (missing) e-money / redemption, insolvency of seller, PORR tax holds, sanctions | M | — | EMRs reg 39; IA 1986 s.127; PORR | 9A, 9B, 11. |
| (missing) misdirected instruction liability | M | Gigvora 23.4. | UCTA | 12. |

## 25. Disputes Policy v2 draft (gd-dr-1.0-2026-11-11)

| Clause | Rating | Issue | Law | Redline [04] |
|---|---|---|---|---|
| 1 scope; chargebacks decided by issuer | L | Good. | — | Keep. |
| 2 recommend only | L | Good. | — | Keep. |
| 3 money moves only on (a)–(d); second-person check | L | Good. | — | Keep. |
| 4 open within 24 h after event | **H** | Must state expressly that it affects payout timing only, not statutory rights or court claims, and does not apply to cancellations (engine allows). | CRA Sch 2 para 20 | 4.2. |
| 5 parties file themselves; case pack | L | Good. | — | Keep. |
| 6.1 consumers ≤ £5,000 never arbitration | L | Correct. | AA s.91; SI 1999/2167 | Keep. |
| 6.2 > £5,000 arbitration only if agreed after dispute starts | L | Good (post-dispute agreement escapes Sch 2 para 20 concerns). | — | Keep. |
| 6.3 silence never binds consumer | L | Good. | — | Keep. |
| 7 business: "either party may refer to binding arbitration with an agreed provider" | **H** | Uncertain ("agreed provider" = agreement to agree); no seat, rules, number of arbitrators, law of the arbitration agreement (AA 2025 new s.6A defaults to law of the seat — verify); and no customer–seller contract carries it (X-3). | AA ss.5, 6, 6A (2025), 15–18 | 7: CIArb (or CEDR) rules, sole arbitrator, seat London, English law, appointing authority; documents-only below £25,000. |
| 8 deadline rules (business, opted-in, after in-force date) | M | Fine for B2B if incorporated (X-3). 8.2 deemed acceptance after 7 days — onerous; express tick. | UCTA s.3 | Keep + Standard Booking Terms. |
| Numbering jump 8 → 13 | L | Cosmetic but invites "missing clauses" arguments. | — | v3 numbers 9 as "Default rule" and keeps "clause 13" alias, or change the engine citation. |
| 13 default rule | L | Good. | — | Keep. |
| (missing) ADR signposting, costs, confidentiality, case-pack data protection | M | — | ADR Regs 2015; UK GDPR | 10–12. |

## 26. Live-text corrections v2 draft (P1–P3)

| Item | Rating | Issue | Redline |
|---|---|---|---|
| P1 /terms §9 | L | Correct and needed now. | Adopted in [01] §9. |
| P2 /privacy Anthropic → Azure | L | Correct; region still to confirm. | [13]. |
| P3 backups | L | Correct. | [13], [15]. |

---

## Index of redlines

| # | File | Replaces |
|---|---|---|
| 01 | `redlines/01-terms-of-service-v3.md` | `/terms` |
| 02 | `redlines/02-ticket-terms-v3.md` | `/ticket-terms` (with resale summary) |
| 03 | `redlines/03-payment-terms-v3.md` | Payment Terms v2 draft and Payment Protection Terms |
| 04 | `redlines/04-disputes-policy-v3.md` | Disputes Policy v2 draft |
| 05 | `redlines/05-organiser-terms-v3.md` | Organizer Terms |
| 06 | `redlines/06-supplier-terms-v3.md` | Provider Marketplace Terms |
| 07 | `redlines/07-venue-terms-v3.md` | Venue Marketplace Terms |
| 08 | `redlines/08-customer-terms-v3.md` | Customer Terms |
| 09 | `redlines/09-cancellation-refund-policy-v3.md` | Cancellation & Refund Policy |
| 10 | `redlines/10-resale-terms-v3.md` | Official Ticket Resale Terms |
| 11 | `redlines/11-partner-terms-v3.md` | Affiliate & Partner Terms |
| 12 | `redlines/12-promoter-terms-v3.md` | Promoter Terms |
| 13 | `redlines/13-privacy-policy-v3.md` | `/privacy` |
| 14 | `redlines/14-cookie-policy-v3.md` | `/cookies` |
| 15 | `redlines/15-data-retention-v3.md` | `/data-retention` |
| 16 | `redlines/16-data-processing-addendum-v3.md` | DPA |
| 17 | `redlines/17-acceptable-use-and-online-safety-v3.md` | AUP |
| 18 | `redlines/18-community-and-review-standards-v3.md` | Community Standards |
| 19 | `redlines/19-content-template-policy-v3.md` | Content & Template Policy |
| 20 | `redlines/20-ip-takedown-v3.md` | IP & Takedown |
| 21 | `redlines/21-safeguarding-policy-v3.md` | Safeguarding |
| 22 | `redlines/22-complaints-policy-v3.md` | Complaints |
| 23 | `redlines/23-subscription-and-credits-terms-v3.md` | NEW (plans, credit packs) |
| 24 | `redlines/24-standard-booking-terms-v3.md` | NEW (customer ↔ seller default terms) |
| 25 | `redlines/25-ai-terms-and-accessibility-v3.md` | AI Terms; Accessibility note |
