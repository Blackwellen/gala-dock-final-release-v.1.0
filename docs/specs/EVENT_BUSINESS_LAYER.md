# Gala Dock — Event Business Layer (enterprise event-operations spec)

Fully-integrated event-business capabilities across the **whole product** (not a separate module):
event-type system, proposals + conversion, venue/bar/deposit management, dynamic budgeting &
profitability, multi-room/multi-venue/hybrid, timelines/run-sheets, marketing, risk/compliance,
i18n, menus/drinks/theme. Real Supabase records + RLS + audit + R2 — no mock-only UI.

> Build rule: read CLAUDE.md/AGENTS.md, existing schema/RLS/routes/components/seed before changes.
> Event-type templates are **data in Supabase** (admin-extendable), not hard-coded in the UI.
> Every tab is event-type-aware (fields, defaults, validation, pricing categories, empty states, warnings).

## Event types (configurable)
Remote · Webinar · Nightclub · Large show · Small show · Festival · Wedding · Birthday · Children's
party · Corporate · Speaker · Theatre · Gig · Private party · Public ticketed · Multi-room ·
Multi-venue · Hybrid · International · Custom. Each defines: default fields, planning template, budget
categories, revenue categories, risk template, venue/room requirements, ticketing template, staffing,
media/marketing needs, deposits, compliance, timings, profitability assumptions, operational checklist.

## Data model (~40 tables — all carry workspace_id, event_id where relevant, created_by, timestamps, soft-delete, indexes, FKs, RLS, audit)
**Types/templates:** event_types · event_type_templates · event_type_budget_categories · event_type_revenue_categories · event_type_risk_templates · event_type_planning_templates · event_type_ticket_templates
**Proposals:** event_proposals · event_proposal_versions · event_proposal_items · event_proposal_comments · event_proposal_approvals · event_proposal_conversions
**Venue/rooms:** event_venues · event_rooms · event_room_schedules · event_bar_terms · event_deposits · event_drinks_packages
**Finance:** event_budgets · event_budget_items · event_revenue_items · event_profit_scenarios · event_profit_splits
**People/programme:** event_staffing_requirements · event_supplier_requirements · event_acts · event_act_sets · event_speaker_slots
**Plan/marketing/risk:** event_timeline_items · event_run_sheets · event_marketing_plans · event_marketing_tasks · event_risk_assessments · event_risk_items
**Menu/theme:** event_menu_items · event_theme_plans
**Files/audit:** event_documents · event_media · event_audit_logs

## The 16 areas
1. **Event Type System** — configurable types + templates; cross-integrated into every event tab.
2. **Proposals & Conversion** — wizard, templates by type, versioning, status machine (draft→…→converted), comments/attachments(R2), PDF export, approvals, audit, **convert → real records** (event, budget, timeline, deposits, venue, staff, ticket tiers, marketing, docs).
3. **Venue/Bar/Deposit** — venue+bar manager assignment, bar deposit, min spend, guarantees, drinks packages/tokens, VIP tables, splits (door/ticket/bar/supplier/artist), hire deposit (refundable/non), milestones/due dates/paid status, proof uploads(R2), settlement/reconciliation.
4. **Dynamic Budget & Profitability** — type-driven budget + revenue categories (full lists in §4 of the prompt); profitability (est/confirmed revenue+cost, margin, break-even tickets/revenue, profit before/after split, per-party/venue/promoter/artist/supplier splits, refund/deposit exposure, scenarios conservative/expected/aggressive, capacity & ticket-mix & multi-room/venue projections).
5. **Multi-room DJ/Act/Speaker** — rooms/stages, DJs per room, set times, hourly/flat pricing, riders, speaker slots, stage schedules, changeover/soundcheck, room capacity/access/staffing/bar/decor/security, multi-room profitability + risk.
6. **Timeline / Setup / On-day / Post** — phases (proposal→…→post-event report); setup timelines, run sheets, call/arrival/soundcheck times, room open/close, contingency, risk checkpoints, doc checklist, reconciliation, review.
7. **Marketing & Launch** — launch tiers, campaign schedule (early bird→final→sold-out/waitlist), corporate/wedding/webinar flows, social/paid/web plans, landing-page checklist, UTM + conversion fields, promo codes, affiliate/promoter links, sponsor deliverables, email/SMS/WhatsApp tasks, creative checklist, R2 media.
8. **Risk & Compliance** — type-specific risks (crowd/capacity/fire/security/first-aid/safeguarding/allergen/licensing/noise/weather/travel/international/technical/data/speaker/rider), insurance, permits, supplier compliance docs, owner/score/mitigation/status/due, attachments(R2), approval/audit.
9. **i18n & Multi-venue** — multiple venues/rooms, venue managers, currencies, time zones, local tax/VAT/compliance notes, international supplier travel, localization checklist, hybrid access links, TZ-aware schedules, multi-venue profitability/settlement/conversion.
10. **Menu/Drinks/Theme** — food menus, catering packages, dietary/allergens, kids/wedding/corporate menus, drinks packages (open/cash bar, tokens, VIP bottles), min spend, theme/moodboard, decor supplier/budget, room-specific decor, styling, R2 uploads.
11. **Schema** — the ~40 tables above (RLS + audit + indexes).
12. **UI/UX** — premium consistent shell; event-type context chip + status chip; financial summary cards; type-aware empty states; create/edit + inline edit; search/filter/sort; responsive/PWA; real data; audit; R2 uploads.
13. **Buttons/Wizards** — all flows wired (create type, create-from-type, proposal create/send/convert, add venue/room/act/set/budget/revenue/ticket-tier/deposit/bar-terms/drinks/menu/theme/marketing/marketing-task/risk/timeline, upload doc/media, add profit split, recalc profitability, scenarios, settlement). No fake buttons.
14. **Seed (SQL only)** — nightclub multi-room · corporate conference · webinar · wedding · children's party · festival · theatre · speaker · small private · multi-venue — each with realistic venues/rooms/budgets/tickets/staff/risks/proposals/deposits/marketing/timeline/docs/profitability/status.
15. **Tests/QA** — calculators (unit), proposal conversion (integration), RLS, budget/profit scenarios, multi-venue, multi-room/set-times, deposit/bar settlement, risk/template generation, type-template application, R2 paths, route/wizard tests; Chrome MCP at 1440/1280/1024/tablet/mobile-PWA.
16. **Acceptance** — see prompt; complete only when types alter every tab, proposals convert to real records, venue/bar/deposit wired, dynamic budgeting/profitability, all event variants handled, schema/RLS/audit/indexes complete, R2 works, SQL seed, all buttons wired, no mock-only UI, 1:1 design consistency, comms tied to event/proposal context.

## Build order (phased — EB track)
A. Schema foundation (types/templates + core event-business tables + RLS + audit + indexes).
B. Event-type system + type-aware tab framework + context chip.
C. Budget + profitability engine (calculators + scenarios + splits).
D. Proposals + conversion.
E. Venue/bar/deposit + settlement.
F. Multi-room/act/speaker + schedules.
G. Timeline/run-sheet + marketing + risk.
H. Menu/drinks/theme + i18n/multi-venue.
I. Seed data (SQL) + tests + Chrome-MCP QA.

## Additional areas (17–26)
17. **Event CRM** — lead source, enquiry pipeline, client type, follow-up reminders, lost reasons, repeat clients, upsell opportunities. (Extends existing `leads` + adds client/upsell intelligence.)
18. **Guest/attendee intelligence** — guest segments, VIPs, accessibility needs, dietary needs, age restrictions, check-in status, guest notes. (Extends `event_guests`.)
19. **Capacity + safety engine** — capacity per venue/room, live occupancy, oversell warnings, staff/security-ratio warnings (real-time validation against `event_rooms`/`event_venues` capacity + ticket sold + staffing).
20. **Contracts + e-sign** — proposal→contract conversion, signed terms, supplier contracts, venue agreements, client approvals; typed-name + checkbox e-sign (UK-valid), audit. Tables: `event_contracts`, `event_contract_signatures`.
21. **Settlement engine** — post-event reconciliation: ticket revenue, bar split, supplier payouts, refunds, deposits returned/withheld, profit-share statements (PDF). Tables: `event_settlements`, `event_settlement_lines`.
22. **Sponsor/vendor management** — sponsor packages, deliverables, vendor stalls, pitch fees, sponsor assets(R2), fulfilment tracking. Tables: `event_sponsors`, `event_sponsor_deliverables`, `event_vendors`.
23. **Inventory/equipment** — radios, wristbands, scanners, barriers, staging, lighting, AV, decor; lost/damaged tracking. Tables: `event_inventory_items`, `event_inventory_assignments`.
24. **Incident log** — on-day incidents: medical, security, complaints, safeguarding, lost property; escalation owner, status, time, attachments(R2). Table: `event_incidents`.
25. **AI Copilot event context** — Copilot understands event type, proposal, budget, venue, timeline, risks, messages and profitability for an event, and suggests improvements (extends `buildWorkspaceContext` + a per-event context graph; new commands e.g. `/analyse-event` deepened, `/event-risks`, `/event-settlement`).
26. **Public-facing event layer** — SEO event pages, registration pages, private invite pages, waitlists, guest forms, ticket links, sponsor pages (ties into V1.5 public event pages + ticketing + INTL). Tables: `event_public_pages`, `event_registrations`, `event_waitlist`.

## Additional tables
event_contracts · event_contract_signatures · event_settlements · event_settlement_lines · event_sponsors · event_sponsor_deliverables · event_vendors · event_inventory_items · event_inventory_assignments · event_incidents · event_public_pages · event_registrations · event_waitlist · event_client_profiles (CRM) · event_guest_segments

## Additional areas (27–36)
27. **Seating / table planning** — floor plans, table allocation, VIP areas, guest groups (extends event_floor_plans + event_guests). Tables: `event_tables`, `event_seat_assignments`.
28. **Accreditation / pass system** — staff/artist/press passes, backstage/zone access, wristbands; QR passes, scan validation. Tables: `event_passes`, `event_pass_scans`.
29. **Queue / entry management** — door list, ticket scanning, re-entry rules, guestlist disputes, live admit count (ties to ticketing + capacity engine).
30. **Comms command centre** — radios, team channels, incident broadcasts, role-based event comms (on-day). Tables: `event_comms_channels`, `event_broadcasts`.
31. **Supplier procurement** — quote comparison (extends rfqs), preferred suppliers, purchase orders, delivery windows. Tables: `event_purchase_orders`.
32. **Weather / contingency** — rain plan, backup venues, cancellation rules, force majeure. Table: `event_contingency_plans`.
33. **Accessibility planning** — wheelchair access, hearing support, quiet rooms, carers, neurodiversity needs (per venue/room + guest). Table: `event_accessibility`.
34. **Legal / licensing** — alcohol licence, TENs, music licence (PRS/PPL), child safeguarding, insurance certificates; expiry + evidence(R2). Table: `event_licenses`.
35. **Post-event analytics** — attendance, revenue, spend, profit, marketing conversion, incidents, feedback (dashboards from real records + settlement).
36. **Reusable playbooks** — save any event as a template/playbook for future events (snapshot → event_type_templates / `event_playbooks`).

## Additional tables (27–36)
event_tables · event_seat_assignments · event_passes · event_pass_scans · event_comms_channels · event_broadcasts · event_purchase_orders · event_contingency_plans · event_accessibility · event_licenses · event_playbooks · event_feedback
