// Generates annotated Help Centre screenshots from the running release UI (release spec §84–85).
//   node --env-file=.env --env-file=.env.local scripts/help-screenshots.mjs           capture all
//   node --env-file=.env --env-file=.env.local scripts/help-screenshots.mjs --check   report stale guides (UI changed since capture)
// Uses the signed-in Playwright storage states in artifacts/auth/<persona>.json. Writes public/help/<slug>.png and
// public/help/manifest.json: { slug: { version, captured_at, route, width, height, signature, annotations: [{ n, caption, x, y, w, h, found }] } }.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { ARTICLES } from "../src/lib/help/articles.ts";

const root = path.resolve(import.meta.dirname, "..");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3107";
const out = path.join(root, "public/help"), manifestPath = path.join(out, "manifest.json");
const check = process.argv.includes("--check");
fs.mkdirSync(out, { recursive: true });
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
const chrome = process.env.PW_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch(fs.existsSync(chrome) ? { executablePath: chrome } : {});
const stale = [];
for (const a of ARTICLES.filter(x => x.shot)) {
  const state = path.join(root, `artifacts/auth/${a.shot.persona}.json`);
  if (!fs.existsSync(state)) { console.warn(`skip ${a.slug}: no auth state for ${a.shot.persona}`); continue; }
  const ctx = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${a.shot.route}`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  if (!page.url().includes(a.shot.route.split("?")[0])) { console.warn(`skip ${a.slug}: redirected to ${page.url()} (refresh auth states with ws-auth)`); await ctx.close(); continue; }
  await page.addStyleTag({ content: ".gd-tour,.gd-maint,nextjs-portal,[data-design-overlay]{display:none!important} *{caret-color:transparent!important}" });
  // Remove dev-only floating tools (Next.js indicator, design overlay) so captures match production.
  await page.evaluate(() => { for (const b of document.querySelectorAll('button[aria-label*="overlay" i]')) { const host = b.closest('div[style*="position: fixed"]'); (host ?? b).remove(); } });
  const annotations = [];
  for (const [i, an] of a.shot.annotations.entries()) {
    const el = page.locator(an.selector).first();
    const box = (await el.count()) ? await el.boundingBox() : null;
    annotations.push({ n: i + 1, caption: an.caption, found: !!box, ...(box ? { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) } : {}) });
  }
  // UI signature: which anchors exist + main heading + nav labels. A change means the guide may be stale.
  const heading = await page.locator("main h1, h1").first().textContent().catch(() => "") ?? "";
  const navText = await page.locator("nav").first().innerText().catch(() => "");
  const signature = createHash("sha256").update(JSON.stringify({ found: annotations.map(x => x.found), heading: heading.trim(), nav: navText.replace(/\d+/g, "#") })).digest("hex").slice(0, 16);
  if (check) {
    const prev = manifest[a.slug];
    if (!prev || prev.signature !== signature) stale.push({ slug: a.slug, reason: !prev ? "never captured" : "UI changed since capture" });
  } else {
    await page.screenshot({ path: path.join(out, `${a.slug}.png`), fullPage: false });
    manifest[a.slug] = { version: (manifest[a.slug]?.version ?? 0) + 1, captured_at: new Date().toISOString(), route: a.shot.route, width: 1280, height: 800, signature, annotations };
    console.log(`captured ${a.slug} (${annotations.filter(x => x.found).length}/${annotations.length} anchors)`);
  }
  await ctx.close();
}
await browser.close();
if (check) { console.log(stale.length ? `STALE: ${JSON.stringify(stale)}` : "All help screenshots current."); process.exit(stale.length ? 1 : 0); }
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
