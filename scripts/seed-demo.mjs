// Seeds deterministic demo/test fixtures for the Customer App and Organizer workspace.
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-demo.mjs [--remove]
// Idempotent: removes previous demo rows (identified by the demo user ids) before inserting.
// Demo identities use @example.com addresses; passwords are written to .env.local (git-ignored).
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// Mixed-shape bulk inserts must use column defaults for keys a row omits, not NULL.
const rawFrom = sb.from.bind(sb);
sb.from = table => { const q = rawFrom(table); const ins = q.insert.bind(q); q.insert = (v, o = {}) => ins(v, { defaultToNull: false, ...o }); return q; };
const must = (r, what) => { if (r.error) { console.error(what, r.error); process.exit(1); } return r.data; };
const img = n => `/assets/gd/${n}.webp`;
// Europe/London wall-clock → ISO. BST (+01:00) from last Sun of March to last Sun of Oct.
const at = (y, mo, d, h = 0, mi = 0) => {
  const bst = (mo > 3 && mo < 10) || (mo === 3 && d >= 28) || (mo === 10 && d < 31);
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00${bst ? "+01:00" : "+00:00"}`;
};
const day = (y, mo, d) => `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const USERS = {
  customer: { email: "alex.thompson@example.com", name: "Alex Thompson", env: "DEMO_CUSTOMER_PASSWORD" },
  organizer: { email: "alex.events@example.com", name: "Alex Thomas", env: "DEMO_ORGANIZER_PASSWORD" },
  provider: { email: "provider.demo@example.com", name: "Jordan Ellis", env: "DEMO_PROVIDER_PASSWORD" },
  crew: { email: "james.carter@example.com", name: "James Carter", env: "DEMO_CREW_PASSWORD" },
};

async function ensureUser(u) {
  let password = process.env[u.env];
  const list = must(await sb.auth.admin.listUsers({ perPage: 1000 }), "listUsers");
  const found = list.users.find(x => x.email === u.email);
  if (found) return { id: found.id, password };
  password ||= randomBytes(12).toString("base64url") + "a1!";
  const created = must(await sb.auth.admin.createUser({ email: u.email, password, email_confirm: true, user_metadata: { full_name: u.name, terms_version: "2026-10" } }), "createUser");
  return { id: created.user.id, password, created: true };
}

async function cleanup(ids) {
  const owners = Object.values(ids);
  const ws = must(await sb.from("workspaces").select("id").in("owner_id", owners), "ws").map(w => w.id);
  // Provider fulfilment rows (Phase 3) restrict build_item deletion by design; clear demo ones first.
  if (ws.length) { const r = await sb.from("provider_jobs").delete().in("workspace_id", ws); if (r.error && r.error.code !== "42P01") must(r, "clean provider_jobs"); }
  const ev = must(await sb.from("events").select("id").or(`owner_id.in.(${owners.join(",")})${ws.length ? `,workspace_id.in.(${ws.join(",")})` : ""}`), "ev").map(e => e.id);
  if (ws.length) {
    for (const t of ["transactions", "invoices", "agent_approvals", "agent_runs", "agent_routines", "proposals", "leads", "shifts", "crew_members", "event_templates", "calendar_entries", "tasks", "media_assets"]) {
      must(await sb.from(t).delete().in("workspace_id", ws), `clean ${t}`);
    }
  }
  if (ev.length) {
    must(await sb.from("transactions").delete().in("event_id", ev), "clean tx ev");
    must(await sb.from("reviews").delete().in("user_id", owners), "clean reviews");
    must(await sb.from("tickets").delete().in("event_id", ev), "clean tickets");
    must(await sb.from("events").delete().in("id", ev), "clean events");
  }
  must(await sb.from("notifications").delete().in("user_id", owners), "clean notifications");
  must(await sb.from("tasks").delete().in("owner_id", owners), "clean user tasks");
  if (ws.length) {
    must(await sb.from("listings").delete().in("workspace_id", ws), "clean listings");
    must(await sb.from("profiles").update({ last_workspace_id: null }).in("id", owners), "unlink");
    must(await sb.from("workspaces").delete().in("id", ws), "clean ws");
  }
}

const ids = {}; const passwords = {};
for (const [k, u] of Object.entries(USERS)) { const r = await ensureUser(u); ids[k] = r.id; if (r.password) passwords[u.env] = r.password; }
await cleanup(ids);
if (process.argv.includes("--remove")) {
  for (const id of Object.values(ids)) await sb.auth.admin.deleteUser(id);
  console.log("Demo data removed."); process.exit(0);
}

// Persist generated passwords for Playwright/visual checks.
let envLocal = await fs.readFile(".env.local", "utf8");
for (const [k, v] of Object.entries(passwords)) {
  if (!envLocal.includes(`${k}=`)) envLocal += `${envLocal.endsWith("\n") ? "" : "\n"}${k}=${v}\n`;
}
await fs.writeFile(".env.local", envLocal);

// ── Profiles ─────────────────────────────────────────────────────────────
must(await sb.from("profiles").update({ full_name: "Alex Thompson", home_area: "London, UK", currency: "GBP", onboarding_complete: true, interests: ["Music", "Food & Drink", "Weddings"],
  notifications: { event_updates: true, ticket_notifications: true, messages: true, marketing: false } }).eq("id", ids.customer), "p1");
must(await sb.from("profiles").update({ full_name: "Alex Thomas", home_area: "London, UK", onboarding_complete: true }).eq("id", ids.organizer), "p2");
must(await sb.from("profiles").update({ full_name: "Jordan Ellis", home_area: "London, UK", onboarding_complete: true }).eq("id", ids.provider), "p3");
must(await sb.from("profiles").update({ full_name: "James Carter", home_area: "London, UK", onboarding_complete: true }).eq("id", ids.crew), "p4");

// ── Workspaces ───────────────────────────────────────────────────────────
const insertWs = async row => must(await sb.from("workspaces").insert({ status: "active", onboarding_complete: true, onboarding_step: "complete", ...row }).select().single(), "ws " + row.name);
const org = await insertWs({ owner_id: ids.organizer, name: "Alex Events", kind: "organizer", verification_status: "verified", payout_status: "active",
  settings: { demo: true, legal_name: "Alex Events Ltd", registration: "12345678", vat: "GB123456789", address: "123 High Street, London, E1 6AN, United Kingdom",
    country: "United Kingdom", currency: "GBP", timezone: "Europe/London", date_format: "26 Aug 2026", time_format: "24 hour (13:00)", website: "alexevents.galadock.com",
    contact_email: "hello@alexevents.co.uk", contact_phone: "+44 7700 900123", plan: "Pro Plan", plan_price: 169, description: "Professional event management and production across the UK.",
    agent: { approval_policy: "Require approval for high-impact actions", autopilot: "Limited (suggest & draft only)", access_scope: "All events and workspace data", usage_limit: "2.4M / 40M tokens this month" } } });
must(await sb.from("workspace_members").upsert({ workspace_id: org.id, user_id: ids.crew, role: "member", status: "active" }), "crew member");
must(await sb.from("profiles").update({ last_workspace_id: org.id }).eq("id", ids.organizer), "last ws");
const arena = await insertWs({ owner_id: ids.provider, name: "Riverside Arena", kind: "provider", capabilities: ["venue", "service"], verification_status: "verified", payout_status: "active", settings: { demo: true } });
const venuesWs = await insertWs({ owner_id: ids.provider, name: "London Venue Collective", kind: "provider", capabilities: ["venue"], verification_status: "verified", payout_status: "active", settings: { demo: true } });
const servicesWs = await insertWs({ owner_id: ids.provider, name: "Premier Event Services", kind: "provider", capabilities: ["service"], verification_status: "verified", payout_status: "active", settings: { demo: true } });

// ── Listings ─────────────────────────────────────────────────────────────
const L = {};
const listing = async (key, row) => { L[key] = must(await sb.from("listings").insert({ published: true, verified: true, slug: key, ...row }).select().single(), "listing " + key); };
const V = (ws, name, o) => ({ workspace_id: ws, kind: "venue", name, price_unit: "per day", ...o });
const S = (ws, name, o) => ({ workspace_id: ws, kind: "service", name, ...o });
await listing("riverside-park-events-venue", V(venuesWs.id, "Riverside Park Events Venue", { category: "Outdoor", city: "London", location: "London, UK", image: img("v-riverside-park"), price_from: 2500, capacity_max: 5000, rating: 4.9, review_count: 128, response_hours: 2, badge: "Best Match", tags: ["Waterfront", "Outdoor", "Catering", "Parking"], lat: 51.5033, lng: -0.1195, description: "Stunning riverside venue with panoramic views, multiple event spaces and full production support.", details: { setting: "Indoor & Outdoor", spaces: 3, booking_mode: "Request" } }));
await listing("the-grand-hall", V(venuesWs.id, "The Grand Hall", { category: "Ballroom", city: "Manchester", location: "Manchester, UK", image: img("v-grand-hall"), price_from: 3800, capacity_max: 4000, rating: 4.8, review_count: 92, badge: "Available", tags: ["Historic", "Ballroom", "Catering", "AV"], lat: 53.4794, lng: -2.2453, description: "Elegant historic venue with flexible spaces for corporate events, weddings and large-scale productions.", details: { setting: "Indoor" } }));
await listing("east-london-warehouse", V(venuesWs.id, "East London Warehouse", { category: "Industrial", city: "London", location: "London, UK", image: img("v-east-london-warehouse"), price_from: 2200, capacity_max: 6000, rating: 4.7, review_count: 64, badge: "Likely Available", tags: ["Industrial", "Large Space", "Bars", "Production"], lat: 51.5246, lng: -0.0574, description: "Versatile warehouse venue perfect for music events, launches and private parties.", details: { setting: "Indoor" } }));
await listing("skyline-rooftop", V(venuesWs.id, "Skyline Rooftop", { category: "Rooftop", city: "London", location: "London, UK", image: img("v-skyline-rooftop"), price_from: 1800, capacity_max: 2500, rating: 4.6, review_count: 58, badge: "Awaiting Confirmation", tags: ["Rooftop", "City Views", "Bar", "Catering"], lat: 51.5145, lng: -0.0819, description: "Exclusive rooftop venue with stunning city views, ideal for summer events and private functions.", details: { setting: "Outdoor" } }));
await listing("oakwood-country-estate", V(venuesWs.id, "Oakwood Country Estate", { category: "Estate", city: "Surrey", location: "Surrey, UK", image: img("v-oakwood"), price_from: 4500, capacity_max: 8000, rating: 4.8, review_count: 76, badge: "Available", tags: ["Estates", "Gardens", "Marquee", "Catering"], lat: 51.2362, lng: -0.5704, description: "Beautiful country estate with extensive grounds, perfect for festivals, corporate events and weddings.", details: { setting: "Indoor & Outdoor" } }));
await listing("riverside-conference-centre", V(venuesWs.id, "Riverside Conference Centre", { category: "Conference", city: "London", location: "London, UK", image: img("v-riverside-conference"), price_from: 2900, capacity_max: 3000, rating: 4.7, review_count: 52, badge: "Available", tags: ["Modern", "Conference", "Catering", "Parking"], lat: 51.5007, lng: 0.0035, description: "Modern conference venue with flexible spaces, advanced AV and excellent transport links.", details: { setting: "Indoor" } }));
await listing("pulse-nightclub", V(venuesWs.id, "Pulse Nightclub", { category: "Nightclub", city: "London", location: "London, UK", image: img("v-pulse"), price_from: 1600, capacity_max: 2000, rating: 4.6, review_count: 89, badge: "Popular", tags: ["Nightclub", "Sound System", "Bar", "VIP Areas"], lat: 51.5136, lng: -0.1365, description: "Iconic nightclub venue with world-class sound and lighting, ideal for DJ events and late-night parties.", details: { setting: "Indoor" } }));
await listing("olympic-stadium", V(venuesWs.id, "Olympic Stadium", { category: "Stadium", city: "London", location: "London, UK", image: img("v-olympic"), price_from: 12000, capacity_max: 20000, rating: 4.9, review_count: 112, badge: "Available", tags: ["Stadium", "Large Scale", "Production", "Parking"], lat: 51.5386, lng: -0.0166, description: "World-class stadium for major concerts, festivals and large-scale events with full facilities.", details: { setting: "Outdoor" } }));
await listing("the-loft-london", V(venuesWs.id, "The Loft London", { category: "Rooftop", city: "London", location: "Riverside, SE1 2AB", image: img("b-loft"), gallery: [img("sv-loft"), img("v-loft-sm")], price_from: 500, capacity_max: 150, rating: 4.8, review_count: 320, badge: "Available", tags: ["Rooftop", "City View", "200 guests"], lat: 51.5055, lng: -0.0754, description: "Venue hire • Indoor & outdoor rooftop space with skyline views.", details: { setting: "Indoor & outdoor" } }));
await listing("riverside-events-center", V(venuesWs.id, "Riverside Events Center", { category: "Event Hall", city: "London", location: "Southbank, London", image: img("v-riverside-events-centre"), price_from: 1200, capacity_max: 1000, rating: 4.7, review_count: 540, tags: ["Event Hall", "Waterfront", "1,000 guests"], lat: 51.5059, lng: -0.1149 }));
await listing("the-harper", V(venuesWs.id, "The Harper", { category: "Private Dining", city: "London", location: "Mayfair, London", image: img("v-harper"), price_from: 800, capacity_max: 150, rating: 4.6, review_count: 280, tags: ["Private Dining", "Luxury", "150 guests"], lat: 51.5098, lng: -0.1478 }));
await listing("riverside-manor", V(venuesWs.id, "Riverside Manor", { category: "Estate", city: "Surrey", location: "Surrey, KT10 8DE", image: img("sv-riverside-manor"), price_from: 3200, capacity_max: 200, rating: 4.7, review_count: 148, badge: "Limited dates", lat: 51.37, lng: -0.36 }));
await listing("skyline-events-space", V(venuesWs.id, "Skyline Events Space", { category: "Event Space", city: "London", location: "Canary Wharf, London", image: img("sv-skyline-space"), price_from: 2600, capacity_max: 500, rating: 4.6, review_count: 96, badge: "Available", lat: 51.5054, lng: -0.0235 }));
// Riverside Arena (shared with the Provider workspace build)
await listing("riverside-arena", V(arena.id, "Riverside Arena", { category: "Arena", city: "London", location: "Riverside, London SE1", image: img("v-riverside-park"), price_from: 6000, capacity_max: 5000, rating: 4.8, review_count: 210, tags: ["Arena", "Production", "Bars", "Rooftop"], lat: 51.5017, lng: -0.1182, description: "Five flexible spaces on the river: Main Hall, Riverside Suite, Rooftop Terrace, Studio Space and Grounds & Gardens." }));
await listing("gala-bites-catering", S(arena.id, "Gala Bites Catering", { category: "Catering", city: "London", location: "London, UK", image: img("s-gourmet"), price_from: 28, price_unit: "per guest", rating: 4.8, review_count: 132, lat: 51.5017, lng: -0.1182 }));
await listing("riverside-dj-sound", S(arena.id, "DJ & Sound", { category: "DJ", city: "London", location: "London, UK", image: img("s-dj-marcus"), price_from: 650, rating: 4.7, review_count: 58, lat: 51.5017, lng: -0.1182 }));
// Services
await listing("dj-marcus-lee", S(servicesWs.id, "DJ Marcus Lee", { category: "DJ", city: "London", location: "London, UK", image: img("s-dj-marcus"), price_from: 450, rating: 5.0, review_count: 86, response_hours: 2, badge: "Top Rated", tags: ["DJ", "Sound", "Lighting", "MC", "Multi-genre"], lat: 51.52, lng: -0.1, description: "Professional DJ for clubs, weddings and large events. High-energy sets with full sound and lighting options.", details: { experience: "10+ years experience" } }));
await listing("gourmet-catering-co", S(servicesWs.id, "Gourmet Catering Co.", { category: "Catering", city: "London", location: "London, UK", image: img("s-gourmet"), price_from: 25, price_unit: "per guest", rating: 4.8, review_count: 64, response_hours: 2, badge: "Available", tags: ["Catering", "Food & Drink", "Canapés", "Buffet"], lat: 51.51, lng: -0.12, emergency_supply: true, description: "Award-winning catering with fresh, seasonal menus for all event types. From canapés to gala dining.", details: { experience: "5+ years" } }));
await listing("sound-lighting-pro", S(servicesWs.id, "Sound & Lighting Pro", { category: "Production", city: "London", location: "London, UK", image: img("s-sound-lighting"), price_from: 1200, rating: 4.9, review_count: 72, badge: "Popular", tags: ["Sound", "Lighting", "Stage", "AV", "Production"], lat: 51.53, lng: -0.09, emergency_supply: true, description: "Full production support with state-of-the-art sound, lighting and staging for events of any size.", details: { experience: "8+ years" } }));
await listing("elegant-events-decor", S(servicesWs.id, "Elegant Events Decor", { category: "Decor", city: "London", location: "London, UK", image: img("s-elegant-decor"), price_from: 800, rating: 4.9, review_count: 38, badge: "Likely Available", tags: ["Decoration", "Floral", "Theming", "Furniture"], lat: 51.49, lng: -0.16, description: "Bespoke event styling and decoration for weddings, corporate events and private parties.", details: { experience: "6+ years" } }));
await listing("elite-security", S(servicesWs.id, "Elite Security", { category: "Security", city: "London", location: "London, UK", image: img("s-elite-security"), price_from: 300, rating: 4.7, review_count: 51, badge: "Available", tags: ["Security", "Stewards", "Crowd Control", "SIA"], lat: 51.5, lng: -0.08, emergency_supply: true, description: "Professional event security and crowd management for all event sizes, fully licensed and insured.", details: { experience: "10+ years" } }));
await listing("snapshot-photobooth", S(servicesWs.id, "Snapshot Photobooth", { category: "Photo Booth", city: "London", location: "London, UK", image: img("s-snapshot"), price_from: 350, rating: 4.8, review_count: 64, badge: "On Sale", tags: ["Photo Booth", "Props", "Instant Prints", "Digital"], lat: 51.54, lng: -0.14, description: "Modern photo booths with instant prints, GIFs and digital galleries. Perfect for weddings and parties.", details: { experience: "5+ years" } }));
await listing("sax-groove-live", S(servicesWs.id, "Sax & Groove Live", { category: "Live Music", city: "London", location: "London, UK", image: img("s-sax-groove"), price_from: 600, rating: 4.9, review_count: 72, badge: "Available", tags: ["Live Music", "Saxophone", "Jazz", "Corporate"], lat: 51.515, lng: -0.072, description: "Live bands and musicians for weddings, corporate events and private parties. Custom setlists available.", details: { experience: "8+ years" } }));
await listing("event-marquees-uk", S(servicesWs.id, "Event Marquees UK", { category: "Marquees", city: "London", location: "London, UK", image: img("s-marquees"), price_from: 1500, rating: 4.8, review_count: 67, badge: "Popular", tags: ["Marquees", "Furniture", "Heating", "Flooring"], lat: 51.47, lng: -0.2, description: "Premium marquees, furniture and event structures for all weather conditions and event sizes.", details: { experience: "10+ years" } }));
await listing("elite-sounds-dj", S(servicesWs.id, "Elite Sounds DJ", { category: "DJ", city: "London", location: "London, UK • Travels UK wide", image: img("s-elite-sounds"), price_from: 350, rating: 4.9, review_count: 210, badge: "Top rated", tags: ["DJ", "Nightlife", "London"], lat: 51.52, lng: -0.13, description: "Wedding DJ • Lighting • MC • 4 hour set" }));
await listing("taste-tango-catering", S(servicesWs.id, "Taste & Tango Catering", { category: "Catering", city: "London", location: "London, UK", image: img("bc-tastetango"), price_from: 65, price_unit: "per guest", rating: 4.7, review_count: 118, tags: ["Wedding catering", "Custom menu", "Dietary options"], lat: 51.505, lng: -0.09 }));
await listing("riverside-bars", S(servicesWs.id, "Riverside Bars", { category: "Drinks", city: "London", location: "London, UK", image: img("bc-riverside-bars"), price_from: 45, price_unit: "per guest", rating: 4.6, review_count: 92, tags: ["Full bar service", "Cocktail packages"], lat: 51.506, lng: -0.1 }));
await listing("moments-studio", S(servicesWs.id, "Moments Studio", { category: "Photography", city: "London", location: "London, UK", image: img("b-moments"), price_from: 1200, rating: 4.8, review_count: 95, tags: ["Photography", "Videography", "Drone shots"], lat: 51.51, lng: -0.11 }));
await listing("sweet-petals", S(servicesWs.id, "Sweet Petals", { category: "Flowers", city: "London", location: "London • Travels UK wide", image: img("sv-sweet-petals"), price_from: 700, rating: 4.7, review_count: 89, badge: "Popular", tags: ["Flowers", "Styling"], lat: 51.49, lng: -0.13 }));
await listing("taste-co-catering", S(servicesWs.id, "Taste & Co Catering", { category: "Catering", city: "London", location: "London • Travels UK wide", image: img("sv-taste-co"), price_from: 30, price_unit: "per guest", rating: 4.8, review_count: 132, badge: "Available", lat: 51.5, lng: -0.11 }));
await listing("city-transport", S(servicesWs.id, "City Transport", { category: "Transport", city: "London", location: "London, UK", image: img("sg-transport"), price_from: 400, rating: 4.6, review_count: 44, lat: 51.52, lng: -0.15 }));
await listing("luxe-event-decor", S(servicesWs.id, "Luxe Event Decor", { category: "Decor", city: "London", location: "London, UK", image: img("s-luxe-decor"), price_from: 500, rating: 4.7, review_count: 190, tags: ["Decor", "Corporate", "UK"], lat: 51.51, lng: -0.17 }));
await listing("taste-catering-co", S(servicesWs.id, "Taste Catering Co.", { category: "Catering", city: "London", location: "London, UK", image: img("s-taste-catering"), price_from: 25, price_unit: "per person", rating: 4.8, review_count: 310, tags: ["Catering", "Wedding", "UK"], lat: 51.5, lng: -0.12 }));

// ── Events ───────────────────────────────────────────────────────────────
const E = {};
const ev = async (key, row) => { E[key] = must(await sb.from("events").insert({ slug: key, ...row }).select().single(), "event " + key); };
const ORG = { owner_id: ids.organizer, workspace_id: org.id, management: "professional" };
await ev("neon-nights", { ...ORG, name: "Neon Nights Festival", event_type: "festival", visibility: "public", status: "on_sale", starts_at: at(2027, 7, 26, 18), ends_at: at(2027, 7, 27, 2), venue_listing_id: L["riverside-park-events-venue"].id, venue_name: "Riverside Park", location: "Riverside Park, London", city: "London", guest_count: 2000, capacity: 2000, budget_total: 120000, revenue_goal: 180000, target_profit: 52000, cover_image: img("oe-neon"), client_name: "Alex Events", tags: ["Festival", "Music", "Outdoor", "18+"], description: "A high-energy outdoor electronic music festival bringing together top DJs, food, drinks and immersive audiovisual experiences at Riverside Park.", goal: "Sell 2,000 tickets; deliver a safe and memorable experience; achieve £28,500 forecast profit; build brand for future annual event.", settings: { readiness: 85, ticketed: true, transfers: true, resale: true, venue_gates_suppliers: true } });
await ev("creators-connect", { ...ORG, name: "Creators Connect Summit", event_type: "corporate", visibility: "public", status: "planning", starts_at: at(2027, 5, 10, 9), ends_at: at(2027, 5, 10, 18), venue_listing_id: L["the-loft-london"].id, venue_name: "The Loft", location: "The Loft, London", city: "London", capacity: 500, budget_total: 45000, target_profit: 18500, cover_image: img("oe-creators"), client_name: "TechCorp", tags: ["Corporate"], settings: { readiness: 62, ticketed: true } });
await ev("taste-tango-fest", { ...ORG, name: "Taste & Tango Food Fest", event_type: "food_drink", visibility: "public", status: "on_sale", starts_at: at(2027, 5, 24, 11), ends_at: at(2027, 5, 24, 22), venue_name: "Southbank Centre", location: "Southbank, London", city: "London", capacity: 1000, budget_total: 38000, target_profit: 14200, cover_image: img("oe-tastetango"), client_name: "City Events", tags: ["Food & Drink", "Cultural"], settings: { readiness: 90, ticketed: true } });
await ev("sunset-sessions", { ...ORG, name: "Sunset Sessions", event_type: "nightlife", visibility: "public", status: "on_sale", starts_at: at(2027, 5, 31, 16), ends_at: at(2027, 6, 1, 2), venue_name: "Harbor View", location: "The Loft, London", city: "London", capacity: 1500, budget_total: 55000, target_profit: 21000, cover_image: img("oe-sunset"), client_name: "Harbor Events", tags: ["Nightlife", "DJ Set"], settings: { readiness: 48, ticketed: true, risk: "at_risk" } });
await ev("alex-jamie-wedding", { ...ORG, name: "Alex & Jamie's Wedding", event_type: "wedding", visibility: "private", status: "planning", starts_at: at(2027, 6, 12, 13), ends_at: at(2027, 6, 12, 23), venue_name: "The Riverside Rooms", location: "The Riverside Rooms, London", city: "London", capacity: 200, guest_count: 180, budget_total: 62000, target_profit: 28500, cover_image: img("oe-alex-jamie"), client_name: "Private Client", tags: ["Wedding"], settings: { readiness: 76 } });
await ev("global-tech-conference", { ...ORG, name: "Global Tech Conference", event_type: "conference", visibility: "public", status: "draft", starts_at: at(2027, 9, 18, 9), ends_at: at(2027, 9, 18, 17), venue_name: "Excel London", location: "Excel London, London", city: "London", capacity: 1000, budget_total: 95000, target_profit: 40000, cover_image: img("oe-global-tech"), client_name: "InnovaTech", tags: ["Conference"], settings: { readiness: 34, ticketed: true } });
await ev("community-summer-fair", { ...ORG, name: "Community Summer Fair", event_type: "community", visibility: "public", status: "on_sale", starts_at: at(2027, 7, 5, 10), ends_at: at(2027, 7, 5, 18), venue_name: "Green Park", location: "Green Park, London", city: "London", capacity: 2000, budget_total: 28000, target_profit: 12800, cover_image: img("oe-community-fair"), client_name: "Local Council", tags: ["Community"], settings: { readiness: 88, ticketed: true } });
await ev("music-industry-awards", { ...ORG, name: "Music Industry Awards", event_type: "awards", visibility: "public", status: "planning", starts_at: at(2027, 11, 14, 18), ends_at: at(2027, 11, 15, 0), venue_listing_id: L["the-grand-hall"].id, venue_name: "The Grand Hall", location: "The Grand Hall, London", city: "London", capacity: 800, budget_total: 110000, target_profit: 48000, cover_image: img("oe-music-awards"), client_name: "MusicHub", tags: ["Awards"], settings: { readiness: 55, ticketed: true } });
await ev("summer-sessions-2026", { ...ORG, name: "Summer Sessions 2026", event_type: "festival", visibility: "public", status: "completed", starts_at: at(2026, 8, 15, 12), ends_at: at(2026, 8, 15, 23), venue_name: "The Grand Hall", location: "The Grand Hall, Birmingham", city: "Birmingham", capacity: 3000, budget_total: 26500, cover_image: img("type-festival"), client_name: "City Events Ltd", tags: ["Festival"] });
await ev("food-drink-expo-2026", { ...ORG, name: "Food & Drink Expo", event_type: "food_drink", visibility: "public", status: "completed", starts_at: at(2026, 9, 5, 10), ends_at: at(2026, 9, 5, 18), venue_name: "Olympia", location: "Olympia, London", city: "London", capacity: 1500, budget_total: 18000, cover_image: img("type-private-dinner"), client_name: "Taste Catering", tags: ["Food & Drink"] });
// Public discovery events from other organisers on the platform (owned by the demo organizer workspace)
await ev("summer-rooftop-party", { ...ORG, name: "Summer Rooftop Party", event_type: "party", visibility: "public", status: "on_sale", starts_at: at(2027, 5, 10, 19), ends_at: at(2027, 5, 11, 1), venue_name: "The Loft", location: "The Loft, London", city: "London", capacity: 400, cover_image: img("type-party"), tags: ["Nightlife", "Party"], settings: { rating: 4.6, reviews: 892, badge: "Last tickets" } });
await ev("comedy-central-live", { ...ORG, name: "Comedy Central Live", event_type: "comedy", visibility: "public", status: "on_sale", starts_at: at(2027, 5, 31, 19, 30), ends_at: at(2027, 5, 31, 22), venue_name: "The Forum", location: "The Forum, London", city: "London", capacity: 600, cover_image: img("ev-comedy-c"), tags: ["Comedy", "Live Show"], settings: { rating: 4.5, reviews: 430, badge: "Popular" } });
await ev("elite-sounds-night", { ...ORG, name: "Elite Sounds DJ", event_type: "nightlife", visibility: "public", status: "on_sale", starts_at: at(2027, 5, 31, 20), ends_at: at(2027, 6, 1, 2), venue_name: "Harbor View", location: "Harbor View, London", city: "London", capacity: 800, cover_image: img("tk-elite-sounds-c"), tags: ["Music", "DJ"] });
must(await sb.from("events").update({ settings: { ...E["neon-nights"].settings, rating: 4.8, reviews: 2400, badge: "Trending" } }).eq("id", E["neon-nights"].id), "neon rating");
must(await sb.from("events").update({ settings: { ...E["taste-tango-fest"].settings, rating: 4.7, reviews: 1100, badge: "Featured" } }).eq("id", E["taste-tango-fest"].id), "tt rating");

// Customer events (consumer management)
const CU = { owner_id: ids.customer, management: "consumer" };
await ev("alex-taylor-wedding", { ...CU, name: "Alex & Taylor Wedding", event_type: "wedding", visibility: "private", status: "planning", starts_at: at(2027, 6, 14, 16), ends_at: at(2027, 6, 14, 23), venue_listing_id: L["the-loft-london"].id, venue_name: "The Loft, London", location: "Riverside, SE1 2AB", city: "London", guest_count: 120, adults: 100, children: 20, capacity: 150, budget_total: 10500, currency: "GBP", cover_image: img("me-wedding"), tags: ["Wedding", "Private Event"], priorities: ["Venue", "Catering", "Drinks / Bar", "Entertainment", "Photography", "Decor & Styling"], description: "An intimate and elegant celebration with our closest friends and family.", settings: { venue_gates_suppliers: true, style: "Classic & Elegant", accessibility: ["Wheelchair access"] } });
await ev("alex-30th-birthday", { ...CU, name: "Alex's 30th Birthday", event_type: "birthday", visibility: "private", status: "ready", starts_at: at(2027, 7, 26, 19), ends_at: at(2027, 7, 27, 1), venue_name: "Riverside Park", location: "Riverside Park, London", city: "London", guest_count: 80, budget_total: 4200, cover_image: img("me-birthday"), tags: ["Birthday"] });
await ev("summer-garden-party", { ...CU, name: "Summer Garden Party", event_type: "party", visibility: "private", status: "draft", starts_at: at(2027, 9, 20, 14), ends_at: at(2027, 9, 20, 20), guest_count: 50, cover_image: img("me-garden"), tags: ["Party"] });
await ev("rooftop-dinner-2026", { ...CU, name: "Rooftop Anniversary Dinner", event_type: "private_dinner", visibility: "private", status: "completed", starts_at: at(2026, 6, 14, 19), ends_at: at(2026, 6, 14, 23), venue_listing_id: L["the-loft-london"].id, venue_name: "The Loft London", location: "Riverside, London", city: "London", guest_count: 40, budget_total: 6000, cover_image: img("sv-loft") });

// Venues confirmed outside the marketplace are recorded explicitly (counts towards readiness).
for (const k of ["neon-nights", "taste-tango-fest", "alex-jamie-wedding", "community-summer-fair", "music-industry-awards", "summer-sessions-2026", "food-drink-expo-2026", "summer-rooftop-party", "comedy-central-live", "elite-sounds-night", "alex-30th-birthday"]) {
  const { data: cur } = await sb.from("events").select("settings").eq("id", E[k].id).single();
  must(await sb.from("events").update({ settings: { ...(cur?.settings ?? {}), venue_confirmed: true } }).eq("id", E[k].id), "venue_confirmed " + k);
}

// ── Build items (customer wedding) ──────────────────────────────────────
const bi = async (eventKey, rows) => must(await sb.from("build_items").insert(rows.map((r, i) => ({ event_id: E[eventKey].id, sort: i, ...r }))).select(), "build " + eventKey);
const W = await bi("alex-taylor-wedding", [
  { category: "venue", listing_id: L["the-loft-london"].id, title: "The Loft London", package: "Exclusive package", scope: "Civil ceremony • Reception • Rooftop • City view", image: img("b-loft"), amount: 2500, deposit: 750, price_basis: "fixed", status: "confirmed", terms_snapshot: { amount: 2500, deposit: 750 } },
  { category: "food", listing_id: L["taste-tango-catering"].id, title: "Taste & Tango Catering", package: "3 course menu", scope: "Wedding catering • Custom menu • Tasting included", image: img("bc-tastetango"), amount: 1800, deposit: 540, price_basis: "per_person", status: "quoted", quote: { per_guest: 65, estimate: 7800 }, response_deadline: at(2027, 5, 10, 17) },
  { sort: 6, category: "drinks", listing_id: L["riverside-bars"].id, title: "Riverside Bars", package: "Cocktail package", scope: "Signature cocktails • Glassware included", image: img("bc-riverside-bars"), amount: 950, deposit: 285, price_basis: "per_person", status: "held", hold_expires_at: at(2027, 6, 1, 12), quote: { per_guest: 45, estimate: 7400 } },
  { category: "entertainment", listing_id: L["elite-sounds-dj"].id, title: "Elite Sounds DJ", package: "4 hour set", scope: "Wedding DJ • Lighting • MC • Custom playlist • Dance floor lighting", image: img("b-elite-sounds"), amount: 850, deposit: 255, price_basis: "fixed", status: "confirmed", terms_snapshot: { amount: 850, deposit: 255 } },
  { category: "media", listing_id: L["moments-studio"].id, title: "Moments Studio", package: "Full day coverage", scope: "Photography • Videography • Drone shots", image: img("b-moments"), amount: 1200, deposit: 360, price_basis: "estimate", status: "confirmed" },
  { category: "styling", listing_id: L["sweet-petals"].id, title: "Sweet Petals", package: "Premium decor", scope: "Wedding decor • Flowers • Table styling • Fresh flowers • Setup & breakdown", image: img("bc-styling"), amount: 700, deposit: 210, price_basis: "estimate", status: "quoted", response_deadline: at(2027, 5, 15, 17) },
  { category: "transport", listing_id: L["city-transport"].id, title: "City Transport", package: "2 minibuses", scope: "Guest transport", image: img("sg-transport"), amount: 400, deposit: 120, price_basis: "fixed", status: "confirmed" },
  { category: "extras", title: "Extra Services", package: "Contingency", scope: "Miscellaneous", amount: 600, deposit: 0, price_basis: "estimate", status: "suggested" },
]);
const wb = Object.fromEntries(W.map(b => [b.title, b]));
await bi("alex-30th-birthday", [
  { category: "venue", title: "Riverside Park", package: "Evening hire", image: img("v-riverside-park"), amount: 1500, deposit: 450, status: "confirmed" },
  { category: "entertainment", listing_id: L["dj-marcus-lee"].id, title: "DJ Marcus Lee", package: "5 hour set", image: img("s-dj-marcus"), amount: 900, deposit: 270, status: "confirmed" },
  { category: "food", listing_id: L["gourmet-catering-co"].id, title: "Gourmet Catering Co.", package: "Street food", image: img("s-gourmet"), amount: 1200, deposit: 360, status: "confirmed" },
  { category: "media", listing_id: L["snapshot-photobooth"].id, title: "Snapshot Photobooth", package: "3 hours", image: img("s-snapshot"), amount: 600, deposit: 180, status: "confirmed" },
]);
const past = await bi("rooftop-dinner-2026", [
  { category: "venue", listing_id: L["the-loft-london"].id, title: "The Loft London", package: "Rooftop dinner", image: img("sv-loft"), amount: 2500, status: "fulfilled" },
  { category: "food", listing_id: L["taste-tango-catering"].id, title: "Taste & Tango Catering", package: "Tasting menu", image: img("bc-tastetango"), amount: 2200, status: "fulfilled" },
  { category: "entertainment", listing_id: L["elite-sounds-dj"].id, title: "Elite Sounds DJ", package: "3 hour set", image: img("s-elite-sounds"), amount: 600, status: "fulfilled" },
]);

// Payments schedule (customer wedding money)
must(await sb.from("payments").insert([
  { event_id: E["alex-taylor-wedding"].id, build_item_id: wb["The Loft London"].id, payee: "The Loft London", kind: "deposit", amount: 750, status: "paid", paid_at: at(2026, 9, 1, 10), refundable: true },
  { event_id: E["alex-taylor-wedding"].id, build_item_id: wb["The Loft London"].id, payee: "The Loft London", kind: "balance", amount: 1750, status: "scheduled", due_at: at(2027, 6, 1, 9) },
  { event_id: E["alex-taylor-wedding"].id, build_item_id: wb["Taste & Tango Catering"].id, payee: "Taste & Tango Catering", kind: "deposit", amount: 540, status: "due", due_at: at(2027, 5, 10, 9) },
  { event_id: E["alex-taylor-wedding"].id, build_item_id: wb["Riverside Bars"].id, payee: "Riverside Bars", kind: "deposit", amount: 285, status: "paid", paid_at: at(2026, 9, 20, 10), refundable: true },
  { event_id: E["alex-taylor-wedding"].id, build_item_id: wb["Elite Sounds DJ"].id, payee: "Elite Sounds DJ", kind: "deposit", amount: 255, status: "paid", paid_at: at(2026, 9, 12, 10) },
  { event_id: E["alex-taylor-wedding"].id, build_item_id: wb["Elite Sounds DJ"].id, payee: "Elite Sounds DJ", kind: "balance", amount: 595, status: "scheduled", due_at: at(2027, 5, 25, 9) },
  { event_id: E["alex-taylor-wedding"].id, build_item_id: wb["Moments Studio"].id, payee: "Moments Studio", kind: "deposit", amount: 360, status: "paid", paid_at: at(2026, 9, 25, 10) },
  { event_id: E["alex-taylor-wedding"].id, build_item_id: wb["Moments Studio"].id, payee: "Moments Studio", kind: "balance", amount: 840, status: "scheduled", due_at: at(2027, 6, 1, 9) },
  { event_id: E["alex-taylor-wedding"].id, build_item_id: wb["Sweet Petals"].id, payee: "Sweet Petals", kind: "deposit", amount: 210, status: "due", due_at: at(2027, 5, 15, 9) },
  { event_id: E["alex-taylor-wedding"].id, build_item_id: wb["City Transport"].id, payee: "City Transport", kind: "deposit", amount: 120, status: "paid", paid_at: at(2026, 10, 1, 10) },
  { event_id: E["alex-taylor-wedding"].id, build_item_id: wb["City Transport"].id, payee: "City Transport", kind: "balance", amount: 280, status: "scheduled", due_at: at(2027, 6, 14, 9) },
  { event_id: E["alex-30th-birthday"].id, payee: "Riverside Park", kind: "deposit", amount: 450, status: "paid", paid_at: at(2026, 9, 3, 10) },
  { event_id: E["alex-30th-birthday"].id, payee: "Gourmet Catering Co.", kind: "balance", amount: 300, status: "due", due_at: at(2027, 7, 1, 9) },
]), "payments");

// Threads & messages (customer wedding)
const thread = async (row, msgs) => {
  const t = must(await sb.from("threads").insert({ event_id: E["alex-taylor-wedding"].id, ...row }).select().single(), "thread");
  must(await sb.from("messages").insert(msgs.map(m => ({ thread_id: t.id, ...m }))), "msgs");
  return t;
};
const me = { sender_id: ids.customer, sender_name: "Alex Thompson" };
await thread({ kind: "venue", title: "The Loft London", subtitle: "Venue • Booking confirmed", listing_id: L["the-loft-london"].id, build_item_id: wb["The Loft London"].id, image: img("b-loft"), response_due_at: at(2027, 4, 20, 17), updated_at: at(2026, 10, 10, 10, 24) }, [
  { sender_name: "Sarah (The Loft London)", from_provider: true, body: "Hi Alex, here are the updated floor plans and access details for the day. Let me know if you need any changes.", attachments: [{ name: "Floor Plan - Main Hall", thumb: "/assets/gd/att-floorplan.webp", type: "PDF", size: "2.4 MB" }, { name: "Venue Access Guide", thumb: "/assets/gd/att-access.webp", type: "PDF", size: "1.1 MB" }], created_at: at(2026, 10, 10, 10, 15) },
  { ...me, body: "Thanks Sarah! The layout looks perfect. We're expecting around 120 guests. Could you confirm the final access time for suppliers and if there are any restrictions on décor?", created_at: at(2026, 10, 10, 10, 20), read_at: at(2026, 10, 10, 10, 21) },
  { sender_name: "Sarah (The Loft London)", from_provider: true, body: "Of course! Supplier access is from 10:00 AM on the day. Decor is allowed, but no open flames. I've attached the full venue guidelines and timings. Let me know if you need anything else!", attachments: [{ name: "Venue Guidelines & Timings", thumb: "/assets/gd/att-guidelines.webp", type: "PDF", size: "1.8 MB" }], created_at: at(2026, 10, 10, 10, 24) },
]);
await thread({ kind: "supplier", title: "Taste & Tango Catering", subtitle: "Catering • Response required", listing_id: L["taste-tango-catering"].id, build_item_id: wb["Taste & Tango Catering"].id, image: img("bc-tastetango"), updated_at: at(2026, 10, 10, 9, 12) }, [
  { sender_name: "James (Taste & Tango)", from_provider: true, body: "We've updated the menu options with the vegetarian and vegan alternatives you asked for.", created_at: at(2026, 10, 10, 9, 12) }]);
await thread({ kind: "supplier", title: "Riverside Bars", subtitle: "Drinks • Quote received", listing_id: L["riverside-bars"].id, build_item_id: wb["Riverside Bars"].id, image: img("bc-riverside-bars"), updated_at: at(2026, 10, 9, 15) }, [
  { sender_name: "Riverside Bars", from_provider: true, body: "Our cocktail package quote is attached — happy to tailor the signature drinks.", created_at: at(2026, 10, 9, 14), read_at: at(2026, 10, 9, 15) },
  { ...me, body: "Thanks, that looks great.", created_at: at(2026, 10, 9, 15), read_at: at(2026, 10, 9, 15) }]);
await thread({ kind: "supplier", title: "Elite Sounds DJ", subtitle: "Entertainment • Confirmed", listing_id: L["elite-sounds-dj"].id, build_item_id: wb["Elite Sounds DJ"].id, image: img("b-elite-sounds"), updated_at: at(2026, 10, 9, 11) }, [
  { sender_name: "Mike (Elite Sounds)", from_provider: true, body: "Absolutely, we'll bring extra uplighting for the dance floor.", created_at: at(2026, 10, 9, 11), read_at: at(2026, 10, 9, 12) }]);
await thread({ kind: "supplier", title: "Moments Studio", subtitle: "Photography • Pending", listing_id: L["moments-studio"].id, build_item_id: wb["Moments Studio"].id, image: img("b-moments"), updated_at: at(2026, 10, 8, 16) }, [
  { sender_name: "Moments Studio", from_provider: true, body: "Could you send over more examples of the style you love?", created_at: at(2026, 10, 8, 16), read_at: at(2026, 10, 8, 17) }]);
await thread({ kind: "supplier", title: "Sweet Petals", subtitle: "Styling • Confirmed", listing_id: L["sweet-petals"].id, image: img("sv-sweet-petals"), updated_at: at(2026, 10, 7, 12) }, [
  { sender_name: "Laura (Sweet Petals)", from_provider: true, body: "Flowers will be delivered on the morning of the wedding.", created_at: at(2026, 10, 7, 12), read_at: at(2026, 10, 7, 13) }]);
await thread({ kind: "supplier", title: "City Transport", subtitle: "Transport • Quote received", listing_id: L["city-transport"].id, image: img("sg-transport"), updated_at: at(2026, 10, 7, 10) }, [
  { ...me, body: "Please confirm the final pickup time.", created_at: at(2026, 10, 7, 10), read_at: at(2026, 10, 7, 10) }]);

// Guests (customer wedding)
const guestRows = [["Sarah Mitchell", "sarah.mitchell@email.com", "confirmed", true, 2, "Vegetarian", 12], ["James Carter", "james@carter.co.uk", "confirmed", false, 1, "", 12], ["Priya Desai", "priya.desai@gmail.com", "pending", true, 2, "Vegan", 14], ["Daniel Kim", "daniel.kim@email.com", "confirmed", false, 1, "Gluten free", 12], ["Emma Wilson", "emma.wilson@mail.com", "invited", true, 2, "Wheelchair access", 15], ["Liam Thompson", "liam.t@email.com", "declined", false, 0, "", 10], ["Olivia Martinez", "olivia.martinez@mail.com", "confirmed", true, 2, "Nut allergy", 11], ["Noah Patel", "noah@gmail.com", "pending", false, 1, "", 14]];
const extra = ["Ava Johnson", "Mason Lee", "Isla Brown", "Ethan Clarke", "Mia Davies", "Lucas Evans", "Amelia Green", "Harry Hall", "Grace King", "Oscar Lewis", "Lily Moore", "Jack Nelson"];
must(await sb.from("guests").insert([
  ...guestRows.map(([name, email, status, plus_one, tickets, dietary, d]) => ({ event_id: E["alex-taylor-wedding"].id, name, email, status, plus_one, tickets, dietary, invited_at: at(2026, 4, d, 10) })),
  ...extra.map((name, i) => ({ event_id: E["alex-taylor-wedding"].id, name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, status: ["confirmed", "confirmed", "pending", "invited", "confirmed", "declined"][i % 6], tickets: 1, invited_at: at(2026, 4, 12, 10) })),
]), "guests");

// Ticket tiers + tickets
const tiers = async (key, rows) => must(await sb.from("ticket_tiers").insert(rows.map((r, i) => ({ event_id: E[key].id, sort: i, ...r }))).select(), "tiers " + key);
const NT = await tiers("neon-nights", [
  { name: "Early Bird - General Admission", description: "Standard entry to the event", kind: "early", price: 35, quantity: 1000, sold: 1000, status: "sold_out", sale_start: at(2027, 6, 1, 10), sale_end: at(2027, 6, 30, 23, 59), release_name: "Phase 1", color: "#2f6bff" },
  { name: "General Admission", description: "Standard entry to the festival", kind: "general", price: 55, quantity: 2000, sold: 540, status: "on_sale", sale_start: at(2027, 7, 1, 10), sale_end: at(2027, 7, 26, 23, 59), release_name: "Phase 2", color: "#5b5bff" },
  { name: "VIP Experience", description: "Premium viewing areas & lounge", kind: "vip", price: 120, quantity: 400, sold: 280, status: "on_sale", sale_start: at(2027, 7, 1, 10), sale_end: at(2027, 7, 26, 23, 59), release_name: "Phase 2", color: "#a855f7", badge: "Most popular" },
  { name: "Backstage Pass", description: "Artist meet & greet + stage access", kind: "vip", price: 250, quantity: 100, sold: 0, status: "scheduled", sale_start: at(2027, 7, 15, 10), sale_end: at(2027, 7, 26, 23, 59), release_name: "Phase 3", color: "#f59e0b" },
  { name: "Group Ticket (4 People)", description: "Discounted group entry", kind: "group", price: 160, quantity: 200, sold: 100, status: "on_sale", sale_start: at(2027, 7, 1, 10), sale_end: at(2027, 7, 26, 23, 59), release_name: "Phase 2", color: "#22c55e" },
  { name: "Accessible Ticket", description: "For disabled guests + companion", kind: "accessible", price: 55, quantity: 200, sold: 20, status: "on_sale", sale_start: at(2027, 7, 1, 10), sale_end: at(2027, 7, 26, 23, 59), color: "#0ea5e9" },
  { name: "Complimentary", description: "Staff, press and special guests", kind: "comp", price: 0, quantity: 100, sold: 0, status: "hidden", color: "#64748b" },
]);
const WT = await tiers("alex-taylor-wedding", [
  { name: "General Admission", kind: "general", price: 35, quantity: 100, sold: 80, status: "on_sale", color: "#2f6bff" },
  { name: "VIP Experience", kind: "vip", price: 75, quantity: 40, sold: 24, status: "on_sale", color: "#a855f7" },
  { name: "Early Bird", kind: "early", price: 25, quantity: 50, sold: 8, status: "on_sale", sale_end: at(2027, 4, 30, 23, 59), color: "#f59e0b" },
  { name: "Complimentary", kind: "comp", price: 0, quantity: 60, sold: 45, status: "on_sale", color: "#22c55e" },
]);
const ST = await tiers("sunset-sessions", [{ name: "VIP Experience", kind: "vip", price: 45, quantity: 300, sold: 120, status: "on_sale" }, { name: "General Admission", kind: "general", price: 20, quantity: 1200, sold: 300, status: "on_sale" }]);
const TT = await tiers("taste-tango-fest", [{ name: "General Admission", kind: "general", price: 25, quantity: 1000, sold: 850, status: "on_sale" }]);
const ET = await tiers("elite-sounds-night", [{ name: "General Admission", kind: "general", price: 30, quantity: 800, sold: 410, status: "on_sale" }]);
await tiers("summer-rooftop-party", [{ name: "General Admission", kind: "general", price: 20, quantity: 400, sold: 360, status: "on_sale" }]);
await tiers("comedy-central-live", [{ name: "Standard", kind: "general", price: 28, quantity: 600, sold: 240, status: "on_sale" }]);
await tiers("community-summer-fair", [{ name: "General Admission", kind: "general", price: 8, quantity: 2000, sold: 1350, status: "on_sale" }]);
must(await sb.from("tickets").insert([
  { code: "GLD-NEON-6F3K-9P2M", event_id: E["neon-nights"].id, tier_id: NT[1].id, holder_id: ids.customer, attendee_name: "Alex Thompson", attendee_email: "alex.thompson@example.com", order_ref: "GLD-2025-0147", price_paid: 55 },
  { code: "GLD-NEON-7H2L-4Q8N", event_id: E["neon-nights"].id, tier_id: NT[1].id, holder_id: ids.customer, attendee_name: "Taylor Morgan", attendee_email: "taylor@example.com", order_ref: "GLD-2025-0147", price_paid: 55 },
  { code: "GLD-SUNS-2K8D-1W3E", event_id: E["sunset-sessions"].id, tier_id: ST[0].id, holder_id: ids.customer, attendee_name: "Alex Thompson", order_ref: "GLD-2025-0188", price_paid: 45 },
  { code: "GLD-TAST-9M4R-6T2Y", event_id: E["taste-tango-fest"].id, tier_id: TT[0].id, holder_id: ids.customer, attendee_name: "Alex Thompson", order_ref: "GLD-2025-0201", price_paid: 25 },
  { code: "GLD-TAST-3V7B-8U1I", event_id: E["taste-tango-fest"].id, tier_id: TT[0].id, holder_id: ids.customer, attendee_name: "Jordan Lee", order_ref: "GLD-2025-0201", price_paid: 25 },
  { code: "GLD-ELIT-5C6X-2Z9A", event_id: E["elite-sounds-night"].id, tier_id: ET[0].id, holder_id: ids.customer, attendee_name: "Alex Thompson", order_ref: "GLD-2025-0215", price_paid: 30, status: "resale_listed" },
]), "tickets");
must(await sb.from("discount_codes").insert([
  { event_id: E["neon-nights"].id, code: "EARLY25", kind: "percent", amount: 25, valid_from: at(2027, 6, 1), status: "active" },
  { event_id: E["neon-nights"].id, code: "VIP100", kind: "amount", amount: 100, valid_from: at(2027, 6, 1), status: "active" },
  { event_id: E["neon-nights"].id, code: "GROUP10", kind: "percent", amount: 10, valid_from: at(2027, 6, 1), status: "scheduled" },
  { event_id: E["neon-nights"].id, code: "STAFF", kind: "percent", amount: 100, valid_from: at(2027, 6, 1), status: "active" },
]), "codes");

// Programme / run sheet / day plan
const prog = (key, kind, rows) => rows.map(([y, mo, d, h, mi, title, detail, area, dur, owner, status, image]) => ({ event_id: E[key].id, kind, starts_at: at(y, mo, d, h, mi), title, detail: detail ?? "", area: area ?? "", duration_minutes: dur ?? 30, owner_name: owner ?? "", status: status || "upcoming", image: image ?? "" }));
must(await sb.from("programme_items").insert([
  ...prog("neon-nights", "programme", [[2027, 7, 26, 16, 0, "Gates Open", "Guest arrival, food stalls and entertainment", "Public", 120], [2027, 7, 26, 17, 0, "DJ Luna", "Warm up set", "Main Stage", 60, "", "", img("ev-neon")], [2027, 7, 26, 18, 0, "The Collective", "Live performance", "Main Stage", 75, "", "", img("oe-sunset")], [2027, 7, 26, 19, 30, "DJ Matrix", "Headline set", "Main Stage", 75, "", "", img("s-dj-marcus")], [2027, 7, 26, 21, 0, "Neon Vibes (Live)", "Special guest", "Main Stage", 75, "", "", img("oe-neon")], [2027, 7, 26, 22, 30, "Closing Set", "Final set and fireworks", "Main Stage", 30, "", "", img("ev-comedy")], [2027, 7, 26, 23, 0, "Event Close", "Site clear and guest exit", "Operations", 60]]),
  ...prog("neon-nights", "run_sheet", [[2027, 7, 26, 14, 0, "Crew arrival & briefing", "", "Backstage", 30, "Jamie C.", "done"], [2027, 7, 26, 16, 0, "Artist load in", "", "Stage", 60, "Sound Pro", "done"], [2027, 7, 26, 17, 0, "Final sound check", "", "Stage", 60, "Tech Team", "in_progress"], [2027, 7, 26, 18, 0, "Doors open", "", "Main Entrance", 30, "Security"], [2027, 7, 26, 18, 30, "DJ Luna", "", "Main Stage", 60, "Artist"], [2027, 7, 26, 19, 30, "The Collective", "", "Main Stage", 60, "Artist"], [2027, 7, 26, 21, 0, "Headliner Set (DJ Matrix)", "", "Main Stage", 90, "Artist"], [2027, 7, 26, 22, 30, "Fireworks & final set", "", "Main Stage", 30, "Production"], [2027, 7, 26, 23, 0, "Event close", "", "All areas", 60, "Ops Manager"]]),
  ...prog("alex-taylor-wedding", "day_plan", [[2027, 6, 14, 9, 0, "Venue access", "The Loft London", "", 60], [2027, 6, 14, 10, 0, "Styling & decor setup", "Moments Studio", "", 120], [2027, 6, 14, 12, 0, "Catering arrival", "Taste & Tango", "", 60], [2027, 6, 14, 14, 0, "Final venue checks", "You", "", 60], [2027, 6, 14, 15, 0, "Guest arrival", "Doors open", "", 60], [2027, 6, 14, 16, 30, "Ceremony", "Main space", "", 60], [2027, 6, 14, 18, 0, "Dinner service", "Taste & Tango", "", 120], [2027, 6, 14, 20, 0, "DJ set", "Elite Sounds", "", 180], [2027, 6, 14, 23, 0, "Event ends", "Pack down begins", "", 30]]),
]), "programme");

// Tasks
const T = (row) => ({ status: "todo", priority: "medium", ...row });
must(await sb.from("tasks").insert([
  T({ event_id: E["alex-taylor-wedding"].id, title: "Confirm venue details", category: "Venue & Location", assignee_name: "The Loft", status: "done", due_at: at(2027, 4, 12), milestone: true }),
  T({ event_id: E["alex-taylor-wedding"].id, title: "Arrange access and load-in details", category: "Venue & Location", assignee_name: "The Loft", status: "done", due_at: at(2027, 4, 20) }),
  T({ event_id: E["alex-taylor-wedding"].id, title: "Confirm parking arrangements", category: "Venue & Location", assignee_name: "The Loft", due_at: at(2027, 6, 5) }),
  T({ event_id: E["alex-taylor-wedding"].id, title: "Review and confirm menu", category: "Food & Drink", assignee_name: "Taste & Tango", status: "done", due_at: at(2027, 5, 10) }),
  T({ event_id: E["alex-taylor-wedding"].id, title: "Confirm final guest count with caterer", category: "Food & Drink", assignee_name: "Taste & Tango", priority: "high", due_at: at(2027, 6, 2), milestone: true }),
  T({ event_id: E["alex-taylor-wedding"].id, title: "Discuss dietary requirements", category: "Food & Drink", assignee_name: "Taste & Tango", due_at: at(2027, 6, 2) }),
  T({ event_id: E["alex-taylor-wedding"].id, title: "DJ booking confirmed", category: "Entertainment", assignee_name: "Elite Sounds", status: "done", due_at: at(2027, 5, 1) }),
  T({ event_id: E["alex-taylor-wedding"].id, title: "Confirm playlist and special songs", category: "Entertainment", assignee_name: "Elite Sounds", due_at: at(2027, 6, 1) }),
  T({ event_id: E["alex-taylor-wedding"].id, title: "Send guest invitations", category: "Guests & Tickets", assignee_name: "You", priority: "high", due_at: at(2027, 5, 20), milestone: true }),
  T({ event_id: E["alex-taylor-wedding"].id, title: "Track RSVPs and final count", category: "Guests & Tickets", assignee_name: "You", due_at: at(2027, 6, 2) }),
  T({ event_id: E["alex-taylor-wedding"].id, title: "Final payments", category: "Payments", assignee_name: "You", priority: "high", due_at: at(2027, 6, 10), milestone: true }),
  T({ owner_id: ids.customer, event_id: E["alex-30th-birthday"].id, title: "Finalise remaining payment", category: "Payments", due_at: at(2027, 7, 1) }),
  T({ event_id: E["neon-nights"].id, workspace_id: org.id, title: "Confirm final DJ contract", assignee_name: "Alex Thomas", priority: "high", due_at: at(2027, 7, 18) }),
  T({ event_id: E["neon-nights"].id, workspace_id: org.id, title: "Order branded wristbands", assignee_name: "Mia Chen", priority: "medium", due_at: at(2027, 7, 20) }),
  T({ event_id: E["neon-nights"].id, workspace_id: org.id, title: "Site walk with venue team", assignee_name: "Sophie Malik", priority: "medium", due_at: at(2027, 7, 22) }),
  T({ event_id: E["neon-nights"].id, workspace_id: org.id, title: "Set up ticket scanning", assignee_name: "Ryan Brooks", priority: "low", due_at: at(2027, 7, 24) }),
  T({ workspace_id: org.id, title: "Finalize venue contract", assignee_name: "Alex Thomas", status: "done", due_at: at(2026, 10, 10) }),
  T({ workspace_id: org.id, title: "Approve marketing assets", assignee_name: "Mia Chen", due_at: at(2026, 10, 10) }),
  T({ workspace_id: org.id, title: "Review ticket pricing", assignee_name: "Alex Thomas", due_at: at(2026, 10, 12) }),
  T({ workspace_id: org.id, title: "Coordinate with vendors", assignee_name: "Sophie Malik", status: "done", due_at: at(2026, 10, 12) }),
  T({ workspace_id: org.id, title: "Send attendee reminder", assignee_name: "Ryan Brooks", due_at: at(2026, 10, 13) }),
]), "tasks");

// Organizer supply chain (Neon Nights) + RFQ with quotes
const rfq = must(await sb.from("provider_requests").insert({ reference: "REQ-2026-018", event_id: E["neon-nights"].id, created_by: ids.organizer, category: "production", title: "Main Stage Production & AV for Neon Nights Festival", scope: "Full main stage production including stage, sound, lighting, LED screens, rigging and on-site technical crew for a 12 hour outdoor festival with 5,000 attendees.", requirements: { stage: "12m x 8m", setup: "25 Jul 2027 (from 08:00)", takedown: "27 Jul 2027 (by 12:00)", contract: "Fixed price" }, budget_min: 8000, budget_max: 15000, response_hours: 48, response_deadline: at(2027, 4, 10, 17), status: "sent" }).select().single(), "rfq");
must(await sb.from("build_items").insert([
  { event_id: E["neon-nights"].id, category: "venue", listing_id: L["riverside-park-events-venue"].id, title: "Riverside Park", package: "Festival hire", image: img("v-riverside-park"), amount: 37000, deposit: 11100, status: "confirmed" },
  { event_id: E["neon-nights"].id, category: "production", request_id: rfq.id, title: "StagePro UK", package: "Stage 12m x 8m, full sound, lighting & lasers, LED screens (4 x 3m)", image: img("s-sound-lighting"), amount: 9800, status: "quoted", quote: { rating: 4.8, reviews: 126, cancellation: "50% up to 30 days", reliability: 4.8, response_time: "2 days", hold: "7 days (20%)", setup: "25 Jul / 27 Jul", recommended: true, responded: "2 days ago" } },
  { event_id: E["neon-nights"].id, category: "production", request_id: rfq.id, title: "Elite AV Events", package: "Stage 10m x 6m, sound, lighting, LED screens (2 x 5m)", image: img("s-dj-marcus"), amount: 11200, status: "quoted", quote: { rating: 4.6, reviews: 98, cancellation: "50% up to 14 days", reliability: 4.6, response_time: "1 day", hold: "5 days (25%)", responded: "1 day ago", availability: "Likely available" } },
  { event_id: E["neon-nights"].id, category: "production", request_id: rfq.id, title: "Sound & Light Co.", package: "Stage 12m x 6m, sound, lighting", image: img("s-sound-lighting"), amount: 8950, status: "awaiting", response_deadline: at(2027, 4, 13, 17), quote: { rating: 4.4, reviews: 72, cancellation: "30% up to 14 days", reliability: 4.4, availability: "Pending" } },
  { event_id: E["neon-nights"].id, category: "production", request_id: rfq.id, title: "Fusion Events", package: "Stage, full production, LED screens (3 x 6m), generators", image: img("v-pulse"), amount: 14500, status: "declined", quote: { rating: 4.7, reviews: 211, cancellation: "50% up to 30 days", reliability: 4.7, response_time: "3 days", responded: "3 days ago", availability: "Not available" } },
  { event_id: E["neon-nights"].id, category: "food", listing_id: L["gourmet-catering-co"].id, title: "Austin Events Catering", package: "Food village", image: img("s-gourmet"), amount: 12000, status: "available" },
  { event_id: E["neon-nights"].id, category: "security", listing_id: L["elite-security"].id, title: "Elite Security", package: "48 SIA staff", image: img("s-elite-security"), amount: 8600, status: "confirmed" },
  { event_id: E["neon-nights"].id, category: "production", listing_id: L["sound-lighting-pro"].id, title: "Sound & Lighting Pro", package: "Second stage", image: img("s-sound-lighting"), amount: 18000, status: "confirmed" },
  { event_id: E["neon-nights"].id, category: "staging", title: "Stage & Rigging Co.", package: "Rigging", image: img("s-marquees"), amount: 6500, status: "awaiting" },
]), "neon build");

// Leads & proposals
const lead = must(await sb.from("leads").insert([
  { workspace_id: org.id, reference: "LD-2026-018", name: "Riverside Music Festival", client_name: "Riverside Council", contact_name: "Sarah Mitchell", contact_email: "sarah.mitchell@riverside.gov.uk", contact_phone: "+44 20 7123 4567", event_type: "Music Festival", stage: "new", value: 75000, probability: 60, expected_date: day(2027, 7, 26), location: "Riverside Park, London", guests: "5,000 – 8,000", budget: "£50,000 – £100,000", source: "Website enquiry", owner_name: "Alex Thomas", next_action: "Follow up call", next_action_at: at(2026, 10, 10, 14), tags: ["Festival", "Outdoor", "Music", "Family friendly"], details: { flexibility: "1 week flexibility", venue_pref: "Outdoor, riverside", requirements: ["Main stage + 2 smaller stages", "Food & drink vendors", "Family friendly area", "On-site parking and good transport links"], potential_profit: 28000, sales_cycle: "28 days" } },
  { workspace_id: org.id, reference: "LD-2026-017", name: "Summer Music Series", client_name: "Riverside Council", event_type: "Festival", stage: "new", value: 15000, probability: 20, expected_date: day(2027, 6, 20), owner_name: "Alex Thomas", tags: ["Festival"] },
  { workspace_id: org.id, reference: "LD-2026-016", name: "Corporate Away Day", client_name: "InnovateTech Ltd", event_type: "Corporate", stage: "new", value: 8500, probability: 20, owner_name: "Mia Chen", tags: ["Corporate"] },
  { workspace_id: org.id, reference: "LD-2026-015", name: "Charity Gala Dinner", client_name: "Hope Foundation", event_type: "Gala Dinner", stage: "new", value: 12000, probability: 25, owner_name: "Alex Thomas", tags: ["Gala Dinner"] },
  { workspace_id: org.id, reference: "LD-2026-014", name: "Food & Drink Festival", client_name: "City Events Co", event_type: "Festival", stage: "qualified", value: 25000, probability: 40, owner_name: "Sophie Malik", tags: ["Festival"] },
  { workspace_id: org.id, reference: "LD-2026-013", name: "Product Launch", client_name: "Nova Tech", event_type: "Corporate", stage: "qualified", value: 18000, probability: 40, owner_name: "Mia Chen", tags: ["Corporate"] },
  { workspace_id: org.id, reference: "LD-2026-012", name: "New Year's Party", client_name: "Global Media", event_type: "Party", stage: "qualified", value: 35000, probability: 50, owner_name: "Alex Thomas", tags: ["Party"] },
  { workspace_id: org.id, reference: "LD-2026-011", name: "Wedding Showcase", client_name: "Elegant Events", event_type: "Wedding", stage: "proposal", value: 22000, probability: 60, owner_name: "Sophie Malik", tags: ["Wedding"] },
  { workspace_id: org.id, reference: "LD-2026-010", name: "Music & Arts Weekend", client_name: "Local Council", event_type: "Festival", stage: "proposal", value: 40000, probability: 60, owner_name: "Alex Thomas", tags: ["Festival"] },
  { workspace_id: org.id, reference: "LD-2026-009", name: "VIP Networking Night", client_name: "Business Club", event_type: "Networking", stage: "proposal", value: 12000, probability: 55, owner_name: "Mia Chen", tags: ["Networking"] },
  { workspace_id: org.id, reference: "LD-2026-008", name: "Tech Conference 2026", client_name: "Innovate UK", event_type: "Conference", stage: "negotiating", value: 45000, probability: 75, owner_name: "Alex Thomas", tags: ["Conference"] },
  { workspace_id: org.id, reference: "LD-2026-007", name: "Summer Beach Party", client_name: "Coastal Events", event_type: "Party", stage: "negotiating", value: 17000, probability: 70, owner_name: "Ryan Brooks", tags: ["Party"] },
  { workspace_id: org.id, reference: "LD-2026-006", name: "Neon Nights Festival", client_name: "Riverside Park", event_type: "Festival", stage: "won", value: 52000, probability: 100, owner_name: "Alex Thomas", tags: ["Festival"], event_id: E["neon-nights"].id },
  { workspace_id: org.id, reference: "LD-2026-005", name: "Creators Connect", client_name: "The Loft", event_type: "Conference", stage: "won", value: 26000, probability: 100, owner_name: "Mia Chen", tags: ["Conference"], event_id: E["creators-connect"].id },
  { workspace_id: org.id, reference: "LD-2026-004", name: "Taste & Tango", client_name: "Bayview Center", event_type: "Food & Drink", stage: "won", value: 18000, probability: 100, owner_name: "Sophie Malik", tags: ["Food & Drink"], event_id: E["taste-tango-fest"].id },
  { workspace_id: org.id, reference: "LD-2026-003", name: "Winter Wonderland", client_name: "City Events", event_type: "Festival", stage: "lost", value: 28000, probability: 0, owner_name: "Alex Thomas", tags: ["Festival"] },
  { workspace_id: org.id, reference: "LD-2026-002", name: "Corporate Retreat", client_name: "Horizon Ltd", event_type: "Corporate", stage: "lost", value: 15000, probability: 0, owner_name: "Ryan Brooks", tags: ["Corporate"] },
  { workspace_id: org.id, reference: "LD-2026-001", name: "NYE Gala", client_name: "Luxury Events", event_type: "Gala Dinner", stage: "lost", value: 30000, probability: 0, owner_name: "Mia Chen", tags: ["Gala Dinner"] },
]).select(), "leads");
const neonContent = {
  summary: "A dynamic one-day music festival at Riverside Park featuring headline acts, food & drink villages, family friendly areas and immersive experiences. This proposal includes full production, site management, safety planning and hospitality to deliver a safe, memorable and commercially successful event.",
  attendance: "5,000 – 8,000", attendance_type: "General public", venue: "Riverside Park, London", hero: img("oe-neon"),
  line_items: [["Venue & Site", "Riverside Park - Full day hire", 1, 12000], ["Production & Technical", "Stage, sound, lighting, power", 1, 15000], ["Artist & Entertainment", "Headline artist + 3 support acts", 1, 18000], ["Staff & Crew", "Event staff, security, stewards", 1, 6500], ["Marketing & Promotion", "Campaign, design, media spend", 1, 4000], ["Hospitality & Catering", "Food & drink village (operator fee)", 1, 3500], ["Insurance & Compliance", "Event insurance, licences, safety", 1, 1500]],
  options: [["VIP viewing area", "Raised platform with private bar and seating for 200 guests", 6000, true], ["After-party (venue hire)", "Use of adjacent venue for official after-party (22:00 – 02:00)", 4500, true], ["Live stream package", "Multi-camera live stream with recording and delivery", 3000, false], ["Additional day (setup day)", "Access for additional day for extended build", 2500, false]],
  terms: { validity: "30 days (until 30 Apr 2027)", payment: "30% deposit, 50% 14 days before event, 20% within 7 days after event", cancellation: "Deposit non-refundable after signature", assumptions: "Based on 5,000 – 8,000 attendees. Full production, staffing and safety as per scope.", exclusions: "Local authority fees (if applicable)" },
  files: [["Neon Nights - Proposal v2.pdf", "PDF • 2.4 MB"], ["Site plan - Riverside Park.pdf", "PDF • 1.1 MB"], ["Production spec.pdf", "PDF • 900 KB"], ["Artist line-up (draft).pdf", "PDF • 900 KB"]],
};
must(await sb.from("proposals").insert([
  { workspace_id: org.id, lead_id: lead.find(l => l.reference === "LD-2026-018").id, number: "PR-2026-014", title: "Neon Nights Festival", client_name: "Riverside Council", status: "draft", version: 2, valid_until: day(2027, 4, 30), subtotal: 62500, tax: 12500, total: 75000, deposit_pct: 30, content: neonContent },
  { workspace_id: org.id, number: "PR-2026-013", title: "Tech Conference 2026", client_name: "Innovate UK", status: "sent", version: 1, valid_until: day(2027, 3, 5), total: 45000 },
  { workspace_id: org.id, number: "PR-2026-012", title: "Wedding Showcase", client_name: "Elegant Events", status: "viewed", version: 2, valid_until: day(2027, 2, 28), total: 22000 },
  { workspace_id: org.id, number: "PR-2026-011", title: "Food & Drink Festival", client_name: "City Events Co", status: "sent", version: 1, valid_until: day(2027, 2, 15), total: 25000, signature_status: "awaiting" },
  { workspace_id: org.id, number: "PR-2026-010", title: "VIP Networking Night", client_name: "Business Club", status: "draft", version: 1, valid_until: day(2027, 2, 2), total: 34500 },
  { workspace_id: org.id, number: "PR-2026-009", title: "Neon Nights Festival", client_name: "Riverside Park", status: "accepted", version: 2, valid_until: day(2026, 12, 12), total: 52000, signature_status: "signed", deposit_status: "paid", event_id: E["neon-nights"].id },
  { workspace_id: org.id, number: "PR-2026-008", title: "Creators Connect", client_name: "The Loft", status: "accepted", version: 1, valid_until: day(2026, 11, 20), total: 26000, signature_status: "signed", deposit_status: "paid", event_id: E["creators-connect"].id },
]), "proposals");

// Crew & shifts
const crewRows = [["James Carter", "Event Manager", "member", "active", "av-james-carter", ids.crew, 250], ["Sophie Malik", "Operations Lead", "member", "active", "av-sophie-malik", null, 230], ["Ryan Brooks", "Production Manager", "member", "active", "av-ryan-brooks", null, 240], ["Mia Chen", "Marketing Lead", "member", "active", "av-mia-chen", null, 210], ["Liam Patel", "Crew Chief", "crew", "available", "av-liam-patel", null, 180], ["Ava Thompson", "Stage Technician", "crew", "on_event", "av-ava-thompson", null, 160], ["Noah Evans", "Lighting Technician", "crew", "available", "av-noah-evans", null, 170], ["Isabella Garcia", "Sound Engineer", "crew", "available", "av-isabella-garcia", null, 175], ["Daniel Kim", "Security Supervisor", "crew", "on_event", "av-daniel-kim", null, 150], ["Chloe Roberts", "Bar Manager", "crew", "unavailable", "av-chloe-roberts", null, 140]];
const crew = must(await sb.from("crew_members").insert(crewRows.map(([name, role, member_type, status, av, user_id, rate]) => ({ workspace_id: org.id, name, role, member_type, status, avatar: img(av), user_id, day_rate: rate, location: "London, UK", email: `${name.split(" ")[0].toLowerCase()}.${name.split(" ")[1].toLowerCase()}@example.com`, phone: "+44 7700 900123", skills: name === "James Carter" ? ["Event Management", "Production", "Team Leadership", "Supplier Management", "Risk Assessment", "Budgeting", "On-site Operations", "Client Relations"] : [role], bio: name === "James Carter" ? "Experienced event manager with 8+ years in live events, from corporate conferences to large-scale festivals. Strong background in event production, team leadership and supplier coordination." : "" }))).select(), "crew");
const C = Object.fromEntries(crew.map(c => [c.name, c]));
const sh = (crewName, title, location, s, e, status, eventKey, role) => ({ workspace_id: org.id, crew_id: C[crewName]?.id ?? null, title, location, starts_at: s, ends_at: e, status, event_id: eventKey ? E[eventKey].id : null, role: role ?? C[crewName]?.role ?? "Crew" });
must(await sb.from("shifts").insert([
  sh("James Carter", "Corporate Summit", "Excel London", at(2027, 7, 20, 8), at(2027, 7, 21, 18), "confirmed", "creators-connect"),
  sh("James Carter", "Neon Nights Festival", "Riverside Park", at(2027, 7, 24, 8), at(2027, 7, 26, 23), "confirmed", "neon-nights"),
  sh("Sophie Malik", "Summer Sessions", "The Grand Hall", at(2027, 7, 19, 8), at(2027, 7, 20, 22), "confirmed", null),
  sh("Ryan Brooks", "Load In & Setup", "Riverside Park", at(2027, 7, 21, 8), at(2027, 7, 23, 20), "pending", "neon-nights"),
  sh("Ryan Brooks", "Neon Nights Festival", "Riverside Park", at(2027, 7, 24, 8), at(2027, 7, 26, 23), "confirmed", "neon-nights"),
  sh("Liam Patel", "Unavailable", "", at(2027, 7, 19, 0), at(2027, 7, 20, 23), "unavailable", null, "Unavailable"),
  sh("Liam Patel", "Neon Nights Festival", "Crew Chief", at(2027, 7, 22, 8), at(2027, 7, 25, 23), "confirmed", "neon-nights"),
  sh("Ava Thompson", "Neon Nights Festival", "Stage Tech", at(2027, 7, 22, 8), at(2027, 7, 24, 23), "confirmed", "neon-nights", "Stage Tech"),
  sh("Noah Evans", "Venue Rehearsal", "Riverside Park", at(2027, 7, 20, 8), at(2027, 7, 21, 22), "draft", "neon-nights"),
  sh("Noah Evans", "Neon Nights Festival", "Lighting Tech", at(2027, 7, 24, 8), at(2027, 7, 26, 23), "confirmed", "neon-nights", "Lighting Tech"),
  sh("Isabella Garcia", "Travel", "", at(2027, 7, 22, 8), at(2027, 7, 23, 20), "travel", null, "Travel"),
  sh("Isabella Garcia", "Neon Nights Festival", "Sound Engineer", at(2027, 7, 24, 8), at(2027, 7, 26, 23), "confirmed", "neon-nights", "Sound Engineer"),
  sh("Daniel Kim", "Neon Nights Festival", "Riverside Park", at(2027, 7, 26, 8), at(2027, 7, 26, 12), "confirmed", "neon-nights", "Stage Crew"),
  sh("Chloe Roberts", "Neon Nights Festival", "Riverside Park", at(2027, 7, 26, 12), at(2027, 7, 26, 18), "confirmed", "neon-nights", "Bar Staff"),
  sh("Daniel Kim", "Neon Nights Festival", "Riverside Park", at(2027, 7, 26, 18), at(2027, 7, 27, 2), "pending", "neon-nights", "Security"),
  sh("Liam Patel", "Neon Nights Festival", "Riverside Park", at(2027, 7, 27, 9), at(2027, 7, 27, 13), "draft", "neon-nights", "Breakdown Crew"),
]), "shifts");

// Money: transactions ledger (append-only), invoices
const tx = (y, mo, d, description, kind, eventKey, amount, status, category) => ({ workspace_id: org.id, event_id: eventKey ? E[eventKey].id : null, occurred_at: at(y, mo, d, 12), description, kind, amount, status: status ?? "completed", category: category ?? "" });
must(await sb.from("transactions").insert([
  tx(2026, 7, 26, "Ticket sale (428x Early Bird)", "income", "neon-nights", 14980, "completed", "Ticket sales"),
  tx(2026, 7, 25, "Venue deposit", "payment", "neon-nights", -5000, "completed", "Venue & Facilities"),
  tx(2026, 7, 24, "Sponsor payment", "income", "summer-sessions-2026", 3000, "completed", "Sponsorship"),
  tx(2026, 7, 22, "Production supplier", "payment", "neon-nights", -2400, "pending", "Production"),
  tx(2026, 7, 21, "Client invoice #INV-1043", "income", "summer-sessions-2026", 4500, "partial", "Client fees"),
  tx(2026, 7, 20, "Marketing campaign", "payment", "summer-sessions-2026", -1200, "completed", "Marketing & Promotion"),
  tx(2026, 7, 20, "Bar staff payment", "payment", "neon-nights", -1800, "completed", "Staff & Crew"),
  tx(2026, 7, 19, "Refund (order #7721)", "refund", "summer-sessions-2026", -85, "completed", "Refunds"),
  tx(2026, 7, 18, "Equipment hire", "payment", "food-drink-expo-2026", -650, "completed", "Production"),
  tx(2026, 6, 30, "Ticket sales (June)", "income", "summer-sessions-2026", 27800, "completed", "Ticket sales"),
  tx(2026, 5, 31, "Ticket sales (May)", "income", "summer-sessions-2026", 18400, "completed", "Ticket sales"),
  tx(2026, 4, 30, "Ticket sales (April)", "income", "food-drink-expo-2026", 16200, "completed", "Ticket sales"),
  tx(2026, 3, 31, "Ticket sales (March)", "income", "food-drink-expo-2026", 9800, "completed", "Ticket sales"),
  tx(2026, 2, 28, "Sponsorship (Riverside Live)", "income", "summer-sessions-2026", 12000, "completed", "Sponsorship"),
  tx(2026, 1, 31, "Ticket sales (Jan)", "income", "summer-sessions-2026", 6200, "completed", "Ticket sales"),
  tx(2026, 6, 15, "Artist fees (Summer Sessions)", "payment", "summer-sessions-2026", -22000, "completed", "Artist & Entertainment"),
  tx(2026, 5, 15, "Production (Food & Drink Expo)", "payment", "food-drink-expo-2026", -8600, "completed", "Production"),
  tx(2026, 4, 15, "Venue hire (Food & Drink Expo)", "payment", "food-drink-expo-2026", -9400, "completed", "Venue & Facilities"),
  tx(2026, 3, 15, "Staff & crew (March)", "payment", "summer-sessions-2026", -6800, "completed", "Staff & Crew"),
  tx(2026, 2, 15, "Marketing (Q1)", "payment", "summer-sessions-2026", -5400, "completed", "Marketing & Promotion"),
]), "transactions");
const inv = async (row, items, installments, events) => {
  const i = must(await sb.from("invoices").insert({ workspace_id: org.id, ...row }).select().single(), "invoice " + row.number);
  if (items) must(await sb.from("invoice_items").insert(items.map(([description, detail, quantity, unit_price], k) => ({ invoice_id: i.id, description, detail, quantity, unit_price, tax_rate: 20, sort: k }))), "items");
  if (installments) must(await sb.from("invoice_installments").insert(installments.map(([label, due_date, amount, status]) => ({ invoice_id: i.id, label, due_date, amount, status }))), "inst");
  if (events) must(await sb.from("invoice_events").insert(events.map(([event, detail, created_at]) => ({ invoice_id: i.id, event, detail, created_at }))), "ievents");
  return i;
};
await inv({ number: "INV-1047", event_id: E["summer-sessions-2026"].id, client_name: "City Events Ltd", client_email: "summer@cityevents.co.uk", client_address: "123 Business Park\nBirmingham\nB1 2AA\nUnited Kingdom", contact_name: "Sarah Johnson", reference: "CE-SUMMER-26", status: "paid", issue_date: day(2026, 8, 1), due_date: day(2026, 8, 22), subtotal: 4000, tax: 800, total: 4800, amount_paid: 4800, issued_at: at(2026, 8, 1, 11, 3), notes: "Thank you for your business. Please use the payment link for card or bank transfer.\n\nFor any queries please contact Alex Events." },
  [["Venue Hire", "Main hall hire (full day)", 1, 2000], ["Production", "Lighting, sound and staging", 1, 1200], ["Staffing", "Crew and technical staff", 1, 800], ["Event Management", "Planning and on-site management", 1, 800]],
  [["Deposit (50%)", day(2026, 8, 1), 2400, "paid"], ["Final payment (50%)", day(2026, 8, 22), 2400, "paid"]],
  [["Invoice created", "By Alex Thomas", at(2026, 8, 1, 10, 14)], ["Invoice sent", "Sent to summer@cityevents.co.uk", at(2026, 8, 1, 11, 3)], ["Payment reminder sent", "Automated reminder email", at(2026, 8, 14, 10, 0)], ["Invoice paid", "£4,800.00 received via card payment", at(2026, 8, 18, 9, 41)]]);
await inv({ number: "INV-1048", event_id: E["neon-nights"].id, client_name: "Bright Sound", status: "overdue", issue_date: day(2026, 7, 2), due_date: day(2026, 7, 28), subtotal: 1791.67, tax: 358.33, total: 2150, issued_at: at(2026, 7, 2, 10) }, [["Sound package", "", 1, 1791.67]]);
await inv({ number: "INV-1049", event_id: E["neon-nights"].id, client_name: "City Events Ltd", status: "overdue", issue_date: day(2026, 7, 5), due_date: day(2026, 7, 28), subtotal: 4000, tax: 800, total: 4800, issued_at: at(2026, 7, 5, 10) }, [["Event services", "", 1, 4000]]);
await inv({ number: "INV-1043", event_id: E["summer-sessions-2026"].id, client_name: "Global Media", status: "sent", issue_date: day(2026, 7, 21), due_date: day(2026, 8, 5), subtotal: 3333.33, tax: 666.67, total: 4000, issued_at: at(2026, 7, 21, 10) }, [["Media partnership", "", 1, 3333.33]]);
await inv({ number: "INV-1039", event_id: E["food-drink-expo-2026"].id, client_name: "Taste Catering", status: "sent", issue_date: day(2026, 8, 1), due_date: day(2026, 8, 10), subtotal: 1500, tax: 300, total: 1800, issued_at: at(2026, 8, 1, 10) }, [["Catering commission", "", 1, 1500]]);
await inv({ number: "INV-1035", event_id: E["summer-sessions-2026"].id, client_name: "Riverside Venue", status: "draft", issue_date: day(2026, 8, 12), due_date: day(2026, 8, 30), subtotal: 2458.33, tax: 491.67, total: 2950 }, [["Venue services", "", 1, 2458.33]]);

// Promotions, promoters, media, templates, calendar
must(await sb.from("promotions").insert([
  { event_id: E["neon-nights"].id, channel: "Event directory & calendar", title: "Event listing", audience: "All users", scheduled_at: at(2027, 6, 24, 9), est_reach: "12,000 – 18,000", cost: 0, status: "ready" },
  { event_id: E["neon-nights"].id, channel: "Homepage spotlight", title: "Hero banner", audience: "All users", scheduled_at: at(2027, 6, 24, 9), est_reach: "20,000 – 32,000", cost: 150, status: "requires_approval", sponsored: true },
  { event_id: E["neon-nights"].id, channel: "Social media campaign", title: "Poster + copy", audience: "Targeted", scheduled_at: at(2027, 7, 1, 9), est_reach: "8,000 – 14,000", cost: 50, status: "ready" },
  { event_id: E["neon-nights"].id, channel: "Lineup reveal post", title: "Video + copy", audience: "Targeted", scheduled_at: at(2027, 7, 4, 9), est_reach: "6,000 – 10,500", cost: 30, status: "ready" },
  { event_id: E["neon-nights"].id, channel: "Email early bird reminder", title: "Email", audience: "Subscribers", scheduled_at: at(2027, 7, 6, 9), est_reach: "4,000 – 6,000", cost: 0, status: "ready" },
  { event_id: E["neon-nights"].id, channel: "Final tickets push", title: "Poster + copy", audience: "Targeted", scheduled_at: at(2027, 7, 10, 9), est_reach: "8,000 – 12,000", cost: 20, status: "ready" },
]), "promotions");
must(await sb.from("promoters").insert([
  { event_id: E["neon-nights"].id, name: "Rave Central", code: "NEON25", tickets_sold: 312, commission_pct: 10, revenue: 3420, status: "active" },
  { event_id: E["neon-nights"].id, name: "London Events", code: "NEONLDN", tickets_sold: 243, commission_pct: 12, revenue: 2960, status: "active" },
  { event_id: E["neon-nights"].id, name: "UK Nightlife", code: "NEONUK", tickets_sold: 186, commission_pct: 10, revenue: 2340, status: "active" },
  { event_id: E["neon-nights"].id, name: "Campus Events", code: "NEONUNI", tickets_sold: 92, commission_pct: 15, revenue: 1680, status: "pending" },
  { event_id: E["neon-nights"].id, name: "Festival Finder", code: "NEONFEST", tickets_sold: 54, commission_pct: 10, revenue: 980, status: "active" },
]), "promoters");
must(await sb.from("event_templates").insert([
  { workspace_id: org.id, source_event_id: E["neon-nights"].id, name: "Festival – Multi Stage (Standard)", description: "A complete multi-stage festival template with standard structure, ticket tiers, lineup planning, supplier categories, promotion plan and staffing roles. Designed for outdoor music festivals, 2–3 days events.", event_types: ["Festival", "Large Show", "Outdoor Event", "Music Event", "Multi Day"], modules: { plan: true, schedule: true, providers: true, tickets: true, promotion: true, staffing: true, risk: true } },
]), "templates");
must(await sb.from("calendar_entries").insert([
  { workspace_id: org.id, layer: "meetings", title: "Organizer Sync", starts_at: at(2026, 10, 10, 10), ends_at: at(2026, 10, 10, 11) },
  { workspace_id: org.id, layer: "meetings", title: "Post-Event Review", starts_at: at(2026, 10, 12, 10), ends_at: at(2026, 10, 12, 11) },
  { workspace_id: org.id, layer: "meetings", title: "Marketing Planning", starts_at: at(2026, 10, 14, 14), ends_at: at(2026, 10, 14, 15) },
  { owner_id: ids.customer, layer: "meetings", title: "Venue call", detail: "Bayview Center", starts_at: at(2026, 10, 10, 16), ends_at: at(2026, 10, 10, 16, 30) },
]), "calendar");

// Agent runs, approvals, routines
const run = async row => must(await sb.from("agent_runs").insert({ workspace_id: org.id, user_id: ids.organizer, surface: "organizer", ...row }).select().single(), "run");
const r1 = await run({ event_id: E["neon-nights"].id, goal: "Neon Nights Festival - Full Event Plan", scope: ["event"], status: "waiting_external", progress: 80, waiting_reason: "Waiting on venue confirmation", next_wake_at: at(2026, 10, 10, 18), plan: [{ step: "Draft programme", done: true }, { step: "Source providers", done: true }, { step: "Compare quotes", done: true }, { step: "Confirm venue", done: false }, { step: "Publish plan", done: false }] });
await run({ event_id: E["neon-nights"].id, goal: "Promotion Campaign Launch", scope: ["promotion"], status: "running", progress: 45, waiting_reason: "Create final poster variants", next_wake_at: at(2026, 10, 10, 18) });
await run({ event_id: E["neon-nights"].id, goal: "Supplier Shortlist & RFQs", scope: ["suppliers"], status: "running", progress: 60, waiting_reason: "Review supplier responses (3)", next_wake_at: at(2026, 10, 10, 12) });
await run({ event_id: E["neon-nights"].id, goal: "Staffing Plan & Assignments", scope: ["team"], status: "running", progress: 30, waiting_reason: "Confirm 4 crew members", next_wake_at: at(2026, 10, 10, 12) });
await run({ event_id: E["summer-sessions-2026"].id, goal: "Ticket Sales Analysis", scope: ["ticketing"], status: "completed", progress: 100, result: "Delivered report" });
await run({ goal: "Venue Compliance Check", scope: ["event"], status: "waiting_external", progress: 20, waiting_reason: "Waiting on venue documents", next_wake_at: at(2026, 10, 11, 10) });
must(await sb.from("agent_approvals").insert([
  { run_id: r1.id, workspace_id: org.id, event_id: E["neon-nights"].id, title: "Publish Neon Nights Festival", detail: "Publish the public event page and make tickets available for sale.", action: "publish_event", impact: "Public visibility", status: "pending" },
  { workspace_id: org.id, event_id: E["neon-nights"].id, title: "Confirm venue booking payment", detail: "Pay £2,400 deposit to Riverside Park.", action: "pay_deposit", amount: 2400, status: "pending" },
  { workspace_id: org.id, event_id: E["summer-sessions-2026"].id, title: "Send campaign to 12,400 subscribers", detail: "Send event announcement email for Summer Sessions.", action: "broadcast", impact: "12,400 contacts", status: "pending" },
]), "approvals");
must(await sb.from("agent_routines").insert([
  { workspace_id: org.id, title: "Weekly event performance review", detail: "Every Monday at 09:00 • Reviews ticket sales, expenses and key metrics for all active events.", schedule: "0 9 * * 1" },
  { workspace_id: org.id, title: "Daily supplier follow up", detail: "Every day at 10:00 • Checks RFQ responses and sends follow up messages.", schedule: "0 10 * * *" },
  { workspace_id: org.id, title: "Pre-event checklist", detail: "7 days before event • Runs compliance, team, supplier and promotion checks.", schedule: "event-7d" },
  { workspace_id: org.id, title: "Monthly financial summary", detail: "1st of month at 09:00 • Generates revenue, costs and profit report for previous month.", schedule: "0 9 1 * *" },
]), "routines");

// Notifications
must(await sb.from("notifications").insert([
  { user_id: ids.customer, kind: "quote_received", title: "New quote from Taste & Tango Catering", body: "Review the catering quote for Alex & Taylor Wedding.", link: `/account/events/${E["alex-taylor-wedding"].id}/build` },
  { user_id: ids.customer, kind: "payment_due", title: "Payment due: £540 deposit", body: "Taste & Tango Catering deposit due 10 May 2027.", link: `/account/events/${E["alex-taylor-wedding"].id}/money` },
  { user_id: ids.organizer, kind: "hold_expiry", title: "Venue hold expires today", body: "Riverside Park hold expires at 5:00 PM.", link: `/organizer/events/${E["neon-nights"].id}` },
  { user_id: ids.organizer, kind: "agent_approval", title: "3 approvals waiting", body: "Gala Agent prepared actions that need your approval.", link: "/organizer/agent?tab=approvals" },
]), "notifications");

// Reviews (eligible: past fulfilled bookings). One submitted, rest pending.
must(await sb.from("reviews").insert([{ user_id: ids.customer, build_item_id: past[2].id, listing_id: L["elite-sounds-dj"].id, rating: 5, ratings: { quality: 5, communication: 5, value: 5, reliability: 5 }, body: "Absolutely fantastic! Packed dance floor all night." }]), "reviews");
must(await sb.from("saved_items").upsert([
  ...["neon-nights", "taste-tango-fest", "sunset-sessions"].map(k => ({ user_id: ids.customer, item_key: `event:${E[k].id}` })),
  ...["the-loft-london", "riverside-manor", "skyline-events-space"].map(k => ({ user_id: ids.customer, item_key: `listing:${L[k].id}` })),
  ...["elite-sounds-dj", "taste-co-catering", "sweet-petals"].map(k => ({ user_id: ids.customer, item_key: `listing:${L[k].id}` })),
]), "saved");

console.log(JSON.stringify({ users: Object.fromEntries(Object.entries(USERS).map(([k, u]) => [k, u.email])), organizer_workspace: org.id, provider_workspaces: [arena.id, venuesWs.id, servicesWs.id], events: Object.keys(E).length, listings: Object.keys(L).length }, null, 1));

// Main demo event two weeks out so operational screens are near-term (dates above are authored for Jul 2027).
must(await sb.rpc("seed_shift_event", { p_slug: "neon-nights", p_days: -275 }), "shift neon");

// Enrichment keyed by slug (idempotent).
await import("./seed-demo-extras.mjs");
