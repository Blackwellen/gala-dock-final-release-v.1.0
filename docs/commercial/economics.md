# Gala Dock economics — proposed pricing and unit economics

**Owner:** Blackwellen Ltd · **Status:** PROPOSAL, awaiting finance sign-off before any price is published · **Prepared:** 11 Oct 2026

This models what Gala Dock earns, what it costs to serve each plan, and whether each plan reaches the commercial target. All money is GBP excluding VAT unless stated. Nothing here is live pricing. The entitlements in `plan_entitlements` and the inactive `credit_packs` rows are configured to match this document, so finance can change values without a deploy.

**Commercial target (release spec §110):** 75% gross margin on subscription and AI products under expected usage, i.e. variable cost ≤ 25% of recognised revenue. Gross margin = (recognised platform revenue − variable cost to serve) ÷ recognised platform revenue. Marketplace GMV is **not** revenue: only fees and commission are recognised.

---

## 1. Cost inputs (dated, public sources)

| Input | Value used | Source / date | Confidence |
|---|---|---|---|
| Azure OpenAI GPT-4.1 mini ("standard" tier) | $0.40 / 1M input, $0.10 cached, $1.60 / 1M output | Aggregators of Azure list price, retrieved 11 Oct 2026 (official page to be confirmed) | Medium — **deprecation reported for 4 Nov 2026**; see §9 |
| Azure OpenAI GPT-4.1 nano ("fast") | $0.10 / 1M input, $0.40 / 1M output | same | Medium |
| "Deep" tier (no deployment configured) | $2.00 / 1M input, $8.00 / 1M output (pessimistic placeholder) | Internal assumption | Low — replace when a deep deployment is chosen |
| USD→GBP | 0.79 | Internal, reviewed with the price book | Medium |
| Stripe UK card processing | 1.5% + 20p (standard UK cards); 1.9% + 20p premium; 3.25% + 20p international (+2% FX) | Stripe UK pricing via third-party summaries, Aug–Oct 2026 | Medium — confirm on stripe.com/gb/pricing |
| Cloudflare R2 storage | $0.015 / GB-month, no egress fees | Cloudflare public pricing | High |
| Supabase / Vercel / monitoring | £2–£8 per paid workspace per month (allocated) | Internal allocation of current plans | Low |
| Support | £3 (Pro) – £10 (Business) per workspace per month (allocated) | Internal assumption | Low |
| Email | ~£0.0008 per email (Resend) | Provider list price | Medium |

The price book lives in `public.ai_model_prices` (source column = `estimate` until a contract price is entered). The runtime prices every call from that table, so changes take effect without a deploy.

## 2. AI Credits

* **1 credit = 1p of provider cost** at price-book rates. Customers see credits, never token prices.
* Each model call is metered in `ai_usage_events` (input, cached and output tokens → provider cost → GBP → credits) and drawn from the **monthly plan allowance first, then purchased credits**, then owner-approved overage. Overage is recorded openly in the ledger, never as a hidden negative balance.
* Hard cap (on by default), daily limit, per-task limit and the deep-mode gate are checked **before** every paid call (`ai_preflight`). Unattended routines pause at the cap.

### Credit burn by workload (pessimistic pricing)

| Workload | Calls | Typical tokens | P50 credits | P90 | P99 |
|---|---|---|---|---|---|
| Simple question (Ask) | fast tool-pick + standard answer | 2k/150 + 6k/500 | 0.27 | 0.6 | 1.5 (16k context cap) |
| Medium task (one-time / short mission) | standard plan + fast summary | 4k/800 + 8k/300 | 0.3 | 0.8 | 2 (retries) |
| Complex mission | deep plan + re-plan + summary | 2 × (8k/1.6k) deep + summary | 4.6 | 8 | 15 (per-task limit stops at 50) |
| Long mission (wakes over days) | ~10 wakes × summary/plan | 10 × medium | 3–5 | 10 | 25 |

Routing rule: fast for picking tools and summaries, standard for answers and plans, deep only when the plan includes `agent.deep` **and** the owner opted in. Simple questions never touch the deep tier.

## 3. Proposed plans

Entitlements are capabilities (`events.active.max`, `team.max`, `storage.gb`, `ai.credits.monthly`, `agent.long_runs`, `agent.deep`, `api.access`, `reporting.advanced`, `listings.max`, `commission.rate_bps`), resolved server-side by `entitlement()` / `has_capability()`. Per-workspace overrides go in `workspaces.settings.entitlements`.

### Organizer

| | Starter | Pro | Business | Enterprise |
|---|---|---|---|---|
| Price (monthly / annual) | Free | **£59** / £590 | **£229** / £2,290 | from **£899** (contract) |
| Active events | 3 | 25 | 100 | Unlimited |
| Team | 2 | 10 | 50 | Unlimited |
| Storage (R2) | 2 GB | 25 GB | 100 GB | 500 GB |
| AI credits / month | 50 (≈180 questions) | 1,000 | 4,000 | 15,000 |
| Long-running missions | — | ✓ | ✓ | ✓ |
| Deep mode | — | — | ✓ | ✓ |
| API, MCP & webhooks | — | ✓ | ✓ | ✓ |
| Advanced reporting | — | ✓ | ✓ | ✓ |

### Provider (venues and suppliers)

| | Starter | Pro | Business | Enterprise |
|---|---|---|---|---|
| Price (monthly / annual) | Free | **£49** / £490 | **£149** / £1,490 | from **£599** |
| Listings | 3 | 20 | 100 | Unlimited |
| Team | 3 | 15 | 50 | Unlimited |
| Storage | 5 GB | 50 GB | 200 GB | 1 TB |
| AI credits / month | 50 | 500 | 2,000 | 10,000 |
| Marketplace commission | 12% | 10% | 8% | 6% |
| API, MCP & webhooks | — | ✓ | ✓ | ✓ |

## 4. Gross margin per plan

Variable cost = AI (credits used × 1p) + storage + infra allocation + support allocation + email. **Expected** = 30% of AI allowance and 40% of storage used; **heavy** = 100% of allowance and storage; **abuse** = an attempt to exceed the allowance, which the hard cap stops at the heavy-case cost, so abuse cost equals heavy cost (overage only with owner approval, billed at pack rates).

| Plan | Revenue | Expected cost | Expected GM | Heavy cost | Heavy GM | Verdict |
|---|---|---|---|---|---|---|
| Organizer Pro | £59.00 | £3.00 AI + £0.12 + £2 + £3 + £0.20 = £8.32 | **85.9%** | £10 + £0.30 + £2 + £3 + £0.30 = £15.60 | 73.6% | Meets target at expected use; heavy within 1.4 pts |
| Organizer Business | £229.00 | £12 + £0.48 + £6 + £10 + £0.50 = £28.98 | **87.3%** | £40 + £1.19 + £6 + £10 + £1 = £58.19 | 74.6% | Meets target; heavy ≈ target |
| Organizer Enterprise | £899.00 | £45 + £2.4 + £30 + £30 + £2 = £109.40 | **87.8%** | £150 + £5.9 + £30 + £30 + £4 = £219.90 | 75.5% | Meets |
| Provider Pro | £49.00 | £1.50 + £0.24 + £2 + £3 + £0.20 = £6.94 | **85.8%** | £5 + £0.59 + £2 + £3 + £0.30 = £10.89 | 77.8% | Meets |
| Provider Business | £149.00 | £6 + £0.95 + £5 + £8 + £0.40 = £20.35 | **86.3%** | £20 + £2.37 + £5 + £8 + £0.80 = £36.17 | 75.7% | Meets |
| Starter (both) | £0 | ≈ £1.00 | n/a | ≤ £1.60 (50 credits + storage) | n/a | Acquisition cost, recovered through ticket fees and commission |

Provider Pro and Business allowances were reduced from 1,000 / 4,000 to 500 / 2,000 credits during this review, because the larger allowances put the heavy case at 60–68%.

## 5. Credit packs (Stripe; created **inactive**)

Packs must clear 75% margin even if every credit is spent, so retail ≈ 4× provider cost:

| Pack | Credits | Price (ex VAT) | VAT | Worst-case cost | Margin | Expiry |
|---|---|---|---|---|---|---|
| Top-up S | 500 | £20 | Standard-rated (UK) / reverse charge (B2B EU) | £5 | 75% | 12 months |
| Top-up M | 2,000 | £80 | as above | £20 | 75% | 12 months |
| Top-up L | 5,000 | £200 | as above | £50 | 75% | 12 months |

Approved overage is billed at the Top-up S unit rate (4p per credit).

## 6. Marketplace and ticketing revenue (recognised = fees only)

| Stream | Proposed fee | Comparable (public, Oct 2026) | Unit economics |
|---|---|---|---|
| Ticket fee | 4.5% + 49p per paid ticket (organiser chooses absorb or pass on); free tickets free | Eventbrite UK 6.95% + 59p incl. processing | £20 ticket: fee £1.39 − Stripe £0.50 − infra £0.02 = **£0.87 (63%)**. Premium/international cards reduce this to 55–60% |
| Venue / supplier commission | 12% / 10% / 8% / 6% by provider plan, on booking value ex VAT | Tagvenue UK 12.5% (invoice) / 15% (online payment) | £2,000 booking at 12%: £240 − Stripe on the full charge £30.20 − disputes/support reserve 1% £20 = **£189.80 (79%)** |
| Promotion / ads | CPM / CPC / fixed placements, see spec §117–121 | — | Owned inventory, no media cost: ~95% margin before sales cost |

Processing impact: Gala Dock uses separate charges and transfers, so card fees on marketplace payments are paid from platform revenue. At low commission rates on small bookings, e.g. 6% on a £100 booking, processing at 1.5% + 20p consumes about 37% of the commission. **Recommendation:** a £2.50 minimum commission per booking.

## 7. Storage

R2 is metered per workspace against `storage.gb` across originals, design files, exports, video and documents. Recommendation: a 10% grace above the allowance with warnings at 80% and 100%; above the grace, uploads are refused (reads continue) until the workspace upgrades or cleans up. **Status:** the entitlement exists, but uploads still go to Supabase Storage and R2 isn't wired in, so metering is BLOCKED until the R2 integration (§92) ships.

## 8. Competitor review (public data only)

| Competitor | Area | Fee | Source | Date |
|---|---|---|---|---|
| Eventbrite (UK) | Ticketing | 6.95% + £0.59 per paid ticket, processing included | eventbrite.co.uk help; tickettailor.com, checkoutpage.com summaries | Oct 2026 |
| Tagvenue | Venue marketplace | 12.5% ex VAT (invoice categories), 15% (online-payment categories); free listing | support.tagvenue.com | Oct 2026 |
| Hire Space | Venue marketplace | Not found in public sources at review time | — | Oct 2026 — to complete |

Before prices are finalised, add: Ticket Tailor, Skiddle, Dice (ticketing); Hire Space, Headbox, Bark, Add to Event (suppliers); Planning Pod, Aisle Planner (organiser SaaS).

## 9. Risks and actions

1. **Model deprecation:** GPT-4.1 mini is reportedly scheduled for retirement on 4 Nov 2026. Before launch, deploy the successor model, update `AGENT_MODEL_MINI` and its `ai_model_prices` row, and re-run this table. **Release blocker for Gala Agent only.**
2. **Price book is estimates:** replace with Azure contract prices; the admin credits page shows a warning while any row is `estimate`.
3. **Live AI QA ceiling (spec §16):** no paid model calls were made during this release run. All agent tests use deterministic tool paths and recorded usage, well inside the £0.50 per-agent ceiling.
4. **Support and infra allocations** are assumptions. Measure them for one quarter and update this model.
5. Prices, fees and VAT treatment need finance and legal sign-off before publication (BLOCKED_LEGAL_REVIEW for consumer-facing price display).
