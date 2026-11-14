# Behaviour vs text mismatches (Q54 legal review, 2026-11-14)

> **AI review, not legal advice.** This file lists places where the built product (code and migrations as of the working tree on 2026-11-14, including uncommitted lane work) and the legal texts say different things. Each row gives file references so counsel and engineering can check them together. "Live" means a page published at galadock.com. "Repo-only" means a document in `docs/legal/` that is **not published at any URL** (see M-01).
>
> Severity: **Critical** = a false statement or a missing contractual basis for something the product already does to people's money or tickets. **High** = a contradiction a claimant or regulator could rely on. **Med/Low** = needs fixing before v3 publication.

## A. Incorporation (the root problem)

| # | Sev | Text says | Product does | Refs | Fix |
|---|---|---|---|---|---|
| M-01 | Critical | `docs/legal/README.md`: Customer, Organizer, Provider, Venue, Resale, Payment Protection, Refund, DPA, AUP, Community, Content, Accessibility, Safeguarding, Complaints, IP, Partner, Promoter and AI terms are "approved for publication 12 Oct 2026". Organizer Terms "incorporate" the AUP, DPA etc. | Only six pages are published: `/terms`, `/privacy`, `/ticket-terms`, `/cookies`, `/data-retention`, `/accessibility` (`src/lib/legal.ts` `LEGAL_DOCS`). No route renders any `docs/legal/*.md`. Sign-up records only `terms_version` (`src/components/auth.tsx:186`). | `src/lib/legal.ts:26-33`; grep for any route serving the md files: none | The indemnities, fee-retention on cancellation, non-circumvention, force-majeure definition, DPA (UK GDPR Art 28), seller liability caps, partner self-billing agreement and promoter rules are **probably not part of any contract today**. Publish the v3 set at stable URLs, record acceptance per role with version, user and time, and re-accept existing business users (P2B 15 days' notice). |
| M-02 | High | Partner apply form: "I accept the Gala Dock Affiliate & Partner Terms (version X)" | The form shows no link to the text, and the text isn't published | `src/app/partner/apply/apply-form.tsx:33` | Link to the published Partner Terms v3; record the version shown. |
| M-03 | High | Self-billed statement: "issued … under the self-billing agreement in the Gala Dock Affiliate & Partner Terms" | The Partner Terms (2026-10) contain no self-billing agreement. VAT Regulations 1995 reg 13(3) needs a prior written agreement with the required content | `src/app/partner/statements/[id]/page.tsx:51`; `docs/legal/partner-terms.md` | Partner Terms v3 Schedule 1 (self-billing agreement). Until then, do not issue self-billed VAT invoices to VAT-registered partners. |

## B. Money model (DEC-107)

| # | Sev | Text says | Product does | Refs | Fix |
|---|---|---|---|---|---|
| M-10 | Critical | `/terms` §1: "We … collect payments on their behalf"; §9: "we may decide how the funds we hold are released or refunded" | Direct charges on the seller's own Stripe account; Gala Dock never holds funds; staff recommend only (`admin_dispute_update` refuses staff "resolved") | `src/app/(legal)/terms/page.tsx:22,76`; `supabase/migrations/202611116001_dec107_manual_payouts.sql`, `202611116002_dec107_disputes.sql` | P1 in `live-text-corrections-v2-draft.md` plus `redlines/01-terms-of-service-v3.md` §§1, 9. |
| M-11 | Critical | Payment Protection Terms (repo-only) 1.1–1.4: Gala Dock is merchant of record, holds money on its platform balance, payment to Gala Dock discharges the customer | Seller is merchant of record; money never touches Blackwellen's balance | `docs/legal/payment-protection-terms.md`; dec107 doc §1 | Withdraw; replace with Payment Terms v3. |
| M-12 | Critical | Customer Terms 1.2, 6.1; Provider 1.3, 5.2; Organizer 2.1, 3.1; Venue 6; Refund 3.5, 4, 5; Complaints: Gala Dock "takes", "holds", "protects" money; "payment to Gala Dock discharges"; "Gala Dock reviewer decides" | Same as M-10 | the files named | All v3 drafts. These sentences are admissions against the PSRs 2017 technical-service-provider position (Gigvora barrister review C-01, C-02). |
| M-13 | High | `/ticket-terms` intro: "Gala Dock sells tickets on the organiser’s behalf"; Organizer 2.1: Gala Dock "acts as your commercial agent to sell tickets, take payment" | Organiser is merchant of record on its own Stripe account; Gala Dock only takes an application fee | `src/app/(legal)/ticket-terms/page.tsx:12`; `docs/legal/organizer-terms.md` 2.1 | Say the organiser sells; Gala Dock runs the platform. Also matters for VAT (VATA 1994 s.47(3), see `tax-and-reporting.md` §2). |
| M-14 | High | Provider 5.2, Payment Protection 2, Customer 6.2, Refund 4: release 48 h after the event; Organizer 2.5: proceeds "paid … under your settlement schedule", hold only "where there is a material risk" | Bookings release on customer confirmation or event end + 24 h; tickets/resale/merch at event end + 5 UK business days, always, never before the event | `dec107_release_sweep`; `ticket_payout_delay_business_days`; migration 202611116010 (dec107 doc §9) | v3 Payment Terms 3.1; delete Organizer 2.5. |
| M-15 | High | Refund Policy 4, Customer 6.2, Payment Protection 3.1: dispute window 48 h | Engine closes the window 24 h after the event (`dispute_window_closed`) | migration 202611116007 | v3 texts say 24 h and say the window only affects payout timing, not legal rights. |
| M-16 | Critical | Payment Terms v2 draft 6.3: "Any amount still uncovered is borne by Gala Dock" (no limit, no addressee) | Staff may record that Gala Dock absorbs a liability (`adm_covered_liability_absorb`, discretionary, aal2) | migration 202611116010; `src/lib/commerce/releases.ts` `capGroupToAvailable` | Redraft as a discretion owed to no buyer: `redlines/03-payment-terms-v3.md` 6.4. See `insulation-map.md` S1/S3. |
| M-17 | Critical | Payment Terms v2 9.1: payouts paused **only** on six listed grounds; 9.2: "Suspicion alone is never a ground … the money stays in the seller's own balance" | (a) A Trust & Safety **workspace suspension** pauses payouts (`dec107_payouts_paused` reads `trust_active_enforcement … workspace_suspended`). (b) `payout_eligible()` also refuses on an automatic `risk_hold_active('payout', …)` placed from risk signals ("Payouts paused for a security review"). (c) Partner settlement refuses on a payout risk hold | `supabase/migrations/202611146802_trust_owner_decisions.sql:15-36,62-71`; `202610294019_risk_signals_abuse.sql:158-185`; `202611146951_partner_decisions.sql:362` | Owner decision D5. Either add "a suspension under Terms §11 for a listed breach, after human review, with notice" as ground 9.1(g) (recommended, done in v3), or stop the behaviour. Automatic risk holds should never stop a DEC-107 release; keep them for new sales and sign-in only. |
| M-18 | Med | Payment Terms v2 9.1(d): "a sanctions-screening match pending review" | Gala Dock runs no sanctions screening of its own; Stripe screens connected accounts only | grep `sanction`: only the pause basis list in 202611116001 | v3 rewords: "the payment provider restricts the account for sanctions reasons, or a match from screening we are required to do". See D4. |
| M-19 | Med | Payment Terms v2 says nothing about ticket chargeback consequences; `/ticket-terms` silent | Disputed ticket orders are **held** (refused at the door "Ticket on hold"), restored on a win, **voided** with capacity returned on a loss; transfers and resale blocked while held; gift transfers in scope | `supabase/migrations/202611146203_chargeback_ticket_holds.sql`; dec107 doc §10 | Add `redlines/02-ticket-terms-v3.md` §8. Without it, voiding a ticket is a breach of the ticket contract unless the organiser's own conditions allow it. |

## C. Tickets and resale

| # | Sev | Text says | Product does | Refs | Fix |
|---|---|---|---|---|---|
| M-20 | Med | `/ticket-terms` §2 cites CCRs 2013 reg **28(1)(g)**; Customer Terms 5.1 and the source register cite reg **28(1)(b)** | — | `ticket-terms/page.tsx:25`; `customer-terms.md` 5.1 | The two texts disagree. Our reading is that the leisure-services exception is reg 28(1)(b); counsel to verify. v3 cites "regulation 28(1)(b)" with a verify flag, or "regulation 28" only. |
| M-21 | Med | `/ticket-terms` §5 and Resale Terms 2.1: resale price is "capped at the original price paid" / "the lower of the price you paid and the organiser's cap" | Listing price is always the seller's `price_paid`. The listing is **refused** (`price_cap_exceeded`) if that exceeds `face_value × cap`, rather than priced at the cap. Cap base is `tickets.face_value` (list price before discounts) | `supabase/migrations/202611146702_marketplace_followups.sql:69-70,119-121,170` | v3 Resale: "you sell at the price you paid; if that is above the organiser's cap, you can't list". |
| M-22 | Med | Resale Terms 3.3 and `/ticket-terms` §5: "seller's proceeds are paid out once the payment is settled" / "recorded as a payout" | Resale is an organiser buy-back: the buyer pays the **organiser** by a new direct charge; the original holder is **refunded on their original charge** (face value; their £1 booking fee is kept) | dec107 doc §1 table, §3 proof row "Resale purchase + original refund" | v3 Resale §3 describes the refund route and the kept booking fee. |
| M-23 | Med | Resale Terms 4: "We don't reveal the seller's identity unless the law requires it" | Resale checkout shows a masked ticket reference (`GLD-••••-••XXXX`) and the merchant identity (the organiser) | 202611146702 line 162; Q57 row | Counsel question CQ-12: does the masked reference meet CRA s.90 (as amended, unique ticket number where one exists)? Under the buy-back model the organiser is the seller; s.90(6)–(7) disclosure is then "sold by the event organiser". |
| M-24 | Low | `/ticket-terms` §3: refund on postponement "within the period the organiser announces, which will be at least 14 days" | No explicit postponement refund-window mechanism found; queue notes reschedule "never writes settings.previous_starts_at" | backend-queue Q47 row | Confirm with the money lane before v3 publishes. |
| M-25 | Low | Customer Terms 7.1: QR code "changes every 30 seconds" | Rotating credential exists; interval not re-verified in this review | `src/lib/tickets/credentials.ts` | Say "changes regularly" (live page already does). |

## D. Partners and promoters (Q50/Q65/Q68: "9 terms mismatches → legal Q54")

| # | Sev | Partner Terms 2026-10 say | Built (owner decisions 2026-11-14) | Refs |
|---|---|---|---|---|
| M-30 | High | "Partners are approved by Gala Dock" (organisations only) | Self-serve application by companies, sole traders **and individuals**, admin approval (aal2, audited) | `202611146951_partner_decisions.sql` §6; `apply-form.tsx:25` |
| M-31 | High | Fees "clear 14 days after the revenue" | Earning hold **60 days** (`partner_earning_hold_days`) | 202611146951 lines 36-37, 54-56 |
| M-32 | High | "paid monthly" (method unstated) | Paid by **Stripe Connect transfer** from the platform balance to the partner's no-dashboard account, then manual payout; partners without an account accrue | 202611146951 §3 |
| M-33 | High | Base = "eligible net platform revenue" | Base = amount paid **net of VAT**, subscriptions **and credit packs** | 202611146951 lines 81-82 |
| M-34 | High | Nothing on VAT | VAT-registered **UK** partners get VAT **on top** via numbered self-billed statement; non-UK VAT-registered = reverse charge | 202611146951 lines 363-369; `src/lib/partners/rules.ts:18` |
| M-35 | High | No minimum | Minimum payout fee-driven (Connect fees ≤ 5%), floor **£50**, rolls over | `partner_minimum_payout()` |
| M-36 | High | "No fees are due on refunded amounts" | **Clawback** on refund and lost chargeback; negative statements **carry forward**; recovery by reversing the latest transfer where Stripe allows | 202611146502, 202611146951 §3 |
| M-37 | Med | Grade recalculated "whenever a referred account … stops paying" | Matches (grade drop on churn) | — |
| M-38 | Med | Referral counts if paid plan "within 60 days" of sign-up via link | Attribution uses a 30-day click cookie set only with consent (`gd_partner`, `/cookies`) and click-time attribution (pre-existing accounts not credited) | `src/app/(legal)/cookies/page.tsx` row `gd_partner`; Q50 row |
| M-39 | Med | Settlement refused when a payout risk hold is active | Not in terms | 202611146951:362 |
| M-40 | Med | Promoter Terms 4: "[Counsel: confirm whether the attribution cookie requires consent]" | Cookie set only after "Continue and credit the promoter" (consent) | `/cookies` row `gd_ref` | 
| M-41 | Med | Promoter Terms 2.1: commission paid "from the organiser's proceeds after the event" | Organiser approve-sales + promoter payout runs exist; the `stripe` promoter payout method is refused; partial-refund reversal built | 202611146951 §7; 202611146204 |
| M-42 | Low | Self-bill number format | `GDSB-YYYYMM-<8 hex of id>`: unique but **not sequential** within a series per supplier. VAT Regs 1995 reg 14(1)(a) asks for "a sequential number based on one or more series" | 202611146951:368 | Tax adviser to confirm; switch to a per-partner sequence if needed. |
| M-43 | Low | — | Statement wording "The VAT shown is payable to HMRC by the supplier" | statements page line 52 | VAT Notice 700/62 statement is "The VAT shown is your output tax due to HMRC". Use it verbatim. |

## E. Suppliers, venues, trust

| # | Sev | Text says | Product does | Refs |
|---|---|---|---|---|
| M-50 | Med | Provider Terms 4.3: public liability "normally … at least £2,000,000 per occurrence" | Required minimum seeded at **£1,000,000** (`min_cover_minor = 100000000`) and enforced for badges/listing holds | `supabase/migrations/*trust*` line 50; `202611146801_trust_bughunt_fixes.sql:148-161,273` | Owner decision D10. |
| M-51 | High | `/terms` §4, Organizer 3.4, Provider 8, AUP §2: no payment outside the platform for engagements arranged through it | Sellers in unsupported Connect countries are told to "agree payment with clients yourself"; checkout refusal says "Contact them directly to arrange payment" | `src/lib/payments/connect-countries.ts:122-136`; `202611146101_connect_seller_countries.sql` | v3 carves out enquiry-only sellers and warns buyers that off-platform payments have no Gala Dock protection (owner decision 2026-11-14 (3)). |
| M-52 | High | No text on country restrictions | Connect supported list of 36 countries; blocked list (BR, MY, AE, TH, IN, MX, ID, HR, GI, LI, ZA, NG, KE, GH, CI); other countries enquiry-only; no-country workspaces must set country before payouts | `connect-countries.ts:49-75` | v3 Terms §4A and Provider/Organiser terms. Note HR and LI are EU/EEA but blocked ("preview"). |
| M-53 | High | — | **No sanctions block** on sign-up or listing: a user in a comprehensively sanctioned country falls to "not_available" → enquiry-only listings and free events | grep `sanction`, `'RU'`, `'KP'`: none | Owner decision D4. |
| M-54 | Med | Data Retention: provider verification documents "while the listing is active and 6 years after" | Retention rules drafted but **disabled** (`enabled = false, legal_review_required = true`) | `202611146802_trust_owner_decisions.sql:202-206` | v3 retention schedule + enable after sign-off. |
| M-55 | Med | Provider 10.1: suspension of listings or payouts for listed grounds | Matches for listings; payouts see M-17 |
| M-56 | Low | Organizer 1.3: "Exceeding a limit pauses the relevant capability" | Limits enforced by DB triggers on **new** creation/publish only; existing items untouched; service-role writes (Gala Agent) not limited | `202611146901_settings_billing_build.sql`; Q67 row | v3 wording. |

## F. Privacy, cookies, AI

| # | Sev | Text says | Product does | Refs |
|---|---|---|---|---|
| M-60 | High | `/privacy` §5: "Anthropic: AI processing for some assistant features" | AI is Azure OpenAI only; no Anthropic SDK in `package.json`; owner decision 2026-10-28 | `privacy/page.tsx:58` |
| M-61 | Med | `/privacy` §5: maps "such as OpenStreetMap" | Tiles and geocoding proxied through MapTiler (`api.maptiler.com`) server-side; CSP also allows browser calls to `tile.openstreetmap.org` and `nominatim.openstreetmap.org` | `src/app/api/maps/tile/.../route.ts:6-10`; `src/lib/security/csp.ts:50,54` |
| M-62 | Med | `/privacy` §5 omits | Cloudflare (Turnstile on sign-in/sign-up; R2 object storage and backups), Resend (email), Google Fonts (browser connects to `fonts.googleapis.com`/`fonts.gstatic.com`), video embeds (`frame-src` VIDEO), Blackwellen operations AV-scan gateway | `csp.ts:45-57`; `src/lib/r2.ts`; `src/lib/email/send.ts`; `src/components/turnstile.tsx` |
| M-63 | Med | `/privacy` and Customer Terms §9 describe Gala Agent for all users | Owner decision 2026-11-11: no AI in the customer workspace | memory `no-ai-in-customer` |
| M-64 | Med | DPA Annex 3: "[Confirm region]", "[confirm support access transfers]", Resend/Cloudflare "(when enabled)" | Both are enabled; placeholders in an "approved" text | `docs/legal/data-processing-addendum.md` Annex 3 |
| M-65 | Med | `/cookies`: no Turnstile or video-embed storage listed | Turnstile and embedded players can set or read device storage | `csp.ts` |
| M-66 | Low | `/privacy` §8 / `/data-retention`: no backup statement | Backups: Supabase 7 days; R2 copies to 63 days; erasure re-applied after restore (cross-brand §5) | `live-text-corrections-v2-draft.md` P3 |
| M-67 | Low | AI Terms 5.1: processing "in the United Kingdom, or in the EEA … does not leave the UK/EEA" | Azure endpoint region not verifiable from code (env-configured) | `src/lib/agent/llm.ts:14,63` | Owner to confirm the deployment region and data-zone setting before stating it. |

## G. Online safety and moderation

| # | Sev | Text says | Product does | Refs |
|---|---|---|---|---|
| M-70 | High | AUP §8: "Report content or behaviour using the Report option in the app" | No user-facing report flow found for messages, users, listings, event pages or reviews. `review_reports` exists only in generated types; template reporting exists (`src/lib/media/actions.ts`) | grep `review_reports`, `report` in `src/components/messaging`, `src/app/api/messages` |
| M-71 | Med | Community Standards §3: removal decisions "can be appealed" | Appeals run through the Complaints Policy only (manual) | — |

## H. Subscriptions and VAT

| # | Sev | Text says | Product does | Refs |
|---|---|---|---|---|
| M-80 | High | Payment Terms v2: plans and credit packs "are covered by the subscription terms instead" | No subscription terms exist | — |
| M-81 | High | Organizer 6.5 / Provider 5.5: business fees "plus VAT" at 20% | `trg_checkout_order_vat` adds UK VAT to **every** seller commission, whatever the seller's country or VAT status, and treats every booking fee as a UK VAT-inclusive supply wherever the event is | `supabase/migrations/202610280020_vat.sql:37-49` | See `tax-and-reporting.md` §3. |
| M-82 | Med | Plans "exclude VAT" | Automatic tax behind `BILLING_AUTOMATIC_TAX` (not yet set in Vercel); without it, Stripe may charge no VAT on UK plan sales | Q67 row | VAT is still due on UK supplies; owner to set the flag before live. |
| M-83 | Low | — | Stripe customer portal handles cancellation | Q67 | v3 subscription terms describe it. |

## I. Things that already match (checked)

- Payment Terms v2 1.2, 2.1, 2.3, 3.1, 3.3, 4.1, 5, 8 against the engine (engine review table in the v2 draft; re-checked against dec107 doc §§1–4, 9).
- Disputes v2 clauses 2–6, 8, 13 against `dispute_route`, two-person awards, case pack, 24 h window (202611116002, 6007).
- Trader declaration and non-trader warning (202611116008).
- Promoter cookie consent (`/cookies`).
- Consumer fees VAT-inclusive and drip pricing incl. £1 fee everywhere (Q57).
