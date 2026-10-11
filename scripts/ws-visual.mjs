// Visual comparison for Provider/Admin/portal screens against their reference designs.
// Usage: node --env-file=.env --env-file=.env.local scripts/ws-visual.mjs [key-substring ...]
// Reads artifacts/visual/ws-manifest/*.json: [{ key, url, file, who: "provider"|"admin"|"support"|null, width?, height?, mask?: [[x,y,w,h]] }]
// Writes artifacts/visual/ws/{screens,overlays,diffs}/<key>.png and artifacts/visual/ws/report.json.
// Requires storage states from scripts/ws-auth.mjs. Masked regions (documented per entry) are excluded from both metrics.
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { resolveUrl } from "./ws-resolve.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3107";
// One manifest file per screen group (artifacts/visual/ws-manifest/*.json) so groups can be edited independently.
const mdir = "artifacts/visual/ws-manifest";
await fs.mkdir(mdir, { recursive: true });
const manifest = (await Promise.all((await fs.readdir(mdir)).filter(f => f.endsWith(".json")).map(async f => JSON.parse(await fs.readFile(`${mdir}/${f}`, "utf8"))))).flat();
const only = process.argv.slice(2);
const out = "artifacts/visual/ws";
for (const d of ["screens", "overlays", "diffs", "results"]) await fs.mkdir(`${out}/${d}`, { recursive: true });

function grey(png) {
  const g = new Float64Array(png.width * png.height);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * png.data[i * 4] + 0.587 * png.data[i * 4 + 1] + 0.114 * png.data[i * 4 + 2];
  return g;
}
/** Mean SSIM over 8×8 windows (stride 4) on luminance. */
function ssim(a, b, w, h) {
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  let total = 0, n = 0;
  for (let y = 0; y + 8 <= h; y += 4) for (let x = 0; x + 8 <= w; x += 4) {
    let ma = 0, mb = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const k = (y + j) * w + x + i; ma += a[k]; mb += b[k]; }
    ma /= 64; mb /= 64;
    let va = 0, vb = 0, cov = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const k = (y + j) * w + x + i; const da = a[k] - ma, db = b[k] - mb; va += da * da; vb += db * db; cov += da * db; }
    va /= 63; vb /= 63; cov /= 63;
    total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); n++;
  }
  return total / n;
}
function applyMask(png, masks) {
  for (const [mx, my, mw, mh] of masks ?? []) for (let y = my; y < Math.min(png.height, my + mh); y++) for (let x = mx; x < Math.min(png.width, mx + mw); x++) {
    const k = (y * png.width + x) * 4; png.data[k] = png.data[k + 1] = png.data[k + 2] = 128; png.data[k + 3] = 255;
  }
}

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  for (const row of manifest.filter(r => !only.length || only.some(s => r.key.includes(s)))) {
    const ref = PNG.sync.read(await fs.readFile(row.file));
    const width = row.width ?? ref.width, height = row.height ?? ref.height;
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce",
      storageState: row.who ? `artifacts/auth/${row.who}.json` : undefined, timezoneId: "Europe/London", locale: "en-GB" });
    await ctx.addInitScript(() => { try { localStorage.setItem("gd-density", "reference"); } catch {} });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    const res = await page.goto(BASE + await resolveUrl(row.url), { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForLoadState("load").catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 30000 }).catch(() => {});
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
    await page.waitForTimeout(400);
    const shot = PNG.sync.read(await page.screenshot({ animations: "disabled" }));
    await fs.writeFile(`${out}/screens/${row.key}.png`, PNG.sync.write(shot));
    const a = ref.width === width && ref.height === height ? ref : null;
    if (!a) { console.log(row.key, "reference size differs from viewport; skipped metrics"); continue; }
    applyMask(a, row.mask); applyMask(shot, row.mask);
    const diff = new PNG({ width, height }), overlay = new PNG({ width, height });
    const mismatched = pixelmatch(a.data, shot.data, diff.data, width, height, { threshold: 0.1, includeAA: false });
    for (let i = 0; i < overlay.data.length; i++) overlay.data[i] = i % 4 === 3 ? 255 : Math.round((a.data[i] + shot.data[i]) / 2);
    await fs.writeFile(`${out}/diffs/${row.key}.png`, PNG.sync.write(diff));
    await fs.writeFile(`${out}/overlays/${row.key}.png`, PNG.sync.write(overlay));
    const geometry = await page.evaluate(() => ({ overflowX: document.documentElement.scrollWidth > innerWidth, scrollHeight: document.documentElement.scrollHeight }));
    const result = { key: row.key, url: row.url, file: row.file, status: res?.status(), mismatchPercent: +(100 * mismatched / (width * height)).toFixed(2),
      ssim: +ssim(grey(a), grey(shot), width, height).toFixed(4), masks: row.mask ?? [], maskReason: row.maskReason ?? null, geometry, errors, at: new Date().toISOString() };
    await fs.writeFile(`${out}/results/${row.key}.json`, JSON.stringify(result, null, 2));
    console.log(`${row.key.padEnd(34)} ${String(result.status).padEnd(4)} diff ${String(result.mismatchPercent).padStart(6)}%  ssim ${result.ssim}${errors.length ? "  ERRORS: " + errors.join(" | ").slice(0, 200) : ""}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  // Per-screen result files avoid races between concurrent runs; the aggregate is rebuilt from them.
  const files = await fs.readdir(`${out}/results`);
  const all = await Promise.all(files.filter(f => f.endsWith(".json")).map(async f => JSON.parse(await fs.readFile(`${out}/results/${f}`, "utf8"))));
  await fs.writeFile(`${out}/report.json`, JSON.stringify(all.sort((x, y) => x.key.localeCompare(y.key)), null, 2));
}
