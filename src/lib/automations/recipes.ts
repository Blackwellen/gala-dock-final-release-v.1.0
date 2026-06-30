// Gala Dock — Automation recipe templates (V1-3). Curated, event-domain, install as
// DISABLED review-first drafts. Each compiles to a trigger + condition(s) + action(s) from
// the node registry (src/lib/automations/nodes.ts). Grouped by section. Target: expand toward
// 50–150. See docs/specs/AUTOMATIONS_ARCHITECTURE.md.

import type { PlanGate } from "@/lib/flags/registry";

export interface RecipeTemplate {
  id: string;
  name: string;
  description: string;
  group: "Events" | "Suppliers" | "Tasks" | "Finance" | "Pipeline" | "Tickets" | "Documents" | "Notifications";
  trigger: string; // node id
  actions: string[]; // node ids
  risk: "low" | "medium" | "high";
  planGate?: PlanGate;
}

export const RECIPES: RecipeTemplate[] = [
  // Events
  { id: "event-confirmed-onboarding", name: "Event confirmed → onboarding checklist", description: "When an event is confirmed, create the standard delivery checklist.", group: "Events", trigger: "event.confirmed", actions: ["action.create_task"], risk: "low" },
  { id: "event-approaching-prep", name: "Event date approaching → prep tasks", description: "7 days before, create final-prep tasks and remind the team.", group: "Events", trigger: "event.date_approaching", actions: ["action.create_task", "comm.internal_notification"], risk: "low" },
  { id: "checkin-due-turnaround", name: "Check-in due → turnaround task", description: "Create a setup/turnaround task when check-in is due.", group: "Events", trigger: "checkin.due", actions: ["action.create_setup_task"], risk: "low" },

  // Suppliers
  { id: "supplier-doc-expiring", name: "Supplier doc expiring → request renewal", description: "Ask the supplier to re-upload an expiring document or insurance.", group: "Suppliers", trigger: "supplier.doc_expiring", actions: ["action.request_supplier_evidence", "comm.internal_notification"], risk: "low" },
  { id: "job-complete-evidence", name: "Job complete → request evidence", description: "When a supplier marks a job complete, request photos/evidence.", group: "Suppliers", trigger: "supplier.job_completed", actions: ["action.request_supplier_evidence"], risk: "low" },
  { id: "rfq-response-review", name: "RFQ response → review task", description: "Create a review task when a supplier responds to an RFQ.", group: "Suppliers", trigger: "rfq.response_received", actions: ["action.create_task"], risk: "low" },

  // Tasks
  { id: "task-overdue-escalate", name: "Task overdue → escalate", description: "Notify the owner and flag the event when a task goes overdue.", group: "Tasks", trigger: "task.overdue", actions: ["comm.internal_notification"], risk: "low" },

  // Finance
  { id: "invoice-overdue-chase", name: "Invoice overdue → draft chase", description: "Draft a polite payment-chase email (review before sending).", group: "Finance", trigger: "invoice.overdue", actions: ["comm.email_draft"], risk: "low", planGate: "business" },
  { id: "payment-received-receipt", name: "Payment received → receipt + note", description: "Add a note and draft a receipt confirmation.", group: "Finance", trigger: "payment.received", actions: ["action.add_note", "comm.email_draft"], risk: "low" },

  // Pipeline
  { id: "lead-created-followup", name: "New lead → follow-up task", description: "Create a same-day follow-up task for every new enquiry.", group: "Pipeline", trigger: "lead.created", actions: ["action.create_task"], risk: "low" },
  { id: "proposal-accepted-setup", name: "Proposal accepted → start event setup", description: "When a proposal is accepted, kick off event onboarding tasks.", group: "Pipeline", trigger: "proposal.accepted", actions: ["action.create_task", "comm.internal_notification"], risk: "low" },

  // Tickets
  { id: "ticket-sold-thanks", name: "Ticket sold → thank-you draft", description: "Draft a thank-you/confirmation message for new ticket buyers.", group: "Tickets", trigger: "ticket.sold", actions: ["comm.email_draft"], risk: "low", planGate: "business" },

  // Documents
  { id: "ai-signal-risk", name: "AI signal → risk review", description: "When the AI flags a delivery risk, create a review task for the lead.", group: "Documents", trigger: "ai.signal_detected", actions: ["ai.risk_score", "action.create_task"], risk: "medium", planGate: "business" },

  // Notifications
  { id: "daily-ops-digest", name: "Daily ops digest", description: "Each morning, send the team a digest of today's events and overdue items.", group: "Notifications", trigger: "schedule.daily", actions: ["comm.internal_notification"], risk: "low" },
];

export const RECIPES_BY_GROUP = (): Record<string, RecipeTemplate[]> => {
  const out: Record<string, RecipeTemplate[]> = {};
  for (const r of RECIPES) (out[r.group] ??= []).push(r);
  return out;
};
