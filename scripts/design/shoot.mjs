// Visual check: logs in through the real /login form, screenshots a route, and compares against a reference.
// Usage: node --env-file=.env.local scripts/design/shoot.mjs <role customer|organizer> <path> [reference.png] [name] [width] [height]
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const [role, path, ref, name = path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home", W, H] = process.argv.slice(2);
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const creds = { customer: ["alex.thompson@example.com", process.env.DEMO_CUSTOMER_PASSWORD], organizer: ["alex.events@example.com", process.env.DEMO_ORGANIZER_PASSWORD] }[role];
if (!creds?.[1]) { console.error("Missing demo credentials for", role); process.exit(1); }
const state = process.env.PWA_AUTH_STATE ?? `artifacts/visual/state-${role}.json`;
await fs.mkdir("artifacts/visual/p2", { recursive: true });
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
let refPng = null;
if (ref) refPng = PNG.sync.read(await fs.readFile(ref));
const dpr = Number(process.env.VIEWPORT_DPR) || 1;
const width = Number(W) || refPng?.width || 1536, height = Number(H) || refPng?.height || 1024;
async function context() {
  const exists = await fs.stat(state).then(() => true, () => false);
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, reducedMotion: "reduce", ...(exists ? { storageState: state } : {}) });
  return ctx;
}
let ctx = await context();
let page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 120000 });
if (new URL(page.url()).pathname.startsWith("/login")) {
  await page.fill('input[name="email"]', creds[0]);
  await page.fill('input[name="password"]', creds[1]);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 60000 }), page.click('button[type="submit"]')]);
  await ctx.storageState({ path: state });
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 120000 });
}
await page.evaluate(() => document.fonts.ready);
await page.evaluate(d => document.documentElement.setAttribute("data-density", d), process.env.DENSITY || "reference");
await page.addStyleTag({ content: "nextjs-portal{display:none!important}*{animation:none!important;transition:none!important;caret-color:transparent!important}" });
await page.waitForTimeout(400);
const shotPath = `artifacts/visual/p2/${name}.png`;
const buf = await page.screenshot({ path: shotPath });
const geometry = await page.evaluate(() => ({ url: location.pathname + location.search, scrollWidth: document.documentElement.scrollWidth, innerWidth, scrollHeight: document.documentElement.scrollHeight, overflowX: document.documentElement.scrollWidth > innerWidth }));
geometry.shell = await page.evaluate(() => ({scrollY,top:document.querySelector('.pwa-top')?.getBoundingClientRect().toJSON(),topDisplay:document.querySelector('.pwa-top')&&getComputedStyle(document.querySelector('.pwa-top')).display,nav:document.querySelector('.pwa-tabs')?.getBoundingClientRect().toJSON()}));
const out = { name, path, width, height, dpr, geometry, errors };
if (refPng && refPng.width === width * dpr && refPng.height === height * dpr) {
  const shot = PNG.sync.read(buf);
  const pixelWidth = refPng.width, pixelHeight = refPng.height;
  const diff = new PNG({ width: pixelWidth, height: pixelHeight }); const overlay = new PNG({ width: pixelWidth, height: pixelHeight });
  const n = pixelmatch(refPng.data, shot.data, diff.data, pixelWidth, pixelHeight, { threshold: 0.12, includeAA: false });
  for (let i = 0; i < overlay.data.length; i++) overlay.data[i] = i % 4 === 3 ? 255 : Math.round((refPng.data[i] + shot.data[i]) / 2);
  await fs.writeFile(`artifacts/visual/p2/${name}.diff.png`, PNG.sync.write(diff));
  await fs.writeFile(`artifacts/visual/p2/${name}.overlay.png`, PNG.sync.write(overlay));
  out.mismatchPercent = +((100 * n) / (pixelWidth * pixelHeight)).toFixed(2);
}
console.log(JSON.stringify(out));
await browser.close();
