// Idempotent demo enrichment keyed by event slug (safe to re-run; called at the end of seed-demo.mjs).
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-demo-extras.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = (r, what) => { if (r.error) { console.error(what, r.error); process.exit(1); } return r.data; };
const ev = async slug => must(await sb.from("events").select("id,settings,workspace_id,owner_id").eq("slug", slug).single(), "event " + slug);

// 1) Ticket entitlements backing every tier's sold count, spread over the last 60 days.
const created = must(await sb.rpc("seed_backfill_tickets", { p_days: 60 }), "backfill");

// 2) Neon Nights professional detail.
const neon = await ev("neon-nights");
must(await sb.from("events").update({ settings: { ...neon.settings,
  hero_image: "/assets/gd/hero-neon.webp",
  objectives: ["Sell 2,000 tickets", "Deliver a safe and memorable experience", "Achieve £28,500 forecast profit", "Build brand for future annual event"],
  type_settings: [["Multi-stage", "layers"], ["Food & Drink", "utensils"], ["Licensed Bar", "wine"], ["Security", "shield"], ["Camping (No)", "tent"], ["Cashless (Yes)", "card"], ["Age restriction (18+)", "user"], ["Noise control (Required)", "volume"]],
  areas: 3, curfew: "23:30",
  budget_lines: { "Venue & Facilities": 37000, "Artist & Entertainment": 26000, "Production & Technical": 18000, "Staff & Crew": 12000, "Marketing & Promotion": 9500, "Hospitality & Catering": 8500, "Insurance & Compliance": 4500, "Other": 4500 },
  revenue_sources: { Sponsorship: 12000, "Bar & concessions": 6100 },
  public_page: { details: true, tickets: true, map: true, faqs: true, lineup: true, terms: true },
  listings: ["Gala Dock Discover", "Google Events", "Apple Calendar", "Outlook", "ICS feed"],
} }).eq("id", neon.id), "neon settings");

// Page-view analytics (rollup table) for the last 30 days.
const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); return d.toISOString().slice(0, 10); });
must(await sb.from("event_metrics_daily").upsert(days.map((day, i) => {
  const views = Math.round(220 + i * 18 + Math.sin(i / 2) * 60 + (i > 24 ? 160 : 0));
  return { event_id: neon.id, day, page_views: views, unique_visitors: Math.round(views * .62), sources: { Instagram: .38, Facebook: .26, TikTok: .18, Direct: .12, Other: .06 } };
})), "metrics");

// Incidents and run-sheet live state.
await sb.from("incidents").delete().eq("event_id", neon.id);
must(await sb.from("incidents").insert([
  { event_id: neon.id, severity: "medium", title: "Minor crowd issue at merch stand", detail: "Queue overflow — stewards redirected flow.", status: "resolved" },
  { event_id: neon.id, severity: "high", title: "Generator power check required", detail: "Assigned to Tech Team", status: "open" },
  { event_id: neon.id, severity: "low", title: "VIP guest early arrival", detail: "No action needed", status: "resolved" },
  { event_id: neon.id, severity: "low", title: "Weather update", detail: "Conditions remain favourable", status: "open" },
]), "incidents");
const opsTasks = [["Confirm final run sheet", "operations", true], ["Crew briefing complete", "operations", true], ["Venue walk with security", "operations", false], ["Confirm hospitality setup", "hospitality", false], ["Final risk assessment", "risk", false], ["Emergency contacts distributed", "risk", false], ["Artist rider fulfilment", "hospitality", false], ["Generator & power delivery", "logistics", false], ["Barrier & fencing delivery", "logistics", false], ["Medical cover confirmed", "risk", true]];
await sb.from("tasks").delete().eq("event_id", neon.id).in("category", ["operations", "hospitality", "logistics", "risk"]);
must(await sb.from("tasks").insert(opsTasks.map(([title, category, done], i) => ({ event_id: neon.id, workspace_id: neon.workspace_id, title, category, status: done ? "done" : "todo", priority: category === "risk" ? "high" : "medium", due_at: new Date(Date.now() + (i < 3 ? 0 : 1) * 864e5).toISOString() }))), "ops tasks");

// 3) Past events: mark entitlements as checked in (realistic attendance) with check-in audit rows.
for (const slug of ["summer-sessions-2026", "food-drink-expo-2026", "rooftop-dinner-2026"]) {
  const e = await ev(slug);
  const { count: already } = await sb.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", e.id).eq("status", "used");
  if (already) continue;
  const { data: tks } = await sb.from("tickets").select("id").eq("event_id", e.id).eq("status", "valid");
  const used = (tks ?? []).filter((_, i) => i % 10 !== 0);
  for (let i = 0; i < used.length; i += 500) {
    const chunk = used.slice(i, i + 500).map(t => t.id);
    must(await sb.from("tickets").update({ status: "used", checked_in_at: new Date(Date.now() - 50 * 864e5).toISOString() }).in("id", chunk), "use " + slug);
    must(await sb.from("check_ins").insert(chunk.map(id => ({ ticket_id: id, event_id: e.id, result: "admitted" }))), "checkins " + slug);
  }
}

// 4) Customer wedding objectives for the brief.
const wed = await ev("alex-taylor-wedding");
must(await sb.from("events").update({ settings: { ...wed.settings, hero_image: "/assets/gd/hero-wedding.webp", hero_compact: "/assets/gd/hero-wedding-compact.webp", hero_compact_tabs: { guests: "/assets/gd/hero-wedding-compact-guests.webp", plan: "/assets/gd/hero-wedding-compact-plan.webp", money: "/assets/gd/hero-wedding-compact-money.webp", messages: "/assets/gd/hero-wedding-compact-messages.webp" }, thumb: "/assets/gd/thumb-wedding.webp" } }).eq("id", wed.id), "wedding hero");

console.log(JSON.stringify({ tickets_created: created, ok: true }));

// Lead activity history for the featured lead.
{
  const { data: lead } = await sb.from("leads").select("id").eq("reference", "LD-2026-018").maybeSingle();
  if (lead) {
    await sb.from("lead_activities").delete().eq("lead_id", lead.id);
    const ago = d => new Date(Date.now() - d * 864e5).toISOString();
    must(await sb.from("lead_activities").insert([
      { lead_id: lead.id, kind: "enquiry", title: "Enquiry received via website", detail: "Web form submission", actor_name: "Alex Thomas", created_at: ago(6) },
      { lead_id: lead.id, kind: "email", title: "Email sent", detail: "RE: Riverside Music Festival enquiry", actor_name: "Alex Thomas", created_at: ago(5.9) },
      { lead_id: lead.id, kind: "call", title: "Call with Sarah Mitchell", detail: "Discussed requirements and dates", actor_name: "Alex Thomas", created_at: ago(5) },
      { lead_id: lead.id, kind: "note", title: "Note added", detail: "Interested in multi-stage setup, awaiting budget confirmation", actor_name: "Alex Thomas", created_at: ago(4) },
      { lead_id: lead.id, kind: "task", title: "Follow-up task created", detail: "Call to confirm budget range", actor_name: "Alex Thomas", created_at: ago(4) },
    ]), "lead activity");
  }
}

// Proposals: totals must match content (server formula), and issued proposals need version snapshots.
{
  const { data: props } = await sb.from("proposals").select("*");
  for (const p of props ?? []) {
    const c = p.content ?? {};
    if (Array.isArray(c.line_items) && c.line_items.length) {
      const sub = c.line_items.reduce((s, i) => s + i[2] * i[3], 0) + (c.options ?? []).filter(o => o[3]).reduce((s, o) => s + o[2], 0);
      const content = { ...c, date: c.date || "2026-10-24", event_type: c.event_type || "Music Festival", attendance_type: c.attendance_type || "General public", client: c.client ?? { contact_name: "Sarah Mitchell", contact_email: "sarah.mitchell@riverside.gov.uk" } };
      must(await sb.from("proposals").update({ subtotal: sub, tax: Math.round(sub * 20) / 100, total: Math.round(sub * 120) / 100, content }).eq("id", p.id), "proposal totals");
    }
    if (p.status !== "draft") {
      const { count } = await sb.from("proposal_versions").select("id", { count: "exact", head: true }).eq("proposal_id", p.id);
      if (!count) must(await sb.from("proposal_versions").insert({ proposal_id: p.id, version: p.version, snapshot: p }), "proposal snapshot");
    }
  }
}

// Align demo data with the design references.
await import("./seed-align.mjs");
await import("./seed-customer-tickets.mjs");
await import("./seed-public-event.mjs");
await import("./seed-public-listings.mjs");
await import("./seed-ticket-pro.mjs");
await import("./seed-design-mirror.mjs");
