# Organizer CRM, proposals and contracts (Q16, domains 51–56)

Migrations 202610293008–3010. Tests: `tests/organizer/q16-crm-contracts.spec.ts` (7). Incident: 3009 broke public `accept_proposal` on live for ~10 min ("column reference tax is ambiguous") until fix-forward 3010.

## Canonical client model

- `clients` (one per workspace per normalised name) + `client_contacts`. `leads`, `proposals`, `events`, `invoices` carry `client_id`; trigger `trg_link_client` resolves/creates the client from `client_name` (race-safe). Backfill created 27 clients.
- `saved_contacts` is the messaging address book, not CRM; `enquiries`/`provider_requests` stay marketplace-side.
- Billing/VAT fields owner/manager/finance only. `merge_clients(keep, merge)` (owner/manager) re-points everything; the duplicate stays `merged` for audit. `client_overview(id)`.

## Leads and pipeline

- `lead_stage_history` (trigger); qualified/won/lost timestamps and `lost_reason`.
- `sales_kpis(ws, days)` → `{current, previous, delta}` (leads, pipeline, forecast, proposals sent, won/lost, win rate in points, closed value, cycle days) — drives the Sales KPI strip.
- `lead_score(lead)`: deterministic 0–100 (no AI).
- Capture: POST `/api/leads/capture` → service-only `capture_lead`; enable per workspace with `settings.lead_capture = {enabled, key}`; honeypot, rate limits, 24 h email dedupe.

## Proposals

Five-step builder; optional `content.packages` (≤ 4 tiers). Public `/proposal/[token]` renders `content.presentation` and a packages comparison. `accept_proposal(token, name, email, version, package default null)` stores accepted subtotal/tax/total from the immutable snapshot. `convert_proposal_to_event(id)` — locked, idempotent; reuses or creates a planning event linked to client and lead with budget lines; lead → won.

## Contracts

`contracts`, `contract_versions` (immutable, SHA-256 hash), `contract_parties`, `contract_signatures` (append-only), `contract_approvals`, `contract_templates`. Machine `contract`: draft → sent | void; sent → signed | declined | expired | void | draft; signed and void terminal; signed rows immutable. Commands `contract_create`, `_save_version`, `_set_parties`, `_request_approval`, `_decide_approval` (no self-approval unless owner), `_send`, `_sign_internal`, `_revise`, `_void`, `_renew`. Client signing at `/contract/[token]` via service-only `contract_by_token` / `contract_sign_by_token`. Daily `contracts.expiry_daily` (02:25).

## Signature provider boundary

`src/lib/contracts/signature-provider.ts` (interface, env validation, webhook HMAC, health at `/api/health` → `contracts.e_signature`). Env `SIGNATURE_PROVIDER`, `SIGNATURE_PROVIDER_API_KEY`, `SIGNATURE_WEBHOOK_SECRET` — BLOCKED_EXTERNAL. Fallback: simple electronic signature (typed name, email, version hash, time, hashed IP/UA), append-only and audited.

## UI

Sales sub-nav: Leads · Proposals · Contracts · Clients (`/organizer/sales/clients`, `/contracts`, detail pages); public `/contract/[token]`. Lane B owns design fidelity. No email delivery for proposal/contract links yet (copy link).

## Share links (202610292010–2011)

Proposal and contract tokens are hashed at rest (`share_token_hash`, derived by trigger). Lookups go through service-only `proposal_share_lookup` / `contract_share_lookup`: hash first, plaintext fallback only for rows without a hash (the 2 signed contracts are immutable and stay on the fallback). Plaintext is kept so organisers can copy links; drop it once links are shown only at issue. `share_expires_at` / `share_revoked_at` with owner/manager commands `proposal_share_revoke(id, reissue, expires_at)` and `contract_share_revoke(id, expires_at)` (audited) — UI "Revoke client link" / "Issue a new client link" and "Revoke signing link". Revocation is sticky (only a token change clears it). Revoked or expired links 404. "Viewed" is recorded only by a post-load beacon (`POST /api/proposals/viewed`: same origin, bot user agents ignored, rate-limited); `mark_proposal_viewed` is service-only; server render never changes status. Spec `tests/organizer/q16-share-links.spec.ts` (5). Contracts are append-only, so spec fixtures can't be deleted (see Q38 fixture purge).
