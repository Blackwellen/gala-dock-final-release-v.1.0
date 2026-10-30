import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/redirects";
import { sameOrigin } from "@/lib/security";

/** Signs out this device (or every device with scope=global) and returns to login. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const supabase = await createClient();
  await supabase.rpc("log_auth_event", { p_event: "auth.signed_out" });
  // Q37: push registrations bound to this session stop receiving notifications (global sign-out ends every session; the sender skips dead sessions).
  await (supabase as unknown as { rpc(fn: string): PromiseLike<unknown> }).rpc("push_revoke_session");
  await supabase.auth.signOut({ scope: request.nextUrl.searchParams.get("scope") === "global" ? "global" : "local" });
  const next = safeNext(request.nextUrl.searchParams.get("next"), "");
  return NextResponse.redirect(new URL(next ? `/login?next=${encodeURIComponent(next)}` : "/login", request.url), 303);
}
