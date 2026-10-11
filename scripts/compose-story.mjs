// Rebuilds a story-panel background: design photo everywhere except under text, where the text-free
// re-render is blended in (feathered). Text boxes come from the live page, so masks fit our layout.
// Usage: node scripts/compose-story.mjs <previewUrl> <design.png> <panelSelector> <textSelectors> <cleanArt.png> <out.png> <w> <h>
import fs from "node:fs";
import { chromium } from "@playwright/test";
const [url, design, panelSel, textSel, cleanArt, out, W, H] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
await page.goto(`http://localhost:3107${url}`, { waitUntil: "networkidle" });
const geo = await page.evaluate(([p, t]) => {
  const panel = document.querySelector(p).getBoundingClientRect();
  // Tight boxes: per-line text rects for text, element boxes for non-text (icons, images).
  const rects = [];
  for (const e of document.querySelectorAll(t)) {
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let any = false;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); rects.push(...r.getClientRects()); any = true; }
    if (!any) rects.push(e.getBoundingClientRect());
  }
  const boxes = rects.filter(b => b.width && b.height).map(b => ({ x: b.left - panel.left, y: b.top - panel.top, w: b.width, h: b.height }));
  return { panel: { x: panel.left, y: panel.top, w: panel.width, h: panel.height }, boxes };
}, [panelSel, textSel]);
if (process.env.DUMP_BOXES) {
  const extraBoxes = JSON.parse(process.env.EXTRA_BOXES ?? "[]");
  fs.writeFileSync(process.env.DUMP_BOXES, JSON.stringify({ panel: geo.panel, boxes: [...geo.boxes, ...extraBoxes] }));
  console.log(`boxes -> ${process.env.DUMP_BOXES}`); await browser.close(); process.exit(0);
}
const toData = f => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;
const extra = JSON.parse(process.env.EXTRA_BOXES ?? "[]");
// COLUMN_UNTIL=<selector>: also cover the whole text column from the panel top to that element's bottom.
if (process.env.COLUMN_UNTIL) {
  const until = await page.evaluate(([p, u]) => { const panel = document.querySelector(p).getBoundingClientRect(); const els = [...document.querySelectorAll(u)]; return Math.max(...els.map(e => e.getBoundingClientRect().bottom - panel.top)); }, [panelSel, process.env.COLUMN_UNTIL]);
  const right = Math.max(...geo.boxes.filter(b => b.y < until).map(b => b.x + b.w));
  extra.push({ x: 0, y: 0, w: right + 24, h: until + 22 });
}
const png = await page.evaluate(async ({ geo, design, clean, extra }) => {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  const [d, c] = await Promise.all([load(design), load(clean)]);
  const { x, y, w, h } = geo.panel;
  const canvas = document.createElement("canvas"); canvas.width = Math.round(w); canvas.height = Math.round(h); const g = canvas.getContext("2d");
  g.drawImage(d, -x, -y); // design photo, panel region
  // Clean re-render under text, feathered so seams don't show.
  const m = document.createElement("canvas"); m.width = canvas.width; m.height = canvas.height; const mg = m.getContext("2d");
  mg.filter = "blur(5px)"; mg.fillStyle = "#000";
  // Two passes: opaque core, soft edge. Extra boxes cover design-only text (e.g. a wider mockup logo).
  for (let pass = 0; pass < 2; pass++) for (const b of [...geo.boxes, ...extra]) { const x0 = b.x < 120 ? -20 : b.x - 16; mg.fillRect(x0, b.y - 8, b.x + b.w + 16 - x0, b.h + 16); }
  const layer = document.createElement("canvas"); layer.width = canvas.width; layer.height = canvas.height; const lg = layer.getContext("2d");
  lg.drawImage(c, 0, 0, canvas.width, canvas.height); lg.globalCompositeOperation = "destination-in"; lg.drawImage(m, 0, 0);
  g.drawImage(layer, 0, 0);
  return canvas.toDataURL("image/png").split(",")[1];
}, { geo, design: toData(design), clean: toData(cleanArt), extra });
fs.writeFileSync(out, Buffer.from(png, "base64"));
console.log(`${out}: ${geo.boxes.length} text boxes masked, panel ${Math.round(geo.panel.w)}x${Math.round(geo.panel.h)}`);
await browser.close();
