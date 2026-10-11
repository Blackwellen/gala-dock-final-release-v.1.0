// Aligns Neon Nights demo data with the design references (deterministic visual fixtures; all real records).
// Idempotent; imported at the end of seed-demo-extras.mjs. Usage alone: node --env-file=.env --env-file=.env.local scripts/seed-align.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = (r, what) => { if (r.error) { console.error(what, r.error); process.exit(1); } return r.data; };
const raw = sb.from.bind(sb); sb.from = t => { const q = raw(t); const ins = q.insert.bind(q); q.insert = (v, o = {}) => ins(v, { defaultToNull: false, ...o }); return q; };
const iso = d => new Date(Date.now() + d * 864e5).toISOString();

const neon = must(await sb.from("events").select("id,workspace_id,starts_at").eq("slug", "neon-nights").single(), "neon");
const W = neon.workspace_id;
must(await sb.from("events").update({ target_profit: 28500, budget_total: 120000, capacity: 2000 }).eq("id", neon.id), "neon commercials");

// Ticket tiers exactly as the Sell & Promote reference. The customer's two GA tickets are re-issued after a reset.
const { data: oldTiers } = await sb.from("ticket_tiers").select("name").eq("event_id", neon.id);
const wanted = ["Complimentary", "Early Bird", "General Admission", "Group (4+)", "VIP"];
if ((oldTiers ?? []).map(t => t.name).sort().join() !== wanted.join()) {
  const cust = must(await sb.from("profiles").select("id").eq("full_name", "Alex Thompson").single(), "customer");
  await sb.from("check_ins").delete().eq("event_id", neon.id);
  await sb.from("tickets").delete().eq("event_id", neon.id);
  await sb.from("ticket_tiers").delete().eq("event_id", neon.id);
  const tiers = must(await sb.from("ticket_tiers").insert([
    { event_id: neon.id, sort: 0, name: "Early Bird", description: "Limited early release", kind: "early", price: 25, quantity: 500, sold: 320, status: "on_sale", sale_start: iso(-40), sale_end: iso(4), release_name: "Phase 1", color: "#16a34a" },
    { event_id: neon.id, sort: 1, name: "General Admission", description: "Standard entry to the festival", kind: "general", price: 35, quantity: 1000, sold: 540, status: "on_sale", sale_start: iso(-30), sale_end: iso(13), release_name: "Phase 2", color: "#2563eb" },
    { event_id: neon.id, sort: 2, name: "VIP", description: "Premium viewing areas & lounge", kind: "vip", price: 75, quantity: 400, sold: 280, status: "on_sale", sale_start: iso(-30), sale_end: iso(13), release_name: "Phase 2", color: "#7c3aed" },
    { event_id: neon.id, sort: 3, name: "Group (4+)", description: "Discounted group entry", kind: "group", price: 30, quantity: 200, sold: 100, status: "on_sale", sale_start: iso(-30), sale_end: iso(13), release_name: "Phase 2", color: "#f59e0b" },
    { event_id: neon.id, sort: 4, name: "Complimentary", description: "Staff, press and guests", kind: "comp", price: 0, quantity: 60, sold: 0, status: "hidden", color: "#64748b" },
  ]).select(), "neon tiers");
  const ga = tiers.find(t => t.name === "General Admission");
  must(await sb.from("tickets").insert([
    { code: "GLD-NEON-6F3K-9P2M", event_id: neon.id, tier_id: ga.id, holder_id: cust.id, attendee_name: "Alex Thompson", attendee_email: "alex.thompson@example.com", order_ref: "GLD-2025-0147", price_paid: 35 },
    { code: "GLD-NEON-7H2L-4Q8N", event_id: neon.id, tier_id: ga.id, holder_id: cust.id, attendee_name: "Taylor Morgan", attendee_email: "taylor@example.com", order_ref: "GLD-2025-0147", price_paid: 35 },
  ]), "neon customer tickets");
  must(await sb.rpc("seed_backfill_tickets", { p_days: 30 }), "neon backfill");
}

// Suppliers: RFQ quote options are alternatives (backup). Primary bookings: 10, with 8 confirmed.
await sb.from("build_items").update({ role: "backup" }).eq("event_id", neon.id).not("request_id", "is", null);
const order = [["Riverside Park", "confirmed"], ["Sound & Lighting Pro", "confirmed"], ["Austin Events Catering", "awaiting"], ["Elite Security", "confirmed"], ["Stage & Rigging Co.", "confirmed"]];
for (const [i, [title, status]] of order.entries()) await sb.from("build_items").update({ sort: i, status }).eq("event_id", neon.id).eq("title", title);
await sb.from("build_items").update({ amount: 2600 }).eq("event_id", neon.id).eq("title", "Stage & Rigging Co.");
const extra = [["drinks", "Bar Operations Co", "4 bars, staff & stock", "bc-riverside-bars", 1200, "confirmed"], ["staff", "MediCare Events", "Medical cover (2 teams)", "s-elite-security", 900, "confirmed"], ["hire", "Waste Management Ltd", "Waste & recycling", "s-marquees", 1800, "awaiting"], ["hire", "Toilet Hire Co", "Luxury & accessible units", "s-marquees", 1300, "confirmed"], ["production", "ScanGate Ticketing", "Entry scanning", "s-snapshot", 500, "confirmed"]];
const { data: have } = await sb.from("build_items").select("title").eq("event_id", neon.id).in("title", extra.map(x => x[1]));
const haveSet = new Set((have ?? []).map(h => h.title));
const add = extra.filter(x => !haveSet.has(x[1]));
if (add.length) must(await sb.from("build_items").insert(add.map(([category, title, pkg, img, amount, status], i) => ({ event_id: neon.id, sort: 5 + i, category, title, package: pkg, image: `/assets/gd/${img}.webp`, amount, status }))), "neon extra suppliers");

// Payments → actual costs ≈ £38,200 together with ledger costs; outstanding payables as in the Money reference.
const { count: payCount } = await sb.from("payments").select("id", { count: "exact", head: true }).eq("event_id", neon.id);
if (!payCount) must(await sb.from("payments").insert([
  { event_id: neon.id, payee: "Riverside Park", kind: "deposit", amount: 18500, status: "paid", paid_at: iso(-40) },
  { event_id: neon.id, payee: "Sound & Lighting Pro", kind: "deposit", amount: 6000, status: "paid", paid_at: iso(-30) },
  { event_id: neon.id, payee: "Elite Security", kind: "deposit", amount: 4500, status: "paid", paid_at: iso(-20) },
  { event_id: neon.id, payee: "Riverside Park (Venue)", kind: "balance", amount: 10000, status: "due", due_at: iso(14) },
  { event_id: neon.id, payee: "DJ Luna (Artist)", kind: "balance", amount: 5000, status: "scheduled", due_at: iso(13) },
  { event_id: neon.id, payee: "Austin Catering", kind: "deposit", amount: 3250, status: "scheduled", due_at: iso(17) },
]), "neon payments");

// People: 12 members + 16 external crew (Team reference); Neon roles 25 with 18 assigned.
const people = [["Sarah Chen", "Production Assistant", "member"], ["Marcus Lee", "Marketing Designer", "member"], ["Priya Shah", "Finance Manager", "member"], ["Tom Hughes", "Client Manager", "member"], ["Hannah Ross", "Operations Coordinator", "member"], ["Leon Price", "Partnerships Lead", "member"], ["Amira Patel", "Ticketing Manager", "member"], ["Dev Mehta", "Logistics Lead", "member"], ["Jamie Cole", "Stage Manager", "crew"], ["Ella Ward", "Steward Lead", "crew"], ["Omar Aziz", "Rigger", "crew"], ["Grace Hill", "Runner", "crew"], ["Ben Ford", "Steward", "crew"], ["Zara Khan", "Steward", "crew"], ["Leo Grant", "Bar Staff", "crew"], ["Ruby Lane", "Bar Staff", "crew"]];
const { data: crewHave } = await sb.from("crew_members").select("name").eq("workspace_id", W);
const crewNames = new Set((crewHave ?? []).map(c => c.name));
const avatars = ["av-sophie-malik", "av-ryan-brooks", "av-mia-chen", "av-liam-patel", "av-ava-thompson", "av-noah-evans", "av-isabella-garcia", "av-daniel-kim", "av-chloe-roberts", "av-james-carter"];
const newPeople = people.filter(([n]) => !crewNames.has(n));
if (newPeople.length) must(await sb.from("crew_members").insert(newPeople.map(([name, role, member_type], i) => ({ workspace_id: W, name, role, member_type, status: "available", avatar: `/assets/gd/${avatars[i % avatars.length]}.webp`, email: `${name.split(" ")[0].toLowerCase()}.${name.split(" ")[1].toLowerCase()}@example.com`, location: "London, UK", skills: [role], day_rate: member_type === "member" ? 220 : 140 }))), "people");
const crewAll = must(await sb.from("crew_members").select("id,name,role").eq("workspace_id", W), "crew all");
const neonShifts = must(await sb.from("shifts").select("crew_id,headcount").eq("event_id", neon.id), "neon shifts");
const assigned = new Set(neonShifts.map(s => s.crew_id).filter(Boolean));
const base = new Date(neon.starts_at);
const fresh = crewAll.filter(c => !assigned.has(c.id)).slice(0, Math.max(0, 18 - assigned.size));
if (fresh.length) must(await sb.from("shifts").insert(fresh.map((c, i) => ({ workspace_id: W, event_id: neon.id, crew_id: c.id, role: c.role, title: "Neon Nights Festival", location: "Riverside Park", starts_at: new Date(base.getTime() - (4 - (i % 3)) * 36e5).toISOString(), ends_at: new Date(base.getTime() + 6 * 36e5).toISOString(), status: i % 4 === 0 ? "pending" : "confirmed" }))), "neon crew shifts");
const all2 = must(await sb.from("shifts").select("headcount").eq("event_id", neon.id), "neon shifts 2");
const need = 25 - all2.reduce((s, x) => s + (x.headcount ?? 1), 0);
if (need > 0) must(await sb.from("shifts").insert(Array.from({ length: need }, (_, i) => ({ workspace_id: W, event_id: neon.id, crew_id: null, role: ["Steward", "Steward", "Bar Staff", "Runner", "Security", "Cleaner", "Box Office"][i % 7], title: "Unfilled role", location: "Riverside Park", starts_at: new Date(base.getTime() - 2 * 36e5).toISOString(), ends_at: new Date(base.getTime() + 6 * 36e5).toISOString(), status: "draft" }))), "unfilled roles");
// RFQ quote detail (inclusions/exclusions) for the comparison reference.
for (const [title, inclusions, exclusions] of [["StagePro UK", ["Stage (12m x 8m)", "Full sound system", "Lighting & lasers", "LED screens (2 x 6m)", "Technical crew (8)"], "Power (venue)"], ["Elite AV Events", ["Stage (10m x 8m)", "Sound system", "Lighting", "LED screens (2 x 5m)", "Technical crew (6)"], "Power, generators"], ["Sound & Light Co.", ["Stage (10m x 6m)", "Sound system", "Lighting", "LED screens (2 x 4m)"], "Technical crew, power"], ["Fusion Events", ["Stage (12m x 10m)", "Full production", "LED screens (3 x 6m)", "Technical crew (10)", "Generators"], ""]]) {
  const { data: it } = await sb.from("build_items").select("id,quote").eq("event_id", neon.id).eq("title", title).not("request_id", "is", null).maybeSingle();
  if (it) await sb.from("build_items").update({ quote: { ...(it.quote ?? {}), inclusions, exclusions } }).eq("id", it.id);
}
// Activity (audit log), risk register and milestones for the Overview reference.
{
  const owner = must(await sb.from("events").select("owner_id").eq("id", neon.id).single(), "owner").owner_id;
  await sb.from("audit_events").delete().filter("metadata->>event_id", "eq", neon.id).filter("metadata->>seed", "eq", "true");
  const hrs = h => new Date(Date.now() - h * 36e5).toISOString();
  must(await sb.from("audit_events").insert([
    ["booking.confirmed", "Supplier confirmed – Sound & Lighting Pro", 2], ["order.created", "New ticket order – 4 x General Admission (£180)", 3],
    ["crew.assigned", "Team member assigned – Jamie Carter (Stage Manager)", 5], ["media.approved", "Marketing asset approved – Neon poster v3", 7], ["contract.signed", "Venue contract signed – Riverside Park", 24],
  ].map(([event, text, h]) => ({ actor_id: owner, workspace_id: W, event, metadata: { event_id: neon.id, text, seed: "true" }, created_at: hrs(h) }))), "neon activity");
  const t0 = new Date(neon.starts_at).getTime(), at = d => new Date(t0 - d * 864e5).toISOString();
  await sb.from("tasks").delete().eq("event_id", neon.id).in("title", ["Final supplier confirmations", "Marketing campaign launch", "Finalise crew schedule", "Venue walkthrough", "Venue capacity approval", "Weather contingency plan", "First aid provider"]);
  must(await sb.from("tasks").insert([
    { title: "Final supplier confirmations", detail: "3 pending", priority: "high", milestone: true, due_at: at(16), category: "general" },
    { title: "Marketing campaign launch", detail: "Ready to go", priority: "medium", milestone: true, status: "done", due_at: at(12), category: "marketing" },
    { title: "Finalise crew schedule", detail: "In progress", priority: "medium", milestone: true, status: "in_progress", due_at: at(6), category: "general" },
    { title: "Venue walkthrough", detail: "Not started", priority: "medium", milestone: true, due_at: at(2), category: "general" },
    { title: "Venue capacity approval", detail: "Final sign-off required", priority: "medium", due_at: at(8), category: "risk" },
    { title: "Weather contingency plan", detail: "Needs review before event", priority: "medium", due_at: at(5), category: "risk" },
    { title: "First aid provider", detail: "Awaiting quotation", priority: "medium", due_at: at(9), category: "risk" },
  ].map(t => ({ status: "todo", ...t, event_id: neon.id, workspace_id: W }))), "neon milestones & risks");
}
console.log(JSON.stringify({ aligned: true, crew: crewAll.length }));
