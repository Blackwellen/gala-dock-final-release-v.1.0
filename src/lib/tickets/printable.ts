import "server-only";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { printCredential } from "./credentials";

export type PrintableTicket = {
  id: string; code: string; status: string; attendee: string; tier: string; seat: string | null; orderRef: string; price: number | null;
  event: { name: string; startsAt: string | null; endsAt: string | null; venue: string; address: string; terms: string; timezone: string };
  qrDataUrl: string; qrPng: Buffer;
};

/** Loads a ticket for printing (§79): holder only, valid only, and only when the organizer allows printable tickets. */
export async function loadPrintable(ticketId: string): Promise<{ ok: true; t: PrintableTicket } | { ok: false; status: number; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return { ok: false, status: 404, error: "Not found" };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Sign in required" };
  const { data: t } = await sb.from("tickets")
    .select("id,code,status,seat,order_ref,attendee_name,price_paid,holder_id,tier:ticket_tiers(name),event:events!inner(name,starts_at,ends_at,venue_name,location,city,settings,timezone)")
    .eq("id", ticketId).eq("holder_id", user.id).maybeSingle();
  if (!t) return { ok: false, status: 404, error: "Not found" };
  if (t.status !== "valid") return { ok: false, status: 409, error: "This ticket can’t be printed because it is no longer valid." };
  const ev = t.event as unknown as { name: string; starts_at: string | null; ends_at: string | null; venue_name: string | null; location: string | null; city: string | null; settings: Record<string, unknown> | null; timezone: string | null };
  if (ev.settings?.print_tickets === false) return { ok: false, status: 403, error: "The organiser has turned off printed tickets for this event. Show the ticket in your wallet instead." };
  const { data: n } = await untyped(createAdminClient() as never).from("tickets").select("qr_nonce").eq("id", ticketId).maybeSingle();
  if (!n?.qr_nonce) return { ok: false, status: 409, error: "Ticket unavailable" };
  const payload = printCredential(ticketId, n.qr_nonce);
  const qrPng = await QRCode.toBuffer(payload, { errorCorrectionLevel: "M", margin: 2, width: 600 });
  const terms = String((ev.settings as { ticket_terms?: string } | null)?.ticket_terms ?? "Valid for one admission. This ticket is linked to its holder; transfers and resale through Gala Dock replace this ticket and its code. Duplicate or altered tickets are refused at entry.");
  return { ok: true, t: {
    id: t.id, code: t.code, status: t.status, attendee: t.attendee_name ?? "", tier: (t.tier as unknown as { name: string } | null)?.name ?? "Admission", seat: t.seat, orderRef: t.order_ref ?? "", price: t.price_paid,
    event: { name: ev.name, startsAt: ev.starts_at, endsAt: ev.ends_at, venue: ev.venue_name ?? "", address: [ev.location, ev.city].filter(Boolean).join(", "), terms, timezone: ev.timezone ?? "Europe/London" },
    qrDataUrl: `data:image/png;base64,${qrPng.toString("base64")}`, qrPng,
  } };
}
