import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// DEV-ONLY: This endpoint only works in development mode.
// It is unreachable in production because of the NODE_ENV guard.
// Used by automated visual QA (Chrome MCP) to establish an authenticated
// session without materializing tokens in logs/transcripts.
//
// The session is exchanged server-side (verifyOtp with the admin-generated
// token_hash) so the SSR cookie is set directly on this response. The
// previous approach redirected the browser to Supabase's own action_link,
// relying on the *client* picking up a #access_token URL fragment — but no
// public page in this app instantiates a Supabase browser client, so that
// fragment was silently dropped and the browser kept whatever session
// (if any) it already had. Exchanging server-side avoids that entirely.
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const targetEmail = process.env.DEV_QA_EMAIL;
  const { searchParams } = new URL(request.url);
  const redirectTarget = searchParams.get("redirect") ?? "/home";

  if (!serviceKey || !supabaseUrl || !targetEmail) {
    return NextResponse.json(
      { error: "DEV_QA_EMAIL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL not configured" },
      { status: 500 }
    );
  }

  const admin = createAdminClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: usersPage, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const user = usersPage.users.find((u) => u.email === targetEmail);
  if (!user) return NextResponse.json({ error: `User ${targetEmail} not found` }, { status: 404 });

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: targetEmail,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    return NextResponse.json({ error: linkErr?.message ?? "No hashed_token in generateLink response" }, { status: 500 });
  }

  // Exchange the token server-side — this writes the sb-*-auth-token cookie
  // onto the current response via the cookie handlers in lib/supabase/server.
  const supabase = await createServerClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (verifyErr) return NextResponse.json({ error: verifyErr.message }, { status: 500 });

  return NextResponse.redirect(new URL(redirectTarget, request.url), { status: 302 });
}
