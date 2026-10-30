# W05 — Solo supplier (provider services mode)

Run 2026-10-28 · lane B · `provider.demo@example.com` switched (product switcher) to Premier Event Services `a9260426-9059-49bb-be38-be9f6f3182db` (service-only), then restored to Riverside Arena. **No solo-supplier demo identity exists (Q38):** Elite Sounds DJ `f30153c3-bf0d-4b02-abc3-7d877ca7e002` is one of 17 listings in that workspace. Evidence: `artifacts/visual/w05/` (`before/` 19, `after/` 4, `sbs/` 17, `mobile/` 20, `census.json`).

## Summary

| Item | Result |
|---|---|
| Routes | 22 services-mode states |
| Fidelity (17 references) | 9 matched · 8 drift (mostly data) |
| Census | 751 controls / 22 routes |
| Phone / tablet | 5 pages, no overflow; 5-tab nav; menu sheet 22 items |
| tsc / eslint | 0 / 0 |

## Fixes

| # | File | Change |
|---|---|---|
| F8 | `src/app/provider/bookings/page.tsx:125-126` | services-only workspaces no longer offered a venue-only "Create booking" |
| F9 | `src/app/provider/bookings/new/page.tsx` | wizard guard: "Add a venue" or "View opportunities" when no venue listing |
| F10 | `src/app/provider/opportunities/[id]/page.tsx:63,157` | no-deadline countdown hidden |
| F11 | `src/app/provider/calendar/page.tsx:122` | "Services" calendar group |

## Per-route fidelity

| Ref | Route | Status | Notes |
|---|---|---|---|
| PROV-001 | /provider | drift (data) | 0 jobs → empty schedule/performance |
| PROV-002/003 | opportunities | matched | |
| PROV-W05-01 | quote step 1 | matched | |
| PROV-005 | /bookings | drift (data) | 0 provider_jobs despite 14 confirmed/fulfilled marketplace items (seeded without the job trigger) — Q38/Q10 |
| PROV-007 | /calendar | matched | 17 service rows; no bookings |
| PROV-008 | /listings | matched | |
| PROV-011 | /services/[id] | drift (data) | Elite Sounds: 1 photo, no inclusions/event types |
| PROV-W03-01..03 | /services/new | matched | |
| PROV-012 / W04-01 | packages | matched | |
| PROV-013 | /team | drift (data) | 0 crew |
| PROV-015 | /money | drift (data) | £0; payouts not set up |
| PROV-016 / 017 | agent, settings | matched | |

## Control census

| Class | Count |
|---|---|
| Working | 537 |
| Working but unverified | 139 |
| State-changing, not run | 31 |
| Handler present, not clicked (safe-list) | 28 |
| No visible effect (all verified working) | 6 |
| Disabled | 10 |
| Broken / dead | 0 (F8/F9) |

## Cross-role (GD-06)

Listing visible publicly only when published — PASS. Quote revision visible to organiser — PASS. Booking occupies capacity — PASS for direct venue bookings; **FAIL for service jobs (Q12) and marketplace venue jobs (Q10)**. Rejected request doesn't block capacity — PASS.

## Backend gaps

| Packet | Gap |
|---|---|
| Q12 (P1) | no overlap guard for service jobs (spec expected-fail) |
| Q10 | no direct-booking path for services; marketplace confirmations are the only route |
| Q38 | no solo-supplier identity; Premier Event Services has confirmed items but 0 jobs, 0 crew, 0 transactions |
| Q43 / Q28 | provider assistant (being moved to Azure) |

## Left for W05

1. Real solo-supplier seed (Q38) and re-run. 2. Q12 overlap guard, then flip the spec. 3. Run state-changing controls on a disposable services workspace. 4. Per-region diff %.

## Browser block 2026-10-29 (lane A)
Solo identity Mia Rossi Photography captured (13 routes × 6; `artifacts/visual/w05/{after,after2,verify}`). Fix: provider home empty-image placeholder. Diff 5.8–8.6% except PROV-008 13.3 and PROV-011 14.3 (data: one listing, different hero photo). Provider plan upgrade is now self-serve. Census clean.
