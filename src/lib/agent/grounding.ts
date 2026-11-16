// Gala Agent grounding (owner request 2026-11-16: "connected to the limits of the workspace … answers don't have enough info …
// it doesn't believe it's in Gala Dock"). One module gives every Gala Agent entry point (page Ask, agent-page Ask, the planner,
// the run summary and the provider chat) the same platform identity and the same live workspace facts: plan, capabilities,
// AI credits, plan limits, Agent policy, the person's role, today's date and zone. It also checks a proposed action against
// those limits BEFORE it is proposed, so the agent explains a limit instead of planning something the database will refuse.
// Pure apart from loadWorkspaceLimits (which takes the clients it reads with). No AI and no server-only imports, so specs load it.
import { TOOL, type Tool } from "./registry";

export type Surface = "organizer" | "provider";
type Q = { select(c: string): Q; eq(k: string, v: unknown): Q; maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> };
/** Structural Supabase client (callers pass their typed client `as never`). */
export type Rpc = { rpc(fn: string, args?: object): PromiseLike<{ data: unknown; error: { message: string } | null }>; from(t: string): Q };

export type Credits = { allowance: number; allowance_left: number; balance: number; available: number; used_this_month: number; used_today: number; pct: number;
  hard_cap: boolean; allow_overage: boolean; overage_limit: number; daily_limit: number | null; per_run_limit: number | null; soft_caps: number[]; deep_allowed: boolean };
export type PlanLimits = { plan: string; exempt?: boolean; events?: { used: number; max: number | null }; seats?: { used: number; max: number | null }; listings?: { used: number; max: number | null } };
export type AgentPolicyLimits = { mode: string; booking_authority_minor: number; refund_threshold_minor: number; daily_spend_cap_minor: number; monthly_spend_cap_minor: number;
  discount_authority_pct: number; allowed_tools: string[] | null; kill_switch: boolean; quiet_hours: { from: string; to: string; tz: string } | null };
export type WorkspaceLimits = {
  workspaceId: string; workspaceName: string | null; surface: Surface; role: string | null; plan: string;
  capabilities: { actions: boolean; deep: boolean; api: boolean };
  credits: Credits | null; planLimits: PlanLimits | null; policy: AgentPolicyLimits | null;
  timezone: string; currency: string; now: Date;
};

const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const gbp = (minor: number) => `£${(minor / 100).toLocaleString("en-GB", { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const credits = (n: number) => `${Math.floor(n).toLocaleString("en-GB")} credit${Math.floor(n) === 1 ? "" : "s"}`;
const lim = (x?: { used: number; max: number | null }) => x ? `${x.used} of ${x.max == null ? "unlimited" : x.max}` : "unknown";

/**
 * Reads the live limits. `user` is the signed-in person's RLS client where there is one (page Ask, agent page): credit status,
 * plan limits, Agent policy, role and workspace name are read AS THEM (the RPCs check membership). `service` is used only for
 * has_capability, which is not granted to `authenticated`, after membership has been checked by the caller (or, in the worker,
 * because there is no session; every read is scoped to the run's own workspace). Any failed read degrades to "unknown", never to
 * a permissive default.
 */
export async function loadWorkspaceLimits(user: Rpc, service: Rpc, workspaceId: string, userId: string, surface: Surface, opts: { timezone?: string; currency?: string; now?: Date } = {}): Promise<WorkspaceLimits> {
  const cap = (c: string) => service.rpc("has_capability", { p_workspace: workspaceId, p_capability: c });
  const [cr, pl, pol, mem, ws, a, d, api] = await Promise.all([
    user.rpc("ai_credit_status", { p_workspace: workspaceId }),
    user.rpc("plan_limit_status", { p_ws: workspaceId }),
    user.from("agent_policies").select("mode,booking_authority_minor,refund_threshold_minor,daily_spend_cap_minor,monthly_spend_cap_minor,discount_authority_pct,allowed_tools,kill_switch,quiet_hours").eq("workspace_id", workspaceId).maybeSingle(),
    user.from("workspace_members").select("role,status").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
    user.from("workspaces").select("name,plan").eq("id", workspaceId).maybeSingle(),
    cap("agent.actions"), cap("agent.deep"), cap("api.access"),
  ]);
  const c = (cr.error ? null : cr.data) as Record<string, unknown> | null;
  const p = (pl.error ? null : pl.data) as PlanLimits | null;
  const po = pol.data as Record<string, unknown> | null;
  const w = ws.data as { name?: string; plan?: string } | null;
  return {
    workspaceId, workspaceName: w?.name ?? null, surface, role: ((mem.data as { role?: string; status?: string } | null)?.status === "active" ? (mem.data as { role: string }).role : null),
    plan: String(p?.plan ?? w?.plan ?? "starter"),
    capabilities: { actions: a.data === true, deep: d.data === true, api: api.data === true },
    credits: c ? { allowance: num(c.allowance), allowance_left: num(c.allowance_left), balance: num(c.balance), available: num(c.available), used_this_month: num(c.used_this_month),
      used_today: num(c.used_today), pct: num(c.pct), hard_cap: c.hard_cap !== false, allow_overage: c.allow_overage === true, overage_limit: num(c.overage_limit),
      daily_limit: c.daily_limit == null ? null : num(c.daily_limit), per_run_limit: c.per_run_limit == null ? null : num(c.per_run_limit),
      soft_caps: Array.isArray(c.soft_caps) ? (c.soft_caps as unknown[]).map(x => num(x)) : [], deep_allowed: c.deep_allowed === true } : null,
    planLimits: p,
    policy: po ? { mode: String(po.mode ?? "execute_with_approval"), booking_authority_minor: num(po.booking_authority_minor), refund_threshold_minor: num(po.refund_threshold_minor),
      daily_spend_cap_minor: num(po.daily_spend_cap_minor), monthly_spend_cap_minor: num(po.monthly_spend_cap_minor), discount_authority_pct: num(po.discount_authority_pct),
      allowed_tools: Array.isArray(po.allowed_tools) ? po.allowed_tools as string[] : null, kill_switch: po.kill_switch === true,
      quiet_hours: (po.quiet_hours as AgentPolicyLimits["quiet_hours"]) ?? null } : null,
    timezone: opts.timezone ?? "Europe/London", currency: (opts.currency ?? "GBP").toUpperCase(), now: opts.now ?? new Date(),
  };
}

/** What Gala Dock is and who Gala Agent is. The model is told plainly that it IS inside Gala Dock (it kept doubting it). */
export function platformIdentity(surface: Surface): string {
  const who = surface === "provider"
    ? "You work for an events PROVIDER (venue, supplier, caterer, crew agency, talent) on Gala Dock: their listings, enquiries and requests from organisers, quotes, holds, bookings, calendar, crew, equipment and payouts."
    : "You work for an event ORGANISER on Gala Dock: their events, budgets, supplier requests and bookings, tickets, guests, run sheets, compliance, promotion, sales pipeline and payments.";
  return `IDENTITY: You are Gala Agent, the built-in AI assistant of Gala Dock. You are running inside Gala Dock right now, in this person's workspace — never say you are a general chatbot, that you "can't access" Gala Dock or that you are unsure which platform this is.
Gala Dock is the connected event platform: one place to PLAN events (budgets, timelines, tasks, readiness), SOURCE and BOOK venues and suppliers from the marketplace (requests, quotes, holds, standby cover, contracts), SELL tickets (tiers, presales, resales, seating maps, check-in), PROMOTE (campaigns, pages), RUN the day (run sheets, crew, live operations, compliance) and SETTLE (payments through Stripe, supplier payouts, refunds, reports). Customers buy tickets and book; organisers and providers run their businesses; Gala Agent helps organisers and providers only (never customers).
${who}
What you can do: read this workspace's records with your tools, explain and compare them, draft messages, plans, posters and quotes for a human to review, create internal tasks, and prepare actions (messages, holds, standby, bookings, cancellations, putting tickets on sale) that a person approves before anything happens.
What you can't do: pay, refund, sign, publish or contact anyone without a person's approval; change permissions, security, payouts or legal terms (never); see other workspaces or anything outside this person's access; promise availability, prices or compliance that the records don't show.`;
}

/** Live workspace facts for the system prompt (they are Gala Dock's own data, not third-party text, so they sit outside <data>). */
export function workspaceFacts(l: WorkspaceLimits, page?: string | null): string {
  const lines = [`WORKSPACE (live, read just now): "${l.workspaceName ?? "this workspace"}" — ${l.surface} workspace on the ${planName(l.plan)} plan. The person is the workspace ${l.role ?? "member"}.`];
  lines.push(`Today: ${l.now.toLocaleDateString("en-GB", { timeZone: l.timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" })}, ${l.now.toLocaleTimeString("en-GB", { timeZone: l.timezone, hour: "2-digit", minute: "2-digit" })} ${l.timezone}. Currency ${l.currency}.`);
  lines.push(`Gala Agent capabilities on this plan: reads, drafts and internal tasks — yes; external actions and commitments (messages, holds, standby, bookings, cancellations, ticket publishing) — ${l.capabilities.actions ? "yes, each one approved by a person" : "NO (needs Pro or above; you can still read, draft and create tasks)"}; deep mode — ${l.capabilities.deep && l.credits?.deep_allowed !== false ? "yes" : "no"}; API access — ${l.capabilities.api ? "yes" : "no"}.`);
  const c = l.credits;
  if (c) lines.push(`AI credits (1 credit = 1p): ${credits(c.available)} available now — ${credits(c.allowance_left)} of the ${credits(c.allowance)} monthly allowance left (${c.pct}% used), ${credits(c.balance)} bought, ${credits(c.used_today)} used today${c.daily_limit != null ? ` of a ${credits(c.daily_limit)} daily limit` : ""}; per-task limit ${c.per_run_limit != null ? credits(c.per_run_limit) : "none"}; ${c.hard_cap ? `hard cap on${c.allow_overage ? `, approved overage up to ${credits(c.overage_limit)}` : ", no overage"}` : "no hard cap"}.`);
  else lines.push("AI credits: status unavailable.");
  const p = l.planLimits;
  if (p) lines.push(`Plan limits: active events ${lim(p.events)}, team seats ${lim(p.seats)}${l.surface === "provider" ? `, live listings ${lim(p.listings)}` : ""}${p.exempt ? " (this workspace is exempt from plan limits)" : ""}.`);
  const po = l.policy;
  if (po) lines.push(`Agent policy: mode ${po.mode.replace(/_/g, " ")}; booking authority ${po.booking_authority_minor > 0 ? `${gbp(po.booking_authority_minor)} (above that only the owner can approve)` : "not set (every commitment is approved by a person)"}; spend caps ${po.daily_spend_cap_minor > 0 ? `${gbp(po.daily_spend_cap_minor)}/day` : "no daily cap"}, ${po.monthly_spend_cap_minor > 0 ? `${gbp(po.monthly_spend_cap_minor)}/month` : "no monthly cap"}; refunds above ${po.refund_threshold_minor > 0 ? gbp(po.refund_threshold_minor) : "£0"} need a person${po.quiet_hours ? `; quiet hours ${po.quiet_hours.from}–${po.quiet_hours.to} (${po.quiet_hours.tz}) delay external actions` : ""}${po.allowed_tools ? `; only ${po.allowed_tools.length} tools allowed by the owner` : ""}${po.kill_switch ? "; GALA AGENT IS SWITCHED OFF for this workspace" : ""}.`);
  else lines.push("Agent policy: defaults (every external action or commitment needs a person's approval).");
  const warn = limitWarnings(l);
  if (warn.length) lines.push(`LIMITS TO MENTION when relevant: ${warn.join(" ")}`);
  if (page) lines.push(`CURRENT PAGE: the person is looking at ${page.replace(/\s+/g, " ").slice(0, 300)}. Assume questions like "this", "here" or "it" are about it.`);
  return lines.join("\n");
}

/** Plain-language limit warnings (used in the prompt and in refusals). */
export function limitWarnings(l: WorkspaceLimits): string[] {
  const out: string[] = [];
  const c = l.credits;
  if (c && c.hard_cap && c.available < 1) out.push("The workspace has no AI credits left this month: an owner can buy a credit pack or approve overage in Settings → Agent.");
  else if (c && c.allowance > 0 && c.soft_caps.some(s => c.pct >= s)) out.push(`The workspace has used ${c.pct}% of its monthly AI allowance.`);
  if (c && c.daily_limit != null && c.used_today >= c.daily_limit) out.push("Today's Gala Agent limit is reached; it resets at midnight UTC.");
  const p = l.planLimits;
  if (p && !p.exempt && p.events?.max != null && p.events.used >= p.events.max) out.push(`Active events are at the plan limit (${p.events.used}/${p.events.max}): finish or archive an event, or upgrade, before adding another.`);
  if (p && !p.exempt && p.seats?.max != null && p.seats.used >= p.seats.max) out.push(`Team seats are full (${p.seats.used}/${p.seats.max}).`);
  if (!l.capabilities.actions) out.push(`External actions need Pro or above (this workspace is on ${planName(l.plan)}); you can read, draft and create tasks.`);
  if (l.policy?.kill_switch) out.push("Gala Agent is switched off for this workspace by an owner or manager.");
  return out;
}

const planName = (p: string) => ({ starter: "Starter", pro: "Pro", business: "Business", enterprise: "Enterprise", internal: "Internal" } as Record<string, string>)[p] ?? p;

/** Instructions for well-grounded answers (shared by every answer prompt). */
export const ANSWER_STYLE = `How to answer:
- Lead with the direct answer in one or two sentences, then the specifics: names, dates (with zone), amounts, counts and statuses taken from the records or tool results. Cite records by name, with their "link" value as a markdown link when one is given (copy the path exactly, e.g. [Neon Nights Festival](/organizer/events/…)); never link tool names or use "#" links.
- Use short headings or bullets when there is more than one point (for example Result, Details, Risks, Next steps). Aim for depth over brevity: a useful answer usually has 4–10 specific points.
- If the records don't contain what is needed, say exactly what is missing and which Gala Dock page or tool would show it. Never invent records, ids, prices or availability.
- When an action would help, say what you would prepare, who must approve it, and any limit that applies (plan, credits, booking authority, spend caps). If a limit blocks it, say so plainly and what to do instead.
- Questions about Gala Dock itself, your role, plan, credits or limits: answer from IDENTITY and WORKSPACE above.`;

export type Gate = { ok: true; note?: string } | { ok: false; code: string; message: string };
/**
 * Checks one proposed tool call against the workspace's live limits before it is proposed (planner) — the database re-checks all
 * of it on execution (agent_execute_tool / agent_governance_refusal); this is the explanation, not the enforcement.
 */
export function gateTool(l: WorkspaceLimits, tool: Pick<Tool, "id" | "risk" | "title" | "amountMinor">, input: Record<string, unknown> = {}): Gate {
  if (l.policy?.kill_switch) return { ok: false, code: "workspace_kill_switch", message: "Gala Agent is switched off for this workspace. An owner or manager can switch it back on in Settings → Agent." };
  if (tool.risk >= 5) return { ok: false, code: "risk_r5_never", message: `${tool.title}: Gala Agent never does this kind of action — do it yourself from the relevant page.` };
  if (l.policy?.allowed_tools && !l.policy.allowed_tools.includes(tool.id)) return { ok: false, code: "policy_blocks_tool", message: `${tool.title} isn't allowed by this workspace's Agent policy. An owner can allow it in Settings → Agent.` };
  if (tool.risk >= 3 && !l.capabilities.actions) return { ok: false, code: "plan_not_entitled", message: `${tool.title} is an external action, which needs the Pro plan or above (this workspace is on ${planName(l.plan)}). I can draft it for you to send yourself, or an owner can upgrade in Settings → Billing.` };
  if (l.policy?.mode === "suggest" && tool.risk >= 1) return { ok: false, code: "policy_suggest_only", message: `The Agent policy is "suggest only", so I can't carry out ${tool.title}; I'll describe it for you to do.` };
  if (l.policy?.mode === "draft" && tool.risk >= 2) return { ok: false, code: "policy_draft_only", message: `The Agent policy is "drafts only", so ${tool.title} isn't allowed; I can save a draft instead.` };
  const amount = tool.amountMinor?.(input) ?? 0;
  if (amount > 0 && l.policy) {
    if (l.policy.monthly_spend_cap_minor > 0 && amount > l.policy.monthly_spend_cap_minor) return { ok: false, code: "exceeds_monthly_spend_cap", message: `${tool.title} for ${gbp(amount)} is above the workspace's monthly Agent spend cap of ${gbp(l.policy.monthly_spend_cap_minor)}. Do it yourself, or an owner can raise the cap in Settings → Agent.` };
    if (l.policy.daily_spend_cap_minor > 0 && amount > l.policy.daily_spend_cap_minor) return { ok: false, code: "exceeds_daily_spend_cap", message: `${tool.title} for ${gbp(amount)} is above the daily Agent spend cap of ${gbp(l.policy.daily_spend_cap_minor)}. Do it yourself, or an owner can raise the cap in Settings → Agent.` };
    if (tool.risk >= 4 && l.policy.booking_authority_minor > 0 && amount > l.policy.booking_authority_minor) return { ok: true, note: `${gbp(amount)} is above the ${gbp(l.policy.booking_authority_minor)} booking authority, so only the workspace owner can approve it.` };
  }
  if (tool.risk >= 3) return { ok: true, note: `${tool.title} needs a person's approval before anything happens.` };
  return { ok: true };
}

/** Credits gate before any model call: a clear message instead of a generic failure (ai_preflight still enforces it). */
export function creditBlock(l: WorkspaceLimits): string | null {
  const c = l.credits;
  if (l.policy?.kill_switch) return "Gala Agent is switched off for this workspace. An owner or manager can switch it back on in Settings → Agent.";
  if (c && c.hard_cap && c.available < 1) return `This workspace has used its Gala Agent credits for the month (${credits(c.allowance)} allowance, ${credits(c.balance)} bought). An owner can buy a credit pack or approve overage in Settings → Agent; the allowance renews on the 1st.`;
  if (c && c.daily_limit != null && c.used_today >= c.daily_limit) return `This workspace has reached today's Gala Agent limit (${credits(c.daily_limit)}). It resets at midnight UTC, or an owner can raise it in Settings → Agent.`;
  return null;
}

/** Planner gate: removes steps the live limits don't allow (with the explanation) and collects approval notes for the rest. */
export function gateSteps<S extends { tool: string; input?: Record<string, unknown> }>(l: WorkspaceLimits, steps: S[]) {
  const kept: S[] = [], blocked: { tool: string; code: string; message: string }[] = [], notes: string[] = [];
  for (const s of steps) {
    const tool = TOOL.get(s.tool);
    if (!tool) continue;
    const g = gateTool(l, tool, s.input ?? {});
    if (!g.ok) { blocked.push({ tool: s.tool, code: g.code, message: g.message }); continue; }
    if (g.note && !notes.includes(g.note)) notes.push(g.note);
    kept.push(s);
  }
  return { steps: kept, blocked, notes };
}

/** Answer clean-up (live QA 2026-11-16): the model sometimes copied JSON-escaped paths ("\/organizer\/…") into links and linked
 *  tool names to "#". Links become plain in-app paths; "#" links become plain text. Pure. */
export function tidyAnswer(text: string): string {
  return text.replace(/\]\(([^)\s]*)\)/g, (_, href: string) => `](${href.split("\\/").join("/")})`).replace(/\[([^\]]+)\]\(#\)/g, "$1");
}

/** What the person reads when the planner's steps hit a limit: the limit first (and what to do), then what is still planned. */
export function limitSummary(planSummary: string, report: { blocked: { tool: string; message: string }[]; notes: string[] }, keptSteps: number): string {
  if (!report.blocked.length) return [planSummary, ...report.notes].filter(Boolean).join("\n\n").trim();
  const limits = report.blocked.map(b => `- ${b.message}`).join("\n");
  if (!keptSteps) return `I can’t do this as asked because of this workspace’s limits:\n${limits}\nNothing was changed.`;
  return `Part of this is over a limit, so I left it out:\n${limits}\n\nWhat I can still do: ${planSummary}${report.notes.length ? `\n\n${report.notes.join(" ")}` : ""}`.trim();
}

export type IndexedEvent = { id: string; name: string; starts_at: string | null; status: string };
const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";
const DATED = new RegExp(String.raw`\b(\d{1,2}(st|nd|rd|th)?\s+(${MONTHS})|(${MONTHS})\s+\d{1,2}|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}|today|tonight|tomorrow|next (week|one|event)|this (week|weekend|friday|saturday))\b`, "i");
/**
 * Live QA (2026-11-16): for a recurring series ("Create a task on Warehouse Sessions …") the planner kept picking one date. When the
 * goal names a series with more than one upcoming event, gives no date and no event id, the run asks which one instead. Pure.
 */
export function ambiguousEvent(goal: string, events: IndexedEvent[], now = new Date()): IndexedEvent[] | null {
  const g = goal.toLowerCase();
  if (DATED.test(goal) || /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(goal)) return null;
  const upcoming = events.filter(e => e.status !== "cancelled" && e.status !== "completed" && (!e.starts_at || Date.parse(e.starts_at) > now.getTime() - 12 * 36e5));
  const key = (n: string) => n.toLowerCase().split(/[:—–(]| - /)[0]!.trim();
  const named = upcoming.filter(e => { const k = key(e.name); return k.length >= 6 && g.includes(k); });
  const byKey = new Map<string, IndexedEvent[]>();
  for (const e of named) byKey.set(key(e.name), [...(byKey.get(key(e.name)) ?? []), e]);
  const hit = [...byKey.values()].find(list => list.length > 1);
  return hit ? hit.sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))) : null;
}
export function ambiguityQuestion(list: IndexedEvent[], tz = "Europe/London"): string {
  const d = (s: string | null) => s ? new Date(s).toLocaleDateString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "no date";
  return `Which "${list[0]!.name.split(/[:—–(]| - /)[0]!.trim()}" do you mean? There are ${list.length} upcoming: ${list.slice(0, 8).map(e => `${e.name} on ${d(e.starts_at)} (${e.status})`).join("; ")}. Tell me the date and I’ll plan it. Nothing was changed.`;
}

/** Plain-language tool error for the answer prompt (live QA: the model quoted "permission_denied:finance.read" verbatim). Pure. */
export function toolErrorText(raw: string): string {
  const perm = /permission_denied:([a-z_.]+)/.exec(raw);
  if (perm) return `no access: this person's role doesn't include the "${perm[1]}" permission in this workspace. An owner or manager can change roles in Settings, Team.`;
  if (/not_found|P0002/.test(raw)) return "not found: no such record in this workspace.";
  if (/not_authorized/.test(raw)) return "no access: this person can't see that record.";
  if (/invalid_input/.test(raw)) return "not called: the request didn't identify a valid record.";
  if (/kill_switch/.test(raw)) return "Gala Agent is switched off for this workspace.";
  return `the read failed (${raw.replace(/[^\w :.,'-]/g, "").slice(0, 120)}).`;
}
