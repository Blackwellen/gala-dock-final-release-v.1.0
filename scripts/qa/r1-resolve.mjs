// R1: resolves one instance per detail route the crawler found no link to, reading AS each demo user (anon key + password sign-in,
// so RLS decides exactly what that user can open — no service-role lookups). Adds them to artifacts/release/r1/plan.json and
// rewrites artifacts/release/r1/unresolved.json with the reason for anything still missing.
// Usage: node --env-file=.env --env-file=.env.local scripts/qa/r1-resolve.mjs
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PLAN = "artifacts/release/r1/plan.json", UNRES = "artifacts/release/r1/unresolved.json", LEDGER = "artifacts/release/r1/fixtures.json";
const plan = JSON.parse(fs.readFileSync(PLAN, "utf8"));
const ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf8")) : {};
const ACC = { customer: ["alex.thompson@example.com", process.env.DEMO_CUSTOMER_PASSWORD], organizer: ["alex.events@example.com", process.env.DEMO_ORGANIZER_PASSWORD], provider: ["provider.demo@example.com", process.env.DEMO_PROVIDER_PASSWORD] };
const as = async who => { const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email: ACC[who][0], password: ACC[who][1] }); if (error) throw new Error(`${who}: sign-in failed`); return c; };
const first = async (q) => { const { data, error } = await q.limit(1); return error ? { error: error.message } : { id: data?.[0] }; };
const add = [], miss = [];
const put = (label, pattern, route) => { if (!plan.some(p => p.route === route)) add.push({ route, pattern, label, state: `artifacts/auth/r1-${label}.json`, set: "full" }); };
const need = (label, pattern, why) => miss.push({ label, pattern, why });

const cu = await as("customer"), org = await as("organizer"), pro = await as("provider");
const tryId = async (label, pattern, client, table, cols, build, filter = q => q) => {
  const r = await first(filter(client.from(table).select(cols)));
  if (r.id) put(label, pattern, build(r.id)); else need(label, pattern, r.error ? `query ${table} refused: ${r.error}` : `no ${table} row visible to the demo ${label}`);
};
// messages
for (const [label, c] of [["customer", cu], ["organizer", org], ["provider", pro]]) await tryId(label, "/messages/[id]", c, "conversation_participants", "conversation_id", r => `/messages/${r.conversation_id}`);
await tryId("provider", "/provider/messages/[id]", pro, "threads", "id", r => `/provider/messages/${r.id}`);
// provider details
await tryId("provider", "/provider/beo/[id]", pro, "provider_jobs", "id", r => `/provider/beo/${r.id}`);
await tryId("provider", "/provider/quotes/[id]", pro, "provider_quotes", "id", r => `/provider/quotes/${r.id}`);
await tryId("provider", "/provider/quotes/[id]/print", pro, "provider_quotes", "id", r => `/provider/quotes/${r.id}/print`);
await tryId("provider", "/provider/emergency/[id]", pro, "emergency_requests", "id", r => `/provider/emergency/${r.id}`);
// organiser marketplace
await tryId("organizer", "/organizer/marketplace/requests/[id]", org, "provider_requests", "id", r => `/organizer/marketplace/requests/${r.id}`);
await tryId("organizer", "/organizer/marketplace/bookings/[id]", org, "build_items", "id,listing_id", r => `/organizer/marketplace/bookings/${r.id}`, q => q.not("listing_id", "is", null));
await tryId("organizer", "/organizer/marketplace/bookings/[id]/catering", org, "build_items", "id,listing_id", r => `/organizer/marketplace/bookings/${r.id}/catering`, q => q.not("listing_id", "is", null));
// customer bookings on the customer's own event
await tryId("customer", "/account/events/[id]/bookings/[item]", cu, "build_items", "id,event_id,listing_id", r => `/account/events/${r.event_id}/bookings/${r.id}`, q => q.not("listing_id", "is", null));
await tryId("customer", "/account/events/[id]/bookings/[item]/catering", cu, "build_items", "id,event_id,listing_id", r => `/account/events/${r.event_id}/bookings/${r.id}/catering`, q => q.not("listing_id", "is", null));
await tryId("customer", "/account/tickets/[id]/print", cu, "tickets", "id", r => `/account/tickets/${r.id}/print`);
// disputes (only exist after a card dispute / booking dispute is opened)
await tryId("customer", "/account/disputes/[id]", cu, "booking_disputes", "id", r => `/account/disputes/${r.id}`);
await tryId("organizer", "/organizer/disputes/[id]", org, "booking_disputes", "id", r => `/organizer/disputes/${r.id}`);
await tryId("provider", "/provider/disputes/[id]", pro, "booking_disputes", "id", r => `/provider/disputes/${r.id}`);
// door scanner: the organiser can scan their own event (can_scan_event_any) — no separate token needed
await tryId("organizer", "/door/[eventId]", org, "events", "id", r => `/door/${r.id}`, q => q.eq("slug", "elite-sounds-night"));
// agent section routes redirect to ?tab=… (pages only, no runs)
for (const s of ["routines", "approvals", "history"]) { put("organizer", "/organizer/agent/[section]", `/organizer/agent/${s}`); put("provider", "/provider/agent/[section]", `/provider/agent/${s}`); }
// partner / promoter fixtures
if (ledger.promoters?.[0]) put("promoter", "/promoter/[promoterId]", `/promoter/${ledger.promoters[0]}`); else need("promoter", "/promoter/[promoterId]", "no promoter fixture");
if (!ledger.promoterCode && ledger.promoters?.[0]) { // our own disposable promoter row (service role, fixture only)
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  ledger.promoterCode = (await svc.from("promoters").select("code").eq("id", ledger.promoters[0]).single()).data?.code; fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
}
if (ledger.promoterCode) put("customer", "/r/[code]/consent", `/r/${ledger.promoterCode}/consent`);
if (ledger.purchase?.confirmation) put("customer", "/checkout/[event]/confirmation", ledger.purchase.confirmation); else need("customer", "/checkout/[event]/confirmation", "run r1-fixtures.mjs purchase first");
if (ledger.transfer?.accept) put("promoter", "/tickets/accept/[token]", ledger.transfer.accept); else need("customer", "/tickets/accept/[token]", "run r1-fixtures.mjs purchase first");
put("customer", "/checkout/[event]", "/checkout/elite-sounds-night");
// help slugs redirect to the public help centre (covered by the public Q71 lane)
for (const l of ["customer", "organizer", "provider"]) need(l, `/${l === "customer" ? "account" : l}/help/[slug]`, "redirects to the public /help/[slug] (covered by the public lane)");
need("partner", "/partner/statements/[id]", "a self-billing statement only exists after a partner payout run; not created on the live DB (money run)");

plan.push(...add);
fs.writeFileSync(PLAN, JSON.stringify(plan, null, 1));
const prev = fs.existsSync(UNRES) ? JSON.parse(fs.readFileSync(UNRES, "utf8")) : [];
const resolved = new Set(plan.map(p => p.pattern));
const merged = [...prev.filter(u => !resolved.has(u.pattern) && !miss.some(m => m.pattern === u.pattern && m.label === u.label)), ...miss.filter(m => !resolved.has(m.pattern) || /redirects/.test(m.why))];
fs.writeFileSync(UNRES, JSON.stringify(merged, null, 1));
console.log(`added ${add.length}: ${add.map(a => a.route).join(" ")}`);
console.log(`unresolved ${merged.length}: ${merged.map(m => `${m.label} ${m.pattern} (${m.why})`).join("; ")}`);
