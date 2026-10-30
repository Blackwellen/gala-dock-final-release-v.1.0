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
  /**
   * Marketplace Request (§17; Q10, migration 202610291025). Request-level state derived from its recipient items by
   * marketplace_request_refresh(); organisers close/reopen/cancel. Audit mode: legacy writers set `closed` directly.
   */
  marketplace_request: {
    table: "provider_requests", column: "status", mode: "audit",
    initial: ["draft", "sent"], terminal: ["cancelled"],
    transitions: {
      draft: ["sent", "cancelled"],
      sent: ["awaiting", "clarification", "quote_received", "declined", "expired_no_response", "closed", "cancelled"],
      awaiting: ["clarification", "quote_received", "declined", "expired_no_response", "closed", "cancelled"],
      clarification: ["awaiting", "quote_received", "declined", "expired_no_response", "closed", "cancelled"],
      quote_received: ["clarification", "closed", "cancelled"],
      declined: ["sent", "closed", "cancelled"],
      expired_no_response: ["sent", "closed", "cancelled"],
      closed: ["sent", "cancelled"], cancelled: [],
    },
  },
  /**
   * Ticket entitlement (§17, §46–50; Q21 → enforce). Transfer/resale invalidate the old entitlement and issue a new one; every
   * move out of valid/used (and any holder change) rotates the credential (tickets_credential_rotate). Legacy traffic seen in
   * state_violations: insert as cancelled (cancelled-event guard), used → refunded (refunds of attended tickets), transferred →
   * cancelled (event cancellation sweep) — all modelled. `void` kept for compatibility (not in the CHECK constraint).
   */
  ticket: {
    table: "tickets", column: "status", mode: "enforce",
    // Inserts are service-only (issuance, transfer/resale re-issue, historic import / demo seeds), so historic states may be
    // inserted directly; every transition after that is enforced.
    initial: ["valid", "used", "cancelled", "refunded", "transferred", "resold", "resale_listed"], terminal: ["refunded", "transferred", "resold", "void"],
    transitions: {
      valid: ["used", "refunded", "transferred", "resale_listed", "cancelled", "void"],
      resale_listed: ["valid", "resold", "cancelled", "refunded", "void"],
      used: ["valid", "refunded", "cancelled"], // re-entry policy may reset a scan; attended tickets can still be refunded
      cancelled: ["refunded"],
      transferred: ["cancelled"], // event cancellation sweep marks dead transferred rows cancelled (no credential impact)
      refunded: [], resold: [], void: [],
    },
  },
  /**
   * Ticket Order (§17, Q20) on checkout_orders.order_state. Deployed code still writes the legacy status / refund_status /
   * stripe_session columns; checkout_order_lifecycle_sync mirrors those writes when this machine allows them (and records a
   * state_violation otherwise, never blocking the writer). Explicit writes (ticket_order_transition) are enforced.
   * Inserts are service-only (checkout, historic imports, fixtures), so any state may be inserted.
   */
  ticket_order: {
    table: "checkout_orders", column: "order_state", mode: "enforce",
    initial: ["draft", "inventory_held", "payment_pending", "paid", "issued", "expired", "failed", "cancelled", "refund_pending", "refunded", "partially_refunded", "chargeback"],
    terminal: ["refunded"],
    transitions: {
      draft: ["inventory_held", "expired", "cancelled"],
      inventory_held: ["payment_pending", "paid", "issued", "expired", "failed", "cancelled", "refund_pending"],
      payment_pending: ["paid", "issued", "expired", "failed", "cancelled", "refund_pending", "refunded"],
      paid: ["issued", "failed", "refund_pending", "refunded", "chargeback"],
      issued: ["refund_pending", "refunded", "partially_refunded", "cancelled", "chargeback"],
      // A late payment for a lapsed reservation is still recorded, then refunded (finalise → hold_expired).
      expired: ["paid", "issued", "refund_pending", "refunded"],
      failed: ["paid", "issued", "refund_pending", "refunded"],
      cancelled: ["refund_pending", "refunded"],
      refund_pending: ["refunded", "partially_refunded", "issued", "paid"], // a queued refund can be withdrawn
      partially_refunded: ["refund_pending", "refunded"],
      chargeback: ["refunded", "issued"], // lost / won dispute
      refunded: [],
    },
  },
  /** Registration (domain 65.5, Q18): approval/waitlist decisions via decide_registration / registration_set_status. */
  registration: {
    table: "registrations", column: "status", mode: "enforce",
    initial: ["submitted"], terminal: ["rejected", "cancelled"],
    transitions: {
      submitted: ["pending_approval", "approved", "waitlisted", "rejected", "cancelled"],
      pending_approval: ["approved", "rejected", "waitlisted", "cancelled"],
      waitlisted: ["approved", "pending_approval", "rejected", "cancelled"],
      approved: ["cancelled"],
      rejected: [], cancelled: [],
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
      awaiting_plan_confirmation: ["running", "cancelled", "planning", "paused"],
      running: ["waiting_external", "waiting_approval", "scheduled_wait", "paused", "retrying", "partially_completed", "completed", "failed", "cancelled", "scheduled"],
      waiting_external: ["queued", "running", "retrying", "paused", "cancelled", "failed", "partially_completed"],
      waiting_approval: ["queued", "running", "paused", "cancelled", "partially_completed"],
      scheduled_wait: ["queued", "running", "cancelled", "paused"],
      paused: ["queued", "running", "cancelled"],
      retrying: ["running", "failed", "cancelled", "paused"],
      partially_completed: ["running", "completed", "cancelled"],
      completed: [], failed: ["retrying", "queued"], cancelled: [],
    },
  },
  /**
   * Identity / business / Stripe verification check (§17 Verification, domains 116–117; Q08). One row per subject + kind in
   * verification_checks. Uploads never self-verify: only Gala Dock review (or the authoritative Stripe webhook mirror)
   * reaches `verified`. `expired` = evidence lapsed; resubmission restarts at `submitted`.
   */
  verification: {
    table: "verification_checks", column: "status", mode: "enforce",
    initial: ["unverified", "submitted"], terminal: [],
    transitions: {
      unverified: ["submitted", "pending_review"],
      submitted: ["pending_review", "action_required", "rejected", "unverified"],
      pending_review: ["verified", "action_required", "rejected", "suspended"],
      verified: ["pending_review", "action_required", "suspended", "expired"],
      action_required: ["submitted", "pending_review", "rejected", "suspended"],
      rejected: ["submitted"],
      suspended: ["pending_review"],
      expired: ["submitted", "pending_review"],
    },
  },
  agent_approval: {
    table: "agent_approvals", column: "status", mode: "enforce",
    initial: ["pending"], terminal: ["approved", "rejected", "expired", "cancelled"],
    transitions: { pending: ["approved", "rejected", "expired", "cancelled"], approved: [], rejected: [], expired: [], cancelled: [] },
  },
  /**
   * Canonical event (§17 Event, domain 35; Q14). Spec → stored states: Draft = draft, Planning/Sourcing = planning,
   * Confirmed = ready, Selling = published/on_sale, Live = live, Completed = completed, Settling = closed, Archived = archived;
   * branches cancelled, postponed, suspended (organiser pause or Gala Dock restriction).
   * The table covers every path the deployed code takes (wizard publish draft → on_sale, admin restriction from any state,
   * archive from most states). `events_lifecycle_guard` narrows `suspended`: entering it from a non-selling state needs an
   * admin restriction, and leaving it must return to selling/live/cancelled or the recorded previous status.
   * Preconditions (date, venue, tickets, payouts, event-type requirements) live in `event_transition()`.
   */
  event: {
    table: "events", column: "status", mode: "enforce",
    initial: ["draft", "planning"], terminal: ["archived"],
    transitions: {
      draft: ["planning", "ready", "published", "on_sale", "cancelled", "archived", "suspended"],
      planning: ["draft", "ready", "published", "on_sale", "postponed", "cancelled", "archived", "suspended"],
      ready: ["planning", "published", "on_sale", "postponed", "cancelled", "archived", "suspended"],
      published: ["ready", "on_sale", "live", "completed", "postponed", "cancelled", "archived", "suspended"],
      on_sale: ["published", "live", "completed", "postponed", "suspended", "cancelled", "archived"],
      live: ["completed", "suspended", "cancelled"],
      suspended: ["draft", "planning", "ready", "published", "on_sale", "live", "completed", "closed", "postponed", "cancelled", "archived"],
      postponed: ["planning", "ready", "published", "on_sale", "cancelled", "archived", "suspended"],
      completed: ["closed", "archived", "suspended"],
      closed: ["archived", "suspended"],
      cancelled: ["archived", "suspended"],
      archived: ["suspended"],
    },
  },
  /**
   * Organizer contract (domain 56; Q16, migration 202610293009). Signed is immutable (renewal creates a new contract);
   * revising a sent/declined/expired contract returns it to draft and kills the old signing link.
   */
  contract: {
    table: "contracts", column: "status", mode: "enforce",
    initial: ["draft"], terminal: ["signed", "void"],
    transitions: {
      draft: ["sent", "void"],
      sent: ["signed", "declined", "expired", "void", "draft"],
      declined: ["draft", "void"],
      expired: ["draft", "void"],
      signed: [],
      void: [],
    },
  },
  /** Crew leave / time-off request (domain 57.6; Q17, migration 202610293011). Approval creates an availability block. */
  leave_request: {
    table: "leave_requests", column: "status", mode: "enforce",
    initial: ["pending"], terminal: ["rejected", "cancelled"],
    transitions: { pending: ["approved", "rejected", "cancelled"], approved: ["cancelled"], rejected: [], cancelled: [] },
  },
  /**
   * Event incident (domain 62; Q17, migration 202610293012). Legacy open → resolved stays legal for deployed code;
   * a resolved incident can be reopened into investigation.
   */
  incident: {
    table: "incidents", column: "status", mode: "enforce",
    initial: ["open"], terminal: [],
    transitions: {
      open: ["acknowledged", "investigating", "mitigated", "resolved"],
      acknowledged: ["investigating", "mitigated", "resolved"],
      investigating: ["mitigated", "resolved"],
      mitigated: ["investigating", "resolved"],
      resolved: ["investigating"],
    },
  },
  /** Sponsor / exhibitor / talent on an event (domains 150–152; Q24, migration 202610293015). Confirming allocates the package. */
  event_party: {
    table: "event_parties", column: "status", mode: "enforce",
    initial: ["prospect", "negotiating"], terminal: ["completed", "cancelled", "withdrawn"],
    transitions: {
      prospect: ["negotiating", "confirmed", "withdrawn", "cancelled"],
      negotiating: ["prospect", "confirmed", "withdrawn", "cancelled"],
      confirmed: ["completed", "cancelled"],
      completed: [], cancelled: [], withdrawn: [],
    },
  },
  /** Sponsor / exhibitor deliverable (domain 150.5; Q24). Submission needs evidence when required; approval is a manager decision. */
  party_deliverable: {
    table: "event_party_deliverables", column: "status", mode: "enforce",
    initial: ["pending"], terminal: [],
    transitions: {
      pending: ["in_progress", "submitted", "waived"],
      in_progress: ["pending", "submitted", "waived"],
      submitted: ["approved", "rejected"],
      rejected: ["in_progress", "submitted", "waived"],
      approved: [], waived: ["pending"],
    },
  },
  /** Technical / hospitality / travel rider version (domain 153; Q24). Immutable once submitted; a new version supersedes. */
  talent_rider: {
    table: "talent_riders", column: "status", mode: "enforce",
    initial: ["draft", "submitted"], terminal: ["superseded", "withdrawn"],
    transitions: {
      draft: ["submitted", "withdrawn"],
      submitted: ["accepted", "changes_requested", "superseded", "withdrawn"],
      changes_requested: ["superseded", "withdrawn"],
      accepted: ["superseded"],
      superseded: [], withdrawn: [],
    },
  },
  /** Event licence / notice (domain 158; Q26, migration 202610293017). not_required needs a reason; the daily job expires granted licences. */
  event_licence: {
    table: "event_licences", column: "status", mode: "enforce",
    initial: ["draft", "submitted", "granted", "not_required"], terminal: ["withdrawn", "revoked"],
    transitions: {
      draft: ["submitted", "granted", "withdrawn", "not_required"],
      submitted: ["granted", "refused", "withdrawn", "not_required"],
      refused: ["submitted", "withdrawn"],
      granted: ["expired", "revoked"],
      expired: ["submitted"],
      not_required: ["draft"],
      withdrawn: [], revoked: [],
    },
  },
  /** Safety plan version (domain 160; Q26). Immutable once submitted; approval by a manager other than the author (owner may). */
  safety_plan: {
    table: "safety_plans", column: "status", mode: "enforce",
    initial: ["draft"], terminal: ["superseded", "withdrawn"],
    transitions: {
      draft: ["submitted", "withdrawn"],
      submitted: ["approved", "changes_requested", "withdrawn"],
      changes_requested: ["superseded", "withdrawn"],
      approved: ["superseded"],
      superseded: [], withdrawn: [],
    },
  },
  /** Online session (domains 181/184; Q29). Ending / cancelling revokes unused join tokens and closes open attendance. */
  virtual_session: {
    table: "virtual_sessions", column: "status", mode: "enforce",
    initial: ["draft", "scheduled"], terminal: ["archived"],
    transitions: {
      draft: ["scheduled", "cancelled"],
      scheduled: ["draft", "live", "ended", "cancelled"],
      live: ["ended", "cancelled"],
      ended: ["archived", "live"],
      cancelled: ["scheduled", "archived"],
      archived: [],
    },
  },
  /** Session recording / replay (domain 182.6; Q29). Access also needs the window (access_from/until) and audience. */
  virtual_recording: {
    table: "virtual_recordings", column: "status", mode: "enforce",
    initial: ["processing", "available"], terminal: [],
    transitions: {
      processing: ["available", "withdrawn"],
      available: ["withdrawn"],
      withdrawn: ["available"],
    },
  },
  /** Fraud/abuse risk signal (domains 211–212; Q33). Reviewed by Trust & Safety; a higher-severity repeat re-opens it. */
  risk_signal: {
    table: "risk_signals", column: "status", mode: "enforce",
    initial: ["open", "cleared", "actioned"], terminal: [],   // cleared/actioned: mirrored historic ticket flags
    transitions: {
      open: ["cleared", "actioned", "expired"],
      cleared: ["open", "actioned"],
      expired: ["open", "cleared", "actioned"],
      actioned: ["cleared"],   // appeal overturned
    },
  },
  /** Reversible payout / step-up hold (Q33). Released only by review or appeal; a new concern places a new hold. */
  risk_hold: {
    table: "risk_holds", column: "status", mode: "enforce",
    initial: ["active"], terminal: ["released"],
    transitions: { active: ["released"], released: [] },
  },
  /** Legal hold (domain 270; Q32). Blocks erasure and retention purge for its subjects while active. */
  legal_hold: {
    table: "legal_holds", column: "status", mode: "enforce",
    initial: ["active"], terminal: ["released"],
    transitions: { active: ["released"], released: [] },
  },
  /**
   * Support case (domain 196; Q31, lane D 202610294023). waiting pauses the resolution SLA; a customer reply re-opens a waiting or
   * recently resolved case; resolved cases auto-close after the policy's auto_close_days; closed is final (open a new case).
   */
  support_case: {
    table: "support_cases", column: "status", mode: "enforce",
    initial: ["open", "waiting", "escalated", "resolved"], terminal: ["closed"],
    transitions: {
      open: ["waiting", "escalated", "resolved"],
      waiting: ["open", "escalated", "resolved"],
      escalated: ["open", "waiting", "resolved"],
      resolved: ["open", "closed"],
      closed: [],
    },
  },
  /** Promotion campaign (domain 139; Q23, lane A 202610291040). Scheduled → active by date (campaign_tick); command campaign_transition. */
  promotion_campaign: {
    table: "promotion_campaigns", column: "status", mode: "enforce",
    initial: ["draft"], terminal: ["completed", "cancelled"],
    transitions: {
      draft: ["scheduled", "cancelled"],
      scheduled: ["draft", "active", "cancelled"],
      active: ["paused", "completed", "cancelled"],
      paused: ["active", "completed", "cancelled"],
      completed: [], cancelled: [],
    },
  },
  /** Waiver template version (domain 252; Q40, lane A 202610291044). Published versions are immutable; one published per family. */
  waiver_template: {
    table: "waiver_templates", column: "status", mode: "enforce",
    initial: ["draft"], terminal: ["retired"],
    transitions: { draft: ["published", "retired"], published: ["retired"], retired: [] },
  },
  /** Merchandise order (domain 254; Q40, lane A 202610291045). Payment confirmation is the Q07 hook merch_mark_paid. */
  merch_order: {
    table: "merch_orders", column: "status", mode: "enforce",
    initial: ["pending"], terminal: ["refunded", "cancelled", "expired"],
    transitions: {
      pending: ["paid", "cancelled", "expired"],
      paid: ["collected", "refunded", "partially_refunded"],
      partially_refunded: ["refunded", "collected", "partially_refunded"],
      collected: ["refunded", "partially_refunded"],
      refunded: [], cancelled: [], expired: [],
    },
  },
  /** Lost-property report (domain 255; Q40, lane A 202610291046). */
  lost_report: {
    table: "lost_reports", column: "status", mode: "enforce",
    initial: ["submitted"], terminal: ["collected", "closed", "expired"],
    transitions: {
      submitted: ["matched", "closed", "expired"],
      matched: ["verified", "submitted", "closed", "expired"],
      verified: ["collected", "matched", "closed"],
      collected: [], closed: [], expired: [],
    },
  },
  /** Found item (domain 255; Q40, lane A 202610291046). */
  found_item: {
    table: "found_items", column: "status", mode: "enforce",
    initial: ["logged"], terminal: ["collected", "disposed"],
    transitions: { logged: ["matched", "disposed"], matched: ["claimed", "logged", "disposed"], claimed: ["collected", "logged"], collected: [], disposed: [] },
  },
  /**
   * Experiment (domains 229–230; Q36, lane C 202610293030). Pricing/legal-text experiments must pass pending_approval → approved
   * (a different admin with the right permission); a guardrail breach or the kill switch moves running → stopped (final).
   */
  experiment: {
    table: "experiments", column: "status", mode: "enforce",
    initial: ["draft"], terminal: ["stopped", "completed", "archived"],
    transitions: {
      draft: ["pending_approval", "running", "archived"],
      pending_approval: ["approved", "draft", "archived"],
      approved: ["running", "draft", "archived"],
      running: ["paused", "stopped", "completed"],
      paused: ["running", "stopped", "completed"],
      stopped: [], completed: [], archived: [],
    },
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
