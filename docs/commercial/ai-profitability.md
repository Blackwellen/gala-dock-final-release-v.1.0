# AI profitability assurance (Q28)

**Status:** live (migration 202610291012, 2026-10-28) · Owner: finance + agent_ops · Target: 75% gross margin on AI products after card fees.

## How cost is known

- Every model call — Azure (`src/lib/agent/llm.ts`) and Anthropic (`src/lib/agent/anthropic-meter.ts` via `claude.ts`) — is preflighted (`ai_preflight`: allowance → purchased credits → owner-approved overage, hard cap, daily/per-task limits) and recorded in `ai_usage_events` by `record_ai_usage` at `ai_model_prices` rates. 1 credit = 1p of provider cost.
- Anthropic calls are priced on the model that served them; unknown models are priced at the most expensive Opus row. Cache writes are metered at 1.25× input.
- Pre-workspace onboarding suggestions are platform-absorbed (workspace null), limited to 10 per 5 min and 40 per day per user.
- The customer workspace has no AI (owner decision); the customer preferences step is refused server-side.
- New runs' `agent_runs.cost_cents` is rolled up from the meter. Historic rows keep their legacy estimate (no rewrite).

## Guards

- `credit_packs_guard`: a pack cannot be activated while any model price is `estimate`, or below max(pack target, `ai_economics_settings.target_margin_bps`) after card fees (1.5% + 20p default), assuming every credit is spent. Break-even for 75%: price ≥ (20p + credits × 1p) / 0.235 → Top-up S £22.13, M £85.96, L £213.62 (current £20 / £80 / £200 refused).
- Overage accrues `ai_overage_charges` at 4p/credit ex VAT per workspace per month; the `billing.invoice_overage` job turns closed months into Stripe invoice items, and `invoice.paid` marks them paid.

## Report and alerts

- `ai_profitability_report(month)` (agent_ops/commerce admins, service role): metered cost by provider, platform-absorbed cost, allowance cost, unbilled paid-plan cost, pack/overage revenue, per-workspace margin, pack margins, provider invoices vs meter, flags: `price_book_estimate` (high), `invoice_exceeds_meter` (high), `provider_invoice_missing` (medium), `overage_not_invoiced` (medium), `plan_revenue_not_billed` (high), `active_pack_below_margin` (high), `unmetered_runs` (high).
- Admin UI: Admin → Agent & Integrations → AI credits & pricing → "AI profitability" (month navigation; invoice entry form for commerce → `admin_record_ai_provider_invoice(period, amount, currency, fx, reference, provider)`).
- Daily 07:10 UTC job `ai.profitability_alert` (job_queue): any high flag → one notification per platform admin with agent_ops/commerce per day, plus an `ai.profitability_flagged` audit event.

## Subscription billing (platform own-sales, Stripe TEST MODE only)

- Catalogue `plan_prices` (economics.md §3, ex VAT); Stripe test Products/Prices by `scripts/billing/stripe-test-catalogue.mjs` (lookup keys `gd_<kind>_<plan>_<interval>`, `gd_pack_<name>`).
- Checkout / plan change / cancel: `src/lib/billing/service.ts` (owner only; `assertTestModeKey` refuses live keys); `platformBillingStripe` adapter (no Stripe-Account, no transfer/application-fee params).
- Entitlements change only on signed webhooks: `billing_apply_subscription` (active/trialing → plan; past_due → 14-day grace; unpaid/canceled/incomplete_expired/paused → Starter; end-of-period downgrades via metadata + daily `billing.sweep`). Credit packs: `billing_credit_pack_paid` (once per Checkout Session, amount checked).
- Live mode, Stripe Tax/VAT and dashboard dunning settings: BLOCKED (owner/legal).

## Current numbers (October 2026, as of 2026-10-28)

102 calls, 8.39p metered (Azure), 0p absorbed, 0 revenue (all usage on Starter allowances). Flags after the pricing decisions below: only `provider_invoice_missing` (medium) — record the October Azure invoice to clear it.

## Pricing decisions applied 2026-10-28

- Credit packs £25 / £89 / £219 ex VAT (500 / 2,000 / 5,000 credits): net margin after card fees 77.70% / 75.80% / 75.57% (target 75%). Active, Stripe test-mode prices only.
- Price book: **Azure OpenAI only**. `list_price`, padded so credits never under-charge: +10% Azure regional uplift, fx 0.80 USD→GBP. standard (gpt-5.4-mini) 0.825/0.0825/4.95, fast (gpt-5.4-nano) 0.22/0.022/1.375, deep (no deployment; ceiling) 5/0.50/25 USD per Mtok. Claude rows kept for history, `active=false`, ignored by the guard. The provider assistant and onboarding helper run on the metered Azure `chat()` path; the Anthropic meter is removed (`@anthropic-ai/sdk` still in package.json — remove when no agent is running).
- `unmetered_runs` only counts runs created after `ai_economics_settings.meter_live_on` (2026-10-11).
- VAT: Stripe Tax automatic tax behind `BILLING_AUTOMATIC_TAX=on` (prices exclusive); needs Stripe Tax head office + GB registration (owner).

## How much a user needs

Real metered usage, October 2026 (`ai_usage_events`): plan call average 0.131 credits, summary 0.024, ask 0.104 → about 0.155 credits per agent task (1 credit = 1p of provider cost); about 0.17 at the padded list prices.

- Heavy organiser: 40 tasks/day × 22 working days = 880 tasks ≈ 136–152 credits/month ≈ £1.36–£1.52 provider cost.
- With 3× pessimistic headroom: about 400–460 credits ≈ £4–£4.60/month.

Conclusion: allowances unchanged — organiser Starter 50 (≈ 300 asks), Pro 1,000, Business 4,000, Enterprise 15,000; provider 50 / 500 / 2,000 / 10,000. Expected AI cost per paid plan is a few pounds a month. Report after the changes (October): only `provider_invoice_missing` (medium, azure_openai); 102 calls, 8.39p metered.
