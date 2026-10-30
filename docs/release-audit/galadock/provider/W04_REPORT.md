# W04 — Venue operator (provider venue mode)

Run 2026-10-28 · lane B · `http://localhost:3107` · `provider.demo@example.com` on Riverside Arena (venue + service) · 1536×1024 (PROV-001 at 1448×1086), real display scale. Evidence: `artifacts/visual/w04/` (`before/` 38, `after/` 12, `sbs/`, `mobile/` 24, `census.json`). Race/cross-role spec: `tests/provider/w04-w05-race.spec.ts`.

Seeded IDs: venue `327451a6-0693-47f6-bbec-a480fe805db5`; space Grounds & Gardens `797bf40a-f809-499d-a3d7-ebd075ddf62f`; quoted request Engagement Party `7d2d23a2-12cf-4126-ab43-62794ed4a18e`; quote `8a71efed-181c-4a1a-8aed-d5b700f3165f`; booking BK-7812 `3e73b60c-2b7b-46b9-a7ed-9688d8214046`; package `bc246b8a-2c25-46bc-8c20-c57fc2ad5450`; team member Sarah Kim `afc2c7ae-88e2-4cdb-ac8a-552b52a75f98`.

Note: the capture script's default `riverside.venue@example.com` belongs to no provider workspace; use `DEMO_PROVIDER_EMAIL=provider.demo@example.com`.

## Summary

| Item | Result |
|---|---|
| Routes | 40 of 40 provider page routes reached (49 states). Reference-blocked routes render without errors. Not reached: disputes/[id], emergency/[id], messages/[id], help/[slug], agent/runs/[id], agent/[section] (redirect) |
| Fidelity (33 references) | 17 matched · 13 drift (data or minor) · 3 reference-mismatch states |
| Census | 1,360 controls / 49 routes |
| Phone 390 / tablet 820 | 6 pages, no overflow; nav Home · Bookings · Calendar · Listings · Menu; menu sheet 26 items |
| tsc / eslint | 0 / 0 |

## Fixes

| # | File | Change |
|---|---|---|
| F1 | `src/styles/provider-calendar.css:108,110` | Calendar "Gala Agent insights" header overflowed by 2px at 1536; now wraps |
| F2 | `src/styles/provider-calendar.css:24,34` | resource column 120→132px; names can use two lines |
| F3 | `src/app/provider/settings/page.tsx` | Trust & credentials card moved last so the PROV-017 grid sizes correctly |
| F4 | `src/app/provider/settings/page.tsx`, `src/styles/provider-settings.css:72` | fake "Coming soon" integrations replaced with honest "Not available yet" + pointers to CSV, statements, API keys & webhooks |
| F5 | `src/styles/provider-settings.css:4` | tab padding so all 12 tabs fit |
| F6 | `src/app/provider/team/gantt.tsx:37-39` | same-day shifts fill the day cell (PROV-013) |
| F7 | `src/app/provider/money/page.tsx:133` | "Resolve an issue" 404 → `/provider/help?q=payments` |
| F10 | `src/app/provider/opportunities/[id]/page.tsx:63,157` | no red "— remaining" when a request has no deadline |
| F11 | `src/app/provider/calendar/page.tsx:122` | "Services" row group when the workspace has no spaces |

## Per-route fidelity

| Ref | Route | Status | Remaining drift / reason |
|---|---|---|---|
| PROV-001 | /provider | matched | Today/Schedule empty, KPIs 0 (Q38 dates); switcher in top bar (shell decision); logo (D01) |
| PROV-002 | /opportunities | drift (data) | 0 open requests, all expired (Q38) |
| PROV-003 | /opportunities/[id] | matched | no attachments/similar (data) |
| PROV-W05-01/02 | /quote?step=1,2 | matched | line-item thumbnails blank (data) |
| PROV-004 | /quotes/[id] | matched | draft state shows "Edit draft" |
| PROV-005 | /bookings | matched | |
| PROV-006 | /bookings/[id] | matched | direct booking has no client chat (by design) |
| PROV-W06-01..03 | /bookings/new | matched | single space selected; simpler F&B panel |
| PROV-007 | /calendar | matched after F1/F2 | default Week; data sparse |
| PROV-008 | /listings | matched | |
| PROV-009 | /venues/[id] | matched | CAD plan instead of satellite map |
| PROV-010 (+availability) | /spaces/[id] | matched | fewer photos (data) |
| PROV-W02 | /spaces/new | matched (empty state) | |
| PROV-W01-01..04 | /venues/new | matched (edit mode) | new-venue steps 2–4 need step 1 saved (by design) |
| PROV-012 | /packages/[id] | drift (data) | DJ package with no inclusions |
| PROV-W04-01/02 | /packages/new | matched | |
| PROV-011 | /services/[id] | drift (data) | sparse service details |
| PROV-W03-01..03 | /services/new | matched | |
| PROV-013 | /team | matched after F6 | 8 vs 18 members (data) |
| PROV-014 | /team/[id] | matched | |
| PROV-015 | /money | matched | |
| PROV-016 | /agent | matched | |
| PROV-017 | /settings | matched after F3/F5 | 12 tabs vs 9 (prior decision) |
| PROV-001 phone | /provider @390 | drift | dense 9-tab reference vs 5-tab nav rule; larger type (W12) |

## Control census

| Class | Count |
|---|---|
| Working | 1,036 |
| Working but unverified | 138 |
| State-changing, not run | 144 |
| No visible effect (all verified working) | 27 |
| Disabled (expected) | 14 |
| Broken | 1 → 0 (F7) |
| Fake / inert fixed | 5 (F4) |
| Page errors | 0 |

## Race / cross-role (`tests/provider/w04-w05-race.spec.ts`: 6 pass, 3 expected-fail)

Pass: two simultaneous direct bookings for the same space/time → exactly one wins (`provider_jobs_no_space_overlap`); hold vs confirm race refused; turnaround buffer enforced (surfaces as `hard_conflict`); cancel frees the slot; declined request holds no capacity; quote revision visible to organiser with old version superseded; published listings public, drafts not.

Expected-fail (backend gaps): Q11 maintenance/blocked availability doesn't stop `provider_create_booking`; **Q10 (P1)** marketplace-confirmed venue job (`create_job_for_confirmed_item`) has no `space_id` and deposit confirmation runs no conflict check → the same slot can be sold directly again; **Q12 (P1)** no overlap guard for service jobs.

## Backend gaps

| Packet | Gap |
|---|---|
| Q10 (P1) | marketplace venue jobs lack space_id; no conflict check at deposit confirmation |
| Q11 | availability blocks don't stop direct bookings; no external calendar sync for provider jobs |
| Q13 | no event_orders seeded; BEO page "Not started" everywhere |
| Q08 | credentials card has no designed home in PROV-017 |
| Q28 / Q43 | provider assistant on Anthropic (being moved to Azure); quick tools start queued runs with no visible feedback |
| Q38 | all open requests expired; current week nearly empty |

## Incident

The first census pass clicked Gala Agent "Quick tools" and chat prompts, queuing 6 runs on Riverside Arena (0 tokens, 0 cost): `92fdc068-09cc-4521-bcb5-b28b859c500d`, `c8f298fd-3e8e-46e5-8cb4-e36849ec763e`, `1c6b91fc-ce1f-4980-a5ec-a21a06d90ac0`, `5f6dcbab-d882-4531-a81f-9415b8fef772`, `eb2905a0-b325-4d87-9a17-40ca1d778e6f`, `6e886088-25b6-40de-b45c-3af17efc2e05`. Cancel attempt was blocked by the permission system; owner to cancel. Census now clicks only a safe list.

## Left for W04

1. Q10/Q11 fixes, then flip the `test.fail`s. 2. Re-capture after Q38. 3. Run the 144 state-changing controls on a disposable provider. 4. Per-region diff %. 5. Landscape. 6. Phone layout vs dense PWA references (W12).

## Browser block 2026-10-29 (lane A) — all routes × 6 viewports
Census (after re-runs): 0 dead / 0 unnamed / 0 overflow / 0 console across 26 routes × 6 viewports. Captures `artifacts/visual/w04/{a-org013,a-new,after-a..d,a-beo}`; side-by-sides `w04/sbs`.

Fixes: F21 ORG-013 rebuilt (Design/Ticketing/Operations/Preview, findings rail, compare/restore, version-checked save with merge prompt); F22 structure editor (`venue_structure_save`, conflict prompt, calibration + import); F23 loading bays page; F24 menus (may-contain, course, allergen declaration, variants); F25 BEO structured hospitality + sync; F26 provider self-serve plans; F27 menu editor crash (server page importing constants from a client module → `menu-constants.ts`); F28 duplicate static plan list removed from billing; F29 loading-bay form grid; F30 ORG-013 organiser-shell classes; F31 ORG-013 phone order; F32 provider home empty image placeholder; F33 team member certification shapes + unique keys.

| Ref | Route | Diff % (mean px) | Verdict |
|---|---|---|---|
| ORG-013 Design | /organizer/events/[neon]/map | 20.2 (map canvas region 48) | drift with reason: schematic plan vs photographic aerial; palette in builder sidebar; 2D/3D + Request venue approval not built (no backend) |
| ORG-013 other tabs | ?tab=ticketing/operations/preview | — | matched to intent (no reference) |
| ORG-013 phone | 390 | 23.1 before fix | drift: order fixed; sticky bottom bar + element sheet not built |
| PROV-009 Spaces & Map | ?tab=spaces | 8.9 | matched |
| PROV-009 Operations | ?tab=operations | 12.6 | matched (data) |
| Venue logistics | /provider/venues/[id]/logistics | — | approved-deviation candidate (no reference) |
| BEO structured | /provider/beo/[Premier job] | — | matched to spec |
| PROV-017 billing | ?tab=billing | 6.1 | matched |
| PROV-001…017, W01–W05 | provider routes | 6.0–10.8 | matched / drift (data) |
| PROV-W06-01 | new booking | 9.9 (region 28.5) | drift: contact toggle + event-link box missing |
| PROV-W04 / W03-01 | new package / service | 9.0 / 8.6 | drift (preview panel) |

Note: this block measured mean pixel difference; the ≤5% per-region gate (W14) still needs region-diff on these routes.
Remaining: ORG-013 2D/3D, venue approval, element-details panel, phone bottom bar; PROV-W06-01 contact toggle; Riverside loading bays seed.
