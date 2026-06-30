<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
<!-- BEGIN:gala-dock-identity-note -->
<!--
  PROJECT IDENTITY — READ FIRST.
  This project is **Gala Dock** (package: gala-dock-final-release-v.1.0), an Event Delivery OS /
  multi-sided events platform — NOT a property-management product.

  This AGENTS.md release-readiness contract was originally adapted from the sibling project
  "Propvora". All occurrences of the name "Propvora" have been renamed to "Gala Dock". Some
  domain wording inherited from that template (e.g. "property-manager" routes, "tenancy",
  "property/operator", "compliance certificates", "arrears") still reflects the property domain.
  When a checklist item references those, READ IT AS THE GALA DOCK EVENT-DOMAIN EQUIVALENT:
    - "property-manager workspace" -> the Gala Dock app workspace (organizer/venue/supplier)
    - benchmark route "/property-manager/home" -> "/home"; app routes live under src/app/(app)/*
    - property / unit / tenancy -> event / venue / booking
    - tenant / landlord -> client / customer ; supplier stays supplier
    - compliance certs / arrears -> supplier docs+insurance / overdue invoices
  Canonical product plan: docs/MASTER-PLAN.md, docs/specs/README.md, docs/audits/*.
-->
<!-- END:gala-dock-identity-note -->
Claude Code: before doing anything, read CLAUDE.md and AGENTS.md in full and follow them as the standing project rules. Then treat the section checklist pasted below as the exact release-readiness contract for this Gala Dock area: inspect the real app with Chrome MCP across desktop/tablet/mobile/PWA, click and test every relevant route/control/action, fix all UI, data, Supabase/RLS, permissions, feature flags, gates, integrations, tests and security issues, create the required /release-gated/docs/... and /release-gated/user-fixes/... files, and do not mark complete until the section is 100/100 release-ready.

___________________________________________________________________
Section 1: Main Section / Overview Section — Final Release Readiness Audit
Use Chrome MCP resize windows and test code too: UI function, database, Supabase/RLS, edge functions, integration tests, unit tests, E2E customer stories, security, performance and production readiness.
Head Section:
Section Name:
Section Route:
________________________________________
1. Route, Shell, Navigation & Page Structure
1.	Confirm the main section route loads correctly.
2.	Confirm the route is registered in the route registry.
3.	Confirm the route is registered in the sidebar/menu config.
4.	Confirm the route is registered in the breadcrumb config.
5.	Confirm the route is registered in the permission map.
6.	Confirm the route is reachable from every intended navigation path, not only by direct URL.
7.	Confirm deep-link access works when pasting the URL into a fresh browser session.
8.	Confirm hard refresh loads the same section correctly.
9.	Confirm browser back/forward behaviour works correctly.
10.	Confirm unauthenticated users are redirected correctly.
11.	Confirm users without workspace access are blocked with the correct 403/no-access state.
12.	Confirm old, renamed or duplicate routes redirect correctly.
13.	Confirm the correct app shell loads for the surface: property-manager workspace, portal or admin.
14.	Confirm the correct sidebar is shown.
15.	Confirm the correct top nav is shown.
16.	Confirm the correct breadcrumbs are shown.
17.	Confirm the page title and browser title are correct.
18.	Confirm the H1, subtitle and section description are clear and consistent.
19.	Confirm the active sidebar item is correct.
20.	Confirm this route does not expose sections hidden by role, plan, add-on or feature flag.
________________________________________
2. Header, Layout, Width & Premium Styling
21.	Confirm header layout is consistent with the benchmark at /home.
22.	Confirm page width aligns with the global shell/max-width system.
23.	Confirm page edges align with the top nav, quick nav and content grid.
24.	Confirm borders, padding, spacing and gutters are consistent.
25.	Confirm the section header, KPI row, action bar and main content grid align to the same width.
26.	Confirm the page does not use random max-widths, one-off padding or inconsistent shell alignment.
27.	Confirm cards, panels and containers use Gala Dock design tokens.
28.	Confirm colours, typography, borders, shadows, icons, badges and radii match the Gala Dock premium system.
29.	Confirm no hard-coded one-off colours, sizes or spacing are used where shared tokens should be used.
30.	Confirm white-label branding flows into logos, brand colours, buttons, emails, PDFs and portal surfaces where relevant.
31.	Confirm sticky headers/action bars do not overlap content.
32.	Confirm the page does not visually clash with other Gala Dock sections.
33.	Confirm any required UI upgrade is completed to reach premium release quality.
34.	Confirm any missing shared components are added or replaced with existing Gala Dock primitives.
35.	Confirm styling is consistent across desktop, tablet, mobile and PWA.
________________________________________
3. KPI Cards, Summary Cards & Overview Data
36.	Confirm KPI/stat cards use consistent styling, sizing, spacing and data logic.
37.	Confirm all KPI/stat values use real data, not mock data.
38.	Confirm no fake metrics, placeholder cards or decorative-only stats remain.
39.	Confirm KPI calculations are correct.
40.	Confirm KPI counts update after create, edit, delete, archive, restore and status changes.
41.	Confirm KPI cards respect workspace, property/operator context, role, RLS, plan gates and add-on gates.
42.	Confirm KPI badges, risk badges, financial values and status colours are consistent.
43.	Confirm dates, currencies, property counts and financial figures format correctly for UK users.
44.	Confirm timezone handling is correct for deadlines, reminders, compliance dates, calendar links and activity logs.
45.	Confirm KPI loading states match final layout and do not cause layout shift.
46.	Confirm KPI empty states are useful.
47.	Confirm KPI errors are handled clearly and safely.
________________________________________
4. Main Content, Views, Filters, Search & Sorting
48.	Confirm main content uses the correct shared components: tables, cards, boards, timelines, calendars, maps or reports where relevant.
49.	Confirm list/card/table/board/calendar/map views work where included on the overview page.
50.	Confirm view toggles work and persist where intended.
51.	Confirm filters work correctly.
52.	Confirm search works correctly.
53.	Confirm sorting works correctly.
54.	Confirm clearing filters returns the correct default state.
55.	Confirm search/filter results update counts, KPI cards and empty states correctly.
56.	Confirm sort order is logical and stable, especially for dates, risk, money, status and names.
57.	Confirm pagination or infinite loading works and does not duplicate, skip or misorder records.
58.	Confirm large data states work, not only tiny seed data.
59.	Confirm no placeholder rows, fake records, lorem ipsum or disconnected demo data remain unless clearly marked as demo data.
60.	Confirm all data shown belongs to the active workspace and active property/operator context.
61.	Confirm nested records shown on the overview page are scoped to the correct workspace, property, unit, tenancy, supplier, contact or user where relevant.
62.	Confirm exports use the current filters, sorting, search and workspace scope.
63.	Confirm imported/exported CSV/PDF data matches on-screen values.
64.	Confirm print/PDF/report views work where relevant.
________________________________________
5. Buttons, Quick Actions & Functional Wiring
65.	Confirm every button routes correctly or performs the correct action.
66.	Confirm quick actions are useful, working and not duplicated.
67.	Confirm every CTA opens the correct wizard, modal, detail route, report, export or workflow.
68.	Confirm disabled buttons have a clear reason: permission, plan, add-on, feature flag, locked state or missing required data.
69.	Confirm no dead buttons, fake submit buttons or placeholder flows remain.
70.	Confirm destructive actions have confirmation, permission checks and audit logs.
71.	Confirm save/create/status actions prevent duplicate submissions.
72.	Confirm double-clicking create/save/action buttons does not create duplicate records.
73.	Confirm optimistic UI changes roll back correctly after failed saves.
74.	Confirm cache invalidation works after create, edit, delete, archive, restore and status changes.
75.	Confirm realtime updates work where expected, or that refresh behaviour is clear.
76.	Confirm all user-facing functions in the overview section are tested end to end.
77.	Confirm actions created here appear in all expected connected sections.
78.	Confirm records changed elsewhere update this overview section correctly.
________________________________________
6. Auth, Roles, RLS, Feature Flags, Plans & Add-ons
79.	Confirm auth protection is enforced.
80.	Confirm users with limited roles see only allowed actions, fields, cards, records and data.
81.	Confirm hidden or disabled actions cannot still be triggered through direct API calls.
82.	Confirm permissions/RLS prevent cross-workspace leakage.
83.	Confirm positive RLS tests pass for allowed users.
84.	Confirm negative RLS tests fail for wrong workspace, wrong role, wrong user, wrong parent record, missing subscription, missing add-on and disabled feature flag.
85.	Confirm Supabase queries are scoped by workspace_id, user role and relevant parent context.
86.	Confirm direct API/RPC calls cannot read, create, update, delete, upload, export or trigger actions outside permission.
87.	Confirm add-on gating works if an add-on is required.
88.	Confirm subscription gating works if a subscription level is required.
89.	Confirm feature flag gating works independently from subscription/add-on gating.
90.	Confirm feature flags can be controlled from Platform Admin where required.
91.	Confirm disabled feature-flagged areas do not leak through nav, search, direct URLs, APIs, dashboards, reports, notifications, AI or automations.
92.	Confirm plan gates, add-on gates, role gates and feature flags do not conflict.
93.	Confirm upgrade/paywall states clearly explain the required plan/add-on and route correctly to billing.
________________________________________
7. Empty, Loading, Error, Blocked & Upgrade States
94.	Confirm empty states exist.
95.	Confirm loading states exist.
96.	Confirm error states exist.
97.	Confirm blocked/no-access states exist.
98.	Confirm upgrade/paywall states exist where relevant.
99.	Confirm all empty states have useful copy, CTA and correct permissions logic.
100.	Confirm all blocked states explain why the user cannot access something.
101.	Confirm error states include safe support/debug references without exposing sensitive details.
102.	Confirm loading skeletons match the final layout and do not cause layout shift.
103.	Confirm error boundaries catch route/component failures properly.
104.	Confirm no white-screen states remain.
105.	Confirm no broken imports, lazy-load failures or missing chunks remain.
106.	Confirm no console errors, React warnings, hydration warnings or failed network requests appear.
________________________________________
8. Cross-Section Integrations
107.	Confirm the section wires correctly into activity feeds where relevant.
108.	Confirm activity feed events are human-readable and link back to the correct record.
109.	Confirm audit logs capture who did what, when, from which workspace and which record changed.
110.	Confirm this section wires into Account Settings where required.
111.	Confirm this section wires into Workspace Settings where required.
112.	Confirm this section wires into Billing Settings where required.
113.	Confirm this section integrates with global search where relevant.
114.	Confirm this section integrates with notifications/reminders where relevant.
115.	Confirm notifications are triggered only where intended.
116.	Confirm notification preferences are respected.
117.	Confirm email/SMS/in-app notifications do not send in test/demo mode unless explicitly allowed.
118.	Confirm this section integrates with AI Copilot only where useful.
119.	Confirm Copilot grounding respects route context, workspace context and permissions.
120.	Confirm Copilot cannot reveal records the user cannot access.
121.	Confirm automations triggered from this section are gated, logged and testable.
122.	Confirm automation actions from this section do not duplicate, loop or bypass permissions.
123.	Confirm help/docs/tooltips exist for complex actions.
124.	Confirm support/admin can diagnose issues from logs without exposing sensitive customer data.
125.	Confirm workspace switching refreshes this route cleanly and does not show stale data.
________________________________________
9. Files, Storage, SMTP & External Services
126.	Confirm R2/file upload really works where this section allows uploads.
127.	Confirm uploaded files/images use secure storage-backed flows, not pasted external URLs.
128.	Confirm public/private file URLs are not exposed incorrectly.
129.	Confirm signed/private file access is used where required.
130.	Confirm file previews handle missing, deleted, large, unsupported and malicious file types safely.
131.	Confirm file type, size, permission and storage-path validation exists where uploads are allowed.
132.	Confirm uploaded files are scoped to the correct workspace and record.
133.	Confirm document/file actions are audit-logged where required.
134.	Confirm SMTP/email sending works where this section sends emails, invites, reminders, notices or alerts.
135.	Confirm email templates use correct workspace branding, sender, reply-to and variables.
136.	Confirm external integrations used by this section are wired, gated and tested.
137.	Confirm failed integration calls show clear errors and do not corrupt local state.
________________________________________
10. Database, Schema, Edge Functions & Migrations
138.	Confirm database tables used by this route exist.
139.	Confirm frontend fields align with database schema columns.
140.	Confirm schema columns, enums, defaults, timestamps and constraints are correct.
141.	Confirm foreign keys and parent-child relationships are correct.
142.	Confirm required IDs, unique rules, status values and indexes exist.
143.	Confirm RLS policies allow correct access and block incorrect access.
144.	Confirm related edge functions have auth, workspace ownership checks, input validation, rate limits and structured errors.
145.	Confirm Supabase functions/RPCs cannot be abused cross-workspace.
146.	Confirm migrations apply cleanly.
147.	Confirm migrations can be reproduced from a fresh database.
148.	Confirm rollback/manual fix notes are written where migrations require user action.
149.	Confirm all migrations that can be done with PAT are completed.
150.	Confirm backup/PITR expectations are documented if this area handles critical customer data.
________________________________________
11. Responsive, PWA, Accessibility & Browser QA
151.	Confirm responsive behaviour at 1440, 1280, 1024, tablet, mobile and PWA sizes.
152.	Confirm Chrome MCP/browser QA has been run at all required screen sizes.
153.	Confirm mobile layout remains usable.
154.	Confirm mobile/PWA safe-area spacing works for iOS/Android.
155.	Confirm tablet layout is clean and not cramped.
156.	Confirm PWA tabbing or compact navigation uses dropdown patterns where required.
157.	Confirm tablet tabbing or compact navigation uses sliding menu patterns where required.
158.	Confirm touch targets are large enough on tablet/mobile.
159.	Confirm keyboard navigation works for header actions, filters, menus, buttons, modals and overview controls.
160.	Confirm focus states are visible and consistent.
161.	Confirm WCAG contrast passes for text, badges, buttons, alerts, disabled states and cards.
162.	Confirm screen-reader labels exist for icon-only buttons, menus, filters, status badges and important controls.
163.	Confirm screenshots/evidence are saved for before/after if visual repair was needed.
164.	Confirm visual regression checks are run against the benchmark styling and shell alignment.
________________________________________
12. Testing, Security, Performance & Stress Checks
165.	Run unit tests for the overview route.
166.	Run integration tests for the overview route.
167.	Run saving and persistence tests.
168.	Run full E2E customer story tests.
169.	Run security tests.
170.	Run RLS positive tests.
171.	Run RLS negative tests.
172.	Run visual regression tests.
173.	Run relevant edge-function tests.
174.	Run realistic stress tests.
175.	Run DDoS/rate-limit tests proportionately against exposed endpoints, not destructively against production.
176.	Confirm stress tests include realistic property, tenancy, work, compliance, finance, document and activity-feed volumes where relevant.
177.	Confirm route load time passes the release performance budget.
178.	Confirm bundle size is acceptable.
179.	Confirm Supabase query speed is acceptable.
180.	Confirm large dataset behaviour is acceptable.
181.	Confirm no N+1 query patterns exist.
182.	Confirm no expensive dashboard queries run unnecessarily.
183.	Confirm rate limiting/throttling applies to expensive route actions, AI actions, exports, uploads and automations.
184.	Confirm observability exists: frontend errors, backend errors, slow queries, failed API calls and failed edge functions.
185.	Confirm logs are safe and do not expose sensitive customer data.
________________________________________
13. Product Scope, Redundancy & Bloat Review
186.	Confirm this overview section has a clear customer purpose.
187.	Confirm this section is production-useful and not decorative.
188.	Confirm this section does not duplicate another area unnecessarily.
189.	Confirm anything duplicated from elsewhere is removed, merged or feature-flagged.
190.	Confirm any redundant cards, buttons, stats, tabs or panels are removed.
191.	Confirm this section does not create unnecessary V1 bloat.
192.	Confirm the section should not be merged elsewhere.
193.	Confirm advanced/unreleased functionality is hidden behind feature flags.
194.	Confirm all remaining features in this section are valuable for the release.
195.	Confirm the page is ready for production, not just visually acceptable.
________________________________________
14. Release Evidence Document & Final Score
196.	Create a release evidence document for this section at /release-gated/docs/{section-name}.md.
197.	The document must include the section name and route.
198.	The document must include the screen sizes tested.
199.	The document must include screenshots/evidence tested.
200.	The document must include routes tested.
201.	The document must include buttons/actions tested.
202.	The document must include filters/search/sorting/views tested.
203.	The document must include data sources tested.
204.	The document must include Supabase tables checked.
205.	The document must include RLS policies checked.
206.	The document must include edge functions checked.
207.	The document must include storage buckets checked where relevant.
208.	The document must include integrations checked where relevant.
209.	The document must include bugs found.
210.	The document must include fixes made.
211.	The document must include migrations applied.
212.	The document must include tests run.
213.	The document must include performance/security findings.
214.	The document must include cross-section effects checked.
215.	The document must include any pending user/manual actions.
216.	Add anything Claude Code cannot complete manually to /release-gated/user-fixes/{section-name}.md with exact steps.
217.	Give the section a release score out of 100.
218.	Fix all issues until the section reaches 100/100.
219.	Do not mark this section complete below 100/100.
220.	Confirm final release decision states one of: ready for release, ready behind feature flag, ready for admin-only beta, blocked pending manual fix, or removed/merged due to bloat.




________________________________________________________________
Section 2: Sub-Tab Sections — Final Release Readiness Audit
Use Chrome MCP resize windows and test code too: UI function, database, Supabase/RLS, edge functions, unit tests, integration tests, saving/persistence tests, E2E customer stories, security, performance and production readiness.
Head Section:
Parent Section Name:
Sub-Tab Section Name:
Sub-Tab Route:
Required Plan / Add-on / Feature Flag
Roles Tested: Owner / Admin / Manager / Team Member / Read-only / Accountant / Portal User / Platform Admin
________________________________________
1. Sub-Tab Route, Registration & Parent Context
1.	Confirm the sub-tab is registered in the route registry.
2.	Confirm the sub-tab is registered in the tab registry.
3.	Confirm the sub-tab is registered in the parent section config.
4.	Confirm the sub-tab is registered in the sidebar/menu config where relevant.
5.	Confirm the sub-tab is registered in the breadcrumb config.
6.	Confirm the sub-tab is registered in the permission map.
7.	Confirm the sub-tab is registered in the feature flag map where relevant.
8.	Confirm the sub-tab is registered in the subscription/add-on gate map where relevant.
9.	Confirm the sub-tab route loads correctly.
10.	Confirm the sub-tab is reachable by clicking through the parent section UI, not only by direct URL.
11.	Confirm the sub-tab deep link works when pasted into a fresh browser session.
12.	Confirm the sub-tab reloads correctly on hard refresh.
13.	Confirm hard refresh does not lose workspace context.
14.	Confirm hard refresh does not lose parent section context.
15.	Confirm browser back/forward behaviour works across parent section → sub-tab → previous route.
16.	Confirm route state, query params and selected tab state behave correctly.
17.	Confirm parent section context is preserved when moving between sibling tabs.
18.	Confirm parent workspace, property, operator, user or portal context does not reset when clicking this sub-tab.
19.	Confirm old, renamed or duplicate sub-tab routes redirect correctly.
20.	Confirm tab URLs use clean, predictable route patterns.
21.	Confirm no duplicate route variants exist for the same sub-tab.
22.	Confirm unauthenticated users are redirected correctly from this sub-tab route.
23.	Confirm users without workspace access are blocked with the correct 403/no-access state.
24.	Confirm users with limited roles can only open permitted sub-tabs.
25.	Confirm hidden or disabled sub-tabs cannot still be opened through direct URL.
26.	Confirm hidden or disabled sub-tab actions cannot be triggered through direct API calls.
________________________________________
2. Tab Navigation, Naming & State Behaviour
27.	Confirm the sub-tab appears in the correct parent tab group.
28.	Confirm the sub-tab order is logical and consistent across Gala Dock.
29.	Confirm the sub-tab name is clear, customer-friendly and not duplicated elsewhere.
30.	Confirm the tab name, H1, breadcrumb and browser title are consistent.
31.	Confirm active tab styling is correct.
32.	Confirm hover, focus, disabled and locked tab states match Gala Dock design tokens.
33.	Confirm active tab state survives refresh where intended.
34.	Confirm active tab state survives browser back/forward where intended.
35.	Confirm active tab state behaves correctly after workspace switching.
36.	Confirm query params, filters, search terms and view state are either intentionally preserved or intentionally cleared.
37.	Confirm tab count badges are accurate.
38.	Confirm status badges are accurate.
39.	Confirm notification badges are accurate.
40.	Confirm tab badges are live and permission-aware.
41.	Confirm tab badge colours follow Gala Dock brand/status tokens.
42.	Confirm tab counts update after create, edit, delete, archive, restore and status changes.
43.	Confirm the sub-tab has a clear product purpose.
44.	Confirm the sub-tab is not a dumping ground for unrelated records.
45.	Confirm the sub-tab does not duplicate a feature already handled better in another section.
46.	Confirm any duplicated function is removed, merged or feature-flagged.
47.	Confirm the sub-tab should remain a first-level sub-tab and should not be merged, promoted or removed.
48.	Confirm the sub-tab does not create unnecessary V1 release bloat.
________________________________________
3. Shell, Header, Width & Premium Styling
49.	Confirm the correct app shell loads for the surface: property-manager workspace, portal or admin.
50.	Confirm the correct sidebar is shown.
51.	Confirm the correct top nav is shown.
52.	Confirm the correct breadcrumbs are shown.
53.	Confirm header layout is consistent with the benchmark at /home.
54.	Confirm the sub-tab header layout is consistent with the rest of Gala Dock.
55.	Confirm page width aligns with the global shell/max-width system.
56.	Confirm the sub-tab header, filter bar, cards, tables and action bars align exactly to the global shell width.
57.	Confirm borders, padding, spacing and gutters are consistent.
58.	Confirm content does not use random max-widths, one-off padding or inconsistent alignment.
59.	Confirm sticky filters/action bars do not overlap content on desktop, tablet, mobile or PWA.
60.	Confirm cards, tables, boards, timelines, calendars, maps and panels use shared Gala Dock primitives.
61.	Confirm no one-off component exists where a shared component should be used.
62.	Confirm the tab uses shared design tokens and does not contain hard-coded colours, widths, shadows or typography.
63.	Confirm typography, icons, badges, buttons, cards, borders, radii and shadows match the Gala Dock premium system.
64.	Confirm white-label branding flows into this tab where relevant: logos, colours, button accents, portals, emails, documents and PDFs.
65.	Confirm any required UI upgrade is completed to reach premium release quality.
66.	Confirm any missing shared component is added or replaced with the correct Gala Dock primitive.
67.	Confirm styling is consistent across desktop, tablet, mobile and PWA.
________________________________________
4. Responsive, Tablet, Mobile & PWA Behaviour
68.	Confirm responsive behaviour at 1440, 1280, 1024, tablet, mobile and PWA sizes.
69.	Confirm Chrome MCP/browser QA has been run at all required screen sizes.
70.	Confirm the sub-tab remains usable at 1440.
71.	Confirm the sub-tab remains usable at 1280.
72.	Confirm the sub-tab remains usable at 1024.
73.	Confirm tablet layout is clean and not cramped.
74.	Confirm mobile layout is usable.
75.	Confirm mobile/PWA tabbing is converted to a clean dropdown selector where required.
76.	Confirm tablet tabbing is converted to a sliding segmented tab menu where required.
77.	Confirm sub-tab content does not create horizontal scroll on mobile unless intentionally designed.
78.	Confirm sticky action bars do not overlap content on mobile or PWA.
79.	Confirm mobile safe-area spacing works for iOS/Android PWA.
80.	Confirm touch targets are large enough on tablet and mobile.
81.	Confirm screenshots are captured for the sub-tab at all required screen sizes.
82.	Confirm before/after screenshots are saved where visual repair was required.
83.	Confirm visual regression checks are run against benchmark styling and shell alignment.
________________________________________
5. Data, KPI Cards, Views & Content Quality
84.	Confirm all data in the sub-tab loads correctly.
85.	Confirm all data is live from Supabase or the correct integration where required.
86.	Confirm no mock data, stale data or fake metrics remain.
87.	Confirm no lorem ipsum, placeholder names, fake suppliers, fake tenants, fake payments, fake documents, placeholder images or disconnected mock cards remain unless clearly demo-only.
88.	Confirm onboarding/demo seed data is realistic, sector-specific, enriched and clearly marked as demo data if demo-only.
89.	Confirm KPI/stat cards use consistent styling, sizing, spacing and data logic where included.
90.	Confirm KPI/stat values are calculated correctly.
91.	Confirm KPI/stat values update after create, edit, delete, archive, restore and status changes.
92.	Confirm tables use useful columns for the sub-tab’s real customer story.
93.	Confirm card fields are useful for the sub-tab’s real customer story.
94.	Confirm board lanes are useful for the sub-tab’s real customer story.
95.	Confirm calendar/timeline/map/list layouts are useful where present.
96.	Confirm columns and fields do not expose sensitive data to restricted roles.
97.	Confirm dates, currencies, percentages, rent, arrears, deposits, invoices and property values format correctly for UK users.
98.	Confirm date filters handle UK timezone, deadlines, reminders and compliance dates correctly.
99.	Confirm status badges, risk badges, financial badges and workflow badges are consistent.
100.	Confirm the sub-tab has useful empty states.
101.	Confirm the sub-tab has clear loading states.
102.	Confirm the sub-tab has safe error states.
103.	Confirm loading skeletons match the final tab layout and do not cause layout shift.
104.	Confirm error boundaries catch tab/component failures without breaking the whole parent section.
105.	Confirm no console errors, React warnings, hydration warnings, failed network calls, broken chunks or white-screen states appear when using the tab.
________________________________________
6. Filters, Search, Sorting, Saved Views & Pagination
106.	Confirm filters work correctly.
107.	Confirm search works correctly.
108.	Confirm sorting works correctly.
109.	Confirm view switchers work correctly.
110.	Confirm view switchers persist correctly where expected.
111.	Confirm filter chips are styled consistently.
112.	Confirm saved views work where supported.
113.	Confirm advanced filters work where supported.
114.	Confirm saved views do not leak across workspaces or users unless intentionally shared.
115.	Confirm clearing filters returns the correct default tab state.
116.	Confirm filters update table/card counts, KPI cards and empty states correctly.
117.	Confirm search handles no results.
118.	Confirm search handles partial matches.
119.	Confirm search handles special characters.
120.	Confirm search handles case differences.
121.	Confirm search handles large datasets.
122.	Confirm sorting is stable for dates, money, risk, compliance, status and names.
123.	Confirm pagination or infinite scroll works.
124.	Confirm pagination or infinite scroll does not duplicate records.
125.	Confirm pagination or infinite scroll does not skip records.
126.	Confirm pagination or infinite scroll does not misorder records.
127.	Confirm large dataset testing is performed, not only tiny demo data.
128.	Confirm exports use the same filters, search and sorting currently shown on-screen.
129.	Confirm import actions validate file type, file size, schema, duplicate records and workspace ownership where imports exist.
________________________________________
7. Buttons, Actions, Inline Editing & Bulk Actions
130.	Confirm every button inside the sub-tab works.
131.	Confirm every row action works.
132.	Confirm every card action works.
133.	Confirm every quick action works.
134.	Confirm every dropdown/menu action works.
135.	Confirm every action routes to the correct wizard, modal, detail page, export, import, status workflow or external integration.
136.	Confirm disabled buttons have a reason, tooltip or upgrade/permission explanation.
137.	Confirm no dead buttons, placeholder cards, fake actions or fake submit flows remain.
138.	Confirm inline editing works where included.
139.	Confirm inline edits persist after refresh.
140.	Confirm inline edits validate field type, permissions, required values and business rules.
141.	Confirm failed inline edits show a clear error.
142.	Confirm failed inline edits roll back optimistic UI correctly.
143.	Confirm double-clicking save/create/status/action buttons does not create duplicate records.
144.	Confirm backend idempotency or constraints prevent duplicate submissions where needed.
145.	Confirm destructive actions have confirmation, permission checks and audit logs.
146.	Confirm archive, delete and restore behaviour is consistent with the rest of Gala Dock.
147.	Confirm bulk actions work where included.
148.	Confirm bulk actions respect selected records.
149.	Confirm bulk actions respect current filters.
150.	Confirm bulk actions respect workspace boundaries.
151.	Confirm bulk actions respect role, plan, add-on and feature flag permissions.
152.	Confirm export/download actions are permission-gated.
153.	Confirm export/download actions are audit-logged where required.
154.	Confirm all user-facing functions in this sub-tab are tested end to end.
________________________________________
8. Status, Workflow & Business Logic
155.	Confirm status workflows are enforced by code, not just frontend labels.
156.	Confirm invalid status transitions are blocked by backend/RPC/database rules.
157.	Confirm valid status transitions work correctly.
158.	Confirm status changes create activity feed entries where required.
159.	Confirm status changes create audit log entries where required.
160.	Confirm status changes trigger notifications where required.
161.	Confirm status changes update connected dashboards, KPI cards, lists, detail pages and reports.
162.	Confirm business rules are enforced consistently on frontend and backend.
163.	Confirm locked, archived, completed or restricted records cannot be changed incorrectly.
164.	Confirm created records have correct default status.
165.	Confirm child records are scoped to the correct workspace, property, unit, tenancy, supplier, contact, invoice, job, compliance item or planning profile where relevant.
________________________________________
9. Auth, Roles, RLS, Feature Flags, Plans & Add-ons
166.	Confirm auth protection is enforced.
167.	Confirm users with limited roles only see allowed actions, fields, records, buttons, exports and bulk actions.
168.	Confirm permissions/RLS apply correctly.
169.	Confirm RLS prevents cross-workspace leakage.
170.	Confirm Supabase queries are scoped by workspace_id, property_id, organisation_id, user role and relevant parent record where required.
171.	Confirm positive RLS tests pass for allowed users.
172.	Confirm negative RLS tests fail for wrong workspace, wrong role, wrong plan, wrong parent record and direct API access.
173.	Confirm direct API/RPC calls cannot read, create, update, delete, export, import or trigger actions outside the user’s permissions.
174.	Confirm related edge functions validate auth.
175.	Confirm related edge functions validate workspace ownership.
176.	Confirm related edge functions validate input shape.
177.	Confirm related edge functions enforce rate limits.
178.	Confirm related edge functions return structured errors.
179.	Confirm add-on gating works if an add-on is required.
180.	Confirm subscription gating works if a subscription level is required.
181.	Confirm feature flag gating works for the tab, tab actions, related APIs, search, exports, dashboards and direct URLs.
182.	Confirm disabled feature-flagged sub-tabs do not leak through nav, breadcrumbs, command/search, direct URL, API, admin views or reports.
183.	Confirm subscription gates and add-on gates are separate from feature flags and do not conflict.
184.	Confirm upgrade states clearly explain the required plan/add-on and link correctly to billing.
185.	Confirm hidden or disabled sub-tab actions cannot still be triggered through direct API calls.
________________________________________
10. Cross-Section Integrations, Activity, Notifications, AI & Automations
186.	Confirm the sub-tab wires correctly into activity feeds where relevant.
187.	Confirm activity feed entries are human-readable.
188.	Confirm activity feed entries link back to the correct record and sub-tab.
189.	Confirm audit logs are written for key actions.
190.	Confirm audit logs capture user ID, workspace ID, record ID, action type, timestamp and source route.
191.	Confirm the sub-tab wires into Account Settings if required.
192.	Confirm the sub-tab wires into Workspace Settings if required.
193.	Confirm the sub-tab wires into Billing Settings if required.
194.	Confirm the sub-tab updates all connected dashboards, KPI cards, detail pages and reports after a change.
195.	Confirm records created in this sub-tab appear in all expected cross-sections.
196.	Confirm records edited, deleted or archived here update all connected sections.
197.	Confirm notification preferences are respected for actions triggered from this tab.
198.	Confirm email/SMS/in-app notifications do not fire unexpectedly during demo/test mode.
199.	Confirm SMTP/email flows are tested if the tab sends invitations, reminders, invoices, notices or alerts.
200.	Confirm AI Copilot actions on this tab are useful, grounded, permission-gated and audit-logged.
201.	Confirm Copilot cannot reveal records hidden by RLS, role gates, plan gates or feature flags.
202.	Confirm AI actions include rate limits, usage tracking and clear failure states.
203.	Confirm automation triggers/actions connected to this tab are gated, logged, rate-limited and testable.
204.	Confirm automation changes do not run twice from repeated tab visits or duplicate events.
205.	Confirm support/platform admin can diagnose issues without exposing sensitive customer data.
________________________________________
11. Files, Uploads, Storage, SMTP & External Services
206.	Confirm R2 upload works where this sub-tab supports uploads.
207.	Confirm uploaded files/images use R2/storage-backed upload-only flows, not pasted external URLs.
208.	Confirm uploads are workspace-scoped and record-scoped.
209.	Confirm public/private file URLs are not exposed incorrectly.
210.	Confirm signed/private access is used where required.
211.	Confirm file previews handle missing, deleted, large, unsupported and malicious files safely.
212.	Confirm upload validation covers file size, file type, permissions, workspace ownership and storage path security.
213.	Confirm uploaded files attach to the correct record.
214.	Confirm document/file actions are audit-logged where required.
215.	Confirm SMTP/email flows work where this sub-tab sends emails, invites, reminders, notices, invoices or alerts.
216.	Confirm email templates use correct workspace branding, sender, reply-to and variables.
217.	Confirm failed external integration calls show clear errors and do not corrupt local state.
________________________________________
12. Database, Schema, Constraints, Migrations & Seeds
218.	Confirm database tables used by this sub-tab exist.
219.	Confirm frontend fields align with database schema columns.
220.	Confirm schema columns, enums, defaults, timestamps and constraints are correct.
221.	Confirm all required foreign keys exist.
222.	Confirm all required parent-child relationships exist.
223.	Confirm all required unique rules exist.
224.	Confirm all required status values exist.
225.	Confirm all required indexes exist.
226.	Confirm RLS policies allow correct access and block incorrect access.
227.	Confirm related edge functions/RPCs cannot be abused cross-workspace.
228.	Confirm migrations for this sub-tab apply cleanly.
229.	Confirm migrations can be reproduced from a fresh database.
230.	Confirm all migrations that can be done with PAT are completed.
231.	Confirm rollback/manual fix notes are written where migrations require user action.
232.	Confirm seed data for this tab is realistic, sector-specific, enriched and safe to show.
233.	Confirm demo data is clearly marked as demo-only where applicable.
234.	Confirm backup/PITR expectations are documented if this sub-tab handles critical customer data.
________________________________________
13. Accessibility, Browser QA, Performance & Observability
235.	Confirm keyboard navigation works across tabs, filters, menus, tables, cards, forms and modals.
236.	Confirm ARIA roles are correct for tab lists, tab panels, menus, dialogs, tables and status badges.
237.	Confirm focus states are visible and follow Gala Dock styling.
238.	Confirm WCAG contrast passes for text, cards, tabs, badges, buttons, alerts and disabled states.
239.	Confirm screen-reader labels exist for icon-only buttons, status badges, filters and row actions.
240.	Confirm slow network and offline/PWA states are handled gracefully where relevant.
241.	Confirm tab cache invalidates after create, edit, delete, archive, restore, import, export and status changes.
242.	Confirm stale data is not shown after workspace switching, role change, permission change, subscription change or plan change.
243.	Confirm route load performance passes the release budget.
244.	Confirm query speed passes the release budget.
245.	Confirm render speed passes the release budget.
246.	Confirm bundle size is acceptable.
247.	Confirm large-table/large-card behaviour passes the release budget.
248.	Confirm there are no N+1 query patterns.
249.	Confirm there are no expensive dashboard or tab queries running unnecessarily.
250.	Confirm rate limits/throttling apply to expensive tab actions, exports, uploads, AI actions and automations.
251.	Confirm observability exists for this tab: frontend errors, backend errors, failed edge functions, slow queries, failed API calls and permission failures.
252.	Confirm logs are safe and do not expose sensitive customer data.
________________________________________
14. Testing, Stress Checks & Security Checks
253.	Run unit tests for tab rendering.
254.	Run unit tests for permissions.
255.	Run unit tests for empty/loading/error states.
256.	Run unit tests for validation and key actions.
257.	Run integration tests for Supabase reads/writes.
258.	Run integration tests for RLS.
259.	Run integration tests for edge functions.
260.	Run integration tests for storage.
261.	Run integration tests for connected sections.
262.	Run saving and persistence tests.
263.	Run full E2E customer story tests for this sub-tab.
264.	Run negative E2E tests for blocked users.
265.	Run negative E2E tests for wrong workspace.
266.	Run negative E2E tests for missing add-on.
267.	Run negative E2E tests for missing subscription.
268.	Run negative E2E tests for disabled feature flag.
269.	Run security tests.
270.	Run RLS positive tests.
271.	Run RLS negative tests.
272.	Run visual regression tests.
273.	Run realistic stress tests.
274.	Confirm stress tests cover realistic property/operator volumes, documents, work items, compliance records, finance records and activity logs where relevant.
275.	Run DDoS/rate-limit tests proportionately against real exposed endpoints, not destructively against production.
276.	Confirm all fixes are implemented before scoring; do not only report problems.
________________________________________
15. Product Scope, Redundancy & Bloat Review
277.	Confirm this sub-tab has a clear customer purpose.
278.	Confirm this sub-tab is production-useful and not decorative.
279.	Confirm this sub-tab does not duplicate another area unnecessarily.
280.	Confirm anything duplicated from elsewhere is removed, merged or feature-flagged.
281.	Confirm any redundant cards, buttons, stats, filters, views or panels are removed.
282.	Confirm this sub-tab does not create unnecessary V1 bloat.
283.	Confirm this sub-tab should not be merged elsewhere.
284.	Confirm advanced/unreleased functionality is hidden behind feature flags.
285.	Confirm all remaining features in this sub-tab are valuable for release.
286.	Confirm the sub-tab is ready for production, not just visually acceptable.
________________________________________
16. Release Evidence Document & Final Score
287.	Create a release evidence document at /release-gated/docs/{section-name}/{sub-tab-name}.md.
288.	The document must include the parent section name.
289.	The document must include the parent section route.
290.	The document must include the sub-tab name.
291.	The document must include the sub-tab route.
292.	The document must include screenshots tested.
293.	The document must include screen sizes tested.
294.	The document must include tabs clicked.
295.	The document must include buttons/actions tested.
296.	The document must include forms tested.
297.	The document must include filters/search/sorting/views tested.
298.	The document must include inline edits tested where relevant.
299.	The document must include exports/imports tested where relevant.
300.	The document must include data sources tested.
301.	The document must include Supabase tables checked.
302.	The document must include RLS policies checked.
303.	The document must include edge functions checked.
304.	The document must include storage buckets checked where relevant.
305.	The document must include integrations checked where relevant.
306.	The document must include bugs found.
307.	The document must include fixes made.
308.	The document must include migrations applied.
309.	The document must include tests run.
310.	The document must include performance/security findings.
311.	The document must include cross-section effects checked.
312.	The document must include remaining user/manual actions.
313.	Add anything Claude Code cannot complete to /release-gated/user-fixes/{section-name}/{sub-tab-name}.md with exact manual steps.
314.	Give this sub-tab a release score out of 100.
315.	Fix all issues until this sub-tab reaches 100/100.
316.	Do not mark this sub-tab complete below 100/100.
317.	Confirm final release decision states one of: ready for release, ready behind feature flag, ready for admin-only beta, blocked pending manual fix, or removed/merged due to bloat.



________________________________________________________________
Section 3: Sub-Tab of Sub-Tab Sections — Final Release Readiness Audit
Use Chrome MCP resize windows and test code too: UI function, database, Supabase/RLS, edge functions, unit tests, integration tests, saving/persistence tests, E2E customer stories, security, performance and production readiness.
Head Section:
Parent Main Section Name:
Sub tab of sub tab  Sub-Tab Names:
Sub tab of sub tab  Sub-Tab Routes:
Required Plan / Add-on / Feature Flag
Roles Tested: Owner / Admin / Manager / Team Member / Read-only / Accountant / Portal User / Platform Admin
________________________________________
1. Nested Route, Registration & Route Hierarchy
1.	Confirm the nested sub-tab is registered in the route registry.
2.	Confirm the nested sub-tab is registered in the nested tab registry.
3.	Confirm the nested sub-tab is registered in the parent tab config.
4.	Confirm the nested sub-tab is registered in the breadcrumb config.
5.	Confirm the nested sub-tab is registered in the permission map.
6.	Confirm the nested sub-tab is registered in the feature flag map where relevant.
7.	Confirm the nested sub-tab is registered in the subscription/add-on gate map where relevant.
8.	Confirm the nested route loads correctly.
9.	Confirm the full route hierarchy is correct: main section → parent sub-tab → nested sub-tab.
10.	Confirm the nested route is reachable by clicking through the real UI path, not only by direct URL.
11.	Confirm the nested route deep link works when pasted into a fresh browser session.
12.	Confirm hard refresh reloads the nested route correctly.
13.	Confirm hard refresh does not lose workspace context.
14.	Confirm hard refresh does not lose parent main section context.
15.	Confirm hard refresh does not lose parent sub-tab context.
16.	Confirm hard refresh preserves the selected nested sub-tab where intended.
17.	Confirm browser back/forward moves through nested tab history correctly.
18.	Confirm browser back/forward does not jump to the wrong parent section.
19.	Confirm browser back/forward does not reset workspace, property, record or portal context incorrectly.
20.	Confirm old, renamed or duplicate nested routes redirect correctly.
21.	Confirm nested route slugs are clean, predictable and consistent with Gala Dock route naming.
22.	Confirm no duplicate route variants exist for the same nested tab.
23.	Confirm unauthenticated users are redirected correctly from the nested route.
24.	Confirm users without workspace access are blocked with the correct 403/no-access state.
25.	Confirm hidden or disabled nested tabs cannot be opened through direct URL.
26.	Confirm hidden or disabled nested actions cannot be triggered through direct API calls.
________________________________________
2. Parent/Child Context & Nested State
27.	Confirm parent section context is preserved when switching between nested sub-tabs.
28.	Confirm parent sub-tab state is preserved when switching between nested sub-tabs.
29.	Confirm parent workspace, property, unit, tenancy, supplier, contact, invoice, compliance item, planning profile or portal context is preserved where relevant.
30.	Confirm parent filters/search/view state is intentionally preserved or intentionally reset when entering the nested tab.
31.	Confirm nested filters/search/view state does not accidentally affect sibling nested tabs unless intentionally shared.
32.	Confirm query params behave correctly for nested tab state.
33.	Confirm nested view state is stable after refresh where intended.
34.	Confirm nested view state is stable after browser back/forward where intended.
35.	Confirm nested view state is reset safely after workspace switching where required.
36.	Confirm nested tab state does not show stale data after workspace switch.
37.	Confirm nested tab state does not show stale data after role, permission, plan, add-on or feature flag changes.
38.	Confirm nested data cannot accidentally show records from a sibling parent tab.
39.	Confirm nested data cannot accidentally show records from a different property/operator/portal context.
40.	Confirm the nested tab updates correctly when the parent record or parent filter changes.
________________________________________
3. Nested Tab Navigation, Naming & Product Purpose
41.	Confirm the nested tab appears in the correct parent sub-tab group.
42.	Confirm nested tab order is logical and consistent across Gala Dock.
43.	Confirm nested tab labels are clear, customer-friendly and not too vague.
44.	Confirm nested tab names, route slugs, breadcrumbs, H1/H2 labels and browser titles are consistent.
45.	Confirm active nested tab styling is correct.
46.	Confirm locked, disabled, active, hover and focus states match Gala Dock design tokens.
47.	Confirm nested tab count badges are accurate.
48.	Confirm nested status badges are accurate.
49.	Confirm nested notification badges are accurate.
50.	Confirm nested badges are live and permission-aware.
51.	Confirm nested badge counts update after create, edit, delete, archive, restore, import, export and status changes.
52.	Confirm the nested tab has a clear operational reason to exist.
53.	Confirm the nested tab is not hiding an important customer workflow too deep.
54.	Confirm the nested tab should not be promoted to a first-level sub-tab.
55.	Confirm the nested tab should not be merged into the parent sub-tab to reduce bloat.
56.	Confirm the nested tab is not duplicating another nested tab under a different parent.
57.	Confirm the nested tab is not a dumping ground for unrelated records.
58.	Confirm the nested tab does not create unnecessary V1 release bloat.
59.	Confirm advanced/unreleased nested functionality is hidden behind feature flags.
60.	Confirm the nested tab is production-useful and not decorative.
________________________________________
4. Shell, Visual Hierarchy, Width & Premium Styling
61.	Confirm the correct app shell loads for the surface: property-manager workspace, portal or admin.
62.	Confirm the correct sidebar is shown.
63.	Confirm the correct top nav is shown.
64.	Confirm the correct breadcrumbs are shown.
65.	Confirm header layout is consistent with the benchmark at /home.
66.	Confirm page hierarchy is visually clear: main page header, parent tab, nested tab and content area.
67.	Confirm nested tab layout does not create stacked header clutter with too many bars, tabs, filters and actions.
68.	Confirm nested tab content aligns to the same shell width as the parent page.
69.	Confirm nested tab content aligns to the benchmark /home.
70.	Confirm no nested tab has random max-width, card width, grid width or padding different from the parent layout.
71.	Confirm nested tab header, filters, tables/cards/boards/calendars and action bars align exactly.
72.	Confirm borders, padding, spacing and gutters are consistent.
73.	Confirm sticky nested headers/action bars do not overlap the parent tab header on desktop.
74.	Confirm sticky nested headers/action bars do not overlap content on tablet, mobile or PWA.
75.	Confirm nested tab content does not jump when switching tabs.
76.	Confirm nested tab content does not collapse, overflow or shift when switching tabs.
77.	Confirm cards, tables, boards, timelines, calendars, maps, filters, empty states and action bars use shared Gala Dock primitives.
78.	Confirm no one-off nested tab component exists where a shared component should be used.
79.	Confirm nested cards, tables, boards and KPI widgets use the same typography, spacing, radius, border, shadow and badge system as the parent section.
80.	Confirm the nested tab uses shared design tokens and does not contain hard-coded colours, widths, shadows or typography.
81.	Confirm white-label branding flows into nested tab buttons, badges, reports, PDFs, portals and emails where relevant.
82.	Confirm any required UI upgrade is completed to reach premium release quality.
83.	Confirm any missing shared component is added or replaced with the correct Gala Dock primitive.
84.	Confirm styling is consistent across desktop, tablet, mobile and PWA.
________________________________________
5. Responsive, Tablet, Mobile & PWA Behaviour
85.	Confirm responsive behaviour at 1440, 1280, 1024, tablet, mobile and PWA sizes.
86.	Confirm Chrome MCP/browser QA has been run at all required screen sizes.
87.	Confirm nested tab remains usable at 1440.
88.	Confirm nested tab remains usable at 1280.
89.	Confirm nested tab remains usable at 1024.
90.	Confirm tablet nested tabs collapse into a sliding segmented menu where required.
91.	Confirm mobile/PWA nested tabs collapse into a clean dropdown or stepped selector where required.
92.	Confirm nested tab navigation remains usable when there are many nested tabs.
93.	Confirm nested tab controls have proper touch targets on tablet/mobile.
94.	Confirm nested tabs do not create horizontal scroll on mobile unless intentionally designed.
95.	Confirm sticky nested action bars do not overlap content on mobile or PWA.
96.	Confirm mobile safe-area spacing works for iOS/Android PWA.
97.	Confirm the nested tab does not clip content on smaller screens.
98.	Confirm nested forms, filters, cards, tables and action menus remain usable on tablet.
99.	Confirm nested forms, filters, cards, tables and action menus remain usable on mobile/PWA.
100.	Confirm screenshots are captured for every nested tab at all required screen sizes.
101.	Confirm before/after screenshots are saved where visual repair was required.
102.	Confirm visual regression checks are run against benchmark styling and shell alignment.
________________________________________
6. Data, Views, KPI Widgets & Content Quality
103.	Confirm all nested tab data loads correctly.
104.	Confirm all nested tab data is live from Supabase or the correct integration where required.
105.	Confirm no mock data, stale data or fake metrics remain.
106.	Confirm no lorem ipsum, placeholder names, placeholder images, fake suppliers, fake tenants, fake payments or fake metrics remain unless clearly demo-only.
107.	Confirm seed/demo data for this nested tab is realistic, sector-specific, enriched and safe to show.
108.	Confirm demo data is clearly marked as demo-only where applicable.
109.	Confirm nested KPI/stat widgets use consistent styling, sizing, spacing and data logic where included.
110.	Confirm nested KPI/stat values are calculated correctly.
111.	Confirm nested KPI/stat values update after create, edit, delete, archive, restore, import, export and status changes.
112.	Confirm tables use useful columns for the nested tab’s real customer story.
113.	Confirm card fields are useful for the nested tab’s real customer story.
114.	Confirm board lanes are useful for the nested tab’s real customer story.
115.	Confirm calendar/timeline/map/list layouts are useful where present.
116.	Confirm columns and fields do not expose sensitive data to restricted roles.
117.	Confirm dates, currencies, percentages, rent, arrears, deposits, invoices and property values format correctly for UK users.
118.	Confirm date handling is correct for UK timezone, deadlines, reminders and compliance dates.
119.	Confirm status badges, risk badges, financial badges and workflow badges are consistent.
120.	Confirm the nested tab has useful empty states.
121.	Confirm the nested tab has clear loading states.
122.	Confirm the nested tab has safe error states.
123.	Confirm loading skeletons match the final nested layout and do not cause layout shift.
124.	Confirm error boundaries catch nested tab/component failures without breaking the whole parent section.
125.	Confirm no console errors, React warnings, hydration warnings, failed network calls, broken chunks or white-screen states appear when using the nested tab.
________________________________________
7. Filters, Search, Sorting, Saved Views & Pagination
126.	Confirm nested filters work correctly.
127.	Confirm nested search works correctly.
128.	Confirm nested sorting works correctly.
129.	Confirm nested view switchers work correctly where included.
130.	Confirm nested view switchers persist correctly where expected.
131.	Confirm nested filter chips are styled consistently.
132.	Confirm nested saved views work where supported.
133.	Confirm nested advanced filters work where supported.
134.	Confirm nested saved views do not leak across workspaces/users unless intentionally shared.
135.	Confirm clearing nested filters returns the correct default nested tab state.
136.	Confirm nested filters update table/card counts, KPI widgets and empty states correctly.
137.	Confirm nested search handles no results.
138.	Confirm nested search handles partial matches.
139.	Confirm nested search handles special characters.
140.	Confirm nested search handles case differences.
141.	Confirm nested search handles large datasets.
142.	Confirm nested sorting is stable for dates, risk, money, status, compliance deadlines, names and property references.
143.	Confirm nested pagination or infinite loading works.
144.	Confirm nested pagination or infinite loading does not duplicate records.
145.	Confirm nested pagination or infinite loading does not skip records.
146.	Confirm nested pagination or infinite loading does not misorder records.
147.	Confirm large nested datasets work, not just tiny demo data.
148.	Confirm exports use the current nested tab filters, search, sorting and permission scope.
149.	Confirm imports validate file type, file size, schema, duplicate records, required columns and workspace ownership where imports exist.
________________________________________
8. Buttons, Actions, Inline Editing & Bulk Actions
150.	Confirm every nested button works.
151.	Confirm every nested menu action works.
152.	Confirm every nested dropdown action works.
153.	Confirm every nested row action works.
154.	Confirm every nested card action works.
155.	Confirm every nested bulk action works where included.
156.	Confirm every nested export action works where included.
157.	Confirm every nested action opens the correct wizard, modal, detail route, export, import, status workflow or external integration.
158.	Confirm quick actions are specific to this nested tab.
159.	Confirm nested quick actions are not duplicated from the parent section unless useful.
160.	Confirm nested quick actions do not conflict with parent tab quick actions.
161.	Confirm disabled nested actions have a clear reason, tooltip, upgrade state or permission explanation.
162.	Confirm no dead buttons, placeholder cards, fake actions or fake submit flows remain.
163.	Confirm inline editing works inside this nested tab where included.
164.	Confirm inline edits persist after refresh.
165.	Confirm inline editing validates required fields, data types, permissions and business rules.
166.	Confirm failed inline edits show clear errors.
167.	Confirm failed inline edits roll back optimistic UI correctly.
168.	Confirm double-clicking save/create/status buttons does not create duplicate records.
169.	Confirm duplicate submissions are prevented through UI disabled state and backend idempotency where required.
170.	Confirm destructive actions have confirmation, backend permission checks and audit logs.
171.	Confirm save, cancel, archive, delete, restore and status workflows behave consistently with the rest of Gala Dock.
172.	Confirm bulk actions respect selected records.
173.	Confirm bulk actions respect current filters.
174.	Confirm bulk actions respect current workspace.
175.	Confirm bulk actions respect current parent context.
176.	Confirm bulk actions respect user permissions.
177.	Confirm bulk actions cannot affect records outside the current workspace, property or parent context.
178.	Confirm export/download actions are permission-gated.
179.	Confirm export/download actions are audit-logged where required.
180.	Confirm all user-facing functions in this nested tab are tested end to end.
________________________________________
9. Status, Workflow & Business Logic
181.	Confirm backend/RPC/database rules enforce status transitions, not only frontend labels.
182.	Confirm valid nested status transitions work correctly.
183.	Confirm invalid nested status transitions are blocked.
184.	Confirm invalid nested status transitions are explained clearly to the user.
185.	Confirm status changes create audit logs where required.
186.	Confirm status changes create activity feed events where required.
187.	Confirm status changes create notifications where required.
188.	Confirm activity feed entries from this nested tab are human-readable.
189.	Confirm activity feed entries link back to the correct nested record.
190.	Confirm changes made in this nested tab update related dashboards.
191.	Confirm changes made in this nested tab update related KPI cards.
192.	Confirm changes made in this nested tab update related reports.
193.	Confirm changes made in this nested tab update related detail pages.
194.	Confirm changes made in this nested tab update sibling tabs where relevant.
195.	Confirm records created here appear in every expected cross-section.
196.	Confirm records edited, deleted or archived here update connected sections without stale data.
197.	Confirm nested records are scoped to the correct workspace, parent section, parent tab, property, unit, tenancy, supplier, contact, invoice, compliance item or planning profile where relevant.
198.	Confirm child records cannot attach to the wrong parent.
199.	Confirm locked, archived, completed or restricted records cannot be changed incorrectly.
200.	Confirm created records have correct default status and parent IDs.
________________________________________
10. Auth, Roles, RLS, Feature Flags, Plans & Add-ons
201.	Confirm auth protection is enforced.
202.	Confirm users with limited roles only see allowed actions, fields, records, buttons, exports and bulk actions.
203.	Confirm permissions/RLS apply correctly.
204.	Confirm RLS prevents cross-workspace leakage.
205.	Confirm Supabase queries include all required parent IDs.
206.	Confirm Supabase queries include workspace_id.
207.	Confirm Supabase queries include user/role constraints where required.
208.	Confirm no nested tab can show records from a sibling parent tab or different property/operator context.
209.	Confirm positive RLS tests pass for users who should have access.
210.	Confirm negative RLS tests fail for wrong workspace.
211.	Confirm negative RLS tests fail for wrong role.
212.	Confirm negative RLS tests fail for wrong parent record.
213.	Confirm negative RLS tests fail for missing plan.
214.	Confirm negative RLS tests fail for missing add-on.
215.	Confirm negative RLS tests fail for disabled feature flag.
216.	Confirm direct API/RPC calls cannot read, create, update, delete, export, import or trigger nested actions outside the user’s permissions.
217.	Confirm related edge functions validate auth.
218.	Confirm related edge functions validate workspace ownership.
219.	Confirm related edge functions validate parent context.
220.	Confirm related edge functions validate input shape.
221.	Confirm related edge functions enforce rate limits.
222.	Confirm related edge functions return structured errors.
223.	Confirm edge function failures show useful UI errors.
224.	Confirm edge function failures are logged for admin/support diagnosis.
225.	Confirm feature flag gating works for the nested tab, parent tab, actions, APIs, dashboards, search, exports and direct URLs.
226.	Confirm disabled nested feature-flagged areas do not leak through nav, breadcrumbs, global search, command palette, direct URL, API, reports or admin views.
227.	Confirm subscription gates, add-on gates, role gates and feature flags are separate and do not conflict.
228.	Confirm upgrade/paywall states clearly explain the required plan/add-on and link correctly to billing.
229.	Confirm hidden or disabled nested actions cannot still be triggered through direct API calls.
________________________________________
11. Cross-Section Integrations, Activity, Notifications, AI & Automations
230.	Confirm the nested tab wires correctly into activity feeds where relevant.
231.	Confirm the nested tab wires into Account Settings if required.
232.	Confirm the nested tab wires into Workspace Settings if required.
233.	Confirm the nested tab wires into Billing Settings if required.
234.	Confirm notifications triggered from this nested tab respect user/workspace notification preferences.
235.	Confirm email/SMS/in-app notifications do not fire unexpectedly in demo/test mode.
236.	Confirm SMTP/email flows are tested if the nested tab sends invitations, reminders, invoices, notices, legal letters or alerts.
237.	Confirm AI Copilot actions inside this nested tab are useful.
238.	Confirm AI Copilot actions are grounded.
239.	Confirm AI Copilot actions are permission-gated.
240.	Confirm AI Copilot actions are audit-logged.
241.	Confirm Copilot cannot reveal records hidden by RLS, roles, plan gates, add-on gates or feature flags.
242.	Confirm AI usage from this nested tab is rate-limited.
243.	Confirm AI usage from this nested tab is tracked.
244.	Confirm AI usage from this nested tab is visible in admin/usage logs where required.
245.	Confirm automation triggers/actions connected to this nested tab are gated.
246.	Confirm automation triggers/actions connected to this nested tab are logged.
247.	Confirm automation triggers/actions connected to this nested tab are rate-limited.
248.	Confirm automation triggers/actions connected to this nested tab are testable.
249.	Confirm automation events do not fire twice when switching nested tabs, refreshing, saving twice or retrying failed actions.
250.	Confirm support/platform admin can diagnose nested tab issues without exposing sensitive customer data.
________________________________________
12. Files, Uploads, Storage, SMTP & External Services
251.	Confirm R2/storage upload flows are upload-only and do not rely on pasted external media URLs.
252.	Confirm uploaded files/images are stored in secure workspace-scoped paths.
253.	Confirm uploaded files/images are record-scoped where required.
254.	Confirm public/private file access rules are correct.
255.	Confirm signed URLs are used where required.
256.	Confirm file previews handle missing files.
257.	Confirm file previews handle deleted files.
258.	Confirm file previews handle unsupported files.
259.	Confirm file previews handle oversized files.
260.	Confirm file previews handle malicious files safely.
261.	Confirm upload validation covers file type.
262.	Confirm upload validation covers file size.
263.	Confirm upload validation covers permissions.
264.	Confirm upload validation covers workspace ownership.
265.	Confirm upload validation covers storage bucket policy.
266.	Confirm uploaded files attach to the correct nested record.
267.	Confirm document/file actions are audit-logged where required.
268.	Confirm SMTP/email flows work where this nested tab sends emails, invites, reminders, notices, legal letters, invoices or alerts.
269.	Confirm email templates use correct workspace branding, sender, reply-to and variables.
270.	Confirm failed external integration calls show clear errors and do not corrupt local state.
________________________________________
13. Database, Schema, Constraints, Migrations & Seeds
271.	Confirm database tables used by this nested tab exist.
272.	Confirm database tables match the frontend field requirements.
273.	Confirm schema columns are correct.
274.	Confirm enums are correct.
275.	Confirm defaults are correct.
276.	Confirm constraints are correct.
277.	Confirm indexes are correct.
278.	Confirm timestamps are correct.
279.	Confirm foreign keys are correct.
280.	Confirm parent-child relationships are correct.
281.	Confirm required IDs exist.
282.	Confirm unique rules exist.
283.	Confirm status values exist.
284.	Confirm RLS policies allow correct access and block incorrect access.
285.	Confirm related edge functions/RPCs cannot be abused cross-workspace.
286.	Confirm migrations for this nested tab apply cleanly.
287.	Confirm migrations can be reproduced from a fresh database.
288.	Confirm all migrations that can be done with PAT are completed.
289.	Confirm rollback/manual fix notes are written where migrations require user action.
290.	Confirm seed data for this nested tab is realistic, sector-specific, enriched and safe to show.
291.	Confirm demo data is clearly marked as demo-only where applicable.
292.	Confirm backup/PITR expectations are documented if this nested tab handles critical customer data.
________________________________________
14. Accessibility, Browser QA, Performance & Observability
293.	Confirm keyboard navigation works across parent tabs and nested tabs without trapping focus.
294.	Confirm keyboard navigation works across nested filters, menus, tables, cards, forms and modals.
295.	Confirm ARIA roles are correct for nested tab lists, tab panels, menus, dropdowns and segmented controls.
296.	Confirm screen-reader labels explain the nested tab hierarchy properly.
297.	Confirm focus states are visible and do not disappear when switching nested tabs.
298.	Confirm WCAG contrast passes for nested tab labels, active states, locked states, badges, alerts, buttons and disabled states.
299.	Confirm screen-reader labels exist for icon-only buttons, status badges, filters and row actions.
300.	Confirm slow network states are handled gracefully where relevant.
301.	Confirm failed network states are handled gracefully where relevant.
302.	Confirm offline/PWA states are handled gracefully where relevant.
303.	Confirm cache invalidation works after create, edit, delete, archive, restore, import, export and status changes.
304.	Confirm realtime updates work where expected, or manual refresh behaviour is clear.
305.	Confirm stale nested data is not shown after workspace switching, role change, permission change, subscription change or feature flag change.
306.	Confirm route load performance passes the release budget.
307.	Confirm query speed passes the release budget.
308.	Confirm render speed passes the release budget.
309.	Confirm bundle size is acceptable.
310.	Confirm large data behaviour passes the release budget.
311.	Confirm there are no N+1 query patterns.
312.	Confirm there are no repeated duplicate queries.
313.	Confirm there are no expensive dashboard or nested tab queries running unnecessarily.
314.	Confirm rate limits/throttling apply to expensive nested actions, exports, uploads, AI actions and automations.
315.	Confirm observability exists for this nested tab: frontend errors, backend errors, failed API calls, failed edge functions, slow queries and permission failures.
316.	Confirm logs are safe and do not expose sensitive customer data.
________________________________________
15. Testing, Stress Checks & Security Checks
317.	Run unit tests for nested tab rendering.
318.	Run unit tests for permissions.
319.	Run unit tests for empty/loading/error states.
320.	Run unit tests for validation.
321.	Run unit tests for view switching.
322.	Run unit tests for key actions.
323.	Run integration tests for Supabase reads/writes.
324.	Run integration tests for RLS.
325.	Run integration tests for edge functions.
326.	Run integration tests for storage.
327.	Run integration tests for notifications.
328.	Run integration tests for automations.
329.	Run integration tests for connected sections.
330.	Run saving and persistence tests.
331.	Run full E2E customer story tests through parent section → sub-tab → nested sub-tab → action → result shown elsewhere.
332.	Run negative E2E tests for blocked users.
333.	Run negative E2E tests for wrong workspace.
334.	Run negative E2E tests for wrong parent record.
335.	Run negative E2E tests for missing subscription.
336.	Run negative E2E tests for missing add-on.
337.	Run negative E2E tests for disabled feature flag.
338.	Run security tests.
339.	Run RLS positive tests.
340.	Run RLS negative tests.
341.	Run visual regression tests.
342.	Run realistic stress tests.
343.	Confirm stress tests cover realistic property/operator volumes, documents, work items, compliance records, finance records and activity logs where relevant.
344.	Run DDoS/rate-limit tests proportionately against exposed endpoints, not destructively against production.
345.	Confirm all fixes are implemented before scoring; do not only report problems.
________________________________________
16. Product Scope, Redundancy & Bloat Review
346.	Confirm this nested tab has a clear customer purpose.
347.	Confirm this nested tab is actually production-useful and not decorative.
348.	Confirm this nested tab does not duplicate another area unnecessarily.
349.	Confirm anything duplicated from elsewhere is removed, merged or feature-flagged.
350.	Confirm any redundant cards, buttons, stats, filters, views or panels are removed.
351.	Confirm this nested tab does not create unnecessary V1 bloat.
352.	Confirm this nested tab should not be merged into the parent sub-tab.
353.	Confirm this nested tab should not be promoted to a higher-level tab.
354.	Confirm advanced/unreleased functionality is hidden behind feature flags.
355.	Confirm all remaining features in this nested tab are valuable for release.
356.	Confirm the nested tab is ready for production, not just visually acceptable.
________________________________________
17. Release Evidence Document & Final Score
357.	Create a release evidence document at /release-gated/docs/{section-name}/{sub-tab-name}/{nested-sub-tab-name}.md.
358.	The document must include the main section name.
359.	The document must include the parent section route.
360.	The document must include the parent sub-tab name.
361.	The document must include the parent sub-tab route.
362.	The document must include the nested sub-tab name.
363.	The document must include the nested sub-tab route.
364.	The document must include screenshots tested.
365.	The document must include screen sizes tested.
366.	The document must include buttons/actions tested.
367.	The document must include filters/search/sorting/views tested.
368.	The document must include forms tested.
369.	The document must include inline edits tested where relevant.
370.	The document must include exports/imports tested where relevant.
371.	The document must include data sources tested.
372.	The document must include Supabase tables checked.
373.	The document must include RLS policies checked.
374.	The document must include edge functions checked.
375.	The document must include storage buckets checked where relevant.
376.	The document must include integrations checked where relevant.
377.	The document must include cross-section effects checked.
378.	The document must include bugs found.
379.	The document must include fixes made.
380.	The document must include migrations applied.
381.	The document must include tests run.
382.	The document must include performance/security findings.
383.	The document must include remaining user/manual actions.
384.	Add anything Claude Code cannot complete to /release-gated/user-fixes/{section-name}/{sub-tab-name}/{nested-sub-tab-name}.md with exact manual steps.
385.	Give this nested sub-tab a release score out of 100.
386.	Fix all issues until this nested sub-tab reaches 100/100.
387.	Do not mark this nested sub-tab complete below 100/100.
388.	Confirm final release decision states one of: ready for release, ready behind feature flag, ready for admin-only beta, blocked pending manual fix, or removed/merged due to bloat.

________________________________________________________________
Section 4: Item / Profile / Detail Pages & Detail Sub-Tabs — Final Release Readiness Audit
Use Chrome MCP resize windows and test code too: UI function, database, Supabase/RLS, edge functions, unit tests, integration tests, saving/persistence tests, E2E customer stories, security, performance, file/storage checks and production readiness.
Head Section:
Parent Section Name:
Item / Profile / Detail Page Name & Sub-Tab Name:
Item / Profile / Detail Page Name & Sub-Tab Routes:
Required Plan / Add-on / Feature Flag
Roles Tested: Owner / Admin / Manager / Team Member / Read-only / Accountant / Portal User / Platform Admin
________________________________________
1. Detail Route, Record ID & Entry Points
1.	Confirm the detail page is registered in the route registry.
2.	Confirm the detail page is registered in the detail-page registry where applicable.
3.	Confirm the detail sub-tab is registered in the tab registry.
4.	Confirm the detail page and sub-tab are registered in the breadcrumb config.
5.	Confirm the detail page and sub-tab are registered in the permission map.
6.	Confirm the detail page and sub-tab are registered in the feature flag map where relevant.
7.	Confirm the detail page and sub-tab are registered in the subscription/add-on gate map where relevant.
8.	Confirm the detail page route loads correctly.
9.	Confirm the detail sub-tab route loads correctly.
10.	Confirm the route uses a real database record ID.
11.	Confirm the route never relies on a fake, static or demo-only ID unless explicitly in demo mode.
12.	Confirm the detail page opens from every intended entry point: table row, card, board item, calendar item, map marker, search result, notification, activity feed and related record link where applicable.
13.	Confirm every entry point opens the correct record.
14.	Confirm every entry point opens the correct detail sub-tab where intended.
15.	Confirm detail-page deep links work when pasted into a fresh browser session.
16.	Confirm detail sub-tab deep links work when pasted into a fresh browser session.
17.	Confirm hard refresh loads the same record correctly.
18.	Confirm hard refresh preserves workspace context.
19.	Confirm hard refresh preserves selected detail sub-tab where intended.
20.	Confirm browser back/forward works across list → detail page → detail sub-tab → action/edit → return.
21.	Confirm the breadcrumb trail shows the full hierarchy.
22.	Confirm the breadcrumb returns to the correct parent list, board, calendar, map or tab.
23.	Confirm old, renamed or duplicate detail routes redirect correctly.
24.	Confirm missing record IDs show the correct not-found state.
25.	Confirm invalid record IDs show the correct not-found or no-access state.
26.	Confirm deleted records show the correct deleted/no-access state.
27.	Confirm archived records show the correct archived/restore state where applicable.
28.	Confirm unauthenticated users are redirected correctly.
29.	Confirm users without workspace access are blocked correctly.
30.	Confirm users without access to the parent record are blocked correctly.
31.	Confirm hidden or restricted detail tabs cannot be opened through direct URL.
32.	Confirm hidden or restricted detail actions cannot be triggered through direct API/RPC calls.
________________________________________
2. Record Header, Summary & Visual Hierarchy
33.	Confirm the record header loads real record data.
34.	Confirm the page title matches the actual record.
35.	Confirm the subtitle matches the actual record context.
36.	Confirm the avatar, image, logo or icon matches the actual record or correct fallback.
37.	Confirm status badge matches the actual record status.
38.	Confirm risk badge matches the actual record risk state.
39.	Confirm financial, compliance or workflow badges match actual record data where relevant.
40.	Confirm summary metadata is accurate.
41.	Confirm the record header remains consistent across all detail sub-tabs.
42.	Confirm the record header does not duplicate unnecessarily inside each sub-tab.
43.	Confirm detail sub-tabs do not create stacked headers, repeated action bars or messy hierarchy.
44.	Confirm the record summary panel/sidebar, if used, is consistent across all detail pages.
45.	Confirm the record summary panel/sidebar uses real data only.
46.	Confirm detail-page quick actions are specific and useful.
47.	Confirm quick actions are not duplicated unnecessarily from the parent list.
48.	Confirm disabled quick actions explain the reason: permission, plan, add-on, feature flag, locked record or missing required data.
49.	Confirm destructive actions have clear wording and confirmation.
50.	Confirm the page has a clear loading state while the record is fetched.
51.	Confirm the page has useful empty states for tabs with no child records.
52.	Confirm the page has safe error states.
53.	Confirm error states include safe support/debug references without exposing sensitive internal details.
________________________________________
3. Shell, Layout, Width & Premium Styling
54.	Confirm the correct app shell loads for the surface: property-manager workspace, portal or admin.
55.	Confirm the correct sidebar is shown.
56.	Confirm the correct top nav is shown.
57.	Confirm the correct breadcrumbs are shown.
58.	Confirm header layout is consistent with the benchmark at /home.
59.	Confirm all detail sub-tabs align to the same shell width as /home.
60.	Confirm the detail page header, sub-tabs, summary area, action bar and content area align to the same width.
61.	Confirm no detail page uses random max-widths, one-off padding or inconsistent alignment.
62.	Confirm borders, padding, spacing and gutters are consistent.
63.	Confirm cards, panels, tables, boards, timelines, calendars and file grids use shared Gala Dock primitives.
64.	Confirm no one-off styling exists for detail tabs unless it has been added to the design system.
65.	Confirm typography, spacing, border radius, shadows, badges, icons and buttons match Gala Dock premium styling.
66.	Confirm white-label branding flows into detail pages, portals, generated documents, emails and PDFs where relevant.
67.	Confirm sticky headers/action bars do not overlap content.
68.	Confirm mobile bottom action bars are used where appropriate.
69.	Confirm mobile bottom action bars do not overlap content.
70.	Confirm any required UI upgrade is completed to reach premium release quality.
71.	Confirm any missing shared component is added or replaced with the correct Gala Dock primitive.
72.	Confirm styling is consistent across desktop, tablet, mobile and PWA.
________________________________________
4. Detail Sub-Tabs, Navigation & State
73.	Confirm every detail sub-tab works.
74.	Confirm detail sub-tab order is logical.
75.	Confirm detail sub-tab labels are clear and not duplicated.
76.	Confirm detail sub-tab labels match route slugs, H1/H2 labels, breadcrumbs and browser titles.
77.	Confirm active detail sub-tab styling is correct.
78.	Confirm hover, focus, disabled and locked states match Gala Dock design tokens.
79.	Confirm detail sub-tab state survives refresh where intended.
80.	Confirm detail sub-tab state behaves correctly with browser back/forward.
81.	Confirm switching between detail sub-tabs preserves the correct parent record ID.
82.	Confirm switching between detail sub-tabs does not reset unsaved edits without warning.
83.	Confirm unsaved-change warnings appear before navigating away from edited forms.
84.	Confirm query params and nested detail tab states behave correctly.
85.	Confirm detail sub-tabs do not show stale data after workspace switch.
86.	Confirm detail sub-tabs do not show stale data after role, permission, plan, add-on or feature flag change.
87.	Confirm each detail sub-tab has a clear customer purpose.
88.	Confirm no detail sub-tab is a dumping ground for unrelated data.
89.	Confirm no detail sub-tab duplicates the same data shown elsewhere under a different label.
90.	Confirm each detail sub-tab should remain a sub-tab and should not be merged, removed or promoted.
91.	Confirm advanced/unreleased detail tabs are hidden behind feature flags.
92.	Confirm the detail page does not create unnecessary V1 release bloat.
________________________________________
5. Responsive, Tablet, Mobile & PWA Behaviour
93.	Confirm responsive behaviour at 1440, 1280, 1024, tablet, mobile and PWA sizes.
94.	Confirm Chrome MCP/browser QA has been run at all required screen sizes.
95.	Confirm the detail page remains usable at 1440.
96.	Confirm the detail page remains usable at 1280.
97.	Confirm the detail page remains usable at 1024.
98.	Confirm tablet detail tabs use a sliding segmented menu where required.
99.	Confirm mobile/PWA detail tabs use a clean dropdown, stacked selector or compact tab selector where required.
100.	Confirm mobile detail pages are not cramped.
101.	Confirm mobile detail pages are not clipped.
102.	Confirm mobile detail pages do not create unintended horizontal scrolling.
103.	Confirm sticky bars do not block content or actions on mobile/PWA.
104.	Confirm mobile safe-area spacing works for iOS/Android PWA.
105.	Confirm touch targets are large enough on mobile/tablet.
106.	Confirm forms, comments, files, tables, cards and action menus remain usable on tablet.
107.	Confirm forms, comments, files, tables, cards and action menus remain usable on mobile/PWA.
108.	Confirm screenshots are captured for the main detail page and every detail sub-tab at all required screen sizes.
109.	Confirm before/after screenshots are saved where visual repair was required.
110.	Confirm visual regression checks are run against benchmark styling and shell alignment.
________________________________________
6. Record Data, Real Data & Content Quality
111.	Confirm all record data loads correctly.
112.	Confirm all detail sub-tab data is live from Supabase or the correct integration where required.
113.	Confirm no mock data, stale data or fake metrics remain.
114.	Confirm no lorem ipsum, placeholder names, placeholder images, fake payments, fake certificates, fake tenants, fake suppliers, fake documents or fake metrics remain unless clearly demo-only.
115.	Confirm seed/demo records for this detail page are realistic, sector-specific, enriched and safe to show.
116.	Confirm demo data is clearly marked as demo-only where applicable.
117.	Confirm all dates format correctly for UK users.
118.	Confirm all currencies and financial values format correctly for UK users.
119.	Confirm percentages, rent, arrears, deposits, invoices, bills, expenses and property values format correctly where relevant.
120.	Confirm timezone handling is correct for deadlines, reminders, compliance dates, legal dates, calendar events and activity logs.
121.	Confirm status badges are consistent across all detail sub-tabs.
122.	Confirm risk badges are consistent across all detail sub-tabs.
123.	Confirm financial badges are consistent across all detail sub-tabs.
124.	Confirm compliance badges are consistent across all detail sub-tabs.
125.	Confirm workflow badges are consistent across all detail sub-tabs.
126.	Confirm count badges and related-record counts are accurate.
127.	Confirm related-record counts update after linked records are created, edited, removed, archived or restored.
________________________________________
7. Forms, Inline Editing, Save/Cancel & Persistence
128.	Confirm inline editing works for every editable field.
129.	Confirm inline editing persists after refresh.
130.	Confirm inline editing validates required fields.
131.	Confirm inline editing validates field types.
132.	Confirm inline editing validates length limits.
133.	Confirm inline editing validates status rules.
134.	Confirm inline editing validates dates.
135.	Confirm inline editing validates currency/money fields where relevant.
136.	Confirm inline editing validates business logic.
137.	Confirm failed inline edits show clear field-level errors.
138.	Confirm failed inline edits roll back optimistic UI correctly.
139.	Confirm save, cancel, reset, close and back behaviours are consistent across detail sub-tabs.
140.	Confirm double-clicking save/status/action buttons cannot create duplicate updates.
141.	Confirm double-clicking create-child-record actions cannot create duplicate child records.
142.	Confirm backend idempotency or constraints prevent duplicate updates where required.
143.	Confirm optimistic UI updates roll back after failed Supabase/API/edge-function saves.
144.	Confirm cache invalidation works after edit, create, delete, archive, restore, upload, comment, status change and workflow action.
145.	Confirm realtime updates work where expected, or manual refresh behaviour is obvious.
146.	Confirm concurrent edits are handled safely.
147.	Confirm concurrent edits are especially safe for financial, compliance, tenancy, work-order and legal records.
148.	Confirm locked records cannot be edited incorrectly.
149.	Confirm closed records cannot be edited incorrectly.
150.	Confirm completed workflows cannot be edited incorrectly.
151.	Confirm period-locked financial/compliance records cannot be changed incorrectly.
152.	Confirm archived/deleted records cannot be edited unless restore/edit permissions explicitly allow it.
________________________________________
8. Parent-Child Records, Related Records & Data Integrity
153.	Confirm related records display correctly where relevant: property, unit, tenancy, supplier, job, invoice, payment, certificate, document, planning set, contact, owner, tenant and workspace.
154.	Confirm relationship links open the correct connected detail page.
155.	Confirm relationship links return correctly to the original detail sub-tab.
156.	Confirm child records are correctly scoped to the current parent record.
157.	Confirm child records cannot attach to the wrong parent.
158.	Confirm create-child-record actions prefill the correct parent record.
159.	Confirm create-child-record actions prefill the correct workspace.
160.	Confirm create-child-record actions prefill the correct property, unit, tenancy, supplier, contact or related entity where relevant.
161.	Confirm parent-child relationships are enforced by database foreign keys, not only frontend state.
162.	Confirm deletion/archive behaviour does not orphan important child records.
163.	Confirm cascade rules are safe, intentional and documented.
164.	Confirm restore behaviour reconnects related child records correctly where applicable.
165.	Confirm changes on child records update the parent detail page correctly.
166.	Confirm changes on the parent record update child records only where intentionally designed.
167.	Confirm records created here appear in every expected cross-section.
168.	Confirm records edited, deleted or archived here update connected sections without stale data.
169.	Confirm connected dashboards, parent lists, reports, activity feeds and notifications update after detail-page changes.
________________________________________
9. Status, Workflow, Audit History & Activity
170.	Confirm status transitions follow the correct workflow.
171.	Confirm status transitions cannot skip required steps.
172.	Confirm invalid status transitions are blocked by backend/database logic, not only frontend labels.
173.	Confirm valid status transitions work correctly.
174.	Confirm status changes update connected dashboards.
175.	Confirm status changes update parent lists.
176.	Confirm status changes update activity feeds.
177.	Confirm status changes update reports.
178.	Confirm status changes trigger notifications where required.
179.	Confirm version/history/audit tabs show actual changes, not placeholder activity.
180.	Confirm audit logs capture before/after values for important edits where required.
181.	Confirm audit logs record user ID.
182.	Confirm audit logs record workspace ID.
183.	Confirm audit logs record record ID.
184.	Confirm audit logs record action type.
185.	Confirm audit logs record timestamp.
186.	Confirm audit logs record source route.
187.	Confirm audit logs record related entity where relevant.
188.	Confirm sensitive values are redacted from audit logs where required.
189.	Confirm activity feed entries are human-readable.
190.	Confirm activity feed entries link back to the correct record and sub-tab.
191.	Confirm comments, notes, internal notes and customer-visible messages are clearly separated where relevant.
192.	Confirm private/internal notes cannot be seen in tenant, landlord, supplier or public portal views.
193.	Confirm document/file actions are audit-logged: upload, view, download, replace, delete and restore.
194.	Confirm compliance/legal/financial evidence cannot be silently overwritten without versioning/audit.
________________________________________
10. Buttons, Quick Actions, Exports, Imports & Reports
195.	Confirm every button on the detail page works.
196.	Confirm every quick action opens the correct wizard, modal, drawer, detail page, report or workflow.
197.	Confirm every menu action works.
198.	Confirm every row/card action inside detail sub-tabs works.
199.	Confirm disabled actions explain the reason clearly.
200.	Confirm no dead buttons, placeholder actions, fake cards or fake submit flows remain.
201.	Confirm destructive actions have confirmation, permission checks, clear wording and audit logs.
202.	Confirm archive, delete and restore actions match the Gala Dock global pattern.
203.	Confirm bulk actions are not shown on single-record detail pages unless they genuinely apply to selected child records.
204.	Confirm exports from the detail page include the correct record only.
205.	Confirm exports include correct child records where intended.
206.	Confirm exports respect current permissions.
207.	Confirm PDFs/reports generated from the detail page match on-screen data.
208.	Confirm print/PDF/report views work where relevant.
209.	Confirm imported files/data attach to the correct record.
210.	Confirm import actions validate schema, file type, file size, duplicate records and workspace ownership.
211.	Confirm all user-facing functions on the detail page are tested end to end.
________________________________________
11. Files, Media, Documents, Evidence & R2 Storage
212.	Confirm all uploaded media/files are upload-only and storage-backed.
213.	Confirm uploaded media/files do not rely on pasted external URLs.
214.	Confirm R2/storage upload paths are workspace-scoped.
215.	Confirm R2/storage upload paths are record-scoped.
216.	Confirm private files use signed/private access where required.
217.	Confirm public files are public only where intentionally allowed.
218.	Confirm public/private file URLs are not exposed incorrectly.
219.	Confirm file previews handle missing files.
220.	Confirm file previews handle deleted files.
221.	Confirm file previews handle unsupported files.
222.	Confirm file previews handle oversized files.
223.	Confirm file previews handle malicious files safely.
224.	Confirm upload validation covers file type.
225.	Confirm upload validation covers file size.
226.	Confirm upload validation covers permissions.
227.	Confirm upload validation covers virus/safety checks where available.
228.	Confirm upload validation covers workspace ownership.
229.	Confirm upload validation covers storage bucket policy.
230.	Confirm uploaded files attach to the correct final record.
231.	Confirm replacing files preserves version/audit records where required.
232.	Confirm deleting files is permission-gated and audit-logged.
233.	Confirm restoring files works where supported.
234.	Confirm document categories work where relevant.
235.	Confirm evidence strength works where relevant.
236.	Confirm document expiry dates work where relevant.
237.	Confirm linked records work for documents/evidence.
238.	Confirm generated documents/PDFs are stored in the correct workspace/record folder if saved.
239.	Confirm generated documents/PDFs create audit/version records where required.
________________________________________
12. Auth, Roles, RLS, Feature Flags, Plans & Add-ons
240.	Confirm auth protection is enforced.
241.	Confirm record ownership and workspace scoping are enforced by Supabase RLS, RPCs, edge functions and frontend logic.
242.	Confirm users with limited roles only see allowed detail tabs.
243.	Confirm users with limited roles only see allowed fields.
244.	Confirm users with limited roles only see allowed actions.
245.	Confirm users with limited roles only see allowed files.
246.	Confirm users with limited roles only see allowed notes.
247.	Confirm users with limited roles only see allowed comments.
248.	Confirm users with limited roles only see allowed exports.
249.	Confirm users with limited roles only see allowed history/audit data.
250.	Confirm hidden restricted fields cannot be retrieved through direct API calls.
251.	Confirm hidden restricted tabs cannot be opened through direct URL.
252.	Confirm direct API/RPC calls cannot read, edit, delete, upload to or export detail records outside the user’s permissions.
253.	Confirm positive RLS tests pass for allowed users.
254.	Confirm negative RLS tests fail for wrong workspace.
255.	Confirm negative RLS tests fail for wrong role.
256.	Confirm negative RLS tests fail for wrong parent record.
257.	Confirm negative RLS tests fail for wrong record.
258.	Confirm negative RLS tests fail for archived/deleted record where access should be blocked.
259.	Confirm negative RLS tests fail for missing plan.
260.	Confirm negative RLS tests fail for missing add-on.
261.	Confirm negative RLS tests fail for disabled feature flag.
262.	Confirm Supabase queries include workspace_id and required parent IDs.
263.	Confirm related edge functions validate auth.
264.	Confirm related edge functions validate workspace ownership.
265.	Confirm related edge functions validate record ownership.
266.	Confirm related edge functions validate input shape.
267.	Confirm related edge functions enforce rate limits.
268.	Confirm related edge functions return structured errors.
269.	Confirm edge function failures show useful UI errors.
270.	Confirm edge function failures are logged for admin/support diagnosis.
271.	Confirm subscription gates and add-on gates are separate from feature flags and do not conflict.
272.	Confirm upgrade/paywall states clearly explain what is locked and link correctly to billing.
273.	Confirm feature-flagged detail tabs do not leak through direct URL, related links, global search, breadcrumbs, dashboards, reports, APIs or admin views.
274.	Confirm disabled detail-page features do not leave broken buttons, empty cards or fake locked states.
________________________________________
13. Privacy Boundaries, Portals & Sensitive Data
275.	Confirm sensitive data is masked or hidden for restricted roles where needed.
276.	Confirm tenant data follows the correct privacy boundaries.
277.	Confirm landlord data follows the correct privacy boundaries.
278.	Confirm supplier data follows the correct privacy boundaries.
279.	Confirm owner data follows the correct privacy boundaries.
280.	Confirm payment data follows the correct privacy boundaries.
281.	Confirm legal data follows the correct privacy boundaries.
282.	Confirm internal notes are never shown in tenant portal views.
283.	Confirm internal notes are never shown in landlord portal views unless explicitly intended.
284.	Confirm internal notes are never shown in supplier portal views unless explicitly intended.
285.	Confirm workspace-only records do not leak into public marketplace pages.
286.	Confirm portal users cannot access internal workspace-only detail tabs.
287.	Confirm admin-only data does not appear in workspace detail pages.
288.	Confirm private file/document access follows the correct user and portal boundary.
289.	Confirm comments, messages and documents have clear internal/customer-visible separation.
290.	Confirm cross-portal links route safely and do not expose restricted records.
________________________________________
14. Settings, Billing, AI, Automations & Integrations
291.	Confirm Account Settings that affect this record are reflected correctly where relevant.
292.	Confirm Workspace Settings that affect this record are reflected correctly.
293.	Confirm Billing Settings that affect this record are reflected correctly.
294.	Confirm workspace branding affects this detail page where intended.
295.	Confirm notification settings affect this detail page where intended.
296.	Confirm feature flags affect this detail page where intended.
297.	Confirm permissions settings affect this detail page where intended.
298.	Confirm integrations settings affect this detail page where intended.
299.	Confirm AI Copilot actions on the detail page are grounded in the current record and related permitted records only.
300.	Confirm Copilot cannot reveal hidden fields.
301.	Confirm Copilot cannot reveal hidden tabs.
302.	Confirm Copilot cannot reveal private notes.
303.	Confirm Copilot cannot reveal records blocked by RLS, role gates, plan gates, add-on gates or feature flags.
304.	Confirm AI-generated summaries, letters, notices, replies or recommendations show source grounding/citations where required.
305.	Confirm AI actions are rate-limited.
306.	Confirm AI actions are usage-tracked.
307.	Confirm AI actions are permission-gated.
308.	Confirm AI actions are audit-logged.
309.	Confirm automation triggers/actions connected to this detail page are gated.
310.	Confirm automation triggers/actions connected to this detail page are logged.
311.	Confirm automation triggers/actions connected to this detail page are rate-limited.
312.	Confirm automation triggers/actions connected to this detail page are testable.
313.	Confirm automation events do not fire twice from refresh, retry, duplicate save or repeated tab switching.
314.	Confirm automations created from this record attach to the correct record and workspace.
315.	Confirm integration links work where relevant: Stripe, SMTP, calendar, storage, AI, documents, payments, marketplace, portals and admin.
316.	Confirm failed integration calls show clear errors and do not corrupt local record state.
317.	Confirm SMTP/email flows are tested where the detail page sends invites, reminders, notices, invoices, payment links or alerts.
318.	Confirm email templates use correct workspace branding, sender, reply-to and variables.
319.	Confirm email/SMS/in-app notifications do not send in demo/test mode unless explicitly allowed.
320.	Confirm notification events are triggered correctly from detail-page actions.
321.	Confirm notification preferences are respected.
________________________________________
15. Database, Schema, Constraints, Migrations & Seeds
322.	Confirm database schema supports every field shown on the detail page.
323.	Confirm database tables used by this detail page exist.
324.	Confirm frontend fields align with database schema columns.
325.	Confirm schema columns are correct.
326.	Confirm enums are correct.
327.	Confirm defaults are correct.
328.	Confirm constraints are correct.
329.	Confirm indexes are correct.
330.	Confirm timestamps are correct.
331.	Confirm foreign keys are correct.
332.	Confirm parent-child relationships are correct.
333.	Confirm required IDs exist.
334.	Confirm unique rules exist.
335.	Confirm status values exist.
336.	Confirm RLS policies allow correct access and block incorrect access.
337.	Confirm related edge functions/RPCs cannot be abused cross-workspace.
338.	Confirm migrations for this detail page apply cleanly.
339.	Confirm migrations can be reproduced from a fresh database.
340.	Confirm all migrations that can be done with PAT are completed.
341.	Confirm rollback/manual fix notes are written where migrations require user action.
342.	Confirm seed/demo records for this detail page are realistic, sector-specific, enriched and safe to show.
343.	Confirm demo data is clearly marked as demo-only where applicable.
344.	Confirm backup/PITR expectations are documented if this detail page handles critical customer data.
________________________________________
16. Accessibility, Browser QA, Performance & Observability
345.	Confirm keyboard navigation works across detail tabs, forms, menus, comments, files and action bars.
346.	Confirm ARIA roles are correct for tabs, tab panels, buttons, menus, dialogs, uploads, alerts and status badges.
347.	Confirm focus states are visible and consistent.
348.	Confirm WCAG contrast passes for detail headers, metadata, badges, cards, tabs, alerts, buttons and disabled states.
349.	Confirm screen-reader labels exist for icon-only actions, file controls, badges, comments, menus and row actions.
350.	Confirm loading skeletons match the final detail-page layout and do not cause layout shift.
351.	Confirm error boundaries catch detail-tab failures without breaking the whole app shell.
352.	Confirm no console errors, React warnings, hydration warnings, failed network calls, broken chunks or white-screen states appear.
353.	Confirm slow network states are handled gracefully where relevant.
354.	Confirm failed network states are handled gracefully where relevant.
355.	Confirm offline/PWA states are handled gracefully where relevant.
356.	Confirm route load performance passes the release budget.
357.	Confirm query speed passes the release budget.
358.	Confirm render speed passes the release budget.
359.	Confirm bundle size is acceptable.
360.	Confirm large related-record behaviour passes the release budget.
361.	Confirm large-record testing is performed, including records with many documents, notes, activity logs, child records and linked workflows.
362.	Confirm there are no N+1 queries.
363.	Confirm there are no repeated duplicate queries.
364.	Confirm there are no expensive record-summary queries.
365.	Confirm rate limits/throttling apply to expensive detail actions, exports, uploads, AI actions, automations and email sends.
366.	Confirm observability exists for this detail page: frontend errors, backend errors, failed API calls, failed edge functions, slow queries, permission failures and upload failures.
367.	Confirm support/platform admin can diagnose detail-page issues without exposing sensitive customer data.
368.	Confirm logs are safe and do not expose sensitive customer data.
________________________________________
17. Testing, Stress Checks & Security Checks
369.	Run unit tests for detail rendering.
370.	Run unit tests for record loading.
371.	Run unit tests for permissions.
372.	Run unit tests for empty/loading/error states.
373.	Run unit tests for validation.
374.	Run unit tests for inline editing.
375.	Run unit tests for key actions.
376.	Run integration tests for Supabase reads/writes.
377.	Run integration tests for RLS.
378.	Run integration tests for edge functions.
379.	Run integration tests for storage.
380.	Run integration tests for notifications.
381.	Run integration tests for automations.
382.	Run integration tests for documents/files.
383.	Run integration tests for connected sections.
384.	Run saving and persistence tests.
385.	Run E2E tests covering list/card/board/calendar/map → detail page → detail sub-tab → action → result shown elsewhere.
386.	Run negative E2E tests for blocked users.
387.	Run negative E2E tests for wrong workspace.
388.	Run negative E2E tests for wrong record.
389.	Run negative E2E tests for archived/deleted records.
390.	Run negative E2E tests for missing subscription.
391.	Run negative E2E tests for missing add-on.
392.	Run negative E2E tests for disabled feature flag.
393.	Run security tests.
394.	Run RLS positive tests.
395.	Run RLS negative tests.
396.	Run visual regression tests.
397.	Run realistic stress tests.
398.	Confirm stress tests cover realistic property/operator volumes, child records, documents, activity logs, compliance items, work items and financial records.
399.	Run DDoS/rate-limit tests proportionately against exposed endpoints, not destructively against production.
400.	Confirm all fixes are implemented before scoring; do not only report problems.
________________________________________
18. Product Scope, Redundancy & Bloat Review
401.	Confirm this detail page has a clear customer purpose.
402.	Confirm every detail sub-tab has a clear customer purpose.
403.	Confirm this detail page is production-useful and not decorative.
404.	Confirm this detail page does not duplicate another area unnecessarily.
405.	Confirm any duplicate detail sub-tab is removed, merged or feature-flagged.
406.	Confirm redundant cards, buttons, stats, filters, views or panels are removed.
407.	Confirm this detail page does not create unnecessary V1 bloat.
408.	Confirm this detail page should not be merged elsewhere.
409.	Confirm advanced/unreleased functionality is hidden behind feature flags.
410.	Confirm all remaining features in this detail page are valuable for release.
411.	Confirm the detail page is ready for production, not just visually acceptable.
________________________________________
19. Release Evidence Document & Final Score
412.	Create a release evidence document at /release-gated/docs/{section-name}/{detail-page-name}/{sub-tab-name}.md.
413.	The document must include the section name.
414.	The document must include the parent route.
415.	The document must include the detail page name.
416.	The document must include the record type.
417.	The document must include the record ID tested.
418.	The document must include the detail sub-tab name.
419.	The document must include the detail sub-tab route.
420.	The document must include entry points tested.
421.	The document must include screenshots tested.
422.	The document must include screen sizes tested.
423.	The document must include buttons/actions tested.
424.	The document must include forms tested.
425.	The document must include inline edits tested.
426.	The document must include files/media/documents tested.
427.	The document must include comments/notes/messages tested where relevant.
428.	The document must include status/workflow actions tested.
429.	The document must include related records tested.
430.	The document must include data sources tested.
431.	The document must include Supabase tables checked.
432.	The document must include RLS policies checked.
433.	The document must include edge functions checked.
434.	The document must include storage buckets checked.
435.	The document must include integrations checked.
436.	The document must include cross-section effects checked.
437.	The document must include bugs found.
438.	The document must include fixes made.
439.	The document must include migrations applied.
440.	The document must include tests run.
441.	The document must include performance/security findings.
442.	The document must include remaining user/manual actions.
443.	Add anything Claude Code cannot complete to /release-gated/user-fixes/{section-name}/{detail-page-name}/{sub-tab-name}.md with exact manual steps.
444.	Give this detail page and detail sub-tab a release score out of 100.
445.	Fix all issues until the detail page and every detail sub-tab reaches 100/100.
446.	Do not mark this detail page or detail sub-tab complete below 100/100.
447.	Confirm final release decision states one of: ready for release, ready behind feature flag, ready for owner/admin-only beta, blocked pending manual fix, or removed/merged due to bloat.

________________________________________________________________
Section 5: Wizards — Final Release Readiness Audit
Use Chrome MCP resize windows and test code too: UI function, database, Supabase/RLS, edge functions, unit tests, integration tests, saving/persistence tests, E2E customer stories, security, performance, storage, billing, AI, automations and production readiness.
Wizard Names:
Wizard Routes:
Parent Section:

Workspace / Portal / Admin Surface
Required Plan / Add-on / Feature Flag
Roles Tested: Owner / Admin / Manager / Team Member / Read-only / Accountant / Portal User / Platform Admin
________________________________________
1. Wizard Registration, Route & Launch Points
1.	Confirm the wizard is registered in the route registry where it has a route.
2.	Confirm the wizard is registered in the modal/wizard registry.
3.	Confirm the wizard is registered in the parent module config.
4.	Confirm the wizard is registered in the permission map.
5.	Confirm the wizard is registered in the feature flag map where relevant.
6.	Confirm the wizard is registered in the subscription/add-on gate map where relevant.
7.	Confirm the wizard route or modal opens correctly.
8.	Confirm the correct wizard opens from every button that launches it.
9.	Confirm the wizard can be launched from every intended entry point: main CTA, empty-state CTA, quick action, table action, card action, board action, calendar action, map action, detail-page action, global create menu, command/search action, portal action and admin action where applicable.
10.	Confirm every launch point passes the correct parent context.
11.	Confirm launch context includes workspace ID where required.
12.	Confirm launch context includes property ID where required.
13.	Confirm launch context includes unit ID where required.
14.	Confirm launch context includes tenancy ID where required.
15.	Confirm launch context includes supplier/contact/invoice/job/compliance/planning/profile/parent record ID where required.
16.	Confirm parent context fields are prefilled correctly.
17.	Confirm parent context fields are locked where they should not be changed.
18.	Confirm the wizard cannot be opened from hidden or disabled buttons.
19.	Confirm the wizard cannot be opened through direct URL, forced route access or API calls when unavailable.
20.	Confirm old, renamed or duplicate wizard routes redirect correctly where relevant.
21.	Confirm unauthenticated users are redirected correctly.
22.	Confirm users without permission see the correct blocked, upgrade or no-access state.
23.	Confirm users with limited roles only see allowed wizard fields, steps, options, templates, files and submit actions.
24.	Confirm feature-flagged wizards do not leak through nav, global create, buttons, direct URL, search, command palette, APIs, portals or admin views.
25.	Confirm subscription gates, add-on gates, role gates and feature flags are separate and do not conflict.
26.	Confirm upgrade/paywall states clearly explain what is locked and route correctly to billing/add-ons.
________________________________________
2. Wizard Pattern, Naming, Layout & Premium Styling
27.	Confirm the wizard title is clear and consistent with Gala Dock naming.
28.	Confirm the wizard subtitle explains the workflow.
29.	Confirm step names are clear and useful.
30.	Confirm breadcrumbs or parent context labels are correct where used.
31.	Confirm the wizard uses the correct pattern: full-page wizard, modal wizard, compact modal or side panel only where appropriate.
32.	Confirm complex or commercially important workflows do not open inside cramped drawers.
33.	Confirm the stepper is clear, premium and consistent.
34.	Confirm stepper progress, completed states, error states and locked states are visually premium.
35.	Confirm the wizard width, borders, padding, cards, sections and footer actions align with Gala Dock shell/design tokens.
36.	Confirm the wizard styling is consistent with benchmark /home.
37.	Confirm typography, icons, labels, helper text, buttons, badges, borders, shadows and radii match Gala Dock premium styling.
38.	Confirm no hard-coded one-off colours, widths, shadows, typography or spacing are used where shared tokens should be used.
39.	Confirm white-label branding flows into the wizard where relevant.
40.	Confirm sticky footer actions do not overlap content on desktop, tablet, mobile or PWA.
41.	Confirm loading skeletons and progress states do not cause layout shift.
42.	Confirm any required UI upgrade is completed to reach premium release quality.
43.	Confirm any missing component is added or replaced with the correct Gala Dock primitive.
44.	Confirm the wizard is production-useful and not decorative.
________________________________________
3. Step Structure, Conditional Logic & Workflow Fit
45.	Confirm every step has a clear purpose.
46.	Confirm no unnecessary step creates bloat.
47.	Confirm step order matches the real customer workflow and not just database order.
48.	Confirm required steps cannot be skipped unless intentionally allowed.
49.	Confirm optional steps are clearly marked.
50.	Confirm optional steps do not block completion.
51.	Confirm conditional steps appear only when relevant.
52.	Confirm conditional fields appear and disappear correctly based on selected property type, planning profile, role, supplier type, payment type, compliance type, portal type or workflow path.
53.	Confirm hidden conditional fields are not submitted accidentally with stale values.
54.	Confirm changing an earlier answer updates later steps safely.
55.	Confirm changing an earlier answer warns the user if it will clear dependent fields.
56.	Confirm field defaults are sensible and workspace-aware.
57.	Confirm field defaults are not fake/demo-only.
58.	Confirm lookup fields and search selectors load real permitted records only.
59.	Confirm record selectors do not show records from another workspace.
60.	Confirm record selectors do not show records from another property, supplier, tenant, landlord, owner, portal user or restricted context.
61.	Confirm duplicate detection works before submit where relevant: duplicate property, unit, tenancy, supplier, invoice, certificate, contact, user invite, planning set, job, document or automation.
62.	Confirm each step is understandable without needing support.
63.	Confirm help text/tooltips exist for complex steps.
64.	Confirm the wizard does not create unnecessary V1 bloat.
65.	Confirm advanced or unreleased wizard steps are hidden behind feature flags.
________________________________________
4. Form Fields, Validation & Business Rules
66.	Confirm required fields validate correctly.
67.	Confirm optional fields behave correctly.
68.	Confirm validation exists on every step, not only final submit.
69.	Confirm validation is enforced on the frontend.
70.	Confirm validation is enforced on the backend/database.
71.	Confirm validation covers required fields.
72.	Confirm validation covers field types.
73.	Confirm validation covers min/max lengths.
74.	Confirm validation covers dates.
75.	Confirm validation covers currency and money values.
76.	Confirm validation covers percentages.
77.	Confirm validation covers phone numbers.
78.	Confirm validation covers emails.
79.	Confirm validation covers URLs.
80.	Confirm validation covers UK postcodes where relevant.
81.	Confirm validation covers enums/status values.
82.	Confirm validation covers file types where uploads exist.
83.	Confirm validation covers business rules.
84.	Confirm validation messages are specific and human-readable.
85.	Confirm validation messages attach to the correct field.
86.	Confirm invalid fields are focused or highlighted when the user tries to continue.
87.	Confirm date logic is correct for UK timezone, compliance expiry, reminders, tenancy dates, invoice due dates, legal deadlines and calendar events.
88.	Confirm money fields handle GBP formatting, decimals, VAT/tax, deposits, rent, arrears, fees, invoices, bills and rounding correctly where relevant.
89.	Confirm status/workflow values are created through valid backend rules and not arbitrary frontend labels.
90.	Confirm impossible or contradictory wizard inputs are blocked.
91.	Confirm server validation errors map back to the correct wizard step and field.
92.	Confirm generic failure states include a safe support/debug reference without exposing sensitive technical data.
________________________________________
5. Navigation, Drafts, Partial State & Unsaved Changes
93.	Confirm Back, Next, Save, Cancel, Close and Finish buttons work.
94.	Confirm Back and Next buttons preserve form state.
95.	Confirm browser back/forward behaviour does not corrupt wizard state.
96.	Confirm closing the wizard warns about unsaved changes where needed.
97.	Confirm cancelling the wizard does not create partial records unless draft mode is intentionally enabled.
98.	Confirm draft mode, if enabled, saves securely.
99.	Confirm draft mode restores correctly.
100.	Confirm draft state is clearly labelled as draft.
101.	Confirm abandoned drafts are not treated as live records in dashboards, reports, portals, billing or notifications.
102.	Confirm draft records have correct RLS.
103.	Confirm draft records have correct ownership.
104.	Confirm draft records have audit logs where required.
105.	Confirm draft cleanup behaviour exists where required.
106.	Confirm refresh/hard reload during the wizard restores state safely or shows a clear recovery message.
107.	Confirm multiple browser tabs/windows do not create conflicting wizard states.
108.	Confirm save buttons use loading/disabled states while saving.
109.	Confirm submit buttons use loading/disabled states while submitting.
110.	Confirm double-clicking Next, Save, Create, Submit or Finish cannot create duplicate records.
111.	Confirm duplicate submissions are blocked by UI disabled states.
112.	Confirm backend idempotency or unique constraints prevent duplicate submissions.
113.	Confirm retry after failure does not duplicate records.
114.	Confirm error states preserve user input where safe.
________________________________________
6. Submit, Transaction Safety & Supabase Writes
115.	Confirm final submit creates or updates the correct Supabase records.
116.	Confirm final submit runs as a safe transaction where multiple records are created.
117.	Confirm partial database writes roll back or are clearly repairable if one part of the wizard fails.
118.	Confirm failed edge functions do not leave corrupt records.
119.	Confirm the wizard creates every required primary record.
120.	Confirm the wizard creates every required child record.
121.	Confirm the wizard creates every required join record.
122.	Confirm the wizard creates every required audit record.
123.	Confirm the wizard creates every required notification record.
124.	Confirm the wizard creates every required file reference.
125.	Confirm the wizard creates every required relationship record.
126.	Confirm records created by the wizard have the correct workspace_id.
127.	Confirm records created by the wizard have the correct owner_id where relevant.
128.	Confirm records created by the wizard have the correct created_by.
129.	Confirm records created by the wizard have the correct updated_by.
130.	Confirm records created by the wizard have the correct parent IDs.
131.	Confirm records created by the wizard have the correct status.
132.	Confirm records created by the wizard have the correct timestamps.
133.	Confirm records created by the wizard have correct source metadata.
134.	Confirm database foreign keys support the wizard output.
135.	Confirm unique constraints support the wizard output.
136.	Confirm required columns support the wizard output.
137.	Confirm enums and defaults support the wizard output.
138.	Confirm indexes support the wizard output.
139.	Confirm migrations required for this wizard apply cleanly.
140.	Confirm migrations can be reproduced from a fresh database.
141.	Confirm all migrations that can be done with PAT are completed.
142.	Confirm rollback/manual fix notes are written where migrations require user action.
________________________________________
7. Success State, Redirects & Cross-Section Updates
143.	Confirm success state is clear.
144.	Confirm success state shows what was created or updated.
145.	Confirm success state gives useful next actions.
146.	Confirm success redirect goes to the correct list, detail page, portal page, payment page or next workflow.
147.	Confirm created/updated records immediately appear in parent lists.
148.	Confirm created/updated records immediately appear in dashboards.
149.	Confirm created/updated records immediately appear in KPI cards.
150.	Confirm created/updated records immediately appear in global search where relevant.
151.	Confirm created/updated records immediately appear in reports where relevant.
152.	Confirm created/updated records immediately appear in activity feeds where relevant.
153.	Confirm created/updated records immediately appear in detail pages where relevant.
154.	Confirm created/updated portal-facing records appear correctly in tenant, landlord, supplier, customer or public marketplace views where relevant.
155.	Confirm admin/platform wizards do not expose tenant/customer-only actions incorrectly.
156.	Confirm cache invalidation works after the wizard completes.
157.	Confirm realtime updates work where expected, or manual refresh behaviour is clear.
158.	Confirm no stale data remains after completing the wizard and switching workspace, role or plan.
159.	Confirm records created by this wizard update every expected connected section.
160.	Confirm full E2E customer story is tested from launch → complete wizard → submit → result appears elsewhere.
________________________________________
8. Auth, Roles, RLS, Feature Flags, Plans & Add-ons
161.	Confirm auth protection is enforced.
162.	Confirm RLS, workspace ID and ownership are applied.
163.	Confirm positive RLS tests pass for users allowed to use the wizard.
164.	Confirm negative RLS tests fail for wrong workspace.
165.	Confirm negative RLS tests fail for wrong role.
166.	Confirm negative RLS tests fail for wrong parent record.
167.	Confirm negative RLS tests fail for missing subscription.
168.	Confirm negative RLS tests fail for missing add-on.
169.	Confirm negative RLS tests fail for disabled feature flag.
170.	Confirm direct Supabase/API/RPC calls cannot create records outside the allowed workspace or parent context.
171.	Confirm users with limited roles cannot see restricted wizard fields.
172.	Confirm users with limited roles cannot submit restricted fields by editing the client payload.
173.	Confirm users with limited roles cannot create restricted records.
174.	Confirm related edge functions validate auth.
175.	Confirm related edge functions validate workspace ownership.
176.	Confirm related edge functions validate parent context.
177.	Confirm related edge functions validate input schema.
178.	Confirm related edge functions enforce rate limits.
179.	Confirm related edge functions return structured errors.
180.	Confirm edge functions do not leak service-role access to the client.
181.	Confirm edge functions do not use service role for user-scoped reads unless RLS-equivalent checks are manually enforced.
182.	Confirm subscription gates and add-on gates are separate from feature flags and do not conflict.
183.	Confirm upgrade/paywall states clearly explain what is locked and route correctly to billing/add-ons.
184.	Confirm hidden or disabled wizard actions cannot still be triggered through direct API calls.
________________________________________
9. Files, Media, Documents, Evidence & R2 Storage
185.	Confirm file/media upload steps use upload-only R2/storage-backed flows.
186.	Confirm upload steps do not rely on pasted external URLs.
187.	Confirm uploads are workspace-scoped.
188.	Confirm uploads are record-scoped.
189.	Confirm private uploads use private/signed access where required.
190.	Confirm public files are public only where intentionally allowed.
191.	Confirm file upload validation covers file type.
192.	Confirm file upload validation covers file size.
193.	Confirm file upload validation covers file count.
194.	Confirm file upload validation covers permissions.
195.	Confirm file upload validation covers storage bucket policy.
196.	Confirm file upload validation covers malicious or unsupported files.
197.	Confirm upload progress works.
198.	Confirm upload failure state works.
199.	Confirm upload retry works.
200.	Confirm remove-file behaviour works.
201.	Confirm uploaded files attach to the correct final record after submit.
202.	Confirm files uploaded during abandoned/cancelled wizards are cleaned up or marked orphaned for safe cleanup.
203.	Confirm document/evidence uploads create version/audit records where required.
204.	Confirm generated documents are stored in the correct workspace/record folder where relevant.
205.	Confirm generated documents create audit/version records where required.
________________________________________
10. Activity, Audit, Notifications, SMTP & Email
206.	Confirm all wizard actions are audit-logged where required.
207.	Confirm wizard audit logs include opened where useful.
208.	Confirm wizard audit logs include submitted.
209.	Confirm wizard audit logs include failed submission.
210.	Confirm wizard audit logs include cancelled where useful.
211.	Confirm wizard audit logs include draft saved where useful.
212.	Confirm wizard audit logs include record created or updated.
213.	Confirm wizard audit logs include file uploaded.
214.	Confirm wizard audit logs include notification or email sent where relevant.
215.	Confirm activity feed events are created after successful submission where relevant.
216.	Confirm activity feed entries link back to the created/updated record.
217.	Confirm notifications are triggered only where intended.
218.	Confirm user/workspace notification preferences are respected.
219.	Confirm email/SMS/in-app notifications do not fire unexpectedly in demo/test mode.
220.	Confirm SMTP/email flows are tested if the wizard sends invites, onboarding emails, reminders, invoices, notices, supplier requests, tenant messages or alerts.
221.	Confirm generated emails use correct workspace branding.
222.	Confirm generated emails use correct sender.
223.	Confirm generated emails use correct reply-to.
224.	Confirm generated emails use correct subject.
225.	Confirm generated emails use correct body variables.
226.	Confirm generated emails respect unsubscribe/preferences where required.
227.	Confirm failed notification/email sends are logged safely.
228.	Confirm failed notification/email sends do not corrupt wizard-created records.
________________________________________
11. AI, Automation, Billing & External Integrations
229.	Confirm AI-assisted wizard fields are grounded.
230.	Confirm AI-assisted wizard fields are optional unless explicitly designed otherwise.
231.	Confirm AI-assisted wizard fields are permission-gated.
232.	Confirm AI-assisted wizard fields are clearly reviewable before submit.
233.	Confirm AI cannot prefill hidden fields.
234.	Confirm AI cannot use restricted data.
235.	Confirm AI cannot use records the user cannot access.
236.	Confirm AI-generated content is rate-limited.
237.	Confirm AI-generated content is usage-tracked.
238.	Confirm AI-generated content is audit-logged.
239.	Confirm automation triggers from the wizard are deliberate.
240.	Confirm automation triggers from the wizard are gated.
241.	Confirm automation triggers from the wizard are logged.
242.	Confirm automation triggers from the wizard do not fire twice.
243.	Confirm created automations attach to the correct workspace, record and user permissions.
244.	Confirm Stripe/payment/billing actions are tested where the wizard creates subscriptions, add-ons, payment links, invoices or plan changes.
245.	Confirm billing-impacting wizards clearly show price, plan, add-on, billing interval, trial, proration and confirmation before submit.
246.	Confirm billing-impacting wizards require explicit confirmation.
247.	Confirm billing-impacting wizards are permission-gated.
248.	Confirm failed Stripe/payment/billing actions do not corrupt local records.
249.	Confirm failed external integration calls show clear errors.
250.	Confirm failed external integration calls do not corrupt local record state.
251.	Confirm all external integration actions are logged safely.
________________________________________
12. Responsive, Mobile, PWA & Accessibility
252.	Confirm mobile/PWA wizard layout works.
253.	Confirm mobile/PWA wizard layout uses a clean stacked stepper, dropdown step selector or compact step indicator where needed.
254.	Confirm tablet wizard layout uses a premium sliding or segmented stepper where appropriate.
255.	Confirm wizard content does not overflow on mobile.
256.	Confirm wizard content does not clip on mobile.
257.	Confirm wizard content does not hide buttons on mobile.
258.	Confirm wizard content does not create unintended horizontal scroll on mobile.
259.	Confirm sticky footer actions do not overlap content on desktop, tablet, mobile or PWA.
260.	Confirm mobile safe-area spacing works for iOS/Android PWA.
261.	Confirm touch targets are large enough on tablet/mobile.
262.	Confirm keyboard navigation works through every field, step, selector, upload, modal and action.
263.	Confirm Enter key behaviour is safe.
264.	Confirm Escape key behaviour is safe.
265.	Confirm Enter/Escape do not accidentally submit destructive workflows.
266.	Confirm focus moves to the correct field or heading after step changes.
267.	Confirm focus moves to the correct field after validation errors.
268.	Confirm ARIA roles and labels exist for steppers, dialogs, field groups, alerts, uploads, progress indicators and icon-only buttons.
269.	Confirm WCAG contrast passes for wizard text, labels, hints, errors, badges, buttons and disabled states.
270.	Confirm screen-reader labels exist for icon-only buttons, uploads and step controls.
271.	Confirm browser QA is run with Chrome MCP at 1440, 1280, 1024, tablet, mobile and PWA sizes.
272.	Confirm screenshots are captured for every wizard step at required screen sizes.
273.	Confirm before/after screenshots are saved where visual repair was required.
274.	Confirm visual regression checks compare wizard width, padding, stepper, footer actions, forms and cards against Gala Dock benchmark styling.
________________________________________
13. Performance, Reliability & Observability
275.	Confirm route/modal load performance passes release expectations.
276.	Confirm step transition speed passes release expectations.
277.	Confirm lookup search speed passes release expectations.
278.	Confirm file upload speed passes release expectations.
279.	Confirm submit speed passes release expectations.
280.	Confirm large-data selectors/searches work with realistic property, tenant, supplier, document, compliance, finance and planning volumes.
281.	Confirm no N+1 queries exist.
282.	Confirm no repeated duplicate queries exist.
283.	Confirm no expensive selector searches exist.
284.	Confirm rate limits/throttling apply to expensive wizard actions.
285.	Confirm rate limits/throttling apply to uploads.
286.	Confirm rate limits/throttling apply to AI actions.
287.	Confirm rate limits/throttling apply to automations.
288.	Confirm rate limits/throttling apply to emails.
289.	Confirm rate limits/throttling apply to exports.
290.	Confirm rate limits/throttling apply to payment actions.
291.	Confirm observability exists for wizard errors.
292.	Confirm observability exists for failed submits.
293.	Confirm observability exists for failed edge functions.
294.	Confirm observability exists for slow queries.
295.	Confirm observability exists for upload failures.
296.	Confirm observability exists for permission failures.
297.	Confirm observability exists for notification failures.
298.	Confirm support/platform admin can diagnose failed wizard submissions without exposing sensitive customer data.
299.	Confirm no console errors, React warnings, hydration warnings, failed network calls, broken chunks or white-screen states appear during the wizard flow.
300.	Confirm error boundaries catch wizard failures without breaking the whole app shell.
301.	Confirm slow network states are handled gracefully.
302.	Confirm failed network states are handled gracefully.
303.	Confirm offline/PWA states are handled gracefully where relevant.
________________________________________
14. Database, Schema, Constraints, Migrations & Seeds
304.	Confirm database tables used by this wizard exist.
305.	Confirm schema supports every field shown in the wizard.
306.	Confirm schema columns are correct.
307.	Confirm enums are correct.
308.	Confirm defaults are correct.
309.	Confirm constraints are correct.
310.	Confirm indexes are correct.
311.	Confirm timestamps are correct.
312.	Confirm foreign keys are correct.
313.	Confirm parent-child relationships are correct.
314.	Confirm required IDs exist.
315.	Confirm unique rules exist.
316.	Confirm status values exist.
317.	Confirm RLS policies allow correct access and block incorrect access.
318.	Confirm related edge functions/RPCs cannot be abused cross-workspace.
319.	Confirm seed data for this wizard flow is realistic, sector-specific, enriched and safe to show where applicable.
320.	Confirm no lorem ipsum, placeholder names, fake suppliers, fake tenants, fake payments, fake certificates, fake documents or fake metrics remain unless clearly demo-only.
321.	Confirm backup/PITR expectations are documented if this wizard creates or changes critical customer data.
________________________________________
15. Testing, Stress Checks & Security Checks
322.	Run unit tests for wizard rendering.
323.	Run unit tests for stepper logic.
324.	Run unit tests for conditional fields.
325.	Run unit tests for validation.
326.	Run unit tests for permission states.
327.	Run unit tests for empty/loading/error states.
328.	Run unit tests for key actions.
329.	Run integration tests for Supabase writes.
330.	Run integration tests for RLS.
331.	Run integration tests for edge functions.
332.	Run integration tests for storage.
333.	Run integration tests for notifications.
334.	Run integration tests for automations.
335.	Run integration tests for billing where relevant.
336.	Run integration tests for connected sections.
337.	Run saving and persistence tests.
338.	Run E2E tests covering launch wizard → complete each step → submit → created record appears in expected section/detail page/activity feed.
339.	Run negative E2E tests for blocked users.
340.	Run negative E2E tests for missing subscription.
341.	Run negative E2E tests for missing add-on.
342.	Run negative E2E tests for disabled feature flag.
343.	Run negative E2E tests for invalid data.
344.	Run negative E2E tests for failed upload.
345.	Run negative E2E tests for failed edge function.
346.	Run negative E2E tests for duplicate submission.
347.	Run security tests.
348.	Run RLS positive tests.
349.	Run RLS negative tests.
350.	Run visual regression tests.
351.	Run realistic stress tests.
352.	Confirm stress tests cover repeated launches.
353.	Confirm stress tests cover repeated submits.
354.	Confirm stress tests cover large datasets.
355.	Confirm stress tests cover many uploads.
356.	Confirm stress tests cover realistic concurrent users.
357.	Run DDoS/rate-limit tests proportionately against exposed endpoints, not destructively against production.
358.	Confirm all fixes are implemented before scoring; do not only report issues.
________________________________________
16. Product Scope, Redundancy & Bloat Review
359.	Confirm the wizard has a clear customer purpose.
360.	Confirm the wizard is production-useful and not decorative.
361.	Confirm the wizard does not duplicate another wizard unnecessarily.
362.	Confirm any duplicate wizard is removed, merged or feature-flagged.
363.	Confirm redundant steps, fields, cards, buttons or flows are removed.
364.	Confirm the wizard does not create unnecessary V1 bloat.
365.	Confirm the wizard should not be merged into another flow.
366.	Confirm advanced/unreleased wizard functionality is hidden behind feature flags.
367.	Confirm all remaining wizard features are valuable for release.
368.	Confirm the wizard is ready for production, not just visually acceptable.
________________________________________
17. Release Evidence Document & Final Score
369.	Create a release evidence document at /release-gated/docs/wizards/{wizard-name}.md.
370.	The document must include the wizard name.
371.	The document must include the wizard route or modal ID.
372.	The document must include all launch points tested.
373.	The document must include parent contexts tested.
374.	The document must include steps tested.
375.	The document must include fields tested.
376.	The document must include validation tested.
377.	The document must include files/uploads tested.
378.	The document must include permissions tested.
379.	The document must include data sources tested.
380.	The document must include Supabase tables checked.
381.	The document must include RLS policies checked.
382.	The document must include edge functions checked.
383.	The document must include storage buckets checked.
384.	The document must include integrations checked.
385.	The document must include notifications tested.
386.	The document must include automations tested.
387.	The document must include billing impact tested.
388.	The document must include AI usage tested where relevant.
389.	The document must include cross-section effects checked.
390.	The document must include screenshots tested.
391.	The document must include screen sizes tested.
392.	The document must include bugs found.
393.	The document must include fixes made.
394.	The document must include migrations applied.
395.	The document must include tests run.
396.	The document must include performance/security findings.
397.	The document must include remaining user/manual actions.
398.	Add anything Claude Code cannot complete to /release-gated/user-fixes/{wizard-name}.md with exact manual steps.
399.	Give this wizard a release score out of 100.
400.	Fix all issues until this wizard reaches 100/100.
401.	Do not mark this wizard complete below 100/100.
402.	Confirm final release decision states one of: ready for release, ready behind feature flag, ready for owner/admin-only beta, blocked pending manual fix, or removed/merged due to bloat.

________________________________________________________________
Section 6: AI / Copilot Chat & Actions — Final Release Readiness Audit
Use Chrome MCP resize windows and test code too: UI function, database, Supabase/RLS, edge functions, AI usage, prompt grounding, action safety, rate limits, audit logs, prompt-injection tests, data-leakage tests and full E2E customer stories.
Head Section:
AI Surface Name:whole ai section, agents, commands, cross integration, functionality 
AI Route / Component / Bubble Location: chat bubble
AI Action Name:all
Required Plan / Add-on / Feature Flag: fix this not for basic, fix the limits so we are profitable with azure remember also input out put token limits and we need to provide them a lot but we must  be heavily profitable . 
Roles Tested: Owner / Admin / Manager / Team Member / Read-only / Accountant / Portal User / Platform Admin
________________________________________
1. AI Surface Registration, Visibility & Gating
1.	Confirm the AI/Copilot surface is registered in the route registry where relevant.
2.	Confirm the AI/Copilot surface is registered in the component registry.
3.	Confirm the AI/Copilot surface is registered in the feature flag map.
4.	Confirm the AI/Copilot surface is registered in the subscription gate map.
5.	Confirm the AI/Copilot surface is registered in the add-on gate map.
6.	Confirm the AI/Copilot surface is registered in the permission map.
7.	Confirm the AI/Copilot surface is registered in Platform Admin AI settings.
8.	Confirm the AI/Copilot bubble appears only where intended.
9.	Confirm AI/Copilot does not appear on unauthenticated routes unless explicitly designed for public support.
10.	Confirm AI/Copilot appears correctly on workspace routes where enabled.
11.	Confirm AI/Copilot appears correctly on portal routes where enabled.
12.	Confirm AI/Copilot appears correctly on admin routes only where permitted.
13.	Confirm tenant, landlord, supplier, workspace, admin and public marketplace AI boundaries are separate.
14.	Confirm AI/Copilot can be disabled globally from Platform Admin.
15.	Confirm AI/Copilot can be disabled per workspace where required.
16.	Confirm AI/Copilot can be gated per plan.
17.	Confirm AI/Copilot can be gated per add-on.
18.	Confirm AI/Copilot can be gated per role.
19.	Confirm AI/Copilot can be gated per feature flag.
20.	Confirm disabled AI/Copilot cannot be accessed through direct URL.
21.	Confirm disabled AI/Copilot cannot be accessed through API calls.
22.	Confirm disabled AI/Copilot cannot be accessed through keyboard shortcuts.
23.	Confirm disabled AI/Copilot cannot be accessed through hidden buttons.
24.	Confirm disabled AI/Copilot does not leak through global search.
25.	Confirm disabled AI/Copilot does not leak through command palette.
26.	Confirm disabled AI/Copilot does not leak through navigation.
27.	Confirm disabled AI/Copilot does not leak through quick actions or contextual menus.
28.	Confirm disabled AI/Copilot states do not leave broken UI, empty panels or fake buttons.
29.	Confirm upgrade/paywall states clearly explain the required plan/add-on.
30.	Confirm upgrade/paywall states route correctly to billing or add-ons.
31.	Confirm AI availability updates after plan, add-on, role or feature flag changes.
32.	Confirm AI availability updates after workspace switch.
33.	Confirm AI never shows stale workspace, user, role, plan, add-on or feature flag state.
________________________________________
2. AI Bubble, Chat UI, Layout & Premium Styling
34.	Confirm the AI/Copilot bubble is positioned consistently across app, portal and admin surfaces.
35.	Confirm the AI/Copilot bubble does not block page content.
36.	Confirm the AI/Copilot bubble does not block sticky bars.
37.	Confirm the AI/Copilot bubble does not block mobile bottom nav.
38.	Confirm the AI/Copilot bubble does not block forms.
39.	Confirm the AI/Copilot bubble does not block action buttons.
40.	Confirm AI/Copilot opens smoothly without layout jump.
41.	Confirm AI/Copilot closes smoothly without layout jump.
42.	Confirm collapsed state works correctly.
43.	Confirm expanded state works correctly.
44.	Confirm pinned state works correctly where supported.
45.	Confirm mobile state works correctly.
46.	Confirm expanded AI/Copilot mode works if available.
47.	Confirm AI/Copilot state does not reset unexpectedly while navigating between Gala Dock routes.
48.	Confirm AI/Copilot state resets intentionally when switching workspace where required.
49.	Confirm AI/Copilot styling is consistent with benchmark /home.
50.	Confirm AI/Copilot follows Gala Dock premium styling.
51.	Confirm AI/Copilot spacing is consistent.
52.	Confirm AI/Copilot border radius is consistent.
53.	Confirm AI/Copilot shadows are consistent.
54.	Confirm AI/Copilot typography is consistent.
55.	Confirm AI/Copilot icon system is consistent.
56.	Confirm AI/Copilot uses Gala Dock brand tokens.
57.	Confirm AI/Copilot respects white-label branding where required.
58.	Confirm AI brand colour, accent colour, logo/name and assistant label can be controlled from workspace/admin settings where applicable.
59.	Confirm AI-generated action cards use consistent Gala Dock styling.
60.	Confirm AI-generated citation/source cards use consistent Gala Dock styling.
61.	Confirm AI-generated warning/error cards use consistent Gala Dock styling.
62.	Confirm AI-generated tables/cards do not break layout.
63.	Confirm AI-generated long responses are scrollable and readable.
64.	Confirm AI code blocks, if any, do not overflow mobile screens.
65.	Confirm AI chat message timestamps, sender labels and status states are clear.
66.	Confirm loading states are clear and premium.
67.	Confirm typing states are clear and premium.
68.	Confirm streaming states are clear and premium.
69.	Confirm tool-running states are clear and premium.
70.	Confirm empty, success, failed, blocked, rate-limited and quota-exceeded states are clear.
________________________________________
3. Responsive, Mobile, PWA & Accessibility
71.	Confirm AI/Copilot is usable at 1440.
72.	Confirm AI/Copilot is usable at 1280.
73.	Confirm AI/Copilot is usable at 1024.
74.	Confirm AI/Copilot is usable on tablet.
75.	Confirm AI/Copilot is usable on mobile.
76.	Confirm AI/Copilot is usable in PWA mode.
77.	Confirm Chrome MCP/browser resize testing is performed for all AI surfaces.
78.	Confirm mobile/PWA AI chat uses a clean full-screen or bottom-sheet pattern.
79.	Confirm mobile AI chat does not clip messages.
80.	Confirm mobile AI chat does not clip input.
81.	Confirm mobile AI chat does not clip attachments.
82.	Confirm mobile AI chat does not clip suggestions.
83.	Confirm mobile AI chat does not clip action confirmations.
84.	Confirm tablet AI chat uses a premium responsive panel size.
85.	Confirm touch targets are large enough for mobile and tablet.
86.	Confirm keyboard navigation works for open, close, tabs, messages, input, send, stop, suggestions, actions, files and approvals.
87.	Confirm Escape, Enter, Shift+Enter and focus movement behave safely.
88.	Confirm screen-reader labels exist for the AI launcher.
89.	Confirm screen-reader labels exist for the chat input.
90.	Confirm screen-reader labels exist for send and stop buttons.
91.	Confirm screen-reader labels exist for action buttons, tabs and attachments.
92.	Confirm ARIA roles are correct for dialogs, panels, tabs, alerts, chat messages, menus and confirmations.
93.	Confirm WCAG contrast passes for AI messages.
94.	Confirm WCAG contrast passes for code blocks.
95.	Confirm WCAG contrast passes for citations.
96.	Confirm WCAG contrast passes for buttons, alerts, badges, disabled states and loading indicators.
97.	Confirm visible focus states are consistent with Gala Dock styling.
98.	Confirm screenshots are captured for collapsed bubble, expanded chat, AI action cards, source cards, errors, quota states and mobile/PWA states.
99.	Confirm before/after screenshots are saved where visual repair was required.
100.	Confirm visual regression checks are run for all AI/Copilot states.
________________________________________
4. Chat Input, Streaming, Retry & Failure Behaviour
101.	Confirm AI/Copilot route/component loads without console errors.
102.	Confirm AI/Copilot route/component loads without React warnings.
103.	Confirm AI/Copilot route/component loads without hydration warnings.
104.	Confirm AI/Copilot route/component loads without broken chunks.
105.	Confirm AI/Copilot route/component loads without failed network requests.
106.	Confirm error boundaries catch AI panel failures without breaking the parent page.
107.	Confirm slow network states are handled gracefully.
108.	Confirm failed network states are handled gracefully.
109.	Confirm offline/PWA state shows a useful message rather than silently failing.
110.	Confirm the user can stop/cancel a streaming AI response.
111.	Confirm cancelling a response stops downstream tool/action execution where possible.
112.	Confirm retry after AI failure works.
113.	Confirm retry after AI failure does not duplicate actions.
114.	Confirm duplicate send is prevented while a message is already being processed where required.
115.	Confirm AI input has length limits.
116.	Confirm AI input has safe validation.
117.	Confirm empty messages cannot be submitted.
118.	Confirm extremely long prompts are blocked, truncated or handled safely.
119.	Confirm unsafe characters and markdown are handled safely.
120.	Confirm AI conversation clearing/resetting works.
121.	Confirm AI conversation clearing/resetting does not delete audit logs incorrectly.
122.	Confirm AI can handle long conversations without drifting away from the current workspace/route.
123.	Confirm AI can handle route changes mid-conversation safely.
124.	Confirm AI can handle user switching records while chat is open.
125.	Confirm AI can handle deleted/archived records referenced in prior chat.
126.	Confirm AI can handle stale context by refreshing or warning the user.
127.	Confirm AI suggestions refresh after the user creates, edits, archives or deletes a record.
________________________________________
5. AI Files, Attachments & R2 Storage
128.	Confirm file attachment input has type validation where attachments are allowed.
129.	Confirm file attachment input has size validation where attachments are allowed.
130.	Confirm file attachment input has count validation where attachments are allowed.
131.	Confirm file attachment input has permission validation where attachments are allowed.
132.	Confirm AI uploaded files use secure R2/storage-backed upload flows.
133.	Confirm AI file uploads are workspace-scoped.
134.	Confirm AI file uploads are user-scoped.
135.	Confirm uploaded files are not exposed by public URL unless intentionally allowed.
136.	Confirm private files use signed access where required.
137.	Confirm AI file previews handle missing files safely.
138.	Confirm AI file previews handle deleted files safely.
139.	Confirm AI file previews handle unsupported files safely.
140.	Confirm AI file previews handle oversized files safely.
141.	Confirm AI file previews handle malicious files safely.
142.	Confirm AI temporary files are cleaned up or marked for cleanup.
143.	Confirm abandoned AI uploads are cleaned up or marked for cleanup.
144.	Confirm uploaded documents cannot inject instructions that override system/developer/app safety rules.
145.	Confirm file analysis respects RLS and permission boundaries.
146.	Confirm file analysis cannot reveal files the user cannot access.
147.	Confirm AI-generated documents/PDFs are stored in the correct workspace/record folder if saved.
148.	Confirm AI-generated documents/PDFs create audit/version records where required.
149.	Confirm AI-generated documents/PDFs use correct workspace branding.
150.	Confirm AI-generated documents/PDFs use correct record data and citations.
________________________________________
6. Chat History, Privacy, Retention & Data Handling
151.	Confirm AI messages are stored only if intended by product policy.
152.	Confirm AI chat history is scoped to the correct user.
153.	Confirm AI chat history is scoped to the correct workspace.
154.	Confirm users cannot read another user’s private AI chat history unless explicitly permitted.
155.	Confirm admin/support views of AI logs do not expose sensitive customer data unnecessarily.
156.	Confirm sensitive prompt/completion contents are redacted from admin logs where required.
157.	Confirm AI conversation retention rules are documented.
158.	Confirm AI conversation retention rules are enforced.
159.	Confirm AI chat deletion controls exist where required.
160.	Confirm AI chat export controls exist where required.
161.	Confirm AI privacy controls exist where required.
162.	Confirm AI conversation export works only where intended and permission-gated.
163.	Confirm AI support escalation/handoff, if present, creates the correct support record.
164.	Confirm AI support escalation does not include sensitive hidden fields unless allowed.
165.	Confirm AI data privacy copy is clear in Account Settings where relevant.
166.	Confirm AI data privacy copy is clear in Workspace Settings where relevant.
167.	Confirm audit logs do not store secrets, API keys, private tokens, raw passwords or unnecessary sensitive data.
168.	Confirm raw prompts/completions are not exposed to users/admins who should not see them.
169.	Confirm AI logs are searchable by workspace, user, route, action, provider, model and error type.
________________________________________
7. AI Usage, Credits, Quotas, Rate Limits & Model Controls
170.	Confirm AI usage is tracked per user.
171.	Confirm AI usage is tracked per workspace.
172.	Confirm AI usage is tracked per plan.
173.	Confirm AI usage is tracked per model.
174.	Confirm AI usage is tracked per route.
175.	Confirm AI usage is tracked per action.
176.	Confirm AI credits/limits are deducted correctly.
177.	Confirm failed AI responses do not incorrectly consume credits unless product policy says they should.
178.	Confirm AI credits cannot go negative unless intentionally allowed.
179.	Confirm AI usage caps work over 6-hour windows where configured.
180.	Confirm AI usage caps work over daily windows where configured.
181.	Confirm AI usage caps work over weekly windows where configured.
182.	Confirm AI usage caps work over monthly windows where configured.
183.	Confirm usage limits can be controlled from Platform Admin.
184.	Confirm usage limits can be controlled from Workspace Settings where permitted.
185.	Confirm AI model selection can be controlled from Platform Admin.
186.	Confirm disabled models cannot be selected.
187.	Confirm disabled models cannot be called.
188.	Confirm fallback models work only where intentionally configured.
189.	Confirm model fallback does not bypass cost limits.
190.	Confirm model fallback does not bypass feature gates.
191.	Confirm model fallback does not bypass safety rules.
192.	Confirm AI rate limiting applies to chat messages.
193.	Confirm AI rate limiting applies to route-level AI actions.
194.	Confirm AI rate limiting applies to file analysis.
195.	Confirm AI rate limiting applies to document generation.
196.	Confirm AI rate limiting applies to email generation.
197.	Confirm AI rate limiting applies to automation generation.
198.	Confirm AI rate limiting applies to bulk actions.
199.	Confirm AI rate limits are enforced on the backend, not just frontend.
200.	Confirm AI rate-limit errors are user-friendly.
201.	Confirm AI rate-limit errors do not expose internal system details.
202.	Confirm AI usage cannot be manipulated through client-side payload changes.
203.	Confirm AI usage appears correctly in admin usage dashboards.
204.	Confirm AI usage appears correctly in workspace billing/usage settings where required.
205.	Confirm Platform Admin can see AI health, model status, provider errors, usage, costs and abuse signals.
206.	Confirm Platform Admin can disable AI globally during incidents.
207.	Confirm Platform Admin can disable specific AI actions during incidents.
208.	Confirm Platform Admin can set per-model, per-workspace and per-action caps.
209.	Confirm Workspace Settings can show AI usage, credits, limits and enabled actions where required.
210.	Confirm Account Settings can show user-level AI preferences where required.
211.	Confirm notification settings include AI-generated notifications where relevant.
212.	Confirm AI cost spikes are prevented by quota, rate limit and context-size controls.
________________________________________
8. AI Action Registry, Labels, Purpose & UX
213.	Confirm AI actions are registered in an action registry.
214.	Confirm each AI action has a clear name.
215.	Confirm each AI action has a clear description.
216.	Confirm each AI action has a route or parent surface.
217.	Confirm each AI action has required permissions defined.
218.	Confirm each AI action has required plan/add-on defined where relevant.
219.	Confirm each AI action has feature flag mapping where relevant.
220.	Confirm each AI action has a risk level.
221.	Confirm each AI action has audit rules.
222.	Confirm every AI action has a clear purpose.
223.	Confirm every AI action is not decorative.
224.	Confirm every AI action is useful to the specific route/customer story.
225.	Confirm duplicate AI actions are removed, merged or feature-flagged.
226.	Confirm AI actions are not buried in places where users will not understand them.
227.	Confirm AI action labels are clear.
228.	Confirm AI action labels are not vague, gimmicky or misleading.
229.	Confirm AI action descriptions explain what will happen before the user runs the action.
230.	Confirm AI quick prompts/suggestions are route-specific.
231.	Confirm AI quick prompts/suggestions are useful.
232.	Confirm AI quick prompts/suggestions are not generic filler.
233.	Confirm AI quick prompts do not suggest unavailable/gated actions.
234.	Confirm AI quick prompts do not suggest actions that could create legal/compliance risk without review.
235.	Confirm AI inbox/chat tabs, if present, are separated clearly from human messaging/inbox.
236.	Confirm AI actions are not replacing core working buttons.
237.	Confirm users can still complete workflows manually without AI.
238.	Confirm AI/Copilot improves the customer workflow without adding confusing bloat.
________________________________________
9. Grounding, Citations, Context & Hallucination Prevention
239.	Confirm AI grounding uses only records the current user is allowed to access.
240.	Confirm AI grounding includes the current route context where relevant.
241.	Confirm AI grounding includes the current record context where relevant.
242.	Confirm AI grounding includes related records only where permission allows.
243.	Confirm AI grounding never uses mock data unless the workspace is explicitly in demo mode.
244.	Confirm AI grounding does not mix data between workspaces.
245.	Confirm AI grounding does not mix data between users inside the same workspace unless permitted.
246.	Confirm AI grounding does not mix data between property records incorrectly.
247.	Confirm AI grounding does not mix data between units incorrectly.
248.	Confirm AI grounding does not mix data between tenancies incorrectly.
249.	Confirm AI grounding does not mix data between suppliers incorrectly.
250.	Confirm AI grounding does not mix data between jobs incorrectly.
251.	Confirm AI grounding does not mix data between invoices incorrectly.
252.	Confirm AI grounding does not mix data between documents incorrectly.
253.	Confirm AI grounding does not mix data between compliance items incorrectly.
254.	Confirm AI grounding does not mix data between planning profiles incorrectly.
255.	Confirm AI answers include source references/citations to Gala Dock records where appropriate.
256.	Confirm source references link back to the correct permitted record.
257.	Confirm hidden/restricted records are not shown as citations.
258.	Confirm AI output explains uncertainty where data is missing, stale or incomplete.
259.	Confirm AI refuses or asks for missing required data instead of inventing facts.
260.	Confirm AI does not hallucinate property figures.
261.	Confirm AI does not hallucinate rent amounts.
262.	Confirm AI does not hallucinate arrears.
263.	Confirm AI does not hallucinate deadlines.
264.	Confirm AI does not hallucinate certificates.
265.	Confirm AI does not hallucinate legal dates.
266.	Confirm AI does not hallucinate compliance status.
267.	Confirm AI does not hallucinate payment status.
268.	Confirm AI does not create fake suppliers.
269.	Confirm AI does not create fake tenants.
270.	Confirm AI does not create fake documents.
271.	Confirm AI does not create fake tasks.
272.	Confirm AI does not create fake metrics.
273.	Confirm AI does not create fake evidence.
274.	Confirm AI does not rely on placeholder prompt context.
275.	Confirm AI can summarise the current page accurately.
276.	Confirm AI can summarise a detail record accurately.
277.	Confirm AI can summarise documents accurately with citations where required.
278.	Confirm AI can generate reports or summaries from permitted data only.
279.	Confirm AI can explain why a task/action/report was generated.
280.	Confirm AI can refuse actions outside the user’s permissions.
281.	Confirm AI can handle “not enough data” cases cleanly.
________________________________________
10. Prompt Injection, Secrets, XSS & Security Boundaries
282.	Confirm AI cannot be manipulated by prompt injection in uploaded documents.
283.	Confirm AI cannot be manipulated by prompt injection in emails.
284.	Confirm AI cannot be manipulated by prompt injection in notes.
285.	Confirm AI cannot be manipulated by prompt injection in tenant messages.
286.	Confirm AI cannot be manipulated by prompt injection in supplier messages.
287.	Confirm AI cannot be manipulated by prompt injection in web/marketplace content.
288.	Confirm prompt-injection tests are run against documents, messages, notes, PDFs, CSVs, emails, marketplace descriptions and user prompts.
289.	Confirm system/developer instructions are not exposed in AI responses.
290.	Confirm hidden instructions are not exposed in AI responses.
291.	Confirm policy text is not exposed in AI responses.
292.	Confirm chain-of-thought is not exposed in AI responses.
293.	Confirm API keys are never exposed.
294.	Confirm service role keys are never exposed.
295.	Confirm PATs are never exposed.
296.	Confirm secrets are never exposed.
297.	Confirm environment variables are never exposed.
298.	Confirm internal config is never exposed.
299.	Confirm Stripe secrets are never exposed.
300.	Confirm SMTP credentials are never exposed.
301.	Confirm OpenAI/provider keys are never exposed.
302.	Confirm deployment secrets are never exposed.
303.	Confirm Supabase service role logic is not revealed.
304.	Confirm RLS bypass logic is not revealed.
305.	Confirm hidden tables are not revealed.
306.	Confirm internal admin routes are not revealed.
307.	Confirm AI does not generate unsafe SQL, policies or migrations without review.
308.	Confirm AI-generated code/migration suggestions are not auto-applied unless explicitly designed and gated for admin/dev use.
309.	Confirm AI cannot call unsupported tools/actions through prompt injection.
310.	Confirm AI outputs are safe against XSS.
311.	Confirm AI outputs are safe against markdown injection.
312.	Confirm AI outputs are safe against HTML injection.
313.	Confirm AI outputs are safe against link spoofing.
314.	Confirm AI-rendered markdown is sanitised.
315.	Confirm AI-generated links are safe, permitted and not misleading.
________________________________________
11. Structured Actions, Tool Calls & Side-Effect Safety
316.	Confirm AI tool/action inputs are schema-validated.
317.	Confirm AI action outputs are schema-validated.
318.	Confirm AI action side effects are performed by deterministic backend functions, not free-form model text.
319.	Confirm AI decisions that affect customer records are converted into explicit structured actions before execution.
320.	Confirm every structured AI action is permission-checked server-side.
321.	Confirm every structured AI action is audit-logged.
322.	Confirm every structured AI action has clear success UI.
323.	Confirm every structured AI action has clear failure UI.
324.	Confirm AI tool calls cannot be replayed maliciously.
325.	Confirm AI action endpoints use CSRF/auth protection where applicable.
326.	Confirm AI action endpoints validate workspace ownership.
327.	Confirm AI action endpoints validate parent record ownership.
328.	Confirm AI action endpoints validate subscription/add-on/feature-flag access.
329.	Confirm AI action endpoints validate input length.
330.	Confirm AI action endpoints validate enum values.
331.	Confirm AI action endpoints validate IDs.
332.	Confirm AI action endpoints validate dates.
333.	Confirm AI action endpoints validate money values.
334.	Confirm AI action endpoints validate file references.
335.	Confirm AI action endpoints return structured errors.
336.	Confirm AI action endpoints are rate-limited.
337.	Confirm AI action endpoints are abuse-protected.
338.	Confirm AI edge functions have no service-role leakage to the client.
339.	Confirm AI edge functions do not use service role for user-scoped reads unless RLS-equivalent checks are manually enforced.
340.	Confirm AI edge functions log safe diagnostics for failed calls.
341.	Confirm AI edge functions have timeout handling.
342.	Confirm AI edge functions handle provider downtime gracefully.
343.	Confirm AI edge functions handle invalid model responses gracefully.
344.	Confirm AI edge functions handle token/context limits gracefully.
345.	Confirm AI edge functions truncate/summarise context safely without losing critical record permissions.
346.	Confirm AI context windows are not overloaded with unnecessary data.
347.	Confirm expensive AI actions use summarised/filtered context, not full workspace dumps.
348.	Confirm AI outputs are deterministic enough where business-critical actions require structured results.
349.	Confirm AI actions have test fixtures for expected input/output.
________________________________________
12. Human Approval, Risk Controls & External Side Effects
350.	Confirm destructive or externally visible AI actions require human confirmation.
351.	Confirm AI cannot automatically delete without explicit user confirmation.
352.	Confirm AI cannot automatically archive without explicit user confirmation.
353.	Confirm AI cannot automatically send without explicit user confirmation.
354.	Confirm AI cannot automatically publish without explicit user confirmation.
355.	Confirm AI cannot automatically pay without explicit user confirmation.
356.	Confirm AI cannot automatically refund without explicit user confirmation.
357.	Confirm AI cannot automatically invite without explicit user confirmation.
358.	Confirm AI cannot automatically notify without explicit user confirmation.
359.	Confirm AI cannot automatically change billing without explicit user confirmation.
360.	Confirm AI-generated drafts are clearly labelled as drafts.
361.	Confirm AI-generated emails are not sent automatically unless the user explicitly chooses send.
362.	Confirm AI-generated legal/compliance notices require review before use.
363.	Confirm AI-generated payment, arrears, possession, compliance or legal outputs include a clear review warning.
364.	Confirm AI never presents legal, financial or compliance guidance as guaranteed professional advice.
365.	Confirm AI action confirmation screens show the target record.
366.	Confirm AI action confirmation screens show affected records.
367.	Confirm AI action confirmation screens show output preview.
368.	Confirm AI action confirmation screens show risk level.
369.	Confirm AI actions that affect multiple records show a clear affected-record count and preview.
370.	Confirm AI bulk actions require stronger confirmation than single-record actions.
371.	Confirm AI bulk actions respect filters, selected records, permissions and workspace boundaries.
372.	Confirm AI bulk actions cannot silently process hidden or inaccessible records.
373.	Confirm AI action previews match the final submitted output.
374.	Confirm AI action cancellation leaves no partial records unless draft mode is intentional.
375.	Confirm rejected AI suggestions are not executed.
376.	Confirm edited AI suggestions execute the edited version, not the original version.
377.	Confirm AI approval flow records who approved, when and what changed.
378.	Confirm AI-suggested actions do not become live records until confirmed where approval is required.
________________________________________
13. Permission, Portal & Admin Safety
379.	Confirm AI actions cannot affect records outside the current workspace.
380.	Confirm AI actions cannot affect records outside the current parent route/record unless explicitly selected and permitted.
381.	Confirm AI actions cannot bypass RLS.
382.	Confirm AI actions cannot bypass role gates.
383.	Confirm AI actions cannot bypass feature flags.
384.	Confirm AI actions cannot bypass plan gates.
385.	Confirm AI actions cannot bypass add-on gates.
386.	Confirm AI actions cannot reveal private fields hidden from the user.
387.	Confirm AI actions cannot reveal tenant data outside permissions.
388.	Confirm AI actions cannot reveal landlord data outside permissions.
389.	Confirm AI actions cannot reveal supplier data outside permissions.
390.	Confirm AI actions cannot reveal owner data outside permissions.
391.	Confirm AI actions cannot reveal payment data outside permissions.
392.	Confirm AI actions cannot reveal legal data outside permissions.
393.	Confirm AI actions cannot reveal private notes outside permissions.
394.	Confirm AI actions cannot access Platform Admin data from a workspace user session.
395.	Confirm AI actions cannot access workspace data from public marketplace pages unless explicitly allowed and safe.
396.	Confirm AI actions cannot access tenant portal data from landlord/supplier portals incorrectly.
397.	Confirm AI actions respect tenant portal boundaries.
398.	Confirm AI actions respect landlord portal boundaries.
399.	Confirm AI actions respect supplier portal boundaries.
400.	Confirm AI actions respect admin boundaries.
401.	Confirm AI actions respect workspace boundaries.
402.	Confirm AI actions respect public marketplace boundaries.
403.	Confirm AI cannot create admin users.
404.	Confirm AI cannot escalate user privileges.
405.	Confirm AI cannot change its own model, limits, permissions or feature gates.
406.	Confirm AI cannot modify RLS policies, service keys, environment variables or deployment config from the app UI.
407.	Confirm AI cannot run arbitrary SQL, shell commands or code in production.
408.	Confirm AI actions that affect billing/subscriptions are admin-only and require explicit confirmation.
409.	Confirm AI actions that affect feature flags, users, permissions or workspace settings are admin-only and heavily audited.
410.	Confirm AI actions that affect marketplace/public pages require review and permission.
________________________________________
14. AI-Generated Content, Documents, Messages & Records
411.	Confirm AI can draft messages/emails without sending them automatically.
412.	Confirm AI can draft tasks/jobs/actions without creating them automatically unless confirmed.
413.	Confirm AI can generate follow-up actions with human approval.
414.	Confirm AI-generated customer-facing messages are clearly reviewable before sending.
415.	Confirm AI-generated supplier-facing messages are clearly reviewable before sending.
416.	Confirm AI-generated tenant messages respect tone, privacy and permissions.
417.	Confirm AI-generated landlord messages respect tone, privacy and permissions.
418.	Confirm AI-generated support/admin messages do not expose internal sensitive data.
419.	Confirm AI-generated notices, arrears letters, compliance reminders and legal drafts require explicit review.
420.	Confirm AI-generated financial summaries match source invoices, payments, expenses, deposits and arrears.
421.	Confirm AI-generated compliance summaries match source certificates, inspections, expiry dates and evidence.
422.	Confirm AI-generated planning summaries match planning profile assumptions, forecasts, costs, rent, bills, yield and scenario data.
423.	Confirm AI-generated work/maintenance summaries match jobs, suppliers, tasks, costs, photos and messages.
424.	Confirm AI-generated portfolio summaries match properties, units, tenancies, rent, compliance, work and money records.
425.	Confirm AI does not invent recommended suppliers unless based on actual permitted supplier data or clearly marked as a suggestion.
426.	Confirm AI does not invent marketplace provider claims.
427.	Confirm AI does not invent marketplace provider ratings.
428.	Confirm AI does not invent marketplace provider availability.
429.	Confirm AI-created records include created_by_ai, reviewed_by_user or source metadata where required.
430.	Confirm AI-created tasks appear in Work/Tasks and linked detail pages.
431.	Confirm AI-created maintenance actions appear in Work/Jobs and relevant property/unit/tenancy pages.
432.	Confirm AI-created compliance reminders appear in Compliance and Calendar where intended.
433.	Confirm AI-created financial follow-ups appear in Money/Accounting/Arrears where intended.
434.	Confirm AI-created planning actions appear in Planning and relevant property records where intended.
435.	Confirm AI-created automations appear in Automations/Settings where intended.
436.	Confirm AI-created messages appear in the correct inbox/thread and portal where intended.
437.	Confirm AI action outputs update connected dashboards, reports, activity feeds, records and notifications where intended.
________________________________________
15. Emails, Calendar, Invoices, Legal, Billing & Public Actions
438.	Confirm AI actions that send emails/messages show recipients before send.
439.	Confirm AI actions that send emails/messages show subject before send.
440.	Confirm AI actions that send emails/messages show body before send.
441.	Confirm AI actions that send emails/messages show attachments before send.
442.	Confirm AI actions that create calendar/reminder events show dates, times, timezone and attendees before save.
443.	Confirm AI actions that create invoices/payment links show amount, VAT/tax, due date, recipient and line items before save.
444.	Confirm AI actions that affect compliance/legal deadlines show source evidence and review warning.
445.	Confirm AI actions that affect billing/subscriptions are permission-gated.
446.	Confirm AI actions that affect public marketplace pages are permission-gated.
447.	Confirm AI actions that affect public marketplace pages require preview and review.
448.	Confirm AI-generated emails use correct workspace branding.
449.	Confirm AI-generated emails use correct sender and reply-to.
450.	Confirm AI-generated documents use correct workspace branding.
451.	Confirm AI-generated invoices/payment summaries match source data.
452.	Confirm AI-generated legal/compliance text includes appropriate review warning.
453.	Confirm AI-created calendar/reminder events appear in the correct calendar/reminder surface.
454.	Confirm failed email/calendar/invoice/legal/billing actions do not corrupt local records.
455.	Confirm retries do not duplicate emails, notifications, automations, documents or payments.
456.	Confirm backend idempotency exists for AI actions that create records or send communications.
________________________________________
16. AI Automation Handoff & Job Safety
457.	Confirm AI-created automations appear in Automations/Settings where intended.
458.	Confirm AI automation handoffs do not create infinite loops.
459.	Confirm AI-generated automations are disabled until reviewed where required.
460.	Confirm AI automation triggers cannot recursively trigger AI actions unless explicitly allowed and guarded.
461.	Confirm AI-generated automations cannot bypass automation permissions.
462.	Confirm AI-generated automations cannot bypass plan gates.
463.	Confirm AI-generated automations cannot bypass add-ons.
464.	Confirm AI-generated automations cannot bypass feature flags.
465.	Confirm queued AI actions cannot run after permissions are revoked unless revalidated at execution time.
466.	Confirm AI action jobs re-check workspace at execution time.
467.	Confirm AI action jobs re-check role at execution time.
468.	Confirm AI action jobs re-check plan at execution time.
469.	Confirm AI action jobs re-check add-on at execution time.
470.	Confirm AI action jobs re-check feature flag at execution time.
471.	Confirm long-running AI actions show progress or queued state.
472.	Confirm AI action retry does not duplicate records, emails, notifications, automations, documents or payments.
473.	Confirm AI actions do not overload Supabase.
474.	Confirm AI actions do not overload R2.
475.	Confirm AI actions do not overload SMTP.
476.	Confirm AI actions do not overload Stripe.
477.	Confirm AI actions do not overload external APIs.
478.	Confirm AI actions do not overload AI provider quotas.
________________________________________
17. Provider Reliability, Observability & Abuse Monitoring
479.	Confirm AI model/provider failure does not break non-AI Gala Dock pages.
480.	Confirm AI provider errors are logged with safe metadata.
481.	Confirm AI provider latency is monitored.
482.	Confirm AI action latency is acceptable for release.
483.	Confirm AI actions are included in frontend observability.
484.	Confirm AI actions are included in backend observability.
485.	Confirm AI actions are included in provider failure monitoring.
486.	Confirm AI actions are included in tool failure monitoring.
487.	Confirm AI actions are included in rate-limit monitoring.
488.	Confirm AI actions are included in slow-call monitoring.
489.	Confirm AI errors include safe support references without exposing raw prompt or secrets.
490.	Confirm AI abuse monitoring exists for repeated prompts.
491.	Confirm AI abuse monitoring exists for scraping attempts.
492.	Confirm AI abuse monitoring exists for prompt injection.
493.	Confirm AI abuse monitoring exists for unusual usage.
494.	Confirm AI logs are searchable by workspace.
495.	Confirm AI logs are searchable by user.
496.	Confirm AI logs are searchable by route.
497.	Confirm AI logs are searchable by action.
498.	Confirm AI logs are searchable by provider.
499.	Confirm AI logs are searchable by model.
500.	Confirm AI logs are searchable by error type.
501.	Confirm AI DDoS/rate-limit tests are proportionate and focused on exposed endpoints, not destructive testing against production.
________________________________________
18. Testing, Security, Prompt-Injection & Data-Leakage Checks
502.	Run unit tests for AI UI rendering.
503.	Run unit tests for chat state.
504.	Run unit tests for message sending.
505.	Run unit tests for disabled states.
506.	Run unit tests for paywall states.
507.	Run unit tests for permission states.
508.	Run unit tests for action cards.
509.	Run unit tests for AI action schema validation.
510.	Run unit tests for AI failure states.
511.	Run integration tests for AI edge functions.
512.	Run integration tests for Supabase grounding reads.
513.	Run integration tests for RLS.
514.	Run integration tests for usage tracking.
515.	Run integration tests for audit logs.
516.	Run integration tests for storage.
517.	Run integration tests for notifications.
518.	Run integration tests for connected sections.
519.	Run E2E tests covering open Copilot → ask route-specific question → receive grounded answer → approve action → record created/updated → result appears elsewhere.
520.	Run E2E tests covering draft-only AI flows: generate email/document/task → edit draft → save/send/create manually.
521.	Run negative tests for wrong workspace.
522.	Run negative tests for wrong role.
523.	Run negative tests for missing subscription.
524.	Run negative tests for missing add-on.
525.	Run negative tests for disabled feature flag.
526.	Run negative tests for rate limit exceeded.
527.	Run negative tests for direct API access.
528.	Run prompt-injection tests against uploaded documents.
529.	Run prompt-injection tests against notes.
530.	Run prompt-injection tests against messages.
531.	Run prompt-injection tests against emails.
532.	Run prompt-injection tests against PDFs.
533.	Run prompt-injection tests against CSVs.
534.	Run prompt-injection tests against marketplace copy.
535.	Run prompt-injection tests against user prompts.
536.	Run data-leakage tests proving AI cannot reveal hidden records.
537.	Run data-leakage tests proving AI cannot reveal private notes.
538.	Run data-leakage tests proving AI cannot reveal restricted fields.
539.	Run data-leakage tests proving AI cannot reveal other workspaces.
540.	Run data-leakage tests proving AI cannot reveal admin data.
541.	Run large-context tests covering properties with many units.
542.	Run large-context tests covering many tenancies.
543.	Run large-context tests covering many jobs.
544.	Run large-context tests covering many documents.
545.	Run large-context tests covering many compliance records.
546.	Run large-context tests covering many invoices.
547.	Run large-context tests covering many messages.
548.	Run large-context tests covering many activity logs.
549.	Run performance tests covering route-level AI suggestions.
550.	Run performance tests covering chat open speed.
551.	Run performance tests covering first-token latency.
552.	Run performance tests covering full-response latency.
553.	Run performance tests covering action execution latency.
554.	Confirm all AI/Copilot fixes are implemented before scoring; do not only report issues.
________________________________________
19. Product Scope, Redundancy & Bloat Review
555.	Confirm AI/Copilot is production-useful.
556.	Confirm AI/Copilot is not just a decorative chatbot.
557.	Confirm AI/Copilot improves real customer workflows.
558.	Confirm AI/Copilot does not add confusing bloat.
559.	Confirm duplicate AI actions are removed, merged or feature-flagged.
560.	Confirm unsafe or unclear AI actions are removed or moved behind feature flags.
561.	Confirm advanced/unreleased AI actions are hidden behind feature flags.
562.	Confirm AI actions are not replacing core working manual buttons.
563.	Confirm all remaining AI/Copilot features are valuable for release.
564.	Confirm AI/Copilot is ready for production, not just visually acceptable.
________________________________________
20. Release Evidence Document & Final Score
565.	Create a release evidence document at /release-gated/docs/ai-copilot/{ai-surface-or-action-name}.md.
566.	The document must include AI surface name.
567.	The document must include route/component.
568.	The document must include parent section.
569.	The document must include entry points tested.
570.	The document must include action IDs tested.
571.	The document must include models tested.
572.	The document must include feature flags tested.
573.	The document must include plan/add-on gates tested.
574.	The document must include roles tested.
575.	The document must include prompts tested.
576.	The document must include files tested.
577.	The document must include grounding sources tested.
578.	The document must include Supabase tables checked.
579.	The document must include RLS policies checked.
580.	The document must include edge functions checked.
581.	The document must include storage buckets checked.
582.	The document must include usage/credit tracking checked.
583.	The document must include rate limits checked.
584.	The document must include audit logs checked.
585.	The document must include notifications checked.
586.	The document must include automations checked.
587.	The document must include emails/documents generated.
588.	The document must include cross-section effects checked.
589.	The document must include screenshots tested.
590.	The document must include screen sizes tested.
591.	The document must include prompt-injection tests.
592.	The document must include data-leakage tests.
593.	The document must include bugs found.
594.	The document must include fixes made.
595.	The document must include migrations applied.
596.	The document must include tests run.
597.	The document must include performance/security findings.
598.	The document must include remaining user/manual actions.
599.	Add anything Claude Code cannot complete to /release-gated/user-fixes/ai-copilot/{ai-surface-or-action-name}.md with exact manual steps.
600.	Give the AI/Copilot surface or action a release score out of 100.
601.	Fix all issues until AI/Copilot chat, actions, settings, usage, grounding, RLS, audit and integrations reach 100/100.
602.	Do not mark AI/Copilot complete below 100/100.
603.	Confirm final release decision states one of: ready for release, ready behind feature flag, ready for admin-only beta, blocked pending manual fix, or removed/merged due to bloat.
_________________________________________________________________________________
Section 7: Automations — Final Release Readiness Audit
Use Chrome MCP resize windows and test code too: UI function, database, Supabase/RLS, edge functions, cron jobs, event triggers, queues, webhooks, rate limits, idempotency, audit logs, notifications, AI handoff and full E2E customer stories.
Head Section:
Automation Section Name:
Automation Route:
Automation Surface / Component:
Automation Type: Recipe / Rule / Canvas / Scheduled Job / Event Trigger / System Automation / AI-Assisted Automation
Automation ID / Function / Edge Function / Cron Job:
Parent Section / Route Where Automation Appears:
Workspace / Portal / Admin Surface:
Required Plan / Add-on / Feature Flag:
Roles Tested: Owner / Admin / Manager / Team Member / Read-only / Accountant / Portal User / Platform Admin
________________________________________
1. Automation Registration, Routes & Availability
1.	Confirm the automation surface is registered in the route registry.
2.	Confirm the automation surface is registered in the component registry.
3.	Confirm the automation surface is registered in the automation registry.
4.	Confirm the automation trigger registry is connected.
5.	Confirm the automation action registry is connected.
6.	Confirm the automation surface is registered in the feature flag map.
7.	Confirm the automation surface is registered in the subscription gate map.
8.	Confirm the automation surface is registered in the add-on map.
9.	Confirm the automation surface is registered in the permission map.
10.	Confirm the automation surface is registered in Platform Admin automation settings.
11.	Confirm automation routes load correctly.
12.	Confirm direct deep links to automation routes work only for permitted users.
13.	Confirm unauthenticated users are redirected correctly.
14.	Confirm users without workspace access are blocked with the correct no-access state.
15.	Confirm limited-role users only see allowed automations, templates, triggers, actions, records, logs and controls.
16.	Confirm automations appear only where intended.
17.	Confirm automations do not appear on unauthenticated routes unless explicitly designed for public/request flows.
18.	Confirm automation entry points are consistent across Gala Dock.
19.	Confirm automation entry points work from Settings where relevant.
20.	Confirm automation entry points work from section actions where relevant.
21.	Confirm automation entry points work from record detail pages where relevant.
22.	Confirm automation entry points work from quick actions where relevant.
23.	Confirm automation entry points work from AI suggestions where relevant.
24.	Confirm automation entry points work from templates/recipe library where relevant.
25.	Confirm automation entry points work from admin surfaces where relevant.
26.	Confirm hidden automation actions cannot be triggered through direct API calls.
27.	Confirm disabled automation areas do not leak through navigation.
28.	Confirm disabled automation areas do not leak through Settings.
29.	Confirm disabled automation areas do not leak through quick actions.
30.	Confirm disabled automation areas do not leak through global create.
31.	Confirm disabled automation areas do not leak through AI.
32.	Confirm disabled automation areas do not leak through command/search.
33.	Confirm disabled automation areas do not leak through direct URL.
34.	Confirm disabled automation areas do not leak through APIs.
35.	Confirm disabled automation areas do not leak through admin views.
36.	Confirm disabled automation areas do not leak through portals.
37.	Confirm old or duplicate automation routes redirect correctly if sections were renamed, merged or moved.
38.	Confirm breadcrumbs, page title, H1/H2 labels and browser title are consistent.
39.	Confirm automation list, recipe library, builder/canvas, detail page, logs and settings routes are connected properly.
________________________________________
2. Plan Gates, Add-ons, Feature Flags & Admin Controls
40.	Confirm automation can be disabled globally from Platform Admin.
41.	Confirm automation can be disabled per workspace where required.
42.	Confirm automation can be gated by plan.
43.	Confirm automation can be gated by add-on.
44.	Confirm automation can be gated by role.
45.	Confirm automation can be gated by feature flag.
46.	Confirm feature flag gating is separate from plan, add-on and role gating.
47.	Confirm feature flag gating does not conflict with subscription/add-on gating.
48.	Confirm disabled automation states do not leave broken buttons.
49.	Confirm disabled automation states do not leave fake cards.
50.	Confirm disabled automation states do not leave empty panels.
51.	Confirm disabled automation states do not leave placeholder flows.
52.	Confirm upgrade/paywall states clearly explain the required plan/add-on.
53.	Confirm upgrade/paywall states route correctly to billing.
54.	Confirm advanced/full-canvas automation features are behind feature flags if not V1 release-ready.
55.	Confirm Platform Admin can set global automation limits.
56.	Confirm Platform Admin can disable automations globally during incidents.
57.	Confirm Platform Admin can disable specific automation triggers during incidents.
58.	Confirm Platform Admin can disable specific automation actions during incidents.
59.	Confirm Platform Admin can inspect automation health.
60.	Confirm Platform Admin can inspect failed runs.
61.	Confirm Platform Admin can inspect slow runs.
62.	Confirm Platform Admin can inspect queue depth.
63.	Confirm Platform Admin can inspect usage and abuse signals.
64.	Confirm Workspace Settings can show enabled automations where required.
65.	Confirm Workspace Settings can show automation usage where required.
66.	Confirm Workspace Settings can show automation limits where required.
67.	Confirm Workspace Settings can show automation logs where required.
68.	Confirm Workspace Settings can show available actions where required.
69.	Confirm Account Settings can show user-level automation preferences where required.
70.	Confirm automation notification settings exist where relevant.
________________________________________
3. UI, Styling, Shell Width & Premium Layout
71.	Confirm automation UI follows Gala Dock premium styling.
72.	Confirm automation UI uses consistent spacing.
73.	Confirm automation UI uses consistent borders.
74.	Confirm automation UI uses consistent typography.
75.	Confirm automation UI uses consistent icons.
76.	Confirm automation UI uses consistent cards.
77.	Confirm automation UI uses consistent empty states.
78.	Confirm automation UI uses consistent badges.
79.	Confirm automation UI uses Gala Dock brand tokens.
80.	Confirm automation styling is consistent with benchmark /home.
81.	Confirm automation page width aligns to the global shell width.
82.	Confirm automation cards align to the global shell width.
83.	Confirm automation canvas aligns to the global shell width.
84.	Confirm automation panels align to the global shell width.
85.	Confirm automation tabs align to the global shell width.
86.	Confirm automation forms align to the global shell width.
87.	Confirm automation action bars align to the global shell width.
88.	Confirm automation surface respects white-label branding where required.
89.	Confirm sticky action bars do not overlap automation content.
90.	Confirm automation layout does not jump between list, builder, recipe and log views.
91.	Confirm automation status badges are consistent across list, detail page, logs, settings and related records.
92.	Confirm loading skeletons are clear and premium.
93.	Confirm saving states are clear and premium.
94.	Confirm testing states are clear and premium.
95.	Confirm running states are clear and premium.
96.	Confirm queued states are clear and premium.
97.	Confirm failed states are clear and premium.
98.	Confirm disabled/gated states are clear and premium.
99.	Confirm automation pages load without console errors.
100.	Confirm automation pages load without React warnings.
101.	Confirm automation pages load without hydration warnings.
102.	Confirm automation pages load without failed network calls.
103.	Confirm automation pages load without broken chunks.
104.	Confirm automation pages load without white-screen states.
105.	Confirm error boundaries catch automation UI failures without breaking the whole app shell.
________________________________________
4. Responsive, Tablet, Mobile, PWA & Accessibility
106.	Confirm Chrome MCP/browser QA is run at 1440.
107.	Confirm Chrome MCP/browser QA is run at 1280.
108.	Confirm Chrome MCP/browser QA is run at 1024.
109.	Confirm Chrome MCP/browser QA is run on tablet.
110.	Confirm Chrome MCP/browser QA is run on mobile.
111.	Confirm Chrome MCP/browser QA is run in PWA mode.
112.	Confirm automation builder is usable at 1440.
113.	Confirm automation builder is usable at 1280.
114.	Confirm automation builder is usable at 1024.
115.	Confirm tablet automation UI uses a premium stacked or sliding panel pattern where needed.
116.	Confirm mobile/PWA automation UI works cleanly where editing is supported.
117.	Confirm mobile/PWA intentionally limits complex editing with a clear message where complex canvas editing is not supported.
118.	Confirm mobile/PWA does not clip triggers.
119.	Confirm mobile/PWA does not clip actions.
120.	Confirm mobile/PWA does not clip logs.
121.	Confirm mobile/PWA does not clip buttons.
122.	Confirm mobile/PWA does not clip save bars.
123.	Confirm mobile/PWA does not clip confirmation modals.
124.	Confirm mobile safe-area spacing works for iOS/Android PWA.
125.	Confirm touch targets are large enough on tablet/mobile.
126.	Confirm keyboard navigation works across triggers.
127.	Confirm keyboard navigation works across actions.
128.	Confirm keyboard navigation works across forms.
129.	Confirm keyboard navigation works across dropdowns.
130.	Confirm keyboard navigation works across menus.
131.	Confirm keyboard navigation works across canvas nodes.
132.	Confirm keyboard navigation works across logs.
133.	Confirm keyboard navigation works across confirmation modals.
134.	Confirm Escape behaves safely.
135.	Confirm Enter behaves safely.
136.	Confirm Tab behaves safely.
137.	Confirm arrow keys behave safely.
138.	Confirm focus movement behaves safely.
139.	Confirm ARIA roles exist for tabs.
140.	Confirm ARIA roles exist for dialogs.
141.	Confirm ARIA roles exist for menus.
142.	Confirm ARIA roles exist for canvas nodes.
143.	Confirm ARIA roles exist for forms.
144.	Confirm ARIA roles exist for alerts.
145.	Confirm ARIA roles exist for toggles.
146.	Confirm ARIA roles exist for log tables.
147.	Confirm screen-reader labels exist for icon-only automation controls.
148.	Confirm WCAG contrast passes for automation cards.
149.	Confirm WCAG contrast passes for badges.
150.	Confirm WCAG contrast passes for canvas nodes.
151.	Confirm WCAG contrast passes for status states.
152.	Confirm WCAG contrast passes for alerts.
153.	Confirm WCAG contrast passes for logs.
154.	Confirm WCAG contrast passes for buttons.
155.	Confirm WCAG contrast passes for disabled states.
156.	Confirm visible focus states are consistent with Gala Dock styling.
157.	Confirm visual regression screenshots are captured for automation list, recipe library, builder/canvas, configuration panels, action previews, logs, failures, quota states and mobile/PWA states.
158.	Confirm before/after screenshots are saved where visual repair was required.
________________________________________
5. Automation List, Statuses, Counts & Real Data
159.	Confirm automation list page shows active state correctly.
160.	Confirm automation list page shows paused state correctly.
161.	Confirm automation list page shows draft state correctly.
162.	Confirm automation list page shows failed state correctly.
163.	Confirm automation list page shows disabled state correctly.
164.	Confirm automation list page shows gated state correctly.
165.	Confirm automation list page shows archived state correctly.
166.	Confirm automation count badges use real data.
167.	Confirm automation KPI/stat cards use real data.
168.	Confirm automation count badges update correctly.
169.	Confirm automation KPI/stat cards update correctly.
170.	Confirm no fake automation metrics remain.
171.	Confirm no fake run counts remain.
172.	Confirm no fake success rates remain.
173.	Confirm no placeholder logs remain.
174.	Confirm automation surfaces use real Supabase data.
175.	Confirm automation surfaces do not use mock or stale data.
176.	Confirm seeded demo automations are clearly marked as demo data where used.
177.	Confirm no lorem ipsum remains.
178.	Confirm no fake customers remain.
179.	Confirm no fake tenants remain.
180.	Confirm no fake suppliers remain.
181.	Confirm no fake jobs remain.
182.	Confirm no fake payments remain.
183.	Confirm no fake logs remain unless clearly demo-only.
184.	Confirm slow network states are handled gracefully.
185.	Confirm failed network states are handled gracefully.
186.	Confirm offline/PWA states are handled gracefully.
187.	Confirm stale automation data is not shown after workspace switching.
188.	Confirm stale automation data is not shown after role change.
189.	Confirm stale automation data is not shown after subscription change.
190.	Confirm stale automation data is not shown after feature flag change.
191.	Confirm cache invalidation works after create, edit, pause, resume, archive, restore, delete, run, fail and retry.
192.	Confirm realtime updates work where expected, or manual refresh behaviour is clear.
________________________________________
6. Recipes, Templates & Library Quality
193.	Confirm automation templates/recipes are useful to Gala Dock customer stories.
194.	Confirm automation templates/recipes are not decorative.
195.	Confirm duplicate recipes/templates are removed, merged or feature-flagged.
196.	Confirm automation templates are not overbuilt bloat for V1 unless hidden behind feature flags.
197.	Confirm automation templates are grouped logically.
198.	Confirm recipe groups include Portfolio where relevant.
199.	Confirm recipe groups include Work where relevant.
200.	Confirm recipe groups include Compliance where relevant.
201.	Confirm recipe groups include Legal where relevant.
202.	Confirm recipe groups include Money where relevant.
203.	Confirm recipe groups include Planning where relevant.
204.	Confirm recipe groups include Documents where relevant.
205.	Confirm recipe groups include Portals where relevant.
206.	Confirm recipe groups include Notifications where relevant.
207.	Confirm recipe groups include Admin where relevant.
208.	Confirm automation templates explain the trigger.
209.	Confirm automation templates explain the conditions.
210.	Confirm automation templates explain the actions.
211.	Confirm automation templates explain the permissions.
212.	Confirm automation templates explain the risk level.
213.	Confirm automation templates explain the expected result before activation.
214.	Confirm automation template previews show affected records where supported.
215.	Confirm automation template previews show required permissions.
216.	Confirm automation template activation creates the correct saved automation records.
217.	Confirm automation template activation does not activate unsafe actions without review.
218.	Confirm template configuration validates required fields before save.
219.	Confirm template configuration uses real permitted records only.
220.	Confirm unsupported or unreleased templates are hidden or disabled with a clear reason.
________________________________________
7. Builder / Canvas / Drafts / Editing State
221.	Confirm automation builder supports creating a draft automation without making it live.
222.	Confirm draft automations cannot run.
223.	Confirm paused automations cannot run.
224.	Confirm archived/deleted automations cannot run.
225.	Confirm failed automations do not keep retrying forever without limits.
226.	Confirm automation enable action works correctly.
227.	Confirm automation disable action works correctly.
228.	Confirm automation pause action works correctly.
229.	Confirm automation resume action works correctly.
230.	Confirm automation archive action works correctly.
231.	Confirm automation delete action works correctly.
232.	Confirm automation restore action works correctly.
233.	Confirm automation status changes are audit-logged.
234.	Confirm automation status changes update list, detail, settings, logs and activity feeds.
235.	Confirm destructive automation actions require confirmation.
236.	Confirm automation delete/archive wording is clear and safe.
237.	Confirm automation restore reconnects the correct triggers/actions/logs where applicable.
238.	Confirm automation duplication/cloning works where intended.
239.	Confirm cloned automations start as draft unless explicitly enabled.
240.	Confirm cloned automations do not copy unsafe credentials.
241.	Confirm cloned automations do not copy hidden records incorrectly.
242.	Confirm cloned automations do not copy stale IDs incorrectly.
243.	Confirm automation naming is required.
244.	Confirm automation naming is human-readable.
245.	Confirm automation descriptions are optional but useful.
246.	Confirm automation owner/creator/editor fields are stored correctly.
247.	Confirm automation records include workspace_id.
248.	Confirm automation records include created_by.
249.	Confirm automation records include updated_by.
250.	Confirm automation records include status.
251.	Confirm automation records include source.
252.	Confirm automation records include trigger type.
253.	Confirm automation records include action type.
254.	Confirm automation records include timestamps.
255.	Confirm automation forms validate required fields.
256.	Confirm automation forms validate field types.
257.	Confirm automation forms validate enum values.
258.	Confirm automation forms validate IDs.
259.	Confirm automation forms validate dates.
260.	Confirm automation forms validate money values.
261.	Confirm automation forms validate URLs.
262.	Confirm automation forms validate emails.
263.	Confirm automation forms validate conditional fields.
264.	Confirm validation exists on frontend.
265.	Confirm validation exists on backend.
266.	Confirm validation errors are clear and attached to the correct field/node/step.
267.	Confirm changing an earlier trigger or condition updates later actions safely.
268.	Confirm hidden conditional fields are not submitted with stale values.
269.	Confirm saving automation changes preserves form/canvas state.
270.	Confirm unsaved-change warnings appear before leaving the automation builder.
271.	Confirm cancelling automation creation does not create live records.
272.	Confirm partial/draft records are safely labelled as draft.
273.	Confirm abandoned draft automations do not run or appear as live automations.
274.	Confirm automation save buttons use loading/disabled states.
275.	Confirm double-clicking save cannot create duplicate automation records.
276.	Confirm double-clicking activate cannot create duplicate automation records or duplicate runs.
277.	Confirm double-clicking run/test cannot create duplicate runs.
278.	Confirm backend idempotency or unique constraints prevent duplicate submissions.
279.	Confirm automation builder saves as a safe transaction where multiple records/nodes/edges/actions are created.
280.	Confirm failed saves roll back safely or show clear recovery steps.
281.	Confirm created automations appear immediately in Settings.
282.	Confirm created automations appear immediately in automation list.
283.	Confirm created automations appear immediately in related sections where intended.
284.	Confirm created automations appear immediately in activity feeds where intended.
285.	Confirm created automations appear immediately in admin dashboards where intended.
________________________________________
8. Trigger Registry, Event Triggers & Scheduled Triggers
286.	Confirm automation trigger registry is complete.
287.	Confirm every trigger has a clear name.
288.	Confirm every trigger has a clear description.
289.	Confirm every trigger has required permissions.
290.	Confirm every trigger has required data source.
291.	Confirm every trigger has required plan/add-on where relevant.
292.	Confirm every trigger has feature flag mapping where relevant.
293.	Confirm every trigger has risk rating.
294.	Confirm unsupported triggers are hidden or disabled with a clear reason.
295.	Confirm event-based triggers work correctly.
296.	Confirm scheduled/time-based triggers work correctly.
297.	Confirm manual-run triggers work correctly.
298.	Confirm record-created triggers work correctly.
299.	Confirm record-updated triggers work correctly.
300.	Confirm status-changed triggers work correctly.
301.	Confirm date/deadline triggers work correctly.
302.	Confirm compliance-expiry triggers work correctly.
303.	Confirm rent/arrears/payment triggers work correctly where relevant.
304.	Confirm work/job/maintenance triggers work correctly where relevant.
305.	Confirm document/upload/evidence triggers work correctly where relevant.
306.	Confirm portal-message triggers work correctly where relevant.
307.	Confirm marketplace/provider triggers work correctly where relevant.
308.	Confirm AI-suggested automation triggers work only with explicit review where required.
309.	Confirm webhook/external triggers work only where intentionally supported.
310.	Confirm cron/scheduled triggers use correct UK timezone handling.
311.	Confirm date triggers handle daylight saving time correctly.
312.	Confirm recurring schedules handle daily schedules where supported.
313.	Confirm recurring schedules handle weekly schedules where supported.
314.	Confirm recurring schedules handle monthly schedules where supported.
315.	Confirm recurring schedules handle yearly schedules where supported.
316.	Confirm recurring schedules handle interval schedules where supported.
317.	Confirm recurring schedules handle one-off schedules where supported.
318.	Confirm recurrence end dates work correctly.
319.	Confirm recurrence counts work correctly.
320.	Confirm missed scheduled runs are handled intentionally: skip, catch up or queue according to product rules.
321.	Confirm duplicate scheduled runs are prevented.
322.	Confirm scheduled jobs re-check workspace at execution time.
323.	Confirm scheduled jobs re-check role at execution time.
324.	Confirm scheduled jobs re-check plan at execution time.
325.	Confirm scheduled jobs re-check add-on at execution time.
326.	Confirm scheduled jobs re-check feature flag at execution time.
327.	Confirm trigger filters/conditions are applied before actions run.
328.	Confirm trigger filters cannot be bypassed by client-side changes.
________________________________________
9. Condition Builder, Filters & Matching Logic
329.	Confirm condition builder supports text operators.
330.	Confirm condition builder supports number operators.
331.	Confirm condition builder supports money operators.
332.	Confirm condition builder supports date operators.
333.	Confirm condition builder supports enum/status operators.
334.	Confirm condition builder supports boolean operators.
335.	Confirm condition builder supports relation operators where intended.
336.	Confirm condition builder validates impossible conditions.
337.	Confirm condition builder validates contradictory conditions.
338.	Confirm condition previews show the correct matching record count where supported.
339.	Confirm condition previews only include records the user is allowed to access.
340.	Confirm saved conditions do not leak records across workspaces.
341.	Confirm saved conditions do not leak records across users unless intentionally shared.
342.	Confirm condition changes are audit-logged.
343.	Confirm condition filters are evaluated server-side.
344.	Confirm condition filters are not trusted from client-only state.
345.	Confirm condition changes update downstream action previews safely.
346.	Confirm conditions handle null/empty values correctly.
347.	Confirm conditions handle archived/deleted/locked records according to product rules.
348.	Confirm conditions handle UK date/timezone logic correctly.
349.	Confirm conditions handle currency/money values correctly.
350.	Confirm conditions are performance-safe on large datasets.
________________________________________
10. Action Registry, Action Safety & Side Effects
351.	Confirm automation action registry is complete.
352.	Confirm every action has a clear name.
353.	Confirm every action has a clear description.
354.	Confirm every action has required permissions.
355.	Confirm every action has required data source.
356.	Confirm every action has required plan/add-on where relevant.
357.	Confirm every action has feature flag mapping where relevant.
358.	Confirm every action has risk rating.
359.	Confirm unsupported actions are hidden or disabled with a clear reason.
360.	Confirm create-task actions work correctly.
361.	Confirm create-job/maintenance actions work correctly.
362.	Confirm create-reminder/calendar actions work correctly.
363.	Confirm send-notification actions work correctly.
364.	Confirm send-email actions work correctly where supported.
365.	Confirm draft-email/message actions work correctly where review is required.
366.	Confirm create-document/PDF actions work correctly where supported.
367.	Confirm update-status actions work correctly.
368.	Confirm assign-user/team/supplier actions work correctly.
369.	Confirm create-compliance-reminder actions work correctly.
370.	Confirm create-money/arrears/follow-up actions work correctly.
371.	Confirm create-planning/follow-up/scenario actions work correctly where supported.
372.	Confirm portal-message actions work correctly where supported.
373.	Confirm webhook/API actions work correctly where supported.
374.	Confirm AI-summary/draft actions work only where permitted and reviewed where needed.
375.	Confirm billing/subscription/admin actions are admin-only and heavily audited.
376.	Confirm destructive actions such as delete/archive/send/publish/refund/charge/change-billing/change-permissions require explicit confirmation or are not allowed.
377.	Confirm automation actions cannot delete without the required safety level.
378.	Confirm automation actions cannot archive without the required safety level.
379.	Confirm automation actions cannot send without the required safety level.
380.	Confirm automation actions cannot publish without the required safety level.
381.	Confirm automation actions cannot pay without the required safety level.
382.	Confirm automation actions cannot refund without the required safety level.
383.	Confirm automation actions cannot invite without the required safety level.
384.	Confirm automation actions cannot notify without the required safety level.
385.	Confirm automation actions cannot change billing without the required safety level.
386.	Confirm externally visible actions show a clear preview before activation.
387.	Confirm email/message actions show recipient before activation.
388.	Confirm email/message actions show subject before activation.
389.	Confirm email/message actions show body before activation.
390.	Confirm email/message actions show attachments before activation.
391.	Confirm email/message actions show send conditions before activation.
392.	Confirm notifications respect user and workspace notification preferences.
393.	Confirm SMTP/email actions use correct sender.
394.	Confirm SMTP/email actions use correct reply-to.
395.	Confirm SMTP/email actions use workspace branding.
396.	Confirm SMTP/email actions use correct variables.
397.	Confirm SMTP/email actions have delivery logging.
398.	Confirm email actions do not send in demo/test mode unless explicitly allowed.
399.	Confirm payment/billing-related actions show amount.
400.	Confirm payment/billing-related actions show due date.
401.	Confirm payment/billing-related actions show line items.
402.	Confirm payment/billing-related actions show recipient.
403.	Confirm payment/billing-related actions show VAT/tax.
404.	Confirm payment/billing-related actions show confirmation before activation.
405.	Confirm compliance/legal actions show source evidence and review warnings.
406.	Confirm portal/public actions require review and permissions where needed.
407.	Confirm actions cannot affect records outside the current workspace.
408.	Confirm actions cannot affect records outside the selected parent/property/unit/tenancy/supplier/contact/invoice/job/compliance/planning context unless explicitly selected and permitted.
409.	Confirm actions cannot reveal private fields hidden from the user.
410.	Confirm actions cannot modify private fields hidden from the user.
411.	Confirm actions respect tenant portal boundaries.
412.	Confirm actions respect landlord portal boundaries.
413.	Confirm actions respect supplier portal boundaries.
414.	Confirm actions respect workspace boundaries.
415.	Confirm actions respect admin boundaries.
416.	Confirm actions respect public marketplace boundaries.
417.	Confirm actions cannot access Platform Admin data from a workspace user session.
418.	Confirm actions cannot escalate privileges.
419.	Confirm actions cannot create admin users.
420.	Confirm actions cannot modify RLS policies, service keys, environment variables, deployment config or feature gates.
________________________________________
11. Backend Execution, Edge Functions, RPCs & Auth Enforcement
421.	Confirm automation tool/action inputs are schema-validated.
422.	Confirm automation outputs are schema-validated.
423.	Confirm side effects are performed by deterministic backend functions, not free-form frontend state.
424.	Confirm every action is permission-checked server-side.
425.	Confirm every action is audit-logged.
426.	Confirm every action has clear success UI.
427.	Confirm every action has clear failed UI.
428.	Confirm every action has clear skipped UI.
429.	Confirm every action has clear cancelled UI.
430.	Confirm every action has clear retry UI.
431.	Confirm automation endpoints use auth protection.
432.	Confirm automation endpoints validate workspace ownership.
433.	Confirm automation endpoints validate parent record ownership.
434.	Confirm automation endpoints validate subscription/add-on/feature-flag access.
435.	Confirm automation endpoints validate input length.
436.	Confirm automation endpoints validate enum values.
437.	Confirm automation endpoints validate IDs.
438.	Confirm automation endpoints validate dates.
439.	Confirm automation endpoints validate money values.
440.	Confirm automation endpoints validate file references.
441.	Confirm automation endpoints return structured errors.
442.	Confirm automation endpoints are rate-limited.
443.	Confirm automation endpoints are abuse-protected.
444.	Confirm edge functions used by automations do not leak service-role access to the client.
445.	Confirm edge functions do not use service role for user-scoped reads unless RLS-equivalent checks are manually enforced.
446.	Confirm edge functions have timeout handling.
447.	Confirm edge functions handle provider/API downtime gracefully.
448.	Confirm edge functions handle invalid payloads gracefully.
449.	Confirm edge functions log safe diagnostics for failed calls.
450.	Confirm related edge functions/RPCs cannot be abused cross-workspace.
451.	Confirm failed edge functions do not corrupt records.
452.	Confirm backend execution logs safe error references without exposing secrets.
________________________________________
12. Cron Jobs, Queues, Retries & Delayed Execution
453.	Confirm cron jobs are registered correctly.
454.	Confirm cron jobs run on the expected schedule.
455.	Confirm cron jobs do not run duplicate overlapping jobs.
456.	Confirm cron jobs re-check automation status before execution.
457.	Confirm cron jobs re-check workspace subscription/add-on/feature-flag status before execution.
458.	Confirm cron jobs skip paused automations.
459.	Confirm cron jobs skip draft automations.
460.	Confirm cron jobs skip disabled automations.
461.	Confirm cron jobs skip archived automations.
462.	Confirm cron jobs skip deleted automations.
463.	Confirm cron jobs handle failures with safe retry limits.
464.	Confirm retry behaviour uses sensible backoff.
465.	Confirm failed jobs are visible in automation logs.
466.	Confirm permanently failed jobs do not retry forever.
467.	Confirm queued jobs are processed once.
468.	Confirm queue workers use idempotency keys.
469.	Confirm queue workers are safe under concurrent execution.
470.	Confirm long-running automation jobs show queued/running/progress states where relevant.
471.	Confirm queued jobs revalidate permissions at execution time, not only when created.
472.	Confirm delayed jobs do not run after the automation is disabled unless intentionally allowed.
473.	Confirm delayed jobs do not run after the user loses permission.
474.	Confirm delayed jobs do not run after the workspace loses plan/add-on access.
475.	Confirm wait/delay steps work where supported.
476.	Confirm wait/delay steps revalidate permissions when resumed.
477.	Confirm wait/delay steps revalidate record state when resumed.
478.	Confirm wait/delay steps are cancelled when the automation is paused/deleted where required.
479.	Confirm partial failures in multi-action automations are handled according to product rules.
480.	Confirm partial failures can rollback where required.
481.	Confirm partial failures can continue where product rules allow.
482.	Confirm partial failures can skip where product rules allow.
483.	Confirm partial failures are marked partial where product rules require.
484.	Confirm multi-step automation execution order is deterministic.
485.	Confirm conditional branches execute the correct path.
486.	Confirm branches that do not match are logged as skipped where useful.
________________________________________
13. Loop Prevention, Idempotency & Spam Protection
487.	Confirm automation loop prevention exists.
488.	Confirm automation A cannot endlessly trigger automation B and then automation A again.
489.	Confirm automation-created records include source metadata so loop prevention can detect them.
490.	Confirm automation recursion limits exist.
491.	Confirm AI-generated automations cannot create infinite loops.
492.	Confirm notification/email automations cannot spam users repeatedly.
493.	Confirm repeated trigger events do not create duplicate records.
494.	Confirm retries do not duplicate records.
495.	Confirm retries do not duplicate emails.
496.	Confirm retries do not duplicate messages.
497.	Confirm retries do not duplicate notifications.
498.	Confirm retries do not duplicate documents.
499.	Confirm retries do not duplicate payment links.
500.	Confirm retries do not duplicate status changes.
501.	Confirm activation/test/manual run cannot create duplicate runs through double-clicks.
502.	Confirm idempotency keys are used for create/update/send actions where required.
503.	Confirm concurrency tests prove simultaneous triggers do not create duplicate or contradictory outcomes.
504.	Confirm bulk automations cannot silently process hidden or inaccessible records.
505.	Confirm bulk automation actions require stronger confirmation than single-record actions.
506.	Confirm bulk automations respect filters.
507.	Confirm bulk automations respect selected records.
508.	Confirm bulk automations respect permissions.
509.	Confirm bulk automations respect workspace boundaries.
510.	Confirm notification/email rate limits prevent repeated spam.
511.	Confirm webhook replay protection prevents duplicate execution.
512.	Confirm automation-created source metadata is visible in audit/logs where useful.
________________________________________
14. Usage Limits, Rate Limits & Billing/Plan Control
513.	Confirm rate limits apply per workspace where appropriate.
514.	Confirm rate limits apply per user where appropriate.
515.	Confirm rate limits apply per automation where appropriate.
516.	Confirm rate limits apply per action type where appropriate.
517.	Confirm rate limits apply per endpoint where appropriate.
518.	Confirm automation usage caps work per plan/add-on.
519.	Confirm automation run limits are tracked correctly.
520.	Confirm automation usage appears correctly in admin dashboards.
521.	Confirm automation usage appears correctly in workspace billing/usage settings where required.
522.	Confirm automation credits/limits cannot be manipulated through client-side payload changes.
523.	Confirm automation limits cannot go negative unless intentionally allowed.
524.	Confirm failed runs are counted according to product policy.
525.	Confirm skipped runs are counted according to product policy.
526.	Confirm expensive automation actions are throttled.
527.	Confirm exports are throttled where required.
528.	Confirm uploads are throttled where required.
529.	Confirm AI-assisted automation actions are throttled.
530.	Confirm email/send actions are throttled.
531.	Confirm webhook calls are throttled.
532.	Confirm payment/billing actions are throttled and admin-gated.
533.	Confirm automation cost/resource usage is controlled.
534.	Confirm automations cannot overload Supabase.
535.	Confirm automations cannot overload R2.
536.	Confirm automations cannot overload SMTP.
537.	Confirm automations cannot overload Stripe.
538.	Confirm automations cannot overload AI.
539.	Confirm automations cannot overload external APIs.
________________________________________
15. Logs, Run History, Manual Test & Dry Run
540.	Confirm automation logs are real and useful.
541.	Confirm automation logs show run ID.
542.	Confirm automation logs show automation ID.
543.	Confirm automation logs show trigger.
544.	Confirm automation logs show action.
545.	Confirm automation logs show status.
546.	Confirm automation logs show start time.
547.	Confirm automation logs show end time.
548.	Confirm automation logs show duration.
549.	Confirm automation logs show affected records.
550.	Confirm automation logs show user/workspace.
551.	Confirm automation logs show error.
552.	Confirm automation logs show retry count.
553.	Confirm automation logs are scoped by workspace and role.
554.	Confirm users cannot see logs for automations they cannot access.
555.	Confirm users cannot see logs for records they cannot access.
556.	Confirm admin/support views of logs do not expose unnecessary sensitive customer data.
557.	Confirm log filters work.
558.	Confirm log search works.
559.	Confirm log sorting works.
560.	Confirm log pagination works.
561.	Confirm log details link back to affected records where permitted.
562.	Confirm failed log entries provide useful recovery actions.
563.	Confirm retry from logs works only where safe and permitted.
564.	Confirm retry from logs does not duplicate records, emails, messages, notifications, documents, payments or status changes.
565.	Confirm manual run/test mode exists where appropriate.
566.	Confirm test mode uses safe dry-run behaviour where required.
567.	Confirm test mode clearly shows what would happen without committing changes.
568.	Confirm test mode can run against sample/selected records only where permitted.
569.	Confirm test mode cannot expose records outside permissions.
570.	Confirm dry-run previews match real execution behaviour.
571.	Confirm activation requires a successful validation/test where appropriate.
572.	Confirm action previews show affected-record count.
573.	Confirm action previews show sample records.
574.	Confirm action previews show external side effects.
________________________________________
16. Cross-Section Outputs & Result Visibility
575.	Confirm automation-created tasks appear in Work/Tasks and linked detail pages.
576.	Confirm automation-created jobs appear in Work/Jobs and relevant property/unit/tenancy pages.
577.	Confirm automation-created compliance reminders appear in Compliance and Calendar where intended.
578.	Confirm automation-created financial follow-ups appear in Money/Accounting/Arrears where intended.
579.	Confirm automation-created planning actions appear in Planning and relevant property records where intended.
580.	Confirm automation-created documents appear in Documents and relevant detail pages where intended.
581.	Confirm automation-created messages appear in the correct inbox/thread and portal where intended.
582.	Confirm automation-created notifications appear in notification centre.
583.	Confirm automation-created notifications are delivered through enabled channels.
584.	Confirm automation-created records include created_by_automation.
585.	Confirm automation-created records include automation_id.
586.	Confirm automation-created records include run_id.
587.	Confirm automation-created records include source metadata where required.
588.	Confirm automation-created changes update connected dashboards.
589.	Confirm automation-created changes update KPI cards.
590.	Confirm automation-created changes update reports.
591.	Confirm automation-created changes update activity feeds.
592.	Confirm automation-created changes update detail pages.
593.	Confirm automation action cancellation leaves no partial records unless draft mode is intentional.
594.	Confirm failed automation actions do not corrupt local record state.
595.	Confirm connected sections refresh correctly after automation execution.
596.	Confirm global search reflects automation-created or automation-updated records.
597.	Confirm notifications route to the correct record/page after automation execution.
________________________________________
17. Webhooks, External Integrations & Public/Portal Boundaries
598.	Confirm webhook actions sign outgoing requests where supported.
599.	Confirm webhook actions validate destination URLs.
600.	Confirm webhook actions block unsafe/internal addresses.
601.	Confirm webhook actions do not expose secrets in logs.
602.	Confirm incoming webhook triggers validate signatures/secrets where supported.
603.	Confirm webhook rate limits exist.
604.	Confirm webhook replay protection exists.
605.	Confirm webhook failures are logged safely.
606.	Confirm webhook failures are retried safely.
607.	Confirm external integration actions work only when the integration is connected.
608.	Confirm external integration actions work only when the integration is permitted.
609.	Confirm disconnected integration states show clear repair/setup actions.
610.	Confirm failed integration calls show clear errors.
611.	Confirm failed integration calls do not corrupt records.
612.	Confirm Stripe/payment automation actions are admin-gated and reviewed where supported.
613.	Confirm Supabase integrations used by automations are wired and tested.
614.	Confirm R2 integrations used by automations are wired and tested.
615.	Confirm SMTP integrations used by automations are wired and tested.
616.	Confirm AI integrations used by automations are wired and tested.
617.	Confirm calendar integrations used by automations are wired and tested.
618.	Confirm payment integrations used by automations are wired and tested.
619.	Confirm portal/public actions require review and permissions where needed.
620.	Confirm automation cannot publish public marketplace/provider/property content without required review.
621.	Confirm automation cannot send tenant messages that expose private notes.
622.	Confirm automation cannot send landlord messages that expose private notes unless explicitly allowed.
623.	Confirm automation cannot send supplier messages that expose private notes unless explicitly allowed.
624.	Confirm automation respects tenant privacy boundaries.
625.	Confirm automation respects landlord privacy boundaries.
626.	Confirm automation respects supplier privacy boundaries.
627.	Confirm automation respects owner privacy boundaries.
628.	Confirm automation respects workspace privacy boundaries.
629.	Confirm automation respects admin privacy boundaries.
630.	Confirm automation respects public marketplace privacy boundaries.
________________________________________
18. AI-Assisted Automation Creation & AI Handoff
631.	Confirm AI-assisted automation creation is grounded.
632.	Confirm AI-assisted automation creation is optional.
633.	Confirm AI-assisted automation creation is permission-gated.
634.	Confirm AI-assisted automation creation is clearly reviewable before save.
635.	Confirm AI cannot create automations without review where required.
636.	Confirm AI cannot activate automations without review where required.
637.	Confirm AI cannot suggest unavailable triggers.
638.	Confirm AI cannot suggest gated triggers.
639.	Confirm AI cannot suggest unavailable actions.
640.	Confirm AI cannot suggest gated actions.
641.	Confirm AI-generated automation names are editable before save.
642.	Confirm AI-generated automation descriptions are editable before save.
643.	Confirm AI-generated automation conditions are editable before save.
644.	Confirm AI-generated automation actions are editable before save.
645.	Confirm AI-generated automations are saved as draft unless explicitly activated by the user.
646.	Confirm AI automation suggestions are rate-limited.
647.	Confirm AI automation suggestions are usage-tracked.
648.	Confirm AI automation suggestions are audit-logged.
649.	Confirm AI prompt-injection cannot create unsafe automations through uploaded documents.
650.	Confirm AI prompt-injection cannot create unsafe automations through notes.
651.	Confirm AI prompt-injection cannot create unsafe automations through messages.
652.	Confirm AI prompt-injection cannot create unsafe automations through emails.
653.	Confirm AI prompt-injection cannot create unsafe automations through marketplace copy.
654.	Confirm AI cannot bypass automation permissions.
655.	Confirm AI cannot bypass plan gates.
656.	Confirm AI cannot bypass add-ons.
657.	Confirm AI cannot bypass feature flags.
658.	Confirm AI cannot bypass RLS.
659.	Confirm AI cannot create automation loops.
660.	Confirm AI cannot create uncontrolled bulk actions.
661.	Confirm automation security tests include prompt-injection where AI-assisted automations exist.
________________________________________
19. Generated Documents, Variables, HTML & Sensitive Outputs
662.	Confirm automation data privacy rules are documented and enforced.
663.	Confirm automation run history retention rules are documented and enforced.
664.	Confirm automation logs can be exported only where intended.
665.	Confirm automation logs export is permission-gated.
666.	Confirm automation exports do not include hidden records.
667.	Confirm automation exports do not include private fields.
668.	Confirm automation-generated documents/PDFs use correct workspace branding.
669.	Confirm automation-generated documents/PDFs use correct record data.
670.	Confirm automation-generated documents/PDFs are stored in the correct workspace/record folder if saved.
671.	Confirm automation-generated documents/PDFs create audit/version records where required.
672.	Confirm sensitive legal outputs require review where appropriate.
673.	Confirm sensitive compliance outputs require review where appropriate.
674.	Confirm sensitive financial outputs require review where appropriate.
675.	Confirm automation-rendered markdown is sanitised against XSS and injection.
676.	Confirm automation-rendered HTML is sanitised against XSS and injection.
677.	Confirm automation-rendered email templates are sanitised against XSS and injection.
678.	Confirm automation variables/placeholders cannot expose hidden fields.
679.	Confirm automation templates cannot inject unsafe HTML.
680.	Confirm automation templates cannot inject scripts.
681.	Confirm automation templates cannot inject misleading links.
682.	Confirm automation-created links are safe, permitted and not misleading.
683.	Confirm automation cannot expose secrets.
684.	Confirm automation cannot expose API keys.
685.	Confirm automation cannot expose PATs.
686.	Confirm automation cannot expose service role keys.
687.	Confirm automation cannot expose SMTP credentials.
688.	Confirm automation cannot expose Stripe secrets.
689.	Confirm automation cannot expose environment variables.
690.	Confirm automation cannot run arbitrary SQL.
691.	Confirm automation cannot run shell commands.
692.	Confirm automation cannot run production code.
693.	Confirm automation cannot access hidden admin routes.
694.	Confirm automation cannot access deployment config.
695.	Confirm automation cannot change its own limits.
696.	Confirm automation cannot change its own permissions.
697.	Confirm automation cannot change its own feature gates.
698.	Confirm automation cannot change its own billing access.
699.	Confirm automation cannot modify users, roles or permissions unless it is an admin-only reviewed action.
________________________________________
20. Database, Schema, RLS, Migrations & Storage
700.	Confirm positive RLS tests pass for users allowed to create automations.
701.	Confirm positive RLS tests pass for users allowed to view automations.
702.	Confirm positive RLS tests pass for users allowed to run automations.
703.	Confirm negative RLS tests fail for wrong workspace.
704.	Confirm negative RLS tests fail for wrong role.
705.	Confirm negative RLS tests fail for wrong parent record.
706.	Confirm negative RLS tests fail for missing subscription.
707.	Confirm negative RLS tests fail for missing add-on.
708.	Confirm negative RLS tests fail for disabled feature flag.
709.	Confirm direct API/RPC calls cannot create automations outside permission.
710.	Confirm direct API/RPC calls cannot edit automations outside permission.
711.	Confirm direct API/RPC calls cannot run automations outside permission.
712.	Confirm direct API/RPC calls cannot pause automations outside permission.
713.	Confirm direct API/RPC calls cannot delete automations outside permission.
714.	Confirm direct API/RPC calls cannot read logs outside permission.
715.	Confirm direct API/RPC calls cannot export automations outside permission.
716.	Confirm Supabase queries are scoped by workspace_id.
717.	Confirm Supabase queries are scoped by user role.
718.	Confirm Supabase queries are scoped by parent record where relevant.
719.	Confirm Supabase queries are scoped by portal context where relevant.
720.	Confirm database schema supports every automation field shown in the UI.
721.	Confirm database schema supports every trigger shown in the UI.
722.	Confirm database schema supports every condition shown in the UI.
723.	Confirm database schema supports every action shown in the UI.
724.	Confirm database schema supports every node shown in the UI.
725.	Confirm database schema supports every edge shown in the UI.
726.	Confirm database schema supports every run shown in the UI.
727.	Confirm database schema supports every log shown in the UI.
728.	Confirm database constraints exist for required IDs.
729.	Confirm database constraints exist for foreign keys.
730.	Confirm database constraints exist for unique rules.
731.	Confirm database constraints exist for enums.
732.	Confirm database constraints exist for status values.
733.	Confirm database constraints exist for timestamps.
734.	Confirm database constraints exist for parent-child relationships.
735.	Confirm indexes exist for automation runs.
736.	Confirm indexes exist for automation logs.
737.	Confirm indexes exist for workspace_id.
738.	Confirm indexes exist for status.
739.	Confirm indexes exist for scheduled_at.
740.	Confirm indexes exist for created_by.
741.	Confirm indexes exist for automation_id.
742.	Confirm indexes exist for failed runs where needed.
743.	Confirm migrations for automations apply cleanly.
744.	Confirm migrations can be reproduced from a fresh database.
745.	Confirm all migrations that can be done with PAT are completed.
746.	Confirm rollback/manual fix notes are written where migrations require user action.
747.	Confirm backup/PITR expectations are documented if automations affect critical customer data.
748.	Confirm storage buckets used by automation-generated files are correctly configured.
749.	Confirm storage/R2 policies are workspace-scoped and permission-safe.
________________________________________
21. Performance, Reliability, Observability & Abuse Monitoring
750.	Confirm route load performance passes release expectations.
751.	Confirm builder performance passes release expectations.
752.	Confirm log query speed passes release expectations.
753.	Confirm run execution time passes release expectations.
754.	Confirm large data behaviour passes release expectations.
755.	Confirm large-data testing covers realistic property volumes.
756.	Confirm large-data testing covers realistic unit volumes.
757.	Confirm large-data testing covers realistic tenancy volumes.
758.	Confirm large-data testing covers realistic supplier volumes.
759.	Confirm large-data testing covers realistic document volumes.
760.	Confirm large-data testing covers realistic compliance volumes.
761.	Confirm large-data testing covers realistic finance volumes.
762.	Confirm large-data testing covers realistic planning volumes.
763.	Confirm large-data testing covers realistic message volumes.
764.	Confirm large-data testing covers realistic activity volumes.
765.	Confirm no N+1 queries exist.
766.	Confirm no repeated duplicate queries exist.
767.	Confirm no expensive automation log queries exist.
768.	Confirm automation worker/edge function performance is monitored.
769.	Confirm automation provider/API latency is monitored.
770.	Confirm observability exists for automation UI errors.
771.	Confirm observability exists for backend errors.
772.	Confirm observability exists for edge function failures.
773.	Confirm observability exists for cron failures.
774.	Confirm observability exists for queue failures.
775.	Confirm observability exists for webhook failures.
776.	Confirm observability exists for slow runs.
777.	Confirm observability exists for permission failures.
778.	Confirm observability exists for rate limits.
779.	Confirm automation errors include safe support references.
780.	Confirm automation errors do not expose secrets.
781.	Confirm automation errors do not expose raw sensitive payloads.
782.	Confirm logs are searchable by workspace.
783.	Confirm logs are searchable by automation.
784.	Confirm logs are searchable by run ID.
785.	Confirm logs are searchable by trigger.
786.	Confirm logs are searchable by action.
787.	Confirm logs are searchable by status.
788.	Confirm logs are searchable by route.
789.	Confirm logs are searchable by user.
790.	Confirm logs are searchable by error type.
791.	Confirm abuse monitoring exists for repeated runs.
792.	Confirm abuse monitoring exists for spam attempts.
793.	Confirm abuse monitoring exists for bulk actions.
794.	Confirm abuse monitoring exists for webhook abuse.
795.	Confirm abuse monitoring exists for scraping attempts.
796.	Confirm abuse monitoring exists for suspicious usage.
797.	Confirm DDoS/rate-limit tests are proportionate and focused on exposed endpoints, not destructive testing against production.
________________________________________
22. Testing, E2E, Security & Regression Coverage
798.	Run unit tests for automation UI rendering.
799.	Run unit tests for automation list states.
800.	Run unit tests for builder state.
801.	Run unit tests for validation.
802.	Run unit tests for permissions.
803.	Run unit tests for paywall states.
804.	Run unit tests for feature-flag states.
805.	Run unit tests for action cards.
806.	Run unit tests for trigger schema validation.
807.	Run unit tests for action schema validation.
808.	Run unit tests for failure states.
809.	Run integration tests for Supabase reads/writes.
810.	Run integration tests for RLS.
811.	Run integration tests for edge functions.
812.	Run integration tests for cron jobs.
813.	Run integration tests for queues.
814.	Run integration tests for storage.
815.	Run integration tests for SMTP.
816.	Run integration tests for notifications.
817.	Run integration tests for AI handoff.
818.	Run integration tests for webhooks.
819.	Run integration tests for connected sections.
820.	Run E2E tests covering create automation → validate → activate → trigger event → action runs → result appears elsewhere → log created.
821.	Run E2E tests covering recipe flow: choose template → configure → test → activate → run → inspect result.
822.	Run E2E tests covering draft flow: start automation → save draft → return later → edit → activate.
823.	Run E2E tests covering failure flow: failed run → log visible → retry/skip/fix → no duplicate side effects.
824.	Run negative tests for blocked users.
825.	Run negative tests for wrong workspace.
826.	Run negative tests for wrong parent record.
827.	Run negative tests for missing subscription.
828.	Run negative tests for missing add-on.
829.	Run negative tests for disabled feature flag.
830.	Run negative tests for rate limit exceeded.
831.	Run negative tests for direct API access.
832.	Run loop-prevention tests proving automations cannot recursively trigger each other uncontrolled.
833.	Run idempotency tests proving retries do not duplicate records.
834.	Run idempotency tests proving retries do not duplicate emails.
835.	Run idempotency tests proving retries do not duplicate messages.
836.	Run idempotency tests proving retries do not duplicate notifications.
837.	Run idempotency tests proving retries do not duplicate documents.
838.	Run idempotency tests proving retries do not duplicate payment links.
839.	Run idempotency tests proving retries do not duplicate status changes.
840.	Run concurrency tests proving simultaneous triggers do not create duplicate or contradictory outcomes.
841.	Run webhook tests covering signature validation.
842.	Run webhook tests covering replay protection.
843.	Run webhook tests covering invalid payloads.
844.	Run webhook tests covering unsafe URLs.
845.	Run webhook tests covering rate limits.
846.	Run AI-assisted automation tests covering prompt-injection.
847.	Run AI-assisted automation tests covering unsafe action prevention.
848.	Run AI-assisted automation tests covering draft-only creation.
849.	Run AI-assisted automation tests covering approval before activation.
850.	Run visual regression tests for automation list, recipe library, builder/canvas, configuration panels, action previews, logs, failures, quota states and mobile/PWA states.
851.	Confirm all automation fixes are implemented before scoring; do not only report issues.
________________________________________
23. Product Scope, Manual Fallback & Bloat Review
852.	Confirm automation functionality improves real customer workflows.
853.	Confirm automation functionality is not decorative.
854.	Confirm automation features do not replace core working manual buttons.
855.	Confirm users can still complete workflows manually without automations.
856.	Confirm automation scope is not V1 bloat.
857.	Confirm advanced/full-canvas features are feature-flagged where needed.
858.	Confirm duplicate automation features are removed, merged or feature-flagged.
859.	Confirm unsafe or unclear automation actions are removed or moved behind feature flags.
860.	Confirm all remaining automation features are valuable for release.
861.	Confirm automation list is production-useful.
862.	Confirm recipe library is production-useful.
863.	Confirm builder/canvas is production-useful or safely feature-flagged.
864.	Confirm triggers are production-useful.
865.	Confirm actions are production-useful.
866.	Confirm logs are production-useful.
867.	Confirm settings are production-useful.
868.	Confirm RLS is production-ready.
869.	Confirm edge functions are production-ready.
870.	Confirm cron jobs are production-ready.
871.	Confirm queues are production-ready.
872.	Confirm notifications are production-ready.
873.	Confirm AI handoff is production-ready or feature-flagged.
874.	Confirm integrations are production-ready or feature-flagged.
875.	Confirm automation area reaches 100/100 before marking complete.
________________________________________
24. Release Evidence Document & Final Score
876.	Create a release evidence document at /release-gated/docs/automations/{automation-surface-or-action-name}.md.
877.	The automation release evidence document must include automation surface name.
878.	The automation release evidence document must include route/component.
879.	The automation release evidence document must include parent section.
880.	The automation release evidence document must include automation type.
881.	The automation release evidence document must include trigger IDs tested.
882.	The automation release evidence document must include action IDs tested.
883.	The automation release evidence document must include recipes tested.
884.	The automation release evidence document must include feature flags tested.
885.	The automation release evidence document must include plan/add-on gates tested.
886.	The automation release evidence document must include roles tested.
887.	The automation release evidence document must include launch points tested.
888.	The automation release evidence document must include conditions tested.
889.	The automation release evidence document must include files tested.
890.	The automation release evidence document must include Supabase tables checked.
891.	The automation release evidence document must include RLS policies checked.
892.	The automation release evidence document must include edge functions checked.
893.	The automation release evidence document must include cron jobs checked.
894.	The automation release evidence document must include queue jobs checked.
895.	The automation release evidence document must include webhooks checked.
896.	The automation release evidence document must include storage buckets checked.
897.	The automation release evidence document must include integrations checked.
898.	The automation release evidence document must include notifications checked.
899.	The automation release evidence document must include AI handoff checked.
900.	The automation release evidence document must include usage/rate limits checked.
901.	The automation release evidence document must include audit logs checked.
902.	The automation release evidence document must include cross-section effects checked.
903.	The automation release evidence document must include screenshots tested.
904.	The automation release evidence document must include screen sizes tested.
905.	The automation release evidence document must include loop-prevention tests.
906.	The automation release evidence document must include idempotency tests.
907.	The automation release evidence document must include data-leakage tests.
908.	The automation release evidence document must include bugs found.
909.	The automation release evidence document must include fixes made.
910.	The automation release evidence document must include migrations applied.
911.	The automation release evidence document must include tests run.
912.	The automation release evidence document must include performance/security findings.
913.	The automation release evidence document must include remaining user/manual actions.
914.	Add anything Claude Code cannot complete to /release-gated/user-fixes/automations/{automation-surface-or-action-name}.md with exact manual steps.
915.	Give the automation surface/action/recipe a release score out of 100.
916.	Fix all issues until automation list, recipe library, builder/canvas, triggers, actions, logs, settings, RLS, edge functions, cron jobs, queues, notifications, AI handoff and integrations reach 100/100.
917.	Do not mark Automations complete below 100/100.
918.	Confirm final release decision states one of: ready for release, ready behind feature flag, ready for admin-only beta, blocked pending manual fix, or removed/merged due to bloat.
Triggers (28)
•	Record Created (record.created)
•	Record Updated (record.updated)
•	Record Deleted (record.deleted)
•	Field Changed (field.changed)
•	Property Added (portfolio.property_added)
•	Tenancy Started (portfolio.tenancy_started)
•	Tenancy Ending (portfolio.tenancy_ending)
•	Task Created (work.task_created)
•	Task Overdue (work.task_overdue)
•	Booking Confirmed (booking.confirmed)
•	Booking Cancelled (booking.cancelled)
•	Check-in Due (booking.checkin_due)
•	Checkout Due (booking.checkout_due)
•	Marketplace Transaction Created (marketplace.transaction.created)
•	Marketplace Order Disputed (marketplace.order_disputed) 🔒
•	Marketplace Review Received (marketplace.review_received)
•	Supplier Job Assigned (supplier.job.assigned)
•	Supplier Job Completed (supplier.job.completed)
•	Supplier Evidence Uploaded (supplier.evidence_uploaded)
•	Invoice Overdue (invoice.overdue)
•	Payment Received (money.payment_received)
•	Payout Due (money.payout_due) 🔒
•	Compliance Expiring (compliance.expiring) 🔒
•	Compliance Check Failed (compliance.failed) 🔒
•	Legal Review Required (legal.review.required) 🔒
•	AI Signal Detected (ai.signal_detected) 🔒
•	Daily Schedule (schedule.daily)
•	Custom Cron (schedule.custom_cron)
•	(Incoming Webhook lives under Webhook/API below)
Conditions (7)
•	If / Else (condition.if_else)
•	Compare Fields (condition.field_compare)
•	Entity In State (condition.entity_state)
•	If Plan Allows (condition.plan_allows)
•	If Within Safety Caps (condition.within_caps)
•	Business Context Match (condition.business_context)
•	If Payment Release Allowed (condition.payment_release_allowed) 🔒
Branch / Router (3)
•	Match Country (branch.match_country)
•	Switch / Router (branch.switch)
•	Split (Parallel) (branch.split_parallel)
Delay / Time (3)
•	Wait (Fixed) (delay.fixed)
•	Wait Until Date (delay.until_date)
•	Delay For Business Hours (delay.business_hours)
Lookup (4)
•	Get Record (lookup.record)
•	Get Preferred Suppliers (lookup.preferred_suppliers)
•	Get Marketplace Transaction (lookup.marketplace_transaction)
•	Get Account Balance (lookup.account_balance)
AI (5) — all approval-required
•	AI Generate Summary (ai.generate_summary)
•	AI Draft Message (ai.draft_message)
•	AI Classify (ai.classify)
•	AI Risk Score (ai.risk_score)
•	AI Guardrail Check (ai.guardrail_check)
Action (10)
•	Create Task (action.create_task)
•	Update Record Field (action.update_record)
•	Add Note (action.add_note)
•	Create Calendar Reminder (action.create_calendar_reminder)
•	Create Cleaning Task (action.create_cleaning_task)
•	Request Supplier Evidence (action.request_supplier_evidence)
•	Assign Supplier (action.assign_supplier)
•	Flag Marketplace Order (action.flag_marketplace_order)
•	Create Invoice Draft (action.create_invoice_draft)
•	Record Compliance Check (action.record_compliance_check)
Communication (3)
•	Send Internal Notification (comm.internal_notification)
•	Create External Message Draft (comm.external_message_draft)
•	Create Email Draft (comm.email_draft)
Payment (3) — all 🔒 blocked-from-auto-run
•	Release Payout After Approval (payment.release_payout_after_approval)
•	Issue Refund After Approval (payment.issue_refund_after_approval)
•	Capture Payment After Approval (payment.capture_after_approval)
Approval (3)
•	Request Human Approval (approval.request_human)
•	Request Legal Review (approval.request_legal_review) 🔒
•	Request Finance Sign-off (approval.request_finance_signoff) 🔒
Legal (2)
•	Create Legal Draft (legal.create_draft) 🔒
•	Auto-Serve Notice (legal.auto_serve_notice) 🔒 hard-blocked from auto-run
Integration (3)
•	Stripe Connect (integration.stripe_connect) 🔒
•	Channel Manager Webhook (integration.channel_manager_webhook)
•	Accounting Sync (integration.accounting_sync)
Webhook / API (2)
•	Incoming Webhook (webhook.incoming)
•	Outgoing Webhook (webhook.outgoing)
Utility (3)
•	Redact Sensitive Data (utility.redact_sensitive_data)
•	Set Variable (utility.set_variable)
•	Format Text (utility.format_text)
Error Handling (3)
•	Retry With Backoff (error.retry_with_backoff)
•	Pause After Threshold (error.pause_after_threshold)
•	Fallback Path (error.fallback_path)
End / Terminal (3)
•	End Success (end.success)
•	End Waiting Approval (end.waiting_approval)
•	End Stopped (end.stopped)
Note: there's a second, simpler "Smart Rules" catalogue in catalogue.ts used by the rule-based engine — 57 triggers + 21 actions. These are what recipes actually compile against (e.g. compliance_due_soon, rent_overdue, tenancy_ending, gas_cert_expiring … / create_task, draft_message, send_webhook, archive_record …). Tell me if you want that catalogue listed in full too.
________________________________________
2. All templates / recipes — names
From recipes.ts — ~80 curated SMART_RECIPES, all install as disabled review-first drafts. Grouped by domain:
Core / featured (9) Compliance expiring → renewal task · Compliance overdue → notify + flag · Rent overdue → draft chase (review-first) · Payout release → human approval (gated) · Checkout due → create cleaning task · Job complete → request supplier evidence · New marketplace transaction → review task · Legal review required → route to reviewer (gated) · Tenancy ending → renewal decision task
Portfolio New property → onboarding checklist · Tenancy started → welcome pack draft · Tenancy ending → review task · Quarterly inspection reminder · Annual rent review task · Property added → onboarding checklist · Tenancy started → welcome pack draft · Tenancy expired → urgent re-let · Lease renewal approaching → prepare offer · Move-out approaching → check-out checklist · Void period started → re-let task · Long void → marketing escalation · Unit vacant → marketing task
Rent-to-Rent R2R guarantee rent due → reminder · R2R arrears → flag buffer risk · R2R head-lease expiring → renewal task
Serviced Accommodation Booking confirmed → check-in instructions draft · Checkout due → cleaning task · Stay complete → review request draft · Booking cancelled → notify ops · Check-in due → prep task
HMO HMO licence expiring → renewal task · HMO room void → re-let task · HMO fire safety check reminder · HMO room vacant → re-let task
Bookings Booking confirmed → fulfilment task · Channel booking → review flag · Check-in tomorrow → instructions draft · Check-out today → turnover clean · Booking cancelled → notify ops
Suppliers Supplier assigned → brief draft · Evidence uploaded → review task · Job complete → follow-up task · Maintenance request → triage task · Maintenance overdue → escalate · Supplier job overdue → chase · Quote received → review task · Quote expiring → decision reminder · Contractor unreviewed → review task
Marketplace Marketplace dispute → notify ops · Marketplace review → thank-you draft
Money Payment received → receipt draft · Invoice overdue → chase draft · Rent due soon → friendly reminder draft · Payment failed → notify + retry task · Arrears threshold reached → escalate · Rent received → receipt draft · Invoice overdue → chase draft (real trigger)
Accounting New transaction → invoice draft · Month-end reconciliation task
Compliance Gas safety expiring → renewal task · Compliance failed → flag + notify · Gas Safety (CP12) expiring → book renewal · EICR expiring → book electrician · EPC expiring → renewal task · Insurance expiring → renewal task · Right to Rent due → recheck task · Inspection due → reminder · Inspection overdue → flag · Document expiring → renewal reminder
Legal Persistent arrears → legal review task · Deposit unprotected → urgent protect · Deposit return overdue → action task
Customer Tenancy ending → renewal offer draft · No viewing booked → nudge draft · Referencing overdue → chase · Offer accepted → start tenancy setup · Complaint received → triage task · Unanswered portal message → reply reminder
Admin / Ops Task overdue → escalate · Daily ops digest
________________________________________
3. Integration types to set up
From integrations-catalog.ts — 22 integrations across 7 categories. connectType tells you the setup path:
Category	Integration	Setup type
Accounting	Xero	OAuth (/api/integrations/xero/auth)
	QuickBooks	OAuth
	Sage	API key
	FreeAgent	OAuth
Payments	Stripe	OAuth (/api/integrations/stripe/auth)
	GoCardless	API key
	PayPoint	API key
Property portals	Rightmove	API key
	Zoopla	API key
	OnTheMarket	API key
	SpareRoom	API key
Calendar	Google Calendar	OAuth
	Outlook / Microsoft 365	OAuth
	Apple Calendar	API key (iCal feed)
Communications	Resend	API key
	Twilio	API key
	WhatsApp Business	API key
Storage	Google Drive	OAuth
	Dropbox	API key
	OneDrive	OAuth
CRM	Salesforce	Coming soon
	HubSpot	Coming soon
Setup work: OAuth ones (9) need a registered app + client ID/secret + callback route (callback routes already exist for xero, stripe, outlook, google-drive, google-calendar, gocardless). API-key ones (11) just need credential capture UI. CRM (2) are stubbed "coming soon."
The three connectType values to wire are: oauth, api_key, coming_soon.
________________________________________
4. All webhook types to set up
There are two distinct webhook surfaces in automations — both need setup:
A. Inbound webhook receiver — automation_webhook_endpoints table, node webhook.incoming (_lib.ts)
•	Public URL: /api/automations/trigger/{token} (256-bit base64url token)
•	Optional one-time HMAC signing secret (stored only as SHA-256 secret_hash)
•	Two verification paths: simple (sha256(secret) in X-Gala Dock-Signature) and strong (HMAC-SHA256(body, secret))
•	Delivery statuses to handle: accepted · rejected · rate_limited · error
•	Purpose: lets Zapier / Make / external apps trigger a review-first run
B. Outbound webhooks — automation_webhooks table, node webhook.outgoing (outbound-webhooks/route.ts)
•	Gala Dock → external HTTPS endpoint (enforced https://)
•	Subscribed event_types are a free-form string array (min 1) — not a fixed enum in code, so you choose which automation events to emit
•	Optional shared secret → sent as X-Gala Dock-Token header
•	Test delivery fires an event_type: "test.webhook" POST; deliveries logged to automation_webhook_logs
Setup gap to note: the outbound event_types has no canonical enum defined anywhere — it's validated only as z.array(z.string()).min(1). If you want a curated event-type picker (e.g. compliance.expiring, payment.received, booking.confirmed, task.overdue, run.completed), that list needs to be defined — it doesn't exist yet. Want me to draft that canonical outbound-event-type registry?
Remember the user sets up webhooks and integrations with their own details we don’t set up for them 
