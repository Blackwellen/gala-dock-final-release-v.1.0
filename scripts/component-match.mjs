// Per-component registration against a reference: for each visible component box in the live page,
// finds where that crop best matches in the reference (normalised cross-correlation within ±R px).
// Usage: node scripts/component-match.mjs <url> <reference.png> <width> <height> [selector list]
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
const [url, refFile, W, H, sel] = process.argv.slice(2);
const width = +W, height = +H, R = 60;
const selectors = sel ?? ".setup-form h2,.setup-subtitle,.setup-form h3,.setup-form .field>label,.setup-form input,.setup-form select,.setup-form textarea,.choice,.setup-panel,.setup-assistant h3,.setup-assistant h4,.setup-assistant .button,.setup-actions .button,.setup-story h1,.setup-story-description,.setup-features>div,.auth-card h2,.auth-card .auth-description,.auth-card .auth-field>div,.auth-card .button,.return-banner,.auth-security";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
await page.goto(`http://localhost:3107${url}`, { waitUntil: "networkidle" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}*{animation:none!important;transition:none!important}" });
await page.evaluate(() => document.fonts.ready);
const shot = PNG.sync.read(await page.screenshot());
const boxes = await page.evaluate(s => [...document.querySelectorAll(s)].map(e => { const b = e.getBoundingClientRect(); const label = (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().replace(/\s+/g, " ").slice(0, 34); return { label: `${e.tagName.toLowerCase()}.${(e.className && typeof e.className === "string" ? e.className.split(" ")[0] : "")} ${label}`, x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; })
  .filter(b => b.w >= 12 && b.h >= 8 && b.y >= 0 && b.y + b.h <= innerHeight && b.x >= 0 && b.x + b.w <= innerWidth), selectors);
const ref = PNG.sync.read(fs.readFileSync(refFile));
const gray = (png, x, y) => { const i = (y * png.width + x) * 4; return 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2]; };
const out = [];
for (const b of boxes) {
  const w = Math.min(b.w, 360), h = Math.min(b.h, 120), step = w * h > 20000 ? 2 : 1;
  const tpl = []; for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) tpl.push(gray(shot, b.x + x, b.y + y));
  const mean = tpl.reduce((a, v) => a + v, 0) / tpl.length; const tv = tpl.map(v => v - mean); const tn = Math.sqrt(tv.reduce((a, v) => a + v * v, 0));
  if (tn < 200) continue; // flat region: cannot register
  let best = { s: -2, dx: 0, dy: 0 };
  for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
    const ox = b.x + dx, oy = b.y + dy; if (ox < 0 || oy < 0 || ox + w > ref.width || oy + h > ref.height) continue;
    let sum = 0, sq = 0, k = 0; const vals = [];
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) { const v = gray(ref, ox + x, oy + y); vals.push(v); sum += v; }
    const m = sum / vals.length; let num = 0; for (const v of vals) { const d = v - m; num += d * tv[k++]; sq += d * d; }
    const s = num / (Math.sqrt(sq) * tn + 1e-6); if (s > best.s) best = { s, dx, dy };
  }
  out.push({ ...b, dx: best.dx, dy: best.dy, score: +best.s.toFixed(2) });
}
for (const o of out) console.log(`${String(o.dx).padStart(4)} ${String(o.dy).padStart(4)}  ncc ${o.score.toFixed(2)}  @${o.x},${o.y} ${o.w}x${o.h}  ${o.label}`);
await browser.close();
