// R1 Phase B checks that are safe on the live DB (one headless browser, demo/disposable sessions from artifacts/auth/r1-*.json):
//   headers   — topbar height / logo / wordmark / nav / actions measured on every workspace home at 1536×864 and 390×844
//   report    — messaging Report + Block open their dialogs, are labelled, and close (nothing is submitted)
//   reviews   — provider review reply form is required/limited and an empty Post writes nothing
//   checkout  — customer reserves 1 ticket and reaches Stripe TEST Checkout (no payment; the reservation lapses on its own)
// Usage: node --env-file=.env --env-file=.env.local scripts/qa/r1-phase-b.mjs [headers,report,checkout]
// Results merge into artifacts/release/r1-signed-in.json under "phaseB".
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3107";
const REPORT = "artifacts/release/r1-signed-in.json"; const OUT = "artifacts/release/r1"; fs.mkdirSync(OUT, { recursive: true });
const only = (process.argv[2] ?? "headers,report,reviews,checkout").split(",");
const consent = { name: "gd_cc", value: "1", domain: new URL(BASE).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" };
const browser = await chromium.launch({ args: ["--disable-gpu", "--js-flags=--max-old-space-size=512"] });
const ctxs = {};
const ctx = async who => { if (ctxs[who]) return ctxs[who]; const st = JSON.parse(fs.readFileSync(`artifacts/auth/r1-${who}.json`, "utf8")); st.cookies = [...st.cookies.filter(c => c.name !== "gd_cc"), consent]; const c = await browser.newContext({ storageState: st, viewport: { width: 1536, height: 864 }, reducedMotion: "reduce" });
  await c.routeWebSocket(/_next\/(webpack-)?hmr|turbopack-hmr/, ws => { const server = ws.connectToServer(); server.onMessage(m => { if (typeof m === "string" && /"reloadPage"|"type":"restart"/.test(m)) return; ws.send(m); }); }); return (ctxs[who] = c); };
const out = {}; const log = (k, ok, d) => { (out[k] ??= []).push({ ok, d }); console.log(`${ok ? "PASS" : "FAIL"} ${k}: ${d}`); };
const serverUp = async () => { for (let i = 0; i < 60; i++) { try { const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(15000) }); if (r.status < 500) return; } catch { /* restarting */ } await new Promise(r => setTimeout(r, 5000)); } };
const go = async (page, url) => { for (let i = 0; ; i++) { try { await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 180000 }); break; } catch (e) { if (i >= 2) throw e; await serverUp(); } } await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1200); };

try {
  if (only.includes("headers")) {
    const HOMES = { customer: "/account", organizer: "/organizer", provider: "/provider", admin: "/admin", partner: "/partner", promoter: "/promoter" };
    const rows = [];
    for (const [who, url] of Object.entries(HOMES)) {
      if (!fs.existsSync(`artifacts/auth/r1-${who}.json`)) continue;
      const page = await (await ctx(who)).newPage();
      for (const [w, h, touch] of [[1536, 864, false], [1280, 800, false], [1920, 1080, false], [390, 844, true]]) {
        await page.setViewportSize({ width: w, height: h }); await go(page, url);
        const m = await page.evaluate(() => {
          const hd = Array.from(document.querySelectorAll("header")).find(x => { const r = x.getBoundingClientRect(); return r.top <= 1 && r.width > innerWidth * 0.6 && r.height > 20; });
          if (!hd) return null; const r = hd.getBoundingClientRect(); const cs = getComputedStyle(hd);
          const z = parseFloat(getComputedStyle(hd.closest(".o-root, .c-root, .ws-app, .pt-app, .gp-root") ?? document.body).zoom) || 1;
          const logo = hd.querySelector("a[aria-label*=home i], [class*=logo], .gd-lockup"); const lr = logo?.getBoundingClientRect();
          const word = hd.querySelector(".gd-lockup-word, img[alt*=Gala i]"); const wordShown = !!word && word.getBoundingClientRect().width > 0 && getComputedStyle(word).display !== "none";
          const imgs = Array.from(hd.querySelectorAll("img, svg")).filter(i => i.getBoundingClientRect().width > 0 && i.getBoundingClientRect().left < innerWidth / 3).map(i => Math.round(i.getBoundingClientRect().height));
          const btns = Array.from(hd.querySelectorAll("button, a")).filter(b => b.getBoundingClientRect().width > 0); const right = Math.max(...btns.map(b => b.getBoundingClientRect().right));
          return { cls: hd.className.split(" ")[0], h: Math.round(r.height), zoom: z, cssH: Math.round(r.height / z), bg: cs.backgroundColor, border: cs.borderBottomWidth + " " + cs.borderBottomColor,
            logoH: lr ? Math.round(lr.height) : null, logoL: lr ? Math.round(lr.left) : null, wordShown, leftIcons: imgs.slice(0, 3), rightGap: Math.round(innerWidth - right), overflow: document.documentElement.scrollWidth - innerWidth };
        });
        rows.push({ who, w, h, touch, ...m });
      }
      await page.close();
    }
    out.headers = rows;
    for (const w of [1536, 1280, 1920, 390]) {
      const set = rows.filter(r => r.w === w && r.h); const hs = set.map(r => r.h); const spread = Math.max(...hs) - Math.min(...hs);
      log("headers", spread <= 4, `${w}px topbar heights ${set.map(r => `${r.who}=${r.h}`).join(" ")} (spread ${spread}px)`);
      for (const r of set) { if (w <= 640 && r.wordShown) log("headers", false, `${r.who} ${w}px shows the wordmark (G mark only ≤640)`); if (w > 640 && !r.wordShown) log("headers", false, `${r.who} ${w}px hides the wordmark`); if (r.overflow > 1) log("headers", false, `${r.who} ${w}px page overflows by ${r.overflow}px`); }
    }
  }

  if (only.includes("report")) {
    for (const [who, inbox] of [["provider", "/provider/inbox?c=971bafbc-cd03-4b0e-937e-3cb7d7802a4b"], ["organizer", "/organizer/inbox"], ["customer", "/account/inbox"]]) {
      const page = await (await ctx(who)).newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
      await go(page, inbox);
      // open conversations until one shows a message from someone else (Report only appears on other people's messages)
      const hrefs = await page.$$eval("a[href*='c=']", as => [...new Set(as.map(a => a.getAttribute("href")))].slice(0, 8));
      for (const h of hrefs) { if (await page.locator("button.ms-report").count()) break; await go(page, h.startsWith("/") ? h : `${inbox}${h}`); }
      const rep = page.locator("button.ms-report").first();
      if (!(await rep.count())) { log("report", true, `${who}: no message from someone else in view — Report not applicable`); await page.close(); continue; }
      await rep.scrollIntoViewIfNeeded(); await rep.click({ force: true }); await page.waitForTimeout(500);
      const dlg = page.getByRole("dialog", { name: /Report this message/ });
      log("report", await dlg.isVisible(), `${who}: Report opens a labelled dialog`);
      if (await dlg.isVisible()) {
        const r = await dlg.boundingBox(); const vp = page.viewportSize(); log("report", !!r && r.y >= 0 && r.y + r.height <= vp.height + 1, `${who}: Report dialog fits ${vp.width}×${vp.height}`);
        await page.keyboard.press("Escape"); await page.waitForTimeout(400); log("report", !(await dlg.isVisible()), `${who}: Report dialog closes on Escape`);
      }
      const blk = page.locator("button.ms-block").first();
      if (await blk.count()) {
        await blk.click(); await page.waitForTimeout(500); const d2 = page.getByRole("dialog").last();
        log("report", await d2.isVisible(), `${who}: Block asks for confirmation in a dialog`);
        await page.keyboard.press("Escape"); await page.waitForTimeout(400); log("report", !(await d2.isVisible()), `${who}: Block dialog closes on Escape (nothing blocked)`);
      } else log("report", true, `${who}: no Block button in this thread`);
      if (errs.length) log("report", false, `${who}: page errors ${errs.slice(0, 2).join(" | ")}`);
      await page.close();
    }
  }

  if (only.includes("social")) {
    // Disposable fixtures (r1-fixtures.mjs social): a QA guest's message to the demo provider and a QA review on its venue.
    const so = JSON.parse(fs.readFileSync("artifacts/release/r1/fixtures.json", "utf8")).social;
    const page = await (await ctx("provider")).newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
    await go(page, `/provider/inbox?c=${so.conversation}`);
    const rep = page.locator("button.ms-report").first();
    log("social", (await rep.count()) > 0, "Report shows on the QA guest's message");
    if (await rep.count()) {
      await rep.click(); const dlg = page.getByRole("dialog", { name: /Report this message/ }); await dlg.waitFor({ timeout: 10000 });
      const send = dlg.getByRole("button", { name: /Send report/ });
      log("social", await send.isDisabled(), "Send report stays disabled until a reason is chosen");
      await dlg.locator("input[type=radio]").first().check(); await dlg.locator("textarea").fill("R1 QA check — disposable fixture.");
      await send.click(); const ok = await dlg.getByRole("status").waitFor({ timeout: 30000 }).then(() => true, () => false);
      log("social", ok, ok ? `report sent: "${(await dlg.getByRole("status").innerText()).slice(0, 80)}"` : `no confirmation (${(await dlg.innerText()).slice(0, 120)})`);
      await page.keyboard.press("Escape"); await page.waitForTimeout(400); log("social", !(await dlg.isVisible()), "report dialog closes on Escape");
    }
    await go(page, "/provider/reviews");
    const form = page.locator("form.pt-form:has(textarea[name=body])").first();
    log("social", (await form.count()) > 0, "the QA review shows under Needs a reply with a reply form");
    if (await form.count()) {
      const ta = form.locator("textarea[name=body]"); await form.locator("button").last().click(); await page.waitForTimeout(500);
      log("social", await ta.evaluate(t => !t.validity.valid), "an empty reply is blocked by the required field");
      await ta.fill("Thanks for the review — R1 QA reply (disposable)."); await form.locator("button").last().click();
      await page.waitForTimeout(3000); await go(page, "/provider/reviews?tab=all"); const posted = true; // textarea text is not matched by getByText
      const shown = await page.locator("textarea[name=body]").evaluateAll(ts => ts.some(t => t.value.includes("R1 QA reply")));
      log("social", posted && shown, shown ? "reply saved and shown as the provider's public reply (editable)" : "reply not found after posting");
    }
    if (errs.length) log("social", false, `page errors ${errs.slice(0, 2).join(" | ")}`);
    await page.close();
  }

  if (only.includes("reviews")) {
    // provider review replies: the form is there, the reply is required, and an empty Post sends nothing (no reply is written)
    const page = await (await ctx("provider")).newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
    let posts = 0; page.on("request", r => { if (r.method() === "POST" && r.headers()["next-action"]) posts++; });
    await go(page, "/provider/reviews?tab=all");
    const forms = page.locator("form.pt-form:has(textarea[name=body])");
    const n = await forms.count(); log("reviews", n > 0, `${n} reply form(s) on the reviews page`);
    if (n) {
      const f = forms.first(); const ta = f.locator("textarea[name=body]"); const before = await ta.inputValue();
      log("reviews", (await ta.getAttribute("required")) !== null && (await ta.getAttribute("maxlength")) !== null, "reply is required and length-limited");
      await ta.fill(""); await f.locator("button").last().click(); await page.waitForTimeout(800);
      log("reviews", posts === 0 && await ta.evaluate(t => !t.validity.valid), "empty Post is blocked before any request (nothing written)");
      await ta.fill(before);
    }
    if (errs.length) log("reviews", false, `page errors ${errs.slice(0, 2).join(" | ")}`);
    await page.close();
  }

  if (only.includes("checkout")) {
    const page = await (await ctx("customer")).newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
    await go(page, "/checkout/elite-sounds-night");
    const more = page.locator("button[aria-label^='More ']:not([disabled])").first();
    log("checkout", (await more.count()) > 0, "checkout lists an on-sale tier with a quantity control");
    if (await more.count()) {
      await more.click(); await page.waitForTimeout(300);
      await page.locator("button.co-cta:not([disabled])").first().click();
      await page.locator(".co-review").waitFor({ timeout: 60000 }).then(() => log("checkout", true, "Reserve → review step with a reservation timer"), () => log("checkout", false, "Reserve did not reach the review step"));
      const tick = page.locator(".co-review ~ * input[type=checkbox], input[type=checkbox][name*=terms i], label:has-text('terms') input[type=checkbox]").first();
      if (await tick.count()) await tick.check().catch(() => {});
      const pay = page.locator("button.co-cta:not([disabled])").first();
      if (await pay.count()) {
        await pay.click();
        const ok = await page.waitForURL(/checkout\.stripe\.com/, { timeout: 90000 }).then(() => true, () => false);
        log("checkout", ok, ok ? "Pay hands off to Stripe TEST Checkout (stopped there, no payment)" : `Pay did not reach Stripe (at ${page.url()})`);
        if (ok) log("checkout", /cs_test_/.test(page.url()), "Stripe session is a test-mode session");
        if (!ok) await page.screenshot({ path: `${OUT}/phaseb-checkout.png` }).catch(() => {});
      } else log("checkout", false, "no enabled Pay button on the review step");
    }
    if (errs.length) log("checkout", false, `page errors ${errs.slice(0, 2).join(" | ")}`);
    await page.close();
  }
} finally {
  for (const [who, c] of Object.entries(ctxs)) { await c.storageState({ path: `artifacts/auth/r1-${who}.json` }).catch(() => {}); await c.close().catch(() => {}); }
  await browser.close();
  const prev = fs.existsSync(REPORT) ? JSON.parse(fs.readFileSync(REPORT, "utf8")) : {};
  fs.writeFileSync(REPORT, JSON.stringify({ ...prev, phaseB: { ...(prev.phaseB ?? {}), ...out, at: new Date().toISOString() } }, null, 1));
}
