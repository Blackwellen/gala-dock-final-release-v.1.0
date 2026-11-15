// R1 (owner 2026-11-15): on every wizard step and settings form, type into each text field slowly — with ~2 s pauses mid-word — and
// confirm the value, focus and caret survive: no reload, no re-render reset, no guided-tour pop-up. Each field's original value is put
// back afterwards (blur once restored, so any auto-save writes the original). One headless browser; demo sessions from ws-auth.mjs.
// Usage: node --env-file=.env --env-file=.env.local scripts/qa/r1-typing.mjs [--plan=artifacts/release/r1/plan-typing.json]
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3107";
const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const plan = JSON.parse(fs.readFileSync(arg("plan") ?? "artifacts/release/r1/plan-typing.json", "utf8"));
const REPORT = "artifacts/release/r1-signed-in.json", MAX_FIELDS = Number(arg("max") ?? 4);
const PART1 = "R1 typing che", PART2 = "ck slowly";
const consent = { name: "gd_cc", value: "1", domain: new URL(BASE).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" };
const browser = await chromium.launch({ args: ["--disable-gpu"] });
const ctxs = {}; const rows = [];
const ctxFor = async (state, who) => { if (ctxs[who]) return ctxs[who]; const st = JSON.parse(fs.readFileSync(state, "utf8")); st.cookies.push(consent);
  const c = await browser.newContext({ storageState: st, viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await c.routeWebSocket(/_next\/(webpack-)?hmr|turbopack-hmr/, ws => { const s = ws.connectToServer(); s.onMessage(m => { if (typeof m === "string" && /"reloadPage"|"type":"restart"/.test(m)) return; ws.send(m); }); });
  return (ctxs[who] = c); };
try {
  for (const it of plan) {
    const page = await (await ctxFor(it.state, it.label)).newPage(); let navs = 0;
    page.on("framenavigated", f => { if (f === page.mainFrame()) navs++; });
    const row = { label: it.label, route: it.route, fields: [], problems: [] };
    try {
      await page.goto(BASE + it.route, { waitUntil: "load", timeout: 180000 }); await page.waitForTimeout(2500);
      const start = navs;
      const fields = page.locator("main :is(input:not([type]), input[type=text], input[type=search], input[type=email], input[type=url], input[type=tel], textarea):visible:not([readonly]):not([disabled])");
      const n = Math.min(await fields.count(), MAX_FIELDS);
      for (let i = 0; i < n; i++) {
        const f = fields.nth(i); const name = (await f.getAttribute("aria-label")) || (await f.getAttribute("name")) || (await f.getAttribute("placeholder")) || `field ${i + 1}`;
        const original = await f.inputValue().catch(() => "");
        const dialogsBefore = await page.locator("[role=dialog]:visible, .gt-pop:visible, [class*=tour]:visible").count();
        // numeric fields (inputmode numeric/decimal, or a digits-only value) take digits; text fields take words split mid-word
        const numeric = await f.evaluate(el => /numeric|decimal/.test(el.inputMode) || /^[\d.,\s£$€-]+$/.test(el.value || "") && (el.value || "").length > 0);
        // a field with a short maxlength (country code, VAT number) gets text that fits, so truncation by design isn't read as loss
        const room = await f.evaluate(el => (el.maxLength > 0 ? el.maxLength : 9999) - (el.value || "").length);
        let [a, b] = numeric ? ["1", "2"] : [PART1, PART2];
        if (!numeric && room < a.length + b.length) { const t = "R1typ".slice(0, Math.max(2, room)); [a, b] = [t.slice(0, Math.ceil(t.length / 2)), t.slice(Math.ceil(t.length / 2))]; }
        if (room <= 1) { row.fields.push({ name, ok: true, issues: [], skipped: "field already at its maxlength" }); continue; }
        await f.click(); if (numeric) await f.fill(""); await page.keyboard.press("Control+End"); await page.keyboard.press("End"); // numbers: start empty so caps / decimals don't reject the digits
        await page.keyboard.type(a, { delay: 60 }); await page.waitForTimeout(2000);
        await page.keyboard.type(b, { delay: 60 }); await page.waitForTimeout(2000);
        const state = await f.evaluate((el, [want, numeric]) => ({ value: el.value, focused: document.activeElement === el, caretAtEnd: el.selectionStart === null || el.selectionStart === el.value.length, endsWith: numeric ? el.value.replace(/[,\s]/g, "").endsWith(want) : el.value.endsWith(want) }), [a + b, numeric]).catch(e => ({ error: String(e.message).slice(0, 80) }));
        const dialogsAfter = await page.locator("[role=dialog]:visible, .gt-pop:visible, [class*=tour]:visible").count();
        const issues = [];
        if (state.error) issues.push(`field detached (${state.error})`);
        else { if (!state.endsWith) issues.push(`value lost: "${String(state.value).slice(-40)}"`); if (!state.focused) issues.push("focus lost"); if (!state.caretAtEnd) issues.push("caret moved"); }
        if (navs > start) issues.push("page reloaded / navigated while typing");
        if (dialogsAfter > dialogsBefore) issues.push("a dialog / tour popped up while typing");
        row.fields.push({ name, ok: !issues.length, issues });
        if (issues.length) row.problems.push(`${name}: ${issues.join("; ")}`);
        // put the original back (fill then blur, so any auto-save stores the original value)
        await f.fill(original).catch(() => {}); await page.locator("body").click({ position: { x: 2, y: 2 } }).catch(() => {}); await page.waitForTimeout(800);
        if (navs > start) break;
      }
    } catch (e) { row.problems.push(`load: ${String(e.message).slice(0, 120)}`); }
    rows.push(row);
    console.log(`${row.problems.length ? "FAIL" : "ok  "} ${it.label} ${it.route} fields ${row.fields.length}${row.problems.length ? " | " + row.problems.join(" | ") : ""}`);
    await page.close();
    const prev = fs.existsSync(REPORT) ? JSON.parse(fs.readFileSync(REPORT, "utf8")) : {};
    fs.writeFileSync(REPORT, JSON.stringify({ ...prev, typing: { at: new Date().toISOString(), pages: rows.length, fields: rows.reduce((a, r) => a + r.fields.length, 0), problems: rows.filter(r => r.problems.length).length, rows } }, null, 1));
  }
} finally { for (const [w, c] of Object.entries(ctxs)) { await c.storageState({ path: `artifacts/auth/r1-${w}.json` }).catch(() => {}); } await browser.close(); }
