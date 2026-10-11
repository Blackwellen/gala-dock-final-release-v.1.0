import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SetupData = {
  event: { id: string; name: string; slug: string | null; starts_at: string | null; ends_at: string | null; venue_name: string; location: string; cover_image: string; event_type: string; visibility: string; guest_count: number; adults: number | null; children: number | null; description: string; management: string; status: string };
  model: "general" | "reserved" | "free"; capacity: number; venueCap: number | null; payoutReady: boolean;
  tiers: { id?: string; name: string; description: string; price: number; quantity: number; badge: string | null; color: string; kind: string; sold: number; status: string; sale_start: string | null; sale_end: string | null }[];
  rules: { sale_start: string; sale_end: string | null; countdown: boolean; order_limit: number; transfers: boolean; resale: boolean; refund: "none" | "7days" | "partial" | "custom"; refund_text: string };
  promos: { id?: string; code: string; kind: "percent" | "amount"; amount: number; valid_from: string | null; valid_until: string | null; max_uses: number | null }[];
  live: boolean;
};

/** Everything the ticket setup wizard needs, read under the caller's RLS. */
export async function loadTicketSetup(sb: SupabaseClient, eventId: string): Promise<SetupData | null> {
  const { data: e } = await sb.from("events").select("id,name,slug,starts_at,ends_at,venue_name,location,cover_image,event_type,visibility,guest_count,adults,children,description,management,status,capacity,settings,workspace_id,venue_listing_id").eq("id", eventId).maybeSingle();
  if (!e) return null;
  const s = (e.settings ?? {}) as Record<string, unknown>;
  const [{ data: tiers }, { data: codes }, { data: venue }, { data: ws }] = await Promise.all([
    sb.from("ticket_tiers").select("id,name,description,price,quantity,badge,color,kind,sold,status,sale_start,sale_end,order_limit").eq("event_id", e.id).order("sort"),
    sb.from("discount_codes").select("id,code,kind,amount,valid_from,valid_until,max_uses,status").eq("event_id", e.id).neq("status", "disabled"),
    e.venue_listing_id ? sb.from("listings").select("capacity_max").eq("id", e.venue_listing_id).maybeSingle() : Promise.resolve({ data: null }),
    e.workspace_id ? sb.from("workspaces").select("payout_status").eq("id", e.workspace_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const t0 = tiers?.[0];
  const venueCap = venue?.capacity_max ?? e.capacity ?? null;
  const start = e.starts_at ? new Date(e.starts_at) : null;
  const defStart = new Date(Math.max(Date.now() + 864e5, start ? start.getTime() - 47 * 864e5 : Date.now())); defStart.setUTCHours(9, 0, 0, 0);
  const defEnd = start ? new Date(start.getTime() - 864e5) : null; defEnd?.setUTCHours(22, 59, 0, 0);
  return {
    event: { id: e.id, name: e.name, slug: e.slug, starts_at: e.starts_at, ends_at: e.ends_at, venue_name: e.venue_name, location: e.location, cover_image: e.cover_image, event_type: e.event_type, visibility: e.visibility, guest_count: e.guest_count, adults: e.adults, children: e.children, description: e.description, management: e.management, status: e.status },
    model: (s.ticket_model as SetupData["model"]) ?? (tiers?.length && tiers.every(t => Number(t.price) === 0) ? "free" : "general"),
    capacity: Number(s.ticket_capacity) || (tiers ?? []).reduce((a, t) => a + t.quantity, 0) || Math.min(venueCap ?? e.guest_count ?? 100, Math.max(e.guest_count || 100, 50)),
    venueCap, payoutReady: ws?.payout_status === "active",
    tiers: (tiers ?? []).map(t => ({ id: t.id, name: t.name, description: t.description, price: Number(t.price), quantity: t.quantity, badge: t.badge, color: t.color || "#2563eb", kind: t.kind, sold: t.sold, status: t.status, sale_start: t.sale_start, sale_end: t.sale_end })),
    rules: { sale_start: t0?.sale_start ?? defStart.toISOString(), sale_end: t0?.sale_end ?? defEnd?.toISOString() ?? null, countdown: s.countdown !== false, order_limit: Number(s.order_limit ?? t0?.order_limit ?? 10), transfers: s.transfers !== false, resale: s.resale !== false, refund: (s.refund_policy as SetupData["rules"]["refund"]) ?? "none", refund_text: String(s.refund_text ?? "") },
    promos: (codes ?? []).map(c => ({ id: c.id, code: c.code, kind: c.kind as "percent" | "amount", amount: Number(c.amount), valid_from: c.valid_from, valid_until: c.valid_until, max_uses: c.max_uses })),
    live: !!s.ticketing_live || (tiers ?? []).some(t => ["on_sale", "scheduled", "sold_out"].includes(t.status)),
  };
}
