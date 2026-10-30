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
