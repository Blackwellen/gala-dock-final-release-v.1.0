// Mirrors the design references in demo data (customer wallet and saved lists), keeping dates in the future so sale logic still works.
// Demo accounts only: never touches events copied into real accounts (settings.demo_copy_of). Idempotent.
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-design-mirror.mjs
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = (r, what) => { if (r.error) { console.error(what, r.error); process.exit(1); } return r.data; };
const { data: us } = await sb.auth.admin.listUsers({ perPage: 200 });
const alex = us.users.find(u => u.email === "alex.thompson@example.com");
const demo = q => q.is("settings->>demo_copy_of", null);
// London wall-clock → ISO (handles BST/GMT).
const london = (y, mo, d, h, mi = 0) => { const g = new Date(Date.UTC(y, mo - 1, d, h, mi)); const off = new Date(g.toLocaleString("en-US", { timeZone: "Europe/London" })).getTime() - new Date(g.toLocaleString("en-US", { timeZone: "UTC" })).getTime(); return new Date(g.getTime() - off).toISOString(); };

// 1) My Tickets "Upcoming" cards (Gala·Dock Ticket Dashboard): venues, times and order as in the reference.
const details = {
  "Sunset Sessions": { venue_name: "The Loft", city: "London", location: "The Loft, Shoreditch, London", starts_at: london(2027, 5, 10, 19), ends_at: london(2027, 5, 11, 1) },
  "Taste & Tango Food Fest": { venue_name: "Bayview Center", city: "London", location: "Bayview Center, London", starts_at: london(2027, 5, 24, 11), ends_at: london(2027, 5, 24, 22) },
  "Elite Sounds DJ": { venue_name: "Harbor View", city: "London", location: "Harbor View, London", starts_at: london(2027, 5, 31, 20), ends_at: london(2027, 6, 1, 2), cover_image: "/assets/gd/covers/neon-nights.webp" },
};
for (const [name, patch] of Object.entries(details)) {
  const rows = must(await demo(sb.from("events").select("id").eq("name", name).not("workspace_id", "is", null)), name);
  for (const r of rows) must(await sb.from("events").update(patch).eq("id", r.id), `update ${name}`);
}

// 2) "Past (12)" and "Resale / Transferred (3)": attended tickets for the workspace's past events.
const past = must(await demo(sb.from("events").select("id,name,starts_at").eq("management", "professional").lt("starts_at", new Date(Date.now() - 2 * 864e5).toISOString()).not("name", "ilike", "e2e%")).order("starts_at", { ascending: false }), "past events");
const mine = must(await sb.from("tickets").select("event_id,order_ref,status").eq("holder_id", alex.id), "my tickets");
const groups = new Set(mine.map(t => `${t.event_id}:${t.order_ref.replace(/-T$/, "")}`));
const pastGroups = () => [...groups].filter(g => past.some(e => g.startsWith(e.id))).length;
const tierOf = async id => must(await sb.from("ticket_tiers").select("id,price").eq("event_id", id).order("sort").limit(1), "tier")[0];
const mint = async (e, ref, status = "used") => {
  const tier = await tierOf(e.id); if (!tier) return;
  must(await sb.from("tickets").insert({ code: `GLD-MIR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, event_id: e.id, tier_id: tier.id, holder_id: alex.id, attendee_name: "Alex Thompson", attendee_email: alex.email, order_ref: ref, status, qr_nonce: crypto.randomUUID().replace(/-/g, ""), price_paid: Number(tier.price ?? 0), ...(status === "used" ? { checked_in_at: e.starts_at } : {}) }, { defaultToNull: false }), `ticket ${e.name}`);
  groups.add(`${e.id}:${ref}`);
};
for (const e of past) { if (pastGroups() >= 12) break; if (![...groups].some(g => g.startsWith(e.id))) await mint(e, `MIR-${e.id.slice(0, 6).toUpperCase()}-1`); }
for (const e of past) { if (pastGroups() >= 12) break; const ref = `MIR-${e.id.slice(0, 6).toUpperCase()}-2`; if (!groups.has(`${e.id}:${ref}`)) await mint(e, ref); }
const transferred = mine.filter(t => ["transferred", "resold", "refunded"].includes(t.status)).length + mine.filter(t => t.status === "resale_listed").length;
if (transferred < 3 && past[0]) await mint(past[0], `MIR-${past[0].id.slice(0, 6).toUpperCase()}-T`, "transferred");

// 3) Saved: tab counts Events (8) · Venues (6) · Services (12). Extra items are saved earlier, so each column still leads with the reference's three.
const saved = new Set(must(await sb.from("saved_items").select("item_key").eq("user_id", alex.id), "saved").map(r => r.item_key));
const count = p => [...saved].filter(k => k.startsWith(p)).length;
const older = i => new Date(Date.now() - (3 + i) * 864e5).toISOString();
const evs = must(await demo(sb.from("events").select("id").eq("visibility", "public").in("status", ["on_sale", "published"]).not("workspace_id", "is", null)).order("starts_at").limit(30), "public events");
const lst = must(await sb.from("listings").select("id,kind").eq("published", true).order("rating", { ascending: false }).limit(80), "listings");
const add = async (key, i) => { if (saved.has(key)) return; must(await sb.from("saved_items").insert({ user_id: alex.id, item_key: key, created_at: older(i) }), "save"); saved.add(key); };
let n = 0;
for (const e of evs) { if (count("event:") >= 8) break; await add(`event:${e.id}`, n++); }
const kindCount = async k => (must(await sb.from("listings").select("id").in("id", [...saved].filter(x => x.startsWith("listing:")).map(x => x.slice(8))).eq("kind", k), "kc")).length;
for (const l of lst.filter(l => l.kind === "venue")) { if (await kindCount("venue") >= 6) break; await add(`listing:${l.id}`, n++); }
for (const l of lst.filter(l => l.kind === "service")) { if (await kindCount("service") >= 12) break; await add(`listing:${l.id}`, n++); }

// 4) Recently viewed (Saved sidebar): closest real listings to the reference's four (venue, catering, terrace venue, photography).
const rv = ["The Grand Hall", "Gala Bites Catering", "Skyline Rooftop", "Moments Studio"];
for (const [i, name] of rv.entries()) {
  const l = must(await sb.from("listings").select("id").eq("name", name).eq("published", true).limit(1), name)[0]; if (!l) continue;
  must(await sb.from("recently_viewed").upsert({ user_id: alex.id, item_key: `listing:${l.id}`, viewed_at: new Date(Date.now() - i * 6e4).toISOString() }, { onConflict: "user_id,item_key" }), "recent");
}

// 5) Reviews (Gala·Dock Reviews Dashboard): three completed bookings awaiting review (The Loft, Taste & Tango, Elite Sounds DJ) and the
// four genuine Spring Engagement Party reviews as "recent" in the reference order. Reviews only exist for completed bookings, so
// public-profile reviews without a booking are attributed to another demo reviewer rather than the demo customer.
const other = us.users.find(u => u.email === "james.carter@example.com") ?? us.users.find(u => u.email === "alex.events@example.com");
const mineR = must(await sb.from("reviews").select("id,build_item_id,listing_id,build_items(title,events(name,owner_id))").eq("user_id", alex.id), "reviews");
for (const r of mineR) {
  const item = r.build_items;
  if (!r.build_item_id && other) must(await sb.from("reviews").update({ user_id: other.id }).eq("id", r.id), "reassign review");
  else if (item?.title === "Elite Sounds DJ" && item?.events?.name === "Rooftop Anniversary Dinner" && item?.events?.owner_id === alex.id) must(await sb.from("reviews").delete().eq("id", r.id), "pending elite");
}
const order = ["Riverside Bars", "Moments Studio", "Sweet Petals", "City Transport"];
for (const r of mineR) { const i = order.indexOf(r.build_items?.title ?? ""); if (i >= 0 && r.build_items?.events?.owner_id === alex.id) must(await sb.from("reviews").update({ created_at: new Date(Date.now() - (i + 1) * 3 * 864e5).toISOString() }).eq("id", r.id), "order review"); }

console.log(`design mirror: upcoming details updated; past groups ${pastGroups()}`);
