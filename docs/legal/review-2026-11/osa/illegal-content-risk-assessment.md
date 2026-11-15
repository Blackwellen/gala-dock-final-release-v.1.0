# Illegal content risk assessment — Gala Dock (Online Safety Act 2023, s.9)

> **DRAFT for owner signature (decision D8). AI-prepared, not legal advice.** Built on `../online-safety-act.md` and the product as
> of 2026-11-14 (Q74). Follow Ofcom's *Risk Assessment Guidance and Risk Profiles* (four-step method) and keep this record under
> s.23. Items marked **(verify)** must be checked against Ofcom's current register before signature.

| | |
|---|---|
| Service | Gala Dock (galadock.com and apps), operated by Blackwellen Limited (16482166) |
| Service type | Regulated user-to-user service (s.3). Not Category 1/2A/2B. Not exempt (Sch 1 para 4 doesn't apply: listings are user-published and there is direct messaging) |
| Assessment date | [DATE] · first assessment, before launch of live money |
| Next review | 90 days after launch, then every 12 months, and **before any significant change** (e.g. public user profiles for consumers, open messaging, livestreams, opening to under-18s) |
| Senior accountable person (illegal content duties) | **[NAME — owner to appoint]**, [role] |
| Deputy / external cover | [NAME / firm] |
| Prepared by | Q74 legal-engineering lane (draft) · reviewed by [counsel] |

## Steps 1–2 — Understand the harms (priority illegal content, Sch 5–7, and other relevant offences) and assess the risk

Likelihood × impact for UK users, using the service's risk factors (Ofcom Risk Profiles: user-to-user, messaging, user profiles, marketplace/listings, posting reviews, file upload).

| # | Harm (offences) | Where it could happen on Gala Dock | Risk factors present | Existing controls (evidence) | Likelihood | Impact | **Risk level** |
|---|---|---|---|---|---|---|---|
| 1 | **Fraud and financial services** (Fraud Act 2006; FSMA s.21) — fake events, fake venues/suppliers, ticket scams, payment diversion ("pay by bank transfer") | Listings, event pages, messages, resale | Marketplace, messaging, payments | Seller KYC by Stripe Connect; DEC-107: money only via seller's own Stripe account; non-trader warnings; off-platform payment nudges in messaging (`src/lib/messaging/safety.ts`); enquiry-only warning to buyers; risk signals + holds on new sales; **Report** on listings/events/reviews/messages (Q74/Q52) → one queue (`/admin/moderation`); sanctions block | Medium | High | **Medium–High** |
| 2 | **Harassment, stalking, threats** (PHA 1997; Malicious Communications Act 1988; OSA s.179–181) | Messages, reviews, provider responses | Direct messaging between strangers (marketplace) | Messaging limited to booking/enquiry-linked threads; block contact; report message; review moderation; rate limits | Medium | Medium | **Medium** |
| 3 | **Hate offences** (Public Order Act 1986 Pts 3–3A) | Listings, event descriptions, reviews | User-published text | Report + moderation; enforcement with reasons and appeals | Low | Medium | **Low** |
| 4 | **Intimate image abuse** (SOA 2003 s.66B) | Uploaded photos, message attachments | File upload | AV scan of uploads (ops AV gateway); report; removal | Low | High | **Low–Medium** |
| 5 | **CSEA** (grooming; indecent images of children) | Messaging; uploads; children's-party and school-event contexts | Messaging, uploads | 18+ accounts (self-declared); messaging linked to bookings; no public discovery of private individuals; report with **child safety** reason → urgent priority; Safeguarding Policy; NCA reporting process **(to build, s.66 commencement — verify)**. No CSAM hash matching yet | Low | Very high | **Medium** (impact-driven) |
| 6 | **Terrorism** | Event pages, listings | User-published | Report (illegal content); moderation | Very low | Very high | **Low** |
| 7 | **Weapons / drugs sales**, prohibited items | Listings, merch (no UI yet) | Marketplace | Listing review; prohibited-item reason code; report | Low | High | **Low** |
| 8 | **Unlawful immigration / modern slavery** (MSA 2015) | Staffing supplier listings | Marketplace (staffing) | Supplier verification; credentials; report | Low | High | **Low–Medium** |
| 9 | **Encouraging suicide / self-harm; extreme pornography** | Messages, uploads | Messaging, uploads | Report; removal; signposting | Very low | High | **Low** |
| 10 | **False communications / foreign interference** | Reviews, listings | Reviews | Verified-booking reviews; fake-review reason code | Low | Low | **Low** |

Overall: **specific risk** for fraud (1) and CSEA (5, impact-driven); **low risk** otherwise (verify Ofcom's "low / specific / multi-risk" classification).

## Step 3 — Decide measures (Illegal Content Codes of Practice for user-to-user services, in force 17 March 2025 — verify current version)

| Code measure (small, specific-risk service) | Status | Evidence / action |
|---|---|---|
| Named senior person accountable for illegal-content duties (ICU A2) | **Owner action** | Name above |
| Content moderation function that reviews and swiftly takes down illegal content (ICU C1–C2) | Built | `/admin/moderation` (content + message + legacy review reports; urgent first); `admin_decide_content_report`, `admin_decide_message_report`; trust enforcement with reasons/appeals |
| Internal content policies and moderation targets (ICU C3–C4) | Draft | Targets: urgent (CSEA, threats to life) same day; illegal content 2 working days; other 5 working days **[owner to confirm]** |
| Easy-to-use reporting for illegal content (ICU D1–D7) | Built (Q74/Q52) | Report on listings, events, reviews, business profiles, messages; signed-out users sent to sign in or email support. **Gap:** public report form for non-users (PHASE B) |
| Complaints procedures incl. appeals (ICU D8–D14) | Partly | Outcome notifications to reporters; review authors get reasons + appeal route via Complaints; Complaints Policy v3 §5 adds OSA categories |
| Terms of service provisions (ICU G1–G3) | Drafted | `../redlines/01` §8, `../redlines/17`; live correction `/terms` §6 |
| User blocking (ICU for messaging) | Built | Block contact (Q52) |
| Fraud: keyword detection / dedicated reporting channel | Partly | Off-platform payment nudges + risk scanner; "Scam / pay outside Gala Dock" report reason. Larger-service measures not required (verify) |
| CSAM hash matching / URL detection | **Not built** | Proportionate decision needed (IWF list) — PHASE B; at least plan it given children's-party contexts |
| Staff training | Policy | Safeguarding Policy §6 annual training |

## Step 4 — Report, review and update
- Record: this document + `children-access-assessment.md`, kept 3+ years (retention row `content_reports.closed`, disabled pending legal review).
- Report to: the senior accountable person quarterly (open reports, time to decision, removals, appeals).
- Review triggers: as above; also after any serious incident or Ofcom guidance update.

## Freedom of expression and privacy (s.22)
Messages are private and not monitored; staff access only through break-glass with a case, reason, MFA and audit. Reports never auto-hide content: a person decides. Statements of reasons go to affected users.

## Sign-off
| Senior accountable person | Signature | Date |
|---|---|---|
| [NAME] | | |
