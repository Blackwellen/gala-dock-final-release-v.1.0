import "server-only";
import { getProvider } from "@/lib/provider/context";
import { rows, one, isUuid } from "@/lib/workspace/db";
import { workspaceListings, workspaceSpaces, workspaceJobs, startOfDay } from "@/lib/provider/queries";
import { workspaceBlocks } from "@/lib/provider/commercial";
import type { PkgItem } from "./actions";
import type { DayState } from "./_components/editors";

export type PackageRow = { id: string; listing_id: string; name: string; status: string; description: string; base_price: number; price_basis: string; min_guests: number | null; max_guests: number | null;
  duration_hours: number | null; deposit_pct: number; booking_mode: string; inclusions: string[]; add_ons: { name: string; desc?: string; price: number; enabled?: boolean }[]; space_ids: string[]; image: string; created_at: string;
  details: { items?: PkgItem[]; event_type?: string; suitable_for?: string; features?: string[]; gallery?: string[]; pricing?: { model?: string }; excluded?: string[];
    restrictions?: { min_notice_days?: number | null; max_notice_days?: number | null; age?: string | null; event_types?: string | null }; cancellation?: { window: string; refund: number }[] | null;
    holds?: { enabled?: boolean; hours?: number }; standby?: { enabled?: boolean }; emergency?: { enabled?: boolean }; availability?: { mode?: string; blocked?: string[] }; setup?: string; teardown?: string; restrictions_text?: string } };
const SELECT = "id,listing_id,name,status,description,base_price,price_basis,min_guests,max_guests,duration_hours,deposit_pct,booking_mode,inclusions,add_ons,space_ids,image,created_at,details";

export async function loadPackageContext(id: string | null) {
  if (id && !isUuid(id)) return null;
  const [ctx, listings, spaces, jobs, blocks] = await Promise.all([getProvider(), workspaceListings(), workspaceSpaces(), workspaceJobs(), workspaceBlocks()]);
  const pkg = id ? await one<PackageRow>(ctx.db.from("packages").select(SELECT).eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle()) : null;
  if (id && !pkg) return null;
  const parent = pkg ? listings.find(l => l.id === pkg.listing_id) ?? null : null;
  const options = [
    ...spaces.map(s => ({ kind: "space" as const, ref: s.id, name: s.name, sub: `${listings.find(l => l.id === s.venue_id)?.name ?? "Venue"} • ${Math.max(s.capacity_seated ?? 0, s.capacity_standing ?? 0)} capacity`, image: s.image })),
    ...listings.filter(l => l.kind === "service").map(l => ({ kind: "service" as const, ref: l.id, name: l.name, sub: l.category.replace(">", "›"), image: l.image })),
  ];
  // Day states for the next 12 months from bookings/holds and blocks on the package's spaces (or parent listing).
  const spaceIds = pkg?.space_ids?.length ? pkg.space_ids : spaces.filter(s => s.venue_id === pkg?.listing_id).map(s => s.id);
  const start = startOfDay(0), days: Record<string, DayState> = {};
  const key = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  for (let i = 0; i < 366; i++) days[key(start + i * 864e5 + 12 * 36e5)] = "available";
  const hard = jobs.filter(j => ["held", "confirmed", "active"].includes(j.status) && j.role === "primary" && ((j.space_id && spaceIds.includes(j.space_id)) || (!spaceIds.length && j.listing_id === pkg?.listing_id)));
  for (const j of hard) { const k = key(new Date(j.starts_at).getTime()); if (k in days) days[k] = spaceIds.length > 1 && hard.filter(x => key(new Date(x.starts_at).getTime()) === k).length < spaceIds.length ? "partial" : "unavailable"; }
  for (const b of blocks.filter(b => b.space_id && spaceIds.includes(b.space_id) && ["blocked", "maintenance"].includes(b.kind))) { const k = key(new Date(b.starts_at).getTime()); if (k in days && days[k] === "available") days[k] = "partial"; }
  const bookings = pkg ? jobs.filter(j => j.package_id === pkg.id && j.status !== "cancelled") : [];
  return { ctx, listings, spaces, pkg, parent, options, days, bookings, jobs };
}

export const packagesFor = async (listingId: string) => {
  const ctx = await getProvider();
  return rows<{ id: string; name: string }>(ctx.db.from("packages").select("id,name").eq("listing_id", listingId));
};
