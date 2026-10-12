import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Private iCalendar subscription feed (Google/Outlook/Apple "subscribe by URL"). The token is the credential. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) return new NextResponse("Not found", { status: 404 });
  const admin = createAdminClient();
  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("calendar_token", token);
  if (!count) return new NextResponse("Not found", { status: 404 });
  const { data } = await admin.rpc("calendar_feed", { p_token: token });
  if (!data) return new NextResponse("Not found", { status: 404 });
  const f = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  // RFC 5545 TEXT escaping: backslash, semicolon and comma are backslash-escaped; newlines become a literal "\n".
  const esc = (s: string) => s.replace(/[\\;,]/g, m => `\\${m}`).replace(/\r?\n/g, "\\n");
  const rows = (data as { uid: string; title: string; starts_at: string; ends_at: string | null; location: string; kind: string }[]);
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gala Dock//My Events//EN", "X-WR-CALNAME:Gala Dock", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", ...rows.flatMap(r => ["BEGIN:VEVENT", `UID:${r.uid}@galadock`, `DTSTAMP:${f(new Date().toISOString())}`, `DTSTART:${f(r.starts_at)}`, `DTEND:${f(r.ends_at ?? new Date(new Date(r.starts_at).getTime() + 4 * 36e5).toISOString())}`, `SUMMARY:${esc(r.kind === "ticket" ? `🎟 ${r.title}` : r.title)}`, `LOCATION:${esc(r.location ?? "")}`, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
  return new NextResponse(body, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=900" } });
}
