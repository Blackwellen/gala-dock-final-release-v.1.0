// Component-level visual comparison against a design reference (1:1 at reference density).
// Usage: node --env-file=.env.local scripts/design/compare.mjs <customer|organizer> <path> <reference.png> <name> [--crops=N]
// Outputs artifacts/visual/p2/<name>.{png,red.png,diff.png,components.json} and crops/<name>-<k>.png for the worst N components.
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
const flags = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith("--")).map(a => a.slice(2).split("=")));
const [role, path, ref, name] = args;
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const creds = { customer: ["alex.thompson@example.com", process.env.DEMO_CUSTOMER_PASSWORD], organizer: ["alex.events@example.com", process.env.DEMO_ORGANIZER_PASSWORD] }[role];
const refPng = PNG.sync.read(await fs.readFile(ref)); const W = refPng.width, H = refPng.height;
const OUT = "artifacts/visual/p2"; await fs.mkdir(`${OUT}/crops`, { recursive: true });
const state = `artifacts/visual/state-${role}.json`;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const hasState = await fs.stat(state).then(() => true, () => false);
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: "reduce", ...(hasState ? { storageState: state } : {}) });
// Narrow references (e.g. 1222px) are the 1536 layout scaled down by 0.8: render at the same scale. 1448px references are native size.
const ZOOM = Number(flags.zoom ?? (W < 1300 ? (W / 1536).toFixed(4) : 1));
await ctx.addInitScript(z => { try { localStorage.setItem("gd-density", z === 1 ? "reference" : "scaled"); } catch {} const h = document.documentElement; if (z === 1) h.setAttribute("data-density", "reference"); else { h.setAttribute("data-density", "scaled"); h.style.setProperty("--k-zoom", String(z)); } }, ZOOM);
const page = await ctx.newPage();
await page.goto(BASE + path, { waitUntil: process.env.WAIT ?? "networkidle", timeout: 120000 });
if (new URL(page.url()).pathname.startsWith("/login")) {
  await page.fill('input[name="email"]', creds[0]); await page.fill('input[name="password"]', creds[1]);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 60000 }), page.click('button[type="submit"]')]);
  await ctx.storageState({ path: state }); await page.goto(BASE + path, { waitUntil: process.env.WAIT ?? "networkidle", timeout: 120000 });
}
await page.evaluate(() => document.documentElement.setAttribute("data-density", "reference"));
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: "nextjs-portal{display:none!important}*{animation:none!important;transition:none!important;caret-color:transparent!important}" });
// Re-assert the scaled zoom as a stylesheet: hydration can replace <html>'s inline style, dropping --k-zoom.
if (ZOOM !== 1) await page.addStyleTag({ content: `:root, html[data-density] { --k-zoom: ${ZOOM} !important; }` });
await page.waitForTimeout(Number(flags.settle ?? 500));
const shot = PNG.sync.read(await page.screenshot({ path: `${OUT}/${name}.png` }));
// Components: semantic containers that map to design components.
const SEL = [".o-top", ".o-side", ".c-top", ".k-page-head", ".k-crumbs", ".eh-hero", ".eh-tabs", ".eh-sub", ".k-tabs", ".wz-steps", ".k-card", ".k-kpi", ".ev-kpi", ".k-agent", ".oh-attn-card", ".oh-quick", ".oh-sum", ".ev-card", ".sa-col", ".mc", ".tg", ".c-hero", ".k-table"];
const comps = await page.evaluate(sel => {
  const out = []; const seen = new Set();
  for (const s of sel) for (const el of document.querySelectorAll(s)) {
    if (seen.has(el)) continue; seen.add(el);
    const r = el.getBoundingClientRect(); if (r.width < 40 || r.height < 24 || r.bottom <= 0 || r.top >= innerHeight) continue;
    const label = (el.querySelector("h1,h2,h3,b,.lbl")?.textContent ?? el.className).toString().trim().slice(0, 48);
    out.push({ sel: s, label, x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)), w: Math.round(Math.min(r.width, innerWidth - r.left)), h: Math.round(Math.min(r.height, innerHeight - Math.max(0, r.top))) });
  }
  return out;
}, SEL);
const crop = (png, x, y, w, h) => { const b = Buffer.alloc(w * h * 4); for (let r = 0; r < h; r++) png.data.copy(b, r * w * 4, ((y + r) * W + x) * 4, ((y + r) * W + x + w) * 4); return b; };
const diff = new PNG({ width: W, height: H });
const total = pixelmatch(refPng.data, shot.data, diff.data, W, H, { threshold: 0.12, includeAA: false });
await fs.writeFile(`${OUT}/${name}.diff.png`, PNG.sync.write(diff));
// Red onion overlay: reference ink → cyan, our ink → red, both → dark.
const red = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) {
  const o = i * 4, lr = (refPng.data[o] * .3 + refPng.data[o + 1] * .59 + refPng.data[o + 2] * .11), ls = (shot.data[o] * .3 + shot.data[o + 1] * .59 + shot.data[o + 2] * .11);
  const ar = Math.max(0, 255 - lr) / 255, as = Math.max(0, 255 - ls) / 255;
  red.data[o] = Math.round(255 * (1 - ar)); red.data[o + 1] = Math.round(255 * (1 - Math.max(ar, as))); red.data[o + 2] = Math.round(255 * (1 - as)); red.data[o + 3] = 255;
}
await fs.writeFile(`${OUT}/${name}.red.png`, PNG.sync.write(red));
const scored = comps.map(c => { const n = pixelmatch(crop(refPng, c.x, c.y, c.w, c.h), crop(shot, c.x, c.y, c.w, c.h), null, c.w, c.h, { threshold: 0.12, includeAA: false }); return { ...c, mismatch: +((100 * n) / (c.w * c.h)).toFixed(1) }; }).sort((a, b) => b.mismatch - a.mismatch);
const N = Number(flags.crops ?? 6);
for (const [k, c] of scored.slice(0, N).entries()) { const png = new PNG({ width: c.w, height: c.h }); png.data = crop(red, c.x, c.y, c.w, c.h); await fs.writeFile(`${OUT}/crops/${name}-${k}.png`, PNG.sync.write(png)); }
const report = { name, path, page: +((100 * total) / (W * H)).toFixed(2), components: scored };
await fs.writeFile(`${OUT}/${name}.components.json`, JSON.stringify(report, null, 1));
console.log(`${name}: page ${report.page}% | worst: ` + scored.slice(0, 8).map(c => `${c.sel}[${c.label.slice(0, 22)}] ${c.mismatch}%`).join(" · "));
await browser.close();
