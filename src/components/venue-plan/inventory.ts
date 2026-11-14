import { ASSET, blockSeats, tableSeats, type Seat, type Seating, type TableSpec } from "./assets";
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

/** Seats of one element (seat block or table); [] for anything else. */
export function elementSeats(e: MapEl): Seat[] {
  const def = ASSET[e.asset ?? ""]; if (!def) return [];
  return def.kind === "seating" && e.seating ? blockSeats(e.seating) : def.kind === "table" && e.table ? tableSeats(e.table) : [];
}

/**
 * Q55 · Seat counts that match the saved inventory: hidden elements are skipped (planSeats skips them too) and only flags on seats that
 * still exist count — a "blocked" flag left behind by a shrunk or renamed block no longer subtracts a seat.
 */
export function seatCounts(els: MapEl[]) {
  let seats = 0, tableSeatN = 0, tables = 0, blocked = 0;
  for (const e of els) {
    const def = ASSET[e.asset ?? ""]; if (!def || e.hidden) continue;
    const list = elementSeats(e); if (!list.length) continue;
    if (def.kind === "table") { tables += 1; tableSeatN += list.length; } else seats += list.length;
    for (const s of list) if (e.seatFlags?.[s.key] === "blocked") blocked += 1;
  }
  return { seats, tableSeats: tableSeatN, tables, blocked, sellable: seats + tableSeatN - blocked };
}

type SeatMaps = Pick<MapEl, "seatFlags" | "seatTiers">;
/** Position of a seat in its element: layout row/column for blocks, chair index for tables. */
const posKeys = (list: Seat[]) => list.map((s, i) => (s.ri !== undefined && s.ci !== undefined ? `${s.ri}:${s.ci}` : `#${i}`));
/**
 * Q55 · Per-seat flags and tiers are keyed by seat key (`A-B-3`, `T4-2`). Renaming a block, relabelling rows/seats or renumbering a table
 * changes every key, which silently dropped accessible / blocked / companion flags and per-seat tiers. This re-keys them by physical
 * position (row/column, or chair index) from the old layout to the new one; seats that no longer exist lose their entries.
 */
export function remapSeatMaps(oldSeats: Seat[], newSeats: Seat[], maps: SeatMaps): SeatMaps {
  if (!maps.seatFlags && !maps.seatTiers) return {};
  const oldPos = posKeys(oldSeats), newPos = posKeys(newSeats);
  const keyAt = new Map(newPos.map((p, i) => [p, newSeats[i]!.key]));
  const remap = <V>(m?: Record<string, V>) => {
    if (!m) return m;
    const out: Record<string, V> = {};
    oldSeats.forEach((s, i) => { const v = m[s.key]; const k = keyAt.get(oldPos[i]!); if (v !== undefined && k) out[k] = v; });
    return out;
  };
  return { ...(maps.seatFlags ? { seatFlags: remap(maps.seatFlags) } : {}), ...(maps.seatTiers ? { seatTiers: remap(maps.seatTiers) } : {}) };
}
export const remapBlock = (prev: Seating, next: Seating, maps: SeatMaps) => remapSeatMaps(blockSeats(prev), blockSeats(next), maps);
export const remapTable = (prev: TableSpec, next: TableSpec, maps: SeatMaps) => remapSeatMaps(tableSeats(prev), tableSeats(next), maps);

/** Drops seat flags / tiers whose seat no longer exists (stale keys skewed the server's seat count and were saved for ever). */
export function pruneSeatMaps(els: MapEl[]): MapEl[] {
  return els.map(e => {
    if (!e.seatFlags && !e.seatTiers) return e;
    const live = new Set(elementSeats(e).map(s => s.key));
    const keep = <V>(m?: Record<string, V>) => (m ? Object.fromEntries(Object.entries(m).filter(([k]) => live.has(k))) : m);
    return { ...e, ...(e.seatFlags ? { seatFlags: keep(e.seatFlags) } : {}), ...(e.seatTiers ? { seatTiers: keep(e.seatTiers) } : {}) };
  });
}
