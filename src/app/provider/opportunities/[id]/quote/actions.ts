"use server";

import { getProvider } from "@/lib/provider/context";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";

export type QuotePayload = {
  items: { label: string; detail: string; qty: number; unit: string; unit_price: number; kind: string; ref?: string; image?: string }[];
  depositPct: number; validDays: number; message: string; terms: Record<string, unknown>;
};

/** Saves (or creates) the single open draft for this request. Totals are recomputed by the database. */
export async function saveQuoteDraft(itemId: string, quoteId: string | null, payload: QuotePayload, next?: "step1" | "step2"): Promise<ActionResult & { quoteId?: string }> {
  const { db, workspace } = await getProvider();
  const tax = ((workspace.settings as Record<string, Record<string, unknown>>)?.tax ?? {}) as { vat_registered?: boolean; rate_bps?: number };
  const items = payload.items.filter(i => i.label.trim()).map(i => ({ ...i, label: i.label.trim().slice(0, 120), detail: (i.detail ?? "").slice(0, 160),
    qty: Math.max(0, Number(i.qty) || 0), unit_price: Math.max(0, Math.round((Number(i.unit_price) || 0) * 100) / 100) }));
  const { data, error } = await db.rpc("provider_save_quote_draft", {
    p_item: itemId, p_quote: quoteId, p_items: items, p_tax_bps: tax.vat_registered ? Number(tax.rate_bps ?? 0) : 0,
    p_deposit_pct: Math.min(100, Math.max(0, Math.round(payload.depositPct))), p_valid_days: Math.min(90, Math.max(1, Math.round(payload.validDays))),
    p_terms: payload.terms, p_message: payload.message.slice(0, 4000),
  });
  if (error) return { ok: false, error: friendly(error) };
  const id = data as string;
  return { ok: true, quoteId: id, message: next ? undefined : "Draft saved",
    redirect: next === "step2" ? `/provider/opportunities/${itemId}/quote?step=2&quote=${id}` : next === "step1" ? `/provider/opportunities/${itemId}/quote?step=1&quote=${id}` : undefined };
}

/** Saves the final terms, then issues the draft as a sent version. */
export async function sendQuote(itemId: string, quoteId: string, payload: QuotePayload): Promise<ActionResult> {
  const saved = await saveQuoteDraft(itemId, quoteId, payload);
  if (!saved.ok) return saved;
  const { db } = await getProvider();
  const { error } = await db.rpc("provider_send_quote", { p_quote: saved.quoteId });
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true, message: "Quote sent to the client", redirect: `/provider/quotes/${saved.quoteId}` };
}
