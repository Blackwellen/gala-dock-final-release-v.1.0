import "server-only";
import { notFound } from "next/navigation";
import { getProvider } from "@/lib/provider/context";
import { rows } from "@/lib/workspace/db";
import { workspaceItems, workspaceJobs, workspaceListings, workspaceSpaces, startOfDay } from "@/lib/provider/queries";
import { workspaceBlocks, workspaceQuotes, type Quote } from "@/lib/provider/commercial";
import { compatibility } from "@/lib/provider/fit";

export type Line = { label: string; detail: string; qty: number; unit: string; unit_price: number; kind: string; ref?: string; image?: string };
export type Catalog = { key: string; label: string; detail: string; unit: string; unit_price: number; kind: string; image: string }[];

/** Everything the quote wizard needs, scoped to the active workspace. Prefills from the request, listing and space rates. */
export async function quoteContext(itemId: string, quoteId?: string, fromId?: string) {
  const [ctx, items, jobs, listings, spaces, blocks, quotes] = await Promise.all([getProvider(), workspaceItems(), workspaceJobs(), workspaceListings(), workspaceSpaces(), workspaceBlocks(), workspaceQuotes()]);
  const item = items.find(i => i.id === itemId);
  if (!item) notFound();
  const listing = listings.find(l => l.id === item.listing_id);
  const fit = compatibility(item, { listing, spaces, jobs, blocks });
  const mine = quotes.filter(q => q.build_item_id === itemId);
  const draft = (quoteId ? mine.find(q => q.id === quoteId && q.status === "draft") : undefined) ?? mine.find(q => q.status === "draft");
  const source: Quote | undefined = fromId ? mine.find(q => q.id === fromId) : undefined;
  const live = mine.find(q => q.status === "sent" || q.status === "viewed");
  const packages = await rows<{ id: string; name: string; description: string; base_price: number; price_basis: string; image: string; duration_hours: number | null; listing_id: string }>(
    ctx.db.from("packages").select("id,name,description,base_price,price_basis,image,duration_hours,listing_id").eq("workspace_id", ctx.workspace.id).eq("status", "published"));

  const e = item.event, req = (item.request?.requirements ?? {}) as Record<string, unknown>;
  const guests = Number(req.guests ?? e?.guest_count ?? 0);
  const hours = e?.starts_at && e?.ends_at ? Math.max(1, Math.round((new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 36e5)) : 4;
  const space = fit.space;

  // Catalogue of real things this provider sells, priced from canonical records.
  const catalog: Catalog = [
    ...spaces.filter(s => s.status === "published" && s.rate_hourly).map(s => ({ key: `space:${s.id}`, label: `${s.name}`, detail: `Venue space · ${Math.max(s.capacity_seated ?? 0, s.capacity_standing ?? 0)} capacity`, unit: "hours", unit_price: Number(s.rate_hourly), kind: "space", image: s.image })),
    ...packages.map(p => ({ key: `package:${p.id}`, label: p.name, detail: p.description.slice(0, 60), unit: p.price_basis === "per_person" ? "guests" : p.price_basis === "hourly" ? "hours" : "package", unit_price: Number(p.base_price), kind: "package", image: p.image })),
    ...listings.filter(l => l.kind === "service" && l.price_from).map(l => ({ key: `service:${l.id}`, label: l.name, detail: `${l.category} · ${l.price_unit}`, unit: l.price_unit.includes("guest") ? "guests" : "service", unit_price: Number(l.price_from), kind: "service", image: l.image })),
  ];
  const qtyFor = (c: Catalog[number]) => c.unit === "hours" ? hours : c.unit === "guests" ? Math.max(guests, 1) : 1;

  const starting: Line[] = (draft ?? source)?.items?.map(i => ({ detail: "", ...i })) as Line[] | undefined
    ?? (space?.rate_hourly ? [{ label: `${space.name} hire`, detail: `Venue space · ${hours} hours`, qty: hours, unit: "hours", unit_price: Number(space.rate_hourly), kind: "space", ref: `space:${space.id}`, image: space.image }]
      : listing?.price_from ? [{ label: listing.name, detail: listing.category, qty: listing.price_unit.includes("guest") ? Math.max(guests, 1) : 1, unit: listing.price_unit.includes("guest") ? "guests" : "service", unit_price: Number(listing.price_from), kind: "service", ref: `service:${listing.id}`, image: listing.image }] : []);

  const tax = ((ctx.workspace.settings as Record<string, Record<string, unknown>>)?.tax ?? {}) as { vat_registered?: boolean; rate_bps?: number; number?: string };
  const commercial = (listing?.details?.commercial ?? {}) as { deposit_pct?: number; cancellation?: { window: string; refund: number }[]; holds?: { enabled?: boolean; hours?: number }; standby?: { enabled?: boolean; fee?: number } };
  // Calendar strip for the event day: bookings and blocks on the same space/listing.
  const dayStart = e?.starts_at ? startOfDay(0, new Date(e.starts_at).getTime()) : null;
  const dayJobs = dayStart ? jobs.filter(j => (space ? j.space_id === space.id : j.listing_id === item.listing_id) && ["held", "confirmed", "active"].includes(j.status)
    && new Date(j.ends_at).getTime() > dayStart && new Date(j.starts_at).getTime() < dayStart + 864e5) : [];

  return {
    ctx, item, listing, space, fit, catalog, qtyFor, starting, draft, source, live, guests, hours, dayJobs,
    taxBps: tax.vat_registered ? Number(tax.rate_bps ?? 0) : 0, taxLabel: tax.vat_registered ? `VAT (${Number(tax.rate_bps ?? 0) / 100}%)` : "Tax (not VAT registered)",
    depositPct: draft?.deposit_pct ?? source?.deposit_pct ?? commercial.deposit_pct ?? 30,
    cancellation: ((draft ?? source)?.terms?.cancellation as { window: string; refund: number }[] | undefined) ?? commercial.cancellation ?? [{ window: "7+ days", refund: 100 }, { window: "3–7 days", refund: 50 }, { window: "<3 days", refund: 0 }],
    holdHours: commercial.holds?.enabled ? commercial.holds.hours ?? 48 : 0,
    standbyFee: commercial.standby?.enabled ? commercial.standby.fee ?? 0 : null,
  };
}
