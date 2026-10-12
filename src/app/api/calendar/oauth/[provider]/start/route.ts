import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { authorizeUrl, isProvider, providerEnabled, siteOrigin } from "@/lib/calendar-sync/providers";
import { safeReturn } from "@/lib/calendar-sync/return-path";

/** Starts calendar OAuth. The state is a random value in a short-lived httpOnly cookie, checked on the callback (CSRF). */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params; const url = new URL(req.url); const origin = siteOrigin(req);
  const back = safeReturn(url.searchParams.get("return"));
  if (!isProvider(provider) || !providerEnabled(provider)) return NextResponse.redirect(new URL(`${back}${back.includes("?") ? "&" : "?"}calendar=unavailable`, origin));
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(back)}`, origin));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authorizeUrl(provider, origin, state));
  res.cookies.set("gd_cal_oauth", JSON.stringify({ state, provider, back, uid: user.id }), { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", path: "/api/calendar/oauth", maxAge: 600 });
  return res;
}
