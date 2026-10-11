import type { Item, Job, Listing, Space } from "./queries";

export type Block = { id: string; kind: string; listing_id: string | null; space_id: string | null; crew_id: string | null; starts_at: string; ends_at: string; note: string };
export type Check = { key: "calendar" | "capacity" | "budget" | "lead_time" | "space" | "commitments"; label: string; state: "ok" | "warn" | "fail"; detail: string };

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/**
 * Compatibility of a request with the provider's real calendar, capacity and commercial terms.
 * Hard conflicts ("fail" on calendar/capacity) block Available/Hold responses; the score is a weighted summary for sorting.
 */
export function compatibility(item: Item, ctx: { listing?: Listing; spaces: Space[]; jobs: Job[]; blocks: Block[]; now?: number }) {
  const now = ctx.now ?? Date.now();
  const req = item.request?.requirements ?? {};
  const space = ctx.spaces.find(s => s.id === req.space_id) ?? ctx.spaces.find(s => s.name === req.space);
  const start = item.event?.starts_at ? new Date(item.event.starts_at).getTime() : null;
  const end = item.event?.ends_at ? new Date(item.event.ends_at).getTime() : start ? start + 6 * 36e5 : null;
  const guests = Number(req.guests ?? item.event?.guest_count ?? 0);
  const checks: Check[] = [];

  // Calendar: confirmed/held primary jobs on the same space (venue) or listing (service), plus provider blocks.
  if (start && end) {
    const turnaround = 0;
    const clash = ctx.jobs.filter(j => ["held", "confirmed", "active"].includes(j.status) && j.role === "primary" && j.build_item_id !== item.id
      && (space ? j.space_id === space.id : j.listing_id === item.listing_id)
      && overlaps(start - turnaround, end + turnaround, new Date(j.starts_at).getTime(), new Date(j.ends_at).getTime()));
    const blocked = ctx.blocks.filter(b => ["blocked", "maintenance"].includes(b.kind) && !b.crew_id
      && (space ? b.space_id === space.id || (!b.space_id && b.listing_id === item.listing_id) : b.listing_id === item.listing_id)
      && overlaps(start, end, new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()));
    checks.push(clash.length ? { key: "calendar", label: "Calendar", state: "fail", detail: `Clashes with ${clash.map(j => `${j.event_name} (${j.reference})`).join(", ")}` }
      : blocked.length ? { key: "calendar", label: "Calendar", state: "fail", detail: `Blocked: ${blocked.map(b => b.note || b.kind).join(", ")}` }
      : { key: "calendar", label: "Calendar", state: "ok", detail: "No conflicting bookings or blocks" });
  } else checks.push({ key: "calendar", label: "Calendar", state: "warn", detail: "Event date not confirmed yet" });

  // Space / capacity
  if (ctx.listing?.kind === "venue") {
    if (!space) checks.push({ key: "space", label: "Space", state: "warn", detail: "No specific space requested" });
    else checks.push({ key: "space", label: "Space", state: space.status === "published" ? "ok" : "warn", detail: `${space.name}${space.status === "published" ? "" : " (not published)"}` });
    const cap = space ? Math.max(space.capacity_standing ?? 0, space.capacity_seated ?? 0) : ctx.listing.capacity_max ?? 0;
    checks.push(!guests ? { key: "capacity", label: "Capacity", state: "warn", detail: "Guest count not provided" }
      : cap && guests > cap ? { key: "capacity", label: "Capacity", state: "fail", detail: `${guests} guests exceeds capacity of ${cap}` }
      : { key: "capacity", label: "Capacity", state: "ok", detail: `${guests} guests within capacity${cap ? ` of ${cap}` : ""}` });
  } else {
    const cap = ctx.listing?.capacity_max;
    checks.push(cap && guests > cap ? { key: "capacity", label: "Capacity", state: "warn", detail: `${guests} guests above usual capacity (${cap})` }
      : { key: "capacity", label: "Capacity", state: "ok", detail: guests ? `${guests} guests` : "No guest count needed" });
  }

  // Budget vs expected price (space hourly rate × hours, or listing starting price)
  const hours = start && end ? Math.max(1, (end - start) / 36e5) : 0;
  const expected = space?.rate_hourly && hours ? space.rate_hourly * hours : ctx.listing?.price_from ? Number(ctx.listing.price_from) * (ctx.listing.price_unit?.includes("guest") || ctx.listing.price_unit?.includes("person") ? Math.max(guests, 1) : 1) : null;
  const max = item.request?.budget_max ?? null;
  checks.push(!expected || !max ? { key: "budget", label: "Budget", state: "warn", detail: max ? "No price reference for this request" : "Budget not disclosed" }
    : max >= expected ? { key: "budget", label: "Budget", state: "ok", detail: `Budget up to £${Math.round(max).toLocaleString("en-GB")} covers est. £${Math.round(expected).toLocaleString("en-GB")}` }
    : max >= expected * 0.8 ? { key: "budget", label: "Budget", state: "warn", detail: `Budget £${Math.round(max).toLocaleString("en-GB")} is below est. £${Math.round(expected).toLocaleString("en-GB")}` }
    : { key: "budget", label: "Budget", state: "fail", detail: `Budget £${Math.round(max).toLocaleString("en-GB")} well below est. £${Math.round(expected).toLocaleString("en-GB")}` });

  // Lead time
  const leadDays = Number((ctx.listing?.details?.commercial as Record<string, unknown> | undefined)?.lead_days ?? 7);
  const shortNotice = Boolean((ctx.listing?.details?.commercial as Record<string, unknown> | undefined)?.short_notice ?? true);
  if (start) {
    const days = (start - now) / 864e5;
    checks.push(days >= leadDays ? { key: "lead_time", label: "Lead time", state: "ok", detail: `${Math.floor(days)} days notice (minimum ${leadDays})` }
      : { key: "lead_time", label: "Lead time", state: shortNotice || item.request?.emergency ? "warn" : "fail", detail: `${Math.max(0, Math.floor(days))} days notice — below your ${leadDays}-day minimum${shortNotice ? " (short notice allowed)" : ""}` });
  }

  const weight = { calendar: 35, capacity: 25, budget: 20, lead_time: 10, space: 5, commitments: 5 } as const;
  let score = 0, total = 0;
  for (const c of checks) { total += weight[c.key]; score += weight[c.key] * (c.state === "ok" ? 1 : c.state === "warn" ? 0.6 : 0); }
  const hard = checks.some(c => (c.key === "calendar" || c.key === "capacity") && c.state === "fail");
  return { score: total ? Math.round((100 * score) / total) : 0, hard, checks, space };
}
