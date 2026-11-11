# Release finalisation playbook (from Gigvora, 10 November 2026)

For: Claude Code sessions and engineers finishing Gala Dock for release. Run this pass before launch; record evidence in this repo's own release queue.

## How to use this

Gigvora went through its release finalisation on 10 November 2026. This is the order of work and the checks that caught real defects there, written so this repo can run the same pass. Tick each line only with evidence (script output, screenshots, Stripe object ids, the migration ledger). Where Gigvora's details differ from this repo, adapt them; don't copy blindly. Gigvora's own evidence is in its repo: `docs/backend/payments/dec107-seller-direct.md`, `docs/PAYMENTS_AND_DISPUTES.md`, `docs/legal/v2-signoff-checklist.md`, `docs/qa/release-qa-tracker.md`, `docs/release/known-blockers.md`, `docs/roadmap.md`. The facts and decisions behind it are in `docs/cross-brand-notes-2026-11-10.md` in this repo.

## 1. Payments finalisation

1. **One model, written down.** The director-approved model (DEC-107): connected accounts with no Stripe dashboard, direct charges on the seller's account, the platform fee as the application fee, manual payouts on approved triggers only. Write it into one doc and make every code path match it.
2. **Prove every money path in the Stripe sandbox, each with object ids:**
   - fund
   - milestone payout
   - partial release
   - change order (client-present Checkout)
   - refund (seller fee refunded pro rata; buyer contribution not, except by law)
   - consumer cancellation
   - settlement / termination release
   - default rule at the hold limit
   - chargeback evidence
   - reserve hold and release
   Gigvora found two real bugs only through these proofs: refunds were queued twice (one path failed with "No such payment_intent"), and settlement releases were sent as platform transfers instead of payouts from the seller's balance.
3. **Invariant function.** Keep an invariants query (books = provider balance, no platform transfer on direct-charge money, fees ≤ cap, no double refund) and require it to return empty after every proof.
4. **Gates must ship with their write paths.** A new consent/term gate that blocks funding must ship in the same change as the code that records the confirmation. Gigvora's per-contract gate briefly refused every new funding.
5. **Pilots per record, not per seller.** A per-seller pilot silently moved shared QA sellers onto the new model and broke other suites.
6. **Idempotency.** A cancelled or failed obligation must free its idempotency key, or the record can never be paid again.
7. **Reserves:** only objective, published rules (no discretionary fraud reserve), a DB check constraint on the kind, and the term text versioned. Changing the text means a new version and re-acceptance.
8. **Payout pause:** staff-only, second factor, audited, and it REQUIRES one of the legal bases in the payments terms plus a reference. Suspicion alone can never hold money.
9. **Platform sales tax:** check live Stripe Tax registrations (not just sandbox). Record every consumer sale outside registered countries in a staff-listable table with a CSV export, and alert on zero-threshold countries (EU OSS: apply by the 10th of the following month).
10. **Go-live order:** apply the go-live migration → deploy the code that supports the model → add the provider webhook events → only then flip the default. Flipping first leaves real clients unable to pay. Keep a one-command rollback.
11. **Founder / staff workspaces:** use an audited complimentary internal subscription source (never billed, excluded from revenue), not fake payments.

## 2. Disputes finalisation

- Staff recommend only. Money moves on client approval, review-window expiry, settlement, an entered independent award (second-person check) or the hold-limit default rule. No appeals on recommendations.
- Consumer tiers: no arbitration for consumers at £5,000 or less. Parties file with the provider themselves; the platform gives a downloadable case pack.
- Gate deadline rules (deemed acceptance, lapses) behind an `in_force_from` setting tied to the published policy date. Consumers are never bound by silence.
- The hold-limit default rule runs regardless, and its notice cites the clause in force, says it is not a decision, and says the client remains liable.
- Check every automated-step notice actually sends. Gigvora's dispute notices used an invalid category and none had been delivered.

## 3. Phone and tablet, portrait and landscape

Run a sweep at:
- **Phone portrait:** 320, 360, 375, 390, 414, 430
- **Phone landscape:** 568×320, 667×375, 740×360, 844×390, 932×430
- **Tablet portrait:** 768×1024, 820×1180, 834×1194, 1024×1366
- **Tablet landscape:** the same four sizes, rotated

Use touch emulation, across every signed-in workspace plus the auth, account, marketplace and contract pages. Assert:
- 0 horizontal overflow
- axe 0
- 0 console errors
- **menu occlusion 0**: open each dropdown, popover and select, then check `elementFromPoint` at its centre is inside the menu. Gigvora's workspace switcher and other menus sank behind content because of stacking contexts. Fix it with one z-index scale and portal or top-layer menus.
- no warped components (images stretching, squashed flex children, clipped fixed heights)

The AI agent chat should be the first full-height view on phone and tablet, with the other agent sections behind tabs and the composer kept above the keyboard (visualViewport).

## 4. Legal documents

- Draft → review against the engine → list mismatches → fix the text or the engine → zero placeholders and zero draft markers → director sign-off → publish with a script that refuses unfilled placeholders and draft headers.
- Publish from a clean worktree when other sessions have uncommitted drafts in the same folder. The script should only confirm identical texts already in force and refuse a changed text without a version bump.
- Express terms (dispute deadline rules, payment terms) are separate ticks recorded with version, user and time, at the point they matter (first commercial step; first payment / payout set-up), not buried in sign-up.
- Consumer law items that block publication: trader status question (default "As a business: sole trader, freelancer, partnership or company"), pre-contract information, two separate ticks (start within 14 days; loss of the right), confirmation email with the model cancellation form, a cancel action, VAT-inclusive prices, and refunding the ancillary admin fee on a valid cancellation.
- IP assignment needs a click-to-sign step with a fingerprint of the exact text.
- Business-user notice: UK P2B rules give business users 15 days' notice of term changes; set the effective date accordingly once real business users exist.
- Keep deferred legal items (e.g. EU representative) in a roadmap doc, not as placeholders in the texts.

## 5. Stripe finals

- Live and sandbox webhook endpoints subscribe to every event the code handles: platform (checkout, invoices, refunds, disputes, application fees, identity) and Connect (account.updated, payouts, plus checkout/charge/refund/dispute events for direct charges).
- Live Stripe Tax registration present; VAT number on invoices.
- Stripe Identity: activated in the dashboard, branding (icon, logo, colours) and the public website set, `identity.verification_session.*` events added, app flags on, verified at the first accepted contract (pay only for sellers who've won work). Connect onboarding already does seller KYC.
- Storage and app env on the hosting provider must match the working local values. Gigvora's production R2 settings pointed at the wrong endpoint, bucket and secret, so every scan failed; prove an upload → store → scan → clean verdict on production after any change.

## 6. Help centre

- Audit every article against the code and live database after a big change day; fix stale claims (pricing on sale, payment model, release steps, consumer rights, agent behaviour).
- Re-capture every screenshot from realistic showcase records, never test labels. Redact QA emails and internal ids with drawn "hidden" boxes and say so in the caption.
- Fix product copy that contradicts the help (payment-methods wording, pricing FAQ, plan cards, ranking explanations).
- Restart the dev server if new shots don't render (stale generated size map).

## 7. AI agent finalisation

Gigvora's agent "ran a job then did nothing". Root causes to check here:
1. The planner rejected an empty plan for greetings and how-to questions, and the error retried silently forever.
2. The worker only ran on a once-a-minute cron (replies took 1–3 minutes). Kick the worker immediately from the request that creates or unblocks a run.
3. There was no conversation layer (each message a separate job, no history).
4. Credits were never checked on instant runs.

Enterprise bar:
- Conversational replies with history.
- Clarifying questions; runs proposed from the chat, with edit and confirm, live progress, cancel and retry.
- Every tool works or refuses in plain words (keep a per-tool × workspace matrix with evidence).
- Formatted replies (markdown, tool cards, record links, no raw JSON or ids).
- Plain out-of-credit and unavailable messages.
- Paid-plan gating: greyed-out Upgrade for unsubscribed workspaces, plus a usage meter.
- Rate budgets on every AI provider: count every attempt, persist the counts, skip a provider whose budget is spent, never queue retries, alert at 80 %.
- Playwright journeys per workspace and a written GO/NO-GO.

## 8. Ops, security and launch

- Backups green in Watchtower for this brand. A false `quota_exceeded` had stopped all four brands for up to 3 days.
- Retention decision documented under UK GDPR, with the privacy notice matching.
- Weekly blob clean-up scheduled. Offline copy of the backup keys: an encrypted file plus a passphrase in a password manager, never the keys in plain form in the cloud.
- Restore rehearsal on a quiet database. Re-send every subscribed provider event since the restore point.
- AV scanning with a standby gateway and fail-closed behaviour.
- Status page (Uptime Kuma) on honest data.
- Rotate any credential that appeared in chat.
- Hosting regions UK/EU, and the processor's data processing agreement recorded.
- Demo data: hidden from real users by a switch, or deleted with a backup first. Deleting breaks QA suites that run on the same database.
- Go-live: deploy → smoke → take the brand off Watchtower's not-live list so alerts reach the director.
