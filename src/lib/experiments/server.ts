import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Q36 experiments (domains 229–230). Assignment is server-side and deterministic (HMAC bucket of salt + pseudonymous unit) and
 * sticky (persisted on first assignment). Control is served whenever the experiment is not running, the global kill switch
 * (flags registry `experiments.emergency_off`) is on, the user opted out (consent purpose `experiments`), the unit is not targeted,
 * outside traffic, in a holdout or already in another experiment of the same layer.
 *
 * Safety invariant: variant config can only carry presentation keys (the database refuses money, inventory, capacity, refund,
 * tax, verification, safety and legal keys for every kind). Payment, ticketing and safety code must never read experiment config.
 */
export type Assignment = { experiment: string; variant: string | null; config: Record<string, unknown>; inExperiment: boolean; reason: string };
type Rpc = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };
const svc = () => createAdminClient() as unknown as Rpc;

/** Per-request cached assignment (one DB round trip per experiment per request). Never throws: errors serve control. */
export const getVariant = cache(async (key: string, userId: string | null, workspaceId: string | null): Promise<Assignment> => {
  try {
    const { data, error } = await svc().rpc("experiment_assign", { p_key: key, p_user: userId, p_workspace: workspaceId });
    if (error || !data) return { experiment: key, variant: null, config: {}, inExperiment: false, reason: "error" };
    const d = data as { experiment: string; variant: string | null; config?: Record<string, unknown>; in_experiment: boolean; reason: string };
    return { experiment: d.experiment, variant: d.variant, config: d.config ?? {}, inExperiment: d.in_experiment, reason: d.reason };
  } catch {
    return { experiment: key, variant: null, config: {}, inExperiment: false, reason: "error" };
  }
});

/** Log an exposure when the variant is actually rendered (once per unit; later calls only bump the counter). Best effort. */
export async function exposeVariant(key: string, userId: string | null, workspaceId: string | null, surface = "") {
  try { await svc().rpc("experiment_expose", { p_key: key, p_user: userId, p_workspace: workspaceId, p_surface: surface }); } catch { /* never blocks rendering */ }
}

/** Convenience: assign and, when in the experiment (or its holdout), log the exposure. */
export async function variantFor(key: string, userId: string | null, workspaceId: string | null, surface = "") {
  const a = await getVariant(key, userId, workspaceId);
  if (a.reason === "assigned" || a.reason === "holdout") void exposeVariant(key, userId, workspaceId, surface);
  return a;
}

// ── Admin reads/commands (as the signed-in admin; SQL checks the settings permission + MFA) ─────────────────────────────
async function asAdmin<T>(fn: string, args: Record<string, unknown> = {}) {
  const { data, error } = await ((await createClient()) as unknown as Rpc).rpc(fn, args);
  return error ? { ok: false as const, error: error.message } : { ok: true as const, data: data as T };
}
export const experimentsOverview = () => asAdmin<{ killed: boolean; experiments: unknown[]; holdouts: unknown[] }>("admin_experiments_overview");
export const evaluateExperiment = (id: string) => asAdmin<Record<string, unknown>>("experiment_evaluate", { p_id: id });
export const saveExperiment = (def: Record<string, unknown>, variants: Record<string, unknown>[], reason: string) =>
  asAdmin<string>("admin_experiment_save", { p_def: def, p_variants: variants, p_reason: reason });
export type ExperimentAction = "submit" | "approve" | "reject" | "start" | "pause" | "resume" | "stop" | "complete" | "archive" | "reopen";
export const transitionExperiment = (id: string, action: ExperimentAction, reason: string) =>
  asAdmin<Record<string, unknown>>("admin_experiment_transition", { p_id: id, p_action: action, p_reason: reason });
