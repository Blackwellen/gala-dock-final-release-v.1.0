# Analytics and warehouse (Q35, domains 223–228, 265–266) — 2026-10-29

Migrations 202610293029 (+ consent fix in 202610293030). Tests: `tests/release/analytics-warehouse.spec.ts` (8/8).

## Capture (no PII, consent-aware)
- Allowed events: `public.analytics_event_definitions` (event name, category, allowed props, client|server). Unknown events/props are dropped.
- Route: `POST /api/analytics/capture` (same-origin, always 204, 16 KB, ≤50 events, 120/min per visitor, 600/min per user; DNT/Sec-GPC → nothing stored). The route uses the service role; `analytics_capture` is service-only (no anon SQL). Browser helper `src/lib/analytics/client.ts` `track()`; page views via `AnalyticsBeacon` (root layout).
- Identity: subject_id = HMAC-SHA256 (key in service-only `analytics_keys`). Consent `cookies_analytics` granted → stable `user:` id; otherwise a daily-rotating id from sha256(ip|ua) (never stored); no cookie set. Path = route template (ids/tokens/query removed; token pages collapse to `/:token`).
- Props: scalars only; strings with @, phone-like digits, URLs, long tokens or > 64 chars dropped.
- Retention: `analytics_events` 395 days (rule `analytics_events.raw`, draft for legal review; legal-hold workspaces kept). Erasure deletes the user's stable-id events.
- Anonymous consent UI (cookie banner, `gd_consent analytics:yes|no`) not built — lane B / legal.

## Warehouse
Facts (London day, rebuilt idempotently; nightly job `analytics.build_facts` over 35 days at 02:20; `admin_analytics_rebuild` for backfill): `fact_payment_daily` (ledger), `fact_ticket_daily` (entitlements, refunds on refund day, scans, first admission, resale), `fact_event_daily`, `fact_booking_daily` (cohorts by created day), `fact_agent_daily` (runs, AI meter), `fact_product_daily`. Dimensions `analytics_dim_workspace/event/listing`. Every fact row carries `is_demo` (demo workspace or test fixture). Backfilled from 2025-12-01.

## Metric definitions (data)
`metric_definitions` (immutable versions, 44) + `metric_definition_active` (pointer; `admin_metric_publish` / `admin_metric_activate`, audited). Spec: sum | ratio | function (whitelisted interpreter). Key formulas:
- GMV = −merchant_gmv (direct) + legacy gross cash on sale kinds + −customer_payment (legacy bookings). Net GMV = GMV − refunds − disputes.
- Fee revenue = −platform_fee (ex VAT, net of fee refunds). Platform revenue = fee revenue + own sales. Take rate = fee revenue / GMV.
- Sell-through = (issued − refunded) / non-comp tier capacity. Scan rate = admitted at least once / (issued − refunded).
- Booking conversion = live bookings / bookings created. Quote rate = requests quoted / requests created.
- AI revenue = credit packs + overage; AI margin = (AI revenue − metered provider cost) / AI revenue; MRR from plan_prices; gross margin = (platform + AI + promotion − AI cost) / revenue.
Audiences: workspace_member | workspace_finance (owner/manager/finance) | platform_admin.

## Reads
`analytics_workspace_metrics` (`GET /api/analytics/metrics?workspace=&from=&to=`), `analytics_trend`, `analytics_event_report`, `analytics_funnel`, `analytics_retention`, `analytics_platform_report` + supply gaps (`GET /admin/analytics/report[?demo=1][&format=csv]`), `analytics_reconcile`. Demo/test excluded from platform reporting unless include_demo; a workspace always sees itself. **Dashboard UI not wired** (W02/W03/W08).

## Snapshots and exports
`kpi_snapshots` (immutable; daily, weekly, monthly). Exports `POST/GET /api/analytics/export` — permission at request, generation and download; 10/hour; 24 h expiry; audited.

## Reconciliation (exit gate — met)
`analytics_reconcile` 2025-12-01 → 2026-10-29: GMV 2,518,313p, fee revenue 272,854p, refunds 327,300p, platform cash 1,830,213p, tickets 16,170, admissions 7,946, bookings 125, AI cost 8.39p — facts = source on all 8 checks.
