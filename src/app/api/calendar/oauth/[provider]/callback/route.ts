import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, idTokenEmail, isProvider, providerEnabled, sealTokens, siteOrigin } from "@/lib/calendar-sync/providers";
import { safeReturn } from "@/lib/calendar-sync/return-path";
import { syncUser } from "@/lib/calendar-sync/sync";

export const maxDuration = 60;

/** OAuth callback: verifies state + signed-in user, stores encrypted tokens, runs the first sync, returns to settings. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params; const url = new URL(req.url); const origin = siteOrigin(req);
  let ck: { state?: string; provider?: string; back?: string; uid?: string } = {};
  try { ck = JSON.parse(req.cookies.get("gd_cal_oauth")?.value ?? "{}"); } catch { /* invalid cookie → treated as missing */ }
  const back = safeReturn(ck.back); const to = (s: string) => { const r = NextResponse.redirect(new URL(`${back}${back.includes("?") ? "&" : "?"}calendar=${s}`, origin)); r.cookies.delete({ name: "gd_cal_oauth", path: "/api/calendar/oauth" }); return r; };
  const state = url.searchParams.get("state") ?? "", code = url.searchParams.get("code");
  const okState = !!ck.state && ck.state.length === state.length && timingSafeEqual(Buffer.from(ck.state), Buffer.from(state));
  if (!isProvider(provider) || !providerEnabled(provider) || ck.provider !== provider || !okState) return to("error");
  if (url.searchParams.get("error") || !code) return to("cancelled");
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user || user.id !== ck.uid) return to("error");
  try {
    const t = await exchangeCode(provider, code, origin);
    if (!t.refresh_token) return to("error");
    const admin = createAdminClient();
    const { error } = await admin.from("calendar_connections").upsert({
      user_id: user.id, provider, account_email: idTokenEmail(t.id_token), token_enc: sealTokens({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at }),
      status: "active", last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });
    if (error) return to("error");
    await syncUser(user.id).catch(() => null);
    return to("connected");
  } catch { return to("error"); }
}
