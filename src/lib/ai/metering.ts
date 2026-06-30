// Gala Dock — AI budget metering (V1-2 Phase 2). Wraps the ai_budget_* RPCs so every Copilot
// call reserves against the workspace monthly cap, then reconciles real token cost. "cents" in
// the schema = GBP minor units (pence). Degrades gracefully if metering isn't configured.

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type AiSurface = Database["public"]["Enums"]["ai_surface"];

export interface BudgetReservation {
  ledgerId: string;
  blocked: boolean;
  capCents: number;
  spentAfter: number;
}

/** Reserve estimated spend. Returns null if metering is unavailable (caller proceeds unmetered). */
export async function reserveAiBudget(
  workspaceId: string,
  surface: AiSurface,
  estimatedCents: number
): Promise<BudgetReservation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ai_budget_reserve", {
    _workspace_id: workspaceId,
    _surface: surface,
    _estimated_cents: Math.max(1, Math.round(estimatedCents)),
  });
  const row = data?.[0];
  if (error || !row) return null;
  return { ledgerId: row.ledger_id, blocked: row.blocked, capCents: row.cap_cents, spentAfter: row.spent_cents_after };
}

/** Reconcile real cost + token usage after the call. */
export async function reconcileAiBudget(
  ledgerId: string,
  estimatedCents: number,
  actualCents: number,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("ai_budget_reconcile", {
    _ledger_id: ledgerId,
    _estimated_cents: Math.round(estimatedCents),
    _actual_cents: Math.max(0, Math.round(actualCents)),
    _input_tokens: inputTokens,
    _output_tokens: outputTokens,
  });
}

/** Refund a reservation when the call fails before producing usage. */
export async function refundAiBudget(ledgerId: string, estimatedCents: number): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("ai_budget_refund", { _ledger_id: ledgerId, _estimated_cents: Math.round(estimatedCents) });
}
