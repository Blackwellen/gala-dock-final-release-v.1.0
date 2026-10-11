import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MapEl } from "@/app/provider/venues/_components/venue-map";
import { planAreas, planSeats } from "@/components/venue-plan/inventory";
import { PRO_DEFAULTS, type ProSettings, type ProSection } from "@/lib/ticket-pro-model";

export type ProTier = { id?: string; name: string; description: string; kind: string; price: number; quantity: number; sold: number; held: number; status: string; sale_start: string | null; sale_end: string | null; release_name: string | null; after_tier: string | null; order_limit: number; image: string | null; badge: string | null; color: string; allocation: string | null };
export type ProSetup = {
  event: { id: string; name: string; slug: string | null; status: string; starts_at: string | null; ends_at: string | null; venue_name: string; location: string; cover: string; description: string; visibility: string; event_type: string; budget: number | null };
  venueCap: number | null; venueName: string | null; hasVenueMap: boolean; mapSections: ProSection[];
  tiers: ProTier[]; promos: { id?: string; code: string; kind: "percent" | "amount"; amount: number; valid_from: string | null; valid_until: string | null; max_uses: number | null; used: number; status: string }[];
  promoters: { id: string; name: string; code: string; status: string; ticket_allocation: number | null; tickets_sold: number }[];
  workspaceId: string; saved: { model: boolean; tiers: boolean; allocation: boolean; access: boolean }; pro: ProSettings; payoutReady: boolean; payoutLabel: string | null; live: boolean; gallery: string[];
};

const PALETTE = ["#2563eb", "#7c3aed", "#e0398b", "#e08a00", "#16a46c", "#64748b", "#0ea5c6", "#f97316"];

/** Everything the professional ticket setup needs, read under the caller's RLS. */
export async function loadProSetup(sb: SupabaseClient, eventId: string, workspaceId: string): Promise<ProSetup | null> {
  const { data: e } = await sb.from("events").select("id,name,slug,status,starts_at,ends_at,venue_name,location,cover_image,description,visibility,event_type,capacity,settings,venue_listing_id,management,budget_total").eq("id", eventId).eq("workspace_id", workspaceId).maybeSingle();
  if (!e || e.management !== "professional") return null;
  const s = (e.settings ?? {}) as Record<string, unknown>;
  const [{ data: tiers }, { data: codes }, { data: promoters }, { data: venue }, { data: ws }, { data: vmap }] = await Promise.all([
    sb.from("ticket_tiers").select("id,name,description,kind,price,quantity,sold,held,status,sale_start,sale_end,release_name,after_tier,order_limit,image,badge,color,allocation").eq("event_id", e.id).order("sort"),
    sb.from("discount_codes").select("id,code,kind,amount,valid_from,valid_until,max_uses,used,status").eq("event_id", e.id).neq("status", "disabled").order("code"),
    sb.from("promoters").select("id,name,code,status,ticket_allocation,tickets_sold").eq("event_id", e.id).order("created_at"),
    e.venue_listing_id ? sb.from("listings").select("name,capacity_max").eq("id", e.venue_listing_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("workspaces").select("payout_status,settings").eq("id", workspaceId).maybeSingle(),
    sb.from("venue_maps").select("overlay,status").eq("event_id", e.id).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  // Sections drawn in the event layout (ORG-013): standing/area zones plus seated blocks grouped by section.
  const overlay = Array.isArray(vmap?.overlay) ? vmap!.overlay as MapEl[] : [];
  let mapSections: ProSection[] = [];
  try {
    const areas = planAreas(overlay).map((a, i) => ({ id: `area-${i}`, name: a.label || `Area ${i + 1}`, type: /vip/i.test(a.label ?? "") ? "vip" as const : /access/i.test(a.label ?? "") ? "accessible" as const : "standing" as const, capacity: a.capacity, color: PALETTE[i % PALETTE.length]!, tiers: [], holds: 0 }));
    const seats = planSeats(overlay); const bySec = new Map<string, number>(); for (const x of seats) if (!x.blocked) bySec.set(x.section || "Seating", (bySec.get(x.section || "Seating") ?? 0) + 1);
    mapSections = [...areas, ...[...bySec].map(([name, n], i) => ({ id: `seat-${i}`, name, type: "reserved" as const, capacity: n, color: PALETTE[(areas.length + i) % PALETTE.length]!, tiers: [], holds: 0 }))];
  } catch { mapSections = []; }
  const stored = (s.ticket_pro ?? {}) as Partial<ProSettings>;
  const venueCap = venue?.capacity_max ?? e.capacity ?? null;
  const capacity = Number(stored.capacity) || Number(s.ticket_capacity) || (tiers ?? []).reduce((a, t) => a + t.quantity, 0) || venueCap || 500;
  const pro: ProSettings = {
    ...PRO_DEFAULTS, ...stored,
    capacity, model: stored.model ?? (s.ticket_model === "reserved" ? "reserved" : "general"),
    sales: { ...PRO_DEFAULTS.sales, order_limit: Number(s.order_limit ?? PRO_DEFAULTS.sales.order_limit), resale: s.resale !== false, countdown: s.countdown !== false, ...(stored.sales ?? {}) },
    access: { ...PRO_DEFAULTS.access, transfers: s.transfers !== false, resale: s.resale !== false, ...(stored.access ?? {}) },
    sections: stored.sections ?? [], phases: stored.phases ?? [],
  };
  const wsSettings = (ws?.settings ?? {}) as Record<string, unknown>;
  const bank = wsSettings.payout_account as { bank?: string; last4?: string } | undefined;
  return {
    event: { id: e.id, name: e.name, slug: e.slug, status: e.status, starts_at: e.starts_at, ends_at: e.ends_at, venue_name: e.venue_name, location: e.location, cover: (s.hero_image as string) || e.cover_image || "/assets/gd/builder/poster/bg-event-hero.webp", description: e.description, visibility: e.visibility, event_type: e.event_type, budget: e.budget_total == null ? null : Number(e.budget_total) },
    venueCap, venueName: venue?.name ?? (e.venue_name || null), hasVenueMap: overlay.length > 0, mapSections,
    tiers: (tiers ?? []).map((t, i) => ({ id: t.id, name: t.name, description: t.description, kind: t.kind, price: Number(t.price), quantity: t.quantity, sold: t.sold, held: t.held, status: t.status, sale_start: t.sale_start, sale_end: t.sale_end, release_name: t.release_name || null, after_tier: t.after_tier, order_limit: t.order_limit ?? pro.sales.order_limit, image: t.image, badge: t.badge, color: t.color || PALETTE[i % PALETTE.length]!, allocation: t.allocation || null })),
    promos: (codes ?? []).map(c => ({ id: c.id, code: c.code, kind: c.kind as "percent" | "amount", amount: Number(c.amount), valid_from: c.valid_from, valid_until: c.valid_until, max_uses: c.max_uses, used: c.used, status: c.status })),
    promoters: (promoters ?? []).map(p => ({ id: p.id, name: p.name, code: p.code, status: p.status, ticket_allocation: p.ticket_allocation, tickets_sold: p.tickets_sold })),
    workspaceId, saved: { model: !!stored.model, tiers: !!stored.sales, allocation: (stored.sections ?? []).some(x => x.tiers?.length), access: !!stored.access }, pro, payoutReady: ws?.payout_status === "active", payoutLabel: bank?.last4 ? `${bank.bank ?? "Bank"} **** ${bank.last4}` : null,
    live: !!s.ticketing_live || (tiers ?? []).some(t => ["on_sale", "scheduled", "sold_out"].includes(t.status)),
    gallery: [...new Set([(s.hero_image as string) || e.cover_image, ...((s.gallery as string[]) ?? [])].filter(Boolean))].slice(0, 8) as string[],
  };
}
