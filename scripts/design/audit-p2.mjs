// Phase 2 audit: every design reference → route; visits each route as the right user and reports
// HTTP status, Next error overlay, page errors and console errors. Also lists design files not covered by any route.
// Usage: node --env-file=.env --env-file=.env.local scripts/design/audit-p2.mjs
import fs from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const first = async (q) => (await q).data?.[0] ?? null;
const neon = (await first(sb.from("events").select("id,slug").eq("name", "Neon Nights Festival").limit(1)));
const wed = (await first(sb.from("events").select("id").eq("management", "consumer").ilike("name", "%wedding%").order("created_at").limit(1))).id;
const { data: us } = await sb.auth.admin.listUsers({ perPage: 200 }); const cust = us.users.find(u => u.email === "alex.thompson@example.com").id;
const tix = (await first(sb.from("tickets").select("id").eq("event_id", neon.id).eq("holder_id", cust).limit(1)))?.id;
const inv = (await first(sb.from("invoices").select("id").eq("number", "INV-1047").limit(1)))?.id;
const jc = (await first(sb.from("crew_members").select("id").ilike("name", "James Carter%").limit(1)))?.id;
const req = (await first(sb.from("provider_requests").select("id,events!inner(workspace_id,workspaces!inner(name))").eq("events.workspaces.name", "Alex Events").limit(1)))?.id;
const lead = (await first(sb.from("leads").select("id").limit(1)))?.id;
const prop = (await first(sb.from("proposals").select("id").limit(1)))?.id;
const venue = await first(sb.from("listings").select("id,slug").eq("kind", "venue").eq("published", true).eq("name", "Riverside Park Events Venue").limit(1));
const svc = await first(sb.from("listings").select("id,slug").eq("kind", "service").eq("published", true).eq("name", "Gourmet Catering Co.").limit(1));
const item = (await first(sb.from("build_items").select("id").eq("event_id", wed).eq("category", "venue").limit(1)))?.id;
const bitem = (await first(sb.from("build_items").select("id").eq("event_id", neon.id).in("status", ["confirmed", "held"]).limit(1)))?.id;
const wsSlug = (await first(sb.from("workspaces").select("id").eq("name", "Alex Events").limit(1)))?.id;
const D = "Designs/customer & Organizer workspace/";

// [role, route, design files (prefix match against the folder, ignoring "(n)" copies)]
const R = [
  ["customer", "/home", ["9EC8147F"]],
  ["customer", "/discover", ["Gala Dock Event Discovery Dashboard"]],
  ["customer", "/account/events", ["Modern My Events Dashboard"]],
  ["customer", `/account/events/${wed}`, ["Gala·Dock Wedding Event Dashboard", "GalaDock Wedding Planning Dashboard"]],
  ["customer", `/account/events/${wed}/build`, ["GalaDock Wedding Event Planner Dashboard"]],
  ["customer", `/account/events/${wed}/plan`, ["Gala·Dock Wedding Planning Dashboard", "Gala Dock Wedding Planning Dashboard"]],
  ["customer", `/account/events/${wed}/guests-tickets`, ["Gala·Dock Guest Management Dashboard"]],
  ["customer", `/account/events/${wed}/money`, ["Gala·Dock Wedding Money Dashboard"]],
  ["customer", `/account/events/${wed}/messages`, ["Gala·Dock Wedding Messaging Dashboard"]],
  ["customer", "/account/tickets", ["Gala·Dock Ticket Dashboard"]],
  ["customer", `/account/tickets/${tix}`, ["Neon Nights Festival Ticket Dashboard"]],
  ["customer", "/account/saved", ["Gala·Dock Saved Events Dashboard"]],
  ["customer", "/account/reviews", ["Gala·Dock Reviews Dashboard"]],
  ["customer", "/account", ["Gala·Dock Account Dashboard"]],
  ["customer", "/plan?step=1", ["GalaDock Event Planning Wizard"]],
  ["customer", `/plan?event=${wed}&step=2`, ["GalaDock Event Planning Dashboard"]],
  ["customer", `/plan?event=${wed}&step=3`, ["Gala Dock Event Planning Dashboard"]],
  ["customer", `/plan?event=${wed}&step=4`, ["GalaDock Wedding Event Planner Dashboard"]],
  ["customer", `/account/events/${wed}/book?item=${item}&step=1`, ["Gala Dock Venue Booking Dashboard", "Gala·Dock Venue Booking Dashboard"]],
  ["customer", `/account/events/${wed}/book?item=${item}&step=2`, ["Gala Dock Wedding Booking Request"]],
  ["customer", `/account/events/${wed}/tickets/setup?step=1`, ["Gala·Dock Wedding Ticket Setup Dashboard"]],
  ["customer", `/account/events/${wed}/tickets/setup?step=2`, ["Ticket Setup Dashboard_ Sales & Rules"]],
  ["customer", `/account/events/${wed}/tickets/setup?step=3`, ["Gala·Dock Ticket Setup Review"]],
  ["anon", `/events/${neon.slug}`, ["image-gen-3"]],
  ["anon", `/venues/${venue?.slug ?? venue?.id}`, ["image-gen-1"]],
  ["anon", `/services/${svc?.slug ?? svc?.id}`, ["image-gen-2"]],
  ["anon", `/organizers/${wsSlug}`, []],
  ["anon", "/", []],
  ["organizer", "/organizer", ["Gala·Dock Event Command Centre"]],
  ["organizer", "/organizer/events", ["Gala·Dock Event Portfolio Dashboard", "Modern Event Management Dashboard"]],
  ["organizer", `/organizer/events/${neon.id}`, ["Neon Nights Festival Dashboard"]],
  ["organizer", `/organizer/events/${neon.id}?tab=plan`, ["Gala·Dock Event Planning Dashboard"]],
  ["organizer", `/organizer/events/${neon.id}?tab=money`, ["Neon Nights Festival Finance Dashboard"]],
  ["organizer", `/organizer/events/${neon.id}?tab=ops`, ["Neon Nights Festival Operations Dashboard"]],
  ["organizer", `/organizer/events/${neon.id}?tab=sell`, []],
  ["organizer", "/organizer/calendar", ["Gala·Dock Event Calendar Dashboard"]],
  ["organizer", "/organizer/calendar?view=month", ["Gala·Dock April 2025 Event Calendar"]],
  ["organizer", "/organizer/sales", ["Gala Dock Sales Dashboard", "Gala Dock Festival Sales Dashboard"]],
  ["organizer", lead ? `/organizer/sales/leads/${lead}` : "/organizer/sales", []],
  ["organizer", prop ? `/organizer/sales/proposals/${prop}` : "/organizer/sales", ["Gala Dock Festival Proposal Dashboard"]],
  ["organizer", "/organizer/marketplace", ["Gala·Dock Venues Marketplace Dashboard", "Gala·Dock Venue Marketplace Dashboard", "Marketplace Events UI Dashboard Mockup", "Marketplace UI Card and List Dashboard"]],
  ["organizer", "/organizer/marketplace?tab=services", ["Gala Dock Services Marketplace Dashboard", "Gala·Dock Services Marketplace Dashboard"]],
  ["organizer", `/organizer/marketplace/venue/${venue?.id}`, []],
  ["organizer", `/organizer/marketplace/service/${svc?.id}`, []],
  ["organizer", req ? `/organizer/marketplace/requests/${req}` : "/organizer/marketplace", ["Gala Dock Marketplace Quote Comparison"]],
  ["organizer", `/organizer/marketplace/requests/new?event=${neon.id}`, ["Create Marketplace Request Dashboard"]],
  ["organizer", `/organizer/marketplace/requests/new?event=${neon.id}&step=2`, ["Neon Nights Supplier Marketplace Dashboard"]],
  ["organizer", bitem ? `/organizer/marketplace/bookings/${bitem}` : "/organizer/marketplace", []],
  ["organizer", "/organizer/marketplace/emergency", []],
  ["organizer", "/organizer/tickets", ["Gala Dock Event Promotion Dashboard"]],
  ["organizer", `/organizer/events/${neon.id}/page`, ["Neon Nights Festival Page Editor"]],
  ["organizer", `/organizer/events/${neon.id}/map`, ["Neon Nights Festival Venue Map Builder"]],
  ["organizer", `/organizer/events/${neon.id}/promotion`, ["Neon Nights Promotion Dashboard"]],
  ["organizer", `/organizer/events/${neon.id}/media`, ["Neon Nights Festival Poster Builder"]],
  ["organizer", `/organizer/events/${neon.id}/media?tab=library`, []],
  ["organizer", "/organizer/team", ["Gala Dock Team Dashboard"]],
  ["organizer", `/organizer/team/${jc}`, ["Gala·Dock Team Profile Dashboard"]],
  ["organizer", "/organizer/money", ["Gala Dock Event Finance Dashboard"]],
  ["organizer", `/organizer/money/invoices/${inv}`, ["Gala Dock Invoice Dashboard"]],
  ["organizer", "/organizer/money/invoices/new", ["Gala·Dock Invoice Creation Dashboard"]],
  ["organizer", `/organizer/money/invoices/new?from=${inv}&duplicate=1&step=2`, ["Gala·Dock Invoice Scheduling Dashboard"]],
  ["organizer", "/organizer/agent", ["Gala Agent Event Operations Dashboard"]],
  ["organizer", "/organizer/settings", ["Gala Dock Workspace Settings Dashboard"]],
  ["organizer", "/organizer/events/new?step=1", ["Modern Event Creation Wizard Dashboard"]],
  ["organizer", `/organizer/events/new?event=${neon.id}&step=2`, ["GalaDock Event Creation Dashboard"]],
  ["organizer", `/organizer/events/new?event=${neon.id}&step=3`, ["Gala Dock Event Economics Dashboard"]],
  ["organizer", `/organizer/events/new?event=${neon.id}&step=4`, ["Gala·Dock Event Setup Dashboard"]],
  ["organizer", "/organizer/proposals/new", ["Gala Dock Proposal Dashboard"]],
  ["organizer", "/organizer/proposals/new?step=2", ["SaaS Proposal Builder_ Offer & Pricing"]],
  ["organizer", "/organizer/proposals/new?step=3", ["Gala Dock Proposal Review Dashboard"]],
  ["organizer", `/organizer/events/${neon.id}/tickets/setup?step=1`, ["Gala·Dock Ticket Setup Dashboard"]],
  ["organizer", `/organizer/events/${neon.id}/tickets/setup?step=2`, ["Neon Nights Ticket Setup Dashboard", "GalaDock Ticket Setup Dashboard"]],
  ["organizer", `/organizer/events/${neon.id}/tickets/setup?step=3`, []],
  ["organizer", `/organizer/events/${neon.id}/tickets/setup?step=4`, ["Gala Dock Ticket Setup Dashboard"]],
  ["organizer", `/organizer/events/${neon.id}/tickets/setup?step=5`, []],
  ["organizer", `/organizer/promotions/new?event=${neon.id}&step=1`, ["Neon Nights Promotion Dashboard2"]],
  ["organizer", `/organizer/promotions/new?event=${neon.id}&step=2`, ["Neon Nights Festival Promotion Dashboard"]],
  ["organizer", `/organizer/promotions/new?event=${neon.id}&step=3`, ["Gala Dock Promotion Review Dashboard"]],
  ["organizer", `/organizer/events/${neon.id}/template`, ["Save Event as Template Dashboard"]],
  ["organizer", `/organizer/events/${neon.id}/template?step=2`, ["Gala-Dock Festival Template Dashboard"]],
];

// Design coverage
const strip = s => s.normalize("NFKD").replace(/\.(png|jpe?g)$/i, "").replace(/\s*\(\d+\)$/, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
const files = fs.readdirSync(D); const claimed = R.flatMap(r => r[2]).map(strip);
const uncovered = files.filter(f => !claimed.some(c => strip(f) === c || strip(f).startsWith(c)));

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctxs = {};
for (const role of ["customer", "organizer", "anon"]) {
  const st = `artifacts/visual/state-${role}.json`;
  ctxs[role] = await browser.newContext({ viewport: { width: 1536, height: 1024 },  });
}
// Sign each role in fresh (other test runs rotate the demo users' refresh tokens).
const CREDS = { customer: ["alex.thompson@example.com", process.env.DEMO_CUSTOMER_PASSWORD], organizer: ["alex.events@example.com", process.env.DEMO_ORGANIZER_PASSWORD] };
for (const role of ["customer", "organizer"]) {
  const p = await ctxs[role].newPage(); await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  if (new URL(p.url()).pathname.startsWith("/login")) {
    await p.fill('input[name="email"]', CREDS[role][0]); await p.fill('input[name="password"]', CREDS[role][1]);
    await Promise.all([p.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 60_000 }), p.click('button[type="submit"]')]);
  }
  await p.close();
}
const rows = [];
const only = process.argv[2]; // optional substring filter on the route
for (const [role, path, designs] of R) {
  if (only && !path.includes(only)) continue;
  const page = await ctxs[role].newPage(); const errs = [];
  page.on("pageerror", e => errs.push(`pageerror: ${e.message.slice(0, 140)}`));
  page.on("console", m => { if (m.type() === "error" && !/favicon|Download the React DevTools|net::ERR_ABORTED|hydrat/i.test(m.text())) errs.push(`console: ${m.text().slice(0, 140)}`); });
  let status = 0, title = "", url = "";
  try {
    const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 }); status = res?.status() ?? 0;
    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {}); await page.waitForTimeout(1500); url = new URL(page.url()).pathname; title = await page.title();
    // The dev-tools badge always lives in <nextjs-portal>; only flag real error dialogs / issue counts inside it.
    const overlay = await page.evaluate(() => { const r = document.querySelector("nextjs-portal")?.shadowRoot; if (!r) return ""; const t = r.textContent ?? ""; const m = t.match(/Unhandled Runtime Error|Runtime Error|Build Error|Console Error|\d+\s+Issues?/); return r.querySelector("[data-nextjs-dialog]") ? "dialog" : m ? m[0] : ""; });
    if (overlay) errs.push(`Next.js dev overlay: ${overlay}`);
    const body = await page.locator("body").innerText().catch(() => "");
    if (/This page could not be found|404\b.*not found/i.test(body)) errs.push("renders 404");
    if (/Application error|Something went wrong/i.test(body)) errs.push("renders error boundary");
    if (url.startsWith("/login")) errs.push("redirected to login");
  } catch (e) { errs.push(`goto: ${String(e.message).slice(0, 120)}`); }
  rows.push({ role, path, status, ok: status === 200 && !errs.length, errs, designs: designs.length });
  console.log(`${status === 200 && !errs.length ? "OK  " : "FAIL"} ${status} ${role.padEnd(9)} ${path}${errs.length ? "\n      " + errs.join("\n      ") : ""}`);
  await page.close();
}
await browser.close();
console.log(`\n${rows.filter(r => r.ok).length}/${rows.length} routes clean. Designs: ${files.length}, uncovered by any audited route: ${uncovered.length}`);
for (const f of uncovered) console.log("  uncovered:", f);
