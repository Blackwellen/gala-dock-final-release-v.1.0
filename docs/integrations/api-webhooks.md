# Developer API, MCP, webhooks and sync (Q30)

Migration 202610293023 (+ 202610270009 developer platform). Tests: `tests/release/q30-api-webhooks.spec.ts` (10), `tests/release/developer.spec.ts` (3), `calendar-sync.spec.ts` (3).

## Authority model (exit gate)
Every external call = key workspace × key scopes × the human's CURRENT role, inside the key's workspace only.
- Key (`gd_live_|gd_test_<prefix8>_<32>`, sha256 stored) → `resolve_api_key` (revoked/expired/inactive member or workspace → 401).
- Scope: `<domain>:read|write` per tool, plus `feed:read`. Missing → 403 insufficient_scope.
- Workspace binding: `api_tool_args_check` — event/item/primary/tier/space/standby ids must belong to the key's workspace → else 404 (no existence leak). Fixes a reproduced hole: a key for workspace A could read/write workspace B when the same human belonged to both.
- Role: `agent_invoke` runs as the human with `has_permission(...)` → 403 after a downgrade; removal → 401.
- Exposure: R0–R3 only; R4 → 403 approval_required; R5 never. No AI runs (registry tools are SQL).
- Ranking: `venues.rank` scores/reasons stripped on API/MCP.

## Keys
Create/revoke (owner/manager, step-up, plan capability `api.access`, expiry ≤ 400 d). `rotate_api_key(key, prefix, hash, grace_hours ≤ 168)`; `set_api_key_limits(key, 1–1200/min, expires)`; `last_used_at` / `last_used_ip`. Audited.

## Limits and audit
Per-key `rate_limit_per_minute` (default 120) on every request + per tool call (MCP batches count each call). 429 + Retry-After. Every authenticated request logged in `api_requests` (incl. error_code, scope).

## Idempotency (Q03)
REST `Idempotency-Key`; MCP `params._meta["idempotency-key"]`. 24 h replay (`Idempotent-Replayed: true`), 409 on conflicting input or in-progress.

## Versioning
`Gala-Api-Version: 2026-10-29` on every response; pinning supported (unsupported → 400). Webhook envelopes carry `api_version` + per-type `schema_version`.

## Endpoints
`GET /api/v1/openapi.json` (real status codes + webhooks, contract-tested), `GET /api/v1/tools`, `POST /api/v1/tools/{tool}`, `GET /api/v1/events?cursor=&limit=` (pull sync, feed:read, sanitised payloads, at-least-once), `POST /api/mcp` (JSON-RPC 2.0).

## Webhooks
- Types: `src/lib/developer/webhook-catalogue.ts` = `public.webhook_payload_fields` (parity-tested), incl. event.cancelled (previously not subscribable).
- Payload: allow-listed scalar fields per type + global deny pattern (score, reason, rank, weight, internal, private, note, ip, user_agent, email, phone, token, secret, hash, password, host/speaker/join url, storage_path, key).
- Signing: `Gala-Signature: t=<unix>,v1=<HMAC-SHA256(secret, "t.body")>` (+ previous secret for 24 h after `rotate_webhook_secret`), `Gala-Event-Id`, `Gala-Event-Type`, `Gala-Api-Version`. Receivers: constant-time compare, reject |now − t| > 300 s, dedupe on id. Helper `src/lib/developer/signature.ts`.
- Delivery: 10 s timeout, no redirects; backoff 1 m → 24 h; dead after 8 attempts (replay by owner/manager); endpoint disabled after ≥ 20 consecutive failures over > 24 h.
- SSRF: https only, every resolved address public (incl. IPv4-mapped IPv6, NAT64, TEST-NETs, bracketed IPv6) at creation and each attempt. Residual: DNS rebinding between check and connect (no undici pinning).

## Calendar sync health
`calendar_sync_health()` (service) → `/api/health` contracts.calendar_sync (0 connections live).

## Open
OAuth for third-party apps; key rotation/limits UI; webhook UI for rotation and dead letters; undici-pinned connections.
