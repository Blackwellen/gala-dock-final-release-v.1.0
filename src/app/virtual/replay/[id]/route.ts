import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gate } from "@/lib/files/service";
import { reasonText, SECRET_HEADERS, UUID } from "@/lib/virtual/join";

/**
 * Replay access (Q29, domains 182.6 / 183.5). virtual_replay_access() decides as the signed-in user: status available, inside
 * access_from / access_until, audience (attendees / registered / session_attendees / team). Provider recordings redirect to their
 * URL; private Q04 files pass the quarantine gate and get a 60-second signed URL for that one object. Each view is logged.
 */
export async function GET(request: Request, ctx: RouteContext<"/virtual/replay/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/virtual/replay/${id}`)}`, request.url), 303);
  const { data, error } = await (sb as unknown as SupabaseClient).rpc("virtual_replay_access", { p_recording: id });
  const r = (data ?? { ok: false, reason: "not_found" }) as { ok: boolean; source?: string; url?: string | null; path?: string | null; reason?: string; opens_at?: string };
  if (error || !r.ok) {
    const u = new URL("/account/tickets", request.url); u.searchParams.set("join", reasonText(r.reason, r.opens_at));
    return NextResponse.redirect(u, 303);
  }
  if (r.source === "provider_url" && r.url) return NextResponse.redirect(r.url, { status: 303, headers: SECRET_HEADERS });
  if (!r.path) return NextResponse.json({ error: "Not found" }, { status: 404, headers: SECRET_HEADERS });
  const admin = createAdminClient();
  const blocked = await gate(admin, "workspace-files", r.path); if (blocked) return blocked;
  const signed = await admin.storage.from("workspace-files").createSignedUrl(r.path, 60);
  if (signed.error || !signed.data) return NextResponse.json({ error: "File unavailable" }, { status: 404, headers: SECRET_HEADERS });
  return NextResponse.redirect(signed.data.signedUrl, { status: 303, headers: SECRET_HEADERS });
}
