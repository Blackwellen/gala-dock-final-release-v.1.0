# Gala Dock Automations — Full Canvas Architecture (V1-3, enterprise depth)

Not a rules-only engine. A **full low-code automation platform**: recipe/template library +
**drag-drop canvas (DAG)** + a large node catalogue, fully wired to Supabase, edge/cron, queues,
webhooks, audit and AI handoff. Target depth: **50–150 nodes** spanning every section and
**50–150 templates/recipes**. Gates at Scale+ (advanced canvas behind a flag until release-ready).

## Two engines (kept separate)
- **Smart Rules** (exists: `smart_rules`, `smart_rule_runs`, `smart_rule_actions_log`, `smart_rule_cap`) — immediate, deterministic trigger→condition→action.
- **Automations canvas** — visual DAG builder compiling to the same execution layer + queues/cron for scheduled/long-running flows. Copilot's Automation Agent can author these (draft, review-first).

## Node catalogue (source: AGENTS.md node list — adapt property→event domain)
Categories: **Triggers (28)** · **Conditions (7)** · **Branch/Router (3)** · **Delay/Time (3)** · **Lookup (4)** ·
**AI (5, approval-required)** · **Action (10)** · **Communication (3)** · **Payment (3, 🔒 blocked-from-auto-run)** ·
**Approval (3)** · **Legal (2, 🔒)** · **Integration (3)** · **Webhook/API (2)** · **Utility (3)** · **Error handling (3)** · **End/Terminal (3)**.
Plus the simpler **Smart Rules catalogue** (57 triggers + 21 actions) that recipes compile against.
Event-domain remap: property→event, tenancy→booking, compliance cert→supplier doc/insurance, arrears→overdue invoice, etc.

## Templates / recipes
~80 curated recipes today (AGENTS.md) → expand toward 50–150, grouped by section (Events, Suppliers, Tasks,
Finance, Pipeline, Tickets, Venues, Documents, Portals, Notifications, Admin). All install as **disabled,
review-first drafts**; each explains trigger · conditions · actions · permissions · risk · expected result.

## Surfaces & routes (under /event-manager/automations)
List · Recipe library · Builder/Canvas (flag `canvasLite`) · Webhooks · Integrations · My automations ·
Runs/logs · Approvals · Usage/limits · Governance settings (workspace).

## Backend
Definitions + runs + approvals + errors + recipes + usage tables (workspace-scoped RLS) · edge/cron workers ·
queue with idempotency keys · retry+backoff+dead-letter · loop prevention (source metadata + recursion limits) ·
re-check workspace/role/plan/add-on/flag at execution time · webhook signature + replay protection.

## Release gating
Advanced canvas + webhooks + integrations behind feature flags; trial users hit a branded gate;
payment/legal nodes hard-blocked from auto-run (approval-required). See Section 7 of AGENTS.md for the full
220-point release-readiness contract this area must pass.

## Build phases
1. Node registry (catalogue as typed data) + trigger/condition/action registries.
2. Recipe library UI (browse/preview/install as draft).
3. Smart Rules → run-log + approvals surface.
4. Canvas builder (DAG editor, drag-drop, validation) behind `canvasLite`.
5. Queue/cron workers + idempotency + loop prevention.
6. Webhooks + integrations + AI authoring handoff.
