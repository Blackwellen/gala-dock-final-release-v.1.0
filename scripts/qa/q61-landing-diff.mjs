// Q61: landing (/) 1:1 against the section designs in Designs/Public Pages/public. For each blueprint section the live region is
// captured at 1536 and 1280 wide (plus 768 and 390 for responsive faithfulness), the design is scaled to the same width, and the
// script writes a side-by-side, a 50 % overlay and a pixelmatch diff, plus the height ratio (live ÷ design) — the structural signal
// (sign-off is "premium + consistent", not a pixel gate; memory design-signoff-standard).
// Run: node scripts/qa/q61-landing-diff.mjs [--tag=before|after] [--widths=1536,1280,768,390]
import fs from "node:fs";
import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { chromium } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3107";
const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const TAG = arg("tag") ?? "run";
const WIDTHS = (arg("widths") ?? "1536,1280,768,390").split(",").map(Number);
const OUT = `artifacts/release/q61/${TAG}`; fs.mkdirSync(OUT, { recursive: true });
const D = "Designs/Public Pages/public/";
// from/to: live region = top of `from` (or page top) to bottom of `to`. cropTop: design's own header band to drop when the live
// region starts below the header.
const SECTIONS = [
  { key: "2.1-hero", design: "Gala Dock Connected Event Platform.png", from: null, to: ".gpl-hero", cropTop: 0 },
  { key: "2.2-ways", design: "Three Paths, One Event Network.png", from: ".gpl-ways", to: ".gpl-ways", cropTop: 0 },
  { key: "2.3-whole", design: "Gala Dock Event Planning Dashboard.png", from: ".gpl-whole", to: ".gpl-whole", cropTop: 82 },
  { key: "2.4-lifecycle", design: "From Plan to Event Day.png", from: ".gpl-lifecycle", to: ".gpl-lifecycle", cropTop: 77 },
  { key: "2.5-market", design: "Gala Dock London Venue Marketplace.png", from: ".gpl-market", to: ".gpl-market", cropTop: 80 },
  { key: "2.6-record", design: "Gala·Dock Event Operations Dashboard.png", from: ".gpl-record", to: ".gpl-record", cropTop: 84 },
  { key: "2.7-close-footer", design: "Gala Dock Event Planning Landing Page.png", from: ".gpl-close", to: "footer", cropTop: 0 },
];

const browser = await chromium.launch({ args: ["--disable-gpu"] });
const rows = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 900 }, reducedMotion: "reduce",
    storageState: { cookies: [{ name: "gd_cc", value: "1", domain: new URL(BASE).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [] } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 180000 });
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(800);
    // reveal everything (entrance motion is off under reduced motion; scroll once so lazy images load)
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } scrollTo(0, 0); });
    await page.waitForTimeout(600);
    const full = await page.screenshot({ fullPage: true, animations: "disabled", timeout: 180000 });
    const meta = await sharp(full).metadata();
    for (const s of SECTIONS) {
      const box = await page.evaluate(({ from, to }) => {
        const top = from ? document.querySelector(from).getBoundingClientRect().top + scrollY : 0;
        const b = document.querySelector(to).getBoundingClientRect(); return { top: Math.round(top), bottom: Math.round(b.bottom + scrollY) };
      }, s);
      const liveH = Math.min(box.bottom, meta.height) - box.top;
      const live = await sharp(full).extract({ left: 0, top: box.top, width: meta.width, height: liveH }).png().toBuffer();
      const dm = await sharp(D + s.design).metadata();
      const design = await sharp(D + s.design).extract({ left: 0, top: s.cropTop, width: dm.width, height: dm.height - s.cropTop }).resize({ width: meta.width }).png().toBuffer();
      const desH = (await sharp(design).metadata()).height;
      const H = Math.max(liveH, desH);
      const pad = buf => sharp(buf).resize({ width: meta.width, height: H, fit: "contain", position: "top", background: "#ffffff" }).ensureAlpha().png().toBuffer();
      const [L, Dz] = [await pad(live), await pad(design)];
      const a = PNG.sync.read(L), b = PNG.sync.read(Dz); const diff = new PNG({ width: a.width, height: a.height });
      const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.2, includeAA: false });
      const base = `${OUT}/${s.key}@${w}`;
      if (w >= 1280) {
        fs.writeFileSync(`${base}-diff.png`, PNG.sync.write(diff));
        const ov = new PNG({ width: a.width, height: a.height }); for (let k = 0; k < a.data.length; k++) ov.data[k] = (a.data[k] + b.data[k]) >> 1; fs.writeFileSync(`${base}-overlay.png`, PNG.sync.write(ov));
      }
      await sharp({ create: { width: meta.width * 2 + 24, height: H, channels: 4, background: "#ff0055" } })
        .composite([{ input: L, left: 0, top: 0 }, { input: Dz, left: meta.width + 24, top: 0 }]).png().toBuffer().then(buf => sharp(buf).resize({ width: Math.min(2400, meta.width * 2 + 24) }).png().toFile(`${base}-side.png`));
      const row = { tag: TAG, section: s.key, width: w, liveH, designH: desH, heightRatio: +(liveH / desH).toFixed(2), diffPct: +(100 * n / (a.width * a.height)).toFixed(1) };
      rows.push(row); console.log(JSON.stringify(row));
    }
  }
} finally { await browser.close(); }
const file = "artifacts/release/q61-landing-diff.json";
const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
prev[TAG] = { at: new Date().toISOString(), rows };
fs.writeFileSync(file, JSON.stringify(prev, null, 1));
