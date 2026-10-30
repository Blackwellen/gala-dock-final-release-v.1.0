import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { rateLimit, sameOrigin } from "@/lib/security";
import { merchDeps } from "@/lib/payments/merch";
import { createMerchDirectCheckout, type MerchOrder } from "@/lib/payments/merch-service";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/**
 * Q40 → Q07 · Pays a reserved merchandise order (from `merch_reserve`) by a direct charge on the organiser's connected account.
 * The buyer only names the order; amounts, lines and the fee come from the database. Browser redirects never mark anything
 * paid: the signed `payment_intent.succeeded` webhook does (merch_order_direct_paid).
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "Please sign in to pay for your order.", login: true }, 401);
  if (!(await rateLimit(`merch-checkout:${user.id}`, 12, 300))) return json({ error: "Too many attempts — please wait a few minutes." }, 429);
  const body = await request.json().catch(() => null) as { order_ref?: string } | null;
  const ref = String(body?.order_ref ?? "");
  if (!/^GD-M-[A-Z0-9]{10}$/.test(ref)) return json({ error: "Order not found." }, 400);
  const db = untyped(createAdminClient() as never);
  const { data: o } = await db.from("merch_orders").select("id,order_ref,workspace_id,event_id,buyer_id,status,total_minor,currency,expires_at,connected_account_id,application_fee_minor,stripe_checkout_session").eq("order_ref", ref).maybeSingle();
  if (!o || o.buyer_id !== user.id) return json({ error: "Order not found." }, 404);
  const [{ data: lines }, { data: ev }] = await Promise.all([
    db.from("merch_order_lines").select("qty,unit_minor,merch_items(name)").eq("order_id", o.id),
    o.event_id ? db.from("events").select("name,slug").eq("id", o.event_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const deps = merchDeps(db);
  if (!deps) return json({ error: "Card payments aren’t configured in this environment yet.", unavailable: true }, 503);
  const origin = new URL(request.url).origin, back = ev?.slug ? `${origin}/events/${ev.slug}` : `${origin}/account`;
  const r = await createMerchDirectCheckout(deps, {
    order: o as MerchOrder, eventName: ev?.name ?? "Event", customerEmail: user.email ?? "",
    lines: ((lines ?? []) as unknown as { qty: number; unit_minor: number; merch_items: { name: string } | { name: string }[] | null }[]).map(l => ({ name: (Array.isArray(l.merch_items) ? l.merch_items[0]?.name : l.merch_items?.name) ?? "Item", qty: Number(l.qty), unit_minor: Number(l.unit_minor) })),
    successUrl: `${back}?merch=${ref}`, cancelUrl: `${back}?merch_cancelled=${ref}`,
  });
  if (!r.ok) return json({ error: r.message, code: r.code }, r.code === "stripe_unavailable" ? 502 : r.code === "expired" ? 410 : 409);
  return json({ url: r.url });
}
