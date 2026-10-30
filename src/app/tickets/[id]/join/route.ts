import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { deviceId, joinSession, reasonText, SECRET_HEADERS, UUID, withDevice } from "@/lib/virtual/join";

/**
 * Ticket-gated virtual access (release spec §125, Q29). The attendee never sees a permanent public link on the event page.
 * Events with Q29 sessions: `?session=<id>` (or the session that is open now / next) → single-use join token bound to the ticket's
 * credential version and this browser's device id (device limit, capacity, rotation) → redirect. Events with only the legacy
 * event-level link keep virtual_join (current holder of a valid ticket, inside the window, or replay).
 */
export async function GET(request: Request, ctx: RouteContext<"/tickets/[id]/join">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const self = new URL(request.url);
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(self.pathname + self.search)}`, request.url), 303);
  const back = (msg: string) => { const u = new URL(`/account/tickets/${id}`, request.url); u.searchParams.set("join", msg); return NextResponse.redirect(u, 303); };

  const { data: ticket } = await sb.from("tickets").select("event_id").eq("id", id).maybeSingle();
  const eventId = (ticket as { event_id: string } | null)?.event_id;
  if (eventId) {
    const { data: list } = await (sb as unknown as SupabaseClient).rpc("virtual_my_sessions", { p_event: eventId });
    const sessions = ((list ?? []) as { id: string; role: string | null; opens_at: string; closes_at: string; status: string }[]).filter(s => s.status !== "cancelled");
    if (sessions.length) {
      const want = self.searchParams.get("session");
      const now = Date.now();
      const pick = want && UUID.test(want) ? sessions.find(s => s.id === want)
        : sessions.find(s => Date.parse(s.opens_at) <= now && now <= Date.parse(s.closes_at)) ?? sessions.find(s => Date.parse(s.opens_at) > now) ?? sessions[0];
      if (!pick) return back(reasonText("no_virtual_access"));
      const device = await deviceId();
      const r = await joinSession(sb as unknown as SupabaseClient, pick.id, device.id, id);
      if (!r.ok) return withDevice(back(reasonText(r.reason, r.opensAt)), device);
      return withDevice(NextResponse.redirect(r.url, { status: 303, headers: SECRET_HEADERS }), device);
    }
  }

  const { data } = await sb.rpc("virtual_join" as never, { p_ticket: id } as never);
  const r = (data ?? { ok: false, reason: "no_virtual_access" }) as { ok: boolean; url?: string; reason?: string; opens_at?: string };
  if (r.ok && r.url) return NextResponse.redirect(r.url, { status: 303, headers: SECRET_HEADERS });
  return back(reasonText(r.reason, r.opens_at));
}
