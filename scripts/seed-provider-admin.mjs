// Seeds deterministic Provider workspace + Platform Admin fixtures on top of scripts/seed-demo.mjs.
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-provider-admin.mjs [--remove]
// Run AFTER seed-demo.mjs (it reuses provider.demo@example.com and the "Riverside Arena" workspace).
// Idempotent: removes rows it created (identified by demo users, the Riverside Arena workspace and "D-" references).
// Times are relative to now so response clocks, holds and "upcoming" views behave like production.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";

if (process.env.NODE_ENV === "production") { console.error("Refusing to seed in production."); process.exit(1); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const rawFrom = sb.from.bind(sb);
sb.from = table => { const q = rawFrom(table); const ins = q.insert.bind(q); q.insert = (v, o = {}) => ins(v, { defaultToNull: false, ...o }); return q; };
const must = (r, what) => { if (r.error) { console.error(what, r.error); process.exit(1); } return r.data; };
const img = n => `/assets/gd/${n}.webp`;
const asset = n => `/assets/${n}.webp`;
const NOW = Date.now();
const H = 3600e3, D = 24 * H;
const iso = ms => new Date(ms).toISOString();
/** London calendar day `days` from today, at a London wall-clock time (handles BST/GMT and late-evening UTC rollover). */
const londonParts = ms => Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms)).map(p => [p.type, p.value]));
const londonOffsetMin = ms => { const n = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "shortOffset" }).formatToParts(new Date(ms)).find(p => p.type === "timeZoneName").value; const m = n.match(/GMT([+-]\d+)?/); return m && m[1] ? Number(m[1]) * 60 : 0; };
const at = (days, hour = 12, min = 0) => {
  const p = londonParts(NOW + days * D);
  const wallUtc = Date.UTC(+p.year, +p.month - 1, +p.day, 0, 0) + Math.round(hour * 60 + min) * 60e3;
  return new Date(wallUtc - londonOffsetMin(wallUtc) * 60e3).toISOString();
};

// ── Identities ──────────────────────────────────────────────────────────
const PEOPLE = {
  admin: { email: "admin.demo@example.com", name: "Alex Morgan", env: "DEMO_ADMIN_PASSWORD", avatar: img("av-sophie-malik") },
  support: { email: "support.demo@example.com", name: "Rachel Adams", env: "DEMO_SUPPORT_ADMIN_PASSWORD", avatar: img("av-chloe-roberts") },
  requests: { email: "marketplace.requests@example.com", name: "Gala Dock Demo Requests" },
  sarah: { email: "s.mitchell@example.com", name: "Sarah Mitchell", avatar: img("av-ava-thompson") },
  priya: { email: "p.shah@example.com", name: "Priya Shah", avatar: img("av-isabella-garcia") },
  marcus: { email: "m.lee@example.com", name: "Marcus Lee", avatar: img("av-ryan-brooks") },
  daniel: { email: "d.kim@example.com", name: "Daniel Kim", avatar: img("av-daniel-kim") },
  oliver: { email: "o.bennett@example.com", name: "Oliver Bennett", avatar: img("av-noah-evans") },
  emma: { email: "e.carter@example.com", name: "Emma Carter", avatar: img("av-mia-chen") },
  liam: { email: "l.wilson@example.com", name: "Liam Wilson", avatar: img("av-liam-patel") },
  sophie: { email: "s.turner@example.com", name: "Sophie Turner", avatar: img("av-sophie-malik") },
};
const allUsers = must(await sb.auth.admin.listUsers({ perPage: 1000 }), "listUsers").users;
const generated = {};
async function ensureUser(key) {
  const p = PEOPLE[key];
  const found = allUsers.find(u => u.email === p.email);
  if (found) return found.id;
  const password = (p.env && process.env[p.env]) || randomBytes(12).toString("base64url") + "a1!";
  if (p.env) generated[p.env] = password;
  const created = must(await sb.auth.admin.createUser({ email: p.email, password, email_confirm: true, user_metadata: { full_name: p.name, terms_version: "2026-10" } }), `create ${key}`);
  return created.user.id;
}
const U = {};
for (const k of Object.keys(PEOPLE)) U[k] = await ensureUser(k);
const providerUser = allUsers.find(u => u.email === "provider.demo@example.com");
if (!providerUser) { console.error("Run scripts/seed-demo.mjs first (provider.demo@example.com missing)."); process.exit(1); }
const arena = must(await sb.from("workspaces").select("id").eq("owner_id", providerUser.id).eq("name", "Riverside Arena").maybeSingle(), "arena");
if (!arena) { console.error("Riverside Arena workspace missing — run scripts/seed-demo.mjs first."); process.exit(1); }
const WS = arena.id;

// ── Cleanup (only rows this script owns) ─────────────────────────────────
async function cleanup() {
  must(await sb.from("provider_jobs").delete().eq("workspace_id", WS), "clean jobs");
  const reqEvents = must(await sb.from("events").select("id").eq("owner_id", U.requests), "req events").map(e => e.id);
  if (reqEvents.length) must(await sb.from("events").delete().in("id", reqEvents), "clean req events");
  for (const t of ["calendar_entries", "availability_blocks", "packages", "spaces", "venue_structures", "shifts", "crew_members", "transactions", "agent_approvals", "agent_runs", "agent_routines"]) {
    must(await sb.from(t).delete().eq("workspace_id", WS), `clean ${t}`);
  }
  must(await sb.from("notifications").delete().eq("user_id", providerUser.id).like("kind", "provider.%"), "clean notes");
  must(await sb.from("support_cases").delete().like("reference", "D-%"), "clean cases");
  must(await sb.from("trust_cases").delete().like("reference", "D-%"), "clean trust");
  must(await sb.from("partners").delete().like("referral_code", "DEMO-%"), "clean partners");
  must(await sb.from("integrations").delete().neq("name", ""), "clean integrations");
  must(await sb.from("platform_settings").delete().like("change_reason", "Seed:%"), "clean settings");
  must(await sb.from("transactions").delete().like("description", "[demo] %"), "clean platform tx");
  must(await sb.from("agent_runs").delete().eq("surface", "admin").eq("user_id", U.admin), "clean admin runs");
}
await cleanup();
if (process.argv.includes("--remove")) {
  must(await sb.from("platform_admins").delete().in("user_id", [U.admin, U.support]), "clean admins");
  for (const k of Object.keys(PEOPLE)) await sb.auth.admin.deleteUser(U[k]);
  console.log("Provider/Admin demo data removed."); process.exit(0);
}
if (Object.keys(generated).length) {
  let env = await fs.readFile(".env.local", "utf8");
  for (const [k, v] of Object.entries(generated)) if (!env.includes(`${k}=`)) env += `${env.endsWith("\n") ? "" : "\n"}${k}=${v}\n`;
  await fs.writeFile(".env.local", env);
}

// ── Profiles & admins ────────────────────────────────────────────────────
for (const [k, p] of Object.entries(PEOPLE)) {
  must(await sb.from("profiles").update({ full_name: p.name, avatar_url: p.avatar ?? "", onboarding_complete: true, identity_verified: !["emma", "daniel"].includes(k),
    status: k === "emma" ? "restricted" : "active", last_active_at: iso(NOW - (Object.keys(PEOPLE).indexOf(k) + 1) * 2.3 * H) }).eq("id", U[k]), `profile ${k}`);
}
must(await sb.from("profiles").update({ avatar_url: img("av-noah-evans"), identity_verified: true, last_active_at: iso(NOW - 0.2 * H) }).eq("id", providerUser.id), "provider avatar");
must(await sb.from("platform_admins").upsert([
  { user_id: U.admin, title: "Platform Admin", permissions: ["support", "trust", "commerce", "users", "workspaces", "events", "marketplace", "tickets", "partners", "settings", "agent_ops", "analytics", "audit"] },
  { user_id: U.support, title: "Support Lead", permissions: ["support", "users", "tickets"] },
], { onConflict: "user_id" }), "admins");

// ── Provider workspace ───────────────────────────────────────────────────
const wsRow = must(await sb.from("workspaces").select("settings").eq("id", WS).single(), "ws settings");
must(await sb.from("workspaces").update({ plan: "pro", commission_bps: 1500, cover_image: img("v-riverside-events-centre"),
  settings: { ...(wsRow.settings ?? {}), tax: { vat_registered: true, rate_bps: 2000, jurisdiction: "GB", number: "GB 293 4471 06" }, booking_rules: { auto_response: true, default_response_hours: 4 } } }).eq("id", WS), "ws");
// One venue with spaces (designs), not one listing per room.
must(await sb.from("listings").delete().eq("workspace_id", WS).in("slug", ["riverside-arena-main-hall", "riverside-arena-suite", "riverside-arena-rooftop", "riverside-arena-studio", "riverside-arena-grounds"]), "drop per-room listings");
let venue = must(await sb.from("listings").select("*").eq("slug", "riverside-arena").maybeSingle(), "venue?");
const venueFields = { workspace_id: WS, name: "Riverside Arena", kind: "venue", slug: "riverside-arena", category: "Arena", city: "London", location: "123 Riverside Walk, London, SE1 9PP",
  description: "Multi-space riverside venue with a 250-capacity Main Hall, conference suite, rooftop terrace, production studio and landscaped gardens — in-house catering and AV.",
  image: img("v-riverside-events-centre"), gallery: ["v-riverside-park", "v-skyline-rooftop", "v-riverside-conference", "v-oakwood", "v-grand-hall", "hero-wedding", "ev-rooftop", "v-east-london-warehouse", "v-harper", "v-loft-sm", "hero-wedding-b", "ev-tastetango"].map(img),
  price_from: 250, price_unit: "per hour", capacity_min: 20, capacity_max: 400, rating: 4.9, review_count: 128, response_hours: 4, verified: true, instant_book: false,
  emergency_supply: true, booking_mode: "request", review_status: "approved", views: 892, enquiry_count: 46, tags: ["Riverside", "Multi-space", "Catering", "AV"],
  lat: 51.5052, lng: -0.0909, published: true, paused_at: null, details: { photos: [img("v-riverside-events-centre")], timezone: "Europe/London", type: "Event venue",
    hours: { mon: ["09:00", "00:00"], tue: ["09:00", "00:00"], wed: ["09:00", "00:00"], thu: ["09:00", "00:00"], fri: ["09:00", "02:00"], sat: ["09:00", "02:00"], sun: ["09:00", "00:00"] },
    contact: { person: "Priya Shah", phone: "+44 7700 900123", email: "events@riversidearena.co.uk", website: "www.riversidearena.co.uk" },
    address: { line1: "123 Riverside Walk", line2: "", city: "London", postcode: "SE1 9PP", country: "United Kingdom" }, geo: { lat: 51.5052, lng: -0.0909 },
    operations: { access_type: "Street access + loading bay", load_in: "2 hours before", load_out: "2 hours after", access_notes: "Main entrance via Riverside Walk. Loading bay on the east side. Please report to site manager on arrival.", parking: true, loading_bay: true, lift: true, stairs: true, always_open: false, notes: "" },
    fnb: { catering: "Available", bar: "Full bar (licensed)", external_catering: "Allowed with approval", corkage: "Not permitted", cash_bar: true, drink_packages: true, notes: "We offer in-house catering with bespoke menus. External catering allowed with prior approval and valid insurance." },
    suppliers: { preferred: "Recommended only", external: "Allowed with approval", equipment: "Allowed", noise: "Standard (11pm cut-off)", notes: "All external suppliers must provide valid insurance and risk assessments. Noise levels must comply with local authority guidelines." },
    access: { step_free: true, toilets: true, lift: true, hearing_loop: true, parking: true, assistance: true, notes: "Step-free access throughout the venue. Accessible toilets on all floors. Assistance dogs welcome." },
    compliance: [{ name: "Premises licence", reference: "PL-SE1-2291", expires: "2026-12-12", file: null }, { name: "Public liability insurance", reference: "PLI-55102", expires: "2027-05-15", file: null },
      { name: "Fire safety certificate", reference: "FS-8812", expires: "2027-01-03", file: null }, { name: "Food hygiene rating", reference: "5 (Very Good)", expires: "", file: null }],
    features: ["Riverside location", "Indoor & outdoor spaces", "In-house catering", "Licensed bar", "Disabled access", "On-site parking", "Live music", "Production & AV"],
    info: { event_types: ["Weddings", "Corporate", "Private parties", "Live events", "Conferences"], accessibility: "Fully accessible — step-free routes and accessible toilets", parking: "On-site (120 spaces)",
      licences: ["Live music", "Alcohol", "Late hours"], curfew: "00:30", staffing: "In-house & external suppliers" },
    commercial: { pricing: "hourly", rate_from: 250, rate_to: 450, minimum_spend: 1000, deposit_pct: 30, balance_days: 14, security_deposit: 500, lead_days: 7, short_notice: true,
      cancellation: [{ window: "7+ days", refund: 100 }, { window: "3–7 days", refund: 50 }, { window: "<3 days", refund: 0 }], holds: { enabled: true, hours: 48 }, standby: { enabled: true, fee: 250 }, emergency: { enabled: true, multiplier: 1.5 } } } };
venue = venue ? must(await sb.from("listings").update(venueFields).eq("id", venue.id).select().single(), "venue upd") : must(await sb.from("listings").insert(venueFields).select().single(), "venue ins");
const services = Object.fromEntries(must(await sb.from("listings").select("id,slug,name").eq("workspace_id", WS).eq("kind", "service"), "services").map(s => [s.slug, s]));
for (const [slug, extra] of [["gala-bites-catering", { views: 356, enquiry_count: 21, review_status: "approved", booking_mode: "request", rating: 4.9, review_count: 67 }], ["riverside-dj-sound", { description: "Professional DJ and sound for weddings, corporate events, parties and club nights — custom playlists, premium sound and lighting, with a dedicated technician and backup equipment on every booking.", views: 1240, enquiry_count: 86, review_status: "approved", booking_mode: "instant", category: "Entertainment > DJ", rating: 4.8, review_count: 96, response_hours: 2,
  gallery: ["ev-neon", "hero-neon", "ev-neon-c", "hero-wedding", "v-grand-hall", "ev-comedy", "ev-rooftop", "v-harper", "hero-wedding-b", "ev-tastetango", "v-loft-sm"].map(img),
  details: { service: { delivery: "onsite", coverage: { mode: "local", radius_miles: 40, base: "London" }, event_types: ["Weddings", "Private Parties", "Corporate Events", "Birthdays", "Nightclub", "Festivals"],
    credentials: [{ name: "Public liability insurance", reference: "£5,000,000 (Verified)", expires: "2026-12-12", required: true }, { name: "PAT testing (equipment)", reference: "PAT-22871", expires: "2026-06-12", required: true }, { name: "Other certifications", reference: "Risk assessment", expires: "", required: false }],
    included: ["Professional DJ and sound system", "Lighting setup and effects", "DJ booth and all equipment", "Wireless microphones", "Setup and breakdown", "Music consultation", "Backup equipment"],
    excluded: ["Venue hire", "Power supply (must be provided)", "Extended travel (billed separately)", "Special effects (CO2, fireworks)", "Live instruments (additional cost)"],
    service_type: "DJ, Sound, Lighting", durations: "2–10 hours", team: "1–3 DJs + technician", equipment: "Pro sound system, lighting, DJ booth, microphones, backup equipment", travel: "Included within 40 miles (£0.80/mile beyond)", docs: "PAT certificates, risk assessment",
    pricing: { model: "package", show_price: true }, addons: [{ name: "Uplighting", desc: "LED uplighting for venue ambience", price: 150, unit: "per event" }, { name: "Additional hour", desc: "Extra DJ time beyond package", price: 100, unit: "per hour" }, { name: "Smoke machine", desc: "Includes fluid and setup", price: 80, unit: "per event" }],
    setup: { setup_minutes: 60, packdown_minutes: 60, space: "Minimum 3m x 2m space, access to power (2 x 13A sockets).", power: true, covered: false, parking: true, dressing: false }, lead: { min_days: 7, max_days: 365 },
    cancellation: [{ window: "7+ days", refund: 100 }, { window: "3–7 days", refund: 50 }, { window: "<3 days", refund: 0 }],
    availability: { week: { mon: ["09:00", "23:00"], tue: ["09:00", "23:00"], wed: ["09:00", "23:00"], thu: ["09:00", "23:00"], fri: ["09:00", "02:00"], sat: ["09:00", "02:00"], sun: null } },
    capacity: { per_day: 3, per_week: 10, multi_same_day: true, travel_buffer_minutes: 60 }, holds: { enabled: true, hours: 24 }, standby: { enabled: true }, emergency: { enabled: true } } } }]]) {
  if (services[slug]) must(await sb.from("listings").update(extra).eq("id", services[slug].id), `svc ${slug}`);
}
const catering = services["gala-bites-catering"], dj = services["riverside-dj-sound"];

const spaceRows = [
  { name: "Main Hall", indoor: true, area_sqm: 420, capacity_standing: 400, capacity_seated: 250, layouts: { theatre: 300, banquet: 250, cabaret: 180, standing: 400, classroom: 160 }, amenities: ["Stage", "PA system", "Lighting rig", "Bar", "Step-free access"], turnaround_minutes: 120, min_hours: 4, exclusive_group: "hall", rate_hourly: 450, image: img("v-riverside-events-centre"), details: { space_type: "Event Hall", dimensions: { length: 40, width: 30, ceiling: 6.5 }, gallery: ["v-grand-hall", "hero-wedding", "ev-neon", "v-harper", "ev-comedy", "hero-wedding-b"].map(img), use_cases: ["Weddings", "Corporate events", "Live events", "Conferences", "Private parties"], layout_features: ["Stage", "Bar", "Dance floor", "Lighting rig"], default_layout: "theatre", access: "Ground floor, direct loading access", toilets: "Yes (adjacent)", bar: "Attached bar (optional)", catering: "In-house or external suppliers", setup_minutes: 60, cleardown_minutes: 60, hours: { inherit: true }, pricing_mode: "hourly", short_notice: true, booking_type: "marketplace", quote_custom: true, description: "Our flagship hall with a fixed stage, lighting rig and attached bar — ideal for weddings, conferences and live events." } },
  { name: "Riverside Suite", indoor: true, area_sqm: 210, capacity_standing: 180, capacity_seated: 120, layouts: { theatre: 140, banquet: 120, cabaret: 90, classroom: 80, boardroom: 40 }, amenities: ["Projector", "Video conferencing", "River views"], turnaround_minutes: 60, min_hours: 2, rate_hourly: 280, image: img("v-riverside-conference"), details: { space_type: "Conference Room", dimensions: { length: 21, width: 10, ceiling: 3.2 }, use_cases: ["Conferences", "Meetings", "Private dining"], default_layout: "classroom", access: "First floor, lift access", toilets: "Yes (on floor)", catering: "In-house", setup_minutes: 30, cleardown_minutes: 30, hours: { inherit: true }, pricing_mode: "hourly", booking_type: "marketplace", description: "Light-filled conference suite with river views, built-in AV and breakout space." } },
  { name: "Rooftop Terrace", indoor: false, area_sqm: 160, capacity_standing: 120, capacity_seated: 80, layouts: { standing: 120, banquet: 80 }, amenities: ["Bar", "Heaters", "Skyline views"], turnaround_minutes: 60, min_hours: 3, rate_hourly: 320, image: img("v-skyline-rooftop"), details: { space_type: "Terrace", dimensions: { length: 16, width: 10, ceiling: 0 }, use_cases: ["Parties", "Receptions", "Product launches"], default_layout: "standing", access: "Roof level, lift access", toilets: "Yes (level below)", bar: "Fixed bar", setup_minutes: 30, cleardown_minutes: 30, hours: { inherit: true }, pricing_mode: "hourly", booking_type: "marketplace", description: "Open-air terrace with skyline views, heaters and a fixed bar." } },
  { name: "Studio Space", indoor: true, area_sqm: 180, capacity_standing: 100, capacity_seated: 60, layouts: { theatre: 80, standing: 100 }, amenities: ["Blackout", "Power distro", "Loading bay"], turnaround_minutes: 90, min_hours: 4, rate_hourly: 250, image: img("v-east-london-warehouse"), details: { space_type: "Studio", dimensions: { length: 18, width: 10, ceiling: 5 }, use_cases: ["Filming", "Photography", "Launches"], default_layout: "standing", access: "Ground floor, loading bay", toilets: "Yes (adjacent)", setup_minutes: 45, cleardown_minutes: 45, hours: { inherit: true }, pricing_mode: "hourly", booking_type: "marketplace", description: "Blackout production studio with power distribution and a loading bay." } },
  { name: "Grounds & Gardens", indoor: false, area_sqm: 1200, capacity_standing: 400, capacity_seated: 200, layouts: { standing: 400, banquet: 200 }, amenities: ["Marquee pitch", "Lawn", "Parking"], turnaround_minutes: 180, min_hours: 4, exclusive_group: "outdoor", rate_hourly: 380, image: img("v-oakwood"), details: { space_type: "Garden", dimensions: { length: 40, width: 30, ceiling: 0 }, use_cases: ["Festivals", "Weddings", "Fairs"], default_layout: "standing", access: "Ground level, vehicle access", toilets: "Temporary units required", setup_minutes: 90, cleardown_minutes: 90, hours: { inherit: true }, pricing_mode: "daily", booking_type: "marketplace", description: "Landscaped riverside grounds for marquees, festivals and outdoor ceremonies." } },
];
const spaces = {};
for (const [i, s] of spaceRows.entries()) spaces[s.name] = must(await sb.from("spaces").insert({ ...s, workspace_id: WS, venue_id: venue.id, status: "published", created_at: at(-2 - i * 3, 10) }).select().single(), `space ${s.name}`);
must(await sb.from("space_links").insert({ workspace_id: WS, ...(spaces["Main Hall"].id < spaces["Riverside Suite"].id ? { space_a: spaces["Main Hall"].id, space_b: spaces["Riverside Suite"].id } : { space_a: spaces["Riverside Suite"].id, space_b: spaces["Main Hall"].id }), kind: "linked" }), "space link");
const pair = (x, y) => (x.id < y.id ? { space_a: x.id, space_b: y.id } : { space_a: y.id, space_b: x.id });
must(await sb.from("space_links").insert({ workspace_id: WS, ...pair(spaces["Main Hall"], spaces["Grounds & Gardens"]), kind: "exclusive" }), "space exclusive");
must(await sb.from("venue_structures").insert({ workspace_id: WS, venue_id: venue.id, version: 1, status: "published", published_at: iso(NOW - 30 * D), elements: [
  { type: "room", id: "main-hall", label: "Main Hall", x: 40, y: 40, w: 400, h: 240, space: spaces["Main Hall"].id },
  { type: "room", id: "suite", label: "Riverside Suite", x: 460, y: 40, w: 200, h: 130, space: spaces["Riverside Suite"].id },
  { type: "room", id: "studio", label: "Studio Space", x: 460, y: 190, w: 200, h: 130, space: spaces["Studio Space"].id },
  { type: "room", id: "rooftop", label: "Rooftop Terrace", x: 680, y: 40, w: 180, h: 130, space: spaces["Rooftop Terrace"].id },
  { type: "room", id: "gardens", label: "Grounds & Gardens", x: 680, y: 190, w: 180, h: 180, space: spaces["Grounds & Gardens"].id },
  { type: "stage", label: "Fixed stage", x: 60, y: 56, w: 150, h: 40, locked: true },
  { type: "bar", label: "Main bar", x: 330, y: 232, w: 96, h: 34, locked: true },
  { type: "exit", label: "Fire exit A", x: 40, y: 262, w: 10, h: 30, protected: true }, { type: "exit", label: "Fire exit B", x: 650, y: 290, w: 10, h: 30, protected: true },
  { type: "entrance", label: "Main entrance", x: 210, y: 280, w: 60, h: 10 }, { type: "loading", label: "Loading bay", x: 460, y: 330, w: 90, h: 34, locked: true },
  { type: "toilets", label: "Toilets", x: 560, y: 330, w: 90, h: 34, locked: true },
  { type: "accessible_route", label: "Step-free route", points: [[240, 290], [240, 380], [610, 380], [610, 364]] },
  { type: "water", label: "River Thames", x: 0, y: 400, w: 900, h: 56 },
] }), "structure");

const pkgs = [
  { listing_id: venue.id, name: "Wedding Package", status: "published", description: "Exclusive use of the Main Hall for your ceremony and reception — tables, linen, staging, PA and an on-site coordinator, ready for in-house or approved catering.", base_price: 5500, price_basis: "fixed", min_guests: 50, max_guests: 200, duration_hours: 12, deposit_pct: 30, booking_mode: "request", inclusions: ["Exclusive use of Main Hall", "Tables, chairs, linen and basic décor", "Stage, PA system and microphones", "Standard lighting and dance floor", "On-site event coordinator"],
    add_ons: [{ name: "In-house Catering", desc: "From £35 pp", price: 35, enabled: true }, { name: "Premium Bar Package", desc: "From £25 pp", price: 25, enabled: true }, { name: "Evening DJ Package", desc: "6 hours", price: 600, enabled: true }, { name: "Extra Hour", desc: "Per hour", price: 500, enabled: true }],
    space_ids: [spaces["Main Hall"].id], image: img("hero-wedding"), details: { event_type: "Weddings", suitable_for: "All ages", gallery: ["hero-wedding-b", "v-grand-hall", "v-harper", "ev-rooftop", "v-riverside-events-centre"].map(img),
      items: [{ kind: "space", ref: spaces["Main Hall"].id, name: "Main Hall", sub: "Riverside Arena • 400 capacity" }, { kind: "equipment", ref: null, name: "Stage, PA system and microphones", sub: "Included" }, { kind: "equipment", ref: null, name: "Standard lighting and dance floor", sub: "Included" }, { kind: "staff", ref: null, name: "On-site event coordinator", sub: "Throughout the event" }],
      features: ["Access from 3 hours before the event", "Basic cleaning after the event"],
      excluded: ["Catering (available as add-on)", "Bar (available as add-on)", "Additional décor or theming", "External suppliers (must be approved)", "Extended hours (available as add-on)", "Security (can be added)", "Live entertainment (can be added)"],
      restrictions: { age: null, event_types: "Weddings, Civil Ceremonies, Receptions" }, holds: { enabled: true, hours: 48 } } },
  { listing_id: venue.id, name: "Corporate Day Delegate", status: "published", description: "Full-day conference rate with AV, refreshments and lunch.", base_price: 65, price_basis: "per_person", min_guests: 20, max_guests: 140, duration_hours: 8, deposit_pct: 25, inclusions: ["Room hire", "AV & Wi-Fi", "Two refreshment breaks", "Working lunch"], space_ids: [spaces["Riverside Suite"].id], image: img("type-corporate"), details: { bookings: 18, revenue: 61200, rating: 4.8 } },
  { listing_id: venue.id, name: "Rooftop Party", status: "published", description: "Evening rooftop hire with bar and DJ booth.", base_price: 2800, price_basis: "fixed", min_guests: 30, max_guests: 120, duration_hours: 5, deposit_pct: 30, inclusions: ["Exclusive terrace hire", "Bar staff", "DJ booth"], space_ids: [spaces["Rooftop Terrace"].id], image: img("ev-rooftop"), details: { bookings: 9, revenue: 25200, rating: 4.7 } },
  { listing_id: venue.id, name: "Garden Festival Hire", status: "draft", description: "Grounds hire for outdoor festivals and fairs.", base_price: 6500, price_basis: "fixed", min_guests: 100, max_guests: 400, duration_hours: 12, deposit_pct: 40, inclusions: ["Grounds hire", "Power", "Site security"], space_ids: [spaces["Grounds & Gardens"].id], image: img("v-oakwood"), details: { bookings: 0, revenue: 0 } },
  ...(dj ? [{ listing_id: dj.id, name: "Wedding DJ — 5 hours", status: "published", description: "DJ, PA, dance-floor lighting and MC.", base_price: 950, price_basis: "fixed", duration_hours: 5, deposit_pct: 25, booking_mode: "instant", inclusions: ["DJ & MC", "PA system", "Dance-floor lighting"], image: img("s-dj-marcus"), details: { bookings: 22, revenue: 20900, rating: 4.9 } },
    { listing_id: dj.id, name: "Corporate Sound Package", status: "paused", description: "Speech PA, playlists and wireless mics.", base_price: 650, price_basis: "fixed", duration_hours: 6, deposit_pct: 25, inclusions: ["PA", "2 wireless mics", "Background playlists"], image: img("s-sound-lighting"), details: { bookings: 7, revenue: 4550 } }] : []),
  ...(catering ? [{ listing_id: catering.id, name: "Gala Dinner Menu", status: "published", description: "Three-course seated dinner with canapé reception.", base_price: 58, price_basis: "per_person", min_guests: 40, max_guests: 300, deposit_pct: 30, inclusions: ["Canapés", "3 courses", "Service staff"], image: img("s-gourmet"), details: { bookings: 15, revenue: 52200, rating: 4.9 } }] : []),
];
for (const [i, p] of pkgs.entries()) must(await sb.from("packages").insert({ ...p, workspace_id: WS, created_at: at(-20 - i * 6, 11) }), `pkg ${p.name}`);

// ── Team (Phase 2 crew_members) ─────────────────────────────────────────
const crewRows = [
  { name: "Sarah Kim", role: "Event Manager", member_type: "member", status: "available", avatar: img("av-ava-thompson"), skills: ["Weddings", "Client liaison", "Run sheets"], day_rate: 260, location: "London SE1", email: "sarah.kim@riverside-arena.example.com" },
  { name: "Marcus Hill", role: "Venue Operations", member_type: "member", status: "available", avatar: img("av-ryan-brooks"), skills: ["Setup", "Health & safety", "Licensing"], day_rate: 230, location: "London SE16", email: "marcus.hill@riverside-arena.example.com" },
  { name: "Elena Rodriguez", role: "Catering Lead", member_type: "member", status: "on_event", avatar: img("av-isabella-garcia"), skills: ["Menus", "Allergens", "Food safety L3"], day_rate: 240, location: "London E1", email: "elena.r@riverside-arena.example.com" },
  { name: "Devon Carter", role: "Sales Manager", member_type: "member", status: "available", avatar: img("av-noah-evans"), skills: ["Quotes", "Corporate"], day_rate: 250, location: "London SE1", email: "devon.c@riverside-arena.example.com" },
  { name: "Priya Shah", role: "Event Coordinator", member_type: "member", status: "available", avatar: img("av-isabella-garcia"), skills: ["Weddings", "Suppliers", "BEO"], day_rate: 210, location: "London SE11", email: "priya.shah@riverside-arena.example.com", bio: "Coordinates weddings and private events end-to-end, from site visits to final BEO sign-off." },
  { name: "Liam Patel", role: "AV Technician", member_type: "crew", status: "available", avatar: img("av-liam-patel"), skills: ["Sound", "Lighting", "Streaming"], day_rate: 220, location: "London N1" },
  { name: "Chloe Roberts", role: "Bar Supervisor", member_type: "crew", status: "unavailable", avatar: img("av-chloe-roberts"), skills: ["Bar", "Personal licence"], day_rate: 180, location: "London SE5" },
  { name: "Mia Chen", role: "Front of House", member_type: "crew", status: "available", avatar: img("av-mia-chen"), skills: ["Guest services", "Accreditation"], day_rate: 160, location: "London E14" },
];
const crew = {};
for (const c of crewRows) crew[c.name] = must(await sb.from("crew_members").insert({ ...c, workspace_id: WS }).select().single(), `crew ${c.name}`);

// ── Marketplace requests (Phase 2 events + provider_requests + build_items) ──
const opp = [
  { event: "Summer Wedding Reception", type: "wedding", client: "Sarah M.", org: "Private", days: 62, start: 16, end: 23.5, guests: 250, space: "Main Hall", scope: "Wedding reception", detail: "Dinner, DJ, bar", min: 4000, max: 6000, due: 1.6, status: "sent", cover: img("hero-wedding"), loc: "Riverside, London" },
  { event: "Corporate Conference", type: "corporate", client: "James L.", org: "Acme Corp", days: 39, start: 9, end: 17, guests: 120, space: "Riverside Suite", scope: "Full day conference", detail: "AV, catering, breakout", min: 3500, max: 5500, due: 2.25, status: "sent", cover: img("type-corporate"), loc: "Canary Wharf, London" },
  { event: "Product Launch Event", type: "corporate", client: "Priya K.", org: "Nova Tech", days: 54, start: 18, end: 22, guests: 300, space: "Main Hall", scope: "Stage, lighting, AV", detail: "Full production", min: 6000, max: 8000, due: 3.33, status: "sent", quoteRequested: true, cover: img("oe-creators"), loc: "London" },
  { event: "Birthday Party", type: "birthday", client: "Daniel R.", org: "Private", days: 48, start: 19, end: 23.5, guests: 80, space: "Rooftop Terrace", scope: "Private party", detail: "DJ, bar, late licence", min: 2000, max: 3000, due: 5.17, status: "sent", cover: img("type-birthday"), loc: "Shoreditch, London" },
  { event: "Film Shoot", type: "production", client: "MediaCo", org: "Production", days: 33, start: 8, end: 20, guests: 100, space: "Studio Space", scope: "Filming (1 day)", detail: "Prep, power, parking", min: 1500, max: 2500, due: 6.75, status: "sent", cover: img("v-east-london-warehouse"), loc: "Hackney, London" },
  { event: "Last Minute Wedding", type: "wedding", client: "Emma T.", org: "Private", days: 3, start: 12, end: 23, guests: 250, space: "Main Hall", scope: "Ceremony + reception", detail: "Short notice", min: 4500, max: 7000, due: 0.8, status: "sent", emergency: true, cover: img("hero-wedding-b"), loc: "London" },
  { event: "Corporate Away Day", type: "corporate", client: "Oliver S.", org: "BrightPath Ltd", days: 63, start: 9, end: 16, guests: 200, space: "Grounds & Gardens", scope: "Team building day", detail: "Catering, activities", min: 3000, max: 4500, due: 26, status: "sent", cover: img("v-oakwood"), loc: "Surrey" },
  { event: "Live Music Night", type: "concert", client: "Neon Events", org: "Promoter", days: 43, start: 19, end: 25, guests: 400, space: "Main Hall", scope: "Live band event", detail: "Stage, sound, lighting", min: 5000, max: 9000, due: 29, status: "sent", cover: img("ev-neon"), loc: "London" },
  // Quotes sent
  { event: "Charity Gala Dinner", type: "gala", client: "Hope Trust", org: "Charity", days: 70, start: 18, end: 23, guests: 220, space: "Main Hall", scope: "Gala dinner", detail: "3 courses, AV", min: 9000, max: 12000, due: -2, status: "quoted", quote: 10850, cover: img("oe-music-awards"), loc: "London" },
  { event: "Tech Meetup", type: "corporate", client: "DevGuild", org: "Community", days: 25, start: 18, end: 21.5, guests: 90, space: "Riverside Suite", scope: "Evening talks", detail: "AV, pizza", min: 1200, max: 2000, due: -1, status: "quoted", quote: 1680, cover: img("oe-global-tech"), loc: "London" },
  { event: "Engagement Party", type: "party", client: "Aisha B.", org: "Private", days: 51, start: 19, end: 24, guests: 110, space: "Rooftop Terrace", scope: "Evening party", detail: "Bar, canapés", min: 3000, max: 4200, due: -3, status: "quoted", quote: 3640, cover: img("me-garden"), loc: "London" },
  { event: "Wedding DJ — Thompson", type: "wedding", client: "Alex T.", org: "Private", days: 88, start: 19, end: 24, guests: 140, listing: "dj", scope: "Wedding DJ & MC", detail: "5 hours", min: 800, max: 1200, due: -1.5, status: "quoted", quote: 1140, cover: img("s-dj-marcus"), loc: "Surrey" },
  // Conditional holds
  { event: "Autumn Wedding", type: "wedding", client: "Grace & Tom", org: "Private", days: 120, start: 13, end: 23.5, guests: 180, space: "Main Hall", scope: "Ceremony + reception", detail: "Package", min: 15000, max: 19000, due: -4, status: "held", quote: 17100, holdHours: 30, cover: img("me-wedding"), loc: "London" },
  { event: "Board Offsite", type: "corporate", client: "Kite Capital", org: "Corporate", days: 30, start: 9, end: 17, guests: 40, space: "Riverside Suite", scope: "Board day", detail: "Lunch", min: 2200, max: 3000, due: -2, status: "held", quote: 2600, holdHours: 9, cover: img("type-corporate"), loc: "London" },
  // Emergency
  { event: "Replacement Caterer — Gala", type: "gala", client: "Neon Events", org: "Organizer", days: 1, start: 18, end: 23, guests: 160, listing: "catering", scope: "Emergency catering", detail: "Original supplier cancelled", min: 7000, max: 9500, due: 0.55, status: "sent", emergency: true, cover: img("s-gourmet"), loc: "London" },
  { event: "Backup DJ — Corporate Party", type: "party", client: "BrightPath Ltd", org: "Corporate", days: 2, start: 20, end: 24, guests: 200, listing: "dj", scope: "Standby DJ", detail: "Backup cover", min: 600, max: 900, due: 3.5, status: "sent", emergency: true, role: "backup", cover: img("s-sound-lighting"), loc: "London" },
  // Expired (unanswered — never "declined")
  { event: "Spring Networking", type: "corporate", client: "City Chamber", org: "Association", days: 20, start: 18, end: 21, guests: 120, space: "Riverside Suite", scope: "Networking evening", detail: "Drinks", min: 1500, max: 2200, due: -5, status: "expired", cover: img("oe-community-fair"), loc: "London" },
];
const listingFor = o => o.listing === "dj" ? dj : o.listing === "catering" ? catering : venue;
const items = {};
for (const o of opp) {
  const L = listingFor(o); if (!L) continue;
  const ev = must(await sb.from("events").insert({ owner_id: U.requests, management: "consumer", name: o.event, event_type: o.type, visibility: "private", status: "planning",
    starts_at: at(o.days, o.start), ends_at: iso(new Date(at(o.days, o.start)).getTime() + (o.end - o.start) * H), venue_name: o.listing ? "" : "Riverside Arena",
    location: o.loc, city: "London", guest_count: o.guests, cover_image: o.cover, client_name: o.client, budget_total: o.max, description: `${o.scope}. ${o.detail}.`,
    settings: { requester_org: o.org, demo: true } }).select().single(), `event ${o.event}`);
  const req = must(await sb.from("provider_requests").insert({ reference: `R-${(Object.keys(items).length + 2301)}`, event_id: ev.id, created_by: U.requests, category: L.kind === "venue" ? "venue" : (o.listing === "dj" ? "dj" : "catering"),
    title: `${o.scope} — ${o.event}`, scope: `${o.scope}. ${o.detail}.`, requirements: { space: o.space ?? null, space_id: o.space ? spaces[o.space].id : null, guests: o.guests, layout: o.type === "corporate" ? "theatre" : "banquet", quote_requested: !!o.quoteRequested, setup: "2 hours before doors", access: "Loading bay via Riverside Walk" },
    budget_min: o.min, budget_max: o.max, response_hours: o.emergency ? 2 : 8, response_deadline: iso(NOW + o.due * H), hold_strategy: o.status === "held" ? "conditional" : "none", hold_hours: o.holdHours ?? null, emergency: !!o.emergency, status: "sent" }).select().single(), `req ${o.event}`);
  const bi = must(await sb.from("build_items").insert({ event_id: ev.id, request_id: req.id, listing_id: L.id, category: req.category, title: L.name, package: o.space ?? o.scope, scope: req.scope, image: o.cover,
    status: "sent", role: o.role ?? "primary", response_deadline: iso(NOW + o.due * H), notes: "",
    created_at: o.due > 0 && o.due < 30 ? iso(NOW - (Object.keys(items).length % 5 + 0.5) * H - (o.due < 3 ? 0 : (Object.keys(items).length % 4) * D)) : iso(NOW - (6 + Object.keys(items).length * 3) * D) }).select().single(), `item ${o.event}`);
  items[o.event] = { ...bi, event: ev, request: req, o, L };
}
// Quotes (versioned) and holds — written as the provider would via provider_issue_quote.
let qn = 4100;
for (const it of Object.values(items)) {
  const { o } = it;
  if (!o.quote) continue;
  const lines = it.L.kind === "venue"
    ? [{ label: `${o.space} hire`, qty: Math.round(o.end - o.start), unit: "hours", unit_price: spaces[o.space].rate_hourly, kind: "space" }, { label: "Event staffing", qty: 1, unit: "package", unit_price: Math.max(0, Math.round(o.quote / 1.2 - Math.round(o.end - o.start) * spaces[o.space].rate_hourly)), kind: "staff" }]
    : [{ label: o.scope, qty: 1, unit: "package", unit_price: Math.round(o.quote / 1.2), kind: "service" }];
  const sub = lines.reduce((a, l) => a + l.qty * l.unit_price, 0), tax = Math.round(sub * 0.2 * 100) / 100;
  if (it.o.event === "Charity Gala Dinner") {
    must(await sb.from("provider_quotes").insert({ workspace_id: WS, build_item_id: it.id, reference: `Q-${qn}`, version: 1, status: "superseded", items: lines.map(l => ({ ...l, unit_price: Math.round(l.unit_price * 1.08) })),
      subtotal: Math.round(sub * 1.08), tax: Math.round(sub * 1.08 * 0.2), total: Math.round(sub * 1.08 * 1.2), deposit_pct: 30, valid_until: at(14).slice(0, 10), sent_at: iso(NOW - 4 * D), created_by: providerUser.id, terms: { cancellation: "7+ days: 100% refund" } }), "q v1");
  }
  const q = must(await sb.from("provider_quotes").insert({ workspace_id: WS, build_item_id: it.id, reference: `Q-${qn++}`, version: it.o.event === "Charity Gala Dinner" ? 2 : 1, status: "sent", items: lines, subtotal: sub, tax, total: sub + tax,
    deposit_pct: 30, valid_until: at(14).slice(0, 10), message: `Thanks for considering Riverside Arena for ${o.event}. Quote attached — happy to tailor.`, sent_at: iso(NOW - 1.5 * D), created_by: providerUser.id,
    terms: { tax_bps: 2000, cancellation: [{ window: "7+ days", refund: 100 }, { window: "3–7 days", refund: 50 }, { window: "<3 days", refund: 0 }], exclusions: ["Security staff", "Extended licence after 00:00"], hold: o.status === "held" ? { hours: 48 } : null } }).select().single(), "quote");
  must(await sb.from("build_items").update({ status: "quoted", amount: sub + tax, deposit: Math.round((sub + tax) * 0.3), price_basis: "quote", quote: { quote_id: q.id, reference: q.reference, version: q.version, total: sub + tax, items: lines } }).eq("id", it.id), "mirror quote");
  if (o.status === "held") must(await sb.from("build_items").update({ status: "held", hold_expires_at: iso(NOW + o.holdHours * H) }).eq("id", it.id), "hold");
}
// An open draft revision (for the review step) on a request that already has a sent quote.
{ const it = items["Engagement Party"]; const sent = it && must(await sb.from("provider_quotes").select("*").eq("build_item_id", it.id).eq("status", "sent").single(), "eng sent");
  const draftItems = [...(sent?.items ?? []), { label: "Canapé reception", detail: "6 canapés per guest", qty: 110, unit: "guests", unit_price: 9, kind: "custom" }, { label: "Travel / delivery", detail: "", qty: 1, unit: "fixed", unit_price: 150, kind: "travel" }];
  const dSub = draftItems.reduce((a, l) => a + l.qty * l.unit_price, 0), dTax = Math.round(dSub * 20) / 100;
  if (sent) must(await sb.from("provider_quotes").insert({ workspace_id: WS, build_item_id: it.id, reference: sent.reference, version: sent.version + 1, status: "draft",
    items: draftItems, subtotal: dSub, tax: dTax, total: dSub + dTax, deposit_pct: 30, valid_until: at(14).slice(0, 10), created_by: providerUser.id,
    terms: { tax_bps: 2000, cancellation: [{ window: "30+ days", refund: 100 }, { window: "15–30 days", refund: 50 }, { window: "7–14 days", refund: 25 }, { window: "<7 days", refund: 0 }], hold_offer: true, hold_hours: 24 },
    message: "" }), "eng draft"); }
for (const it of Object.values(items)) if (it.o.status === "expired") must(await sb.from("build_items").update({ status: "expired" }).eq("id", it.id), "expire");

// ── Bookings: marketplace confirmations (trigger creates provider_jobs) + direct bookings ──
const bk = [
  { event: "Summer Wedding Reception", client: "Sarah & James", org: "Private", type: "wedding", days: 50, start: 16, end: 23.5, guests: 250, space: "Main Hall", value: 6000, paid: 0.5, next: "Confirm final numbers", nextDays: 2, staff: ["Sarah Kim", "Marcus Hill", "Elena Rodriguez", "Mia Chen", "Liam Patel"], cover: img("hero-wedding"), loc: "Riverside, London" },
  { event: "Corporate Conference", client: "Acme Corp", org: "Acme Corp", type: "corporate", days: 27, start: 9, end: 17, guests: 120, space: "Riverside Suite", value: 4500, paid: 1, next: "Review catering plan", nextDays: 4, staff: ["Devon Carter", "Liam Patel", "Mia Chen", "Priya Shah", "Marcus Hill", "Chloe Roberts", "Sarah Kim"], cover: img("type-corporate"), loc: "Canary Wharf, London" },
  { event: "Product Launch Event", client: "Nova Tech", org: "Nova Tech", type: "corporate", days: 42, start: 18, end: 22, guests: 300, service: "catering", value: 5200, paid: 0.3, next: "Confirm menu", nextDays: 5, staff: ["Elena Rodriguez", "Chloe Roberts", "Mia Chen", "Priya Shah"], cover: img("oe-creators"), loc: "London" },
  { event: "Birthday Party", client: "Private Client", org: "Private", type: "birthday", days: 36, start: 15, end: 23, guests: 80, space: "Rooftop Terrace", value: 3000, paid: 0.3, deposit: true, next: "Assign security", nextDays: 6, staff: ["Mia Chen", "Chloe Roberts"], cover: img("type-birthday"), loc: "Shoreditch, London" },
  { event: "Film Shoot", client: "MediaCo", org: "MediaCo", type: "production", days: 0, start: 8, end: 20, guests: 100, space: "Studio Space", value: 4000, paid: 0.5, status: "active", next: "Check-in with client", nextDays: 0, staff: ["Marcus Hill", "Liam Patel", "Mia Chen", "Devon Carter", "Sarah Kim", "Priya Shah"], cover: img("v-east-london-warehouse"), loc: "Hackney, London" },
  { event: "Last Minute Wedding", client: "Emma & Lee", org: "Private", type: "wedding", days: 1, start: 12, end: 23, guests: 250, space: "Main Hall", value: 7500, paid: 1, status: "active", next: "Event day checklist", nextDays: 1, staff: ["Sarah Kim", "Elena Rodriguez", "Priya Shah", "Liam Patel", "Mia Chen", "Chloe Roberts", "Devon Carter", "Marcus Hill"], cover: img("hero-wedding-b"), loc: "London", source: "emergency" },
  { event: "Corporate Away Day", client: "BrightPath Ltd", org: "BrightPath Ltd", type: "corporate", days: 63, start: 9, end: 16, guests: 100, service: "catering", value: 3800, paid: 0.3, next: "Review equipment", nextDays: 7, staff: ["Elena Rodriguez", "Mia Chen", "Devon Carter"], cover: img("v-oakwood"), loc: "Surrey" },
  { event: "Live Music Night", client: "Neon Events", org: "Neon Events", type: "concert", days: 43, start: 19, end: 25, guests: 400, service: "dj", value: 4200, paid: 0.5, next: "Finalise rider", nextDays: 7, staff: ["Liam Patel", "Marcus Hill"], cover: img("ev-neon"), loc: "London" },
  { event: "Charity Auction", client: "Hope Trust", org: "Charity", type: "gala", days: 75, start: 18, end: 23, guests: 180, space: "Main Hall", value: 8200, paid: 0.3, next: "Send BEO draft", nextDays: 14, staff: ["Sarah Kim"], cover: img("oe-music-awards"), loc: "London" },
  { event: "Quarterly Town Hall", client: "Kite Capital", org: "Kite Capital", type: "corporate", days: 90, start: 9, end: 13, guests: 120, space: "Riverside Suite", value: 2400, paid: 0, next: "Collect deposit", nextDays: 10, staff: [], cover: img("oe-global-tech"), loc: "London" },
  { event: "Garden Social", client: "Riverside Residents", org: "Association", type: "party", days: 100, start: 12, end: 18, guests: 150, space: "Grounds & Gardens", value: 3600, paid: 0.3, next: "Confirm marquee", nextDays: 21, staff: ["Marcus Hill"], cover: img("me-garden"), loc: "London" },
  { event: "Rooftop Launch Drinks", client: "Lumen Studio", org: "Lumen Studio", type: "corporate", days: 18, start: 18, end: 22, guests: 90, space: "Rooftop Terrace", value: 3100, paid: 0.3, next: "Confirm bar tab", nextDays: 3, staff: ["Chloe Roberts", "Mia Chen"], cover: img("ev-rooftop"), loc: "London" },
  { event: "Podcast Recording", client: "Soundwave FM", org: "Soundwave FM", type: "production", days: 9, start: 10, end: 16, guests: 20, space: "Studio Space", value: 1500, paid: 1, next: "Send access info", nextDays: 2, staff: ["Liam Patel"], cover: img("v-riverside-conference"), loc: "London" },
  { event: "Anniversary Dinner", client: "The Hendersons", org: "Private", type: "private_dinner", days: 14, start: 19, end: 23, guests: 60, service: "catering", value: 3300, paid: 0.3, next: "Dietary list", nextDays: 6, staff: ["Elena Rodriguez"], cover: img("type-private-dinner"), loc: "London" },
  // Past (completed) + cancelled
  ...Array.from({ length: 10 }, (_, i) => ({ event: ["Spring Wedding", "Sales Kickoff", "Charity Quiz", "Album Launch", "Christening Lunch", "Fashion Shoot", "Alumni Dinner", "Yoga Retreat Day", "Startup Demo Day", "Retirement Party"][i],
    client: ["Holly & Ben", "Acme Corp", "Hope Trust", "Neon Events", "The Okafors", "Vogue Lab", "LSE Alumni", "Calm Co", "Seedcamp", "R. Hughes"][i], org: "Client", type: ["wedding", "corporate", "gala", "concert", "party", "production", "gala", "corporate", "corporate", "party"][i],
    days: -6 - i * 7, start: 12, end: 20, guests: 60 + i * 15, space: ["Main Hall", "Riverside Suite", "Main Hall", "Studio Space", "Rooftop Terrace", "Studio Space", "Main Hall", "Grounds & Gardens", "Riverside Suite", "Rooftop Terrace"][i],
    value: [6800, 4200, 2900, 3500, 1800, 2600, 5400, 2200, 3900, 2100][i], paid: 1, status: "completed", next: "", staff: ["Sarah Kim"], cover: [img("me-wedding"), img("type-corporate"), img("oe-music-awards"), img("ev-neon"), img("me-birthday"), img("v-east-london-warehouse"), img("type-private-dinner"), img("v-oakwood"), img("oe-global-tech"), img("ev-rooftop")][i], loc: "London" })),
  { event: "Summer Barbecue", client: "Pulse Media", org: "Pulse Media", type: "party", days: 22, start: 13, end: 19, guests: 120, space: "Grounds & Gardens", value: 2800, paid: 0, status: "cancelled", cover: img("me-garden"), loc: "London", reason: "Client cancelled 25 days out — full refund under policy (7+ days)." },
  { event: "Board Dinner", client: "Vertex Ltd", org: "Vertex Ltd", type: "private_dinner", days: 11, start: 19, end: 23, guests: 30, service: "catering", value: 1900, paid: 0, status: "cancelled", cover: img("type-private-dinner"), loc: "London", reason: "Event postponed by client; deposit retained per policy." },
];
const jobs = {};
let ref = 7801;
for (const b of bk) {
  const L = b.service === "dj" ? dj : b.service === "catering" ? catering : venue;
  const starts = at(b.days, b.start), ends = iso(new Date(at(b.days, b.start)).getTime() + (b.end - b.start) * H);
  const fee = Math.round(b.value * 0.15 * 100) / 100;
  const paidAmount = Math.round(b.value * b.paid * 100) / 100;
  const row = must(await sb.from("provider_jobs").insert({ reference: `BK-${ref++}`, workspace_id: WS, listing_id: L.id, space_id: b.space ? spaces[b.space].id : null, mode: b.service ? "service" : "venue",
    client_name: b.client, client_org: b.org, client_email: `${b.client.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`, event_name: b.event, event_type: b.type, starts_at: starts, ends_at: ends, guests: b.guests,
    location: b.loc, layout: b.space ? (b.type === "corporate" ? "Theatre" : "Banquet") : "", status: b.status ?? "confirmed", role: "primary", value: b.value, platform_fee: fee, net_payout: b.value - fee, paid_amount: paidAmount,
    payment_status: b.status === "cancelled" ? "refunded" : b.paid >= 1 ? "paid" : b.paid > 0 ? (b.deposit ? "deposit_paid" : "part_paid") : "unpaid", source: b.source ?? (ref % 3 ? "marketplace" : "direct"),
    next_action: b.next ?? "", next_action_due: b.nextDays !== undefined ? at(b.nextDays, 17) : null, image: b.cover,
    created_at: iso(NOW - ((ref * 37) % 58 + 1) * D - ((ref * 13) % 20) * H),
    commercial_snapshot: { value: b.value, commission_bps: 1500, platform_fee: fee, deposit_pct: 30, cancellation: [{ window: "7+ days", refund: 100 }, { window: "3–7 days", refund: 50 }, { window: "<3 days", refund: 0 }], captured_at: iso(NOW - 20 * D) },
    details: b.service ? { deliverables: ["Setup 2h before doors", "Service delivery", "Breakdown"], equipment: b.service === "dj" ? ["CDJ-3000 x2", "PA 4kW", "Wireless mics x2", "Dance-floor lighting"] : ["Hot boxes", "Crockery for " + b.guests, "Service staff"], milestones: [{ label: "Deposit", done: b.paid > 0 }, { label: "Final numbers", done: false }, { label: "Delivery", done: b.status === "completed" }] }
      : { beo: { arrival: "Doors 30 mins before start", setup: "2 hours before doors", breakdown: "60 minutes after close", fnb: b.type === "wedding" ? "3-course dinner + evening buffet" : "Refreshments + lunch", bar: b.type === "corporate" ? "Soft drinks" : "Cash bar + welcome drink", access: "Loading bay via Riverside Walk", compliance: ["Licence until 00:00", "Noise limit 85dB after 23:00"] }, cancellation_reason: b.reason } }).select().single(), `job ${b.event}`);
  jobs[b.event + b.days] = row;
  for (const [i, name] of (b.staff ?? []).entries()) {
    if (b.status === "cancelled") break;
    must(await sb.from("shifts").insert({ workspace_id: WS, crew_id: crew[name].id, job_id: row.id, role: crew[name].role, title: b.event, location: b.loc, starts_at: iso(new Date(starts).getTime() - 2 * H), ends_at: ends, status: i % 4 === 3 ? "pending" : "confirmed" }), "shift");
  }
}
// One marketplace confirmation through the real trigger path (build item → provider job).
const confirmIt = items["Tech Meetup"];
if (confirmIt) must(await sb.from("build_items").update({ status: "confirmed", terms_snapshot: { amount: confirmIt.amount, deposit: confirmIt.deposit, confirmed_at: iso(NOW) } }).eq("id", confirmIt.id), "confirm via trigger");

// Availability blocks & emergency window
must(await sb.from("availability_blocks").insert([
  { workspace_id: WS, space_id: spaces["Main Hall"].id, kind: "maintenance", starts_at: at(5, 8), ends_at: at(5, 18), note: "Floor refinishing" },
  { workspace_id: WS, space_id: spaces["Rooftop Terrace"].id, kind: "blocked", starts_at: at(12, 0), ends_at: at(14, 0), note: "Private owner use" },
  { workspace_id: WS, listing_id: venue.id, kind: "emergency_window", starts_at: at(1, 9), ends_at: at(4, 23), note: "Short-notice availability published" },
  { workspace_id: WS, crew_id: crew["Chloe Roberts"].id, kind: "blocked", starts_at: at(0, 0), ends_at: at(6, 0), note: "Annual leave" },
]), "blocks");

// Today's appointments (canonical calendar_entries; bookings/holds come from their own tables).
must(await sb.from("calendar_entries").insert([
  { workspace_id: WS, layer: "meetings", title: "Venue Setup", detail: "Main Hall · Staff: 3 assigned", starts_at: at(0, 8), ends_at: at(0, 9, 30) },
  { workspace_id: WS, layer: "meetings", title: "Client Venue Tour", detail: "Rooftop Terrace · Sarah & James (25 ppl)", starts_at: at(0, 10), ends_at: at(0, 11) },
  { workspace_id: WS, layer: "meetings", title: "Catering Tasting", detail: "Riverside Kitchen · Acme Corp (4 ppl)", starts_at: at(0, 12), ends_at: at(0, 13) },
  { workspace_id: WS, layer: "meetings", title: "Setup – Private Event", detail: "Studio Space · Event Team", starts_at: at(0, 14), ends_at: at(0, 16) },
  { workspace_id: WS, layer: "meetings", title: "Evening Booking", detail: "Wedding Reception · Main Hall · 120 guests", starts_at: at(0, 17), ends_at: at(0, 23) },
]), "calendar");

// ── Money (Phase 2 transactions ledger, enriched) ─────────────────────────
const tx = [];
for (let d = 59; d >= 0; d--) {
  const n = (d * 7) % 5;
  if (n >= 2) {
    const gross = 900 + ((d * 337) % 2400);
    tx.push({ workspace_id: WS, kind: "income", category: d % 3 ? "Venue hire" : "Services", description: `${d % 3 ? "Booking payment" : "Service balance"} · BK-${7700 + d}`, amount: gross, status: "completed", source: "marketplace", fee_amount: Math.round(gross * 0.15 * 100) / 100,
      net_amount: Math.round(gross * 0.85 * 100) / 100, counterparty: ["Acme Corp", "Sarah & James", "Nova Tech", "MediaCo", "Neon Events"][d % 5], stripe_ref: `pi_demo_${d}`, occurred_at: at(-d, 10 + (d % 8)) });
  }
  if (d % 7 === 2) {
    tx.push({ workspace_id: WS, kind: "payout", category: "Payout", description: `Weekly payout`, amount: -(4200 + d * 31), status: d < 3 ? "pending" : "completed", source: "marketplace", fee_amount: 0, net_amount: -(4200 + d * 31), counterparty: "Barclays ••4821", stripe_ref: `po_demo_${d}`, occurred_at: at(-d, 9) });
  }
}
tx.push({ workspace_id: WS, kind: "refund", category: "Refund", description: "Refund · Summer Barbecue (cancellation policy 7+ days)", amount: -840, status: "completed", source: "marketplace", fee_amount: -126, net_amount: -714, counterparty: "Pulse Media", stripe_ref: "re_demo_1", occurred_at: at(-3, 14) });
tx.push({ workspace_id: WS, kind: "income", category: "Standby fee", description: "Standby commitment fee · Backup DJ", amount: 250, status: "completed", source: "marketplace", fee_amount: 37.5, net_amount: 212.5, counterparty: "BrightPath Ltd", stripe_ref: "pi_demo_sb", occurred_at: at(-1, 11) });
tx.push({ workspace_id: WS, kind: "fee", category: "Subscription", description: "Gala Dock Pro plan · monthly", amount: -79, status: "completed", source: "subscription", fee_amount: 0, net_amount: -79, counterparty: "Gala Dock", occurred_at: at(-8, 6) });
must(await sb.from("transactions").insert(tx), "provider tx");

// ── Messages & notifications ─────────────────────────────────────────────
for (const [name, body] of [["Summer Wedding Reception", "Hi! Could we add 20 more guests for the evening reception?"], ["Product Launch Event", "Can you share the stage dimensions and rigging points?"], ["Last Minute Wedding", "Thank you so much for fitting us in — confirming 250 guests."]]) {
  const it = items[name]; if (!it) continue;
  const th = must(await sb.from("threads").insert({ event_id: it.event.id, listing_id: it.L.id, build_item_id: it.id, kind: "venue", title: name, subtitle: it.o.client, image: it.o.cover, response_due_at: it.response_deadline }).select().single(), "thread");
  must(await sb.from("messages").insert({ thread_id: th.id, sender_id: U.requests, sender_name: it.o.client, from_provider: false, body }), "msg");
}
must(await sb.from("notifications").insert([
  { user_id: providerUser.id, kind: "provider.request", title: "New emergency request", body: "Last Minute Wedding · respond within 48 minutes", link: "/provider/opportunities?tab=emergency" },
  { user_id: providerUser.id, kind: "provider.hold", title: "Hold expiring", body: "Board Offsite hold expires in 9 hours", link: "/provider/opportunities?tab=holds" },
  { user_id: providerUser.id, kind: "provider.payout", title: "Payout scheduled", body: "£18,320 scheduled for Friday", link: "/provider/money?tab=payouts", read_at: iso(NOW - D) },
]), "notes");

// ── Gala Agent (one runtime; provider surface) ────────────────────────────
const runs = [
  { goal: "Confirm final numbers for all bookings in the next 14 days", status: "waiting_external", progress: 60, waiting_reason: "Waiting for 2 client replies", next_wake_at: at(0.25, 15), plan: [{ step: "Find bookings needing numbers", status: "done" }, { step: "Draft confirmation messages", status: "done" }, { step: "Send after approval", status: "done" }, { step: "Wait for replies", status: "waiting" }, { step: "Update BEOs", status: "pending" }], changes: [{ type: "message", record: "Summer Wedding Reception", reversible: false }] },
  { goal: "Prepare quote for Product Launch Event", status: "waiting_approval", progress: 80, waiting_reason: "Quote needs your approval before sending", plan: [{ step: "Analyse requirements", status: "done" }, { step: "Check calendar & capacity", status: "done" }, { step: "Draft quote", status: "done" }, { step: "Send quote", status: "waiting" }] },
  { goal: "Fill short-notice availability this week", status: "running", progress: 35, plan: [{ step: "Find open slots", status: "done" }, { step: "Match emergency requests", status: "running" }, { step: "Propose standby offers", status: "pending" }] },
  { goal: "Chase unpaid deposits", status: "completed", progress: 100, result: "3 reminders sent; 2 deposits received (£2,340).", plan: [{ step: "Find unpaid deposits", status: "done" }, { step: "Send reminders", status: "done" }] },
  { goal: "Weekly utilisation report", status: "completed", progress: 100, result: "Utilisation 68% (+6 pts). Rooftop under-booked on Thursdays.", plan: [{ step: "Aggregate bookings", status: "done" }, { step: "Summarise", status: "done" }] },
  { goal: "Respond to Spring Networking request", status: "failed", progress: 40, errors: [{ step: "Respond", error: "Request expired before approval" }], plan: [{ step: "Draft reply", status: "done" }, { step: "Respond", status: "failed" }] },
  { goal: "Post-event review requests (last month)", status: "cancelled", progress: 20, plan: [{ step: "Collect completed bookings", status: "done" }, { step: "Send review requests", status: "cancelled" }] },
];
const runRows = [];
for (const [i, r] of runs.entries()) runRows.push(must(await sb.from("agent_runs").insert({ workspace_id: WS, user_id: providerUser.id, surface: "provider", scope: ["opportunities", "quotes", "bookings", "team", "money"], goal: r.goal, status: r.status, progress: r.progress,
  plan: r.plan, waiting_reason: r.waiting_reason ?? "", next_wake_at: r.next_wake_at ?? null, result: r.result ?? "", errors: r.errors ?? [], changes: r.changes ?? [], cost_cents: 12 + i * 7,
  idempotency_key: `demo-provider-run-${i}`, created_at: iso(NOW - (i + 1) * 9 * H), finished_at: ["completed", "failed", "cancelled"].includes(r.status) ? iso(NOW - i * 7 * H) : null }).select().single(), "run"));
must(await sb.from("agent_approvals").insert([
  { run_id: runRows[1].id, workspace_id: WS, title: "Send quote Q-4108 to Nova Tech", detail: "Product Launch Event · Main Hall · 300 guests", action: "send_quote", payload: { total: 7680, deposit_pct: 30 }, impact: "Commits Main Hall pricing; creates a sent quote version", amount: 7680, status: "pending", expires_at: at(1, 12) },
  { run_id: runRows[0].id, workspace_id: WS, title: "Message 4 clients about final numbers", detail: "Bookings in the next 14 days", action: "send_messages", payload: { recipients: 4 }, impact: "4 client messages", status: "pending", expires_at: at(0.5, 18) },
  { run_id: runRows[3].id, workspace_id: WS, title: "Send deposit reminders", detail: "3 bookings", action: "send_messages", impact: "3 client messages", status: "approved", decided_by: providerUser.id, decided_at: iso(NOW - 2 * D) },
]), "approvals");
must(await sb.from("agent_routines").insert([
  { workspace_id: WS, title: "Morning readiness check", detail: "Every day at 08:00 — summarise today’s bookings, staffing gaps and unpaid balances.", schedule: "Daily 08:00", enabled: true, next_run_at: at(1, 8), last_run_at: at(0, 8), last_result: "2 staffing gaps flagged", approval_policy: "notify" },
  { workspace_id: WS, title: "Response SLA monitor", detail: "Every 30 minutes — alert when a request is within 1 hour of its response deadline.", schedule: "Every 30 min", enabled: true, next_run_at: iso(NOW + 0.4 * H), last_run_at: iso(NOW - 0.1 * H), last_result: "1 request due within the hour", approval_policy: "notify" },
  { workspace_id: WS, title: "48-hour pre-event checks", detail: "Two days before each booking — confirm numbers, access and crew.", schedule: "48h before events", enabled: true, next_run_at: at(1, 9), last_result: "Checklist sent for Film Shoot", approval_policy: "required" },
  { workspace_id: WS, title: "Post-event review requests", detail: "Day after completion — request a review from the client.", schedule: "Day after event", enabled: false, last_result: "Paused by Jordan", approval_policy: "required" },
  { workspace_id: WS, title: "Weekend price optimisation", detail: "Suggest weekend rate changes from demand.", schedule: "Weekly Monday", enabled: false, suggested: true, approval_policy: "required" },
]), "routines");

// ══════════════════════ Platform Admin fixtures ══════════════════════
const allWs = must(await sb.from("workspaces").select("id,name,kind"), "all ws");
const anyWs = name => allWs.find(w => w.name === name)?.id ?? null;
const cases = [
  ["Refund request – Order #7842", "refund", "high", "open", "sarah", 2, 312.5],
  ["Account access issue", "account", "high", "open", "marcus", 4],
  ["Event publishing error", "technical", "medium", "open", "priya", 6],
  ["Payout not received", "payment", "medium", "waiting", "daniel", 24],
  ["Feature request – bulk invite", "other", "low", "open", "sophie", 26],
  ["Provider no-show – Elite Security", "no_show", "urgent", "escalated", "oliver", 3],
  ["Emergency replacement DJ needed", "emergency", "urgent", "escalated", "liam", 1],
  ["Duplicate ticket charge", "ticketing", "high", "waiting", "emma", 30],
  ["Booking date change request", "booking", "medium", "open", "sarah", 9],
  ["Ticket transfer not received", "ticketing", "medium", "resolved", "sophie", 72],
  ["Invoice VAT question", "payment", "low", "resolved", "daniel", 96],
  ["Venue double-booked", "booking", "high", "resolved", "priya", 120],
];
for (const [i, [subject, category, priority, status, who, hoursAgo, amount]] of cases.entries()) {
  const c = must(await sb.from("support_cases").insert({ reference: `D-${7842 - i * 7}`, subject, category, priority, status, requester_id: U[who], requester_name: PEOPLE[who].name,
    workspace_id: ["no_show", "emergency", "booking"].includes(category) ? WS : null, assignee_id: i % 3 ? U.support : null, assignee_name: i % 3 ? "Rachel Adams" : "",
    sla_due_at: iso(NOW - hoursAgo * H + (priority === "urgent" ? 2 : priority === "high" ? 8 : 24) * H), amount: amount ?? null,
    related: { order: category === "refund" || category === "ticketing" ? `#BK-${7842 - i}` : null, booking: ["booking", "no_show", "emergency"].includes(category) ? Object.values(jobs)[i % 5]?.reference : null },
    outcome: status === "resolved" ? "Issue resolved and customer confirmed." : null, resolution_reason: status === "resolved" ? "Root cause fixed; no further action required." : null,
    created_at: iso(NOW - hoursAgo * H), resolved_at: status === "resolved" ? iso(NOW - (hoursAgo - 10) * H) : null }).select().single(), `case ${subject}`);
  must(await sb.from("support_messages").insert([
    { case_id: c.id, author_id: U[who], author: PEOPLE[who].name, body: `Hi team — ${subject.toLowerCase()}. Can you help?`, created_at: iso(NOW - hoursAgo * H) },
    ...(i % 3 ? [{ case_id: c.id, author_id: U.support, author: "Rachel Adams", body: "Thanks — looking into this now and will update you shortly.", created_at: iso(NOW - (hoursAgo - 0.5) * H) },
      { case_id: c.id, author_id: U.support, author: "Rachel Adams", body: "Checked Stripe: payment captured; refund eligible under event policy.", internal: true, created_at: iso(NOW - (hoursAgo - 0.7) * H) }] : []),
  ]), "case msgs");
}
const trust = [
  ["verification", "Identity", "workspace", WS, "Riverside Arena", 18, "open", "Annual re-verification due (company documents)"],
  ["verification", "Identity", "user", U.daniel, "Daniel Kim", 42, "open", "Identity documents unverified"],
  ["verification", "Listing", "listing", venue.id, "Riverside Arena — Main Hall", 22, "in_review", "Capacity evidence requested"],
  ["reliability", "Repeated cancellations", "user", U.marcus, "Lee Productions", 81, "open", "3 provider cancellations in 30 days"],
  ["reliability", "No response", "workspace", anyWs("Premier Event Services"), "Premier Event Services", 64, "open", "No-response rate 38% (threshold 25%)"],
  ["reliability", "No-show", "workspace", anyWs("London Venue Collective"), "Elite Security", 88, "open", "Provider no-show on confirmed booking"],
  ["fraud", "Inappropriate content", "listing", null, "Night Owl Lounge", 55, "open", "Reported imagery in listing gallery"],
  ["fraud", "Fraudulent activity", "user", U.emma, "Emma Carter", 93, "open", "Card testing pattern on ticket checkout"],
  ["fraud", "Fraudulent activity", "event", null, "Free Rave Weekend", 90, "open", "Event copies a published festival; payouts to new account"],
  ["fraud", "Review abuse", "review", null, "Review cluster — Pulse Nightclub", 61, "in_review", "12 five-star reviews from new accounts in 24h"],
  ["fraud", "Policy violation", "listing", null, "Party Bus Express", 47, "open", "Missing operator licence"],
  ["fraud", "Harassment", "user", U.liam, "Liam Wilson", 58, "open", "Abusive messages reported by provider"],
  ["fraud", "Copyright/IP", "event", null, "Tribute Night Poster", 35, "open", "Unlicensed artwork"],
  ["appeal", "Appeal", "listing", null, "Party Bus Express", 30, "open", "Provider appeals restriction with new licence"],
  ["fraud", "Inappropriate content", "listing", null, "Afterhours Club", 20, "actioned", "Images removed"],
  ["reliability", "Repeated cancellations", "workspace", null, "Sparkle Decor", 40, "dismissed", "Cancellations due to venue closure — not provider fault"],
];
for (const [i, [queue, category, subject_type, subject_id, subject_name, risk, status, reason]] of trust.entries()) {
  must(await sb.from("trust_cases").insert({ reference: `D-T${3100 + i}`, queue, category, subject_type, subject_id, subject_name, risk_score: risk, status, reason,
    evidence: [{ kind: "signal", label: reason, at: iso(NOW - (i + 2) * 5 * H) }, { kind: "metric", label: `Risk factors: ${risk >= 80 ? "velocity, new account, mismatch" : risk >= 50 ? "history, reports" : "document expiry"}` }],
    decision: ["actioned", "dismissed"].includes(status) ? reason : null, decided_by: ["actioned", "dismissed"].includes(status) ? U.admin : null,
    created_at: iso(NOW - (i + 1) * 7 * H) }), "trust");
}
must(await sb.from("partners").insert([
  { name: "EventPro Network", kind: "affiliate", status: "active", referral_code: "DEMO-EVENTPRO", commission_bps: 1000, referrals: 184, eligible_revenue: 48200, earned: 4820, paid: 3900, quality_score: 92, logo: img("logo-organizer") },
  { name: "Venue Finder UK", kind: "affiliate", status: "active", referral_code: "DEMO-VFUK", commission_bps: 1200, referrals: 126, eligible_revenue: 31800, earned: 3816, paid: 3816, quality_score: 88 },
  { name: "Wedding Hub", kind: "affiliate", status: "paused", referral_code: "DEMO-WHUB", commission_bps: 800, referrals: 64, eligible_revenue: 9400, earned: 752, paid: 600, quality_score: 54, details: { pause_reason: "Self-referral pattern under review" } },
  { name: "CityGuide Media", kind: "strategic", status: "active", referral_code: "DEMO-CITYG", commission_bps: 500, commission_basis: "subscription_revenue", referrals: 302, eligible_revenue: 61200, earned: 3060, paid: 2400, quality_score: 95 },
  { name: "Student Union Events", kind: "affiliate", status: "pending", referral_code: "DEMO-SUE", commission_bps: 1000, referrals: 0, eligible_revenue: 0, earned: 0, paid: 0 },
  { name: "TechMeetups.io", kind: "strategic", status: "active", referral_code: "DEMO-TMIO", commission_bps: 700, referrals: 88, eligible_revenue: 15400, earned: 1078, paid: 900, quality_score: 81 },
]), "partners");
must(await sb.from("integrations").insert([
  { name: "Gala Agent", category: "agent", status: "healthy", metrics: { label: "2.4K actions (24h)", runs_24h: 2400, failures_24h: 12, p95_ms: 4200 } },
  { name: "Stripe", category: "payments", status: "healthy", metrics: { label: "£128,340 processed", webhooks_24h: 8120, failures_24h: 3 } },
  { name: "Stripe Connect", category: "payments", status: "healthy", metrics: { label: "412 payouts (7d)", failures_7d: 28 } },
  { name: "Eventbrite", category: "sync", status: "healthy", metrics: { label: "1,240 events synced" } },
  { name: "Google Calendar", category: "calendar", status: "healthy", metrics: { label: "1.2K syncs (24h)" } },
  { name: "Zapier", category: "automation", status: "degraded", metrics: { label: "420 tasks (24h)", error_rate: 0.06 } },
  { name: "Slack", category: "messaging", status: "healthy", metrics: { label: "982 notifications" } },
  { name: "Zoom", category: "meetings", status: "healthy", metrics: { label: "426 meetings created" } },
  { name: "Salesforce", category: "crm", status: "healthy", metrics: { label: "1,204 leads synced" } },
  { name: "Resend Email", category: "email", status: "healthy", metrics: { label: "18.2K emails (24h)", bounce_rate: 0.004 } },
  { name: "Mapbox", category: "maps", status: "down", metrics: { label: "Tile errors since 09:40", error_rate: 0.41 } },
]), "integrations");
const settings = {
  general: { platform_name: "Gala Dock", support_email: "support@galadock.com", default_currency: "GBP", default_locale: "en-GB", timezone: "Europe/London" },
  commerce: { plans: { starter: { commission_bps: 1500, monthly: 0 }, pro: { commission_bps: 1200, monthly: 79 }, business: { commission_bps: 900, monthly: 199 } }, ticket_fee: { pct_bps: 500, fixed: 0.49 }, payout_schedule: "weekly" },
  marketplace: { response_windows_hours: [2, 4, 8, 12, 24], default_response_hours: 8, hold_max_hours: 72, emergency_min_reliability: 90 },
  ticketing: { resale_enabled: true, resale_cap_pct: 100, transfer_cutoff_hours: 2, max_per_order: 10 },
  trust: { auto_restrict_risk: 95, review_velocity_limit: 10, verification_required_for_payouts: true },
  agent: { default_approval: "required", max_spend_without_approval: 0, tools_disabled: [] },
  communications: { from_name: "Gala Dock", reminders: { event_48h: true, balance_due: true } },
  integrations: { calendar_sync: true, webhook_retry: 5 },
};
for (const [section, value] of Object.entries(settings)) {
  if (section === "commerce") must(await sb.from("platform_settings").insert({ section, version: 1, status: "superseded", value: { ...value, ticket_fee: { pct_bps: 450, fixed: 0.49 } }, effective_at: iso(NOW - 90 * D), change_reason: "Seed: initial commercial terms", created_by: U.admin, approved_by: U.admin }), "set v1");
  must(await sb.from("platform_settings").insert({ section, version: section === "commerce" ? 2 : 1, status: "published", value, effective_at: iso(NOW - 30 * D), change_reason: `Seed: ${section} defaults`, created_by: U.admin, approved_by: U.admin }), `set ${section}`);
}
// Platform-level ledger lines (ticketing, subscriptions, failures, disputes) for Admin Commerce.
const ptx = [];
const kinds = [["ticketing", "income", "Ticket Sale", 276, 27.6], ["marketplace", "income", "Venue Booking", 2500, 250], ["marketplace", "income", "Supplier Service", 620, 62], ["subscription", "income", "Subscription", 169, 0], ["ticketing", "refund", "Refund", -240, -24], ["marketplace", "payout", "Payout", -3480, 0], ["ticketing", "payment", "Failed Payment", 180, 18], ["ticketing", "refund", "Dispute", 120, 12]];
for (let d = 0; d < 30; d++) for (const [j, [source, kind, cat, amt, fee]] of kinds.entries()) {
  if ((d + j) % 3 === 2 && j > 3) continue;
  const scale = 1 + ((d * 13 + j * 7) % 9) / 10;
  ptx.push({ workspace_id: null, kind, category: cat, description: `[demo] ${cat} — ${["Tech Summit After Party", "Riverside Arena", "Sound & Lighting", "Pro Plan – Monthly", "Order #BK-7821", "Weekly payout", "Ticket Order #BK-7840", "Chargeback – BK-7703"][j]}`,
    amount: Math.round(amt * scale * 100) / 100, status: cat === "Failed Payment" ? "failed" : cat === "Payout" && d < 2 ? "pending" : "completed", source, fee_amount: Math.round(fee * scale * 100) / 100,
    net_amount: cat === "Failed Payment" || cat === "Dispute" ? null : Math.round((amt - fee) * scale * 100) / 100, counterparty: ["Alex Turner (CUS-10023)", "Riverside Events Ltd (ORG-1001)", "Elite Events UK (ORG-2210)", "City Events Co. (ORG-3321)", "Priya Shah (CUS-7721)", "The London Loft (ORG-4455)", "Marcus Lee (CUS-8832)", "Unknown (CUS-6621)"][j],
    stripe_ref: `${kind === "payout" ? "po" : "pi"}_demo_p${d}_${j}`, occurred_at: at(-d, 8 + j * 2) });
}
must(await sb.from("transactions").insert(ptx), "platform tx");
must(await sb.from("agent_runs").insert([
  { user_id: U.admin, surface: "admin", scope: ["trust", "support"], goal: "Summarise today’s highest-risk trust cases", status: "completed", progress: 100, result: "3 high-risk cases need review; 1 card-testing pattern.", plan: [{ step: "Collect open cases", status: "done" }, { step: "Rank by risk", status: "done" }], idempotency_key: "demo-admin-run-1", created_at: iso(NOW - 3 * H), finished_at: iso(NOW - 2.9 * H) },
  { user_id: U.admin, surface: "admin", scope: ["commerce"], goal: "Reconcile yesterday’s payouts against Stripe", status: "running", progress: 55, plan: [{ step: "Fetch payout ledger", status: "done" }, { step: "Compare with Stripe", status: "running" }], idempotency_key: "demo-admin-run-2", created_at: iso(NOW - 0.5 * H) },
  { user_id: U.admin, surface: "admin", scope: ["integrations"], goal: "Diagnose Mapbox tile errors", status: "failed", progress: 30, errors: [{ step: "Probe connector", error: "Upstream 503" }], plan: [{ step: "Probe connector", status: "failed" }], idempotency_key: "demo-admin-run-3", created_at: iso(NOW - 1.2 * H), finished_at: iso(NOW - 1.1 * H) },
]), "admin runs");

console.log(JSON.stringify({ workspace: WS, venue: venue.id, spaces: Object.keys(spaces).length, packages: pkgs.length, crew: crewRows.length, requests: Object.keys(items).length, jobs: bk.length + 1,
  admin: PEOPLE.admin.email, support_admin: PEOPLE.support.email, support_cases: cases.length, trust_cases: trust.length }, null, 1));
