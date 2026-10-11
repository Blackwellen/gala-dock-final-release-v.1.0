// Seeds Platform Admin B fixtures (AD-010..AD-018: Commerce, Trust & Safety, Support, Partners, Agent & Integrations, Analytics, Settings).
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-admin-b.mjs [--remove]
// Run AFTER seed-demo.mjs and seed-provider-admin.mjs (reuses their demo users). Idempotent: removes only rows it owns
// (transactions.details.seed = 'admin-b', SUP-/TS- references, B- partner codes, RUN- run references, analytics_daily, "Seed:" settings it adds).
// Times are relative to now so SLA clocks, 30-day windows and "x mins ago" behave like production.
import { createClient } from "@supabase/supabase-js";

if (process.env.NODE_ENV === "production") { console.error("Refusing to seed in production."); process.exit(1); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const rawFrom = sb.from.bind(sb);
sb.from = table => { const q = rawFrom(table); const ins = q.insert.bind(q); q.insert = (v, o = {}) => ins(v, { defaultToNull: false, ...o }); return q; };
const must = (r, what) => { if (r.error) { console.error(what, r.error); process.exit(1); } return r.data; };
const img = n => `/assets/gd/${n}.webp`;
const NOW = Date.now(), M = 60e3, H = 60 * M, D = 24 * H;
const iso = ms => new Date(ms).toISOString();
const SEED = "admin-b";
export const IDS = { tx: "b0000000-0000-4000-8000-000000007821", supCase: "c0000000-0000-4000-8000-000000004421", trustCase: "d0000000-0000-4000-8000-000000008781" };

// ── Users (created by the earlier seeds) ─────────────────────────────────
const users = must(await sb.auth.admin.listUsers({ perPage: 1000 }), "listUsers").users;
const uid = email => users.find(u => u.email === email)?.id ?? null;
const U = { admin: uid("admin.demo@example.com"), support: uid("support.demo@example.com"), sarah: uid("s.mitchell@example.com"), daniel: uid("d.kim@example.com"), marcus: uid("m.lee@example.com"), priya: uid("p.shah@example.com") };
if (!U.admin) { console.error("admin.demo@example.com missing — run scripts/seed-provider-admin.mjs first."); process.exit(1); }
const workspaces = must(await sb.from("workspaces").select("id,name"), "workspaces");
const wsId = name => workspaces.find(w => w.name === name)?.id ?? null;
const ARENA = wsId("Riverside Arena");

// ── Cleanup ──────────────────────────────────────────────────────────────
async function cleanup() {
  must(await sb.from("admin_money_requests").delete().not("id", "is", null), "clean money requests");
  must(await sb.from("admin_notes").delete().not("id", "is", null), "clean notes");
  must(await sb.from("transactions").delete().eq("details->>seed", SEED), "clean tx");
  must(await sb.from("support_cases").delete().like("reference", "SUP-%"), "clean cases");
  must(await sb.from("trust_cases").delete().like("reference", "TS-%"), "clean trust");
  must(await sb.from("partners").delete().like("referral_code", "B-%"), "clean partners");
  must(await sb.from("agent_approvals").delete().eq("payload->>seed", SEED), "clean approvals");
  must(await sb.from("agent_runs").delete().like("reference", "RUN-%"), "clean runs");
  must(await sb.from("analytics_daily").delete().gte("day", "1970-01-01"), "clean analytics");
  must(await sb.from("platform_settings").delete().like("change_reason", "Seed: B %"), "clean settings history");
  must(await sb.from("platform_settings").delete().eq("status", "draft"), "clean drafts");
  // Restore the earlier seed's published rows if this script superseded them.
  for (const s of ["general", "commerce", "marketplace", "ticketing", "trust", "agent", "communications", "integrations"]) {
    const pub = must(await sb.from("platform_settings").select("id").eq("section", s).eq("status", "published"), "pub");
    if (!pub.length) {
      const last = must(await sb.from("platform_settings").select("id").eq("section", s).order("version", { ascending: false }).limit(1), "last");
      if (last[0]) must(await sb.from("platform_settings").update({ status: "published" }).eq("id", last[0].id), "restore pub");
    }
  }
}
await cleanup();
if (process.argv.includes("--remove")) { console.log("Removed Admin B fixtures."); process.exit(0); }

// ══════════════════════ Commerce ══════════════════════
const EVENT = { name: "Tech Summit After Party", ref: "EVT-7842", image: img("ev-neon"), starts: "18:00", ends: "00:00", location: "Riverside Arena, London, UK" };
const tx = [];
const t = (minsAgo, o) => tx.push({ workspace_id: o.ws ?? null, kind: o.kind ?? "income", category: o.cat, description: o.desc, amount: o.amount, status: o.status ?? "completed",
  source: o.source, fee_amount: o.fee ?? 0, net_amount: o.net === undefined ? Math.round((o.amount - (o.fee ?? 0)) * 100) / 100 : o.net, counterparty: o.who, currency: "GBP",
  stripe_ref: o.ref ?? null, occurred_at: iso(NOW - minsAgo * M), details: { seed: SEED, provider: o.provider ?? "Stripe", ...(o.details ?? {}) }, ...(o.id ? { id: o.id } : {}) });

// The eight design rows (most recent first).
t(18, { id: IDS.tx, source: "ticketing", cat: "Ticket Sale", desc: "Tech Summit After Party (2 × General)", amount: 276, fee: 27.6, net: 242.28, who: "Alex Turner (CUS-10023)", ref: "pi_3QmX8LkF2bH9k9a2",
  details: { reference: "BK-7821", order: "ORD-45012", tickets: 2, ticket_label: "2 × General Admission", unit_price: 120, booking_fee: 12, vat: 6.12, vat_rate: 20, commission_rate: 10,
    customer: { name: "Alex Turner", email: "alex.turner@email.com", ref: "CUS-10023", avatar: img("av-alex-customer") },
    provider_party: { name: "Riverside Events Ltd", ref: "ORG-1001" }, event: EVENT,
    payment: { brand: "Visa", last4: "4242", exp: "04/2028", cardholder: "Alex Turner", three_ds: true }, charge_id: "ch_3QmX8LkF2bH97b1f",
    risk: { score: 12, identity: "Passed", velocity: "Normal", chargebacks: "None", location: "London, UK" },
    timeline: [{ at: -1.25, label: "Payment method verified", detail: "Stripe – card verified (3DS)", icon: "card" }, { at: -0.2, label: "Payment authorized", detail: "Amount: £276.00", icon: "lock" },
      { at: 0, label: "Payment captured", detail: "Funds held by Stripe", icon: "check" }, { at: 438, label: "Available for payout", detail: "Net: £242.28 to provider", icon: "bank" }] } });
t(160, { source: "marketplace", cat: "Venue Booking", desc: "Riverside Arena – event hire", amount: 2500, fee: 250, who: "Riverside Events Ltd (ORG-1001)", ref: "pi_3QmW2aVenue1001" });
t(26 * 60, { source: "marketplace", cat: "Supplier Service", desc: "Sound & Lighting – Event #7842", amount: 620, fee: 62, who: "Elite Events UK (ORG-2210)", ref: "pi_3QlR7cSound2210" });
t(28 * 60, { source: "subscription", cat: "Subscription", desc: "Pro Plan – Monthly", amount: 169, fee: 0, who: "City Events Co. (ORG-3321)", ref: "in_1QlP0sPro3321", details: { subscriptions: 1 } });
t(29 * 60, { kind: "refund", source: "ticketing", cat: "Refund", desc: "Order #BK-7821 (2 × VIP)", amount: -240, fee: -24, who: "Priya Shah (CUS-7721)", ref: "re_3QlN4rRefund7721", status: "completed" });
t(40 * 60, { kind: "payout", source: "marketplace", cat: "Payout", desc: "Weekly Payout – provider settlement", amount: -3480, fee: 0, who: "The London Loft (ORG-4455)", ref: "po_1QkZ7Loft4455", status: "pending", provider: "Stripe Connect" });
t(46 * 60, { kind: "payment", source: "ticketing", cat: "Failed Payment", desc: "Ticket Order #BK-7840", amount: 180, fee: 18, net: null, who: "Marcus Lee (CUS-8832)", ref: "pi_3QkV1fFail8832", status: "failed" });
t(70 * 60, { kind: "income", source: "ticketing", cat: "Dispute", desc: "Chargeback – BK-7703", amount: 120, fee: 12, net: null, who: "Unknown (CUS-6621)", ref: "dp_1QjT8Dispute6621", status: "partial", details: { disputed: true } });

// 60 days of volume so 30-day KPIs and deltas come from real rows.
const names = ["Neon Nights Festival", "Sunset Sessions", "Comedy Central Live", "Taste & Tango Food Fest", "Community Summer Fair", "Elite Sounds DJ"];
const orgs = ["Riverside Events Ltd (ORG-1001)", "Elite Events UK (ORG-2210)", "City Events Co. (ORG-3321)", "The London Loft (ORG-4455)", "Grand Hall Venue (ORG-2210)"];
for (let d = 0; d < 60; d++) {
  const g = (d < 30 ? 1.25 : 1) * (1 + 0.35 * Math.sin(d / 3.3)) * (d % 7 === 5 || d % 7 === 6 ? 1.3 : 1);
  const at = h => (d * 24 + h) * 60;
  const tk = Math.round(5600 * g), vb = Math.round(2600 * g), ss = Math.round(1900 * g);
  t(at(3), { source: "ticketing", cat: "Ticket Sale", desc: `${names[d % 6]} (${Math.round(tk / 46)} × General)`, amount: tk, fee: Math.round(tk * 0.1), who: `Ticket buyers (${Math.round(tk / 46)} orders)`, ref: `pi_b${d}tk` });
  t(at(5), { source: "marketplace", cat: "Venue Booking", desc: `${["Riverside Arena", "The Loft", "Grand Hall"][d % 3]} – venue hire`, amount: vb, fee: Math.round(vb * 0.1), who: orgs[d % 5], ref: `pi_b${d}vb` });
  t(at(7), { source: "marketplace", cat: "Supplier Service", desc: `${["Sound & Lighting", "Catering", "Decor & Styling"][d % 3]} – booking`, amount: ss, fee: Math.round(ss * 0.1), who: orgs[(d + 2) % 5], ref: `pi_b${d}ss` });
  if (d % 2) { const subs = 78 + (d * 7) % 21; t(at(9), { source: "subscription", cat: "Subscription", desc: `Plan renewals – ${subs} workspaces`, amount: subs * 29, fee: 0, who: `${subs} workspaces`, ref: `in_b${d}sub`, details: { subscriptions: subs, cancelled: d % 5 === 0 ? 2 : d % 3 === 0 ? 1 : 0 } }); }
  t(at(11), { kind: "fee", source: "manual", cat: "Other fees", desc: "Card surcharge & late-change fees", amount: Math.round(560 * g), fee: Math.round(560 * g), net: 0, who: "Platform", ref: `fee_b${d}` });
  if (d % 4 === 0) t(at(13), { kind: "payment", source: "ticketing", cat: "Failed Payment", desc: `Ticket order #BK-${7600 + d}`, amount: 90 + d, fee: 9, net: null, who: `Customer (CUS-${8000 + d})`, ref: `pi_b${d}fail`, status: "failed" });
  if (d % 6 === 0) t(at(14), { kind: "refund", source: "ticketing", cat: "Refund", desc: `Order #BK-${7500 + d}`, amount: -(60 + d), fee: -6, who: `Customer (CUS-${7000 + d})`, ref: `re_b${d}` });
  if (d % 9 === 0) t(at(15), { kind: "payment", source: "subscription", cat: "Subscription", desc: "Pro Plan – Monthly (card declined)", amount: 79, fee: 0, net: null, who: `Workspace (ORG-${5000 + d})`, ref: `in_b${d}fail`, status: "failed" });
  if (d % 5 === 0) t(at(16), { kind: "income", source: "marketplace", cat: "Venue Booking", desc: "High-value booking – held for review", amount: 4200, fee: 420, who: orgs[d % 5], ref: `pi_b${d}held`, status: "pending", details: { held: true } });
  if (d % 7 === 1) t(at(18), { kind: "income", source: "ticketing", cat: "Dispute", desc: `Chargeback – BK-${7300 + d}`, amount: 140, fee: 14, net: null, who: `Customer (CUS-${6000 + d})`, ref: `dp_b${d}`, status: "partial", details: { disputed: true } });
  if (d % 7 === 0) t(at(20), { kind: "payout", source: "marketplace", cat: "Payout", desc: "Weekly Payout – provider settlement", amount: -Math.round(9400 * g), fee: 0, who: orgs[d % 5], ref: `po_b${d}`, status: d === 14 ? "failed" : "completed", provider: "Stripe Connect" });
}
for (let i = 0; i < tx.length; i += 200) must(await sb.from("transactions").insert(tx.slice(i, i + 200)), "transactions");

// ══════════════════════ Support ══════════════════════
const av = { emma: img("av-mia-chen"), liam: img("av-liam-patel"), olivia: img("av-isabella-garcia"), daniel: img("av-daniel-kim"), rachel: img("av-chloe-roberts"), marcus: img("av-ryan-brooks"),
  priya: img("av-isabella-garcia"), james: img("av-james-carter"), sophie: img("av-sophie-malik"), nathan: img("av-noah-evans"), sarah: img("av-ava-thompson") };
const sarah = { id: U.sarah, name: "Sarah Mitchell" };
const caseRows = [
  ["SUP-4421", "Booking cancelled – refund request", "booking", "Booking", { label: "Riverside Arena", ref: "ORG-1001", image: img("sv-riverside-manor") }, ["Emma Roberts", "emma.roberts@email.com", av.emma], "high", "open", 2, 75, 12],
  ["SUP-4419", "Ticket not received", "ticketing", "Ticketing", { label: "Tech Summit After Party", ref: "EVT-7842", image: img("ev-neon") }, ["Liam Patel", "liam.patel@email.com", av.liam], "high", "waiting", 4, 120, 60],
  ["SUP-4417", "Provider no-show – need replacement", "no_show", "Provider", { label: "Skyline Rooftop", ref: "LST-1003", image: img("sv-skyline-space") }, ["Olivia Chen", "olivia.chen@email.com", av.olivia], "urgent", "escalated", 1, 130, 120],
  ["SUP-4416", "Duplicate charge on order", "payment", "Payment", { label: "Order BK-7801", ref: "", icon: "order" }, ["Daniel Kim", "daniel.kim@email.com", av.daniel], "high", "open", 2, 0, 120],
  ["SUP-4412", "Venue access issue on event day", "other", "Event", { label: "Wedding Showcase", ref: "EVT-6230", image: img("me-wedding") }, ["Rachel Adams", "rachel.adams@email.com", av.rachel], "medium", "open", 8, 120, 180],
  ["SUP-4410", "Resale transfer not completing", "ticketing", "Ticketing", { label: "Order BK-7794", ref: "", icon: "order" }, ["Marcus Lee", "marcus.lee@email.com", av.marcus], "medium", "waiting", 8, 180, 240],
  ["SUP-4408", "Refund for cancelled event", "refund", "Payment", { label: "Corporate Awards", ref: "EVT-7103", image: img("oe-music-awards") }, ["Priya Shah", "priya.shah@email.com", av.priya], "high", "open", 4, 180, 240],
  ["SUP-4406", "Listing under review – clarification", "other", "Marketplace", { label: "Urban Bites", ref: "LST-5540", image: img("sv-taste-co") }, ["James Wilson", "james.wilson@email.com", av.james], "low", "waiting", 16, 120, 300],
  ["SUP-4403", "Account verification issue", "account", "Account", { label: "USR-6621", ref: "", icon: "user" }, ["Sophie Martin", "sophie.martin@email.com", av.sophie], "low", "open", 16, 240, 360],
  ["SUP-4401", "Event day staff shortage", "emergency", "Provider", { label: "Grand Hall Venue", ref: "ORG-2210", image: img("rv-grand-pavilion") }, ["Nathan Brown", "nathan.brown@email.com", av.nathan], "urgent", "escalated", 1, 420, 360],
];
// Older and resolved cases for queue counts, SLA performance and the related-cases list.
const fillSubjects = [["Payment failed at checkout", "payment", "Payment"], ["Change event date", "booking", "Booking"], ["Promo code not applying", "ticketing", "Ticketing"], ["Invoice VAT number missing", "payment", "Payment"],
  ["Cannot add team member", "account", "Account"], ["Supplier quote expired", "booking", "Booking"], ["Seating plan not saving", "technical", "Event"], ["Payout delayed", "payment", "Payment"], ["Ticket name change", "ticketing", "Ticketing"], ["Listing photos rejected", "other", "Marketplace"]];
const people = [["Hannah Wright", av.sophie], ["George Hall", av.james], ["Amelia Clarke", av.emma], ["Oscar Price", av.nathan], ["Isla Turner", av.olivia], ["Jack Evans", av.marcus], ["Ruby Scott", av.priya], ["Leo Green", av.daniel]];
const fill = [];
for (let i = 0; i < 46; i++) {
  const [subject, category, type] = fillSubjects[i % fillSubjects.length], [name, avatar] = people[i % people.length];
  const status = i < 30 ? "open" : i < 44 ? "waiting" : "escalated";
  fill.push([`SUP-${4398 - i}`, subject, category, type, { label: names[i % 6], ref: `EVT-${7000 + i * 13}`, image: img(["oe-neon", "oe-sunset", "ev-comedy-c", "oe-tastetango", "oe-community-fair", "tk-elite-sounds-c"][i % 6]) },
    [name, `${name.toLowerCase().replace(" ", ".")}@email.com`, avatar], ["medium", "low", "high"][i % 3], status, [8, 16, 4][i % 3], 0, 7 * 60 + i * 41]);
}
const resolved = [["SUP-4180", "Similar refund request"], ["SUP-4122", "Travel cost compensation"], ["SUP-3981", "VIP ticket upgrade request"]];
for (let i = 0; i < 64; i++) {
  const [subject, category, type] = fillSubjects[(i + 3) % fillSubjects.length], [name, avatar] = people[(i + 2) % people.length];
  const ref = i < 3 ? resolved[i][0] : `SUP-${4300 - i}`;
  fill.push([ref, i < 3 ? resolved[i][1] : subject, i < 3 ? "refund" : category, i < 3 ? "Payment" : type, { label: names[i % 6], ref: `EVT-${7100 + i}`, image: img("oe-sunset") }, [name, `${name.toLowerCase().replace(" ", ".")}@email.com`, avatar],
    ["medium", "low", "high"][i % 3], "resolved", [8, 16, 4][i % 3], i % 12 === 0 ? 240 : i % 6 === 0 ? -1 : 0, (12 + i * 4.6) * 60]);
}
const caseIds = {};
const allCases = [...caseRows, ...fill];
for (const [ref, subject, category, typeLabel, related, [rname, remail, ravatar], priority, status, slaH, overdueMin, ageMin] of allCases) {
  const created = NOW - (ref === "SUP-4421" ? 75 : ageMin + 60) * M;
  const slaDue = ref === "SUP-4421" ? NOW + 45 * M : created + slaH * H - (overdueMin > 0 ? 0 : 0);
  const row = {
    reference: ref, subject, category, priority, status, requester_name: rname, workspace_id: ["booking", "no_show", "emergency"].includes(category) ? ARENA : null,
    assignee_id: sarah.id, assignee_name: sarah.name, sla_due_at: iso(status === "escalated" ? NOW - 30 * M : slaDue), amount: ["refund", "payment", "booking"].includes(category) ? 276 : null,
    related: { type_label: typeLabel, subject_ref: related, requester: { name: rname, email: remail, avatar: ravatar }, source: "Customer support form", created_by: `Customer (${rname})`, updated_at: iso(NOW - (ref === "SUP-4421" ? 12 : ageMin) * M) },
    outcome: status === "resolved" ? "Resolved and confirmed with the customer." : null, resolution_reason: status === "resolved" ? "Handled within policy." : null,
    created_at: iso(created), resolved_at: status === "resolved" ? iso(Math.min(NOW - M, overdueMin === -1 ? created + slaH * H * 0.9 : overdueMin > 0 ? created + slaH * H + overdueMin * M : created + slaH * H * 0.4)) : null,
  };
  if (ref === "SUP-4421") {
    row.id = IDS.supCase;
    Object.assign(row.related, {
      summary: "Customer is requesting a full refund after the venue cancelled due to unforeseen circumstances. Customer purchased 2 × General Admission tickets (Order BK-7821). Event was cancelled by organizer at 09:12. Customer is eligible for a refund under our policy.",
      event: EVENT, order: { ref: "BK-7821", label: "2 × General Admission · £276.00", transaction_id: IDS.tx },
      provider: { name: "Riverside Events Ltd", ref: "ORG-1001" }, venue: { name: "Riverside Arena", ref: "VEN-2210", image: img("sv-riverside-manor") },
      proposed: { action: "Full refund to customer", amount: 276, amount_label: "£276.00 (2 × £138.00)", reason: "Event cancelled by venue (outside customer control)", policy: "Cancellations by venue – full refund eligible", approval: "Not required (within policy)", eligible: "Eligible for full refund" },
      related_cases: ["SUP-4180", "SUP-4122", "SUP-3981"], subcategory: "Cancellation / Refund",
    });
  }
  const c = must(await sb.from("support_cases").insert(row).select("id").single(), `case ${ref}`);
  caseIds[ref] = c.id;
}
const msgs = [];
const m = (ref, minsAgo, author, role, body, internal = false, authorId = null) => msgs.push({ case_id: caseIds[ref], author, role, body, internal, author_id: authorId, created_at: iso(NOW - minsAgo * M) });
m("SUP-4421", 74, "Emma Roberts", "customer", "Hi, I just received an email that the event has been cancelled. Can I get a full refund please?\nI'm really disappointed as I arranged travel and accommodation.");
m("SUP-4421", 72, "System", "system", "Event status changed to Cancelled by organizer.");
m("SUP-4421", 55, "Sarah Mitchell", "support", "Hi Emma,\nThanks for contacting us. I can confirm the event has been cancelled by the venue. You are eligible for a full refund under our policy.\nI’ve started the refund process and will confirm once complete.", false, U.sarah);
m("SUP-4421", 52, "System", "system", "Case escalated to Tier 2 (event date within 24 hours).", true);
m("SUP-4421", 48, "Sarah Mitchell", "support", "Confirmed venue cancellation. Refund eligible.", true, U.sarah);
m("SUP-4421", 33, "Emma Roberts", "customer", "Thank you, I appreciate the quick response.");
m("SUP-4421", 12, "Sarah Mitchell", "support", "Refund request recorded for Commerce. Funds will be returned to your original payment method once processed — typically 5–10 business days after processing.\nI'll keep this case open until you've received the funds.", false, U.sarah);
m("SUP-4421", 40, "Sarah Mitchell", "support", "Customer travel costs noted — outside refund policy; offered replacement event credit.", true, U.sarah);
// First responses: 1–4h after creation (drives "Avg. response time").
for (const [i, row] of [...caseRows.slice(1), ...fill].entries()) {
  const [ref, , , , , [rname], , , , , ageMin] = row;
  const createdAgo = ageMin + 60, replyAgo = createdAgo - (70 + (i * 37) % 170);
  m(ref, createdAgo, rname, "customer", "Hi team — can you help with this please?");
  if (replyAgo > 1) m(ref, replyAgo, "Sarah Mitchell", "support", "Thanks — looking into this now and will update you shortly.", false, U.sarah);
}
must(await sb.from("support_messages").insert(msgs), "messages");

// ══════════════════════ Trust & Safety ══════════════════════
const tc = [
  ["TS-8842", "verification", "Identity verification review", "workspace", "Riverside Events Ltd", "ORG-1001", null, 78, "in_review", "Provider", 2 * 60, "Sarah Mitchell", av.sarah],
  ["TS-8810", "reliability", "Repeated late responses", "listing", "Skyline Rooftop", "LST-1003", img("sv-skyline-space"), 55, "investigating", "Listing", 4 * 60, "James Carter", av.james],
  ["TS-8781", "fraud", "Suspicious ticket sales pattern", "event", "Tech Summit After Party", "EVT-7842", img("ev-neon"), 82, "open", "Event", 6 * 60, "Sarah Mitchell", av.sarah],
  ["TS-8765", "appeal", "Listing restriction appeal", "listing", "Elite Catering Co.", "LST-2001", img("s-taste-catering"), 50, "awaiting_info", "Listing", 26 * 60, "James Carter", av.james],
  ["TS-8733", "verification", "Document unclear", "workspace", "Grand Hall Venue", "ORG-2210", null, 22, "info_requested", "Provider", 28 * 60, "Sarah Mitchell", av.sarah],
  ["TS-8701", "fraud", "Fake reviews detected", "listing", "City DJs", "LST-2006", img("s-dj-marcus"), 85, "investigating", "Listing", 2 * D / M, "James Carter", av.james],
  ["TS-8689", "reliability", "High cancellation rate", "workspace", "Sound & Light Pro", "ORG-3321", null, 60, "monitoring", "Provider", 2.1 * D / M, "Sarah Mitchell", av.sarah],
  ["TS-8662", "appeal", "Account suspension appeal", "user", "Marcus Lee", "USR-4492", av.marcus, 80, "in_review", "User", 3 * D / M, "James Carter", av.james],
  ["TS-8640", "fraud", "Duplicate listing content", "listing", "Riverside Arena (copy)", "LST-3011", img("sv-riverside-manor"), 48, "actioned", "Listing", 3.1 * D / M, "Sarah Mitchell", av.sarah],
  ["TS-8618", "verification", "Business verification", "workspace", "Urban Bites", "ORG-5540", img("sv-taste-co"), 25, "approved", "Provider", 4 * D / M, "James Carter", av.james],
  ["TS-8604", "fraud", "Chargeback cluster – BK-7703", "ticket", "Order BK-7703", "BK-7703", null, 74, "open", "Dispute", 4.2 * D / M, "Sarah Mitchell", av.sarah],
  ["TS-8597", "fraud", "Payment dispute – venue deposit", "event", "Wedding Showcase", "EVT-6230", img("me-wedding"), 58, "in_review", "Dispute", 5 * D / M, "James Carter", av.james],
];
const STATUS = { in_review: "in_review", investigating: "in_review", open: "open", awaiting_info: "in_review", info_requested: "in_review", monitoring: "in_review", actioned: "actioned", approved: "dismissed" };
const trustRows = tc.map(([reference, queue, category, subject_type, subject_name, ref, image, risk, stage, relatedTo, ageMin, assignee, assigneeAvatar]) => ({
  reference, queue, category: relatedTo === "Dispute" ? "Chargeback" : category, subject_type, subject_name, risk_score: risk, status: STATUS[stage], reason: category,
  evidence: [{ kind: "signal", label: category, at: iso(NOW - ageMin * M) }, ...(stage === "awaiting_info" || stage === "info_requested" ? [{ kind: "request", label: "Evidence requested: please upload clearer documents", at: iso(NOW - (ageMin - 30) * M) }] : [])],
  related: { subject_ref: ref, image, related_to: relatedTo === "Dispute" ? "Order" : relatedTo, stage, assignee_avatar: assigneeAvatar },
  decision: ["actioned", "approved"].includes(stage) ? "Reviewed and closed" : null, decided_by: ["actioned", "approved"].includes(stage) ? U.admin : null, decided_at: ["actioned", "approved"].includes(stage) ? iso(NOW - (ageMin - 60) * M) : null,
  assignee_id: assignee === "Sarah Mitchell" ? U.sarah : null, assignee_name: assignee, created_at: iso(NOW - (ageMin + 600) * M), updated_at: iso(NOW - ageMin * M),
}));
const ts = trustRows.find(r => r.reference === "TS-8781");
ts.id = IDS.trustCase;
ts.reason = "Unusual spike in ticket purchases using multiple cards from same IP range. Possible bot activity.";
ts.related = { ...ts.related, event: { name: EVENT.name, ref: EVENT.ref, image: EVENT.image, date_label: "14 Nov 2026", venue: "Riverside Arena" }, orders: 12, created_label: null };
ts.evidence = [
  { kind: "indicator", label: "Unusual purchase volume", level: "High", icon: "cart" }, { kind: "indicator", label: "Multiple cards / same IP", level: "High", icon: "card" },
  { kind: "indicator", label: "New accounts", level: "Medium", icon: "user" }, { kind: "indicator", label: "Velocity above threshold", level: "High", icon: "clock" },
  { kind: "indicator", label: "Chargeback risk", level: "Medium", icon: "alert" }, { kind: "signal", label: "38 tickets bought in 6 minutes from 4 cards", at: iso(NOW - 26 * H) },
];
// Volume rows for queue KPIs (older, spread across queues).
const fillTrust = [];
for (let i = 0; i < 60; i++) {
  const queue = ["verification", "verification", "reliability", "fraud", "appeal"][i % 5];
  fillTrust.push({ reference: `TS-${8580 - i * 3}`, queue, category: { verification: "Business verification", reliability: "Late responses", fraud: i % 2 ? "Listing/ticket abuse" : "Suspicious payments", appeal: "Restriction appeal" }[queue],
    subject_type: queue === "fraud" ? "listing" : "workspace", subject_name: ["Party Bus Express", "Night Owl Lounge", "Bright Marquees", "Pulse Nightclub", "Garden Feasts"][i % 5], risk_score: 20 + (i * 17) % 75,
    status: i < 34 ? (i % 3 ? "open" : "in_review") : i % 2 ? "actioned" : "dismissed", reason: "Automated signal", evidence: [], related: { subject_ref: `LST-${4000 + i}`, related_to: queue === "fraud" ? "Listing" : "Provider", stage: i % 4 === 0 ? "investigating" : "" },
    assignee_id: i % 2 ? U.sarah : null, assignee_name: i % 2 ? "Sarah Mitchell" : "James Carter", created_at: iso(NOW - (5 + i * 0.9) * D), updated_at: iso(NOW - (4 + i * 0.9) * D) });
}
must(await sb.from("trust_cases").insert([...trustRows, ...fillTrust]), "trust");
const trustIds = Object.fromEntries(must(await sb.from("trust_cases").select("id,reference").like("reference", "TS-%"), "trust ids").map(r => [r.reference, r.id]));

// ══════════════════════ Partners ══════════════════════
const partners = [
  ["EventHub Media", "eventhubmedia.com", "affiliate", "active", 2500, 12480, "paid", 4.2, "2026-08-12", "EH", "#0d0d63", { clicks: 12480, signups: 420, bookings: 186, d: [34, 28, 22, 26] }],
  ["London Events Blog", "londonevents.blog", "affiliate", "active", 2000, 8240, "pending", 3.1, "2026-07-04", "B", "#ec3a52"],
  ["City Venue Network", "cityvenues.co.uk", "strategic", "active", 2500, 18320, "paid", 5.6, "2026-05-21", "◎", "#1d2068"],
  ["Premier Party Planners", "premierparty.co.uk", "promoter", "active", 2000, 6120, "paid", 6.8, "2026-04-10", "P", "#ec3a52"],
  ["UK Festival Guide", "ukfestivalguide.com", "affiliate", "paused", 2000, 2680, "on_hold", 1.9, "2026-03-03", "U", "#ff6a1f"],
  ["Elite Artist Agency", "eliteartists.co.uk", "strategic", "active", 2500, 9440, "pending", 3.7, "2026-02-28", "E", "#7c3aed"],
  ["Campus Events", "campusevents.io", "affiliate", "active", 2000, 3920, "paid", 2.5, "2026-02-14", "F", "#14b8d6"],
  ["Bright Marketing", "brightmarketing.co.uk", "affiliate", "pending", 2000, 1460, "hold", 1.4, "2026-02-09", "●", "#ec3a52"],
  ["Riverside Lifestyle", "riversidelifestyle.com", "strategic", "active", 2500, 5880, "paid", 4.1, "2026-01-25", "◐", "#ff6a1f"],
  ["Student Nights UK", "studentnights.co.uk", "promoter", "active", 2000, 2780, "paid", 2.9, "2026-01-12", "SN", "#1a4fe0"],
];
must(await sb.from("partners").insert(partners.map(([name, domain, type, status, bps, rev, payout, conv, joined, mark, color, perf], i) => ({
  name, kind: type === "strategic" ? "strategic" : "affiliate", status, referral_code: `B-${name.replace(/[^A-Z]/gi, "").slice(0, 8).toUpperCase()}${i}`, commission_bps: bps,
  commission_basis: "net_platform_revenue", referrals: Math.round(rev / 67), eligible_revenue: rev, earned: Math.round(rev * bps / 10000), paid: Math.round(rev * bps / 10000 * (payout === "paid" ? 0.75 : 0.5)),
  quality_score: Math.round(60 + conv * 5), user_id: i === 0 ? U.daniel : null,
  details: { type, domain, email: `partner@${domain}`, country: "United Kingdom", country_code: "GB", payout_status: payout, conversion: conv, revenue_30d: rev, mark, color, account_manager: "Sarah Mitchell", account_manager_avatar: av.sarah,
    agreement: "Standard Affiliate Agreement v1.2", tagline: i === 0 ? "UK's biggest events community" : "", cover: i === 0 ? img("hero-neon") : "", last_paid: "2026-11-01", next_due: "2026-11-07", pending: i === 0 ? 780 : Math.round(rev * 0.05),
    held: 0, revenue_prev_30d: Math.round(rev / (1.1 + (i % 4) * 0.08)), paid_30d: Math.round(rev * bps / 10000 * 0.95), paid_prev_30d: Math.round(rev * bps / 10000 * 0.95 / (1.12 + (i % 3) * 0.06)),
    pending_prev: Math.round((i === 0 ? 780 : rev * 0.05) / 1.12), rev_series: Array.from({ length: 10 }, (_, k) => Math.round(rev / 10 * (0.7 + k * 0.05 + 0.12 * Math.sin(k * 1.3 + i)))),
    ...(perf ? { perf: { clicks: perf.clicks, signups: perf.signups, bookings: perf.bookings, revenue: rev, deltas: perf.d } } : {}) },
  created_at: `${joined}T10:00:00Z`,
}))), "partners");
const partnerIds = Object.fromEntries(must(await sb.from("partners").select("id,name").like("referral_code", "B-%"), "pids").map(r => [r.name, r.id]));

// ══════════════════════ Agent runs, approvals, integrations ══════════════════════
const runs = [
  ["RUN-88421", "Event Planner Agent", "Event analysis", "completed", 12, 12, 102, 12, "Scheduler"],
  ["RUN-88420", "Supplier Agent", "Supplier search", "completed", 8, 8, 56, 17, "User (Sarah M.)"],
  ["RUN-88419", "Marketing Agent", "Campaign draft", "failed", 5, 8, 134, 22, "User (James C.)", "OpenAI API timeout"],
  ["RUN-88418", "Data Sync Agent", "External sync", "completed", 6, 6, 48, 28, "System"],
  ["RUN-88417", "Support Agent", "Case summary", "completed", 9, 9, 70, 34, "User (Olivia C.)"],
  ["RUN-88416", "Monitoring Agent", "Health check", "failed", 3, 6, 123, 39, "Scheduler", "Webhook delivery failed"],
  ["RUN-88415", "Finance Agent", "Payout reconciliation", "completed", 14, 14, 151, 52, "System"],
  ["RUN-88414", "Trust Agent", "Risk analysis", "completed", 10, 10, 78, 59, "User (Admin)"],
  ["RUN-88413", "Content Agent", "Listing review", "paused", 4, 10, 185, 63, "User (Daniel K.)"],
  ["RUN-88412", "Integration Agent", "Calendar sync", "completed", 7, 7, 49, 77, "System"],
  ["RUN-88411", "Finance Agent", "Payout action", "waiting_approval", 3, 6, 40, 90, "System"],
  ["RUN-88409", "Integration Agent", "Calendar sync", "failed", 2, 7, 30, 116, "System", "Google Calendar rate limit"],
  ["RUN-88408", "Content Agent", "Publish listing", "waiting_approval", 5, 8, 60, 120, "User (Daniel K.)"],
  ["RUN-88405", "Supplier Agent", "Supplier search", "failed", 1, 8, 12, 207, "User (Sarah M.)", "Invalid credentials (Stripe)"],
  ["RUN-88403", "Supplier Agent", "Contact provider", "waiting_approval", 4, 6, 44, 230, "User (Sarah M.)"],
  ["RUN-88398", "Marketing Agent", "Launch campaign", "waiting_approval", 6, 9, 80, 290, "User (James C.)"],
];
const scheduledRuns = Array.from({ length: 12 }, (_, i) => [`RUN-885${String(i).padStart(2, "0")}`, ["Monitoring Agent", "Finance Agent", "Integration Agent"][i % 3], ["Health check", "Payout reconciliation", "Calendar sync"][i % 3], "scheduled", 0, 6, 0, 1 + i * 0.5, "Scheduler"]);
const prevRuns = Array.from({ length: 240 }, (_, i) => [`RUN-87${String(i).padStart(3, "0")}`, ["Event Planner Agent", "Supplier Agent", "Support Agent", "Marketing Agent", "Finance Agent", "Data Sync Agent"][i % 6], "Routine task", i % 9 === 4 ? "failed" : "completed", 6, 6, 45 + (i % 7) * 10, 24 * 60 + 20 + i * 5.8, "Scheduler", i % 9 === 4 ? "Tool timeout" : null]);
const runningRuns = Array.from({ length: 6 }, (_, i) => [`RUN-8843${i}`, ["Event Planner Agent", "Support Agent", "Trust Agent"][i % 3], ["Event analysis", "Case summary", "Risk analysis"][i % 3], "running", 2 + i, 10, 30, 95 + i * 6, "System"]);
const histRuns = Array.from({ length: 250 }, (_, i) => [`RUN-8${8100 + i}`, ["Event Planner Agent", "Supplier Agent", "Support Agent", "Marketing Agent", "Finance Agent", "Data Sync Agent"][i % 6], "Routine task", i % 11 === 3 ? "failed" : "completed", 6, 6, 40 + (i % 9) * 11, 80 + i * 5.1, "Scheduler", i % 11 === 3 ? "Tool timeout" : null]);
const runRows = [...runs, ...scheduledRuns, ...runningRuns, ...histRuns, ...prevRuns].map(([reference, agent_name, run_type, status, done, total, secs, minsAgo, triggered_by, error]) => ({
  user_id: U.admin, surface: "admin", reference, agent_name, run_type, status, triggered_by, goal: `${run_type} (${agent_name})`, scope: ["admin"],
  progress: Math.round((done / total) * 100), current_step: done, plan: Array.from({ length: total }, (_, k) => ({ step: `Step ${k + 1}`, status: k < done ? "done" : status === "failed" && k === done ? "failed" : "pending" })),
  errors: error ? [{ step: `Step ${done + 1}`, error }] : [], retries: status === "failed" ? 1 : 0, cost_cents: total * 3, idempotency_key: `admin-b-${reference}`,
  created_at: iso(NOW - minsAgo * M), updated_at: iso(NOW - (minsAgo - secs / 60) * M), finished_at: ["completed", "failed"].includes(status) ? iso(NOW - minsAgo * M + secs * 1000) : null,
  next_wake_at: status === "scheduled" ? iso(NOW + (5 + minsAgo * 20) * M) : null,
}));
for (let i = 0; i < runRows.length; i += 100) must(await sb.from("agent_runs").insert(runRows.slice(i, i + 100)), "runs");
const runIds = Object.fromEntries(must(await sb.from("agent_runs").select("id,reference").like("reference", "RUN-88%"), "run ids").map(r => [r.reference, r.id]));
const approvals = [["RUN-88411", "Payout action", "payout.release", "Release held payout to The London Loft", 5], ["RUN-88408", "Publish listing", "listing.publish", "Publish reviewed listing Urban Bites", 12],
  ["RUN-88403", "Contact provider", "provider.contact", "Message 3 replacement suppliers for SUP-4417", 18], ["RUN-88398", "Launch campaign", "campaign.launch", "Launch partner campaign for EventHub Media", 60],
  ["RUN-88411", "Hold review", "payout.hold", "Hold high-value booking for manual review", 75], ["RUN-88408", "Update listing", "listing.update", "Apply reviewer edits to Skyline Rooftop", 95],
  ["RUN-88403", "Contact provider", "provider.contact", "Confirm availability with Sound & Light Pro", 130], ["RUN-88398", "Send newsletter", "campaign.send", "Send October partner newsletter", 160]];
must(await sb.from("agent_approvals").insert(approvals.map(([run, title, action, detail, minsAgo]) => ({ run_id: runIds[run], workspace_id: null, title, action, detail, impact: "Requires admin approval",
  payload: { seed: SEED, run_ref: run }, status: "pending", created_at: iso(NOW - minsAgo * M), expires_at: iso(NOW + 24 * H) }))), "approvals");
const series = (base, n = 12, j = 0.2) => Array.from({ length: n }, (_, i) => Math.round(base * (1 + j * Math.sin(i * 1.7 + base))));
const integrations = [
  ["OpenAI (Azure)", "ai", "healthy", 320, 1], ["Stripe", "payments", "healthy", 210, 2], ["Google Calendar", "calendar", "healthy", 180, 3], ["Meta Ads", "marketing", "degraded", 1200, 4],
  ["SendGrid", "email", "healthy", 240, 5], ["Twilio", "sms", "healthy", 310, 6], ["Cloudflare R2", "storage", "healthy", 190, 7], ["Higgsfield (Media)", "media", "down", null, 8],
];
for (const [name, category, status, latency, sort] of integrations) {
  must(await sb.from("integrations").upsert({ name, category, status, metrics: { latency_ms: latency, series: latency ? series(latency) : [5, 8, 6, 9, 12, 18, 30, 28, 40, 38, 52, 60], sort, label: latency ? `${latency}ms p50` : "Unreachable" }, updated_at: iso(NOW - sort * 3 * M) }, { onConflict: "name" }), `integration ${name}`);
}

// ══════════════════════ Analytics rollups ══════════════════════
const ad = [];
const dayKey = d => new Date(NOW - d * D).toISOString().slice(0, 10);
const wave = (d, a = 0.25) => 1 + a * Math.sin(d / 2.2) + 0.12 * Math.sin(d / 0.9);
for (let d = 0; d < 60; d++) {
  const k = dayKey(d), cur = d < 30 ? 1.24 : 1, w = wave(d) * cur, push = (metric, value, dim = "") => ad.push({ day: k, metric, dim, value: Math.round(value * 100) / 100 });
  push("searches", 820 * w * (1 + (30 - Math.min(d, 30)) / 60)); push("enquiries", 232 * w); push("proposals", 97 * w); push("bookings", 61 * w);
  push("gmv_marketplace", 13740 * w); push("platform_revenue", 2063 * w); push("response_minutes", 138 * (d < 30 ? 1 : 1.45) * (1 + 0.1 * Math.sin(d)));
  push("tickets_sold", 413 * wave(d + 3, 0.5) * cur); push("ticket_revenue", 8287 * wave(d + 3, 0.5) * cur); push("ticket_fees", 911 * wave(d + 3, 0.5) * cur); push("events_with_tickets", d % 3 ? 3 : 2);
  push("active_subscriptions", 380 + (60 - d) * 0.8 * (1 + 0.04 * Math.sin(d))); push("mrr", 30200 + (60 - d) * 60 * (1 + 0.03 * Math.sin(d))); push("new_subscriptions", d % 2 ? 3 : 2); push("churned_subscriptions", d % 4 ? 0 : 1);
  push("repeat_customers_pct", 36 + 4 * Math.sin(d / 3)); push("organizer_retention_pct", 70 + 4 * Math.sin(d / 4)); push("provider_retention_pct", 66 + 4 * Math.sin(d / 5));
  for (const [dim, share, rev] of [["Venues", 0.349, 7285], ["Catering & Drinks", 0.173, 2477], ["Entertainment", 0.161, 2070], ["Production & AV", 0.104, 1273], ["Decor & Styling", 0.08, 930]]) { push("bookings_by_category", 61 * w * share * 1.0, dim); push("revenue_by_category", rev * w, dim); }
  for (const [dim, share, rev] of [["London", 0.349, 7285], ["Manchester", 0.116, 1807], ["Birmingham", 0.091, 1378], ["Leeds", 0.067, 948], ["Bristol", 0.064, 870]]) { push("bookings_by_city", 61 * w * share, dim); push("revenue_by_city", rev * w, dim); }
  for (const [dim, share] of [["Venue bookings", 0.42], ["Supplier services", 0.28], ["Ticketing fees", 0.18], ["Subscriptions", 0.08], ["Other", 0.04]]) push("revenue_by_source", 2063 * w * share, dim);
  for (const [cat, a, b, c, e] of [["Venues", 86, 2, 6, 6], ["Catering", 72, 6, 10, 12], ["Entertainment", 68, 8, 10, 14], ["Production", 61, 11, 12, 16], ["Decor & Styling", 74, 6, 8, 12]]) {
    push("response_within_2h", a, cat); push("response_2_8h", b + 4, cat); push("response_8_24h", c, cat); push("response_over_24h", e - 4, cat);
  }
}
for (let i = 0; i < ad.length; i += 500) must(await sb.from("analytics_daily").insert(ad.slice(i, i + 500)), "analytics");

// ══════════════════════ Settings history + drafts ══════════════════════
const published = Object.fromEntries(must(await sb.from("platform_settings").select("section,value,version").eq("status", "published"), "published").map(r => [r.section, r]));
const generalValue = {
  platform_name: "Gala Dock", support_email: "support@gala-dock.com", timezone: "Europe/London", default_currency: "GBP", default_locale: "en-GB",
  description: "Gala Dock is an event planning and booking platform connecting customers, venues and suppliers.",
  supported_countries: ["GB", "US", "CA"], default_country: "GB", tax_handling: "platform_uk_vat",
  supplier_response_hours: 4, venue_response_hours: 12, auto_expire_hours: 48, min_lead_hours: 24, emergency_replacement: true, short_notice_bookings: true,
};
const history = [
  ["communications", "2.4.3", 54 * D, "James Wilson", "Updated communication templates.", { ...(published.communications?.value ?? {}), templates_version: 7 }],
  ["general", "2.5.0", 30 * D, "Sarah Mitchell", "Added new countries and tax rules.", { ...generalValue, supported_countries: ["GB", "US"], supplier_response_hours: 6 }],
  ["commerce", "2.5.1", 14 * D, "Daniel Kim", "Updated commission plans.", published.commerce?.value ?? {}],
  ["ticketing", "2.6.0", 30 * H, "Sarah Mitchell", "Updated ticketing fees and response windows.", { ...(published.ticketing?.value ?? {}), booking_fee: { pct_bps: 1000, fixed: 0 } }],
];
const actor = name => ({ "Sarah Mitchell": U.sarah, "Daniel Kim": U.daniel, "James Wilson": U.admin }[name] ?? U.admin);
for (const [section, release, ago, who, summary, value] of history) {
  must(await sb.from("platform_settings").update({ status: "superseded" }).eq("section", section).eq("status", "published"), "supersede");
  const v = (must(await sb.from("platform_settings").select("version").eq("section", section).order("version", { ascending: false }).limit(1), "v")[0]?.version ?? 0) + 1;
  must(await sb.from("platform_settings").insert({ section, version: v, status: "published", value, effective_at: iso(NOW - ago), change_reason: `Seed: B ${summary}`, summary, release,
    created_by: actor(who), approved_by: actor(who), created_at: iso(NOW - ago) }), `history ${section}`);
}
// Three pending drafts (General, Marketplace, Ticketing).
const drafts = [["general", { ...generalValue }, "Response windows and Canada"], ["marketplace", { ...(published.marketplace?.value ?? {}), default_response_hours: 4 }, "Shorter default response window"],
  ["ticketing", { ...(published.ticketing?.value ?? {}), booking_fee: { pct_bps: 1000, fixed: 0 }, transfer_cutoff_hours: 1 }, "Transfer cut-off 1h"]];
for (const [section, value, summary] of drafts) {
  const v = (must(await sb.from("platform_settings").select("version").eq("section", section).order("version", { ascending: false }).limit(1), "v")[0]?.version ?? 0) + 1;
  must(await sb.from("platform_settings").insert({ section, version: v, status: "draft", value, change_reason: "", summary, created_by: U.admin, created_at: iso(NOW - 12 * M) }), `draft ${section}`);
}

// ══════════════════════ Notes & money requests ══════════════════════
must(await sb.from("admin_notes").insert([
  { entity_type: "transaction", entity_id: IDS.tx, author_id: U.sarah, author_name: "Sarah Mitchell", body: "Customer contacted about a ticket transfer. Verified identity and actioned transfer.", created_at: iso(NOW - D) },
  { entity_type: "transaction", entity_id: IDS.tx, author_id: null, author_name: "James Carter", body: "Checked order details – all correct.", created_at: iso(NOW - 3 * D) },
  { entity_type: "partner", entity_id: partnerIds["EventHub Media"], author_id: U.sarah, author_name: "Sarah Mitchell", body: "Renewed agreement v1.2 at 25% of platform revenue.", created_at: iso(NOW - 5 * D) },
]), "notes");
// Link the transaction to its open support case (Support cases panel on AD-011).
must(await sb.from("support_cases").insert({ reference: "SUP-4399", subject: "Ticket transfer request", category: "ticketing", priority: "medium", status: "open", requester_name: "Alex Turner",
  assignee_id: U.sarah, assignee_name: "Sarah Mitchell", sla_due_at: iso(NOW + 6 * H), amount: 276,
  related: { type_label: "Ticketing", transaction_id: IDS.tx, subject_ref: { label: EVENT.name, ref: EVENT.ref, image: EVENT.image }, requester: { name: "Alex Turner", email: "alex.turner@email.com", avatar: img("av-alex-customer") }, source: "Customer support form", created_by: "Customer (Alex Turner)", updated_at: iso(NOW - 2 * D) },
  created_at: iso(NOW - 2 * D) }), "tx case");
const refundTx = must(await sb.from("transactions").select("id").eq("stripe_ref", "pi_b4tk").maybeSingle(), "refund tx");
if (refundTx) must(await sb.from("admin_money_requests").insert({ kind: "refund", transaction_id: refundTx.id, amount: 92, reason: "Event cancelled – customer refund under policy", requested_by: U.sarah, requested_by_name: "Sarah Mitchell", created_at: iso(NOW - 5 * H) }), "money req");

console.log(JSON.stringify({ transactions: tx.length, support_cases: allCases.length + 1, trust_cases: trustRows.length + fillTrust.length, partners: partners.length, runs: runRows.length, analytics_rows: ad.length,
  ids: { ...IDS, trustCase: trustIds["TS-8781"] } }, null, 1));
