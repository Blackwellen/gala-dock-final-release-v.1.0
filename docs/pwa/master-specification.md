# GALA DOCK — MASTER PWA PIXEL-PERFECT IMPLEMENTATION, INTEGRATION, SECURITY & RELEASE PROMPT

**Target executor:** Claude Code or GPT Codex with repository/terminal access, existing Chrome MCP or Playwright overlay tooling, Supabase project configuration, and the design-image references.  
**Priority:** Production implementation, not conceptual advice.  
**Scope:** Customer + Organizer + Provider PWA views and all supplied wizards (Appendix A); ticket checkout, ticket transfer and official resale (Section 17); shared durable Gala Agent (Section 18); shared shell/menus/communications/access control. Where corresponding Admin PWA screens, authentication, onboarding, buyer/portal pages, or shared components already exist in the repository/design inventory, preserve, integrate and regression-test them; do not silently rewrite unrelated features.  
**Definition of completion:** Every in-scope route/state exists, is functionally integrated with real application services, passes quality/security checks, and meets visual fidelity at every required responsive/orientation breakpoint, with evidence. No arbitrary green checkmarks.

---

## 0. MANDATORY OPERATING DIRECTIVE — DO THE WORK

You are the principal frontend design engineer, mobile-PWA architect, Supabase/RLS architect, payments/ticketing engineer, Agent runtime engineer, QA automation lead, accessibility engineer and authorized security tester for **Gala Dock**. Work directly in the **existing** repository. First inspect what exists; then implement, verify, fix and reverify. Do not respond with a proposed plan and stop. Do not produce demo-only mock pages, disconnected dummy forms, canned AI outputs, fake booking/payout states or screenshots that are not generated from the running app.

Use existing project conventions, infrastructure, actual design references, route architecture, database schema, services and approved patterns. Never presume particular repo paths, file names, credentials, endpoints or overlay tool APIs; discover them. Never print secrets. Never claim that a test passed if it did not execute. Never declare the task release-ready while in-scope blockers remain. Continue iterating until all pass or an objectively external blocker (credentials, approval, unavailable service, inaccessible design) prevents further progress; record that blocker precisely and finish every other unblocked item.

### Evidence and precedence

1. **Security, legal/payment-provider requirements, data ownership and enforced business invariants** outrank screenshots.
2. **Existing approved canonical architecture, domain service actions, schemas and permissions** outrank speculative UI-only behavior.
3. **Attached source specification in Appendix A and the exact Section 17/18 specifications here** define required workflows/routes.
4. **Provided PWA reference images** define visual language, hierarchy and composition except where these explicit mobile/tablet shell, accessibility or factual-correctness rules override them.
5. Design embellishments not in the source specification are **not automatically new features**. Preserve a screenshot-only feature only if it addresses a demonstrable missing requirement. Record the gap, update both the functional specification and implementation, and add tests. Otherwise render appropriate existing data without inventing business logic.

Screenshots are **visual references, not trustworthy financial calculations, invented demo records, valid timestamps or production feature definitions**. Correct arithmetic, dates, accessible layout, valid state and domain rules even if a reference image depicts otherwise. In particular, do not imitate artificially miniature screenshot typography, cramped phone-frame artifice, or decorative phone hardware/status bars inside the actual installed PWA.

## 1. FIRST PASS: INVENTORY, MAPPING AND GAP ANALYSIS

Before changing UI, inspect repository structure, branches, route tree, shell components, design reference folders, existing image assets, migrations, Supabase policies, auth/session model, Stripe/payment integration, booking/ticket engines, AI Agent orchestration, test suites and PWA configuration. Find the existing **Playwright/Chrome MCP overlay tool already built for this project**; inspect its interface and reuse it instead of inventing a replacement. If absent, create an equivalent deterministic Playwright screenshot/overlay/comparison harness and document why.

Create and maintain the following artifacts inside the repo (adapt filenames to existing conventions):

- `docs/pwa/route-state-manifest.md`: **every** sourced page ID, route, wizard step, subtab, role, capability variation, expected screenshot, implementation status, functional test status, fidelity status and QA evidence.
- `docs/pwa/design-reference-map.md`: canonical images mapped to page IDs, plus reference dimensions and screenshot crop rules. Never guess which design belongs to which route.
- `docs/pwa/spec-vs-design-gaps.md`: missing specification, screenshot embellishment, accepted changes and explicit exclusions.
- `docs/pwa/integration-matrix.md`: Supabase tables/views/functions/Edge Functions, RLS, domain services, Agent tools, messaging, payments and webhooks by feature.
- `docs/pwa/release-readiness.md`: evidence-based gates, failed tests, approved exceptions and residual risks.

**Minimum manifest:** Appendix A contains **95 specifically numbered Customer/Organizer/Provider page and wizard-step entries**: Customer 13 pages + 9 wizard states; Organizer 21 + 19; Provider 17 + 16. Add all five specified ticket checkout/resale steps and the five Agent views as individually tested states, yielding **at least 105 named targets**, before expanding capability variants, subtabs, overlays, transfer controls, admin shared integrations and responsive screens. Do not misinterpret `/[workspace]/agent` as a literal public URL. Map it to legitimate concrete customer/organizer/provider/admin destinations as appropriate. Include direct deep-link and refreshed-page test cases.

Use the exact source appendix to build a machine-checkable route manifest. Account for pages already implemented; do not build duplicates. Create a task checklist per route with **visual / functional / backend / auth-RLS / Agent / responsive / accessibility / performance / test** columns. Work in batches, commit or checkpoint tested progress, and keep the status current rather than declaring completion in bulk.

## 2. EXACT MOBILE & TABLET SHELL — NON-NEGOTIABLE OVERRIDE

**EVERY Customer, Organizer and Provider PWA primary app shell on phone and tablet uses exactly five fixed bottom-navigation options: four primary destinations and a rightmost hamburger labeled `Menu`.** Do not copy sidebar layouts or a five-direct-link reference image when it conflicts with this rule. No sixth button, no hidden inaccessible destination, no double navigation bar. On large desktop, preserve the approved desktop navigation/shell unless explicitly configured otherwise.

- **Organizer bottom bar:** `Home | Events | Calendar | Marketplace | Menu`. The remaining organizer destinations (`Sales`, `Tickets & Promotion`, `Team`, `Money`, `Gala Agent`, `Settings`) live in the Menu sheet; ensure all other unique paths, records, tools and account actions are discoverable.
- **Provider bottom bar:** `Home | Bookings | Calendar | Listings | Menu`. Include `Opportunities`, `Team`, `Money`, `Gala Agent`, `Settings` and missing capabilities in Menu. `Listings` adapts to Venues / Spaces / Services / Packages while sharing one Provider workspace.
- **Customer bottom bar:** `Discover | Plan | My Events | My Tickets | Menu`, with `Saved`, `Messages`, `Notifications`, `Reviews`, `Account`, security/help and other otherwise-missing consumer destinations in Menu. **No customer sidebar.** Keep consumer visual tone warmer/marketplace-oriented, not a business dashboard.
- **Admin PWA where already present:** four role-appropriate primary actions plus rightmost Menu; map other Admin sections from existing approved admin shell and use the same bottom sheet. Admin security/permissions are never reduced for UI convenience.

The rightmost Menu button opens a **true mobile/tablet bottom sheet**, not an off-canvas side drawer: anchored at bottom, rounded upper corners, visible drag handle, safe-area-aware, properly layered above the fixed bar, **dismissible** by Close button, Escape, backdrop tap and permitted swipe-down, with focus management, scroll lock and return focus. The sheet contains a **three-column grid** of remaining navigation options with uniform accessible icons and readable labels; underneath is an explicit `Create` section with every permitted creation workflow, including options hidden from the header `+ Create` on narrow screens. Include workspace switcher, role-relevant preferences/account/help as appropriate. Display access-limited items according to server-derived permissions, do not leak secret records. Do not make the grid icons so small that they fail touch accessibility; scroll inside the sheet when needed. Use one consistent Menu behavior across phone/tablet portrait and landscape.

The top bar uses the **Gala Dock circular favicon/symbol alone in the far-left logo position — no `Gala Dock` wordmark there**. Keep a compact role-aware workspace switcher for business accounts and relevant controls: search, communications/message bubble, notifications, optional `+ Create`, help where space allows, avatar. If space is tight, collapse controls into the designated top actions/Menu rather than causing overflow; all actions remain reachable. Conversation messaging and Gala Agent chat remain separate; no accidental blending of user conversations with AI agent sessions. Keep the shell and tab state consistent across nested routes, wizards and back navigation.

Account for bottom safe areas, `100dvh`, `env(safe-area-inset-*)`, on-screen keyboard, input focus, status-bar/browser chrome resizing and scroll restoration. The fixed nav must not obscure the last card, form controls, CTAs, modal footers or ticket QR code. The main content scrolls independently; fixed chrome must not move unexpectedly. Ensure landscape and tablet work with minimal-height viewports. Sticky elements must not overlap or trap content. Avoid redundant persistent floating CTAs when they collide with nav/keyboard.

## 3. DESIGN IMPLEMENTATION — MEASURABLE 1:1 FIDELITY

Match supplied screen references in content hierarchy, fonts and type scale, line height, color, spacing, card radii, strokes, shadows, icon weights, image crops, charts, tabs, filters, dashboards, forms, row density, visual states and alignment **except** for explicit bottom-sheet/nav corrections or required responsive accessibility adaptation.

Retain the overall Gala Dock premium bright-white, light-neutral, navy and electric/royal-blue visual system with restrained green/amber/red/purple semantic accents. Ensure a consistent shared spacing/type/token system. Do not build separate inconsistent one-off CSS for each PWA page. Reuse existing approved components and design tokens; repair shared primitives once rather than scattering magic numbers.

**Pixel-fidelity test method:**

1. For every in-scope page/state and reference, start the real running app and load a deterministic, scoped test fixture with stable locale, font loading, images, timestamps and data. Capture the same intended view at the same reference viewport dimensions and pixel ratio; crop design-only outer phone frames, hardware notch and status bar out of the reference to compare the actual app surface.
2. Use the discovered Playwright/Chrome MCP overlay tool to produce `reference`, `actual`, `50%-blend overlay`, `diff heatmap`, and layout diagnostics. Capture test date/time and commit hash.
3. Compute a normalized visual error on **stable, relevant app regions**. Target **≤5% reference-vs-rendered visual mismatch** under the approved comparison metric (record exact metric/masking); additionally use bounding-box differences for header, nav, tabs, cards and primary actions. A rough subjective “looks 95% close” is not a passing measurement. Do not simply mask whole pages, reduce image quality, apply global scale transforms, or hide mismatches.
4. Treat photo/canvas/video/dynamic external-map differences separately by matching crop, bounding box, aspect ratio, presence and typography overlaid on media, not by pretending third-party pixels will match exactly. Mask only inherently nondeterministic zones and report masked proportion and reason. Evaluate both full-page and visible-screen captures; screenshot fidelity must not force inaccessible 6px fonts.
5. Iterate inspect → adjust → capture → compare → retest until each page passes. Preserve screenshots and machine-readable results under test artifacts. If an image is missing or reference is not available, use closest approved shared shell and documented high-quality design standards, **never claim a 5% reference comparison without a reference**.

Zero visual defects is the acceptance target: no clipping, unintentional horizontal page scrolling, ellipsis of critical dates/prices/actions, overlapping chart legends, overflow beyond card edges, unreadable text, broken word wrapping, ghost buttons, inconsistent bottom bars, blurry scaled text or broken SVG/icons. Avoid using `overflow-x:hidden` to conceal a layout defect. For wide comparison tables, seat maps and deliberate timelines, provide a clearly signposted internal horizontal scroll, accessible alternative or card-layout conversion while preventing **page-level** overflow.

## 4. RESPONSIVE, ORIENTATION, DENSITY, ZOOM AND ACCESSIBILITY MATRIX

Create tests for representative narrow Androids, iPhones, small/tablet screens, iPads and laptop/desktop. **Minimum CSS viewport widths:** `320, 344, 360, 375, 390, 393, 412, 430, 480, 600, 640, 744, 768, 800, 820, 834, 900, 1024, 1180, 1280, 1440, 1600` where applicable. Include unusual short-height screens. Test **portrait and landscape**, with representative DPR `1, 2, 3`, both mobile emulation and actual browsers/devices if available. Include browser zoom `80%, 100%, 125%, 150%, 200%`, and WCAG reflow/text scaling to `200–400%` where appropriate. Test iOS WebKit/Safari, Chromium/Android Chrome and Firefox, plus installed PWA mode where testable.

Use orientation-specific layouts, not merely rotated narrow columns. Small landscape requires collapsible header, bottom sheet with internal scrolling and accessible CTA. Tablet landscape can use multi-column main content, but retains the **same five-item bottom navigation** and bottom-sheet menu. Long 3–8-word titles, localization, GBP/EUR/USD number formatting, dates, large currency values, dynamic card counts, zero data and error state must all reflow gracefully. Touch hit areas generally ≥44×44 CSS px, focus-visible, keyboard support, reduced-motion behavior, sufficient contrast, semantic labels and live-region announcements. Target WCAG 2.2 AA; document independently audited exceptions.

Responsive test script assertions include: `document.documentElement.scrollWidth <= viewport width + tolerance` except intentionally scrollable subregions; visible/hittable primary CTAs; correct fixed-nav item count; bottom sheet 3-column grid and close behavior; viewport-safe modal footers; no overlapping tap targets; screenshots; console errors; failed requests; hydration mismatch; accidental duplicate actions; visual error scores; accessibility audit.

## 5. PREMIUM MULTI-STEP WIZARDS — EVERY STEP IS A SCREEN

**The supplied wizards are NOT optional merely because individual reference images do not exist.** Build all wizard routes/`?step=` variants from Appendix A, plus Section 17 checkout/resale steps, with the same premium design language as their destination workspace. Use a canonical shared wizard scaffold that adapts across customer, organizer, provider and checkout audiences, not one generic ugly form. Each wizard step has a specific page title, brief, progress bar/numbered stepper, concise instructions, correctly grouped inputs, contextual helper, authoritative validation, back/continue, save/resume/draft behavior if supported, review before commitment and clear exit/re-entry.

Preserve step state across browser refresh, back/forward, session/auth redirect and device rotation. Use server-side ownership checks and idempotent creation. Prevent step skipping for required validation while permitting return to prior steps. Validation should identify exact fields and relevant domain blockers, not just toast “something went wrong.” Form controls must be keyboard- and touch-friendly, with mobile date/time pickers, money/currency fields, timezone and consent semantics. Connection, upload and payment steps must show real pending/failed/success states.

All page-specific agents inside wizards can only **suggest, draft, prefill or explain** according to policy; they do not silently submit quotes, publish pages, book providers, spend money, change sensitive access or sell tickets. Never use generic fake Agent response text as a substitute for real integrated tools. Add draft autosave with debounce and race protection where supported. Test every step transition and the final source record created from it, including duplicate-submit, stale data, validation, tab abandonment and retried network requests.

## 6. SUPABASE, AUTHORIZATION, REAL-TIME AND DOMAIN INTEGRATION

Use the **existing Supabase project** and established service layer. Inspect migrations and RLS policies before adding schema. Prefer typed clients and server-side domain services/actions for all writes. Every route fetches only authorized real records; every write enforces authentication, workspace membership, capabilities, role, ownership, current lifecycle state and source-specific business invariants **on the server**, even when the UI disables controls. Use optimistic UI sparingly and reconcile from authoritative event/payment/booking state; roll back on failure. Never trust `workspace_id`, `user_id`, cost, event ID, quote status or Agent authority merely because the browser supplies it.

Necessary integrations across the manifest: customer identities and saved data; canonical event IDs shared between consumer and organizer; marketplace listings and provider capability type; venue spaces/maps/booking rules; request, quote and hold states; booking conflict/capacity logic; event planning/guests/ticketing; organizer sales/proposals/invoices; provider staff assignments; comms, notifications and attachments; Stripe-supported payments, fees and payouts; Agent runs/schedules/approvals. Reuse Stripe's actual transaction states, never impersonate escrow, make unapproved held-funds claims or mutate an accepted/issued financial snapshot in place. Maintain linked records, immutable commercial versions, audit trails, effective policy versions and dependable lifecycle transitions.

Required protections: strict Supabase RLS across all tables/storage; server/Edge Function secret isolation; least-privilege service-role usage; secure signed upload/download access; storage type/size scanning where supported; rate limiting; idempotency keys and uniqueness constraints; replay-safe webhooks; validated redirect URLs; CSRF protections appropriate to auth/session strategy; safe file rendering; and transaction/ledger consistency. Use Realtime only for appropriate scoped updates and clean up subscriptions on navigation/unmount; handle reconnection and stale updates gracefully.

**Cross-domain state acceptance checks:** no unapproved oversell; no double-booked hard-conflicting space/staff/equipment; no expired request acceptance without requester action; `No response` remains distinct from `Declined`/`Unavailable`; original quote versions remain recoverable; accepted quote/booking copies are immutable snapshots; historical bookings survive listing/capability pause; only supported financial actions transition funds; consumer → organizer conversion preserves canonical event ID; event/ticket/currency/timezone calculations remain consistent.

## 7. SECTION 17 — CHECKOUT, TRANSFER & OFFICIAL RESALE: COMPLETE WORKFLOWS

**Checkout canonical route:** `/checkout/[event]?step=1|2|3` — no duplicate checkout flows per event type, promoter source or device. Preserve promoter/placement referral attribution through sign-in/register, redirects, inventory hold and payment confirmation using signed/validated context. Show final all-in price, tax/fee breakdown, ticket-tier/section availability, accessible seating inventory, quantity limits, valid promo codes and clear terms before payment.

**BUY-W01-01 — Tickets:** event identity; ticket tiers and sections; quantity steppers; actual live inventory; remaining/limit states; accessibility inventory without exposing private disability details; optional mapped-seat selector using the approved venue/organizer map; fees and promo code; back-to-event and clear CTA to step 2. Enforce order limits and live capacity server-side. An on-screen price update must reflect actual server-approved pricing, never screenshot numbers.

**BUY-W01-02 — Attendee Details:** verified buyer contact if available, optional account/sign-in; explicit fields for required attendee names, organizer questions and legitimately necessary accessibility/dietary information; consent and privacy handling; prefill only known permitted fields; manual correction; field-level validation. Persist reservation/return intent through auth and allow a safe retry if inventory expires.

**BUY-W01-03 — Pay & Confirm:** accurate order summary, total fees, policies, card/payment method via supported provider-hosted elements, reservation expiry countdown, acknowledgment of cancellation/refund terms, payment authorization, pending confirmation and idempotent success. Payment provider webhook/source-of-truth determines payment success, ticket creation and entitlement issue, **not** optimistic browser redirect. Expired holds release inventory. Handle declined card, SCA/3DS, wallet/payment-method compatibility, network drop, closed browser, webhook delay, double click, payment reversal and sold-out racing safely. Provide an accessible receipt, verified order success and My Tickets deep link. No autonomous Agent spending.

**Ticket transfer (necessary shared flow not given its own numbered wizard):** implement/verify the existing Ticket Detail transfer action and an accessible modal or compact wizard; validate organizer policy, eligibility/window, recipient verification, transfer acceptance, signed token expiry, one-time transition, lock against simultaneous resale/transfer/scan and complete audit. Transfer revokes or rotates the original bearer credential atomically and issues the valid recipient entitlement only on authorized completion. No speculative resale marketplace.

**BUY-W02-01 — Resale Eligibility & Price:** `/account/tickets/[id]/resale?step=1`. Show real owned ticket, eligibility and event resale window, face value, maximum allowed price/fees, seller amount and payout destination readiness. Determine caps/policies from authoritative event/jurisdiction/configuration; do not invent universally applicable legal caps. Refuse ineligible, already transferred, scanned, refunded, disputed, charged-back, or already-listed states as policy dictates. Explain reason and support path.

**BUY-W02-02 — Review & List:** `/account/tickets/[id]/resale?step=2`. Show exact asking price, relevant fees, estimated net proceeds, listing visibility, seller responsibilities, payout state and consequences. Require explicit confirmation and authenticated owner. On **listing**, preserve original entitlement's accurate policy-defined status (e.g. suspended while listed, if that's the implementation rule); on **completed resale**, atomically revoke the original scan credential/entitlement and issue the replacement ticket to the actual buyer. Revalidate ownership/status/window at execution time. Idempotent concurrency controls prevent double selling and conflicting transfer/scan, and settlement follows supported payment-provider flow.

Across all five named wizard states + transfer UI, test successful/failed flows, concurrent buyers, hold expiration, promo edge cases, auth redirects, accessibility, chargeback/refund aftermath, webhook retries, strict order ownership and attempted direct object-ID access. Agent may explain steps and policies but cannot purchase, list or transfer without the user's explicit action.

## 8. SECTION 18 — ONE DURABLE GALA AGENT, ROLE-SCOPED TOOL DEPTH

**Do not spawn separate unrelated chatbot implementations.** Use one established durable Agent orchestration/runtime and one shared approval/audit primitive. Presentation and tools adapt:

- **Customer:** Gala Planner sidecar, conversational guided event setup/search/build/budget/reminders/booking help, subject to explicit commercial authorization.
- **Organizer:** full cross-event sales, marketplace procurement, tickets, promotion, team, operations, money, records and follow-up tools with durable multi-step runs and external waits.
- **Provider:** venue tools and service tools depending on capability flags, with shared opportunities, pricing, holds, delivery, calendar, staffing/equipment, bookings, money, BEO and response-SLA routines.
- **Admin:** operational triage and tool-health integrations only, role-locked, with no bypass of payments, privacy, trust adjudication or human authorization.

**AG-001 Work** (`/[workspace]/agent` resolved to actual authorized routes): goal composer, scope (workspace/event/provider/bookings/tickets/promotion/team/money), files/context, restrictions, daily/individual spend budgets, completion criterion, active durable runs, stage/progress, next wake time, external wait reason, pending approvals, commitment exposure, and audited actions for start/pause/resume/cancel/open. Empty states, retry failures and scope-inaccessible states must work.

**AG-002 Run Detail** (`/[workspace]/agent/runs/[id]`): structured plan/statuses/parallel branches, results, activity, outputs, retries, errors, next wake and immutable changes ledger including sources, sent messages, created records, financial exposure and reversibility. Never expose model hidden chain-of-thought. Use idempotent domain actions for retries; cancellation does not erase audit. Run states persist across server restarts/navigation and wake on schedules/events/approval/replies via existing queue/scheduler.

**AG-003 Routines** (`/[workspace]/agent/routines`): Active, Paused, Suggested; natural-language schedules or conditions; scope, per-run/daily budget, tool allowlists, notification rules, permission/approval mode, last/next run and outcomes. Offer repeat-work suggestions only after explicit opt-in. Use durable jobs, not an unvalidated browser timer. No new visual node editor.

**AG-004 Approvals** (`/[workspace]/agent/approvals`): Pending/Resolved; exact proposed action, record, before/after preview, justification/evidence, recipients, cost/spend, policy, expiration, authorizer identity, immutable audit and material-group batch approval. Validate authorization **again at approval/execution time**, expire stale approvals, reject cross-workspace approval, no self-approval bypass. Default human approval for spending, payments/refunds, contract/signature, major messages, publishing, price/inventory changes, cancellations/deletion and sensitive permissions; policy exceptions only where existing compliant governance actually permits.

**AG-005 History** (`/[workspace]/agent/history`): Completed/Cancelled/Failed with filter by event/provider/booking/promotion/date/person/routine, result summary, waits/duration, steps/actions, final outcome, change audit and rerun-as-new-goal that revalidates all assumptions.

**Agent trust boundaries:** every AI tool goes through the **same domain service validation, RLS/membership checks and policy controls as manual UI actions**. Never grant the model the Supabase service-role credential or direct arbitrary SQL privileges. Guard against prompt injection from user messages/listings/files/URLs, tool-output instruction hijacking, exfiltration, unauthorized external sends, unbounded recursive loops and token/cost runaway. Set budget caps and quotas, auditable tool schemas, event scope, explicit allowed destinations, approvals and kill switch. Use actual metering/credit logic if repo supports it. Test simulations with capped spend; never test high-impact Agent actions against live customer money or live broadcast targets without authorization.

## 9. SHARED TOP-BAR COMMUNICATIONS AND NOTIFICATIONS

Create or repair the message bubble, notification bell/count, responsive search, `+ Create`, avatar and workspace switcher within the standard header for every eligible role. The message bubble opens human threads in a sheet/panel sized for mobile portrait/landscape; messages need search, correct participants, unread state, booking/event context, attachments and secure real-time update handling. Notifications distinguish informational vs actionable approval/booking/ticket events, navigate to canonical records, have read/seen state and appropriate preferences. The Gala Agent entry opens the **separate** Agent experience and passes only authorized context. Do not expose full private conversations in Admin merely because a design shows a communication widget.

## 10. COMPLETE FUNCTIONAL AND SECURITY TEST BATTERY

Run tests using **authorized test identities and isolated staging/test payment environments**. Never execute destructive penetration probes, payment captures, broadcasts or mass messages against live customer accounts. Define and execute a role matrix for anonymous, customer, organizer owner/admin/member, provider venue-only/service-only/mixed owner/member/scoped staff, platform support/admin and suspended/revoked users.

**Automated tests required:** typecheck, lint, unit, service and DB integration, route smoke, Playwright E2E, multi-step wizard, accessibility (axe or established runner), visual regression, PWA install/offline behavior, permission gates, Agent tool contract, payment webhook replays, ticket concurrency, messaging and cross-role navigation. Run existing tests before and after implementation; do not conceal existing failures.

**Authorization / pentest focus (OWASP ASVS L2 / Web & API Top 10 relevant controls):** horizontal/vertical IDOR/BOLA; cross-tenant Supabase RLS read/write and Storage access; inviting/deactivating final owner; forged workspace switches; insecure direct deep links; SSRF via integrations; malicious uploads and content injection; XSS in chat/media/listing titles; CSRF/session fixation where applicable; open redirects on login/checkout; refresh-token/session handling; rate-limiting/auth enumeration; Agent prompt-injection/permission escalation; SQL injection through RPC/search filters; signed webhook forgery and replay; inventory oversell; manipulated server totals or client coupons; double settlement; transfer/resale replay; stale approvals; overbroad support/admin reads; consent-based messaging and data minimization. Use safe test vectors only. Document the exact test, expected behavior, observed result and fix.

**UI functional sweeps:** every menu item and Create option routes to correct accessible page/wizard; page breadcrumbs/back; all subtabs; empty/loading/error/success; pagination and saved filters; keyboard and touch; all modal/drawer/popover dismissal and focus traps; every action updates the corresponding canonical source and visible dependent surfaces; consistent money arithmetic; timezone and locale; share/export; open external map/calendar/wallet only when supported; refund cancellation previews and policy gates. Put the business-invariant checks in server tests, not solely browser tests.

**Security release claims:** a self-run test suite is **not** equivalent to an independent certified penetration test. Report internal testing truthfully, supply findings and retest evidence, and flag independent expert assessment as an external release prerequisite if the risk/compliance process requires it. Never claim `penetration-tested`, `PCI certified`, `legally compliant`, or `release ready` merely because the code compiles.

## 11. PWA PERFORMANCE, RESILIENCE AND PRODUCTION READINESS

Keep or repair web app manifest, icons/splash, install prompts where supported, offline shell, safe caching, service-worker versioning, update flow, deep-link handling, application routing, notification permission and secure push support where implemented. **Do not allow offline checkout payment, resale listing, booking confirmation, approval or financial mutation to appear successful**; display offline state and resume/revalidate online. Handle very slow/failed mobile networks and exhausted sessions predictably.

Optimize Core Web Vitals and real device memory: image width/srcset and lazy loading, font subsets and `font-display`, only necessary client components, route chunking, virtualized very long records, correctly memoized charts, no excessive Realtime listeners, limited animation and graceful GPU fallback for maps/media editors. Test multi-minute navigation without growing listeners, timers or memory. Screens must remain responsive on mid-range mobile hardware and high-DPR displays.

Review environment/security settings, CSP, error reporting, log redaction, feature flags, Sentry/observability if existing, audit retention, backup/rollback paths, migration safety, webhook routing and deployment preview/staging. Do not assume Vercel/Supabase credentials or endpoints. Run a production build and test the preview/staging deployment whenever authorized infrastructure is available.

## 12. MANDATORY WORK ORDER AND QUALITY GATES

**Phase A — Discover:** map sources, 105+ named targets, reference images, existing routes/DB, risk, and overlays. Produce gap matrix.

**Phase B — Shell:** fix standardized top bar and exact five-item mobile/tablet bottom bars, role-aware Menu bottom sheet, three-column grid, Create section, messaging/notifications and safe areas. Prove orientation and size compatibility before applying it everywhere.

**Phase C — Shared primitives:** audited design tokens, responsive cards/tables/chart layouts, tabs, wizard scaffold, advanced filters, error/empty/loading, app search, message/agent panels, file uploads, permissions, money formatting.

**Phase D — Page-by-page build:** Customer, Organizer and Provider sourced pages and every wizard step in Appendix A; correctly adapt venue/service/mixed capabilities. Implement checkout, transfer and official resale. Build the five Agent experiences with real backend integration and approved depth.

**Phase E — Connect/test domain flows:** Supabase, RLS, service validation, Stripe/payment provider, ticket inventory, booking, maps, communications, jobs, Agent. No dummy data in final production runtime.

**Phase F — Per-page overlay loop:** all references; fix until ≤5% visual difference on approved stable regions and zero critical layout defects. If baseline image doesn't exist, verify against approved shared visual system and document absence rather than inventing a score.

**Phase G — Size/orientation/a11y/security:** comprehensive mobile/tablet portrait and landscape, keyboard/zoom/DPR, WCAG AA, safe pentest, data integrity and concurrency.

**Phase H — Release gate:** production build, staging deployment check, regression, error and audit logs, migration review, security triage, clear final scorecard and reproducible artifacts. Do not finish or say “done” until every unblocked target is green across the gate matrix.

If context window or execution budget is nearing exhaustion, leave a complete, precise progress report/checkpoint, commits and next actions **rather than falsely completing**. Resume subsequent runs from the manifest without resetting or rewriting validated work. Avoid endless cosmetic tweaking of one page while other screens remain unimplemented: work in accountable batches, prioritizing hard blockers and high-risk flows. All unresolved P0/P1 issues block release; lower-priority approved exceptions must be explicitly documented.

## 13. REQUIRED FINAL ENGINEERING REPORT

Provide compact but rigorous evidence with: branch/commit hashes, implementation summary, exact counts of pages/states/wizards completed vs sourced, linked route matrix, reference image/overlay counts and measured mismatch, breakpoints/orientation/zoom combinations tested, execution logs of unit/integration/E2E/security/a11y, permission matrix, Agent run/approval test cases, real sandbox checkout/refund/transfer/resale and webhook outcomes, production/staging build result, P0–P3 defect list, changes to spec caused by accepted screenshot gaps, deployments/migrations, open external blockers and truthful **GO / NO-GO** decision.

Do not claim that a page is complete because it rendered once; it is complete only when its visuals, controls, data, lifecycle, responsive states and security are all tested. Preserve original IDs/routes. Avoid extending this task to unrelated feature ideas, generalized marketing automation or extra workspace products.

---

## 14. ADJACENT PWA SURFACES FROM THE LARGER PROJECT — DO NOT OMIT

The source appendix concentrates on sections 9–14. The broader Gala Dock project also has separately supplied sections 7–8 (authentication/onboarding), 15 (Admin), 16 (public/portal surfaces) and 17–18 (checkout/Agent). **Include these in the project-wide PWA discovery and regression coverage** whenever the source pages, route implementations or visual designs are present in this repository/project. Do not infer a missing portal route from a title. If source-specific designs and requirements are available, their target visual/fidelity/functional gate is exactly as strict as for Appendix A. If they are not accessible, list the missing source clearly and do not invent page details or claim a quantified reference match.

Known canonical entrypoints to verify and preserve:

- **Authentication (8):** `AUTH-001 /login`; `AUTH-002 /register`; `AUTH-003 /verify-email`; `AUTH-004 /forgot-password`; `AUTH-005 /reset-password`; `AUTH-006 /mfa`; `AUTH-007 /invite/[token]`; `AUTH-008 /access`. Preserve return intent through checkout, invite, portal and workspace journeys; never let Gala Agent bypass deterministic auth.
- **Onboarding (10):** `ONB-001 /onboarding`; `ONB-CU-01 /onboarding/customer?step=1`; `ONB-ORG-01` to `ONB-ORG-04` at `/onboarding/organizer?step=1..4`; `ONB-PROV-01` to `ONB-PROV-04` at `/onboarding/provider?step=1..4`. Single identity; Customer is not a business workspace; Provider may activate Venue, Services or both.
- **Admin (18):** `AD-001 /admin`; `AD-002 /admin/users`; `AD-003 /admin/users/[id]`; `AD-004 /admin/workspaces`; `AD-005 /admin/workspaces/[id]`; `AD-006 /admin/events`; `AD-007 /admin/marketplace`; `AD-008 /admin/marketplace/listings/[id]`; `AD-009 /admin/tickets`; `AD-010 /admin/commerce`; `AD-011 /admin/commerce/transactions/[id]`; `AD-012 /admin/trust`; `AD-013 /admin/support`; `AD-014 /admin/support/[id]`; `AD-015 /admin/partners`; `AD-016 /admin/agent-integrations`; `AD-017 /admin/analytics`; `AD-018 /admin/settings`. Verify admin PWA shell if present, audit permission and reasons for interventions, keep Trust/Support distinct, never expose private chat or raw payment instruments without an approved tightly scoped process.
- **Public and portal experiences (Section 16):** discover routes and named page specs from the actual project documents/repo; include public event, ticket purchase/success, customer/guest entrypoints, provider/organizer shared links and secure token views only where canonical and actually specified.

Thus **105 targets is the floor for the materials embedded in this file**, not a limit on the larger product: the known Auth/Onboarding/Admin entrypoints add **36 more named screen/states**, or **141** before separately specified public/portal pages, hidden tabs, drawers and capability variants. Do not invent reference images for unpictured states. Production release audit must account for every actual PWA route discovered, whether named here or not.

---

## APPENDIX A — CANONICAL SOURCE SPECIFICATION: CUSTOMER / ORGANIZER / PROVIDER PAGES AND WIZARDS

The following source was supplied for this task. It is **normative** for page-specific fields, purposes, steps, actions, integrations and lifecycle requirements. Execute all IDs. Where this appendix and main instruction overlap, obey the precedence rules above. Do not remove or summarize away the source during implementation.

```text
9. Customer App - top-bar consumer experience
Customer navigation: Discover | Plan an Event | My Events | My Tickets | Saved | Messages/Notifications | Avatar. No sidebar. The experience must feel like a premium marketplace and planning product, not professional back-office software.
CU-001 Discover
Route: /discover
Purpose: Browse events, venues and event services from one consumer search surface.
Views / sub-tabs: Events | Venues | Services; List | Cards | Map where geographically relevant.
Page composition and component behaviour: 
•	Large destination/date/category search with quick occasion chips and current-area option when permission is granted.
•	Event cards show artwork, date, venue, price, category and social proof; venue/service cards show availability mode, starting price, reliability and booking mode.
•	Build an event with this action can seed a new Event Build from a venue or service listing.
Primary actions and lifecycle controls: Open listing; save; follow; start event; buy tickets.
Drawers, popovers, chat and widgets: Advanced filter drawer; map/list switch; save/follow popovers.
Logic flow and state integrity: Ranking combines relevance, availability, reliability, verification, fit and disclosed sponsored placement.
Cross-integrations: Marketplace, events, ticketing, saved, promotion inventory.
Gala Agent behaviour: Can convert natural-language intent into filters and a suggested event build.
Consolidation decision: One discovery surface supports ticket buyers and event planners.
CU-002 My Events
Route: /account/events
Purpose: Show consumer-created events and readiness without professional workspace complexity.
Views / sub-tabs: Upcoming | Past | Drafts.
Page composition and component behaviour: 
•	Cards show type/date/location, readiness, confirmed/pending providers, current package cost, amount paid/due and next required action.
•	Professional-conversion suggestion appears only when complexity makes Organizer mode useful.
Primary actions and lifecycle controls: Continue planning; create event; duplicate; cancel/archive subject to booking rules; switch to professional management.
Drawers, popovers, chat and widgets: Next-action drawer; cancellation impact summary.
Logic flow and state integrity: Cancellation never bypasses provider terms/payment protections; professional upgrade preserves the canonical event ID.
Cross-integrations: Customer events, bookings, payments, Agent.
Gala Agent behaviour: Summarises blockers and proposes the next planning action.
Consolidation decision: Consumer events remain the same canonical Event records used by Organizer mode.
CU-003 Customer Event Profile
Route: /account/events/[id]
Purpose: Operate one consumer event through a guided low-complexity record.
Views / sub-tabs: Build | Plan | Guests & Tickets | Money | Messages.
Page composition and component behaviour: 
•	Header shows event type, date, location/venue state, guests/capacity, readiness, budget and status.
•	Build is the visual package canvas with confirmed, pending, held, backup and standby items.
•	Plan contains timeline, checklist, provider milestones and day plan without professional run-sheet depth.
•	Guests & Tickets handles invitations/RSVP and simple free/paid ticketing; it may use a venue-provided seat/zone map but does not expose professional layout editing.
•	Money shows estimated/held/confirmed/paid/due/refundable amounts. Messages groups human provider/venue conversations.
Primary actions and lifecycle controls: Add/replace provider; send enquiry; accept quote; pay; add backup; sell simple tickets; invite guests; upgrade to professional.
Drawers, popovers, chat and widgets: Provider compare; booking terms; payment drawer; response clock; Gala Planner sidecar.
Logic flow and state integrity: Dependencies prevent premature commitment when venue/date is unresolved; provider items move Suggested -> Requested -> Held -> Confirmed -> Delivered/Cancelled.
Cross-integrations: Marketplace, booking protection, ticketing, payments, messages, Agent.
Gala Agent behaviour: Guides the build, warns about missing essentials/budget/deadlines and can execute low-risk planning actions with approval.
Consolidation decision: Five consumer tabs absorb the old page sprawl.
CU-004 Event Build Canvas
Route: /account/events/[id]/build
Purpose: Provide the premium visual assembly surface for building the event package.
Views / sub-tabs: Category rail | Build canvas | Budget/readiness rail.
Page composition and component behaviour: 
•	Category rail adapts to event type: Venue, Food, Drinks, Entertainment, Media, Styling, Staff, Production, Hire and Extras.
•	Central canvas uses sharp composable booking cards showing provider, package, time, availability state, response deadline, price, backup/standby status and dependency.
•	Right rail updates estimated/held/confirmed spend, budget remaining, readiness and missing essentials.
•	Drag/reorder affects package composition and priority only; booking commitments always require explicit actions.
Primary actions and lifecycle controls: Search category; add option; request; hold; replace; mark backup; compare; remove uncommitted item.
Drawers, popovers, chat and widgets: Listing quick-view; compare drawer; hold terms; dependency explanation.
Logic flow and state integrity: Venue/date foundation gates dependent bookings when configured; time/travel/capacity/requirement conflicts are checked before request/payment.
Cross-integrations: Marketplace, event types, availability, payments, Agent.
Gala Agent behaviour: Can assemble a recommended package to budget and explain trade-offs.
Consolidation decision: This is a planning canvas, not a generic shopping cart.
CU-005 Customer Event Plan
Route: /account/events/[id]/plan
Purpose: Turn the package into a simple planning timeline and day-of sequence.
Views / sub-tabs: Timeline | Checklist | Day Plan.
Page composition and component behaviour: 
•	Recommended schedule adapts to notice period, event type and providers; 4-6 week guidance appears when useful but never blocks short-notice events.
•	Checklist includes final guest count, menu choices, access, confirmations and remaining balances.
•	Day Plan merges provider arrival times and customer milestones into a readable sequence.
Primary actions and lifecycle controls: Complete task; request detail; move date; share plan.
Drawers, popovers, chat and widgets: Task drawer; provider milestone drawer.
Logic flow and state integrity: Moving the event date triggers availability-impact analysis before any booking change is sent.
Cross-integrations: Bookings, calendar, notifications, Agent.
Gala Agent behaviour: Recalculates next best actions and can chase missing non-sensitive information.
Consolidation decision: Consumer planning stays guided; professional operations stay in Organizer.
CU-006 Customer Guests & Tickets
Route: /account/events/[id]/guests-tickets
Purpose: Manage invitations/RSVP and simple event ticketing.
Views / sub-tabs: Guests | Tickets | Check-in.
Page composition and component behaviour: 
•	Guest list supports invitation status, RSVP, plus-one, dietary/accessibility notes and contact preference.
•	Simple ticketing supports free/paid tiers, capacity, sale dates, basic promo codes, transfer and official resale.
•	Venue-provided seating sections may be used; advanced seat inventory/layout editing remains Organizer functionality.
•	Mobile QR scan and manual lookup support small-event check-in.
Primary actions and lifecycle controls: Invite; create ticket tier; publish sales; transfer; official resale; check in.
Drawers, popovers, chat and widgets: Guest detail; ticket tier editor; refund/transfer modal.
Logic flow and state integrity: Ticket capacity cannot exceed approved venue/event capacity; transfer/resale invalidates the original entitlement.
Cross-integrations: Ticketing, venue map, payments, communications.
Gala Agent behaviour: Can recommend simple tiering/capacity and flag oversell risk.
Consolidation decision: Customer ticket selling is allowed without making Organizer redundant.
CU-007 Customer Event Money
Route: /account/events/[id]/money
Purpose: Make the full event package financially understandable.
Views / sub-tabs: Overview | Payments | Refunds.
Page composition and component behaviour: 
•	Budget separates estimated, held, confirmed, paid, due and refundable amounts.
•	Provider rows show service value, deposit, standby fee, payment state, protection state and expected milestone.
•	Cancellation/refund preview explains likely consequences before action.
Primary actions and lifecycle controls: Pay due amount; open receipt; request eligible refund; review cancellation impact.
Drawers, popovers, chat and widgets: Payment drawer; terms modal; dispute/help entry.
Logic flow and state integrity: UI reflects payment-provider states accurately and never claims unsupported custody of funds.
Cross-integrations: Payments, bookings, support, receipts.
Gala Agent behaviour: Forecasts remaining event cost but cannot autonomously authorise spend.
Consolidation decision: One consumer money page replaces invoice/deposit/refund sprawl.
CU-008 Customer Event Messages
Route: /account/events/[id]/messages
Purpose: Centralise human communication for one event without mixing Gala Agent.
Views / sub-tabs: All | Venue | Suppliers.
Page composition and component behaviour: 
•	Threads are grouped by booking/provider and can show required booking-response deadlines.
•	Composer supports attachments, booking references and practical event-message templates.
Primary actions and lifecycle controls: Send; attach; open booking; escalate support.
Drawers, popovers, chat and widgets: Thread info; attachment preview.
Logic flow and state integrity: Response SLA applies to required booking decisions, not every chat message.
Cross-integrations: Messages, files, bookings, notifications.
Gala Agent behaviour: May draft a message, but Agent conversation remains separate.
Consolidation decision: No social-style generic inbox inside the event.
CU-009 My Tickets
Route: /account/tickets
Purpose: Show tickets the customer is attending separately from events they organise.
Views / sub-tabs: Upcoming | Past | Resale/Transferred.
Page composition and component behaviour: 
•	Cards show event artwork, date, venue, entry state, transfer/resale state and QR availability policy.
•	Mobile-first layout prioritises admission information.
Primary actions and lifecycle controls: Open; transfer; official resale; add to calendar/wallet where supported.
Drawers, popovers, chat and widgets: Transfer/resale modal.
Logic flow and state integrity: Transferred/sold tickets cannot remain valid.
Cross-integrations: Ticketing, calendar, orders.
Consolidation decision: Attending and organising remain distinct user jobs.
CU-010 Ticket Detail
Route: /account/tickets/[id]
Purpose: Provide secure admission details and transfer/resale controls.
Views / sub-tabs: Single record.
Page composition and component behaviour: 
•	Event identity, admission/seat, QR/barcode state, order owner/attendee, venue instructions, eligibility and scan summary.
Primary actions and lifecycle controls: Transfer; official resale; open event; calendar.
Drawers, popovers, chat and widgets: Transfer/resale/terms modal.
Logic flow and state integrity: Only eligible states expose transfer/resale; successful resale replaces/invalidate original entitlement.
Cross-integrations: Ticketing, orders, event/venue pages.
Consolidation decision: No speculative secondary-market product.
CU-011 Saved
Route: /account/saved
Purpose: Store events, venues and services for later planning.
Views / sub-tabs: Events | Venues | Services.
Page composition and component behaviour: 
•	Saved cards retain useful availability/date context and can be added directly to an Event Build.
Primary actions and lifecycle controls: Open; remove; add to event; follow.
Drawers, popovers, chat and widgets: Choose-event popover.
Logic flow and state integrity: Unavailable items remain visible with alternatives rather than disappearing.
Cross-integrations: Saved, marketplace, events.
Gala Agent behaviour: Can rank saved options against an active build.
Consolidation decision: One saved surface for all consumer discovery objects.
CU-012 Reviews
Route: /account/reviews
Purpose: Collect verified post-event reviews for venues/services.
Views / sub-tabs: To review | Submitted.
Page composition and component behaviour: 
•	Booking-derived review cards support quality, communication, value and punctuality/reliability plus optional media.
•	Only completed eligible bookings can create verified reviews.
Primary actions and lifecycle controls: Submit; edit within allowed window; report issue.
Drawers, popovers, chat and widgets: Review composer; policy/help modal.
Logic flow and state integrity: Moderation/disputes preserve authenticity and audit.
Cross-integrations: Bookings, provider profiles, trust.
Consolidation decision: Reviews are tied to real bookings.
CU-013 Customer Account
Route: /account
Purpose: Manage identity, preferences, payment tokens and notifications.
Views / sub-tabs: Profile | Payments | Notifications | Privacy & Security.
Page composition and component behaviour: 
•	Personal details, supported saved payment methods/tokens, notifications, connected calendars and security.
Primary actions and lifecycle controls: Edit; add/remove supported payment method; security actions.
Drawers, popovers, chat and widgets: Confirmation modal.
Logic flow and state integrity: Sensitive changes require reauthentication where appropriate.
Cross-integrations: Auth, payments, notifications, calendar.
Consolidation decision: Business workspace settings remain separate.
10. Customer App - event and booking wizards
CU-W01-01 Plan an Event - Occasion & Goal
Route / state: /plan?step=1
Purpose: Start the event in plain consumer language.
Fields / components: Event type/occasion; title optional; private/public intent; help-me-plan-everything toggle; short description.
Dynamic behaviour: Event type seeds recommended categories, checklist and planning sequence.
Validation / blockers: Event type or Custom.
Gala Agent assistance: Can interpret free-text intent and prefill structure.
Navigation: Continue -> step 2.
CU-W01-02 Plan an Event - Date, Area & Guests
Route / state: /plan?step=2
Purpose: Establish the foundation needed for availability.
Fields / components: Target date; flexible date range; start/end window; area/postcode/city; guest estimate; children/adult mix when relevant.
Dynamic behaviour: Flexible dates expand supply and recommendations.
Validation / blockers: Future date/window and non-negative guests.
Gala Agent assistance: Can suggest date flexibility when supply is constrained.
Navigation: Back; Continue -> step 3.
CU-W01-03 Plan an Event - Budget & Priorities
Route / state: /plan?step=3
Purpose: Set the financial envelope and must-haves.
Fields / components: Total budget/range; must-have categories; optional categories; style/experience; accessibility needs.
Dynamic behaviour: Budget allocates guidance across categories, not forced line items.
Validation / blockers: Budget optional unless build-to-budget Agent mode is requested.
Gala Agent assistance: Creates preliminary budget split and flags unrealistic combinations.
Navigation: Back; Continue -> step 4.
CU-W01-04 Plan an Event - Recommended Build
Route / state: /plan?step=4
Purpose: Review the generated event skeleton before entering Build.
Fields / components: Event summary; category plan; initial venue/service suggestions; planning-window status; estimated range; readiness baseline.
Dynamic behaviour: Accepting creates the Event and provisional build structure, not bookings.
Validation / blockers: Confirm event/date/location intent.
Gala Agent assistance: Can regenerate under different constraints.
Navigation: Create Event -> CU-003 / Build.
CU-W02-01 Booking Request - Requirements
Route / state: /account/events/[id]/book?step=1
Purpose: Confirm event context and provider-specific requirements.
Fields / components: Selected listing/package; date/time; guests; setup/access; provider questions; attachments; backup/standby interest.
Dynamic behaviour: Event data prefills; provider-specific questions remain explicit.
Validation / blockers: Required provider questions and compatibility.
Gala Agent assistance: Can reuse known event context and flag missing data.
Navigation: Continue -> step 2.
CU-W02-02 Booking Request - Terms, Hold & Payment
Route / state: /account/events/[id]/book?step=2
Purpose: Choose request/hold/standby option and understand commitment.
Fields / components: Price/estimate; deposit/authorisation; cancellation terms; response deadline; conditional hold; standby fee; payment method.
Dynamic behaviour: Interaction follows booking mode; no spend occurs without explicit approval.
Validation / blockers: Terms acceptance and payment readiness when required.
Gala Agent assistance: Explains exactly which state submission will create.
Navigation: Submit -> Event Build; response clock starts.
CU-W03-01 Customer Ticket Setup - Ticket Model
Route / state: /account/events/[id]/tickets/setup?step=1
Purpose: Create simple free/paid ticket tiers.
Fields / components: Capacity; GA/simple reserved section if venue map exists; tier names; prices.
Dynamic behaviour: Professional map editing is not exposed here.
Validation / blockers: Capacity <= approved event/venue capacity.
Gala Agent assistance: Suggest simple tiering.
Navigation: Continue -> step 2.
CU-W03-02 Customer Ticket Setup - Sales & Rules
Route / state: /account/events/[id]/tickets/setup?step=2
Purpose: Set sale timing and basic ticket policy.
Fields / components: Sale start/end; order limit; transfer; official resale; refund policy selection; basic promo code.
Dynamic behaviour: Complex releases/allocations/promoter inventory remain Organizer features.
Validation / blockers: Dates fit lifecycle.
Gala Agent assistance: Flags contradictory settings.
Navigation: Continue -> step 3.
CU-W03-03 Customer Ticket Setup - Review & Publish
Route / state: /account/events/[id]/tickets/setup?step=3
Purpose: Confirm configuration before sales start.
Fields / components: Summary; fees; payout/identity requirements; capacity; preview; terms.
Dynamic behaviour: Publishing can require payment/identity checks.
Validation / blockers: All required selling controls.
Gala Agent assistance: Produces readiness checklist only.
Navigation: Publish -> Guests & Tickets.
11. Organizer Workspace - shell and navigation
Sidebar: Home | Events | Calendar | Sales | Marketplace | Tickets & Promotion | Team | Money | Gala Agent | Settings. Top bar: workspace switcher, global search, + Create, Communications, Notifications, Help and Avatar. Event records keep the global sidebar and add a five-tab event command centre.
ORG-001 Home / Command Centre
Route: /organizer
Purpose: Prioritise what requires professional attention across the portfolio.
Views / sub-tabs: Today | This Week emphasis.
Page composition and component behaviour: 
•	Attention queue: response deadlines, supplier/venue holds, unpaid deposits, ticket pace, readiness blockers, team conflicts and critical incidents.
•	Upcoming events timeline with readiness and next milestone.
•	Commercial summary: leads/proposals, bookings, ticket revenue, forecast profit and amounts due.
•	Gala Agent briefing shows completed work, waiting states and approvals rather than chat history.
Primary actions and lifecycle controls: Create Event; Add Lead; Find Provider; Emergency Supply; open blocker; open Gala Agent.
Drawers, popovers, chat and widgets: Quick-create; attention preview; task/assignment drawers; Communications panel.
Logic flow and state integrity: Attention scoring favours time-critical external dependencies and financial/operational risk.
Cross-integrations: Events, sales, marketplace, tickets, team, money, Agent.
Gala Agent behaviour: Can produce a morning operational brief and propose batched actions.
Consolidation decision: No separate generic Tasks, Reports or Automations home products.
ORG-002 Events
Route: /organizer/events
Purpose: Operate the full professional event portfolio.
Views / sub-tabs: All | Upcoming | Live | Completed | Templates; List | Cards | Calendar.
Page composition and component behaviour: 
•	Rows/cards show artwork, type, phase, date, venue, owner, readiness, tickets/capacity, budget, forecast profit and next action.
•	Filters include client, event type, owner, venue, date, status, ticketed/private and readiness risk.
Primary actions and lifecycle controls: Open; create; duplicate; save as template; archive; assign owner; preview public page.
Drawers, popovers, chat and widgets: Bulk assign/archive; filter drawer.
Logic flow and state integrity: One event record supports every event type; views never create route variants.
Cross-integrations: Event core, calendar, team, ticketing, money.
Gala Agent behaviour: Can triage a filtered portfolio and suggest which events need intervention.
Consolidation decision: No event-type route packs.
ORG-003 Professional Event Profile
Route: /organizer/events/[id]
Purpose: Serve as the canonical professional command centre for the event.
Views / sub-tabs: Overview | Plan | Sell & Promote | Operations | Money.
Page composition and component behaviour: 
•	Overview: event hero, phase/status, client/owner, date/venue, capacity, readiness, ticket pace, budget/revenue/profit, provider status, team status, risks, approvals and activity.
•	Plan: Brief, Programme, Venue, Suppliers, Guests, Schedule, Tasks and Files. Programme adapts by event type; venue/supplier bookings remain canonical records.
•	Sell & Promote: Tickets, Venue Map, Public Page, Discover/Calendar, Posters & Media, Promoters, Audience and Performance.
•	Operations: Run Sheet, Team/Crew, Check-in, Floor & Map operational overlay, Hospitality, Logistics, Risk, Incidents and Live Event Mode.
•	Money: Budget, Revenue, Costs, Deposits, Receivables, Payables, Settlement, Profit, break-even and forecast/committed/actual comparisons.
Primary actions and lifecycle controls: Edit event; source provider; launch tickets/promotion; add crew; enter Live Mode; duplicate; cancel/close subject to controls.
Drawers, popovers, chat and widgets: Task, booking, risk, guest, provider, payment and approval drawers; Ask Gala sidecar opens pre-scoped Agent.
Logic flow and state integrity: Readiness is calculated from event-type requirements and dependencies; blocked actions explain the blocker instead of silently disabling.
Cross-integrations: All organizer domains.
Gala Agent behaviour: Can organize the event end-to-end, create plans, source providers, wait for replies, resume runs and prepare approval batches.
Consolidation decision: Five tabs absorb the old event-pack route explosion.
ORG-004 Calendar
Route: /organizer/calendar
Purpose: Coordinate the event business through one layered operational calendar.
Views / sub-tabs: Month | Week | Day | Agenda; saved layer sets.
Page composition and component behaviour: 
•	Layers: events, tasks, venue/provider bookings, conditional holds, crew shifts, ticket releases, promotion dates, emails, payments, meetings and external calendars.
•	Dragging a dependent item opens impact analysis before any source record is changed.
Primary actions and lifecycle controls: Create; open source record; reschedule supported items; save calendar view; share/embed selected public calendar.
Drawers, popovers, chat and widgets: Layer popover; event quick-view; conflict drawer.
Logic flow and state integrity: Every calendar item has a canonical source and changes validate against booking/team/ticket rules.
Cross-integrations: Events, marketplace, team, tickets, promotion, payments, external calendars.
Gala Agent behaviour: Can detect schedule conflicts and propose viable alternatives.
Consolidation decision: Calendar is visibility, not a second data model.
ORG-005 Sales
Route: /organizer/sales
Purpose: Manage professional event leads and proposals before conversion.
Views / sub-tabs: Pipeline | Proposals; List | Board.
Page composition and component behaviour: 
•	Pipeline stages New, Qualified, Proposal, Negotiating, Won and Lost with value/date/next action.
•	Proposal register shows client, event concept, version, value, expiry, signature/deposit state and linked lead/event.
Primary actions and lifecycle controls: Add lead; create proposal; move stage; convert won work; bulk assign.
Drawers, popovers, chat and widgets: Lead quick edit; stage-change reason; filter drawer.
Logic flow and state integrity: Conversion creates/links the canonical Event and carries client/commercial assumptions forward.
Cross-integrations: Contacts, proposals, events, communications, money.
Gala Agent behaviour: Can qualify, draft follow-ups and prepare proposals within permission.
Consolidation decision: This is event sales, not a generic CRM.
ORG-006 Lead Profile
Route: /organizer/sales/leads/[id]
Purpose: Hold the event sales opportunity and all pre-event context.
Views / sub-tabs: Overview | Activity.
Page composition and component behaviour: 
•	Contact/client, event requirement, date flexibility, location/venue preference, budget, guests/capacity, source, owner, probability, next action and communications.
•	Recommendation panel shows next action and venue/provider search suggestions when enough data exists.
Primary actions and lifecycle controls: Qualify; create proposal; schedule follow-up; convert; lose; assign.
Drawers, popovers, chat and widgets: Contact drawer; follow-up task; communication composer.
Logic flow and state integrity: Won state requires explicit conversion/linked-event decision.
Cross-integrations: Contacts, proposals, events, communications.
Gala Agent behaviour: Can summarize requirements and draft qualification questions.
Consolidation decision: One canonical lead page.
ORG-007 Proposal Profile
Route: /organizer/sales/proposals/[id]
Purpose: Create and negotiate the professional event proposal.
Views / sub-tabs: Proposal | Commercial | Activity.
Page composition and component behaviour: 
•	Versioned scope, line items, options, taxes, validity, assumptions, comments, acceptance/signature and deposit requirements.
•	Conversion preview shows which event/budget/timeline records will be created.
Primary actions and lifecycle controls: Edit draft; duplicate version; preview; send; withdraw; convert to Event.
Drawers, popovers, chat and widgets: Line-item editor; send modal; acceptance/deposit status.
Logic flow and state integrity: Accepted/expired versions lock financially sensitive fields and retain acceptance snapshot.
Cross-integrations: Leads, events, money, communications, files.
Gala Agent behaviour: Can draft scope/pricing narrative but cannot alter approved totals outside authority.
Consolidation decision: Commercial proposal remains separate from execution.
ORG-008 Marketplace
Route: /organizer/marketplace
Purpose: Source venues and services with event context, availability and reliability.
Views / sub-tabs: Venues | Services; List | Cards | Map; Saved | Requests.
Page composition and component behaviour: 
•	Filters: active event/date/time, location, capacity, category, price, booking mode, response time, reliability, verified, emergency availability and relationship history.
•	Event-context mode automatically applies event requirements and compatibility checks.
•	Emergency Supply action starts a short-deadline request only to eligible providers.
Primary actions and lifecycle controls: Save; compare; enquire; request quote; conditional hold; book; emergency request.
Drawers, popovers, chat and widgets: Compare drawer; event selector; advanced filters; terms/availability popovers.
Logic flow and state integrity: Confirmed availability, likely availability, awaiting confirmation and enquiry-only are distinct; unanswered requests stay pending until deadline.
Cross-integrations: Marketplace, events, availability, reliability, bookings, Agent.
Gala Agent behaviour: Can source/rank candidates, send approved requests and continue as responses arrive.
Consolidation decision: Venues and services share discovery while retaining domain-specific listing records.
ORG-009 Provider Marketplace Profile
Route: /organizer/marketplace/[type]/[id]
Purpose: Evaluate a venue or service provider in professional event context.
Views / sub-tabs: Overview | Availability | Packages/Spaces | Reviews/Performance; adaptive.
Page composition and component behaviour: 
•	Venue mode: spaces, layouts, capacity, access, F&B/bar, packages, rules, media and venue maps.
•	Service mode: services/packages, coverage, staffing/equipment, requirements, media and delivery model.
•	Both show response commitment, reliability, cancellation rate, verification, reviews, booking modes and emergency/standby support.
Primary actions and lifecycle controls: Save; message; add to event; request quote; conditional hold; book; choose as backup.
Drawers, popovers, chat and widgets: Availability calendar; package/space quick view; terms; comparison.
Logic flow and state integrity: Sponsored placement is disclosed and does not masquerade as reliability ranking.
Cross-integrations: Provider listings, availability, reviews, bookings, events.
Gala Agent behaviour: Can assess event fit and explain incompatibilities.
Consolidation decision: One adaptive profile replaces duplicate marketplace profile shells.
ORG-010 Request & Quote Comparison
Route: /organizer/marketplace/requests/[id]
Purpose: Manage one procurement requirement and compare provider responses.
Views / sub-tabs: Requirement | Responses | Activity.
Page composition and component behaviour: 
•	Requirement shows event context, scope, response deadline, budget/range, attachments and recipients.
•	Comparison normalizes quote value, exclusions, response time, reliability, cancellation terms, hold/standby and total landed cost.
•	Expired/no-response providers remain visible with explicit state.
Primary actions and lifecycle controls: Invite more; shortlist; ask question; accept quote; request hold; select primary/backup; close.
Drawers, popovers, chat and widgets: Quote compare drawer; message composer; acceptance/terms modal.
Logic flow and state integrity: No provider is marked unavailable before its response window expires; expiry/no-response, decline and true unavailability remain distinct.
Cross-integrations: Marketplace, bookings, messages, money, Agent.
Gala Agent behaviour: Can chase responses, shortlist and continue to backups within pre-approved rules.
Consolidation decision: RFQs are absorbed into Marketplace Requests.
ORG-011 Tickets & Promotion Hub
Route: /organizer/tickets-promotion
Purpose: Operate ticketing and Gala Dock-owned promotion across events.
Views / sub-tabs: Ticketing | Promotion | Directory | Promoters | Media | Performance.
Page composition and component behaviour: 
•	Ticketing portfolio shows on-sale events, sales pace, capacity, scans/refunds and release schedule.
•	Promotion register shows public-page status, calendar/directory placement, poster/media readiness, featured placements, promoter activity and owned-channel performance.
•	Media surfaces current and previous event images/videos, organizer showreels, venue walkthroughs and reusable approved assets.
Primary actions and lifecycle controls: Open event; launch promotion; create poster; create promoter link; buy owned boost; export/report.
Drawers, popovers, chat and widgets: Event picker; boost inventory; promoter/media quick actions.
Logic flow and state integrity: Every promotion action resolves to a specific event or approved media asset; no general brand campaign automation.
Cross-integrations: Ticketing, promotion inventory, media, promoters, analytics.
Gala Agent behaviour: Can identify weak ticket trajectory and prepare an owned-channel recovery plan plus Caption Fox handoff if deeper marketing is needed.
Consolidation decision: Cross-event hub; detailed controls remain inside Event.
ORG-012 Public Event Page Editor
Route: /organizer/events/[id]/page
Purpose: Build the public event page that drives discovery and ticket conversion.
Views / sub-tabs: Edit | Preview | SEO & Sharing.
Page composition and component behaviour: 
•	Blocks: hero/media, description, programme, performers/speakers, venue/map, tickets, accessibility, organiser, sponsors, FAQ, previous-event media and related events.
•	Responsive preview with block ordering/visibility and completeness.
•	SEO/share: title, description, event schema inputs, canonical slug, social cards and indexability.
Primary actions and lifecycle controls: Edit; preview; publish/unpublish; open public URL.
Drawers, popovers, chat and widgets: Block settings; media picker; publish checklist.
Logic flow and state integrity: Invalid date/capacity/ticket links block publish; workspace approval policy may gate publish.
Cross-integrations: Events, ticketing, media, venues, SEO metadata.
Gala Agent behaviour: Can draft event copy and structured metadata.
Consolidation decision: Not a general website builder.
ORG-013 Venue Map & Ticket Layout Builder
Route: /organizer/events/[id]/map
Purpose: Create event-specific ticket and operational overlays on an approved venue map.
Views / sub-tabs: Design | Ticketing | Operations | Preview.
Page composition and component behaviour: 
•	Loads venue structural template: rooms, walls, entrances/exits, fixed seats, stages, bars, toilets, accessibility routes and capacity constraints.
•	Organizer overlay supports temporary stages, tables, seating, GA zones, VIP, booths, camera/production areas, sponsor inventory, kill seats, staff-only zones and checkpoints.
•	Ticketing binds seats/zones to tiers, pricing/allocation and availability.
•	Validation enforces locked geometry, room capacity, accessibility and protected exit paths.
Primary actions and lifecycle controls: Add/move allowed overlay; bind ticket tier; duplicate layout; request venue approval; publish.
Drawers, popovers, chat and widgets: Object inspector; layers; capacity warnings; venue-approval modal.
Logic flow and state integrity: Venue structural elements are immutable to organizer; overlay changes are versioned.
Cross-integrations: Venue maps, ticketing, operations, check-in, accessibility.
Gala Agent behaviour: Can propose layouts and detect capacity/flow conflicts but cannot override venue constraints.
Consolidation decision: One shared map engine with venue-owned structure and organizer-owned overlay.
ORG-014 Promotion & Distribution
Route: /organizer/events/[id]/promotion
Purpose: Run event-native distribution across owned and connected calendar surfaces.
Views / sub-tabs: Discover | Calendars | Promoters | Audience | Boosts | Performance.
Page composition and component behaviour: 
•	Directory distribution selects eligible category/city/venue/organizer feeds.
•	Calendar distribution covers Gala Dock feeds plus Google/Apple/Outlook/ICS and embeddable calendars.
•	Promoters: link/code, approved media pack, sales, commission and payout state.
•	Audience: event-specific announcement/reminder/last-chance/event instructions/post-event actions.
•	Boost inventory: featured event, category/city/weekend spotlight, venue-page placement and future owned placements.
Primary actions and lifecycle controls: Publish to directory; schedule reminder; create promoter; buy boost; open Caption Fox handoff; review performance.
Drawers, popovers, chat and widgets: Placement preview; audience summary; send approval; boost checkout.
Logic flow and state integrity: Communications obey consent; paid placements are labeled and do not alter organic reliability ranking.
Cross-integrations: Directory, calendars, communications, promoters, payments, analytics.
Gala Agent behaviour: Can build the event-native promotion plan, monitor ticket pace and propose next actions.
Consolidation decision: Deep enough to sell an event without becoming a generic marketing suite.
ORG-015 Poster & Media Builder
Route: /organizer/events/[id]/media
Purpose: Create polished event assets and reuse previous-event media without a full studio.
Views / sub-tabs: Create | Library | Previous Events.
Page composition and component behaviour: 
•	Template outputs: A3, A4, square, 4:5, story, 16:9, QR poster, ticket launch, final tickets and sold out.
•	Auto-bound fields: event name/date/time, venue, ticket price/URL/QR, performers, organiser and sponsors.
•	Library accepts approved images/video, venue walkthroughs, crowd footage, testimonials and recap clips.
•	Previous Events view reuses media with source/event attribution and rights status.
Primary actions and lifecycle controls: Create variant; upload; reuse; approve; export; attach to event/page/promotion.
Drawers, popovers, chat and widgets: Template settings; crop/trim; rights metadata; Caption Fox handoff.
Logic flow and state integrity: Generated assets retain source/event linkage and approval state; advanced AI video/UGC editing stays outside core.
Cross-integrations: Media, public page, promotion, organizer profile.
Gala Agent behaviour: Can assemble template variants and copy from event data.
Consolidation decision: Keeps essential event marketing assets without studio bloat.
ORG-016 Team
Route: /organizer/team
Purpose: Manage workspace people, event crew, availability and assignments.
Views / sub-tabs: People | Availability | Assignments | Shifts.
Page composition and component behaviour: 
•	People includes workspace members plus external crew with role, skills, permissions and cost where relevant.
•	Availability/assignment views show overlapping events and travel windows.
•	Shifts support event/date/location, responsibilities, check-in/out, emergency contact and run-sheet linkage.
•	Conflict engine flags overlaps, travel gaps, missing role coverage and unconfirmed assignments.
Primary actions and lifecycle controls: Invite; add external crew; assign; create shift; request availability; resolve conflict.
Drawers, popovers, chat and widgets: Member/crew drawer; shift editor; conflict detail.
Logic flow and state integrity: External crew can receive event-scoped participation without full workspace access.
Cross-integrations: Events, calendar, communications, money, Agent.
Gala Agent behaviour: Can construct staffing plans, identify gaps and prepare assignment messages.
Consolidation decision: Team is a primary Organizer destination, but not HR/payroll software.
ORG-017 Team Member / Crew Profile
Route: /organizer/team/[id]
Purpose: Provide one canonical person record for a member or scoped crew participant.
Views / sub-tabs: Overview | Availability | Assignments | Activity.
Page composition and component behaviour: 
•	Identity/contact, role/permissions if member, skills, base/travel area, availability, assignments, shifts and cost defaults.
•	Event-scoped access can be granted without exposing unrelated workspace records.
Primary actions and lifecycle controls: Edit; assign; request availability; change role; deactivate/revoke.
Drawers, popovers, chat and widgets: Permission editor; assignment drawer.
Logic flow and state integrity: Permission changes are audited and cannot remove the final owner.
Cross-integrations: Membership, events, shifts, audit.
Gala Agent behaviour: Can suggest assignments based on skills/availability without elevating access.
Consolidation decision: One people model supports members and external crew.
ORG-018 Money
Route: /organizer/money
Purpose: Manage professional financial visibility across events.
Views / sub-tabs: Overview | Receivables | Payables | Transactions | Settlements | Reports.
Page composition and component behaviour: 
•	KPIs: event revenue, ticket revenue, provider commitments, unpaid invoices, upcoming deposits, refunds and forecast/actual profit.
•	Receivables/payables link directly to client, provider, venue or ticket settlement source.
•	Reports focus on event/project profitability rather than replacing accounting software.
Primary actions and lifecycle controls: Create invoice; collect/record supported payment; reconcile; export.
Drawers, popovers, chat and widgets: Transaction detail; settlement explanation; filter drawer.
Logic flow and state integrity: Financial edits require permission and immutable transaction history.
Cross-integrations: Events, ticketing, bookings, payments, invoices.
Gala Agent behaviour: Can forecast cash/profit and flag anomalies; high-impact payment actions require approval.
Consolidation decision: One workspace money surface.
ORG-019 Invoice Profile
Route: /organizer/money/invoices/[id]
Purpose: Operate a client/event invoice and payment schedule.
Views / sub-tabs: Invoice | Schedule | Activity.
Page composition and component behaviour: 
•	Client/event, line items, tax, due dates, payment schedule, paid/refunded amounts, public payment link and communication history.
Primary actions and lifecycle controls: Edit draft; send; remind; credit/cancel subject to state.
Drawers, popovers, chat and widgets: Line-item editor; send/reminder modal.
Logic flow and state integrity: Issued/paid fields follow accounting-safe mutation and audit rules.
Cross-integrations: Money, clients, events, communications.
Gala Agent behaviour: Can draft reminders and identify overdue risk.
Consolidation decision: Canonical invoice record only.
ORG-020 Gala Agent
Route: /organizer/agent
Purpose: Operate the professional event-management Agent.
Views / sub-tabs: Work | Approvals | Routines | History.
Page composition and component behaviour: 
•	Goal composer supports workspace/event/provider/ticket/promotion/team/money scopes and attachments.
•	Active Work shows plan, progress, waiting reason, next wake, commitment/spend exposure and approvals.
•	Approvals batches high-impact actions.
•	Routines express recurring operational outcomes in natural language rather than nodes.
Primary actions and lifecycle controls: Start run; approve/reject; pause/cancel; edit routine; open run.
Drawers, popovers, chat and widgets: Scope picker; approval detail; run activity panel.
Logic flow and state integrity: Runs persist while waiting on external responses/future dates and resume without losing context.
Cross-integrations: All organizer service layers under permission.
Gala Agent behaviour: This is the deepest event-planning/operations Agent tool pack.
Consolidation decision: No separate Automation Builder or AI personas.
ORG-021 Settings
Route: /organizer/settings
Purpose: Manage the professional workspace without scattered settings pages.
Views / sub-tabs: Workspace | Team & Access | Brand | Payments & Billing | Communications | Integrations | Agent | Notifications.
Page composition and component behaviour: 
•	Workspace/legal/locale defaults, subscription, roles/permissions, connected email/calendar, payment configuration, notifications, Agent approval/autopilot policy and audit links.
Primary actions and lifecycle controls: Edit; connect/disconnect; change plan; invite; export audit where allowed.
Drawers, popovers, chat and widgets: Integration setup; confirmation modals.
Logic flow and state integrity: Consequential configuration changes may require confirmation/reauthentication.
Cross-integrations: All shared services.
Gala Agent behaviour: Can explain consequences and run setup checks.
Consolidation decision: One settings route with internal tabs.
12. Organizer Workspace - surviving wizards
ORG-W01-01 Create Event - Event Basics
Route / state: /organizer/events/new?step=1
Purpose: Create the professional event identity.
Fields / components: Name; event type; client optional; public/private; owner; goal/brief.
Dynamic behaviour: Event type seeds plan/risk/ticketing/promotion defaults.
Validation / blockers: Name/type required.
Gala Agent assistance: Can turn a written brief into structured fields.
Navigation: Continue -> step 2.
ORG-W01-02 Create Event - Date, Venue & Capacity
Route / state: /organizer/events/new?step=2
Purpose: Establish schedule and venue state.
Fields / components: Date/time/timezone; flexible dates; venue known/unknown; venue selector/search; capacity; multi-venue toggle.
Dynamic behaviour: Unknown venue creates a sourcing requirement without blocking draft.
Validation / blockers: Valid date/time; non-negative capacity.
Gala Agent assistance: Can recommend venue requirements/search criteria.
Navigation: Back; Continue -> step 3.
ORG-W01-03 Create Event - Commercial Model
Route / state: /organizer/events/new?step=3
Purpose: Set budget/revenue/ticketing assumptions.
Fields / components: Budget; target revenue/profit; ticketed/free/private; ticket price/yield; client fee model; currency/tax defaults.
Dynamic behaviour: Calculates break-even/yield scenarios without forcing a model.
Validation / blockers: Valid currency and non-negative values.
Gala Agent assistance: Can build target economics and flag impossible assumptions.
Navigation: Back; Continue -> step 4.
ORG-W01-04 Create Event - Setup & Review
Route / state: /organizer/events/new?step=4
Purpose: Choose the initial event systems and review.
Fields / components: Planning template; ticketing; provider categories; staffing; promotion; risk/compliance; guest mode; optional initial Agent goal.
Dynamic behaviour: Creates selected/default sections only.
Validation / blockers: Foundation complete.
Gala Agent assistance: Can generate the initial event plan after creation.
Navigation: Create -> ORG-003.
ORG-W02-01 Create Proposal - Client & Event
Route / state: /organizer/proposals/new?step=1
Purpose: Capture who and what the proposal is for.
Fields / components: Client/contact; event concept; dates; location; attendance; brief; linked lead.
Dynamic behaviour: Prefills from lead.
Validation / blockers: Client/contact and context.
Gala Agent assistance: Can summarize lead notes.
Navigation: Continue -> step 2.
ORG-W02-02 Create Proposal - Offer & Pricing
Route / state: /organizer/proposals/new?step=2
Purpose: Build commercial scope.
Fields / components: Packages/line items; quantities; taxes; assumptions; exclusions; deposit/payment terms.
Dynamic behaviour: Templates may prefill but totals remain explicit.
Validation / blockers: Totals/tax/permission.
Gala Agent assistance: Can draft options and check margin assumptions.
Navigation: Back; Continue -> step 3.
ORG-W02-03 Create Proposal - Review & Send
Route / state: /organizer/proposals/new?step=3
Purpose: Preview and issue the proposal.
Fields / components: Brand preview; recipient; expiry; message; acceptance/deposit setting.
Dynamic behaviour: Sending creates an immutable issued version.
Validation / blockers: Recipient/terms.
Gala Agent assistance: Draft send message.
Navigation: Send -> ORG-007.
ORG-W03-01 Ticket Setup - Model & Capacity
Route / state: /organizer/events/[id]/tickets/setup?step=1
Purpose: Define advanced ticket inventory.
Fields / components: GA/reserved/hybrid; capacity; venue map; allocations; holds; accessibility inventory; comps.
Dynamic behaviour: Map can load from Venue and organizer overlay.
Validation / blockers: Inventory <= approved capacities.
Gala Agent assistance: Suggest ticket model from venue/event type.
Navigation: Continue -> step 2.
ORG-W03-02 Ticket Setup - Tiers, Releases & Pricing
Route / state: /organizer/events/[id]/tickets/setup?step=2
Purpose: Build professional ticket structure.
Fields / components: Tiers; price; quantity; sale windows; release dependencies; promoter allocations; codes; order limits.
Dynamic behaviour: Supports phased releases and audited inventory movement.
Validation / blockers: No oversell; coherent sale windows.
Gala Agent assistance: Model yield/break-even and suggest release plan.
Navigation: Back; Continue -> step 3.
ORG-W03-03 Ticket Setup - Rules & Publish
Route / state: /organizer/events/[id]/tickets/setup?step=3
Purpose: Set policies and publish readiness.
Fields / components: Transfer/resale/refund rules; buyer questions; fee treatment; payout/verification; terms; preview.
Dynamic behaviour: Publish is gated by page/payment/event readiness.
Validation / blockers: All selling checks.
Gala Agent assistance: Produces readiness checklist.
Navigation: Publish -> Event Sell & Promote.
ORG-W04-01 Marketplace Request - Requirement
Route / state: /organizer/marketplace/requests/new?step=1
Purpose: Create a structured venue/service requirement.
Fields / components: Event; category; scope; date/time; location; capacity; budget/range; required credentials; attachments; response deadline.
Dynamic behaviour: Event data prefills.
Validation / blockers: Required scope/serviceability.
Gala Agent assistance: Can draft requirement and identify missing detail.
Navigation: Continue -> step 2.
ORG-W04-02 Marketplace Request - Recipients, Hold & Send
Route / state: /organizer/marketplace/requests/new?step=2
Purpose: Choose candidates and response/hold strategy.
Fields / components: Recommended providers; manual recipients; response window; conditional hold; backup candidates; emergency flag.
Dynamic behaviour: Recipients show availability confidence and reliability.
Validation / blockers: Emergency requires supported horizon/response policy.
Gala Agent assistance: Can rank candidates and stage primary/backup sequence.
Navigation: Send -> ORG-010.
ORG-W05-01 Owned Promotion - Goal & Inventory
Route / state: /organizer/events/[id]/promotion/new?step=1
Purpose: Select event-native promotion goals and surfaces.
Fields / components: Goal; target outcome; directory/calendar feeds; owned boost inventory; promoter plan; audience reminders.
Dynamic behaviour: Inventory/pricing follows current platform configuration.
Validation / blockers: Event publishable for public placements.
Gala Agent assistance: Suggest surfaces from event type/location/sales pace.
Navigation: Continue -> step 2.
ORG-W05-02 Owned Promotion - Assets & Schedule
Route / state: /organizer/events/[id]/promotion/new?step=2
Purpose: Attach posters/media and schedule actions.
Fields / components: Poster/media; previous-event video; dates; promoter assets; reminder copy; Caption Fox handoff optional.
Dynamic behaviour: Missing asset sizes can be generated from templates.
Validation / blockers: Actions fit event lifecycle.
Gala Agent assistance: Create variants/copy drafts and identify missing media.
Navigation: Back; Continue -> step 3.
ORG-W05-03 Owned Promotion - Review & Approve
Route / state: /organizer/events/[id]/promotion/new?step=3
Purpose: Review cost, communications and publication actions.
Fields / components: Timeline; spend; audience size; disclosures; previews; approvals.
Dynamic behaviour: High-impact broadcast/spend waits for explicit approval.
Validation / blockers: Permissions, consent, payment.
Gala Agent assistance: Summarise launch plan and monitoring routine.
Navigation: Launch -> ORG-014.
ORG-W06-01 Create Invoice - Details & Items
Route / state: /organizer/money/invoices/new?step=1
Purpose: Create invoice foundation.
Fields / components: Client/event; line items; tax; currency; reference; issue/due date.
Dynamic behaviour: Can prefill proposal or event milestone.
Validation / blockers: Valid totals/dates.
Gala Agent assistance: Can convert accepted commercial data into draft items.
Navigation: Continue -> step 2.
ORG-W06-02 Create Invoice - Schedule & Send
Route / state: /organizer/money/invoices/new?step=2
Purpose: Confirm payment schedule and delivery.
Fields / components: Installments; public payment link; recipient; message; reminder policy.
Dynamic behaviour: Sending issues invoice under accounting-safe rules.
Validation / blockers: Recipient/payment config.
Gala Agent assistance: Draft message/reminder cadence.
Navigation: Send -> ORG-019.
ORG-W07-01 Save Event as Template - Scope
Route / state: /organizer/events/[id]/template?step=1
Purpose: Choose reusable structure without leaking personal/event history.
Fields / components: Plan, schedule structure, provider categories, ticket model, promotion structure, staffing roles, risk checklist; exclude guests/payments/private communications by default.
Dynamic behaviour: Sensitive/event-specific records are excluded.
Validation / blockers: Template-safe content only.
Gala Agent assistance: Can distinguish reusable from event-specific.
Navigation: Continue -> step 2.
ORG-W07-02 Save Event as Template - Review
Route / state: /organizer/events/[id]/template?step=2
Purpose: Name and confirm reusable template.
Fields / components: Name; description; event types; included modules; preview.
Dynamic behaviour: Creates a reusable template rather than a clone.
Validation / blockers: Valid/unique name.
Gala Agent assistance: Can create concise template summary.
Navigation: Save -> Events/Templates.
13. Provider Workspace - adaptive Venue + Supplier shell
Sidebar: Home | Opportunities | Bookings | Calendar | Listings | Team | Money | Gala Agent | Settings. Listings adapts to Venues/Spaces/Packages and/or Services/Packages. A provider may enable both Venue and Services in the same workspace without duplicating team, calendar, money, communications or Agent infrastructure.
PROV-001 Home / Provider Command Centre
Route: /provider
Purpose: Show actionable commercial and delivery work across enabled capabilities.
Views / sub-tabs: Today | Upcoming emphasis.
Page composition and component behaviour: 
•	New requests with countdown, expiring conditional holds, standby commitments, emergency requests, upcoming bookings/jobs, team conflicts, payout issues and reliability alerts.
•	Capability summary adapts: occupancy/space utilisation for venues; job/service pipeline for suppliers; both when mixed.
•	Reliability card shows response rate, cancellation rate, on-time/fulfilment measures and Instant Book/Emergency/Standby eligibility.
Primary actions and lifecycle controls: Respond; open booking; update availability; publish emergency slot; open payout; open Agent.
Drawers, popovers, chat and widgets: Opportunity quick view; availability toggle; shift/assignment drawer.
Logic flow and state integrity: Missed deadlines become Expired/No Response, not Declined/Unavailable, and can affect reliability.
Cross-integrations: Opportunities, bookings, listings, team, money, Agent.
Gala Agent behaviour: Can triage requests and prepare quote/availability responses within policy.
Consolidation decision: One command centre adapts instead of separate venue and supplier dashboards.
PROV-002 Opportunities
Route: /provider/opportunities
Purpose: Manage requests, quotes, conditional holds and urgent demand.
Views / sub-tabs: Requests | Quotes | Holds | Emergency.
Page composition and component behaviour: 
•	Rows show event/date/location, listing/capability, scope, value/range, response deadline, hold state, requester and fit warnings.
•	Emergency tab only shows demand matching enabled emergency categories/coverage and response commitment.
Primary actions and lifecycle controls: Open; confirm availability; decline; quote; request clarification; accept/decline hold; manage emergency availability.
Drawers, popovers, chat and widgets: Bulk availability response where safe; filter drawer.
Logic flow and state integrity: Request clock pauses only under defined platform states; every transition is audited.
Cross-integrations: Marketplace, availability, bookings, messages, Agent.
Gala Agent behaviour: Can monitor deadlines and prepare responses, while binding commitments respect approval/autopilot policy.
Consolidation decision: All inbound commercial demand lives here.
PROV-003 Opportunity Profile
Route: /provider/opportunities/[id]
Purpose: Decide whether and how to respond to a specific event requirement.
Views / sub-tabs: Overview | Response | Activity.
Page composition and component behaviour: 
•	Event/date/location/guest context, scope, attachments, disclosed budget, access/setup, credentials, response deadline and primary/backup role where disclosed.
•	Response supports Available, Unavailable, Need Clarification, Quote, Conditional Hold and Standby Offer as listing mode allows.
•	Compatibility panel checks provider calendar, travel, team/equipment/space capacity and lead-time constraints.
Primary actions and lifecycle controls: Confirm availability; decline; ask question; create quote; accept hold; offer standby.
Drawers, popovers, chat and widgets: Calendar/conflict preview; terms; message composer.
Logic flow and state integrity: No automatic acceptance when a hard conflict exists; expired requests cannot be retroactively accepted without requester action.
Cross-integrations: Calendar, listings, team, bookings, messages.
Gala Agent behaviour: Can evaluate fit, propose pricing and draft clarification questions.
Consolidation decision: One adaptive opportunity page supports venue and service requirements.
PROV-004 Quote Profile
Route: /provider/quotes/[id]
Purpose: Build and manage the provider commercial offer.
Views / sub-tabs: Quote | Terms | Activity.
Page composition and component behaviour: 
•	Scope/items, time/quantity, travel/setup, taxes, exclusions, validity, deposit/payment schedule, cancellation, hold/standby option and linked event/request.
•	Venue quotes can include spaces, packages, minimum spend and F&B/bar; service quotes can include staff/equipment/delivery.
Primary actions and lifecycle controls: Edit draft; send; revise; withdraw; accept customer-requested change subject to state.
Drawers, popovers, chat and widgets: Line-item editor; terms picker; send modal.
Logic flow and state integrity: Issued revisions preserve prior versions; accepted quote becomes booking commercial snapshot.
Cross-integrations: Opportunity, bookings, money, communications.
Gala Agent behaviour: Can draft from listing defaults and event requirement with margin/conflict warnings.
Consolidation decision: One quote engine with domain-specific line items.
PROV-005 Bookings
Route: /provider/bookings
Purpose: Operate confirmed, active and completed commercial work.
Views / sub-tabs: Upcoming | Active | Past | Cancelled.
Page composition and component behaviour: 
•	Cards show event/client, listing/space/service, date/time/location, booking value/net payout, payment state, team/space allocation, standby/backup role and next action.
•	Venue and service bookings share the list but open adaptive records.
Primary actions and lifecycle controls: Open; assign; update delivery status; request information; cancel subject to policy.
Drawers, popovers, chat and widgets: Status/change confirmation; filter drawer.
Logic flow and state integrity: Booking state changes trigger payment, reliability and replacement consequences where applicable.
Cross-integrations: Bookings, money, team, events, communications.
Gala Agent behaviour: Can identify at-risk work and prepare confirmations/replacements.
Consolidation decision: One bookings list replaces separate Venue Bookings and Supplier Jobs destinations.
PROV-006 Booking / Job Profile
Route: /provider/bookings/[id]
Purpose: Run booked work with capability-specific operational depth.
Views / sub-tabs: Overview | Delivery/Operations | Team & Schedule | Commercial | Files & Activity.
Page composition and component behaviour: 
•	Overview: event/client, date/location, booking/package, confirmation/protection state, primary contacts and critical requirements.
•	Venue mode Delivery/Operations: rooms/spaces, BEO/event order, access, setup/breakdown, F&B/bar, venue staff, supplier access, compliance and event map.
•	Service mode Delivery/Operations: scope, deliverables, equipment, setup, evidence, client inputs, milestones and change requests.
•	Team & Schedule assigns staff/resources/spaces and checks conflicts. Commercial shows accepted quote, add-ons/changes, deposit/balance, platform fee and net payout.
•	Files & Activity stores contracts, insurance, run sheets, delivery evidence, messages and audit.
Primary actions and lifecycle controls: Confirm details; assign resources; request change; mark arrival/start/completion; upload evidence; open payout; raise issue.
Drawers, popovers, chat and widgets: Assignment drawer; BEO/service detail editor; change-order modal; incident/support entry.
Logic flow and state integrity: Completion/payment release follows supported provider/payment flow; cancellation/no-show triggers replacement/refund/reliability logic.
Cross-integrations: Events, maps, team, money, files, trust.
Gala Agent behaviour: Can prepare BEO/job sheets, chase missing information and run pre-event confirmation routines.
Consolidation decision: One adaptive booking record preserves venue and supplier depth.
PROV-007 Calendar
Route: /provider/calendar
Purpose: Control availability, holds, bookings and staff/space capacity.
Views / sub-tabs: Month | Week | Day | Agenda; Availability | Holds | Bookings | Team layers.
Page composition and component behaviour: 
•	Venue mode adds space-level occupancy/turnaround; Services adds staff/equipment/travel constraints.
•	Conditional holds show expiry and dependency; standby commitments are visually distinct from primary bookings.
•	Emergency availability can be enabled for specific time blocks/categories.
Primary actions and lifecycle controls: Block/open availability; release hold; open booking; publish emergency window; sync external calendar.
Drawers, popovers, chat and widgets: Availability editor; hold detail; conflict drawer.
Logic flow and state integrity: External calendars may block or warn; confirmed bookings override soft availability.
Cross-integrations: Availability, bookings, team, external calendars.
Gala Agent behaviour: Can forecast capacity and suggest when to open/close availability.
Consolidation decision: One calendar for all provider capabilities.
PROV-008 Listings
Route: /provider/listings
Purpose: Manage public Venue, Space, Service and Package inventory from one adaptive catalogue.
Views / sub-tabs: Venues | Spaces | Services | Packages as enabled; Draft | Published | Paused.
Page composition and component behaviour: 
•	Venue cards show location/capacity/booking mode/listing quality; Service cards show category/coverage/starting price/mode; Packages bind to venue or service context.
•	Listing quality checks media, pricing clarity, response commitment, cancellation, verification and availability completeness.
Primary actions and lifecycle controls: Add; edit; preview; publish/pause; duplicate.
Drawers, popovers, chat and widgets: Capability filter; listing-quality drawer.
Logic flow and state integrity: Pausing does not cancel existing bookings; publication may require verification/payment readiness.
Cross-integrations: Marketplace, availability, trust, Agent.
Gala Agent behaviour: Can improve listing completeness and draft descriptions/packages.
Consolidation decision: One inventory destination replaces venue/service navigation trees.
PROV-009 Venue Profile
Route: /provider/venues/[id]
Purpose: Operate a venue asset and marketplace/commercial configuration.
Views / sub-tabs: Overview | Spaces & Map | Packages | Operations | Commercial.
Page composition and component behaviour: 
•	Overview: identity, location, media, capacities, amenities, accessibility, listing status, occupancy/performance and bookings.
•	Spaces & Map: rooms/spaces, fixed capacities/layouts, structural map, entrances/exits, bars/toilets, accessibility and locked constraints.
•	Packages: hire, weddings/conference/private packages, F&B, drinks/bar, add-ons and minimum spend.
•	Operations: access/setup, supplier access, licenses/compliance, noise/curfew, staffing defaults, turnaround and documents.
•	Commercial: rates, deposits, minimum spends, cancellation, response commitment, booking mode, holds, standby/emergency, commission/subscription effect and performance.
Primary actions and lifecycle controls: Edit; add space/package; edit structural map; publish; update booking rules.
Drawers, popovers, chat and widgets: Map builder; media picker; policy/availability drawers.
Logic flow and state integrity: Structural constraints version and feed organizer permissions; commercial changes do not rewrite existing bookings.
Cross-integrations: Spaces, bookings, marketplace, maps, money.
Gala Agent behaviour: Can analyse utilisation and recommend packages/availability.
Consolidation decision: Venue remains a deep record inside Provider, not a separate workspace.
PROV-010 Space Profile
Route: /provider/venues/[venue]/spaces/[id]
Purpose: Define a bookable venue space and reusable layout constraints.
Views / sub-tabs: Overview | Layouts | Availability & Rules.
Page composition and component behaviour: 
•	Dimensions, capacity by layout, access, amenities/AV, accessibility, fixed/temporary features and structural map segment.
•	Layouts support theatre, banquet, cabaret, standing, classroom and custom.
•	Availability/rules include turnaround, minimum duration, linked/exclusive spaces and rate override.
Primary actions and lifecycle controls: Edit; add layout; block; preview; duplicate.
Drawers, popovers, chat and widgets: Layout inspector; capacity calculation; rule editor.
Logic flow and state integrity: Combined-space capacity and mutually exclusive use are validated before booking.
Cross-integrations: Venue, maps, availability, bookings.
Gala Agent behaviour: Can suggest a suitable layout from event requirements.
Consolidation decision: Space is an item record, not a sidebar product.
PROV-011 Service Profile
Route: /provider/services/[id]
Purpose: Define a supplier service sold through the marketplace.
Views / sub-tabs: Overview | Pricing & Packages | Availability & Requirements | Media & Performance.
Page composition and component behaviour: 
•	Category/subcategory, description, coverage/travel, event types, inclusions/exclusions, credentials, setup/delivery and media.
•	Pricing supports fixed, hourly, per-person, per-unit, package or quote-only with travel/add-on rules.
•	Availability/requirements define lead time, response commitment, capacity, blackout, emergency/standby and customer questions.
•	Performance shows views, requests, conversion, response time, reliability and reviews.
Primary actions and lifecycle controls: Edit; create package; publish/pause; update availability; preview.
Drawers, popovers, chat and widgets: Pricing editor; coverage map; requirements editor.
Logic flow and state integrity: Published changes are prospective; existing booking snapshot stays intact.
Cross-integrations: Marketplace, availability, reviews, bookings.
Gala Agent behaviour: Can improve scope/pricing clarity and flag capacity/calendar risk.
Consolidation decision: Service is the core supplier marketplace item.
PROV-012 Package Profile
Route: /provider/packages/[id]
Purpose: Create a reusable commercial package for a venue or service.
Views / sub-tabs: Package | Availability/Rules | Performance.
Page composition and component behaviour: 
•	Included items, duration, capacity range, base price, add-ons, restrictions, setup/travel, booking mode, deposit and cancellation defaults.
•	Package references venue/service resources but does not duplicate their canonical definitions.
Primary actions and lifecycle controls: Edit; duplicate; publish/pause; attach to listing.
Drawers, popovers, chat and widgets: Add-on editor; eligibility rules.
Logic flow and state integrity: Eligibility is checked against event/date/capacity before request.
Cross-integrations: Listings, pricing, availability, bookings.
Gala Agent behaviour: Can assemble common packages from historical booking patterns.
Consolidation decision: One package model supports both venue and service commerce.
PROV-013 Team
Route: /provider/team
Purpose: Manage staff and resource availability for provider delivery.
Views / sub-tabs: People | Availability | Assignments.
Page composition and component behaviour: 
•	People with skills/roles, employment/external status, base location, cost and permissions where member.
•	Availability/assignment views combine bookings, travel and workload.
•	Conflict engine flags overlaps, impossible travel and missing skill/coverage.
Primary actions and lifecycle controls: Add/invite; request availability; assign; create shift; resolve conflict.
Drawers, popovers, chat and widgets: Person drawer; shift/assignment editor.
Logic flow and state integrity: Scoped workers need not receive full workspace access.
Cross-integrations: Bookings, calendar, communications, money.
Gala Agent behaviour: Can allocate people based on skills, location and availability.
Consolidation decision: Team is shared infrastructure across capability modes.
PROV-014 Team Member Profile
Route: /provider/team/[id]
Purpose: Show one provider team person and assignments.
Views / sub-tabs: Overview | Availability | Assignments | Activity.
Page composition and component behaviour: 
•	Contact, role/permissions, skills/certifications, base area, availability, bookings, shifts and cost defaults.
Primary actions and lifecycle controls: Edit; assign; change permission; deactivate; request availability.
Drawers, popovers, chat and widgets: Permission editor; assignment drawer.
Logic flow and state integrity: Permission/HR-sensitive data follows access restrictions.
Cross-integrations: Team, bookings, audit.
Gala Agent behaviour: Can recommend suitable jobs without making unsupported employment decisions.
Consolidation decision: One people profile for all provider modes.
PROV-015 Money
Route: /provider/money
Purpose: Make provider earnings, fees and payouts transparent.
Views / sub-tabs: Overview | Earnings | Payouts | Fees | Statements.
Page composition and component behaviour: 
•	Booking value, deposits/balances, standby/emergency fees, Gala Dock commission, processing/tax line where applicable, refunds and net payout.
•	Subscription card shows current commission rate and projected savings from upgrade using actual volume.
Primary actions and lifecycle controls: Open payout; export statement; resolve issue; change plan.
Drawers, popovers, chat and widgets: Fee explanation; transaction detail; payout support.
Logic flow and state integrity: Every deduction maps to a documented transaction rule.
Cross-integrations: Bookings, payments, subscriptions, tax configuration.
Gala Agent behaviour: Can forecast payouts and show whether a paid plan is economically beneficial.
Consolidation decision: One money surface for venues and suppliers.
PROV-016 Gala Agent
Route: /provider/agent
Purpose: Operate provider commercial response and delivery through the durable Agent framework.
Views / sub-tabs: Work | Approvals | Routines | History.
Page composition and component behaviour: 
•	Venue tools: availability, holds, spaces, packages, quotes, booking/BEO, map constraints, deposits, staffing, turnaround and settlement.
•	Service tools: opportunities, quotes, service availability, staffing/equipment, travel, job sheets, delivery evidence, balances and reviews.
•	Mixed providers receive both tool packs with shared calendar/team/money context.
Primary actions and lifecycle controls: Start run; approve/reject; configure routine; pause/cancel; open run.
Drawers, popovers, chat and widgets: Scope picker; approval drawer; run detail.
Logic flow and state integrity: Agent cannot commit hard-conflicting availability or exceed pricing/discount authority.
Cross-integrations: All provider service layers.
Gala Agent behaviour: Can maintain response SLA, allocate capacity and run pre-event confirmations over time.
Consolidation decision: One Agent runtime, capability-specific tools.
PROV-017 Settings
Route: /provider/settings
Purpose: Manage Provider identity, capabilities and integrations.
Views / sub-tabs: Workspace | Capabilities | Team & Access | Marketplace & Booking Rules | Payments & Billing | Communications | Integrations | Agent | Notifications.
Page composition and component behaviour: 
•	Enable/disable Venue/Services; default response commitment; cancellation templates; hold/standby/emergency policy; payout connection; plan; connected email/calendar; permissions and Agent policy.
Primary actions and lifecycle controls: Edit; connect/disconnect; change plan; enable capability; invite.
Drawers, popovers, chat and widgets: Confirmation modals; integration setup.
Logic flow and state integrity: Disabling a capability never deletes historical listings/bookings; active commitments stay operable.
Cross-integrations: Marketplace, subscriptions, payments, auth, integrations.
Gala Agent behaviour: Can run configuration checks and warn about lost eligibility.
Consolidation decision: One adaptive settings route.
14. Provider Workspace - listing, quote and booking wizards
PROV-W01-01 Add Venue - Identity & Location
Route / state: /provider/venues/new?step=1
Purpose: Create the venue asset.
Fields / components: Venue name; address; type; summary; timezone; contact; starter media.
Dynamic behaviour: Defaults from workspace; venue remains draft.
Validation / blockers: Name/address/type.
Gala Agent assistance: Can structure description and tags.
Navigation: Continue -> step 2.
PROV-W01-02 Add Venue - Spaces, Capacity & Map
Route / state: /provider/venues/new?step=2
Purpose: Create core spaces and structural map.
Fields / components: Spaces; capacities; layouts; access points; fixed features; map import/draw starter.
Dynamic behaviour: Detailed spaces can be refined later; minimum capacity model is required for bookability.
Validation / blockers: Positive capacities and required constraints.
Gala Agent assistance: Can suggest layout templates.
Navigation: Back; Continue -> step 3.
PROV-W01-03 Add Venue - Commercial & Booking Rules
Route / state: /provider/venues/new?step=3
Purpose: Define rates and booking lifecycle.
Fields / components: Pricing mode; minimum spend; deposit; cancellation; lead time; response commitment; enquiry/request/instant; conditional holds; standby/emergency.
Dynamic behaviour: Rules inherit workspace defaults and can override.
Validation / blockers: Compatible response/booking configuration.
Gala Agent assistance: Flags contradictory policies.
Navigation: Back; Continue -> step 4.
PROV-W01-04 Add Venue - Operations & Publish
Route / state: /provider/venues/new?step=4
Purpose: Finish operational constraints and marketplace readiness.
Fields / components: Access/setup; F&B/bar; licenses/compliance; supplier rules; accessibility; preview; publish.
Dynamic behaviour: Publish may require verification.
Validation / blockers: Required compliance and payout readiness.
Gala Agent assistance: Produces readiness checklist.
Navigation: Publish -> PROV-009.
PROV-W02-01 Add Space - Space & Layouts
Route / state: /provider/venues/[id]/spaces/new?step=1
Purpose: Define room/space geometry and use cases.
Fields / components: Name; dimensions; capacity; amenities; access; fixed features; layouts.
Dynamic behaviour: Can inherit venue defaults.
Validation / blockers: Capacity/dimensions where known.
Gala Agent assistance: Suggest layouts.
Navigation: Continue -> step 2.
PROV-W02-02 Add Space - Availability & Commercial
Route / state: /provider/venues/[id]/spaces/new?step=2
Purpose: Set bookability rules.
Fields / components: Availability inheritance; linked/exclusive spaces; turnaround; rate override; minimum duration; publish.
Dynamic behaviour: Space may be operational-only or marketplace-bookable.
Validation / blockers: No conflicting exclusivity rules.
Gala Agent assistance: Checks overlap logic.
Navigation: Save -> PROV-010.
PROV-W03-01 Add Service - Service & Coverage
Route / state: /provider/services/new?step=1
Purpose: Create supplier marketplace offer.
Fields / components: Category; description; delivery mode; coverage/travel; event types; credentials; media.
Dynamic behaviour: Category drives required trust fields.
Validation / blockers: Category and serviceability.
Gala Agent assistance: Suggest taxonomy/description.
Navigation: Continue -> step 2.
PROV-W03-02 Add Service - Pricing & Requirements
Route / state: /provider/services/new?step=2
Purpose: Define how the service is bought and what is required.
Fields / components: Pricing model; rates/packages; add-ons; setup; questions; lead time; cancellation.
Dynamic behaviour: Quote-only may omit public price while optionally showing a range.
Validation / blockers: Valid pricing units/rules.
Gala Agent assistance: Can identify missing cost drivers.
Navigation: Back; Continue -> step 3.
PROV-W03-03 Add Service - Availability & Publish
Route / state: /provider/services/new?step=3
Purpose: Set response/booking mode and publish.
Fields / components: Availability; capacity; response commitment; instant/request/enquiry; hold; standby/emergency; preview.
Dynamic behaviour: Emergency/instant eligibility depends on trust/reliability/configuration.
Validation / blockers: Required verification/payment readiness.
Gala Agent assistance: Readiness/risk checks.
Navigation: Publish -> PROV-011.
PROV-W04-01 Create Package - Offer
Route / state: /provider/packages/new?step=1
Purpose: Bundle venue/service inventory into a reusable offer.
Fields / components: Parent venue/service; name; inclusions; duration; capacity; add-ons; description.
Dynamic behaviour: Parent constraints propagate.
Validation / blockers: Parent/included items valid.
Gala Agent assistance: Suggest common bundle.
Navigation: Continue -> step 2.
PROV-W04-02 Create Package - Pricing, Rules & Publish
Route / state: /provider/packages/new?step=2
Purpose: Set package commercial rules.
Fields / components: Price; deposit; availability; booking mode; cancellation; restrictions; publish.
Dynamic behaviour: Existing bookings retain a package snapshot.
Validation / blockers: Valid price/rules.
Gala Agent assistance: Check margin/availability constraints.
Navigation: Publish -> PROV-012.
PROV-W05-01 Respond with Quote - Scope & Price
Route / state: /provider/opportunities/[id]/quote?step=1
Purpose: Build the provider response.
Fields / components: Scope/items; date/time; staff/space/equipment; price; travel/setup; deposit; hold/standby option.
Dynamic behaviour: Prefills from opportunity/listing.
Validation / blockers: No hard conflict; valid price.
Gala Agent assistance: Drafts quote and flags margin/conflict issues.
Navigation: Continue -> step 2.
PROV-W05-02 Respond with Quote - Review & Send
Route / state: /provider/opportunities/[id]/quote?step=2
Purpose: Confirm terms and respond before deadline.
Fields / components: Summary; exclusions; cancellation; validity; response state; message.
Dynamic behaviour: Sending marks the request Responded.
Validation / blockers: All required terms.
Gala Agent assistance: Draft response message.
Navigation: Send -> PROV-004.
PROV-W06-01 Create Venue Booking - Event & Client
Route / state: /provider/bookings/new?step=1
Purpose: Create a direct/off-platform-sourced venue booking in Provider operations.
Fields / components: Event/client; date/time; guests; event type; contact; source.
Dynamic behaviour: May create/link a Gala Dock event shell.
Validation / blockers: Date/client/context.
Gala Agent assistance: Can structure event summary.
Navigation: Continue -> step 2.
PROV-W06-02 Create Venue Booking - Space & Package
Route / state: /provider/bookings/new?step=2
Purpose: Reserve venue inventory.
Fields / components: Space(s); layout; package; setup/breakdown; capacity; hold/confirmed state.
Dynamic behaviour: Calendar conflict checking is real-time.
Validation / blockers: No hard conflict; capacity valid.
Gala Agent assistance: Suggest suitable space/layout.
Navigation: Back; Continue -> step 3.
PROV-W06-03 Create Venue Booking - Commercial & Confirm
Route / state: /provider/bookings/new?step=3
Purpose: Set commercial terms and create booking.
Fields / components: Hire/F&B/minimum spend; line items; deposit; payment schedule; cancellation; notes.
Dynamic behaviour: Creates booking snapshot and calendar occupancy.
Validation / blockers: Commercial/calendar validity.
Gala Agent assistance: Checks terms and profitability.
Navigation: Confirm -> PROV-006.
```
