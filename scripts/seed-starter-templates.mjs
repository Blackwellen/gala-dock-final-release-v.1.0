// Seeds Gala Dock starter templates (platform templates: workspace_id and owner_id null, public, active) for the Media Studio
// Templates tab. Original, photo-led layouts: every photo slot is bound to {{event.cover_image}} — it shows the event's own cover
// photo once the design is linked to an event, and a sample from public/design-assets/samples until then. Type system: fixed
// margins, small-caps eyebrows with wide tracking, tight display type, hairlines, gradient scrims for legibility over photos.
// Idempotent (tag "gala-starter"). Usage: node --env-file=.env --env-file=.env.local scripts/seed-starter-templates.mjs
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let n = 0; const id = () => `t${(++n).toString(36)}`;
const SIZE = { poster: [1240, 1754], portrait: [1080, 1350], square: [1080, 1080], story: [1080, 1920], screen: [1920, 1080] };
const alpha = (hex, a) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
const solid = color => ({ type: "solid", color });
const lin = (angle, stops) => ({ type: "linear", angle, stops: stops.map(([o, c]) => ({ offset: o, color: c })) });

// ── primitives
const T = (text, o) => ({ id: id(), name: o.name ?? text.replace(/[{}]/g, "").slice(0, 28), type: "text", text, bind: o.bind, font: o.font ?? "Inter", size: o.size, weight: o.weight ?? 600, italic: o.italic,
  color: o.color, fill: o.fill, align: o.align ?? "left", valign: o.valign ?? "top", lineHeight: o.lh ?? 1.15, letterSpacing: o.ls ?? 0, transform: o.tt, x: o.x, y: o.y, w: o.w, h: o.h, rotation: o.r ?? 0, effects: o.fx });
const R = (o) => ({ id: id(), name: o.name ?? "Panel", type: "shape", shape: o.d ? "custom" : o.shape ?? "rect", d: o.d, fill: o.fill, x: o.x, y: o.y, w: o.w, h: o.h, rotation: o.r ?? 0, effects: o.fx });
const P = (sample, o) => ({ id: id(), name: o.name ?? "Event photo", type: "image", asset: { src: "{{event.cover_image}}", sample: `/design-assets/samples/${sample}.webp`, public: true },
  fit: "cover", focusX: o.fx ?? 50, focusY: o.fy ?? 50, zoom: o.zoom ?? 1, x: o.x, y: o.y, w: o.w, h: o.h, rotation: 0, effects: o.effects });
const scrim = (x, y, w, h, color, from = 0, to = 0.92, angle = 180) => R({ name: "Scrim", fill: lin(angle, [[0, alpha(color, from)], [0.45, alpha(color, (from + to) * 0.42)], [1, alpha(color, to)]]), x, y, w, h });
const hair = (x, y, w, color, t = 1.5) => R({ name: "Rule", fill: solid(color), x, y, w, h: t });
const eyebrow = (text, o) => T(text, { font: o.font ?? "Inter", weight: o.weight ?? 600, size: o.size, ls: o.size * (o.track ?? 0.28), tt: "uppercase", color: o.color, x: o.x, y: o.y, w: o.w, h: o.size * 1.7, align: o.align ?? "left", name: o.name ?? "Eyebrow" });
const qr = (o) => ({ id: id(), name: "Ticket QR", type: "qr", value: "{{event.public_url}}", bind: "event.public_url", fg: o.fg ?? "#0b0b14", bg: o.bg ?? "#ffffff", x: o.x, y: o.y, w: o.s, h: o.s, rotation: 0 });
const pill = (text, o) => [R({ name: "Button", fill: solid(o.bg), x: o.x, y: o.y, w: o.w, h: o.h, fx: { radius: o.h / 2 } }),
  T(text, { font: o.font ?? "Inter", weight: 700, size: o.h * 0.36, color: o.color, x: o.x, y: o.y, w: o.w, h: o.h, align: "center", valign: "middle", ls: o.h * 0.02, name: "Button text" })];
const qrCard = (x, y, s) => [R({ name: "QR card", fill: solid("#ffffff"), x, y, w: s, h: s, fx: { radius: s * 0.1, shadow: { x: 0, y: s * 0.06, blur: s * 0.18, color: "rgba(0,0,0,0.35)" } } }), qr({ x: x + s * 0.08, y: y + s * 0.08, s: s * 0.84 })];

const OUT = [];
const add = (title, category, size, bg, layers, tags) => { const [W, H] = SIZE[size]; OUT.push({ title, category, tags: ["gala-starter", size, ...tags], width: W, height: H, document: { unit: "px", dpi: 150, pages: [{ id: id(), name: title, width: W, height: H, background: solid(bg), layers: layers(W, H) }] } }); };
const condensed = f => f === "Anton" || f === "Bebas Neue";

// 1 · Headline — full-bleed photo, deep scrim, condensed headline, price button + QR
const headline = (title, cat, size, sample, c, font, focus = {}) => add(title, cat, size, c.bg, (W, H) => { const m = W * 0.07, u = W;
  return [P(sample, { x: 0, y: 0, w: W, h: H, ...focus }), scrim(0, H * 0.35, W, H * 0.65, c.bg, 0, 0.96), scrim(0, 0, W, H * 0.22, c.bg, 0.55, 0),
    eyebrow("{{organizer.name}} presents", { size: u * 0.018, color: "#ffffff", x: m, y: m, w: W * 0.6 }), eyebrow("{{event.city}}", { size: u * 0.018, color: "#ffffff", x: W * 0.4, y: m, w: W * 0.6 - m, align: "right" }),
    T("{{event.name}}", { bind: "event.name", font, weight: condensed(font) ? 400 : 800, size: u * (condensed(font) ? 0.17 : 0.11), lh: 0.9, ls: condensed(font) ? u * 0.002 : -u * 0.003, tt: "uppercase", color: "#ffffff",
      x: m, y: H * 0.42, w: W - m * 2, h: H * 0.3, valign: "bottom", name: "Event name" }),
    T("{{event.date}}  ·  {{event.time}}  ·  {{event.venue_name}}", { font: "Inter", weight: 500, size: u * 0.026, color: alpha("#ffffff", 0.88), x: m, y: H * 0.74, w: W - m * 2, h: u * 0.05, name: "Details" }),
    hair(m, H * 0.8, W - m * 2, alpha("#ffffff", 0.25)),
    ...pill("Tickets from {{ticket.starting_price}}", { bg: c.accent, color: c.on ?? "#0b0b14", x: m, y: H - m - u * 0.1, w: u * 0.5, h: u * 0.1 }),
    ...qrCard(W - m - u * 0.15, H - m - u * 0.15, u * 0.15)]; }, ["photo", "headline"]);

// 2 · Luxe wordmark — darkened photo, wide-tracked inscriptional title, gold hairlines
const luxe = (title, cat, size, sample, c, font, focus = {}) => add(title, cat, size, c.bg, (W, H) => { const m = W * 0.08, u = W;
  return [P(sample, { x: 0, y: 0, w: W, h: H, ...focus, effects: { brightness: 62, contrast: 108, saturate: 92 } }), scrim(0, 0, W, H * 0.45, c.bg, 0.75, 0), scrim(0, H * 0.6, W, H * 0.4, c.bg, 0, 0.88),
    eyebrow("{{organizer.name}} presents", { size: u * 0.016, color: c.accent, x: m, y: H * 0.09, w: W - m * 2, align: "center", track: 0.4 }),
    T("{{event.name}}", { bind: "event.name", font, weight: font === "Italiana" || font === "Marcellus" ? 400 : 500, size: u * 0.085, lh: 1.08, ls: u * 0.012, tt: "uppercase", color: "#ffffff", x: m, y: H * 0.13, w: W - m * 2, h: H * 0.22, align: "center", valign: "middle", name: "Event name" }),
    hair(W * 0.4, H * 0.37, W * 0.2, alpha(c.accent, 0.9), 2),
    T("An evening of fine food, music and celebration", { font: "Cormorant Garamond", weight: 500, italic: true, size: u * 0.034, color: alpha("#ffffff", 0.9), x: m, y: H * 0.39, w: W - m * 2, h: u * 0.06, align: "center", name: "Tagline" }),
    eyebrow("{{event.date}}", { size: u * 0.02, color: "#ffffff", x: m, y: H * 0.8, w: W - m * 2, align: "center", track: 0.32 }),
    eyebrow("{{event.venue_name}}  ·  {{event.city}}", { size: u * 0.016, color: c.accent, x: m, y: H * 0.8 + u * 0.045, w: W - m * 2, align: "center", track: 0.32 }),
    T("Reservations by QR · Black tie", { font: "Cormorant Garamond", weight: 500, italic: true, size: u * 0.026, color: alpha("#ffffff", 0.8), x: m, y: H * 0.88, w: W - m * 2, h: u * 0.05, align: "center", name: "Note" }),
    qr({ x: W / 2 - u * 0.045, y: H - m * 0.7 - u * 0.09, s: u * 0.09, fg: c.bg, bg: c.accent })]; }, ["photo", "luxury"]);

// 3 · Arch frame — cream page, arch-cropped photo, script + serif
const arch = (title, cat, size, sample, c, serif, focus = {}) => add(title, cat, size, c.bg, (W, H) => { const m = W * 0.1, u = W, aw = W * 0.62, ah = H * 0.48;
  return [R({ name: "Arch outline", fill: solid("transparent"), x: (W - aw) / 2 - u * 0.018, y: H * 0.07 - u * 0.018, w: aw + u * 0.036, h: ah + u * 0.036, fx: { radii: [aw / 2 + u * 0.018, aw / 2 + u * 0.018, 0, 0], stroke: { width: 1.5, color: alpha(c.accent, 0.7) } } }),
    P(sample, { x: (W - aw) / 2, y: H * 0.07, w: aw, h: ah, ...focus, effects: { radii: [aw / 2, aw / 2, 0, 0] } }),
    T("together with their families", { font: "Pinyon Script", weight: 400, size: u * 0.05, color: c.accent, x: m, y: H * 0.58, w: W - m * 2, h: u * 0.08, align: "center", name: "Script" }),
    T("{{event.name}}", { bind: "event.name", font: serif, weight: serif === "Instrument Serif" ? 400 : 500, size: u * 0.085, lh: 1.02, color: c.ink, x: m, y: H * 0.64, w: W - m * 2, h: H * 0.13, align: "center", valign: "middle", name: "Event name" }),
    eyebrow("{{event.date}}  ·  {{event.time}}", { size: u * 0.018, color: c.ink, x: m, y: H * 0.8, w: W - m * 2, align: "center", track: 0.3 }),
    T("{{event.venue_name}}, {{event.city}}", { font: serif, weight: 500, italic: true, size: u * 0.03, color: c.sub, x: m, y: H * 0.8 + u * 0.045, w: W - m * 2, h: u * 0.05, align: "center", name: "Venue" }),
    eyebrow("Kindly RSVP", { size: u * 0.014, color: c.accent, x: m, y: H - u * 0.17, w: W - m * 2, align: "center" }),
    qr({ x: W / 2 - u * 0.05, y: H - u * 0.13, s: u * 0.1, fg: c.ink, bg: c.bg })]; }, ["photo", "wedding"]);

// 4 · Split diagonal — photo top, diagonal colour panel, content below
const split = (title, cat, size, sample, c, font, focus = {}) => add(title, cat, size, c.bg, (W, H) => { const m = W * 0.075, u = W;
  return [P(sample, { x: 0, y: 0, w: W, h: H * 0.62, ...focus }), R({ name: "Diagonal panel", d: "M0 22 L100 0 V100 H0 Z", fill: solid(c.bg), x: 0, y: H * 0.5, w: W, h: H * 0.5 }),
    R({ name: "Accent edge", d: "M0 22 L100 0 V6 L0 28 Z", fill: solid(c.accent), x: 0, y: H * 0.5 - u * 0.005, w: W, h: H * 0.5 }),
    eyebrow("{{event.date}}", { size: u * 0.018, color: c.accent, x: m, y: H * 0.64, w: W - m * 2 }),
    T("{{event.name}}", { bind: "event.name", font, weight: 800, size: u * 0.095, lh: 0.95, ls: -u * 0.003, color: c.ink, x: m, y: H * 0.67, w: W - m * 2, h: H * 0.15, name: "Event name" }),
    T("{{event.venue_name}}  ·  {{event.city}}  ·  Doors {{event.time}}", { font: "Inter", weight: 500, size: u * 0.024, color: c.sub, x: m, y: H * 0.84, w: W * 0.62, h: u * 0.08, lh: 1.4, name: "Details" }),
    ...pill("Book now", { bg: c.accent, color: c.on ?? "#ffffff", x: m, y: H - m - u * 0.085, w: u * 0.3, h: u * 0.085 }),
    qr({ x: W - m - u * 0.15, y: H - m - u * 0.15, s: u * 0.15, fg: c.ink, bg: c.bg })]; }, ["photo", "modern"]);

// 5 · Duotone club — duotoned photo, giant outlined + filled headline, line-up
const duo = (title, cat, size, sample, c, font, focus = {}) => add(title, cat, size, c.bg, (W, H) => { const m = W * 0.07, u = W;
  return [P(sample, { x: 0, y: 0, w: W, h: H, ...focus, effects: { duotone: [c.bg, c.accent], contrast: 115 } }), scrim(0, H * 0.45, W, H * 0.55, c.bg, 0, 0.9),
    T("{{event.name}}", { bind: "event.name", font, weight: 400, size: u * 0.2, lh: 0.86, tt: "uppercase", color: "transparent", x: m, y: H * 0.08, w: W - m * 2, h: H * 0.42, valign: "bottom", name: "Outline title", fx: { textFx: { kind: "hollow", color: "#ffffff" }, opacity: 0.85 } }),
    T("{{event.name}}", { bind: "event.name", font, weight: 400, size: u * 0.2, lh: 0.86, tt: "uppercase", color: c.hot, x: m + u * 0.012, y: H * 0.08 + u * 0.012, w: W - m * 2, h: H * 0.42, valign: "bottom", name: "Event name", fx: { blend: "screen" } }),
    eyebrow("Live  ·  all night  ·  {{event.city}}", { size: u * 0.02, color: "#ffffff", x: m, y: m, w: W - m * 2 }),
    ...["Headliner", "Special guest", "Residents"].map((a, i) => T(i === 0 ? "{{organizer.name}}" : a, { font: "Inter", weight: i ? 500 : 800, size: u * (i ? 0.032 : 0.05), color: i ? alpha("#ffffff", 0.75) : "#ffffff", x: m, y: H * 0.58 + i * u * 0.075, w: W * 0.6, h: u * 0.07, name: `Act ${i + 1}` })),
    eyebrow("{{event.date}}  ·  {{event.time}}", { size: u * 0.02, color: c.hot, x: m, y: H * 0.8, w: W * 0.6 }),
    T("{{event.venue_name}}", { font: "Inter", weight: 600, size: u * 0.03, color: "#ffffff", x: m, y: H * 0.8 + u * 0.045, w: W * 0.6, h: u * 0.05, name: "Venue" }),
    ...qrCard(W - m - u * 0.2, H - m - u * 0.2, u * 0.2)]; }, ["photo", "nightlife"]);

// 6 · Artist spotlight — photo right, fade to colour, stacked name left
const spotlight = (title, cat, size, sample, c, font, focus = {}) => add(title, cat, size, c.bg, (W, H) => { const m = W * 0.07, u = W;
  return [P(sample, { x: W * 0.3, y: 0, w: W * 0.7, h: H * 0.78, ...focus }), scrim(W * 0.3, 0, W * 0.45, H * 0.78, c.bg, 1, 0, 90), scrim(0, H * 0.5, W, H * 0.28, c.bg, 0, 1),
    eyebrow("Live in concert", { size: u * 0.02, color: c.accent, x: m, y: m, w: W * 0.5 }),
    T("{{event.name}}", { bind: "event.name", font, weight: condensed(font) ? 400 : 800, size: u * (condensed(font) ? 0.13 : 0.075), lh: 0.92, tt: "uppercase", color: "#ffffff", x: m, y: H * 0.12, w: W * 0.58, h: H * 0.5, name: "Event name" }),
    hair(m, H * 0.8, W - m * 2, alpha("#ffffff", 0.2)),
    ...[["Date", "{{event.date}}"], ["Doors", "{{event.time}}"], ["Venue", "{{event.venue_name}}"]].flatMap(([l, v], i) => { const cw = (W - m * 2) / 3, x = m + cw * i;
      return [eyebrow(l, { size: u * 0.015, color: c.accent, x, y: H * 0.82, w: cw - u * 0.02 }), T(v, { font: "Inter", weight: 600, size: u * 0.024, color: "#ffffff", x, y: H * 0.82 + u * 0.032, w: cw - u * 0.03, h: u * 0.07, lh: 1.25, name: l })]; }),
    ...pill("Tickets {{ticket.starting_price}}", { bg: c.accent, color: c.on ?? "#0b0b14", x: m, y: H - m * 0.8 - u * 0.075, w: u * 0.4, h: u * 0.075 })]; }, ["photo", "artist"]);

// 7 · Energy diagonal — bold colour field, slanted photo band, rotated headline, stripes
const energy = (title, cat, size, sample, c, font, focus = {}) => add(title, cat, size, c.accent, (W, H) => { const m = W * 0.07, u = W;
  return [P(sample, { x: 0, y: H * 0.18, w: W, h: H * 0.5, ...focus }), R({ name: "Top cut", d: "M0 0 H100 V40 L0 100 Z", fill: solid(c.accent), x: 0, y: H * 0.17, w: W, h: H * 0.12 }),
    R({ name: "Bottom cut", d: "M0 60 L100 0 V100 H0 Z", fill: solid(c.bg), x: 0, y: H * 0.6, w: W, h: H * 0.4 }),
    ...[0, 1, 2, 3, 4, 5].map(i => R({ name: "Stripe", d: "M20 0 H100 L80 100 H0 Z", fill: solid(c.bg), x: m + i * u * 0.045, y: m, w: u * 0.03, h: u * 0.05 })),
    eyebrow("{{event.city}}  ·  {{event.date}}", { size: u * 0.02, color: c.bg, x: m + u * 0.32, y: m + u * 0.01, w: W - m * 2 - u * 0.32, align: "right" }),
    T("{{event.name}}", { bind: "event.name", font, weight: 400, size: u * (H / W < 1.1 ? 0.1 : 0.15), lh: 0.88, tt: "uppercase", color: "#ffffff", x: m, y: H * (H / W < 1.1 ? 0.62 : 0.64), w: W - m * 2, h: H * (H / W < 1.1 ? 0.14 : 0.2), r: -4, name: "Event name", fx: { textFx: { kind: "3d", color: c.accent, depth: 6, angle: 45 } } }),
    T("{{event.venue_name}}  ·  Doors {{event.time}}", { font: "Inter", weight: 700, size: u * 0.026, color: alpha("#ffffff", 0.85), x: m, y: H * (H / W < 1.1 ? 0.8 : 0.86), w: W * 0.6, h: u * 0.05, name: "Details" }),
    ...pill("{{ticket.starting_price}}", { bg: c.accent, color: c.bg, x: m, y: H - m * 0.9 - u * 0.075, w: u * 0.24, h: u * 0.075 }),
    qr({ x: W - m - u * 0.14, y: H - m - u * 0.14, s: u * 0.14, fg: c.bg, bg: "#ffffff" })]; }, ["photo", "energy"]);

// 8 · Circle stamp — colour field, circular photo, rotated badge, playful type
const circle = (title, cat, size, sample, c, font, focus = {}) => add(title, cat, size, c.bg, (W, H) => { const m = W * 0.08, u = W, d = Math.min(W * 0.66, H * 0.5);
  return [R({ name: "Ring", shape: "ellipse", fill: solid("transparent"), x: (W - d) / 2 - u * 0.025, y: H * 0.08 - u * 0.025, w: d + u * 0.05, h: d + u * 0.05, fx: { stroke: { width: 3, color: c.accent, dash: "dashed" } } }),
    P(sample, { x: (W - d) / 2, y: H * 0.08, w: d, h: d, ...focus, effects: { radius: d / 2 } }),
    R({ name: "Badge", d: "M50 0 L61 12 L77 7 L80 23 L96 28 L90 44 L100 57 L86 66 L88 83 L72 84 L64 98 L50 90 L36 98 L28 84 L12 83 L14 66 L0 57 L10 44 L4 28 L20 23 L23 7 L39 12 Z", fill: solid(c.accent), x: W * 0.68, y: H * 0.05, w: u * 0.22, h: u * 0.22, r: 12 }),
    T("You’re\ninvited", { font, weight: 800, size: u * 0.034, lh: 1, color: c.on ?? "#ffffff", x: W * 0.68, y: H * 0.05, w: u * 0.22, h: u * 0.22, align: "center", valign: "middle", r: 12, name: "Badge text" }),
    T("{{event.name}}", { bind: "event.name", font, weight: 800, size: u * (font === "Syne" ? 0.075 : 0.09), lh: 0.98, color: c.ink, x: m, y: H * 0.08 + d + u * 0.05, w: W - m * 2, h: H * 0.16, align: "center", valign: "middle", name: "Event name" }),
    T("{{event.date}}  ·  {{event.time}}", { font: "Inter", weight: 700, size: u * 0.03, color: c.accent, x: m, y: H * 0.08 + d + u * 0.05 + H * 0.17, w: W - m * 2, h: u * 0.05, align: "center", name: "Date" }),
    T("{{event.venue_name}}, {{event.city}}", { font: "Inter", weight: 500, size: u * 0.026, color: c.sub, x: m, y: H * 0.08 + d + u * 0.1 + H * 0.17, w: W - m * 2, h: u * 0.05, align: "center", name: "Venue" })]; }, ["photo", "party"]);

// 9 · Photo ticket — photo top, perforated stub
const ticket = (title, cat, size, sample, c, font, focus = {}) => add(title, cat, size, c.bg, (W, H) => { const m = W * 0.06, u = W, top = H * 0.6, sh = H - top - u * 0.04 - m;
  return [P(sample, { x: 0, y: 0, w: W, h: top, ...focus }), scrim(0, top * 0.55, W, top * 0.45, "#000000", 0, 0.6),
    T("{{event.name}}", { bind: "event.name", font, weight: condensed(font) ? 400 : 800, size: u * (condensed(font) ? 0.13 : 0.09), lh: 0.92, tt: "uppercase", color: "#ffffff", x: m, y: top * 0.45, w: W - m * 2, h: top * 0.5, valign: "bottom", name: "Event name" }),
    R({ name: "Stub", fill: solid(c.paper), x: m, y: top + u * 0.04, w: W - m * 2, h: sh, fx: { radius: u * 0.03 } }),
    ...[0, 1].map(i => R({ name: "Notch", shape: "ellipse", fill: solid(c.bg), x: (i ? W - m : m) - u * 0.03, y: top + u * 0.04 + sh * 0.6 - u * 0.03, w: u * 0.06, h: u * 0.06 })),
    R({ name: "Perforation", fill: solid("transparent"), x: m + u * 0.05, y: top + u * 0.04 + sh * 0.6, w: W - m * 2 - u * 0.1, h: 0.5, fx: { stroke: { width: 2, color: alpha(c.ink, 0.3), dash: "dashed" } } }),
    ...[["Date", "{{event.date}}"], ["Doors", "{{event.time}}"], ["Price", "{{ticket.starting_price}}"]].flatMap(([l, v], i) => { const cw = (W - m * 2 - u * 0.1) / 3, x = m + u * 0.05 + cw * i, y = top + u * 0.09;
      return [eyebrow(l, { size: u * 0.016, color: c.accent, x, y, w: cw }), T(v, { font: "Inter", weight: 700, size: u * 0.03, color: c.ink, x, y: y + u * 0.035, w: cw - u * 0.02, h: u * 0.08, lh: 1.2, name: l })]; }),
    eyebrow("Admit one  ·  {{event.venue_name}}", { size: u * 0.016, color: alpha(c.ink, 0.6), x: m + u * 0.05, y: top + u * 0.04 + sh * 0.6 + (sh * 0.4 - u * 0.03) / 2, w: W * 0.55 }),
    qr({ x: W - m - u * 0.05 - u * 0.1, y: top + u * 0.04 + sh * 0.6 + (sh * 0.4 - u * 0.1) / 2, s: u * 0.1, fg: c.ink, bg: c.paper })]; }, ["photo", "ticket"]);

// 10 · Photo story — full-bleed 9:16, scrim, glass detail card, QR
const story = (title, cat, sample, c, font, line, focus = {}) => add(title, cat, "story", c.bg, (W, H) => { const m = W * 0.08, u = W;
  return [P(sample, { x: 0, y: 0, w: W, h: H, ...focus }), scrim(0, H * 0.3, W, H * 0.7, c.bg, 0, 0.94), scrim(0, 0, W, H * 0.2, c.bg, 0.6, 0),
    eyebrow(line, { size: u * 0.028, color: c.accent, x: m, y: H * 0.07, w: W - m * 2, align: "center" }),
    T("{{event.name}}", { bind: "event.name", font, weight: font === "Instrument Serif" || condensed(font) ? 400 : 800, italic: font === "Instrument Serif", size: u * (condensed(font) ? 0.16 : 0.12), lh: 0.95, tt: condensed(font) ? "uppercase" : undefined, color: "#ffffff", x: m, y: H * 0.36, w: W - m * 2, h: H * 0.2, align: "center", valign: "bottom", name: "Event name" }),
    R({ name: "Glass card", fill: solid("rgba(255,255,255,0.1)"), x: m, y: H * 0.585, w: W - m * 2, h: H * 0.13, fx: { radius: u * 0.04, stroke: { width: 1.5, color: "rgba(255,255,255,0.22)" } } }),
    T("{{event.date}}", { font: "Inter", weight: 700, size: u * 0.042, color: "#ffffff", x: m, y: H * 0.6, w: W - m * 2, h: u * 0.07, align: "center", name: "Date" }),
    T("{{event.time}}  ·  {{event.venue_name}}", { font: "Inter", weight: 500, size: u * 0.032, color: alpha("#ffffff", 0.8), x: m, y: H * 0.6 + u * 0.075, w: W - m * 2, h: u * 0.06, align: "center", name: "Details" }),
    ...qrCard(W / 2 - u * 0.15, H * 0.76, u * 0.3),
    T("Tickets from {{ticket.starting_price}}", { font: "Inter", weight: 700, size: u * 0.034, color: "#ffffff", x: m, y: H * 0.76 + u * 0.34, w: W - m * 2, h: u * 0.06, align: "center", name: "Price" })]; }, ["photo", "story"]);

// 11 · Social square — full photo, badge, bottom title
const social = (title, cat, sample, c, font, badge, focus = {}) => add(title, cat, "square", c.bg, (W, H) => { const m = W * 0.07, u = W;
  return [P(sample, { x: 0, y: 0, w: W, h: H, ...focus }), scrim(0, H * 0.4, W, H * 0.6, c.bg, 0, 0.95),
    ...pill(badge, { bg: c.accent, color: c.on ?? "#0b0b14", x: m, y: m, w: u * 0.36, h: u * 0.07 }),
    T("{{event.name}}", { bind: "event.name", font, weight: condensed(font) ? 400 : 800, size: u * (condensed(font) ? 0.14 : 0.1), lh: 0.92, tt: condensed(font) ? "uppercase" : undefined, ls: -u * 0.002, color: "#ffffff", x: m, y: H * 0.5, w: W - m * 2 - u * 0.2, h: H * 0.26, valign: "bottom", name: "Event name" }),
    T("{{event.date}}  ·  {{event.venue_name}}", { font: "Inter", weight: 600, size: u * 0.03, color: alpha("#ffffff", 0.85), x: m, y: H * 0.79, w: W * 0.66, h: u * 0.05, name: "Details" }),
    T("galadock.com", { font: "Inter", weight: 600, size: u * 0.022, color: c.accent, x: m, y: H - m - u * 0.03, w: W * 0.5, h: u * 0.04, name: "Link" }),
    ...qrCard(W - m - u * 0.16, H - m - u * 0.16, u * 0.16)]; }, ["photo", "social"]);

// 12 · Welcome screen — photo fading into colour, running order
const screen = (title, cat, sample, c, serif, focus = {}) => add(title, cat, "screen", c.bg, (W, H) => { const m = H * 0.09, u = H;
  const run = [["19:00", "Arrival drinks"], ["19:45", "Welcome"], ["20:00", "Dinner is served"], ["21:30", "Awards"], ["22:30", "Dancing"]];
  return [P(sample, { x: W * 0.38, y: 0, w: W * 0.62, h: H, ...focus }), scrim(W * 0.38, 0, W * 0.35, H, c.bg, 1, 0, 90),
    eyebrow("Welcome to", { size: u * 0.03, color: c.accent, x: m, y: m, w: W * 0.4 }),
    T("{{event.name}}", { bind: "event.name", font: serif, weight: serif === "Instrument Serif" ? 400 : 600, size: u * 0.13, lh: 0.95, color: "#ffffff", x: m, y: H * 0.14, w: W * 0.42, h: H * 0.38, valign: "bottom", name: "Event name" }),
    hair(m, H * 0.56, W * 0.36, alpha("#ffffff", 0.25)),
    ...run.flatMap(([t, l], i) => [T(t, { font: "Inter", weight: 700, size: u * 0.034, color: c.accent, x: m, y: H * 0.6 + i * u * 0.065, w: u * 0.16, h: u * 0.05, name: `Time ${i + 1}` }),
      T(l, { font: "Inter", weight: 500, size: u * 0.034, color: "#ffffff", x: m + u * 0.17, y: H * 0.6 + i * u * 0.065, w: W * 0.3, h: u * 0.05, name: `Item ${i + 1}` })])]; }, ["photo", "screen"]);

// 13 · Menu with photo header
const menu = (title, cat, sample, c, serif, focus = {}) => add(title, cat, "poster", c.bg, (W, H) => { const m = W * 0.1, u = W;
  const sections = [["To start", [["Heritage tomato, burrata, basil", "9"], ["Cured salmon, cucumber, rye", "11"]]], ["Mains", [["Roast chicken, truffle jus", "24"], ["Sea bass, samphire, beurre blanc", "26"], ["Squash risotto, sage (V)", "19"]]], ["To finish", [["Chocolate délice, salted caramel", "9"], ["Lemon posset, shortbread", "8"]]]];
  const out = [P(sample, { x: 0, y: 0, w: W, h: H * 0.26, ...focus }), scrim(0, 0, W, H * 0.26, "#000000", 0.15, 0.55),
    T("Menu", { font: serif, weight: 500, italic: true, size: u * 0.11, color: "#ffffff", x: m, y: H * 0.05, w: W - m * 2, h: H * 0.16, align: "center", valign: "middle", name: "Title" }),
    eyebrow("{{event.name}}", { size: u * 0.018, color: c.accent, x: m, y: H * 0.29, w: W - m * 2, align: "center" })];
  let y = H * 0.34;
  for (const [s, dishes] of sections) {
    out.push(eyebrow(s, { size: u * 0.017, color: c.accent, x: m, y, w: W - m * 2, align: "center" })); y += u * 0.05;
    for (const [d, p] of dishes) { out.push(T(d, { font: serif, weight: 500, size: u * 0.03, color: c.ink, x: m, y, w: W - m * 2 - u * 0.1, h: u * 0.05, name: "Dish" }), T(p, { font: serif, weight: 600, size: u * 0.03, color: c.ink, x: W - m - u * 0.1, y, w: u * 0.1, h: u * 0.05, align: "right", name: "Price" }), hair(m, y + u * 0.058, W - m * 2, alpha(c.ink, 0.1), 1)); y += u * 0.074; }
    y += u * 0.035;
  }
  out.push(T("Please tell our team about allergies before ordering.", { font: "Inter", weight: 400, size: u * 0.017, color: c.sub, x: m, y: H - H * 0.06, w: W - m * 2, h: u * 0.04, align: "center", name: "Footnote" }));
  return out; }, ["photo", "menu"]);

// ── palettes
const C = {
  night: { bg: "#06060f", accent: "#ff3d8b", on: "#ffffff", ink: "#ffffff", sub: "#b9bcd6", hot: "#ff3d8b" }, violet: { bg: "#0b0520", accent: "#c9a6ff", on: "#0b0520", ink: "#ffffff", sub: "#b9b0d9", hot: "#a46bff" },
  gold: { bg: "#0a0806", accent: "#d8b878", on: "#0a0806", ink: "#ffffff", sub: "#c9bba3" }, ember: { bg: "#120604", accent: "#ff7a1a", on: "#120604", ink: "#ffffff", sub: "#d9b9a8", hot: "#ff7a1a" },
  cyan: { bg: "#020f18", accent: "#32e6ff", on: "#02131c", ink: "#ffffff", sub: "#a5c3d1", hot: "#32e6ff" }, lime: { bg: "#0b0f05", accent: "#c6ff3d", on: "#0b0f05", ink: "#ffffff", sub: "#c2cfa8", hot: "#c6ff3d" },
  cream: { bg: "#f7f2ea", accent: "#a8834e", ink: "#1d1a15", sub: "#6e665a" }, blush: { bg: "#fbf2ef", accent: "#b9667a", ink: "#2b1619", sub: "#7f6468" }, sage: { bg: "#f1f2ea", accent: "#4f7a63", ink: "#1b2a22", sub: "#5e6e64" },
  navy: { bg: "#0b1230", accent: "#4f6bff", on: "#ffffff", ink: "#ffffff", sub: "#aab4dd" }, paperDark: { bg: "#101014", paper: "#f6f3ec", accent: "#e0533d", ink: "#16151a" }, paperBlue: { bg: "#0d1b3d", paper: "#f3f5fb", accent: "#3a57ff", ink: "#0d1b3d" },
  sun: { bg: "#140b26", accent: "#ffcf3d", on: "#140b26", ink: "#ffffff", sub: "#cfc6e6" }, candy: { bg: "#fff6e9", accent: "#ff5c8a", on: "#ffffff", ink: "#26113a", sub: "#7a6a86" }, mint: { bg: "#effbf6", accent: "#11a37f", on: "#ffffff", ink: "#0f2a22", sub: "#5c7a70" },
};

// ── catalogue (original layouts × sample photography)
headline("Concert headline — Neon", "concert", "poster", "concert-crowd", C.night, "Anton");
headline("Festival headline — Ember", "festival", "poster", "festival-fire", C.ember, "Bebas Neue", { fy: 60 });
headline("Carnival headline — Sun", "festival", "portrait", "carnival", C.sun, "Anton");
headline("Fireworks headline — Gold", "private_party", "portrait", "fireworks", C.gold, "Syne");
headline("Stage headline — Cyan", "concert", "poster", "stage-lights", C.cyan, "Unbounded");
luxe("Gala dinner — Gold", "corporate", "poster", "gala-dinner", C.gold, "Cinzel");
luxe("Banquet evening — Gold", "corporate", "portrait", "banquet", C.gold, "Italiana");
luxe("Rooftop supper — Gold", "catering", "poster", "rooftop-dining", C.gold, "Bodoni Moda");
luxe("Waterfront soirée — Ice", "venue_hire", "portrait", "venue-waterfront", { ...C.gold, accent: "#cfd8ff", bg: "#071026" }, "Marcellus");
arch("Wedding arch — Cream", "wedding", "portrait", "brides", C.cream, "Cormorant Garamond", { fy: 40 });
arch("Wedding arch — Blush", "wedding", "poster", "wedding-table", C.blush, "Playfair Display");
arch("Garden ceremony — Sage", "wedding", "portrait", "garden-wedding", C.sage, "Instrument Serif");
arch("Garden party — Sage", "private_party", "poster", "garden-lounge", C.sage, "Fraunces");
split("Summit — Navy", "conference", "poster", "skyline-gathering", C.navy, "Inter Tight");
split("Live session — Violet", "concert", "portrait", "stage-lights", C.violet, "Space Grotesk");
split("Street culture — Lime", "festival", "poster", "street-art", C.lime, "Bricolage Grotesque");
split("City night — Navy", "networking", "portrait", "london-night", C.navy, "Manrope");
duo("Club night — Pink", "nightclub", "poster", "dj", C.night, "Anton");
duo("Rave — Cyan", "nightclub", "portrait", "crowd-hands", C.cyan, "Bebas Neue");
duo("Warehouse — Violet", "nightclub", "poster", "concert-silhouette", C.violet, "Anton");
spotlight("Artist spotlight — Violet", "concert", "poster", "artist-woman", C.violet, "Bebas Neue", { fx: 45 });
spotlight("Artist spotlight — Ember", "concert", "portrait", "artist-fire", C.ember, "Anton");
spotlight("Artist spotlight — Gold", "comedy", "poster", "artist-man", C.gold, "Syne");
spotlight("Performer — Pink", "theatre", "portrait", "performer", C.night, "Unbounded");
energy("Festival energy — Sun", "festival", "poster", "festival-sunset", { bg: "#1b0c3a", accent: "#ffcf3d" }, "Anton");
energy("Party energy — Coral", "private_party", "portrait", "party-smile", { bg: "#1a0f14", accent: "#ff6b5b" }, "Bebas Neue", { fy: 35 });
energy("Crowd energy — Lime", "concert", "square", "crowd-hands", { bg: "#0b0f05", accent: "#c6ff3d" }, "Anton");
circle("Birthday — Candy", "birthday", "portrait", "party-smile", C.candy, "Fredoka", { fy: 35 });
circle("Summer party — Mint", "private_party", "square", "beach-sunset", C.mint, "Outfit");
circle("New Year — Gold", "private_party", "portrait", "fireworks", { ...C.cream, bg: "#0c0a07", ink: "#ffffff", sub: "#cbbd9f", accent: "#d8b878", on: "#0c0a07" }, "Syne");
ticket("Photo ticket — Coral", "ticket_launch", "portrait", "concert-crowd", C.paperDark, "Anton");
ticket("Photo ticket — Blue", "ticket_launch", "poster", "fireworks", C.paperBlue, "Unbounded");
story("Story — On sale now", "ticket_launch", "dj", C.night, "Anton", "Tickets on sale now");
story("Story — Save the date", "wedding", "brides", C.gold, "Instrument Serif", "Save the date", { fy: 40 });
story("Story — Tonight", "event_day", "stage-lights", C.cyan, "Unbounded", "Tonight");
story("Story — Rooftop", "catering", "rooftop-dining", C.gold, "Instrument Serif", "Golden hour supper club");
social("Social — On sale", "ticket_launch", "concert-crowd", C.night, "Anton", "On sale now");
social("Social — Last tickets", "final_release", "festival-fire", C.ember, "Syne", "Last few tickets");
social("Social — Sold out", "sold_out", "crowd-hands", C.violet, "Anton", "Sold out — thank you");
social("Social — Early bird", "early_bird", "beach-sunset", C.sun, "Unbounded", "Early bird");
screen("Welcome screen — Gala", "event_day", "gala-dinner", C.gold, "Playfair Display");
screen("Welcome screen — Summit", "conference", "skyline-gathering", C.navy, "Instrument Serif");
menu("Menu — Supper club", "menu", "dinner", C.cream, "Cormorant Garamond");
menu("Menu — Garden", "catering", "garden-lounge", C.sage, "Fraunces");

const { data: old } = await db.from("design_templates").select("id").is("workspace_id", null).is("owner_id", null).contains("tags", ["gala-starter"]);
if (old?.length) await db.from("design_templates").delete().in("id", old.map(o => o.id));
const rows = OUT.map(t => ({ ...t, description: "Gala Dock starter template — the photo uses your event’s cover image", visibility: "public", status: "active",
  placeholders: ["event.name", "event.date", "event.time", "event.venue_name", "event.city", "event.public_url", "event.cover_image", "ticket.starting_price", "organizer.name"] }));
const { error } = await db.from("design_templates").insert(rows);
if (error) { console.error(error.message); process.exit(1); }
console.log(`Seeded ${rows.length} starter templates (replaced ${old?.length ?? 0}).`);
