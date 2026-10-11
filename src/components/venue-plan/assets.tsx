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

/* ── Seating & table numbering ─────────────────────────────────────────── */
export type Seating = { rows: number; cols: number; rowStyle: "alpha" | "numeric"; colStyle: "numeric" | "alpha"; rowStart: number; colStart: number; skipIO: boolean;
  rowDir: "front" | "back"; colDir: "ltr" | "rtl"; aisles: number[]; pitch: number; prefix: string; tiered?: boolean };
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
export const seatingSize = (s: Seating) => ({ w: (s.cols + s.aisles.length) * s.pitch, h: s.rows * s.pitch * (s.tiered ? 1.25 : 1) });
export const tableSize = (t: TableSpec) => t.shape === "round" ? { w: 18 + t.seats * 1.2, h: 18 + t.seats * 1.2 } : { w: Math.max(16, Math.ceil(t.seats / 2) * 6 + 6), h: 16 };

export type Seat = { key: string; label: string; row: string; num: string; x: number; y: number };
/** Seats of a seating block in its local frame (origin top-left, unrotated). Keys are stable: `<prefix>-<row>-<seat>`. */
export function blockSeats(s: Seating): Seat[] {
  const out: Seat[] = [], rowH = s.pitch * (s.tiered ? 1.25 : 1);
  for (let r = 0; r < s.rows; r++) {
    const ri = s.rowDir === "front" ? r : s.rows - 1 - r, rowNo = s.rowStart + ri;
    const row = s.rowStyle === "alpha" ? alpha(rowNo, s.skipIO) : String(rowNo);
    let gap = 0;
    for (let c = 0; c < s.cols; c++) {
      if (s.aisles.includes(c)) gap += 1;
      const ci = s.colDir === "ltr" ? c : s.cols - 1 - c, seatNo = s.colStart + ci, num = s.colStyle === "alpha" ? alpha(seatNo, s.skipIO) : String(seatNo);
      out.push({ key: `${s.prefix}-${row}-${num}`, label: `${s.prefix ? `${s.prefix} · ` : ""}Row ${row} · Seat ${num}`, row, num, x: (c + gap + 0.5) * s.pitch, y: (r + 0.5) * rowH });
    }
  }
  return out;
}
/** Chairs around a table in its local frame. Keys: `T<number>-<seat>`. */
export function tableSeats(t: TableSpec): Seat[] {
  const { w, h } = tableSize(t), out: Seat[] = [];
  for (let i = 0; i < t.seats; i++) {
    const num = t.seatStyle === "alpha" ? alpha(i + 1) : String(i + 1);
    let x: number, y: number;
    if (t.shape === "round") { const ang = (i / t.seats) * Math.PI * 2 - Math.PI / 2, r = w / 2 - 2.2; x = w / 2 + Math.cos(ang) * r; y = h / 2 + Math.sin(ang) * r; }
    else { const per = Math.ceil(t.seats / 2), top = i < per, k = top ? i : i - per, span = (w - 6) / per; x = 3 + span * (k + 0.5); y = top ? 2.2 : h - 2.2; }
    out.push({ key: `T${t.number}-${num}`, label: `Table ${t.number} · Seat ${num}`, row: `T${t.number}`, num, x, y });
  }
  return out;
}
