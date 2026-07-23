// Gala Dock — Automation recipe templates (V1-3). Curated, event-domain, install as
// DISABLED review-first drafts. Each compiles to a trigger + condition(s) + action(s) from
// the node registry (src/lib/automations/nodes.ts). Grouped by section. Target: expand toward
// 50–150. See docs/specs/AUTOMATIONS_ARCHITECTURE.md.

import type { PlanGate } from "@/lib/flags/registry";
import type { Database } from "@/lib/supabase/types";

type LiveTrigger = Database["public"]["Enums"]["smart_rule_trigger"];
type LiveAction = Database["public"]["Enums"]["smart_rule_action"];

export interface RecipeTemplate {
  id: string;
  name: string;
  description: string;
  group: "Events" | "Suppliers" | "Tasks" | "Finance" | "Pipeline" | "Tickets" | "Documents" | "Notifications";
  trigger: string; // node id (aspirational canvas catalogue)
  actions: string[]; // node ids (aspirational canvas catalogue)
  risk: "low" | "medium" | "high";
  planGate?: PlanGate;
  /** The real smart_rules enum values this recipe compiles to when "Use recipe" is clicked. */
  liveTrigger: LiveTrigger;
  liveAction: LiveAction;
  icon: string; // lucide icon name, resolved by the Recipes UI
  complexity: "easy" | "medium" | "advanced";
}

export const RECIPES: RecipeTemplate[] = [
  // Events
  { id: "event-confirmed-onboarding", name: "Event confirmed → onboarding checklist", description: "Automatically create and assign onboarding checklist when an event is confirmed.", group: "Events", trigger: "event.confirmed", actions: ["action.create_task"], risk: "low", liveTrigger: "event_stage_changed", liveAction: "create_task", icon: "CalendarCheck", complexity: "easy" },
  { id: "event-approaching-prep", name: "Event date approaching → prep tasks", description: "7 days before, create final-prep tasks and remind the team.", group: "Events", trigger: "event.date_approaching", actions: ["action.create_task", "comm.internal_notification"], risk: "low", liveTrigger: "event_stage_changed", liveAction: "create_task", icon: "CalendarClock", complexity: "easy" },
  { id: "checkin-due-reminder", name: "Check-in due → reminder message", description: "Send a reminder before check-in is due.", group: "Events", trigger: "checkin.due", actions: ["action.create_setup_task"], risk: "low", liveTrigger: "task_due_in", liveAction: "send_email", icon: "BellRing", complexity: "easy" },
  { id: "post-event-feedback-request", name: "Post-event → feedback request", description: "Collect feedback after an event is completed.", group: "Events", trigger: "event.completed", actions: ["comm.email_draft"], risk: "low", liveTrigger: "event_stage_changed", liveAction: "send_email", icon: "MessageSquareHeart", complexity: "easy" },
  { id: "event-cancelled-notify-suppliers", name: "Event cancelled → notify suppliers", description: "Notify all assigned suppliers when an event is cancelled.", group: "Events", trigger: "event.cancelled", actions: ["comm.internal_notification"], risk: "medium", liveTrigger: "event_stage_changed", liveAction: "notify_user", icon: "CalendarX", complexity: "medium" },

  // Suppliers
  { id: "supplier-doc-expiring-renewal", name: "Supplier doc expiring → request renewal", description: "Ask the supplier to re-upload expiring onboarding documents.", group: "Suppliers", trigger: "supplier.doc_expiring", actions: ["action.request_supplier_evidence", "comm.internal_notification"], risk: "low", liveTrigger: "file_uploaded", liveAction: "send_email", icon: "ShieldCheck", complexity: "easy" },
  { id: "job-complete-evidence", name: "Job complete → request evidence", description: "When a supplier marks a job complete, request photos/evidence.", group: "Suppliers", trigger: "supplier.job_completed", actions: ["action.request_supplier_evidence"], risk: "low", liveTrigger: "supplier_no_reply", liveAction: "send_email", icon: "Camera", complexity: "easy" },
  { id: "rfq-response-review", name: "RFQ response → review task", description: "Create a review task when a supplier responds to an RFQ.", group: "Suppliers", trigger: "rfq.response_received", actions: ["action.create_task"], risk: "low", liveTrigger: "quote_unread_after", liveAction: "create_task", icon: "FileSearch", complexity: "easy" },

  // Tasks
  { id: "task-overdue-escalate", name: "Task overdue → escalate", description: "Notify owner and flag the task when it goes overdue.", group: "Tasks", trigger: "task.overdue", actions: ["comm.internal_notification"], risk: "low", liveTrigger: "task_due_in", liveAction: "notify_user", icon: "AlarmClockOff", complexity: "medium" },
  { id: "inspection-due-schedule-task", name: "Inspection due → schedule task", description: "Schedule an inspection task ahead of the due date.", group: "Tasks", trigger: "task.due_in", actions: ["action.create_task"], risk: "medium", liveTrigger: "task_due_in", liveAction: "create_task", icon: "ClipboardCheck", complexity: "medium" },

  // Finance
  { id: "invoice-overdue-draft-chase", name: "Invoice overdue → draft chase", description: "Draft and send a polite payment reminder before escalating.", group: "Finance", trigger: "invoice.overdue", actions: ["comm.email_draft"], risk: "medium", planGate: "business", liveTrigger: "invoice_overdue", liveAction: "send_email", icon: "ReceiptText", complexity: "medium" },
  { id: "payment-received-receipt", name: "Payment received → receipt + note", description: "Add a note and draft a receipt confirmation.", group: "Finance", trigger: "payment.received", actions: ["action.add_note", "comm.email_draft"], risk: "low", liveTrigger: "invoice_overdue", liveAction: "send_email", icon: "BadgePoundSterling", complexity: "easy" },
  { id: "deposit-overdue-escalate", name: "Deposit overdue → escalate finance task", description: "Escalate a finance follow-up task when a venue deposit is overdue.", group: "Finance", trigger: "invoice.overdue", actions: ["action.create_task"], risk: "medium", liveTrigger: "invoice_overdue", liveAction: "create_task", icon: "AlertTriangle", complexity: "medium" },

  // Pipeline
  { id: "lead-created-followup", name: "New lead → follow-up task", description: "Create a same-day follow-up task for every new enquiry.", group: "Pipeline", trigger: "lead.created", actions: ["action.create_task"], risk: "low", liveTrigger: "task_due_in", liveAction: "create_task", icon: "UserPlus", complexity: "easy" },
  { id: "proposal-accepted-setup", name: "Proposal accepted → start event setup", description: "When a proposal is accepted, kick off event onboarding tasks.", group: "Pipeline", trigger: "proposal.accepted", actions: ["action.create_task", "comm.internal_notification"], risk: "low", liveTrigger: "event_stage_changed", liveAction: "create_task", icon: "FileCheck2", complexity: "easy" },

  // Tickets
  { id: "ticket-sales-threshold-alert", name: "Ticket sales threshold → alert manager", description: "Alert the event manager when ticket sales fall below forecast.", group: "Tickets", trigger: "ticket.threshold", actions: ["comm.internal_notification"], risk: "medium", planGate: "business", liveTrigger: "nightly_cron", liveAction: "notify_user", icon: "TicketX", complexity: "medium" },
  { id: "ticket-sold-thanks", name: "Ticket sold → thank-you draft", description: "Draft a thank-you/confirmation message for new ticket buyers.", group: "Tickets", trigger: "ticket.sold", actions: ["comm.email_draft"], risk: "low", planGate: "business", liveTrigger: "nightly_cron", liveAction: "send_email", icon: "Ticket", complexity: "easy" },

  // Documents
  { id: "run-sheet-updated-notify", name: "Run sheet updated → notify production team", description: "Notify production staff whenever the run sheet changes.", group: "Documents", trigger: "runsheet.updated", actions: ["comm.internal_notification"], risk: "low", liveTrigger: "event_stage_changed", liveAction: "notify_user", icon: "FileClock", complexity: "easy" },
  { id: "ai-signal-risk", name: "AI signal → risk review", description: "When the AI flags a delivery risk, create a review task for the lead.", group: "Documents", trigger: "ai.signal_detected", actions: ["ai.risk_score", "action.create_task"], risk: "medium", planGate: "business", liveTrigger: "nightly_cron", liveAction: "create_task", icon: "Sparkles", complexity: "advanced" },
  { id: "compliance-overdue-notify-flag", name: "Compliance overdue → notify + flag", description: "Notify compliance owner and flag the record when a check fails.", group: "Documents", trigger: "compliance.failed", actions: ["comm.internal_notification"], risk: "medium", liveTrigger: "file_uploaded", liveAction: "notify_user", icon: "ShieldAlert", complexity: "medium" },

  // Notifications
  { id: "daily-ops-digest", name: "Daily ops digest", description: "Each morning, send the team a digest of today's events and overdue items.", group: "Notifications", trigger: "schedule.daily", actions: ["comm.internal_notification"], risk: "low", liveTrigger: "nightly_cron", liveAction: "notify_user", icon: "Newspaper", complexity: "easy" },
];

export const RECIPES_BY_GROUP = (): Record<string, RecipeTemplate[]> => {
  const out: Record<string, RecipeTemplate[]> = {};
  for (const r of RECIPES) (out[r.group] ??= []).push(r);
  return out;
};

export const RECIPES_BY_ID: Record<string, RecipeTemplate> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
