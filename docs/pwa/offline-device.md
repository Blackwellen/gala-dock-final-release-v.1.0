# PWA, device and offline (Q37, domains 231–234) — 2026-10-29

Migration 202610293031. Tests: `tests/release/pwa-offline-device.spec.ts` (5/5). Earlier shell evidence: 27/27 at DPR2 (`artifacts/pwa/shell`, 2026-10-12).

## Service worker (`public/sw.js`, gd-static-v3)
Caches only `/_next/static`, `/assets`, `/icons`, `/brand`, `/fonts`, `/offline.html`. Never: `/api`, `/auth`, `/admin`, token pages (pay, portal, p, proposal, contract, rsvp, invite, r, ref, guest, share, t, reset-password), `/print`, non-GET, cross-origin (Stripe, Supabase, maps). Navigations network-first with offline shell fallback. no-store/private responses never cached. Updates wait for the user's "Reload to update".

## Offline data
`src/lib/pwa/offline-store.ts` — user-scoped IndexedDB (ticket_pass, event, run_sheet, job_sheet) with TTLs; never a source of truth; cleared on sign-out. **UI wiring pending:** ticket wallet (W02), run sheets (W03), provider job sheets (W05). Offline scanner (Q21): signed snapshot + local queue; background sync tag `gd-scan-sync` flushes through the permission-checked sync (`check_ins.client_scan_id` idempotent).

## Push (delivery BLOCKED_EXTERNAL)
`push_subscriptions` (allow-listed push services only, bound to user + session, ≤10 per user), `push_register` / `push_unregister` / `push_revoke_session` (on sign-out) / `push_set_preference`, `push_enqueue` (service; preferences, critical bypass, dedupe, title ≤60, body ≤140, same-origin path), `push_claim` / `push_mark` (410/404 revokes), `push_health`. Client `src/lib/pwa/push-client.ts`; routes `/api/push/config` (503 until configured), `/api/push/subscribe`. Owner: VAPID keys → `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`; approve a web-push sender dependency.

## Device permissions
`Permissions-Policy camera=(self), microphone=(), geolocation=(self), payment=(self)`. Scanner: getUserMedia + BarcodeDetector with manual-code fallback. Install/offline/update events counted by Q35 (`pwa.installed`, `pwa.offline_used`, `pwa.updated`).

## Exit gate
Desktop sidebar not used as mobile primary navigation: 27/27 (Oct 12). Re-run blocked — saved auth states expired and minting new ones headlessly was refused. Owner/coordinator: `node --env-file=.env --env-file=.env.local scripts/pwa-auth-fixture.mjs customer organizer provider`, then `PWA_QUICK=1 PWA_AUTH_FIXTURE=1 node scripts/pwa-audit.mjs customer organizer provider`.
