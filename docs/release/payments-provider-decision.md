> **SUPERSEDED 2026-11-11 (owner):** Gala Dock adopts the director-approved **DEC-107** model on **Stripe** (see `docs/cross-brand-notes-2026-11-10.md` §1–2): no-dashboard connected accounts, direct charges on the seller's account, Gala Dock's fee as the application fee, manual payouts on approved triggers only. It covers suppliers and venues, ticket sales, ticket resales (still grouped under their event) and subscriptions/credit packs. The Ryft/Mangopay plan below is kept for history only. Stripe stays in test mode until the owner says go live.

# Payments provider decision — Stripe now, Ryft or Mangopay before launch

**Owner decision, 2026-10-30.** Not set up yet — this records the plan only.

## Decision
- **Until just before launch:** Stripe in **test mode only** (new sandbox `acct_1UW176Ae36uXyrUn`). No live Stripe payments.
- **Right before launch:** move payments to **Ryft** or **Mangopay** (choice to be made). Both run as the regulated party for marketplace payments (holding and paying out funds on behalf of sellers), so Gala Dock does not need its own FCA authorisation or payments counsel for the flow of funds. Confirm this with the chosen provider's onboarding/compliance team before signing.

## State as of 2026-10-30
- Vercel `STRIPE_CONNECT_SECRET_KEY` (the key the app charges with): **production = sandbox (test)**, preview + development = sandbox. It was briefly set to the live key earlier the same day and has been switched back; no production deploy ran in between (project paused).
- The new live Stripe account (`acct_1UW16CArv3W3VbtP`) has webhooks, VAT tax id GB508480488, a UK Stripe Tax registration and the live catalogue (7 products, 11 prices). It is **not used** and can be left dormant or closed when the provider switch is done.
- The live Stripe values (`STRIPE_SECRET_KEY`, `STRIPE_PUBLIC_KEY`, live webhook secrets/ids) are still stored in Vercel; unused while the Connect key is a test key.
- The Stripe test↔live mode separation (migrations 202610295001–5003) stays — it keeps test data out of any future live figures regardless of provider.

## What the switch will involve (when it is scheduled — do not start yet)
1. **Choose Ryft or Mangopay.** Compare: UK marketplace/split-payment support (direct sales by organisers and suppliers, Gala Dock fee taken per payment), seller onboarding and KYC flow, payouts to sellers' bank accounts, refunds and disputes, card + wallet methods, VAT invoicing of Gala Dock's fees, fees, and who holds the regulatory permissions.
2. **Integration surface to replace** (today Stripe Connect direct charges, Q07): `src/lib/stripe.ts`, `src/lib/payments/*` (client, service, webhook-core, stripe-mode), `src/lib/commerce/connect.ts` and the orchestrator, `src/app/api/stripe/webhook`, `src/app/api/payouts`, checkout (`/checkout`, `/api/checkout/session`), invoice pay links, resale payouts, merch, supplier deposits/balances, refunds, reconciliation (`/admin/commerce/reconciliation`), the plan and credit-pack billing (`src/lib/billing/*`), and the seller readiness checks (`event_payment_readiness`, `payout_status`).
3. **Data:** per-provider account ids for sellers (the per-mode columns added for Stripe are a template), provider-neutral money rows (ledger already provider-agnostic), webhook idempotency per provider.
4. **Plans and credit packs:** either keep Stripe Billing for Gala Dock's own subscriptions (Gala Dock is the merchant there, not a marketplace flow) or move them to the new provider — decide with the provider choice.
5. **Testing gate before going live:** a full end-to-end sandbox journey on the new provider (seller onboarding → purchase → confirmation → scan → refund → payout → reconciliation), plus the existing payment specs ported.
6. **Legal pages:** update the payment and payout wording in `/terms`, `/ticket-terms` and the privacy policy (processor named), and the fee schedule in `src/lib/legal.ts` if fees change.

## Until then
- Run all payment testing on the Stripe sandbox. Sellers onboard through Money → Set up payouts with Stripe's test data.
- Do not switch `STRIPE_CONNECT_SECRET_KEY` to a live key.

Also recorded in the Gigvora repository: `docs/release/payments-provider-decision.md` (same plan for Gigvora).
