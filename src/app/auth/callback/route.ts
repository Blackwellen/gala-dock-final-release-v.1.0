import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/redirects";
import { attributePartnerSignup, PARTNER_COOKIE } from "@/lib/partners/referral";

/** PKCE code exchange for OAuth, email verification and recovery links. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const recovery = next.startsWith("/reset-password");
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (!recovery && data.user?.email_confirmed_at) await supabase.rpc("log_auth_event", { p_event: "auth.login" });
      // Q27: a consented partner link credits a NEW account (OAuth sign-up / email link); the RPC ignores existing accounts.
      if (!recovery) await attributePartnerSignup(supabase as never, request.cookies.get(PARTNER_COOKIE)?.value, request);
      const res = NextResponse.redirect(new URL(next, request.url));
      if (!recovery && request.cookies.get(PARTNER_COOKIE)) res.cookies.delete(PARTNER_COOKIE);
      return res;
    }
  }
  const failure = recovery ? "/reset-password?state=expired" : `/login?error=link_expired&next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(failure, request.url));
}
