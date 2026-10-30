// Q40 advanced event composition for Alex Events, through the Q40 commands as the demo organiser / team:
//   * weekly series (create_event_series + generate_series_occurrences from the Soho Late Lounge anchor) with one local override
//     (series_edit scope 'this'); a tour (kind tour, add_tour_date × 3 from the Warehouse Sessions anchor);
//   * a multi-day festival "Riverside Weekender 2027": the event row and its day tiers are created by the organiser client exactly
//     like the app's create-event / ticket-setup actions (RLS-bound inserts, status draft — it stays a draft: no sales before Q07),
//     then set_event_venues (two venues), set_event_days (Fri–Sun), add_sub_event × 3 stages, and a weekend pass
//     (set_pass_components kind multi_day over the three day tiers);
//   * waivers: save_waiver_template + publish_waiver_template + set_event_waiver on Taste & Tango Fest; sign_waiver by the demo
//     customer for their two tickets — one adult, one minor with guardian consent (fictional demo names);
//   * stock: save_stock_item, record_stock_movement (idempotent request ids), transfer_stock; merch: save_merch_item and ONE
//     reservation (merch_reserve; it lapses after 15 minutes — no paid merch orders until Stripe onboarding);
//   * lost property on the completed Food & Drink Expo: report_lost_item (customer), log_found_item × 3 (manager),
//     claim_found_item + decide_lost_claim (verified);
//   * sustainability entries (record_sustainability) on two completed events.
import { sql } from "./lib.mjs";
import { signIn, call } from "./auth.mjs";

const ORG = "alex.events@example.com", MGR = "ops.lead.demo@example.com", CUST = "alex.thompson@example.com";
const q1 = async q => (await sql(q))[0];
const ev = async slug => q1(`select id, starts_at, ends_at, timezone from public.events where slug = '${slug}'`);
const londonParts = iso => {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const g = t => f.find(p => p.type === t).value;
  return { dow: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(g("weekday")) + 1, time: `${g("hour")}:${g("minute")}` };
};
const ymd = ms => new Date(ms).toISOString().slice(0, 10);

export async function run() {
  const out = { series: 0, occurrences: 0, overrides: 0, tours: 0, tour_dates: 0, festival_events: 0, event_venues: 0, event_days: 0, stages: 0, day_tiers: 0, passes: 0,
    waiver_templates: 0, event_waivers: 0, waiver_signatures: 0, minor_signatures: 0, stock_items: 0, stock_movements: 0, stock_transfers: 0, merch_items: 0, merch_reservations: 0,
    lost_reports: 0, found_items: 0, lost_claims: 0, sustainability_events: 0 };
  const W = (await q1(`select id from public.workspaces where name = 'Alex Events' and owner_id = (select id from auth.users where email = '${ORG}')`)).id;
  const org = await signIn(ORG), mgr = await signIn(MGR), cust = await signIn(CUST);

  // Weekly series with an override.
  const soho = await ev("soho-late-lounge-fridays");
  let s = await q1(`select id from public.event_series where workspace_id = '${W}' and name = 'Soho Late Lounge Fridays'`);
  if (!s) {
    const p = londonParts(soho.starts_at);
    const r = await call(org, "create_event_series", { p_workspace: W, p_series: { name: "Soho Late Lounge Fridays", kind: "recurring", visibility: "public", anchor_event_id: soho.id,
      description: "Weekly disco, soul and house night at The Velvet Room, Soho.", branding: { accent: "#EC4899" },
      recurrence: { freq: "weekly", interval: 1, byweekday: [p.dow], start_date: ymd(Date.parse(soho.starts_at) + 7 * 864e5), start_time: p.time, duration_minutes: 300, count: 6 } } });
    s = { id: r.id }; out.series++;
  }
  const g = await call(org, "generate_series_occurrences", { p_series: s.id, p_limit: 52 });
  out.occurrences += g.created ?? 0;
  const occ = await sql(`select id, name, series_overrides from public.events where series_id = '${s.id}' order by starts_at`);
  const xmas = occ[Math.min(4, occ.length - 1)];
  if (xmas && xmas.name !== "Soho Late Lounge — Christmas Social") {
    await call(org, "series_edit", { p_event: xmas.id, p_patch: { name: "Soho Late Lounge — Christmas Social", description: "Festive edition with a Motown set and mince pies at the door." }, p_scope: "this" });
    out.overrides++;
  }

  // Tour.
  const wh = await ev("warehouse-sessions-bassline");
  let t = await q1(`select id from public.event_series where workspace_id = '${W}' and name = 'Warehouse Sessions: Bassline UK Tour'`);
  if (!t) {
    const r = await call(org, "create_event_series", { p_workspace: W, p_series: { name: "Warehouse Sessions: Bassline UK Tour", kind: "tour", visibility: "public", anchor_event_id: wh.id,
      description: "The Bassline all-nighter on the road: Manchester, Leeds, Bristol and Glasgow." } });
    t = { id: r.id }; out.tours++;
  }
  for (const [local, venue_name, city] of [["2027-01-23T22:00:00", "The Foundry", "Leeds"], ["2027-02-06T22:00:00", "Harbourside Depot", "Bristol"], ["2027-02-20T22:00:00", "Clyde Works", "Glasgow"]]) {
    if ((await q1(`select count(*)::int n from public.events where series_id = '${t.id}' and occurrence_key = '${local.slice(0, 10)}:${city.toLowerCase()}'`)).n) continue;
    await call(org, "add_tour_date", { p_series: t.id, p_starts_local: local, p_duration_minutes: 360, p_venue: { venue_name, city, location: `${venue_name}, ${city}` } });
    out.tour_dates++;
  }

  // Multi-day festival with stages, days, two venues and a weekend pass.
  let fest = await ev("riverside-weekender-2027");
  if (!fest) {
    const r = await org.from("events").insert({ owner_id: org.uid, workspace_id: W, management: "professional", status: "draft", visibility: "private", name: "Riverside Weekender 2027",
      slug: "riverside-weekender-2027", event_type: "festival", starts_at: "2027-07-23T11:00:00Z", ends_at: "2027-07-25T22:00:00Z", timezone: "Europe/London", city: "London",
      venue_name: "Riverside Arena", location: "Riverside Arena, London SE1", capacity: 5000, guest_count: 0, currency: "GBP", tags: ["demo_showcase"],
      description: "Three days of house, disco and live bands across the Riverside Arena main stage, a riverside tent and the Docklands warehouse.",
      settings: { demo_showcase: true, demo_seed: "depth-pass2" } }).select("id").single();
    if (r.error) throw new Error(`festival event: ${r.error.message}`);
    fest = await ev("riverside-weekender-2027"); out.festival_events++;
  }
  if (!(await q1(`select count(*)::int n from public.event_venues where event_id = '${fest.id}'`)).n) {
    const [rv, dk] = [(await q1(`select id from public.listings where slug = 'riverside-arena'`)).id, (await q1(`select id from public.listings where slug = 'docklands-arena'`)).id];
    await call(org, "set_event_venues", { p_event: fest.id, p_venues: [{ listing_id: rv, venue_name: "Riverside Arena", role: "primary", capacity: 5000 },
      { listing_id: dk, venue_name: "Docklands Arena", role: "secondary", capacity: 3000, starts_at: "2027-07-24T12:00:00Z", ends_at: "2027-07-25T22:00:00Z" }] });
    out.event_venues += 2;
  }
  if (!(await q1(`select count(*)::int n from public.event_days where event_id = '${fest.id}'`)).n) {
    await call(org, "set_event_days", { p_event: fest.id, p_days: [{ date: "2027-07-23", label: "Friday", start_time: "12:00", end_time: "23:00" },
      { date: "2027-07-24", label: "Saturday", start_time: "11:00", end_time: "23:30" }, { date: "2027-07-25", label: "Sunday", start_time: "11:00", end_time: "22:30" }] });
    out.event_days += 3;
  }
  for (const [name, cap] of [["Main Stage", 5000], ["Riverside Tent", 1500], ["Warehouse Stage", 2500]]) {
    if ((await q1(`select count(*)::int n from public.events where parent_event_id = '${fest.id}' and name = '${name}'`)).n) continue;
    await call(org, "add_sub_event", { p_parent: fest.id, p_sub: { name, role: "stage", capacity: cap } });
    out.stages++;
  }
  const days = await sql(`select id, label from public.event_days where event_id = '${fest.id}' order by day_date`);
  const dayTiers = [];
  for (const [i, d] of days.entries()) {
    let tier = await q1(`select id from public.ticket_tiers where event_id = '${fest.id}' and name = '${d.label} day ticket'`);
    if (!tier) {
      const r = await org.from("ticket_tiers").insert({ event_id: fest.id, name: `${d.label} day ticket`, description: `Entry on ${d.label} to every stage.`, kind: "general",
        price: [49, 59, 55][i], quantity: 1300, status: "draft", sort: i + 1, event_day_id: d.id }).select("id").single();
      if (r.error) throw new Error(`day tier: ${r.error.message}`);
      tier = r.data; out.day_tiers++;
    }
    // Day tiers 3 × 1,300 + weekend pass 1,000 stay within the 5,000 approved capacity (first run used 1,500 → feasibility blocker).
    if ((await q1(`select quantity from public.ticket_tiers where id = '${tier.id}'`)).quantity > 1300) {
      const u = await org.from("ticket_tiers").update({ quantity: 1300 }).eq("id", tier.id);
      if (u.error) throw new Error(`day tier quantity: ${u.error.message}`);
      out.tiers_resized = (out.tiers_resized ?? 0) + 1;
    }
    dayTiers.push(tier.id);
  }
  let pass = await q1(`select id, pass_kind from public.ticket_tiers where event_id = '${fest.id}' and name = 'Weekend pass'`);
  if (!pass) {
    const r = await org.from("ticket_tiers").insert({ event_id: fest.id, name: "Weekend pass", description: "All three days, every stage, re-entry each day.", kind: "general",
      price: 139, quantity: 1000, status: "draft", sort: 0 }).select("id").single();
    if (r.error) throw new Error(`pass tier: ${r.error.message}`);
    pass = { id: r.data.id, pass_kind: null };
  }
  if (!pass.pass_kind) { await call(org, "set_pass_components", { p_pass_tier: pass.id, p_kind: "multi_day", p_components: dayTiers.map(tier_id => ({ tier_id })) }); out.passes++; }

  // Waivers on Taste & Tango Fest (customer holds two valid tickets).
  const tt = await ev("taste-tango-fest");
  let w = await q1(`select id, status from public.waiver_templates where workspace_id = '${W}' and title = 'Cooking workshop and open-flame demo' order by version desc limit 1`);
  if (!w) {
    const r = await call(org, "save_waiver_template", { p_workspace: W, p_family: null, p_from_version: null, p_waiver: { title: "Cooking workshop and open-flame demo", minors_allowed: true, adult_age: 18,
      body: "I understand the cooking workshop uses knives, hot surfaces and open flames. I will follow the chef's safety briefing and wear the apron and gloves provided. Under-18s take part only with a parent or guardian's consent and must stay with them." } });
    w = { id: r.id, status: "draft" }; out.waiver_templates++;
  }
  if (w.status !== "published") await call(org, "publish_waiver_template", { p_template: w.id });
  if (!(await q1(`select count(*)::int n from public.event_waivers where event_id = '${tt.id}' and waiver_template_id = '${w.id}' and status = 'active'`)).n) {
    await call(org, "set_event_waiver", { p_event: tt.id, p_template: w.id, p_tier_ids: null, p_active: true }); out.event_waivers++;
  }
  const tks = await sql(`select id from public.tickets where event_id = '${tt.id}' and holder_id = '${cust.uid}' and status = 'valid' order by created_at, id limit 2`);
  const SIGN = [{ signer_name: "Alex Thompson", signature_text: "Alex Thompson", is_minor: false },
    { signer_name: "Sam Thompson (15)", signature_text: "Sam Thompson", is_minor: true, guardian_name: "Alex Thompson", guardian_relationship: "parent", guardian_attested: true }];
  for (const [i, tk] of tks.entries()) {
    if ((await q1(`select count(*)::int n from public.waiver_signatures where ticket_id = '${tk.id}' and waiver_template_id = '${w.id}'`)).n) continue;
    await call(cust, "sign_waiver", { p_event: tt.id, p_template: w.id, p_sign: { ticket_id: tk.id, signer_email: CUST, ...SIGN[i] } });
    out.waiver_signatures++; if (SIGN[i].is_minor) out.minor_signatures++;
  }

  // Stock, movements, a transfer; merch items and one reservation.
  const neon = await ev("neon-nights");
  const STOCK = [["merchandise", "Neon Nights 2026 tee", "NEON26-TEE", "each", 40, neon.id], ["merchandise", "Neon Nights tote bag", "NEON26-TOTE", "each", 20, neon.id],
    ["consumable", "Glow wristbands", "GLOW-WB", "each", 500, neon.id], ["bar_stock", "Lager keg 50 L (cellar)", "KEG50-CEL", "keg", 8, null], ["bar_stock", "Lager keg 50 L (main bar)", "KEG50-BAR", "keg", 4, neon.id]];
  const ids = {};
  for (const [category, name, sku, unit, reorder_level, event_id] of STOCK) {
    let it = await q1(`select id from public.stock_items where workspace_id = '${W}' and sku = '${sku}'`);
    if (!it) { const r = await call(org, "save_stock_item", { p_workspace: W, p_item: null, p_data: { category, name, sku, unit, reorder_level, event_id } }); it = { id: r.id }; out.stock_items++; }
    ids[sku] = it.id;
  }
  const MOVES = [["NEON26-TEE", "receive", 300, "Delivery from printer (PO 2026-118)"], ["NEON26-TEE", "waste", 2, "Misprint"], ["NEON26-TOTE", "receive", 150, "Delivery from printer (PO 2026-118)"],
    ["GLOW-WB", "receive", 3000, "Bulk order"], ["GLOW-WB", "issue", 1200, "Issued to the entry team for Neon Nights"], ["KEG50-CEL", "receive", 40, "Brewery delivery"], ["NEON26-TEE", "count", 298, "Stock take"]];
  for (const [i, [sku, kind, qty, reason]] of MOVES.entries()) {
    const rid = `q38p2-stock-${i}-${sku}-${kind}`;
    if ((await q1(`select count(*)::int n from public.stock_movements where request_id = '${rid}' or (item_id = '${ids[sku]}' and reason = '${reason}' and kind = '${kind}')`)).n) continue;
    await call(org, "record_stock_movement", { p_item: ids[sku], p_kind: kind, p_quantity: qty, p_event: kind === "issue" ? neon.id : null, p_reason: reason, p_request_id: rid, p_delta: null });
    out.stock_movements++;
  }
  if (!(await q1(`select count(*)::int n from public.stock_movements where item_id = '${ids["KEG50-BAR"]}' and kind = 'transfer_in'`)).n) {
    await call(org, "transfer_stock", { p_from: ids["KEG50-CEL"], p_to: ids["KEG50-BAR"], p_quantity: 12, p_reason: "Main bar set-up for Neon Nights" }); out.stock_transfers++;
  }
  const merch = {};
  for (const [sku, name, price_minor] of [["NEON26-TEE", "Neon Nights 2026 tee", 2500], ["NEON26-TOTE", "Neon Nights tote bag", 1200]]) {
    let m = await q1(`select id from public.merch_items where workspace_id = '${W}' and stock_item_id = '${ids[sku]}'`);
    if (!m) { const r = await call(org, "save_merch_item", { p_workspace: W, p_item: null, p_data: { stock_item_id: ids[sku], event_id: neon.id, name, price_minor, per_order_limit: 4, status: "on_sale" } }); m = { id: r.id }; out.merch_items++; }
    merch[sku] = m.id;
  }
  if (!(await q1(`select count(*)::int n from public.merch_orders where request_id = 'q38-depth-pass2-merch-1'`)).n) {
    await call(cust, "merch_reserve", { p_event: neon.id, p_items: [{ merch_item_id: merch["NEON26-TEE"], qty: 1 }, { merch_item_id: merch["NEON26-TOTE"], qty: 1 }], p_request_id: "q38-depth-pass2-merch-1" });
    out.merch_reservations++;
  }

  // Lost property on the completed Food & Drink Expo.
  const fd = await ev("food-drink-expo-2026");
  let rep = await q1(`select id from public.lost_reports where event_id = '${fd.id}' and reporter_id = '${cust.uid}'`);
  if (!rep) {
    const r = await call(cust, "report_lost_item", { p_event: fd.id, p_report: { category: "bag", description: "Navy canvas tote with a notebook and a reusable coffee cup", colour: "navy", brand: "",
      location: "Demo kitchen stage, front rows", lost_from: "2026-09-05T13:00:00Z", lost_to: "2026-09-05T15:30:00Z", contact_email: CUST } });
    rep = { id: r.id }; out.lost_reports++;
  }
  const FOUND = [["bag", "Navy canvas tote bag with notebook and coffee cup", "navy", "", "Demo kitchen stage", "Info desk, shelf B"],
    ["keys", "Set of three keys on a red lanyard", "red", "", "Main hall toilets", "Info desk, key box"], ["clothing", "Grey wool scarf", "grey", "", "Cloakroom queue", "Info desk, shelf A"]];
  const found = {};
  for (const [category, description, colour, brand, location, storage_location] of FOUND) {
    let f = await q1(`select id from public.found_items where event_id = '${fd.id}' and description = '${description}'`);
    if (!f) { const r = await call(mgr, "log_found_item", { p_event: fd.id, p_item: { category, description, colour, brand, location, storage_location, found_at: "2026-09-05T18:30:00Z" } }); f = { id: r.id }; out.found_items++; }
    found[category] = f.id;
  }
  let claim = await q1(`select id, status from public.lost_claims where report_id = '${rep.id}'`);
  if (!claim) { const r = await call(mgr, "claim_found_item", { p_report: rep.id, p_item: found.bag, p_evidence: { contents: "notebook with a green cover, reusable coffee cup" } }); claim = { id: r.id, status: "pending" }; out.lost_claims++; }
  if (claim.status === "pending") await call(mgr, "decide_lost_claim", { p_claim: claim.id, p_decision: "verified", p_note: "Contents match the report." });

  // Sustainability on completed events.
  const SUS = { "food-drink-expo-2026": [["waste_general", 420], ["waste_recycled", 610], ["waste_food_compost", 280], ["electricity_grid", 3800], ["water_supply", 14], ["travel_rail", 52000], ["travel_car", 18000]],
    "halloween-rave-2025": [["waste_general", 380], ["waste_recycled", 290], ["electricity_grid", 2900], ["diesel_generator", 160], ["travel_bus", 9000], ["travel_car", 26000]] };
  for (const [slug, entries] of Object.entries(SUS)) {
    const e = await ev(slug);
    if ((await q1(`select count(*)::int n from public.sustainability_entries where event_id = '${e.id}'`)).n) continue;
    await call(org, "record_sustainability", { p_event: e.id, p_entries: entries.map(([factor_key, quantity]) => ({ factor_key, quantity, note: "Demo figures (indicative factors)" })) });
    out.sustainability_events++;
  }
  return out;
}
