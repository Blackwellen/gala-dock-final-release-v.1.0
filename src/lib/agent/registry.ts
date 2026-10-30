import { z } from "zod";

/**
 * Gala Agent typed tool registry (master spec §8–9). Single source of truth: scripts/gen-agent-tools.mjs seeds `agent_tools`,
 * the planner only sees tools allowed for the surface + policy + the user's role, inputs are validated with these schemas, and
 * execution goes through agent_invoke() — the same domain functions the UI uses, as the human.
 * Risk: R0 read · R1 draft · R2 low-risk internal · R3 external non-binding · R4 commercial/financial/public · R5 security/legal (never executed).
 */
export type Risk = 0 | 1 | 2 | 3 | 4 | 5;
export type Surface = "organizer" | "provider" | "both";
/** Where a tool may be called from. Never "customer" (owner decision: no AI in the customer workspace); enforced by a CHECK on agent_tools. */
export type Exposure = "organizer" | "provider" | "admin" | "api" | "mcp";
export type Tool = {
  id: string; version: number; title: string; description: string; surface: Surface; risk: Risk; permission: string;
  mutation: boolean; reversible: boolean; idempotent: boolean; timeoutMs: number; retries: number;
  input: z.ZodTypeAny; amountMinor?: (input: Record<string, unknown>) => number; approvalNote?: string; affected?: (input: Record<string, unknown>) => string;
  /** Surfaces that may call it (Q41). API/MCP get R0–R3 only (R4 → approval_required, R5 never). */
  exposure: Exposure[];
  /** Plan capability required (plan_entitlements / workspace override); R3/R4 need `agent.actions`. */
  planCapability: string | null;
  /** Per-workspace calls per minute, enforced in agent_execute_tool. */
  ratePerMinute: number;
};
const id = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const exposureFor = (surface: Surface, risk: Risk): Exposure[] =>
  [...(surface === "both" ? ["organizer", "provider"] as Exposure[] : [surface as Exposure]), ...(risk <= 3 ? ["api", "mcp"] as Exposure[] : [])];
const t = (x: Omit<Tool, "version" | "timeoutMs" | "retries" | "idempotent" | "reversible" | "mutation" | "exposure" | "planCapability" | "ratePerMinute"> & Partial<Tool>): Tool =>
  ({ version: 1, timeoutMs: 15000, retries: 2, idempotent: true, reversible: x.risk <= 2, mutation: x.risk >= 1, exposure: exposureFor(x.surface, x.risk),
    planCapability: x.risk >= 3 ? "agent.actions" : null, ratePerMinute: x.risk >= 3 ? 10 : x.risk >= 1 ? 30 : 60, ...x });

export const TOOLS: Tool[] = [
  // ── Organizer · R0
  t({ id: "events.list", title: "List events", description: "Events in this workspace, optionally within N days.", surface: "organizer", risk: 0, permission: "events.read", input: z.object({ within_days: z.number().int().min(1).max(730).optional() }) }),
  t({ id: "event.readiness", title: "Event readiness", description: "Explainable readiness by domain (venue, suppliers, staff, tickets, money, compliance…).", surface: "organizer", risk: 0, permission: "events.read", input: z.object({ event_id: id }) }),
  t({ id: "event.feasibility", title: "Feasibility check", description: "Logical incompatibilities: capacity, setup windows, power, travel, security coverage.", surface: "organizer", risk: 0, permission: "events.read", input: z.object({ event_id: id }) }),
  t({ id: "event.budget", title: "Event budget", description: "Target, estimated, requested, held, confirmed, paid, due, remaining.", surface: "organizer", risk: 0, permission: "events.read", input: z.object({ event_id: id }) }),
  t({ id: "marketplace.open_requests", title: "Open supplier requests", description: "Requests awaiting response or decision, with deadlines.", surface: "organizer", risk: 0, permission: "events.read", input: z.object({}) }),
  t({ id: "marketplace.search", title: "Search marketplace", description: "Published venues and suppliers by category, city, guests, max price.", surface: "organizer", risk: 0, permission: "marketplace.request",
    input: z.object({ category: z.string().max(40).optional(), city: z.string().max(60).optional(), guests: z.number().int().min(1).max(100000).optional(), max_price: z.number().min(0).optional() }) }),
  t({ id: "team.conflicts", title: "Team conflicts", description: "Double bookings, travel clashes, unfilled shifts, qualifications.", surface: "organizer", risk: 0, permission: "events.read", input: z.object({}) }),
  t({ id: "tickets.sales", title: "Ticket sales", description: "Sold, held and revenue per tier for an event.", surface: "organizer", risk: 0, permission: "events.read", input: z.object({ event_id: id }) }),
  t({ id: "venues.rank", title: "Rank venues", description: "Score published venues for an event (capacity fit, city, price against budget, rating, response time) with reasons.", surface: "organizer", risk: 0, permission: "events.read",
    input: z.object({ event_id: id, limit: z.number().int().min(1).max(20).optional() }) }),
  t({ id: "event.break_even", title: "Break-even", description: "Tickets needed to cover supplier costs (plus optional extra costs and fee %), sold so far, and whether it's achievable.", surface: "organizer", risk: 0, permission: "events.read",
    input: z.object({ event_id: id, extra_costs: z.number().min(0).max(10_000_000).optional(), fee_pct: z.number().min(0).max(50).optional() }) }),
  t({ id: "seating.suggest", title: "Suggest seating", description: "Pack guests into tables of N, keeping groups together and flagging dietary needs per table. Saves nothing.", surface: "organizer", risk: 0, permission: "events.read",
    input: z.object({ event_id: id, table_size: z.number().int().min(2).max(30).optional(), include_pending: z.boolean().optional() }) }),
  t({ id: "map.validate", title: "Validate event map", description: "Capacity, exits, clear routes, aisles, accessibility and ticket/zone bindings for an event's layout. Read only.", surface: "organizer", risk: 0, permission: "events.read",
    input: z.object({ event_id: id, version: z.number().int().min(1).optional() }) }),
  t({ id: "map.bindings", title: "Map ticket bindings", description: "Which seats and areas on the published layout belong to each ticket tier and access zone. Read only.", surface: "organizer", risk: 0, permission: "events.read",
    input: z.object({ event_id: id }) }),
  t({ id: "money.payables", title: "Payables", description: "Supplier payments due, scheduled or overdue.", surface: "organizer", risk: 0, permission: "finance.read", input: z.object({}) }),
  // ── Organizer · R1/R2
  t({ id: "draft.note", title: "Draft", description: "Save a draft (message, plan, checklist) for a human to review. Sends nothing.", surface: "both", risk: 1, permission: "events.read",
    input: z.object({ title: z.string().min(2).max(140), body: z.string().min(1).max(6000) }) }),
  t({ id: "task.create", title: "Create task", description: "Internal task on an event.", surface: "organizer", risk: 2, permission: "events.write",
    input: z.object({ event_id: id, title: z.string().min(3).max(200), detail: z.string().max(2000).optional(), due_at: iso.optional(), priority: z.enum(["low", "medium", "high", "critical"]).optional() }) }),
  // ── Media Studio (drafts only — the agent never publishes, prints or posts artwork)
  t({ id: "media.list_designs", title: "List designs", description: "Designs in this workspace's Media Studio, newest first, optionally for one event.", surface: "both", risk: 0, permission: "events.read",
    input: z.object({ event_id: id.optional() }) }),
  t({ id: "media.event_poster", title: "Draft event poster", description: "Create a draft poster in Media Studio from an event's live details (name, date, venue, ticket QR) for a human to edit.", surface: "organizer", risk: 1, permission: "events.write",
    input: z.object({ event_id: id, preset: z.enum(["a3", "a4", "sq", "portrait", "story", "wide", "banner", "screen"]).optional(), title: z.string().min(2).max(140).optional() }) }),
  // ── R3 external, non-binding
  t({ id: "message.party", title: "Send message", description: "Message a supplier, client or teammate you already work with.", surface: "both", risk: 3, permission: "events.read", idempotent: true,
    input: z.object({ to_type: z.enum(["user", "workspace"]), to: id, subject: z.string().max(140).optional(), body: z.string().min(2).max(4000), event_id: id.optional(), item_id: id.optional(), kind: z.enum(["direct", "event", "booking", "enquiry"]).optional() }),
    affected: i => `conversation with ${i.to_type} ${i.to}` }),
  t({ id: "marketplace.request_hold", title: "Request a hold", description: "Ask a supplier to hold the date (not a payment).", surface: "organizer", risk: 3, permission: "marketplace.request",
    input: z.object({ item_id: id, hours: z.number().int().min(2).max(336), depends_on: id.optional(), conditions: z.string().max(1000).optional() }), affected: i => `booking ${i.item_id}` }),
  t({ id: "marketplace.request_standby", title: "Request paid standby", description: "Ask a supplier to offer standby cover (binding only once accepted).", surface: "organizer", risk: 3, permission: "marketplace.request",
    input: z.object({ item_id: id, primary_id: id.optional(), window_start: iso, window_end: iso, note: z.string().max(1000).optional() }), affected: i => `booking ${i.item_id}` }),
  t({ id: "emergency.create", title: "Emergency Supply request", description: "Contact the controlled pool of available emergency providers.", surface: "organizer", risk: 3, permission: "marketplace.request",
    input: z.object({ event_id: id, category: z.string().regex(/^[a-z_]{2,40}$/), severity: z.enum(["critical", "high", "standard"]), required_arrival: iso, scope: z.string().max(2000), failure_reason: z.string().max(1000).optional() }), affected: i => `event ${i.event_id}` }),
  // ── R4 commitments (approval by default)
  t({ id: "standby.activate", title: "Activate standby", description: "Book the standby provider at their activation price.", surface: "organizer", risk: 4, permission: "marketplace.request",
    input: z.object({ standby_id: id, reason: z.string().min(3).max(500) }), approvalNote: "Binding booking at the agreed activation price.", affected: i => `standby ${i.standby_id}` }),
  t({ id: "cancellation.request", title: "Cancel a booking", description: "Request cancellation under the booking's policy.", surface: "organizer", risk: 4, permission: "marketplace.request",
    input: z.object({ item_id: id, reason: z.string().min(5).max(2000), kind: z.enum(["full", "reschedule", "partial"]).optional() }), approvalNote: "May forfeit deposits per the cancellation policy.", affected: i => `booking ${i.item_id}` }),
  t({ id: "tickets.publish_tier", title: "Put tickets on sale", description: "Publish a ticket tier for public sale.", surface: "organizer", risk: 4, permission: "tickets.manage",
    input: z.object({ tier_id: id }), approvalNote: "Public commitment: tickets become purchasable.", affected: i => `tier ${i.tier_id}` }),
  // ── Provider · R0
  t({ id: "opportunities.list", title: "Open opportunities", description: "Requests awaiting your response, with deadlines.", surface: "provider", risk: 0, permission: "opportunities.read", input: z.object({}) }),
  t({ id: "calendar.conflicts", title: "Check availability", description: "Conflicts for a space and time, including buffers and linked spaces.", surface: "provider", risk: 0, permission: "opportunities.read",
    input: z.object({ space_id: id, starts_at: iso, ends_at: iso }) }),
  t({ id: "money.provider_summary", title: "Payout summary", description: "Protected, releasing and released amounts.", surface: "provider", risk: 0, permission: "money.read", input: z.object({}) }),
  t({ id: "reliability.get", title: "Reliability", description: "Response rate, response time, cancellations, disputes.", surface: "provider", risk: 0, permission: "opportunities.read", input: z.object({}) }),
  // ── Provider · R3/R4
  t({ id: "opportunity.respond", title: "Respond to request", description: "Mark available, ask a clarifying question, or decline.", surface: "provider", risk: 3, permission: "opportunities.respond",
    input: z.object({ item_id: id, response: z.enum(["available", "clarification", "declined", "unavailable"]), note: z.string().max(2000).optional() }), affected: i => `request ${i.item_id}` }),
  t({ id: "venue.hold", title: "Hold a space", description: "Place a soft or hard hold on a space for a request.", surface: "provider", risk: 3, permission: "availability.manage",
    input: z.object({ item_id: id, space_id: id, starts_at: iso, ends_at: iso, hours: z.number().int().min(2).max(336), blocking: z.enum(["soft", "hard"]).optional(), note: z.string().max(1000).optional() }), affected: i => `request ${i.item_id}` }),
  t({ id: "quote.send", title: "Send a quote", description: "Issue a priced quote to the client.", surface: "provider", risk: 4, permission: "quotes.send",
    input: z.object({ item_id: id, items: z.array(z.object({ name: z.string().max(120), qty: z.number().min(0), unit_price: z.number().min(0) })).min(1).max(40), deposit_pct: z.number().int().min(0).max(100).optional(), valid_days: z.number().int().min(1).max(90).optional(), message: z.string().max(4000).optional() }),
    amountMinor: i => Math.round(((i.items as { qty: number; unit_price: number }[]) ?? []).reduce((a, x) => a + x.qty * x.unit_price, 0) * 100), approvalNote: "Commercial commitment to the client.", affected: i => `request ${i.item_id}` }),

  // ── Q42 Organizer Agent domain hooks (R0 reads over the same domain functions the UI uses, as the human; event-scoped tools are
  //    refused for events outside the run's workspace). Campaigns are read-only for the agent.
  t({ id: "calendar.upcoming", title: "Upcoming calendar", description: "This workspace's events in the next N days with operational conflicts (crew, venue, supplier clashes).", surface: "organizer", risk: 0, permission: "events.read",
    input: z.object({ within_days: z.number().int().min(1).max(365).optional() }) }),
  t({ id: "event.conflicts", title: "Event conflicts", description: "Scheduling and resource conflicts for one event, with severity.", surface: "organizer", risk: 0, permission: "events.read", input: z.object({ event_id: id }) }),
  t({ id: "event.ops_readiness", title: "Operations readiness", description: "Live-operations readiness: staffing, run sheet, suppliers on site, checks.", surface: "organizer", risk: 0, permission: "events.read", input: z.object({ event_id: id }) }),
  t({ id: "compliance.overview", title: "Compliance overview", description: "Licences, permits, safety plans and requirements with submitted / pending / verified / expired status.", surface: "organizer", risk: 0, permission: "events.read", input: z.object({ event_id: id }) }),
  t({ id: "hospitality.summary", title: "Hospitality summary", description: "Catering, bar and service schedule status for an event (counts only; no guest care details).", surface: "organizer", risk: 0, permission: "events.read", input: z.object({ event_id: id }) }),
  t({ id: "logistics.overview", title: "Logistics overview", description: "Travel, parking, loading windows and accommodation for an event.", surface: "organizer", risk: 0, permission: "events.read", input: z.object({ event_id: id }) }),
  t({ id: "partners.overview", title: "Partners overview", description: "Sponsors, exhibitors and talent on an event with deliverable status.", surface: "organizer", risk: 0, permission: "events.read", input: z.object({ event_id: id }) }),
  t({ id: "virtual.attendance", title: "Online attendance", description: "Online session attendance (live and replay) for a virtual or hybrid event.", surface: "organizer", risk: 0, permission: "events.read", input: z.object({ event_id: id }) }),
  t({ id: "campaigns.calendar", title: "Promotion calendar", description: "Scheduled promotion campaigns and blackouts in the next N days. Read only.", surface: "organizer", risk: 0, permission: "promotion.manage",
    input: z.object({ within_days: z.number().int().min(1).max(180).optional() }) }),
  t({ id: "campaigns.report", title: "Campaign report", description: "Delivery and conversion report for one campaign. Read only — the agent never sends campaigns.", surface: "organizer", risk: 0, permission: "promotion.manage", input: z.object({ campaign_id: id }) }),
  t({ id: "sales.client", title: "Client overview", description: "A sales client's events, proposals, invoices and pipeline stage.", surface: "organizer", risk: 0, permission: "sales.read", input: z.object({ client_id: id }) }),
  t({ id: "stock.report", title: "Stock report", description: "Bar stock, consumables and merchandise levels, reservations and low-stock items, optionally for one event.", surface: "organizer", risk: 0, permission: "events.read", input: z.object({ event_id: id.optional() }) }),
  t({ id: "comms.inbox", title: "Inbox", description: "Recent conversations in this workspace with unread flags.", surface: "both", risk: 0, permission: "agent.use", input: z.object({ limit: z.number().int().min(1).max(50).optional() }) }),
  // ── Q43 Provider Agent domain hooks
  t({ id: "bookings.upcoming", title: "Upcoming bookings", description: "Confirmed and held jobs in the next N days with time, space, guests and next action.", surface: "provider", risk: 0, permission: "bookings.read",
    input: z.object({ within_days: z.number().int().min(1).max(365).optional() }) }),
  t({ id: "opportunities.sla", title: "Response SLA", description: "Open requests ordered by response deadline with hours left and overdue flags.", surface: "provider", risk: 0, permission: "opportunities.read", input: z.object({}) }),
  t({ id: "listing.readiness", title: "Listing readiness", description: "What a listing still needs before it can be published or booked.", surface: "provider", risk: 0, permission: "bookings.read", input: z.object({ listing_id: id }) }),
  t({ id: "listing.availability", title: "Listing availability", description: "Whether a listing is free for a window (holds, bookings, blocks, capacity).", surface: "provider", risk: 0, permission: "opportunities.read",
    input: z.object({ listing_id: id, starts_at: iso, ends_at: iso, guests: z.number().int().min(1).max(100000).optional() }) }),
  t({ id: "trust.summary", title: "Trust status", description: "Verification, insurance and document status for this workspace.", surface: "provider", risk: 0, permission: "bookings.read", input: z.object({}) }),
  t({ id: "money.release_readiness", title: "Payout readiness", description: "Whether payouts can be released (connected account, verification) plus protected / releasing / released totals.", surface: "provider", risk: 0, permission: "money.read", input: z.object({}) }),

  t({ id: "quote.draft", title: "Draft a quote", description: "Save a priced quote as a draft for a human to review and send. Sends nothing.", surface: "provider", risk: 1, permission: "quotes.send",
    input: z.object({ item_id: id, items: z.array(z.object({ name: z.string().max(120), qty: z.number().min(0), unit_price: z.number().min(0) })).min(1).max(40), deposit_pct: z.number().int().min(0).max(100).optional(), valid_days: z.number().int().min(1).max(90).optional(), message: z.string().max(4000).optional() }),
    amountMinor: i => Math.round(((i.items as { qty: number; unit_price: number }[]) ?? []).reduce((a, x) => a + x.qty * x.unit_price, 0) * 100), affected: i => `request ${i.item_id}` }),
  t({ id: "crew.assign", title: "Assign crew", description: "Assign a crew member to a confirmed job (refused if it clashes with their other shifts).", surface: "provider", risk: 2, permission: "team.manage",
    input: z.object({ job_id: id, crew_id: id, role: z.string().min(2).max(60).optional() }), affected: i => `job ${i.job_id}` }),
  t({ id: "equipment.allocate", title: "Allocate equipment", description: "Reserve equipment for a job (refused beyond available quantity).", surface: "provider", risk: 2, permission: "bookings.manage",
    input: z.object({ job_id: id, equipment_id: id, quantity: z.number().int().min(1).max(10000) }), affected: i => `job ${i.job_id}` }),
  t({ id: "availability.emergency_window", title: "Offer emergency availability", description: "Publish a window when you can take emergency work (visible to organizers' emergency requests; not a booking).", surface: "provider", risk: 3, permission: "availability.manage",
    input: z.object({ starts_at: iso, ends_at: iso, listing_id: id.optional(), space_id: id.optional(), note: z.string().max(500).optional() }), affected: () => "emergency availability" }),
  // ── Q42/Q43 shared: memory (data-minimised, user-resettable) and mission control
  t({ exposure: ["organizer", "provider"], id: "memory.recall", title: "Recall preferences", description: "Saved working preferences and facts for this workspace (and your own), newest first.", surface: "both", risk: 0, permission: "agent.use",
    input: z.object({ kind: z.enum(["preference", "fact", "summary"]).optional() }) }),
  t({ exposure: ["organizer", "provider"], id: "memory.remember", title: "Remember a preference", description: "Save a short working preference or fact (no personal, contact, health or payment data). Users can reset memory in Settings → Agent.", surface: "both", risk: 2, permission: "agent.use",
    input: z.object({ key: z.string().regex(/^[a-z][a-z0-9_.]{1,59}$/), value: z.string().min(1).max(500), kind: z.enum(["preference", "fact", "summary"]).optional(), scope: z.enum(["workspace", "user"]).optional() }) }),
  t({ exposure: ["organizer", "provider"], id: "mission.wait_for", title: "Wait for a response", description: "Pause the mission until a request changes status (e.g. the provider responds) or N hours pass. Uses no model tokens while waiting.", surface: "both", risk: 0, permission: "agent.use",
    input: z.object({ item_id: id, hours: z.number().int().min(1).max(336).optional() }) }),
];
export const TOOL = new Map(TOOLS.map(x => [x.id, x]));

/**
 * Autonomy levels (release spec §21): always_ask = every mutation needs approval · draft = drafts only · execute_with_approval =
 * low-risk (R0–R2) automatic · operational = selected R3 tools automatic (auto_tools) · policy_autopilot = approved R3/R4 subsets
 * within thresholds. R5 (payout/identity/security/legal/destructive) is never automatic in any mode.
 */
export type Mode = "always_ask" | "suggest" | "draft" | "execute_with_approval" | "operational" | "policy_autopilot";
export type Policy = { mode: Mode; allowed_tools: string[] | null; auto_tools: string[]; autopilot_rules: { tool: string; max_amount_minor?: number; when?: Record<string, string> }[];
  quiet_hours: { from: string; to: string; tz: string } | null; min_confidence: number };
export const DEFAULT_POLICY: Policy = { mode: "execute_with_approval", allowed_tools: null, auto_tools: [], autopilot_rules: [], quiet_hours: { from: "21:00", to: "08:00", tz: "Europe/London" }, min_confidence: 0.6 };

/** §10 permission modes → per-step decision. Role permission is enforced separately (agent_invoke, as the human). */
export function decide(tool: Tool, input: Record<string, unknown>, p: Policy, confidence = 1): "auto" | "approval" | "blocked" | "suggest" {
  if (p.allowed_tools && !p.allowed_tools.includes(tool.id)) return "blocked";
  if (tool.risk >= 5) return "blocked";
  if (tool.risk === 0) return "auto";
  if (p.mode === "suggest") return "suggest";
  if (p.mode === "always_ask") return "approval";
  if (p.mode === "draft") return tool.risk <= 1 ? "auto" : "suggest";
  if (tool.risk <= 2) return "auto";
  if (confidence < p.min_confidence) return "approval";
  if (tool.risk === 3 && p.auto_tools.includes(tool.id) && (p.mode === "operational" || p.mode === "policy_autopilot")) return "auto";
  if (p.mode === "policy_autopilot") {
    const amount = tool.amountMinor?.(input) ?? 0;
    const rule = p.autopilot_rules.find(r => r.tool === tool.id && (r.max_amount_minor == null || amount <= r.max_amount_minor)
      && Object.entries(r.when ?? {}).every(([k, v]) => String(input[k]) === v));
    if (rule && tool.risk <= 4) return "auto";
  }
  return "approval";
}

/** Quiet hours defer external (R3+) actions; reads and drafts continue. */
export function inQuietHours(p: Policy, now = new Date()) {
  if (!p.quiet_hours) return false;
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: p.quiet_hours.tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const { from, to } = p.quiet_hours;
  return from > to ? hm >= from || hm < to : hm >= from && hm < to;
}

/**
 * Tool catalogue text for the planner: only tools this surface + policy allows. `actions: false` (plan without `agent.actions`, e.g.
 * Starter — coordinator decision 2026-10-29: Starter = R0–R2) hides R3/R4 so the planner never proposes what the database would refuse.
 */
export function catalogFor(surface: "organizer" | "provider", p: Policy, opts: { actions?: boolean } = {}) {
  return TOOLS.filter(x => x.exposure.includes(surface) && (!p.allowed_tools || p.allowed_tools.includes(x.id)) && x.risk < 5 && (opts.actions !== false || x.risk <= 2))
    .map(x => ({ id: x.id, risk: `R${x.risk}`, title: x.title, description: x.description, input: describe(x.input) }));
}
function describe(s: z.ZodTypeAny): unknown {
  if (s instanceof z.ZodObject) return Object.fromEntries(Object.entries(s.shape as Record<string, z.ZodTypeAny>).map(([k, v]) => [k, describe(v)]));
  if (s instanceof z.ZodOptional) return `${describe(s.unwrap() as z.ZodTypeAny)}?`;
  if (s instanceof z.ZodEnum) return (s.options as string[]).join("|");
  if (s instanceof z.ZodArray) return [describe(s.element as z.ZodTypeAny)];
  if (s instanceof z.ZodNumber) return "number";
  if (s instanceof z.ZodString) return "string";
  return "value";
}
