import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// DEV-ONLY: This endpoint only works in development mode.
// It is unreachable in production because of the NODE_ENV guard.
// Used by automated visual QA (Chrome MCP) to establish an authenticated
// session without materializing tokens in logs/transcripts.
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const targetEmail = process.env.DEV_QA_EMAIL;
  const { searchParams } = new URL(request.url);
  const redirect = searchParams.get("redirect") ?? "/home";

  if (!serviceKey || !supabaseUrl || !targetEmail) {
    return NextResponse.json(
      { error: "DEV_QA_EMAIL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL not configured" },
      { status: 500 }
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // List users and find the QA user
  const { data: usersPage, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const user = usersPage.users.find((u) => u.email === targetEmail);
  if (!user) return NextResponse.json({ error: `User ${targetEmail} not found` }, { status: 404 });

  // Create a session for the user
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: targetEmail,
  });
  if (linkErr || !linkData.properties?.action_link) {
    return NextResponse.json({ error: linkErr?.message ?? "No action_link" }, { status: 500 });
  }

  // Redirect browser to the magic link — it will then redirect to the app
  // The token is in the redirect URL, never in logs or response body
  return NextResponse.redirect(linkData.properties.action_link, { status: 302 });
}
