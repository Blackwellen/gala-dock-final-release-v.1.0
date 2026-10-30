import { TOOL, decide, type Policy } from "./registry";

/**
 * Plan validation (Q41, domains 10 Reasoning / 13 Output + Action Validation). The model's plan is untrusted output: it is parsed,
 * every step must name a tool in the catalogue offered for this surface + policy, inputs must pass the tool's schema, ids may only be
 * literal UUIDs or "$stepN.field" references to earlier steps, R5 never appears, and the step count is capped. Pure; no I/O.
 */
export const MAX_STEPS = 12;
export type PlanStep = { tool: string; input: Record<string, unknown>; why: string };
export type ParsedPlan = { summary: string; scope: string[]; confidence: number | null; steps: PlanStep[]; dropped: { tool: string; reason: string }[] };

const REF = /^\$step(\d+)\.[a-z_]+$/;
const PLACEHOLDER = "00000000-0000-4000-8000-000000000000";
export function parsePlan(text: string, catalog: { id: string }[]): ParsedPlan {
  let raw: { interpretation?: { summary?: unknown; scope?: unknown }; confidence?: unknown; steps?: unknown } = {};
  try { raw = JSON.parse(text); } catch { /* invalid JSON → empty plan */ }
  const allowed = new Set(catalog.map(c => c.id));
  const steps: PlanStep[] = [], dropped: ParsedPlan["dropped"] = [];
  for (const s of (Array.isArray(raw.steps) ? raw.steps : []) as { tool?: unknown; input?: unknown; why?: unknown }[]) {
    const id = String(s?.tool ?? "");
    const tool = TOOL.get(id);
    if (!tool || !allowed.has(id)) { dropped.push({ tool: id, reason: "not_in_catalogue" }); continue; }
    if (tool.risk >= 5) { dropped.push({ tool: id, reason: "risk_r5_never" }); continue; }
    const input = s.input && typeof s.input === "object" && !Array.isArray(s.input) ? s.input as Record<string, unknown> : {};
    // References may only point backwards to earlier steps (no forward or self references).
    const badRef = Object.values(input).some(v => typeof v === "string" && v.startsWith("$") && (!REF.test(v) || Number(REF.exec(v)![1]) > steps.length));
    if (badRef) { dropped.push({ tool: id, reason: "bad_reference" }); continue; }
    // A field filled by a "$stepN.x" reference validates with a placeholder UUID; the resolved value is validated again at execution.
    const filled = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, typeof v === "string" && REF.test(v) ? PLACEHOLDER : v]));
    const check = tool.input.safeParse(filled);
    if (!check.success) { dropped.push({ tool: id, reason: "invalid_input" }); continue; }
    if (steps.length >= MAX_STEPS) { dropped.push({ tool: id, reason: "too_many_steps" }); continue; }
    steps.push({ tool: id, input, why: String(s.why ?? "").slice(0, 400) });
  }
  const conf = Number(raw.confidence);
  return { summary: String(raw.interpretation?.summary ?? "").slice(0, 1000), scope: Array.isArray(raw.interpretation?.scope) ? (raw.interpretation!.scope as unknown[]).map(String).slice(0, 20) : [],
    confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : null, steps, dropped };
}

/** What would happen to each step under a policy (no execution): auto, approval, blocked or suggest. */
export function preview(plan: ParsedPlan, policy: Policy, confidence = plan.confidence ?? 1) {
  return plan.steps.map(s => ({ tool: s.tool, risk: TOOL.get(s.tool)!.risk, decision: decide(TOOL.get(s.tool)!, s.input, policy, confidence) }));
}
