# Gala Dock Privacy Policy (v3 draft, gd-pp-3.0)

> **DRAFT v3: not in force, not published.** Q54 legal review, 2026-11-14 (AI review, not legal advice). Replaces `/privacy` (2026-10). Includes live-text corrections P2 (Anthropic removed) and P3 (backups). **Changes:** accurate processor list (Cloudflare, Resend, MapTiler, Google Fonts, video hosts, AV scanning); new data (trader status, tax reporting, chargeback holds, risk signals, partner VAT); controller split by data set; Art 9 note; no AI in customer accounts; DUAA complaints; EU representative placeholder. **Owner must confirm every [bracket] (regions, representative) before publishing.**

This policy explains how Blackwellen Limited, trading as Gala Dock ("we"), collects and uses personal data when you use galadock.com, our apps and services as a customer, organiser, venue or supplier, team member, promoter or partner. We follow the UK GDPR, the Data Protection Act 2018 and the Privacy and Electronic Communications Regulations 2003 (PECR).

## 1. Who we are
Blackwellen Limited (company 16482166), 61 Bridge Street, Kington, Herefordshire, HR5 3DJ (VAT GB508480488), is the controller of the personal data described here, except where §3 says otherwise. ICO registration ZC160806. Our Data Protection Officer is Jamahl Thomas [counsel CQ-27]: legal@galadock.com.

1A. **International users.** Gala Dock is available in the UK, the EU and other supported countries (not in sanctioned places). We are established in the UK; where the EU GDPR applies to you, you have the rights it gives you, and you can contact us or your local data protection authority. *[Q74 2026-11-14: owner decision D2]*

## 2. The data we collect
- **Account and profile:** name, email, phone, password (only as a secure hash), photo, home area, language, interests, notification and marketing preferences, two-step verification settings.
- **Events and planning:** events you create or join, guest lists, plans, budgets, tasks, programmes, seating and venue layouts.
- **Marketplace activity:** enquiries, quotes, holds, bookings, cancellations, reviews and disputes.
- **Tickets:** orders, ticket-holder and attendee names, seats, transfers, resale listings, check-ins, and whether a ticket is on hold because of a card dispute.
- **Payments:** amounts, status, refunds, chargebacks and payouts. Card details are collected by Stripe; we never see your full card number.
- **Sellers and workspaces:** business details, trader status declaration, listings, team members, insurance and licence documents, payout and verification status from Stripe Connect (we receive the result of Stripe's identity checks, not ID images), and **tax-reporting details** (name, address, date of birth, tax identification number, VAT number, amounts earned).
- **Partners and promoters:** application details, VAT status and number, attributed referrals (totals), commission statements.
- **Messages** between members, workspaces and support.
- **Support, safety and risk:** support cases, reports, trust and safety cases, and fraud and risk signals.
- **Technical:** device and browser information, IP address, sign-in events, security logs, Cloudflare Turnstile checks, and the cookies and storage in our Cookie Policy.
- **Gala Agent (organisers and suppliers only):** instructions you give and actions it prepares or takes. Gala Agent isn't available in customer accounts.

Special category data: you may tell us about dietary needs (which can reveal religion or health) or access needs (health). We use it only to deliver your booking or ticket, on the basis of your explicit consent or because you made it available for that purpose, and an organiser or supplier who collects it must have its own lawful basis.

## 3. When an organiser or supplier is the controller
- **Attendee and guest data an organiser collects** for its event: the organiser is the controller and we are its processor under our Data Processing Addendum.
- **Your booking details given to a supplier or venue** so it can deliver: the supplier and we are each independent controllers.
Questions about those uses should go to the organiser or supplier first; we'll help them respond.

## 4. Why we use data and our lawful bases
| Purpose | Lawful basis |
|---|---|
| Run your account; planning, marketplace, ticketing and messaging | Contract (Art 6(1)(b)) |
| Payments, tickets, payouts, refunds, chargebacks and ticket holds | Contract; legal obligation for financial records (6(1)(c)) |
| Tax reporting to HMRC about sellers | Legal obligation (Platform Operators (Due Diligence and Reporting Requirements) Regulations 2023) |
| Security, fraud prevention, seller verification, sanctions compliance, enforcing our terms | Legitimate interests (6(1)(f)); legal obligation |
| Online safety: reports, moderation, statements of reasons, appeals | Legal obligation (Online Safety Act 2023); legitimate interests |
| Safety reports, disputes, legal requests, case-linked staff access to messages (§7) | Legitimate interests; legal obligation; vital interests where someone is at risk |
| Service messages about bookings, tickets, account and security | Contract; legitimate interests |
| Marketing emails and personalised recommendations | Consent, which you can withdraw in settings or from any email; for existing customers, similar-products emails with an opt-out (PECR reg 22(3)) |
| Improve our services, aggregated analytics (only with your analytics choice) | Legitimate interests; consent for analytics |
| Gala Agent for organisers and suppliers | Contract |

We use risk scoring to flag possible fraud or breaches. A person reviews any decision that significantly affects you, such as suspending an account. We don't make solely automated decisions with legal or similarly significant effects.

## 5. Who we share data with
- **Other users, as needed:** your booking details go to the seller you book; attendee names to the organiser; your trader status to buyers; reviews are public.
- **Service providers acting for us** (each bound by a contract limiting use):
  - Stripe (payments, Connect payouts, identity checks; Stripe is an independent controller for its regulated activities);
  - Supabase (database, authentication, file storage) [region: confirm];
  - Vercel (hosting) [region: confirm];
  - Cloudflare (Turnstile bot protection; R2 object storage and encrypted backups) [jurisdiction setting: confirm];
  - Resend (transactional email);
  - Microsoft Azure OpenAI Service (Gala Agent for organisers and suppliers; prompts and outputs aren't used to train Microsoft's models) [region: confirm];
  - MapTiler (map tiles and address search, called by our servers) and OpenStreetMap (map data and some tiles);
  - Google Fonts (font files loaded by your browser, which sends your IP address to Google);
  - video hosts you or sellers embed (for example YouTube or Vimeo), only when you play the video [or: only after consent];
  - Blackwellen's own virus-scanning service for uploaded files.
- **HMRC** and other authorities where the law requires (including tax reporting), to protect someone's safety, or to establish or defend legal claims; **Ofcom** where the Online Safety Act requires; the **police or NCA** for safeguarding.
- **A buyer of our business**, subject to this policy.

We don't sell your personal data.

### Calendar integrations
[Unchanged from 2026-10: write a separate "Gala Dock" calendar; read only free/busy; tokens encrypted AES-256-GCM; scopes `calendar.app.created`, `calendar.freebusy`, Microsoft `Calendars.ReadWrite`; deleted on disconnect or account deletion; Google API Services User Data Policy incl. Limited Use.]

## 6. International transfers
| Provider | Where | Safeguard |
|---|---|---|
| Stripe Inc. | US | UK Extension to the EU–US Data Privacy Framework / IDTA [confirm] |
| Vercel Inc. | US [confirm] | UK Extension to DPF / IDTA |
| Cloudflare Inc. | US/global | UK Extension to DPF / IDTA |
| Resend Inc. | US | IDTA / Addendum [confirm DPF status] |
| Supabase Inc. | UK region for data; support access from US [confirm] | IDTA |
| Microsoft | [UK/EEA region: confirm] | UK adequacy for EEA; Microsoft DPA |
| MapTiler AG | Switzerland | UK adequacy regulations |
| Google (Fonts) | US | UK Extension to DPF |
We carry out a transfer risk assessment where we rely on the IDTA or Addendum.

## 7. Access to your messages by Gala Dock staff
[Unchanged from 2026-10: no browsing; case-linked, read-only, time-limited, recorded reason, fresh verification, second approver for high-risk access where available, every conversation logged and reviewed by the DPO; staff can never send, edit or delete as you; you're told afterwards where lawful and safe.]

## 8. How long we keep data
We keep personal data only as long as needed for these purposes or the law; then we delete or anonymise it. Periods are in the Data Retention Schedule (for example financial and tax-reporting records 6 years; staff access records 6 years).
**Backups.** Supabase keeps daily backups for 7 days. Our own encrypted copies are kept for up to 63 days (hourly and daily copies up to 8 days, weekly up to 29 days, monthly up to 63 days). Deleted data leaves every backup within 65 days. If we ever restore a backup, we re-apply earlier deletion and erasure requests before the data is used.

## 9. Your rights
Access, correction, erasure, restriction, objection (including to marketing at any time), portability, and withdrawing consent. Some rights are limited where we must keep data by law or for legal claims. Contact legal@galadock.com. We reply within one month, or tell you if we need up to two more months.

## 10. Security
Encryption in transit and at rest; database access controls that limit each account to its own data; two-step verification for staff administrators with fresh verification for sensitive actions; malware scanning of uploads; audit logging; regular access reviews. If a breach puts your rights at risk, we tell you and the ICO as the law requires.

## 11. Children
Accounts are for people aged 18 or over. Tickets may be bought for younger attendees where the organiser allows; the adult buyer is responsible for the attendee information they give. We don't knowingly collect data from children except attendee names and any details an adult provides for them.

## 12. Complaints
Please contact our DPO first; we'll acknowledge your complaint within 30 days and tell you the outcome. You can complain to the Information Commissioner's Office: ico.org.uk/make-a-complaint, 0303 123 1113.

## 13. Changes
We post updates here with a new version date and tell you before any significant change takes effect.
