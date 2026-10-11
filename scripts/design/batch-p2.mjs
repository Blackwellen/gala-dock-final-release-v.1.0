// Runs compare.mjs over every Phase 2 screen with a design reference and prints a sorted summary.
// Usage: node --env-file=.env --env-file=.env.local scripts/design/batch-p2.mjs [filter]
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const one = async (q) => (await q).data;
const neon = (await one(sb.from("events").select("id").eq("name", "Neon Nights Festival").limit(1).single())).id;
const wed = (await one(sb.from("events").select("id").eq("management", "consumer").ilike("name", "%wedding%").order("created_at").limit(1).single())).id;
const { data: alex } = await sb.auth.admin.listUsers({ perPage: 200 }); const cust = alex.users.find(u => u.email === "alex.thompson@example.com").id;
const tix = (await one(sb.from("tickets").select("id").eq("event_id", neon).eq("holder_id", cust).limit(1).single()))?.id;
const inv = (await one(sb.from("invoices").select("id").eq("number", "INV-1047").limit(1).single()))?.id;
const jc = (await one(sb.from("crew_members").select("id").ilike("name", "James Carter%").limit(1).single()))?.id;
const D = "Designs/customer & Organizer workspace/";
const L = [
  ["customer", "/home", "artifacts/visual/home-ref.png", "c-home"],
  ["customer", "/account", D + "Gala·Dock Account Dashboard.png", "c-cu-013"],
  ["customer", "/account/tickets", D + "Gala·Dock Ticket Dashboard.png", "c-cu-009"],
  ["customer", `/account/tickets/${tix}`, D + "Neon Nights Festival Ticket Dashboard.png", "c-cu-010"],
  ["customer", "/account/saved", D + "Gala·Dock Saved Events Dashboard.png", "c-cu-011"],
  ["customer", "/account/reviews", D + "Gala·Dock Reviews Dashboard.png", "c-cu-012"],
  ["customer", `/account/events/${wed}/guests-tickets`, D + "Gala·Dock Guest Management Dashboard.png", "c-cu-006"],
  ["customer", `/account/events/${wed}/plan`, D + "Gala·Dock Wedding Planning Dashboard(2).png", "c-cu-005"],
  ["customer", `/account/events/${wed}/money`, D + "Gala·Dock Wedding Money Dashboard.png", "c-cu-007"],
  ["customer", `/account/events/${wed}/messages`, D + "Gala·Dock Wedding Messaging Dashboard.png", "c-cu-008"],
  ["customer", `/account/events/${wed}/build`, D + "GalaDock Wedding Event Planner Dashboard.png", "c-cu-004"],
  ["customer", "/plan", D + "GalaDock Event Planning Wizard.png", "c-cuw01-1"],
  ["customer", "/events/neon-nights", D + "image-gen-3(20261009-171518).png", "c-event-public"],
  ["organizer", "/organizer/team", D + "Gala Dock Team Dashboard.png", "c-org-016"],
  ["organizer", `/organizer/team/${jc}`, D + "Gala·Dock Team Profile Dashboard.png", "c-org-017"],
  ["organizer", "/organizer/money", D + "Gala Dock Event Finance Dashboard.png", "c-org-018"],
  ["organizer", `/organizer/money/invoices/${inv}`, D + "Gala Dock Invoice Dashboard.png", "c-org-019"],
  ["organizer", `/organizer/money/invoices/new?from=${inv}&duplicate=1`, D + "Gala·Dock Invoice Creation Dashboard.png", "c-orgw06-1"],
  ["organizer", "/organizer/agent", D + "Gala Agent Event Operations Dashboard.png", "c-org-020"],
  ["organizer", "/organizer/settings", D + "Gala Dock Workspace Settings Dashboard.png", "c-org-021"],
  ["organizer", "/organizer/tickets", D + "Gala Dock Event Promotion Dashboard.png", "c-org-011"],
  ["organizer", `/organizer/events/${neon}/page`, D + "Neon Nights Festival Page Editor.png", "c-org-012"],
  ["organizer", `/organizer/events/${neon}/promotion`, D + "Neon Nights Promotion Dashboard.png", "c-org-014"],
  ["organizer", `/organizer/events/${neon}/media`, D + "Neon Nights Festival Poster Builder.png", "c-org-015", "5000"],
  ["organizer", `/organizer/events/${neon}/template`, D + "Save Event as Template Dashboard.png", "c-orgw07-1"],
  ["organizer", "/organizer/events/new?step=1", D + "Modern Event Creation Wizard Dashboard.png", "c-orgw01-1"],
  ["organizer", `/organizer/promotions/new?event=${neon}&step=1`, D + "Neon Nights Promotion Dashboard2.png", "c-orgw05-1"],
  ["organizer", `/organizer/events/${neon}/tickets/setup?step=1`, D + "Gala·Dock Ticket Setup Dashboard.png", "c-w03-1"],
  ["organizer", `/organizer/events/${neon}/tickets/setup?step=2`, D + "Neon Nights Ticket Setup Dashboard.png", "c-w03-2"],
  ["organizer", `/organizer/events/${neon}/tickets/setup?step=4`, D + "Gala Dock Ticket Setup Dashboard.png", "c-w03-4"],
];
const filter = process.argv[2]; const out = [];
for (const [role, path, ref, name, settle = "1500"] of L) {
  if (filter && !name.includes(filter)) continue;
  try {
    const r = execFileSync(process.execPath, ["--env-file=.env", "--env-file=.env.local", "scripts/design/compare.mjs", role, path, ref, name, `--settle=${settle}`], { env: { ...process.env, WAIT: "load", MSYS_NO_PATHCONV: "1" }, encoding: "utf8", timeout: 180_000 });
    const line = r.trim().split("\n").pop(); const m = line.match(/page ([\d.]+)%/); out.push([Number(m?.[1] ?? 99), line.slice(0, 170)]); console.log(line.slice(0, 170));
  } catch (e) { out.push([99, `${name}: FAILED ${String(e.message).slice(0, 120)}`]); console.log(`${name}: FAILED`); }
}
console.log("\n— sorted —"); for (const [, l] of out.sort((a, b) => b[0] - a[0])) console.log(l);
