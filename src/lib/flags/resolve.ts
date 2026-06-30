// Gala Dock — feature-flag resolver (F1).
//
// Resolves the final flag map for a workspace by combining, in order:
//   1. env master switch  (hard kill — ships V1.5/V2 code dark)
//   2. release-stage gate  (version)
//   3. persona gate        (workspace_type)
//   4. per-workspace override (beta cohort / kill-switch) — still respects the plan gate
//   5. plan gate           (entitlement)
//   6. registry default
//
// Resolve ONCE at the layout level and pass the map down via context, so sub-routes
// cannot leak a hidden surface. Every gate is evaluated server-side.
//
// See docs/MASTER-PLAN.md §4 and docs/specs/README.md (F1).

import {
  FLAGS,
  RELEASE_STAGES,
  type FlagKey,
  type FlagSpec,
  type PlanGate,
  type ReleaseStage,
  type WorkspaceType,
} from "./registry";

/** Rank of the live app_plan values; trial/free share the floor. */
const PLAN_RANK: Record<string, number> = {
  trial: 1,
  free: 1,
  starter: 2,
  pro: 3,
  business: 4,
  enterprise: 5,
};

const PLAN_GATE_RANK: Record<PlanGate, number> = {
  starter: 2,
  pro: 3,
  business: 4,
  enterprise: 5,
};

function stageRank(s: ReleaseStage): number {
  return RELEASE_STAGES.indexOf(s);
}

function planAllows(plan: string, gate?: PlanGate): boolean {
  if (!gate) return true;
  return (PLAN_RANK[plan] ?? 0) >= PLAN_GATE_RANK[gate];
}

export type ResolveInput = {
  workspaceType: WorkspaceType;
  releaseStage: ReleaseStage;
  /** Current app_plan value of the workspace (trial | free | starter | pro | business | enterprise). */
  plan: string;
  /** Per-workspace overrides by flag key (e.g. from a beta cohort or admin kill-switch). */
  overrides?: Partial<Record<FlagKey, boolean>>;
  /** Env reader; defaults to process.env. Inject for tests. */
  env?: Record<string, string | undefined>;
};

export type FlagMap = Record<FlagKey, boolean>;

function resolveOne(spec: FlagSpec, key: FlagKey, input: ResolveInput): boolean {
  const env = input.env ?? process.env;

  // 1. env master switch — hard kill
  if (spec.envSwitch && env[spec.envSwitch] !== "true") return false;

  // 2. release-stage gate
  if (stageRank(spec.minVersion) > stageRank(input.releaseStage)) return false;

  // 3. persona gate
  if (spec.workspaceTypes && !spec.workspaceTypes.includes(input.workspaceType)) return false;

  // 4. per-workspace override (cannot bypass the plan gate)
  const override = input.overrides?.[key];
  if (typeof override === "boolean") {
    if (override && !planAllows(input.plan, spec.planGate)) return false;
    return override;
  }

  // 5. plan gate
  if (!planAllows(input.plan, spec.planGate)) return false;

  // 6. registry default
  return spec.default === "on";
}

/** Resolve every flag for a workspace into a boolean map. */
export function resolveFlags(input: ResolveInput): FlagMap {
  const out = {} as FlagMap;
  for (const key of Object.keys(FLAGS) as FlagKey[]) {
    out[key] = resolveOne(FLAGS[key], key, input);
  }
  return out;
}

/** Resolve a single flag. */
export function isFlagEnabled(key: FlagKey, input: ResolveInput): boolean {
  return resolveOne(FLAGS[key], key, input);
}
