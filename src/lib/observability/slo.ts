// Q34 (domain 217 SLOs): pure SLO arithmetic. The database computes the same numbers in public.ops_slo_calc() from the
// 5-minute rollups in public.ops_metric_rollups; tests assert the two agree. Definitions are data (public.ops_slo_definitions).
//   compliance        = good / (good + bad)                       (null with no events: no data never burns budget)
//   error budget      = 1 - objective                              (e.g. 99.5 % → 0.5 % of events may be bad)
//   budget consumed   = (bad / total) / error budget               (1.0 = the whole budget for the window is spent)
//   burn rate (w)     = (bad_w / total_w) / error budget           (1.0 = spending exactly on budget)
// Multi-window burn-rate alerts (Google SRE workbook): fast = 1 h and 5 min both ≥ fast threshold (default 14.4, i.e. 2 % of a
// 30-day budget in an hour); slow = 6 h and 30 min both ≥ slow threshold (default 6). A minimum event count stops one bad
// event in a quiet hour from paging anyone.

export type Counts = { good: number; bad: number };
export type SloDefinition = { key: string; objective: number; windowDays: number; fastBurn?: number; slowBurn?: number; minEvents?: number };
export type SloWindows = { window: Counts; h1: Counts; m5: Counts; h6: Counts; m30: Counts };

const total = (c: Counts) => c.good + c.bad;
const round = (n: number, dp = 6) => Math.round(n * 10 ** dp) / 10 ** dp;

export function compliance(c: Counts): number | null { const t = total(c); return t ? round(c.good / t) : null; }
export function errorBudget(objective: number) {
  if (!(objective > 0 && objective < 1)) throw new Error("objective must be between 0 and 1 (exclusive)");
  return round(1 - objective, 9);
}
export function burnRate(c: Counts, objective: number): number { const t = total(c); return t ? round((c.bad / t) / errorBudget(objective), 4) : 0; }
export function budgetRemaining(c: Counts, objective: number): number { const t = total(c); return t ? round(1 - (c.bad / t) / errorBudget(objective), 4) : 1; }

export type SloStatus = { key: string; objective: number; compliance: number | null; budget_remaining: number; burn_1h: number; burn_6h: number;
  events: number; state: "ok" | "no_data" | "slow_burn" | "fast_burn" | "breached"; fast_burning: boolean; slow_burning: boolean };

export function sloStatus(d: SloDefinition, w: SloWindows): SloStatus {
  const fast = d.fastBurn ?? 14.4, slow = d.slowBurn ?? 6, min = d.minEvents ?? 10;
  const events = total(w.window), comp = compliance(w.window), remaining = budgetRemaining(w.window, d.objective);
  const b1 = burnRate(w.h1, d.objective), b5 = burnRate(w.m5, d.objective), b6 = burnRate(w.h6, d.objective), b30 = burnRate(w.m30, d.objective);
  const slowBurning = events > 0 && total(w.h6) >= min && b6 >= slow && b30 >= slow;
  const fastBurning = events > 0 && total(w.h1) >= min && b1 >= fast && b5 >= fast;
  let state: SloStatus["state"] = events === 0 ? "no_data" : "ok";
  if (slowBurning) state = "slow_burn";
  if (fastBurning) state = "fast_burn";
  if (events >= min && remaining <= 0) state = "breached";
  return { key: d.key, objective: d.objective, compliance: comp, budget_remaining: remaining, burn_1h: b1, burn_6h: b6, events, state, fast_burning: fastBurning, slow_burning: slowBurning };
}

/** Nearest-rank percentile of latency samples in ms (what the rollup stores as p95_ms). */
export function percentile(samples: number[], p: number): number | null {
  if (!samples.length) return null;
  const s = [...samples].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}
