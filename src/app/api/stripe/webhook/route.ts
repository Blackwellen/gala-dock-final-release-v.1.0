import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { finalise } from "@/lib/checkout";

/** Verifies a Stripe-Signature header (v1 HMAC-SHA256, 5-minute tolerance). */
function verify(payload: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map(p => p.split("=") as [string, string]));
  const t = Number(parts.t); if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return header.split(",").filter(p => p.startsWith("v1=")).some(p => { const a = Buffer.from(p.slice(3)), b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b); });
}

/** Stripe webhook: completes paid checkouts (idempotent with the redirect) and releases holds for expired sessions. */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  const payload = await request.text();
  if (!verify(payload, request.headers.get("stripe-signature"), secret)) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  const event = JSON.parse(payload) as { type: string; data: { object: { id: string; metadata?: Record<string, string> } } };
  const ref = event.data.object.metadata?.order_ref;
  if (!ref) return NextResponse.json({ received: true });
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") await finalise(ref);
  if (event.type === "checkout.session.expired") {
    const db = untyped(createAdminClient() as never);
    const { data: o } = await db.from("checkout_orders").select("token,status").eq("order_ref", ref).maybeSingle();
    if (o?.status === "pending") { await db.rpc("release_checkout", { p_token: o.token }); await db.from("checkout_orders").update({ status: "expired" }).eq("order_ref", ref); }
  }
  return NextResponse.json({ received: true });
}
