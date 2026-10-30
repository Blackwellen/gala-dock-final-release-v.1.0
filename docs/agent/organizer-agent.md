# Gala Agent — Organizer Agent (Q42, domains 1–2, 9, 11) — 2026-10-29

Migrations 202610294032, 4033, 4034 (+ seed `209912310002`). Tests: `tests/release/agent-organizer-provider.spec.ts` (11), `agent-governance` (10). Code: `src/lib/agent/{skills,registry,runtime,controls}.ts`, `eval/agents.ts`, `src/components/agent/agent-controls*.tsx`.

Rules: Azure only via `llm.ts`; never customer (CHECKs on `agent_tools` / `agent_skills`); every step through `agent_execute_tool` as the human, in the run's workspace only.

## Skills (`agent_skills`, seeded from `skills.ts`)
org.create_event_plan (deep), org.source_venue, org.source_suppliers, org.ticket_strategy, org.promotion_plan, org.readiness_review, org.emergency_recovery, org.event_day_command (fast), org.post_event_closeout, org.ask (fast), org.sales_followup (fast). Each: bound tools (must exist, be exposed to the surface, never R5), mission template, tier, plan gate (R3/R4 → `agent.actions`).

## Tools added
calendar.upcoming, event.conflicts, event.ops_readiness, compliance.overview, hospitality.summary (counts only), logistics.overview, partners.overview, virtual.attendance, campaigns.calendar / campaigns.report (read-only, `promotion.manage`), sales.client (`sales.read`), stock.report, comms.inbox, memory.recall, memory.remember (R2), mission.wait_for (runtime only; not API/MCP). Existing events/readiness/feasibility/budget/marketplace/team/tickets/money/map/media/seating (seating reads guest_care for owners/managers only). Dispatch: `agent_invoke` → `agent_invoke_d3` → `agent_invoke_ext`; ids checked against the run's workspace.

## Plans
Starter = R0–R2 (coordinator decision 2026-10-29, **live**); `agent.actions` Pro+. Planner hides R3/R4; DB refuses `plan_not_entitled`; Settings → Agent shows locked skills. Per-workspace override `workspaces.settings.entitlements."agent.actions" = true`.

## Governance additions
Approvals authorise exact args (`approval_args_mismatch`); amounts above `booking_authority_minor` need the owner (`exceeds_booking_authority`); autopilot `max_amount_minor` enforced in the DB; retries replay by idempotency key.

## Missions
`mission.wait_for` → `agent_mission_wait` parks the run (`waiting_external`, no tokens); a `build_items` status change wakes it (outcome responded | cancelled); job `agent.mission_wait_expiry` (15 min) → expired.

## Memory
`agent_memories`: workspace or own-user scope; refuses emails, long numbers, health/dietary words and secrets; 180-day (or policy) retention with daily purge; `agent_memory_remember` / `_list` / `_forget` (item, user, workspace, all) audited; members can't wipe workspace memory.

## Routing
`routeTier()`: skill tier; deep needs `agent.deep`; low credit / routines → fast for basic/medium skills.

## Settings → Agent (organizer and provider)
Kill switch (owner/manager, reason, step-up), skills on plan, memory list with forget/reset, cost per task (`agent_workspace_run_costs`, owners/managers).

## Exit gate — met
Mission refused `approval_required` → owner approves → executes as approver → retry replays → parks `waiting_external` → provider response wakes it → finishes; full audit trail; cost visible to owner, refused for member.

## Open
Skill picker + additive mission parameter on `start_agent_run`; friendly refusal text on run/approval pages (W03/W04); `agent_skill_evaluations` table (harness covers evals); demo crew/equipment/campaign/client fixtures for success paths.
