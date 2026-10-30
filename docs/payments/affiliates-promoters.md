# Promoters and platform affiliates (Q27, 2026-10-29)

Migrations 202610292003–2007. Tests: `tests/affiliate/w07-affiliate-finance.spec.ts` (GD-08 conservation test, 19 tests).

Two commission systems that never share ledger accounts.

| | Event promoter | Platform affiliate (partner) |
|---|---|---|
| Who owes it | The organiser (seller). Ticket money is a direct charge on the organiser's connected account | Gala Dock, from its own subscription revenue |
| Settled | Off-platform by the organiser; Gala Dock records the statement | By Gala Dock against a monthly statement |
| Ledger kind / basis | `promoter_commission` / `seller_obligation_memo` | `affiliate_commission` / `platform_obligation_memo` |
| Accounts | `seller_promoter_commission`, `promoter_payable`, `seller_promoter_settled` | `platform_affiliate_commission`, `affiliate_payable`, `platform_affiliate_settled` |

Promoter postings never touch `cash_stripe`, fee or revenue accounts; nothing is held for anyone. A ledger-entry trigger refuses any mix (`ledger_family_mix`) — the Q27 exit gate.

## Rules and snapshots

`promoter_commission_rules` / `partner_commission_rules` are append-only versions. Every `promoter_sales` / `partner_earnings` row stores rule id, version and rate at insert. Basis: ticket face value excluding booking fee (promoters); subscription invoice paid amount (partners; VAT-inclusive until the invoice tax amount is stored) or a fixed bounty.

## Promoter lifecycle

pending (accrued; memo posted) → approved (`promoter_approve_sales`, organiser) → held (`promoter_create_payout` locks the approved balance) → payable (`promoter_payout_transition('approve')`) → paid (`'mark_paid'` with settlement reference) · `'fail'` unlocks.

- Locked sales are immutable; payout amount = locked gross − clawbacks netted; payouts never exceed the approved balance.
- Full refund or lost chargeback → `promoter_reverse_order` (idempotent): unlocked sales become `reversed`; locked ones become `clawback_pending` and are netted from the next payout.
- Channel: `/r/<code>?c=link|qr|instagram|…` → `gd_ref=CODE:slug:channel` (consent-first) → `checkout_orders.ref_channel` → `promoter_sales.channel`.
- `promoter_statement(promoter)`: pending / approved / held / payable / paid / reversed / clawback outstanding.

## Partner attribution

`/?ref=<code>[&c=channel]` (landing, sign-up, pricing pages; not /events): consent yes → click counted (`partner_track_click`, anon-callable, rate-limited, visitor = SHA-256 of ip|ua|salt), HttpOnly `gd_partner` 30 days; no decision → `/ref/<code>` asks first; no → nothing stored. Auth callback / email confirm calls `partner_attribute_signup` once for accounts created in the last 30 days. Self-referral checks: same account, same non-public email domain, same device; payment fingerprint when billing records one (BLOCKED_EXTERNAL until stored). A workspace created by an attributed user becomes a pending `partner_referrals` row; a paid `subscription_invoices` row creates one earning (idempotent per invoice, within `commission_months`, default 12); void/uncollectible reverses it. `partner_build_statements(month)` assigns earnings to monthly statements (schedule as a monthly job — open); `admin_partner_statement_paid` (partners permission + MFA + reason) marks paid.

## Open

Organizer payout UI; admin partner-statement UI; monthly statement job; domain events (audit only so far); promoter→organizer messaging; 9 immutable memo transactions from disposable test records remain.
