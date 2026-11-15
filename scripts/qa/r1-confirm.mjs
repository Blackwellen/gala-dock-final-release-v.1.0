// R1 follow-up confirmations after the auto-save / tour lane (coordinator 2026-11-15). One headless browser, demo sessions.
//   studio  — typing the title sends no save + shows Unsaved; Save button and Ctrl/⌘+S (from the title) end at Saved; Back with
//             unsaved edits confirms (Cancel stays, OK leaves, reopening offers "Restore local draft"); reload raises beforeunload;
//             a labelled Versions save doesn't re-show the draft banner; the Save button fits the header at 390 and 768.
//   tour    — ?tour=1: typing in a field while it loads → it opens only after the field is left and never takes focus; Escape in a
//             field doesn't close it; Skip removes tour=1 and a refresh doesn't reopen it.
//   live    — 30 s+ of slow typing on the live board incident note and in a message thread (while a new message arrives).
//   rfq     — steps 1–3: a reload keeps the draft and nothing reaches the server before Send request.
// Usage: node --env-file=.env --env-file=.env.local scripts/qa/r1-confirm.mjs [studio,tour,live,rfq]
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3107";
const only = (process.argv[2] ?? "studio,tour,live,rfq").split(",");
const REPORT = "artifacts/release/r1-signed-in.json";
const STUDIO = "/studio/e5139ad8-067a-40b8-b225-c3610f639447", EVENT = "392fdf17-4e5c-4473-987c-251dc0a97228";
const consent = { name: "gd_cc", value: "1", domain: new URL(BASE).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" };
const browser = await chromium.launch({ args: ["--disable-gpu"] });
const out = {}; const log = (k, ok, d) => { (out[k] ??= []).push({ ok, d }); console.log(`${ok ? "PASS" : "FAIL"} ${k}: ${d}`); };
const ctxs = {};
async function ctx(who, viewport = { width: 1440, height: 900 }) {
  const key = `${who}:${viewport.width}`; if (ctxs[key]) return ctxs[key];
  const st = JSON.parse(fs.readFileSync(`artifacts/auth/r1-${who}.json`, "utf8")); st.cookies.push(consent);
  const c = await browser.newContext({ storageState: st, viewport, reducedMotion: "reduce" });
  await c.routeWebSocket(/_next\/(webpack-)?hmr|turbopack-hmr/, ws => { const s = ws.connectToServer(); s.onMessage(m => { if (typeof m === "string" && /"reloadPage"|"type":"restart"/.test(m)) return; ws.send(m); }); });
  return (ctxs[key] = c);
}
const writes = page => { const list = []; page.on("request", r => { const m = r.method(); if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS" && !/analytics|\/_next\/|maintenance|telemetry|vitals/.test(r.url())) list.push(`${m} ${r.url().replace(BASE, "").slice(0, 80)}${r.headers()["next-action"] ? " (server action)" : ""}`); }); return list; };
const go = (page, url) => page.goto(BASE + url, { waitUntil: "load", timeout: 180000 }).then(() => page.waitForTimeout(2000));

try {
  if (only.includes("studio")) {
    const page = await (await ctx("organizer")).newPage(); const w = writes(page); const dialogs = [];
    page.on("dialog", async d => { dialogs.push(d.type()); if (d.type() === "beforeunload") await d.accept(); });
    await go(page, STUDIO);
    const title = page.locator("input.st-title"), status = page.locator(".st-save");
    const original = await title.inputValue();
    const before = w.length;
    await title.click(); await page.keyboard.press("End"); await page.keyboard.type(" R1", { delay: 80 }); await page.waitForTimeout(3500);
    log("studio", w.length === before, w.length === before ? "typing the title sent nothing to the server" : `typing sent: ${w.slice(before).join(", ")}`);
    log("studio", /Unsaved/.test(await status.innerText()), `status after typing: "${await status.innerText()}"`);
    await page.keyboard.press("Control+s"); await page.waitForTimeout(3500);
    log("studio", /Saved/.test(await status.innerText()) && !/Unsaved/.test(await status.innerText()), `Ctrl+S from the title field → "${await status.innerText()}"`);
    await title.click(); await page.keyboard.type("x", { delay: 80 }); await page.waitForTimeout(500);
    const saveBtn = page.locator("header.st-top button", { hasText: /^Save$/ });
    await saveBtn.click(); await page.waitForTimeout(3500);
    log("studio", /^Saved/.test(await status.innerText()), `Save button → "${await status.innerText()}"`);
    // Back with unsaved edits: Cancel stays, OK leaves
    await title.click(); await page.keyboard.type("y", { delay: 80 }); await page.waitForTimeout(600);
    page.removeAllListeners("dialog"); let confirmSeen = 0;
    page.once("dialog", async d => { confirmSeen++; await d.dismiss(); });
    await page.locator("header.st-top a[aria-label=Back]").click(); await page.waitForTimeout(1500);
    log("studio", confirmSeen === 1 && page.url().includes("/studio/"), `Back with unsaved edits asked to confirm (${confirmSeen}); Cancel stayed on the studio`);
    page.once("dialog", async d => { confirmSeen++; await d.accept(); });
    await page.locator("header.st-top a[aria-label=Back]").click(); await page.waitForURL(u => !u.pathname.startsWith("/studio/"), { timeout: 60000 }).catch(() => {});
    log("studio", confirmSeen === 2 && !page.url().includes("/studio/"), `OK left the studio (now ${new URL(page.url()).pathname})`);
    await go(page, STUDIO);
    const banner = page.locator(".st-notice[role=status]");
    log("studio", (await banner.count()) > 0 && /Restore/i.test(await banner.innerText()), `reopening offers: "${(await banner.innerText().catch(() => "")).slice(0, 90)}"`);
    // reload with unsaved edits → beforeunload
    let bu = 0; page.on("dialog", async d => { if (d.type() === "beforeunload") { bu++; await d.accept(); } else await d.dismiss(); });
    await title.click(); await page.keyboard.type("z", { delay: 80 }); await page.waitForTimeout(600);
    await page.reload({ waitUntil: "load" }).catch(() => {}); await page.waitForTimeout(2500);
    log("studio", bu > 0, `reload with unsaved edits raised the beforeunload prompt (${bu})`);
    // restore the original title, then a labelled Versions save must not bring the draft banner back
    const restore = page.locator(".st-notice[role=status] button", { hasText: /Restore|Discard/ });
    const discard = page.locator(".st-notice[role=status] button", { hasText: /Discard/ }); if (await discard.count()) { await discard.click(); await page.waitForTimeout(800); }
    void restore;
    await title.fill(original); await page.keyboard.press("Control+s"); await page.waitForTimeout(3500);
    await page.locator("header.st-top button", { hasText: "Versions" }).click(); await page.waitForTimeout(800);
    const label = page.locator("form input").filter({ hasNot: page.locator("[type=hidden]") }).last();
    const vForm = page.locator("aside form, .st-panel form").last();
    if (await vForm.count()) { await vForm.locator("input:not([type=hidden])").first().fill("R1 QA labelled version"); await vForm.locator("button").last().click(); await page.waitForTimeout(3500); }
    void label;
    await page.reload({ waitUntil: "load" }).catch(() => {}); await page.waitForTimeout(2500);
    log("studio", (await page.locator(".st-notice[role=status]").count()) === 0, "after a labelled Versions save the local-draft banner does not come back");
    log("studio", (await title.inputValue()) === original, `title restored to the original ("${original}")`);
    await page.close();
    for (const [w0, h0] of [[390, 844], [768, 1024]]) {
      const p2 = await (await ctx("organizer", { width: w0, height: h0 })).newPage(); await go(p2, STUDIO);
      const fit = await p2.evaluate(() => { const h = document.querySelector("header.st-top"), b = Array.from(h.querySelectorAll("button")).find(x => x.textContent.trim() === "Save"); if (!b) return null; const r = b.getBoundingClientRect(), hr = h.getBoundingClientRect(); return { inView: r.left >= 0 && r.right <= innerWidth + 1, inHeader: r.top >= hr.top - 1 && r.bottom <= hr.bottom + 1, w: Math.round(r.width), clipped: b.scrollWidth > b.clientWidth + 1 }; });
      log("studio", !!fit && fit.inView && fit.inHeader && !fit.clipped, `Save button at ${w0}px: ${JSON.stringify(fit)}`);
      await p2.close();
    }
  }

  if (only.includes("tour")) {
    const page = await (await ctx("organizer")).newPage();
    await page.goto(BASE + "/organizer?tour=1", { waitUntil: "commit", timeout: 180000 });
    const field = page.locator("header input[type=search], header input, main input").first();
    await field.waitFor({ timeout: 120000 }); await field.click(); await page.keyboard.type("venue", { delay: 250 }); await page.waitForTimeout(2500);
    const tour = page.locator("[role=dialog][aria-label*=tour i], .gt-pop, [class*=tour][role=dialog], [data-tour-popover]");
    const openWhileTyping = await tour.first().isVisible().catch(() => false);
    const stillFocused = await field.evaluate(el => document.activeElement === el);
    log("tour", !openWhileTyping && stillFocused, `while typing in a field the tour stayed closed (${!openWhileTyping}) and focus stayed in the field (${stillFocused})`);
    await page.keyboard.press("Escape").catch(() => {}); await field.fill("").catch(() => {}); await field.blur(); await page.locator("body").click({ position: { x: 5, y: 400 } }).catch(() => {}); await page.waitForTimeout(2500);
    const opened = await tour.first().isVisible().catch(() => false);
    log("tour", opened, `after leaving the field the tour opened (${opened})`);
    if (opened) {
      const stole = await page.evaluate(() => !!document.activeElement?.closest?.("[role=dialog], .gt-pop"));
      log("tour", !stole, "the tour did not take focus");
      await field.click(); await page.keyboard.press("Escape"); await page.waitForTimeout(800);
      log("tour", await tour.first().isVisible().catch(() => false), "Escape inside a field did not close the tour");
      const skip = tour.first().getByRole("button", { name: /Skip/i }); if (await skip.count()) await skip.first().click(); else await tour.first().getByRole("button", { name: /Finish|Done|Close/i }).first().click();
      await page.waitForTimeout(1500);
      log("tour", !page.url().includes("tour=1"), `after Skip the URL is ${new URL(page.url()).pathname + new URL(page.url()).search}`);
      await page.reload({ waitUntil: "load" }); await page.waitForTimeout(3000);
      log("tour", !(await tour.first().isVisible().catch(() => false)), "a refresh does not reopen the tour");
    }
    await page.close();
  }

  if (only.includes("live")) {
    const page = await (await ctx("organizer")).newPage(); await go(page, `/organizer/events/${EVENT}/live`);
    await page.getByRole("button", { name: "Report an issue" }).first().click().catch(() => {}); await page.waitForTimeout(800); // opens the incident form (not submitted)
    const f = page.locator("form[aria-label='Report an issue'] input[name=title]").first();
    if (await f.count()) {
      const text = "Generator check at the north gate, two stewards on standby";
      await f.click(); let navs = 0; page.on("framenavigated", fr => { if (fr === page.mainFrame()) navs++; });
      const t0 = Date.now(); for (const ch of text) { await page.keyboard.type(ch); await page.waitForTimeout(560); }
      const st = await f.evaluate((el, want) => ({ v: el.value, focused: document.activeElement === el, caret: el.selectionStart === el.value.length, ok: el.value === want }), text);
      log("live", st.ok && st.focused && st.caret && navs === 0, `live board: ${Math.round((Date.now() - t0) / 1000)} s of typing → value intact ${st.ok}, focus ${st.focused}, caret at end ${st.caret}, reloads ${navs}`);
      await f.fill("");
    } else log("live", false, "no text field on the live board");
    await page.close();
    // message thread: a QA guest's conversation with the demo provider (r1-fixtures.mjs social); a new message arrives mid-typing
    const so = JSON.parse(fs.readFileSync("artifacts/release/r1/fixtures.json", "utf8")).social;
    if (so && !so.cleaned) {
      const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const p = await (await ctx("provider")).newPage(); await go(p, `/provider/inbox?c=${so.conversation}`);
      const box = p.locator("textarea").last(); await box.click(); const text = "Thanks, we can do the earlier load-in on Friday";
      const t0 = Date.now(); let sent = false;
      for (const ch of text) { await p.keyboard.type(ch); await p.waitForTimeout(700); if (!sent && Date.now() - t0 > 12000) { sent = true; await db.from("conversation_messages").insert({ conversation_id: so.conversation, sender_id: so.user, sender_name: "R1 QA Guest", body: "R1 QA live message — arrives while the provider types." }); } }
      await p.waitForTimeout(4000);
      const st = await box.evaluate((el, want) => ({ ok: el.value === want, focused: document.activeElement === el, caret: el.selectionStart === el.value.length }), text);
      const arrived = await p.getByText("R1 QA live message").count();
      log("live", st.ok && st.focused && st.caret, `message thread: ${Math.round((Date.now() - t0) / 1000)} s of typing → value intact ${st.ok}, focus ${st.focused}, caret at end ${st.caret}`);
      log("live", arrived > 0, `a new message arrived while typing (${arrived ? "shown" : "not shown"})`);
      await box.fill(""); await p.close();
    } else log("live", false, "message-thread fixture missing (run r1-fixtures.mjs social)");
  }

  if (only.includes("rfq")) {
    // steps 1–3 are local-only drafts: type on each step, reload, the text and the step survive; no write reaches the server
    const page = await (await ctx("organizer")).newPage(); const w = writes(page);
    const base = `/organizer/marketplace/requests/new?category=dj&event=${EVENT}`;
    const before = w.length;
    for (const s of [1, 2, 3]) {
      await go(page, `${base}&step=${s}`);
      const f = page.locator("main textarea:visible, main input[type=text]:visible").first();
      if (!(await f.count())) { log("rfq", true, `step ${s}: no free-text field (choices only)`); continue; }
      const mark = `R1 QA step ${s} draft`; await f.fill(""); await f.type(mark, { delay: 30 }); await page.waitForTimeout(1200);
      await page.reload({ waitUntil: "load" }); await page.waitForTimeout(2500);
      const kept = await page.locator("main textarea:visible, main input[type=text]:visible").first().inputValue().catch(() => "");
      log("rfq", kept.includes(mark) && page.url().includes(`step=${s}`), `step ${s}: after reload the draft reads "${kept.slice(0, 40)}" on ${new URL(page.url()).search.replace(/.*(step=\d).*/, "$1")}`);
    }
    log("rfq", w.length === before, w.length === before ? "nothing was sent to the server across steps 1–3" : `writes before Send: ${w.slice(before).join(", ")}`);
    await page.evaluate(() => { for (const st of [localStorage, sessionStorage]) for (const k of Object.keys(st)) if (/rfq|request/i.test(k)) st.removeItem(k); });
    await page.close();
  }
} finally {
  for (const c of Object.values(ctxs)) await c.close().catch(() => {});
  await browser.close();
  const prev = fs.existsSync(REPORT) ? JSON.parse(fs.readFileSync(REPORT, "utf8")) : {};
  fs.writeFileSync(REPORT, JSON.stringify({ ...prev, confirmations: { ...(prev.confirmations ?? {}), ...out, at: new Date().toISOString() } }, null, 1));
}
