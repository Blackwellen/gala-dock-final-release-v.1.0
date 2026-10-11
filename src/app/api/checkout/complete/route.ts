import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { finalise, CHECKOUT_COOKIE } from "@/lib/checkout";

/** Stripe success redirect: verifies the session server-side, issues tickets once, then shows the confirmation. */
export async function GET(request: NextRequest) {
  const sid = request.nextUrl.searchParams.get("session_id") ?? "";
  const origin = request.nextUrl.origin;
  if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return NextResponse.redirect(`${origin}/`);
  const db = untyped(createAdminClient() as never);
  const { data: o } = await db.from("checkout_orders").select("order_ref,event_id").eq("stripe_session", sid).maybeSingle();
  if (!o) return NextResponse.redirect(`${origin}/`);
  const { data: ev } = await db.from("events").select("slug,id").eq("id", o.event_id).maybeSingle();
  const slug = ev?.slug || o.event_id;
  const r = await finalise(o.order_ref);
  const res = NextResponse.redirect(`${origin}/checkout/${slug}/confirmation?order=${o.order_ref}${r.ok ? "" : `&issue=${encodeURIComponent(r.error)}`}`);
  if (r.ok) res.cookies.delete(CHECKOUT_COOKIE(o.event_id));
  return res;
}
