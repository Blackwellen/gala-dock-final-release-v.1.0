import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped, type Db } from "@/lib/workspace/db";
import { stripe } from "@/lib/stripe";

export const CHECKOUT_COOKIE = (eventId: string) => `gd_co_${eventId.replace(/-/g, "").slice(0, 12)}`;
export type Line = { tier_id: string; name: string; unit: number; qty: number; seats: string[] };
export type Summary = { kind: "primary" | "resale"; lines: Line[]; subtotal: number; fee: number; commission: number; total: number; expiresAt: string | null; currency: string };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Prices an order from what the database actually holds for this token (never from client input). `db` may be the caller's own client. */
export async function summarise(eventId: string, token: string, db: Db = untyped(createAdminClient() as never)): Promise<Summary> {
  const [{ data: holds }, { data: resale }, { data: tiers }, { data: fee }] = await Promise.all([
    db.rpc("checkout_holds", { p_event: eventId, p_token: token }),
    db.rpc("resale_holds_for", { p_token: token }),
    db.from("ticket_tiers").select("id,name,price").eq("event_id", eventId),
    db.rpc("ticket_fee_config"),
  ]);
  const h = (holds ?? { ga: [], seats: [] }) as { ga: { tier_id: string; qty: number; expires_at: string }[]; seats: { seat_key: string; label: string; tier_id: string; expires_at: string }[] };
  const tier = new Map((tiers ?? []).map((t: { id: string; name: string; price: number }) => [t.id, t]));
  const lines = new Map<string, Line>();
  for (const g of h.ga) { const t = tier.get(g.tier_id); if (t) lines.set(g.tier_id, { tier_id: g.tier_id, name: t.name, unit: Number(t.price), qty: g.qty, seats: [] }); }
  for (const s of h.seats) { const t = tier.get(s.tier_id); if (!t) continue; const l = lines.get(s.tier_id) ?? { tier_id: s.tier_id, name: t.name, unit: Number(t.price), qty: 0, seats: [] }; l.qty += 1; l.seats.push(s.label || s.seat_key); lines.set(s.tier_id, l); }
  // Resale listings held by this token become their own lines (one order is either primary or resale).
  const rs = ((resale ?? []) as { ticket_id: string; tier_id: string; tier: string; seat: string | null; price: number; expires_at: string }[]);
  for (const r of rs) { const key = `resale:${r.tier_id}:${r.price}`; const l = lines.get(key) ?? { tier_id: r.tier_id, name: `${r.tier} (resale)`, unit: Number(r.price), qty: 0, seats: [] }; l.qty += 1; if (r.seat) l.seats.push(r.seat); lines.set(key, l); }
  const cfg = (fee ?? { fixed: 0, pct_bps: 0 }) as { fixed?: number; pct_bps?: number; seller_bps?: number };
  const list = [...lines.values()];
  const subtotal = r2(list.reduce((a, l) => a + l.unit * l.qty, 0));
  const feeAmt = r2(list.reduce((a, l) => a + (l.unit > 0 ? l.qty * (Number(cfg.fixed ?? 0) + (l.unit * Number(cfg.pct_bps ?? 0)) / 10000) : 0), 0));
  // Seller commission on primary sales (deducted from the organiser's proceeds, never added to the buyer's price).
  const commission = rs.length ? 0 : r2(subtotal * Number(cfg.seller_bps ?? 0) / 10000);
  const exp = [...h.ga.map(g => g.expires_at), ...h.seats.map(s => s.expires_at), ...rs.map(r => r.expires_at)].sort()[0] ?? null;
  return { kind: rs.length ? "resale" : "primary", lines: list, subtotal, fee: feeAmt, commission, total: r2(subtotal + feeAmt), expiresAt: exp, currency: "GBP" };
}

/** Issues tickets for a paid (or free) order exactly once. Safe to call from both the redirect and the webhook. */
export async function finalise(orderRef: string) {
  const db = untyped(createAdminClient() as never);
  const { data: o } = await db.from("checkout_orders").select("*").eq("order_ref", orderRef).maybeSingle();
  if (!o) return { ok: false as const, error: "order_not_found" };
  if (o.status === "issued") return { ok: true as const, order: o };
  if (o.amount > 0) {
    if (!o.stripe_session) return { ok: false as const, error: "not_paid" };
    const s = await stripe<{ payment_status: string; amount_total: number; metadata: Record<string, string> }>(`checkout/sessions/${o.stripe_session}`);
    if (s.payment_status !== "paid" || s.metadata.order_ref !== orderRef || s.amount_total !== Math.round((Number(o.amount) + Number(o.fee)) * 100)) return { ok: false as const, error: "not_paid" };
    await db.from("checkout_orders").update({ status: "paid", updated_at: new Date().toISOString() }).eq("order_ref", orderRef).eq("status", "pending");
  }
  const { data: prof } = await db.from("profiles").select("full_name").eq("id", o.buyer_id).maybeSingle();
  const { error } = await db.rpc(o.kind === "resale" ? "issue_resale" : "issue_checkout", { p_token: o.token, p_order_ref: orderRef, p_attendee: prof?.full_name ?? "", p_holder: o.buyer_id });
  if (error) {
    // Paid but the hold had lapsed: refund automatically rather than keep money without tickets.
    if (o.amount > 0 && /hold_expired|seat_unavailable/.test(error.message)) {
      const s = await stripe<{ payment_intent: string }>(`checkout/sessions/${o.stripe_session}`);
      await stripe("refunds", { payment_intent: s.payment_intent, "metadata[order_ref]": orderRef }).catch(() => null);
      await db.from("checkout_orders").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("order_ref", orderRef);
      return { ok: false as const, error: "hold_expired_refunded" };
    }
    await db.from("checkout_orders").update({ status: "failed", updated_at: new Date().toISOString() }).eq("order_ref", orderRef);
    return { ok: false as const, error: error.message };
  }
  await db.rpc("attribute_referral", { p_order_ref: orderRef }); // promoter credit (no-op without a valid referral)
  // A claimed waitlist offer becomes "purchased" once its order is issued (§52).
  await db.from("ticket_waitlist").update({ status: "purchased" }).eq("event_id", o.event_id).eq("user_id", o.buyer_id).eq("status", "converted");
  return { ok: true as const, order: { ...o, status: "issued" } };
}
