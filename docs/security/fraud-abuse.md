# Fraud & abuse (Q33, domains 211–212) — 2026-10-29

Migration 202610294019. Tests: `tests/release/fraud-abuse.spec.ts` (5/5). Service: `src/lib/security/risk.ts`.

## Principle
Detectors raise **signals** for a human decision. Nothing bans, deletes, hides, unpublishes or moves money automatically. The only automatic consequences are reversible, visible **holds** (the subject is notified, sees the plain reason in `my_risk_holds()`, and can appeal once). Evidence and thresholds are admin-only (`trust` permission, RLS).

## Model
- `risk_rules` — versioned thresholds / phrase lists (`risk_rule_set`, audited).
- `risk_signals` — one queue for account, payment, ticket, listing, provider, message, review, promotion, payout. Idempotent per `dedupe_key`; repeats bump `occurrences`; a higher-severity repeat re-opens a cleared signal. Machine `risk_signal`. Q22 `ticket_risk_flags` mirror both ways (18 historic flags backfilled); chargebacks are `payment` signals.
- `risk_holds` — `payout` (blocks promoter payout approve/paid, resale seller refunds, `payout_eligible`; never moves money; can't affect Stripe-managed payouts of a seller's own connected account) and `step_up` (`require_step_up` refuses with `account_review_hold` unless aal2). Machine `risk_hold`.

## Detectors (never fail the triggering write)
| Domain | Signal | Rule |
|---|---|---|
| message | off_platform_payment (flag only; pattern ids, never the text) | message.off_platform_payment |
| message | spam_velocity | 40 msgs / 12 conversations in 10 min |
| review | review_velocity | 5 / listing / 24 h |
| review | review_same_device / review_provider_device (hash-only `review_provenance`) | 30 days |
| listing/provider | duplicate_description, contact_in_description, new_workspace_burst | listing.* |
| promotion | shared_client_code | 4 accounts / code / browser / 24 h |
| account | account_takeover → step-up + payout holds (user + owned workspaces) | new device + password/email change + payout change in 24 h |
| payment | chargeback (ticket via `ticket_order_dispute`; marketplace via dispute webhook) | payment.chargeback |

Takeover inputs: `auth.new_device_login` audit, `auth.users` password/email trigger, promoter payout-method change, Stripe `account.external_account.*` (Connect endpoint must subscribe — owner step).

## Commands (admin_require: `trust` + MFA + reason; audited)
`risk_signal_decide(signal, clear|action|escalate, reason)` (escalate opens a `fraud` trust case; clear releases holds the signal caused) · `risk_hold_place` / `risk_hold_release` · `risk_rule_set` · `risk_appeal_decide`. Subject: `my_risk_holds()`, `risk_hold_appeal(hold, statement)` (once, rate-limited, no existence leak). Job `risk.expire` (daily) expires untouched info-level signals after 90 days.

## Q22 follow-ups (migration 4018)
- Resale seller refund branches on how the original was charged: Q07 direct charge → refund on the organiser's connected account (`refundMerchantCharge`); legacy → platform. Idempotency `resale-refund:<payout id>`. Bug fixed: buy-back resale payouts were marked paid immediately so sellers were never refunded (no live data affected).
- Disputes → `ticket_order_dispute(ref, dispute, status)`: open → `chargeback` + one flag (unique index, retry-safe); won → `issued`; marketplace disputes → payment risk signal.

## Events
risk.signal_raised, risk.signal_reviewed, risk.hold_placed, risk.hold_released, risk.appeal_opened, risk.appeal_decided, risk.rule_changed, ticket.resale_seller_refunded.

## Open
Signup/bot abuse beyond captcha + rate limits; admin review UI (Q31 / W08); Stripe external_account subscription (owner).
