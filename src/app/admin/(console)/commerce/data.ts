import "server-only";
import { stripeLive } from "@/lib/stripe";
import { rows, type Db } from "@/lib/workspace/db";
import { requestTime } from "@/lib/workspace/format";
import { totalsByCurrency, formatTotals, type CurrencyTotal } from "@/lib/i18n/money";

export type Tx = {
  id: string; workspace_id: string | null; event_id: string | null; kind: string; category: string; description: string; amount: number; status: string; source: string;
  fee_amount: number; net_amount: number | null; counterparty: string; stripe_ref: string | null; occurred_at: string; currency?: string | null; details: Record<string, unknown> & { provider?: string; disputed?: boolean; held?: boolean; subscriptions?: number; cancelled?: number; reference?: string };
};
export type MoneyRequest = { id: string; kind: string; status: string; transaction_id: string | null; partner_id: string | null; case_id: string | null; amount: number; reason: string; requested_by_name: string; created_at: string };

export const PERIODS: Record<string, { label: string; days: number }> = { "30d": { label: "Last 30 days", days: 30 }, "7d": { label: "Last 7 days", days: 7 }, "90d": { label: "Last 90 days", days: 90 } };
export const periodOf = (v: unknown) => (typeof v === "string" && v in PERIODS ? v : "30d");

const num = (v: unknown) => Number(v ?? 0);
/** Q75: period totals aggregated in SQL (admin_commerce_summary, SECURITY INVOKER so the same RLS applies). The row list below is capped
 *  at LEDGER_ROWS for the table/charts; before this, 90-day GMV, revenue, queue and health figures silently summed only those rows. */
export type Totals = { gmv: number; platform: number; ticketing: number; marketplace: number; subscription: number; venue: number; supplier: number; other_fees: number; n: number;
  failed: number; held: number; refunds: number; disputes: number; sub_issues: number; payout_fails: number; ok: number; pending: number; failed_all: number;
  sub_count: number; sub_cancelled: number; mrr: number; payouts_paid: number; payouts_pending: number; payouts_pending_n: number; payouts_failed_n: number };
export const LEDGER_ROWS = 5000;
const TOTAL_KEYS = ["gmv", "platform", "ticketing", "marketplace", "subscription", "venue", "supplier", "other_fees", "n", "failed", "held", "refunds", "disputes", "sub_issues",
  "payout_fails", "ok", "pending", "failed_all", "sub_count", "sub_cancelled", "mrr", "payouts_paid", "payouts_pending", "payouts_pending_n", "payouts_failed_n"] as const;
/** A period with no lines comes back as {} → every figure 0. */
export const totals = (v: unknown): Totals => { const o = (v ?? {}) as Record<string, unknown>; return Object.fromEntries(TOTAL_KEYS.map(k => [k, num(o[k])])) as Totals; };
/** Money figures (never added across currencies); every other key is a count and is summed. */
export const MONEY_KEYS = ["gmv", "platform", "ticketing", "marketplace", "subscription", "venue", "supplier", "other_fees", "mrr", "payouts_paid", "payouts_pending"] as const;
export type MoneyKey = typeof MONEY_KEYS[number];
/**
 * Q75 (i18n C12): admin_commerce_summary returns {cur: {GBP: totals, EUR: totals}, prev: {...}}. `cur` / `prev` here hold the counts
 * summed over currencies and the money figures of the MAIN currency only (GBP when present); `money(key)` lists one figure per
 * currency, and `multi` says a single comparable total doesn't exist (deltas are then not shown).
 */
export function periodTotals(summary: { cur?: unknown; prev?: unknown; by_currency?: boolean }) {
  const by = (v: unknown): Record<string, Totals> => summary.by_currency
    ? Object.fromEntries(Object.entries((v ?? {}) as Record<string, unknown>).map(([c, x]) => [c.toUpperCase(), totals(x)]))
    : { GBP: totals(v) };   // pre-C12 function shape
  const curBy = by(summary.cur), prevBy = by(summary.prev);
  const currencies = [...new Set([...Object.keys(curBy), ...Object.keys(prevBy)])];
  const main = currencies.includes("GBP") || !currencies.length ? "GBP" : totalsByCurrency(Object.entries(curBy), ([, t]) => t.gmv, ([c]) => c)[0]?.currency ?? currencies[0]!;
  const merge = (m: Record<string, Totals>) => { const t = totals(m[main]); for (const [c, x] of Object.entries(m)) if (c !== main) for (const k of TOTAL_KEYS) if (!(MONEY_KEYS as readonly string[]).includes(k)) t[k] += x[k]; return t; };
  const list = (m: Record<string, Totals>, key: MoneyKey): CurrencyTotal[] => totalsByCurrency(Object.entries(m).filter(([, t]) => t[key] !== 0), ([, t]) => t[key], ([c]) => c, main);
  return { cur: merge(curBy), prev: merge(prevBy), main, multi: currencies.length > 1, currencies,
    money: (key: MoneyKey, when: "cur" | "prev" = "cur") => formatTotals(list(when === "cur" ? curBy : prevBy, key)),
    list: (key: MoneyKey, when: "cur" | "prev" = "cur") => list(when === "cur" ? curBy : prevBy, key) };
}
export type PeriodTotals = ReturnType<typeof periodTotals>;
/** Ledger lines newest first, paged in 1,000s (PostgREST caps a single response) up to `cap`. */
export async function ledgerRows(db: Db, fromMs: number, toMs: number, cap: number) {
  const out: Tx[] = [];
  for (let off = 0; off < cap; off += 1000) {
    const page = await rows<Tx>(db.from("transactions").select("id,workspace_id,event_id,kind,category,description,amount,status,source,fee_amount,net_amount,counterparty,stripe_ref,occurred_at,currency,details").eq("livemode", stripeLive())
      .gte("occurred_at", new Date(fromMs).toISOString()).lte("occurred_at", new Date(toMs).toISOString()).order("occurred_at", { ascending: false }).order("id").range(off, Math.min(cap, off + 1000) - 1));
    out.push(...page);
    if (page.length < Math.min(1000, cap - off)) break;
  }
  return out;
}
/** Ledger lines for the selected period and the one before it (deltas). Admin read is RLS-gated by has_admin_permission('commerce'). */
export async function loadLedger(db: Db, days: number) {
  const now = requestTime(), from = now - 2 * days * 864e5;
  const [summary, list, requests] = await Promise.all([
    db.rpc("admin_commerce_summary" as never, { p_days: days, p_now: new Date(now).toISOString(), p_livemode: stripeLive() } as never).then(r => {
      if (r.error) throw new Error(`admin_commerce_summary: ${r.error.message}`);
      return r.data as { cur: unknown; prev: unknown; by_currency?: boolean };
    }),
    ledgerRows(db, from, now, LEDGER_ROWS),
    rows<MoneyRequest>(db.from("admin_money_requests").select("id,kind,status,transaction_id,partner_id,case_id,amount,reason,requested_by_name,created_at").order("created_at", { ascending: false }).limit(500)),
  ]);
  const tx = list.map(t => ({ ...t, amount: num(t.amount), fee_amount: num(t.fee_amount), net_amount: t.net_amount === null ? null : num(t.net_amount), details: t.details ?? {} }));
  const split = now - days * 864e5;
  return { now, split, cur: tx.filter(t => new Date(t.occurred_at).getTime() >= split), prev: tx.filter(t => new Date(t.occurred_at).getTime() < split), requests: requests.map(r => ({ ...r, amount: num(r.amount) })),
    totals: periodTotals(summary), truncated: list.length >= LEDGER_ROWS };
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
