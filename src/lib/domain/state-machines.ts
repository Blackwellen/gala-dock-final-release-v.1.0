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
      draft: ["enquiry_created", "sent", "quoted", "awaiting_confirmation", "cancelled_by_customer"],
      suggested: ["requested", "hold", "draft", "enquiry_created", "sent", "awaiting", "cancelled_by_customer"],
      enquiry_created: ["sent", "cancelled_by_customer"],
      sent: ["requested", "hold", "available", "clarification", "standby", "cancelled", "awaiting_provider", "awaiting", "clarification_requested", "quote_received", "quoted", "conditional_hold_requested", "declined", "unavailable", "expired_no_response", "expired", "cancelled_by_customer"],
      awaiting: ["requested", "hold", "available", "clarification", "standby", "cancelled", "awaiting_provider", "quoted", "quote_received", "held", "declined", "unavailable", "expired", "expired_no_response", "cancelled_by_customer", "confirmed"],
      awaiting_provider: ["expired", "clarification_requested", "quote_received", "conditional_hold_requested", "declined", "unavailable", "expired_no_response", "cancelled_by_customer"],
      clarification_requested: ["awaiting_provider", "quote_received", "declined", "cancelled_by_customer"],
      quote_received: ["quote_revised", "customer_reviewing", "conditional_hold_requested", "awaiting_payment", "cancelled_by_customer", "expired_no_response"],
      quoted: ["requested", "hold", "available", "clarification", "standby", "cancelled", "quote_revised", "customer_reviewing", "held", "conditional_hold_requested", "awaiting_payment", "confirmed", "declined", "expired", "cancelled_by_customer"],
      quote_revised: ["customer_reviewing", "conditional_hold_requested", "awaiting_payment", "cancelled_by_customer"],
      customer_reviewing: ["quote_revised", "conditional_hold_requested", "awaiting_payment", "cancelled_by_customer", "expired_no_response"],
      conditional_hold_requested: ["conditionally_held", "held", "available", "quoted", "quote_received", "quote_revised", "customer_reviewing", "declined", "unavailable", "cancelled", "cancelled_by_customer"],
      conditionally_held: ["available", "cancellation_requested", "awaiting_payment", "awaiting_confirmation", "confirmed", "expired", "cancelled_by_customer", "cancelled_by_provider"],
      held: ["available", "clarification", "standby", "cancelled", "cancellation_requested", "awaiting_payment", "awaiting_confirmation", "confirmed", "expired", "cancelled_by_customer", "cancelled_by_provider"],
      standby_offered: ["standby_accepted", "expired", "declined"],
      standby_accepted: ["confirmed", "expired", "cancellation_requested", "cancelled_by_customer", "cancelled_by_provider"],
      awaiting_payment: ["awaiting_confirmation", "confirmed", "cancellation_requested", "cancelled_by_customer", "cancelled_by_provider", "expired"],
      awaiting_confirmation: ["confirmed", "declined", "cancellation_requested", "cancelled_by_customer", "cancelled_by_provider"],
      confirmed: ["available", "clarification", "standby", "cancelled", "active", "fulfilled", "cancellation_requested", "cancelled_by_customer", "cancelled_by_provider", "replacement_required", "disputed"],
      active: ["fulfilled", "completion_pending", "cancellation_requested", "cancelled_by_customer", "cancelled_by_provider", "replacement_required", "disputed"],
      fulfilled: ["completion_pending", "completed", "disputed"],
      completion_pending: ["completed", "disputed"],
      cancellation_requested: ["cancelled_by_customer", "cancelled_by_provider", "confirmed", "active", "held", "conditionally_held", "awaiting_payment", "awaiting_confirmation", "standby_accepted", "disputed"],
      cancelled_by_customer: ["refunded", "partially_refunded", "disputed"],
      cancelled_by_provider: ["refunded", "partially_refunded", "replacement_required", "disputed"],
      replacement_required: ["cancelled_by_provider", "confirmed", "disputed"],
      disputed: ["completed", "refunded", "partially_refunded"],
      partially_refunded: ["refunded", "completed", "disputed"],
      expired: ["sent"],
      declined: [], unavailable: [], expired_no_response: ["sent"], completed: ["disputed"], refunded: [],
      // Legacy states used by current provider/customer flows.
      available: ["quoted", "held", "awaiting_payment", "confirmed", "declined", "expired", "cancelled", "cancelled_by_customer"],
      clarification: ["awaiting", "sent", "available", "quoted", "declined", "cancelled", "cancelled_by_customer"],
      standby: ["confirmed", "expired", "cancelled", "declined", "cancellation_requested", "cancelled_by_customer", "cancelled_by_provider"],
      requested: ["available", "clarification", "quoted", "held", "hold", "standby", "confirmed", "declined", "expired", "cancelled", "cancelled_by_customer"],
      hold: ["held", "confirmed", "awaiting_payment", "expired", "cancelled", "cancelled_by_customer", "declined"],
      cancelled: ["refunded", "partially_refunded", "disputed"],
    },
  },
  /** Provider-side booking record. Legacy: confirmed, active, completed, cancelled. */
  provider_job: {
    table: "provider_jobs", column: "status", mode: "audit",
    initial: ["confirmed", "held", "awaiting_confirmation", "deposit_paid"],
    terminal: ["completed", "cancelled", "cancelled_by_customer", "cancelled_by_provider"],
    transitions: {
      held: ["confirmed", "cancelled", "cancelled_by_provider", "cancelled_by_customer"],
      awaiting_confirmation: ["confirmed", "cancelled_by_provider", "cancelled_by_customer"],
      confirmed: ["deposit_paid", "active", "completed", "cancelled", "cancelled_by_customer", "cancelled_by_provider", "disputed"],
      deposit_paid: ["active", "completed", "cancelled", "cancelled_by_customer", "cancelled_by_provider", "disputed"],
      active: ["completion_pending", "completed", "cancelled", "cancelled_by_customer", "cancelled_by_provider", "disputed"],
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
  /** Conditional hold (§35): a marketplace reservation, never a long card authorisation. */
  conditional_hold: {
    table: "conditional_holds", column: "status", mode: "enforce",
    initial: ["requested", "held"], terminal: ["declined", "released", "expired", "converted", "cancelled"],
    transitions: {
      requested: ["held", "declined", "released", "expired", "cancelled", "converted"],
      held: ["released", "expired", "converted", "cancelled"],
      declined: [], released: [], expired: [], converted: [], cancelled: [],
    },
  },
  /** Paid standby (§36). Activation is binding; the fee is settled by payment orchestration first. */
  standby: {
    table: "standby_commitments", column: "status", mode: "enforce",
    initial: ["requested"], terminal: ["activated", "released", "expired", "declined", "cancelled"],
    transitions: {
      requested: ["offered", "declined", "expired", "cancelled"],
      offered: ["accepted", "declined", "expired", "cancelled"],
      accepted: ["activated", "released", "expired"],
      activated: [], released: [], expired: [], declined: [], cancelled: [],
    },
  },
  /** Emergency supply request (§37). */
  emergency_request: {
    table: "emergency_requests", column: "status", mode: "enforce",
    initial: ["open"], terminal: ["filled", "cancelled", "expired"],
    transitions: { open: ["matching", "filled", "cancelled", "expired"], matching: ["filled", "cancelled", "expired"], filled: [], cancelled: [], expired: [] },
  },
  /** Gala Dock booking dispute (§44) — operational, separate from card chargebacks. */
  booking_dispute: {
    table: "booking_disputes", column: "status", mode: "enforce",
    initial: ["opened"], terminal: ["resolved"],
    transitions: {
      opened: ["evidence_collection", "provider_response", "review", "resolution_proposed", "resolved", "escalated"],
      evidence_collection: ["provider_response", "review", "resolution_proposed", "resolved", "escalated"],
      provider_response: ["review", "resolution_proposed", "resolved", "escalated"],
      review: ["evidence_collection", "resolution_proposed", "resolved", "escalated"],
      resolution_proposed: ["review", "resolved", "escalated"],
      escalated: ["review", "resolution_proposed", "resolved"],
      resolved: [],
    },
  },
  /** Cancellation engine (§45). */
  cancellation: {
    table: "booking_cancellations", column: "status", mode: "enforce",
    initial: ["requested"], terminal: ["rejected", "completed", "withdrawn"],
    transitions: {
      requested: ["accepted", "rejected", "manual_review", "withdrawn"],
      manual_review: ["accepted", "rejected", "withdrawn"],
      accepted: ["completed"],
      rejected: [], completed: [], withdrawn: [],
    },
  },
  /** Payment order (§38, §43). Stripe events drive every transition after payment_pending; "protected" is product language, not escrow (§39). */
  payment: {
    table: "payment_orders", column: "status", mode: "enforce",
    initial: ["amount_due"], terminal: ["refunded", "cancelled"],
    transitions: {
      amount_due: ["payment_pending", "payment_succeeded", "protected_pending_delivery", "failed", "cancelled"],
      payment_pending: ["amount_due", "payment_succeeded", "protected_pending_delivery", "failed", "cancelled"],
      failed: ["amount_due", "payment_pending", "payment_succeeded", "protected_pending_delivery", "cancelled"],
      payment_succeeded: ["eligible_for_provider_transfer", "partially_refunded", "refunded", "disputed"],
      protected_pending_delivery: ["eligible_for_provider_transfer", "partially_refunded", "refunded", "disputed"],
      eligible_for_provider_transfer: ["transfer_created", "partially_refunded", "refunded", "disputed"],
      transfer_created: ["payout_pending", "paid_out", "partially_refunded", "refunded", "disputed"],
      payout_pending: ["paid_out", "disputed"],
      paid_out: ["partially_refunded", "refunded", "disputed"],
      partially_refunded: ["eligible_for_provider_transfer", "transfer_created", "refunded", "disputed"],
      disputed: ["payment_succeeded", "protected_pending_delivery", "eligible_for_provider_transfer", "transfer_created", "partially_refunded", "refunded"],
      refunded: [], cancelled: [],
    },
  },
  /** Venue BEO / event order (§62). Content lives in append-only versions; this tracks the review cycle. */
  event_order: {
    table: "event_orders", column: "status", mode: "enforce",
    initial: ["draft"], terminal: [],
    transitions: { draft: ["sent"], sent: ["revised", "approved"], revised: ["sent", "approved"], approved: ["revised"] },
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
