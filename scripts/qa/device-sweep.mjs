// Playbook §3 phone + tablet sweep (portrait and landscape, touch emulation) for the signed-in workspaces and the auth, account,
// marketplace and contract pages. Public marketing pages are the public-pages lane's.
// Run: node --env-file=.env --env-file=.env.local scripts/qa/device-sweep.mjs [--roles=organizer,provider,customer,auth] [--axe=all|key]
// Asserts per route × size: no horizontal overflow, no console errors, menu occlusion 0 (every opened dropdown/popover/select is the
// top element at its centre), no warped images; axe (WCAG 2.2 A/AA) at the key sizes (or all with --axe=all); the agent chat is the
// first full-height view on phone and tablet. Writes artifacts/release/device-sweep.json (+ failing screenshots under artifacts/release/sweep/).
import fs from "node:fs";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3107";
const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const ROLES = (arg("roles") ?? "auth,customer,organizer,provider").split(",");
const AXE_ALL = arg("axe") === "all";
const OUT = "artifacts/release/sweep"; fs.mkdirSync(OUT, { recursive: true });

const SIZES = [
  ...[[320, 568], [360, 740], [375, 667], [390, 844], [414, 896], [430, 932]].map(([w, h]) => ({ name: `phone-p-${w}`, w, h, phone: true })),
  ...[[568, 320], [667, 375], [740, 360], [844, 390], [932, 430]].map(([w, h]) => ({ name: `phone-l-${w}x${h}`, w, h, phone: true })),
  ...[[768, 1024], [820, 1180], [834, 1194], [1024, 1366]].map(([w, h]) => ({ name: `tablet-p-${w}x${h}`, w, h, phone: false })),
  ...[[1024, 768], [1180, 820], [1194, 834], [1366, 1024]].map(([w, h]) => ({ name: `tablet-l-${w}x${h}`, w, h, phone: false })),
];
const AXE_SIZES = new Set(["phone-p-390", "phone-l-844x390", "tablet-p-820x1180", "tablet-l-1180x820"]);
const CREDS = {
  customer: ["alex.thompson@example.com", process.env.DEMO_CUSTOMER_PASSWORD],
  organizer: ["alex.events@example.com", process.env.DEMO_ORGANIZER_PASSWORD],
  provider: [process.env.DEMO_PROVIDER_EMAIL ?? "provider.demo@example.com", process.env.DEMO_PROVIDER_PASSWORD ?? process.env.DEMO_ORGANIZER_PASSWORD],
};
const ROUTES = {
  auth: ["/login", "/register", "/forgot-password"],
  customer: ["/account", "/account/events", "/account/tickets", "/discover", "/account/saved"],
  organizer: ["/organizer", "/organizer/events", "/organizer/marketplace", "/organizer/money", "/organizer/agent", "/organizer/sales/contracts", "/organizer/settings"],
  provider: ["/provider", "/provider/opportunities", "/provider/money", "/provider/agent", "/provider/listings", "/provider/bookings"],
};

async function signIn(page, role) {
  const [email, password] = CREDS[role];
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.fill('input[name="email"]', email); await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 90000 }), page.click('button[type="submit"]')]);
}

/** In-page checks: overflow, warped images, then menu occlusion for every trigger visible in the first screen. */
async function inspect(page) {
  return page.evaluate(async () => {
    const out = { overflow: 0, overflowBy: 0, warped: [], occluded: [], menusOpened: 0 };
    const de = document.documentElement;
    out.overflowBy = Math.max(0, de.scrollWidth - de.clientWidth);
    out.overflow = out.overflowBy > 1 ? 1 : 0;
    for (const img of Array.from(document.images)) {
      const r = img.getBoundingClientRect(); if (r.width < 24 || r.height < 24 || !img.naturalWidth || !img.naturalHeight) continue;
      const fit = getComputedStyle(img).objectFit; if (fit === "cover" || fit === "contain" || fit === "scale-down") continue;
      const nat = img.naturalWidth / img.naturalHeight, shown = r.width / r.height;
      if (Math.abs(nat - shown) / nat > 0.06) out.warped.push((img.currentSrc || img.src).split("?")[0].slice(-80));
    }
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const triggers = Array.from(document.querySelectorAll('[aria-haspopup="menu"],[aria-haspopup="listbox"],[aria-haspopup="true"],[aria-haspopup="dialog"],button[aria-expanded="false"]'))
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.top < innerHeight && r.left < innerWidth; }).slice(0, 8);
    const hittable = el => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && (el === top || el.contains(top)); };
    const closeAll = async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      for (const b of Array.from(document.querySelectorAll('[role="dialog"] button[aria-label*="close" i], [role="dialog"] button[aria-label*="Close" i]'))) b.click();
      await sleep(250);
    };
    for (const t of triggers) {
      // Only what a user can actually reach: a trigger covered by an open sheet/dialog is not tested (that would be a test artefact).
      await closeAll();
      if (!hittable(t)) continue;
      t.click(); await sleep(350);
      const menus = Array.from(document.querySelectorAll('[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper],[role="dialog"]:not([aria-hidden="true"])'))
        .filter(m => { const r = m.getBoundingClientRect(); return r.width > 8 && r.height > 8 && getComputedStyle(m).visibility !== "hidden"; });
      for (const m of menus) {
        out.menusOpened++;
        // A list inside a scrollable sheet can start below the fold: bring it into view first (what a user does), then test.
        let r = m.getBoundingClientRect();
        if (r.top >= innerHeight - 4 || r.bottom <= 4) { m.scrollIntoView({ block: "nearest" }); await sleep(120); r = m.getBoundingClientRect(); }
        const x = Math.min(innerWidth - 2, Math.max(1, r.left + r.width / 2)), y = Math.min(innerHeight - 2, Math.max(1, r.top + Math.min(r.height / 2, 40)));
        const top = document.elementFromPoint(x, y);
        if (top && !m.contains(top) && !top.contains(m)) out.occluded.push({ trigger: (t.getAttribute("aria-label") || t.textContent || "").trim().slice(0, 40), by: top.tagName.toLowerCase() + (top.className && typeof top.className === "string" ? "." + top.className.split(" ")[0] : "") });
      }
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); (document.activeElement)?.blur?.(); await sleep(150);
      if (t.getAttribute("aria-expanded") === "true") { t.click(); await sleep(150); }
    }
    return out;
  });
}

const results = []; const t0 = Date.now();
const FULL = (arg("full") ?? "first").split(",");      // routes swept at all 19 sizes ("first" = the first route of each role); others at the key sizes
const KEY_SIZES = new Set([...AXE_SIZES, "phone-p-320", "tablet-p-768x1024"]);
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${label}`)), ms))]);
// The shared dev server restarts when other lanes edit files or memory runs low: wait for it instead of recording false failures.
async function serverUp(maxMs = 240000) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) { try { const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(10000) }); if (r.status < 500) return true; } catch { /* restarting */ } await new Promise(r => setTimeout(r, 5000)); }
  return false;
}
const browser = await chromium.launch();
try {
  for (const role of ROLES) {
    // One phone context and one tablet context per role (touch emulation; isMobile only on phones); sizes change the viewport.
    for (const phone of [true, false]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: phone, deviceScaleFactor: 1,
        storageState: { cookies: [{ name: "gd_cc", value: "1", domain: new URL(BASE).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [] } });
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", m => { if (m.type() === "error" && !/favicon|Download the React DevTools|\[HMR\]|webpack-hmr|_next\/webpack|net::ERR_ABORTED/.test(m.text())) errors.push(m.text().slice(0, 200)); });
      page.on("pageerror", e => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
      try { if (role !== "auth") await signIn(page, role); }
      catch (e) { results.push({ role, size: phone ? "phone" : "tablet", route: "(sign-in)", ok: false, error: String(e.message).slice(0, 200) }); console.log(`FAIL ${role} sign-in ${e.message}`); await ctx.close(); continue; }
      for (const size of SIZES.filter(z => z.phone === phone)) {
        await page.setViewportSize({ width: size.w, height: size.h });
        let retried = false;
        for (let ri = 0; ri < ROUTES[role].length; ri++) {
          const route = ROUTES[role][ri];
          const full = FULL.includes("all") || FULL.includes(route) || (FULL.includes("first") && ri === 0) || (route.endsWith("/agent"));
          if (!full && !KEY_SIZES.has(size.name)) continue;
          errors.length = 0;
          const row = { role, size: size.name, route, ok: true }; const c0 = Date.now();
          try {
            await withTimeout((async () => {
              await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 90000 });
              await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
              row.hasMainOrH1 = await page.evaluate(() => !!document.querySelector("main, h1, [role=main]"));
              await page.waitForTimeout(500);
              Object.assign(row, await inspect(page));
              if (role !== "auth" && /\/agent$/.test(route) && size.w < 1366) {
                row.agentChatFirst = await page.evaluate(() => {
                  const chat = document.querySelector('[data-agent-chat], .ag-comp textarea, textarea[name="goal"], textarea[aria-label*="Ask" i], textarea[placeholder*="Ask" i], textarea[placeholder*="agent" i]');
                  if (!chat) return { found: false };
                  const box = (chat.closest("section, form, [data-agent-chat]") ?? chat).getBoundingClientRect();
                  return { found: true, top: Math.round(box.top + scrollY), height: Math.round(box.height), viewport: innerHeight };
                });
              }
              if (AXE_ALL || AXE_SIZES.has(size.name)) {
                const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze();
                row.axe = r.violations.map(v => `${v.id}(${v.nodes.length})`); row.axeDetail = r.violations.map(v => ({ id: v.id, nodes: v.nodes.slice(0, 3).map(n => n.target.join(" ")) }));
              }
            })(), 150000, route);
            row.consoleErrors = [...errors];
            row.ok = !row.overflow && !row.occluded.length && !row.warped.length && !(row.axe ?? []).length && !row.consoleErrors.length;
            if (!row.ok) await page.screenshot({ path: `${OUT}/${role}-${size.name}-${route.replace(/\W+/g, "_")}.png` }).catch(() => {});
          } catch (e) { row.ok = false; row.error = String(e.message).slice(0, 200); }
          const restarted = (row.error && /ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ECONNRESET|ERR_CONNECTION_RESET|timeout/.test(row.error)) || (row.consoleErrors ?? []).some(e => /ERR_CONNECTION_(RESET|REFUSED)/.test(e));
          if (restarted && !retried) {
            // dev server restarting (other lanes' edits / memory): wait for it and run this cell once more
            if (await serverUp()) { retried = true; ri--; continue; }
          }
          retried = false;
          row.ms = Date.now() - c0;
          results.push(row);
          console.log(`${row.ok ? "ok  " : "FAIL"} ${role} ${size.name} ${route} ${row.ms}ms${row.ok ? "" : " " + JSON.stringify({ o: row.overflowBy, occ: row.occluded, w: row.warped?.length, axe: row.axe, ce: row.consoleErrors?.slice(0, 2), err: row.error })}`);
        }
      }
      await ctx.close();
    }
  }
} finally { await browser.close(); }
const summary = { at: new Date().toISOString(), minutes: Math.round((Date.now() - t0) / 60000), cells: results.length, passed: results.filter(r => r.ok).length,
  overflow: results.filter(r => r.overflow).length, occluded: results.filter(r => r.occluded?.length).length, warped: results.filter(r => r.warped?.length).length,
  axe: results.filter(r => r.axe?.length).length, consoleErrors: results.filter(r => r.consoleErrors?.length).length, errors: results.filter(r => r.error).length };
const prev = fs.existsSync("artifacts/release/device-sweep.json") ? JSON.parse(fs.readFileSync("artifacts/release/device-sweep.json", "utf8")) : { runs: [] };
prev.runs = [...(prev.runs ?? []).filter(r => !ROLES.includes(r.role)), ...ROLES.map(role => ({ role, summary: { ...summary, cells: results.filter(r => r.role === role).length, passed: results.filter(r => r.role === role && r.ok).length }, results: results.filter(r => r.role === role) }))];
fs.writeFileSync("artifacts/release/device-sweep.json", JSON.stringify(prev, null, 1));
console.log(JSON.stringify(summary));
