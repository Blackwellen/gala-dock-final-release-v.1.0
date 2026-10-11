import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { rateLimit, sameOrigin } from "@/lib/security";
import { stripe, stripeKey } from "@/lib/stripe";
import { CHECKOUT_COOKIE, summarise, finalise } from "@/lib/checkout";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/**
 * Creates the order for the buyer's current hold and returns a Stripe Checkout URL (or completes free orders immediately).
 * Amounts come from the held inventory in the database; the client only says which event.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "Please sign in to complete your order.", login: true }, 401);
  if (!(await rateLimit(`checkout:${user.id}`, 12, 300))) return json({ error: "Too many attempts — please wait a few minutes." }, 429);
  const body = await request.json().catch(() => null) as { event?: string } | null;
  const eventId = String(body?.event ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return json({ error: "Event not found." }, 400);
  const jar = await cookies(), token = jar.get(CHECKOUT_COOKIE(eventId))?.value, ref = jar.get("gd_ref")?.value ?? "";
  if (!token) return json({ error: "Your reservation has expired — please choose your tickets again.", expired: true }, 410);
  const sum = await summarise(eventId, token);
  if (!sum.lines.length || !sum.expiresAt || new Date(sum.expiresAt).getTime() < Date.now() + 30_000) return json({ error: "Your reservation has expired — please choose your tickets again.", expired: true }, 410);
  const { data: ev } = await sb.from("events").select("id,name,slug").eq("id", eventId).maybeSingle();
  if (!ev) return json({ error: "Event not found." }, 404);
  // gd_ref = "CODE:event-slug" from /r/[code]; it only counts for the event it was issued for.
  const [rc, rslug] = ref.split(":"), refCode = /^[A-Za-z0-9_-]{2,32}$/.test(rc ?? "") && rslug === ev.slug ? rc : null;
  const db = untyped(createAdminClient() as never);
  // Waiting room (§52): an order needs an admitted, unexpired, unused admission; creating the order uses it up.
  const qTok = jar.get(`gd_q_${eventId.replace(/-/g, "").slice(0, 12)}`)?.value ?? "";
  const { data: admittedOk } = await db.rpc("queue_admit_check", { p_event: eventId, p_token_hash: qTok ? createHash("sha256").update(qTok).digest("hex") : "", p_consume: true });
  if (admittedOk === false) return json({ error: "Your waiting-room slot has expired or hasn’t opened yet — please rejoin the queue.", queue: true }, 409);
  const orderRef = `GD-${randomBytes(5).toString("hex").toUpperCase()}`;
  await db.from("checkout_orders").update({ status: "expired", updated_at: new Date().toISOString() }).eq("token", token).eq("status", "pending");
  const { error: oe } = await db.from("checkout_orders").insert({ order_ref: orderRef, event_id: eventId, buyer_id: user.id, token, amount: sum.subtotal, fee: sum.fee, currency: "GBP", status: "pending", lines: sum.lines, kind: sum.kind, ref_code: refCode });
  if (oe) return json({ error: "Couldn’t create your order. Please try again." }, 500);
  const origin = new URL(request.url).origin, slug = ev.slug || ev.id;
  if (sum.total === 0) {
    const r = await finalise(orderRef);
    return r.ok ? json({ url: `${origin}/checkout/${slug}/confirmation?order=${orderRef}` }) : json({ error: "Couldn’t issue your tickets. Please try again." }, 500);
  }
  if (!stripeKey()) return json({ error: "Card payments aren’t configured in this environment yet.", unavailable: true }, 503);
  try {
    const p: Record<string, string> = {
      mode: "payment", customer_email: user.email ?? "", client_reference_id: orderRef,
      success_url: `${origin}/api/checkout/complete?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/checkout/${slug}?cancelled=1`,
      expires_at: String(Math.floor(Math.max(Date.now() + 31 * 60_000, new Date(sum.expiresAt).getTime()) / 1000)),
      "metadata[order_ref]": orderRef, "metadata[event_id]": eventId, "payment_intent_data[metadata][order_ref]": orderRef,
    };
    sum.lines.forEach((l, i) => { p[`line_items[${i}][quantity]`] = String(l.qty); p[`line_items[${i}][price_data][currency]`] = "gbp"; p[`line_items[${i}][price_data][unit_amount]`] = String(Math.round(l.unit * 100));
      p[`line_items[${i}][price_data][product_data][name]`] = `${ev.name} — ${l.name}`; if (l.seats.length) p[`line_items[${i}][price_data][product_data][description]`] = l.seats.join(", ").slice(0, 400); });
    if (sum.fee > 0) { const i = sum.lines.length; p[`line_items[${i}][quantity]`] = "1"; p[`line_items[${i}][price_data][currency]`] = "gbp"; p[`line_items[${i}][price_data][unit_amount]`] = String(Math.round(sum.fee * 100)); p[`line_items[${i}][price_data][product_data][name]`] = "Booking fee"; }
    // Stripe sessions live ≥30 min, so the hold is extended to cover the payment window (a lapsed hold is refunded in finalise()).
    const until = new Date(Number(p.expires_at) * 1000 + 2 * 60_000).toISOString();
    await Promise.all([db.from("ticket_holds").update({ expires_at: until }).eq("token", token), db.from("event_seats").update({ hold_expires_at: until }).eq("hold_token", token).eq("status", "held"), db.from("resale_holds").update({ expires_at: until }).eq("token", token)]);
    const s = await stripe<{ id: string; url: string }>("checkout/sessions", p);
    await db.from("checkout_orders").update({ stripe_session: s.id }).eq("order_ref", orderRef);
    return json({ url: s.url });
  } catch {
    await db.from("checkout_orders").update({ status: "failed" }).eq("order_ref", orderRef);
    return json({ error: "Couldn’t start the payment. Please try again." }, 502);
  }
}
