# Sales Section — Release Evidence (Phase 1: Visual Rebuild + Real Data)

**Section name:** Sales (Leads + Proposals)
**Routes:** `/event-manager/leads`, `/event-manager/leads/new`, `/event-manager/leads/[leadId]`, `/event-manager/proposals`, `/event-manager/proposals/new`, `/event-manager/proposals/[proposalId]`
**Scope of this pass:** the user explicitly chose "visual rebuild + real data first" over schema-first or single-screen-to-production. PDF generation, e-signature provider integration, R2 file upload wiring, import/export, bulk actions, and saved-view persistence were explicitly scoped OUT of this pass — see `release-gated/user-fixes/sales-section.md`.

## 1. What was built

### Reference image map
`docs/design-reference/sales-section-image-map.md` — all 8 reference images mapped to route + view + step, with one confirmed semantic note (image 7 showed "New Lead" on the Proposals cards screen; the shipped code correctly uses "New Proposal").

### Schema (migration `supabase/migrations/20260710_sales_leads_proposals_depth.sql`)
Extended the existing `leads` and `proposals` tables (no new tables — kept additive to the working schema rather than introducing 30 new tables per the enterprise spec, per the chosen phase). Applied directly to the linked Supabase project via `supabase db query --linked` (the CLI's `db push` path is blocked by pre-existing migration-history drift unrelated to this work — flagged, not touched). TypeScript types regenerated (`src/lib/supabase/database.types.ts`).

New `leads` columns: contact/source fields (lead_title, job_title, alt_email/phone, marketing_consent, enquiry_channel, preferred_contact_method, campaign/referrer/landing_page/utm_*, response_sla_hours, preferred_contact_time, contact_timezone), event-detail fields (event_format, date_flexibility, city, currency, budget_min/max_cents, event_purpose, ticketing_type, venue_types[], additional_requirements, tags[], accessibility_notes, is_international, remote_platform, multi_room, alcohol_bar, minors_present, licensing_notes, reference_links jsonb), qualification fields (priority, probability_pct, response_due_date, follow_up_cadence, lead_temperature, decision_maker, qualification jsonb, lead_score, lead_score_breakdown jsonb, next_actions jsonb, internal_comments), and wizard lifecycle fields (is_draft, wizard_step, cover_theme).

New `proposals` columns: version, margin_pct, cover_theme, next_action_label, next_action_due, owner_id.

### UI — New Lead wizard (images 2, 1, 3)
Replaced the old single-page form with a real 3-step wizard (`/event-manager/leads/new?step=contact|event-details|qualification`), URL-driven so browser back/forward moves between steps. Draft autosave (creates a draft `leads` row on first Continue/Save Draft, debounced 1.5s field-level autosave once a draft exists). Deterministic lead-scoring rules engine (`computeLeadScore` in `leads/lib.ts`) — explicitly documented as a fallback since no AI scoring provider is wired up, per the AI-section "no fake AI score" rule. 11-item qualification checklist, next-actions list, lead review summary with edit-back links. File upload UI is visually present but explicitly disabled with an inline "being finalised" notice; only the external reference-link field actually persists.

### UI — Leads List/Kanban/Cards (images 4, 5, 6)
`/event-manager/leads?view=list|kanban|cards`, URL-driven. 6-card KPI row (Total, New This Week, In Pipeline, Hot Leads, Est. Pipeline Value, Conversion Rate) computed from real data. Toolbar: search, stage/source/owner filters, saved-view presets (client-side only, not persisted), sort. Insights rail: Lead Source Mix donut, Response SLA (honest proxy, documented), Hot Opportunities, Conversion Trend sparkline (kanban swaps in Stage Distribution + Pipeline Value by Stage). Kanban drag-and-drop reuses the existing `updateLeadStage` server action unchanged.

### UI — Proposals List/Cards (images 8, 7)
`/event-manager/proposals?view=list|cards`, URL-driven. 6-card KPI row (Total, Sent This Week [documented approximation — no sent_at timestamp tracked], Awaiting Signature, Conversion Rate, Proposal Value, Avg. Target Margin — shows "—" honestly when no proposal has margin_pct set). Insights rail: Signature Funnel, status-mix donut, Expiring Soon, Top Value Proposals. "New Proposal" button confirmed correct (not "New Lead").

### Demo seed data
`supabase/seeds/sales-leads-proposals-seed.sql` — idempotent (fixed UUIDs, `ON CONFLICT DO NOTHING`), looks up the "Grannit Holdings" workspace by name, dates computed relative to `now()` so the seed stays sensible whenever re-run. 8 leads + 12 proposals matching the reference names (Tech Summit 2026, Carter Wedding, Club Vibe NYE, AI in Marketing Webinar, Summer Beats Festival, Theatre Gala Night, Children First Charity Ball, James 40th Birthday, plus Pulse Summit, Hartwell Wedding, Riverside Food Festival, Global Tech Conference, Future Build Expo, Innovation Awards). Applied directly to the linked project and verified (8 leads / 12 proposals present).

**Known seed limitation:** the workspace currently has one real team member; all seeded `assigned_to`/`owner_id` values point to that one user rather than the varied cast of names shown in the reference images (Emma Scott, James Clarke, etc., are used as lead/proposal *contact* names, which is correct — but internal *owner* avatars will all show one person). Creating additional fake internal owners would require provisioning real `auth.users` via the Admin API, which was out of scope for a seed-data pass.

## 2. Verification performed

- `npx tsc --noEmit` — clean for every Sales file. (Two pre-existing errors in `src/components/events/EventMapView.tsx`, unrelated to Sales and present before this work started, were also fixed in passing since they blocked the production build — wrong `MapStyle` enum member and an invalid `attributionControl: false` value.)
- `npx eslint` on all touched directories — clean (fixed 4 real issues surfaced by the React Compiler purity/effect rules: two `Date.now()`-during-render calls extracted to module-level helpers, one `setState`-in-effect replaced with a derived/clamped value instead of an effect, one SVG donut chart's render-time variable mutation replaced with a precomputed cumulative array).
- `npm run build` — succeeds, full production build completes.
- Direct DB verification (`supabase db query --linked`) confirming the new columns exist and the seed rows landed (8 leads, 12 proposals) in the Grannit Holdings workspace.

## 3. NOT done in this pass (see user-fixes doc)

- Chrome MCP live visual QA screenshots — blocked by a stale `chrome-devtools-mcp` Chrome instance holding its profile lock; the harness declined an unverified force-kill of that process for safety. Needs a manual restart of that Chrome profile before a screenshot-by-screenshot comparison against the 8 reference images can run.
- Cloudflare R2 wiring for lead/proposal file uploads (upload UI is present but explicitly disabled with a truthful "being finalised" message — no fake upload success).
- Real PDF generation, email delivery, and e-signature provider integration (unchanged from before this pass — the public `/p/[proposalToken]` flow still only captures a signature name to the database).
- Bulk actions, import/export wiring, saved-view persistence (checkboxes/dropdowns render and apply real client-side filters, but there's no backend for saving/bulk-executing).
- Automated tests (unit/integration/E2E) for the new wizard/views.
- Cross-browser/breakpoint screenshot evidence (tablet/mobile/PWA) — pending the Chrome MCP blocker above.

## 4. Release score: 55/100

Rationale: the visual/data layer (schema, real Supabase-backed KPIs/insights, all 8 screens rebuilt and matching the reference layouts, wizard end-to-end create flow, typecheck/lint/build all green) is solid and production-plausible for a first release-candidate pass. It is held well below 100 because file uploads, PDF/e-sign, tests, and live visual QA evidence are not yet done — these are exactly the items AGENTS.md's full checklist (RLS negative tests, security tests, accessibility audit, Chrome MCP evidence, storage wiring) requires before a section can be marked release-ready.

## 5. Final release decision

**Blocked pending manual fix** (Chrome MCP environment) **and ready for admin-only beta** for the rest — the Leads/Proposals UI and data layer are safe to show internally/demo with real workspace data, but should not be presented as feature-complete for GA until the deferred items above are picked up in a follow-up pass.
