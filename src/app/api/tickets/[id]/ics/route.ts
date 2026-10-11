import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Calendar file for a ticket the caller holds (RLS-scoped read). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { data: t } = await supabase.from("tickets").select("code,events!inner(name,starts_at,ends_at,venue_name,location,slug)").eq("id", id).eq("holder_id", user.id).maybeSingle();
  const e = t?.events as unknown as { name: string; starts_at: string | null; ends_at: string | null; venue_name: string; location: string; slug: string | null } | undefined;
  if (!t || !e?.starts_at) return new NextResponse("Not found", { status: 404 });
  const f = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\;,]/g, m => `\${m}`).replace(/\n/g, "\n");
  const end = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 4 * 36e5).toISOString();
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gala Dock//Tickets//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${t.code}@galadock`, `DTSTAMP:${f(new Date().toISOString())}`, `DTSTART:${f(e.starts_at)}`, `DTEND:${f(end)}`, `SUMMARY:${esc(e.name)}`, `LOCATION:${esc([e.venue_name, e.location].filter(Boolean).join(", "))}`, `DESCRIPTION:${esc(`Ticket ${t.code} — open Gala Dock > My Tickets for your QR code.`)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return new NextResponse(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${e.name.replace(/[^\w]+/g, "-").toLowerCase()}.ics"`, "cache-control": "private, no-store" } });
}
