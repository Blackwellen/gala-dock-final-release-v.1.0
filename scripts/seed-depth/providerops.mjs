// Q10–Q12 provider operations for the demo provider workspaces, all through the provider commands as the signed-in owner
// (provider_set_capacity_rule, provider_save_equipment, provider_save_service_area, provider_save_space, provider_set_space_links,
// provider_assign_job_space, provider_allocate_equipment, provider_add_job_evidence) and the organiser/customer order-group
// command (order_group_create). Jobs for confirmed booking lines that never got one go through service_backfill_provider_job
// (migration 202610293028: the same row the confirmation trigger writes, same guards; service-only).
// Only lines on events owned by demo identities (@example.com) are backfilled — lines on events owned by a non-demo account are
// reported as skipped. The one job-evidence file is a generated placeholder PDF with the Q04 clean-scan fixture (see trust.mjs).
import { randomUUID, createHash } from "node:crypto";
import { sql } from "./lib.mjs";
import { service, signIn, call, placeholderPdf } from "./auth.mjs";

const PROV = "provider.demo@example.com";
const q1 = async q => (await sql(q))[0];
const wsId = async (name, owner) => (await q1(`select id from public.workspaces where name = '${name}' and owner_id = (select id from auth.users where email = '${owner}') limit 1`))?.id;
const listing = async slug => (await q1(`select id from public.listings where slug = '${slug}'`))?.id;

export async function run() {
  const out = { capacity_rules: 0, equipment: 0, service_areas: 0, spaces: 0, space_layouts: 0, space_links: 0, jobs_backfilled: 0, job_spaces: 0,
    equipment_allocations: 0, job_evidence: 0, order_groups: 0 };
  const W = { riverside: await wsId("Riverside Arena", PROV), premier: await wsId("Premier Event Services", PROV), lvc: await wsId("London Venue Collective", PROV),
    mia: await wsId("Mia Rossi Photography", "solo.supplier.demo@example.com"), crew: await wsId("Northern Crew Agency", "agency.demo@example.com") };
  const owners = { riverside: PROV, premier: PROV, lvc: PROV, mia: "solo.supplier.demo@example.com", crew: "agency.demo@example.com" };

  // Capacity rules with set-up / tear-down / travel buffers.
  const kofi = (await q1(`select id from public.crew_members where workspace_id = '${W.crew}' and name = 'Kofi Mensah'`))?.id;
  const RULES = [
    ["premier", { scope: "listing", listing_id: await listing("elite-sounds-dj"), concurrent_limit: 1, setup_minutes: 90, teardown_minutes: 60, travel_minutes: 45, policy: "block", note: "One DJ rig; load-in 90 min, out 60 min" }],
    ["premier", { scope: "listing", listing_id: await listing("sound-lighting-pro"), concurrent_limit: 2, setup_minutes: 240, teardown_minutes: 120, travel_minutes: 60, policy: "warn", note: "Two production crews; warn beyond" }],
    ["premier", { scope: "listing", listing_id: await listing("gourmet-catering-co"), concurrent_limit: 3, setup_minutes: 180, teardown_minutes: 90, travel_minutes: 45, policy: "block", note: "Three kitchen teams" }],
    ["riverside", { scope: "listing", listing_id: await listing("gala-bites-catering"), concurrent_limit: 2, setup_minutes: 120, teardown_minutes: 60, travel_minutes: 0, policy: "block", note: "In-house kitchen, two service teams" }],
    ["mia", { scope: "workspace", concurrent_limit: 1, setup_minutes: 30, teardown_minutes: 30, travel_minutes: 90, policy: "block", note: "Solo photographer: one booking at a time" }],
    ["crew", { scope: "crew", crew_id: kofi, concurrent_limit: 1, setup_minutes: 30, teardown_minutes: 30, travel_minutes: 60, policy: "block", note: "Steward lead: one site per shift" }],
  ];
  for (const [w, p] of RULES) {
    const where = p.scope === "listing" ? `listing_id = '${p.listing_id}'` : p.scope === "crew" ? `crew_id = '${p.crew_id}'` : "scope = 'workspace'";
    if ((await q1(`select count(*)::int n from public.provider_capacity_rules where workspace_id = '${W[w]}' and ${where}`)).n) continue;
    await call(await signIn(owners[w]), "provider_set_capacity_rule", { p_ws: W[w], p });
    out.capacity_rules++;
  }

  // Equipment inventory.
  const EQUIP = [
    ["premier", "d&b audiotechnik Y-Series line array (pair)", "audio", 4, 180], ["premier", "Pioneer CDJ-3000 + DJM-A9 set", "audio", 3, 95],
    ["premier", "Wireless LED uplighter", "lighting", 40, 6], ["premier", "Photo booth kiosk with printer", "photo", 2, 120], ["premier", "Chafing dish set (10)", "catering", 12, 8],
    ["riverside", "Staging deck 2 × 1 m", "staging", 30, 12], ["riverside", "Round banquet table (10 seats)", "furniture", 40, 6],
    ["crew", "Motorola DP4400 radio", "comms", 40, 4], ["crew", "Hi-vis steward tabard", "uniform", 120, 0],
    ["mia", "Camera body + 3-lens kit", "photo", 2, 0],
  ];
  for (const [w, name, category, quantity, day_cost] of EQUIP) {
    if ((await q1(`select count(*)::int n from public.provider_equipment where workspace_id = '${W[w]}' and name = '${name.replace(/'/g, "''")}'`)).n) continue;
    await call(await signIn(owners[w]), "provider_save_equipment", { p_ws: W[w], p_equipment: null, p: { name, category, quantity, day_cost, status: "active", conflict_policy: "block", details: { demo_seed: "depth-pass2" } } });
    out.equipment++;
  }

  // Service areas (real UK city centres).
  const AREAS = [
    ["premier", "elite-sounds-dj", "Greater London", 51.5074, -0.1278, 60, 25, 1.2, 40], ["premier", "gourmet-catering-co", "London & Home Counties", 51.5074, -0.1278, 80, 30, 1.5, 60],
    ["premier", "city-transport", "London & M25", 51.5074, -0.1278, 100, 40, 1.1, 50],
    ["mia", "mia-rossi-photography", "Bristol & Bath", 51.4545, -2.5879, 120, 30, 0.45, 0], ["mia", "mia-rossi-photography", "Cardiff", 51.4816, -3.1791, 40, 0, 0.45, 35],
    ["crew", "northern-crew-event-staffing", "Leeds & West Yorkshire", 53.7997, -1.5492, 80, 30, 0.6, 0], ["crew", "northern-crew-event-staffing", "Manchester", 53.4808, -2.2426, 60, 0, 0.6, 45],
    ["riverside", "gala-bites-catering", "Central London", 51.5052, -0.0909, 30, 10, 2, 25],
  ];
  for (const [w, slug, label, lat, lng, radius_km, free_radius_km, fee_per_km, min_travel_fee] of AREAS) {
    if ((await q1(`select count(*)::int n from public.service_areas where workspace_id = '${W[w]}' and label = '${label}'`)).n) continue;
    await call(await signIn(owners[w]), "provider_save_service_area", { p_ws: W[w], p_area: null, p: { listing_id: await listing(slug), label, lat, lng, radius_km, free_radius_km, fee_per_km, min_travel_fee, active: true } });
    out.service_areas++;
  }

  // Space layouts + buffers on London Venue Collective's Riverside Park spaces (they had none), and a new multi-space arena.
  const prov = await signIn(PROV);
  const park = await listing("riverside-park-events-venue"), docklands = await listing("docklands-arena");
  for (const s of await sql(`select id, name, capacity_seated, capacity_standing from public.spaces where venue_id = '${park}' and layouts = '{}'::jsonb`)) {
    const seat = s.capacity_seated ?? 100, stand = s.capacity_standing ?? Math.round(seat * 1.5);
    const layouts = { banquet: Math.round(seat * 0.85), cabaret: Math.round(seat * 0.65), theatre: seat, standing: stand };
    await call(prov, "provider_save_space", { p_ws: W.lvc, p_venue: park, p_space: s.id, p: { capacity_seated: seat, capacity_standing: stand, layouts, turnaround_minutes: 90, min_hours: 4, status: "published" } });
    out.space_layouts++;
  }
  const ARENA = [
    { name: "Arena Floor", capacity_standing: 6000, capacity_seated: 3200, layouts: { standing: 6000, theatre: 3200 }, exclusive_group: "arena-bowl", area_sqm: 4200, rate_hourly: 2200 },
    { name: "Arena Bowl (seated)", capacity_seated: 4500, capacity_standing: 0, layouts: { theatre: 4500 }, exclusive_group: "arena-bowl", area_sqm: 5200, rate_hourly: 2600 },
    { name: "Hospitality Lounge", capacity_seated: 180, capacity_standing: 300, layouts: { banquet: 150, cabaret: 120, standing: 300 }, area_sqm: 520, rate_hourly: 450 },
  ];
  const ids = {};
  for (const a of ARENA) {
    let id = (await q1(`select id from public.spaces where venue_id = '${docklands}' and name = '${a.name}'`))?.id;
    if (!id) {
      id = await call(prov, "provider_save_space", { p_ws: W.lvc, p_venue: docklands, p_space: null, p: { ...a, indoor: true, turnaround_minutes: 240, min_hours: 6, status: "published",
        amenities: ["step_free", "loading_bay", "green_room"], details: { demo_seed: "depth-pass2" } } });
      id = typeof id === "string" ? id : (await q1(`select id from public.spaces where venue_id = '${docklands}' and name = '${a.name}'`)).id;
      out.spaces++;
    }
    ids[a.name] = id;
  }
  if (!(await q1(`select count(*)::int n from public.space_links where space_a = '${ids["Hospitality Lounge"]}' or space_b = '${ids["Hospitality Lounge"]}'`)).n) {
    await call(prov, "provider_set_space_links", { p_ws: W.lvc, p_space: ids["Hospitality Lounge"], p_linked: [ids["Arena Floor"], ids["Arena Bowl (seated)"]], p_exclusive: [] });
    out.space_links += 2;
  }
  const rv = await listing("riverside-arena");
  // Lane D (202610294080): the demo venue and DJ service opt in to the public free/busy calendar (default off for everyone else).
  for (const [slug, ws] of [["riverside-arena", W.riverside], ["riverside-dj-sound", W.riverside]]) {
    const id = slug === "riverside-arena" ? rv : await listing(slug);
    if (id && ws && !(await q1(`select (details->>'public_availability') = 'true' as enabled from public.listings where id = '${id}'`))?.enabled) {
      await call(prov, "provider_save_listing", { p_ws: ws, p_listing: id, p: { details: { public_availability: true } } }); out.public_availability = (out.public_availability ?? 0) + 1;
    }
  }
  const [suite, hall] = [(await q1(`select id from public.spaces where venue_id = '${rv}' and name = 'Riverside Suite'`))?.id, (await q1(`select id from public.spaces where venue_id = '${rv}' and name = 'Main Hall'`))?.id];
  if (suite && hall && !(await q1(`select count(*)::int n from public.space_links where space_a in ('${suite}','${hall}') and space_b in ('${suite}','${hall}')`)).n) {
    await call(prov, "provider_set_space_links", { p_ws: W.riverside, p_space: suite, p_linked: [hall], p_exclusive: [] });
    out.space_links++;
  }

  // Jobs for confirmed lines without one (demo-owned events only).
  const missing = await sql(`select b.id, (u.email like '%@example.com') demo from public.build_items b join public.listings l on l.id = b.listing_id join public.events e on e.id = b.event_id
      join auth.users u on u.id = e.owner_id where b.status = 'confirmed' and l.workspace_id in ('${Object.values(W).join("','")}')
      and not exists (select 1 from public.provider_jobs j where j.build_item_id = b.id) order by e.starts_at`);
  let skipped = 0;
  for (const m of missing) {
    if (!m.demo) { skipped++; continue; }
    await call(service, "service_backfill_provider_job", { p_item: m.id });
    out.jobs_backfilled++;
  }

  if (skipped) out.jobs_skipped = `${skipped} confirmed lines on events owned by a non-demo account (not touched)`;

  // BK-FDBFDD (90 guests, Riverside Arena) → Riverside Suite (banquet 120).
  const fd = await q1(`select id, space_id from public.provider_jobs where reference = 'BK-FDBFDD'`);
  if (fd && !fd.space_id && suite) { await call(prov, "provider_assign_job_space", { p_job: fd.id, p_space: suite }); out.job_spaces++; }

  // Equipment on the Neon Nights production job.
  const neonProd = await q1(`select j.id from public.provider_jobs j join public.listings l on l.id = j.listing_id join public.events e on e.id = j.event_id where l.slug = 'sound-lighting-pro' and e.slug = 'neon-nights'`);
  if (neonProd) {
    for (const [name, qty] of [["d&b audiotechnik Y-Series line array (pair)", 2], ["Wireless LED uplighter", 24]]) {
      const eq = await q1(`select id from public.provider_equipment where workspace_id = '${W.premier}' and name = '${name}'`);
      if (!eq || (await q1(`select count(*)::int n from public.job_equipment_allocations where job_id = '${neonProd.id}' and equipment_id = '${eq.id}'`)).n) continue;
      await call(prov, "provider_allocate_equipment", { p_job: neonProd.id, p_equipment: eq.id, p_quantity: qty });
      out.equipment_allocations++;
    }
  }

  // Job evidence on Riverside Arena's most recent completed job: set-up and completion notes + a placeholder delivery note PDF.
  const done = await q1(`select id, reference from public.provider_jobs where workspace_id = '${W.riverside}' and status = 'completed' order by starts_at desc limit 1`);
  if (done && !(await q1(`select count(*)::int n from public.provider_job_evidence where job_id = '${done.id}'`)).n) {
    await call(prov, "provider_add_job_evidence", { p_job: done.id, p_kind: "setup", p_note: "Room set banquet-style for 110 by 16:00; AV checked with the client's coordinator.", p_path: null });
    await call(prov, "provider_add_job_evidence", { p_job: done.id, p_kind: "completion", p_note: "Event closed 23:30; room cleared and handed back 00:45. No damage.", p_path: null });
    const pdf = placeholderPdf(`Delivery note — ${done.reference}`, ["Linen, glassware and staging delivered and signed for at 14:20.", "Signed: venue duty manager (demo)"]);
    const path = `${prov.uid}/${W.riverside}/${randomUUID()}.pdf`, sha = createHash("sha256").update(pdf).digest("hex");
    const up = await prov.storage.from("workspace-files").upload(path, pdf, { contentType: "application/pdf" });
    if (up.error) throw new Error(`evidence upload: ${up.error.message}`);
    await service.from("verified_private_uploads").insert({ path, owner_id: prov.uid, mime: "application/pdf", size_bytes: pdf.length, sha256: sha });
    const e = (await service.from("storage_attribution").upsert({ bucket: "workspace-files", name: path, user_id: prov.uid, workspace_id: W.riverside, file_class: "private_document",
      sniffed_mime: "application/pdf", declared_mime: "application/pdf", sha256: sha, size_bytes: pdf.length, display_name: "demo-delivery-note.pdf",
      av_verdict: "clean", scan_status: "clean", scanned_at: new Date().toISOString(), scan_detail: "demo fixture (Q38): generated placeholder PDF" }, { onConflict: "bucket,name" })).error;
    if (e) throw new Error(`storage_attribution: ${e.message}`);
    await call(prov, "provider_add_job_evidence", { p_job: done.id, p_kind: "delivery", p_note: "Signed delivery note (placeholder PDF).", p_path: path });
    out.job_evidence += 3;
  }

  // Order groups: Neon Nights (organiser) and the Alex & Taylor wedding (customer) — venue first, the rest depend on it.
  const GROUPS = [["neon-nights", "alex.events@example.com", "riverside-park-events-venue", ["sound-lighting-pro", "elite-security"], ["gourmet-catering-co"]],
                  ["alex-taylor-wedding", "alex.thompson@example.com", "the-loft-london", ["moments-studio", "elite-sounds-dj", "city-transport"], []]];
  for (const [ev, who, venue, deps, optional] of GROUPS) {
    const rows = await sql(`select b.id, l.slug from public.build_items b join public.listings l on l.id = b.listing_id join public.events e on e.id = b.event_id
        where e.slug = '${ev}' and l.slug in ('${[venue, ...deps, ...optional].join("','")}') and b.status not in ('cancelled','declined','expired')`);
    const v = rows.find(r => r.slug === venue);
    if (!v || (await q1(`select count(*)::int n from public.order_group_items where build_item_id = '${v.id}'`)).n) continue;
    const items = [{ build_item_id: v.id, required: true }, ...rows.filter(r => r.slug !== venue).map(r => ({ build_item_id: r.id, depends_on: v.id, required: !optional.includes(r.slug) }))];
    await call(await signIn(who), "order_group_create", { p_event: (await q1(`select id from public.events where slug = '${ev}'`)).id, p_items: items });
    out.order_groups++;
  }
  return out;
}
