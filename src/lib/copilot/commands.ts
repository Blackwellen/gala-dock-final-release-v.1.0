// Gala Dock — Copilot slash-command registry (the "assembly language").
//
// The Copilot brain compiles natural language into one or more of these structured commands,
// which the Execution Router dispatches to deterministic backend handlers (server actions /
// Supabase RPCs / navigation). Every command declares its execution kind, risk and the minimum
// permission/plan so the Permission Gatekeeper can gate it BEFORE execution.
//
// This registry is the catalogue; handler wiring + the brain/router are built in phases
// (see docs/specs/COPILOT_ARCHITECTURE.md). Pure data — safe on client (palette) + server.

import type { PlanGate } from "@/lib/flags/registry";

/** How the Execution Router runs a command. */
export type ExecutionKind = "read" | "mutate" | "navigate" | "ai" | "external";

/** Risk drives the approval requirement (see permission levels). */
export type CommandRisk = "low" | "medium" | "high" | "critical";

export type WorkspaceRole = "owner" | "admin" | "manager" | "member" | "viewer";

export interface CommandArg {
  name: string;
  type: "string" | "number" | "id" | "enum" | "date" | "money" | "boolean";
  required?: boolean;
  /** For enum args. */
  options?: string[];
  description?: string;
}

export interface SlashCommand {
  /** Slash name, e.g. "create-event" → /create-event. */
  id: string;
  label: string;
  description: string;
  category: "Events" | "Suppliers" | "Tasks" | "Finance" | "Pipeline" | "Navigate" | "Insights" | "Comms";
  kind: ExecutionKind;
  risk: CommandRisk;
  args: CommandArg[];
  /** Minimum workspace roles allowed to run it. */
  roles: WorkspaceRole[];
  /** Minimum plan, if gated. */
  planGate?: PlanGate;
  /** Whether a result mutating records requires explicit human confirmation. */
  requiresApproval?: boolean;
}

const ALL: WorkspaceRole[] = ["owner", "admin", "manager", "member", "viewer"];
const STAFF: WorkspaceRole[] = ["owner", "admin", "manager", "member"];
const LEAD: WorkspaceRole[] = ["owner", "admin", "manager"];

export const SLASH_COMMANDS: SlashCommand[] = [
  // ── Events ──────────────────────────────────────────────
  { id: "create-event", label: "Create event", description: "Start a new event from a brief.", category: "Events", kind: "mutate", risk: "medium", roles: STAFF, requiresApproval: true,
    args: [{ name: "name", type: "string", required: true }, { name: "date", type: "date" }, { name: "venue", type: "string" }, { name: "client", type: "string" }] },
  { id: "analyse-event", label: "Analyse event", description: "Summarise an event's status, risks and next actions.", category: "Insights", kind: "ai", risk: "low", roles: ALL, planGate: "business",
    args: [{ name: "event", type: "id", required: true }, { name: "include", type: "string", description: "suppliers,tasks,finance,run-sheet" }] },
  { id: "event-run-sheet", label: "Draft run sheet", description: "Draft a run-sheet timeline from the event brief.", category: "Events", kind: "ai", risk: "low", roles: STAFF, planGate: "business",
    args: [{ name: "event", type: "id", required: true }] },
  { id: "log-incident", label: "Log incident", description: "Log an on-day incident (medical/security/complaint/etc.).", category: "Events", kind: "mutate", risk: "medium", roles: STAFF,
    args: [{ name: "event", type: "id", required: true }, { name: "title", type: "string", required: true }, { name: "severity", type: "enum", options: ["low", "medium", "high", "critical"] }, { name: "category", type: "string" }] },
  { id: "event-lineup", label: "Event line-up", description: "Show the multi-room set times and flag clashes.", category: "Insights", kind: "read", risk: "low", roles: ALL,
    args: [{ name: "event", type: "id", required: true }] },
  { id: "event-risks", label: "Event risks", description: "List risks, or build a risk register from the event type.", category: "Insights", kind: "mutate", risk: "low", roles: STAFF,
    args: [{ name: "event", type: "id", required: true }] },
  { id: "event-capacity", label: "Capacity check", description: "Occupancy, oversell and staff/security-ratio warnings.", category: "Insights", kind: "read", risk: "low", roles: ALL,
    args: [{ name: "event", type: "id", required: true }] },
  { id: "event-settlement", label: "Settlement statement", description: "Post-event reconciliation: revenue, costs, deposits, splits, net.", category: "Finance", kind: "read", risk: "low", roles: LEAD, planGate: "pro",
    args: [{ name: "event", type: "id", required: true }] },

  // ── Suppliers ───────────────────────────────────────────
  { id: "find-suppliers", label: "Find suppliers", description: "Find suppliers by category, rating and availability.", category: "Suppliers", kind: "read", risk: "low", roles: ALL,
    args: [{ name: "category", type: "string" }, { name: "date", type: "date" }, { name: "minRating", type: "number" }] },
  { id: "request-quote", label: "Request quote (RFQ)", description: "Send an RFQ to selected suppliers.", category: "Suppliers", kind: "mutate", risk: "medium", roles: STAFF, requiresApproval: true,
    args: [{ name: "event", type: "id", required: true }, { name: "suppliers", type: "string", required: true }, { name: "category", type: "string" }] },
  { id: "chase-supplier", label: "Chase supplier", description: "Draft a chase message to suppliers who haven't responded.", category: "Comms", kind: "ai", risk: "low", roles: STAFF,
    args: [{ name: "rfq", type: "id" }, { name: "supplier", type: "id" }] },

  // ── Tasks ───────────────────────────────────────────────
  { id: "create-task", label: "Create task", description: "Create a task, optionally linked to an event.", category: "Tasks", kind: "mutate", risk: "low", roles: STAFF,
    args: [{ name: "title", type: "string", required: true }, { name: "event", type: "id" }, { name: "due", type: "date" }, { name: "assignee", type: "id" }] },
  { id: "overdue", label: "What's overdue?", description: "List overdue tasks and at-risk events.", category: "Insights", kind: "read", risk: "low", roles: ALL,
    args: [{ name: "event", type: "id" }] },

  // ── Finance ─────────────────────────────────────────────
  { id: "draft-quote", label: "Draft quote", description: "Draft a client quote from event line items.", category: "Finance", kind: "ai", risk: "low", roles: LEAD, planGate: "pro", requiresApproval: true,
    args: [{ name: "event", type: "id", required: true }] },
  { id: "create-invoice", label: "Create invoice", description: "Create an invoice from a quote or event.", category: "Finance", kind: "mutate", risk: "high", roles: LEAD, requiresApproval: true,
    args: [{ name: "event", type: "id" }, { name: "quote", type: "id" }] },
  { id: "event-pnl", label: "Event P&L", description: "Show real-time profit/margin for an event.", category: "Insights", kind: "read", risk: "low", roles: LEAD, planGate: "pro",
    args: [{ name: "event", type: "id", required: true }] },

  // ── Pipeline ────────────────────────────────────────────
  { id: "create-lead", label: "Create lead", description: "Log a new enquiry in the pipeline.", category: "Pipeline", kind: "mutate", risk: "low", roles: STAFF,
    args: [{ name: "client", type: "string", required: true }, { name: "eventType", type: "string" }, { name: "date", type: "date" }, { name: "budget", type: "money" }] },
  { id: "draft-proposal", label: "Draft proposal", description: "Generate a proposal draft from event/lead data.", category: "Pipeline", kind: "ai", risk: "medium", roles: LEAD, planGate: "business", requiresApproval: true,
    args: [{ name: "lead", type: "id" }, { name: "event", type: "id" }] },

  // ── Comms ───────────────────────────────────────────────
  { id: "draft-email", label: "Draft email", description: "Draft an email to a client or supplier (review before send).", category: "Comms", kind: "ai", risk: "low", roles: STAFF, requiresApproval: true,
    args: [{ name: "to", type: "string", required: true }, { name: "about", type: "string", required: true }, { name: "event", type: "id" }] },

  // ── Insights ────────────────────────────────────────────
  { id: "plan", label: "Plan a goal", description: "Turn a goal into a runnable plan of commands.", category: "Insights", kind: "ai", risk: "low", roles: STAFF, planGate: "business",
    args: [{ name: "goal", type: "string", required: true }] },

  // ── Navigate ────────────────────────────────────────────
  { id: "go", label: "Go to…", description: "Navigate to a section or record, optionally with filters.", category: "Navigate", kind: "navigate", risk: "low", roles: ALL,
    args: [{ name: "target", type: "string", required: true, description: "events|suppliers|finance|calendar|<record>" }, { name: "filter", type: "string" }] },
];

export const SLASH_BY_ID: Record<string, SlashCommand> = Object.fromEntries(
  SLASH_COMMANDS.map((c) => [c.id, c])
);

export function searchCommands(query: string): SlashCommand[] {
  const q = query.replace(/^\//, "").toLowerCase().trim();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (c) => c.id.includes(q) || c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
  );
}
