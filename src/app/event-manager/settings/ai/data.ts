// Gala Dock — AI usage summary (settings). Live from the metering tables (ai_budgets cap +
// ai_usage_ledger spend) for the current month. "cents" = GBP pence.

import { createClient } from "@/lib/supabase/server";

export interface AiUsageSummary {
  capCents: number;
  spentCents: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  periodLabel: string;
}

export async function getAiUsageSummary(workspaceId: string): Promise<AiUsageSummary> {
  const supabase = await createClient();
  const now = new Date();
  const period = now.getUTCFullYear() * 100 + (now.getUTCMonth() + 1); // YYYYMM

  const [budgetRes, ledgerRes] = await Promise.all([
    supabase.from("ai_budgets").select("monthly_cost_cents_cap").eq("workspace_id", workspaceId).maybeSingle(),
    supabase
      .from("ai_usage_ledger")
      .select("cost_cents, input_tokens, output_tokens, call_count")
      .eq("workspace_id", workspaceId)
      .eq("period_yyyymm", period),
  ]);

  const rows = ledgerRes.data ?? [];
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + (f(r) || 0), 0);

  return {
    capCents: budgetRes.data?.monthly_cost_cents_cap ?? 0,
    spentCents: sum((r) => r.cost_cents),
    calls: sum((r) => r.call_count),
    inputTokens: sum((r) => r.input_tokens),
    outputTokens: sum((r) => r.output_tokens),
    periodLabel: now.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}
