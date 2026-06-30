// Gala Dock — Event money layer (EB-E). Loads deposits, splits, budget and invoices for an event
// and runs the profitability engine, giving one source of truth for the budget/profitability tab,
// settlement and the Copilot /event-pnl command. Workspace-scoped + RLS. Money in pence.

import { createClient } from "@/lib/supabase/server";
import { computeProfitability, type MoneyLine, type ProfitSplit, type Profitability } from "./profitability";

export interface DepositSummary {
  totalCents: number;
  paidCents: number;
  pendingCents: number;
  refundableCents: number;
}

export interface EventMoney {
  deposits: DepositSummary;
  splits: ProfitSplit[];
  profitability: Profitability;
}

export async function getEventMoney(workspaceId: string, eventId: string): Promise<EventMoney> {
  const supabase = await createClient();

  const [depositsRes, splitsRes, budgetRes, invoiceRes] = await Promise.all([
    supabase.from("event_deposits").select("amount_cents, status, refundable").eq("workspace_id", workspaceId).eq("event_id", eventId).is("deleted_at", null),
    supabase.from("event_splits").select("party_name, pct, fixed_cents").eq("workspace_id", workspaceId).eq("event_id", eventId).is("deleted_at", null),
    supabase.from("event_budget_lines").select("category, unit_cost_cents, status").eq("workspace_id", workspaceId).eq("event_id", eventId),
    supabase.from("invoices").select("total_cents, paid_cents, status").eq("workspace_id", workspaceId).eq("event_id", eventId),
  ]);

  const depositRows = depositsRes.data ?? [];
  const deposits: DepositSummary = {
    totalCents: depositRows.reduce((a, d) => a + (d.amount_cents ?? 0), 0),
    paidCents: depositRows.filter((d) => d.status === "paid").reduce((a, d) => a + (d.amount_cents ?? 0), 0),
    pendingCents: depositRows.filter((d) => d.status === "pending" || d.status === "partial").reduce((a, d) => a + (d.amount_cents ?? 0), 0),
    refundableCents: depositRows.filter((d) => d.refundable).reduce((a, d) => a + (d.amount_cents ?? 0), 0),
  };

  const splits: ProfitSplit[] = (splitsRes.data ?? []).map((s) => ({
    name: s.party_name,
    pct: Number(s.pct) || 0,
    fixedCents: s.fixed_cents ?? 0,
  }));

  const budget: MoneyLine[] = (budgetRes.data ?? []).map((b) => ({
    category: b.category,
    amountCents: b.unit_cost_cents ?? 0,
    confirmed: String(b.status) === "confirmed" || String(b.status) === "actual",
  }));

  const revenue: MoneyLine[] = (invoiceRes.data ?? []).map((i) => ({
    category: "Invoice",
    amountCents: i.total_cents ?? 0,
    confirmed: String(i.status) === "paid",
  }));

  const profitability = computeProfitability({ budget, revenue, splits });

  return { deposits, splits, profitability };
}
