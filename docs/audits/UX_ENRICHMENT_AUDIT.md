# Gala Dock — UX / Visual Enrichment Audit (all routes)

Route-by-route audit of **where to add** imagery, media, avatars, maps, charts, card/data/gantt views,
view-switchers, filters, inline editing, interactive/dynamic components, and premium design — to lift
commercial depth and UX to a world-class bar.

Companions: `docs/audits/COMMERCIAL_DEPTH_AUDIT.md` (competitive intel), `docs/plans/FEATURE_BUILD_PLAN.md`
(step plan), `docs/MASTER-PLAN.md` (versioning), `docs/specs/README.md` (build backlog — UX specs UX-0..UX-14).

---

## Enrichment component vocabulary (the toolkit referenced below)

**Imagery/media:** `CoverImage`, `PhotoGallery`/lightbox, `Avatar`/`AvatarGroup`, `LogoMark`, `MapView` (Leaflet), `MediaUploader`, `EmptyIllustration`.
**Data-viz:** `KpiCard`/`KpiStrip`, `LineChart`, `BarChart`, `AreaChart`, `DonutChart`, `FunnelChart`, `GaugeCard`, `Sparkline`, `Heatmap`, `GanttChart`, `TrendDelta`.
**Views:** `DataTable` (sort/resize/column-pick), `CardGrid`/gallery, `KanbanBoard`, `CalendarView`, `MapView`, `TimelineView`, `SplitPane`, `ViewSwitcher` (table/card/board/calendar/map toggle).
**Interaction:** `FilterBar`, `SavedViews`, `InlineEditCell`, `BulkActionBar`, `DragDrop`, `CommandPalette`, `QuickActions`, `Drawer`/`Sheet`, `Modal`, `Tooltip`, `CopyButton`, `ExportMenu`, `Stepper`.
**Premium:** `EntityHero`, `RightRail`, `PremiumEmpty/Loading/Error`, `Microinteractions`, `ProgressiveDisclosure`, `StatusBadge`.

> Most of these have a matching skill in the pack (e.g. `chart-card-design`, `map-view-design`,
> `kanban-view-design`, `gantt-view-design`, `inline-editing-system`, `filter-bar-system`,
> `saved-views-system`, `avatar-system`, `gallery-management-system`). Build them once in **UX-0**.

Legend per route: ✅ likely present · ➕ add · ⬆ upgrade to premium.

---

## APP — Home & dashboards

### `(app)/home`
➕ `KpiStrip` with `TrendDelta` + `Sparkline` per KPI · ➕ `AreaChart` (revenue/bookings trend) · ➕ `DonutChart` (events by status/type) · ➕ `FunnelChart` (leads→won) · ➕ upcoming-events `CardGrid` with `CoverImage` · ➕ `MapView` mini (events by location) · ➕ activity `TimelineView` with `Avatar` · ➕ `QuickActions` row · ⬆ `PremiumEmpty` for new workspaces.

---

## APP — Events

### `(app)/events` (register)
➕ `ViewSwitcher`: **Table · Card · Calendar · Map · Board(by stage)** · ➕ `FilterBar` (type, status, date range, venue, owner) + `SavedViews` · ➕ card view with venue `CoverImage` + client `Avatar` · ➕ `InlineEditCell` (status, date, owner) · ➕ `BulkActionBar` · ➕ KPI strip with `Sparkline`.
### `(app)/events/new` (wizard)
✅ stepper ➕ `Stepper` progress + `MapView` venue picker · ➕ AI brief panel with streaming · ➕ live `RightRail` summary preview · ➕ image/cover upload step.
### `(app)/events/[eventId]` (detail — 8+ tabs)
➕ `EntityHero` with venue `CoverImage` + status + key metrics · ➕ `RightRail` (client card w/ `Avatar`, key dates, % complete `GaugeCard`) · Overview: `KpiCard`s + `DonutChart` budget split · Suppliers tab: quote-comparison `DataTable` + `Avatar`s · Tasks tab: `KanbanBoard` + mini `GanttChart` · Run sheet: `TimelineView`/gantt lanes, `DragDrop` reorder, `InlineEditCell` · Finance tab: budget-vs-actual `BarChart` + margin `GaugeCard` · Files tab: `PhotoGallery`/media grid · Activity: `TimelineView` w/ `Avatar`.
### `(app)/events/[eventId]/run-sheet & /event-day`
⬆ premium live `TimelineView`/`GanttChart` with lanes, `DragDrop`, big-touch controls, offline state (PWA), real-time tick.
### `(app)/events/[eventId]/floor-plan`
➕ **drag-drop seating canvas**, table/seat objects, capacity gauge, guest-assignment `Drawer`, `Avatar` chips per seat, zoom/pan.
### `(app)/events/[eventId]/mood-board`
➕ `PhotoGallery` masonry, image upload, colour-palette swatches, lightbox, pin/comment.
### `(app)/events/[eventId]/staffing`
➕ crew `CardGrid` w/ `Avatar`, shift `GanttChart`/calendar, availability heat, conflict badges, `InlineEditCell`.
### `(app)/events/[eventId]/expenses`
➕ `DataTable` + category `DonutChart` + receipt image thumbnails + `InlineEditCell`.
### `(app)/events/[eventId]/check-in`
➕ arrivals `GaugeCard`, live `Sparkline`, QR scanner panel, guest `Avatar` list with status.
### `(app)/events/[eventId]/beo` & `/export`
⬆ premium print/PDF layout preview, section toggles, branded header/logo.
### `(app)/events/[eventId]/edit`
➕ `InlineEditCell`-style form, autosave, image/cover management.

---

## APP — Suppliers

### `(app)/suppliers` (register)
➕ `ViewSwitcher` (Table · Card · Map) · ➕ card view w/ supplier `LogoMark`/`Avatar` + health `GaugeCard` · ➕ `FilterBar` (category, rating, availability, doc-health) + `SavedViews` · ➕ `MapView` by location · ➕ `BulkActionBar`.
### `(app)/suppliers/new`
✅ wizard ➕ `Stepper`, logo upload, category multi-select chips.
### `(app)/suppliers/[supplierId]` (detail — 6 tabs)
➕ `EntityHero` w/ `LogoMark` + health `GaugeCard` + rating stars · `RightRail` key contacts `Avatar`s · Services tab: rate-card `DataTable` · Quotes tab: comparison `BarChart` · Events tab: `TimelineView` · Documents tab: media grid + expiry `StatusBadge` + `Heatmap` of doc coverage · Activity `TimelineView` · ➕ performance `LineChart` (response time, acceptance rate).
### `(app)/suppliers/[supplierId]/edit` · `/manage/[supplierId]`
➕ inline edit, logo/media manager; manage view = scorecard dashboard with `Sparkline`s.

---

## APP — Tasks

### `(app)/tasks` (register)
➕ `ViewSwitcher`: **Board(kanban) · List · Calendar · Gantt** · ➕ `KanbanBoard` w/ `DragDrop` + `Avatar` assignees · ➕ `FilterBar` (priority, assignee, event, due) + `SavedViews` · ➕ `BulkActionBar` · ➕ `InlineEditCell`.
### `(app)/tasks/[taskId]`
➕ `RightRail` (assignee `Avatar`, event link, dependencies), checklist progress `GaugeCard`, attachments media grid, comments `TimelineView` w/ `Avatar`, `@mention`.
### `(app)/tasks/calendar`
⬆ full `CalendarView` (month/week/day) + drag to reschedule.
### `(app)/tasks/templates`
➕ `CardGrid` of templates w/ preview, apply action.

---

## APP — Finance

### `(app)/finance` (overview)
➕ `KpiStrip` + `AreaChart` (invoiced vs paid) + `DonutChart` (revenue by type) + aged-debt `BarChart` + cash-flow `LineChart`.
### `(app)/finance/quotes` · `/invoices` · `/payments`
➕ `DataTable` w/ status `StatusBadge`, `FilterBar`, `SavedViews`, `InlineEditCell`, `BulkActionBar`, `ExportMenu` · ➕ totals `KpiCard`s + `Sparkline`.
### `(app)/finance/quotes/[quoteId]` · `/invoices/[invoiceId]`
➕ premium document preview, line-item `DataTable` inline-edit, payment-schedule progress bar/`GaugeCard`, activity `TimelineView`, pay-link `CopyButton`, PDF preview.
### `(app)/finance/profit` (P&L)
⬆ margin `GaugeCard` per event, waterfall/`BarChart` cost breakdown, profit `LineChart` trend, per-event `DataTable` w/ margin `Sparkline`.
### new forms (`/quotes/new`,`/invoices/new`)
➕ inline line-item editor, live total `RightRail`, client/logo branding preview.

---

## APP — Sales pipeline (Leads · Proposals · RFQs · Forms)

### `(app)/leads` + `/leads/[leadId]` + `/leads/new`
➕ `ViewSwitcher` (Board(pipeline) · Table) · ➕ `KanbanBoard` by stage w/ `DragDrop` + value chips · ➕ conversion `FunnelChart` + source `DonutChart` · detail: `EntityHero`, activity `TimelineView`, convert action, `RightRail`.
### `(app)/proposals` + `/proposals/[proposalId]` + `/proposals/new`
➕ `CardGrid` of proposals w/ thumbnail preview · status `StatusBadge` · detail: premium document preview, e-sign panel, `TimelineView` of views/signs, accept `GaugeCard`.
### `(app)/rfqs` + `/rfqs/[rfqId]` + `/rfqs/new`
➕ quote-comparison `DataTable`/matrix, recipient `Avatar`s + response `StatusBadge`, award action, `BarChart` price compare.
### `(app)/forms` + `/forms/[formId]` (+`/edit`,`/new`)
➕ drag-drop form builder canvas, field palette, live preview `SplitPane`, submissions `DataTable` + `Sparkline` of volume, completion `GaugeCard`.

---

## APP — Venues (planner-side CRM) & Venue-management (operator)

### `(app)/venues` + `/venues/[venueId]` (+`/new`,`/edit`)
➕ `ViewSwitcher` (Card · Table · Map) · ➕ card view w/ venue `CoverImage` + capacity badge · ➕ `MapView` · detail: `EntityHero` `PhotoGallery`, capacity `GaugeCard`, `MapView` location, F&B/pricing cards, documents grid + expiry, events `TimelineView`, notes pinboard.
### `(app)/venue-management` + `/[venueId]` + `/bookings/[bookingId]`
➕ space-inventory `CardGrid` w/ photos · availability `CalendarView` (double-booking block) · bookings `DataTable`/board · F&B package cards · booking detail: `TimelineView`, payment status `GaugeCard`, staffing `GanttChart` · revenue `LineChart` + occupancy `Heatmap`.

---

## APP — Library · Inbox · Reports · Team

### `(app)/library` (+ files/templates/brand-assets/supplier-docs/event-packs + detail)
➕ `ViewSwitcher` (Grid · List) · ➕ media `PhotoGallery`/file thumbnails w/ preview lightbox · ➕ `FilterBar` (type, tag, event) · file detail: preview pane, version `TimelineView`, share `CopyButton`; brand-assets: colour/logo swatches; templates: `CardGrid` previews.
### `(app)/inbox` + `/inbox/[threadId]`
➕ `SplitPane` (list ↔ thread) · `Avatar`s, unread badges, channel filters, message composer w/ attach, typing/read states, `TimelineView` thread.
### `(app)/reports`
➕ tabbed dashboards: Overview `KpiStrip`+`FunnelChart`; Revenue `BarChart`/`AreaChart`; Events delivery `GaugeCard`s; Suppliers spend `DonutChart`+`Heatmap`; Team workload `BarChart`; Clients retention `LineChart` · ➕ date-range `FilterBar`, `ExportMenu`, comparison toggles.
### `(app)/team`
➕ member `CardGrid` w/ `Avatar` + role `StatusBadge` · workload `BarChart` · availability `CalendarView`/`Heatmap` · seat-usage `GaugeCard` · `InlineEditCell` role.

---

## APP — Settings (18 pages)
General: ⬆ consistent two-column premium layout, section nav, `ProgressiveDisclosure`, autosave toasts.
- `account` ➕ `Avatar` uploader · `branding` ➕ logo/colour pickers + live preview card · `workspace` ➕ logo + member `AvatarGroup` · `team` ➕ member table + invite `Drawer` · `roles` ➕ permission matrix grid · `billing` ➕ plan cards + usage `GaugeCard` + invoice `DataTable` + `Sparkline` · `usage` ➕ meter `GaugeCard`s + `AreaChart` · `ai` ➕ credit-balance `GaugeCard` + usage `LineChart` · `smart-rules` ➕ rule builder + run-log `TimelineView` · `audit`/`data-export` ➕ `DataTable`+`FilterBar`+`ExportMenu` · notification/preferences/defaults ➕ grouped toggles, `ProgressiveDisclosure`.

---

## ADMIN console (19 pages)
### `admin` (overview)
➕ platform `KpiStrip` (MRR, churn, signups) + `AreaChart` growth + `BarChart` cohort + recent-events `TimelineView`.
### list pages (`users`,`workspaces`,`subscriptions`,`affiliates`,`support`,`email-logs`,`automation-runs`,`audit`)
➕ `DataTable` (sort/column-pick) + `FilterBar` + `SavedViews` + `BulkActionBar` + `ExportMenu` + `Avatar`s.
### detail pages (`users/[id]`,`workspaces/[id]`,`subscriptions/[id]`,`affiliates/[id]`,`support/[ticketId]`)
➕ `EntityHero` + `RightRail` + activity `TimelineView` + related `DataTable`s; support ticket: thread `SplitPane`.
### monitoring (`system-health`,`ai-usage`,`storage-usage`,`security`,`feature-flags`)
➕ live `LineChart`/`AreaChart` metrics, `GaugeCard` quotas, `Heatmap` (usage/errors), status `StatusBadge` grid, flag toggles w/ scope.

---

## MARKETING / PUBLIC (current)
### `(marketing)` home, `product`, `features`, `pricing`, `security`, `use-cases/*`
⬆ premium `HeroSection` w/ product imagery/screenshots · ➕ feature `CardGrid` w/ icons/illustrations · ➕ animated stat counters + `Sparkline` · ➕ pricing `ViewSwitcher` (monthly/annual) + comparison table · ➕ testimonial cards w/ `Avatar` · ➕ logo wall · ➕ interactive product screenshots/video · use-cases: persona imagery + workflow diagrams.
### `contact`,`book-demo`,`waitlist`,`demo`,`help`,`status`,`affiliate`
➕ `MapView` (office), calendar booking widget, status `Heatmap`/uptime `LineChart`, help search + article `CardGrid`, affiliate earnings `BarChart` preview.
### `legal/*` (8 pages)
⬆ clean typographic layout, in-page TOC/anchor nav, last-updated badge (low media — keep restrained).

---

## AUTH & ONBOARDING
### `(auth)/*` (login,signup,otp,mfa,forgot,reset,verify,accept-invite)
⬆ premium split-panel w/ brand imagery/illustration, micro-interactions, clear states · OTP/MFA code inputs, strength meter.
### `onboarding/*` (account,workspace,role,plan,demo-data,first-event,invite-team,complete)
➕ `Stepper` progress · role/persona selection cards w/ illustration · plan cards · demo-data preview · first-event mini-wizard · invite `AvatarGroup` · `complete` celebratory state.

---

## V1.5 — Consumer & ticketing pages (to build, design premium from day one)
- **Public event page** (`/e/[slug]`): hero `CoverImage`/`PhotoGallery`, `MapView`, ticket-tier cards, date/`CalendarView`, organizer card w/ `LogoMark`, social proof.
- **Checkout**: clean stepper, order summary `RightRail`, seat-map picker (reserved seating), Apple/Google-pay buttons.
- **Buyer dashboard** (`/account/tickets`): ticket `CardGrid` w/ QR, transfer/refund actions, order `TimelineView`, wallet passes.
- **Check-in/door** (`/check-in/[token]`): scanner UI, arrivals `GaugeCard`, live `Sparkline`.
- **Seating builder**: drag-drop canvas (shared with event floor-plan).

## V2 — Marketplace pages (to build)
- **Venue/Supplier marketplace listing & search**: `CardGrid` w/ photos + rating + price, `MapView` + `FilterBar` (capacity, location, date, price), `ViewSwitcher` (grid/map/list), compare drawer.
- **Listing detail**: `PhotoGallery`, `MapView`, availability `CalendarView`, reviews w/ `Avatar`, pricing cards, request-to-book `Drawer`.
- **Operator/Supplier dashboards**: bookings `DataTable`/board, earnings `LineChart`, occupancy `Heatmap`, payout `GaugeCard`, calendar.
- **Escrow/disputes**: status `TimelineView`, evidence media grid, resolution `Stepper`.
- **Public events directory**: `CalendarView` + `MapView` + category `FilterBar` + featured `CardGrid`.

---

## Cross-cutting rules (apply everywhere)
1. **Every register page** gets: `ViewSwitcher` + `FilterBar` + `SavedViews` + `BulkActionBar` + `ExportMenu` + `InlineEditCell`.
2. **Every detail page** gets: `EntityHero` + `RightRail` + tabbed content + activity `TimelineView` + related-data tables.
3. **Every dashboard** gets: `KpiStrip` (with `TrendDelta`/`Sparkline`) + at least one chart + one premium empty state.
4. **Every entity with a location** gets a `MapView`; **every entity with people** gets `Avatar`s; **every entity with files** gets a media grid/gallery.
5. **Premium baseline**: `PremiumEmpty/Loading/Error`, micro-interactions, consistent spacing/shadows/radius, tooltips, keyboard support, mobile-responsive transforms (table→cards, gantt→list).
