import "server-only";
import { rows, type Db } from "@/lib/workspace/db";
import { requestTime } from "@/lib/workspace/format";

export type Tx = {
  id: string; workspace_id: string | null; event_id: string | null; kind: string; category: string; description: string; amount: number; status: string; source: string;
  fee_amount: number; net_amount: number | null; counterparty: string; stripe_ref: string | null; occurred_at: string; details: Record<string, unknown> & { provider?: string; disputed?: boolean; held?: boolean; subscriptions?: number; cancelled?: number; reference?: string };
};
export type MoneyRequest = { id: string; kind: string; status: string; transaction_id: string | null; partner_id: string | null; case_id: string | null; amount: number; reason: string; requested_by_name: string; created_at: string };

export const PERIODS: Record<string, { label: string; days: number }> = { "30d": { label: "Last 30 days", days: 30 }, "7d": { label: "Last 7 days", days: 7 }, "90d": { label: "Last 90 days", days: 90 } };
export const periodOf = (v: unknown) => (typeof v === "string" && v in PERIODS ? v : "30d");

const num = (v: unknown) => Number(v ?? 0);
/** Ledger lines for the selected period and the one before it (deltas). Admin read is RLS-gated by has_admin_permission('commerce'). */
export async function loadLedger(db: Db, days: number) {
  const now = requestTime(), from = now - 2 * days * 864e5;
  const [list, requests] = await Promise.all([
    rows<Tx>(db.from("transactions").select("id,workspace_id,event_id,kind,category,description,amount,status,source,fee_amount,net_amount,counterparty,stripe_ref,occurred_at,details")
      .gte("occurred_at", new Date(from).toISOString()).lte("occurred_at", new Date(now).toISOString()).order("occurred_at", { ascending: false }).limit(5000)),
    rows<MoneyRequest>(db.from("admin_money_requests").select("id,kind,status,transaction_id,partner_id,case_id,amount,reason,requested_by_name,created_at").order("created_at", { ascending: false }).limit(500)),
  ]);
  const tx = list.map(t => ({ ...t, amount: num(t.amount), fee_amount: num(t.fee_amount), net_amount: t.net_amount === null ? null : num(t.net_amount), details: t.details ?? {} }));
  const split = now - days * 864e5;
  return { now, split, cur: tx.filter(t => new Date(t.occurred_at).getTime() >= split), prev: tx.filter(t => new Date(t.occurred_at).getTime() < split), requests: requests.map(r => ({ ...r, amount: num(r.amount) })) };
}

export const isSale = (t: Tx) => (t.kind === "income" || t.kind === "fee") && t.status !== "failed" && !t.details.disputed;
export const gmv = (l: Tx[]) => l.filter(isSale).reduce((a, t) => a + t.amount, 0);
export const platformRevenue = (l: Tx[]) => l.filter(isSale).reduce((a, t) => a + (t.source === "subscription" ? t.amount : t.fee_amount), 0);
export const bySource = (l: Tx[], s: string) => l.filter(t => isSale(t) && t.kind === "income" && t.source === s).reduce((a, t) => a + t.amount, 0);

/** Business label + status for a ledger line, as shown in the Admin ledger. */
export function typeOf(t: Tx) {
  if (t.details.disputed) return "Dispute";
  if (t.kind === "refund") return "Refund";
  if (t.kind === "payout") return "Payout";
  if (t.status === "failed" && t.kind === "payment") return "Failed Payment";
  return t.category || "Payment";
}
export function statusOf(t: Tx): { key: string; label: string } {
  if (t.details.disputed) return { key: "disputed", label: "Disputed" };
  if (t.details.held) return { key: "hold", label: "Held" };
  if (t.status === "failed") return { key: "failed", label: "Failed" };
  if (t.kind === "refund") return t.status === "completed" ? { key: "refunded", label: "Refunded" } : { key: "pending", label: "Refund pending" };
  if (t.kind === "payout") return t.status === "completed" ? { key: "paid", label: "Paid" } : { key: "processing", label: "Processing" };
  if (t.status === "pending" || t.status === "scheduled") return { key: "pending", label: "Pending" };
  return { key: "paid", label: "Paid" };
}
export const net = (t: Tx) => (t.net_amount === null ? null : t.net_amount);
