# Phase 3 build brief (shared by all screen agents)

You are building production screens for **Gala Dock**, a Next.js 16 (App Router, React 19, TypeScript) + Supabase app.
Repo root: `C:\Users\PC\Documents\Blackwellen - Business Files\gala-dock-final-release`. The dev server is **already running at
http://localhost:3107** with hot reload. Do not start, stop, or build it (`next build` would clash with `.next`).
Other Claude sessions are editing other parts of this repo **at the same time**, so the ownership rules below are strict.

Read first: `AGENTS.md` (Next 16 has breaking changes; the docs are in `node_modules/next/dist/docs/`),
`docs/phase3/design-register.md` (which design → which route), and the files listed under "Foundation".

## Goal

Match the reference design 1:1: layout, density, typography, colours, component shapes, and copy structure. Every
number, row, and state must come from **real Supabase data through the signed-in user's RLS client**. Buttons must do
real things through validated server functions. A static mockup is a failure.

## Ownership (hard rules)

- **You may create/edit only:** files under your group's route folders (listed in your task), plus
  `src/styles/<your-group-css>.css`, plus `artifacts/visual/ws-manifest/<group>.json`.
- **Never edit:** `src/components/workspace/*` (shell, kit, actions), `src/styles/workspace.css`, `src/lib/**`,
  `src/app/provider/layout.tsx`, `src/app/admin/(console)/layout.tsx`, `src/app/globals.css`, `src/app/layout.tsx`,
  migrations, seed scripts, `package.json`, or any file outside your route folders. If you need a shared primitive, build it
  privately inside your route folder (e.g. `src/app/provider/bookings/_components/…`).
- **No schema changes and no new migrations.** If the data model genuinely lacks something, use existing jsonb
  (`details`, `settings`, `requirements`, `quote`, `terms`, `metrics`), or derive it. Report anything still missing in your summary.
- **No service-role client** (`createAdminClient`) in pages or actions. Everything goes through `ctx.db`.
- Don't install packages. Don't re-run seed scripts.

## Foundation (reuse; read these files)

- `src/lib/provider/context.ts`: `getProvider()` gives `{ db, userId, userName, workspace{ id, name, capabilities[], plan, commission_bps, … }, workspaces, role, can{ manage, finance } }`. It's cached per request, so call it freely.
- `src/lib/admin/context.ts`: `requireAdminPermission("users")` gives `{ db, allowed, permissions, name, … }`. If `!allowed`, render `<Restricted area="Users" />` from the kit.
- `src/lib/workspace/db.ts`: `rows()`, `one()`, `count()` throw on query errors (never silently show empty data).
- `src/lib/workspace/format.ts`: `money`, `num`, `day`, `time`, `timeRange`, `countdown` (server-time deadlines), `relative`, `delta`, `titleCase`, `initials`.
- `src/lib/workspace/rpc.ts`: `call(db, "rpc_name", args, "Success toast", redirect?)` returns `ActionResult` with friendly error mapping.
- `src/components/workspace/kit.tsx` (server-safe): `PageHeader, Kpi, Sparkline, Delta, Panel, Tabs (URL-driven), Chip, Avatar, Thumb, Ring, Meter, BarChart, Donut, Legend, Empty, Restricted, KV, IconTile`.
- `src/components/workspace/actions.tsx` (client): `<ActionButton action={serverAction} args={[id]} confirm={{title, body}} reason reasonOptions outcome variant>` and `<ActionForm action={serverActionTakingFormData}>`.
- `src/styles/workspace.css`: tokens and shared classes (`ws-table-wrap/ws-table/ws-cell/ws-cell-text`, `ws-toolbar`, `ws-pager`, `ws-kpis`, `ws-split`, `ws-btn primary|outline|soft|danger|ghost sm`, `ws-chip <tone>`, `ws-field`, …). Read it before writing CSS.
- The shells are already wired in the layouts. Your `page.tsx` renders **only the main content area**.

### Server action pattern

```ts
// src/app/provider/opportunities/actions.ts
"use server";
import { getProvider } from "@/lib/provider/context";
import { call } from "@/lib/workspace/rpc";
export async function respond(itemId: string, response: string) {
  const { db } = await getProvider();               // re-authorises on every call
  return call(db, "provider_respond", { p_item: itemId, p_response: response }, "Response sent");
}
```

Never trust client-supplied workspace IDs; always use `ctx.workspace.id`.

## Data model (live in Supabase; read the migrations for detail)

`supabase/migrations/202610120001_events_domain.sql` (Phase 2, canonical) and `202610130001_provider_admin.sql` + `202610130002_admin_directory.sql` (Phase 3).

- **Marketplace line:** `build_items` (event ↔ provider listing; `status` suggested|draft|sent|awaiting|available|quoted|clarification|held|confirmed|standby|declined|unavailable|expired|cancelled|fulfilled; `role` primary|backup|standby; `response_deadline`, `hold_expires_at`, `amount`, `deposit`, `quote` jsonb, `terms_snapshot`). Parent `provider_requests` (`requirements` jsonb incl. `space`, `space_id`, `guests`, `quote_requested`; `budget_min/max`, `emergency`, `response_hours`) and `events` (name, starts_at, ends_at, guest_count, location, city, client_name, cover_image, settings.requester_org). A provider sees a build item only when `listing_id` is one of its listings. **Always scope to the current workspace:** fetch the workspace's listing ids first, then `.in("listing_id", ids)`.
- **Provider records:** `listings` (kind venue|service; published, paused_at, review_status, booking_mode, image, gallery, price_from, price_unit, capacity_min/max, rating, review_count, response_hours, views, enquiry_count, verified, instant_book, emergency_supply, details.commercial), `spaces` (venue_id, layouts jsonb, capacity_*, turnaround_minutes, min_hours, exclusive_group, rate_hourly, amenities, image), `venue_structures` (versioned map elements), `packages`, `availability_blocks`, `provider_quotes` (versions per build item), `provider_jobs` (bookings: reference, mode venue|service, client_*, event_*, starts_at/ends_at, guests, space_id, status held|confirmed|active|completed|cancelled|no_show, value, platform_fee, net_payout, paid_amount, payment_status, source, next_action(+_due), commercial_snapshot (immutable), details.beo / details.deliverables), `crew_members` (team), `shifts` (assignments; `job_id`), `transactions` (ledger: kind income|payment|refund|fee|payout, amount, fee_amount, net_amount, source, counterparty, stripe_ref, status), `agent_runs` (surface, goal, status, plan, progress, waiting_reason, next_wake_at, result, errors, changes), `agent_approvals`, `agent_routines`, `threads`/`messages`, `notifications`, `reviews`.
- **Admin records:** `profiles` (status active|restricted, identity_verified, last_active_at), `workspaces` (kind, plan, commission_bps, status, verification_status, payout_status, capabilities), `support_cases` + `support_messages`, `trust_cases` (queue verification|reliability|fraud|appeal, category, risk_score, evidence), `partners`, `integrations` (status, metrics), `platform_settings` (versioned per section), `audit_events`, plus all Phase 2 tables via admin read policies. Use the RPCs `admin_user_directory(p_search,p_filter,p_limit,p_offset)`, `admin_user_stats()` and `admin_user_identity(p_user)` for identity data (auth.users is not directly readable).
- **Write RPCs (use these; never write tables directly):** provider: `provider_respond(p_item,p_response,p_note)` (response ∈ available|unavailable|declined|clarification; late replies → expired), `provider_issue_quote(p_item,p_items jsonb[{label,qty,unit,unit_price,kind}],p_tax_bps,p_deposit_pct,p_valid_days,p_terms,p_message,p_send)`, `provider_withdraw_quote(p_quote)`, `provider_release_hold(p_item)`, `provider_create_booking(p_ws, p jsonb)`, `provider_job_transition(p_job,p_to,p_reason)`, `provider_pause_listing(p_listing,p_pause)`, `publish_listing(p_listing)` (returns readiness jsonb; ineligible stays draft), `listing_readiness(p_listing)`, `provider_set_availability(...)`, `provider_assign_crew(p_job,p_crew,p_role)`, `agent_control_run(p_run,p_action pause|resume|cancel)`, `decide_agent_approval(p_approval,p_approve)`. Admin (all need reason ≥5 chars, permission-checked, audited): `admin_set_user_status`, `admin_revoke_sessions`, `admin_set_workspace_status`, `admin_review_listing(p_listing, approve|request_changes|restrict|suspend, reason)`, `admin_update_case(p_case,p_status,p_reason,p_outcome)`, `admin_assign_case`, `admin_reply_case(p_case,p_body,p_internal)`, `admin_decide_trust`, `admin_set_partner_status`, `admin_set_integration(p_id,p_enabled,p_reason)`, `admin_publish_setting(p_section,p_value,p_reason,p_effective)`, `admin_rollback_setting(p_section,p_version,p_reason)`, `admin_decide_agent_approval`.
- **Create/update RPCs (validated, audited; `p_ws` must be `ctx.workspace.id`):** `provider_save_listing(p_ws, p_listing uuid|null, p jsonb)` → id (draft create/update for venue|service: name, kind, description, location, category, city, image, gallery[], price_from, price_unit, capacity_min/max, response_hours ∈ 2|4|8|12|24, booking_mode, emergency_supply, tags[], details{…merged}), `provider_save_space(p_ws, p_venue, p_space|null, p jsonb)` → id (name, status draft|published|paused, indoor, area_sqm, capacity_seated/standing, layouts{theatre,banquet,cabaret,standing,classroom,custom}, amenities[], turnaround_minutes, min_hours, exclusive_group, rate_hourly, image, details), `provider_save_package(p_ws, p_package|null, p jsonb)` → id (listing_id, name, status, description, base_price, price_basis fixed|per_person|hourly, min/max_guests, duration_hours, deposit_pct, booking_mode, inclusions[], add_ons[{name,price}], space_ids[], image, details), `provider_save_structure(p_ws, p_venue, p_elements jsonb[], p_publish bool)` → version, `start_agent_run(p_ws, 'provider'|'admin', p_goal, p_tools text[], p_constraints jsonb, p_idempotency text)` → run id. Error codes they raise: layout_exceeds_capacity, instant_requires_price, capability_disabled, invalid_*, price_required, capacity_required, protected_element_removed, tool_not_permitted. Map these to friendly messages in your own action file when `friendly()` doesn't cover them.
- `crew_members`, `agent_routines`, `tasks`, `calendar_entries` and `leads` are directly writable by workspace members under Phase 2 RLS (insert/update via `ctx.db.from(...)`), scoped to `workspace_id = ctx.workspace.id`. Workspace `name`, `settings` and `capabilities` are owner-updatable via `ctx.db.from("workspaces").update(...)`. Disabling a capability must never delete records; warn if active bookings exist.
- Known issue (owned by another session, fix requested): `publish_listing()`/`listing_readiness()` currently error with "malformed array literal" for listings that are missing fields. Handle the error gracefully: show "Readiness check unavailable" and keep the item a draft.
- If an action has no RPC (e.g. creating a space or a crew member through a wizard), check the table's RLS/grants. Phase 3 tables are **read-only to clients**. Then either (a) leave the control in a disabled state with an honest tooltip ("Available once …"), or (b) report it as needing an RPC. **Never fake success.** (The lead will add missing RPCs; list exactly which ones with signatures.)

## Truthfulness rules

- No hardcoded business numbers. Design figures like "£28,450" or "↑ 28%" must be computed from data (period-over-period via `delta()`; series for sparklines from real rows grouped by day). If a metric can't be computed honestly, show the closest real metric with an accurate label, or omit it. Don't fabricate.
- Unanswered requests show **Expired / No response**, never "Declined". Completion never implies payment. Payment status comes only from stored payment state.
- Gala Agent suggestion cards must be derived from data (e.g. "Respond to N pending enquiries" where N is real), and link to the real place to act.
- Static UI copy (labels, headings, helper text) is fine and should match the design.

## Visual verification loop (required)

1. Add entries to `artifacts/visual/ws-manifest/<group>.json`: `[{ "key": "prov-005-bookings", "url": "/provider/bookings", "file": "Designs/Provider Workspace/Gala·Dock Bookings Dashboard.png", "who": "provider" }]` (`who` is `provider` or `admin`). Optional `"mask": [[x,y,w,h]]` + `"maskReason"`, **only** for genuinely dynamic regions (live clocks, today's date). Never mask a broken or missing component.
2. Run `node --env-file=.env --env-file=.env.local scripts/ws-visual.mjs <key>` (logged-in states already exist in `artifacts/auth/`; if one expired, run `node --env-file=.env --env-file=.env.local scripts/ws-auth.mjs provider` or `admin`).
3. Read `artifacts/visual/ws/screens/<key>.png` (your render), the reference design, and `artifacts/visual/ws/diffs/<key>.png`. Fix the differences: geometry first (column widths, card heights, gaps), then type sizes, colours, and icons.
4. Repeat until diff ≤ 5% and SSIM ≥ 0.95, or until further gains depend only on data content differences (different names/dates than the mock). Data-content residue is expected and acceptable, so say so honestly. Do at least 3 iterations per canonical screen.
5. Also screenshot each screen at 390×844 (mobile) and 1024×768 (tablet) by adding manifest entries with `width`/`height` and a `file` of the same reference (metrics will be skipped for size mismatch). Check for no horizontal overflow (`geometry.overflowX` false in the result json), no clipped text, and no overlapping controls.

## Code quality

- Server Components by default; `"use client"` only for interactive islands. Use `PageProps<"/route/[id]">` typing (`await props.params`, `await props.searchParams`).
- Accessible: real `<button>`/`<a>`, labels on inputs, `aria-current` on tabs (the kit does this), alt text on content images.
- Typecheck your files: `npx tsc --noEmit -p . 2>&1 | grep -E "src/app/(provider|admin)/<your folders>"`. Lint: `npx eslint <your files>`. Both must be clean for your files.
- Keep files reasonably sized; extract `_components/` per route group.
- Match the surrounding code style (dense, concise, no comment spam).

## Final report (your last message)

1. Each screen: route, design file, final diff % and SSIM (from your last run), and the iterations it took.
2. Every interactive control, and which RPC/route it uses. Controls left disabled, and why.
3. Missing RPCs or data you needed (exact signatures).
4. Known gaps or deviations from the design, and responsive results (390/1024).
5. Typecheck/lint status for your files.
Be factually exact. Don't claim anything you didn't run.
