// Depth pass 3 (lane D · sub-lane SEED, 2026-10-29): organiser-workspace depth for Alex Events, through the real commands as the
// demo identities (organiser alex.events, manager ops.lead.demo, member james.carter, customer alex.thompson, crew ava.thompson):
//   1. leave requests — request_leave (crew herself / manager on behalf) + decide_leave (manager): pending, approved ×2, rejected;
//   2. a linked crew login — crew_invite_login (owner) + respond_to_invite as Ava Thompson (the /api/invites path; the invite token is
//      generated here, only its SHA-256 is stored, and it is discarded) → trg_invite_crew_link sets crew_members.user_id. Ava's demo
//      login is created like scripts/seed-depth/identities.mjs (reserved example.com, password generated once into .env.local);
//   3. Global Tech registration — publish_registration_form (approval + capacity 6 + waitlist), submissions through the service-only
//      submit_registration exactly as the rate-limited submitRegistration action calls it (the per-IP rate limit lives in the action and
//      does not apply here), then decide_registration: approved, rejected, pending approval, waitlisted, waitlist → approved;
//   4. resale — NOT seeded: list_ticket_for_resale + guard_resale_original_payer need an issued, Stripe-paid checkout order; the
//      demo customer's Neon tickets are legacy seed rows without one (and Neon's ticket_pro resale switch is off). Reported, not faked;
//   5. ticket risk flags — the documented purchase-limit path: the organiser sets Neon's ticket_pro.sales.max_per_customer (an RLS
//      settings update, as src/lib/actions/ticket-pro.ts does), the buyer reserves tickets with hold_tickets (no order, no money),
//      the service runs checkout_risk_check exactly as /api/checkout/session does, and the hold is released (release_checkout);
//   6. a second (online-only) Global Tech session with a replay: virtual_session_save + virtual_recording_save (placeholder URL);
//   7. lost property on Summer Sessions 2026: report_lost_item (customer), log_found_item ×3 (manager), claim_found_item (match, left
//      pending for the team's decision);
//   8. sustainability: record_sustainability — measured on Summer Sessions 2026, estimated on Neon Nights;
//   9. Global Tech venues + day: set_event_venues (3) then set_event_days bound to the primary venue;
//  10. Neon event forms: save_event_form(publish) — a staff form and a guest form; submit_form_response as staff / the ticket holder;
//      decide_form_response;
//  11. Neon dependencies: add_event_dependency over existing tasks / milestones / a tier, one approval edge left pending;
//  12. Comedy Central Live partners and logistics: package_save, party_save / party_transition, party_slot_set, rider_submit /
//      rider_decide; parking_area_save / parking_issue_permit, transport_save, accommodation_block_save / room_allocate,
//      loading_bay_save / logistics_window_book. Talent profiles and programme items have no command — the app writes them as plain
//      RLS inserts, so they are inserted by the signed-in organiser;
//  13. a disposable party-portal login: a test-fixture identity (p1-d4portal-<8 hex>@gala-dock.test, is_test_identity_email, no
//      workspace, user_metadata.test_fixture) linked with party_link_portal_user; the password is written ONLY to the scratchpad file
//      given in PORTAL_CREDENTIALS_FILE (never the repo, never printed);
//  14. marketplace: save_emergency_profile (Premier, as the provider), create_emergency_request on Neon, open_booking_dispute on a
//      confirmed Neon build item (no amount claimed, no money movement).
// Idempotent: every step checks the current state and writes only what is missing. No real emails/SMS, Stripe, provider or AI calls.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { sql } from "./lib.mjs";
import { service, signIn, call } from "./auth.mjs";

const ORG = "alex.events@example.com", MGR = "ops.lead.demo@example.com", MEMBER = "james.carter@example.com", CUST = "alex.thompson@example.com",
  AVA = "ava.thompson@example.com", PROVIDER = "provider.demo@example.com";
const WS = "75e6c471-8d5e-4b9f-b076-ff10cf209f01", NEON = "392fdf17-4e5c-4473-987c-251dc0a97228", GTC = "69a0c90c-1b4d-42f1-ab0a-4bdcbba71ca7",
  COMEDY = "b52e0eae-5de4-46f7-8ba2-2e8861aa8555", AVA_CREW = "37390853-e3a7-4166-b3c9-f5d6b39f6f50";
const DISPUTE_ITEM = "0019f750-8c14-4ac8-9ba1-b58bc323a728";   // Neon · Elite Security (Premier Event Services), confirmed, unpaid
const PORTAL_FILE = process.env.PORTAL_CREDENTIALS_FILE
  ?? "C:/Users/PC/AppData/Local/Temp/claude/c--Users-PC-Documents-Blackwellen-Built-Gala-Dock/92185747-57a6-40fb-ba41-cf24f325ddad/scratchpad/d4-seed/portal-login.json";

const sha = s => createHash("sha256").update(s).digest("hex");
const uuidFrom = s => { const h = sha(s); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const esc = s => String(s).replace(/'/g, "''");
const q1 = async q => (await sql(q))[0];
const n = async q => (await q1(q)).n;
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

// ── 2 (identity half): Ava Thompson's demo login, in the identities.mjs pattern.
async function ensureAva(out) {
  const list = await service.auth.admin.listUsers({ perPage: 1000 });
  if (list.error) throw new Error(`listUsers: ${list.error.message}`);
  if (list.data.users.some(u => u.email === AVA)) return;
  const password = process.env.DEMO_CREW_AVA_PASSWORD || randomBytes(12).toString("base64url") + "a1!";
  must(await service.auth.admin.createUser({ email: AVA, password, email_confirm: true, user_metadata: { full_name: "Ava Thompson", terms_version: "2026-10" } }), "createUser ava");
  if (!process.env.DEMO_CREW_AVA_PASSWORD) {
    let env = await fs.readFile(".env.local", "utf8").catch(() => "");
    if (!/^DEMO_CREW_AVA_PASSWORD=/m.test(env)) await fs.writeFile(".env.local", `${env}${env.endsWith("\n") || !env ? "" : "\n"}DEMO_CREW_AVA_PASSWORD=${password}\n`);
    process.env.DEMO_CREW_AVA_PASSWORD = password;
  }
  out.users_created++;
}

async function crewLogin(out) {
  await ensureAva(out);
  const crew = await q1(`select user_id from public.crew_members where id = '${AVA_CREW}'`);
  if (crew.user_id) return;
  const org = await signIn(ORG), ava = await signIn(AVA);
  let token = null;
  let inv = await q1(`select id from public.workspace_invites where crew_id = '${AVA_CREW}' and accepted_at is null and declined_at is null and revoked_at is null and expires_at > now() limit 1`);
  if (!inv) {
    token = randomBytes(32).toString("base64url");   // same shape as createInviteToken(); only the hash is stored
    inv = { id: await call(org, "crew_invite_login", { p_crew: AVA_CREW, p_token_hash: sha(token), p_role: "member" }) };
    out.crew_invites++;
  }
  // /api/invites: token link (first run) or the signed-in pending-invite panel (by id) for an invite left from an interrupted run.
  const r = await call(ava, "respond_to_invite", { p_token_hash: token ? sha(token) : null, p_invite_id: token ? null : inv.id, p_accept: true });
  if (r?.result !== "accepted") throw new Error(`respond_to_invite: ${JSON.stringify(r)}`);
  out.crew_linked++;
}

// ── 1. Leave.
async function leave(out) {
  const mgr = await signIn(MGR);
  const LEAVE = [
    { crew: AVA_CREW, self: true, kind: "annual", from: "2026-12-21T00:00:00Z", to: "2026-12-28T23:59:00Z", note: "Christmas with family in Leeds", decide: null },
    { crew: "89586fa2-014e-4d3c-8f23-8bb093d0f636", kind: "annual", from: "2026-11-16T00:00:00Z", to: "2026-11-20T23:59:00Z", note: "Half-term week away", decide: [true, "Approved — no shifts that week."] },
    { crew: "531019a8-317e-4bdd-a1b4-79e0a5f67030", kind: "sick", from: "2026-10-12T00:00:00Z", to: "2026-10-14T23:59:00Z", note: "Flu (self-certified)", decide: [true, "Get well soon."] },
    { crew: "e98d1dd7-e939-4485-a581-906a12a83102", kind: "unpaid", from: "2026-12-11T00:00:00Z", to: "2026-12-14T23:59:00Z", note: "Friend's wedding abroad",
      decide: [false, "Sorry — you are FOH sound for Neon Nights on the 12th. Can we look at the following weekend?"] },
  ];
  for (const l of LEAVE) {
    let row = await q1(`select id, status from public.leave_requests where crew_id = '${l.crew}' and note = '${esc(l.note)}'`);
    if (!row) {
      const who = l.self ? await signIn(AVA) : mgr;
      const id = await call(who, "request_leave", { p_ws: WS, p_from: l.from, p_to: l.to, p_kind: l.kind, p_note: l.note, p_crew: l.self ? null : l.crew });
      row = { id, status: "pending" }; out.leave_requests++;
    }
    if (l.decide && row.status === "pending") {
      await call(mgr, "decide_leave", { p_request: row.id, p_approve: l.decide[0], p_note: l.decide[1] });
      out[l.decide[0] ? "leave_approved" : "leave_rejected"]++;
    }
  }
}

// ── 3. Registration on Global Tech.
async function registration(out) {
  const org = await signIn(ORG);
  let form = await q1(`select id from public.registration_forms where event_id = '${GTC}' and status = 'published'`);
  if (!form) {
    const r = await call(org, "publish_registration_form", { p_event: GTC, p_form: { title: "Press & analyst registration", capacity: 6, per_email_limit: 1, approval_required: true, waitlist: true,
      opens_at: "2026-10-01T09:00:00Z", closes_at: "2027-09-11T17:00:00Z",
      fields: [{ key: "outlet", label: "Publication or firm", type: "text", required: true },
        { key: "role", label: "Your role", type: "select", required: true, options: ["Journalist", "Analyst", "Podcaster", "Other"] },
        { key: "coverage", label: "What will you cover?", type: "textarea", required: false },
        { key: "interviews", label: "I would like speaker interviews", type: "checkbox", required: false }] } });
    form = { id: r.id }; out.registration_forms++;
  }
  const PEOPLE = [["Hannah Cole", "TechWire UK", "Journalist", "approved"], ["Marcus Bell", "Northgate Research", "Analyst", "approved"], ["Aisha Rahman", "The Stack podcast", "Podcaster", "approved"],
    ["Ollie Grant", "Gadget Weekly", "Journalist", "rejected"], ["Sofia Marin", "Cloudcast", "Podcaster", "pending_approval"], ["Kwame Asante", "Fintech Daily", "Journalist", "pending_approval"],
    ["Lena Fischer", "Kessler Insights", "Analyst", "approved"], ["Jack Doyle", "Dev Diaries", "Other", "waitlisted"]];
  for (const [i, [name, outlet, role]] of PEOPLE.entries()) {
    const rid = uuidFrom(`depth-pass3:gtc-registration:${name}`);
    if (await n(`select count(*)::int n from public.registrations where form_id = '${form.id}' and request_id = '${rid}'`)) continue;
    const r = must(await service.rpc("submit_registration", { p_form: form.id, p_name: name, p_email: `${name.toLowerCase().replace(" ", ".")}@press.example.com`,
      p_answers: { outlet, role, coverage: i % 2 ? "" : "Keynote write-up and an AI-governance explainer", interviews: i % 3 === 0 }, p_user: null, p_request_id: rid }), "submit_registration");
    if (!r?.ok) throw new Error(`submit_registration ${name}: ${JSON.stringify(r)}`);
    out.registrations++;
  }
  // Decisions in an order that frees a place before the waitlisted registrant is approved.
  for (const [name, , , want] of [...PEOPLE.filter(p => p[3] === "rejected"), ...PEOPLE.filter(p => p[3] === "approved")]) {
    const r = await q1(`select id, status from public.registrations where form_id = '${form.id}' and request_id = '${uuidFrom(`depth-pass3:gtc-registration:${name}`)}'`);
    if (!r || r.status === want || !["pending_approval", "waitlisted", "submitted"].includes(r.status)) continue;
    await call(org, "decide_registration", { p_registration: r.id, p_to: want, p_reason: want === "rejected" ? "Consumer gadget outlet — this briefing is for enterprise press." : "" });
    out.registration_decisions++;
  }
}

// ── 5. Ticket risk flags (purchase-limit path) and 4. resale feasibility (read-only).
async function riskFlags(out) {
  const org = await signIn(ORG);
  const ev = must(await org.from("events").select("settings").eq("id", NEON).single(), "neon settings");
  const s = ev.settings ?? {};
  if (!s.ticket_pro?.sales?.max_per_customer) {
    const settings = { ...s, ticket_pro: { ...s.ticket_pro, sales: { ...s.ticket_pro?.sales, max_per_customer: 8 } } };
    must(await org.from("events").update({ settings, updated_at: new Date().toISOString() }).eq("id", NEON), "neon max_per_customer");
    out.purchase_caps_set++;
  }
  const GA = (await q1(`select id from public.ticket_tiers where event_id = '${NEON}' and name = 'General Admission'`)).id;
  for (const who of [CUST, MEMBER]) {
    const c = await signIn(who);
    if (await n(`select count(*)::int n from public.ticket_risk_flags where event_id = '${NEON}' and user_id = '${c.uid}' and kind = 'purchase_limit'`)) continue;
    const token = randomBytes(24).toString("base64url");
    await call(c, "hold_tickets", { p_event: NEON, p_items: [{ tier: GA, qty: 9 }], p_token: token });
    try {
      const r = await call(service, "checkout_risk_check", { p_event: NEON, p_buyer: c.uid, p_token: token, p_client_hash: null });
      if (r?.reason !== "purchase_limit") throw new Error(`checkout_risk_check: expected purchase_limit, got ${JSON.stringify(r)}`);
      out.risk_flags++;
    } finally { await call(c, "release_checkout", { p_token: token }); }
  }
}

async function resale(out) {
  const cust = await signIn(CUST);
  const [r] = await sql(`select count(*)::int tickets,
      count(*) filter (where o.status = 'issued' and o.stripe_session is not null and o.refund_status = 'none' and o.buyer_id = t.holder_id)::int paid_originals
    from public.tickets t join public.events e on e.id = t.event_id left join public.checkout_orders o on o.order_ref = t.order_ref
    where t.holder_id = '${cust.uid}' and t.status = 'valid' and e.workspace_id = '${WS}' and e.status in ('published','on_sale') and e.starts_at > now()`);
  out.resale_eligible_tickets = r.paid_originals;
  out.resale_listings = 0;   // never faked: a listing needs a Stripe-paid original (guard_resale_original_payer)
  out.resale_note = r.paid_originals ? "eligible tickets exist — list via the customer's ticket page" :
    `not seeded: ${r.tickets} valid future Alex Events ticket(s) held by the demo customer, none from an issued Stripe-paid order (original_payment_required); Neon also has resale switched off`;
}

// ── 6. Virtual: online-only Global Tech session + replay.
async function virtual(out) {
  const org = await signIn(ORG);
  const title = "Online track: Scaling live-event platforms";
  let ses = await q1(`select id from public.virtual_sessions where event_id = '${GTC}' and title = '${title}'`);
  if (!ses) {
    const tiers = (await sql(`select id from public.ticket_tiers where event_id = '${GTC}' and name in ('Online pass', 'Hybrid VIP')`)).map(t => t.id);
    const r = await call(org, "virtual_session_save", { p_event: GTC, p_session: null, p: { title, kind: "breakout", track: "Online", provider: "youtube_live",
      starts_at: "2027-09-18T12:00:00Z", ends_at: "2027-09-18T12:45:00Z", external_meeting_id: "gtc27-online-1", join_url: "https://stream.example.com/gtc27/online-track",
      access: "ticket", capacity: 2500, tier_ids: tiers, captions: "live_auto", caption_languages: ["en"], transcript: true, status: "scheduled",
      accessibility_notes: "Auto captions; transcript published with the replay." } });
    ses = { id: r.id }; out.virtual_sessions++;
  }
  if (!(await n(`select count(*)::int n from public.virtual_recordings where session_id = '${ses.id}'`))) {
    await call(org, "virtual_recording_save", { p_session: ses.id, p_recording: null, p: { title: "Online track — replay", url: "https://stream.example.com/gtc27/online-track/replay",
      audience: "attendees", access_from: "2027-09-18T15:00:00Z", access_until: "2027-11-18T23:59:00Z", captions: true } });   // stays 'processing' until after the session
    out.virtual_recordings++;
  }
}

// ── 7. Lost property on Summer Sessions 2026 (completed).
async function lostProperty(out) {
  const cust = await signIn(CUST), mgr = await signIn(MGR);
  const ev = (await q1(`select id from public.events where slug = 'summer-sessions-2026'`)).id;
  let rep = await q1(`select id from public.lost_reports where event_id = '${ev}' and reporter_id = '${cust.uid}'`);
  if (!rep) {
    const r = await call(cust, "report_lost_item", { p_event: ev, p_report: { category: "phone", description: "Black iPhone 14 in a clear case with a festival wristband tucked behind it",
      colour: "black", brand: "apple", location: "Main stage, left bar", lost_from: "2026-08-15T17:00:00Z", lost_to: "2026-08-15T20:30:00Z", contact_email: CUST } });
    rep = { id: r.id }; out.lost_reports++;
  }
  const FOUND = [["phone", "Black iPhone in a clear case, wristband behind it", "black", "apple", "Main stage, left bar", "Info tent, locked drawer"],
    ["wallet", "Brown leather wallet with a gym card, no cash", "brown", "", "Food court benches", "Info tent, locked drawer"],
    ["clothing", "Child's blue raincoat (age 6–7)", "blue", "", "Family area", "Info tent, rail"]];
  const ids = {};
  for (const [category, description, colour, brand, location, storage_location] of FOUND) {
    let f = await q1(`select id from public.found_items where event_id = '${ev}' and description = '${esc(description)}'`);
    if (!f) {
      const r = await call(mgr, "log_found_item", { p_event: ev, p_item: { category, description, colour, brand, location, storage_location, found_at: "2026-08-15T21:15:00Z" } });
      f = { id: r.id }; out.found_items++;
    }
    ids[category] = f.id;
  }
  if (!(await n(`select count(*)::int n from public.lost_claims where report_id = '${rep.id}'`))) {
    await call(mgr, "claim_found_item", { p_report: rep.id, p_item: ids.phone, p_evidence: { lock_screen: "photo of a dog on a beach", case: "clear with wristband" } });
    out.lost_matches++;   // left pending: the team verifies the owner at collection
  }
}

// ── 8. Sustainability.
async function sustainability(out) {
  const org = await signIn(ORG);
  const SUS = { "summer-sessions-2026": ["measured", [["waste_general", 520], ["waste_recycled", 740], ["waste_food_compost", 190], ["electricity_grid", 2600], ["diesel_generator", 210],
      ["water_supply", 18], ["travel_rail", 61000], ["travel_bus", 12000], ["travel_car", 34000]]],
    "neon-nights": ["estimated", [["electricity_grid", 4200], ["diesel_generator", 120], ["waste_general", 450], ["waste_recycled", 600], ["travel_rail", 48000], ["travel_car", 15000], ["travel_van", 900]]] };
  for (const [slug, [method, entries]] of Object.entries(SUS)) {
    const e = (await q1(`select id from public.events where slug = '${slug}'`)).id;
    if (await n(`select count(*)::int n from public.sustainability_entries where event_id = '${e}'`)) continue;
    await call(org, "record_sustainability", { p_event: e, p_entries: entries.map(([factor_key, quantity]) => ({ factor_key, quantity, method,
      note: method === "estimated" ? "Forecast from the production plan (demo figures)" : "Meter readings and contractor weighbridge tickets (demo figures)" })) });
    out.sustainability_entries += entries.length;
  }
}

// ── 9. Global Tech venues + day.
async function daysVenues(out) {
  const org = await signIn(ORG);
  if (!(await n(`select count(*)::int n from public.event_venues where event_id = '${GTC}'`))) {
    await call(org, "set_event_venues", { p_event: GTC, p_venues: [
      { venue_name: "ExCeL London — ICC Auditorium", role: "primary", capacity: 900 },
      { venue_name: "ExCeL London — Platinum Suite (expo & workshops)", role: "secondary", capacity: 600, starts_at: "2027-09-18T07:30:00Z", ends_at: "2027-09-18T15:30:00Z" },
      { venue_name: "Sunborn London (speaker dinner)", role: "secondary", capacity: 80, starts_at: "2027-09-18T17:30:00Z", ends_at: "2027-09-18T21:00:00Z" }] });
    out.event_venues += 3;
  }
  if (!(await n(`select count(*)::int n from public.event_days where event_id = '${GTC}'`))) {
    const primary = (await q1(`select id from public.event_venues where event_id = '${GTC}' and role = 'primary' order by sort limit 1`)).id;
    await call(org, "set_event_days", { p_event: GTC, p_days: [{ date: "2027-09-18", label: "Conference day", start_time: "08:30", end_time: "17:30", event_venue_id: primary }] });
    out.event_days++;
  }
}

// ── 10. Neon event forms + responses.
async function eventForms(out) {
  const org = await signIn(ORG);
  const FORMS = [
    { title: "Neon Nights — crew availability & dietary", audience: "staff", fields: [
        { key: "arrival", label: "Earliest arrival on the day", type: "select", required: true, options: ["10:00", "12:00", "14:00", "16:00"] },
        { key: "dietary", label: "Dietary requirements", type: "text", required: false },
        { key: "first_aid", label: "I hold a current first-aid certificate", type: "checkbox", required: false },
        { key: "emergency_contact", label: "Emergency contact phone", type: "text", required: true }],
      responses: [[MEMBER, { arrival: "10:00", dietary: "", first_aid: true, emergency_contact: "07700 900123" }, "accepted"],
        [MGR, { arrival: "12:00", dietary: "Vegetarian", first_aid: true, emergency_contact: "07700 900456" }, "accepted"],
        [AVA, { arrival: "14:00", dietary: "No nuts", first_aid: false, emergency_contact: "07700 900789" }, null]] },
    { title: "Neon Nights — accessibility & arrival", audience: "guest", fields: [
        { key: "arrival_window", label: "When will you arrive?", type: "select", required: true, options: ["Doors (18:00)", "18:30–19:30", "After 19:30"] },
        { key: "access", label: "Access needs", type: "multiselect", required: false, options: ["Step-free route", "Viewing platform", "Quiet space", "Companion ticket"] },
        { key: "notes", label: "Anything else we should know?", type: "textarea", required: false }],
      responses: [[CUST, { arrival_window: "18:30–19:30", access: ["Step-free route"], notes: "Coming with a friend who uses a cane." }, null]] },
  ];
  for (const f of FORMS) {
    let form = await q1(`select id from public.event_forms where event_id = '${NEON}' and title = '${esc(f.title)}' and status = 'published'`);
    if (!form) {
      const r = await call(org, "save_event_form", { p_event: NEON, p_family: null, p_form: { title: f.title, audience: f.audience, kind: "form", fields: f.fields }, p_publish: true });
      form = { id: r.id }; out.event_forms++;
    }
    for (const [who, answers, decision] of f.responses) {
      const c = await signIn(who);
      let resp = await q1(`select id, status from public.form_responses where form_id = '${form.id}' and user_id = '${c.uid}'`);
      if (!resp) {
        const r = await call(c, "submit_form_response", { p_form: form.id, p_answers: answers, p_build_item: null, p_request_id: `depth-pass3:${form.id}:${who}` });
        resp = { id: r.id, status: "submitted" }; out.form_responses++;
      }
      if (decision && resp.status === "submitted") { await call(org, "decide_form_response", { p_response: resp.id, p_decision: decision }); out.form_decisions++; }
    }
  }
}

// ── 11. Neon dependencies.
async function dependencies(out) {
  const org = await signIn(ORG);
  const task = async t => (await q1(`select id from public.tasks where event_id = '${NEON}' and title = '${esc(t)}' order by created_at limit 1`))?.id;
  const tier = async t => (await q1(`select id from public.ticket_tiers where event_id = '${NEON}' and name = '${esc(t)}'`))?.id;
  const EDGES = [
    ["task", await task("Set up ticket scanning"), "task", await task("Crew briefing complete"), true, "Scanner set-up waits for the crew briefing."],
    ["milestone", await task("Venue walkthrough"), "task", await task("Barrier & fencing delivery"), true, "Walkthrough needs the barriers in place."],
    ["task", await task("Final risk assessment"), "compliance", null, true, "Risk assessment signs off once licences and plans are approved."],
    ["ticket_tier", await tier("Backstage Pass"), "milestone", await task("Final supplier confirmations"), false, "Release backstage passes after suppliers confirm (advisory)."],
    ["task", await task("Confirm final DJ contract"), "approval", null, true, "Headline partner Volt signs off the DJ line-up."],
  ];
  for (const [dk, did, pk, pid, hard, note] of EDGES) {
    if (!did || (pk !== "compliance" && pk !== "approval" && !pid)) throw new Error(`dependency endpoints missing for: ${note}`);
    if (await n(`select count(*)::int n from public.event_dependencies where event_id = '${NEON}' and note = '${esc(note)}'`)) continue;
    await call(org, "add_event_dependency", { p_event: NEON, p_dependent_kind: dk, p_dependent_id: did, p_prerequisite_kind: pk, p_prerequisite_id: pid, p_hard: hard,
      p_lag_minutes: 0, p_note: note, p_approval_expires_at: null });
    out.dependencies++; if (pk === "approval") out.pending_approvals++;
  }
}

// ── 12. Comedy Central Live: partners (sponsor, host, artists with slots and riders) and logistics.
async function comedy(out) {
  const org = await signIn(ORG);
  const ev = await q1(`select starts_at, ends_at from public.events where id = '${COMEDY}'`);
  const at = mins => new Date(Date.parse(ev.starts_at) + mins * 60e3).toISOString();
  // Programme (plain RLS insert by the organiser, as src/lib/actions/event-profile.ts does).
  const PROG = [["MC: Jess Arden warms up the room", 0, 15, "act"], ["Support: Tom Ashby", 15, 25, "performance"], ["Interval", 40, 20, "break"], ["Headliner: Priya Kapoor — Small Talk", 60, 75, "performance"]];
  for (const [title, off, dur, segment] of PROG) {
    if (await n(`select count(*)::int n from public.programme_items where event_id = '${COMEDY}' and title = '${esc(title)}'`)) continue;
    must(await org.from("programme_items").insert({ event_id: COMEDY, title, starts_at: at(off), duration_minutes: dur, kind: "programme", segment, area: "Main room" }), `programme ${title}`);
    out.programme_items++;
  }
  // Talent profiles (workspace directory; no command — RLS insert by the organiser, like partners.mjs).
  for (const [name, kind, bio] of [["Priya Kapoor", "performer", "Stand-up; 'Small Talk' UK tour 2027"], ["Jess Arden", "host", "Comedy MC and radio presenter"], ["Tom Ashby", "performer", "Observational stand-up, Edinburgh Fringe newcomer nominee"]]) {
    if (await n(`select count(*)::int n from public.talent_profiles where workspace_id = '${WS}' and name = '${esc(name)}'`)) continue;
    must(await org.from("talent_profiles").insert({ workspace_id: WS, kind, name, bio, status: "active", created_by: org.uid }), `talent ${name}`);
    out.talent_profiles++;
  }
  let pkg = await q1(`select id from public.event_party_packages where event_id = '${COMEDY}' and name = 'Comedy night partner'`);
  if (!pkg) {
    const r = await call(org, "package_save", { p_event: COMEDY, p_id: null, p: { kind: "sponsorship", name: "Comedy night partner", tier: "Gold", description: "Bar sampling, logo on the stage screen, 6 guest passes",
      price: 3500, currency: "GBP", quantity: 1, status: "active", benefits: [
        { kind: "logo_placement", title: "Logo on the stage screen between acts", quantity: 1, owed_by: "organizer", due_days_before: 7 },
        { kind: "passes", title: "Partner guest passes", quantity: 6, pass_type: "vip", owed_by: "organizer", due_days_before: 3 },
        { kind: "asset", title: "Vector logo and sampling plan", quantity: 1, owed_by: "party", due_days_before: 21, evidence_required: true }] } });
    pkg = { id: r?.id ?? (await q1(`select id from public.event_party_packages where event_id = '${COMEDY}' and name = 'Comedy night partner'`)).id }; out.packages++;
  }
  const talent = async name => (await q1(`select id from public.talent_profiles where workspace_id = '${WS}' and name = '${esc(name)}'`)).id;
  const PARTIES = [
    { kind: "sponsor", name: "Fizzbox Craft Soda", fee: 3500, status: "confirmed", contact: "Nadia Haddad", email: "partners@fizzbox.example.com", package_id: pkg.id },
    { kind: "artist", name: "Priya Kapoor", fee: 4500, status: "confirmed", contact: "Ellis Ward — Laughing Stock Mgmt", email: "ellis@laughingstock.example.com", talent: "Priya Kapoor",
      slot: ["Headliner: Priya Kapoor — Small Talk", "headline", "confirmed"] },
    { kind: "host", name: "Jess Arden", fee: 600, status: "confirmed", contact: "Jess Arden", email: "jess.arden@example.com", talent: "Jess Arden", slot: ["MC: Jess Arden warms up the room", "host", "confirmed"] },
    { kind: "artist", name: "Tom Ashby", fee: 900, status: "negotiating", contact: "Tom Ashby", email: "tom.ashby@example.com", talent: "Tom Ashby", slot: ["Support: Tom Ashby", "support", "tentative"] },
  ];
  for (const p of PARTIES) {
    let party = await q1(`select id, status from public.event_parties where event_id = '${COMEDY}' and name = '${esc(p.name)}'`);
    if (!party) {
      await call(org, "party_save", { p_event: COMEDY, p_id: null, p_expected_version: null, p: { kind: p.kind, name: p.name, fee: p.fee, currency: "GBP", contact_name: p.contact, contact_email: p.email,
        arrival_buffer_minutes: 60, notes: "Demo partner (depth pass 3).", ...(p.package_id ? { package_id: p.package_id } : {}), ...(p.talent ? { talent_profile_id: await talent(p.talent) } : {}) } });
      party = await q1(`select id, status from public.event_parties where event_id = '${COMEDY}' and name = '${esc(p.name)}'`); out.parties++;
    }
    if (party.status === "prospect") { await call(org, "party_transition", { p_party: party.id, p_to: "negotiating", p_reason: "Terms sent", p_expected: null }); party.status = "negotiating"; out.party_transitions++; }
    if (p.status === "confirmed" && party.status === "negotiating") { await call(org, "party_transition", { p_party: party.id, p_to: "confirmed", p_reason: "Signed and confirmed", p_expected: null }); out.party_transitions++; }
    if (p.slot) {
      const item = (await q1(`select id from public.programme_items where event_id = '${COMEDY}' and title = '${esc(p.slot[0])}'`)).id;
      if (!(await n(`select count(*)::int n from public.event_party_slots where party_id = '${party.id}' and programme_item_id = '${item}' and status = '${p.slot[2]}'`))) {
        await call(org, "party_slot_set", { p_party: party.id, p_item: item, p_role: p.slot[1], p_status: p.slot[2], p_note: p.slot[1] === "headline" ? "75-minute set, no support overlap" : null });
        out.slots++;
      }
    }
  }
  const priya = (await q1(`select id from public.event_parties where event_id = '${COMEDY}' and name = 'Priya Kapoor'`)).id;
  if (!(await n(`select count(*)::int n from public.talent_riders where party_id = '${priya}'`))) {
    await call(org, "rider_submit", { p_party: priya, p_kind: "technical", p_summary: "Handheld radio mic, mic stand, stool and a bottle of water on stage.", p_items: [
      { category: "audio", description: "Shure SM58 radio mic + spare batteries", quantity: 1, required: true },
      { category: "staging", description: "Bar stool and mic stand centre stage", quantity: 1, required: true },
      { category: "lighting", description: "Warm front wash only — no moving lights during the set", quantity: 1, required: false }] });
    await call(org, "rider_decide", { p_rider: (await q1(`select id from public.talent_riders where party_id = '${priya}' and kind = 'technical' order by version desc limit 1`)).id,
      p_decision: "accepted", p_note: "All provided by the house PA." });
    await call(org, "rider_submit", { p_party: priya, p_kind: "hospitality", p_summary: "Quiet green room for 2, hot drinks, light vegetarian meal after the show.", p_items: [
      { category: "dressing_room", description: "Private green room with mirror", quantity: 1, required: true },
      { category: "catering", description: "Vegetarian meal for 2 after the set", quantity: 2, required: false }] });   // left submitted for the organiser
    out.riders += 2;
  }
  // Logistics.
  if (!(await n(`select count(*)::int n from public.parking_areas where event_id = '${COMEDY}'`))) {
    await call(org, "parking_area_save", { p_event: COMEDY, p_id: null, p: { name: "Artist bay (Highgate Road)", kind: "talent", capacity: 4, accessible_spaces: 1, opens_at: at(-300), closes_at: at(240),
      access_route: "Stage door on Highgate Road; steward lets you into the bay", status: "active" } });
    out.parking_areas++;
  }
  if (!(await n(`select count(*)::int n from public.parking_permits pm join public.parking_areas a on a.id = pm.area_id where a.event_id = '${COMEDY}'`))) {
    await call(org, "parking_issue_permit", { p_area: (await q1(`select id from public.parking_areas where event_id = '${COMEDY}' limit 1`)).id,
      p: { holder_name: "Priya Kapoor (tour car)", vehicle_reg: "LB23 PKY", valid_from: at(-180), valid_to: at(240), party_id: priya } });
    out.parking_permits++;
  }
  if (!(await n(`select count(*)::int n from public.transport_movements where event_id = '${COMEDY}'`))) {
    await call(org, "transport_save", { p_event: COMEDY, p_id: null, p: { kind: "talent", party_id: priya, departs_at: at(-120), arrives_at: at(-95), passengers: 2, from_place: "The Pembroke Hotel, Camden",
      to_place: "The Forum stage door", vehicle_label: "Executive car (Addison Lee)", status: "confirmed", notes: "Return car booked for 22:15" } });
    out.transport++;
  }
  if (!(await n(`select count(*)::int n from public.accommodation_blocks where event_id = '${COMEDY}'`))) {
    const d = ev.starts_at.slice(0, 10), next = new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10), cutoff = new Date(Date.parse(d) - 14 * 864e5).toISOString().slice(0, 10);
    await call(org, "accommodation_block_save", { p_event: COMEDY, p_id: null, p: { hotel_name: "The Pembroke Hotel, Camden", address: "12 Pratt St, London NW1 0AB", contact: "groups@pembroke.example.com",
      rooms_total: 3, check_in: d, check_out: next, cutoff_date: cutoff, nightly_rate: 165, currency: "GBP", status: "confirmed", notes: "Headliner, tour manager, MC" } });
    out.room_blocks++;
  }
  if (!(await n(`select count(*)::int n from public.room_allocations ra join public.accommodation_blocks b on b.id = ra.block_id where b.event_id = '${COMEDY}'`))) {
    const b = await q1(`select id, check_in, check_out from public.accommodation_blocks where event_id = '${COMEDY}' limit 1`);
    await call(org, "room_allocate", { p_block: b.id, p: { occupant_name: "Priya Kapoor", occupant_kind: "talent", room_type: "King", party_id: priya, nights_from: b.check_in, nights_to: b.check_out, status: "confirmed" } });
    out.room_allocations++;
  }
  if (!(await n(`select count(*)::int n from public.loading_bays where event_id = '${COMEDY}'`))) {
    await call(org, "loading_bay_save", { p_id: null, p: { event_id: COMEDY, name: "Stage door loading bay", max_vehicle: "3.5t van", max_length_m: 7, turnaround_minutes: 30,
      access_route: "Highgate Road kerbside bay (suspended for the day)", status: "active" } });
    out.loading_bays++;
  }
  if (!(await n(`select count(*)::int n from public.logistics_windows where event_id = '${COMEDY}'`))) {
    const bay = (await q1(`select id from public.loading_bays where event_id = '${COMEDY}' limit 1`)).id;
    await call(org, "logistics_window_book", { p_event: COMEDY, p_id: null, p: { bay_id: bay, kind: "load_in", supplier_name: "Camden Sound Hire (PA + monitors)", vehicle: "3.5t van",
      starts_at: at(-300), ends_at: at(-240), status: "confirmed" } });
    await call(org, "logistics_window_book", { p_event: COMEDY, p_id: null, p: { bay_id: bay, kind: "delivery", supplier_name: "Fizzbox Craft Soda (sampling stock)", vehicle: "Small van",
      party_id: (await q1(`select id from public.event_parties where event_id = '${COMEDY}' and name = 'Fizzbox Craft Soda'`)).id, starts_at: at(-180), ends_at: at(-150), status: "requested" } });
    out.logistics_windows += 2;
  }
}

// ── 13. Disposable party-portal login (test fixture) linked to the Comedy sponsor.
async function portal(out) {
  const org = await signIn(ORG);
  const party = await q1(`select p.id, p.portal_user_id, u.email from public.event_parties p left join auth.users u on u.id = p.portal_user_id where p.event_id = '${COMEDY}' and p.name = 'Fizzbox Craft Soda'`);
  if (!party) throw new Error("Comedy sponsor missing (run the comedy step first)");
  out.portal_party_id = party.id;
  if (party.portal_user_id && /^p1-[a-z0-9-]+-[0-9a-f]{8}@gala-dock\.test$/.test(party.email ?? "")) return;
  const email = `p1-d4portal-${randomBytes(4).toString("hex")}@gala-dock.test`, password = `${randomBytes(15).toString("base64url")}a1!`;
  must(await service.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { full_name: "Fizzbox portal (test fixture)", terms_version: "2026-10", test_fixture: true, purpose: "depth-pass3 party portal demo; purge with the test-fixture tooling" } }), "createUser portal");
  out.portal_users++;
  await fs.mkdir(path.dirname(PORTAL_FILE), { recursive: true });
  await fs.writeFile(PORTAL_FILE, JSON.stringify({ email, password, party_id: party.id, event: "Comedy Central Live", party: "Fizzbox Craft Soda", portal_path: `/portal/parties/${party.id}`,
    created_at: new Date().toISOString(), note: "Disposable test-fixture login (is_test_identity_email). Never commit." }, null, 2));
  await call(org, "party_link_portal_user", { p_party: party.id, p_email: email });
  out.portal_links++;
}

// ── 14. Marketplace: emergency request (with a matching provider profile) and a booking dispute.
async function marketplace(out) {
  const org = await signIn(ORG);
  const premier = (await q1(`select w.id from public.workspaces w join auth.users u on u.id = w.owner_id where u.email = '${PROVIDER}' and w.name = 'Premier Event Services'`)).id;
  if (!(await n(`select count(*)::int n from public.emergency_provider_profiles where workspace_id = '${premier}'`))) {
    await call(await signIn(PROVIDER), "save_emergency_profile", { p_ws: premier, p: { enabled: true, categories: ["production", "security", "catering"], radius_km: 40, response_minutes: 60,
      surcharge_pct: 25, rate_notes: "Call-out within 60 minutes inside the M25; 25% emergency surcharge on day rates.", available_now: true, available_until: "", base_lat: "51.53", base_lng: "-0.09" } });
    out.emergency_profiles++;
  }
  const marker = "Demo: the hired lighting desk failed its pre-show test";
  let em = await q1(`select id from public.emergency_requests where event_id = '${NEON}' and failure_reason = '${esc(marker)}'`);
  if (!em) {
    em = { id: await call(org, "create_emergency_request", { p_event: NEON, p: { severity: "high", category: "production", required_arrival: "2026-12-12T15:00:00Z",
      location: "Riverside Park — FOH position, main stage", scope: "Replacement lighting desk (grandMA3 light or equivalent) plus an operator for programming and the show.",
      failure_reason: marker, budget_max: "2500", original_item_id: null } }) };
    out.emergency_requests++;
  }
  out.emergency_request_id = em.id;
  let d = await q1(`select id from public.booking_disputes where build_item_id = '${DISPUTE_ITEM}'`);
  if (!d) {
    d = { id: await call(org, "open_booking_dispute", { p_item: DISPUTE_ITEM, p_reason: "materially_different", p_amount: null,
      p_summary: "Demo: the confirmed security plan lists 12 SIA-licensed stewards, but the latest roster from the provider shows 8. We need the full team or a revised quote before doors." }) };
    out.disputes++;
  }
  out.dispute_id = d.id;
}

const SECTIONS = { crewLogin, leave, registration, riskFlags, resale, virtual, lostProperty, sustainability, daysVenues, eventForms, dependencies, comedy, portal, marketplace };

export async function run() {
  const out = { users_created: 0, crew_invites: 0, crew_linked: 0, leave_requests: 0, leave_approved: 0, leave_rejected: 0, registration_forms: 0, registrations: 0, registration_decisions: 0,
    purchase_caps_set: 0, risk_flags: 0, virtual_sessions: 0, virtual_recordings: 0, lost_reports: 0, found_items: 0, lost_matches: 0, sustainability_entries: 0, event_venues: 0, event_days: 0,
    event_forms: 0, form_responses: 0, form_decisions: 0, dependencies: 0, pending_approvals: 0, programme_items: 0, talent_profiles: 0, packages: 0, parties: 0, party_transitions: 0, slots: 0,
    riders: 0, parking_areas: 0, parking_permits: 0, transport: 0, room_blocks: 0, room_allocations: 0, loading_bays: 0, logistics_windows: 0, portal_users: 0, portal_links: 0,
    emergency_profiles: 0, emergency_requests: 0, disputes: 0 };
  const errors = [];
  for (const [name, fn] of Object.entries(SECTIONS)) {
    try { await fn(out); } catch (e) { errors.push(`${name}: ${String(e.message ?? e).slice(0, 400)}`); }
  }
  if (errors.length) out.error = errors.join(" | ");
  return out;
}
