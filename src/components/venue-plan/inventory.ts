import { ASSET, blockSeats, tableSeats } from "./assets";
import type { MapEl } from "@/app/provider/venues/_components/venue-map";

export type InventorySeat = { key: string; label: string; section: string; kind: "seat" | "table_seat"; tier: string | null; accessible: boolean; blocked: boolean };

/** Seat inventory from an event plan's seat blocks and tables. Throws on duplicate seat keys (e.g. two blocks with the same name). */
export function planSeats(els: MapEl[]): InventorySeat[] {
  const out: InventorySeat[] = [], seen = new Set<string>();
  for (const e of els) {
    const def = ASSET[e.asset ?? ""]; if (!def || e.hidden) continue;
    const list = def.kind === "seating" && e.seating ? blockSeats(e.seating) : def.kind === "table" && e.table ? tableSeats(e.table) : [];
    for (const s of list) {
      if (seen.has(s.key)) throw new Error(`Seat ${s.key} appears twice — give each block and table a unique name/number.`);
      seen.add(s.key);
      const flag = e.seatFlags?.[s.key];
      out.push({ key: s.key, label: s.label, section: e.label, kind: def.kind === "table" ? "table_seat" : "seat", tier: e.seatTiers?.[s.key] ?? e.tier ?? null,
        accessible: flag === "accessible" || flag === "companion", blocked: flag === "blocked" });
    }
  }
  return out;
}

/** Standing / area capacity by tier (areas with capacity linked to a ticket tier). */
export function planAreas(els: MapEl[]) {
  return els.filter(e => ASSET[e.asset ?? ""]?.capacity && e.capacity).map(e => ({ label: e.label, capacity: e.capacity!, tier: e.tier ?? null }));
}
