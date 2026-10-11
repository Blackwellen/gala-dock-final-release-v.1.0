// Scores candidate font families against a reference by injecting them into a preview page.
// Usage: node scripts/font-trial.mjs <url> <reference.png> <width> <height> <left> "Font A,Font B,..."
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
const [url, refFile, w, h, left, list] = process.argv.slice(2);
const width = +w, height = +h, x0 = +left;
const ref = PNG.sync.read(fs.readFileSync(refFile));
const crop = png => { const rw = width - x0, out = Buffer.alloc(rw * height * 4); for (let y = 0; y < height; y++) png.data.copy(out, y * rw * 4, (y * width + x0) * 4, (y * width + width) * 4); return out; };
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
for (const font of ["(current)", ...list.split(",")]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:3107${url}`, { waitUntil: "networkidle" });
  if (font !== "(current)") {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${font.replace(/ /g, "+")}:wght@300..900&display=block`, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36" } })).text();
    await page.addStyleTag({ content: css });
    await page.addStyleTag({ content: `${process.env.SCOPE ?? "body,body *"}{font-family:"${font}",sans-serif!important}` });
  }
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}*{animation:none!important;transition:none!important}" });
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
  const shot = PNG.sync.read(await page.screenshot());
  const n = pixelmatch(crop(ref), crop(shot), null, width - x0, height, { threshold: 0.1, includeAA: false });
  const all = pixelmatch(ref.data, shot.data, null, width, height, { threshold: 0.1, includeAA: false });
  console.log(font.padEnd(20), "iface", (100 * n / ((width - x0) * height)).toFixed(2) + "%", "full", (100 * all / (width * height)).toFixed(2) + "%");
  await page.close();
}
await browser.close();
