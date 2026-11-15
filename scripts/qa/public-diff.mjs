// Public pages vs designs — overlay / side-by-side / pixel diff at each design's NATIVE width (generalises q61-landing-diff.mjs).
// The design PNGs are renders at arbitrary pixel scales (1536–2170px wide sections, 809px full pages), so each one is calibrated:
// dpr = design px per CSS px, from the design's header band (live header = 76 CSS px) or from the rendered width of a heading phrase.
// The page is then opened at CSS width = PNG width ÷ dpr with deviceScaleFactor = dpr and the display scale pinned to 1, so the
// screenshot is exactly the PNG's own width and one design pixel lines up with one screenshot pixel (no resampling of the design).
// The live region runs from the top of `from` to the bottom of `to`. Full-page profile designs (deleted from disk, kept in git
// HEAD) are compared whole.
// `mask` selectors cover legitimately dynamic content (real event data, photos from the database, dates): their boxes are painted
// the same neutral grey in BOTH images before diffing, and the masked share is reported. Designs are never restored to the repo.
// Run: node scripts/qa/public-diff.mjs [--tag=before|after] [--only=landing,organisers,profiles] [--keys=2.1-hero,...]
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { chromium } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3107";
const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const TAG = arg("tag") ?? "run";
const ONLY = arg("only")?.split(",");
const KEYS = arg("keys")?.split(",");
const OUT = `artifacts/release/public-diff/${TAG}`; fs.mkdirSync(OUT, { recursive: true });
const PUB = "Designs/Public Pages/public/";
const OLD = "Designs/Public Pages/";

// cropTop: the design's own header band, dropped when the live region starts below the header.
const SECTIONS = [
  // ── / (blueprint §2) ──
  { group: "landing", key: "2.1-hero", route: "/", design: PUB + "Gala Dock Connected Event Platform.png", from: null, to: ".gpl-hero", cropTop: 0, hdr: 85 },
  { group: "landing", key: "2.2-ways", route: "/", design: PUB + "Three Paths, One Event Network.png", from: ".gpl-ways", to: ".gpl-ways", cropTop: 0, calib: ["#ways-title .gp-blue", 440] },
  { group: "landing", key: "2.3-whole", route: "/", design: PUB + "Gala Dock Event Planning Dashboard.png", from: ".gpl-whole", to: ".gpl-whole", cropTop: 82, hdr: 82 },
  { group: "landing", key: "2.4-lifecycle", route: "/", design: PUB + "From Plan to Event Day.png", from: ".gpl-lifecycle", to: ".gpl-lifecycle", cropTop: 77, hdr: 77 },
  { group: "landing", key: "2.5-market", route: "/", design: PUB + "Gala Dock London Venue Marketplace.png", from: ".gpl-market", to: ".gpl-market", cropTop: 80, hdr: 80 },
  { group: "landing", key: "2.6-record", route: "/", design: PUB + "Gala·Dock Event Operations Dashboard.png", from: ".gpl-record", to: ".gpl-record", cropTop: 84, hdr: 84 },
  { group: "landing", key: "2.7-close-footer", route: "/", design: PUB + "Gala Dock Event Planning Landing Page.png", from: ".gpl-close", to: "footer", cropTop: 0, calib: ["#close-title .gp-blue", 469] },
  // ── /organisers (blueprint §3) ──
  { group: "organisers", key: "3.1-hero", route: "/organisers", design: PUB + "Gala·Dock Event Command Center.png", from: null, to: ".gpo-hero", cropTop: 0, hdr: 80 },
  { group: "organisers", key: "3.2-record", route: "/organisers", design: PUB + "Gala·Dock Event Planning Dashboard.png", from: ".gpo-rec-sec", to: ".gpo-rec-sec", cropTop: 70, hdr: 70 },
  { group: "organisers", key: "3.3-procurement", route: "/organisers", design: PUB + "Gala Dock Event Procurement Dashboard.png", from: ".gpo-proc-sec", to: ".gpo-proc-sec", cropTop: 70, hdr: 70 },
  { group: "organisers", key: "3.4-sell", route: "/organisers", design: PUB + "Modern Event Promotion Dashboard.png", from: ".gpo-sell-sec", to: ".gpo-sell-sec", cropTop: 0, calib: ["#org-sell .gp-blue", 715] },
  { group: "organisers", key: "3.5-live", route: "/organisers", design: PUB + "Live Event Operations Dashboard.png", from: ".gpo-live-sec", to: ".gpo-live-sec", cropTop: 0, calib: ["#org-live .gp-blue", 735] },
  { group: "organisers", key: "3.6-agent", route: "/organisers", design: PUB + "Gala Agent Event Command Center.png", from: ".gpo-agent-sec", to: ".gpo-agent-sec", cropTop: 70, hdr: 70 },
  // ── public profiles (old full-page designs, git HEAD only; real database content is masked) ──
  { group: "profiles", key: "event-neon-nights", route: "/events/neon-nights", design: OLD + "Gala·Dock Neon Nights Festival 2026.png", full: true, hdr: 40,
    mask: ["main img", "main video", "main iframe", "main [class*=map]", "main time"] },
  { group: "profiles", key: "venue-riverside-arena", route: "/venues/riverside-arena", design: OLD + "Gala·Dock Riverside Arena Venue Page.png", full: true, hdr: 40,
    mask: ["main img", "main iframe", "main [class*=map]"] },
  { group: "profiles", key: "service-elite-sounds", route: "/services/elite-sounds-dj", design: OLD + "Gala·Dock Elite Sound Events Page.png", full: true, hdr: 40,
    mask: ["main img", "main iframe", "main [class*=map]"] },
  { group: "profiles", key: "organiser-neon-events", route: "/organizers/75e6c471-8d5e-4b9f-b076-ff10cf209f01", design: OLD + "Neon Events Organizer Profile.png", full: true, hdr: 40,
    mask: ["main img", "main time"] },
  { group: "profiles", key: "discover-london", route: "/events/in/london", design: OLD + "London Events Discovery Marketplace.png", full: true, hdr: 40,
    mask: ["main img", "main [class*=map]", "main time"] },
];

/** Design bytes: from disk, else from git HEAD (the owner removed some PNGs from the tree; we read them, never restore them). */
function designBuf(p) {
  if (fs.existsSync(p)) return fs.readFileSync(p);
  return execFileSync("git", ["show", `HEAD:${p}`], { maxBuffer: 64 << 20 });
}

const todo = SECTIONS.filter(s => (!ONLY || ONLY.includes(s.group)) && (!KEYS || KEYS.includes(s.key)));
const HEADER_CSS = 76; // live header height in CSS px at desktop widths (public-site.css --gp-header-h)
const cookie = { name: "gd_cc", value: "1", domain: new URL(BASE).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" };
const browser = await chromium.launch({ args: ["--disable-gpu"] });
const rows = [];
/** Opens `route` at CSS width `cssW` and device scale `dpr`, with the display scale pinned to 1 (data-density="reference"), so one
 *  CSS px is exactly `dpr` screenshot px and the full-page screenshot is the design's own pixel width. */
async function open(route, cssW, dpr) {
  const ctx = await browser.newContext({ viewport: { width: cssW, height: 1000 }, deviceScaleFactor: dpr, reducedMotion: "reduce", storageState: { cookies: [cookie], origins: [] } });
  await ctx.addInitScript(() => { try { localStorage.setItem("gd-density", "reference"); } catch {} document.documentElement.setAttribute("data-density", "reference"); });
  const page = await ctx.newPage();
  await page.goto(BASE + route, { waitUntil: "load", timeout: 180000 });
  await page.evaluate(() => document.documentElement.setAttribute("data-density", "reference"));
  return { ctx, page };
}
try {
  let at = { key: "" }, cur = null, full = null, meta = null;
  for (const s of todo) {
    const dBuf = designBuf(s.design);
    const dm = await sharp(dBuf).metadata();
    // Design px per CSS px: from the design's header band (hdr) or from the width of a calibration phrase (calib).
    let dpr = s.hdr ? s.hdr / HEADER_CSS : 1;
    if (s.calib) {
      const probe = await open(s.route, 1536, 1);
      const w = await probe.page.evaluate(sel => { const r = document.createRange(); r.selectNodeContents(document.querySelector(sel)); return [...r.getClientRects()].reduce((a, x) => a + x.width, 0); }, s.calib[0]);
      await probe.ctx.close();
      dpr = s.calib[1] / w;
    }
    dpr = +dpr.toFixed(3);
    const cssW = Math.round(dm.width / dpr);
    const k = `${s.route}|${cssW}|${dpr}`;
    if (at.key !== k) {
      if (cur) await cur.ctx.close();
      cur = await open(s.route, cssW, dpr);
      const page = cur.page;
      await page.waitForTimeout(900);
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } scrollTo(0, 0); });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(700);
      full = await page.screenshot({ fullPage: true, animations: "disabled", timeout: 180000 });
      meta = await sharp(full).metadata();
      if (meta.width !== dm.width) { full = await sharp(full).resize({ width: dm.width }).png().toBuffer(); meta = await sharp(full).metadata(); }
      at = { key: k };
    }
    const page = cur.page;
        const geo0 = await page.evaluate(({ from, to, mask, fullPage }) => {
      const top = fullPage || !from ? 0 : document.querySelector(from).getBoundingClientRect().top + scrollY;
      const bottom = fullPage ? document.documentElement.scrollHeight : document.querySelector(to).getBoundingClientRect().bottom + scrollY;
      const boxes = (mask ?? []).flatMap(sel => [...document.querySelectorAll(sel)].map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; }))
        .filter(b => b.w > 4 && b.h > 4);
      return { top, bottom, boxes };
    }, { from: s.from, to: s.to, mask: s.mask, fullPage: !!s.full });
    const geo = { top: Math.round(geo0.top * dpr), bottom: Math.round(geo0.bottom * dpr), boxes: geo0.boxes.map(b => ({ x: b.x * dpr, y: b.y * dpr, w: b.w * dpr, h: b.h * dpr })) };
    const liveH0 = Math.min(geo.bottom, meta.height) - geo.top;
    const live = await sharp(full).extract({ left: 0, top: geo.top, width: meta.width, height: liveH0 }).png().toBuffer();
    const liveH = (await sharp(live).metadata()).height;
    const W = dm.width;
    const design = await sharp(dBuf).extract({ left: 0, top: s.cropTop ?? 0, width: dm.width, height: dm.height - (s.cropTop ?? 0) }).png().toBuffer();
    const desH = dm.height - (s.cropTop ?? 0);
    const H = Math.max(liveH, desH);
    const pad = buf => sharp(buf).resize({ width: W, height: H, fit: "contain", position: "top", background: "#ffffff" }).ensureAlpha().png().toBuffer();
    const [L, Dz] = [await pad(live), await pad(design)];
    const a = PNG.sync.read(L), b = PNG.sync.read(Dz);
    let masked = 0;
    for (const bx of geo.boxes) {
      const x0 = Math.max(0, Math.floor(bx.x)), y0 = Math.max(0, Math.floor(bx.y - geo.top));
      const x1 = Math.min(W, Math.ceil(bx.x + bx.w)), y1 = Math.min(H, Math.ceil(bx.y - geo.top + bx.h));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = (y * W + x) * 4; if (a.data[k + 3] !== 254) masked++; for (const im of [a, b]) { im.data[k] = im.data[k + 1] = im.data[k + 2] = 200; im.data[k + 3] = 254; } }
    }
    const diff = new PNG({ width: W, height: H });
    const n = pixelmatch(a.data, b.data, diff.data, W, H, { threshold: 0.2, includeAA: false });
    const base = `${OUT}/${s.key}`;
    fs.writeFileSync(`${base}-diff.png`, PNG.sync.write(diff));
    const ov = new PNG({ width: W, height: H }); for (let k = 0; k < a.data.length; k++) ov.data[k] = (a.data[k] + b.data[k]) >> 1; fs.writeFileSync(`${base}-overlay.png`, PNG.sync.write(ov));
    const La = PNG.sync.write(a), Db = PNG.sync.write(b);
    await sharp({ create: { width: W * 2 + 24, height: H, channels: 4, background: "#ff0055" } })
      .composite([{ input: La, left: 0, top: 0 }, { input: Db, left: W + 24, top: 0 }]).png().toBuffer()
      .then(buf => sharp(buf).resize({ width: Math.min(2400, W * 2 + 24) }).png().toFile(`${base}-side.png`));
    const row = { tag: TAG, group: s.group, section: s.key, route: s.route, designWidth: dm.width, cssWidth: cssW, dpr, liveH, designH: desH,
      heightRatio: +(liveH / desH).toFixed(2), maskedPct: +(100 * masked / (W * H)).toFixed(1), diffPct: +(100 * n / (W * H)).toFixed(1) };
    rows.push(row); console.log(JSON.stringify(row));
  }
  if (cur) await cur.ctx.close();
} finally { await browser.close(); }
const file = "artifacts/release/public-diff.json";
const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
const keep = (prev[TAG]?.rows ?? []).filter(r => !rows.some(x => x.section === r.section));
prev[TAG] = { at: new Date().toISOString(), rows: [...keep, ...rows] };
fs.writeFileSync(file, JSON.stringify(prev, null, 1));
