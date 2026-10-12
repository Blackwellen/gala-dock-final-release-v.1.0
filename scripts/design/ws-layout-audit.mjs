// Layout audit for the Provider / Admin / portal workspaces: opens every manifest route at desktop sizes and flags warping —
// horizontal page scroll, elements sticking out of their card/panel, and clipped content — after the shared --k-zoom scale.
// Usage: node --env-file=.env --env-file=.env.local scripts/design/ws-layout-audit.mjs [provider|admin|portals] [--shots]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { resolveUrl } from "../ws-resolve.mjs";
import { totp } from "../totp.mjs";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3107";
const group = process.argv[2] ?? "provider", shots = process.argv.includes("--shots");
const files = { provider: ["10-provider"], admin: ["20-admin-a", "21-admin-b"], portals: ["30-portals"] }[group] ?? ["10-provider"];
const rows = files.flatMap(f => JSON.parse(fs.readFileSync(`artifacts/visual/ws-manifest/${f}.json`, "utf8")));
const routes = [...new Set(rows.map(r => r.url))];
const out = path.resolve("artifacts/visual/ws-layout"); fs.mkdirSync(out, { recursive: true });
const LOGIN = { provider: ["provider.demo@example.com", process.env.DEMO_PROVIDER_PASSWORD], admin: ["admin.demo@example.com", process.env.DEMO_ADMIN_PASSWORD, process.env.DEMO_ADMIN_TOTP_SECRET] };

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const mobile = process.env.MOBILE === "1";
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(process.env.PWA_AUTH_FIXTURE === "1" ? { storageState: `artifacts/auth/pwa-resume-${group}.json` } : {}) });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 120)));
const who = LOGIN[group];
if (who && process.env.PWA_AUTH_FIXTURE !== "1") {
  await page.goto(`${BASE}/login`); await page.fill('input[name="email"]', who[0]); await page.fill('input[name="password"]', who[1]);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 60000 }), page.click('button[type="submit"]')]);
  if (who[2] && new URL(page.url()).pathname.startsWith("/mfa")) {
    // Six single-digit boxes that auto-advance: focus the first and type the code.
    await page.locator("input").first().click(); await page.keyboard.type(totp(who[2]), { delay: 40 }); await page.keyboard.press("Enter");
    await page.waitForURL(u => !u.pathname.startsWith("/mfa"), { timeout: 30000 }).catch(() => null);
    if (new URL(page.url()).pathname.startsWith("/mfa")) { console.error("MFA did not complete — aborting so results are not for the MFA page."); process.exit(1); }
  }
}

const detect = () => page.evaluate(() => {
  const issues = [], seen = new Set();
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) issues.push(`page scrolls sideways by ${de.scrollWidth - de.clientWidth}px`);
  const root = document.querySelector(".ws-app, .pt-app, .k-root") ?? document.body;
  const main = root.querySelector("main") ?? root;
  const boxy = el => { const c = String(el.className?.baseVal ?? el.className ?? ""); return /(card|panel|-box|tile|kpi|stat|widget|-col\b|section)/i.test(c) || el.tagName === "SECTION" || el.tagName === "ASIDE"; };
  const desc = el => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className ?? "").trim().split(/\s+/).slice(0, 2).join(".")}`;
  for (const el of main.querySelectorAll("*")) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (el.closest("svg")) continue; // SVG content is clipped by its own viewport (map tiles, charts)
    const cs = getComputedStyle(el); if (cs.position === "fixed" || cs.visibility === "hidden") continue;
    // Content in a genuine scroll region is intentionally outside its viewport; retain page-level overflow checks.
    let scrollAncestor = el.parentElement, inScroller = false;
    while (scrollAncestor && scrollAncestor !== main) { if (['auto','scroll'].includes(getComputedStyle(scrollAncestor).overflowX)) { inScroller = true;break; } scrollAncestor = scrollAncestor.parentElement; }
    if (inScroller) continue;
    // Sticks out of its card / panel.
    let p = el.parentElement; while (p && p !== main && !boxy(p)) p = p.parentElement;
    if (p && p !== main) { const pr = p.getBoundingClientRect(); const pcs = getComputedStyle(p);
      if (pcs.overflowX === "visible" && (r.right > pr.right + 3 || r.left < pr.left - 3) && cs.position !== "absolute") { const k = `out:${desc(el)}@${desc(p)}`; if (!seen.has(k)) { seen.add(k); issues.push(`${desc(el)} sticks out of ${desc(p)} by ${Math.round(Math.max(r.right - pr.right, pr.left - r.left))}px`); } } }
    // Clipped content (hidden overflow, no ellipsis, not a scroller).
    if ((cs.overflowX === "hidden" || cs.overflow === "hidden") && el.scrollWidth > el.clientWidth + 4 && cs.textOverflow !== "ellipsis" && el.children.length && !/(img|svg|canvas|video)/i.test(el.tagName)) {
      const k = `clip:${desc(el)}`; if (!seen.has(k)) { seen.add(k); issues.push(`${desc(el)} clips ${el.scrollWidth - el.clientWidth}px of its content`); } }
  }
  return issues.slice(0, 12);
});

const report = [];
for (const size of mobile ? [[320,844],[390,844],[820,360],[1180,820]] : [[1440, 900], [1280, 800]]) {
  await page.setViewportSize({ width: size[0], height: size[1] });
  for (const raw of routes) {
    const url = await resolveUrl(raw); if (url.includes("missing")) { report.push({ size: size.join("x"), route: raw, issues: ["unresolved demo record"] }); continue; }
    const beforeErrors = errors.length;
    const res = await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 120000 }).catch(e => ({ status: () => String(e).slice(0, 60) }));
    await page.waitForTimeout(300);
    const issues = await detect();
    if (res?.status?.() !== 200) issues.push(`HTTP ${res?.status?.()}`);
    if (errors.length > beforeErrors) issues.push(...errors.slice(beforeErrors).map(e => `pageerror: ${e}`));
    let axe = [];
    if (process.env.AXE === "1" && size[0] === 390) { axe = (await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));if(axe.length)issues.push(...axe.map(v=>`axe: ${v.id}`)); }
    const landed = new URL(page.url()).pathname; if (/^\/(login|mfa)/.test(landed)) issues.unshift(`redirected to ${landed}`);
    report.push({ size: size.join("x"), route: raw, resolved:url, status: res?.status?.(), issues, axe });
    if (shots && size[0] === 1440) await page.screenshot({ path: path.join(out, `${raw.replace(/[^a-z0-9]+/gi, "_").slice(0, 80)}.png`) });
    console.log(`${issues.length ? "WARN" : "OK  "} ${size.join("x")} ${raw}${issues.length ? "\n      " + issues.join("\n      ") : ""}`);
  }
}
fs.writeFileSync(path.join(out, `${group}${mobile ? '-mobile' : ''}.json`), JSON.stringify({ report, errors }, null, 2));
const bad = report.filter(r => r.issues.length);
console.log(`\n${report.length - bad.length}/${report.length} route×size clean. Page errors: ${errors.length}`);
await browser.close();
