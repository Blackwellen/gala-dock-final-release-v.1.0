// Greedy coordinate-descent tuner: for each CSS parameter, tries candidate values (injected live)
// and keeps whichever lowers the pixel difference against the reference. Prints the winning CSS.
// Usage: node scripts/tune.mjs <spec.json>
//   spec: { url, ref, width, height, left (diff region x0, 0 = full), params: [{ sel, prop, values: [...] }], rounds }
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const { url, width, height, left = 0, rounds = 2 } = spec;
const ref = PNG.sync.read(fs.readFileSync(spec.ref));
const crop = png => { const rw = width - left, out = Buffer.alloc(rw * height * 4); for (let y = 0; y < height; y++) png.data.copy(out, y * rw * 4, (y * width + left) * 4, (y * width + width) * 4); return out; };
const refCrop = crop(ref);
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
await page.goto(`http://localhost:3107${url}`, { waitUntil: "networkidle" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}*{animation:none!important;transition:none!important}" });
for (const sel of spec.check ?? []) await page.locator(sel).check({ force: true });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => { const s = document.createElement("style"); s.id = "tune"; document.head.appendChild(s); });
const open = async () => {
  await page.goto(`http://localhost:3107${url}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}*{animation:none!important;transition:none!important}" });
  for (const sel of spec.check ?? []) await page.locator(sel).check({ force: true });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { const s = document.createElement("style"); s.id = "tune"; document.head.appendChild(s); });
};
const score = async (css, attempt = 0) => {
  try { return await scoreOnce(css); } catch (e) { if (attempt > 2) throw e; await page.waitForTimeout(1500); await open(); return score(css, attempt + 1); }
};
const scoreOnce = async css => {
  await page.evaluate(c => { document.getElementById("tune").textContent = c; }, css);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const shot = PNG.sync.read(await page.screenshot());
  return 100 * pixelmatch(refCrop, crop(shot), null, width - left, height, { threshold: 0.1, includeAA: false }) / ((width - left) * height);
};
const chosen = {}; // key -> value
const cssOf = c => Object.entries(c).map(([k, v]) => { const [sel, prop] = k.split("||"); return `${sel}{${prop}:${v}!important}`; }).join("\n");
let best = await score("");
console.error(`baseline ${best.toFixed(3)}%`);
for (let r = 0; r < rounds; r++) {
  for (const p of spec.params) {
    const key = `${p.sel}||${p.prop}`;
    for (const v of p.values) {
      const trial = { ...chosen, [key]: v };
      const s = await score(cssOf(trial));
      if (s < best - 0.005) { best = s; chosen[key] = v; console.error(`  ${best.toFixed(3)}%  ${p.sel} { ${p.prop}: ${v} }`); }
    }
  }
}
console.error(`final ${best.toFixed(3)}%`);
console.log(cssOf(chosen));
await browser.close();
