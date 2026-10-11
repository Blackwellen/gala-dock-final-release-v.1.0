// Professional ticket setup for Neon Nights Festival (W03): sections, release phases, tier artwork and rules, promoter allocations and codes.
// Keeps existing tiers, prices and sales intact. Idempotent; imported by seed-demo-extras.mjs. Usage alone: node --env-file=.env --env-file=.env.local scripts/seed-ticket-pro.mjs
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = (r, what) => { if (r.error) { console.error(what, r.error); process.exit(1); } return r.data; };
const I = "/assets/gd/builder/tickets";

const ev = must(await sb.from("events").select("id,starts_at,settings").eq("name", "Neon Nights Festival").limit(1).single(), "event");
const start = Date.parse(ev.starts_at); const at = (days, h = 10) => { const d = new Date(start - days * 864e5); d.setUTCHours(h - 1, 0, 0, 0); return d.toISOString(); };
const close = new Date(start - 60 * 6e4).toISOString();
let tiers = must(await sb.from("ticket_tiers").select("id,name,sold,status").eq("event_id", ev.id), "tiers");
const byName = n => tiers.find(t => t.name === n);

const meta = {
  "Early Bird": { description: "Standard entry to the event", image: `${I}/tier-early.webp`, release_name: "Phase 1 – Early Access", badge: "Limited time", color: "#2563eb" },
  "General Admission": { description: "Standard entry to the event", image: `${I}/tier-general.webp`, release_name: "Phase 2 – General Sale", color: "#7c3aed" },
  "VIP": { description: "Premium entry with lounge access", image: `${I}/tier-vip.webp`, release_name: "Phase 2 – General Sale", badge: "Most popular", color: "#e0398b" },
  "Group (4+)": { description: "Discounted group entry", image: `${I}/tier-group.webp`, release_name: "Phase 2 – General Sale", color: "#e08a00" },
  "Complimentary": { description: "Staff, press and special guests", image: `${I}/tier-comp.webp`, color: "#64748b" },
};
for (const [name, m] of Object.entries(meta)) { const t = byName(name); if (t) must(await sb.from("ticket_tiers").update(m).eq("id", t.id), `tier ${name}`); }
// New tiers: an accessible tier on sale now and a backstage pass that opens when VIP sells out.
const extra = [
  { name: "Accessible Ticket", kind: "accessible", price: 35, quantity: 200, description: "For disabled guests + companion", image: `${I}/tier-accessible.webp`, color: "#16a46c", status: "on_sale", sale_start: at(43), sale_end: close, release_name: "Phase 2 – General Sale", sort: 5 },
  { name: "Backstage Pass", kind: "vip", price: 250, quantity: 100, description: "Artist meet & greet + stage access", image: `${I}/tier-backstage.webp`, color: "#0ea5c6", status: "scheduled", sale_start: at(7), sale_end: close, release_name: "Phase 3 – Final Release", sort: 6, after_tier: byName("VIP")?.id ?? null },
];
for (const t of extra) { const ex = byName(t.name); if (ex) must(await sb.from("ticket_tiers").update(t).eq("id", ex.id), t.name); else must(await sb.from("ticket_tiers").insert({ ...t, event_id: ev.id, order_limit: 10 }), t.name); }
tiers = must(await sb.from("ticket_tiers").select("id,name").eq("event_id", ev.id), "tiers");
const id = n => tiers.find(t => t.name === n)?.id;

const sections = [
  { id: "ga", name: "General Admission", type: "standing", capacity: 3000, color: "#2563eb", tiers: ["Early Bird", "General Admission", "Group (4+)"].map(id).filter(Boolean), holds: 50 },
  { id: "vip-l", name: "VIP Left", type: "vip", capacity: 400, color: "#7c3aed", tiers: ["VIP", "Backstage Pass"].map(id).filter(Boolean), holds: 20 },
  { id: "vip-r", name: "VIP Right", type: "vip", capacity: 400, color: "#a855f7", tiers: ["VIP", "Backstage Pass"].map(id).filter(Boolean), holds: 20 },
  { id: "seated", name: "Premium Seated", type: "reserved", capacity: 700, color: "#e08a00", tiers: [], holds: 0 },
  { id: "acc", name: "Accessible", type: "accessible", capacity: 200, color: "#16a46c", tiers: [id("Accessible Ticket")].filter(Boolean), holds: 0 },
  { id: "holds", name: "Comps & Holds", type: "hold", capacity: 100, color: "#64748b", tiers: [], holds: 0 },
];
for (const t of tiers) { const names = sections.filter(s => s.tiers.includes(t.id)).map(s => s.name).join(", "); must(await sb.from("ticket_tiers").update({ allocation: names }).eq("id", t.id), "alloc"); }
const s = ev.settings ?? {};
const ticket_pro = {
  ...(s.ticket_pro ?? {}), model: "hybrid", capacity: 4800, buffer_pct: 5, map_source: "venue", map_image: null, sections,
  phases: [{ id: "p1", name: "Phase 1 – Early Access", starts_at: at(53) }, { id: "p2", name: "Phase 2 – General Sale", starts_at: at(43) }, { id: "p3", name: "Phase 3 – Final Release", starts_at: at(7) }],
  sales: { order_limit: 10, min_age: 18, timezone: "Europe/London", waiting_list: true, resale: false, show_remaining: true, countdown: true, require_account: false, discount_codes: true, referral: true },
  access: {
    transfers: true, resale: true, resale_cap: 150, fee_buyer: 5, fee_seller: 5, refund: "date", refund_cutoff: at(13, 23), refund_amount: 100,
    questions: [{ key: "full_name", label: "Full name", on: true, required: true }, { key: "email", label: "Email address", on: true, required: true }, { key: "dob", label: "Date of birth", on: false, required: false }, { key: "dietary", label: "Dietary requirements", on: true, required: false }, { key: "accessibility", label: "Accessibility needs", on: true, required: false }],
    fee_display: "upfront", terms_template: "Standard Event Ticket Terms (v2.1)", require_terms: true, age_message: true, age_text: "18+ only",
    info_text: "Please arrive early, bring valid ID and check the event FAQ for full details on entry, security and accessibility.", comps: 100, companion: true, accessible_seats: 200,
  },
};
must(await sb.from("events").update({ settings: { ...s, ticket_pro, ticket_capacity: 4560, ticketing_live: true } }).eq("id", ev.id), "settings");

const promoters = must(await sb.from("promoters").select("id,name").eq("event_id", ev.id).order("created_at"), "promoters");
const allocs = [500, 300, 200];
for (const [i, p] of promoters.entries()) must(await sb.from("promoters").update({ ticket_allocation: allocs[i] ?? 100 }).eq("id", p.id), "promoter alloc");
for (const c of [{ code: "EARLY25", kind: "percent", amount: 25, valid_from: at(53), status: "active" }, { code: "VIP100", kind: "amount", amount: 100, valid_from: at(43), status: "active" }, { code: "GROUP10", kind: "percent", amount: 10, valid_from: at(7), status: "scheduled" }, { code: "STAFF", kind: "percent", amount: 100, valid_from: at(53), status: "active", max_uses: 60 }]) {
  const ex = must(await sb.from("discount_codes").select("id").eq("event_id", ev.id).eq("code", c.code).maybeSingle(), "code?");
  if (!ex) must(await sb.from("discount_codes").insert({ ...c, event_id: ev.id }), c.code);
}
console.log("ticket pro setup seeded for Neon Nights Festival");
