import "server-only";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { printCredential } from "@/lib/tickets/credentials";
import type { CustomerCtx } from "./context";

export type TicketRow = { id: string; code: string; status: string; seat: string; order_ref: string; attendee_name: string; attendee_email: string; price_paid: number; checked_in_at: string | null; created_at: string; qr_nonce: string | null; replaced_by: string | null;
  tier: { name: string; kind: string; description: string } | null;
  event: { id: string; name: string; slug: string | null; starts_at: string | null; ends_at: string | null; venue_name: string; location: string; city: string; cover_image: string; event_type: string; tags: string[]; settings: Record<string, unknown> } };
export type TicketGroup = { key: string; event: TicketRow["event"]; order: string; tickets: TicketRow[]; when: "upcoming" | "past" | "resale"; state: { label: string; tone: string } };

const COLS = "id,code,status,seat,order_ref,attendee_name,attendee_email,price_paid,checked_in_at,created_at,qr_nonce,replaced_by,tier:ticket_tiers(name,kind,description),event:events!inner(id,name,slug,starts_at,ends_at,venue_name,location,city,cover_image,event_type,tags,settings)";

/** The signed-in customer's tickets grouped by event + order. RLS limits rows to tickets they hold. */
export async function myTickets(ctx: CustomerCtx) {
  const { data } = await ctx.supabase.from("tickets").select(COLS).eq("holder_id", ctx.user.id).order("created_at", { ascending: true });
  const rows = (data ?? []) as unknown as TicketRow[];
  const now = Date.now(); const map = new Map<string, TicketGroup>();
  for (const t of rows) {
    const ended = t.event.ends_at ? new Date(t.event.ends_at).getTime() < now : t.event.starts_at ? new Date(t.event.starts_at).getTime() + 864e5 < now : false;
    // A ticket listed for resale is still yours until it sells: it stays in Upcoming ("Resale in progress") and is also listed under Resale.
    const resale = ["transferred", "resold", "refunded"].includes(t.status) || (t.status === "resale_listed" && ended);
    const when = resale ? "resale" : ended || t.status === "used" ? "past" : "upcoming";
    const key = `${t.event.id}:${t.order_ref.replace(/-T$/, "")}:${when}`;
    const g = map.get(key) ?? { key, event: t.event, order: t.order_ref, tickets: [], when, state: { label: "", tone: "" } };
    g.tickets.push(t); map.set(key, g);
  }
  for (const g of map.values()) g.state = stateOf(g, now);
  const groups = [...map.values()].sort((a, b) => (a.event.starts_at ?? "9").localeCompare(b.event.starts_at ?? "9") * (a.when === "past" ? -1 : 1));
  return { groups, upcoming: groups.filter(g => g.when === "upcoming"), past: groups.filter(g => g.when === "past"), resale: groups.filter(g => g.when === "resale" || g.tickets.some(t => t.status === "resale_listed")) };
}
function stateOf(g: TicketGroup, now: number) {
  const st = g.tickets.map(t => t.status);
  if (st.includes("resale_listed")) return { label: "Resale in progress", tone: "gray" };
  if (st.includes("resold")) return { label: "Resold", tone: "green" };
  if (st.every(s => s === "transferred")) return { label: "Transferred", tone: "blue" };
  if (st.includes("refunded")) return { label: "Refunded", tone: "gray" };
  if (g.when === "past") return { label: st.includes("used") ? "Attended" : "Event ended", tone: st.includes("used") ? "green" : "gray" };
  const days = g.event.starts_at ? (new Date(g.event.starts_at).getTime() - now) / 864e5 : 99;
  const transfers = g.event.settings?.transfers !== false;
  return days > 30 && transfers ? { label: "Available to transfer", tone: "blue" } : { label: "Ready to attend", tone: "green" };
}

/**
 * Static QR image (the "Download QR image" action, the tickets list, the dimmed code on a ticket that's no longer valid).
 * A valid ticket whose event allows printing gets the signed print credential (GD2P — bound to the current nonce and print epoch,
 * so refund/transfer/resale/reissue kill it, exactly like the PDF). Anything else gets the plain ticket code, which is already shown
 * as text on the page. Never the legacy GD1:<code>:<nonce> form: that never expired and bypassed the print policy and print reissue.
 */
export async function ticketQr(t: { id: string; code: string; status: string; qr_nonce: string | null; event?: { settings?: Record<string, unknown> | null } | null }) {
  let payload = t.code;
  if (t.status === "valid" && t.qr_nonce && t.event?.settings?.print_tickets !== false) {
    const { data } = await untyped(createAdminClient() as never).from("tickets").select("qr_nonce,print_epoch").eq("id", t.id).maybeSingle();
    if (data?.qr_nonce) payload = printCredential(t.id, data.qr_nonce, Number(data.print_epoch ?? 0));
  }
  return QRCode.toDataURL(payload, { errorCorrectionLevel: "H", margin: 0, width: 360, color: { dark: "#0b1437", light: "#ffffff" } });
}

const dayFmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "Date TBC";
const tFmt = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Europe/London" }).toUpperCase() : "";
/** "Sat, 26 Apr 2025 • 6:00 PM – 11:00 PM" in event-local (UK) time. */
export const whenLine = (e: { starts_at: string | null; ends_at: string | null }) => `${dayFmt(e.starts_at)}${e.starts_at ? ` • ${tFmt(e.starts_at)}${e.ends_at ? ` – ${tFmt(e.ends_at)}` : ""}` : ""}`;
