import "server-only";
import { getProvider } from "@/lib/provider/context";
import { rows } from "@/lib/workspace/db";
import { stripeLive } from "@/lib/stripe";
import { startOfDay, startOfMonth } from "@/lib/provider/queries";

export type Tx = { id: string; kind: string; category: string; description: string; amount: number; status: string; source: string; source_type: string | null; source_id: string | null;
  occurred_at: string; fee_amount: number; net_amount: number | null; currency: string; counterparty: string; stripe_ref: string | null };
export const PERIODS = { month: "This month", last_month: "Last month", "30d": "Last 30 days", "90d": "Last 90 days", ytd: "Year to date" } as const;
export type Period = keyof typeof PERIODS;

/** Resolves a period preset to [from, to) London instants plus the equal-length previous window for comparisons. */
export function periodRange(p: string, now = Date.now()) {
  const key = (p in PERIODS ? p : "month") as Period;
  const [from, to] = key === "month" ? [startOfMonth(0, now), startOfMonth(1, now)] : key === "last_month" ? [startOfMonth(-1, now), startOfMonth(0, now)]
    : key === "30d" ? [startOfDay(-29, now), startOfDay(1, now)] : key === "90d" ? [startOfDay(-89, now), startOfDay(1, now)]
    : [new Date(`${new Date(now).getUTCFullYear()}-01-01T00:00:00Z`).getTime(), startOfDay(1, now)];
  const len = to - from;
  return { key, from, to, prevFrom: from - len, prevTo: from, label: PERIODS[key] };
}

export async function loadMoney() {
  const ctx = await getProvider();
  const [txs, settings] = await Promise.all([
    rows<Tx>(ctx.db.from("transactions").select("id,kind,category,description,amount,status,source,source_type,source_id,occurred_at,fee_amount,net_amount,currency,counterparty,stripe_ref").eq("workspace_id", ctx.workspace.id).eq("livemode", stripeLive()).order("occurred_at", { ascending: false })),
    // Providers can't read platform_settings directly; plan_catalog() exposes only the published plans and payout schedule.
    ctx.db.rpc("plan_catalog").then(r => (r.data ? { value: r.data as { plans?: Record<string, { monthly: number; commission_bps: number }>; payout_schedule?: string } } : null)),
  ]);
  return { ctx, txs: txs.map(t => ({ ...t, amount: Number(t.amount), fee_amount: Number(t.fee_amount ?? 0), net_amount: t.net_amount === null ? null : Number(t.net_amount) })), plans: settings?.value.plans ?? {}, schedule: settings?.value.payout_schedule ?? "weekly" };
}
export const inRange = (t: { occurred_at: string }, a: number, b: number) => { const x = new Date(t.occurred_at).getTime(); return x >= a && x < b; };
export const net = (t: Tx) => t.net_amount ?? t.amount - t.fee_amount;
