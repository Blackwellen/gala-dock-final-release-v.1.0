// Seeds a published reserved-seating layout for "Comedy Central Live" so checkout + seat picker have a real scenario.
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-checkout.mjs   (service role — scripts only)
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const ev = must(await sb.from("events").select("id,name").eq("slug", "comedy-central-live").single(), "event");
const LET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const alpha = n => { let s = "", x = n; while (x > 0) { x -= 1; s = LET[x % 24] + s; x = Math.floor(x / 24); } return s; };

// Tiers: two seated tiers + keep existing GA "Standard" for the bar standing area.
await sb.from("event_seats").delete().eq("event_id", ev.id);
await sb.from("venue_maps").delete().eq("event_id", ev.id);
const tierRows = [{ name: "Front Stalls", price: 42, color: "#e08a00", kind: "vip", sort: 1 }, { name: "Stalls", price: 30, color: "#2f6bff", kind: "general", sort: 2 }, { name: "Cabaret Table", price: 55, color: "#7c4dff", kind: "group", sort: 3 }];
const tiers = {};
for (const t of tierRows) {
  const ex = (await sb.from("ticket_tiers").select("id").eq("event_id", ev.id).eq("name", t.name).maybeSingle()).data;
  tiers[t.name] = ex ? ex.id : must(await sb.from("ticket_tiers").insert({ event_id: ev.id, ...t, quantity: 0, status: "on_sale", order_limit: 10 }).select("id").single(), `tier ${t.name}`).id;
}
const seating = (prefix, rows, cols, extra = {}) => ({ rows, cols, rowStyle: "alpha", colStyle: "numeric", rowStart: 1, colStart: 1, skipIO: true, rowDir: "front", colDir: "ltr", aisles: [], pitch: 5, prefix, ...extra });
const overlay = [
  { type: "asset", asset: "stage", id: "stage", label: "Stage", x: 175, y: 10, w: 150, h: 34 },
  { type: "asset", asset: "seat_block", id: "blk-a", label: "Block A", x: 95, y: 70, seating: seating("A", 6, 12, { curve: 40 }), w: 60, h: 30, tier: tiers["Front Stalls"] },
  { type: "asset", asset: "seat_block", id: "blk-b", label: "Block B", x: 215, y: 70, seating: seating("B", 6, 14, { curve: 30 }), w: 70, h: 30, tier: tiers["Front Stalls"] },
  { type: "asset", asset: "seat_block", id: "blk-c", label: "Block C", x: 345, y: 70, seating: seating("C", 6, 12, { curve: 40 }), w: 60, h: 30, tier: tiers["Front Stalls"] },
  ...[0, 1, 2, 3, 4, 5].map(i => ({ type: "asset", asset: "round_table", id: `t${i + 1}`, label: `Table ${i + 1}`, x: 110 + i * 50, y: 135, w: 25, h: 25, table: { shape: "round", seats: 6, number: String(i + 1), seatStyle: "numeric" }, tier: tiers["Cabaret Table"] })),
  { type: "asset", asset: "bar", id: "bar", label: "Bar", x: 120, y: 195, w: 110, h: 22 },
  { type: "asset", asset: "standing_area", id: "standing", label: "Bar standing", x: 250, y: 185, w: 150, h: 50, capacity: 120 },
  { type: "asset", asset: "fire_exit", id: "fx1", label: "Fire exit", x: 70, y: 220, w: 20, h: 10, protected: true },
  { type: "asset", asset: "entrance", id: "ent", label: "Entrance", x: 220, y: 250, w: 60, h: 14 },
];
// Seat inventory (keys must match blockSeats/tableSeats: `${prefix}-${row}-${num}` and `T${n}-${num}`).
const seats = [];
for (const b of overlay.filter(e => e.seating)) for (let r = 1; r <= b.seating.rows; r++) for (let c = 1; c <= b.seating.cols; c++) {
  const row = alpha(r); seats.push({ event_id: ev.id, seat_key: `${b.seating.prefix}-${row}-${c}`, label: `${b.label} · Row ${row} · Seat ${c}`, section: b.label, kind: "seat",
    tier_id: r <= 3 ? tiers["Front Stalls"] : tiers["Stalls"], accessible: r === 6 && (c === 1 || c === 2), status: "available" });
}
for (const t of overlay.filter(e => e.table)) for (let n = 1; n <= t.table.seats; n++) seats.push({ event_id: ev.id, seat_key: `T${t.table.number}-${n}`, label: `Table ${t.table.number} · Seat ${n}`, section: t.label, kind: "table_seat", tier_id: tiers["Cabaret Table"], accessible: false, status: "available" });
// Rows D–F of each block sell as "Stalls": tag them on the block for the picker colours.
for (const b of overlay.filter(e => e.seating)) b.seatTiers = Object.fromEntries(seats.filter(s => s.seat_key.startsWith(`${b.seating.prefix}-`) && s.tier_id === tiers["Stalls"]).map(s => [s.seat_key, tiers["Stalls"]]));
// A realistic sell-through: some seats already sold.
for (const s of seats) if (Math.abs(Math.sin(s.seat_key.length * 97 + s.seat_key.charCodeAt(s.seat_key.length - 1) * 13)) > 0.72) s.status = "sold";
must(await sb.from("venue_maps").insert({ event_id: ev.id, version: 1, status: "published", structure: { format: "plan-v2" }, overlay }), "plan");
for (let i = 0; i < seats.length; i += 200) must(await sb.from("event_seats").insert(seats.slice(i, i + 200)), "seats");
for (const [name, id] of Object.entries(tiers)) {
  const n = seats.filter(s => s.tier_id === id).length, sold = seats.filter(s => s.tier_id === id && s.status === "sold").length;
  must(await sb.from("ticket_tiers").update({ quantity: n, sold, held: 0, status: "on_sale" }).eq("id", id), `tier qty ${name}`);
}
console.log(JSON.stringify({ event: ev.name, seats: seats.length, sold: seats.filter(s => s.status === "sold").length, tiers }));
