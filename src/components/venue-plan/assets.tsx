import type { LucideIcon } from "lucide-react";
import { Users, Mic2, Disc3, SlidersHorizontal, Monitor, Camera, Lightbulb, DoorClosed, Sofa, Wine, UtensilsCrossed, Truck, Coffee, Droplets, PersonStanding, Crown, Cigarette,
  Accessibility, Music, Baby, Moon, ShoppingBag, Store, Megaphone, Shirt, Ticket, Info, Bath, ShowerHead, Cross, Search, BatteryCharging, Banknote, Lock, DoorOpen, LogOut, ShieldAlert,
  ShieldCheck, Fence, Flag, FireExtinguisher, Cctv, ParkingSquare, Bus, BusFront, CarTaxiFront, TrainFront, Bike, CarFront, Trees, TreePine, Waves, Tent, Footprints, Route, Siren, ListOrdered,
  Table2, Circle, Square, LayoutGrid, Martini, Accessibility as Wheelchair, Map as MapIcon, Star, Utensils, Shapes } from "lucide-react";

/** Kinds: area (filled zone), point (badge), seating (seat block), table (table + chairs), line (path/barrier). Sizes in metres. */
export type AssetKind = "area" | "point" | "seating" | "table" | "line";
export type AssetDef = { key: string; label: string; cat: string; icon: LucideIcon; kind: AssetKind; w?: number; h?: number; fill: string; stroke: string; pattern?: string; dash?: string; capacity?: boolean };
export const ASSET_CATS = ["Seating & tables", "Stages & production", "Food & drink", "Zones & areas", "Facilities", "Safety & access", "Transport & parking", "Landscape & outdoor", "Routes & barriers"] as const;

const C = { blue: ["#e1edff", "#2f6bff"], purple: ["#ece5ff", "#7c4dff"], pink: ["#ffe3ef", "#e0398b"], amber: ["#fff0d9", "#e08a00"], green: ["#ddf6e9", "#16a46c"], red: ["#ffe3e8", "#e5384f"],
  teal: ["#dcf6f7", "#0e9aa7"], slate: ["#e9ecf4", "#4a5277"], dark: ["#2b2f4a", "#14172e"], sky: ["#e0f2fe", "#0284c7"], grass: ["#e3f3dc", "#4c9a2a"], sand: ["#f7efdc", "#a0782c"] } as const;
const a = (key: string, label: string, cat: typeof ASSET_CATS[number], icon: LucideIcon, kind: AssetKind, col: readonly [string, string], extra: Partial<AssetDef> = {}): AssetDef =>
  ({ key, label, cat, icon, kind, fill: col[0], stroke: col[1], ...extra });

export const ASSETS: AssetDef[] = [
  a("seat_block", "Seating block", "Seating & tables", LayoutGrid, "seating", C.blue),
  a("tiered_stand", "Tiered stand", "Seating & tables", ListOrdered, "seating", C.purple),
  a("round_table", "Round table", "Seating & tables", Circle, "table", C.amber),
  a("banquet_table", "Banquet table", "Seating & tables", Table2, "table", C.amber),
  a("cocktail_table", "Cocktail table", "Seating & tables", Martini, "table", C.pink),
  a("vip_booth", "VIP booth", "Seating & tables", Crown, "table", C.purple),
  a("lounge", "Lounge seating", "Seating & tables", Sofa, "area", C.purple, { w: 6, h: 4, capacity: true }),
  a("accessible_seating", "Accessible seating", "Seating & tables", Wheelchair, "area", C.sky, { w: 6, h: 3, capacity: true }),

  a("stage", "Stage", "Stages & production", Mic2, "area", C.dark, { w: 12, h: 6 }),
  a("catwalk", "Catwalk", "Stages & production", Footprints, "area", C.dark, { w: 3, h: 14 }),
  a("dj_booth", "DJ booth", "Stages & production", Disc3, "area", C.dark, { w: 3, h: 2 }),
  a("foh", "Sound desk (FOH)", "Stages & production", SlidersHorizontal, "area", C.slate, { w: 4, h: 3 }),
  a("screen", "Screen / LED wall", "Stages & production", Monitor, "area", C.slate, { w: 6, h: 1 }),
  a("camera", "Camera platform", "Stages & production", Camera, "point", C.slate),
  a("lighting_tower", "Lighting tower", "Stages & production", Lightbulb, "point", C.slate),
  a("backstage", "Backstage", "Stages & production", DoorClosed, "area", C.slate, { w: 8, h: 5 }),
  a("green_room", "Green room", "Stages & production", Star, "area", C.slate, { w: 5, h: 4 }),

  a("bar", "Bar", "Food & drink", Wine, "area", C.amber, { w: 8, h: 2.5 }),
  a("food_stall", "Food stall", "Food & drink", Utensils, "area", C.amber, { w: 4, h: 3 }),
  a("food_truck", "Food truck", "Food & drink", Truck, "area", C.amber, { w: 6, h: 2.5 }),
  a("coffee", "Coffee point", "Food & drink", Coffee, "point", C.sand),
  a("catering", "Catering / kitchen", "Food & drink", UtensilsCrossed, "area", C.sand, { w: 6, h: 4 }),
  a("water_point", "Water refill", "Food & drink", Droplets, "point", C.sky),

  a("standing_area", "Standing area", "Zones & areas", PersonStanding, "area", C.blue, { w: 20, h: 12, capacity: true }),
  a("vip_area", "VIP area", "Zones & areas", Crown, "area", C.purple, { w: 10, h: 8, capacity: true }),
  a("dance_floor", "Dance floor", "Zones & areas", Music, "area", C.pink, { w: 8, h: 8, pattern: "check", capacity: true }),
  a("smoking_area", "Smoking area", "Zones & areas", Cigarette, "area", C.slate, { w: 6, h: 5, pattern: "hatch" }),
  a("accessible_viewing", "Accessible viewing", "Zones & areas", Accessibility, "area", C.sky, { w: 6, h: 3, capacity: true }),
  a("family_area", "Family area", "Zones & areas", Baby, "area", C.green, { w: 8, h: 6 }),
  a("quiet_room", "Quiet / sensory room", "Zones & areas", Moon, "area", C.teal, { w: 5, h: 4 }),
  a("merch", "Merch stand", "Zones & areas", Shirt, "area", C.pink, { w: 4, h: 2.5 }),
  a("market_stall", "Market stall", "Zones & areas", Store, "area", C.amber, { w: 3, h: 3 }),
  a("sponsor", "Sponsor activation", "Zones & areas", Megaphone, "area", C.pink, { w: 5, h: 5 }),
  a("box_office", "Box office", "Zones & areas", Ticket, "area", C.blue, { w: 4, h: 2 }),
  a("cloakroom", "Cloakroom", "Zones & areas", ShoppingBag, "area", C.slate, { w: 4, h: 3 }),
  a("info_point", "Info point", "Zones & areas", Info, "point", C.blue),

  a("toilets", "Toilets", "Facilities", Bath, "area", C.slate, { w: 5, h: 3 }),
  a("accessible_toilet", "Accessible toilet", "Facilities", Accessibility, "point", C.sky),
  a("showers", "Showers", "Facilities", ShowerHead, "area", C.teal, { w: 5, h: 3 }),
  a("baby_change", "Baby change", "Facilities", Baby, "point", C.teal),
  a("first_aid", "First aid", "Facilities", Cross, "area", C.red, { w: 4, h: 3 }),
  a("lost_property", "Lost property", "Facilities", Search, "point", C.slate),
  a("charging", "Charging station", "Facilities", BatteryCharging, "point", C.green),
  a("atm", "Cash machine", "Facilities", Banknote, "point", C.green),
  a("lockers", "Lockers", "Facilities", Lock, "area", C.slate, { w: 3, h: 1.5 }),

  a("entrance", "Entrance", "Safety & access", DoorOpen, "area", C.green, { w: 6, h: 1.5 }),
  a("exit", "Exit", "Safety & access", LogOut, "area", C.green, { w: 3, h: 1.2 }),
  a("fire_exit", "Fire exit", "Safety & access", ShieldAlert, "area", C.red, { w: 2, h: 1 }),
  a("security", "Security check", "Safety & access", ShieldCheck, "area", C.dark, { w: 6, h: 2 }),
  a("gate", "Gate", "Safety & access", Flag, "point", C.slate),
  a("assembly_point", "Assembly point", "Safety & access", Users, "point", C.green),
  a("extinguisher", "Fire extinguisher", "Safety & access", FireExtinguisher, "point", C.red),
  a("cctv", "CCTV", "Safety & access", Cctv, "point", C.slate),
  a("control_room", "Event control", "Safety & access", Siren, "area", C.red, { w: 4, h: 3 }),

  a("car_park", "Car park", "Transport & parking", ParkingSquare, "area", C.slate, { w: 30, h: 20, pattern: "bays", capacity: true }),
  a("accessible_parking", "Accessible parking", "Transport & parking", Accessibility, "area", C.sky, { w: 8, h: 6, pattern: "bays", capacity: true }),
  a("bus_stop", "Bus stop", "Transport & parking", BusFront, "point", C.blue),
  a("coach_drop", "Coach drop-off", "Transport & parking", Bus, "area", C.blue, { w: 15, h: 4 }),
  a("taxi_rank", "Taxi rank", "Transport & parking", CarTaxiFront, "area", C.amber, { w: 12, h: 3 }),
  a("rideshare", "Rideshare pick-up", "Transport & parking", CarFront, "point", C.slate),
  a("train", "Train station", "Transport & parking", TrainFront, "point", C.blue),
  a("shuttle", "Shuttle stop", "Transport & parking", Bus, "point", C.purple),
  a("bike_rack", "Bike rack", "Transport & parking", Bike, "area", C.green, { w: 6, h: 2 }),

  a("grass", "Grass / lawn", "Landscape & outdoor", Shapes, "area", C.grass, { w: 20, h: 14, pattern: "grass" }),
  a("park", "Park", "Landscape & outdoor", Trees, "area", C.grass, { w: 30, h: 20, pattern: "grass" }),
  a("tree", "Tree", "Landscape & outdoor", TreePine, "point", C.grass),
  a("water", "Water", "Landscape & outdoor", Waves, "area", C.sky, { w: 20, h: 6, pattern: "water" }),
  a("marquee", "Marquee / tent", "Landscape & outdoor", Tent, "area", C.sand, { w: 12, h: 9 }),
  a("camping", "Camping area", "Landscape & outdoor", Tent, "area", C.grass, { w: 30, h: 20, capacity: true }),
  a("square", "Plaza / hard standing", "Landscape & outdoor", Square, "area", C.sand, { w: 15, h: 10 }),

  a("walk_route", "Walking route", "Routes & barriers", Footprints, "line", C.blue, { dash: "6 4" }),
  a("step_free", "Step-free route", "Routes & barriers", Accessibility, "line", C.green, { dash: "6 5" }),
  a("emergency_route", "Emergency route", "Routes & barriers", Siren, "line", C.red, { dash: "10 4" }),
  a("vehicle_route", "Vehicle route", "Routes & barriers", Route, "line", C.slate),
  a("queue_lane", "Queue lane", "Routes & barriers", ListOrdered, "line", C.amber, { dash: "3 3" }),
  a("fence", "Fence / barrier", "Routes & barriers", Fence, "line", C.dark, { dash: "1 4" }),
  a("trail", "Trail / path", "Routes & barriers", MapIcon, "line", C.sand),
];
export const ASSET = Object.fromEntries(ASSETS.map(x => [x.key, x])) as Record<string, AssetDef>;

/** Design-system palette icons and legend swatches (public/assets/gd/builder) for catalogue entries that have a matching design visual. */
const GD = "/assets/gd/builder/venue-map/";
const ICON_FOR: Record<string, string> = { seating_fixed: "seat_block tiered_stand accessible_seating", table: "round_table banquet_table cocktail_table", booth: "vip_booth lounge", ga_zone: "standing_area",
  vip_area: "vip_area", stage: "stage catwalk", bar: "bar", toilet: "toilets accessible_toilet", entrance_exit: "entrance exit", barrier: "fence", path_route: "walk_route step_free trail", camera: "camera",
  staff_zone: "backstage control_room green_room", sponsor_area: "sponsor" };
const SWATCH_FOR: Record<string, string> = { vip_areas: "vip_area vip_booth lounge", ga_zones: "standing_area dance_floor", tables_booths: "round_table banquet_table cocktail_table",
  camera_production: "camera screen lighting_tower foh dj_booth", staff_only: "backstage control_room green_room", paths_barriers: "walk_route step_free emergency_route fence queue_lane trail" };
const invert = (m: Record<string, string>, pre: string) => Object.fromEntries(Object.entries(m).flatMap(([f, keys]) => keys.split(" ").map(k => [k, `${GD}${pre}-${f.replace(/_/g, "-")}.png`])));
export const ASSET_IMG: Record<string, string> = invert(ICON_FOR, "icon");
export const ASSET_SWATCH: Record<string, string> = invert(SWATCH_FOR, "legend");
export const KILL_SEATS_SWATCH = `${GD}legend-kill-seats.png`;


/* ── Seating & table numbering ─────────────────────────────────────────── */
/**
 * A reserved-seating block. `curve` wraps the rows around the stage (degrees of arc the block spans, 0 = straight rows) and
 * `rowOffset` staggers alternate rows by a fraction of the seat pitch for sightlines. Both default to off, so older plans render unchanged.
 */
export type Seating = { rows: number; cols: number; rowStyle: "alpha" | "numeric"; colStyle: "numeric" | "alpha"; rowStart: number; colStart: number; skipIO: boolean;
  rowDir: "front" | "back"; colDir: "ltr" | "rtl"; aisles: number[]; pitch: number; prefix: string; tiered?: boolean; curve?: number; rowOffset?: number };
export type TableSpec = { shape: "round" | "rect"; seats: number; number: string; seatStyle: "numeric" | "alpha" };
export const DEFAULT_SEATING: Seating = { rows: 8, cols: 12, rowStyle: "alpha", colStyle: "numeric", rowStart: 1, colStart: 1, skipIO: true, rowDir: "front", colDir: "ltr", aisles: [], pitch: 5, prefix: "A" };
export const DEFAULT_TABLE = (key: string): TableSpec => key === "banquet_table" ? { shape: "rect", seats: 12, number: "1", seatStyle: "numeric" }
  : key === "cocktail_table" ? { shape: "round", seats: 4, number: "1", seatStyle: "numeric" } : key === "vip_booth" ? { shape: "rect", seats: 6, number: "VIP 1", seatStyle: "numeric" } : { shape: "round", seats: 10, number: "1", seatStyle: "numeric" };

/** 1 → A … 26 → Z, 27 → AA (optionally skipping I and O, as box offices do). */
export function alpha(n: number, skipIO = false) {
  const letters = skipIO ? "ABCDEFGHJKLMNPQRSTUVWXYZ" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let s = "", x = n;
  while (x > 0) { x -= 1; s = letters[x % letters.length] + s; x = Math.floor(x / letters.length); }
  return s;
}

/** A seat in its element's local frame. `ri`/`ci` are layout row/column (front-left = 0), `ang` the facing rotation in degrees (0 = facing up / the stage). */
export type Seat = { key: string; label: string; row: string; num: string; x: number; y: number; ri?: number; ci?: number; ang?: number };
export type BlockLayout = { seats: Seat[]; w: number; h: number; outline: number[][]; rows: number[][]; aisles: number[][]; rowH: number };

const layoutCache = new WeakMap<Seating, BlockLayout>();
/**
 * Geometry of a seating block: seats (stable keys `<prefix>-<row>-<seat>`), bounding size, outline polygon, seat indices per row (left → right)
 * and aisle centre-lines. Straight, unstaggered blocks keep their original coordinates exactly.
 */
export function blockLayout(s: Seating): BlockLayout {
  const hit = layoutCache.get(s); if (hit) return hit;
  const rows = Math.max(1, s.rows), cols = Math.max(1, s.cols), p = s.pitch, rowH = p * (s.tiered ? 1.25 : 1), slots = cols + s.aisles.length;
  const curve = Math.min(160, Math.max(0, s.curve ?? 0)), off = Math.min(1, Math.max(0, s.rowOffset ?? 0));
  const th = (curve * Math.PI) / 180, R0 = curve > 0 ? (slots * p) / th : 0, step = curve > 0 ? th / slots : 0;
  const pos = (slot: number, r: number) => {
    if (curve <= 0) return { x: slot * p, y: (r + 0.5) * rowH, ang: 0 };
    const phi = slot * step - th / 2, R = R0 + (r + 0.5) * rowH;
    return { x: R * Math.sin(phi), y: R * Math.cos(phi), ang: (-phi * 180) / Math.PI };
  };
  const raw: Seat[] = [], rowIdx: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const ri = s.rowDir === "front" ? r : rows - 1 - r, rowNo = s.rowStart + ri;
    const row = s.rowStyle === "alpha" ? alpha(rowNo, s.skipIO) : String(rowNo);
    let gap = 0; const idx: number[] = [];
    for (let c = 0; c < cols; c++) {
      if (s.aisles.includes(c)) gap += 1;
      const ci = s.colDir === "ltr" ? c : cols - 1 - c, seatNo = s.colStart + ci, num = s.colStyle === "alpha" ? alpha(seatNo, s.skipIO) : String(seatNo);
      const q = pos(c + gap + 0.5 + (r % 2 ? off : 0), r);
      idx.push(raw.length);
      raw.push({ key: `${s.prefix}-${row}-${num}`, label: `${s.prefix ? `${s.prefix} · ` : ""}Row ${row} · Seat ${num}`, row, num, x: q.x, y: q.y, ri: r, ci: c, ang: q.ang });
    }
    rowIdx.push(idx);
  }
  // Outline: rectangle for straight rows, annular sector for curved rows.
  let outline: number[][];
  if (curve > 0) {
    const a0 = -th / 2, a1 = th / 2 + off * step, Ri = R0, Ro = R0 + rows * rowH, n = 28, arc: number[][] = [];
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; arc.push([Ri * Math.sin(a), Ri * Math.cos(a)]); }
    for (let i = n; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n; arc.push([Ro * Math.sin(a), Ro * Math.cos(a)]); }
    outline = arc;
  } else outline = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const q of raw) { minX = Math.min(minX, q.x - p / 2); maxX = Math.max(maxX, q.x + p / 2); minY = Math.min(minY, q.y - rowH / 2); maxY = Math.max(maxY, q.y + rowH / 2); }
  for (const [ox, oy] of outline) { minX = Math.min(minX, ox); maxX = Math.max(maxX, ox); minY = Math.min(minY, oy); maxY = Math.max(maxY, oy); }
  const straight = curve <= 0 && off === 0;
  if (straight) { minX = 0; minY = 0; }
  const w = straight ? slots * p : maxX - minX, h = straight ? rows * rowH : maxY - minY;
  const seats = straight ? raw : raw.map(q => ({ ...q, x: q.x - minX, y: q.y - minY }));
  if (!outline.length) outline = [[0, 0], [w, 0], [w, h], [0, h]]; else outline = outline.map(([ox, oy]) => [ox - minX, oy - minY]);
  // Aisle centre-lines from the front row to the back row.
  const aisles: number[][] = [];
  for (const a of [...new Set(s.aisles)].filter(c => c > 0 && c < cols).sort((m, n) => m - n)) {
    const f = rowIdx[0], b = rowIdx[rows - 1];
    const m1 = [(seats[f[a - 1]].x + seats[f[a]].x) / 2, (seats[f[a - 1]].y + seats[f[a]].y) / 2], m2 = [(seats[b[a - 1]].x + seats[b[a]].x) / 2, (seats[b[a - 1]].y + seats[b[a]].y) / 2];
    const dx = m2[0] - m1[0], dy = m2[1] - m1[1], len = Math.hypot(dx, dy) || 1, ex = (dx / len) * rowH * 0.5, ey = (dy / len) * rowH * 0.5;
    aisles.push([m1[0] - ex, m1[1] - (len ? ey : rowH / 2), m2[0] + ex, m2[1] + (len ? ey : rowH / 2)]);
  }
  // Round geometry: server (Node) and browser trig differ in the last float digits, which would break hydration.
  const rd = (n: number) => Math.round(n * 1000) / 1000;
  const out = { seats: seats.map(q => ({ ...q, x: rd(q.x), y: rd(q.y), ...(q.ang !== undefined ? { ang: rd(q.ang) } : {}) })), w: rd(w), h: rd(h), outline: outline.map(([ox, oy]) => [rd(ox), rd(oy)]), rows: rowIdx, aisles: aisles.map(a => a.map(rd)), rowH };
  layoutCache.set(s, out);
  return out;
}
export const seatingSize = (s: Seating) => { const l = blockLayout(s); return { w: l.w, h: l.h }; };
export const tableSize = (t: TableSpec) => t.shape === "round" ? { w: 18 + t.seats * 1.2, h: 18 + t.seats * 1.2 } : { w: Math.max(16, Math.ceil(t.seats / 2) * 6 + 6), h: 16 };

/** Seats of a seating block in its local frame (origin top-left, unrotated). Keys are stable: `<prefix>-<row>-<seat>`. */
export function blockSeats(s: Seating): Seat[] { return blockLayout(s).seats; }
/** Chairs around a table in its local frame. Keys: `T<number>-<seat>`. `ang` turns each chair to face the table. */
export function tableSeats(t: TableSpec): Seat[] {
  const { w, h } = tableSize(t), out: Seat[] = [];
  for (let i = 0; i < t.seats; i++) {
    const num = t.seatStyle === "alpha" ? alpha(i + 1) : String(i + 1);
    let x: number, y: number, ang: number;
    if (t.shape === "round") { const a = (i / t.seats) * Math.PI * 2 - Math.PI / 2, r = w / 2 - 2.2; x = w / 2 + Math.cos(a) * r; y = h / 2 + Math.sin(a) * r; ang = (a * 180) / Math.PI - 90; }
    else { const per = Math.ceil(t.seats / 2), top = i < per, k = top ? i : i - per, span = (w - 6) / per; x = 3 + span * (k + 0.5); y = top ? 2.2 : h - 2.2; ang = top ? 180 : 0; }
    out.push({ key: `T${t.number}-${num}`, label: `Table ${t.number} · Seat ${num}`, row: `T${t.number}`, num, x, y, ang });
  }
  return out;
}
