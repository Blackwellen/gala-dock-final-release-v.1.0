// Customer ticket history for My Tickets (past attended events and a transferred ticket). Idempotent; imported by seed-demo-extras.mjs.
// Usage alone: node --env-file=.env --env-file=.env.local scripts/seed-customer-tickets.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = (r, what) => { if (r.error) { console.error(what, r.error); process.exit(1); } return r.data; };
const raw = sb.from.bind(sb); sb.from = t => { const q = raw(t); const ins = q.insert.bind(q); q.insert = (v, o = {}) => ins(v, { defaultToNull: false, ...o }); return q; };
const code = () => `GLD-${Math.random().toString(16).slice(2, 6).toUpperCase()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
const nonce = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");

const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
const alex = users.users.find(u => u.email === "alex.thompson@example.com"); if (!alex) throw new Error("customer missing");
const past = must(await sb.from("events").select("id,name,starts_at").eq("visibility", "public").lt("starts_at", new Date().toISOString()).order("starts_at", { ascending: false }).limit(3), "past events");
let issued = 0;
for (const [i, e] of past.entries()) {
  let tier = must(await sb.from("ticket_tiers").select("id,price").eq("event_id", e.id).limit(1), "tier")[0];
  if (!tier) tier = must(await sb.from("ticket_tiers").insert({ event_id: e.id, name: "General Admission", kind: "general", price: 35, quantity: 500, sold: 3, status: "sold_out", sort: 1 }).select("id,price").single(), "tier insert");
  const { count } = await sb.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", e.id).eq("holder_id", alex.id);
  if (count) continue;
  const n = i === 0 ? 2 : 1; const ref = `GLD-${new Date(e.starts_at).getFullYear()}-${String(200 + i).padStart(4, "0")}`;
  const rows = Array.from({ length: n }, () => ({ code: code(), event_id: e.id, tier_id: tier.id, holder_id: alex.id, attendee_name: "Alex Thompson", attendee_email: alex.email, order_ref: ref, status: "used", qr_nonce: nonce(), price_paid: tier.price, checked_in_at: new Date(new Date(e.starts_at).getTime() + 40 * 6e4).toISOString(), created_at: new Date(new Date(e.starts_at).getTime() - 30 * 864e5).toISOString() }));
  must(await sb.from("tickets").insert(rows), "past tickets");
  issued += n;
}
// Entry history for used tickets that have no scan record yet.
const used = must(await sb.from("tickets").select("id,event_id,checked_in_at,check_ins(id)").eq("holder_id", alex.id).eq("status", "used"), "used tickets");
const missing = used.filter(t => !t.check_ins?.length && t.checked_in_at);
if (missing.length) must(await sb.from("check_ins").insert(missing.map(t => ({ ticket_id: t.id, event_id: t.event_id, result: "admitted", created_at: t.checked_in_at }))), "check-ins");
// One ticket passed to a friend (shows under Resale / Transferred).
const sunset = must(await sb.from("events").select("id").eq("name", "Sunset Sessions").limit(1), "sunset")[0];
if (sunset) {
  const { count } = await sb.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", sunset.id).eq("holder_id", alex.id).eq("status", "transferred");
  if (!count) {
    const tier = must(await sb.from("ticket_tiers").select("id,price").eq("event_id", sunset.id).limit(1), "sunset tier")[0];
    if (tier) {
      const friend = must(await sb.from("tickets").insert({ code: code(), event_id: sunset.id, tier_id: tier.id, holder_id: null, attendee_name: "Sam Lee", attendee_email: "sam.lee@example.com", order_ref: "GLD-2027-0311-T", status: "valid", qr_nonce: nonce(), price_paid: tier.price }).select("id").single(), "friend ticket");
      must(await sb.from("tickets").insert({ code: code(), event_id: sunset.id, tier_id: tier.id, holder_id: alex.id, attendee_name: "Alex Thompson", attendee_email: alex.email, order_ref: "GLD-2027-0311", status: "transferred", replaced_by: friend.id, qr_nonce: nonce(), price_paid: tier.price }), "transferred ticket");
    }
  }
}
console.log(JSON.stringify({ customerTickets: issued }));
// Recently viewed history for Saved (real listings, most recent first).
const recent = must(await sb.from("listings").select("id").eq("published", true).order("rating", { ascending: false }).range(4, 7), "recent listings");
must(await sb.from("recently_viewed").upsert(recent.map((l, i) => ({ user_id: alex.id, item_key: `listing:${l.id}`, viewed_at: new Date(Date.now() - (i + 1) * 3 * 36e5).toISOString() }))), "recently viewed");
// A second completed event with reviewed bookings (Submitted reviews / Your recent reviews).
let party = must(await sb.from("events").select("id").eq("owner_id", alex.id).eq("name", "Spring Engagement Party").maybeSingle(), "party");
if (!party) {
  party = must(await sb.from("events").insert({ owner_id: alex.id, management: "consumer", name: "Spring Engagement Party", event_type: "party", status: "completed", visibility: "private", starts_at: new Date(Date.now() - 160 * 864e5).toISOString(), ends_at: new Date(Date.now() - 160 * 864e5 + 6 * 36e5).toISOString(), location: "Shoreditch, London", city: "London", guest_count: 60, budget_total: 6000, currency: "GBP", cover_image: "/assets/gd/hero-wedding.webp" }).select("id").single(), "party insert");
  const names = [["Riverside Bars", "drinks", 5, "Great selection of drinks and the team were brilliant all night — guests kept asking about the cocktails."], ["Moments Studio", "media", 5, "Absolutely fantastic! Captured the day perfectly and delivered the gallery within a week."], ["Sweet Petals", "styling", 4, "Beautiful arrangements and super easy to work with. Setup ran slightly late but the result was lovely."], ["City Transport", "transport", 5, "Arrived on time and very professional. Highly recommend for guest shuttles."]];
  for (const [i, [n, cat, rating, body]] of names.entries()) {
    const l = must(await sb.from("listings").select("id,image,price_from").eq("name", n).limit(1), `listing ${n}`)[0];
    const it = must(await sb.from("build_items").insert({ event_id: party.id, listing_id: l?.id ?? null, category: cat, title: n, package: "", scope: "", image: l?.image ?? "", amount: Number(l?.price_from ?? 500), price_basis: "fixed", status: "fulfilled", role: "primary", sort: i + 1 }).select("id").single(), "party item");
    must(await sb.from("reviews").insert({ user_id: alex.id, build_item_id: it.id, listing_id: l?.id ?? null, rating, ratings: { quality: rating, communication: rating, value: Math.max(3, rating - (i % 2)), reliability: rating }, body, status: "published", created_at: new Date(Date.now() - (150 - i * 6) * 864e5).toISOString() }), "party review");
  }
}
// Profile details shown on My Account.
must(await sb.from("profiles").update({ phone: "+44 7712 345678", country: "GB", language: "en", bio: "I love discovering unique venues and organising amazing experiences with friends and family.", date_of_birth: "1994-03-14", avatar_url: "/assets/gd/av-alex-customer.webp" }).eq("id", alex.id), "profile details");
// "My Schedule" on Home lists tasks due today: give the wedding four timed tasks for the current day (London time).
{
  const wed = must(await sb.from("events").select("id").eq("owner_id", alex.id).eq("management", "consumer").ilike("name", "%wedding%").order("created_at").limit(1), "wedding")[0];
  if (wed) {
    const london = (h, m = 0) => { const now = new Date(); const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m)); const off = new Date(d.toLocaleString("en-US", { timeZone: "Europe/London" })).getTime() - new Date(d.toLocaleString("en-US", { timeZone: "UTC" })).getTime(); return new Date(d.getTime() - off).toISOString(); };
    const today = [["Team sync", "meeting", 10], ["Review event details", "event", 13], ["Venue call", "venue", 16], ["Dinner reservation", "food", 18]];
    must(await sb.from("tasks").delete().eq("event_id", wed.id).in("title", today.map(t => t[0])), "clear today tasks");
    must(await sb.from("tasks").insert(today.map(([title, category, h]) => ({ event_id: wed.id, owner_id: alex.id, title, category, due_at: london(h), status: "todo", priority: "medium" }))), "today tasks");
  }
}
