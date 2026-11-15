// R1 signed-in click-through (queue R1 + Q71 signed-in routes). One headless browser, one page per workspace.
//   crawl: walks src/app for every signed-in route pattern, visits the static ones as each workspace and resolves one concrete
//          URL per dynamic pattern from links the signed-in user can actually see (no service-role id lookups). → artifacts/release/r1/plan.json
//   click: loads each planned URL at 1280×800, records HTTP 5xx / console + page errors / auth bounces, clicks every tab and every
//          safe dialog / drawer / menu trigger (never submit, delete, send, pay, publish, run …), checks each popup fits the
//          viewport and closes on Escape or its close button. → artifacts/release/r1-signed-in.json (section "click")
// States come from scripts/ws-auth.mjs (password sign-in; admin with TOTP). Usage:
//   node --env-file=.env --env-file=.env.local scripts/qa/r1-signed-in.mjs crawl|click [--who=customer,organizer] [--routes=/a,/b]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

// Low-memory mode (coordinator 2026-11-15): between routes, pause while free RAM < 1.2 GB until it recovers above 1.8 GB.
import { execFileSync } from "node:child_process";
const freeMb = () => { try { return Math.round(Number(execFileSync("wmic", ["OS", "get", "FreePhysicalMemory", "/value"], { encoding: "utf8", windowsHide: true }).match(/=(\d+)/)[1]) / 1024); } catch { return Infinity; } };
export const ramPauses = [];
async function ramGuard(where) {
  let f = freeMb(); if (f >= 1200) return;
  const t = Date.now(); console.log(`RAM ${f} MB < 1200 at ${where}; pausing`);
  while (f < 1800 && Date.now() - t < 600000) { await new Promise(r => setTimeout(r, 15000)); f = freeMb(); }
  ramPauses.push({ where, ms: Date.now() - t, recovered: f >= 1800 });
  if (ramPauses.filter(p => !p.recovered).length >= 2 || ramPauses.length >= 6) { console.log("RAM keeps dropping; stopping"); throw new Error("low-ram-stop"); }
}

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3107";
const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const mode = process.argv[2];
const OUT = "artifacts/release/r1"; fs.mkdirSync(OUT, { recursive: true });
const PLAN = arg("plan") ?? `${OUT}/plan.json`, REPORT = "artifacts/release/r1-signed-in.json";

export const WHO = {
  customer: { state: "artifacts/auth/r1-customer.json", prefixes: ["/account", "/messages", "/checkout", "/tickets", "/plan", "/onboarding", "/mfa", "/r/"] },
  organizer: { state: "artifacts/auth/r1-organizer.json", prefixes: ["/organizer", "/studio", "/door", "/messages"] },
  provider: { state: "artifacts/auth/r1-provider.json", prefixes: ["/provider", "/messages"] },
  admin: { state: "artifacts/auth/r1-admin.json", prefixes: ["/admin"] },
  partner: { state: "artifacts/auth/r1-partner.json", prefixes: ["/partner"] },
  promoter: { state: "artifacts/auth/r1-promoter.json", prefixes: ["/promoter"] },
};
// Key pages get the full Q71 matrix; the rest the reduced one.
const KEY = [/^\/account$/, /^\/account\/events\/[^/]+\/book$/, /^\/account\/events\/[^/]+\/money$/, /^\/account\/inbox$/, /^\/account\/tickets$/,
  /^\/organizer$/, /^\/organizer\/events\/new$/, /^\/organizer\/money$/, /^\/organizer\/inbox$/, /^\/organizer\/settings$/,
  /^\/provider$/, /^\/provider\/venues\/new$/, /^\/provider\/money$/, /^\/provider\/inbox$/, /^\/provider\/settings$/,
  /^\/admin$/, /^\/admin\/commerce$/, /^\/admin\/settings$/, /^\/partner$/, /^\/promoter$/, /^\/checkout\/[^/]+$/];
// Never visited by the crawler: GET routes that act on a token, sign out, or print dialogs.
const SKIP = /\/(logout|sign-?out)|\/api\/|\/tickets\/accept\/|\/print$|\/admin\/login|\/door\//;

/** Every page.tsx under src/app → { pattern, regex, dynamic }, route groups stripped. */
function patterns() {
  const out = [];
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name === "page.tsx") out.push(p); } };
  walk("src/app");
  return out.map(f => {
    const route = "/" + path.relative("src/app", path.dirname(f)).split(path.sep).filter(s => !/^\(.*\)$/.test(s) && !s.startsWith("@")).join("/");
    const r = route.replace(/\/$/, "") || "/";
    const re = new RegExp("^" + r.split("/").map(s => /^\[\[\.\.\..+\]\]$/.test(s) ? "(?:/.*)?" : /^\[\.\.\..+\]$/.test(s) ? "/.+" : /^\[.+\]$/.test(s) ? "/[^/]+" : s ? "/" + s.replace(/[.*+?^${}()|\\]/g, "\\$&") : "").join("").replace(/^\/\(\?:/, "(?:/") + "/?$");
    return { pattern: r, re, dynamic: /\[/.test(r) };
  });
}

// The watchdog restarts the dev server when it outgrows its cap (low-memory mode): wait for it, then retry the navigation.
async function serverUp(maxMs = 300000) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) { try { const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(15000) }); if (r.status < 500) return true; } catch { /* restarting */ } await new Promise(r => setTimeout(r, 5000)); }
  return false;
}
async function go(page, url) {
  for (let i = 0; ; i++) {
    try { const resp = await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 180000 }); await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {}); return resp; }
    catch (e) { if (i >= 2 || !/ERR_CONNECTION|ERR_EMPTY_RESPONSE|ECONNRESET|Timeout|ERR_ABORTED/.test(e.message)) throw e; await serverUp(); }
  }
}
const browser = await chromium.launch({ args: ["--disable-gpu", "--js-flags=--max-old-space-size=512"] });
const consent = { name: "gd_cc", value: "1", domain: new URL(BASE).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" };
async function context(who) {
  const st = JSON.parse(fs.readFileSync(WHO[who].state, "utf8")); st.cookies = [...st.cookies.filter(c => c.name !== "gd_cc"), consent];
  const ctx = await browser.newContext({ storageState: st, viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  // Dev-only HMR socket: proxied, minus its full-reload messages — after a watchdog restart the dev client otherwise reload-loops ("HMR hash mismatch").
  await ctx.routeWebSocket(/_next\/(webpack-)?hmr|turbopack-hmr/, ws => { const server = ws.connectToServer(); server.onMessage(m => { if (typeof m === "string" && /"reloadPage"|"type":"restart"/.test(m)) return; ws.send(m); }); });
  return ctx;
}
const DANGER = /\b(delete|remove|send|submit|pay|publish|unpublish|confirm|approve|reject|decline|archive|refund|block|report|save|launch|start|run|ask|cancel|accept|sign ?out|log ?out|revoke|disable|enable|pause|resume|retry|charge|withdraw|kill|reset|transfer|release|issue|mark|complete|book|request|duplicate|generate|apply|connect|verify|regenerate|rotate|suspend|ban|restore|clear|upgrade|downgrade|buy|checkout|purchase|copy|download|print|resend|notify|refresh|sync|claim|unlink|leave|end|stop|go live|assign|grant|dismiss|undo|redo|next|back|continue|finish|place|lock|unlock|close)\b/i;
const whoList = (arg("who")?.split(",")) ?? Object.keys(WHO).filter(w => fs.existsSync(WHO[w].state));

try {
  if (mode === "crawl") await crawl();
  else if (mode === "click") await click();
  else console.log("usage: crawl | click");
} finally { await browser.close(); }

async function crawl() {
  const all = patterns();
  const plan = fs.existsSync(PLAN) ? JSON.parse(fs.readFileSync(PLAN, "utf8")).filter(p => !whoList.includes(p.label)) : [];
  const unresolved = fs.existsSync(`${OUT}/unresolved.json`) ? JSON.parse(fs.readFileSync(`${OUT}/unresolved.json`, "utf8")).filter(u => !whoList.includes(u.label)) : [];
  for (const who of whoList) {
    const mine = all.filter(p => WHO[who].prefixes.some(x => p.pattern === x.replace(/\/$/, "") || p.pattern.startsWith(x.endsWith("/") ? x : x + "/")));
    const found = new Map(); // pattern → url
    const queue = mine.filter(p => !p.dynamic && !SKIP.test(p.pattern)).map(p => p.pattern); const seen = new Set();
    const ctx = await context(who); const page = await ctx.newPage(); let visits = 0;
    while (queue.length && visits < 160) {
      const url = queue.shift(); if (seen.has(url)) continue; seen.add(url); await ramGuard(url);
      if (mine.filter(p => p.dynamic).every(p => found.has(p.pattern)) && found.size >= mine.length) break;
      try { await go(page, url); await page.waitForTimeout(800); visits++; }
      catch (e) { console.log(`ERR  ${who} ${url} ${String(e.message).slice(0, 100)}`); continue; }
      const landed = new URL(page.url()).pathname;
      const self = mine.find(p => !p.dynamic && p.re.test(url.split("?")[0])) ?? mine.find(p => p.re.test(url.split("?")[0])); if (self && !found.has(self.pattern)) found.set(self.pattern, url);
      if (/^\/(login|mfa)/.test(landed) && !/^\/(login|mfa)/.test(url)) { console.log(`BOUNCE ${who} ${url} → ${landed}`); continue; }
      let hrefs = [];
      for (let i = 0; i < 3; i++) { try { hrefs = await page.$$eval("a[href]", as => as.map(a => a.getAttribute("href"))); break; } catch { await page.waitForLoadState("load").catch(() => {}); await page.waitForTimeout(1500); } }
      if (new URL(page.url()).pathname !== landed) console.log(`MOVED ${who} ${url}: ${landed} → ${new URL(page.url()).pathname}`);
      for (const h of hrefs) {
        if (!h || !h.startsWith("/") || h.startsWith("//")) continue; const u = h.split("#")[0]; const p0 = u.split("?")[0];
        if (SKIP.test(p0)) continue;
        if (all.some(p => !p.dynamic && p.re.test(p0))) continue; // a static route (e.g. /events/new), not an instance
        const m = mine.find(p => p.dynamic && p.re.test(p0)); if (!m) continue;
        if (!found.has(m.pattern)) { found.set(m.pattern, p0); queue.unshift(p0); } // follow the first instance (its tabs lead to nested patterns)
      }
      console.log(`crawl ${who} ${url} (${found.size}/${mine.length})`);
    }
    // Nested pages nobody links to (e.g. /events/[id]/live): derive from a resolved parent instance + a static suffix, keep if it loads.
    for (const p of mine.filter(p => p.dynamic && !found.has(p.pattern) && !SKIP.test(p.pattern))) {
      const parent = [...found.keys()].filter(k => p.pattern.startsWith(k + "/") && !/\[/.test(p.pattern.slice(k.length))).sort((a, b) => b.length - a.length)[0];
      if (!parent) continue;
      const url = found.get(parent).split("?")[0] + p.pattern.slice(parent.length);
      try { const r = await go(page, url); await page.waitForTimeout(500); if ((r?.status() ?? 0) < 400 && !/^\/(login|mfa)/.test(new URL(page.url()).pathname)) { found.set(p.pattern, url); console.log(`derived ${who} ${url}`); } }
      catch { /* stays unresolved */ }
    }
    await ctx.storageState({ path: WHO[who].state }).catch(() => {}); await ctx.close(); // keep the rotated session for the next pass
    for (const p of mine) {
      if (SKIP.test(p.pattern) && !found.has(p.pattern)) { unresolved.push({ label: who, pattern: p.pattern, why: "skipped (token / print / door)" }); continue; }
      const url = found.get(p.pattern) ?? (!p.dynamic ? p.pattern : null);
      if (!url) { unresolved.push({ label: who, pattern: p.pattern, why: "no link to an instance found while crawling" }); continue; }
      if (plan.some(x => x.route === url)) continue; // /messages/[id] once
      plan.push({ route: url, pattern: p.pattern, label: who, state: WHO[who].state, set: KEY.some(k => k.test(url)) ? "full" : "reduced" });
    }
    fs.writeFileSync(PLAN, JSON.stringify(plan, null, 1)); fs.writeFileSync(`${OUT}/unresolved.json`, JSON.stringify(unresolved, null, 1));
  }
  fs.writeFileSync(PLAN, JSON.stringify(plan, null, 1));
  fs.writeFileSync(`${OUT}/unresolved.json`, JSON.stringify(unresolved, null, 1));
  console.log(`plan ${plan.length} routes, unresolved ${unresolved.length}`);
}


async function click() {
  const plan = JSON.parse(fs.readFileSync(PLAN, "utf8")).filter(p => whoList.includes(p.label) && (!arg("routes") || arg("routes").split(",").includes(p.route)));
  const prev = fs.existsSync(REPORT) ? JSON.parse(fs.readFileSync(REPORT, "utf8")) : {};
  const keep = (prev.click ?? []).filter(r => !plan.some(p => p.route === r.route && p.label === r.label));
  const rows = [];
  for (const who of whoList) {
    const items = plan.filter(p => p.label === who); if (!items.length) continue;
    const ctx = await context(who); let page = await ctx.newPage();
    for (const item of items) {
      await ramGuard(item.route); await page.close(); page = await ctx.newPage(); // fresh page per route (low-memory mode)
      const row = { label: who, route: item.route, pattern: item.pattern, findings: [], tabs: 0, triggers: 0 };
      const errors = [], bad = [];
      const onC = m => { if (m.type() === "error" && !/favicon|React DevTools|\[HMR\]|webpack-hmr|Fast Refresh|net::ERR_ABORTED/.test(m.text())) { const t = m.text();
        if (/%[os]/.test(t)) { Promise.all(m.args().map(a => a.jsonValue().then(v => typeof v === "string" ? v : JSON.stringify(v), () => String(a)))).then(v => errors.push(v.join(" ").replace(/\s+/g, " ").slice(0, 400)), () => errors.push(t.slice(0, 200))); return; }
        errors.push(/hydrat/i.test(t) ? t.slice(Math.max(0, t.search(/\n\s*[+-] /) - 300), Math.max(0, t.search(/\n\s*[+-] /) - 300) + 900) : t.slice(0, 200)); } };
      const onE = e => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`);
      const onR = r => { if (r.status() >= 500 && r.url().startsWith(BASE)) bad.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "").slice(0, 120)}`); };
      page.on("console", onC); page.on("pageerror", onE); page.on("response", onR);
      try {
        const resp = await go(page, item.route); await page.waitForTimeout(1000);
        row.status = resp?.status(); row.landed = new URL(page.url()).pathname;
        if (/^\/(login|mfa|admin\/login)/.test(row.landed)) row.findings.push({ kind: "auth-bounce", detail: row.landed });
        await page.addStyleTag({ content: 'button[aria-label="Open design overlay"]{display:none!important}' }).catch(() => {});
        const res = await page.evaluate(exercise, { agent: /\/agent/.test(item.route), danger: DANGER.source });
        row.tabs = res.tabs; row.triggers = res.triggers; row.findings.push(...res.findings); row.opened = res.opened;
        if (new URL(page.url()).pathname !== row.landed) row.findings.push({ kind: "navigated", detail: `clicking left the page → ${new URL(page.url()).pathname}` });
      } catch (e) { row.findings.push({ kind: "load-error", detail: String(e.message).slice(0, 160) }); }
      await page.waitForTimeout(300);
      if (errors.length) row.findings.push(...[...new Set(errors)].slice(0, 5).map(d => ({ kind: "console-error", detail: d })));
      if (bad.length) row.findings.push(...[...new Set(bad)].slice(0, 5).map(d => ({ kind: "http-5xx", detail: d })));
      page.off("console", onC); page.off("pageerror", onE); page.off("response", onR);
      if (row.findings.length) { const f = `${OUT}/click--${who}--${item.route.replace(/\W+/g, "_").replace(/^_|_$/g, "")}.png`; await page.screenshot({ path: f, timeout: 30000 }).then(() => { row.shot = f; }).catch(() => {}); }
      rows.push(row);
      console.log(`${row.findings.length ? "FAIL" : "ok  "} ${who} ${item.route} tabs ${row.tabs} triggers ${row.triggers}${row.findings.length ? " " + row.findings.map(f => f.kind + ":" + String(f.detail).slice(0, 80)).join(" | ") : ""}`);
      write();
    }
    await ctx.storageState({ path: WHO[who].state }).catch(() => {}); await ctx.close(); // keep the rotated session for the next pass
  }
  function write() {
    const click = [...keep, ...rows];
    const out = { ...prev, click, clickSummary: { at: new Date().toISOString(), routes: click.length, clean: click.filter(r => !r.findings.length).length, tabs: click.reduce((a, r) => a + r.tabs, 0), triggers: click.reduce((a, r) => a + r.triggers, 0), byKind: click.flatMap(r => r.findings).reduce((a, f) => (a[f.kind] = (a[f.kind] ?? 0) + 1, a), {}) } };
    fs.writeFileSync(REPORT, JSON.stringify(out, null, 1));
  }
}

/** In-page: click every tab, then every safe popup trigger; check fit + close. */
async function exercise({ agent, danger }) {
  const DANGER = new RegExp(danger, "i"); const F = []; const opened = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const vw = innerWidth, vh = innerHeight;
  const visible = el => { if (!el.isConnected) return false; { const d = el.closest("details:not([open])"); if (d && !el.closest("summary")) return false; } const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false; } return true; };
  const txt = el => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
  const start = location.pathname + location.search;
  const POP = "[role=dialog], [role=alertdialog], [role=menu], [role=listbox], dialog[open], [data-radix-popper-content-wrapper], .gp-sheet-panel, [class*=drawer]:not(button), [class*=popover]:not(button)";
  const pops = () => Array.from(document.querySelectorAll(POP)).filter(visible);
  const esc = () => { const t = document.activeElement ?? document.body; for (const n of [t, document]) n.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true })); };
  // 1. tabs
  const tabs = Array.from(document.querySelectorAll("[role=tab]")).filter(t => visible(t) && t.getAttribute("aria-disabled") !== "true" && !t.disabled);
  for (const t of tabs) {
    t.click(); await sleep(450);
    if (location.pathname + location.search !== start && !location.search.includes("tab") && !location.search.includes("view")) { F.push({ kind: "tab-navigated", detail: `"${txt(t)}" → ${location.pathname}` }); break; }
    const ctl = t.getAttribute("aria-controls"); const panel = ctl ? document.getElementById(ctl) : null;
    if (ctl && (!panel || !visible(panel))) F.push({ kind: "tab-panel-missing", detail: `"${txt(t)}" controls #${ctl} which is not shown` });
    else if (panel && panel.textContent.trim().length < 2 && !panel.querySelector("img, svg, canvas, input")) F.push({ kind: "tab-panel-empty", detail: `"${txt(t)}"` });
  }
  if (tabs[0]) { tabs[0].click(); await sleep(300); }
  if (agent) return { tabs: tabs.length, triggers: 0, findings: F, opened };
  // 2. safe popup triggers inside the page (header/workspace switcher included: menus only open)
  const cand = Array.from(document.querySelectorAll("button, [role=button], summary")).filter(b => {
    if (!visible(b) || b.disabled || b.getAttribute("aria-disabled") === "true" || b.closest("form button[type=submit]") === b) return false;
    if (b.closest(POP) || b.closest("nextjs-portal")) return false;
    if (b.matches("[role=tab], [role=switch], [role=checkbox], [type=submit]")) return false;
    if (b.tagName === "BUTTON" && b.form && b.type === "submit") return false; // a <button> without a type submits its form (GET filters reload the page)
    const t = txt(b); if (!t || DANGER.test(t)) return false;
    if (/^(new|add|create|invite|export|import|upload|change)\b/i.test(t)) return b.matches("[aria-haspopup], [aria-controls]"); // could act directly: only when it declares a popup
    return b.matches("[aria-haspopup], [aria-expanded], summary") || /^(edit|filter|filters|view|details|more|options|actions|open|preview|share|manage|columns|sort|customise|customize|help|info|show)\b/i.test(t);
  }).slice(0, 30);
  let triggers = 0;
  for (const b of cand) {
    if (!b.isConnected || !visible(b)) continue;
    const before = new Set(pops()); const href = location.href; triggers++;
    b.click(); await sleep(500);
    if (location.href !== href) { opened.push(`${txt(b)} → link`); history.back(); await sleep(900); if (location.href !== href) break; continue; }
    const now = pops().filter(p => !before.has(p) || b.getAttribute("aria-expanded") === "true");
    const isSummary = b.matches("summary");
    if (!now.length) { if (b.matches("[aria-haspopup=dialog], [aria-haspopup=menu], [aria-haspopup=true]") && b.getAttribute("aria-expanded") !== "true") F.push({ kind: "trigger-noop", detail: `"${txt(b)}" opened nothing` }); if (isSummary || b.getAttribute("aria-expanded") === "true") { b.click(); await sleep(200); } continue; }
    for (const m of now.slice(0, 1)) {
      const r = m.getBoundingClientRect(); const s = getComputedStyle(m); const scrolls = /(auto|scroll)/.test(s.overflowY) || m.scrollHeight <= m.clientHeight + 1 || Array.from(m.querySelectorAll("*")).some(k => /(auto|scroll)/.test(getComputedStyle(k).overflowY) && k.scrollHeight > k.clientHeight);
      opened.push(`${txt(b)} → ${m.getAttribute("role") ?? m.tagName.toLowerCase()}`);
      const tr = b.getBoundingClientRect(); const trigOn = tr.left >= -1 && tr.right <= vw + 1; // a trigger inside a horizontally scrolled table opens where it is
      if (trigOn && (r.left < -1 || r.right > vw + 1)) F.push({ kind: "popup-fit", detail: `"${txt(b)}" popup x ${Math.round(r.left)}→${Math.round(r.right)} of ${vw}` });
      if ((r.bottom > vh + 1 || r.top < -1) && !scrolls) F.push({ kind: "popup-fit", detail: `"${txt(b)}" popup y ${Math.round(r.top)}→${Math.round(r.bottom)} of ${vh}, not scrollable` });
      const isDialog = m.matches("[role=dialog], [role=alertdialog], dialog");
      if (isDialog && !m.getAttribute("aria-label") && !m.getAttribute("aria-labelledby")) F.push({ kind: "dialog-unlabelled", detail: `"${txt(b)}"` });
      esc(); await sleep(400);
      if (visible(m) && m.isConnected) {
        const close = m.querySelector("button[aria-label*=close i], button[aria-label*=dismiss i], .gp-sheet-close") ?? Array.from(m.querySelectorAll("button")).find(x => /^(close|cancel|done|×|✕)$/i.test(txt(x)));
        if (isDialog) F.push({ kind: "escape-no-close", detail: `"${txt(b)}" dialog ignores Escape` });
        if (close) { close.click(); await sleep(400); } else if (!isDialog) { b.click(); await sleep(300); }
        if (visible(m) && m.isConnected) { F.push({ kind: "popup-stuck", detail: `"${txt(b)}" popup does not close` }); document.body.click(); await sleep(300); }
      }
    }
  }
  return { tabs: tabs.length, triggers, findings: F, opened };
}
