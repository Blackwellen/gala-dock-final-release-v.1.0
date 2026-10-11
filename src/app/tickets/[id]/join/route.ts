import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Ticket-gated virtual access (release spec §125). The attendee never sees a permanent public link on the event page: the join URL is
 * released only to the current holder of a valid ticket, inside the access window (or a replay after the event, when enabled).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON: Record<string, string> = {
  not_your_ticket: "This ticket isn’t in your account.", not_open_yet: "The event isn’t open yet.", ended: "This event has ended and no replay is available.",
  no_virtual_access: "This event doesn’t have an online session.", refunded: "This ticket was refunded.", cancelled: "This event or ticket was cancelled.",
  transferred: "This ticket was transferred to someone else.", resold: "This ticket was resold.", postponed: "This event has been postponed.",
};

export async function GET(request: Request, ctx: RouteContext<"/tickets/[id]/join">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/tickets/${id}/join`)}`, request.url), 303);
  const { data } = await sb.rpc("virtual_join" as never, { p_ticket: id } as never);
  const r = (data ?? { ok: false, reason: "no_virtual_access" }) as { ok: boolean; url?: string; reason?: string; opens_at?: string };
  if (r.ok && r.url) return NextResponse.redirect(r.url, { status: 303, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  const msg = REASON[r.reason ?? ""] ?? "You can’t join with this ticket.";
  const when = r.opens_at ? ` It opens ${new Date(r.opens_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })} (UK time).` : "";
  const back = new URL(`/account/tickets/${id}`, request.url);
  back.searchParams.set("join", `${msg}${when}`);
  return NextResponse.redirect(back, 303);
}
