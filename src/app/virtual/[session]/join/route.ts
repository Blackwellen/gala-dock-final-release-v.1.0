import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { deviceId, joinSession, reasonText, SECRET_HEADERS, UUID, withDevice } from "@/lib/virtual/join";

/**
 * Session join without a ticket id (Q29): speakers / moderators / hosts / producers (named session roles), the event team, and
 * approved registrations. Ticket holders are matched automatically too. Host links go only to host-level roles.
 */
export async function GET(request: Request, ctx: RouteContext<"/virtual/[session]/join">) {
  const { session } = await ctx.params;
  if (!UUID.test(session)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const self = new URL(request.url);
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(self.pathname)}`, request.url), 303);
  const device = await deviceId();
  const r = await joinSession(sb as unknown as SupabaseClient, session, device.id, null);
  if (!r.ok) {
    const u = new URL("/account/tickets", request.url); u.searchParams.set("join", reasonText(r.reason, r.opensAt));
    return withDevice(NextResponse.redirect(u, 303), device);
  }
  return withDevice(NextResponse.redirect(r.url, { status: 303, headers: SECRET_HEADERS }), device);
}
