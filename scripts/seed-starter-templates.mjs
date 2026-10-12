// Seeds Gala Dock starter templates (platform templates: workspace_id and owner_id null, public, active) for the Media Studio
// Templates tab. Premium design system: fixed margins and grid, refined type scale (small-caps eyebrows with wide tracking, tight
// display headings, serif/sans pairings), hairline rules, mesh-gradient backdrops from soft colour orbs, frosted-glass panels.
// Every layout ships in curated colourways. {{event.*}} placeholders, no stock photography. Idempotent (tag "gala-starter").
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-starter-templates.mjs
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let n = 0; const id = () => `t${(++n).toString(36)}`;
const SIZE = { poster: [1240, 1754], portrait: [1080, 1350], square: [1080, 1080], story: [1080, 1920], screen: [1920, 1080] };

// ── colourways
const DARK = {
  Midnight: { bg: "#07081a", ink: "#ffffff", sub: "#a9aed6", accent: "#d4b47a", a2: "#6d7bff", orbs: ["#2b31d9", "#5b1e8f", "#b8935a"] },
  Noir: { bg: "#0b0708", ink: "#fff6f3", sub: "#cbb6b2", accent: "#e8a598", a2: "#8a3446", orbs: ["#7a2e3a", "#3d1621", "#c97a6c"] },
  Ocean: { bg: "#03111f", ink: "#ecf7ff", sub: "#9db8cc", accent: "#62e3d4", a2: "#2f7bff", orbs: ["#0b4f8a", "#1f6feb", "#25a99a"] },
  Emerald: { bg: "#04140f", ink: "#f1fbf6", sub: "#a7c6b8", accent: "#dcbc7c", a2: "#2a8a66", orbs: ["#0f5a43", "#1f7a5a", "#9c8148"] },
  Ultraviolet: { bg: "#06030f", ink: "#ffffff", sub: "#b7a9d9", accent: "#ff4fd8", a2: "#3cf0ff", orbs: ["#7a1fd1", "#ff2fa8", "#1fb8ff"] },
};
const LIGHT = {
  Ivory: { bg: "#f7f4ee", ink: "#14130f", sub: "#6e685c", accent: "#a8834e", a2: "#1d1c19", orbs: ["#ead8bb", "#f2e7d6", "#dcc7a3"] },
  Porcelain: { bg: "#f3f5fb", ink: "#0b1230", sub: "#5c6688", accent: "#2f4cff", a2: "#0b1230", orbs: ["#cdd7ff", "#e4e9ff", "#b7c5ff"] },
  Blush: { bg: "#fbf3f1", ink: "#2a1518", sub: "#80656a", accent: "#c2697a", a2: "#2a1518", orbs: ["#f6d3d3", "#fae4e0", "#efc2c8"] },
  Sage: { bg: "#f2f3ec", ink: "#1b2a22", sub: "#5e6e64", accent: "#4f7a63", a2: "#1b2a22", orbs: ["#d7e3d2", "#e8eee2", "#c3d4bf"] },
};
const alpha = (hex, a) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;

// ── primitives
const T = (text, o) => ({ id: id(), name: o.name ?? text.replace(/[{}]/g, "").slice(0, 28), type: "text", text, bind: o.bind, font: o.font ?? "Inter", size: o.size, weight: o.weight ?? 600, italic: o.italic,
  color: o.color, fill: o.fill, align: o.align ?? "left", valign: o.valign ?? "top", lineHeight: o.lh ?? 1.15, letterSpacing: o.ls ?? 0, transform: o.tt, x: o.x, y: o.y, w: o.w, h: o.h, rotation: 0, effects: o.fx });
const R = (o) => ({ id: id(), name: o.name ?? "Panel", type: "shape", shape: o.shape ?? "rect", fill: o.fill, x: o.x, y: o.y, w: o.w, h: o.h, rotation: o.r ?? 0, effects: o.fx });
const solid = color => ({ type: "solid", color });
/** Soft colour orb: radial gradient to transparent — the building block of the mesh backdrops. */
const orb = (cx, cy, r, color, a = 0.75) => R({ name: "Glow", shape: "ellipse", fill: { type: "radial", stops: [{ offset: 0, color: alpha(color, a) }, { offset: 0.3, color: alpha(color, a * 0.55) }, { offset: 0.5, color: alpha(color, a * 0.18) }, { offset: 0.68, color: alpha(color, 0) }] }, x: cx - r, y: cy - r, w: r * 2, h: r * 2 });
const hair = (x, y, w, color, t = 1.5) => R({ name: "Rule", fill: solid(color), x, y, w, h: t });
const vhair = (x, y, h, color, t = 1.5) => R({ name: "Rule", fill: solid(color), x, y, w: t, h });
const frame = (inset, W, H, color, t = 1.5) => R({ name: "Frame", fill: solid("transparent"), x: inset, y: inset, w: W - inset * 2, h: H - inset * 2, fx: { stroke: { width: t, color } } });
const glass = (x, y, w, h, r, dark = true) => R({ name: "Glass panel", fill: solid(dark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.72)"), x, y, w, h, fx: { radius: r, stroke: { width: 1.5, color: dark ? "rgba(255,255,255,0.18)" : "rgba(20,20,40,0.08)" }, shadow: dark ? null : { x: 0, y: 18, blur: 48, color: "rgba(20,24,60,0.12)" } } });
const eyebrow = (text, o) => T(text, { font: o.font ?? "Inter", weight: 600, size: o.size, ls: o.size * 0.28, tt: "uppercase", color: o.color, x: o.x, y: o.y, w: o.w, h: o.size * 1.6, align: o.align ?? "left", name: o.name ?? "Eyebrow" });
const qr = (o) => ({ id: id(), name: "Ticket QR", type: "qr", value: "{{event.public_url}}", bind: "event.public_url", fg: o.fg ?? "#0b0b14", bg: o.bg ?? "#ffffff", x: o.x, y: o.y, w: o.s, h: o.s, rotation: 0 });
const icon = (name, o) => ({ id: id(), name, type: "icon", icon: name, color: o.color, x: o.x, y: o.y, w: o.s, h: o.s, rotation: 0 });
/** DATE / TIME / VENUE columns with hairline dividers. */
function details(x, y, w, c, u, cols = [["Date", "{{event.date}}"], ["Doors", "{{event.time}}"], ["Venue", "{{event.venue_name}}"]], valueFont = "Inter") {
  const cw = w / cols.length, out = [];
  cols.forEach(([label, value], i) => {
    const cx = x + cw * i + (i ? u * 0.03 : 0);
    if (i) out.push(vhair(x + cw * i, y, u * 0.1, alpha(c.sub, 0.45)));
    out.push(eyebrow(label, { size: u * 0.016, color: c.accent, x: cx, y, w: cw - u * 0.04 }));
    out.push(T(value, { font: valueFont, weight: 500, size: u * 0.026, color: c.ink, x: cx, y: y + u * 0.035, w: cw - u * 0.04, h: u * 0.08, lh: 1.25, name: label }));
  });
  return out;
}

const OUT = [];
const add = (title, category, size, c, layers, tags) => { const [W, H] = SIZE[size]; OUT.push({ title, category, tags: ["gala-starter", size, ...tags], width: W, height: H, document: { unit: "px", dpi: 150, pages: [{ id: id(), name: title, width: W, height: H, background: solid(c.bg), layers: layers(W, H) }] } }); };

// ── A. Editorial poster (serif display, mesh glow, detail grid, glass ticket panel)
const editorial = (name, cat, size, c, serif, tags) => add(`${name}`, cat, size, c, (W, H) => { const m = W * 0.075, u = W;
  return [
    orb(W * 0.86, H * 0.12, W * 0.62, c.orbs[0], 0.7), orb(W * 0.05, H * 0.5, W * 0.55, c.orbs[1], 0.55), orb(W * 0.7, H * 0.95, W * 0.6, c.orbs[2], 0.45),
    frame(m * 0.45, W, H, alpha(c.ink, 0.16)),
    eyebrow("{{organizer.name}} presents", { size: u * 0.017, color: c.sub, x: m, y: m, w: W * 0.5 }),
    eyebrow("{{event.city}}", { size: u * 0.017, color: c.sub, x: W * 0.5, y: m, w: W * 0.5 - m, align: "right" }),
    T("{{event.name}}", { bind: "event.name", font: serif, weight: serif === "Instrument Serif" || serif === "DM Serif Display" ? 400 : 600, size: u * 0.128, lh: 0.94, ls: -u * 0.002, color: c.ink, x: m, y: H * 0.22, w: W - m * 2, h: H * 0.38, valign: "bottom", name: "Event name" }),
    T("An evening to remember", { font: "Instrument Serif", weight: 400, italic: true, size: u * 0.04, color: c.accent, x: m, y: H * 0.61, w: W - m * 2, h: u * 0.06, name: "Tagline" }),
    hair(m, H * 0.675, W - m * 2, alpha(c.ink, 0.22)),
    ...details(m, H * 0.695, W - m * 2, c, u),
    glass(m, H - m - u * 0.2, W - m * 2, u * 0.2, u * 0.024),
    eyebrow("Tickets from", { size: u * 0.016, color: c.sub, x: m + u * 0.04, y: H - m - u * 0.16, w: W * 0.5 }),
    T("{{ticket.starting_price}}", { font: serif, weight: serif === "Instrument Serif" || serif === "DM Serif Display" ? 400 : 600, size: u * 0.06, color: c.ink, x: m + u * 0.04, y: H - m - u * 0.125, w: W * 0.5, h: u * 0.08, name: "Price" }),
    T("Scan to book", { font: "Inter", weight: 500, size: u * 0.018, color: c.sub, x: W - m - u * 0.42, y: H - m - u * 0.105, w: u * 0.2, h: u * 0.03, align: "right", name: "Scan to book" }),
    qr({ x: W - m - u * 0.185, y: H - m - u * 0.185, s: u * 0.17 }),
  ]; }, tags);

// ── B. Swiss modern (light, strict grid, oversized sans, accent block)
const swiss = (name, cat, size, c, tags) => add(name, cat, size, c, (W, H) => { const m = W * 0.07, u = W, col = (W - m * 2) / 12;
  return [
    R({ name: "Accent block", fill: solid(c.accent), x: 0, y: 0, w: m + col * 4, h: H * 0.42 }),
    eyebrow("Event", { size: u * 0.016, color: alpha("#ffffff", 0.85), x: m, y: m, w: col * 4 }),
    T("{{event.date}}", { font: "Inter Tight", weight: 700, size: u * 0.05, lh: 1.02, ls: -u * 0.001, color: "#ffffff", x: m, y: H * 0.42 - m - u * 0.13, w: col * 4 - u * 0.02, h: u * 0.13, valign: "bottom", name: "Date" }),
    vhair(m + col * 5, m, H - m * 2, alpha(c.ink, 0.12)),
    eyebrow("{{event.city}} — {{event.time}}", { size: u * 0.016, color: c.sub, x: m + col * 5.4, y: m, w: col * 6.6 }),
    T("{{event.name}}", { bind: "event.name", font: "Inter Tight", weight: 800, size: u * 0.118, lh: 0.9, ls: -u * 0.005, color: c.ink, x: m + col * 5.4, y: H * 0.12, w: col * 6.6, h: H * 0.5, name: "Event name" }),
    hair(m, H * 0.66, W - m * 2, c.ink, 3),
    eyebrow("Venue", { size: u * 0.016, color: c.accent, x: m, y: H * 0.68, w: col * 4 }),
    T("{{event.venue_name}}", { font: "Inter Tight", weight: 600, size: u * 0.034, lh: 1.15, color: c.ink, x: m, y: H * 0.68 + u * 0.035, w: col * 4.6, h: u * 0.12, name: "Venue" }),
    eyebrow("Tickets", { size: u * 0.016, color: c.accent, x: m + col * 5.4, y: H * 0.68, w: col * 3 }),
    T("from {{ticket.starting_price}}", { font: "Inter Tight", weight: 600, size: u * 0.034, color: c.ink, x: m + col * 5.4, y: H * 0.68 + u * 0.035, w: col * 4, h: u * 0.06, name: "Price" }),
    qr({ x: W - m - u * 0.16, y: H - m - u * 0.16, s: u * 0.16, fg: c.ink, bg: c.bg }),
    T("galadock.com", { font: "Inter", weight: 500, size: u * 0.016, color: c.sub, x: m, y: H - m - u * 0.03, w: col * 5, h: u * 0.03, name: "Footer" }),
  ]; }, tags);

// ── C. Luxury gala (centred, script + inscriptional caps, double gold frame, ornament)
const gala = (name, cat, size, c, caps, tags) => add(name, cat, size, c, (W, H) => { const m = W * 0.06, u = W;
  return [
    orb(W / 2, H * 0.36, W * 0.7, c.orbs[2], 0.38),
    frame(m, W, H, alpha(c.accent, 0.85), 2), frame(m + u * 0.014, W, H, alpha(c.accent, 0.4), 1),
    T("You are cordially invited", { font: "Pinyon Script", weight: 400, size: u * 0.06, color: c.accent, x: m, y: H * 0.17, w: W - m * 2, h: u * 0.1, align: "center", name: "Invitation" }),
    T("{{event.name}}", { bind: "event.name", font: caps, weight: 500, size: u * 0.085, lh: 1.08, ls: u * 0.006, tt: "uppercase", color: c.ink, x: m * 2, y: H * 0.27, w: W - m * 4, h: H * 0.24, align: "center", valign: "middle", name: "Event name" }),
    T("✦", { font: "Inter", weight: 400, size: u * 0.03, color: c.accent, x: 0, y: H * 0.53, w: W, h: u * 0.05, align: "center", name: "Ornament" }),
    hair(W * 0.3, H * 0.545, W * 0.15, alpha(c.accent, 0.7)), hair(W * 0.55, H * 0.545, W * 0.15, alpha(c.accent, 0.7)),
    T("{{event.date}}", { font: "Cormorant Garamond", weight: 500, size: u * 0.048, color: c.ink, x: m, y: H * 0.6, w: W - m * 2, h: u * 0.07, align: "center", name: "Date" }),
    eyebrow("Seven thirty in the evening", { size: u * 0.017, color: c.sub, x: m, y: H * 0.6 + u * 0.08, w: W - m * 2, align: "center" }),
    T("{{event.venue_name}}", { font: "Cormorant Garamond", weight: 500, italic: true, size: u * 0.04, color: c.ink, x: m, y: H * 0.72, w: W - m * 2, h: u * 0.06, align: "center", name: "Venue" }),
    eyebrow("{{event.city}}", { size: u * 0.017, color: c.sub, x: m, y: H * 0.72 + u * 0.065, w: W - m * 2, align: "center" }),
    eyebrow("Black tie  ·  RSVP via QR", { size: u * 0.016, color: c.accent, x: m, y: H - m - u * 0.2, w: W - m * 2, align: "center" }),
    qr({ x: W / 2 - u * 0.065, y: H - m - u * 0.16, s: u * 0.13, fg: c.bg, bg: c.accent }),
  ]; }, tags);

// ── D. Neon night (condensed display, gradient type, line-up with hairlines, glass QR)
const neon = (name, cat, size, c, display, tags) => add(name, cat, size, c, (W, H) => { const m = W * 0.07, u = W;
  const acts = ["Headliner", "Special guest", "Resident DJs", "Late set"];
  return [
    orb(W * 0.18, H * 0.16, W * 0.6, c.orbs[0], 0.85), orb(W * 0.95, H * 0.45, W * 0.55, c.orbs[1], 0.7), orb(W * 0.3, H * 0.98, W * 0.5, c.orbs[2], 0.55),
    eyebrow("Live  ·  {{event.city}}", { size: u * 0.018, color: c.ink, x: m, y: m, w: W - m * 2 }),
    T("{{event.name}}", { bind: "event.name", font: display, weight: display === "Anton" || display === "Bebas Neue" ? 400 : 800, size: u * (display === "Unbounded" ? 0.1 : display === "Syne" ? 0.115 : 0.15), lh: 0.92, ls: display === "Unbounded" ? -u * 0.003 : u * 0.002, tt: "uppercase",
      fill: { type: "linear", angle: 100, stops: [{ offset: 0, color: "#ffffff" }, { offset: 0.55, color: c.accent }, { offset: 1, color: c.a2 }] }, color: c.ink, x: m, y: H * 0.1, w: W - m * 2, h: H * 0.38, valign: "bottom", name: "Event name",
      fx: { glow: { blur: u * 0.02, color: alpha(c.accent, 0.55) } } }),
    hair(m, H * 0.52, W - m * 2, alpha(c.ink, 0.25)),
    ...acts.flatMap((a, i) => [T(i === 0 ? "{{organizer.name}}" : a, { font: "Inter", weight: i === 0 ? 700 : 500, size: u * (i === 0 ? 0.045 : 0.03), color: i === 0 ? c.ink : c.sub, x: m, y: H * 0.54 + i * u * 0.075, w: W * 0.6, h: u * 0.06, name: `Act ${i + 1}` }),
      hair(m, H * 0.54 + i * u * 0.075 + u * 0.068, W * 0.55, alpha(c.ink, 0.1), 1)]),
    ...details(m, H * 0.83, W * 0.58, c, u, [["Date", "{{event.date}}"], ["Doors", "{{event.time}}"]]),
    glass(W - m - u * 0.28, H * 0.72, u * 0.28, u * 0.34, u * 0.03),
    qr({ x: W - m - u * 0.24, y: H * 0.72 + u * 0.04, s: u * 0.2 }),
    T("Tickets {{ticket.starting_price}}", { font: "Inter", weight: 600, size: u * 0.02, color: c.ink, x: W - m - u * 0.28, y: H * 0.72 + u * 0.26, w: u * 0.28, h: u * 0.04, align: "center", name: "Price" }),
  ]; }, tags);

// ── E. Minimal light (off-white, one accent disc, editorial serif)
const minimal = (name, cat, size, c, serif, tags) => add(name, cat, size, c, (W, H) => { const m = W * 0.08, u = W;
  return [
    R({ name: "Accent disc", shape: "ellipse", fill: { type: "linear", angle: 145, stops: [{ offset: 0, color: c.accent }, { offset: 1, color: alpha(c.accent, 0.75) }] }, x: W * 0.52, y: -W * 0.12, w: W * 0.6, h: W * 0.6 }),
    eyebrow("{{event.date}}", { size: u * 0.017, color: c.sub, x: m, y: m, w: W * 0.4 }),
    T("{{event.name}}", { bind: "event.name", font: serif, weight: serif === "Instrument Serif" || serif === "DM Serif Display" || serif === "Gloock" ? 400 : 500, size: u * 0.125, lh: 0.96, ls: -u * 0.002, color: c.ink, x: m, y: H * 0.36, w: W - m * 2, h: H * 0.3, valign: "bottom", name: "Event name" }),
    T("{{event.venue_name}}, {{event.city}}", { font: "Inter", weight: 500, size: u * 0.026, color: c.sub, x: m, y: H * 0.68, w: W - m * 2, h: u * 0.05, name: "Venue" }),
    hair(m, H * 0.76, W - m * 2, alpha(c.ink, 0.15)),
    eyebrow("Doors", { size: u * 0.016, color: c.accent, x: m, y: H * 0.79, w: W * 0.3 }),
    T("{{event.time}}", { font: "Inter", weight: 600, size: u * 0.03, color: c.ink, x: m, y: H * 0.79 + u * 0.034, w: W * 0.3, h: u * 0.05, name: "Time" }),
    eyebrow("Tickets", { size: u * 0.016, color: c.accent, x: m + W * 0.3, y: H * 0.79, w: W * 0.3 }),
    T("{{ticket.starting_price}}", { font: "Inter", weight: 600, size: u * 0.03, color: c.ink, x: m + W * 0.3, y: H * 0.79 + u * 0.034, w: W * 0.3, h: u * 0.05, name: "Price" }),
    qr({ x: W - m - u * 0.13, y: H - m - u * 0.13, s: u * 0.13, fg: c.ink, bg: c.bg }),
  ]; }, tags);

// ── F. Story 9:16 (mesh glow, centred title, glass detail stack, QR)
const story = (name, cat, c, display, headline, tags) => add(name, cat, "story", c, (W, H) => { const m = W * 0.08, u = W;
  return [
    orb(W * 0.15, H * 0.18, W * 0.75, c.orbs[0], 0.8), orb(W * 0.95, H * 0.5, W * 0.7, c.orbs[1], 0.6), orb(W * 0.4, H * 0.92, W * 0.7, c.orbs[2], 0.5),
    eyebrow(headline, { size: u * 0.026, color: c.accent, x: m, y: H * 0.1, w: W - m * 2, align: "center" }),
    T("{{event.name}}", { bind: "event.name", font: display, weight: display === "Instrument Serif" ? 400 : 700, italic: display === "Instrument Serif", size: u * 0.14, lh: 0.95, ls: -u * 0.002, color: c.ink, x: m, y: H * 0.15, w: W - m * 2, h: H * 0.3, align: "center", valign: "middle", name: "Event name" }),
    glass(m, H * 0.5, W - m * 2, H * 0.22, u * 0.04),
    ...[["Date", "{{event.date}}"], ["Doors", "{{event.time}}"], ["Venue", "{{event.venue_name}}"]].flatMap(([l, v], i) => [
      eyebrow(l, { size: u * 0.02, color: c.accent, x: m + u * 0.06, y: H * 0.525 + i * H * 0.065, w: W * 0.3 }),
      T(v, { font: "Inter", weight: 600, size: u * 0.04, color: c.ink, x: m + u * 0.06, y: H * 0.525 + i * H * 0.065 + u * 0.035, w: W - m * 2 - u * 0.12, h: u * 0.06, name: l }),
      ...(i < 2 ? [hair(m + u * 0.06, H * 0.525 + i * H * 0.065 + u * 0.1, W - m * 2 - u * 0.12, alpha(c.ink, 0.12), 1)] : [])]),
    R({ name: "Ticket QR card", fill: solid("#ffffff"), x: W / 2 - u * 0.17, y: H * 0.76, w: u * 0.34, h: u * 0.34, fx: { radius: u * 0.035, shadow: { x: 0, y: 24, blur: 60, color: "rgba(0,0,0,0.35)" } } }),
    qr({ x: W / 2 - u * 0.14, y: H * 0.76 + u * 0.03, s: u * 0.28 }),
    T("Tickets from {{ticket.starting_price}}", { font: "Inter", weight: 600, size: u * 0.032, color: c.ink, x: m, y: H * 0.76 + u * 0.38, w: W - m * 2, h: u * 0.05, align: "center", name: "Price" }),
  ]; }, tags);

// ── G. Venue screen 16:9 (split: identity left, running order right in glass)
const screen = (name, cat, c, serif, tags) => add(name, cat, "screen", c, (W, H) => { const m = H * 0.09, u = H;
  const run = [["19:00", "Doors & drinks reception"], ["19:45", "Opening remarks"], ["20:00", "Dinner is served"], ["21:30", "Awards"], ["22:30", "Dancing until late"]];
  return [
    orb(W * 0.1, H * 0.1, W * 0.45, c.orbs[0], 0.7), orb(W * 0.55, H * 1, W * 0.4, c.orbs[1], 0.5), orb(W * 0.95, H * 0.1, W * 0.3, c.orbs[2], 0.45),
    eyebrow("Welcome to", { size: u * 0.03, color: c.accent, x: m, y: m, w: W * 0.45 }),
    T("{{event.name}}", { bind: "event.name", font: serif, weight: serif === "Instrument Serif" || serif === "DM Serif Display" ? 400 : 600, size: u * 0.15, lh: 0.95, color: c.ink, x: m, y: H * 0.18, w: W * 0.5, h: H * 0.48, valign: "bottom", name: "Event name" }),
    hair(m, H * 0.72, W * 0.42, alpha(c.ink, 0.2)),
    T("Wi-Fi  Gala-Guests      Share  #yourevent", { font: "Inter", weight: 500, size: u * 0.032, color: c.sub, x: m, y: H * 0.76, w: W * 0.5, h: u * 0.06, name: "Info" }),
    glass(W * 0.58, m, W * 0.42 - m, H - m * 2, u * 0.04),
    eyebrow("Running order", { size: u * 0.026, color: c.accent, x: W * 0.58 + u * 0.06, y: m + u * 0.06, w: W * 0.3 }),
    ...run.flatMap(([t, l], i) => { const y = m + u * 0.16 + i * u * 0.135; return [
      T(t, { font: "Inter", weight: 600, size: u * 0.036, color: c.accent, x: W * 0.58 + u * 0.06, y, w: u * 0.2, h: u * 0.06, name: `Time ${i + 1}` }),
      T(l, { font: "Inter", weight: 500, size: u * 0.036, color: c.ink, x: W * 0.58 + u * 0.22, y, w: W * 0.42 - m - u * 0.28, h: u * 0.06, name: `Item ${i + 1}` }),
      ...(i < run.length - 1 ? [hair(W * 0.58 + u * 0.06, y + u * 0.09, W * 0.42 - m - u * 0.12, alpha(c.ink, 0.1), 1)] : [])]; }),
  ]; }, tags);

// ── H. Menu (cream, centred serif, dish/price columns with hairlines)
const menu = (name, cat, c, serif, tags) => add(name, cat, "poster", c, (W, H) => { const m = W * 0.11, u = W;
  const sections = [["To start", [["Heritage tomato, burrata, basil oil", "9"], ["Cured salmon, cucumber, rye", "11"], ["Wild mushroom velouté (VG)", "8"]]],
    ["Mains", [["Roast chicken, truffle jus, pommes purée", "24"], ["Sea bass, samphire, beurre blanc", "26"], ["Squash risotto, sage, parmesan (V)", "19"]]],
    ["To finish", [["Dark chocolate délice, salted caramel", "9"], ["Lemon posset, shortbread", "8"]]]];
  const out = [frame(W * 0.05, W, H, alpha(c.accent, 0.5), 1.5),
    eyebrow("{{event.name}}", { size: u * 0.018, color: c.accent, x: m, y: H * 0.07, w: W - m * 2, align: "center" }),
    T("Menu", { font: serif, weight: serif === "Instrument Serif" || serif === "DM Serif Display" ? 400 : 500, italic: true, size: u * 0.12, color: c.ink, x: m, y: H * 0.09, w: W - m * 2, h: u * 0.15, align: "center", name: "Title" })];
  let y = H * 0.24;
  for (const [title, dishes] of sections) {
    out.push(eyebrow(title, { size: u * 0.018, color: c.accent, x: m, y, w: W - m * 2, align: "center" })); y += u * 0.05;
    for (const [d, p] of dishes) { out.push(T(d, { font: serif, weight: 500, size: u * 0.03, color: c.ink, x: m, y, w: W - m * 2 - u * 0.1, h: u * 0.05, name: "Dish" }), T(p, { font: serif, weight: 600, size: u * 0.03, color: c.ink, x: W - m - u * 0.1, y, w: u * 0.1, h: u * 0.05, align: "right", name: "Price" }), hair(m, y + u * 0.058, W - m * 2, alpha(c.ink, 0.1), 1)); y += u * 0.075; }
    y += u * 0.04;
  }
  out.push(T("Please tell our team about any allergies before ordering. A discretionary 12.5% service charge is added to your bill.", { font: "Inter", weight: 400, size: u * 0.016, lh: 1.5, color: c.sub, x: m, y: H - H * 0.1, w: W - m * 2, h: u * 0.06, align: "center", name: "Footnote" }));
  return out; }, tags);

// ── I. Information board (icon rows, hairlines — refined signage)
const info = (name, cat, size, c, tags) => add(name, cat, size, c, (W, H) => { const m = W * 0.08, u = W;
  const rows = [["Toilet", "Toilets", "Ground floor, beside the main bar"], ["Lock", "Cloakroom", "£2 per item · open until close"], ["Cross", "First aid", "By the main stage — ask any steward"], ["Accessibility", "Accessibility", "Step-free entrance on the east side"], ["Wifi", "Wi-Fi", "Gala-Guests · password celebrate"], ["CigaretteOff", "No smoking", "Designated area in the garden"]];
  const rowH = (H * 0.68) / rows.length, dark = c.bg < "#7";
  return [
    ...(dark ? [orb(W * 0.9, H * 0.05, W * 0.6, c.orbs[0], 0.55)] : [orb(W * 0.9, H * 0.05, W * 0.6, c.orbs[0], 0.9)]),
    eyebrow("{{event.name}}", { size: u * 0.018, color: c.accent, x: m, y: m, w: W - m * 2 }),
    T("Good to know", { font: "Instrument Serif", weight: 400, size: u * 0.09, color: c.ink, x: m, y: m + u * 0.04, w: W - m * 2, h: u * 0.12, name: "Title" }),
    ...rows.flatMap(([ic, t, d], i) => { const y = H * 0.25 + i * rowH; return [
      R({ name: "Icon tile", fill: solid(alpha(c.accent, dark ? 0.16 : 0.1)), x: m, y: y + rowH * 0.18, w: rowH * 0.64, h: rowH * 0.64, fx: { radius: rowH * 0.18 } }),
      icon(ic, { color: c.accent, x: m + rowH * 0.17, y: y + rowH * 0.35, s: rowH * 0.3 }),
      T(t, { font: "Inter", weight: 600, size: u * 0.032, color: c.ink, x: m + rowH * 0.85, y: y + rowH * 0.2, w: W - m * 2 - rowH, h: u * 0.05, name: t }),
      T(d, { font: "Inter", weight: 400, size: u * 0.024, color: c.sub, x: m + rowH * 0.85, y: y + rowH * 0.2 + u * 0.045, w: W - m * 2 - rowH, h: u * 0.04, name: `${t} detail` }),
      ...(i < rows.length - 1 ? [hair(m, y + rowH, W - m * 2, alpha(c.ink, 0.1), 1)] : [])]; }),
  ]; }, tags);

// ── J. Announcement square (on-sale / sold-out / early-bird with pill)
const announce = (name, cat, c, line, pill, display, tags) => add(name, cat, "square", c, (W, H) => { const m = W * 0.08, u = W;
  return [
    orb(W * 0.85, H * 0.15, W * 0.55, c.orbs[0], 0.75), orb(W * 0.1, H * 0.95, W * 0.5, c.orbs[1], 0.55),
    eyebrow(line, { size: u * 0.02, color: c.accent, x: m, y: m, w: W - m * 2 }),
    T("{{event.name}}", { bind: "event.name", font: display, weight: display === "Instrument Serif" ? 400 : 700, size: u * 0.12, lh: 0.95, ls: -u * 0.002, color: c.ink, x: m, y: H * 0.18, w: W - m * 2, h: H * 0.42, valign: "bottom", name: "Event name" }),
    T("{{event.date}}  ·  {{event.venue_name}}", { font: "Inter", weight: 500, size: u * 0.03, color: c.sub, x: m, y: H * 0.63, w: W - m * 2, h: u * 0.05, name: "Details" }),
    R({ name: "Pill", fill: solid(c.accent), x: m, y: H - m - u * 0.11, w: u * 0.46, h: u * 0.11, fx: { radius: u * 0.055 } }),
    T(pill, { font: "Inter", weight: 700, size: u * 0.032, color: c.bg, x: m, y: H - m - u * 0.11, w: u * 0.46, h: u * 0.11, align: "center", valign: "middle", name: "Pill text" }),
    qr({ x: W - m - u * 0.15, y: H - m - u * 0.15, s: u * 0.15, fg: c.bg === "#ffffff" ? "#000" : c.bg, bg: c.ink }),
  ]; }, tags);

// ── Catalogue
editorial("Editorial — Midnight", "concert", "poster", DARK.Midnight, "Playfair Display", ["editorial"]);
editorial("Editorial — Noir", "theatre", "poster", DARK.Noir, "Bodoni Moda", ["editorial"]);
editorial("Editorial — Emerald", "corporate", "portrait", DARK.Emerald, "Instrument Serif", ["editorial"]);
editorial("Editorial — Ocean", "conference", "portrait", DARK.Ocean, "Fraunces", ["editorial"]);
swiss("Swiss — Porcelain", "conference", "poster", LIGHT.Porcelain, ["modern"]);
swiss("Swiss — Ivory", "networking", "portrait", LIGHT.Ivory, ["modern"]);
swiss("Swiss — Blush", "private_party", "square", LIGHT.Blush, ["modern"]);
swiss("Swiss — Sage", "venue_hire", "poster", LIGHT.Sage, ["modern"]);
gala("Black-tie gala — Gold", "corporate", "poster", DARK.Midnight, "Cinzel", ["luxury"]);
gala("Black-tie gala — Emerald", "wedding", "portrait", DARK.Emerald, "Marcellus", ["luxury"]);
gala("Wedding invitation — Noir", "wedding", "portrait", DARK.Noir, "Cormorant Garamond", ["luxury", "wedding"]);
neon("Neon night — Ultraviolet", "nightclub", "poster", DARK.Ultraviolet, "Unbounded", ["nightlife"]);
neon("Neon night — Ocean", "festival", "portrait", DARK.Ocean, "Anton", ["nightlife"]);
neon("Neon night — Noir", "concert", "portrait", DARK.Noir, "Syne", ["nightlife"]);
minimal("Minimal — Ivory", "wedding", "portrait", LIGHT.Ivory, "Instrument Serif", ["minimal"]);
minimal("Minimal — Porcelain", "conference", "poster", LIGHT.Porcelain, "Fraunces", ["minimal"]);
minimal("Minimal — Blush", "birthday", "square", LIGHT.Blush, "Gloock", ["minimal"]);
minimal("Minimal — Sage", "private_party", "portrait", LIGHT.Sage, "DM Serif Display", ["minimal"]);
story("Story — On sale now", "ticket_launch", DARK.Ultraviolet, "Unbounded", "Tickets on sale now", ["story"]);
story("Story — Save the date", "wedding", DARK.Noir, "Instrument Serif", "Save the date", ["story"]);
story("Story — Final release", "final_release", DARK.Midnight, "Syne", "Final release", ["story"]);
story("Story — Tonight", "event_day", DARK.Ocean, "Unbounded", "Tonight", ["story"]);
screen("Welcome screen — Midnight", "event_day", DARK.Midnight, "Playfair Display", ["screen"]);
screen("Welcome screen — Emerald", "corporate", DARK.Emerald, "Instrument Serif", ["screen"]);
screen("Welcome screen — Ocean", "conference", DARK.Ocean, "Fraunces", ["screen"]);
menu("Menu — Ivory", "menu", LIGHT.Ivory, "Cormorant Garamond", ["food"]);
menu("Menu — Sage", "catering", LIGHT.Sage, "Fraunces", ["food"]);
menu("Drinks list — Blush", "drinks", LIGHT.Blush, "Instrument Serif", ["drinks"]);
info("Information board — Porcelain", "event_day", "portrait", LIGHT.Porcelain, ["signage"]);
info("Information board — Midnight", "event_day", "portrait", DARK.Midnight, ["signage"]);
info("Information board — Ivory", "venue_hire", "poster", LIGHT.Ivory, ["signage"]);
announce("Tickets on sale — Ultraviolet", "ticket_launch", DARK.Ultraviolet, "Tickets on sale now", "Book now", "Unbounded", ["announcement"]);
announce("Early bird — Midnight", "early_bird", DARK.Midnight, "Early bird · limited release", "From {{ticket.starting_price}}", "Playfair Display", ["announcement"]);
announce("Sold out — Noir", "sold_out", DARK.Noir, "Thank you — every ticket has gone", "Join the waitlist", "Instrument Serif", ["announcement"]);
announce("Final tickets — Ocean", "final_release", DARK.Ocean, "Last few tickets", "Get yours", "Syne", ["announcement"]);

const { data: old } = await db.from("design_templates").select("id").is("workspace_id", null).is("owner_id", null).contains("tags", ["gala-starter"]);
if (old?.length) await db.from("design_templates").delete().in("id", old.map(o => o.id));
const rows = OUT.map(t => ({ ...t, description: "Gala Dock starter template", visibility: "public", status: "active", placeholders: ["event.name", "event.date", "event.time", "event.venue_name", "event.city", "event.public_url", "ticket.starting_price", "organizer.name"] }));
const { error } = await db.from("design_templates").insert(rows);
if (error) { console.error(error.message); process.exit(1); }
console.log(`Seeded ${rows.length} starter templates (replaced ${old?.length ?? 0}).`);
