import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/redirects";

/** Server-side token-hash verification for email templates that link here. */
export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const allowed: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];
  if (token_hash && type && allowed.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      if (type === "recovery") return NextResponse.redirect(new URL("/reset-password", request.url));
      await supabase.rpc("log_auth_event", { p_event: "auth.email_verified" });
      return NextResponse.redirect(new URL(`/verify-email?next=${encodeURIComponent(next)}`, request.url));
    }
  }
  return NextResponse.redirect(new URL(type === "recovery" ? "/reset-password?state=expired" : `/verify-email?state=expired&next=${encodeURIComponent(next)}`, request.url));
}
