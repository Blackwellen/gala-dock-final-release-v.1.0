# W02: Customer workspace — design fidelity, backlog wiring, responsive and census (pass 4)

**Runs:** pass 1 2026-10-28 · passes 2–4 2026-10-29 · Agent B (Opus) · dev :3107 · demo customer `alex.thompson@example.com` · real display scale (1536 = zoom 1).
**Evidence (pass 4):** `artifacts/visual/w02/r4/` — `sbs/` (design left), `region/`, `phone/` (#199, #201), `tools/` (`region.py` with leaf-weighted metric, `cap.mjs`, `run.sh`, `rerd.sh`, `cmp.py`, `phone-rd.sh`). Earlier: `r3/`, `r2-*`, `before/`, `after/`.

## 1. Summary
| Item | Result |
|---|---|
| Exit gate (≤5% per region or logged reason) | **NOT MET.** Plan board 3/4 regions ≤5%; every other route has logged residuals (§3). |
| Owner complaints 1–6 | Fixed (pass 2): full-width layout, top bar aligned, logo, no AI, no ranking reasons. Pass 4 gutter now x 32→1508 (references 31–34 → 1505–1510). |
| Structural pass (desktop) | Plan board, book steps 1–2, ticket setup 1–3, build, account, reviews, events, tickets: columns, order, card heights and fold aligned to references. |
| Phone (PWA) | Card-per-row structures built for My Tickets (#199) and My Events (#201); other 15 phone refs unchanged. |
| Tests | 18 passed, 2 failed, 2 skipped (customer e2e + ticket-credentials). Failures: Stripe deposit (owner onboarding) and **plan-wizard end-to-end — reproducible regression** (after `createFromPlan` succeeds the client never navigates to Build). |
| tsc / eslint | tsc 0; eslint 0 errors on changed files. |

## 2. Method
`region.py`: detect card rectangles in the design, match each to the best-overlapping rendered box (DOM + CV), drift = (1 − IoU) × 100, pass ≤5%. Pass 4 adds **leaf-weighted** drift (area-weighted mean over regions containing no other region) because large containers dominate the area figure. 1536×1024 captures with Q38 demo data.

## 3. Per-route fidelity (1536). Area / leaf %, regions ≤5%: pass 3 → pass 4
| Route | Design ref | Area % | Leaf % | ≤5% | Residual (reason) |
|---|---|---|---|---|---|
| `…/plan` CU-005 | Wedding Planning (2) #93 | 53.0 → **6.1** | 19.5 → 12.1 | 0/4 → **3/4** | one checklist group card — duplicate seeded tasks (data) |
| `…/book?step=2` CU-W02-02 | Wedding Booking Request #59 | 51.6 → 42.9 | 48.2 → **21.9** | 0 → 2/19 | main+side container dominates area; info cards ~12 px taller; approved FCA no-card |
| `…/book?step=1` CU-W02-01 | Venue Booking Dashboard #58 | 37.6 → **18.3** | 19.4 | 1 → 0/10 | side rail ~30 px; approved guest-breakdown row |
| `…/tickets/setup?step=1` | Wedding Ticket Setup #95 | 40.5 → 40.3 | 45.1 → 44.0 | 0/18 | detector splits design header/helper; 4 tiers vs 5 (data) |
| `…?step=2` | Sales & Rules #118 | 41.7 → 49.3 | 44.4 → 43.8 | 0/18 | no promo rows (data); detector matching |
| `…?step=3` | Ticket Setup Review #85 | 57.1 → **33.3** | 35.9 → 32.2 | 0/10 | summary card +33 px |
| `…/build` CU-004 | Wedding Event Planner Dashboard #68 | 44.4 → **22.6** | 39.7 → 29.5 | 0 → **2/14** | budget card warnings +123 px; 8 categories vs 11 (backend data) |
| `…/money` CU-007 | Wedding Money #91 | 44.0 → 42.3 | 56.0 → 54.3 | 1/13 | payments-handling copy longer (kept deliberately) |
| `/account` CU-013 | Account #69 | 35.9 → 34.3 | 32.7 → 31.1 | 1 → **3/16** | 2 saved cards vs 4 (wallets aren't stored methods); notifications +79 px |
| `/account/reviews` CU-012 | Reviews #79 | 43.6 → **36.2** | 23.7 → **17.5** | 2 → 0/13 | main container dominates area |
| `/account/tickets` CU-009 | Ticket Dashboard #83 | 33.0 → 32.4 | 9.8 → **8.1** | 3 → **4/14** | design wraps list; ours are row cards |
| `/account/tickets/[id]` CU-010 | Neon Nights Ticket #108 (1222) | 37.5 | 23.5 | 0/5 | not addressed this pass |
| `/account/events` CU-002 | Modern My Events #100 | 33.8 → **24.7** | 45.8 → **31.5** | 0 → 1/12 | planner rows ±25 px |
| `/home` | 9EC8147F (1448) | 25.6 | 31.5 | 0/19 | older 1448 shell; not addressed |
| `/account/saved` CU-011 | Saved #80 | 27.1 | 27.1 | 4/20 | rail card +80 px |
| `…/messages` CU-008 | Wedding Messaging #90 | 21.5 → **18.1** | 34.1 → 31.6 | 1 → **5/13** | thread rows (data) |
| `/discover` CU-001 | Event Discovery #42 | 18.0 → 16.7 | 15.2 | 3/20 | rail promo +94 px |

Key files: `cu-plan.css:69-92`, `cu-book.css:209-232`, `ticket-setup.css:136-157`, `cu-build.css:105-119`, `cu-account.css:92-98`, `cu-reviews.css:63-67`, `cu-events.css:90-124`, `cu-tickets.css:164-201`, `customer.css:65-66` (`.c-main:not(.pub-main)` gutter).

### 3b. Phone (390×844 vs PWA screen crop; area / leaf %)
| # | Ref | Pass 3 | Pass 4 |
|---|---|---|---|
| 199 | My Tickets | 68.5 / 77.3 | **58.5 / 67.2** (compact header, segmented tabs, card-per-row) |
| 201 | My Events | 58.4 / 79.4 | 65.3 / **77.3** (plain header, card-per-row) |
| 172–223 others | — | unchanged | unchanged |

Phone shell `MobileNav` shows "Back" on top-level pages (not in PWA mocks; shared component, unchanged). Census at 390: 0 overflow, 0 unnamed.

## 4. Approved deviations
C09 no AI (non-AI helpers replace Gala Agent panels) · C01 display scale · 6-step plan wizard · FCA no card at booking submission · Q22 buy-back resale · ticket QR/Ticket/Barcode switch · guest-breakdown row · ranking reasons never shown.

## 5. Remaining (W02 not closed), in order
0. **Fix the plan-wizard regression** (Create Event & Continue to Build never navigates).
1. Phone structures for #175 plan, #173 build, #172 money, #176 event, #190 guests, #174/#179 messages, #195 ticket, #196 account, #193/#197 reviews, #223 saved, #186/#188/#208 discover (pattern from #199/#201).
2. Desktop: build budget card, money rail copy, ticket detail (1222 ref), home stat tiles (1448 ref), saved rail, messages list.
3. Data: duplicate seeded wedding tasks; tiers 4 vs 5; build canvas 8 categories vs 11.
4. BLOCKED: checkout BUY-W01-02/03, resale eligible + review (Q07 onboarding, Q38 paid order).
5. Click-assert ~92 state-changing controls (W13).

## 6. Findings
- Plan wizard regression (above).
- Dev server dropped twice under RAM pressure (concurrent browsers + eslint push free RAM < 1 GB).

## Pass 4b (2026-10-29) — P1 fix, phone structures, desktop residuals
- **P1 plan wizard fixed.** Cause: migration 202610294031 (purge guards) made the client guard triggers on 9 tables (`build_items`, `provider_jobs`, `ranking_models`, `map_rule_packs`, `event_order_versions`, `talent_riders`, `talent_rider_items`, `safety_plans`, `consent_records`) call `fixture_purge_active()`, which only `service_role` could execute — so every client insert/update/delete on those tables failed (42501). Fix: migrations 202610292013 (grant `authenticated`) + 2014 (revoke `anon`), dry-run exercised (customer writes on `build_items`), applied with `scripts/testing/apply-b4-migration.mjs`. Function is definer, no args, true only inside an audited purge record created in the same transaction. `plan-wizard.spec.ts` green; tenant-security 12/12.
- **Phone:** all 17 customer PWA references now use the PWA structure at ≤480 px (compact title row, pill/segmented tabs, card-per-row lists, phone stat strip on event tabs, no Back link on top-level routes via optional `MobileNav.topLevel`). Montages `artifacts/visual/w02/r4/phone/montage/`. Region tool on phone stays 57–85% (dominated by content heights/row counts vs mock data) — phone judged structurally from montages; numbers are trend only. Census at 390: 13 routes, 0 overflow, 0 unnamed.
- **Desktop:** build 22.6 → 21.1% area (leaf 29.5 → 26.9%); money payments card tightened; no regressions.
- **Tests:** customer e2e + ticket-credentials 18 passed, 1 skipped, 0 failed (Stripe Checkout spec excluded). tsc 0; eslint 0 errors.
- **Remaining:** ticket detail (1222 ref), home stat tiles (1448), saved rail, messages list, money table rows, build readiness height; phone fine-tuning (guests check-in tab, open-thread view, discover filter chips); data (duplicate wedding tasks, 4 vs 5 tiers, 8 vs 11 categories); BLOCKED checkout/resale review (Q07/Q38); W13 click-asserts.

## Pass 5 (2026-10-29): consistency pass and W12/W13 follow-ups
- One display scale only: removed the CSS zoom hacks (`cu-book` .92/.88, `cu-events` .96, `cu-reviews` .95, `ticket-setup` .9). Tracks are now in design px.
- Customer page titles, action and CTA buttons, inputs, card padding and card titles are mapped to the shared `--k-*` tokens (`customer.css`). Designed photo heroes keep their size.
- Discard draft fixed: it now archives the draft instead of silently failing; the plan disappears from My Events and Home.
- Tap targets and clipping: task circles, plan and guest checkboxes, day arrows, "Open …" arrows and Edit links are 24px or larger; build "Package actions" no longer clipped; event "View details" no longer overflows; tickets "More options" at 390 no longer clipped (`cu-tickets.css` footer groups wrap).
- W13: `w13-customer-controls` 1/1; `w13-remaining` **3/3** (ticket setup, tier + guest export, build canvas add/remove); `build-canvas.spec` no longer self-skips (1/1).
- **P1 fixed: customers couldn't add a provider from the build canvas or the event overview "Add …" tiles.** The stretched-link rule `.ce-addmore-hit .k-link { position:absolute; inset:0; opacity:0 }` (`cu-event.css`) also matched the "Browse the marketplace" link inside the provider dialog, which isn't portalled and renders inside the tile's span. That link became an invisible full-screen layer, so every click in the dialog (Add, filters, cards) went to `/discover`. Found with `elementFromPoint` at the Add button (returned `A.k-link`, 0,0 → full viewport, opacity 0) at 1440, 1536 and 1440×1200. Fix: `.ce-addmore-hit > .k-link` (only the tile's own trigger). Verified: the Add click lands and creates a `build_items` row. No other `inset:0; opacity:0` rule has the same descendant scope.
- W14 (2026-10-29): 26 desktop and 17 phone customer references re-captured after zoom removal and token mapping. Fixed: booking title in the breadcrumb row; ticket stub QR overflow at 320; plan wizard More menu off-screen at 768. `.tk-date` / `.rv-done` scale hacks replaced with real sizes.
- Owner-reported phone fixes verified in the browser: plan-wizard occasion tiles + all 30 event types; one back control per page; phone logo mark-only; ticket QR centred/square and barcode not stretched at 320–1536. Specs plan-wizard-phone 3/3, one-back-control 3/3, ticket-credential-phone 8/8.
- Open: barcode too dense on phones (scanning lane); seated, free/comp, pass, online and hybrid tickets need fixtures to check.
