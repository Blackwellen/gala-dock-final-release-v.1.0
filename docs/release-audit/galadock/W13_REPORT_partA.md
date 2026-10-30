# W13 part A — every route, every control (provider, affiliate/promoter/partner, portals, admin)
Run 2026-10-29 · lane A · http://localhost:3107 (never production) · one headless Chrome, closed after each batch; free RAM checked before every batch (the runner waited whenever it was under 2 GB).

Engine: scratchpad `a5-lane/audit.mjs`.
- Crawls from every route on disk and follows links (one instance per dynamic pattern).
- Lists buttons, links, tabs, menu items, toggles, selects, disclosures and form submits.
- Each control is clicked on a fresh page and the result recorded: navigation, dialog opened (then its items, or its primary action filled and submitted), server/API calls with HTTP status, toast or message, the control's own state, console/page errors.
- After each server call, rows and updated_at in the fixture's tables are compared, plus audit_events.
- Opened menus are walked item by item and their links checked. Delete/remove/deactivate controls ran last, in a final pass.
- Demo identities = read-only mode: tabs, menus and dialog openers only, closed again.

Fixtures: `a5-lane/fx.mjs` — disposable users `p1-w13-*@gala-dock.test`, workspaces flagged `is_test_fixture`, listings unpublished; email only to reserved addresses (outbox suppresses); cleaned up afterwards.

## Results by surface
| Surface / identity | Routes | Controls on pages | Unique | Links | Click-asserted | Pass | Flagged | Excluded | Data mutations | DB/audit change |
|---|---|---|---|---|---|---|---|---|---|---|
| Venue (fixture, full) | 66 + 21 retest + 5 delete pass | 4,139 | 874 | 447 | 426 | 320 | 69* | 57 | 82 | 39 |
| Solo (fixture, full) | 29 | 1,269 | 225 | 213 | 109 | 90 | 14* | 17 | 18 | 13 |
| Agency owner (fixture, full) | 28 | 1,231 | 204 | 223 | 96 | 79 | 13* | 16 | 15 | 12 |
| Agency staff (fixture, full) | 29 | 1,288 | 211 | 241 | 102 | 88 | 10* | 15 | 14 | 3 |
| Partner (fixture, full) | 7 | 249 | 73 | 15 | 73 | 44 | 28* | 0 | 1 | 0 |
| Promoter (fixture, full) | 2 | 59 | 26 | 13 | 26 | 11 | 14* | 0 | 1 | 0 |
| Portals (fixture tokens, full) + positive-path script | 13 | 313 | 25 | 21 | 22 + 7 | 19 + 6 | 0 | 0 | 6 | 4 |
| Admin (admin.demo, TOTP, disposable targets) | 7 | 404 | 44 | 100 | 32 | 30 | 1 | 2 | 13 | 7 + 15 audit rows |
| Admin demo (read-only) | 36 | 2,205 | 658 | 534 | 209 | 184 | 24* | 7 | 0 | 0 |
| provider.demo / solo / agency owner·manager·staff·finance demo (read-only) | 40 / 27 / 28×4 (+2 cut-off cells re-run) | 7,750 | 1,869 | 1,529 | 403 | 387 | 16* | 116 | 3 (see incident) | 0 |
| partner.demo / promoter.demo (read-only) | 7 / 1 | 336 | 100 | 29 | 81 | 49 | 32* | 0 | 0 | 0 |
| **Total** | **432** | **20,249** | **4,319** | **3,375** | **1,539** | **1,261** | **221*** | **230** | **153** | **78** |

\* Flagged = "no visible effect", "click failed" or "gone". Every flagged control was triaged (probe.mjs, verify.mjs, code reading); real defects are under Bugs fixed and Remaining. The rest are headless artefacts: copy/share buttons (headless clipboard gives no visual change; navigator.share opens the OS sheet); filter selects that navigate after >1.5 s (URL changes confirmed in other runs); single-option selects on empty fixtures; the global-search popover covering a page "Search" button (probe: works); search-result options that close with their listbox; controls disabled after an earlier state change; window.print().

**Authoritative postconditions (examples):** opportunity marked available updates build_items + audit event; hold placed; booking change request, issue and arrival recorded; venue/service/package drafts, duplicates and publishing refused until required data exists ("description ≥ 40", "price above £0"); menu/section/item/variant edits and deletes; message sent (messages row); support case created (SUP-44xx); crew deactivated (audited); venue operations switched off and on; calendar view saved. Portals: approve, and reject with a required reason (portal_approvals); client message (portal_messages 4 → 5); proposal accept (status accepted, accepted_at set); contract wrong signer refused, correct signer signed (contracts, contract_parties). Admin on disposable targets, every action audited (15 audit_events rows): user restrict and note; workspace suspend; case assign/escalate/resolve; listing approve/request changes/restrict/suspend.

**Role checks:** agency staff (member role) are refused every manage action with "You don't have permission to do that" (venue/service/package drafts, publish, duplicate); allowed actions (request leave, design, support) succeed.

No unhandled page errors from clicks. Dead links: 0 after the admin fix. Console errors on load all came from other lanes' compile windows (csp-report, organizer sell.tsx), a Supabase 502 at 14:37 UTC and a dev-server restart — every cell from those windows (incl. 14:36–14:42) was re-run.

## Excluded by rule (seen, never clicked)
- Stripe payment/payout: Set up payouts, Process payout, Process refund, invoice Pay, plan upgrade and billing.
- Real email/SMS: none in scope; in-app sends only to reserved recipients (outbox suppresses).
- Gala Agent / AI: Suggest with Gala Agent, Suggest layouts, Generate BEO, New chat, Configure, every agent prompt chip, Send in the agent, Switch Gala Agent off; every button on `/provider/agent/*` for demo identities.
- Real maintenance: every control on `/admin/maintenance`, including Save window.
- Session: Revoke all sessions, Sign out. Uploads: file chooser opens (verified); no upload run.

## Incident (rule broken during the run)
At 18:02:50 UTC the read-only crawler on provider.demo clicked "Cancel run" on agent run `37b8d13c-88cc-4b5c-8012-479bf2fd9190` (Riverside Arena, "Fill short-notice availability this week", created 10 Oct, 0 tokens) — now `cancelled`, audited `agent.run_cancel`. The crawler treated any "Cancel…" label as safe; tightened to exact "Cancel" only and no buttons on `/agent/*` for demo identities, and all later demo crawls re-run. Not restored (restoring could queue the agent again) — owner decision. The same crawl clicked "Cancel" on `/provider/bookings/new`, discarding provider.demo's unsaved booking draft. Nothing else affected.

## Bugs fixed
1. `src/components/pwa/mobile-nav.tsx:110-112` — phone menu sheet showed Help twice and both "Account" and "My account" (W02 finding); skipped when the role menu already has them.
2. `src/components/workspace/shell.tsx:190` — provider phone Help (now `/help?from=provider`, the one help centre).
3. `src/app/provider/bookings/new/steps.tsx:73` — "Add requirement" did nothing when empty; now disabled until text is typed.
4. `src/app/provider/packages/[id]/page.tsx:100,101,105` — duplicate React keys on included / not-included / add-on lists.
5. `src/app/provider/beo/[id]/page.tsx:22-27` — "Event order approved" notifications linked with the event-order id and 404'd; the page resolves it to its booking, or its opportunity when there is no booking yet.
6. `src/components/portal/client.tsx:48,75`, `src/styles/portal-shell.css:181-184` — partner/promoter copy and share buttons now show and announce "Copied" / "Link copied".
7. `src/app/admin/(console)/commerce/transactions/[id]/page.tsx:65,89,106,128`, `commerce/view.tsx:181` — "Open event" linked to a non-existent `/admin/events/[id]`; now `/admin/events?sel=<id>` (all 200).
8. `src/styles/portal-shell.css:186-192` — portal phone side menu off-screen but Tab-reachable when closed; now hidden while closed (0 off-screen focus stops). Visible focus ring on portal inputs; `.pt-link` ≥ 24 px.
9. W12 tap targets: `provider-home.css:162`, `portal-promoter.css:179`, `provider-calendar.css:148`, `admin-pwa.css:73-79`.

## Remaining
- Agent run 37b8d13c cancelled by the crawler — owner decision (Q41).
- **Fixed (P1, Q41/Q43): routine scheduler.** The 17:30 runs were the live scheduler (`workerTick()`, pg_cron → `/api/agent/worker`); seeded routines had no compiled trigger so it always fell back to now + 24 h, and cron was read as UTC. New London-time parser `src/lib/agent/schedule.ts` (cron, every N, daily, weekly, monthly, event-relative, plain-English description; unreadable schedules park, never +24 h), `schedule-db.ts` (upcoming bookings/events), worker `runtime.ts:374-378`, creation `actions.ts:113-115`, provider routines page. Spec `tests/foundation/routine-schedule.spec.ts` 9/9 (no runs, no model calls). Backfill `scripts/agent/backfill-routine-schedules.mjs` dry run: 5 changes — **apply pending owner** (puts demo routines on real cadence, e.g. ~48 SLA-monitor runs/day).
- Fixed: opening a notification switches to the target's workspace (active members only), and deleted targets go to the section list (`provider/notifications/[id]/route.ts`, `shell-data.ts:22`). The list pages don't yet show a message for `?gone=1`.
- Fixed: create wizards show an owner/manager-only page for members, and create entry points are hidden (`provider/_manager-only.tsx`; venues/services/packages/bookings new; listings menu + quick actions).
- **Fixed (server paging):** `/admin/events` uses `admin_events_page(filters, sort, limit, after)` (migration 202610291052; admin `events` permission + aal2; keyset paging under featured/newest/starts/name; totals, filter lists, URL-synced filters/sort/cursor; 50 per page). DB cost ≈250 ms (was 217 ms rows + 240 ms metrics + 5,000-row load). Spec `tests/admin/admin-events-page.spec.ts` 7/7. Dev render still 3.4–4.9 s, same band as other admin pages — the < 1 s gate is judged on the production build (Q45); next cuts: drawer queries, cache `admin_overview`.
- Fixed: admin trust case titles break and end in an ellipsis with the full title as a tooltip (`trust/view.tsx:107`, `admin-b-trust.css:84-85`).
- Uploads not exercised in the browser (covered by the Q04 spec); admin mutations on excluded pages (maintenance, payouts, refunds) not run.
- Leftover fixture: empty organiser workspace `9ae14fcd-556a-4008-8ce2-a8dd3029af48` (`is_test_fixture`) + user `p1-w13-org-f6374e@gala-dock.test` — a signed contract (append-only by design) blocks deletion; goes into the owner-deferred purge (close-out step 0).
