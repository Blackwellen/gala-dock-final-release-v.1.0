# Cross-brand notes from the Gigvora release work (2026-11-10)

For: Claude Code sessions and engineers working on Gala Dock. Source: the Gigvora main session on 10 November 2026; details and evidence are in the Gigvora repo (`docs/backend/payments/dec107-seller-direct.md`, `docs/backend/payments/stripe-connect-model-brief.md`, `docs/PAYMENTS_AND_DISPUTES.md`, `docs/legal/`, `docs/release/known-blockers.md`). These are notes, not decisions for Gala Dock: check each against this repo before acting.

## What matters most for Gala Dock

- **Sections 1 and 2 apply if Gala Dock takes marketplace payments for events.** The same DEC-107 rules cover direct charges, no-dashboard accounts, manual payouts, recommendation-only staff and the default rule. `docs/release/payments-provider-decision.md` (Ryft/Mangopay) predates DEC-107: reconcile the two.
- **Event tickets:** the open question of whether Stripe allows a longer hold for tickets is still open. Treat the hold limit as a setting and use the funding-window formula.
- **Sections 3, 5 and 6 apply as written.** Section 4 applies to any consumer sales abroad.

## 1. Payments model (DEC-107, all three marketplaces)

**Director-approved model (2026-11-10).** Sellers have Stripe connected accounts with **no Stripe dashboard**. The client pays by **direct charge on the seller's own account**, so the money sits in the seller's balance and never in Blackwellen's. Our commission is the **application fee** on the same charge. Payouts are **manual**: a payout is released only on client approval, review-window expiry, settlement, an independent award or the hold-limit default rule.

**What Stripe told us (Support chat, 2026-11-10).** Support gives no written approval of a business model and refers you to Sales (https://stripe.com/contact/sales). The general answers were:
- **Direct charge:** the connected account (seller) is the merchant of record. Refunds and disputes come out of the seller's balance first.
- **Destination charge:** the platform is generally the merchant of record. `on_behalf_of` makes the seller the "settlement merchant".
- **No escrow:** Stripe offers no escrow, but manual payouts are allowed.
- **Holding limit:** the public "90 days" figure applies to legacy/Custom flows and **does not fix the limit for GB Accounts v2**. Treat the hold limit as a setting, not a constant.
- **Loss and fee responsibility:** follows the v2 controller properties. Nothing was confirmed for our set-up.
- The director decided **G1 passes without Stripe's written answers** (Gigvora 2026-11-10).

**What the Stripe sandbox actually allowed:**
- **Allowed:** no-dashboard accounts with Stripe-collected requirements and Stripe-managed losses (Accounts v1 and v2).
- **Refused:** mixing platform-managed losses with Stripe-collected requirements, and the reverse. The exact error text is in Gigvora `docs/backend/payments/dec107-seller-direct.md`.
- **Stripe-collected accounts can't be finished by script.** "You cannot accept the Terms of Service on behalf of accounts where controller[requirement_collection]=stripe" means real onboarding works, but automated proofs must use the platform-managed profile.
- **Platform-managed losses:** Stripe put a reserve on the platform's own balance for a seller shortfall and for a chargeback.
- **Director decision:** accept platform-managed losses if Stripe refuses Stripe-managed losses live. Seller reserves are then **mandatory**.

**Timing rules learned.** With direct charges the seller **must be onboarded before the client's first payment**; payout set-up can't be deferred to release time, or nobody can pay. The pattern we use:
- **Nudge** ("Get ready to be paid") on the seller's first shortlist or offer.
- **Require** set-up at the first contract or offer acceptance.
- **Client side:** the client sees "seller finishing set-up, nothing charged". The database refuses with `COM_SELLER_NOT_READY` as a backstop.

**Funding window, not 80 days.** Latest funding = scheduled end − (hold limit − review period × (revisions + 1) − 7 − 14 − 10). That is about 45 days for 90 / 7 / 1. Refuse to schedule milestones that can't fit.

**Charges:**
- Milestones are **off-session saved-card charges** (merchant-initiated), with at least 3 business days' notice before each charge.
- Change orders that increase the price are **client-present** Checkout on the seller's account. Paying is the approval, and they take effect only on a confirmed charge.

**Fees and refunds (director):**
- **Seller fee** (capped at 8 %) covers Stripe processing, Connect and verification costs. Cost check: it covers £50, £500 and £2,000 jobs; chargeback fees (£20) are extra.
- **Client admin fee (buyer contribution):** taken in the same application fee. It must be shown in the price **from the first display** (DMCC drip-pricing rules) and VAT-inclusive for consumers. It is **non-refundable**, with a staff-recorded exception only where the law requires it or for our own error.
- **On any refund:** the seller fee on the refunded part is refunded pro rata. The buyer contribution is not.

**Reserves (approved):**
- **Standard:** 10 % of each release, kept 30 days, for the seller's first 90 days or £2,000, whichever ends later.
- **Risk:** up to 50 % for up to 60 days, only on objective triggers: chargebacks > 0.75 % by count, or refunds > 10 % by value, over 90 days with at least 5 payments.
- Never beyond the hold limit, always in the seller's own balance.
- **No discretionary "fraud reserve".** On suspicion: suspend, refuse new work, and report to the provider, card schemes and authorities. Never move money on suspicion.

**Stripe Identity:** a pay-per-check product; it isn't needed for sellers because Connect onboarding already does KYC.
- **Cost:** no set-up fee, billed per completed check. The US price is $1.50 and the euro price €1.25, so expect about £1–1.20 in the UK. Stripe advertises the first 50 checks free.
- **When to verify:** at first contract acceptance, not at sign-up, so you only pay for sellers who've won work.
- **To switch it on:** activate in the dashboard, add the `identity.verification_session.*` webhook events, set the app flags and deploy.

## 2. Disputes (DEC-107, applies to every marketplace)

- **Staff only recommend.** Money moves only on:
  - client approval;
  - review-window expiry;
  - settlement / accepted recommendation;
  - an independent award entered with a second-person check;
  - the hold-limit default rule.
- **Appeals on recommendations are removed.** A party who disagrees escalates instead.
- **Parties file independent resolution themselves**, directly with the provider (CEDR, ProMediate, CIArb, etc.). The platform never fills in forms or pays provider fees. It does supply a **case pack**: contract, clauses, timeline, evidence hashes, messages, recommendation, amounts.
- **Consumer tiers** (Arbitration Act 1996 s.91 + 1999 Order):
  - **No arbitration for consumers at £5,000 or less.**
  - ≤ £250: settlement or court.
  - £250–5,000: mediation (only if both agree) or court.
  - > £5,000: arbitration only with consent given after the dispute starts.
- **Deadline rules** (business clients and sellers only):
  - recommendation window 7 days, silence = accepted;
  - escalation needs proof of filing (provider + case ref, or a court claim number) within 14 days;
  - the opening party lapses after 14 days of inaction;
  - ≤ £250 lapses to the recommendation after 14 days (not for consumers).
- **For consumers silence never binds.** Their dispute runs to settlement, award, court or the default rule.
- **Gate the deadline rules on the policy being in force.** Gigvora uses `commerce.sd_settings.dispute_rules_in_force_from` (NULL = no lapses run). Consent to rules that aren't published yet is weak evidence. Show the full text and version on the tick screen anyway.
- **Hold-limit default rule:** refund the disputed amount to the client and release the rest. It runs whatever the policy version, because the provider forces the money out. The notice must:
  - cite the clause in force;
  - say it is **not a decision on the dispute**;
  - say the **client remains liable** to the seller for the refunded amount, unless a court, arbitrator or ADR body decides otherwise.
  The seller can request the client's contact details. The old "pay the seller at day 87" was wrong (it breaks the WP terms).
- **Express terms** (separate ticks, recorded with version, user and time):
  - **Dispute deadline rules:** at each side's **first commercial step**, not at sign-up. Client: first project publish. Seller: first proposal, custom offer or gig publish. Enforce in the database (triggers) so the API and AI agents can't skip it.
  - **Per contract:** both parties confirm before funding or acceptance.
  - **Payment terms:** at first payment (client) and payout set-up (seller).
  - **Chargeback undertaking:** **business clients only**.
- **Lesson: when you add a consent gate, add the code that records the confirmation in the same change.** Gigvora's per-contract gate shipped before the recording path and silently refused every new funding for a few hours.

## 3. Consumer law items that block publishing legal v2

- **Seller trader declaration**, plus a non-trader warning to consumers.
- **Pre-contract information** before binding.
- **Two separate ticks:** the express request to start within 14 days, and the acknowledgement of losing the cancellation right.
- **Confirmation email** with the model cancellation form (durable medium).
- **A "cancel this contract" action** (14 days, proportionate deduction).
- **VAT-inclusive prices** for consumers everywhere.
- **IP assignment needs a click-to-sign step** (CDPA s.90(3)): document fingerprint, identity, time, and a moral-rights waiver in the same step.
- **EU users are accepted, so an EU GDPR Article 27 representative must be appointed.** The publish script refuses to publish the placeholder.

## 4. Tax on platform sales (plans, credit packs, ad credit)

- **Director decision:** all countries can buy, consumers included, until the registrations arrive. Sanctioned countries stay blocked.
- **Record every consumer sale outside registered countries** (country, amount, currency, date, product, tax collected, whether a tax ID was present). Also alert staff when Stripe Tax collects 0 in a zero-threshold country: the EU, India, UAE, Saudi Arabia, Turkey, Mexico, South Korea, Bahrain, Oman, Kenya, Ghana…
- **For the EU, apply for non-Union OSS by the 10th of the following month** so it backdates.
- **Check live Stripe Tax registrations**, not just sandbox. Gigvora's live account once had none, so it would have charged £0 VAT.

## 5. Ops, backups and disaster recovery (shared Blackwellen layer)

- **Backups had silently stopped for all four brands** (a false `quota_exceeded`, because the backup ledger still counted copies Cloudflare's expiry rule had already deleted). It was fixed on RECOVERY-B (ops commit 127be51). **Check your brand's backup lane is green in Watchtower.**
- **Retention decision (UK GDPR):**
  - Supabase daily backups: 7 days.
  - Our encrypted R2 copies: 15-minute, then daily 8 d, weekly 29 d and monthly 63 d.
  - Deleted data leaves every backup within **65 days**.
  - Erasures are re-applied after any restore.
  - Privacy notices must state this; Gigvora's said "7 days" and was wrong. Reasoning: Gigvora `docs/compliance/backup-retention.md`.
- **Ops domain:** `blackwellen-operations.cloud` is connected to Cloudflare (connected, not transferred) with all bots/AI crawlers blocked. Cloudflare Tunnels give the AV gateway and the Hermes intake HTTPS addresses with no open ports.
- **Being built:**
  - a **second AV gateway** on another host, with failover (never "clean" on error);
  - **Uptime Kuma** (Docker) on the host that isn't being watched: a private dashboard behind Cloudflare Access, plus a public status page per brand with honest data only;
  - **Hermes** alert delivery with an end-to-end proof.
- **DR rehearsal lessons:**
  - The restore itself works (about 55 s), but the row-count check fails while QA or agents are writing. Rehearse when writes are under about 300 a minute.
  - After a restore, **re-send every subscribed Stripe event since the restore point.** Comparing against the inbox misses events that leave no inbox row (e.g. live `account.updated`).
- **Keep an offline copy of the backup keys** (`~/.blackwellen/secrets/age/`, `hmac/bwbackup-manifest.key`).

## 6. Engineering gotchas found today

- **Python on Windows writes CRLF in text mode.** Edits made with `open(..., "w")` silently turned LF files into CRLF and doubled the diffs. Write bytes, or use editor tools, and check with `git ls-files --eol` (look for `i/lf w/crlf`).
- **Turbopack (Next 16) font loader can corrupt its dev state** (`Can't resolve '@vercel/turbopack-next/internal/font/google/font'` on every `next/font/google` font). Deleting `.next/dev/cache` is not enough: stop the server, delete `.next/dev`, restart. Avoid adding new `next/font/google` faces casually; use system font stacks for small accents. (The `cursive` stack falls back to Comic Sans on Windows.)
- **Playwright:** pages with realtime sockets never reach `networkidle` and sometimes not `load`. Wait for `domcontentloaded`, then a specific element. Use `page.clock.runFor` rather than `fastForward` (which fires each timer at most once) to test idle timers.
- **The shared dev server reloads whenever any session edits files.** Browser suites fail mid-run while other agents work. Run release evidence on a quiet machine, and check free RAM first; it dropped under 0.5 GB today.
- **Idle sign-out after 60 minutes** across tabs (localStorage shared timestamp, warning at 55 minutes, server-action sign-out, sign-in explains why). Worth copying. It doesn't need supabase-js in the browser: detect the `sb-*-auth-token` cookie.
- **Pilots: use per-contract or per-record pilots, not per-seller.** A per-seller pilot quietly moved shared QA sellers onto the new payment model and broke other suites.
- **Idempotency keys:** if `begin_*` matches an existing obligation by key, a cancelled or failed one must be retired, or the record can never be paid again (fixed in Gigvora 0894).
- **Demo/QA exemptions:** every new consent or gate needs a demo-account exemption flag (default on), or the QA suites break. Test the gate itself with the exemption switched off inside a rolled-back SQL test.
- **AI agents can't apply production-affecting migrations** under the permission classifier. The main session applies them after the director's explicit "go".
- **Explore/categories:** build filters from the full controlled taxonomy, not from "categories that have listings", and merge duplicates through deprecate + `merged_into` + synonyms, so old URLs and saved searches keep working.
