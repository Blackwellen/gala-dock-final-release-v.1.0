# Gala Dock Copilot — Agent-OS Architecture (V1-2, enterprise depth)

Adapted from the Propvora Copilot agent-OS model to Gala Dock's **event domain**. Copilot is not a
chatbot or a RAG layer — it is an **intelligent orchestration + reasoning layer that sits ABOVE the
existing slash commands** and can generate, chain and execute them across full workspace context.

UI: **one Copilot section with a tab switch between Inbox and Copilot.** Copilot has **chat + slash
commands**; slash commands perform **real actions**. Provider: **NVIDIA NIM** (GDPR-safe, verified
working) via `src/lib/ai/provider.ts`. Storage: **R2**. System of record: **Supabase**.

---

## 1. Layer stack
```
UI Execution Layer      Chat bubble · Inbox/Copilot tabs · slash palette · form overlay · nav controller
        ↓
Agent Orchestrator      Planner · Executor · Tool Router · Context Resolver · Permission Gatekeeper · Memory Injector
        ↓
Knowledge Layer         Event graph (events, suppliers, tasks, venues, finance, docs) · Document intelligence
        ↓
Data Layer              Supabase (truth + RLS) · R2 (files) · RPCs/server actions (execution) · realtime (events)
        ↓
External Layer (MCP)    email · calendars · maps · accounting · web/market data  (adapters only — never core logic)
```

## 2. Copilot Brain (the only genuinely new system) — 5 jobs
1. **Intent expansion** — "find the cheapest available DJ for the 12th" → a plan of slash commands.
2. **Context expansion** — builds a context-graph snapshot (current event + suppliers + tasks + finance + docs + history) so commands are **not blind**.
3. **Command compiler** — natural language → structured execution plan → slash commands / Supabase reads / R2 reads / MCP calls.
4. **Execution router** — routes each step: read→Supabase, mutate→server action/slash, complex→edge fn, external→MCP, UI→navigation agent.
5. **Memory injector** — injects past decisions, user prefs, workspace rules, prior runs before execution.

## 3. Full execution loop (every message)
`Interpret intent → expand context graph → build plan DAG → decide (slash/query/R2/MCP/automation) → inject memory → execute (permission-gated) → log everything → update memory → return structured + UI output.`

## 4. Slash commands = the "assembly language" (built: `src/lib/copilot/commands.ts`)
Existing system stays; Copilot **enhances** it:
- **Context injection** — every command carries an implicit `/context` payload (current event + workspace + intent history).
- **Command augmentation** — Copilot upgrades a command before execution (`/analyse-event id` → `… include:suppliers,tasks,finance,run-sheet`).
- **Queue/DAG awareness** — sequential · parallel · dependent-DAG · conditional execution.
- Each command declares `kind` (read/mutate/navigate/ai/external), `risk`, `roles`, `planGate`, `requiresApproval`.

## 5. Agents
Planner · Executor · Data Agent (Supabase joins) · Document Agent (R2 OCR/extract) · Web/Market Agent (MCP) ·
Navigation Agent (UI state manipulation — open page, apply filters, highlight, scroll, preload) · Automation Agent (builds workflows).

## 6. Context engine (graph traversal over Supabase)
Local (current record) · Subtree (event→suppliers→quotes) · Sibling (other events) · Workspace (all) · External (market/web).
Pipeline: intent → entity resolution → context expansion → graph traversal → relevance scoring → token-budget trim.

## 7. Memory (Supabase) — chat · entity · workspace · user · agent-run. Actions are **not stateless**.

## 8. Permissions & risk (Gatekeeper) — levels 0 Read → 1 Suggest → 2 Draft → 3 Assist → 4 Supervised → 5 Autonomous → 6 Admin.
Every action passes: role check → workspace policy → entity sensitivity → cost threshold → audit log.
Risk: LOW (read) · MEDIUM (edit) · HIGH (send/delete/payment) · CRITICAL (bulk). HIGH/CRITICAL always need human confirm.

## 9. Credit system — **per execution type, not per feature** (a single request may run 8 queries + 5 doc reads + 2 APIs + 3 commands):
Query (Supabase) · File (R2/OCR) · Agent (reasoning loops) · External (MCP/web) · Action (emails/updates/bulk).
Each AgentRun records `compute_cost · data_cost · external_cost · action_cost`. Maps onto existing `ai_budgets`/`ai_usage_ledger`.

## 10. Form-aware Copilot — live UI-state injection. `useFormObserver()` streams field values + validation + linked entity;
Copilot suggests corrections, enriches fields (market data), validates against rules, optional auto-fill (logged + confirm).

## 11. MCP — external adapters ONLY (email, calendar, maps, accounting, web). NEVER for Supabase, graph, permissions, memory, slash commands.

## 12. Build phases (V1 build order)
| Phase | Scope | Status |
|------|-------|--------|
| 1 | Provider (NIM) + slash-command registry + Copilot/Inbox tab shell | provider+registry ✅, shell next |
| 2 | Chat + memory + basic tool execution (deterministic handlers for read/mutate commands) | chat fn ✅, handlers next |
| 3 | Context engine (event graph snapshot) + grounding | — |
| 4 | Slash-command queue (sequential/parallel/DAG) + execution router | — |
| 5 | Agent orchestration (planner/executor) | — |
| 6 | Permissions + credit metering (ai_budget_* wiring) | — |
| 7 | Document intelligence (R2 OCR/extract) | — |
| 8 | MCP adapter layer + automation handoff | — |

## 13. Mapping to existing Gala Dock assets
- Slash execution → existing server actions + `apply_*` / domain RPCs (deterministic backends).
- Metering → `ai_budgets`, `ai_usage_ledger`, `ai_drafts`, `ai_prompts`, `ai_audit` (already in schema).
- Storage/docs → R2 (keys present).
- Gating → flag `aiCopilot` (Scale/business) + entitlements layer.
- UI → replace the `GalaCopilot` bubble with the tabbed Inbox/Copilot panel + slash palette.

**V1-ready because** every layer maps to a Supabase table / server action / provider call; nothing is theoretical;
cost + permission boundaries are built in.
