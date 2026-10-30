// Captures routes × viewports for one role at the real default display scale (no data-density override), and records shell
// geometry so layout drift (top bar, content gutters, overflow) can be checked without eyeballing.
// Usage: node --env-file=.env.local scripts/design/capture-matrix.mjs <customer|organizer|provider|admin> <out-dir> <WxH,WxH> <route> [route…]
// Role "public" captures signed out (no credentials, no stored session; a redirect to /login is recorded, not followed).
// Env: BASE_URL (default http://localhost:3107), DENSITY (optional data-density value, e.g. reference), FULL_PAGE=1 for full-page shots.
// CDP_URL (e.g. http://127.0.0.1:9222): attach to a Chrome the tester signed into by hand (login is behind Turnstile, which
// rejects automation-flagged browsers). The tester's session is reused as-is; nothing here signs in or touches the captcha.
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";

const [role, outDir, sizes, ...routes] = process.argv.slice(2);
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const creds = {
  customer: ["alex.thompson@example.com", process.env.DEMO_CUSTOMER_PASSWORD],
  organizer: ["alex.events@example.com", process.env.DEMO_ORGANIZER_PASSWORD],
  provider: [process.env.DEMO_PROVIDER_EMAIL ?? "riverside.venue@example.com", process.env.DEMO_PROVIDER_PASSWORD ?? process.env.DEMO_ORGANIZER_PASSWORD],
  admin: [process.env.DEMO_ADMIN_EMAIL ?? "admin@galadock.com", process.env.DEMO_ADMIN_PASSWORD],
  public: ["", "signed-out"],
}[role];
const PUBLIC = role === "public";
const CDP = process.env.CDP_URL;
if ((!CDP && !creds?.[1]) || !outDir || !sizes || !routes.length) { console.error("usage: capture-matrix.mjs <role> <out-dir> <WxH,…> <route…> (and demo credentials in env)"); process.exit(1); }
await fs.mkdir(outDir, { recursive: true });
const state = `${outDir}/.state-${role}.json`;
const browser = CDP ? await chromium.connectOverCDP(CDP) : await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

async function signIn(page, ctx) {
  if (CDP) throw new Error(`Not signed in as ${role} in the attached Chrome — sign in there by hand, then rerun.`);
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 60000 }); // enabled once hydrated
  await page.fill('input[name="email"]', creds[0]);
  await page.fill('input[name="password"]', creds[1]);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 60000 }), page.click('button[type="submit"]')]).catch(async e => {
    await page.screenshot({ path: `${outDir}/login-failure.png` });
    throw new Error(`Sign-in did not leave /login (see ${outDir}/login-failure.png): ${(await page.locator('[role="alert"], .auth-error, .field-error').allInnerTexts()).join(" | ") || e.message}`);
  });
  await ctx.storageState({ path: state });
}

const results = [];
for (const size of sizes.split(",")) {
  const [width, height] = size.split("x").map(Number);
  const hasState = !PUBLIC && await fs.stat(state).then(() => true, () => false);
  const ctx = CDP ? browser.contexts()[0] : await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", ...(hasState ? { storageState: state } : {}) });
  const page = await ctx.newPage();
  if (CDP) { await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: "reduce" }); }
  for (const route of routes) {
    const errors = [];
    page.removeAllListeners("pageerror"); page.removeAllListeners("console");
    page.on("pageerror", e => errors.push(e.message.slice(0, 300)));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
    await page.goto(BASE + route, { waitUntil: "load", timeout: 180000 }).then(() => page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {}));
    if (!PUBLIC && new URL(page.url()).pathname.startsWith("/login")) { await signIn(page, ctx); await page.goto(BASE + route, { waitUntil: "load", timeout: 180000 }).then(() => page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {})); }
    await page.evaluate(() => document.fonts.ready);
    if (process.env.DENSITY) await page.evaluate(d => document.documentElement.setAttribute("data-density", d), process.env.DENSITY);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}*{animation:none!important;transition:none!important;caret-color:transparent!important}" });
    await page.waitForTimeout(300);
    const name = `${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root"}-${width}x${height}`;
    await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: process.env.FULL_PAGE === "1" });
    const geometry = await page.evaluate(() => {
      const box = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const root = document.querySelector(".c-root, .o-root, .ws-app, .pt-app");
      return {
        url: location.pathname + location.search, zoom: root ? getComputedStyle(root).zoom : null,
        overflowX: document.documentElement.scrollWidth > innerWidth, scrollWidth: document.documentElement.scrollWidth,
        top: box(".c-top, .o-top, .ws-top, .pt-top"), logo: box(".c-logo"), search: box(".c-search, .o-search"), nav: box(".c-nav"), icons: box(".c-icons"),
        main: box("main"), firstChild: box("main > *"),
      };
    });
    results.push({ role, route, width, height, name, geometry, errors });
    console.log(JSON.stringify({ name, zoom: geometry.zoom, overflowX: geometry.overflowX, top: geometry.top, nav: geometry.nav, icons: geometry.icons, firstChild: geometry.firstChild, errors: errors.length }));
  }
  if (CDP) await page.close(); else await ctx.close();
}
await fs.writeFile(`${outDir}/geometry.json`, JSON.stringify(results, null, 2));
if (!CDP) await browser.close();
