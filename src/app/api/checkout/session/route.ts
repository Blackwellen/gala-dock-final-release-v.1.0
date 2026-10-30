import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { rateLimit, sameOrigin } from "@/lib/security";
import { paymentDeps } from "@/lib/payments/server";
import { createTicketDirectCheckout } from "@/lib/payments/service";
import { toMinor } from "@/lib/payments/rules";
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
  const { data: ev } = await sb.from("events_public").select("id,name,slug").eq("id", eventId).maybeSingle();
  if (!ev) return json({ error: "Event not found." }, 404);
  // gd_ref = "CODE:event-slug" from /r/[code]; it only counts for the event it was issued for.
  const [rc, rslug, rch] = ref.split(":"), refCode = /^[A-Za-z0-9_-]{2,32}$/.test(rc ?? "") && rslug === ev.slug ? rc : null;
  // Q27: the channel the consented link came through (link/qr/social/email); older cookies have none.
  const refChannel = refCode && /^(direct|link|qr|instagram|tiktok|facebook|x|whatsapp|email|other)$/.test(rch ?? "") ? rch : null;
  const db = untyped(createAdminClient() as never);
  // Waiting room (§52): an order needs an admitted, unexpired, unused admission; creating the order uses it up.
  // Q22 velocity controls (before the waiting-room admission is used up): per-account order velocity, shared-client signal,
  // per-event purchase limit. Flags go to review; the only automatic action is a short, expiring pause. The client hash is a
  // one-way hash of IP + user agent (never stored raw).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "", ua = request.headers.get("user-agent") ?? "";
  const clientHash = ip || ua ? createHash("sha256").update(`${ip}|${ua}`).digest("hex") : null;
  const { data: risk } = await db.rpc("checkout_risk_check", { p_event: eventId, p_buyer: user.id, p_token: token, p_client_hash: clientHash });
  const rk = (risk ?? { allow: true }) as { allow?: boolean; reason?: string; cap?: number };
  if (rk.allow === false) return rk.reason === "purchase_limit"
    ? json({ error: `This event allows ${rk.cap} tickets per customer — you’ve reached that limit.` }, 409)
    : json({ error: "Too many checkout attempts for this event — please wait a few minutes and try again." }, 429);
  const qTok = jar.get(`gd_q_${eventId.replace(/-/g, "").slice(0, 12)}`)?.value ?? "";
  const { data: admittedOk } = await db.rpc("queue_admit_check", { p_event: eventId, p_token_hash: qTok ? createHash("sha256").update(qTok).digest("hex") : "", p_consume: true });
  if (admittedOk === false) return json({ error: "Your waiting-room slot has expired or hasn’t opened yet — please rejoin the queue.", queue: true }, 409);
  const orderRef = `GD-${randomBytes(5).toString("hex").toUpperCase()}`;
  await db.from("checkout_orders").update({ status: "expired", updated_at: new Date().toISOString() }).eq("token", token).eq("status", "pending");
  const { data: saved, error: oe } = await db.from("checkout_orders").insert({ order_ref: orderRef, event_id: eventId, buyer_id: user.id, token, amount: sum.subtotal, fee: sum.fee, commission: sum.commission, currency: "GBP", status: "pending", lines: sum.lines, kind: sum.kind, ref_code: refCode, ref_channel: refChannel, client_hash: clientHash }).select("fee,fee_vat,commission").single();
  if (oe || !saved) {
    // Q20: the order insert is checked against the server quote, per-customer tier limits and code usage limits.
    const m = oe?.message ?? "";
    if (/customer_limit/.test(m) && !/code_customer_limit/.test(m)) return json({ error: "You’ve reached the per-customer limit for one of these tickets." }, 409);
    if (/code_exhausted|code_customer_limit/.test(m)) return json({ error: "That code has reached its usage limit — remove it to continue.", code: true }, 409);
    if (/quote_mismatch/.test(m)) return json({ error: "Your selection changed — please review your order and try again.", expired: true }, 409);
    return json({ error: "Couldn’t create your order. Please try again." }, 500);
  }
  const fee = Number((saved as { fee: number }).fee ?? sum.fee);   // includes Gala Dock VAT (see migration 202610280020)
  const origin = new URL(request.url).origin, slug = ev.slug || ev.id;
  if (sum.total === 0) {
    const r = await finalise(orderRef);
    return r.ok ? json({ url: `${origin}/checkout/${slug}/confirmation?order=${orderRef}` }) : json({ error: "Couldn’t issue your tickets. Please try again." }, 500);
  }
  const deps = paymentDeps(db);
  if (!deps) return json({ error: "Card payments aren’t configured in this environment yet.", unavailable: true }, 503);
  // Direct charge (Q07): the seller is the organiser for primary sales, or the reseller for official resale. One order, one seller.
  let seller: string | null = null;
  if (sum.kind === "resale") {
    const { data: held } = await db.from("resale_holds").select("ticket_id").eq("token", token);
    const ids = ((held ?? []) as { ticket_id: string }[]).map(h => h.ticket_id);
    const { data: holders } = ids.length ? await db.from("tickets").select("holder_id").in("id", ids) : { data: [] };
    const sellers = [...new Set(((holders ?? []) as { holder_id: string | null }[]).map(h => h.holder_id))];
    if (sellers.length !== 1 || !sellers[0]) { await db.from("checkout_orders").update({ status: "failed" }).eq("order_ref", orderRef);
      return json({ error: "Resale tickets from different sellers have to be bought in separate orders. Please choose tickets from one seller." }, 409); }
    // Q22 settlement switch (platform_settings ticketing.resale_settlement): organiser buy-back by default — the resale is a direct
    // charge on the organiser's account and the seller is compensated by a refund of their original payment; customer_connect
    // (the reseller's own account) only applies once customers can onboard to Connect.
    const { data: st } = await db.rpc("resale_settlement_seller", { p_event: eventId, p_seller: sellers[0] });
    seller = (st as { workspace_id?: string | null } | null)?.workspace_id ?? null;
  } else {
    const { data: ws } = await db.rpc("event_seller_workspace", { p_event: eventId });
    seller = (ws as string | null) ?? null;
  }
  const notReady = sum.kind === "resale" ? "This resale seller hasn’t finished their Stripe payment setup, so their tickets can’t be bought online yet." : "Online ticket sales for this event aren’t open yet — the organiser is finishing their Stripe payment setup.";
  if (!seller) { await db.from("checkout_orders").update({ status: "failed" }).eq("order_ref", orderRef); return json({ error: notReady, sellerNotReady: true }, 409); }
  try {
    const expiresAtSec = Math.floor(Math.max(Date.now() + 31 * 60_000, new Date(sum.expiresAt).getTime()) / 1000);
    // Stripe sessions live ≥30 min, so the hold is extended to cover the payment window (a lapsed hold is refunded in finalise()).
    const until = new Date(expiresAtSec * 1000 + 2 * 60_000).toISOString();
    await Promise.all([db.from("ticket_holds").update({ expires_at: until }).eq("token", token), db.from("event_seats").update({ hold_expires_at: until }).eq("hold_token", token).eq("status", "held"), db.from("resale_holds").update({ expires_at: until }).eq("token", token)]);
    const commission = Number((saved as { commission?: number }).commission ?? sum.commission);
    const r = await createTicketDirectCheckout(deps, {
      orderRef, eventId, eventName: ev.name, sellerWorkspaceId: seller, currency: "GBP", customerEmail: user.email ?? "",
      lines: sum.lines.map(l => ({ name: l.name, unitMinor: toMinor(l.unit), qty: l.qty, description: l.seats.length ? l.seats.join(", ") : undefined })),
      bookingFeeMinor: toMinor(fee), commissionMinor: toMinor(commission),
      feeRule: { kind: sum.kind, booking_fee_minor: toMinor(fee), commission_minor: toMinor(commission), fee_vat_minor: toMinor(Number((saved as { fee_vat?: number }).fee_vat ?? 0)), snapshotted_at: new Date().toISOString() },
      successUrl: `${origin}/api/checkout/complete?session_id={CHECKOUT_SESSION_ID}`, cancelUrl: `${origin}/checkout/${slug}?cancelled=1`, expiresAtSec,
    });
    if (!r.ok) {
      await db.from("checkout_orders").update({ status: "failed" }).eq("order_ref", orderRef);
      return r.code === "seller_not_ready" ? json({ error: notReady, sellerNotReady: true }, 409) : json({ error: r.message }, 502);
    }
    return json({ url: r.url });
  } catch {
    await db.from("checkout_orders").update({ status: "failed" }).eq("order_ref", orderRef);
    return json({ error: "Couldn’t start the payment. Please try again." }, 502);
  }
}
