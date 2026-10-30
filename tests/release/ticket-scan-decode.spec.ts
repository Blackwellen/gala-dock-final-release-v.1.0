import * as nodeCrypto from "node:crypto";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { admin, BASE, cleanup, createUser, insertEventFixture, seedWorkspace, signedIn } from "../phase1/helpers";
import sharp from "sharp";
import { barcodeSheetFit } from "../../src/lib/tickets/code128";
import { barcodeNaturalWidth, barcodePng, cameraFrame, decode, decodeFrames, pdfImages, printPageQr, qrPng, toRaw } from "./scan-render";

// Scan testing, real image decoding (lane D). Every credential here is fetched live from the app (/api/tickets/[id]/credential,
// the print page, the PDF), rendered exactly as the app renders it, rasterised, decoded with the scanners' own fallback decoder
// (src/lib/tickets/zxing-decode.ts, @zxing/library) and only then submitted — as door staff — through the real scanner server
// action: src/lib/tickets/scan.ts scanCredential (signature check → scan_admission), loaded with only its infrastructure
// imports stubbed (Supabase clients, rate limiter). No browser. Disposable identities and a test-fixture workspace; all removed.
type Db = SupabaseClient;
type Id = { id: string };
const db = admin as unknown as Db;
type Reply = { ok: true; result: string; reason?: string; attendee?: string | null; code?: string } | { ok: false; error: string };
type ScanMod = { scanCredential: (eventId: string, raw: string, opts?: { device?: string; gate?: string; zoneId?: string }) => Promise<Reply> };

/** Loads a TS source file as CommonJS in a sandbox with explicit dependencies (anything else is an error). */
function load<T>(file: string, deps: Record<string, unknown>, DateImpl: DateConstructor = Date): T {
  const mod = { exports: {} as T };
  const require = (n: string) => { if (n in deps) return deps[n]; throw new Error(`Unexpected dependency ${n} in ${file}`); };
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(js, { module: mod, exports: mod.exports, require, process, Buffer, Date: DateImpl, Math, console });
  return mod.exports;
}
/** The real scanner module; `as` is the signed-in scanner (door staff) its createClient() returns. `skewMs` moves its clock. */
function scanner(as: () => Db, skewMs = 0): ScanMod {
  const D = skewMs ? (class extends Date { static now() { return Date.now() + skewMs; } } as unknown as DateConstructor) : Date;
  const credentials = load("src/lib/tickets/credentials.ts", { "server-only": {}, "node:crypto": nodeCrypto }, D);
  return load<ScanMod>("src/lib/tickets/scan.ts", {
    "node:crypto": nodeCrypto, "./credentials": credentials,
    "@/lib/supabase/server": { createClient: async () => as() }, "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/workspace/db": { untyped: (x: unknown) => x }, "@/lib/security": { rateLimit: async () => true },
  }, D);
}

/** Session cookies for a disposable identity (user-scoped magic-link OTP exchange, as in d4-b2-gaps). */
const cookies = new Map<string, string>();
async function cookieFor(email: string) {
  if (cookies.has(email)) return cookies.get(email)!;
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const jar: string[] = [];
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => [], setAll: v => { for (const c of v) jar.push(`${c.name}=${c.value}`); } } });
  const r = await sb.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (r.error) throw r.error;
  cookies.set(email, jar.join("; "));
  return cookies.get(email)!;
}
const get = async (path: string, email: string) => fetch(`${BASE}${path}`, { headers: { cookie: await cookieFor(email) }, redirect: "manual" });
/** The holder's live rotating credential, as the wallet fetches it. */
async function live(ticketId: string, email: string) {
  const r = await get(`/api/tickets/${ticketId}/credential`, email);
  const j = await r.json() as { status: string; payload?: string };
  expect(j.status, `credential for ${ticketId}`).toBe("valid");
  return j.payload!;
}
/** What door staff get from the camera: the live wallet QR rendered as the app does at a phone size, decoded from pixels. */
async function decodedWallet(ticketId: string, email: string, px = 200) {
  const payload = await live(ticketId, email);
  const { text } = await decodeFrames(n => qrPng(payload, n), px, ["qr_code"]);
  expect(text, "decoded QR equals the live payload").toBe(payload);
  return text!;
}

test.describe.configure({ mode: "serial" });
test.describe("Scan testing: real decode → real scan path", () => {
  let owner: { id: string; email: string }, buyer: { id: string; email: string }, friend: { id: string; email: string };
  let door: { id: string; email: string }, zoneDoor: { id: string; email: string };
  let ownerC: Db, buyerC: Db, friendC: Db, doorC: Db, zoneDoorC: Db;
  let ws: string, ev: string, other: string, ga: string, vipTier: string, vip: string;
  const events: string[] = [];
  let as: Db;
  const S = scanner(() => as);
  const scan = (c: Db, eventId: string, raw: string, opts: { zoneId?: string } = {}) => { as = c; return S.scanCredential(eventId, raw, { device: "scd-door-1", gate: "Main", ...opts }); };
  const result = (r: Reply) => (r.ok ? r.result : `error: ${r.error}`);
  const mk = async (tier: string, row: Record<string, unknown> = {}, eventId = ev) => {
    const r = await db.from("tickets").insert({ event_id: eventId, tier_id: tier, holder_id: buyer.id, code: `SCD-${randomBytes(5).toString("hex").toUpperCase()}`,
      order_ref: `SCD-${randomBytes(3).toString("hex")}`, attendee_name: "Sam Scan", attendee_email: buyer.email, status: "valid", ...row }).select("id,code").single();
    if (r.error || !r.data) throw new Error(`ticket fixture insert failed: ${r.error?.message ?? "no row"}`);
    return r.data as { id: string; code: string };
  };
  const note = (type: string, description: string) => test.info().annotations.push({ type, description });
  const mkEvent = async (row: Record<string, unknown>) => {
    const id = ((await insertEventFixture({ owner_id: owner.id, workspace_id: ws, management: "professional", visibility: "private", status: "on_sale", timezone: "Europe/London", settings: { reentry: false }, ...row }, "ticket-scan-decode").select("id").single()).data as Id).id;
    events.push(id); return id;
  };

  test.beforeAll(async () => {
    [owner, buyer, friend, door, zoneDoor] = await Promise.all(["scd-o", "scd-b", "scd-f", "scd-d", "scd-z"].map(l => createUser(l)));
    ws = await seedWorkspace(owner.id, "organizer", "SCD Scan Decode Events");
    ev = await mkEvent({ name: "SCD Decode Night", starts_at: new Date(Date.now() + 36e5).toISOString(), ends_at: new Date(Date.now() + 3 * 864e5).toISOString() });
    other = await mkEvent({ name: "SCD Other Night", starts_at: new Date(Date.now() + 2 * 864e5).toISOString() });
    ga = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "SCD GA", price: 20, quantity: 500, status: "on_sale" }).select("id").single()).data as Id).id;
    vipTier = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "SCD VIP", price: 60, quantity: 50, status: "on_sale" }).select("id").single()).data as Id).id;
    [ownerC, buyerC, friendC, doorC, zoneDoorC] = (await Promise.all([owner, buyer, friend, door, zoneDoor].map(u => signedIn(u.email)))) as unknown as Db[];
    // Outside door staff: event-wide on both events; a second door person limited to the VIP zone.
    vip = ((await ownerC.rpc("save_access_zone", { p_event: ev, p_zone: { name: "SCD VIP Lounge", kind: "vip", reentry: "deny" } })).data as Id).id;
    expect((await ownerC.rpc("set_zone_rules", { p_zone: vip, p_rules: [{ tier_id: vipTier }] })).error).toBeNull();
    for (const e of [ev, other]) expect((await ownerC.rpc("assign_event_scanner", { p_event: e, p_user: door.id })).error).toBeNull();
    expect((await ownerC.rpc("assign_event_scanner", { p_event: ev, p_user: zoneDoor.id, p_zones: [vip] })).error).toBeNull();
  });
  test.afterAll(async () => {
    const ids = ((await db.from("tickets").select("id").in("event_id", events)).data ?? []).map(x => (x as Id).id);
    const tiers = ((await db.from("ticket_tiers").select("id").in("event_id", events)).data ?? []).map(x => (x as Id).id);
    if (ids.length) await db.from("resale_holds").delete().in("ticket_id", ids);
    if (tiers.length) { await db.from("ticket_pass_components").delete().in("pass_tier_id", tiers); await db.from("virtual_tier_access").delete().in("tier_id", tiers); }
    await db.from("checkout_orders").delete().in("event_id", events);
    await db.from("events").update({ parent_event_id: null }).in("id", events);
    await db.from("tickets").delete().in("event_id", events);
    await db.from("events").delete().in("id", events);
    await db.from("workspaces").delete().eq("id", ws);
    await cleanup();
  });

  test("decode matrix: live wallet QR, Code 128, print page PNG and PDF all decode to the exact payload", async () => {
    const t = await mk(ga);
    const payload = await live(t.id, buyer.email);
    expect(payload).toMatch(/^GD2\.[A-Za-z0-9_-]{22}\.[0-9a-z]+\.[A-Za-z0-9_-]{22}$/);
    // QR: card (280), visual stub on phones (200), visual stub desktop (120), and small/zoomed-out phone renders.
    // Each size is decoded like the camera loop (first hit within five slightly different frames); frames needed are recorded.
    for (const px of [280, 200, 120, 96, 72]) {
      const qr = await decodeFrames(n => qrPng(payload, n), px, ["qr_code"]), both = await decodeFrames(n => qrPng(payload, n), px);
      expect(qr.text, `QR at ${px}px`).toBe(payload);
      expect(both.text, `QR at ${px}px, both formats enabled`).toBe(payload);
      if (qr.frames > 1) note("qr-frames", `QR ${px}px needed ${qr.frames} frames`);
    }
    // Camera-like frames (1280×720, rotated, blurred, the QR a fraction of the frame) — what the scanner loop actually sees.
    for (const [px, rotate] of [[220, 6], [160, -9], [120, 3]] as const)
      expect(decode(await toRaw(await cameraFrame(await qrPng(payload, px), { rotate }))), `QR ${px}px in a 1280×720 frame, rotated ${rotate}°`).toBe(payload);

    // Code 128 (TicketCredential barcode: height 90 / 60 in the visual stub, natural width = 1 px per module, 10-module quiet zones).
    const natural = barcodeNaturalWidth(payload);
    expect(natural).toBe(11 * (payload.length + 3) + 2 + 20);   // start + data + check (11 each) + stop (13) + 2 × 10 quiet
    const ok: [number, number, string][] = [[natural, 90, "natural, 1 px/module"], [natural, 60, "visual stub height"], [natural, 70, "compact height"],
      [natural * 2, 90, "2 px/module (DPR 2, natural)"], [natural * 3, 90, "3 px/module (DPR 3, natural)"]];
    for (const [w, h, what] of ok) expect(decode(await toRaw(await barcodePng(payload, w, h)), ["code_128"]), `Code 128 ${w}×${h} — ${what}`).toBe(payload);
    expect(decode(await toRaw(await cameraFrame(await barcodePng(payload, natural * 2, 120), { rotate: 2, blur: 0.4 }))), "Code 128 in a 1280×720 camera frame").toBe(payload);
    // Known limit, recorded not asserted: the 56-character signed credential is ~670 modules wide and the card is ≤402 CSS px, so the
    // barcode is always scaled below 1 CSS px per module. Fractional bars don't decode; crisp-snapped bars decode only sometimes at
    // ~1.5 device px (DPR 3) depending on the bar pattern. QR is the reliable phone presentation.
    for (const [w, what] of [[402, "desktop card 402 CSS px at DPR 1"], [343 * 2, "phone card 343 CSS px at DPR 2"], [Math.round(343 * 2.625), "phone card at DPR 2.625"], [343 * 3, "phone card 343 CSS px at DPR 3"], [402 * 2, "desktop card at DPR 2"]] as const)
      note("code128-limit", `${what}: ${(w / natural).toFixed(2)} px/module → ${decode(await toRaw(await barcodePng(payload, w, 90)), ["code_128"]) === payload ? "decodes" : "not decodable"}`);

    // Real phone render widths (lane B): the inline card barcode at 260 / 320 / 390 CSS px is recorded (too fine to scan); the
    // "Enlarge barcode for scanning" sheet (barcodeSheetFit, whole device px per module) is asserted to decode and to give ≥2 device
    // px per module on every phone at DPR 2–3 with a normal portrait height.
    for (const [vw, vh] of [[260, 640], [320, 640], [320, 568], [390, 844], [430, 932]] as const) for (const dpr of [2, 3]) {
      const inline = Math.min(vw - 2 * 16 - 2 * 18, natural) * dpr;   // page gutter + card padding
      note("code128-inline", `${vw}×${vh} DPR ${dpr}: inline ${(inline / natural).toFixed(2)} device px/module → ${decode(await toRaw(await barcodePng(payload, Math.round(inline), 90 * dpr)), ["code_128"]) === payload ? "decodes" : "not decodable"}`);
      const fit = barcodeSheetFit(natural, vw, vh, dpr);
      const sheet = await barcodePng(payload, natural * fit.dpx, fit.height * dpr);
      expect(decode(await toRaw(sheet), ["code_128"]), `enlarged sheet ${vw}×${vh} DPR ${dpr} (${fit.dpx} device px/module)`).toBe(payload);
      // ≥2 device px per module wherever the long side physically fits 2 × modules; 1 (still crisp, decodes) only below that.
      expect(fit.dpx, `enlarged sheet ${vw}×${vh} DPR ${dpr} module width`).toBe(Math.max(1, Math.floor(((Math.max(vw - 32, vh - 24)) * dpr) / natural)));
      if ((vh - 24) * dpr >= 2 * natural) expect(fit.dpx).toBeGreaterThanOrEqual(2);
      expect(natural * fit.module, `enlarged sheet ${vw}×${vh} DPR ${dpr} fits the screen`).toBeLessThanOrEqual(fit.rotate ? vh - 24 : vw - 32);
      note("code128-sheet", `${vw}×${vh} DPR ${dpr}: ${fit.rotate ? "rotated" : "flat"}, ${fit.dpx} device px/module, ${(natural * fit.module).toFixed(0)}×${fit.height} CSS px`);
    }

    // Print page (static print credential, 600 px PNG data URL) and its photographed/small renders.
    const html = await (await get(`/account/tickets/${t.id}/print`, buyer.email)).text();
    const png = printPageQr(html);
    expect(png, "print page carries a QR PNG").not.toBeNull();
    const printed = (await decodeFrames(n => sharp(png!).resize(n).png().toBuffer(), 600, ["qr_code"])).text;
    expect(printed).toMatch(/^GD2P\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/);
    for (const px of [300, 150]) expect((await decodeFrames(n => sharp(png!).resize(n).png().toBuffer(), px, ["qr_code"])).text, `print QR at ${px}px`).toBe(printed);
    // PDF: pull the embedded image out of the real PDF and decode it — the same print credential.
    const pdf = await get(`/api/tickets/${t.id}/pdf`, buyer.email);
    expect(pdf.status).toBe(200);
    const images = await pdfImages(new Uint8Array(await pdf.arrayBuffer()));
    expect(images.length, "PDF embeds the QR image").toBeGreaterThan(0);
    // The extracted bitmap itself (first frame), then as a camera would see it at slightly different sizes.
    const fromPdf = await Promise.all(images.map(i => decodeFrames(n => sharp(Buffer.from(i.data), { raw: { width: i.width, height: i.height, channels: 4 } }).resize(n).png().toBuffer(), i.width, ["qr_code"])));
    expect(fromPdf.map(r => r.text).find(Boolean), "PDF QR decodes to the print credential").toBe(printed);
    note("pdf-image", `${images.length} image(s), ${images.map(i => `${i.width}×${i.height}`).join(", ")}`);

    // The decoded print code admits once through the real scan path; the decoded wallet code is then a duplicate.
    expect(result(await scan(doorC, ev, printed!))).toBe("admitted");
    expect(result(await scan(doorC, ev, payload))).toBe("duplicate");
  });

  test("the downloadable QR image is the signed print credential: it dies on print reissue (never a static GD1 code)", async () => {
    const t = await mk(ga);
    const image = async () => {
      const html = await (await get(`/account/tickets/${t.id}`, buyer.email)).text();
      const urls = [...new Set([...html.matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g)].map(m => m[1]!))];
      expect(urls.length, "ticket page carries the downloadable QR image").toBeGreaterThan(0);
      const texts = await Promise.all(urls.map(async u => (await decodeFrames(n => sharp(Buffer.from(u, "base64")).resize(n).png().toBuffer(), 360, ["qr_code"])).text));
      expect(texts.some(x => x?.startsWith("GD1:")), "no legacy GD1 code on the page").toBe(false);
      return texts.find(x => x?.startsWith("GD2P."));
    };
    const before = await image();
    expect(before).toMatch(/^GD2P\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/);
    expect((await buyerC.rpc("reissue_ticket_credentials", { p_ticket: t.id, p_scope: "print", p_reason: "Lost printout" })).error).toBeNull();
    expect(result(await scan(doorC, ev, before!))).toBe("invalid");
    const after = await image();
    expect(after).not.toBe(before);
    expect(result(await scan(doorC, ev, after!))).toBe("admitted");
  });

  test("first scan admitted, immediate rescan duplicate; re-entry where the event allows it", async () => {
    const t = await mk(ga);
    const code = await decodedWallet(t.id, buyer.email);
    const first = await scan(doorC, ev, code);
    expect(first).toMatchObject({ ok: true, result: "admitted", attendee: "Sam Scan", code: t.code });
    expect(result(await scan(doorC, ev, code))).toBe("duplicate");
    await db.from("events").update({ settings: { reentry: true } }).eq("id", ev);
    try { expect(result(await scan(doorC, ev, code))).toBe("readmitted"); }
    finally { await db.from("events").update({ settings: { reentry: false } }).eq("id", ev); }
    expect(((await db.from("check_ins").select("result").eq("ticket_id", t.id).order("id")).data ?? []).map(r => (r as { result: string }).result)).toEqual(["admitted", "duplicate", "readmitted"]);
  });

  test("a screenshot older than the rotation window is refused; the same code inside the window admits", async () => {
    const t = await mk(ga);
    const shot = await decodedWallet(t.id, buyer.email);
    // Present the decoded screenshot 5 minutes later (the scanner's clock moves; ±2 × 30 s windows are accepted).
    const later = scanner(() => as, 5 * 60e3);
    as = doorC;
    const stale = await later.scanCredential(ev, shot, { device: "scd-door-1" });
    expect(stale).toMatchObject({ ok: true, result: "invalid" });
    expect((stale as { reason: string }).reason).toMatch(/Expired or replaced code/);
    as = doorC;
    expect(result(await scanner(() => as, 45e3).scanCredential(ev, shot))).toBe("admitted");   // 45 s later: still inside the skew
  });

  test("after transfer the old decoded code is refused and the new holder's decoded code admits", async () => {
    const t = await mk(ga);
    const old = await decodedWallet(t.id, buyer.email);
    const token = randomBytes(32).toString("hex"), th = createHash("sha256").update(token).digest("hex");
    expect((await buyerC.rpc("offer_ticket_transfer", { p_ticket: t.id, p_email: friend.email, p_name: "Fran Friend", p_token_hash: th })).error).toBeNull();
    const accepted = await friendC.rpc("accept_ticket_transfer", { p_token_hash: th });
    expect(accepted.error).toBeNull();
    const newId = accepted.data as unknown as string;
    expect(result(await scan(doorC, ev, old))).toBe("transferred");
    expect(await (await get(`/api/tickets/${t.id}/credential`, buyer.email)).json()).toEqual({ status: "transferred" });   // no new code for the old ticket
    const fresh = await decodedWallet(newId, friend.email);
    expect(fresh).not.toBe(old);
    expect(result(await scan(doorC, ev, fresh))).toBe("admitted");
    expect(result(await scan(doorC, ev, old))).toBe("transferred");
  });

  test("a resale-listed ticket and a refunded ticket are refused", async () => {
    // Resale listing (Q22 guard: needs an original paid order; no money moves). The decoded pre-listing code is dead (nonce rotated)
    // and the holder can't fetch a new one; the typed ticket code says why.
    const ref = `SCD-R${randomBytes(3).toString("hex")}`;
    expect((await db.from("checkout_orders").insert({ order_ref: ref, event_id: ev, buyer_id: buyer.id, token: randomBytes(12).toString("hex"), amount: 20, fee: 0, currency: "GBP", status: "issued", lines: [], kind: "primary", stripe_session: `cs_test_${randomBytes(6).toString("hex")}` } as never)).error).toBeNull();
    const s = await mk(ga, { order_ref: ref });
    const listedCode = await decodedWallet(s.id, buyer.email);
    expect((await db.from("tickets").update({ status: "resale_listed" }).eq("id", s.id)).error).toBeNull();
    expect(((await (await get(`/api/tickets/${s.id}/credential`, buyer.email)).json()) as { status: string }).status).toBe("resale_listed");
    const r1 = await scan(doorC, ev, listedCode);
    expect(r1).toMatchObject({ ok: true, result: "invalid" });
    expect(result(await scan(doorC, ev, s.code))).toBe("resale_locked");
    // Refund (as the refund worker writes it): the decoded code is refused as refunded.
    const r = await mk(ga);
    const refundCode = await decodedWallet(r.id, buyer.email);
    await db.from("tickets").update({ status: "refunded" }).eq("id", r.id);
    expect(result(await scan(doorC, ev, refundCode))).toBe("refunded");
    expect(result(await scan(doorC, ev, r.code))).toBe("refunded");
  });

  test("wrong-event scanner, wrong zone and outside-session tickets are refused", async () => {
    const t = await mk(ga);
    const code = await decodedWallet(t.id, buyer.email);
    expect(result(await scan(doorC, other, code))).toBe("wrong_event");          // door staff are authorised there, ticket is not
    // Zone-restricted door staff: VIP only. A GA pass is refused at VIP; a VIP ticket admits once; the main gate isn't theirs.
    expect(result(await scan(zoneDoorC, ev, code, { zoneId: vip }))).toBe("wrong_zone");
    const v = await mk(vipTier);
    const vcode = await decodedWallet(v.id, buyer.email);
    expect(result(await scan(zoneDoorC, ev, vcode, { zoneId: vip }))).toBe("admitted");
    expect(result(await scan(zoneDoorC, ev, vcode, { zoneId: vip }))).toBe("duplicate");   // VIP zone: re-entry denied
    expect(await scan(zoneDoorC, ev, code)).toMatchObject({ ok: false, error: expect.stringMatching(/check-in access/) });
    // Day ticket for a later session.
    const day = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "SCD Day 3", price: 10, quantity: 10, status: "on_sale",
      valid_from: new Date(Date.now() + 2 * 864e5).toISOString(), valid_to: new Date(Date.now() + 2.5 * 864e5).toISOString() }).select("id").single()).data as Id).id;
    const d = await mk(day);
    expect(result(await scan(doorC, ev, await decodedWallet(d.id, buyer.email)))).toBe("wrong_session");
    // The decoded code was otherwise fine: the GA ticket still admits at its own event's main gate.
    expect(result(await scan(doorC, ev, code))).toBe("admitted");
  });

  test("multi-day pass: admits once per eligible day, refused on a day outside its window and at events it doesn't cover", async () => {
    // Rules (scan_admission + pass_entitlement_check): a pass ticket on the parent event admits at each component event with an
    // active entitlement; duplicates are counted per component event; session windows come from the component tier; the pass's
    // own status is untouched by component admissions. pass_kind (multi_day / season / …) is not consulted at scan time.
    const day = (n: number, h = 2) => new Date(Date.now() + n * 864e5 + h * 36e5).toISOString();
    const [d1, d2, d3] = [await mkEvent({ name: "SCD Day 1", parent_event_id: ev, starts_at: day(0) }), await mkEvent({ name: "SCD Day 2", parent_event_id: ev, starts_at: day(1) }), await mkEvent({ name: "SCD Day 1 late stage", parent_event_id: ev, starts_at: day(0, 4) })];
    const tier = async (eventId: string, name: string, row: Record<string, unknown> = {}) => ((await db.from("ticket_tiers").insert({ event_id: eventId, name, price: 15, quantity: 20, status: "on_sale", ...row }).select("id").single()).data as Id).id;
    const c1 = await tier(d1, "SCD D1"), c2 = await tier(d2, "SCD D2", { valid_from: day(1, 0), valid_to: day(1, 12) }), c3 = await tier(d3, "SCD D1 late");
    const pass = await tier(ev, "SCD Weekend pass", { price: 40 });
    expect((await ownerC.rpc("set_pass_components", { p_pass_tier: pass, p_kind: "multi_day", p_components: [{ tier_id: c1 }, { tier_id: c2 }, { tier_id: c3 }] })).error).toBeNull();
    for (const e of [d1, d2, d3]) expect((await ownerC.rpc("assign_event_scanner", { p_event: e, p_user: door.id })).error).toBeNull();
    const p = await mk(pass);
    expect(((await db.from("pass_entitlements").select("id").eq("ticket_id", p.id)).data ?? []).length).toBe(3);
    const code = await decodedWallet(p.id, buyer.email);
    expect(result(await scan(doorC, d1, code))).toBe("admitted");
    expect(result(await scan(doorC, d1, code))).toBe("duplicate");
    expect(result(await scan(doorC, d3, code))).toBe("admitted");
    expect(result(await scan(doorC, d2, code))).toBe("wrong_session");     // day 2's window is tomorrow
    expect(result(await scan(doorC, other, code))).toBe("pass_not_valid_here");
    expect(((await db.from("tickets").select("status").eq("id", p.id).single()).data as { status: string }).status).toBe("valid");
    expect(result(await scan(doorC, ev, code))).toBe("admitted");          // the parent event itself, once
    expect(result(await scan(doorC, ev, code))).toBe("duplicate");
    // A refunded pass loses every entitlement.
    const p2 = await mk(pass);
    const code2 = await decodedWallet(p2.id, buyer.email);
    await db.from("tickets").update({ status: "refunded" }).eq("id", p2.id);
    expect(result(await scan(doorC, d1, code2))).toBe("pass_not_valid_here");
  });

  test("online-only ticket never admits in person; hybrid admits", async () => {
    const online = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "SCD Online", price: 5, quantity: 100, status: "on_sale" }).select("id").single()).data as Id).id;
    const hybrid = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "SCD Hybrid", price: 15, quantity: 100, status: "on_sale" }).select("id").single()).data as Id).id;
    expect((await db.from("virtual_tier_access").insert([{ tier_id: online, event_id: ev, mode: "online" }, { tier_id: hybrid, event_id: ev, mode: "hybrid" }] as never)).error).toBeNull();
    const o = await mk(online), h = await mk(hybrid);
    const r = await scan(doorC, ev, await decodedWallet(o.id, buyer.email));
    expect(r).toMatchObject({ ok: true, result: "online_only_ticket" });
    expect(result(await scan(doorC, ev, o.code))).toBe("online_only_ticket");   // typed code too
    expect(result(await scan(doorC, ev, await decodedWallet(h.id, buyer.email)))).toBe("admitted");
  });
});
