// Gala Dock — entitlements & plan-limit layer (F2).
//
// Central, server-side gate used by AI, automations, ticketing, seats, storage, etc.
// Wraps the live RPCs `has_plan(_min_plan, _workspace_id)` and `get_plan_limit(_metric, _plan)`
// and produces a consistent 402 + upgrade message so every gated surface behaves the same.
//
// Plan ordering uses the live `app_plan` enum. Marketing labels: pro = "Growth",
// business = "Scale" (see PLAN_LABELS). See docs/MASTER-PLAN.md §5 and docs/specs/README.md (F2).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type Plan = Database["public"]["Enums"]["app_plan"];
export type UsageMetric = Database["public"]["Enums"]["usage_metric"];

/** Monotonic rank of plans for "X or higher" comparisons. trial/free share the floor. */
export const PLAN_RANK: Record<Plan, number> = {
  trial: 1,
  free: 1,
  starter: 2,
  pro: 3,
  business: 4,
  enterprise: 5,
};

/** Customer-facing labels (marketing names) for each app_plan value. */
export const PLAN_LABELS: Record<Plan, string> = {
  trial: "Trial",
  free: "Free",
  starter: "Starter",
  pro: "Growth",
  business: "Scale",
  enterprise: "Enterprise",
};

export type Entitlement =
  | { ok: true }
  | { ok: false; status: 402; requiredPlan: Plan; message: string };

/** Pure comparison — does `current` meet `required` (or higher)? */
export function meetsPlan(current: Plan, required: Plan): boolean {
  return PLAN_RANK[current] >= PLAN_RANK[required];
}

/** Consistent upgrade-prompt copy used across every gated surface. */
export function upgradeMessage(required: Plan): string {
  return `This feature requires the ${PLAN_LABELS[required]} plan or higher. Upgrade to unlock it.`;
}

function deny(required: Plan): Entitlement {
  return { ok: false, status: 402, requiredPlan: required, message: upgradeMessage(required) };
}

/**
 * Server-side plan gate via the `has_plan` RPC (RLS-safe — only resolves for the
 * caller's own workspace). Returns a discriminated result; on any error we fail closed.
 */
export async function requirePlan(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  minPlan: Plan
): Promise<Entitlement> {
  const { data, error } = await supabase.rpc("has_plan", {
    _min_plan: minPlan,
    _workspace_id: workspaceId,
  });
  if (error || data !== true) return deny(minPlan);
  return { ok: true };
}

/**
 * The numeric limit for a usage metric on a given plan, via `get_plan_limit`.
 * Returns 0 on error (fail closed). A negative value from the RPC conventionally means
 * "unlimited" — callers should treat < 0 as no cap.
 */
export async function planLimit(
  supabase: SupabaseClient<Database>,
  plan: Plan,
  metric: UsageMetric
): Promise<number> {
  const { data, error } = await supabase.rpc("get_plan_limit", { _metric: metric, _plan: plan });
  if (error || typeof data !== "number") return 0;
  return data;
}

/** Convenience: is a metric unlimited for this plan? */
export async function isUnlimited(
  supabase: SupabaseClient<Database>,
  plan: Plan,
  metric: UsageMetric
): Promise<boolean> {
  return (await planLimit(supabase, plan, metric)) < 0;
}
