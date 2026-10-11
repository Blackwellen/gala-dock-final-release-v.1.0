import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/redirects";

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
      return NextResponse.redirect(new URL(next, request.url));
    }
  }
  const failure = recovery ? "/reset-password?state=expired" : `/login?error=link_expired&next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(failure, request.url));
}
