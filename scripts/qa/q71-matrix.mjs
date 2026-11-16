// Q71 full screen-size matrix for routes that need no signed-in session (owner standard: memory responsive-test-matrix).
// One headless browser, one page: each route is loaded once, then the viewport, DPR, mobile mode and touch are changed in place
// through CDP (Emulation.setDeviceMetricsOverride / setTouchEmulationEnabled) for every cell of the matrix.
// Run: node --env-file=.env --env-file=.env.local scripts/qa/q71-matrix.mjs [--routes=/,/pricing] [--cells=phone-p-390,...] [--quick]
// Writes artifacts/release/q71-matrix.json; failing cells get a viewport screenshot (offenders outlined) in artifacts/release/q71/.
// R1 signed-in: --state=artifacts/auth/<who>.json (Playwright storageState), --report=<json>, --out=<dir>, --label=<who>,
// --plan=<json file: [{ route, label, state, set: "full"|"reduced" }]> and --set=reduced (the R1 reduced cell list below).
import fs from "node:fs";
import { chromium } from "@playwright/test";

// Low-memory mode (coordinator 2026-11-15): between routes, pause while free RAM < 1.2 GB until it recovers above 1.8 GB.
import { execFileSync } from "node:child_process";
const freeMb = () => { try { return Math.round(Number(execFileSync("wmic", ["OS", "get", "FreePhysicalMemory", "/value"], { encoding: "utf8", windowsHide: true }).match(/=(\d+)/)[1]) / 1024); } catch { return Infinity; } };
export const ramPauses = [];
async function ramGuard(where) {
  let f = freeMb(); if (f >= 1200) return;
  const t = Date.now(); console.log(`RAM ${f} MB < 1200 at ${where}; pausing`);
  while (f < 1800 && Date.now() - t < 600000) { await new Promise(r => setTimeout(r, 15000)); f = freeMb(); }
  ramPauses.push({ where, ms: Date.now() - t, recovered: f >= 1800 });
  if (ramPauses.filter(p => !p.recovered).length >= 2 || ramPauses.length >= 6) { console.log("RAM keeps dropping; stopping"); throw new Error("low-ram-stop"); }
}

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3107";
const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const OUT = arg("out") ?? "artifacts/release/q71"; fs.mkdirSync(OUT, { recursive: true });
const REPORT = arg("report") ?? "artifacts/release/q71-matrix.json";

export const ROUTES = [
  "/", "/organisers", "/providers", "/build-an-event", "/developers", "/about", "/pricing",
  "/events", "/events/calendar", "/events/category/nightlife", "/events/in/london", "/events/elite-sounds-night", "/events/elite-sounds-night/register",
  "/venues/riverside-arena", "/services/riverside-dj-sound", "/organizers/75e6c471-8d5e-4b9f-b076-ff10cf209f01",
  "/help", "/help/buying-tickets", "/help/where-you-can-get-paid",
  "/terms", "/privacy", "/cookies", "/ticket-terms", "/data-retention", "/accessibility",
  "/this-page-does-not-exist-q71", "/login", "/register", "/forgot-password", "/partner/apply", "/join/q71-invalid-token",
  "/checkout/elite-sounds-night", "/portal/q71-invalid", "/proposal/q71-invalid", "/pay/q71-invalid", "/rsvp/q71-invalid",
  "/guest/q71-invalid", "/contract/q71-invalid", "/invite/q71-invalid",
];

// cat: owner screen category. touch: touch emulation + mobile viewport mode. dpr: device pixel ratio. zoom: browser zoom emulated
// as CSS viewport = physical / zoom with DPR = zoom (what Chrome does). checks: "full" adds menu/nav and primary-action probes.
const C = (name, cat, w, h, o = {}) => ({ name, cat, w, h, dpr: 1, touch: false, ...o });
export const CELLS = [
  // Mobile 320–599 (portrait + landscape), touch
  ...[[320, 568], [360, 740], [375, 667], [390, 844], [414, 896], [480, 854], [540, 960]].map(([w, h]) => C(`mobile-p-${w}x${h}`, "mobile", w, h, { touch: true, dpr: w === 390 ? 3 : 2, full: [320, 390].includes(w) })),
  ...[[568, 320], [740, 360], [844, 390], [896, 414]].map(([w, h]) => C(`mobile-l-${w}x${h}`, "mobile", w, h, { touch: true, dpr: 3, full: w === 844 })),
  // Tablet 600–899
  ...[[600, 960], [768, 1024], [820, 1180], [860, 1200]].map(([w, h]) => C(`tablet-p-${w}x${h}`, "tablet", w, h, { touch: true, dpr: 2, full: w === 768 })),
  ...[[640, 360], [700, 400], [800, 600]].map(([w, h]) => C(`tablet-l-${w}x${h}`, "tablet", w, h, { touch: true, dpr: 1.5 })),
  // Micro laptop 900–1199
  ...[[900, 600], [1024, 768], [1100, 700], [1180, 820]].map(([w, h]) => C(`micro-l-${w}x${h}`, "micro-laptop", w, h, { touch: w === 1024 || w === 1180, dpr: w === 1180 ? 2 : 1, full: w === 1024 })),
  ...[[900, 1200], [1024, 1366], [1080, 1920]].map(([w, h]) => C(`micro-p-${w}x${h}`, "micro-laptop", w, h, { touch: w === 1024, dpr: w === 1024 ? 2 : 1 })),
  // Laptop 1200–1599
  ...[[1200, 800], [1280, 800], [1366, 768], [1440, 900], [1536, 864]].map(([w, h]) => C(`laptop-l-${w}x${h}`, "laptop", w, h, { dpr: w === 1536 ? 1.25 : w === 1440 ? 2 : 1, full: w === 1280 || w === 1536 })),
  ...[[1200, 1920], [1440, 2560]].map(([w, h]) => C(`laptop-p-${w}x${h}`, "laptop", w, h)),
  // Small desktop 1600–1919
  ...[[1600, 900], [1680, 1050], [1760, 990]].map(([w, h]) => C(`smalldesk-l-${w}x${h}`, "small-desktop", w, h, { full: w === 1600 })),
  C("smalldesk-p-1600x2560", "small-desktop", 1600, 2560),
  // Square / near-square
  ...[800, 1024, 1200, 1600, 2048, 2560].map(s => C(`square-${s}`, "square", s, s, { full: s === 1200 })),
  C("nearsquare-1280x1024", "square", 1280, 1024),
  // Large desktop 1920–2559
  ...[[1920, 1080], [2048, 1152], [2240, 1260], [2400, 1350]].map(([w, h]) => C(`largedesk-l-${w}x${h}`, "large-desktop", w, h, { full: w === 1920 })),
  C("largedesk-p-2160x3840", "large-desktop", 2160, 3840),
  // Large monitor 2560–8192
  ...[[2560, 1440], [3000, 1688], [3440, 1440], [3840, 2160], [5120, 2880]].map(([w, h]) => C(`monitor-l-${w}x${h}`, "large-monitor", w, h, { full: w === 2560 || w === 3840 })),
  C("monitor-p-2880x5120", "large-monitor", 2880, 5120),
  // Short landscape, tall portrait
  C("short-1280x600", "short", 1280, 600, { full: true }), C("short-1440x700", "short", 1440, 700), C("short-1920x600", "short", 1920, 600, { full: true }),
  C("tall-390x1000", "tall", 390, 1000, { touch: true, dpr: 3 }), C("tall-768x1400", "tall", 768, 1400, { touch: true, dpr: 2 }),
  // Browser zoom on a 1536×864 laptop (80 → 200 %)
  ...[80, 90, 110, 125, 150, 175, 200].map(z => C(`zoom-${z}`, "zoom", Math.round(1536 / (z / 100)), Math.round(864 / (z / 100)), { dpr: z / 100, full: z === 200 })),
  // WCAG 1.4.10 reflow: 1280 px at 400 % = 320 CSS px (and 200 % of 640)
  C("reflow-320x256", "reflow", 320, 256, { dpr: 4, full: true }),
];
// R1 reduced matrix for signed-in routes that are not key pages: phone/tablet both orientations, laptops, desktops, short, 200 % zoom.
export const REDUCED = ["mobile-p-390x844", "mobile-l-844x390", "tablet-p-768x1024", "micro-l-1024x768", "laptop-l-1280x800", "laptop-l-1536x864", "largedesk-l-1920x1080", "monitor-l-2560x1440", "short-1280x600", "zoom-200"];



/** In-page checks for one cell. Returns findings: [{ kind, sel, detail }]. */
function inspect({ touch, wide, full, gmarkMax, W }) {
  const F = []; const vw = Math.min(innerWidth, W || innerWidth), vh = innerHeight; const de = document.documentElement;
  const sel = el => { if (!el || !el.tagName) return "?"; const c = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".") : ""; return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (c ? "." + c : ""); };
  const path = el => { const p = []; let n = el; for (let i = 0; n && n !== document.body && i < 3; i++, n = n.parentElement) p.unshift(sel(n)); return p.join(" > "); };
  const txt = el => (el.getAttribute?.("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 48);
  const CS = new Map(); const cs = el => { let s = CS.get(el); if (!s) { s = getComputedStyle(el); CS.set(el, s); } return s; };
  const HID = new Map();
  const hiddenUp = el => { if (!el || el === document.documentElement || el === document.body) return false; let h = HID.get(el); if (h !== undefined) return h; const s = cs(el); h = el.hasAttribute?.("inert") || (el.parentElement?.matches?.("details:not([open])") && !el.matches("summary")) || el.getAttribute?.("aria-hidden") === "true" || s.visibility === "hidden" || s.display === "none" || +s.opacity === 0 || hiddenUp(el.parentElement); HID.set(el, h); return h; };
  const SX = new Map(); const stickyUp = el => { if (!el || el === document.body || el === de) return null; if (SX.has(el)) return SX.get(el); const v = cs(el).position === "sticky" ? el : stickyUp(el.parentElement); SX.set(el, v); return v; };
  const FX = new Map(); const fixedUp = el => { if (!el || el === document.body || el === de) return null; if (FX.has(el)) return FX.get(el); const v = cs(el).position === "fixed" ? el : fixedUp(el.parentElement); FX.set(el, v); return v; };
  const mark = el => { try { el.style.outline = "3px solid #ff0055"; el.style.outlineOffset = "-1px"; } catch { /* svg */ } };

  // 1. horizontal overflow — document, then outermost elements past the viewport that no scroller/clipper contains
  const over = de.scrollWidth - de.clientWidth;
  if (over > 1) F.push({ kind: "overflow-doc", sel: "document", detail: `scrollWidth +${over}px` });
  const all = Array.from(document.body.querySelectorAll("*")).filter(el => !(el instanceof SVGElement && el.tagName !== "svg"));
  const RECT = new Map(); for (const el of all) RECT.set(el, el.getBoundingClientRect());
  const offenders = [];
  for (const el of all) {
    const r = RECT.get(el); if (r.width < 2 || r.height < 2) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    const s = cs(el); if (s.position === "fixed" && (r.left >= vw || r.right <= 0)) continue; // off-canvas drawer parked outside
    if (offenders.some(o => o.contains(el))) continue;
    if ((() => { for (let n = el.parentElement; n && n !== document.body && n !== de; n = n.parentElement) { if (/(hidden|auto|scroll|clip)/.test(cs(n).overflowX)) { const sr = RECT.get(n) ?? n.getBoundingClientRect(); if (sr.right <= vw + 1 && sr.left >= -1) return true; } } return false; })()) continue; // clipped or scrolled by an on-screen container
    if (hiddenUp(el)) continue;
    if (el.closest(".gp-skip, .gp-sr, .k-sr, .sr-only, .visually-hidden, nextjs-portal")) continue;
    if (s.clip && s.clip !== "auto") continue;
    offenders.push(el);
  }
  for (const el of offenders.slice(0, 6)) { const r = el.getBoundingClientRect(); mark(el); F.push({ kind: "overflow-el", sel: path(el), detail: `x ${Math.round(r.left)}→${Math.round(r.right)} of ${vw}` }); }

  // 2. clipped / truncated labels (buttons, links, nav, tabs, chips, headings, form labels)
  const LABELS = "button, a, label, summary, [role=button], [role=tab], [role=menuitem], [role=option], nav li, th, h1, h2, h3, h4, .gp-chip, .gp-btn, .gp-pill, .gp-tab, .k-btn, .k-chip, .k-pill, [class*=chip], [class*=badge], [class*=-tag]";
  const clipped = new Set();
  for (const el of document.body.querySelectorAll(LABELS)) {
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.bottom < -vh * 6) continue;
    if (!el.textContent.trim() || el.matches('.gp-sr, .k-sr, .sr-only, .visually-hidden, [class$="-sr"]') ) continue;
    const check = n => { const s = cs(n); const ox = /(hidden|clip)/.test(s.overflowX) || s.textOverflow === "ellipsis"; if (ox && n.scrollWidth > n.clientWidth + 1 && n.clientWidth > 0) return "x"; if (/(hidden|clip)/.test(s.overflowY) && !s.webkitLineClamp?.match?.(/\d/) && n.scrollHeight > n.clientHeight + 3 && n.clientHeight > 0 && n.textContent.trim().length > 0 && s.display !== "-webkit-box") return "y"; return null; };
    let hit = check(el), who = el;
    if (!hit) for (const k of el.querySelectorAll("span, b, strong, small, em")) { if (k.matches(".gp-sr, .k-sr, .sr-only, .visually-hidden, [class$='-sr']")) continue; if ((hit = check(k))) { who = k; break; } }
    // R1: a value deliberately truncated with an ellipsis (a name inside a row / chip / switcher, full text in title, aria-label or
    // the detail it opens) is the design's overflow rule, not a clipped control — counted separately, not as a failure.
    const elided = hit === "x" && cs(who).textOverflow === "ellipsis";
    if (hit && elided) continue;
    if (hit && !hiddenUp(who) && !clipped.has(who)) { clipped.add(who); mark(who); F.push({ kind: "clipped-label", sel: path(who), detail: `${hit}: "${txt(el)}"` }); }
  }

  // interactive elements in view of the document
  const INTER = "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=link], [role=checkbox], [role=switch], summary";
  const inter = Array.from(document.body.querySelectorAll(INTER)).map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ el, r }) => r.width > 0 && r.height > 0 && !hiddenUp(el) && !el.closest(".gp-skip, .gp-sr, .k-sr, .sr-only, .visually-hidden, nextjs-portal"));
  // visible part within any clipping ancestor (carousels)
  const clipRect = el => { let r = el.getBoundingClientRect(); let L = r.left, T = r.top, R = r.right, B = r.bottom; for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const s = cs(n); if (/(hidden|auto|scroll|clip)/.test(s.overflowX + s.overflowY)) { const p = n.getBoundingClientRect(); L = Math.max(L, p.left); T = Math.max(T, p.top); R = Math.min(R, p.right); B = Math.min(B, p.bottom); } } return { L, T, R, B, w: R - L, h: B - T }; };
  const vis = inter.map(o => ({ ...o, c: clipRect(o.el) })).filter(o => o.c.w > 1 && o.c.h > 1);

  // 3. overlapping interactive elements (neither contains the other; visible overlap; topmost check where on screen)
  const overl = [];
  for (let i = 0; i < vis.length && overl.length < 6; i++) for (let j = i + 1; j < vis.length; j++) {
    const a = vis[i], b = vis[j]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (a.el.closest("label") && a.el.closest("label") === b.el.closest("label")) continue;
    if (cs(a.el).display === "inline" && cs(b.el).display === "inline") continue; // inline links wrapping across lines share a box, not a hit area
    if (!!fixedUp(a.el) !== !!fixedUp(b.el)) continue;
    if (!!stickyUp(a.el) !== !!stickyUp(b.el)) continue; // content scrolling under a sticky wizard footer / toolbar
    { // a control stacked inside another's box (save-heart on a card image, ⋯ on a tile) that is the topmost thing at its own centre
      const inside = (o, i) => i.c.L >= o.c.L - 1 && i.c.R <= o.c.R + 1 && i.c.T >= o.c.T - 1 && i.c.B <= o.c.B + 1;
      const [outer, inner] = inside(a, b) ? [a, b] : inside(b, a) ? [b, a] : [null, null];
      if (inner) { const x = (inner.c.L + inner.c.R) / 2, y = (inner.c.T + inner.c.B) / 2; if (x > 0 && x < vw && y > 0 && y < vh) { const t = document.elementFromPoint(x, y); if (t && inner.el.contains(t)) continue; } else if (cs(inner.el).position === "absolute") continue; }
      void outer;
    } // page content scrolling under fixed chrome (app tab bar / top bar) is not a hit-area clash
    const w = Math.min(a.c.R, b.c.R) - Math.max(a.c.L, b.c.L), h = Math.min(a.c.B, b.c.B) - Math.max(a.c.T, b.c.T);
    if (w < 4 || h < 4) continue;
    const small = Math.min(a.c.w * a.c.h, b.c.w * b.c.h); if (w * h < small * 0.15) continue;
    // stacked layers (e.g. a card link under its own action button) are fine when the upper one is what the user hits
    const cx = Math.max(a.c.L, b.c.L) + w / 2, cy = Math.max(a.c.T, b.c.T) + h / 2;
    if (cy > 0 && cy < vh && cx > 0 && cx < vw) { const top = document.elementFromPoint(cx, cy); if (top && (a.el.contains(top) && cs(b.el).pointerEvents === "none" || b.el.contains(top) && cs(a.el).pointerEvents === "none")) continue; }
    const pa = cs(a.el).position, pb = cs(b.el).position;
    if ((pa === "absolute" || pb === "absolute") && (a.el.closest("article, li, [class*=card]") === b.el.closest("article, li, [class*=card]")) && (a.el.matches("a") !== b.el.matches("a"))) continue; // stretched card link + its own control
    overl.push([a, b]); mark(a.el); mark(b.el);
    F.push({ kind: "overlap", sel: `${path(a.el)} ⨯ ${sel(b.el)}`, detail: `"${txt(a.el)}" / "${txt(b.el)}" ${Math.round(w)}×${Math.round(h)}` });
    if (overl.length >= 6) break;
  }

  // 4. touch targets ≥ 44 px (touch cells; inline text links in running copy are exempt, WCAG 2.5.8)
  if (touch) {
    let n = 0;
    for (const { el, c } of vis) {
      const r = el.getBoundingClientRect();
      if (r.width >= 43.5 && r.height >= 43.5) continue;
      const s = cs(el);
      if (el.matches("a") && /^inline/.test(s.display) && el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length + 8) continue;
      if (el.matches("input[type=checkbox], input[type=radio]") && el.closest("label")) { const lr = el.closest("label").getBoundingClientRect(); if (lr.height >= 43.5) continue; }
      if (el.matches("input, select, textarea") && r.height >= 43.5) continue;
      if (c.w < r.width - 2 || c.h < r.height - 2) continue; // partly clipped (carousel edge)
      if (++n <= 12) { mark(el); F.push({ kind: "touch-target", sel: path(el), detail: `${Math.round(r.width)}×${Math.round(r.height)} "${txt(el)}"` }); }
    }
    if (n > 12) F.push({ kind: "touch-target", sel: "(more)", detail: `${n - 12} more` });
  }

  // 5. fixed / sticky chrome covering a short viewport
  let topCover = 0, botCover = 0;
  for (const el of all) { const r = RECT.get(el); if (r.width < vw * 0.5 || r.height < 2) continue; const s = cs(el); if (s.position !== "fixed" && s.position !== "sticky") continue; if (hiddenUp(el)) continue; if (r.width < vw * 0.5 || r.height < 2 || r.bottom <= 0 || r.top >= vh) continue; if (r.height > vh * 0.9) continue; if (r.top <= 2) topCover = Math.max(topCover, r.bottom); else if (r.bottom >= vh - 2) botCover = Math.max(botCover, vh - r.top); }
  if (topCover + botCover > vh * 0.3) F.push({ kind: "sticky-cover", sel: "fixed/sticky chrome", detail: `${Math.round(topCover)}+${Math.round(botCover)}px of ${vh}` });

  // 6. warped images
  for (const img of Array.from(document.images)) {
    const r = img.getBoundingClientRect(); if (r.width < 24 || r.height < 24 || !img.naturalWidth || !img.naturalHeight || hiddenUp(img)) continue;
    const fit = cs(img).objectFit; if (fit === "cover" || fit === "contain" || fit === "scale-down") continue;
    const nat = img.naturalWidth / img.naturalHeight, shown = r.width / r.height;
    if (Math.abs(nat - shown) / nat > 0.06) { mark(img); F.push({ kind: "warped-image", sel: path(img), detail: `${(img.currentSrc || img.src).split("?")[0].slice(-60)} ${nat.toFixed(2)}→${shown.toFixed(2)}` }); }
  }

  // 7. line length (readable measure inside components) — all cells, the owner's concern on wide screens
  let ll = 0;
  for (const el of document.body.querySelectorAll("p, li, dd, blockquote, figcaption, td")) {
    const t = el.textContent.replace(/\s+/g, " ").trim(); if (t.length < 160) continue;
    if (el.querySelector("p, li, div, ul, ol, table")) continue;
    const r = el.getBoundingClientRect(); if (r.width < 200 || hiddenUp(el)) continue;
    const s = cs(el); if (/\d/.test(s.webkitLineClamp || "") || s.display === "-webkit-box") continue; // clamped previews are cut on purpose
    const fs = parseFloat(s.fontSize); const lh = parseFloat(s.lineHeight) || fs * 1.5;
    const lines = Math.max(1, Math.round(r.height / (lh * (r.height / (el.offsetHeight || r.height) || 1))));
    const cpl = lines >= 2 ? t.length / lines : t.length;
    if (lines >= 2 && cpl > 110) { if (++ll <= 4) { mark(el); F.push({ kind: "line-length", sel: path(el), detail: `${Math.round(cpl)} ch/line over ${lines} lines` }); } }
  }

  // 7b. text overlap (2026-11-16 owner bug: tab letters merging, wizard step words breaking, headers warping). Overflow/clipping checks
  // pass when a 44px-wide tab spills its label into the next one, so measure the glyphs themselves: every visible text run's line boxes
  // (Range.getClientRects, trimmed to the glyph core) must not intersect another element's text, lines of one run must not overlap
  // each other, and a label must not spill out of its own box (scrollWidth > clientWidth with overflow visible). Fixed chrome is skipped.
  {
    const vis = new Map(), skip = el => { if (vis.has(el)) return vis.get(el); let v = true; for (let e = el; e && e !== de; e = e.parentElement) { const s = cs(e); if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05 || s.position === "fixed") { v = false; break; } if (e.tagName === "DETAILS" && !e.open && e !== el && !el.closest("summary")) { v = false; break; } if (s.clipPath === "inset(50%)" || (/hidden|clip/.test(s.overflow) && e.getBoundingClientRect().width <= 1)) { v = false; break; } } vis.set(el, !v); return !v; };
    const boxes = [], spillEls = new Set(); let nLine = 0, nOver = 0, nSpill = 0, nBreak = 0;
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.trim() ? 1 : 2 });
    for (let n; (n = tw.nextNode());) {
      const el = n.parentElement; if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TITLE)$/.test(el.tagName) || el.closest("[aria-hidden=true], svg, .gp-sr, .k-sr, .sr-only, .visually-hidden, nextjs-portal") || skip(el)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      let clip = null; for (let e = el; e && e !== document.body; e = e.parentElement) { const s = cs(e); if (/(hidden|auto|scroll|clip)/.test(s.overflowX + s.overflowY)) { const c = e.getBoundingClientRect(); clip = clip ? { l: Math.max(clip.l, c.left), r: Math.min(clip.r, c.right), t: Math.max(clip.t, c.top), b: Math.min(clip.b, c.bottom) } : { l: c.left, r: c.right, t: c.top, b: c.bottom }; } }
      const runs = [];
      for (const b of rg.getClientRects()) { let L = b.left, R = b.right, T = b.top, B = b.bottom; if (clip) { L = Math.max(L, clip.l); R = Math.min(R, clip.r); T = Math.max(T, clip.t); B = Math.min(B, clip.b); } if (R - L < 2 || B - T < 2) continue; const k = (B - T) * 0.18; runs.push({ l: L, r: R, t: T + k, b: B - k, el }); }
      for (let i = 1; i < runs.length; i++) { const a = runs[i - 1], c = runs[i]; if (c.t > a.t + 2 && c.t < a.b - 2 && c.l < a.r && a.l < c.r && ++nLine <= 3) { mark(el); F.push({ kind: "text-line-overlap", sel: path(el), detail: `"${txt(el)}" lines overlap ${Math.round(a.b - c.t)}px` }); } }
      boxes.push(...runs);
      // a word of 4+ letters split across two lines ("Mu/sic", "Marketplac/e"): overflow-wrap:anywhere in a column narrower than the word
      if (runs.length > 1 && nBreak < 3) { const re = /[A-Za-zÀ-ɏ]{4,}/g; let m; while ((m = re.exec(n.nodeValue))) { const wr = document.createRange(); wr.setStart(n, m.index); wr.setEnd(n, m.index + m[0].length); if (new Set([...wr.getClientRects()].filter(b => b.width > 0.5).map(b => Math.round(b.top))).size > 1) { nBreak++; mark(el); F.push({ kind: "text-word-break", sel: path(el), detail: `"${m[0]}" split across lines in "${txt(el)}"` }); break; } } }
      const s = cs(el); if (s.overflowX === "visible" && s.display !== "inline" && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2 && !spillEls.has(el)) { spillEls.add(el); if (++nSpill <= 4) { mark(el); F.push({ kind: "text-spill", sel: path(el), detail: `"${txt(el)}" ${el.scrollWidth}px in ${el.clientWidth}px` }); } }
    }
    boxes.sort((a, b) => a.t - b.t);
    for (let i = 0; i < boxes.length && nOver <= 4; i++) for (let j = i + 1; j < boxes.length && boxes[j].t < boxes[i].b; j++) {
      const a = boxes[i], c = boxes[j]; if (a.el === c.el || a.el.contains(c.el) || c.el.contains(a.el)) continue;
      const w = Math.min(a.r, c.r) - Math.max(a.l, c.l), h = Math.min(a.b, c.b) - Math.max(a.t, c.t);
      if (w > 2 && h > 2) { if (++nOver <= 4) { mark(a.el); mark(c.el); F.push({ kind: "text-overlap", sel: `${path(a.el)} ⨯ ${sel(c.el)}`, detail: `"${txt(a.el)}" / "${txt(c.el)}" ${Math.round(w)}×${Math.round(h)}` }); } break; }
    }
  }

  // 8. single stretched column on wide screens: a grid/list of ≥3 siblings stacked one per row in a wide container
  if (wide) {
    let n = 0;
    for (const el of all) {
      const r0 = RECT.get(el); if (r0.width < 1100) continue;
      const s = cs(el); if (!(s.display.includes("grid") || (s.display.includes("flex") && s.flexDirection === "column") || el.matches("ul, ol"))) continue;
      const kids = Array.from(el.children).filter(k => { const r = k.getBoundingClientRect(); return r.width > 0 && r.height > 40; }); if (kids.length < 3) continue;
      const r = el.getBoundingClientRect(); if (r.width < 1100 || r.width < vw * 0.7 || hiddenUp(el)) continue; // a full-width stack, not a list inside a split panel
      const rs = kids.map(k => k.getBoundingClientRect()); if (!rs.every(k => k.width > r.width * 0.85)) continue;
      if (!rs.every((k, i) => i === 0 || k.top >= rs[i - 1].bottom - 2)) continue;
      if (el.closest("footer, form, table, details, [role=tablist], [role=menu], nav, article")) continue; // an article is a reading column (measure checked by line-length)
      if (kids.every(k => k.matches("section, header, footer, main, hr")) ) continue; // page-level section stack
      // only a repeated item list (cards/rows sharing one class) counts — a stack of different blocks is page flow, not a column
      const sig = k => k.tagName + "." + (typeof k.className === "string" ? k.className.trim().split(/\s+/)[0] : "");
      const counts = {}; for (const k of kids) counts[sig(k)] = (counts[sig(k)] ?? 0) + 1;
      const top = Math.max(...Object.values(counts)); if (top < 3 || top < kids.length * 0.6) continue; // mostly one repeated item
      if (kids.every(k => k.textContent.trim().length < 140 && k.getBoundingClientRect().height < 90)) continue; // short rows (FAQ items, table-like lists)
      if (++n <= 3) { mark(el); F.push({ kind: "stretched-column", sel: path(el), detail: `${kids.length} items × ${Math.round(r.width)}px wide` }); }
    }
  }

  // 8b. full width on large screens (owner 2026-11-14: no content-width cap): main content should span the window minus gutters
  const mainText = (document.querySelector("main")?.textContent ?? "").replace(/\s+/g, " ").trim().length;
  if (vw >= 1920 && mainText > 700) { // short state pages (404, expired link) are a centred message card by design
    let L = vw, R = 0; // everything between the site header and footer (legal/help nav rails sit beside <main>)
    for (const el of document.body.querySelectorAll("h1, h2, h3, p, img, a, button, article, aside, nav, li, table, form, [class*=card], [class*=panel], [class*=doc]")) { if (el.closest("header, footer, [role=dialog], nextjs-portal")) continue; const r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 8 || hiddenUp(el)) continue; L = Math.min(L, r.left); R = Math.max(R, r.right); }
    if (R > L && (R - L) < vw * 0.8) F.push({ kind: "content-cap", sel: "main", detail: `content spans ${Math.round(L)}→${Math.round(R)} (${Math.round((R - L) / vw * 100)}% of ${vw})` });
  }

  // 9. brand: G mark only ≤ 640 px; wordmark above
  // the visible header's logo (signed-in shells render both a desktop topbar and the PWA top bar; one is display:none)
  const logo = Array.from(document.querySelectorAll("header .gd-lockup:not(.gd-keep-word)")).find(l => l.getBoundingClientRect().width > 0 && !hiddenUp(l));
  if (logo) { const word = logo.querySelector("img.gd-lockup-word, .gd-lockup-word"); if (word) { const shown = word.getBoundingClientRect().width > 0 && cs(word).display !== "none"; if (vw <= gmarkMax && shown) F.push({ kind: "brand", sel: "header logo", detail: "wordmark shown ≤640px" }); if (vw > gmarkMax && !shown) F.push({ kind: "brand", sel: "header logo", detail: "wordmark hidden >640px" }); } }

  // 10. nav right-aligned on desktop (owner): the main nav sits after the logo, closer to the actions than the centre
  const nav = document.querySelector("header nav[aria-label='Main']"), bar = nav?.closest("header");
  if (nav && full && nav.getBoundingClientRect().width > 0) {
    const nr = nav.getBoundingClientRect(), hr = bar.getBoundingClientRect(); const navCentre = (nr.left + nr.right) / 2;
    const actions = bar.querySelector(".gp-header-actions, [class*=actions]"); const ar = actions?.getBoundingClientRect();
    const gapRight = ar ? ar.left - nr.right : hr.right - nr.right;
    if (gapRight > 80 && navCentre < hr.left + hr.width * 0.62) F.push({ kind: "nav-alignment", sel: path(nav), detail: `nav centred (gap to actions ${Math.round(gapRight)}px)` });
  }
  return F;
}

/** Interactive probes (full cells): open menus / sheets and check they fit and close; primary actions reachable and on top. */
async function probe(page) {
  return page.evaluate(async () => {
    const F = []; const sleep = ms => new Promise(r => setTimeout(r, ms)); const vw = innerWidth, vh = innerHeight;
    const cs = el => getComputedStyle(el);
    const visible = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
      { const d = el.closest("details:not([open])"); if (d && !el.closest("summary")) return false; } /* closed <details> content keeps a layout box in Chrome */
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const s = cs(n); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false; } return true; };
    const txt = el => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
    const esc = () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); };
    scrollTo(0, 0); await sleep(150);
    // nav: the header must offer either visible main links or a menu button that opens a usable panel
    // public header, or (R1 signed-in) the visible workspace topbar / the PWA mobile nav that replaces it below 1280px
    const header = Array.from(document.querySelectorAll("header.gp-header, header.c-top, header.o-top, header.ws-topbar, header.pt-top, header.pwa-top")).find(visible);
    const pwaNav = Array.from(document.querySelectorAll("nav.pwa-tabs")).find(visible);
    if (pwaNav && !(header && !header.matches(".pwa-top") && visible(header))) {
      const tabs = Array.from(pwaNav.querySelectorAll("a, button")).filter(visible);
      if (tabs.length < 2) F.push({ kind: "nav-unusable", sel: "pwa-tabs", detail: `${tabs.length} actions` });
      const menu = pwaNav.querySelector("button[aria-label=Menu]");
      if (menu && visible(menu)) { menu.click(); await sleep(450); const sheet = document.getElementById("pwa-sheet") ?? Array.from(document.querySelectorAll("[role=dialog]")).find(visible);
        if (!sheet || !visible(sheet)) F.push({ kind: "nav-unusable", sel: "pwa menu", detail: "Menu opened nothing" });
        else { const r = sheet.getBoundingClientRect(); const sc = /(auto|scroll)/.test(cs(sheet).overflowY) || sheet.scrollHeight <= sheet.clientHeight + 1 || Array.from(sheet.querySelectorAll("*")).some(k => /(auto|scroll)/.test(cs(k).overflowY) && k.scrollHeight > k.clientHeight);
          if (r.left < -1 || r.right > vw + 1) F.push({ kind: "modal-fit", sel: "pwa sheet", detail: `x ${Math.round(r.left)}→${Math.round(r.right)} of ${vw}` });
          if ((r.top < -1 || r.bottom > vh + 1) && !sc) F.push({ kind: "modal-fit", sel: "pwa sheet", detail: `y ${Math.round(r.top)}→${Math.round(r.bottom)} of ${vh}, not scrollable` });
          // native <dialog> closes on a trusted Escape only; a synthetic keydown can't, so use its close button (what a user taps)
          esc(); await sleep(300); if (visible(sheet)) { sheet.querySelector(".pwa-sheet-head button, button[aria-label^=Close]")?.click(); await sleep(400); } if (visible(sheet)) F.push({ kind: "nav-unusable", sel: "pwa sheet", detail: "does not close (Escape / Menu)" }); }
      }
    } else if (header) {
      const navLinks = Array.from(header.querySelectorAll("nav a")).filter(visible);
      const menuBtn = Array.from(header.querySelectorAll("button[aria-haspopup], button[aria-expanded], button[aria-label*=menu i]")).find(visible);
      if (!navLinks.length && !menuBtn) F.push({ kind: "nav-unusable", sel: "header", detail: "no visible nav links and no menu button" });
      if (menuBtn && menuBtn.matches(".gp-menu-btn, [aria-label*=menu i]")) {
        menuBtn.click(); await sleep(450);
        const panel = Array.from(document.querySelectorAll("[role=dialog], [role=menu], .gp-sheet-panel")).find(visible);
        if (!panel) F.push({ kind: "nav-unusable", sel: "menu", detail: `"${txt(menuBtn)}" opened nothing` });
        else {
          const r = panel.getBoundingClientRect(); const s = cs(panel);
          const scrolls = /(auto|scroll)/.test(s.overflowY) || panel.scrollHeight <= panel.clientHeight + 1;
          if (r.left < -1 || r.right > vw + 1) F.push({ kind: "modal-fit", sel: "menu panel", detail: `x ${Math.round(r.left)}→${Math.round(r.right)} of ${vw}` });
          if ((r.top < -1 || r.bottom > vh + 1) && !scrolls) F.push({ kind: "modal-fit", sel: "menu panel", detail: `y ${Math.round(r.top)}→${Math.round(r.bottom)} of ${vh}, not scrollable` });
          const links = Array.from(panel.querySelectorAll("a, button")).filter(visible);
          if (links.length < 3) F.push({ kind: "nav-unusable", sel: "menu panel", detail: `${links.length} actions` });
          // every action must be reachable: in view or scrollable to
          const last = links[links.length - 1]; if (last) { last.scrollIntoView({ block: "nearest" }); await sleep(80); const lr = last.getBoundingClientRect(); if (lr.bottom > vh + 1 || lr.top < 0) F.push({ kind: "modal-fit", sel: "menu panel", detail: `last action "${txt(last)}" unreachable` }); }
          esc(); await sleep(400);
          if (visible(panel) && document.contains(panel)) { const close = document.querySelector("[role=dialog] button[aria-label*=close i], .gp-sheet-close"); close?.click(); await sleep(400); if (document.contains(panel) && visible(panel)) F.push({ kind: "nav-unusable", sel: "menu panel", detail: "does not close (Escape / close button)" }); }
        }
      }
    }
    // other popups in the first screen: dialogs / listboxes / menus fit the viewport
    const triggers = Array.from(document.querySelectorAll("main [aria-haspopup], main button[aria-expanded=false]")).filter(el => { if (!visible(el)) return false; const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= vh; }).slice(0, 4);
    for (const t of triggers) {
      const before = new Set(document.querySelectorAll("[role=dialog], [role=menu], [role=listbox], [data-radix-popper-content-wrapper]"));
      t.click(); await sleep(400);
      const opened = Array.from(document.querySelectorAll("[role=dialog], [role=menu], [role=listbox], [data-radix-popper-content-wrapper]")).filter(m => visible(m) && (!before.has(m) || t.getAttribute("aria-expanded") === "true"));
      for (const m of opened) { const r = m.getBoundingClientRect(); const s = cs(m); const scrolls = /(auto|scroll)/.test(s.overflowY) || m.scrollHeight <= m.clientHeight + 1; if (r.left < -1 || r.right > vw + 1 || ((r.bottom > vh + 1 || r.top < -1) && !scrolls && r.height > vh)) F.push({ kind: "modal-fit", sel: `popup of "${txt(t)}"`, detail: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)} in ${vw}×${vh}` }); }
      esc(); await sleep(250); if (t.getAttribute("aria-expanded") === "true") { t.click(); await sleep(200); }
    }
    // primary actions: at least one visible; each scrolled into view is the topmost element at its centre (not under sticky chrome)
    const prim = Array.from(document.querySelectorAll("main .gp-btn--primary, main button[type=submit], main .k-btn.primary, main [data-primary], main .btn-primary, main .c-btn.primary")).filter(visible);
    // a primary hidden on its own (responsive CSS on the button or its wrapper) counts; one inside a closed drawer / dialog / panel does not
    const selfHidden = el => { for (let n = el, d = 0; n && d < 2; n = n.parentElement, d++) if (cs(n).display === "none" || cs(n).visibility === "hidden") return !n.closest("[hidden], details:not([open]), dialog:not([open]), [inert], [aria-hidden=true], [role=dialog], [class*=drawer], [class*=modal], [class*=sheet], [class*=bulk]") || n === el; return false; };
    const anyPrim = Array.from(document.querySelectorAll("main .gp-btn--primary, main button[type=submit], main .k-btn.primary, main [data-primary]")).find(selfHidden);
    if (anyPrim && !prim.length) F.push({ kind: "primary-hidden", sel: "main", detail: "primary actions exist but none is visible" });
    for (const b of prim.slice(0, 5)) {
      b.scrollIntoView({ block: "center", behavior: "instant" }); await sleep(120);
      const r = b.getBoundingClientRect();
      const inScroller = (() => { for (let n = b.parentElement; n && n !== document.body; n = n.parentElement) { const o = cs(n).overflowX; if ((o === "auto" || o === "scroll") && n.scrollWidth > n.clientWidth + 2) return true; } return false; })();
      if ((r.right > vw + 1 || r.left < -1) && !inScroller) { F.push({ kind: "primary-offscreen", sel: txt(b), detail: `x ${Math.round(r.left)}→${Math.round(r.right)} of ${vw}` }); continue; }
      const top = document.elementFromPoint(Math.min(vw - 1, r.left + r.width / 2), Math.min(vh - 1, Math.max(0, r.top + r.height / 2)));
      if (top && !b.contains(top) && !top.contains(b)) F.push({ kind: "primary-covered", sel: txt(b), detail: `covered by ${top.tagName.toLowerCase()}.${String(top.className).split(" ")[0]}` });
    }
    scrollTo(0, 0); await sleep(100);
    return F;
  });
}

// A plan entry carries its own storageState (signed-in workspace) and cell set; plain --routes use --state / --set.
const PLAN = arg("plan") ? JSON.parse(fs.readFileSync(arg("plan"), "utf8")) : null;
const planItems = PLAN ?? ((arg("routes")?.split(",")) ?? ROUTES).map(route => ({ route, state: arg("state"), label: arg("label"), set: arg("set") }));
const routes = planItems.map(p => p.route);
const cellFilter = arg("cells")?.split(",");
const cellsFor = set => CELLS.filter(c => (!cellFilter || cellFilter.some(f => c.name.startsWith(f) || c.cat === f)) && (set !== "reduced" || REDUCED.includes(c.name)));
const cells = cellsFor(arg("set"));
const results = []; const t0 = Date.now();
// a page that keeps navigating (client redirects, live refresh) must not hang the run: each in-page check gets a deadline
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000}s`)), ms))]);
const PREV = fs.existsSync(REPORT) && (arg("routes") || arg("merge")) ? JSON.parse(fs.readFileSync(REPORT, "utf8")) : null;
const FAILING = process.argv.includes("--failing") && PREV ? new Set(PREV.results.filter(r => r.cat && r.findings?.length).map(r => `${r.route}|${r.cell}`)) : null;
const RERUN = new Set();
async function serverUp(maxMs = 240000) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) { try { const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(10000) }); if (r.status < 500) return true; } catch { /* restarting */ } await new Promise(r => setTimeout(r, 5000)); }
  return false;
}
const browser = await chromium.launch({ args: ["--disable-gpu", "--js-flags=--max-old-space-size=512"] });
let shots = 0, routeNo = 0; const shotKeys = new Set(); const MAX_SHOTS = Number(arg("max-shots") ?? 300);
const consentCookie = { name: "gd_cc", value: "1", domain: new URL(BASE).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" };
const ctxs = new Map(); // one context per storageState, all in the one browser
async function ctxFor(state) {
  const key = state ?? "(anon)"; if (ctxs.has(key)) return ctxs.get(key);
  const st = state ? JSON.parse(fs.readFileSync(state, "utf8")) : { cookies: [], origins: [] };
  st.cookies = [...st.cookies.filter(c => c.name !== "gd_cc"), consentCookie];
  const ctx = await browser.newContext({ viewport: null, reducedMotion: "reduce", storageState: st });
  // Dev-only HMR socket: proxied, minus its full-reload messages — after a watchdog restart the dev client otherwise reload-loops ("HMR hash mismatch").
  await ctx.routeWebSocket(/_next\/(webpack-)?hmr|turbopack-hmr/, ws => { const server = ws.connectToServer(); server.onMessage(m => { if (typeof m === "string" && /"reloadPage"|"type":"restart"/.test(m)) return; ws.send(m); }); });
  ctxs.set(key, ctx); return ctx;
}
try {
  let ctx = null, page = null;
  for (const item of planItems) {
    const route = item.route; await ramGuard(route);
    // --failing: re-run only the cells of this route that failed in the existing report (after fixes); everything else is kept
    const cells = FAILING ? cellsFor(item.set ?? arg("set")).filter(c => FAILING.has(`${route}|${c.name}`)) : cellsFor(item.set ?? arg("set"));
    if (FAILING && !cells.length) continue;
    for (const c of cells) RERUN.add(`${route}|${c.name}`);
    const want = await ctxFor(item.state);
    if (want !== ctx) { if (page) await page.close().catch(() => {}); ctx = want; page = await ctx.newPage(); }
    else if (++routeNo % 8 === 0) { await page.close(); page = await ctx.newPage(); } // keep renderer memory flat
    const cdp = await ctx.newCDPSession(page);
    const errors = [];
    const onConsole = m => { if (m.type() === "error" && !/favicon|React DevTools|\[HMR\]|webpack-hmr|_next\/(webpack|hmr)|net::ERR_ABORTED|Fast Refresh/.test(m.text()) && !(/status of 404/.test(m.text()) && /not-exist|invalid/.test(page.url()))) errors.push(m.text().slice(0, 220)); };
    const onErr = e => errors.push(`pageerror: ${String(e.message).slice(0, 220)}`);
    page.on("console", onConsole); page.on("pageerror", onErr);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1536, height: 864, deviceScaleFactor: 1, mobile: false });
    let loaded = false, home = route.split("?")[0];
    for (let attempt = 0; attempt < 2 && !loaded; attempt++) {
      try { const resp = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 180000 }); await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1200); loaded = true; const landed = new URL(page.url()).pathname; home = landed; const bounced = item.state && /^\/(login|admin\/login|mfa)/.test(landed) && !/^\/(login|mfa)/.test(route);
        results.push({ route, label: item.label, cell: "(load)", status: resp?.status() ?? 0, landed, findings: bounced ? [{ kind: "auth-bounce", sel: route, detail: `redirected to ${landed}` }] : (resp?.status() ?? 0) >= 500 ? [{ kind: "http-5xx", sel: route, detail: String(resp.status()) }] : [] });
        await page.addStyleTag({ content: 'button[aria-label="Open design overlay"],[class*=overlay-ctl]{display:none!important}' }).catch(() => {}); }
      catch (e) { if (!(await serverUp())) break; if (attempt) results.push({ route, cell: "(load)", error: String(e.message).slice(0, 200), findings: [{ kind: "load-error", sel: route, detail: String(e.message).slice(0, 160) }] }); }
    }
    if (!loaded) { page.off("console", onConsole); page.off("pageerror", onErr); continue; }
    const loadErrors = [...errors]; errors.length = 0;
    if (loadErrors.length) results.push({ route, cell: "(console)", findings: loadErrors.slice(0, 5).map(e => ({ kind: "console-error", sel: route, detail: e })) });
    for (const cell of cells) {
      const c0 = Date.now();
      try {
        // touch first, so resize listeners that read (pointer: coarse) see the new input type
        await cdp.send("Emulation.setTouchEmulationEnabled", cell.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: cell.w, height: cell.h, deviceScaleFactor: cell.dpr, mobile: cell.touch, screenWidth: cell.w, screenHeight: cell.h, screenOrientation: cell.w > cell.h ? { type: "landscapePrimary", angle: 90 } : { type: "portraitPrimary", angle: 0 } });
        await page.waitForTimeout(350);
        if (!page.url().startsWith(BASE + (home === "/" ? "/" : home)) && !/not-exist|invalid/.test(route)) { await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 120000 }); await page.waitForTimeout(600); }
        const findings = await withTimeout(page.evaluate(inspect, { touch: cell.touch, wide: cell.w >= 1600, full: !!cell.full || cell.w >= 1100, gmarkMax: 640, W: cell.w }), 60000, "inspect");
        if (cell.full) {
          const pf = await withTimeout(probe(page), 60000, "probe").catch(e => [{ kind: "probe-error", sel: "probe", detail: String(e.message).slice(0, 120) }]);
          findings.push(...pf);
          if (!page.url().startsWith(BASE + home) && !/not-exist|invalid/.test(route)) { await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 120000 }); await page.waitForTimeout(600); }
        }
        if (errors.length) { findings.push(...errors.slice(0, 3).map(e => ({ kind: "console-error", sel: route, detail: e }))); errors.length = 0; }
        const row = { route, label: item.label, cell: cell.name, cat: cell.cat, w: cell.w, h: cell.h, dpr: cell.dpr, touch: cell.touch, findings, ms: Date.now() - c0 };
        const shotKey = route + '|' + cell.cat + '|' + [...new Set(findings.map(f => f.kind))].sort().join(',');
        if (findings.length && shots < MAX_SHOTS && !shotKeys.has(shotKey)) {
          shotKeys.add(shotKey);
          const file = `${OUT}/${route.replace(/\W+/g, "_").replace(/^_|_$/g, "") || "home"}--${cell.name}.png`;
          await cdp.send("Emulation.setDeviceMetricsOverride", { width: cell.w, height: cell.h, deviceScaleFactor: 1, mobile: cell.touch });
          await page.screenshot({ path: file, timeout: 30000 }).then(() => { row.shot = file; shots++; }).catch(() => {});
        }
        // clear outlines left by the marker
        await page.evaluate(() => { for (const el of document.querySelectorAll("[style*='outline: rgb(255, 0, 85)'], [style*='#ff0055']")) { el.style.outline = ""; el.style.outlineOffset = ""; } });
        results.push(row);
        console.log(`${findings.length ? "FAIL" : "ok  "} ${route} ${cell.name} ${row.ms}ms${findings.length ? " " + [...new Set(findings.map(f => f.kind))].join(",") : ""}`);
      } catch (e) {
        results.push({ route, cell: cell.name, error: String(e.message).slice(0, 200), findings: [{ kind: "cell-error", sel: route, detail: String(e.message).slice(0, 160) }] });
        console.log(`ERR  ${route} ${cell.name} ${String(e.message).slice(0, 120)}`);
        if (/Target closed|crashed|detached/.test(e.message)) { page = await ctx.newPage(); break; }
      }
    }
    page.off("console", onConsole); page.off("pageerror", onErr);
    await cdp.detach().catch(() => {});
    writeReport();
  }
} finally { for (const [k, c] of ctxs) if (k !== "(anon)") await c.storageState({ path: k }).catch(() => {}); await browser.close(); } // keep rotated sessions

function writeReport() {
  const prev = PREV;
  const merged = prev ? [...prev.results.filter(r => FAILING ? !RERUN.has(`${r.route}|${r.cell}`) && !(String(r.cell).startsWith("(") && results.some(x => x.route === r.route && x.cell === r.cell)) : (!routes.includes(r.route) || (cellFilter && !cells.some(c => c.name === r.cell) && !String(r.cell).startsWith("(")))), ...results] : results;
  const cellRows = merged.filter(r => !String(r.cell).startsWith("("));
  const byKind = {}; for (const r of merged) for (const f of r.findings ?? []) { byKind[f.kind] ??= { cells: 0, samples: {} }; byKind[f.kind].cells++; const k = f.sel; byKind[f.kind].samples[k] ??= []; if (byKind[f.kind].samples[k].length < 4) byKind[f.kind].samples[k].push(`${r.route} @ ${r.cell}: ${f.detail}`); }
  const summary = { at: new Date().toISOString(), minutes: Math.round((Date.now() - t0) / 60000), routes: new Set(merged.map(r => r.route)).size, cellsPerRoute: CELLS.length,
    cells: cellRows.length, passed: cellRows.filter(r => !r.findings.length).length, failed: cellRows.filter(r => r.findings.length).length,
    byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.cells])) };
  if (PLAN) summary.cellsPerRoute = { full: cellsFor("full").length, reduced: cellsFor("reduced").length };
  fs.writeFileSync(REPORT, JSON.stringify({ summary, matrix: CELLS.map(c => ({ name: c.name, cat: c.cat, w: c.w, h: c.h, dpr: c.dpr, touch: c.touch, probes: !!c.full })), findings: byKind, results: merged }, null, 1));
  return summary;
}
console.log(JSON.stringify(writeReport(), null, 1));
