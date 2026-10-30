# W03 — Organizer workspace: backlog, design fidelity, control census, journeys

Pass 1 2026-10-28 (lane B; 37 routes, 12 fixes, 20 drift — kept in full under "Pass 1 record" below) · **Pass 2 2026-10-29 (lane D)**: organiser UI backlog, backend gaps, depth seed, consistency tokens, browser block. `http://localhost:3107` · demo organiser `alex.events@example.com` · admin `admin.demo@example.com` (TOTP, aal2) · party-portal test-fixture login. Standard: **premium, consistent, one scale (density.css), no CSS zoom** — the ≤5% region gate was dropped by the owner; small differences are logged, not blocking. Evidence: `artifacts/visual/w03/d4/<WxH>/` (captures), `d4/sbs/` (30 side-by-sides), `d4/after/` (post-fix re-captures + journey checks), `d4/census/` (census JSON per viewport, capture tool, routes, CSS drift audit).

Seeded ids: Neon Nights `392fdf17-4e5c-4473-987c-251dc0a97228`; Global Tech Conference (draft) `69a0c90c-1b4d-42f1-ab0a-4bdcbba71ca7`; Comedy Central Live `b52e0eae-5de4-46f7-8ba2-2e8861aa8555`; series anchor `82b6d7d5-bb79-47ab-8ea0-6253f83f73d1`; emergency request `3396b8a3-54f4-46df-a022-fcea2157a671`; dispute `f85186de-9531-433f-ab86-04d764b30c47`; portal party (Fizzbox) `7571e08a-565c-4123-9321-1468f3b755e2`.

## Summary (pass 2)
| Item | Result |
|---|---|
| Routes | 84 organiser states: all 45 page routes + every previously unreachable route (`disputes/[id]`, `help/[slug]`, `marketplace/bookings/[id]` + catering, `marketplace/emergency/[id]`, `agent/runs/[id]`), 19 new event sections, `/door/[eventId]`, plus `/portal/parties/[id]` |
| Viewports | 1536×1024, 1448×1086, 1280×800, 1024×768, 768×1024, 390×844 |
| Census | 621 captures · 33,987 controls · 0 failed loads · 0 dead · 0 unnamed · 0 overflow · 0 console errors · 701 internal links checked, 0 broken |
| Fidelity (30 referenced routes) | 22 matched · 8 logged drift, none blocking |
| Backlog | Q14, Q17, Q18, Q20, Q22, Q23/Q40, Q24–Q26, Q29, Q42, W11 asks — all built and wired |
| Backend (additive, applied, recorded) | 202610294035, 4036, 4038, 4039, 4040, 4041, 4042, 4043 · migrate status 272/272, parity OK, trigger-grants 0 hits, no anon-callable additions |
| Tests | regression 202/202 (24 files); admin MFA specs 27/27; post-browser 23/23 (`d4-s3-ops-sections` + `w08-admin-tiers`); tenant-security 12/12 |
| tsc / eslint | 0 / 0 errors |

## Organiser UI backlog (built in pass 2)
All sections at `/organizer/events/<id>?tab=…&section=…` (`src/components/organizer/event/sections/`). The sub-tab row has a "More" disclosure that shows the active section itself, so the row never grows (`header.tsx` `SubTabs`).

| Item | UI | Backend used / added |
|---|---|---|
| Q14 dependencies | Plan › Dependencies: graph, critical path, blocked-by, add/remove, approval decide, task setter | `event_dependency_graph`, add/remove/set/decide |
| Q14 brief | Brief editor with version history and conflict compare / load / "save mine as vN+1" | `save_event_brief` |
| Q14 templates | Template library; create from template (date + tz); archive whole family; save new version | `create_event_from_template`, `save_event_template`, **4040 `archive_event_template_family`** |
| W11 / lane C | gala/charity/conference tiles (`organizer_tile`); status menu offers only machine-legal, role-allowed states with live blockers + fix links; `savePage` and Ticket Pro `activateTickets` go through `event_transition`, roll back and show blockers; readiness shows lifecycle, ticketing and composition blockers | `event_lifecycle_blockers`, `event_transition` |
| Q42 | Friendly text for ~45 refusal codes (`src/lib/agent/refusals.ts`) on run and approval pages; skill picker sets `agent_runs.mission` | **4035** 7-arg `start_agent_run` overload. No run started, no AI calls |
| Q17 team | Team › Leave & cover (approve/reject with clash list, cancel, record, shifts needing cover + reassign); profile login state + owner-only invite (no email sent) | `decide_leave`, `reassign_shift`, `crew_invite_login` |
| Q18 | Ops › Access & passes (zones with live counts, rules, passes issue/suspend/revoke/print, versioned badges, door staff by email + "Copy scanner link"); Sell › Registration (draft/publish, approval queue, owner/manager-only sensitive answers); scanner zone picker; `/door/[eventId]` for outside door staff (login, `can_scan_event_any`, noindex/no-store/no-referrer, rate-limited) | **4036**, **4041** |
| Q20 | Sell › Inventory & allocations: per-tier inventory, allocations CRUD, linked access codes, promoter mirror sync, referral-vs-code use | **4036**, **4042**, **4043** (deadlock fix; delta 0) |
| Q22 | Sell › Resale & risk: policy labelled "draft, legal review pending" (no compliance claim), listings, launch state, risk flags (read-only, "Gala Dock reviews these"), launch + waiting-room editor | **4041 `set_event_launch`** |
| Q24 | Plan › Partners (full party lifecycle, packages, deliverables, booths, passes, slots, riders, contracts, money, portal link); `/portal/parties/[id]` (login, own party only, uniform 404) | existing Q24 commands |
| Q25 | Ops › Logistics: transport (private details managers only), bays/windows, accommodation, parking, checks, tasks | existing Q25 |
| Q26 | Plan › Compliance (labelled not a statement of compliance; requirements, licences incl. clear expiry, safety plans, facts); Plan › Accessibility; Ops › Weather (provider not configured, shown honestly) | existing Q26 + **4040 `licence_clear_expiry`** |
| Q29 | Plan › Online sessions: sessions, write-only links with audited reveal, lifecycle, roles, hybrid tier modes, recordings, attendance | existing Q29 |
| Q23 | Sell › Campaigns (5-step wizard, transitions, tracked links, report, calendar/blackouts + delete; "Sending is not enabled yet"); `/organizer/media` Media library, Galleries, Brand rules | **4038**, **4040 `delete_promotion_blackout`** |
| Q40 | Plan › Structure (series/tours, sub-events + cascade, days, venues and rooms + binding of tiers/shifts/programme, passes); Forms & waivers (+ retire draft waiver); Ops › Merch & stock (orders + refund via `/api/merch/refund`); Lost property (+ dispose after retention); Sustainability ("indicative") | **4039 `set_composition_binding`**, **4040** `retire_waiver_draft`, `dispose_found_item` |
| Bug | Saving Ticket Pro / ticket-setup tiers deleted allocation-linked access codes → now limited to `purpose='discount'` | — |

## Fixes in the pass-2 browser block
| # | Problem | Fix |
|---|---|---|
| D1 | Home, Calendar and event Operations put full team + live-ops conflict lists above the designed first row (150–300px push) | `ConflictsStrip`: one-line "Needs attention" disclosure with counts (`src/components/organizer/conflicts-strip.tsx`, `org-event.css`) |
| D2 | Active "More" section appended to the sub-tab row, clipped at 1536 | Disclosure shows the active section (`header.tsx`); sub-tab padding 16→13px |
| D3 | Closed "More" menu items unnamed for audits | `aria-label` on menu items |
| D4 | Registration question rows overflowed the 360px side column | `.ax-field-row` stacked layout (`org-access.css`) |
| D5 | Tickets hub event names/tags spilled into the Date column | `.th-ev` min-width 0, tags wrap (`org-tickets.css`) |
| D6 | Empty `src=""` console errors on Home, Events, Calendar, Marketplace (series occurrences without cover) | Cover fallback (`organizer/page.tsx`, `events/page.tsx`, `calendar/page.tsx`, `calendar-client.tsx`); marketplace picker shows the tile |
| D7 | Sell tab poster thumbnails 404 (`/api/files/<id>` for public storage URLs) | Public storage URLs used directly (`sell.tsx:85`) |
| D8 | Phone hero clipped the title for online/draft events | `@media (max-width:720px) .eh-hero:has(+ .eh-tabs){height:auto}` |
| D9 | `zoom: .86` on ORG-014 rows | Real sizes; no CSS zoom in any organiser or admin file |
| D10 | One-off component sizes | W14 tokens added to `kit.css` (additive: `--k-btn-*`, `--k-input-*`, `--k-icon-btn*`, `--k-chip-*`, `--k-card-pad`, `--k-title-page/admin/card/sub`, `.k-input.dense`, `.k-icon-btn.dense`, `.k-chip.dense`); 114 one-off organiser/admin properties moved to them; hero icon button square (40) |

## Per-route verdicts (1536; all 6 viewports pass the census)
| Ref | Route | Verdict | Logged differences (non-blocking) |
|---|---|---|---|
| ORG-001 | /organizer | matched | Conflicts now one-line strip; upcoming are series occurrences (fallback cover) |
| ORG-002 | /organizer/events | matched | Cards default; occurrences show fallback covers |
| ORG-003 | events/[id] overview | matched | Readiness 46% "At risk" is real data |
| ORG-003 Sell | ?tab=sell | matched | 6 tiers vs 4 (data); seated-plan map instead of illustrated arena |
| ORG-003 Ops | ?tab=operations | matched | Conflict strip above KPIs; map is the plan editor preview |
| ORG-003 Money | ?tab=money | matched | Chart data shape (data) |
| Plan tab + 7 sections | ?tab=plan&section=… | reference-blocked, consistent | — |
| Sell/Ops new sections (8) | ?tab=sell\|operations&section=… | reference-blocked, consistent | Phone: active base sub-tab not scrolled into view |
| ORG-012 | /page | matched | Live preview renders the real public template |
| ORG-013 | /map (Comedy) | drift (logged) | CAD-style editor (lane A Q19) vs illustrated map; Design/Ticketing/Operations/Preview tabs present |
| ORG-014 | /promotion | matched | Zoom removed; real "Not listed" states |
| ORG-015 | /media | matched | — |
| ORG-W07 | /template | matched | — |
| ORG-W03 | /tickets/setup | matched | 5 steps; step 1 = Model & Capacity design |
| ORG-W01 | /events/new | matched | DB-driven tiles |
| ORG-004 | /calendar | matched | Current week sparse (seed dates) |
| ORG-004 month | ?view=month | matched | — |
| ORG-005 | /sales | matched | Sub-nav gained Contracts and Clients (Q16) |
| ORG-007 | /sales/proposals/[id] | drift (data) | Seeded proposal has no line items (Q38) |
| ORG-008 | /marketplace | drift (logged) | 3 cards + map pane vs 4 cards no map; filter bar differs |
| ORG-W04 | /requests/new | matched | 4 steps |
| ORG-010 | /requests/[id] | matched | — |
| ORG-011 | /tickets | matched (after D5) | Row tags include seed tag `demo_showcase` |
| ORG-W05 | /promotions/new | matched | — |
| ORG-W02 | /proposals/new | drift (logged) | No linked-lead card / AI lead summary (owner: no AI there); empty first step |
| ORG-016 | /team | drift (data) | Availability grid / upcoming shifts empty this week (seed dates) |
| Team › Leave & cover | /team?tab=leave | reference-blocked, consistent | — |
| ORG-017 | /team/[id] | matched | Low-res avatar; notes/files sparse (data) |
| ORG-018 | /money | matched | — |
| ORG-019 | /money/invoices/[id] | matched | — |
| ORG-W06 | /invoices/new | matched | — |
| ORG-020 | /agent | matched | Skill picker added; Routines panel not in first view |
| ORG-021 | /settings | matched | Extra tabs (Security, Developers, Demo) |
| — | agent/runs/[id], disputes/[id], emergency/[id], bookings/[id] (+catering), help, help/[slug], inbox, scan, live, virtual, door | reference-blocked, render clean | Dispute/emergency sparse but complete |
| — | /portal/parties/[id] | reference-blocked, clean | Own party only; others 404 |
| Shell | all | approved deviations | Centred search; Media Studio nav; G mark + purple wordmark; Gala Agent kept (organiser) |

## Census by viewport
| Viewport | Routes | Controls | Failed / dead / unnamed / overflow / errors |
|---|---|---|---|
| 1536×1024 | 84 + portal | 5,150 | 0 / 0 / 0 / 0 / 0 |
| 1448×1086 | 84 | 5,139 | 0 |
| 1280×800 | 84 | 5,139 | 0 |
| 1024×768 | 84 | 4,135 | 0 |
| 768×1024 | 84 | 4,135 | 0 |
| 390×844 | 84 + portal | 4,114 | 0 |

State-changing controls (save, publish, approve, refund, scan, run, send) were not clicked in the browser; their commands are exercised by API/DB specs (202/202). No Gala Agent run was started. Closed `<details>` contents count as not visible.

## GD-04.4 journeys
| # | Journey | Result |
|---|---|---|
| 1 | Create → venue → capacity → staff → budget → tickets → publish → buy → scan → reconcile | PARTIAL — all reachable; publish/on-sale gated by live blockers; purchase blocked on Stripe test onboarding (owner, end of queue); scanner + zone picker + door route render; reconciliation screen built (0 runs until Stripe) |
| 2 | Proposal → quotes → compare → deposits → cash flow → cancel/refunds | PARTIAL — deposits need the Stripe test run |
| 3 | Multi-room → acts/stages → capacity/double-booking → programme | PASS — `programme_overlap` / room-at-venue / capacity guards (event-core spec); rooms, days, venue binding UI (Plan › Structure, 4039, d4-b1 7/7) |
| 4 | Copy event with new date | PASS — duplicate dialog requires name, new start and timezone, lists what is/isn't copied (`after/journey4-duplicate-dialog.jpg`); `duplicate_event` shifts the programme |

## Gaps left
- **External / owner:** Stripe test onboarding (journeys 1–2, merch card refunds, reconciliation runs); weather provider key; legal review (resale GB v1, compliance rule pack); real email/SMS for campaigns.
- **Seed:** resale listing needs a Stripe-paid original order; proposal line items empty; team week grid and calendar week sparse; series occurrences have no covers.
- **Product:** referral-aware holds when public stock is exhausted (hot path unchanged); waiting room has no buyer queue UI (lane B); tier rebinding blocked once a tier has sales.
- **Minor UI logged:** phone active base sub-tab not auto-scrolled; ORG-013 illustrated map style; ORG-008 default map pane; ORG-W02 linked-lead card; seed tag in tickets hub; `workspace.css` page title 34px (shared file, left alone).
- **Demo-data side effects from the pass-2 seed:** Neon `max_per_customer` = 8; Elite Security booking `disputed`; portal fixture `p1-d4portal-…` (caught by the p1 purge); demo identity `ava.thompson@example.com`.

---

# Pass 1 record (2026-10-28, lane B) — retained verbatim

# W03 — Organizer workspace: design fidelity, control census, journeys

Run 2026-10-28 · lane B (Opus) · `http://localhost:3107` · demo organizer `alex.events@example.com` · 1536×1024 (ORG-001 at 1448×1086), real display scale. Evidence: `artifacts/visual/w03/` (`before/`, `after/`, `sbs/` 44 side-by-sides, `mobile/`, `census.json`).

Seeded IDs: Neon Nights `392fdf17-4e5c-4473-987c-251dc0a97228`; draft Global Tech Conference `69a0c90c-1b4d-42f1-ab0a-4bdcbba71ca7`; Comedy Central Live (has map) `b52e0eae-5de4-46f7-8ba2-2e8861aa8555`; invoice INV-1047 `916eec0d-3b93-46e0-8be3-f6c5033cb7b9`; request REQ-2026-018 `6c44d895-083e-49e8-bb25-10a01b040d21`; proposal `6672249d-38f1-4f11-a24f-30987b9e4bf1`; lead `0147f801-c32e-422c-9563-87fde2790ef8`; crew Ava Thompson `37390853-e3a7-4166-b3c9-f5d6b39f6f50`.

## Summary

| Item | Result |
|---|---|
| Routes | 37 of 45 organizer page routes captured (56 states). Not captured: `agent/[section]`, `events/[id]/promotion/new`, `tickets-promotion` (redirect-only); `disputes/[id]`, `help/[slug]`, `marketplace/bookings/[id]` (+catering), `marketplace/emergency/[id]` (no seeded id reachable) |
| Fidelity (43 references) | 19 matched · 20 drift remaining · 4 approved prior decisions · 16 reference-blocked routes render without errors |
| Control census | 1,856 controls on 45 routes |
| Phone 390 / tablet 820 | 6 key pages, no horizontal overflow; nav Home · Events · Calendar · Marketplace · Menu; menu sheet fits |
| tsc / eslint | 0 errors / 0 errors on 11 changed files |

## Fixes

| # | Problem | Fix |
|---|---|---|
| F1 | Empty "Team conflicts / None" strip pushed Home, Calendar, Agent, event Plan down ~40px | opt-in `hideEmpty`: `src/components/ops/readiness-panel.tsx:37,42`; used in `organizer/page.tsx:60`, `calendar/page.tsx:53`, `agent/page.tsx:62`, `components/organizer/event/plan.tsx:34` |
| F2 | Home "Last 30 days" fake button; truncated KPI captions | `src/app/organizer/page.tsx:102,104,142` |
| F3 | Sales toolbar wrapped (page ~50px low) | `src/app/organizer/sales/page.tsx:47` |
| F4 | Agent credits meter on its own row | `src/styles/org-agent.css:25-26` |
| F5 | Event Sell & Promote / Money KPI values wrapping | `src/styles/org-event.css:207-211` |
| F6 | Page editor block rows wrapping | `src/styles/org-promotion.css:46-47` |
| F7 | Save-as-Template grid first card swallowing row | `src/styles/org-template.css:6` |
| F8 | Team profile 3 KPIs/row instead of 5 (`.tp-kpis` collision) | renamed `.tpr-kpis`: `src/styles/org-team.css:4,47,48`, `src/app/organizer/team/[id]/page.tsx:56` |
| F9 | RFQ step 2 supplier names wrapping to 4 lines | `src/styles/org-market.css:79-80` |
| F10 | Events list checkboxes / select-all inert | `events-client.tsx:60-69,84-89`, `events/page.tsx:6,48,70,72` (export respects selection) |
| F11 | Tickets hub "Share event" → 404 (completed event) | `src/app/organizer/tickets/page.tsx:24` |
| F12 | Promotion wizard "View event" → 404 for planning events | `src/app/organizer/promotions/new/page.tsx:9,18` |

## Per-route fidelity

| Ref | Route | Status | Remaining drift / reason |
|---|---|---|---|
| ORG-001 | /organizer | matched | "No open tasks" rows (Q38); logo owner question |
| ORG-002 | /organizer/events | matched | design default Cards, ours List (owner/design); hydration warning P3 |
| ORG-003 | events/[id] overview | matched | ticket pace chart lacks axis labels |
| ORG-003 Sell | ?tab=sell | matched | 6 tiers vs 4 (data); no venue map on Neon (Q38/Q19) |
| ORG-003 Ops | ?tab=operations | drift | no map (Q38/Q19); live controls in a third column |
| ORG-003 Money | ?tab=money | matched | donut/rows slightly taller |
| Plan tab | ?tab=plan | reference-blocked | no Plan-tab image |
| ORG-012 | /page | drift (reduced) | live preview renders real public template instead of dark mock |
| ORG-013 | /map | **major drift** | CAD-style builder differs structurally (no Design/Ticketing/Operations/Preview tabs, no element-details panel); needs design pass + Q19 |
| ORG-014 | /promotion | matched | no momentum box |
| ORG-015 | /media | matched | |
| ORG-W07 | /template | matched | |
| ORG-W03 1–4 | /tickets/setup | drift | 3 steps vs 5 (prior decision); tier rows ~18px taller |
| ORG-W01-1 | /events/new | matched | 7 steps; "Commercial Model" label |
| ORG-W01 2–4 | ?step=2..4 | drift | simpler venue filters; steps need a draft id |
| ORG-004 | /calendar | drift | current week empty (Q38 dates) |
| ORG-004 month | ?view=month | matched | |
| ORG-005 | /sales | matched | no KPI deltas (Q16); kanban names truncate |
| ORG-007 | /sales/proposals/[id] | drift | seeded proposal empty (Q38/Q16); no Contracts/Clients sub-nav (Q16) |
| ORG-008 / 008s | /marketplace | drift | 3 cards + map pane vs 4 cards no map; filter bar differs |
| ORG-W04 1 | /requests/new step 1 | drift | 2 steps vs 4; tiles became a select; no requirement checklist |
| ORG-W04 2 | step 2 | matched | |
| ORG-010 | /requests/[id] | matched | one supplier without image (data) |
| ORG-011 | /tickets | matched | event names wrap |
| ORG-W05 1–3 | /promotions/new | matched | Neon dated out (Q38) |
| ORG-W02 1–3 | /proposals/new | drift | 3 steps vs 5 (prior decision); no linked-lead card |
| ORG-016 | /team | drift | availability grid empty this week (Q38) |
| ORG-017 | /team/[id] | matched | low-res avatar; no notes/files (data) |
| ORG-018 | /money | matched | fewer profitability rows (data) |
| ORG-019 | /money/invoices/[id] | matched | "View payment page" `/pay/<token>` 404 (Q07) |
| ORG-W06 1–2 | /invoices/new | matched (empty state) | |
| ORG-020 | /agent | matched | |
| ORG-021 | /settings | matched | extra tabs (Security, Developers, Demo) |
| Shell | all | approved deviations | centred search up to 1,065px with actions right (commit c49a45d, shared with provider/admin); Media Studio nav item; logo mark only (owner); Gala Agent kept |
| Phone ORG-001 | /organizer @390 | drift | reference 4th tab "Marketing", ours "Marketplace"; larger type (W12) |

## Control census

| Class | Count | Notes |
|---|---|---|
| Working | 1,110 + 12 re-probed | links 200, tabs/menus/dialogs open, toggles navigate |
| Fixed this run | 13 | 9 inert checkboxes, 1 fake button, 2 links → 404, 1 class collision |
| Working but unverified | 147 | selects, inputs, mailto, anchors |
| Not executed (state-changing) | 533 | save/publish/send/approve/delete/duplicate/assign/pay + ~100 map tools; all have handlers |
| Disabled (expected) | 42 | |
| Harness click failures | 12 → 0 | all work on re-probe |
| Broken, not fixed | 1 | invoice "View payment page" `/pay/<token>` 404 (Q07) |
| Page errors | 1 | `/organizer/events` hydration mismatch (P3) |

## Backend gaps

| Packet | Gap |
|---|---|
| Q07 | `/pay/[token]` 404 for paid invoice INV-1047; customer purchase in journey 1 needs Stripe test checkout |
| Q14 | `duplicateEvent` (`src/lib/actions/events.ts:11-30`) copies programme times as absolute source timestamps, sets no new date, copies settings wholesale, no confirmation; no area/room overlap check on programme items (`event-profile.ts:80-84`) |
| Q16 | no Contracts / Clients pages; no prior-period KPI deltas; proposal line items empty on demo |
| Q17 | conflicts engine works but demo shifts don't overlap current week; crew grid empty |
| Q19 | no map on Neon; builder structure differs from ORG-013; no room/space model for multi-room capacity |
| Q20 | ticket setup 3 steps vs 5-step design |
| Q38 | Neon dated in past but on_sale; empty current-week calendar/team/tasks; empty proposal |
| Q41/42 | agent pages route; runs not executed (no paid runs in QA) |

## GD-04.4 journeys

| # | Journey | Result | Stops / breaks |
|---|---|---|---|
| 1 | Create → venue → capacity → staff → budget → tickets → publish → buy → scan → reconcile | PARTIAL | wizard + draft steps 2–4, ticket setup, Ops/Money reachable; stopped before Continue/Publish; purchase blocked on Q07 test checkout; scan page renders, not run |
| 2 | Wedding proposal → quotes → compare → deposits → cash flow → cancel/refunds | PARTIAL | proposal + RFQ + quote comparison route; stopped at send/select; deposit Q07; cancel-with-refunds not run |
| 3 | Multi-room event → acts/stages → capacity/double-booking → programme | FAIL (backend) | no per-stage overlap check, no room capacity model, acts not linked to bookings (Q14/Q19) |
| 4 | Copy event with new date | FAIL (backend) | duplicate unconfirmed; tickets reset correctly; no new date, programme keeps source dates, settings copied wholesale (Q14) |

## Phone / tablet portrait

390×844 and 820×1180 on /organizer, /events, /events/[id], /money, /team, /sales: no overflow; 5-item nav; menu sheet fits with 0 items outside. Help appears twice (shared account section, W12). Landscape not run.

## Left for W03

1. Venue map builder redesign to ORG-013 + Q19 seed. 2. Marketplace default layout and filter bar; RFQ step 1 tiles + requirements panel. 3. Ticket setup density; 3-vs-5 / proposal / RFQ step counts (owner). 4. Events default view Cards vs List (owner). 5. Re-capture after Q38. 6. Q14 duplicate-event fixes + programme overlap, re-walk journeys 3–4. 7. Run the 533 state-changing controls on a disposable organizer (W13). 8. Per-region diff % for the ≤5% gate. 9. Capture unreachable routes after seeding. 10. Fix `/organizer/events` hydration mismatch.
