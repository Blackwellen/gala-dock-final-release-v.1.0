// Q23 promotion, campaigns and media for Alex Events (demo organiser), through the Q23 commands as demo identities:
//   * consent: audience_consent_record (service-only, the checkout/form path) for demo contacts (example.com), one opt-out via
//     audience_unsubscribe — the consent history; nothing is ever handed to an email provider (fixture transport only);
//   * campaign "Neon Nights — final release push": save_campaign_setup steps 1–4 (owner, finance.write for the ads budget), channel
//     budgets, campaign_transition → scheduled, campaign_tick → active; messages via campaign_message_save (one dispatched by
//     campaign_dispatch_message = transport 'fixture', one future reminder); tracked links via campaign_link_create; touches via
//     record_campaign_touch (service-only, the /r/c/<code> redirect path) with hashed demo visitors;
//   * follows (follow_subject) by demo customers/members; a brand kit with rules (save_brand_kit);
//   * media: GENERATED artwork (sharp, no people, no third-party content) uploaded server-side to event-media like the
//     public-media route, Q04 attribution public_media + clean-scan fixture, media_assets row inserted by the organiser (RLS, the
//     app's files action) and published with alt text + licence (media_asset_publish); a public gallery (save_media_gallery +
//     publish_media_gallery) and a landing page (save_landing_page + publish_landing_page);
//   * featured editorial rows by the platform-admin demo (set_directory_featured, commerce, aal2).
// No paid orders (attribution waits for Q07 onboarding).
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { sql } from "./lib.mjs";
import { service, signIn, call } from "./auth.mjs";

const ORG = "alex.events@example.com";
const q1 = async q => (await sql(q))[0];
const h = s => createHash("sha256").update(s).digest("hex");
const CONTACTS = ["alex.thompson@example.com", "james.carter@example.com", "neon.fan.one@example.com", "neon.fan.two@example.com", "neon.fan.three@example.com",
  "soho.regular@example.com", "charity.supporter@example.com", "lapsed.buyer@example.com"];
const ART = [
  ["Neon Nights main stage at night", "Neon Nights — main stage", ["#6D28D9", "#EC4899"]],
  ["Crowd silhouettes under purple lasers", "Neon Nights — lasers", ["#4C1D95", "#22D3EE"]],
  ["Riverside skyline poster artwork for Neon Nights", "Neon Nights — skyline", ["#1E1B4B", "#F59E0B"]],
];

async function artwork(title, [a, b]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/>
    <circle cx="1250" cy="220" r="160" fill="#ffffff" fill-opacity="0.12"/><rect x="0" y="640" width="1600" height="260" fill="#000000" fill-opacity="0.25"/>
    <text x="80" y="780" font-family="Arial, sans-serif" font-size="84" font-weight="700" fill="#ffffff">${title.replace(/&/g, "&amp;")}</text></svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
}

export async function run() {
  const out = { consents: 0, opt_outs: 0, campaigns: 0, campaign_active: 0, messages: 0, messages_dispatched: 0, links: 0, touches: 0, follows: 0, brand_kits: 0,
    media_assets: 0, media_public: 0, galleries: 0, landing_pages: 0, featured: 0 };
  const W = (await q1(`select id from public.workspaces where name = 'Alex Events' and owner_id = (select id from auth.users where email = '${ORG}')`)).id;
  const neon = (await q1(`select id from public.events where slug = 'neon-nights'`)).id;
  const org = await signIn(ORG);

  // Consent history (one per contact; lapsed buyer opts out).
  for (const [i, email] of CONTACTS.entries()) {
    if ((await q1(`select count(*)::int n from public.audience_consents where workspace_id = '${W}' and email = '${email}'`)).n) continue;
    const user = (await q1(`select id from auth.users where email = '${email}'`))?.id ?? null;
    await call(service, "audience_consent_record", { p_workspace: W, p_channel: "email", p_email: email, p_phone: null, p_user: user, p_token_hash: h(`q38-consent-${email}`),
      p_consent_version: "2026-10", p_source: i % 3 === 0 ? "checkout" : i % 3 === 1 ? "form" : "import" });
    out.consents++;
  }
  if ((await q1(`select status from public.audience_consents where workspace_id = '${W}' and email = 'lapsed.buyer@example.com'`))?.status === "opted_in") {
    await call(service, "audience_unsubscribe", { p_token_hash: h("q38-consent-lapsed.buyer@example.com") }); out.opt_outs++;
  }

  // Campaign.
  let c = await q1(`select id, status, version from public.promotion_campaigns where workspace_id = '${W}' and name = 'Neon Nights — final release push'`);
  if (!c) {
    const s1 = await call(org, "save_campaign_setup", { p_workspace: W, p_campaign: null, p_step: 1, p_patch: { name: "Neon Nights — final release push", goal: "ticket_sales", event_id: neon }, p_request_id: "q38-depth-pass2-neon-campaign" });
    const id = s1.id;
    await call(org, "save_campaign_setup", { p_workspace: W, p_campaign: id, p_step: 2, p_patch: { starts_at: new Date(Date.now() - 36e5).toISOString(), ends_at: "2026-12-12T18:00:00Z" } });
    await call(org, "save_campaign_setup", { p_workspace: W, p_campaign: id, p_step: 3, p_patch: { audience: { consented_contacts: true, followers: true } } });
    await call(org, "save_campaign_setup", { p_workspace: W, p_campaign: id, p_step: 4, p_patch: { budget_minor: 60000, channels: [{ channel: "email" }, { channel: "social", budget_minor: 15000 },
      { channel: "ads", budget_minor: 35000 }, { channel: "landing", budget_minor: 0 }, { channel: "poster", budget_minor: 10000 }] } });
    c = await q1(`select id, status, version from public.promotion_campaigns where id = '${id}'`); out.campaigns++;
  }
  if (c.status === "draft") { await call(org, "campaign_transition", { p_campaign: c.id, p_to: "scheduled", p_expected: "draft" }); c.status = "scheduled"; }
  if (c.status === "scheduled") { await call(service, "campaign_tick", {}); out.campaign_active++; }
  const MSGS = [["Final release is on sale", "The last 300 Neon Nights tickets are on sale now. Doors 6pm, 12 December, Riverside Arena.", 2 * 60_000, true],
                ["One week to go", "Neon Nights is next Saturday. Plan your journey: step-free route from London Bridge, shuttle from 5pm.", 37 * 864e5, false]];
  for (const [subject, body, inMs, dispatch] of MSGS) {
    let m = await q1(`select id, status from public.campaign_messages where campaign_id = '${c.id}' and subject = '${subject}'`);
    if (!m) { const r = await call(org, "campaign_message_save", { p_campaign: c.id, p_message: null, p_channel: "email", p_subject: subject, p_body: body, p_scheduled_at: new Date(Date.now() + inMs).toISOString() }); m = { id: r.id, status: "scheduled" }; out.messages++; }
    if (dispatch && m.status !== "sent") { await call(service, "campaign_dispatch_message", { p_message: m.id }); out.messages_dispatched++; }
  }
  const LINKS = [["social", "/events/neon-nights", "instagram", "instagram"], ["email", "/events/neon-nights", "email", "newsletter"], ["poster", "/events/neon-nights", "qr", "poster"]];
  for (const [channel, dest, medium, source] of LINKS) {
    let l = await q1(`select code from public.campaign_links where campaign_id = '${c.id}' and channel = '${channel}'`);
    if (!l) { l = await call(org, "campaign_link_create", { p_campaign: c.id, p_channel: channel, p_destination: dest, p_medium: medium, p_source: source }); out.links++; }
    const touches = (await q1(`select count(*)::int n from public.campaign_touches t join public.campaign_links k on k.id = t.link_id where k.code = '${l.code}'`)).n;
    const want = channel === "social" ? 5 : channel === "email" ? 3 : 2;
    for (let i = touches; i < want; i++) {
      const user = channel === "email" && i === 0 ? (await q1(`select id from auth.users where email = 'alex.thompson@example.com'`)).id : null;
      await call(service, "record_campaign_touch", { p_code: l.code, p_visitor_hash: h(`q38-visitor-${channel}-${i}`).slice(0, 32), p_user: user });
      out.touches++;
    }
  }

  // Follows.
  const FOLLOWS = [["alex.thompson@example.com", "organizer", W], ["alex.thompson@example.com", "event", neon], ["alex.thompson@example.com", "city", "london"],
    ["james.carter@example.com", "organizer", W], ["james.carter@example.com", "category", "nightlife"],
    ["ops.lead.demo@example.com", "venue", (await q1(`select id from public.listings where slug = 'riverside-arena'`)).id]];
  for (const [who, kind, key] of FOLLOWS) {
    if ((await q1(`select count(*)::int n from public.follows where user_id = (select id from auth.users where email = '${who}') and subject_kind = '${kind}' and subject_key = '${key}'`)).n) continue;
    await call(await signIn(who), "follow_subject", { p_kind: kind, p_key: key, p_alerts: true });
    out.follows++;
  }

  // Brand kit with rules.
  if (!(await q1(`select count(*)::int n from public.brand_kits where workspace_id = '${W}'`)).n) {
    await call(org, "save_brand_kit", { p_workspace: W, p_kit: { colors: ["#6D28D9", "#EC4899", "#111827", "#F9FAFB"], fonts: ["Inter"],
      tokens: { primary: "#6D28D9", accent: "#EC4899", ink: "#111827" }, rules: { palette_only: true, kit_fonts_only: true, min_contrast: 4.5 } }, p_expected_version: null });
    out.brand_kits++;
  }

  // Media: generated artwork → public assets.
  const assets = [];
  for (const [alt, title, colours] of ART) {
    let a = await q1(`select id, usage_scope from public.media_assets where workspace_id = '${W}' and title = '${title}'`);
    if (!a) {
      const buf = await artwork(title.replace("Neon Nights — ", "NEON NIGHTS · "), colours);
      const name = `${W}/demo-q38/${randomUUID()}.webp`;
      const up = await service.storage.from("event-media").upload(name, buf, { contentType: "image/webp" });
      if (up.error) throw new Error(`event-media upload: ${up.error.message}`);
      let e = (await service.from("storage_attribution").upsert({ bucket: "event-media", name, workspace_id: W, user_id: org.uid, file_class: "public_media", sniffed_mime: "image/webp",
        declared_mime: "image/webp", sha256: h(buf), size_bytes: buf.length, display_name: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.webp`,
        av_verdict: "clean", scan_status: "clean", scanned_at: new Date().toISOString(), scan_detail: "demo fixture (Q38): generated artwork" }, { onConflict: "bucket,name" })).error;
      if (e) throw new Error(`storage_attribution: ${e.message}`);
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/event-media/${name}`;
      const ins = await org.from("media_assets").insert({ event_id: neon, workspace_id: W, kind: "image", title, url, rights: "owned", status: "draft", subject: "event" }).select("id").single();
      if (ins.error) throw new Error(`media_assets: ${ins.error.message}`);
      a = { id: ins.data.id, usage_scope: "event" }; out.media_assets++;
    }
    if (a.usage_scope !== "public") {
      const r = await call(org, "media_asset_publish", { p_asset: a.id, p_meta: { alt_text: alt, licence: "owned", licence_holder: "Alex Events (demo)", credit: "Alex Events design team (demo artwork)", status: "approved", public: true } });
      if (!r.ok) throw new Error(`media_asset_publish: ${JSON.stringify(r.problems)}`);
      out.media_public++;
    }
    assets.push(a.id);
  }
  let g = await q1(`select id, (visibility = 'public') is_public from public.media_galleries where workspace_id = '${W}' and title = 'Neon Nights 2026 — artwork'`);
  if (!g) { const r = await call(org, "save_media_gallery", { p_workspace: W, p_gallery: null, p_title: "Neon Nights 2026 — artwork", p_event: neon, p_listing: null, p_items: assets.map(asset_id => ({ asset_id })) }); g = { id: r.id, is_public: false }; out.galleries++; }
  if (!g.is_public) { const r = await call(org, "publish_media_gallery", { p_gallery: g.id, p_public: true }); if (r.ok === false) throw new Error(`publish_media_gallery: ${JSON.stringify(r)}`); }
  let lp = await q1(`select id, status from public.promo_landing_pages where slug = 'alex-events-winter-nights'`);
  if (!lp) {
    const evs = (await sql(`select e.id from public.events e join public.event_distribution d on d.event_id = e.id where e.workspace_id = '${W}' and d.status = 'listed'
      and e.slug in ('neon-nights','soho-late-lounge-fridays','warehouse-sessions-bassline','hope-starts-here-charity-ball') order by e.starts_at`)).map(r => r.id);
    const r = await call(org, "save_landing_page", { p_workspace: W, p_page: null, p_page_data: { slug: "alex-events-winter-nights", title: "Winter nights with Alex Events",
      intro: "Festivals, late lounges and a charity ball across London and Manchester this winter.", hero_asset_id: assets[0], event_ids: evs, campaign_id: c.id } });
    lp = { id: r.id, status: "draft" }; out.landing_pages++;
  }
  if (lp.status !== "published") { const r = await call(org, "publish_landing_page", { p_page: lp.id, p_publish: true }); if (r.ok === false) throw new Error(`publish_landing_page: ${JSON.stringify(r)}`); }

  // Featured editorial rows (platform admin, commerce).
  const admin = await signIn("admin.demo@example.com");
  const FEAT = [["city", "london", "neon-nights", "Editor's pick"], ["category", "nightlife", "soho-late-lounge-fridays", "Staff favourite"], ["directory", "", "hope-starts-here-charity-ball", "Featured"]];
  for (const [surface, key, slug, label] of FEAT) {
    const ev = await q1(`select id, starts_at from public.events where slug = '${slug}'`);
    if ((await q1(`select count(*)::int n from public.directory_featured where surface = '${surface}' and surface_key = '${key}' and event_id = '${ev.id}' and kind = 'editorial' and status = 'active'`)).n) continue;
    await call(admin, "set_directory_featured", { p_surface: surface, p_key: key, p_event: ev.id, p_kind: "editorial", p_ends: ev.starts_at, p_boost: null, p_label: label });
    out.featured++;
  }
  return out;
}
