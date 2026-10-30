import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { chromium, test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { admin, BASE, cleanup, createUser, insertEventFixture, seedWorkspace, signedIn } from "../phase1/helpers";
import sharp from "sharp";
import { barcodeNaturalWidth, barcodePng, cameraFrame, decode, decodeFrames, qrPng, toRaw, y4m } from "../release/scan-render";

// Scan testing, real camera path (lane D). Chromium's fake capture device plays a Y4M clip generated here from the LIVE wallet
// credential (rendered exactly as the app renders it); the scanner page decodes the <video> frames itself and submits through its
// own server action. Each run: ticket shown → blank → shown again, so the scanner must report Admitted then Already scanned.
// Runs twice: with BarcodeDetector as the browser provides it (recorded: Windows Chrome usually has none), and with it deleted so
// the lazy-loaded zxing fallback is forced. Also: Code 128, the /door/[eventId] route, manual entry, offline banner, camera denied.
// Machine rule: at most 2 browsers at once; each test launches and closes its own. Check free RAM > 2 GB before running.
type Db = SupabaseClient;
type Id = { id: string };
const db = admin as unknown as Db;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const host = new URL(BASE).hostname;

/** Session cookies for a disposable identity via a user-scoped magic-link OTP exchange (no password form, no CAPTCHA). */
async function sessionCookies(email: string) {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const jar: { name: string; value: string }[] = [];
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => [], setAll: v => { for (const c of v) jar.push({ name: c.name, value: c.value }); } } });
  const r = await sb.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (r.error) throw r.error;
  return jar;
}
const header = (jar: { name: string; value: string }[]) => jar.map(c => `${c.name}=${c.value}`).join("; ");

/** A Chromium whose camera is the given Y4M clip (permission auto-granted). `video: null` → fake device, default pattern. */
async function launch(video: string | null): Promise<Browser> {
  const args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", ...(video ? [`--use-file-for-fake-video-capture=${video}`] : [])];
  return chromium.launch({ executablePath: CHROME, args });
}
async function signedInContext(browser: Browser, email: string, opts: { forceFallback?: boolean; init?: string } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["camera"] });
  await ctx.addCookies([{ name: "gd_cc", value: "1", domain: host, path: "/", secure: false, sameSite: "Lax" },
    ...(await sessionCookies(email)).map(c => ({ ...c, domain: host, path: "/", secure: BASE.startsWith("https:"), sameSite: "Lax" as const }))]);
  if (opts.forceFallback) await ctx.addInitScript(() => { delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector; });
  if (opts.init) await ctx.addInitScript(opts.init);
  return ctx;
}
/** Whether this Chromium has a native BarcodeDetector that reads QR codes. */
const nativeQr = (page: Page) => page.evaluate(async () => {
  const B = (window as unknown as { BarcodeDetector?: { getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (!B) return { present: false, formats: [] as string[] };
  return { present: true, formats: (await B.getSupportedFormats?.()) ?? [] };
});

test.describe.configure({ mode: "serial" });
test.describe("Scanner camera path (fake capture device)", () => {
  let owner: { id: string; email: string }, buyer: { id: string; email: string }, door: { id: string; email: string };
  let ws: string, ev: string, ga: string;
  let ownerCookie = "", buyerCookie = "";
  const mk = async () => (await db.from("tickets").insert({ event_id: ev, tier_id: ga, holder_id: buyer.id, code: `SCC-${randomBytes(5).toString("hex").toUpperCase()}`,
    order_ref: `SCC-${randomBytes(3).toString("hex")}`, attendee_name: "Cam Holder", attendee_email: buyer.email, status: "valid" }).select("id,code").single()).data as { id: string; code: string };
  /** The live wallet payload, fetched as the holder's wallet does (valid for ~60–90 s: ±2 rotation windows). */
  const live = async (id: string) => ((await (await fetch(`${BASE}/api/tickets/${id}/credential`, { headers: { cookie: buyerCookie } })).json()) as { payload: string }).payload;
  /** Writes a clip: code card for 2 s, blank for 2 s (looped by Chromium) → two presentations ≥ 3 s apart (the scanner's debounce). */
  const clip = async (name: string, code: Buffer, size: { width: number; height: number; rotate?: number; blur?: number }) => {
    const blank = await cameraFrame(Buffer.from(await sharp({ create: { width: 200, height: 200, channels: 3, background: "#ffffff" } }).png().toBuffer()), size);
    const file = test.info().outputPath(`${name}.y4m`);
    writeFileSync(file, await y4m([await cameraFrame(code, size), blank], { ...size, fps: 5, repeat: 10 }));
    return file;
  };
  const scanPage = (id: string) => `${BASE}/organizer/events/${id}/scan`;
  const result = (page: Page) => page.locator(".sc-result b").first();

  test.beforeAll(async () => {
    [owner, buyer, door] = await Promise.all(["scc-o", "scc-b", "scc-d"].map(l => createUser(l)));
    ws = await seedWorkspace(owner.id, "organizer", "SCC Camera Events");
    ev = ((await insertEventFixture({ owner_id: owner.id, workspace_id: ws, management: "professional", visibility: "private", name: "SCC Camera Night", status: "on_sale",
      starts_at: new Date(Date.now() + 36e5).toISOString(), settings: { reentry: false } }, "scanner-camera").select("id").single()).data as Id).id;
    ga = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "SCC GA", price: 20, quantity: 100, status: "on_sale" }).select("id").single()).data as Id).id;
    const ownerC = await signedIn(owner.email) as unknown as Db;
    expect((await ownerC.rpc("assign_event_scanner", { p_event: ev, p_user: door.id })).error).toBeNull();
    [ownerCookie, buyerCookie] = [header(await sessionCookies(owner.email)), header(await sessionCookies(buyer.email))];
    // Warm the dev server's routes so compile time doesn't eat the credential's validity window.
    for (const [p, c] of [[scanPage(ev), ownerCookie], [`${BASE}/door/${ev}`, header(await sessionCookies(door.email))]] as const) await fetch(p, { headers: { cookie: c } });
  });
  test.afterAll(async () => {
    const tiers = ((await db.from("ticket_tiers").select("id").eq("event_id", ev)).data ?? []).map(x => (x as Id).id);
    if (tiers.length) await db.from("virtual_tier_access").delete().in("tier_id", tiers);
    await db.from("checkout_orders").delete().eq("event_id", ev);
    await db.from("tickets").delete().eq("event_id", ev);
    await db.from("events").delete().eq("id", ev);
    await db.from("workspaces").delete().eq("id", ws);
    await cleanup();
  });

  for (const mode of ["native-if-available", "forced-fallback"] as const) {
    test(`QR via camera, ${mode}: Admitted, then Already scanned on the second presentation`, async () => {
      const t = await mk();
      const file = await clip(`qr-${mode}`, await qrPng(await live(t.id), 240), { width: 640, height: 480 });
      const browser = await launch(file);
      try {
        const ctx = await signedInContext(browser, owner.email, { forceFallback: mode === "forced-fallback" });
        const page = await ctx.newPage();
        await page.goto(scanPage(ev));
        const native = await nativeQr(page);
        test.info().annotations.push({ type: "barcode-detector", description: `${mode}: present=${native.present} formats=${native.formats.join(",") || "none"}` });
        await page.getByRole("button", { name: "Start scanning" }).click();
        await expect(page.getByLabel("Camera preview")).toBeVisible();
        const expected = mode === "forced-fallback" || !native.formats.includes("qr_code") ? "zxing" : "native";
        await expect(page.locator(".sc-cam")).toHaveAttribute("data-decoder", expected);
        await expect(result(page)).toHaveText("Valid — admit", { timeout: 30_000 });
        await expect(result(page)).toHaveText("Already scanned", { timeout: 30_000 });
        await expect(page.locator(".sc-log li").first()).toContainText("Cam Holder");
        await page.getByRole("button", { name: "Stop camera" }).click();
        await ctx.close();
      } finally { await browser.close(); }
      const rows = ((await db.from("check_ins").select("result,credential").eq("ticket_id", t.id).order("id")).data ?? []) as { result: string; credential: string }[];
      expect(rows.slice(0, 2)).toEqual([{ result: "admitted", credential: "wallet" }, { result: "duplicate", credential: "wallet" }]);
    });
  }

  test("Code 128 via camera (forced fallback) at the door route as outside door staff", async () => {
    const t = await mk();
    const payload = await live(t.id);
    const file = await clip("code128-door", await barcodePng(payload, barcodeNaturalWidth(payload) * 2, 120), { width: 1280, height: 720, rotate: 1.5, blur: 0.4 });   // a long 1D code held level
    const browser = await launch(file);
    try {
      const ctx = await signedInContext(browser, door.email, { forceFallback: true });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/door/${ev}`);
      await expect(page.getByText("Door check-in · signed in as")).toBeVisible();
      await page.getByRole("button", { name: "Start scanning" }).click();
      await expect(page.locator(".sc-cam")).toHaveAttribute("data-decoder", "zxing");
      await expect(result(page)).toHaveText("Valid — admit", { timeout: 40_000 });
      await expect(result(page)).toHaveText("Already scanned", { timeout: 40_000 });
      await ctx.close();
    } finally { await browser.close(); }
  });

  test("QR via camera at the door route, forced fallback", async () => {
    const t = await mk();
    const file = await clip("qr-door", await qrPng(await live(t.id), 200), { width: 640, height: 480 });
    const browser = await launch(file);
    try {
      const ctx = await signedInContext(browser, door.email, { forceFallback: true });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/door/${ev}`);
      await page.getByRole("button", { name: "Start scanning" }).click();
      await expect(result(page)).toHaveText("Valid — admit", { timeout: 30_000 });
      await expect(result(page)).toHaveText("Already scanned", { timeout: 30_000 });
      await ctx.close();
    } finally { await browser.close(); }
  });

  /** Holder context at a viewport (phone: DPR 3, touch). */
  const holder = async (browser: Browser, w: number) => {
    const phone = w < 500;
    const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 844 : 1024 }, deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone });
    await ctx.addCookies([{ name: "gd_cc", value: "1", domain: host, path: "/", secure: false, sameSite: "Lax" },
      ...(await sessionCookies(buyer.email)).map(c => ({ ...c, domain: host, path: "/", secure: BASE.startsWith("https:"), sameSite: "Lax" as const }))]);
    return ctx;
  };
  const b64id = (id: string) => Buffer.from(id.replace(/-/g, ""), "hex").toString("base64url");

  test("enlarged barcode sheet (390×844, DPR 3): ≥2 device px per module and a screenshot of it decodes", async () => {
    const t = await mk();
    const browser = await launch(null);
    try {
      const ctx = await holder(browser, 390), page = await ctx.newPage();
      await page.goto(`${BASE}/account/tickets/${t.id}`);
      await page.getByRole("tab", { name: "Barcode" }).click();
      await page.getByRole("button", { name: "Enlarge barcode for scanning" }).click();
      const sheet = page.getByRole("dialog", { name: "Barcode for scanning" });
      await expect(sheet).toBeVisible();
      const dpx = Number(await sheet.locator(".tc-sheet-code").getAttribute("data-device-px-per-module"));
      expect(dpx).toBeGreaterThanOrEqual(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const shot = await page.screenshot({ path: test.info().outputPath("barcode-sheet-390.png") });
      const upright = await sharp(shot).rotate(-90).png().toBuffer();   // a door scanner held along the bars
      expect(decode(await toRaw(upright), ["code_128"])).toMatch(new RegExp(`^GD2\\.${b64id(t.id)}\\.`));
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
      await ctx.close();
    } finally { await browser.close(); }
  });

  test("ticket types × QR / Ticket / Barcode at 320, 390, 1536: square + centred QR, unstretched barcode, no overflow", async () => {
    test.setTimeout(600_000);
    const tier = async (name: string, row: Record<string, unknown> = {}) => {
      const r = await db.from("ticket_tiers").insert({ event_id: ev, name, price: 20, quantity: 50, status: "on_sale", ...row }).select("id").single();
      if (r.error) throw new Error(`tier ${name}: ${r.error.message}`);
      return (r.data as Id).id;
    };
    const ticket = async (tierId: string, row: Record<string, unknown> = {}) => (await db.from("tickets").insert({ event_id: ev, tier_id: tierId, holder_id: buyer.id, code: `SCC-${randomBytes(5).toString("hex").toUpperCase()}`,
      order_ref: `SCC-V${randomBytes(3).toString("hex")}`, attendee_name: "Cam Holder", attendee_email: buyer.email, status: "valid", ...row }).select("id,code").single()).data as { id: string; code: string };
    const seated = await tier("SCC Seated stalls"), comp = await tier("SCC Comp", { price: 0 }), multi = await tier("SCC Weekend pass"), season = await tier("SCC Season pass"), online = await tier("SCC Online"), hybrid = await tier("SCC Hybrid");
    expect((await db.from("ticket_tiers").update({ pass_kind: "multi_day" }).eq("id", multi)).error).toBeNull();
    expect((await db.from("ticket_tiers").update({ pass_kind: "season" }).eq("id", season)).error).toBeNull();
    expect((await db.from("virtual_tier_access").insert([{ tier_id: online, event_id: ev, mode: "online" }, { tier_id: hybrid, event_id: ev, mode: "hybrid" }] as never)).error).toBeNull();
    const types: [string, { id: string; code: string }][] = [["seated", await ticket(seated, { seat: "Stalls B12" })], ["comp", await ticket(comp, { price_paid: 0 })], ["pass-multi_day", await ticket(multi)],
      ["pass-season", await ticket(season)], ["online", await ticket(online)], ["hybrid", await ticket(hybrid)]];
    const browser = await launch(null);
    try {
      for (const w of [320, 390, 1536]) {
        const ctx = await holder(browser, w), page = await ctx.newPage();
        for (const [kind, t] of types) {
          await page.goto(`${BASE}/account/tickets/${t.id}`);
          for (const mode of ["QR", "Ticket", "Barcode"]) {
            const tab = page.getByRole("tab", { name: new RegExp(`^${mode}`, "i") }).first();
            if (await tab.count()) await tab.click();
            await expect(page.locator(".tc-loading")).toHaveCount(0, { timeout: 20_000 });
            await page.waitForTimeout(400);
            const m = await page.evaluate(() => {
              const r = (el: Element) => el.getBoundingClientRect();
              const qr = [...document.querySelectorAll(".tc-qr svg, .tc-qr img")].map(q => { const b = r(q); const c = r(q.closest(".tc-card, .tc-mini, .tc-compact, .tc")!); return { square: Math.abs(b.width - b.height) <= 1, d: Math.abs(b.left + b.width / 2 - (c.left + c.width / 2)) }; });
              const bar = [...document.querySelectorAll<SVGSVGElement>(".tc-barcode svg")].map(s => { const b = r(s); const nat = s.viewBox.baseVal?.width || parseFloat(s.getAttribute("width") ?? "0"); return { stretched: b.width > nat + 1, h: Math.round(b.height) }; });
              return { over: document.documentElement.scrollWidth > innerWidth + 1, qr, bar, void: !!document.querySelector(".tc-void") };
            });
            const where = `${kind} ${mode} @${w}`;
            expect(m.over, `${where} overflow`).toBe(false);
            expect(m.void, `${where} shows a live credential`).toBe(false);
            for (const q of m.qr) { expect(q.square, `${where} QR square`).toBe(true); expect(q.d, `${where} QR centre offset`).toBeLessThanOrEqual(2); }
            for (const b of m.bar) { expect(b.stretched, `${where} barcode stretched`).toBe(false); expect([90, 70], `${where} barcode height`).toContain(b.h); }
            await page.screenshot({ path: test.info().outputPath(`types/${kind}-${mode.toLowerCase()}-${w}.png`), fullPage: true });
          }
        }
        await ctx.close();
      }
      // Not-valid states: what the page shows instead of a live code, and that any dimmed image is not an entry credential.
      const states: [string, Record<string, unknown>][] = [["used", { status: "used", checked_in_at: new Date().toISOString() }], ["resale_listed", { status: "resale_listed" }]];
      const ctx = await holder(browser, 390), page = await ctx.newPage();
      for (const [state, patch] of states) {
        // Resale listing needs an original paid order (Q22 guard); no money moves.
        const ref = `SCC-R${randomBytes(3).toString("hex")}`;
        if (state === "resale_listed") expect((await db.from("checkout_orders").insert({ order_ref: ref, event_id: ev, buyer_id: buyer.id, token: randomBytes(12).toString("hex"), amount: 20, fee: 0, currency: "GBP", status: "issued", lines: [], kind: "primary", stripe_session: `cs_test_${randomBytes(6).toString("hex")}` } as never)).error).toBeNull();
        const t = await ticket(comp, state === "resale_listed" ? { order_ref: ref } : {});
        const r = await db.from("tickets").update(patch).eq("id", t.id);
        if (r.error) { test.info().annotations.push({ type: "state-skip", description: `${state}: ${r.error.message}` }); continue; }
        await page.goto(`${BASE}/account/tickets/${t.id}`);
        const dim = page.locator(".td-qr.dim img");
        const shown = (await dim.count()) ? "dimmed QR + status label" : (await page.locator(".tc-void").count()) ? "Not valid for entry panel" : "other";
        test.info().annotations.push({ type: "not-valid-state", description: `${state}: ${shown}` });
        if (await dim.count()) {
          const src = (await dim.getAttribute("src"))!;
          const txt = (await decodeFrames(n => sharp(Buffer.from(src.split(",")[1]!, "base64")).resize(n).png().toBuffer(), 360, ["qr_code"])).text;
          expect(txt, `${state}: dimmed QR carries only the ticket code`).toBe(t.code);
        }
        await page.screenshot({ path: test.info().outputPath(`types/state-${state}-390.png`), fullPage: true });
      }
      await ctx.close();
    } finally { await browser.close(); }
  });

  test("manual entry, offline banner and offline queue, camera denied, no camera", async () => {
    const browser = await launch(null);
    let ctx: BrowserContext | null = null;
    try {
      ctx = await signedInContext(browser, owner.email);
      const page = await ctx.newPage();
      await page.goto(scanPage(ev));
      // Manual entry: typed ticket code admits once, then duplicate.
      const t = await mk();
      const check = async (v: string) => { await page.getByLabel("Ticket code").fill(v); await page.getByRole("button", { name: "Check", exact: true }).click(); };
      await check(t.code); await expect(result(page)).toHaveText("Valid — admit");
      await check(t.code); await expect(result(page)).toHaveText("Already scanned");
      await check("NOT-A-TICKET-1"); await expect(result(page)).toHaveText("Invalid ticket");
      // Offline without a downloaded list: banner, and the scan is refused locally.
      await ctx.setOffline(true);
      await expect(page.locator(".sc-net.off")).toContainText("Offline — scans queued");
      const u = await mk();
      await check(u.code); await expect(result(page)).toHaveText("Not on downloaded list");
      await ctx.setOffline(false);
      await expect(page.locator(".sc-net.on")).toHaveText("Online");
      // With the list downloaded: an offline scan is provisional, then reconciles on reconnect.
      const v = await mk();
      await page.getByRole("button", { name: /Download for offline|Refresh offline list/ }).click();
      await expect(page.getByRole("status")).toContainText("for offline use");
      await ctx.setOffline(true);
      await check(v.code); await expect(result(page)).toHaveText("Provisionally admitted (offline)");
      await ctx.setOffline(false);
      await expect(page.getByRole("status")).toContainText(/Synced \d+ offline scans/, { timeout: 30_000 });
      await expect.poll(async () => ((await db.from("check_ins").select("result").eq("ticket_id", v.id)).data ?? []).map(r => (r as { result: string }).result)).toContain("admitted");
      await ctx.close();

      // Camera permission denied: a clear message, manual entry still works.
      ctx = await signedInContext(browser, owner.email, { init: "navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));" });
      const denied = await ctx.newPage();
      await denied.goto(scanPage(ev));
      await denied.getByRole("button", { name: "Start scanning" }).click();
      await expect(denied.locator(".sc-result")).toContainText("Camera access was blocked");
      await expect(denied.getByLabel("Ticket code")).toBeEnabled();
      await ctx.close();

      // No camera API at all (e.g. insecure context): no start button, manual-entry guidance.
      ctx = await signedInContext(browser, owner.email, { init: "Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });" });
      const none = await ctx.newPage();
      await none.goto(scanPage(ev));
      await expect(none.getByText("No camera is available in this browser — use manual entry")).toBeVisible();
      await expect(none.getByRole("button", { name: "Start scanning" })).toHaveCount(0);
      await ctx.close(); ctx = null;
    } finally { await ctx?.close().catch(() => {}); await browser.close(); }
  });
});
