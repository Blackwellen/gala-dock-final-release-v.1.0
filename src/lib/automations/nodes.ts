// Gala Dock — Automations node registry (V1-3 Phase 1).
//
// The catalogue the canvas/DAG builder and recipe compiler draw from. Adapted from the AGENTS.md
// node catalogue to the event domain. Pure typed data (safe on client palette + server). Each node
// declares its kind, risk, gating and safety (auto-run blocking / approval-required) so the
// executor and Permission Gatekeeper enforce them. See docs/specs/AUTOMATIONS_ARCHITECTURE.md.

import type { PlanGate } from "@/lib/flags/registry";

export type NodeKind =
  | "trigger" | "condition" | "branch" | "delay" | "lookup" | "ai" | "action"
  | "comm" | "payment" | "approval" | "legal" | "integration" | "webhook"
  | "utility" | "error" | "end";

export type NodeRisk = "low" | "medium" | "high" | "critical";

export interface AutomationNode {
  id: string;
  label: string;
  kind: NodeKind;
  category: string;
  risk: NodeRisk;
  planGate?: PlanGate;
  /** Cannot run automatically — must be triggered by an explicit human action. */
  autoRunBlocked?: boolean;
  /** Requires a human approval node before execution. */
  approvalRequired?: boolean;
  description?: string;
}

function n(
  id: string, label: string, kind: NodeKind, category: string, risk: NodeRisk,
  extra: Partial<AutomationNode> = {}
): AutomationNode {
  return { id, label, kind, category, risk, ...extra };
}

export const AUTOMATION_NODES: AutomationNode[] = [
  // ── Triggers ────────────────────────────────────────────
  n("record.created", "Record Created", "trigger", "Triggers", "low"),
  n("record.updated", "Record Updated", "trigger", "Triggers", "low"),
  n("record.deleted", "Record Deleted", "trigger", "Triggers", "low"),
  n("field.changed", "Field Changed", "trigger", "Triggers", "low"),
  n("event.created", "Event Created", "trigger", "Triggers", "low"),
  n("event.confirmed", "Event Confirmed", "trigger", "Triggers", "low"),
  n("event.date_approaching", "Event Date Approaching", "trigger", "Triggers", "low"),
  n("booking.confirmed", "Booking Confirmed", "trigger", "Triggers", "low"),
  n("booking.cancelled", "Booking Cancelled", "trigger", "Triggers", "low"),
  n("checkin.due", "Check-in Due", "trigger", "Triggers", "low"),
  n("task.created", "Task Created", "trigger", "Triggers", "low"),
  n("task.overdue", "Task Overdue", "trigger", "Triggers", "low"),
  n("supplier.job_assigned", "Supplier Job Assigned", "trigger", "Triggers", "low"),
  n("supplier.job_completed", "Supplier Job Completed", "trigger", "Triggers", "low"),
  n("supplier.evidence_uploaded", "Supplier Evidence Uploaded", "trigger", "Triggers", "low"),
  n("supplier.doc_expiring", "Supplier Doc / Insurance Expiring", "trigger", "Triggers", "low"),
  n("rfq.response_received", "RFQ Response Received", "trigger", "Triggers", "low"),
  n("invoice.overdue", "Invoice Overdue", "trigger", "Triggers", "low"),
  n("payment.received", "Payment Received", "trigger", "Triggers", "low"),
  n("lead.created", "Lead Created", "trigger", "Triggers", "low"),
  n("proposal.accepted", "Proposal Accepted", "trigger", "Triggers", "low"),
  n("ticket.sold", "Ticket Sold", "trigger", "Triggers", "low"),
  n("ai.signal_detected", "AI Signal Detected", "trigger", "Triggers", "medium", { planGate: "business" }),
  n("schedule.daily", "Daily Schedule", "trigger", "Triggers", "low"),
  n("schedule.cron", "Custom Cron", "trigger", "Triggers", "low"),

  // ── Conditions ──────────────────────────────────────────
  n("condition.if_else", "If / Else", "condition", "Conditions", "low"),
  n("condition.field_compare", "Compare Fields", "condition", "Conditions", "low"),
  n("condition.entity_state", "Entity In State", "condition", "Conditions", "low"),
  n("condition.plan_allows", "If Plan Allows", "condition", "Conditions", "low"),
  n("condition.within_caps", "If Within Safety Caps", "condition", "Conditions", "low"),
  n("condition.business_context", "Business Context Match", "condition", "Conditions", "low"),
  n("condition.payment_release_allowed", "If Payment Release Allowed", "condition", "Conditions", "medium"),

  // ── Branch / Router ─────────────────────────────────────
  n("branch.match_country", "Match Country", "branch", "Branch", "low"),
  n("branch.switch", "Switch / Router", "branch", "Branch", "low"),
  n("branch.split_parallel", "Split (Parallel)", "branch", "Branch", "low"),

  // ── Delay / Time ────────────────────────────────────────
  n("delay.fixed", "Wait (Fixed)", "delay", "Delay", "low"),
  n("delay.until_date", "Wait Until Date", "delay", "Delay", "low"),
  n("delay.business_hours", "Delay For Business Hours", "delay", "Delay", "low"),

  // ── Lookup ──────────────────────────────────────────────
  n("lookup.record", "Get Record", "lookup", "Lookup", "low"),
  n("lookup.preferred_suppliers", "Get Preferred Suppliers", "lookup", "Lookup", "low"),
  n("lookup.account_balance", "Get Account Balance", "lookup", "Lookup", "low"),

  // ── AI (approval-required) ──────────────────────────────
  n("ai.generate_summary", "AI Generate Summary", "ai", "AI", "low", { planGate: "business", approvalRequired: true }),
  n("ai.draft_message", "AI Draft Message", "ai", "AI", "low", { planGate: "business", approvalRequired: true }),
  n("ai.classify", "AI Classify", "ai", "AI", "low", { planGate: "business", approvalRequired: true }),
  n("ai.risk_score", "AI Risk Score", "ai", "AI", "low", { planGate: "business", approvalRequired: true }),
  n("ai.guardrail_check", "AI Guardrail Check", "ai", "AI", "low", { planGate: "business", approvalRequired: true }),

  // ── Actions ─────────────────────────────────────────────
  n("action.create_task", "Create Task", "action", "Action", "low"),
  n("action.update_record", "Update Record Field", "action", "Action", "medium"),
  n("action.add_note", "Add Note", "action", "Action", "low"),
  n("action.create_reminder", "Create Calendar Reminder", "action", "Action", "low"),
  n("action.create_setup_task", "Create Setup / Turnaround Task", "action", "Action", "low"),
  n("action.request_supplier_evidence", "Request Supplier Evidence", "action", "Action", "medium"),
  n("action.assign_supplier", "Assign Supplier", "action", "Action", "medium"),
  n("action.create_invoice_draft", "Create Invoice Draft", "action", "Action", "medium", { approvalRequired: true }),
  n("action.record_supplier_doc", "Record Supplier Document Check", "action", "Action", "low"),

  // ── Communication ───────────────────────────────────────
  n("comm.internal_notification", "Send Internal Notification", "comm", "Communication", "low"),
  n("comm.external_message_draft", "Create External Message Draft", "comm", "Communication", "low", { approvalRequired: true }),
  n("comm.email_draft", "Create Email Draft", "comm", "Communication", "low", { approvalRequired: true }),

  // ── Payment (blocked from auto-run) ─────────────────────
  n("payment.release_payout", "Release Payout After Approval", "payment", "Payment", "critical", { autoRunBlocked: true, approvalRequired: true }),
  n("payment.issue_refund", "Issue Refund After Approval", "payment", "Payment", "critical", { autoRunBlocked: true, approvalRequired: true }),
  n("payment.capture", "Capture Payment After Approval", "payment", "Payment", "critical", { autoRunBlocked: true, approvalRequired: true }),

  // ── Approval ────────────────────────────────────────────
  n("approval.request_human", "Request Human Approval", "approval", "Approval", "low"),
  n("approval.request_finance_signoff", "Request Finance Sign-off", "approval", "Approval", "medium"),

  // ── Integration ─────────────────────────────────────────
  n("integration.stripe_connect", "Stripe Connect", "integration", "Integration", "high", { autoRunBlocked: true }),
  n("integration.accounting_sync", "Accounting Sync", "integration", "Integration", "medium"),

  // ── Webhook / API ───────────────────────────────────────
  n("webhook.incoming", "Incoming Webhook", "webhook", "Webhook", "medium"),
  n("webhook.outgoing", "Outgoing Webhook", "webhook", "Webhook", "medium"),

  // ── Utility ─────────────────────────────────────────────
  n("utility.redact_sensitive", "Redact Sensitive Data", "utility", "Utility", "low"),
  n("utility.set_variable", "Set Variable", "utility", "Utility", "low"),
  n("utility.format_text", "Format Text", "utility", "Utility", "low"),

  // ── Error handling ──────────────────────────────────────
  n("error.retry_backoff", "Retry With Backoff", "error", "Error Handling", "low"),
  n("error.pause_after_threshold", "Pause After Threshold", "error", "Error Handling", "low"),
  n("error.fallback_path", "Fallback Path", "error", "Error Handling", "low"),

  // ── End / Terminal ──────────────────────────────────────
  n("end.success", "End Success", "end", "End", "low"),
  n("end.waiting_approval", "End Waiting Approval", "end", "End", "low"),
  n("end.stopped", "End Stopped", "end", "End", "low"),
];

export const NODES_BY_ID: Record<string, AutomationNode> = Object.fromEntries(
  AUTOMATION_NODES.map((nd) => [nd.id, nd])
);

export const TRIGGER_NODES = AUTOMATION_NODES.filter((nd) => nd.kind === "trigger");
export const ACTION_NODES = AUTOMATION_NODES.filter((nd) =>
  ["action", "comm", "payment", "ai", "integration", "webhook"].includes(nd.kind)
);

export function nodesByCategory(): Record<string, AutomationNode[]> {
  const out: Record<string, AutomationNode[]> = {};
  for (const nd of AUTOMATION_NODES) (out[nd.category] ??= []).push(nd);
  return out;
}

/** Nodes that can never run without explicit human action (safety hard-blocks). */
export const AUTO_RUN_BLOCKED = AUTOMATION_NODES.filter((nd) => nd.autoRunBlocked).map((nd) => nd.id);
