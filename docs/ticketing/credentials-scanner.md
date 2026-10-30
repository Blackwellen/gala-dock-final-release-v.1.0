# Ticket credentials, scanner and transfer (Q21, domains 96–98)

Migration 202610294012 (+ scan engine in 4011/4013). Tests `tests/release/ticket-credentials.spec.ts` (5), `tests/release/guests-access.spec.ts`. Code `src/lib/tickets/credentials.ts`, `scan.ts`, `printable.ts`, `src/components/tickets/rotating-qr.tsx`, `src/app/api/tickets/[id]/credential/route.ts`.

## Credentials

Secret `TICKET_QR_SECRET` (server-only, never public). Nonces never leave the server.

- Wallet `GD2.<id>.<window>.<sig>` — 30 s windows, ±2 skew; fetched by the holder (RLS, no-store).
- Print/barcode `GD2P.<id>.<sig>` — static, separate from the wallet code, revocable on its own via print epoch.
- Badge `GD2B.<passId>.<sig>`; offline snapshot signature. Signing domains never overlap.
- Apple/Google Wallet passes: BLOCKED_EXTERNAL (pass certificates / issuer account).

## Rotation and revocation

Trigger `tickets_credential_rotate` (every writer, incl. Q07's refund worker): refund, transfer, resale listing/completion, cancellation, holder change → new nonce, credential version +1. valid↔used keeps the credential. `reissue_ticket_credentials(ticket, 'print'|'all', reason)` — holder or ticket managers; audited; holder notified. Exit gate (stale credential rejected after transfer/refund/revocation): met.

## Ticket machine (now enforce)

valid → used|refunded|transferred|resale_listed|cancelled|void; resale_listed → valid|resold|cancelled|refunded|void; used → valid|refunded|cancelled; cancelled → refunded; transferred → cancelled; refunded/resold/void terminal. Historic states insertable for seeds/imports. Earlier state_violations traffic is modelled.

## Scanner

`scanCredential(...)` verifies the signature against the current nonce/epoch and calls `scan_admission`. Results: admitted, readmitted, duplicate, invalid, revoked, refunded, transferred, resold, wrong_event, wrong_session, resale_locked, wrong_zone, outside_window, reentry_denied, suspended, expired, exited — each with a reason; every attempt recorded. Concurrent scans → exactly one admission. Rate limit 900/min per scanner user.

## Offline

`scanManifest(event, device)` records a signed snapshot (no nonces or emails; print fingerprints; 24 h expiry). `syncOfflineScans(event, queue, snapshot)` verifies the snapshot belongs to the caller, replays deterministically: the earliest valid scan wins regardless of sync order (`offline_earlier_wins` / `superseded_by_offline` / `offline_duplicate`); a device admission the server rejects is flagged `offline_admitted_revoked`; replays return the stored result; implausible offline times refused.

## Transfer / reissue

`offer_ticket_transfer` / `accept_ticket_transfer` (hash-only single-use token, 7-day expiry): old entitlement → transferred (rotated), new ticket for the recipient, `replaced_by` chain, seat moved, notified, audited.

## Open

Q22 resale purchase rules; zone capacity counting at scan; wallet pass issuance (external); scanner UI zone picker and pass/badge print screens.

## Scan testing

**Decoder.** Scanners use `BarcodeDetector` when it supports `qr_code`; otherwise they lazy-load `@zxing/library` 0.23.0 (Apache-2.0) through `src/lib/tickets/frame-decoder.ts`. Decoding is on-device; no frame is ever sent anywhere. The `<video>` is drawn into an offscreen canvas (≤1280 px) every 300 ms and run through `src/lib/tickets/zxing-decode.ts`, one pass per frame on `FRAME_CYCLE = [1, .7, 1, .5, 1, .8, 1, .6]` (full-size frames read QR and Code 128; rescaled frames recover the ~5% of QR symbols zxing's finder misses at one size). Codes go to the scanner's own `submit()` with a 3 s same-code debounce; `.sc-cam[data-decoder]` shows `native` or `zxing`; camera requested at 1280×720. This gives camera scanning on iPhone Safari, Firefox and desktop browsers, which lack `BarcodeDetector`.

**Defects fixed (2026-10-29, lane D).**
1. Camera loop could die on its first frame (ran before React mounted the `<video>`, no retry) — shared `runScanLoop` + stream-attach effect (`frame-decoder.ts`, `scanner.tsx:91,98`).
2. Camera loop kept a stale `submit` (gate/zone changes ignored mid-scan) — `submitRef` (`scanner.tsx:88`).
3. `CheckInScanner` used the old `check_in_ticket` engine (ignored session, zone, resale lock, online-only; couldn't read `GD2.`) — now `scanCredential` like the door (`checkin-scanner.tsx:28`); compact mode no longer opens a camera with no preview.
4. **Security:** the static "Download QR image" credential (`GD1:<code>:<qr_nonce>`) never expired and bypassed rotation, the print reissue epoch and `print_tickets: false`. `ticketQr` now issues the signed print credential (`GD2P`) when printing is allowed, otherwise only the plain code (`customer-tickets.ts:55`). The `GD1` parser is kept so old printouts still work.
5. Offline sync result was overwritten by the download message — `download(quiet)` (`scanner.tsx:107,118`).
6. zxing finder misses at some sizes — per-format readers + scale cycle; 100/100 camera-like frames decode.
7. Code 128 at the inline card width is under 1 device px per module on phones — bars pixel-snapped (`crispEdges`, `code128.ts:39`) and a full-screen **"Enlarge barcode for scanning"** sheet (`barcode-sheet.tsx`, `barcodeSheetFit` `code128.ts:49`), rotated in portrait with whole device px per module (≥2 on 390/430 phones at DPR 2–3; 1 on very small DPR-2 screens, still decodes).

**Spec A — `tests/release/ticket-scan-decode.spec.ts` (no browser), 9/9 ×4 runs.** Live credentials from `/api/tickets/[id]/credential`, `/account/tickets/[id]/print`, `/api/tickets/[id]/pdf` and the downloadable QR are rendered as the app renders them, rasterised with sharp, decoded with `zxing-decode.ts`, and submitted as door staff through the real `scanCredential` (only Supabase clients and the rate limiter stubbed). Cases: decode matrix (QR 72–280 px + camera frames; Code 128 1–3× at heights 60/70/90; enlarged sheet 260–430 px at DPR 2–3; print PNG; PDF image); admitted → duplicate → re-entry; screenshot +5 min refused, +45 s admits; transfer kills the old code, new holder admits; resale-listed and refunded refused; wrong event / zone / session; multi-day pass once per component event and only inside its window, not valid elsewhere, refunded pass refused; online-only refused, hybrid admits; downloadable QR is `GD2P` and dies on print reissue. Helpers: `tests/release/scan-render.ts`.

**Spec B — `tests/e2e/scanner-camera.spec.ts` (Chromium fake camera), 7/7.** A Y4M clip generated from the live payload is played with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture`; the scanner must show "Valid — admit" then "Already scanned". Runs with BarcodeDetector as provided (absent on Windows Chrome — recorded) and deleted (zxing forced), for QR and Code 128, on `/organizer/events/[id]/scan` and `/door/[eventId]`. Also: manual entry, offline banner + offline queue + sync, camera-denied and no-camera messages, the enlarged barcode sheet (screenshot decodes, ≥2 device px/module), and seated / comp / multi-day pass / season pass / online / hybrid tickets in QR, Ticket and Barcode at 320, 390 and 1536.

**Open decisions (owner).** Shorter barcode credential (would truncate the signature — security change) if inline phone barcodes must scan; delete the unused `scanTicket` action and `check_in_ticket` RPC; unify the dimmed-QR and "Not valid for entry" not-valid treatments.

**Owner decision 2026-10-29 — manual entry stays.** Typing a ticket's plain code at the door still admits (same scan engine: duplicate, session, zone, resale-lock, refund and online-only rules all apply). It is a static code by design, so door staff must check ID on manual entries; the rotating QR / print credential remains the primary path.
