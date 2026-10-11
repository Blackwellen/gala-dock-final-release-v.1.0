// Explicit state machines (master spec §114). Single source of truth for allowed transitions.
// `scripts/gen-foundation-sql.mjs` seeds the `state_transitions` table from these definitions and the
// database trigger `enforce_state_transition` validates every status change against it.
//
// Legacy states already present in production data are kept as valid states (marked in comments) so
// existing rows and code paths stay legal while callers migrate to the spec lifecycles.

export type Machine = {
  /** Table and column guarded by the database trigger. */
  table: string;
  column: string;
  /** enforce = reject illegal transitions; audit = allow but record a violation for review. */
  mode: "enforce" | "audit";
  initial: readonly string[];
  terminal: readonly string[];
  transitions: Readonly<Record<string, readonly string[]>>;
};

const BOOKING_TERMINAL = ["completed", "cancelled_by_customer", "cancelled_by_provider", "refunded", "expired_no_response", "declined", "unavailable"] as const;

export const machines = {
  /** Marketplace booking line (§33). Legacy: suggested, awaiting, held, quoted, sent, confirmed, fulfilled, declined, expired. */
  booking: {
    table: "build_items", column: "status", mode: "audit",
    initial: ["draft", "suggested", "enquiry_created", "requested", "hold", "standby"],
    terminal: [...BOOKING_TERMINAL],
    transitions: {
      draft: ["enquiry_created", "sent", "cancelled_by_customer"],
      suggested: ["requested", "hold", "draft", "enquiry_created", "sent", "awaiting", "cancelled_by_customer"],
      enquiry_created: ["sent", "cancelled_by_customer"],
      sent: ["requested", "hold", "available", "clarification", "standby", "cancelled", "awaiting_provider", "awaiting", "clarification_requested", "quote_received", "quoted", "conditional_hold_requested", "declined", "unavailable", "expired_no_response", "expired", "cancelled_by_customer"],
      awaiting: ["requested", "hold", "available", "clarification", "standby", "cancelled", "awaiting_provider", "quoted", "quote_received", "held", "declined", "unavailable", "expired", "expired_no_response", "cancelled_by_customer", "confirmed"],
      awaiting_provider: ["clarification_requested", "quote_received", "conditional_hold_requested", "declined", "unavailable", "expired_no_response", "cancelled_by_customer"],
      clarification_requested: ["awaiting_provider", "quote_received", "declined", "cancelled_by_customer"],
      quote_received: ["quote_revised", "customer_reviewing", "conditional_hold_requested", "awaiting_payment", "cancelled_by_customer", "expired_no_response"],
      quoted: ["requested", "hold", "available", "clarification", "standby", "cancelled", "quote_revised", "customer_reviewing", "held", "conditional_hold_requested", "awaiting_payment", "confirmed", "declined", "expired", "cancelled_by_customer"],
      quote_revised: ["customer_reviewing", "conditional_hold_requested", "awaiting_payment", "cancelled_by_customer"],
      customer_reviewing: ["quote_revised", "conditional_hold_requested", "awaiting_payment", "cancelled_by_customer", "expired_no_response"],
      conditional_hold_requested: ["conditionally_held", "declined", "unavailable", "cancelled_by_customer"],
      conditionally_held: ["awaiting_payment", "awaiting_confirmation", "confirmed", "expired", "cancelled_by_customer", "cancelled_by_provider"],
      held: ["available", "clarification", "standby", "cancelled", "awaiting_payment", "awaiting_confirmation", "confirmed", "expired", "cancelled_by_customer", "cancelled_by_provider"],
      standby_offered: ["standby_accepted", "expired", "declined"],
      standby_accepted: ["confirmed", "expired", "cancelled_by_customer"],
      awaiting_payment: ["awaiting_confirmation", "confirmed", "cancelled_by_customer", "expired"],
      awaiting_confirmation: ["confirmed", "declined", "cancelled_by_customer", "cancelled_by_provider"],
      confirmed: ["available", "clarification", "standby", "cancelled", "active", "fulfilled", "cancellation_requested", "cancelled_by_customer", "cancelled_by_provider", "replacement_required", "disputed"],
      active: ["fulfilled", "completion_pending", "cancellation_requested", "replacement_required", "disputed"],
      fulfilled: ["completion_pending", "completed", "disputed"],
      completion_pending: ["completed", "disputed"],
      cancellation_requested: ["cancelled_by_customer", "cancelled_by_provider", "confirmed", "disputed"],
      cancelled_by_customer: ["refunded", "partially_refunded"],
      cancelled_by_provider: ["refunded", "partially_refunded", "replacement_required"],
      replacement_required: ["cancelled_by_provider", "confirmed"],
      disputed: ["completed", "refunded", "partially_refunded"],
      partially_refunded: ["refunded", "completed"],
      expired: ["sent"],
      declined: [], unavailable: [], expired_no_response: ["sent"], completed: ["disputed"], refunded: [],
      // Legacy states used by current provider/customer flows.
      available: ["quoted", "held", "awaiting_payment", "confirmed", "declined", "expired", "cancelled", "cancelled_by_customer"],
      clarification: ["awaiting", "sent", "available", "quoted", "declined", "cancelled", "cancelled_by_customer"],
      standby: ["confirmed", "expired", "cancelled", "declined"],
      requested: ["available", "clarification", "quoted", "held", "hold", "standby", "confirmed", "declined", "expired", "cancelled", "cancelled_by_customer"],
      hold: ["held", "confirmed", "awaiting_payment", "expired", "cancelled", "cancelled_by_customer", "declined"],
      cancelled: ["refunded", "partially_refunded"],
    },
  },
  /** Provider-side booking record. Legacy: confirmed, active, completed, cancelled. */
  provider_job: {
    table: "provider_jobs", column: "status", mode: "audit",
    initial: ["confirmed", "awaiting_confirmation", "deposit_paid"],
    terminal: ["completed", "cancelled", "cancelled_by_customer", "cancelled_by_provider"],
    transitions: {
      awaiting_confirmation: ["confirmed", "cancelled_by_provider", "cancelled_by_customer"],
      confirmed: ["deposit_paid", "active", "completed", "cancelled", "cancelled_by_customer", "cancelled_by_provider", "disputed"],
      deposit_paid: ["active", "completed", "cancelled", "cancelled_by_customer", "cancelled_by_provider", "disputed"],
      active: ["completion_pending", "completed", "cancelled", "disputed"],
      completion_pending: ["completed", "disputed"],
      disputed: ["completed", "cancelled"],
      completed: ["disputed"], cancelled: [], cancelled_by_customer: [], cancelled_by_provider: [],
    },
  },
  quote: {
    table: "provider_quotes", column: "status", mode: "audit",
    initial: ["draft"], terminal: ["accepted", "declined", "superseded", "expired", "withdrawn"],
    transitions: {
      draft: ["sent", "withdrawn"],
      sent: ["accepted", "declined", "superseded", "expired", "withdrawn"],
      accepted: [], declined: [], superseded: [], expired: [], withdrawn: [],
    },
  },
  /** Ticket entitlement (§46–50). Transfer/resale invalidate the old entitlement and issue a new one. */
  ticket: {
    table: "tickets", column: "status", mode: "audit",
    initial: ["valid"], terminal: ["used", "refunded", "transferred", "resold", "void"],
    transitions: {
      valid: ["used", "refunded", "transferred", "resale_listed", "void"],
      resale_listed: ["valid", "resold", "void"],
      used: ["valid"], // re-entry policy may reset a scan; audited
      refunded: [], transferred: [], resold: [], void: [],
    },
  },
  /** Gala Agent run (§6). Owned by this phase: enforced. */
  agent_run: {
    table: "agent_runs", column: "status", mode: "enforce",
    initial: ["queued", "scheduled", "running"],
    terminal: ["completed", "failed", "cancelled"],
    transitions: {
      queued: ["planning", "running", "waiting_approval", "paused", "cancelled", "failed"],
      scheduled: ["queued", "running", "paused", "cancelled", "failed"],
      planning: ["awaiting_plan_confirmation", "running", "waiting_approval", "paused", "failed", "cancelled"],
      awaiting_plan_confirmation: ["running", "cancelled", "planning"],
      running: ["waiting_external", "waiting_approval", "scheduled_wait", "paused", "retrying", "partially_completed", "completed", "failed", "cancelled", "scheduled"],
      waiting_external: ["queued", "running", "retrying", "paused", "cancelled", "failed", "partially_completed"],
      waiting_approval: ["queued", "running", "paused", "cancelled", "partially_completed"],
      scheduled_wait: ["queued", "running", "cancelled", "paused"],
      paused: ["queued", "running", "cancelled"],
      retrying: ["running", "failed", "cancelled"],
      partially_completed: ["running", "completed", "cancelled"],
      completed: [], failed: ["retrying", "queued"], cancelled: [],
    },
  },
  agent_approval: {
    table: "agent_approvals", column: "status", mode: "enforce",
    initial: ["pending"], terminal: ["approved", "rejected", "expired", "cancelled"],
    transitions: { pending: ["approved", "rejected", "expired", "cancelled"], approved: [], rejected: [], expired: [], cancelled: [] },
  },
} as const satisfies Record<string, Machine>;

export type MachineName = keyof typeof machines;

export function canTransition(machine: MachineName, from: string, to: string): boolean {
  if (from === to) return true;
  const next = (machines[machine].transitions as Record<string, readonly string[]>)[from];
  return !!next && next.includes(to);
}

export function assertTransition(machine: MachineName, from: string, to: string) {
  if (!canTransition(machine, from, to)) throw new Error(`Illegal ${machine} transition ${from} → ${to}`);
}
