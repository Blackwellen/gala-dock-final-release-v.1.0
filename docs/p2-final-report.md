# Phase 2 — Customer App & Professional Organizer: final report

Date: 11 Oct 2026. Scope: the 85 references in `Designs/customer & Organizer workspace/`.

## Coverage
- **Designs → routes:** all 85 references map to a built route (`scripts/design/audit-p2.mjs` checks this on every run; 0 uncovered).
- **Route health:** 79/79 audited routes load clean as the right user: HTTP 200, no Next.js error dialog, no page errors, no console errors, no 404s or login bounces. `/organizer/marketplace/emergency` (session -3b) is checked separately.
- **Tracker:** `docs/p2-design-map.md` (every row ✅).

## Automated tests (Playwright, `--project=desktop`), 28 passing
| Area | Spec |
|---|---|
| Booking request, quote → deposit paid on Stripe Checkout (test card) → confirmed on return, ownership RLS | `customer/booking.spec.ts` |
| Plan-an-event wizard | `customer/plan-wizard.spec.ts` |
| Tickets: rotating QR, resale/cancel, RLS, two-step transfer offer | `customer/tickets.spec.ts` |
| Reviews | `customer/reviews.spec.ts` |
| Account, cards, calendar feed | `customer/account.spec.ts` |
| Guests, supplier messages, saved items | `customer/workflows.spec.ts` |
| Build canvas add/remove | `customer/build-canvas.spec.ts` |
| Create event (W01) | `organizer/create-event.spec.ts` |
| Pro ticket setup (5 steps) + sell-out release trigger + capacity validation | `organizer/ticket-pro.spec.ts` |
| Poster & media builder: render, export, storage, library | `organizer/poster-builder.spec.ts` |
| Invoice lifecycle: wizard → sent → reminder → part/full payment → paid | `organizer/money-workflow.spec.ts` |
| Team: invite crew, assign shift, double-booking guard | `organizer/team-workflow.spec.ts` |
| Page editor draft + public preview; save as template (no personal/financial data) | `organizer/builders.spec.ts` |
| Workspace settings edit + dialog focus regression | `organizer/settings.spec.ts` |
| Sales proposals | `organizer/sales-proposals.spec.ts` |

Run: `node --env-file=.env --env-file=.env.local node_modules/@playwright/test/cli.js test tests/e2e/customer tests/e2e/organizer --reporter=line --workers=1 --project=desktop --output=artifacts/test-results-p2`

## Bugs found and fixed during verification
- Kit `Dialog` stole focus on every keystroke because `onClose` was in the effect deps. Text typed into later fields leaked into the first field. Fixed app-wide.
- Customer Messages returned 500: a `"use server"` file exported a constant.
- Invoice page hydration mismatch (payment-link origin); map pins hydration mismatch (sub-pixel positions).
- Home "next event" date tile rendered blank; marketplace and build images with empty `src`.
- Confirmed/held cancellations bypassed the cancellation engine (now routed via Manage booking, also enforced server-side).
- Booking deposits created PaymentIntents outside payment orders (now Stripe Checkout through orchestration; holds use the conditional-hold engine).

## Design fidelity
- **Palette:** colours, edges and icons follow the references. The Organizer uses royal-blue ink with periwinkle secondary text; the Customer and public pages use navy ink with grey-blue secondary text. Real brand marks (Google Calendar, Outlook, Apple, Stripe, Resend, Microsoft) appear in integrations and calendar sync.
- **Pixel diffs:** `scripts/design/batch-p2.mjs` runs the comparison. Text-led pages score 8–12%, and My Tickets has improved to 18%. Photo-heavy pages score 20–30%; the remaining gap is mostly photography and mockup-only content. The shared top bars add 8–12% on every page (logo kept from `public` as instructed).

## Demo data mirrors the references
`scripts/seed-design-mirror.mjs` (run by `seed-demo-extras.mjs`) shapes the demo customer's data to the mockups:
- **My Tickets:** Upcoming 4 / Past 12 / Resale·Transferred 3; Sunset Sessions at The Loft, Taste & Tango at Bayview Center, Elite Sounds DJ shown as "Resale in progress".
- **Saved:** column order and tab counts.
- **Recently viewed:** the closest real listings to the mockup's four.
- **Reviews:** 3 completed bookings awaiting review; the 4 genuine recent reviews in the reference order.

The script is idempotent, keeps dates in the future, and never touches events copied into real accounts (`settings.demo_copy_of`). It doesn't invent reviews or listings, so counts that would need fake records (e.g. "Submitted (12)") stay truthful.

## Integrated from session -3b
Readiness panel, team conflicts, Live mode link, rotating signed QR, print/PDF tickets, ticket scanner, waiting list, build budget RPC and countdowns, cross-portal inbox links and listing enquiries.

## Payment confirmation
When the payer returns from Stripe Checkout, `/payments/[ref]` verifies the session server-side with Stripe and applies a paid PaymentIntent through the same idempotent `payment_order_succeeded` RPC the webhook uses (`src/lib/commerce/reconcile.ts`). Bookings confirm on return even when the webhook is delayed or unreachable (for example, local development without `stripe listen`). A later webhook delivery is a no-op. `customer/booking.spec.ts` pays with the 4242 test card and also proves the reconcile-only path.

## Known limits
- The pixel-diff target (5–9%) is met only on pages without large photography, unless demo data is reshaped to mirror each mockup.
