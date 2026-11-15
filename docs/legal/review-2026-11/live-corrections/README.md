# Live-text corrections (Q74, 2026-11-14) — SUPERSEDED 2026-11-15

> **Superseded by the signed-off legal pack 3.0** (R3, owner sign-off 2026-11-15): the published texts are `content/legal/*.md`, rendered by
> `src/components/legal/legal-document.tsx`; the 2026-10 pages are archived at `/legal/archive/*-2026-10`. These drafts are kept as the record of the interim corrections.

> **AI-drafted, not legal advice. Do not publish until the owner and counsel have signed off (decision D1).** The live pages in
> `src/app/(legal)/**` and `src/lib/legal.ts` are **unchanged**. Each `*.txt` file here is the full replacement text for one live
> file; to publish, copy it over the live file (dropping the `// DRAFT` line and the `.txt` suffix), set `LEGAL.effective`, bump
> `profiles.terms_version` handling, and give business users 15 days' notice (P2B Regulation art. 3(2)).

| Live file | Draft | Status |
|---|---|---|
| `src/lib/legal.ts` | `legal.ts.txt` | changed |
| `src/app/(legal)/terms/page.tsx` | `terms.page.tsx.txt` | changed |
| `src/app/(legal)/privacy/page.tsx` | `privacy.page.tsx.txt` | changed |
| `src/app/(legal)/ticket-terms/page.tsx` | `ticket-terms.page.tsx.txt` | changed |
| `src/app/(legal)/cookies/page.tsx` | `cookies.page.tsx.txt` | changed |
| `src/app/(legal)/data-retention/page.tsx` | `data-retention.page.tsx.txt` | changed |
| `src/app/(legal)/accessibility/page.tsx` | — | no correction needed (re-checked; full v3 statement is redline 25) |

## Diff summary

### `legal.ts`
- `version` 2026-10 → 2026-12; `effective` → placeholder for the publication date.
- Fee strings: "plus VAT" → "plus VAT where it applies" (non-UK businesses are reverse-charged).
- New `insurance` (£1m / £2m, D10) and `availabilityHelp` (sanctions page, D4).

### `/terms`
| § | Was | Now | Why |
|---|---|---|---|
| 1 | "We provide the platform, collect payments on their behalf, and help resolve disputes." | Seller sells in its own name; money goes straight to the seller's Stripe account; Gala Dock is not a bank/escrow/insurer. | M-10/M-12 (DEC-107); VATA s.47(3) (tax-and-reporting §2.3) |
| 2 | — | Where Gala Dock is available (UK, EU and supported countries, consumers included); sanctions list and refusal. | D2, D4 (no EU-representative wording) |
| 4 | "Payouts go to the … connected Stripe account, after any holding period and minus fees, refunds and chargebacks." "Members must not take payment outside the platform…" | Payout triggers (event + 5 business days; bookings: confirmation or event + 24 h); listed pause grounds (incl. trust suspension and PORR tax details); 12-month non-circumvention with enquiry-only carve-out; VAT/reverse charge; plans and packs business-only. | M-14, M-17, D5, D7, D11, D15 |
| 5 | Insurance "as your activity needs" | £1m standard / £2m higher-risk; platform-reporting tax details. | D10, D7 |
| 6 | "…withhold payouts while we investigate" | Report button on listings/events/reviews/messages; human review, reasons, appeal; payouts paused only on Payment Terms grounds. | M-17 (suspicion is not a pause ground), M-70, OSA s.10(5), s.20 |
| 8 | Gala Agent for everyone | Organiser/provider workspaces only; Azure OpenAI; customers have no AI features. | M-63, owner decision 2026-11-11 |
| 9 | "we may decide how the funds we hold are released or refunded" | P1 text: 24-hour window, recommendation not decision, money-moving events, consumers ≤ £5,000 never forced to arbitrate. | M-10, M-15 |
| 10 | "…fees you paid us in that period and £1,000. Money we hold that is payable to you does not count…" | Greater of £1,000 and 12 months' fees; payment instructions (incl. misdirected) outside the cap. | D13, M-10 |
| 12–13 | — | 15 days' notice to business users; consumers abroad keep local mandatory law. | P2B; D2 |

### `/privacy`
- §2: platform-reporting tax details; business billing details; IP country; Turnstile; reports; Gala Agent limited to business workspaces.
- §4: new lawful-basis rows: sanctions compliance; PORR reporting to HMRC (legal obligation); OSA reports.
- §5: **Anthropic removed** (M-60); processor list = Stripe, Supabase, Vercel, **Resend, Cloudflare (Turnstile, R2), Microsoft Azure OpenAI, MapTiler (+ OpenStreetMap), Google Fonts**, AV-scan service (M-61, M-62). Azure region placeholder — owner to confirm (M-67).
- §8: PORR retention; **backups** paragraph (P3 / M-66).

### `/ticket-terms`
- Intro: organiser sells in its own name; Gala Dock provides software + checkout (M-13, VAT s.47(3)).
- §2: **reg 28(1)(b)** (was 28(1)(g)) with counsel verify flag (M-20).
- §3: postponement window wording no longer promises "at least 14 days" pending the money lane (M-24).
- §5: resale price rule as built (M-21) and buy-back refund route (M-22).
- New §5A: **chargeback holds** (M-19; built in 202611146203).
- §7: Report this event.

### `/cookies`
- Third-party list: Stripe, **Cloudflare Turnstile**, **Google Fonts**, MapTiler/OpenStreetMap, **embedded video** (M-65).

### `/data-retention`
- New rows: PORR tax details (6 years, verify), OSA reports (3 years, verify), sanctions records (6 years), **backups** (65 days).

## Not changed here (needs the full v3 set after counsel)
- Customer/Organiser/Supplier/Venue/Payment/Disputes/Partner/Promoter/Subscription terms are repo-only today (M-01); they are in `../redlines/` (v3, updated for D2, D5, D10, D11, D13, D15 on 2026-11-14).
- The "£2,000,000" figure was only in the repo-only Provider Terms (M-50); Supplier v3 §4.3 and Venue v3 §2A now state £1m / £2m by category, matching `credential_requirements` (202611147401).

## Sign-off
| Role | Name | Date | Signature |
|---|---|---|---|
| Director (owner) | | | |
| Counsel | | | |
