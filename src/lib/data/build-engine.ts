import "server-only";
import { untyped } from "@/lib/workspace/db";

/**
 * Q15 build engine reads (migration 202610291029). All money is integer minor units (pence). Guidance is deterministic
 * rules (`source: "rules:v1"`, `ai: false`) — the customer workspace has no AI (owner decision 2026-10-28).
 */
export type BudgetSummary = {
  event_id: string; currency: string; target_minor: number | null;
  estimated_minor: number; quoted_minor: number; held_minor: number; committed_minor: number; paid_minor: number; booking_fees_paid_minor: number;
  outstanding_committed_minor: number; forecast_minor: number; remaining_minor: number | null; remaining_after_committed_minor: number | null;
  lines: number; unpriced_lines: number; contingency_minor: number; contingency_lines: number;
  scenarios: { committed_only: number; with_holds: number; with_quotes: number; everything: number; everything_with_backups: number };
  categories: Record<string, { estimated_minor: number; quoted_minor: number; held_minor: number; committed_minor: number; lines: number }>;
  category_targets_minor: Record<string, number>;
  warnings: { code: "no_budget" | "over_budget" | "near_budget" | "category_over" | "unpriced" | "payment_due_soon"; text: string; amount_minor?: number; category?: string; count?: number }[];
};
export type DependencyState = {
  event_id: string; date_set: boolean; venue_item_id: string | null; venue_gates_suppliers: boolean;
  venue_state: "missing" | "estimated" | "quoted" | "held" | "committed" | "confirmed_off_platform";
  lines: { build_item_id: string; category: string; status: string; role: string; depends_on: ("date" | "venue")[]; blocked_reason: "date_required" | "venue_required" | null; conditional_on_venue: boolean }[];
};
export type PlanningGuidance = {
  event_id: string; source: "rules:v1"; ai: false;
  planning_window: { days_to_event: number | null; recommended_lead_days: number; state: "no_date" | "comfortable" | "tight" | "late" };
  final_numbers_due: string | null;
  booking_deadlines: { category: string; label: string; need: string; book_by: string | null; state: "done" | "in_progress" | "overdue" | "due_soon" | "not_started" }[];
  supplier_deadlines: { build_item_id: string; title: string; kind: "response" | "hold_expires"; due_at: string }[];
  payment_dates: { payee: string; kind: string; amount_minor: number; due_at: string | null; status: string }[];
  recommended_dates: { date: string; reason: string }[];
  next_steps: { code: string; text: string; category?: string }[];
  readiness: { done: number; of: number };
};
export type BuildCanvas = {
  event: { id: string; name: string; event_type: string; status: string; management: string; starts_at: string | null; guest_count: number; city: string; currency: string };
  categories: { category: string; label: string; need: "foundation" | "required" | "optional"; share_pct: number; depends_on_venue: boolean;
    lines: { build_item_id: string; title: string; listing_id: string | null; status: string; canonical_status: string; bucket: string; role: string; amount_minor: number | null; package: string; package_id: string | null; backup_for: string | null }[] }[];
  other_lines: { build_item_id: string; category: string; title: string; status: string; role: string }[];
  dependencies: DependencyState; budget: BudgetSummary; guidance: PlanningGuidance;
  order_groups: { id: string; reference: string; status: string; totals: Record<string, unknown> }[];
  versions: { version: number; label: string; created_at: string }[];
};

type Client = Parameters<typeof untyped>[0];
const call = async <T,>(client: Client, fn: string, args: Record<string, unknown>): Promise<T | null> => {
  const { data, error } = await untyped(client).rpc(fn, args);
  return error ? null : (data as T);
};

/** One read for the build canvas: categories for the event type, lines, dependencies, budget, guidance, orders, versions. */
export const loadBuildCanvas = (client: Client, eventId: string) => call<BuildCanvas>(client, "event_build_canvas", { p_event: eventId });
export const loadBudgetSummary = (client: Client, eventId: string) => call<BudgetSummary>(client, "event_budget_summary", { p_event: eventId });
export const loadPlanningGuidance = (client: Client, eventId: string) => call<PlanningGuidance>(client, "event_planning_guidance", { p_event: eventId });
export const loadDependencyState = (client: Client, eventId: string) => call<DependencyState>(client, "build_dependency_state", { p_event: eventId });
