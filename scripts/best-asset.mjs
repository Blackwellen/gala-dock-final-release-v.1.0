// For each visible photo slot on a page, finds the project image asset whose cover-fit render best matches the reference.
// Usage: node scripts/best-asset.mjs <url> <reference.png> <width> <height> [selector=img.photo]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
const [url, refFile, W, H, sel = "img.photo"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
await page.goto(`http://localhost:3107${url}`, { waitUntil: "networkidle" });
const slots = await page.evaluate(s => [...document.querySelectorAll(s)].map(e => { const b = e.getBoundingClientRect(); return { src: e.getAttribute("src"), x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; }).filter(b => b.w > 30 && b.h > 30 && b.y + b.h <= innerHeight), sel);
const dirs = ["public/assets/regenerated", "public/assets"];
const assets = dirs.flatMap(d => fs.readdirSync(d).filter(f => /\.(png|webp|jpg)$/i.test(f) && !/^(auth-art|story-|icon|brand|home-hero)/.test(f)).map(f => `/${path.relative("public", path.join(d, f)).split(path.sep).join("/")}`));
const ref = `data:image/png;base64,${fs.readFileSync(refFile).toString("base64")}`;
const result = await page.evaluate(async ({ slots, assets, ref }) => {
  const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  const refImg = await load(ref);
  const draw = (img, w, h, cover) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    if (cover) { const s = Math.max(w / img.width, h / img.height); g.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s); } else g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
  const imgs = {}; for (const a of assets) imgs[a] = await load(a);
  return slots.map(slot => {
    const c = document.createElement("canvas"); c.width = slot.w; c.height = slot.h; const g = c.getContext("2d"); g.drawImage(refImg, -slot.x, -slot.y); const target = g.getImageData(0, 0, slot.w, slot.h).data;
    let best = []; for (const a of assets) { const im = imgs[a]; if (!im) continue; const d = draw(im, slot.w, slot.h, true); let e = 0; for (let i = 0; i < d.length; i += 16) e += Math.abs(d[i] - target[i]) + Math.abs(d[i + 1] - target[i + 1]) + Math.abs(d[i + 2] - target[i + 2]); best.push([e / (d.length / 16) / 3, a]); }
    best.sort((p, q) => p[0] - q[0]);
    const curImg = imgs[slot.src.startsWith("/_next") ? "" : slot.src];
    return { slot: `${slot.x},${slot.y} ${slot.w}x${slot.h}`, current: slot.src.slice(0, 60), best: best.slice(0, 3).map(([e, a]) => `${a} (${e.toFixed(1)})`) };
  });
}, { slots, assets, ref });
for (const r of result) console.log(r.slot, "| now", r.current, "\n   best:", r.best.join("  "));
await browser.close();
