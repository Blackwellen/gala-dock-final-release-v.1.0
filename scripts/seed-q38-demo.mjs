// Q38 full-depth demo seeding (cards 235–237, 282). Repeatable and idempotent: every step checks the current state first and
// only writes what is missing, so a second run reports 0 changes. Each run is recorded in public.sandbox_seed_runs.
//
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-q38-demo.mjs [--steps=a,b,…] [--links] [--base=http://localhost:3107]
// Steps (default: all, in this order):
//   sellers   Stripe TEST-MODE connected accounts for the demo seller workspaces (Q07 controller: seller pays fees, Stripe bears
//             losses, full dashboard, Stripe-collected requirements), prefilled with Stripe's test KYC data. An account is synced
//             into connect_accounts through the app's own webhook path (account.updated → syncConnectAccount) only once Stripe
//             reports it ready (charges_enabled + card_payments active). Stripe does not let a platform accept the Terms of Service
//             for Stripe-collected accounts, so each seller completes Stripe's hosted onboarding once (--links prints fresh links).
//   cards     Demo customer's saved test cards (Visa, Mastercard) via the app's saved-card model: platform test customer
//             (profiles.stripe_customer_id) + confirmed off-session SetupIntents with pm_card_visa / pm_card_mastercard.
//   neon      Neon Nights Festival kept in the future: shifted by whole weeks (weekday/time kept) with every event-bound date.
//   capacity  Alex & Taylor Wedding: ticket allocation and issued entitlements within the 150 venue/event capacity.
//   packages  elite-sounds-dj service packages.
//   similar   A second and third "Arena" venue so Riverside Arena has similar venues.
//   schedule  My Schedule: dated tasks on the demo customer's own events for the next 14 days.
//   ended     Demo (reserved-domain owner) events still on sale after they ended → completed.
//   purchase  A real 2-ticket test-mode purchase of Neon Nights by the demo customer through the app (direct charge on the
//             organiser's connected account) → paid, issued, resale-eligible order. Runs only when the organiser is ready and
//             the dev server is up.
// Demo rows are tagged (details.demo_seed / settings.demo_showcase / Stripe metadata gala_dock_demo) and every demo owner is on
// a reserved domain, so public.is_demo_workspace() excludes them from real reporting (card 282). Test mode only; no live key is
// read; no key value is printed. Emails to reserved domains are suppressed by the outbox (src/lib/email/send.ts).
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { accountReady, buyTicketsTestMode, completeTicketPurchase, deliverWebhook, hasTestKey, listTestAccounts, sessionCookies, stripeTest } from "./lib/stripe-test-mode.mjs";

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const ALL = ["sellers", "cards", "neon", "capacity", "packages", "similar", "schedule", "ended", "purchase"];
const STEPS = (arg("steps") ?? ALL.join(",")).split(",").map(s => s.trim()).filter(Boolean);
const BASE = arg("base") ?? process.env.E2E_BASE_URL ?? "http://localhost:3107";
const LINKS = process.argv.includes("--links");
const unknown = STEPS.filter(s => !ALL.includes(s));
if (unknown.length) { console.error(`Unknown step(s): ${unknown.join(", ")}`); process.exit(2); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const sql = async query => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, { method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(120_000) });
  const t = await r.text();
  if (!r.ok) throw new Error(`sql: HTTP ${r.status} ${t.replace(/\s+/g, " ").slice(0, 300)}`);
  return JSON.parse(t);
};
const lit = v => `'${String(v).replace(/'/g, "''")}'`;
const DAY = 864e5;

async function userByEmail(email) {
  const rows = await sql(`select id from auth.users where email = ${lit(email)}`);
  return rows[0]?.id ?? null;
}

// ───────────────────────── sellers ─────────────────────────
const SELLER_SQL = `select w.id, w.name, w.kind, w.settings, u.email, coalesce(p.full_name, '') as full_name from public.workspaces w join auth.users u on u.id = w.owner_id
  left join public.profiles p on p.id = w.owner_id
  where w.status = 'active' and lower(split_part(u.email, '@', 2)) = 'example.com'
    and (exists (select 1 from public.listings l where l.workspace_id = w.id and l.published)
      or exists (select 1 from public.events e where e.workspace_id = w.id and e.visibility = 'public' and e.status in ('published','on_sale','live','ready','planning')))
  order by w.kind, w.name`;

function accountParams(ws) {
  const [first, ...rest] = (ws.full_name || "Demo Seller").split(/\s+/);
  return {
    country: "GB", email: ws.email,
    // Q07 controller settings (src/app/api/payouts/route.ts): direct-charge merchant of record.
    "controller[fees][payer]": "account", "controller[losses][payments]": "stripe", "controller[stripe_dashboard][type]": "full", "controller[requirement_collection]": "stripe",
    "capabilities[card_payments][requested]": "true", "capabilities[transfers][requested]": "true",
    // Stripe test-mode KYC prefill (docs: test Connect onboarding data). The seller confirms it and accepts Stripe's terms.
    business_type: "individual", "individual[first_name]": first, "individual[last_name]": rest.join(" ") || "Seller",
    "individual[dob][day]": "1", "individual[dob][month]": "1", "individual[dob][year]": "1901",
    "individual[address][line1]": "address_full_match", "individual[address][city]": "London", "individual[address][postal_code]": "EC1A 1BB", "individual[address][country]": "GB",
    "individual[email]": ws.email, "individual[phone]": "+447700900123",
    "business_profile[mcc]": ws.kind === "organizer" ? "7922" : "7299", "business_profile[url]": "https://accessible.stripe.com",
    "business_profile[product_description]": ws.kind === "organizer" ? "Event tickets (Gala Dock demo seller, test mode)" : "Event venue and services (Gala Dock demo seller, test mode)",
    "business_profile[support_phone]": "+447700900123",
    "external_account[object]": "bank_account", "external_account[country]": "GB", "external_account[currency]": "gbp",
    "external_account[account_number]": "00012345", "external_account[routing_number]": "108800",
    "metadata[workspace_id]": ws.id, "metadata[gala_dock_demo]": "true", "metadata[gala_dock_seed]": "q38",
  };
}

async function stepSellers(out) {
  if (!hasTestKey()) { out.skipped = "no Stripe test key"; return 0; }
  const sellers = await sql(SELLER_SQL);
  const accounts = await listTestAccounts();
  const byWs = new Map();
  for (const a of accounts) if (a.metadata?.workspace_id && a.metadata?.gala_dock_demo === "true" && !byWs.has(a.metadata.workspace_id)) byWs.set(a.metadata.workspace_id, a);
  const { data: rows } = await sb.from("connect_accounts").select("workspace_id,stripe_account_id,charges_enabled,card_payments_capability").in("workspace_id", sellers.map(s => s.id));
  const current = new Map((rows ?? []).map(r => [r.workspace_id, r]));
  let changed = 0;
  out.accounts = [];
  for (const ws of sellers) {
    let a = byWs.get(ws.id);
    if (!a) { a = await stripeTest("POST", "accounts", accountParams(ws), { idempotencyKey: `q38-demo-seller-${ws.id}-v1` }); changed++; }
    else if ((a.requirements?.currently_due ?? []).includes("business_profile.support_phone")) {
      a = await stripeTest("POST", `accounts/${a.id}`, { "business_profile[support_phone]": "+447700900123" }); changed++;
    }
    a = await stripeTest("GET", `accounts/${a.id}`);
    const ready = accountReady(a);
    const row = current.get(ws.id);
    const entry = { workspace: ws.name, workspace_id: ws.id, kind: ws.kind, previous: row?.stripe_account_id ?? null, account: a.id, charges_enabled: a.charges_enabled,
      card_payments: a.capabilities?.card_payments ?? "inactive", transfers: a.capabilities?.transfers ?? "inactive", currently_due: a.requirements?.currently_due ?? [], disabled_reason: a.requirements?.disabled_reason ?? null, synced: false };
    // Sync only a ready account, through the app's webhook → syncConnectAccount path. A not-yet-onboarded account is left out of
    // the database so the demo workspace's payout status (which gates organiser ticket editing) is not downgraded meanwhile.
    if (ready && (row?.stripe_account_id !== a.id || !row?.charges_enabled || row?.card_payments_capability !== "active")) {
      const state = createHash("sha256").update(JSON.stringify([a.charges_enabled, a.payouts_enabled, a.capabilities, a.requirements?.currently_due, a.requirements?.disabled_reason])).digest("hex").slice(0, 16);
      const r = await deliverWebhook(BASE, { id: `evt_q38sync_${a.id}_${state}`, object: "event", type: "account.updated", account: a.id, created: Math.floor(Date.now() / 1000), livemode: false,
        data: { object: { ...a, metadata: { ...a.metadata, workspace_id: ws.id } } } }, "connect");
      entry.synced = r.status === 200; entry.sync_response = r.body;
      if (entry.synced) changed++;
    } else entry.synced = ready;
    if (!ready && LINKS) {
      const link = await stripeTest("POST", "account_links", { account: a.id, type: "account_onboarding", refresh_url: `${BASE}/${ws.kind}`, return_url: `${BASE}/${ws.kind}` });
      entry.onboarding_link = link.url;
    }
    // Showcase tag for reporting exclusion (card 282). Settings merge only; never touches payout status or names.
    if (ws.settings?.demo_showcase !== true) { must(await sb.from("workspaces").update({ settings: { ...(ws.settings ?? {}), demo_showcase: true } }).eq("id", ws.id), "showcase tag"); changed++; }
    out.accounts.push(entry);
  }
  out.ready = out.accounts.filter(a => a.charges_enabled && a.card_payments === "active").length;
  // The Q07 test-mode journey spec's QA seller (created by tests/payments/stripe-test-mode.spec.ts): report it, link it on request.
  const qa = accounts.find(a => a.metadata?.gala_dock_purpose === "q07_test_mode_verification");
  if (qa) {
    out.qa_seller = { account: qa.id, ready: accountReady(qa), currently_due: qa.requirements?.currently_due ?? [] };
    if (!accountReady(qa) && LINKS) out.qa_seller.onboarding_link = (await stripeTest("POST", "account_links", { account: qa.id, type: "account_onboarding", refresh_url: `${BASE}/`, return_url: `${BASE}/` })).url;
  }
  return changed;
}

// ───────────────────────── cards ─────────────────────────
async function stepCards(out) {
  if (!hasTestKey()) { out.skipped = "no Stripe test key"; return 0; }
  const uid = await userByEmail("alex.thompson@example.com");
  if (!uid) throw new Error("demo customer missing");
  const prof = must(await sb.from("profiles").select("stripe_customer_id,full_name").eq("id", uid).single(), "profile");
  let changed = 0, cid = prof.stripe_customer_id;
  if (cid) {
    const c = await stripeTest("GET", `customers/${cid}`).catch(() => null);
    if (!c || c.deleted) { out.skipped = "profile has a Stripe customer that is not a test-mode customer; left unchanged"; return 0; }
  } else {
    // Same shape as stripeCustomer() in src/lib/payments.ts (metadata.user_id), created in test mode.
    const c = await stripeTest("POST", "customers", { email: "alex.thompson@example.com", name: prof.full_name || "Alex Thompson", "metadata[user_id]": uid, "metadata[gala_dock_demo]": "true" }, { idempotencyKey: `q38-demo-customer-${uid}` });
    cid = c.id;
    must(await sb.from("profiles").update({ stripe_customer_id: cid }).eq("id", uid).is("stripe_customer_id", null), "profile customer");
    changed++;
  }
  const list = await stripeTest("GET", "payment_methods", { customer: cid, type: "card", limit: "20" });
  const have = new Set(list.data.map(p => p.card?.brand));
  let visa = list.data.find(p => p.card?.brand === "visa")?.id ?? null;
  for (const [brand, pm] of [["visa", "pm_card_visa"], ["mastercard", "pm_card_mastercard"]]) {
    if (have.has(brand)) continue;
    // The app's add-card path is an off-session SetupIntent on the customer (startAddCard); here it is confirmed with a test card.
    const si = await stripeTest("POST", "setup_intents", { customer: cid, payment_method: pm, confirm: "true", usage: "off_session", "automatic_payment_methods[enabled]": "true", "automatic_payment_methods[allow_redirects]": "never",
      "metadata[user_id]": uid, "metadata[gala_dock_demo]": "true" }, { idempotencyKey: `q38-card-${uid}-${brand}-v2` });
    if (si.status !== "succeeded") throw new Error(`setup intent ${brand}: ${si.status}`);
    if (brand === "visa") visa = si.payment_method;
    changed++;
  }
  const cust = await stripeTest("GET", `customers/${cid}`);
  if (!cust.invoice_settings?.default_payment_method && visa) { await stripeTest("POST", `customers/${cid}`, { "invoice_settings[default_payment_method]": visa }); changed++; }
  const after = await stripeTest("GET", "payment_methods", { customer: cid, type: "card", limit: "20" });
  out.customer = cid; out.cards = after.data.map(p => `${p.card.brand} •••• ${p.card.last4} (${p.id})`);
  return changed;
}

// ───────────────────────── neon ─────────────────────────
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
// Event-bound dates move with the event. A sales phase that has already opened stays open (moving its start into the future
// would take on-sale tickets off sale) unless it is the start of a tier that is still scheduled, which moves with the event.
const shiftDeep = (v, ms, keepOpen, key = "") => Array.isArray(v) ? v.map(x => shiftDeep(x, ms, keepOpen))
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shiftDeep(x, ms, keepOpen, k)]))
  : typeof v === "string" && ISO.test(v) ? (key === "starts_at" && keepOpen(Date.parse(v)) ? v : new Date(Date.parse(v) + ms).toISOString()) : v;

const OPEN_TIER = ["on_sale", "sold_out", "paused"];
async function stepNeon(out) {
  const ev = must(await sb.from("events").select("id,starts_at,ends_at,settings,workspace_id").eq("slug", "neon-nights").single(), "neon");
  const minLead = 42 * DAY;   // keep it at least six weeks out, so Discover, My Tickets and resale all show it as upcoming
  const lead = Date.parse(ev.starts_at) - Date.now();
  out.starts_at = ev.starts_at;
  if (lead >= 14 * DAY) return 0;
  const weeks = Math.ceil((minLead - lead) / (7 * DAY));
  // Whole weeks keep the weekday; the BST/GMT difference is added back so the London wall-clock time is kept too.
  const from = Date.parse(ev.starts_at), dst = t => (new Date(t).toLocaleString("en-GB", { timeZone: "Europe/London", timeZoneName: "short" }).includes("BST") ? 3600e3 : 0);
  const ms = weeks * 7 * DAY + dst(from) - dst(from + weeks * 7 * DAY), iv = `interval '${ms / 1000} seconds'`;
  const tiers = must(await sb.from("ticket_tiers").select("status,sale_start").eq("event_id", ev.id), "neon tiers");
  const scheduledStarts = new Set(tiers.filter(t => t.sale_start && !OPEN_TIER.includes(t.status)).map(t => Date.parse(t.sale_start)));
  const settings = shiftDeep(ev.settings ?? {}, ms, t => t <= Date.now() && !scheduledStarts.has(t));
  const id = lit(ev.id);
  await sql(`
    update public.events set starts_at = starts_at + ${iv}, ends_at = ends_at + ${iv}, settings = ${lit(JSON.stringify(settings))}::jsonb, updated_at = now() where id = ${id};
    update public.ticket_tiers set sale_start = case when status in (${OPEN_TIER.map(lit).join(",")}) then sale_start else sale_start + ${iv} end, sale_end = sale_end + ${iv}, valid_from = valid_from + ${iv}, valid_to = valid_to + ${iv} where event_id = ${id};
    update public.programme_items set starts_at = starts_at + ${iv} where event_id = ${id} and starts_at is not null;
    update public.tasks set due_at = due_at + ${iv} where event_id = ${id} and due_at is not null;
    update public.shifts set starts_at = starts_at + ${iv}, ends_at = ends_at + ${iv} where event_id = ${id};
    update public.promotions set scheduled_at = scheduled_at + ${iv} where event_id = ${id} and scheduled_at is not null;
    update public.discount_codes set valid_from = valid_from + ${iv}, valid_until = valid_until + ${iv} where event_id = ${id};
    update public.calendar_entries set starts_at = starts_at + ${iv}, ends_at = ends_at + ${iv} where event_id = ${id};
    update public.provider_jobs set starts_at = starts_at + ${iv}, ends_at = ends_at + ${iv} where event_id = ${id};
    update public.event_virtual set replay_until = replay_until + ${iv} where event_id = ${id} and replay_until is not null;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', ${lit(ev.workspace_id)}, 'demo.seed_rescheduled',
      jsonb_build_object('event_id', ${id}, 'weeks', ${weeks}, 'seed', 'q38', 'from', ${lit(ev.starts_at)}));`);
  const now = must(await sb.from("events").select("starts_at,ends_at").eq("id", ev.id).single(), "neon after");
  out.moved = { weeks, from: ev.starts_at, to: now.starts_at, ends: now.ends_at };
  return 1;
}

// ───────────────────────── capacity ─────────────────────────
// Alex & Taylor Wedding (customer event at The Loft, London: 150). Allocation sums to the capacity; issued ≤ allocation; total issued = guest count.
const WEDDING_TIERS = { "General Admission": [60, 60], "VIP Experience": [30, 24], "Early Bird": [20, 8], Complimentary: [40, 28] };
async function stepCapacity(out) {
  const ev = must(await sb.from("events").select("id,capacity,guest_count,venue_listing_id").eq("slug", "alex-taylor-wedding").single(), "wedding");
  const venue = ev.venue_listing_id ? must(await sb.from("listings").select("capacity_max").eq("id", ev.venue_listing_id).single(), "venue") : null;
  const cap = Math.min(...[ev.capacity, venue?.capacity_max].filter(n => Number.isFinite(n)));
  const tiers = must(await sb.from("ticket_tiers").select("id,name,quantity,sold").eq("event_id", ev.id), "tiers");
  const plannedTotal = Object.values(WEDDING_TIERS).reduce((a, [q]) => a + q, 0);
  if (plannedTotal > cap) throw new Error(`wedding plan ${plannedTotal} exceeds capacity ${cap}`);
  let changed = 0;
  for (const t of tiers) {
    const plan = WEDDING_TIERS[t.name];
    if (!plan) continue;
    const [qty, sold] = plan;
    const issued = must(await sb.from("tickets").select("id,status,holder_id,checked_in_at,created_at").eq("tier_id", t.id).order("created_at", { ascending: false }), "tickets");
    const excess = issued.length - sold;
    if (excess > 0) {
      // Only unheld, never-scanned seed entitlements are removed (newest first); a real holder's ticket is never touched.
      const removable = issued.filter(k => !k.holder_id && !k.checked_in_at && k.status === "valid").slice(0, excess).map(k => k.id);
      if (removable.length < excess) throw new Error(`wedding ${t.name}: cannot trim ${excess} tickets safely`);
      must(await sb.from("tickets").delete().in("id", removable), "trim tickets");
      changed++;
    }
    if (t.quantity !== qty || t.sold !== sold) { must(await sb.from("ticket_tiers").update({ quantity: qty, sold }).eq("id", t.id), "tier"); changed++; }
  }
  const guests = Object.values(WEDDING_TIERS).reduce((a, [, s]) => a + s, 0);
  if (ev.guest_count !== guests) { must(await sb.from("events").update({ guest_count: guests }).eq("id", ev.id), "guest count"); changed++; }
  out.capacity = cap; out.allocation = plannedTotal; out.issued = guests;
  return changed;
}

// ───────────────────────── packages ─────────────────────────
const ELITE_PACKAGES = [
  { name: "Wedding DJ & MC — 6 hours", base_price: 1150, duration_hours: 6, min_guests: 50, max_guests: 250, deposit_pct: 30, booking_mode: "request",
    description: "Ceremony-to-last-dance cover: DJ and MC, first-dance edit, curated playlists and a planning call.", inclusions: ["DJ & MC", "PA for up to 250 guests", "Dance-floor lighting", "Wireless mic for speeches", "Planning call"] },
  { name: "Party DJ — 4 hours", base_price: 650, duration_hours: 4, min_guests: 20, max_guests: 150, deposit_pct: 30, booking_mode: "request",
    description: "Birthdays, anniversaries and private parties with a tailored set and party lighting.", inclusions: ["DJ", "PA system", "Party lighting", "Request list"] },
  { name: "Festival stage set & sound", base_price: 1800, duration_hours: 3, min_guests: 300, max_guests: 2000, deposit_pct: 40, booking_mode: "request",
    description: "Headline or support set with stage-grade sound, monitors and an engineer.", inclusions: ["90–120 minute set", "Line-array PA", "Monitors", "Sound engineer", "Tech rider handled"] },
];
async function stepPackages(out) {
  const l = must(await sb.from("listings").select("id,workspace_id").eq("slug", "elite-sounds-dj").single(), "elite-sounds-dj");
  const have = must(await sb.from("packages").select("name").eq("listing_id", l.id), "packages");
  const names = new Set(have.map(p => p.name));
  const add = ELITE_PACKAGES.filter(p => !names.has(p.name)).map(p => ({ ...p, workspace_id: l.workspace_id, listing_id: l.id, status: "published", currency: "GBP", price_basis: "fixed",
    image: "/assets/gd/s-elite-sounds.webp", details: { demo_seed: "q38" } }));
  if (add.length) must(await sb.from("packages").insert(add), "insert packages");
  out.packages = names.size + add.length;
  return add.length ? 1 : 0;
}

// ───────────────────────── similar ─────────────────────────
async function stepSimilar(out) {
  const arena = must(await sb.from("listings").select("id,workspace_id,category,details,gallery").eq("slug", "riverside-arena").single(), "riverside-arena");
  const host = must(await sb.from("listings").select("workspace_id").eq("slug", "riverside-conference-centre").single(), "host");   // London Venue Collective
  const base = { kind: "venue", category: arena.category, city: "London", published: true, review_status: "approved", booking_mode: "request", price_unit: "per hour", instant_book: false, response_hours: 4 };
  const rows = [
    { ...base, slug: "docklands-arena", name: "Docklands Arena", location: "1 Royal Victoria Dock, London, E16 1XL", image: "/assets/gd/v-riverside-conference.webp",
      gallery: ["/assets/gd/v-riverside-conference.webp", "/assets/gd/v-grand-hall.webp", "/assets/gd/v-east-london-warehouse.webp"], price_from: 650, capacity_min: 100, capacity_max: 2500,
      rating: 4.7, review_count: 64, lat: 51.5079, lng: 0.0262, tags: ["Waterside", "Concerts", "AV"], description: "Flexible dockside arena for concerts, launches and award shows, with tiered seating and a full production grid.",
      details: { demo_seed: "q38", geo: { lat: 51.5079, lng: 0.0262 } } },
    { ...base, slug: "southbank-events-arena", name: "Southbank Events Arena", location: "48 Upper Ground, London, SE1 9PP", image: "/assets/gd/v-grand-hall.webp",
      gallery: ["/assets/gd/v-grand-hall.webp", "/assets/gd/v-riverside-events-centre.webp", "/assets/gd/v-skyline-rooftop.webp"], price_from: 450, capacity_min: 50, capacity_max: 900,
      rating: 4.8, review_count: 91, lat: 51.5068, lng: -0.1107, tags: ["Riverside", "Multi-space", "Catering"], description: "Mid-size riverside arena with a sprung floor, balcony bars and in-house catering for 50–900 guests.",
      details: { demo_seed: "q38", geo: { lat: 51.5068, lng: -0.1107 } } },
  ];
  const existing = must(await sb.from("listings").select("slug").in("slug", rows.map(r => r.slug)), "existing");
  const add = rows.filter(r => !existing.some(e => e.slug === r.slug)).map(r => ({ ...r, workspace_id: host.workspace_id }));
  if (add.length) must(await sb.from("listings").insert(add), "insert venues");
  const sim = must(await sb.from("listings").select("id").eq("kind", "venue").eq("published", true).eq("category", arena.category).neq("id", arena.id), "similar");
  out.similar = sim.length;
  return add.length ? 1 : 0;
}

// ───────────────────────── schedule ─────────────────────────
const SCHEDULE = [
  ["Call the florist about table arrangements", "Flowers", 9, 30], ["Confirm menu tasting time", "Food & Drink", 11, 0], ["Send save-the-dates to the remaining guests", "Guests & Tickets", 14, 0],
  ["Pay the photographer's deposit", "Payments", 10, 0], ["Venue walk-through at The Loft", "Venue & Location", 15, 30], ["Shortlist DJ playlists", "Entertainment", 18, 0],
  ["Finalise seating plan draft", "Guests & Tickets", 12, 0], ["Book cake tasting", "Food & Drink", 16, 0], ["Check RSVP replies", "Guests & Tickets", 9, 0],
  ["Review the décor mood board", "Decor", 13, 30],
];
const londonIso = (d, h, m) => { // Europe/London wall clock → ISO (BST from the last Sunday of March to the last Sunday of October)
  const y = d.getUTCFullYear(), lastSun = mo => { const x = new Date(Date.UTC(y, mo + 1, 0)); return x.getUTCDate() - x.getUTCDay(); };
  const t = Date.UTC(y, d.getUTCMonth(), d.getUTCDate(), h, m);
  const bst = t >= Date.UTC(y, 2, lastSun(2), 1) && t < Date.UTC(y, 9, lastSun(9), 1);
  return new Date(t - (bst ? 3600e3 : 0)).toISOString();
};
async function stepSchedule(out) {
  const uid = await userByEmail("alex.thompson@example.com");
  const events = must(await sb.from("events").select("id,slug").eq("owner_id", uid).eq("management", "consumer").in("slug", ["alex-taylor-wedding", "alex-30th-birthday"]), "customer events");
  const wedding = events.find(e => e.slug === "alex-taylor-wedding"), birthday = events.find(e => e.slug === "alex-30th-birthday") ?? wedding;
  if (!wedding) throw new Error("customer wedding missing");
  const titles = SCHEDULE.map(s => s[0]);
  const from = new Date(Date.now() - DAY).toISOString(), to = new Date(Date.now() + 15 * DAY).toISOString();
  const have = must(await sb.from("tasks").select("title,due_at").in("event_id", events.map(e => e.id)).in("title", titles).gte("due_at", from).lte("due_at", to), "schedule tasks");
  const key = r => `${r.title}|${new Date(r.due_at).toISOString().slice(0, 16)}`;
  const haveKeys = new Set(have.map(key));
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }) + "T00:00:00Z");
  const want = [];
  for (let d = 0; d < 14; d++) {
    const day = new Date(today.getTime() + d * DAY);
    const picks = d % 3 === 2 ? [SCHEDULE[(d * 2) % SCHEDULE.length]] : [SCHEDULE[(d * 2) % SCHEDULE.length], SCHEDULE[(d * 2 + 1) % SCHEDULE.length]];
    for (const [title, category, h, m] of picks) {
      const ev = category === "Entertainment" || category === "Decor" ? birthday : wedding;
      want.push({ event_id: ev.id, owner_id: uid, title, category, due_at: londonIso(day, h, m), priority: "medium", status: "todo", detail: "" });
    }
  }
  const add = want.filter(w => !haveKeys.has(key(w)));
  if (add.length) must(await sb.from("tasks").insert(add), "insert schedule");
  out.schedule = { next14days: want.length, added: add.length };
  return add.length ? 1 : 0;
}

// ───────────────────────── ended ─────────────────────────
async function stepEnded(out) {
  const rows = await sql(`
    with ended as (
      select e.id from public.events e where e.status in ('published','on_sale','live') and coalesce(e.ends_at, e.starts_at) < now() - interval '1 day'
        and public.is_demo_workspace(e.workspace_id))
    update public.events e set status = 'completed', updated_at = now() from ended where e.id = ended.id returning e.id, e.name`);
  const left = await sql(`select count(*)::int as n from public.events e where e.status in ('published','on_sale','live') and coalesce(e.ends_at, e.starts_at) < now() - interval '1 day'`);
  out.completed = rows.map(r => r.name); out.non_demo_ended_still_on_sale = left[0]?.n ?? 0;   // generic job: Q14
  return rows.length ? 1 : 0;
}

// ───────────────────────── purchase ─────────────────────────
async function stepPurchase(out) {
  if (!hasTestKey()) { out.skipped = "no Stripe test key"; return 0; }
  const password = process.env.DEMO_CUSTOMER_PASSWORD;
  if (!password) { out.skipped = "DEMO_CUSTOMER_PASSWORD not set"; return 0; }
  const ev = must(await sb.from("events").select("id,starts_at").eq("slug", "neon-nights").single(), "neon");
  const seller = must(await sb.rpc("event_seller_workspace", { p_event: ev.id }), "seller");
  const acct = must(await sb.rpc("seller_payment_account", { p_workspace: seller }), "seller account");
  if (!(acct?.stripe_account_id && acct.charges_enabled && acct.card_payments === "active")) { out.skipped = "organiser's Stripe test account is not active yet (hosted onboarding pending)"; return 0; }
  const uid = await userByEmail("alex.thompson@example.com");
  const existing = must(await sb.from("checkout_orders").select("order_ref,status,lines").eq("buyer_id", uid).eq("event_id", ev.id).eq("strategy", "direct").eq("status", "issued"), "orders");
  if (existing.some(o => (o.lines ?? []).reduce((a, l) => a + Number(l.qty ?? 0), 0) >= 2)) { out.order = existing[0].order_ref; return 0; }
  const health = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!health?.ok) { out.skipped = `dev server not reachable at ${BASE}`; return 0; }
  const tier = must(await sb.from("ticket_tiers").select("id").eq("event_id", ev.id).eq("name", "General Admission").single(), "GA tier");
  const { cookie } = await sessionCookies("alex.thompson@example.com", password);
  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await userClient.auth.signInWithPassword({ email: "alex.thompson@example.com", password }), "user client");
  const started = await buyTicketsTestMode({ base: BASE, cookie, userClient, eventId: ev.id, items: [{ tier: tier.id, qty: 2 }] });
  if (!started.ok) throw new Error(`checkout: ${started.status} ${started.error}`);
  const done = await completeTicketPurchase(BASE, started.cookie, started.sessionId, acct.stripe_account_id);
  const order = must(await sb.from("checkout_orders").select("order_ref,status,strategy,connected_account_id,stripe_payment_intent,application_fee_minor").eq("stripe_session", started.sessionId).single(), "order");
  out.order = order.order_ref; out.session = started.sessionId; out.payment_intent = done.paid.paymentIntent; out.status = order.status;
  if (order.status !== "issued") throw new Error(`purchase not issued: ${order.status} (${done.redirect})`);
  return 1;
}

// ───────────────────────── run ─────────────────────────
const STEP_FN = { sellers: stepSellers, cards: stepCards, neon: stepNeon, capacity: stepCapacity, packages: stepPackages, similar: stepSimilar, schedule: stepSchedule, ended: stepEnded, purchase: stepPurchase };
const run = must(await sb.from("sandbox_seed_runs").insert({ seed: "q38-demo", version: "1", steps: STEPS, stripe_mode: hasTestKey() ? "test" : "none" }).select("id").single(), "seed run");
const summary = {};
let failed = 0;
for (const step of STEPS) {
  const out = {};
  try { out.changed = await STEP_FN[step](out); }
  catch (e) { out.error = e instanceof Error ? e.message : String(e); failed++; }
  summary[step] = out;
  console.log(`${step}: ${out.error ? `FAILED ${out.error}` : out.skipped ? `skipped (${out.skipped})` : `${out.changed} change(s)`}`);
}
const partial = Object.values(summary).some(s => s.skipped);
await sb.from("sandbox_seed_runs").update({ status: failed ? "failed" : partial ? "partial" : "completed", summary, finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  error: failed ? Object.entries(summary).filter(([, s]) => s.error).map(([k, s]) => `${k}: ${s.error}`).join("; ").slice(0, 2000) : null }).eq("id", run.id);
console.log(`Q38_SEED_SUMMARY ${JSON.stringify({ run: run.id, summary })}`);
process.exit(failed ? 1 : 0);
