import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextConfig } from "next";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture } from "../phase1/helpers";

// Q29 Virtual / webinar / hybrid (domains 181–184) — API-level, disposable identities, RLS clients. No provider API is called.
// Exit gate: entitlement controls join/replay without exposing host secrets.
type U = { id: string; email: string };
type Id = { id: string };
type J = Record<string, unknown>;
const db = admin as unknown as SupabaseClient;
const as = async (u: U) => (await signedIn(u.email)) as unknown as SupabaseClient;
const iso = (ms: number) => new Date(ms).toISOString();
const min = 60_000;
const rpc = async (c: SupabaseClient, fn: string, args: J) => { const r = await c.rpc(fn, args); if (r.error) throw new Error(`${fn}: ${r.error.message}`); return r.data as J; };
const dev = (s: string) => `dev-${s}-${"x".repeat(10)}`;
/** Issue + redeem, as the join routes do. */
const join = async (c: SupabaseClient, session: string, device: string, ticket: string | null = null) => {
  const i = await rpc(c, "virtual_issue_join_token", { p_session: session, p_device: device, p_ticket: ticket });
  if (!i.ok) return i;
  return rpc(c, "virtual_redeem_join_token", { p_token: i.token, p_device: device });
};

test.describe.configure({ mode: "serial" });

test.describe("Q29 virtual sessions, access, hybrid, attendance, recordings", () => {
  let O: U, B: U, B2: U, S: U, H: U, R: U, X: U; let oc: SupabaseClient, bc: SupabaseClient, b2c: SupabaseClient, sc: SupabaseClient, hc: SupabaseClient, rc: SupabaseClient, xc: SupabaseClient;
  let W: string, XW: string, E: string, TON: string, THALL: string, TVIP: string, TK: string, TKH: string, TK2: string, S1: string, S2: string, FORM: string, REG: string;

  test.beforeAll(async () => {
    [O, B, B2, S, H, R, X] = await Promise.all(["q29-owner", "q29-buyer", "q29-buyer2", "q29-speaker", "q29-host", "q29-reg", "q29-other"].map(l => createUser(l)));
    W = await seedWorkspace(O.id, "organizer", "Q29 Webinars");
    XW = await seedWorkspace(X.id, "organizer", "Q29 Other Org");
    E = ((await insertEventFixture({ owner_id: O.id, workspace_id: W, management: "professional", name: "Q29 Hybrid Summit", event_type: "conference", visibility: "public",
      status: "on_sale", starts_at: iso(Date.now() - 5 * min), ends_at: iso(Date.now() + 120 * min), capacity: 100 }, "q29-virtual-sessions").select("id").single()).data as Id).id;
    await db.from("event_virtual").insert({ event_id: E, format: "hybrid", capacity: 50 });
    const tiers = (await db.from("ticket_tiers").insert([{ event_id: E, name: "Online", price: 0, quantity: 40, status: "on_sale" }, { event_id: E, name: "Hall", price: 0, quantity: 60, status: "on_sale" },
      { event_id: E, name: "VIP online", price: 0, quantity: 5, status: "on_sale" }]).select("id,name")).data as { id: string; name: string }[];
    [TON, THALL, TVIP] = ["Online", "Hall", "VIP online"].map(n => tiers.find(t => t.name === n)!.id);
    const t = (holder: string, tier: string, code: string) => ({ code: `Q29${code}${Date.now()}`, event_id: E, tier_id: tier, holder_id: holder, order_ref: `Q29O${code}${Date.now()}`, status: "valid" });
    const tk = (await db.from("tickets").insert([t(B.id, TON, "A"), t(B.id, THALL, "H"), t(B2.id, TON, "B")]).select("id,tier_id,holder_id")).data as { id: string; tier_id: string; holder_id: string }[];
    TK = tk.find(x => x.holder_id === B.id && x.tier_id === TON)!.id; TKH = tk.find(x => x.tier_id === THALL)!.id; TK2 = tk.find(x => x.holder_id === B2.id)!.id;
    FORM = ((await db.from("registration_forms").insert({ event_id: E, status: "published" }).select("id").single()).data as Id).id;
    REG = ((await db.from("registrations").insert({ event_id: E, form_id: FORM, form_version: 1, name: "Reg One", email: R.email, user_id: R.id }).select("id").single()).data as Id).id;
    await db.from("registrations").update({ status: "approved" }).eq("id", REG);
    [oc, bc, b2c, sc, hc, rc, xc] = await Promise.all([O, B, B2, S, H, R, X].map(as));
  });
  test.afterAll(async () => {
    await db.from("virtual_attendance").delete().eq("event_id", E);
    await db.from("ticket_transfers").delete().in("ticket_id", ((await db.from("tickets").select("id").eq("event_id", E)).data ?? []).map(t => t.id));
    await db.from("check_ins").delete().eq("event_id", E);
    await db.from("registrations").delete().eq("event_id", E); await db.from("registration_forms").delete().eq("event_id", E);
    await db.from("tickets").delete().eq("event_id", E); await db.from("ticket_tiers").delete().eq("event_id", E);
    await db.from("events").delete().eq("id", E);
    await db.from("workspaces").delete().in("id", [W, XW]);
    await cleanup();
  });

  test("sessions: editors save tracks/breakouts/captions; host secrets never readable by attendees, other tenants or plain REST", async () => {
    S1 = (await rpc(oc, "virtual_session_save", { p_event: E, p: { title: "Keynote", track: "Main stage", starts_at: iso(Date.now() - 5 * min), ends_at: iso(Date.now() + 60 * min),
      join_url: "https://stream.example.com/attendee", speaker_url: "https://stream.example.com/backstage", host_url: "https://stream.example.com/host", host_secret_note: "pin 4321",
      captions: "live_human", caption_languages: ["EN", "cy"], sign_language: true, transcript: true, capacity: 2, max_devices_per_attendee: 1 } })).id as string;
    S2 = (await rpc(oc, "virtual_session_save", { p_event: E, p: { title: "VIP breakout", kind: "breakout", parent_session_id: S1, starts_at: iso(Date.now() - 5 * min),
      ends_at: iso(Date.now() + 60 * min), join_url: "https://stream.example.com/vip", tier_ids: [TVIP] } })).id as string;
    // Editing the schedule keeps the links.
    await rpc(oc, "virtual_session_save", { p_event: E, p: { track: "Hall A" }, p_session: S1 });
    expect(await rpc(oc, "virtual_session_links", { p_session: S1 })).toMatchObject({ host_url: "https://stream.example.com/host", join_url: "https://stream.example.com/attendee", host_secret_note: "pin 4321" });
    expect((await oc.from("virtual_sessions").select("id,track,caption_languages").eq("id", S1).single()).data).toMatchObject({ track: "Hall A", caption_languages: ["en", "cy"] });
    expect((await oc.from("virtual_sessions").select("host_url").eq("id", S1)).error).not.toBeNull();         // column-revoked even for the team
    for (const c of [bc, xc]) {
      expect((await c.rpc("virtual_session_links", { p_session: S1 })).error?.message).toMatch(/not_authorized/);
      expect((await c.from("virtual_sessions").select("id").eq("event_id", E)).data ?? []).toEqual([]);
    }
    expect((await xc.rpc("virtual_session_save", { p_event: E, p: { title: "Hijack", starts_at: iso(Date.now()), ends_at: iso(Date.now() + min) } })).error?.message).toMatch(/not_authorized/);
    expect((await oc.rpc("virtual_session_save", { p_event: E, p: { title: "Bad", starts_at: iso(Date.now()), ends_at: iso(Date.now() + min), join_url: "http://plain" } })).error?.message).toMatch(/https/);
    const pub = await rpc(anon() as unknown as SupabaseClient, "event_virtual_public", { p_event: E });
    expect(JSON.stringify(pub)).not.toMatch(/https|pin 4321/);
    expect((pub.sessions as J[]).find(s => s.id === S1)).toMatchObject({ captions: "live_human", sign_language: true, transcript: true });
  });

  test("hybrid tiers: separate online and in-person capacity; in-person tickets can't join; tier-restricted breakouts", async () => {
    await rpc(oc, "virtual_tier_mode_set", { p_tier: TON, p_mode: "online" });
    await rpc(oc, "virtual_tier_mode_set", { p_tier: TVIP, p_mode: "online" });
    await rpc(oc, "virtual_tier_mode_set", { p_tier: THALL, p_mode: "in_person" });
    expect((await oc.rpc("virtual_tier_mode_set", { p_tier: THALL, p_mode: "hybrid" })).error?.message).toMatch(/online_capacity_exceeded/);   // 40+5+60 > 50 online
    expect((await db.from("ticket_tiers").update({ quantity: 101 }).eq("id", THALL)).error?.message).toMatch(/in_person_capacity_exceeded/);  // > venue 100
    expect((await db.from("ticket_tiers").update({ quantity: 46 }).eq("id", TON)).error?.message).toMatch(/online_capacity_exceeded/);
    expect((await xc.rpc("virtual_tier_mode_set", { p_tier: TON, p_mode: "hybrid" })).error?.message).toMatch(/not_authorized/);
    expect(await rpc(bc, "virtual_issue_join_token", { p_session: S1, p_device: dev("b"), p_ticket: TKH })).toMatchObject({ ok: false, reason: "in_person_ticket" });
    expect(await rpc(bc, "virtual_issue_join_token", { p_session: S2, p_device: dev("b"), p_ticket: TK })).toMatchObject({ ok: false, reason: "tier_not_included" });
    expect(((await rpc(anon() as unknown as SupabaseClient, "event_virtual_public", { p_event: E })).tier_modes as J)[THALL]).toBe("in_person");
  });

  test("join tokens: single-use, rotating, device-bound, device limit, capacity; non-holders refused", async () => {
    const i1 = await rpc(bc, "virtual_issue_join_token", { p_session: S1, p_device: dev("b1"), p_ticket: null });
    expect(i1).toMatchObject({ ok: true, role: "attendee" });
    expect(String(i1.token)).toMatch(/^[0-9a-f]{48}$/);
    const i2 = await rpc(bc, "virtual_issue_join_token", { p_session: S1, p_device: dev("b1"), p_ticket: null });   // rotation
    expect(await rpc(bc, "virtual_redeem_join_token", { p_token: i1.token, p_device: dev("b1") })).toMatchObject({ ok: false, reason: "token_revoked" });
    expect(await rpc(b2c, "virtual_redeem_join_token", { p_token: i2.token, p_device: dev("b1") })).toMatchObject({ ok: false, reason: "invalid_token" });   // someone else's token
    expect(await rpc(bc, "virtual_redeem_join_token", { p_token: i2.token, p_device: dev("b9") })).toMatchObject({ ok: false, reason: "wrong_device" });
    const ok = await rpc(bc, "virtual_redeem_join_token", { p_token: i2.token, p_device: dev("b1") });
    expect(ok).toMatchObject({ ok: true, url: "https://stream.example.com/attendee", role: "attendee" });
    expect(JSON.stringify(ok)).not.toMatch(/host|backstage|4321/);
    expect(await rpc(bc, "virtual_redeem_join_token", { p_token: i2.token, p_device: dev("b1") })).toMatchObject({ ok: false, reason: "token_used" });
    expect(await rpc(bc, "virtual_issue_join_token", { p_session: S1, p_device: dev("b2"), p_ticket: null })).toMatchObject({ ok: false, reason: "device_limit" });
    expect((await db.from("check_ins").select("credential").eq("ticket_id", TK)).data?.[0]?.credential).toBe("virtual");
    expect(await rpc(xc, "virtual_issue_join_token", { p_session: S1, p_device: dev("x"), p_ticket: null })).toMatchObject({ ok: false, reason: "no_entitlement" });
    expect(await rpc(xc, "virtual_issue_join_token", { p_session: S1, p_device: dev("x"), p_ticket: TK })).toMatchObject({ ok: false, reason: "not_your_ticket" });
    expect((await (anon() as unknown as SupabaseClient).rpc("virtual_issue_join_token", { p_session: S1, p_device: dev("a"), p_ticket: null })).error).not.toBeNull();
    // Session capacity 2: buyer + registrant fill it, buyer2 is told it's full.
    expect(await join(rc, S1, dev("r1"))).toMatchObject({ ok: false, reason: "no_entitlement" });   // access=ticket: registrations not accepted yet
    await rpc(oc, "virtual_session_save", { p_event: E, p: { access: "ticket_or_registration" }, p_session: S1 });
    expect(await join(rc, S1, dev("r1"))).toMatchObject({ ok: true, role: "attendee" });
    expect(await rpc(b2c, "virtual_issue_join_token", { p_session: S1, p_device: dev("c1"), p_ticket: null })).toMatchObject({ ok: false, reason: "session_full" });
    expect((await db.from("virtual_join_tokens").select("token_hash").limit(1)).data?.[0]?.token_hash).not.toBe(i2.token);   // only the hash is stored
    expect((await bc.from("virtual_join_tokens").select("id").limit(1)).error).not.toBeNull();   // service-only table
  });

  test("revocation: refund / transfer (Q21 credential rotation) and cancelled registration revoke tokens and end attendance", async () => {
    // Buyer2 gets a token while the session is full? Raise the capacity first.
    await rpc(oc, "virtual_session_save", { p_event: E, p: { capacity: 10 }, p_session: S1 });
    const pending = await rpc(b2c, "virtual_issue_join_token", { p_session: S1, p_device: dev("c1"), p_ticket: TK2 });
    expect(pending.ok).toBe(true);
    // Transfer to the buyer (holder change) → credential rotates → the pending token and any open session die.
    await db.from("tickets").update({ holder_id: B.id }).eq("id", TK2);
    expect(await rpc(b2c, "virtual_redeem_join_token", { p_token: pending.token, p_device: dev("c1") })).toMatchObject({ ok: false, reason: "token_revoked" });
    expect(await rpc(b2c, "virtual_issue_join_token", { p_session: S1, p_device: dev("c1"), p_ticket: TK2 })).toMatchObject({ ok: false, reason: "not_your_ticket" });
    // Refund the buyer's joined ticket: open attendance closes as revoked; heartbeat reports it.
    const open = (await db.from("virtual_attendance").select("id").eq("ticket_id", TK).is("left_at", null)).data as Id[];
    expect(open.length).toBe(1);
    await db.from("tickets").update({ status: "refunded" }).eq("id", TK);
    expect((await db.from("virtual_attendance").select("left_reason").eq("id", open[0]!.id).single()).data?.left_reason).toBe("revoked");
    expect(await rpc(bc, "virtual_heartbeat", { p_attendance: open[0]!.id })).toMatchObject({ ok: false, reason: "revoked" });
    expect(await rpc(bc, "virtual_issue_join_token", { p_session: S1, p_device: dev("b1"), p_ticket: TK })).toMatchObject({ ok: false, reason: "refunded" });
    const outbox = (await db.from("domain_outbox").select("event_type,payload").eq("event_type", "virtual.access_revoked").eq("aggregate_id", TK)).data as { payload: J }[];
    expect(outbox.length).toBeGreaterThan(0);
    // Registration cancelled.
    const rOpen = (await db.from("virtual_attendance").select("id").eq("registration_id", REG).is("left_at", null)).data as Id[];
    expect(rOpen.length).toBe(1);
    await db.from("registrations").update({ status: "cancelled" }).eq("id", REG);
    expect((await db.from("virtual_attendance").select("left_reason").eq("id", rOpen[0]!.id).single()).data?.left_reason).toBe("revoked");
    expect(await rpc(rc, "virtual_issue_join_token", { p_session: S1, p_device: dev("r1"), p_ticket: null })).toMatchObject({ ok: false, reason: "no_entitlement" });
  });

  test("speaker / moderator / host roles: backstage vs host link, team gets the host link, revocation ends access", async () => {
    expect((await xc.rpc("virtual_role_assign", { p_session: S1, p: { user_id: S.id, role: "speaker" } })).error?.message).toMatch(/not_authorized/);
    const sp = await rpc(oc, "virtual_role_assign", { p_session: S1, p: { email: S.email, role: "speaker" } });
    await rpc(oc, "virtual_role_assign", { p_session: S1, p: { user_id: H.id, role: "moderator" } });
    expect(await join(sc, S1, dev("s1"))).toMatchObject({ ok: true, role: "speaker", url: "https://stream.example.com/backstage" });
    expect(await join(hc, S1, dev("h1"))).toMatchObject({ ok: true, role: "moderator", url: "https://stream.example.com/host" });
    expect(await join(oc, S1, dev("o1"))).toMatchObject({ ok: true, role: "team", url: "https://stream.example.com/host" });
    expect((await sc.from("virtual_session_roles").select("role").eq("session_id", S1)).data).toEqual([{ role: "speaker" }]);   // own row only
    const t = await rpc(sc, "virtual_issue_join_token", { p_session: S1, p_device: dev("s2"), p_ticket: null });
    await rpc(oc, "virtual_role_revoke", { p_role: sp.id });
    expect(await rpc(sc, "virtual_redeem_join_token", { p_token: t.token, p_device: dev("s2") })).toMatchObject({ ok: false, reason: "token_revoked" });
    expect(await rpc(sc, "virtual_issue_join_token", { p_session: S1, p_device: dev("s3"), p_ticket: null })).toMatchObject({ ok: false, reason: "no_entitlement" });
  });

  test("attendance: leave records minutes, provider attendance is service-only, team summary; other tenants denied", async () => {
    const a = (await db.from("virtual_attendance").select("id").eq("user_id", H.id).is("left_at", null).single()).data as Id;
    expect(await rpc(hc, "virtual_heartbeat", { p_attendance: a.id })).toMatchObject({ ok: true });
    expect((await bc.rpc("virtual_leave", { p_attendance: a.id })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(hc, "virtual_leave", { p_attendance: a.id })).ok).toBe(true);
    expect(Number((await db.from("virtual_attendance").select("minutes").eq("id", a.id).single()).data?.minutes)).toBeGreaterThanOrEqual(0);
    expect((await oc.rpc("virtual_record_provider_attendance", { p_session: S1, p: { external_participant: "zoom:1" } })).error).not.toBeNull();
    await rpc(db, "virtual_record_provider_attendance", { p_session: S1, p: { external_participant: "zoom:77", joined_at: iso(Date.now() - 30 * min), left_at: iso(Date.now() - 5 * min) } });
    const sum = (await rpc(oc, "virtual_attendance_summary", { p_event: E }) as unknown as J[]).find(s => s.session_id === S1)!;
    expect(Number(sum.unique_attendees)).toBeGreaterThanOrEqual(3);
    expect(Number(sum.live_minutes)).toBeGreaterThanOrEqual(25);
    expect((await xc.rpc("virtual_attendance_summary", { p_event: E })).error?.message).toMatch(/not_authorized/);
    expect((await bc.rpc("virtual_attendance_summary", { p_event: E })).error?.message).toMatch(/not_authorized/);
    expect(((await bc.from("virtual_attendance").select("user_id").eq("event_id", E)).data ?? []).every(r => r.user_id === B.id)).toBe(true);
  });

  test("recordings: access window + audience; private Q04 path must be in the workspace folder; withdrawn hides it", async () => {
    expect((await oc.rpc("virtual_recording_save", { p_session: S1, p: { storage_path: `${XW}/rec.mp4` } })).error?.message).toMatch(/invalid_storage_path/);
    const rec = (await rpc(oc, "virtual_recording_save", { p_session: S1, p: { title: "Keynote replay", url: "https://vod.example.com/keynote", status: "available", audience: "attendees",
      access_until: iso(Date.now() + 7 * 864e5), captions: true } })).id as string;
    const file = (await rpc(oc, "virtual_recording_save", { p_session: S1, p: { storage_path: `${W}/virtual/keynote.mp4`, status: "available", audience: "team" } })).id as string;
    // Buyer now holds TK2 (transferred in, valid): attendee replay OK; team-only file refused; the outsider refused.
    expect(await rpc(bc, "virtual_replay_access", { p_recording: rec })).toMatchObject({ ok: true, url: "https://vod.example.com/keynote", mode: "replay" });
    expect(await rpc(bc, "virtual_replay_access", { p_recording: file })).toMatchObject({ ok: false, reason: "no_entitlement" });
    expect(await rpc(xc, "virtual_replay_access", { p_recording: rec })).toMatchObject({ ok: false, reason: "no_entitlement" });
    expect(await rpc(oc, "virtual_replay_access", { p_recording: file })).toMatchObject({ ok: true, path: `${W}/virtual/keynote.mp4` });
    expect((await bc.from("virtual_recordings").select("id").eq("id", rec)).data ?? []).toEqual([]);
    expect((await oc.from("virtual_recordings").select("url").eq("id", rec)).error).not.toBeNull();   // URL column-revoked
    // Window: closed → expired; reopened; withdrawn → not available.
    await rpc(oc, "virtual_recording_save", { p_session: S1, p: { access_until: iso(Date.now() - min), access_from: iso(Date.now() - 60 * min) }, p_recording: rec });
    expect(await rpc(bc, "virtual_replay_access", { p_recording: rec })).toMatchObject({ ok: false, reason: "replay_expired" });
    await rpc(oc, "virtual_recording_save", { p_session: S1, p: { access_until: "" }, p_recording: rec });
    await rpc(oc, "virtual_recording_transition", { p_recording: rec, p_to: "withdrawn" });
    expect(await rpc(bc, "virtual_replay_access", { p_recording: rec })).toMatchObject({ ok: false, reason: "not_available" });
    expect((await oc.rpc("virtual_recording_transition", { p_recording: rec, p_to: "processing" })).error).not.toBeNull();   // machine guard
    expect((await db.from("virtual_attendance").select("id").eq("recording_id", rec).eq("mode", "replay")).data!.length).toBe(1);
  });

  test("session lifecycle: ending a session revokes unused tokens and closes attendance; attendee view has no links", async () => {
    const mine = await rpc(bc, "virtual_my_sessions", { p_event: E }) as unknown as J[];
    expect(mine.find(s => s.id === S1)).toMatchObject({ role: "attendee", captions: "live_human" });
    expect(JSON.stringify(mine)).not.toMatch(/https/);
    const t = await rpc(bc, "virtual_issue_join_token", { p_session: S1, p_device: dev("b5"), p_ticket: TK2 });
    expect(t.ok).toBe(true);
    expect((await bc.rpc("virtual_session_transition", { p_session: S1, p_to: "ended" })).error?.message).toMatch(/not_authorized/);
    await rpc(oc, "virtual_session_transition", { p_session: S1, p_to: "live" });
    await rpc(oc, "virtual_session_transition", { p_session: S1, p_to: "ended" });
    expect(await rpc(bc, "virtual_redeem_join_token", { p_token: t.token, p_device: dev("b5") })).toMatchObject({ ok: false, reason: "token_revoked" });
    expect((await db.from("virtual_attendance").select("id").eq("session_id", S1).is("left_at", null)).data).toEqual([]);
    expect((await oc.rpc("virtual_session_transition", { p_session: S1, p_to: "draft" })).error).not.toBeNull();   // ended → draft illegal
    const ev = (await db.from("domain_outbox").select("event_type").eq("aggregate_id", S1)).data as { event_type: string }[];
    expect(ev.map(e => e.event_type)).toContain("virtual_session.state_changed");
  });

  test("virtual join keeps ticket valid; hybrid then admitted at door", async () => {
    // Q29 P1 (migration 4030): an online join records attendance + a 'virtual' check-in but never moves the ticket valid → used.
    const THY = ((await db.from("ticket_tiers").insert({ event_id: E, name: "Hybrid", price: 0, quantity: 5, status: "on_sale" }).select("id").single()).data as Id).id;
    await rpc(oc, "virtual_tier_mode_set", { p_tier: THY, p_mode: "hybrid" });
    const mk = async (tier: string, code: string) => ((await db.from("tickets").insert({ code: `Q29${code}${Date.now()}`, event_id: E, tier_id: tier, holder_id: B.id,
      order_ref: `Q29O${code}${Date.now()}`, status: "valid" }).select("id").single()).data as Id).id;
    const [TKY, TKO] = [await mk(THY, "Y"), await mk(TON, "N")];
    const S3 = (await rpc(oc, "virtual_session_save", { p_event: E, p: { title: "Hybrid plenary", starts_at: iso(Date.now() - 5 * min), ends_at: iso(Date.now() + 60 * min),
      join_url: "https://stream.example.com/plenary" } })).id as string;
    for (const [t, d] of [[TKY, "y1"], [TKO, "n1"]] as const) {
      expect(await join(bc, S3, dev(d), t)).toMatchObject({ ok: true, role: "attendee" });
      expect((await db.from("tickets").select("status,checked_in_at").eq("id", t).single()).data).toMatchObject({ status: "valid", checked_in_at: null });
      expect(((await db.from("check_ins").select("credential,result").eq("ticket_id", t)).data ?? []).map(c => c.credential)).toEqual(["virtual"]);
    }
    expect((await db.from("virtual_attendance").select("id").eq("session_id", S3).eq("user_id", B.id).eq("mode", "live")).data!.length).toBe(2);
    // Still transferable: the online join didn't lock the ticket.
    expect((await bc.rpc("offer_ticket_transfer", { p_ticket: TKY, p_email: "q29-friend@example.com", p_name: "Friend", p_token_hash: "f".repeat(64) })).error).toBeNull();
    await db.from("ticket_transfers").delete().eq("ticket_id", TKY);
    // Door: the hybrid ticket is admitted (first physical admission), a rescan is a duplicate; the online-only ticket is refused.
    const scan = (t: string) => rpc(oc, "scan_admission", { p_event: E, p_zone: null, p_ticket: t, p_pass: null, p_code: null, p_nonce: null, p_credential: "manual" });
    expect(await scan(TKY)).toMatchObject({ result: "admitted" });
    expect((await db.from("tickets").select("status").eq("id", TKY).single()).data?.status).toBe("used");
    expect(await scan(TKY)).toMatchObject({ result: "duplicate" });
    expect(await scan(TKO)).toMatchObject({ result: "online_only_ticket" });
    expect((await db.from("tickets").select("status").eq("id", TKO).single()).data?.status).toBe("valid");
    // Door metrics count physical admissions only; online joins are reported separately.
    const live = await rpc(oc, "event_live_snapshot", { p_event: E });
    expect((live.entry as J).online as number).toBeGreaterThanOrEqual(2);
    expect((await db.from("check_ins").select("id").eq("event_id", E).eq("result", "admitted").neq("credential", "virtual")).data!.length).toBe((live.entry as J).admitted);
  });

  test("attendee replay list: virtual_my_replays has ids, status, window, audience — never URLs or paths; outsiders see nothing", async () => {
    const mine = await rpc(bc, "virtual_my_replays", {}) as unknown as J[];
    const ofE = mine.filter(r => r.event_id === E);
    expect(ofE.length).toBeGreaterThanOrEqual(1);
    expect(ofE.every(r => r.status !== "withdrawn")).toBe(true);
    expect(Object.keys(ofE[0]).sort()).toEqual(["access_from", "access_until", "audience", "captions", "created_at", "event_id", "id", "session_id", "status", "title"]);
    expect(JSON.stringify(mine)).not.toMatch(/https|keynote\.mp4|storage_path/);
    expect(await rpc(xc, "virtual_my_replays", { p_event: E })).toEqual([]);
    expect((await (anon() as unknown as SupabaseClient).rpc("virtual_my_replays", {})).error).not.toBeNull();
  });

  test("provider redirect routes send Referrer-Policy: no-referrer (overrides the global header)", async ({ request }) => {
    const mod = await import("../../next.config") as unknown as { default: NextConfig & { default?: NextConfig } };
    const config = mod.default.default ?? mod.default;
    const rules = await config.headers!();
    const global = rules.findIndex(r => r.source === "/:path*");
    for (const source of ["/tickets/:id/join", "/virtual/:path*"]) {
      const i = rules.findIndex(r => r.source === source);
      expect(i).toBeGreaterThan(global);   // later rule wins for the same header key
      expect(rules[i].headers).toContainEqual({ key: "Referrer-Policy", value: "no-referrer" });
    }
    // And the served response (signed-out join → 303 to sign-in) carries it.
    for (const path of [`/virtual/${S1}/join`, `/tickets/${TK}/join`, `/virtual/replay/${S1}`]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.headers()["referrer-policy"]).toBe("no-referrer");
    }
  });
});
