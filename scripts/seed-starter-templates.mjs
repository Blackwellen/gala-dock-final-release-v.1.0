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
// Filter facets (see src/lib/media/template-taxonomy.ts). Set per call by withMeta()/biz() below, merged into each row.
let facet = {};
const add = (title, category, size, bg, layers, tags) => { const [W, H] = SIZE[size]; OUT.push({ title, category, ...facet, tags: ["gala-starter", size, ...tags], width: W, height: H, document: { unit: "px", dpi: 150, pages: [{ id: id(), name: title, width: W, height: H, background: solid(bg), layers: layers(W, H) }] } }); };
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

// ── facets for the event catalogue: style per layout, colours from the palette, event types split out of the category
const EVENT_KINDS = new Set(["concert", "festival", "private_party", "corporate", "wedding", "conference", "networking", "nightclub", "comedy", "theatre", "birthday"]);
const LAYOUT_META = { headline: ["bold", "announcement"], luxe: ["luxury", "invitation"], arch: ["elegant", "invitation"], split: ["modern", "announcement"], duo: ["bold", "announcement"],
  spotlight: ["editorial", "line_up"], energy: ["bold", "announcement"], circle: ["playful", "invitation"], ticket: ["retro", "ticket_launch"], story: ["photo", "announcement"],
  social: ["photo", "announcement"], screen: ["elegant", "welcome"], menu: ["elegant", "menu"] };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const lumOf = h => { const [r, g, b] = hex(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const hueOf = h => { const [r, g, b] = hex(h), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return -1;
  const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (x * 60 + 360) % 360; };
function paletteOf(c) {
  if (lumOf(c.bg) > 0.75) { const hu = hueOf(c.accent); return hu < 0 ? "light" : hu < 45 || hu > 300 ? (lumOf(c.bg) > 0.9 && hu > 300 ? "pastel" : "neutral") : hu < 170 ? "green" : "light"; }
  const hu = hueOf(c.accent), sat = Math.max(...hex(c.accent)) - Math.min(...hex(c.accent));
  if (hu >= 30 && hu <= 50 && sat < 0.5) return "black_gold";
  if (hu < 0 || sat < 0.15) return "monochrome";
  return hu < 20 || hu >= 345 ? "red" : hu < 45 ? "orange" : hu < 70 ? "bright" : hu < 160 ? "green" : hu < 250 ? "blue" : hu < 290 ? "purple" : "pink";
}
const withMeta = (name, fn) => (title, cat, ...rest) => { const c = rest.find(a => a && typeof a === "object" && "accent" in a); const [style, purpose] = LAYOUT_META[name];
  const ev = EVENT_KINDS.has(cat); const shared = ["menu", "catering", "venue_hire"].includes(cat) || name === "screen";
  facet = { audience: shared ? "both" : "organiser", style, palette: c ? paletteOf(c) : "", event_type: ev ? cat : "", business_type: cat === "catering" || cat === "menu" ? "catering" : cat === "venue_hire" ? "venue" : "" };
  return fn(title, ev ? purpose : cat, ...rest); };
const M = Object.fromEntries(Object.entries({ headline, luxe, arch, split, duo, spotlight, energy, circle, ticket, story, social, screen, menu }).map(([k, f]) => [k, withMeta(k, f)]));

// ── catalogue (original layouts × sample photography)
M.headline("Concert headline — Neon", "concert", "poster", "concert-crowd", C.night, "Anton");
M.headline("Festival headline — Ember", "festival", "poster", "festival-fire", C.ember, "Bebas Neue", { fy: 60 });
M.headline("Carnival headline — Sun", "festival", "portrait", "carnival", C.sun, "Anton");
M.headline("Fireworks headline — Gold", "private_party", "portrait", "fireworks", C.gold, "Syne");
M.headline("Stage headline — Cyan", "concert", "poster", "stage-lights", C.cyan, "Unbounded");
M.luxe("Gala dinner — Gold", "corporate", "poster", "gala-dinner", C.gold, "Cinzel");
M.luxe("Banquet evening — Gold", "corporate", "portrait", "banquet", C.gold, "Italiana");
M.luxe("Rooftop supper — Gold", "catering", "poster", "rooftop-dining", C.gold, "Bodoni Moda");
M.luxe("Waterfront soirée — Ice", "venue_hire", "portrait", "venue-waterfront", { ...C.gold, accent: "#cfd8ff", bg: "#071026" }, "Marcellus");
M.arch("Wedding arch — Cream", "wedding", "portrait", "brides", C.cream, "Cormorant Garamond", { fy: 40 });
M.arch("Wedding arch — Blush", "wedding", "poster", "wedding-table", C.blush, "Playfair Display");
M.arch("Garden ceremony — Sage", "wedding", "portrait", "garden-wedding", C.sage, "Instrument Serif");
M.arch("Garden party — Sage", "private_party", "poster", "garden-lounge", C.sage, "Fraunces");
M.split("Summit — Navy", "conference", "poster", "skyline-gathering", C.navy, "Inter Tight");
M.split("Live session — Violet", "concert", "portrait", "stage-lights", C.violet, "Space Grotesk");
M.split("Street culture — Lime", "festival", "poster", "street-art", C.lime, "Bricolage Grotesque");
M.split("City night — Navy", "networking", "portrait", "london-night", C.navy, "Manrope");
M.duo("Club night — Pink", "nightclub", "poster", "dj", C.night, "Anton");
M.duo("Rave — Cyan", "nightclub", "portrait", "crowd-hands", C.cyan, "Bebas Neue");
M.duo("Warehouse — Violet", "nightclub", "poster", "concert-silhouette", C.violet, "Anton");
M.spotlight("Artist spotlight — Violet", "concert", "poster", "artist-woman", C.violet, "Bebas Neue", { fx: 45 });
M.spotlight("Artist spotlight — Ember", "concert", "portrait", "artist-fire", C.ember, "Anton");
M.spotlight("Artist spotlight — Gold", "comedy", "poster", "artist-man", C.gold, "Syne");
M.spotlight("Performer — Pink", "theatre", "portrait", "performer", C.night, "Unbounded");
M.energy("Festival energy — Sun", "festival", "poster", "festival-sunset", { bg: "#1b0c3a", accent: "#ffcf3d" }, "Anton");
M.energy("Party energy — Coral", "private_party", "portrait", "party-smile", { bg: "#1a0f14", accent: "#ff6b5b" }, "Bebas Neue", { fy: 35 });
M.energy("Crowd energy — Lime", "concert", "square", "crowd-hands", { bg: "#0b0f05", accent: "#c6ff3d" }, "Anton");
M.circle("Birthday — Candy", "birthday", "portrait", "party-smile", C.candy, "Fredoka", { fy: 35 });
M.circle("Summer party — Mint", "private_party", "square", "beach-sunset", C.mint, "Outfit");
M.circle("New Year — Gold", "private_party", "portrait", "fireworks", { ...C.cream, bg: "#0c0a07", ink: "#ffffff", sub: "#cbbd9f", accent: "#d8b878", on: "#0c0a07" }, "Syne");
M.ticket("Photo ticket — Coral", "ticket_launch", "portrait", "concert-crowd", C.paperDark, "Anton");
M.ticket("Photo ticket — Blue", "ticket_launch", "poster", "fireworks", C.paperBlue, "Unbounded");
M.story("Story — On sale now", "ticket_launch", "dj", C.night, "Anton", "Tickets on sale now");
M.story("Story — Save the date", "wedding", "brides", C.gold, "Instrument Serif", "Save the date", { fy: 40 });
M.story("Story — Tonight", "event_day", "stage-lights", C.cyan, "Unbounded", "Tonight");
M.story("Story — Rooftop", "catering", "rooftop-dining", C.gold, "Instrument Serif", "Golden hour supper club");
M.social("Social — On sale", "ticket_launch", "concert-crowd", C.night, "Anton", "On sale now");
M.social("Social — Last tickets", "final_release", "festival-fire", C.ember, "Syne", "Last few tickets");
M.social("Social — Sold out", "sold_out", "crowd-hands", C.violet, "Anton", "Sold out — thank you");
M.social("Social — Early bird", "early_bird", "beach-sunset", C.sun, "Unbounded", "Early bird");
M.screen("Welcome screen — Gala", "event_day", "gala-dinner", C.gold, "Playfair Display");
M.screen("Welcome screen — Summit", "conference", "skyline-gathering", C.navy, "Instrument Serif");
M.menu("Menu — Supper club", "menu", "dinner", C.cream, "Cormorant Garamond");
M.menu("Menu — Garden", "catering", "garden-lounge", C.sage, "Fraunces");


// ── Venue & supplier templates (audience "provider"). Photos use the business's own listing photo once linked
// ({{event.cover_image}} is filled from the workspace's first listing); {{business.*}} fields fill name, location, price and contact.
const pmeta = (purpose, m, c) => { facet = { audience: "provider", business_type: m.b, style: m.style, palette: m.palette ?? paletteOf(c), event_type: "" }; return purpose; };
const Img = (sample, o) => ({ id: id(), name: o.name ?? "Photo", type: "image", asset: { src: `/design-assets/samples/${sample}.webp`, public: true }, fit: "cover", focusX: 50, focusY: o.fy ?? 50, zoom: 1, x: o.x, y: o.y, w: o.w, h: o.h, rotation: 0, effects: o.effects });
const head = (text, font, o) => T(text, { font, weight: condensed(font) ? 400 : o.weight ?? 700, size: o.size, lh: o.lh ?? 1.0, ls: condensed(font) ? 0 : -o.size * 0.02, tt: condensed(font) ? "uppercase" : undefined,
  italic: o.italic, color: o.color, x: o.x, y: o.y, w: o.w, h: o.h, align: o.align ?? "left", valign: o.valign ?? "top", name: o.name ?? "Headline" });
const contact = (o) => T("{{business.website}}  ·  {{business.phone}}", { font: "Inter", weight: 600, size: o.size, color: o.color, x: o.x, y: o.y, w: o.w, h: o.size * 1.8, align: o.align ?? "left", name: "Contact" });

// P1 · Showcase — full photo, headline, three features, call to action
const showcase = (title, purpose, size, sample, c, font, k, m, focus = {}) => add(title, pmeta(purpose, m, c), size, c.bg, (W, H) => { const mg = W * 0.07, u = W, tall = H / W > 1.2;
  return [P(sample, { x: 0, y: 0, w: W, h: H, ...focus }), scrim(0, 0, W, H * 0.25, c.bg, 0.6, 0), scrim(0, H * 0.32, W, H * 0.68, c.bg, 0, 0.97),
    eyebrow("{{business.name}}", { size: u * 0.02, color: "#ffffff", x: mg, y: mg, w: W * 0.6 }), eyebrow("{{business.location}}", { size: u * 0.02, color: c.accent, x: W * 0.4, y: mg, w: W * 0.6 - mg, align: "right" }),
    head(k.head, font, { size: u * (condensed(font) ? 0.12 : 0.085), color: "#ffffff", x: mg, y: H * (tall ? 0.46 : 0.36), w: W - mg * 2, h: H * (tall ? 0.22 : 0.26), valign: "bottom", lh: 0.98, italic: m.italic }),
    hair(mg, H * (tall ? 0.7 : 0.65), u * 0.12, c.accent, 3),
    ...k.features.flatMap((f, i) => [R({ name: "Bullet", fill: solid(c.accent), x: mg, y: H * (tall ? 0.73 : 0.685) + i * u * 0.048 + u * 0.012, w: u * 0.014, h: u * 0.014, fx: { radius: u * 0.007 } }),
      T(f, { font: "Inter", weight: 500, size: u * 0.03, color: alpha("#ffffff", 0.92), x: mg + u * 0.03, y: H * (tall ? 0.73 : 0.685) + i * u * 0.048, w: W * 0.7, h: u * 0.045, name: `Feature ${i + 1}` })]),
    ...pill(k.cta, { bg: c.accent, color: c.on ?? "#0b0b14", x: mg, y: H - mg - u * 0.09, w: u * 0.42, h: u * 0.09 }),
    contact({ size: u * 0.022, color: alpha("#ffffff", 0.85), x: W * 0.5, y: H - mg - u * 0.065, w: W * 0.5 - mg, align: "right" })]; }, ["photo", "provider"]);

// P2 · Rate card — photo header, package rows with prices, contact footer
const rates = (title, purpose, size, sample, c, font, k, m, focus = {}) => add(title, pmeta(purpose, m, c), size, c.bg, (W, H) => { const mg = W * 0.08, u = W, top = H * 0.3, ink = c.ink ?? "#ffffff";
  const rowH = (H * 0.56) / k.items.length;
  return [P(sample, { x: 0, y: 0, w: W, h: top, ...focus }), scrim(0, 0, W, top, "#000000", 0.1, 0.6),
    eyebrow("{{business.name}}", { size: u * 0.02, color: "#ffffff", x: mg, y: top * 0.32, w: W - mg * 2, align: "center" }),
    head(k.head, font, { size: u * 0.09, color: "#ffffff", x: mg, y: top * 0.45, w: W - mg * 2, h: top * 0.45, align: "center", valign: "middle", italic: m.italic, weight: 600 }),
    ...k.items.flatMap(([name, price, desc], i) => { const y = top + u * 0.05 + i * rowH;
      return [R({ name: "Package card", fill: solid(c.card ?? alpha(ink, 0.05)), x: mg, y, w: W - mg * 2, h: rowH - u * 0.025, fx: { radius: u * 0.02, stroke: { width: 1.5, color: alpha(c.accent, 0.35) } } }),
        T(name, { font, weight: condensed(font) ? 400 : 700, size: u * 0.042, tt: condensed(font) ? "uppercase" : undefined, color: ink, x: mg + u * 0.04, y: y + u * 0.03, w: W * 0.55, h: u * 0.06, name: `Package ${i + 1}` }),
        T(price, { font: "Inter", weight: 800, size: u * 0.042, color: c.accent, x: W * 0.55, y: y + u * 0.03, w: W * 0.45 - mg - u * 0.04, h: u * 0.06, align: "right", name: `Price ${i + 1}` }),
        T(desc, { font: "Inter", weight: 400, size: u * 0.026, lh: 1.4, color: c.sub ?? alpha(ink, 0.7), x: mg + u * 0.04, y: y + u * 0.1, w: W - mg * 2 - u * 0.08, h: rowH - u * 0.15, name: `Includes ${i + 1}` })]; }),
    T("Enquire  ·  {{business.email}}  ·  {{business.phone}}", { font: "Inter", weight: 600, size: u * 0.022, color: c.sub ?? alpha(ink, 0.7), x: mg, y: H - mg * 0.9, w: W - mg * 2, h: u * 0.04, align: "center", name: "Contact" })]; }, ["photo", "rates"]);

// P3 · Offer — colour field, huge offer figure, circular photo, terms
const offer = (title, purpose, size, sample, c, font, k, m, focus = {}) => add(title, pmeta(purpose, m, c), size, c.accent, (W, H) => { const mg = W * 0.08, u = W, d = Math.min(W * 0.36, H * 0.28), ink = c.on ?? "#0b0b14";
  return [R({ name: "Glow", fill: { type: "radial", stops: [{ offset: 0, color: alpha("#ffffff", 0.28) }, { offset: 1, color: alpha("#ffffff", 0) }] }, x: W - d * 1.3, y: -d * 0.3, w: d * 1.6, h: d * 1.6 }),
    P(sample, { x: W - mg - d, y: mg, w: d, h: d, ...focus, effects: { radius: d / 2, stroke: { width: u * 0.012, color: "#ffffff" } } }),
    eyebrow(k.eyebrow, { size: u * 0.022, color: ink, x: mg, y: mg, w: W - d - mg * 2.4 }),
    head(k.big, font, { size: u * (condensed(font) ? 0.2 : 0.15), color: ink, x: mg, y: mg + d + u * 0.02, w: W - mg * 2, h: H * 0.63 - mg - d - u * 0.03, valign: "bottom", lh: 0.9, name: "Offer" }),
    head(k.head, condensed(font) ? "Inter" : font, { size: u * 0.045, color: ink, x: mg, y: H * 0.64, w: W - mg * 2, h: u * 0.14, weight: 700, lh: 1.1, name: "Offer line" }),
    T(k.terms, { font: "Inter", weight: 500, size: u * 0.02, color: alpha(ink, 0.75), x: mg, y: H * 0.64 + u * 0.115, w: W - mg * 2, h: u * 0.06, lh: 1.35, name: "Terms" }),
    ...pill(k.cta, { bg: ink, color: c.accent, x: mg, y: H - mg - u * 0.085, w: u * 0.38, h: u * 0.085 }),
    T("{{business.name}}\n{{business.website}}", { font: "Inter", weight: 700, size: u * 0.022, lh: 1.4, color: ink, x: W * 0.5, y: H - mg - u * 0.075, w: W * 0.5 - mg, h: u * 0.08, align: "right", name: "Business" })]; }, ["offer", "provider"]);

// P4 · Testimonial — photo panel, big quote, stars, attribution
const quote = (title, purpose, size, sample, c, serif, k, m, focus = {}) => add(title, pmeta(purpose, m, c), size, c.bg, (W, H) => { const mg = W * 0.08, u = W, ph = H * 0.42, ink = c.ink ?? "#ffffff";
  return [P(sample, { x: 0, y: 0, w: W, h: ph, ...focus }), scrim(0, ph * 0.5, W, ph * 0.5, c.bg, 0, 1),
    T("“", { font: serif, weight: 700, size: u * 0.3, color: c.accent, x: mg, y: ph - u * 0.12, w: u * 0.25, h: u * 0.25, lh: 1, name: "Quote mark" }),
    eyebrow("Kind words", { size: u * 0.018, color: c.accent, x: mg + u * 0.2, y: ph + u * 0.02, w: W * 0.5 }),
    T(k.quote, { font: serif, weight: 500, italic: true, size: u * 0.052, lh: 1.25, color: ink, x: mg, y: ph + u * 0.1, w: W - mg * 2, h: H - ph - u * 0.36, name: "Quote" }),
    T("★★★★★", { font: "Inter", weight: 700, size: u * 0.04, ls: u * 0.008, color: c.accent, x: mg, y: H - mg - u * 0.15, w: W * 0.5, h: u * 0.06, name: "Stars" }),
    T(k.who, { font: "Inter", weight: 700, size: u * 0.026, color: ink, x: mg, y: H - mg - u * 0.07, w: W * 0.5, h: u * 0.045, name: "Name" }),
    T("{{business.name}}", { font: "Inter", weight: 600, size: u * 0.022, color: c.sub ?? alpha(ink, 0.7), x: W * 0.45, y: H - mg - u * 0.065, w: W * 0.55 - mg, h: u * 0.04, align: "right", name: "Business" })]; }, ["photo", "testimonial"]);

// P5 · Dates — photo strip, headline, date chips with status, CTA
const dates = (title, purpose, size, sample, c, font, k, m, focus = {}) => add(title, pmeta(purpose, m, c), size, c.bg, (W, H) => { const mg = W * 0.07, u = W, top = H * 0.36, ink = c.ink ?? "#ffffff";
  const cols = 3, rows = Math.ceil(k.dates.length / cols), cw = (W - mg * 2 - u * 0.03 * (cols - 1)) / cols, ch = Math.min(u * 0.15, (H - top - u * 0.27 - mg - u * 0.13 - u * 0.03 * (rows - 1)) / rows);
  return [P(sample, { x: 0, y: 0, w: W, h: top, ...focus }), scrim(0, top * 0.4, W, top * 0.6, c.bg, 0, 1),
    eyebrow("{{business.name}}  ·  {{business.location}}", { size: u * 0.018, color: c.accent, x: mg, y: top - u * 0.02, w: W - mg * 2 }),
    head(k.head, font, { size: u * (condensed(font) ? 0.1 : 0.072), color: ink, x: mg, y: top + u * 0.04, w: W - mg * 2, h: u * 0.2, valign: "middle", italic: m.italic }),
    ...k.dates.flatMap(([d, st], i) => { const x = mg + (i % cols) * (cw + u * 0.03), y = top + u * 0.27 + Math.floor(i / cols) * (ch + u * 0.03), hot = /last|few|1 left/i.test(st);
      return [R({ name: "Date", fill: solid(hot ? c.accent : alpha(ink, 0.07)), x, y, w: cw, h: ch, fx: { radius: u * 0.02 } }),
        T(d, { font, weight: condensed(font) ? 400 : 700, size: Math.min(u * 0.04, ch * 0.3), color: hot ? (c.on ?? "#0b0b14") : ink, x, y: y + ch * 0.14, w: cw, h: ch * 0.42, align: "center", tt: condensed(font) ? "uppercase" : undefined, name: `Date ${i + 1}` }),
        T(st, { font: "Inter", weight: 600, size: Math.min(u * 0.021, ch * 0.18), color: hot ? (c.on ?? "#0b0b14") : c.accent, x, y: y + ch * 0.6, w: cw, h: ch * 0.3, align: "center", name: `Status ${i + 1}` })]; }),
    ...pill(k.cta, { bg: c.accent, color: c.on ?? "#0b0b14", x: mg, y: H - mg - u * 0.085, w: u * 0.4, h: u * 0.085 }),
    contact({ size: u * 0.021, color: c.sub ?? alpha(ink, 0.75), x: W * 0.5, y: H - mg - u * 0.06, w: W * 0.5 - mg, align: "right" })]; }, ["photo", "dates"]);

// P6 · Gallery — 2×2 photo grid (swap in your own photos), title band
const gallery = (title, purpose, size, samples, c, font, k, m) => add(title, pmeta(purpose, m, c), size, c.bg, (W, H) => { const mg = W * 0.06, u = W, g = u * 0.018, band = H * 0.24, ink = c.ink ?? "#ffffff";
  const gw = (W - mg * 2 - g) / 2, gh = (H - band - mg * 2 - g) / 2;
  return [eyebrow("{{business.name}}", { size: u * 0.02, color: c.accent, x: mg, y: mg, w: W - mg * 2 }),
    head(k.head, font, { size: u * (condensed(font) ? 0.1 : 0.068), color: ink, x: mg, y: mg + u * 0.04, w: W - mg * 2, h: band - mg - u * 0.06, valign: "middle", italic: m.italic }),
    ...samples.slice(0, 4).map((s, i) => Img(s, { name: k.labels?.[i] ?? `Photo ${i + 1}`, x: mg + (i % 2) * (gw + g), y: band + Math.floor(i / 2) * (gh + g), w: gw, h: gh, effects: { radius: u * 0.018 } })),
    ...(k.labels ?? []).slice(0, 4).map((l, i) => T(l, { font: "Inter", weight: 700, size: u * 0.022, color: "#ffffff", x: mg + (i % 2) * (gw + g) + u * 0.025, y: band + Math.floor(i / 2) * (gh + g) + gh - u * 0.06, w: gw - u * 0.05, h: u * 0.04,
      fx: { shadow: { x: 0, y: 1, blur: 6, color: "rgba(0,0,0,0.6)" } }, name: `Caption ${i + 1}` })),
    T("{{business.website}}", { font: "Inter", weight: 600, size: u * 0.02, color: c.sub ?? alpha(ink, 0.7), x: mg, y: H - mg * 0.85, w: W - mg * 2, h: u * 0.035, align: "right", name: "Website" })]; }, ["gallery", "provider"]);

// P7 · Story — tall photo, big statement, CTA
const pstory = (title, purpose, sample, c, font, k, m, focus = {}) => add(title, pmeta(purpose, m, c), "story", c.bg, (W, H) => { const mg = W * 0.08, u = W;
  return [P(sample, { x: 0, y: 0, w: W, h: H, ...focus }), scrim(0, 0, W, H * 0.2, c.bg, 0.6, 0), scrim(0, H * 0.4, W, H * 0.6, c.bg, 0, 0.97),
    eyebrow("{{business.name}}", { size: u * 0.026, color: "#ffffff", x: mg, y: H * 0.08, w: W - mg * 2, align: "center" }),
    eyebrow(k.eyebrow, { size: u * 0.024, color: c.accent, x: mg, y: H * 0.56, w: W - mg * 2, align: "center" }),
    head(k.head, font, { size: u * (condensed(font) ? 0.16 : 0.11), color: "#ffffff", x: mg, y: H * 0.59, w: W - mg * 2, h: H * 0.2, align: "center", valign: "middle", lh: 0.95, italic: m.italic }),
    T(k.sub, { font: "Inter", weight: 500, size: u * 0.036, lh: 1.35, color: alpha("#ffffff", 0.88), x: mg, y: H * 0.8, w: W - mg * 2, h: u * 0.12, align: "center", name: "Details" }),
    ...pill(k.cta, { bg: c.accent, color: c.on ?? "#0b0b14", x: W * 0.25, y: H * 0.88, w: W * 0.5, h: u * 0.11 }),
    T("{{business.website}}", { font: "Inter", weight: 600, size: u * 0.026, color: alpha("#ffffff", 0.8), x: mg, y: H * 0.955, w: W - mg * 2, h: u * 0.04, align: "center", name: "Website" })]; }, ["photo", "story", "provider"]);

const V = { gold: C.gold, cream: { ...C.cream, card: "#ffffff" }, sage: { ...C.sage, card: "#ffffff" }, blush: { ...C.blush, card: "#ffffff" }, navy: C.navy, night: C.night, ember: C.ember, cyan: C.cyan, violet: C.violet,
  candy: { ...C.candy, card: "#ffffff" }, mint: { ...C.mint, card: "#ffffff" }, sun: C.sun };

// Showcases
showcase("Venue showcase — Gold", "venue_showcase", "portrait", "venue-waterfront", V.gold, "Cormorant Garamond", { head: "Your celebration, beautifully hosted", features: ["Up to 300 guests", "In-house catering & bar", "Late licence until 1am"], cta: "Book a viewing" }, { b: "venue", style: "luxury" });
showcase("Venue hire — Navy", "venue_hire", "poster", "skyline-gathering", V.navy, "Inter Tight", { head: "Spaces for every occasion", features: ["Conferences & launches", "Private dining for 12–200", "AV and Wi-Fi included"], cta: "Check dates" }, { b: "venue", style: "modern" });
showcase("Garden venue — Sage", "venue_showcase", "square", "garden-lounge", { ...V.sage, bg: "#1b2a22", on: "#ffffff" }, "Fraunces", { head: "Garden weddings & long summer parties", features: ["Ceremony lawn", "Covered terrace", "Exclusive use"], cta: "Plan a visit" }, { b: "venue", style: "botanical" });
showcase("Catering — Sage", "catering", "portrait", "dinner", { ...V.sage, bg: "#1b2a22", on: "#ffffff" }, "Fraunces", { head: "Seasonal menus, made for your event", features: ["Canapés to banquets", "Every dietary need covered", "Full service team"], cta: "Request a menu" }, { b: "catering", style: "elegant" });
showcase("DJ — Neon", "now_booking", "square", "dj", V.night, "Anton", { head: "Dance floors, sorted", features: ["Weddings, parties & corporate", "Pro sound and lighting", "Your playlist, our mix"], cta: "Check availability" }, { b: "dj", style: "neon" });
showcase("Photographer — Cream", "venue_showcase", "portrait", "brides", { ...V.cream, bg: "#1d1a15", on: "#ffffff" }, "Instrument Serif", { head: "Moments, beautifully kept", features: ["Full-day coverage", "Private online gallery", "Prints and albums"], cta: "See packages" }, { b: "photography", style: "editorial", italic: true }, { fy: 40 });
showcase("Florist — Blush", "venue_showcase", "portrait", "wedding-table", { ...V.blush, bg: "#2b1619", on: "#ffffff" }, "Playfair Display", { head: "Flowers & styling that stop the room", features: ["Bespoke designs", "Set-up and clear-down", "Full venue styling"], cta: "Get a quote" }, { b: "florist", style: "botanical" });
showcase("Mobile bar — Ember", "venue_showcase", "square", "rooftop-dining", V.ember, "Bebas Neue", { head: "The bar comes to you", features: ["Signature cocktails", "Licensed bartenders", "Glassware included"], cta: "Book the bar" }, { b: "bar", style: "bold" });
showcase("Cakes — Candy", "venue_showcase", "portrait", "party-smile", { ...V.candy, bg: "#26113a", on: "#ffffff" }, "Fredoka", { head: "Cakes worth celebrating", features: ["Tasting sessions", "Custom designs", "Delivered and set up"], cta: "Order a tasting" }, { b: "cakes", style: "playful" }, { fy: 35 });
showcase("Lighting & AV — Cyan", "venue_showcase", "poster", "stage-lights", V.cyan, "Unbounded", { head: "Light it up", features: ["Uplighting and pin spots", "Stages and LED screens", "Technician on site"], cta: "Plan your tech" }, { b: "lighting_av", style: "neon" });
// Rate cards
rates("Venue packages — Cream", "packages", "poster", "gala-dinner", V.cream, "Cormorant Garamond", { head: "Wedding packages", items: [["The Classic", "{{business.price_from}}", "Ceremony and reception rooms, tables and chairs, venue coordinator."], ["The Celebration", "£6,500", "Everything in Classic plus three-course dinner for 80 and a drinks package."], ["The Grand", "£11,000", "Exclusive use for the weekend, 120 guests, evening food, late bar and suite."]] }, { b: "venue", style: "elegant", italic: true });
rates("Catering price list — Sage", "price_list", "poster", "banquet", V.sage, "Fraunces", { head: "Menus & prices", items: [["Canapé reception", "From £14 pp", "Six canapés per guest, served by our team."], ["Sharing feast", "From £38 pp", "Seasonal sharing platters, sides and dessert."], ["Fine dining", "From £62 pp", "Three plated courses with coffee and petits fours."], ["Late-night food", "From £9 pp", "Bao, sliders or wood-fired pizza."]] }, { b: "catering", style: "elegant" });
rates("DJ packages — Neon", "packages", "portrait", "crowd-hands", { ...V.night, ink: "#ffffff", sub: "#b9bcd6" }, "Anton", { head: "DJ packages", items: [["Party", "{{business.price_from}}", "Four hours, sound system and dance-floor lighting."], ["Wedding", "£850", "Ceremony audio, drinks reception and evening set."], ["Premium", "£1,400", "All-day cover, LED dance floor and a live sax."]] }, { b: "dj", style: "bold" });
rates("Photography packages — Blue", "packages", "poster", "brides", { bg: "#f3f5fb", accent: "#3a57ff", ink: "#0d1b3d", sub: "#5a6585", card: "#ffffff" }, "Instrument Serif", { head: "Photography", items: [["Essentials", "{{business.price_from}}", "Ceremony to first dance, 300+ edited photos."], ["Full day", "£1,650", "Prep to party, online gallery, second shooter."], ["Heirloom", "£2,400", "Full day plus engagement shoot and a fine-art album."]] }, { b: "photography", style: "minimal", italic: true }, { fy: 40 });
rates("Bar menu — Gold", "drinks", "portrait", "rooftop-dining", V.gold, "Italiana", { head: "Bar packages", items: [["Welcome drinks", "From £8 pp", "Prosecco or signature cocktail on arrival."], ["Open bar", "From £32 pp", "Four hours of beer, wine, spirits and mixers."], ["Cocktail masterclass", "£45 pp", "Make three classics with our head bartender."]] }, { b: "bar", style: "luxury" });
// Offers
offer("Midweek offer — Coral", "special_offer", "square", "venue-waterfront", { accent: "#ff6b5b", on: "#1a0f14" }, "Anton", { eyebrow: "Midweek special", big: "20% off", head: "Book any Monday–Thursday date in 2027", terms: "New bookings only. Subject to availability. Ends 31 March.", cta: "Claim offer" }, { b: "venue", style: "bold", palette: "red" });
offer("Christmas parties — Red", "christmas_parties", "portrait", "banquet", { accent: "#c8102e", on: "#ffffff" }, "Playfair Display", { eyebrow: "Christmas 2026", big: "Party nights", head: "Three courses, live DJ and a late bar from £49 pp", terms: "Shared and exclusive parties for 20–300 guests.", cta: "Book your party" }, { b: "venue", style: "festive", palette: "red" });
offer("Gift voucher — Blush", "gift_voucher", "square", "brides", { accent: "#f3c6cf", on: "#2b1619" }, "Cormorant Garamond", { eyebrow: "Gift voucher", big: "£100", head: "Towards any photography package", terms: "Valid for 12 months. Not exchangeable for cash.", cta: "Buy a voucher" }, { b: "photography", style: "elegant", palette: "pastel" }, { fy: 40 });
offer("Early booking — Cyan", "seasonal_offer", "square", "dj", { accent: "#32e6ff", on: "#02131c" }, "Unbounded", { eyebrow: "Early booking", big: "Save 15%", head: "Book your 2027 date before 1 January", terms: "Deposit secures the price. Applies to all packages.", cta: "Check my date" }, { b: "dj", style: "modern", palette: "blue" });
offer("Free upgrade — Mint", "special_offer", "portrait", "dinner", { accent: "#11a37f", on: "#ffffff" }, "Outfit", { eyebrow: "This month only", big: "Free canapés", head: "Upgrade any wedding menu with a canapé reception", terms: "Weddings of 60+ guests booked by 30 November.", cta: "Ask about menus" }, { b: "catering", style: "modern", palette: "green" });
// Testimonials
quote("Review — Venue cream", "testimonial", "portrait", "garden-wedding", { ...V.cream, ink: "#1d1a15" }, "Cormorant Garamond", { quote: "From our first viewing to the last dance, the team made everything effortless. Our guests still talk about it.", who: "Amelia & Tom" }, { b: "venue", style: "elegant" });
quote("Review — DJ night", "testimonial", "square", "concert-crowd", V.night, "Playfair Display", { quote: "The dance floor was full from the first song to the last. Exactly what we wanted.", who: "Priya, birthday party" }, { b: "dj", style: "bold" });
quote("Review — Photographer blush", "testimonial", "square", "brides", { ...V.blush, ink: "#2b1619" }, "Instrument Serif", { quote: "Every photo feels like us. We cried when the gallery arrived.", who: "Sophie & Daniel" }, { b: "photography", style: "editorial" }, { fy: 40 });
quote("Review — Catering sage", "testimonial", "portrait", "banquet", { ...V.sage, ink: "#1b2a22" }, "Fraunces", { quote: "Beautiful food, perfectly timed service and they handled every dietary need without fuss.", who: "Head of Events, Northwind" }, { b: "catering", style: "elegant" });
// Dates & bookings
dates("Dates left — Navy", "availability", "portrait", "venue-waterfront", V.navy, "Inter Tight", { head: "Limited 2027 dates", dates: [["Sat 12 Jun", "Available"], ["Fri 2 Jul", "Last one"], ["Sat 17 Jul", "Available"], ["Sun 8 Aug", "Available"], ["Sat 4 Sep", "Last one"], ["Sat 25 Sep", "Available"]], cta: "Hold a date" }, { b: "venue", style: "modern" });
dates("Now booking — Violet", "now_booking", "square", "dj", V.violet, "Anton", { head: "Now booking 2027", dates: [["May", "Few left"], ["June", "Few left"], ["July", "Available"], ["Aug", "Available"], ["Sept", "Available"], ["Dec", "Few left"]], cta: "Check my date" }, { b: "dj", style: "bold" });
dates("Wedding fair — Cream", "wedding_fair", "poster", "wedding-table", { ...V.cream, ink: "#1d1a15" }, "Cormorant Garamond", { head: "Wedding open day", dates: [["11:00", "Venue tours"], ["12:30", "Menu tasting"], ["14:00", "Meet suppliers"]], cta: "Reserve a place" }, { b: "venue", style: "elegant", italic: true });
dates("Open evening — Gold", "open_day", "portrait", "gala-dinner", V.gold, "Italiana", { head: "Open evening", dates: [["Thu 14 Nov", "18:00–21:00"], ["Thu 5 Dec", "18:00–21:00"], ["Thu 16 Jan", "1 left"]], cta: "Book a tour" }, { b: "venue", style: "luxury" });
// Galleries
gallery("Portfolio — Cream", "portfolio", "square", ["brides", "garden-wedding", "wedding-table", "party-smile"], { ...V.cream, ink: "#1d1a15" }, "Instrument Serif", { head: "Recent weddings", labels: ["Amelia & Tom", "Garden ceremony", "The details", "First dance"] }, { b: "photography", style: "editorial", italic: true });
gallery("Our spaces — Gold", "venue_showcase", "portrait", ["gala-dinner", "garden-lounge", "rooftop-dining", "venue-waterfront"], V.gold, "Cinzel", { head: "Our spaces", labels: ["The Great Hall", "Garden Lounge", "Rooftop", "Waterfront Terrace"] }, { b: "venue", style: "luxury" });
gallery("Styling portfolio — Blush", "portfolio", "square", ["wedding-table", "garden-lounge", "banquet", "brides"], { ...V.blush, ink: "#2b1619" }, "Playfair Display", { head: "Recent styling", labels: ["Tablescapes", "Lounge areas", "Banquets", "Bridal"] }, { b: "decor", style: "botanical" });
gallery("Meet the team — Sage", "meet_the_team", "portrait", ["artist-woman", "artist-man", "performer", "party-smile"], { ...V.sage, ink: "#1b2a22" }, "Fraunces", { head: "Meet the team", labels: ["Head chef", "Events manager", "Front of house", "Pastry"] }, { b: "catering", style: "modern" });
// Stories
pstory("Story — Now booking venue", "now_booking", "venue-waterfront", V.gold, "Cormorant Garamond", { eyebrow: "Now booking", head: "2027 weddings", sub: "Viewings every Thursday evening and Saturday morning", cta: "Book a viewing" }, { b: "venue", style: "luxury" });
pstory("Story — Cocktail offer", "special_offer", "rooftop-dining", V.ember, "Bebas Neue", { eyebrow: "This weekend", head: "2-for-1 cocktails", sub: "At every event we serve, Friday to Sunday", cta: "Book the bar" }, { b: "bar", style: "bold" });
pstory("Story — New lighting", "new_service", "stage-lights", V.cyan, "Unbounded", { eyebrow: "New for 2027", head: "LED dance floors", sub: "Add a starlit or colour-changing floor to any booking", cta: "Get a quote" }, { b: "lighting_av", style: "neon" });
pstory("Story — Christmas parties", "christmas_parties", "banquet", { ...V.gold, accent: "#e0b45a" }, "Playfair Display", { eyebrow: "Christmas 2026", head: "Party nights", sub: "Dinner, DJ and late bar from £49 per person", cta: "Book now" }, { b: "venue", style: "festive" });

const { data: old } = await db.from("design_templates").select("id").is("workspace_id", null).is("owner_id", null).contains("tags", ["gala-starter"]);
if (old?.length) await db.from("design_templates").delete().in("id", old.map(o => o.id));
const rows = OUT.map(t => ({ ...t, visibility: "public", status: "active",
  description: t.audience === "provider" ? "Gala Dock starter template for venues and suppliers — your business details and listing photo fill in automatically" : "Gala Dock starter template — the photo uses your event’s cover image",
  placeholders: t.audience === "provider" ? ["business.name", "business.location", "business.price_from", "business.website", "business.email", "business.phone", "event.cover_image"]
    : ["event.name", "event.date", "event.time", "event.venue_name", "event.city", "event.public_url", "event.cover_image", "ticket.starting_price", "organizer.name"] }));
const { error } = await db.from("design_templates").insert(rows);
if (error) { console.error(error.message); process.exit(1); }
console.log(`Seeded ${rows.length} starter templates (replaced ${old?.length ?? 0}).`);
