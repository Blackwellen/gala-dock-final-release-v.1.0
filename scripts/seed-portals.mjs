// Seeds the three external portals (PORT-001 client, PROM-001 promoter, PART-001 partner) against "Neon Nights Festival".
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-portals.mjs          → data + demo logins + client link + manifest
//        node --env-file=.env --env-file=.env.local scripts/seed-portals.mjs --auth   → also saves artifacts/auth/{promoter,partner}.json
// Idempotent: replaces its own rows each run. The client portal link is re-issued on every run (older seed links are revoked);
// the plaintext token is printed and written only to the git-ignored visual manifest — the database stores its SHA-256 hash.
// Demo password: DEMO_PORTAL_PASSWORD, else DEMO_PROVIDER_PASSWORD.
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const PASSWORD = process.env.DEMO_PORTAL_PASSWORD || process.env.DEMO_PROVIDER_PASSWORD;
if (!PASSWORD) { console.error("Set DEMO_PORTAL_PASSWORD or DEMO_PROVIDER_PASSWORD."); process.exit(1); }
const must = (r, what) => { if (r.error) { console.error(what, r.error); process.exit(1); } return r.data; };
const NOW = Date.now(), DAY = 864e5, HOUR = 36e5;
const iso = ms => new Date(ms).toISOString();
const dateOnly = ms => iso(ms).slice(0, 10);
const sha = s => createHash("sha256").update(s).digest("hex");
// Deterministic PRNG so repeated seeds render the same screens.
let seed = 20261015;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const round2 = n => Math.round(n * 100) / 100;

async function ensureUser(email, name, avatar) {
  let user = null;
  for (let page = 1; !user; page++) {
    const list = must(await sb.auth.admin.listUsers({ page, perPage: 1000 }), "listUsers");
    user = list.users.find(u => u.email === email) ?? null;
    if (list.users.length < 1000) break;
  }
  if (user) must(await sb.auth.admin.updateUserById(user.id, { password: PASSWORD, email_confirm: true, user_metadata: { ...user.user_metadata, full_name: name } }), "updateUser");
  else user = must(await sb.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name, terms_version: "2026-10" } }), "createUser").user;
  must(await sb.from("profiles").update({ full_name: name, avatar_url: avatar, onboarding_complete: true }).eq("id", user.id), "profile");
  return user.id;
}

const event = must(await sb.from("events").select("id,name,workspace_id,owner_id,starts_at").eq("slug", "neon-nights").single(), "neon nights");
const tiers = must(await sb.from("ticket_tiers").select("id,name,price").eq("event_id", event.id).gt("price", 0).order("sort"), "tiers");

/* ───────────────────────── PROM-001 promoter ───────────────────────── */
const promoterUser = await ensureUser("promoter.demo@example.com", "Jordan Hayes", "/assets/gd/av-chloe-roberts.webp");
let promoter = must(await sb.from("promoters").select("id").eq("event_id", event.id).eq("code", "JORDAN").maybeSingle(), "promoter");
const promoterRow = { event_id: event.id, name: "Jordan Hayes", code: "JORDAN", commission_pct: 15, status: "active", user_id: promoterUser, email: "promoter.demo@example.com", payout_method: null };
promoter = promoter ? must(await sb.from("promoters").update(promoterRow).eq("id", promoter.id).select("id").single(), "promoter upd")
  : must(await sb.from("promoters").insert(promoterRow).select("id").single(), "promoter ins");
for (const t of ["promoter_clicks", "promoter_sales", "promoter_payouts"]) must(await sb.from(t).delete().eq("promoter_id", promoter.id), `clean ${t}`);
must(await sb.from("promoter_assets").delete().eq("event_id", event.id), "clean assets");
const assets = must(await sb.from("promoter_assets").insert([
  { event_id: event.id, title: "Main Event Poster", kind: "poster", image: "/assets/gd/builder/poster/poster-main.webp", url: "/assets/gd/builder/poster/poster-main.webp", caption: "Neon Nights Festival — Riverside Park, London. Tickets on sale now.", sort: 1 },
  { event_id: event.id, title: "Aftermovie Teaser", kind: "video", image: "/assets/neon-aftermovie.webp", url: "/assets/neon-aftermovie.webp", caption: "Relive last year and lock in your ticket for 2026.", sort: 2 },
  { event_id: event.id, title: "VIP Experience", kind: "image", image: "/assets/gd/tk-neon.webp", url: "/assets/gd/tk-neon.webp", caption: "Fast-track entry, private bar and the best views of the main stage.", sort: 3 },
  { event_id: event.id, title: "Lineup Announcement", kind: "story", image: "/assets/gd/builder/page-editor/hero-media.webp", url: "/assets/gd/builder/page-editor/hero-media.webp", caption: "The full Neon Nights line-up is here.", sort: 4 },
]).select("id,title"), "assets");
const assetWeights = [428, 312, 216, 198];
const CHANNELS = [["instagram", 642, 56], ["tiktok", 428, 32], ["facebook", 386, 28], ["x", 214, 16], ["email", 172, 10]];
const clicks = [];
const pickAsset = () => { const r = rnd() * 1842; let acc = 0; for (const [i, w] of assetWeights.entries()) { acc += w; if (r < acc) return assets[i].id; } return null; };
// Last 30 days: the campaign is accelerating, so later days get more traffic.
const when = (from, to) => { const u = Math.pow(rnd(), 0.75); return Math.round(from + (to - from) * u); };
for (const [channel, n] of CHANNELS) for (let i = 0; i < n; i++) clicks.push({ promoter_id: promoter.id, channel, asset_id: rnd() < 0.62 ? pickAsset() : null, visitor_hash: sha(`v${channel}${i}${rnd()}`), created_at: iso(when(NOW - 30 * DAY, NOW - HOUR)) });
for (let i = 0; i < 1560; i++) clicks.push({ promoter_id: promoter.id, channel: pick(CHANNELS)[0], asset_id: null, visitor_hash: sha(`p${i}${rnd()}`), created_at: iso(when(NOW - 60 * DAY, NOW - 30 * DAY)) });
for (let i = 0; i < clicks.length; i += 500) must(await sb.from("promoter_clicks").insert(clicks.slice(i, i + 500)), "clicks");

const sales = [];
function addSales(channel, tickets, from, to) {
  while (tickets > 0) {
    const q = Math.min(tickets, pick([1, 1, 2, 2, 2, 3, 4])); tickets -= q;
    const tier = q >= 4 ? (tiers.find(t => t.name.startsWith("Group")) ?? tiers[0]) : pick(tiers.filter(t => !t.name.startsWith("Group")));
    const at = when(from, to), amount = round2(q * Number(tier.price));
    const age = NOW - at;
    sales.push({ promoter_id: promoter.id, event_id: event.id, tier_id: tier.id, tier_name: tier.name, quantity: q, amount, commission: round2(amount * 0.15),
      status: age > 45 * DAY ? "paid" : age > 12 * DAY ? "approved" : "pending", channel, asset_id: rnd() < 0.58 ? pickAsset() : null,
      order_ref: `GD-${randomBytes(3).toString("hex").toUpperCase()}`, sold_at: iso(at) });
  }
}
for (const [channel, , tickets] of CHANNELS) addSales(channel, tickets, NOW - 30 * DAY, NOW - 2 * HOUR);
addSales("instagram", 52, NOW - 60 * DAY, NOW - 30 * DAY); addSales("tiktok", 30, NOW - 60 * DAY, NOW - 30 * DAY); addSales("facebook", 29, NOW - 60 * DAY, NOW - 30 * DAY);
const paidTotal = round2(sales.filter(s => s.status === "paid").reduce((a, s) => a + s.commission, 0));
const approvedTotal = round2(sales.filter(s => s.status === "approved").reduce((a, s) => a + s.commission, 0));
const endOfMonth = (() => { const d = new Date(NOW); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12); })();
const payouts = must(await sb.from("promoter_payouts").insert([
  { promoter_id: promoter.id, amount: paidTotal, status: "paid", scheduled_for: dateOnly(NOW - 40 * DAY), paid_at: iso(NOW - 40 * DAY), reference: "PO-JH-0001" },
  { promoter_id: promoter.id, amount: approvedTotal, status: "on_hold", scheduled_for: dateOnly(endOfMonth), reference: null },
]).select("id,status"), "payouts");
for (const s of sales) if (s.status === "paid") s.payout_id = payouts.find(p => p.status === "paid").id;
must(await sb.from("promoter_sales").insert(sales), "sales");
must(await sb.from("promoters").update({ clicks: clicks.length, tickets_sold: sales.reduce((a, s) => a + s.quantity, 0), revenue: round2(sales.reduce((a, s) => a + s.amount, 0)) }).eq("id", promoter.id), "promoter totals");

/* ───────────────────────── PART-001 partner ───────────────────────── */
const partnerUser = await ensureUser("partner.demo@example.com", "Jordan Blake", "/assets/gd/av-isabella-garcia.webp");
let partner = must(await sb.from("partners").select("id").eq("referral_code", "JORDAN").maybeSingle(), "partner");
const partnerRow = { user_id: partnerUser, name: "Jordan Blake", kind: "affiliate", status: "active", referral_code: "JORDAN", commission_bps: 1500, commission_basis: "net_platform_revenue", quality_score: 90, logo: "", details: { contact: "partner.demo@example.com" } };
partner = partner ? must(await sb.from("partners").update(partnerRow).eq("id", partner.id).select("id").single(), "partner upd")
  : must(await sb.from("partners").insert(partnerRow).select("id").single(), "partner ins");
for (const t of ["partner_earnings", "partner_statements", "partner_referrals", "partner_content"]) must(await sb.from(t).delete().eq("partner_id", partner.id), `clean ${t}`);
const N1 = ["Skyline", "Riverside", "Taste", "Elite", "Urban", "Harbour", "Velvet", "Northern", "Golden", "Bright", "Summit", "Oak", "Lumen", "Copper", "Atlas", "Nova", "Willow", "Echo", "Crown", "Pulse"];
const N2 = { organiser: ["Events Ltd", "Productions", "Live", "Collective", "Promotions"], venue: ["Venue", "Rooms", "Hall", "Warehouse", "Loft"], supplier: ["Catering", "Beats", "Sound Hire", "Florals", "AV"] };
const referrals = [];
// Most recent five match the design's "Recent referrals" scenario; the rest are generated.
const named = [["Skyline Events Ltd", "organiser", "active", 1], ["The Riverside Venue", "venue", "active", 3], ["Taste Catering", "supplier", "trial", 5], ["Elite Productions", "organiser", "active", 8], ["Urban Beats", "supplier", "active", 10]];
for (const [name, kind, status, d] of named) referrals.push({ partner_id: partner.id, name, kind, status, signed_up_at: iso(NOW - d * DAY - 5 * HOUR), activated_at: status === "active" ? iso(NOW - (d - 1) * DAY) : null });
const genRef = (from, to, statusFn) => { const kind = pick(["organiser", "organiser", "venue", "supplier"]); const at = when(from, to); const status = statusFn(at);
  referrals.push({ partner_id: partner.id, name: `${pick(N1)} ${pick(N2[kind])}`, kind, status, signed_up_at: iso(at), activated_at: status === "active" ? iso(Math.min(NOW, at + 5 * DAY)) : null }); };
for (let i = 0; i < 43; i++) genRef(NOW - 30 * DAY, NOW - 11 * DAY, () => (i < 3 ? "active" : pick(["trial", "trial", "pending"])));
for (let i = 0; i < 36; i++) genRef(NOW - 60 * DAY, NOW - 30 * DAY, () => (i < 9 ? "active" : pick(["trial", "churned"])));
for (let i = 0; i < 60; i++) genRef(NOW - 200 * DAY, NOW - 60 * DAY, () => (i < 16 ? "active" : "churned"));
const refRows = must(await sb.from("partner_referrals").insert(referrals).select("id,status"), "referrals");
const active = refRows.filter(r => r.status === "active");
// Statements by calendar month; the current month is open, the previous month awaits payout.
const monthStart = k => { const d = new Date(NOW); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1); };
const earnings = [];
for (let d = 180; d >= 0; d--) {
  const t = NOW - d * DAY, growth = 1 + (180 - d) / 70, base = 150 * growth * (0.55 + rnd() * 0.9);
  const eligible = round2(d < 30 ? base * 1.22 : base);
  earnings.push({ partner_id: partner.id, referral_id: pick(active).id, occurred_at: iso(t - 3 * HOUR), eligible_revenue: eligible, commission: round2(eligible * 0.15), status: d <= 14 ? "pending" : "cleared" });
}
const stmts = [];
for (let k = 6; k >= 0; k--) {
  const a = monthStart(k), b = monthStart(k - 1), inM = earnings.filter(e => { const t = Date.parse(e.occurred_at); return t >= a && t < b; });
  stmts.push({ partner_id: partner.id, period_start: dateOnly(a), eligible_revenue: round2(inM.reduce((x, e) => x + e.eligible_revenue, 0)), commission: round2(inM.reduce((x, e) => x + e.commission, 0)),
    status: k === 0 ? "open" : k === 1 ? "pending" : "paid", payout_due: k === 0 ? null : dateOnly(k === 1 ? endOfMonth : b + 14 * DAY), paid_at: k > 1 ? iso(b + 14 * DAY) : null, reference: k > 1 ? `PP-${dateOnly(a).slice(0, 7)}` : null });
}
const stmtRows = must(await sb.from("partner_statements").insert(stmts).select("id,period_start,status"), "statements");
for (const e of earnings) {
  const s = stmtRows.find(r => e.occurred_at.slice(0, 7) === r.period_start.slice(0, 7));
  e.statement_id = s?.id ?? null; if (s?.status === "paid") e.status = "paid";
}
must(await sb.from("partner_earnings").insert(earnings), "earnings");
must(await sb.from("partner_content").insert([
  { partner_id: partner.id, title: "Summer Events Banner", kind: "banner", image: "/assets/gd/hero-neon.webp", clicks: 428, signups: 24 },
  { partner_id: partner.id, title: "Venue Showcase Video", kind: "video", image: "/assets/venue-hero.webp", clicks: 316, signups: 18 },
  { partner_id: partner.id, title: "Organiser Guide Image", kind: "image", image: "/assets/organizer-hero.webp", clicks: 254, signups: 12 },
  { partner_id: partner.id, title: "Wedding Season Email", kind: "email", image: "/assets/gd/hero-wedding.webp", clicks: 141, signups: 5 },
]), "content");
const allEarn = earnings.reduce((a, e) => a + e.commission, 0), paidEarn = earnings.filter(e => e.status === "paid").reduce((a, e) => a + e.commission, 0);
must(await sb.from("partners").update({ referrals: referrals.length, eligible_revenue: round2(earnings.reduce((a, e) => a + e.eligible_revenue, 0)), earned: round2(allEarn), paid: round2(paidEarn) }).eq("id", partner.id), "partner totals");

/* ───────────────────────── PORT-001 client portal ───────────────────────── */
const CLIENT = { name: "Jordan Reid", email: "jordan.reid@example.com" };
must(await sb.from("portal_links").update({ revoked_at: iso(NOW) }).eq("event_id", event.id).eq("client_email", CLIENT.email).is("revoked_at", null), "revoke old links");
const token = randomBytes(32).toString("base64url");
const link = must(await sb.from("portal_links").insert({ event_id: event.id, token_hash: sha(token), client_name: CLIENT.name, client_email: CLIENT.email, created_by: event.owner_id, expires_at: iso(NOW + 30 * DAY) }).select("id").single(), "link");
must(await sb.from("audit_events").insert({ actor_id: event.owner_id, workspace_id: event.workspace_id, event: "portal.link_issued", metadata: { event_id: event.id, link_id: link.id, source: "seed-portals" } }), "audit");

const items = must(await sb.from("build_items").select("id,title,package,amount,image,category,status").eq("event_id", event.id), "build items");
const bi = t => items.find(i => i.title === t);
must(await sb.from("portal_approvals").delete().eq("event_id", event.id), "clean approvals");
must(await sb.from("portal_approvals").insert(([
  { event_id: event.id, build_item_id: bi("StagePro UK")?.id, kind: "approval", title: "Stage Production Package", supplier: "StagePro UK", detail: bi("StagePro UK")?.package ?? "", amount: bi("StagePro UK")?.amount ?? 9800, image: "/assets/gd/s-sound-lighting.webp", status: "pending", submitted_at: iso(NOW - 2 * DAY - 3 * HOUR), due_at: iso(NOW + 6 * DAY) },
  { event_id: event.id, build_item_id: bi("Austin Events Catering")?.id, kind: "confirm", title: "Confirm catering menu", supplier: "Austin Events Catering", detail: "Food village menu and dietary options", amount: bi("Austin Events Catering")?.amount ?? 12000, image: "/assets/gd/s-gourmet.webp", status: "pending", submitted_at: iso(NOW - 3 * DAY), due_at: iso(NOW + 5 * DAY) },
  { event_id: event.id, kind: "review", title: "Review marketing creative", supplier: "Alex Events", detail: "Poster, social story and email header", items_count: 3, image: "/assets/gd/builder/poster/poster-main.webp", status: "pending", submitted_at: iso(NOW - 4 * DAY), due_at: iso(NOW + 4 * DAY) },
  { event_id: event.id, build_item_id: bi("Riverside Park")?.id, kind: "sign_off", title: "Approve final site plan", supplier: "Riverside Park", detail: "Stage, bar and medical positions with emergency routes", image: "/assets/gd/v-riverside-park.webp", status: "pending", submitted_at: iso(NOW - 5 * DAY), due_at: iso(NOW + 3 * DAY) },
  { event_id: event.id, build_item_id: bi("Sound & Lighting Pro")?.id, kind: "approval", title: "Second Stage Production", supplier: "Sound & Lighting Pro", amount: bi("Sound & Lighting Pro")?.amount ?? 18000, image: "/assets/gd/s-sound-lighting.webp", status: "approved", submitted_at: iso(NOW - 12 * DAY), decided_at: iso(NOW - 9 * DAY), decided_name: CLIENT.name },
  { event_id: event.id, build_item_id: bi("Elite Security")?.id, kind: "approval", title: "Security & Stewarding", supplier: "Elite Security", amount: bi("Elite Security")?.amount ?? 8600, image: "/assets/gd/s-elite-security.webp", status: "approved", submitted_at: iso(NOW - 16 * DAY), decided_at: iso(NOW - 14 * DAY), decided_name: CLIENT.name },
] ).map(r => ({ build_item_id: null, detail: "", amount: null, items_count: null, due_at: null, decided_at: null, decided_name: null, ...r }))), "approvals");

function pdf(title, lines) {
  const esc = s => s.replace(/[\\()]/g, m => `\\${m}`).replace(/[^\x20-\x7e]/g, "-");
  const text = [`BT /F1 18 Tf 56 780 Td (${esc(title)}) Tj ET`, ...lines.map((l, i) => `BT /F1 11 Tf 56 ${748 - i * 18} Td (${esc(l)}) Tj ET`)].join("\n");
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`];
  let out = "%PDF-1.4\n"; const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return "\\x" + Buffer.from(out).toString("hex");
}
const when2 = d => iso(NOW - d * DAY);
must(await sb.from("portal_documents").delete().eq("event_id", event.id), "clean docs");
must(await sb.from("portal_documents").insert([
  { event_id: event.id, title: "Event Proposal v2.1.pdf", tag: "Proposal", body: pdf("Neon Nights Festival - Event Proposal v2.1", ["Prepared for Jordan Reid by Alex Events", "Riverside Park, London - Saturday 24 October 2026", "Scope: three stages, food village, bars, security and medical cover", "Budget: GBP 120,000 including production, venue and staffing", "Deposit: 50% on acceptance, balance 14 days before the event"]), created_by: event.owner_id, updated_at: when2(5) },
  { event_id: event.id, title: "Venue Contract - Signed.pdf", tag: "Contract", body: pdf("Venue Hire Agreement - Riverside Park", ["Hirer: Alex Events on behalf of Jordan Reid", "Hire period: 23 October 2026 08:00 to 25 October 2026 18:00", "Capacity: 2,000 standing, licensed until 01:00", "Signed by both parties"]), created_by: event.owner_id, updated_at: when2(9) },
  { event_id: event.id, title: "Stage Design Plan.pdf", tag: "Design", body: pdf("Stage Design Plan", ["Main stage 12m x 8m with LED wall (4 x 3m)", "Second stage 10m x 6m, rigging by Stage & Rigging Co.", "Front-of-house mix position 30m from the stage lip"]), created_by: event.owner_id, updated_at: when2(12) },
  { event_id: event.id, title: "Risk Assessment.pdf", tag: "Compliance", body: pdf("Event Risk Assessment", ["Crowd management: 48 SIA stewards, two medical teams", "Weather contingency and evacuation routes agreed with venue", "Noise limit monitoring at site boundary until 23:30"]), created_by: event.owner_id, updated_at: when2(15) },
]), "docs");

must(await sb.from("portal_messages").delete().eq("event_id", event.id), "clean msgs");
must(await sb.from("portal_messages").insert(([
  { event_id: event.id, author_id: event.owner_id, author_name: "Alex Thomas", author_avatar: "/assets/gd/av-alex-organizer.webp", body: "Here's the updated stage design for your review — StagePro's package is in Approvals.", created_at: iso(NOW - 2 * HOUR) },
  { event_id: event.id, author_name: "Sophie Malik", author_avatar: "/assets/gd/av-sophie-malik.webp", body: "Catering menu options are ready for review.", created_at: iso(NOW - 5 * HOUR) },
  { event_id: event.id, author_name: "Ryan Brooks", author_avatar: "/assets/gd/av-ryan-brooks.webp", body: "Marketing campaign draft is attached.", read_at: iso(NOW - 20 * HOUR), created_at: iso(NOW - DAY - 2 * HOUR) },
  { event_id: event.id, author_name: "Riverside Park", author_avatar: "/assets/gd/v-riverside-park.webp", body: "Site access details and setup schedule.", read_at: iso(NOW - DAY), created_at: iso(NOW - 2 * DAY - HOUR) },
] ).map(r => ({ author_id: null, read_at: null, ...r }))), "messages");

// Client invoices (organizer → client). Drafts appear as scheduled / not issued; nothing is marked paid that the seed did not record as paid.
const NUMS = ["INV-2026-001", "INV-2026-002", "INV-2026-003", "INV-2026-004"];
const old = must(await sb.from("invoices").select("id").eq("workspace_id", event.workspace_id).in("number", NUMS), "old inv").map(i => i.id);
if (old.length) { must(await sb.from("invoice_items").delete().in("invoice_id", old), "clean items"); must(await sb.from("invoices").delete().in("id", old), "clean inv"); }
const inv = [
  [NUMS[0], "Deposit payment (50%)", "paid", NOW - 30 * DAY, NOW - 16 * DAY, 60000, 60000],
  [NUMS[1], "Stage production", "sent", NOW - 2 * DAY, NOW + 12 * DAY, 9800, 0],
  [NUMS[2], "Catering services", "draft", null, NOW + 20 * DAY, 12000, 0],
  [NUMS[3], "Final balance", "draft", null, null, 38200, 0],
];
const invRows = must(await sb.from("invoices").insert(inv.map(([number, reference, status, issued, due, total, paid]) => ({
  workspace_id: event.workspace_id, event_id: event.id, number, client_name: CLIENT.name, client_email: CLIENT.email, contact_name: CLIENT.name, reference, status,
  issue_date: dateOnly(issued ?? NOW), due_date: due ? dateOnly(due) : null, subtotal: total, tax: 0, total, amount_paid: paid, issued_at: issued ? iso(issued) : null,
}))).select("id,number"), "invoices");
must(await sb.from("invoice_items").insert(invRows.map(r => { const row = inv.find(x => x[0] === r.number); return { invoice_id: r.id, description: row[1], detail: "Neon Nights Festival", quantity: 1, unit_price: row[5], tax_rate: 0, sort: 0 }; })), "invoice items");

/* ───────────────────────── manifest + storage states ───────────────────────── */
const portalUrl = `/portal/${token}`;
await fs.mkdir("artifacts/visual/ws-manifest", { recursive: true });
await fs.writeFile("artifacts/visual/ws-manifest/30-portals.json", JSON.stringify([
  { key: "port-001-client-portal", url: portalUrl, file: "Designs/Portals/Neon Nights Festival Dashboard.png", who: null },
  { key: "prom-001-promoter", url: "/promoter", file: "Designs/Portals/Neon Nights Promoter Dashboard.png", who: "promoter" },
  { key: "part-001-partner", url: "/partner", file: "Designs/Portals/Gala Dock Partner Performance Dashboard.png", who: "partner" },
], null, 2) + "\n");

if (process.argv.includes("--auth")) {
  const { chromium } = await import("@playwright/test");
  await fs.mkdir("artifacts/auth", { recursive: true });
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  try {
    for (const [who, email] of [["promoter", "promoter.demo@example.com"], ["partner", "partner.demo@example.com"]]) {
      const ctx = await browser.newContext(); const page = await ctx.newPage();
      await page.goto(`${BASE}/login?next=${encodeURIComponent(`/${who}`)}`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForSelector('input[name="email"]', { timeout: 120000 });
      await page.fill('input[name="email"]', email); await page.fill('input[name="password"]', PASSWORD);
      await page.locator('button[type="submit"]:not([disabled])').first().click();
      await page.waitForURL(u => new URL(u).pathname.startsWith(`/${who}`), { timeout: 120000 });
      await ctx.storageState({ path: `artifacts/auth/${who}.json` });
      console.log(`${who}: signed in → ${new URL(page.url()).pathname}`);
      await ctx.close();
    }
  } finally { await browser.close(); }
}

console.log(JSON.stringify({ event: event.id, promoter: promoter.id, clicks: clicks.length, sales: sales.length, partner: partner.id, referrals: referrals.length, portalLink: link.id, portalUrl: `${BASE}${portalUrl}` }, null, 2));
