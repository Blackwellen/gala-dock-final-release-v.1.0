import { TOOL, type Risk } from "./registry";

/**
 * Gala Agent typed skill registry (Q42 Organizer Agent, Q43 Provider Agent; backend domain 2). A skill is a reviewed bundle of
 * registry tools (bindings) plus an ordered mission template, a model tier and a plan gate. Skills never add capabilities: every
 * step still runs through agent_execute_tool as the human, inside the run's workspace, under the policy and plan.
 * Single source of truth: scripts/gen-agent-tools.mjs seeds `agent_skills` from this file (registry = seed = live is tested).
 * No skill is ever exposed to the customer workspace (owner decision); the CHECK on agent_skills enforces it.
 */
export type Tier = "fast" | "standard" | "deep";
export type Level = "basic" | "medium" | "advanced" | "enterprise";
export type Category = "organizer" | "provider" | "venue" | "supplier" | "ticket" | "finance" | "promotion" | "operations" | "emergency";
export type Skill = {
  id: string; version: number; title: string; description: string; surface: "organizer" | "provider"; level: Level; category: Category;
  /** Tools the planner may use for this skill (subset of the surface catalogue). */
  tools: string[];
  /** Ordered mission template (tool ids, `mission.wait_for` = durable pause until the provider/counterparty responds). */
  mission: string[];
  /** Preferred model tier; routeTier() lowers it when the plan or budget doesn't allow it. */
  tier: Tier;
  /** Highest risk among bound tools; R3/R4 need the `agent.actions` plan capability (Starter = R0–R2). */
  maxRisk: Risk;
  planCapability: string | null;
};
const s = (x: Omit<Skill, "version" | "maxRisk" | "planCapability"> & { version?: number }): Skill => {
  const maxRisk = Math.max(0, ...x.tools.map(id => TOOL.get(id)?.risk ?? 5)) as Risk;
  return { version: 1, ...x, maxRisk, planCapability: maxRisk >= 3 ? "agent.actions" : null };
};

export const SKILLS: Skill[] = [
  // ── Organizer (Q42): required missions
  s({ id: "org.create_event_plan", title: "Create an event plan", description: "Turn a brief into a checked plan: feasibility, budget, calendar clashes, a task list and a draft plan.", surface: "organizer", level: "advanced", category: "organizer",
    tools: ["events.list", "event.feasibility", "event.budget", "calendar.upcoming", "event.conflicts", "task.create", "draft.note", "memory.recall"],
    mission: ["memory.recall", "event.feasibility", "event.budget", "calendar.upcoming", "task.create", "draft.note"], tier: "deep" }),
  s({ id: "org.source_venue", title: "Source a venue", description: "Rank venues for the event, ask the best one to hold the date and wait for its answer.", surface: "organizer", level: "medium", category: "venue",
    tools: ["venues.rank", "marketplace.search", "marketplace.open_requests", "message.party", "marketplace.request_hold", "mission.wait_for", "event.readiness"],
    mission: ["venues.rank", "marketplace.request_hold", "mission.wait_for", "event.readiness"], tier: "standard" }),
  s({ id: "org.source_suppliers", title: "Source suppliers", description: "Find suppliers per category, message them, wait for responses and summarise the options.", surface: "organizer", level: "medium", category: "supplier",
    tools: ["marketplace.search", "marketplace.open_requests", "message.party", "marketplace.request_hold", "mission.wait_for", "event.budget"],
    mission: ["marketplace.open_requests", "marketplace.search", "message.party", "mission.wait_for", "event.budget"], tier: "standard" }),
  s({ id: "org.ticket_strategy", title: "Build a ticket strategy", description: "Break-even, current sales and map bindings into tiered pricing; publishing a tier needs approval.", surface: "organizer", level: "advanced", category: "ticket",
    tools: ["tickets.sales", "event.break_even", "map.bindings", "event.budget", "draft.note", "tickets.publish_tier"],
    mission: ["tickets.sales", "event.break_even", "map.bindings", "draft.note"], tier: "standard" }),
  s({ id: "org.promotion_plan", title: "Build a promotion plan", description: "Read the promotion calendar and campaign results, draft a plan and a poster. Never sends a campaign.", surface: "organizer", level: "medium", category: "promotion",
    tools: ["campaigns.calendar", "campaigns.report", "tickets.sales", "media.list_designs", "media.event_poster", "draft.note"],
    mission: ["campaigns.calendar", "tickets.sales", "media.event_poster", "draft.note"], tier: "standard" }),
  s({ id: "org.readiness_review", title: "Run a readiness review", description: "Readiness, compliance, hospitality, logistics, map and partners in one review with tasks for the gaps.", surface: "organizer", level: "advanced", category: "operations",
    tools: ["event.readiness", "compliance.overview", "hospitality.summary", "logistics.overview", "map.validate", "partners.overview", "event.ops_readiness", "task.create"],
    mission: ["event.readiness", "compliance.overview", "hospitality.summary", "logistics.overview", "map.validate", "partners.overview", "task.create"], tier: "standard" }),
  s({ id: "org.emergency_recovery", title: "Emergency supplier recovery", description: "A supplier dropped out: raise an Emergency Supply request, wait for offers, activate standby only with approval.", surface: "organizer", level: "enterprise", category: "emergency",
    tools: ["marketplace.open_requests", "emergency.create", "marketplace.request_standby", "mission.wait_for", "standby.activate", "message.party", "event.readiness"],
    mission: ["marketplace.open_requests", "emergency.create", "mission.wait_for", "standby.activate", "event.readiness"], tier: "standard" }),
  s({ id: "org.event_day_command", title: "Event-day command", description: "Live operations: ops readiness, conflicts, team clashes and online attendance, with tasks for issues.", surface: "organizer", level: "advanced", category: "operations",
    tools: ["event.ops_readiness", "event.conflicts", "team.conflicts", "virtual.attendance", "stock.report", "task.create", "message.party"],
    mission: ["event.ops_readiness", "event.conflicts", "team.conflicts", "task.create"], tier: "fast" }),
  s({ id: "org.post_event_closeout", title: "Post-event closeout", description: "Payables, budget against actuals, ticket results and partner deliverables; a closeout draft for the team.", surface: "organizer", level: "medium", category: "finance",
    tools: ["money.payables", "event.budget", "tickets.sales", "partners.overview", "draft.note", "task.create"],
    mission: ["money.payables", "event.budget", "tickets.sales", "partners.overview", "draft.note"], tier: "standard" }),
  // ── Organizer basics
  s({ id: "org.ask", title: "Answer a question", description: "Read-only answers about events, calendar, sales and money.", surface: "organizer", level: "basic", category: "organizer",
    tools: ["events.list", "event.readiness", "event.budget", "tickets.sales", "calendar.upcoming", "money.payables", "comms.inbox", "memory.recall"], mission: [], tier: "fast" }),
  s({ id: "org.sales_followup", title: "Sales follow-up", description: "Review a client and draft the next message for a human to send.", surface: "organizer", level: "basic", category: "organizer",
    tools: ["sales.client", "comms.inbox", "draft.note"], mission: ["sales.client", "draft.note"], tier: "fast" }),
  // ── Provider (Q43): required missions
  s({ id: "pro.find_work", title: "Find suitable work", description: "Open requests that fit your availability and listings, ranked by deadline.", surface: "provider", level: "basic", category: "provider",
    tools: ["opportunities.list", "opportunities.sla", "listing.availability", "calendar.conflicts", "memory.recall"], mission: ["opportunities.sla", "listing.availability"], tier: "fast" }),
  s({ id: "pro.draft_quote", title: "Draft a quote", description: "Check availability and draft a priced quote; sending it is a commitment that needs approval within your pricing authority.", surface: "provider", level: "medium", category: "supplier",
    tools: ["opportunities.list", "listing.availability", "calendar.conflicts", "quote.draft", "quote.send"], mission: ["listing.availability", "quote.draft"], tier: "standard" }),
  s({ id: "pro.protect_sla", title: "Protect response SLA", description: "Requests close to their response deadline: answer available / clarification / decline (never a conflicting job).", surface: "provider", level: "medium", category: "provider",
    tools: ["opportunities.sla", "calendar.conflicts", "opportunity.respond", "reliability.get"], mission: ["opportunities.sla", "reliability.get", "opportunity.respond"], tier: "fast" }),
  s({ id: "pro.allocate_resources", title: "Allocate team and equipment", description: "Assign crew and reserve equipment for confirmed jobs; clashes and over-allocation are refused.", surface: "provider", level: "medium", category: "operations",
    tools: ["bookings.upcoming", "calendar.conflicts", "crew.assign", "equipment.allocate"], mission: ["bookings.upcoming", "crew.assign", "equipment.allocate"], tier: "standard" }),
  s({ id: "pro.venue_occupancy", title: "Manage venue occupancy", description: "Space conflicts and holds for upcoming bookings; place a hold only within policy.", surface: "provider", level: "advanced", category: "venue",
    tools: ["bookings.upcoming", "calendar.conflicts", "listing.availability", "venue.hold"], mission: ["bookings.upcoming", "calendar.conflicts", "venue.hold"], tier: "standard" }),
  s({ id: "pro.emergency_work", title: "Handle emergency work", description: "Offer an emergency availability window and answer emergency requests that don't clash.", surface: "provider", level: "advanced", category: "emergency",
    tools: ["opportunities.list", "calendar.conflicts", "availability.emergency_window", "opportunity.respond"], mission: ["opportunities.list", "calendar.conflicts", "availability.emergency_window"], tier: "fast" }),
  s({ id: "pro.prepare_delivery", title: "Prepare delivery", description: "Upcoming jobs, crew, equipment and messages to the organiser before the event.", surface: "provider", level: "medium", category: "operations",
    tools: ["bookings.upcoming", "comms.inbox", "message.party", "draft.note"], mission: ["bookings.upcoming", "comms.inbox", "draft.note"], tier: "standard" }),
  s({ id: "pro.reconcile_payout", title: "Reconcile payout", description: "Protected, releasing and released amounts against payout readiness and trust status.", surface: "provider", level: "basic", category: "finance",
    tools: ["money.provider_summary", "money.release_readiness", "trust.summary", "draft.note"], mission: ["money.provider_summary", "money.release_readiness", "trust.summary"], tier: "fast" }),
  s({ id: "pro.listing_health", title: "Listing health", description: "What each listing still needs before it can be published or booked.", surface: "provider", level: "basic", category: "provider",
    tools: ["listing.readiness", "trust.summary", "draft.note"], mission: ["listing.readiness", "trust.summary"], tier: "fast" }),
];
export const SKILL = new Map(SKILLS.map(x => [x.id, x]));

/** Problems with the skill registry (empty = valid). Checked in tests and before seeding. */
export function skillInvariants() {
  const problems: string[] = [];
  for (const k of SKILLS) {
    for (const id of new Set([...k.tools, ...k.mission])) {
      const t = TOOL.get(id);
      if (!t) problems.push(`${k.id}: unknown tool ${id}`);
      else if (!t.exposure.includes(k.surface)) problems.push(`${k.id}: ${id} not exposed to ${k.surface}`);
      else if (t.risk >= 5) problems.push(`${k.id}: binds R5 ${id}`);
    }
    for (const id of k.mission) if (!k.tools.includes(id)) problems.push(`${k.id}: mission step ${id} not bound`);
    if ((k.surface as string) === "customer") problems.push(`${k.id}: customer surface`);
  }
  return problems;
}

/**
 * Model routing per task tier (domain 11). The skill's tier is the request; the plan and budget decide what is served:
 * deep needs the `agent.deep` capability (Business+) and otherwise falls back to standard; when the workspace has little credit
 * left (or the run is a routine), basic/medium work drops to fast. Azure only — llm.ts maps the tier to a deployment.
 */
export function routeTier(skill: Pick<Skill, "tier" | "level"> | null, o: { deepAllowed: boolean; lowCredit?: boolean; routine?: boolean; requested?: Tier | null }): Tier {
  let t: Tier = o.requested ?? skill?.tier ?? "standard";
  if (t === "deep" && !o.deepAllowed) t = "standard";
  if ((o.lowCredit || o.routine) && t !== "fast" && (!skill || skill.level === "basic" || skill.level === "medium")) t = "fast";
  return t;
}

/**
 * Memory data minimisation (domain 9), mirrored by the database (agent_memory_remember refuses the same). Memory is for working
 * preferences and facts about the business, never people: no email addresses, phone numbers, card / bank numbers, health or
 * dietary data, passwords or tokens.
 */
const BLOCKED_MEMORY: RegExp[] = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/,                                // email
  /(\d[\s().-]?){10,}/,                                       // phone / card / account numbers (10+ digits)
  /\b(allerg|dietary|vegan|halal|kosher|medical|diagnos|disabilit|pregnan|medication|health)/i,
  /\b(password|passcode|api[_ -]?key|secret|token|sort code|iban)\b/i,
];
export function memoryRefusal(value: string): string | null {
  for (const r of BLOCKED_MEMORY) if (r.test(value)) return "memory_sensitive_data";
  return value.trim().length === 0 ? "memory_empty" : null;
}
