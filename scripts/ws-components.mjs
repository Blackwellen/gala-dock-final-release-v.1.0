// Component-level visual comparison: design crop vs live element crop, with red diff, per component.
// Usage: node --env-file=.env --env-file=.env.local scripts/ws-components.mjs <spec-name> [component-substring...]
// Spec: artifacts/visual/ws-components/<name>.json =
//   { "url": "/provider", "who": "provider", "design": "Designs/...png", "components": [
//       { "name": "kpi-1", "selector": ".ph-kpis .ws-kpi", "index": 0, "box": [x, y, w, h] } ] }
// "box" is the component's rectangle on the reference design. The live element is captured at reference density (1:1),
// resampled to the box size, and compared with pixelmatch (threshold .1, AA ignored).
// Output: artifacts/visual/ws-components/out/<name>/<component>.png (design | render | diff) and report.json.
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { resolveUrl } from "./ws-resolve.mjs";

const [name, ...only] = process.argv.slice(2);
const spec = JSON.parse(await fs.readFile(`artifacts/visual/ws-components/${name}.json`, "utf8"));
const outDir = `artifacts/visual/ws-components/out/${name}`;
await fs.mkdir(outDir, { recursive: true });
const ref = PNG.sync.read(await fs.readFile(spec.design));

function crop(png, x, y, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const sx = Math.min(png.width - 1, Math.max(0, x + i)), sy = Math.min(png.height - 1, Math.max(0, y + j));
    const s = (sy * png.width + sx) * 4, d = (j * w + i) * 4;
    for (let c = 0; c < 4; c++) out.data[d + c] = png.data[s + c];
  }
  return out;
}
/** Bilinear resample to an exact size (aligns component geometry before comparing). */
function resize(png, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const fx = ((i + 0.5) * png.width) / w - 0.5, fy = ((j + 0.5) * png.height) / h - 0.5;
    const x0 = Math.max(0, Math.floor(fx)), y0 = Math.max(0, Math.floor(fy)), x1 = Math.min(png.width - 1, x0 + 1), y1 = Math.min(png.height - 1, y0 + 1);
    const ax = Math.min(1, Math.max(0, fx - x0)), ay = Math.min(1, Math.max(0, fy - y0));
    for (let c = 0; c < 4; c++) {
      const p = (x, y) => png.data[(y * png.width + x) * 4 + c];
      out.data[(j * w + i) * 4 + c] = Math.round((p(x0, y0) * (1 - ax) + p(x1, y0) * ax) * (1 - ay) + (p(x0, y1) * (1 - ax) + p(x1, y1) * ax) * ay);
    }
  }
  return out;
}
function sideBySide(a, b, diff) {
  const gap = 8, w = a.width * 3 + gap * 2, h = a.height;
  const out = new PNG({ width: w, height: h });
  out.data.fill(255);
  for (const [img, off] of [[a, 0], [b, a.width + gap], [diff, (a.width + gap) * 2]]) for (let j = 0; j < h; j++) img.data.copy(out.data, (j * w + off) * 4, j * img.width * 4, (j + 1) * img.width * 4);
  return out;
}

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const report = [];
try {
  const ctx = await browser.newContext({ viewport: { width: ref.width, height: ref.height }, deviceScaleFactor: 1, reducedMotion: "reduce",
    storageState: spec.who ? `artifacts/auth/${spec.who}.json` : undefined, timezoneId: "Europe/London", locale: "en-GB" });
  await ctx.addInitScript(() => { try { localStorage.setItem("gd-density", "reference"); } catch {} });
  const page = await ctx.newPage();
  await page.goto((process.env.BASE_URL ?? "http://localhost:3107") + await resolveUrl(spec.url), { waitUntil: "load", timeout: 180000 });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal,.ws-overlay-ctl{display:none!important}*{animation:none!important;transition:none!important}" });
  await page.waitForTimeout(500);
  const shot = PNG.sync.read(await page.screenshot());
  for (const c of spec.components.filter(c => !only.length || only.some(o => c.name.includes(o)))) {
    const [x, y, w, h] = c.box;
    const el = page.locator(c.selector).nth(c.index ?? 0);
    const bb = await el.boundingBox().catch(() => null);
    if (!bb) { report.push({ name: c.name, error: "element not found" }); console.log(`${c.name.padEnd(28)} element not found (${c.selector})`); continue; }
    const live = crop(shot, Math.round(bb.x), Math.round(bb.y), Math.round(bb.width), Math.round(bb.height));
    const a = crop(ref, x, y, w, h), b = resize(live, w, h);
    const diff = new PNG({ width: w, height: h });
    const n = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.1, includeAA: false, diffColor: [255, 0, 0], alpha: 0.25 });
    const pct = +(100 * n / (w * h)).toFixed(2);
    const geo = { designW: w, designH: h, liveW: Math.round(bb.width), liveH: Math.round(bb.height), dx: Math.round(bb.x) - x, dy: Math.round(bb.y) - y };
    await fs.writeFile(`${outDir}/${c.name}.png`, PNG.sync.write(sideBySide(a, b, diff)));
    report.push({ name: c.name, diff: pct, ...geo });
    console.log(`${c.name.padEnd(28)} diff ${String(pct).padStart(6)}%  size ${geo.liveW}×${geo.liveH} vs ${w}×${h}  offset ${geo.dx},${geo.dy}${pct > 9 ? "  ✗" : "  ✓"}`);
  }
} finally {
  await browser.close();
  await fs.writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2));
}
