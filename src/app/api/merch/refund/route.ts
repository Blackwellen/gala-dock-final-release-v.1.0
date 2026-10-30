import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { rateLimit, sameOrigin } from "@/lib/security";
import { merchDeps } from "@/lib/payments/merch";
import { executeMerchCardRefund } from "@/lib/payments/merch-service";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const REASONS = new Set(["provider_cancelled", "event_cancelled", "platform_cancelled", "customer_cancelled", "goodwill", "partial_service_failure", "duplicate"]);

/**
 * Q40 → Q07 · Staff refund of merchandise lines. Authorisation, line limits and restock run in `merch_request_refund` as the
 * signed-in user (refunds.approve); for a charged order it queues a card refund that is executed here on the organiser's
 * connected account (and retried by the 'merch.card_refunds' job if Stripe is unavailable).
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "Please sign in." }, 401);
  if (!(await rateLimit(`merch-refund:${user.id}`, 20, 300))) return json({ error: "Too many attempts — please wait a few minutes." }, 429);
  const body = await request.json().catch(() => null) as { order_ref?: string; lines?: { merch_item_id: string; qty: number }[]; restock?: boolean; reason?: string } | null;
  const ref = String(body?.order_ref ?? ""), reason = String(body?.reason ?? "customer_cancelled");
  const lines = Array.isArray(body?.lines) ? body!.lines.filter(l => /^[0-9a-f-]{36}$/i.test(String(l?.merch_item_id)) && Number.isInteger(l?.qty) && l.qty > 0).map(l => ({ merch_item_id: l.merch_item_id, qty: l.qty })) : [];
  if (!/^GD-M-[A-Z0-9]{10}$/.test(ref) || !lines.length || !REASONS.has(reason)) return json({ error: "Choose the items to refund." }, 400);
  const { data, error } = await (sb as unknown as { rpc: (f: string, a: object) => Promise<{ data: unknown; error: { message: string } | null }> })
    .rpc("merch_request_refund", { p_order_ref: ref, p_lines: lines, p_restock: body?.restock !== false, p_reason: reason });
  if (error) {
    if (/not_authorized/.test(error.message)) return json({ error: "You don’t have permission to refund this order." }, 403);
    if (/refund_exceeds_order|not_refundable|empty_refund/.test(error.message)) return json({ error: "Those items can’t be refunded." }, 409);
    return json({ error: "Couldn’t refund the order. Please try again." }, 500);
  }
  const r = data as { refund_minor: number; card_refund: "queued" | "none"; card_refund_id: string | null };
  let card: string = r.card_refund;
  if (r.card_refund_id) {
    const deps = merchDeps(untyped(createAdminClient() as never));
    card = deps ? (await executeMerchCardRefund(deps, r.card_refund_id)).result : "queued";
  }
  return json({ refund_minor: r.refund_minor, card_refund: card });
}
