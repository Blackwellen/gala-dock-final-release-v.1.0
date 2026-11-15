# Gala Agent runtime governance (Q41, domains 1, 3–15) — 2026-10-29

Migration 202610294029. Tests: `tests/release/agent-governance.spec.ts` (10; fake model, no Azure calls). Code: `src/lib/agent/{registry,plan,minimise,runtime}.ts`, `src/lib/agent/eval/harness.ts`.

## Owner rules
AI is Azure-only through `llm.ts`. No AI in the customer workspace: no tool can be exposed to `customer` (CHECK); customer runs refused at insert and by `start_agent_run`. Ranking reasons stay internal (stripped from prompts).

## Registry (R0–R5)
R0 read · R1 draft · R2 internal write · R3 external non-binding · R4 commercial/public commitment · R5 never executed. Each tool: permission (as the human), `exposure` (organizer/provider/admin/api/mcp; API/MCP R0–R3 only, R4 → approval_required, R5 never), `plan_capability` (`agent.actions` for R3/R4; plan_entitlements + workspace override), `rate_per_minute`. `scripts/gen-agent-tools.mjs` → `209912310002_agent_tools_seed.sql`; registry = seed = live tested (now incl. `map.validate`, `map.bindings`).

**Plan decision (coordinator, under delegation, 2026-10-29):** Starter keeps R0–R2 (read, draft, internal write); R3/R4 actions (`agent.actions`) are Pro and above — keeps AI runs profitable on the lowest plan. Per-workspace overrides remain for support cases.

## Governed execution
Every run step goes through `agent_execute_tool(run, step, actor, tool, args, key, approval, policy_auto)`: kill switches (platform `agent_runtime_controls`, workspace `agent_policies.kill_switch`, admin `tools_disabled`), exposure, workspace active and of the run's surface, plan entitlement, membership + policy allow-list, R5 never, R3/R4 only with a live approval decided by this actor or an explicit policy rule, the run's own workspace (arguments can't widen it), per-tool rate, idempotency key (same key replays the recorded result; reuse with other arguments refused). Every call is a row in `agent_tool_calls` (append-only) plus `agent.tool_called|tool_refused|tool_failed`. One key per step → a retry never acts twice.

## Runs, credits and cost
Run status CHECK now matches the `agent_run` machine (live runs had been stuck in `planning`). New runs refused for customers, under a kill switch, beyond `max_runs_per_hour`, or when a hard-capped workspace has < 1 credit (refuse-before-spend). `ai_preflight` caps every model call; `record_ai_usage` meters at the Azure price book; `agent_run_cost(run)` reports credits, tokens, tool calls.

## Approvals
R3/R4 approvals expire (`approval_expiry_hours`, job `agent.approval_expiry` every 15 min). R4 above `booking_authority_minor` needs the owner; R4 approval needs step-up. Admin-path run control needs MFA.

## Prompt safety
Plans are untrusted: `parsePlan` keeps catalogue tools, schema-valid inputs, backward `$stepN` references, ≤ 12 steps. Tool outputs enter prompts as escaped `<data>` after `minimise()` removes guest care/health, contact/identity, private notes, evidence, ranking internals and secrets.

## Evaluation
`FakeModel` + 17 baseline scenarios (accuracy, safety, injection, permission, cost, regression) + `registryInvariants()`; no network.

## Operations
Platform kill switch: Admin → System health (agent_ops + MFA + reason). Workspace: `set_agent_kill_switch` (owner/manager; pauses in-flight runs) — settings UI pending (W03/W04). Governed runtime path takes effect on deploy; DB is backward-compatible.

## Out of scope here
Agent skills (2), memory (9), model routing beyond fast/standard/deep (11) → Q42/Q43.

## Q53 bug hunt (2026-11-14) — migration 202611148531, spec `tests/release/q53-agent-bughunt.spec.ts` (stubbed model)
- **Argument scope**: `agent_scope_check()` (called by `agent_invoke`) refuses any `event_id`, `item_id`, `depends_on`, `primary_id`, `standby_id`, `space_id`, `listing_id`, `crew_id`, `equipment_id`, `tier_id` outside the run's workspace (`not_found`). The domain functions only checked the human's access, so a person in two workspaces could read / change workspace B from a run in A.
- **Run machine**: `planning → completed` (zero-step conversational replies no longer stick in "planning"), `planning → queued` (transient model error while planning: backoff, then a plain failure after 3 tries; content filter → failed with a refusal), `paused → awaiting_plan_confirmation` (resume of an unconfirmed plan, in `controlRun` and `agent_control_run`). `interpretation.needs_confirmation / confirmed_at / confirmed_by` record the confirmation (audited `agent.plan_confirmed`); the runtime never executes an unconfirmed plan.
- **Turn loop** (`resilience.ts`): one classification for step errors — `rate_limited` and transient infrastructure errors retry with backoff (the loop stops instead of running ahead), pause / cancel / kill switch / maintenance suspend the step (pending, never failed), the rest fail. Pause / cancel is checked before every step; steps left "running" by a crashed worker are resumed (the per-step key replays a call that succeeded); a racing second executor replays instead of failing.
- **llm.ts**: 408/409/429/5xx/network retried with Retry-After or capped backoff, then fail-over to the next deployment, inside a 50 s deadline; every attempt counted (`ai_provider_attempt`); Azure content filtering → `AgentSafetyError` (plain refusal, never retried); Ask, routines and the provider chat return plain messages instead of throwing.
- **Prompt injection**: `$stepN.field` references may only fill top-level id arguments, so retrieved text can't become a message body, quote line or memory value. Eval baseline + `inj-ref-into-free-text`, `perm-starter-no-actions`.
- **Ask**: workspace allow-list applies; every Ask tool call is audited (`agent.tool_called|failed`, `via: ask`, argument names + hash only). `/api/agent/ask` context is limited to the paying workspace.
- **Surfaces**: provider Approvals tab executes run-step approvals through the runtime (they were recorded as "tool_not_permitted" and the run never resumed); approval notifications link to `?tab=approvals`; provider watch notifications link to the provider page; organiser run labels for every state; run page auto-refreshes while the run is working; owners / managers can export agent activity as CSV (`/organizer/agent/export`, `/provider/agent/export`, no arguments).
- **Plan limits (Q67)**: `agent_invoke` sets `request.jwt.claims` to the human before any domain write, so the plan-limit triggers (which skip only `auth.uid() is null`) apply to agent-created records; no current tool creates events, listings, members or invites.

## Q75 leftovers (2026-11-14) — migration 202611147501, spec `tests/release/q75-leftovers.spec.ts`
- **Run time limits**: `agent_runs.wait_human_s / wait_idle_s / wait_since` (trigger `agent_runs_wait_clock`) split a run's age into working time and parked time. `agent_run_time_check(run)`: `max_run_minutes` caps WORKING time (waiting for approvals, plan confirmation, pause, provider replies, quiet hours and retry backoff don't count); without `agent.long_runs` working time is capped at 240 min and a run's lifetime (minus human waits) at 24 h, with it the policy value and 14 days. Enforced in `agent_governance_refusal` (refusals `run_time_limit` / `run_lifetime_limit`), `agent_mission_wait` (a wait is clamped to the lifetime left) and `executeRun` (the run fails with a plain reason before any step).
- **Policy modes server-side**: `suggest` refuses R1+ (`policy_suggest_only`), `draft` refuses R2+ (`policy_draft_only`), `always_ask` requires a live approval decided by the executing actor for R1+ (same checks as R3/R4 approvals).
- **Tracing**: `agent_runs.trace_id`; `ai_usage_events.trace_id` + `provider_request_id` (Azure `apim-request-id` / `x-request-id`) via `record_ai_usage_traced`; run calls inherit the run's trace, each Ask gets its own (also on its tool-call audit rows).
- **Conversation retention**: Agent policy → "Keep conversations for" (30 / 90 / 180 / 365 days; `agent_policies.retention_days`, clamped 30..2190). `agent_retention_purge` (now daily 04:15 UTC) deletes expired runs without approvals / executed external actions and scrubs the content (goal, answers, step and tool outputs) of runs kept as audit evidence; legal holds stop both.
