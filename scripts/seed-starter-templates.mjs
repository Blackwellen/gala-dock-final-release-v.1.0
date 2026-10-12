// Seeds Gala Dock starter templates (platform templates: workspace_id and owner_id null, public, active) for the Media Studio
// Templates tab. Built from the design kit — gradients, library shapes, widgets, info cards and text effects — with
// {{event.*}} placeholders, no stock photography. Idempotent: replaces previous starters (tag "gala-starter").
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-starter-templates.mjs
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let n = 0; const id = () => `t${(++n).toString(36)}`;
const SIZES = { poster: [1240, 1754], square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920], screen: [1920, 1080], banner: [1500, 500] };
const lin = (angle, ...colors) => ({ type: "linear", angle, stops: colors.map((c, i) => ({ offset: i / (colors.length - 1), color: c })) });
const rad = (...colors) => ({ type: "radial", stops: colors.map((c, i) => ({ offset: i / (colors.length - 1), color: c })) });
const solid = color => ({ type: "solid", color });
const text = (t, o) => ({ id: id(), name: o.name ?? t.slice(0, 24), type: "text", text: t, bind: o.bind, font: o.font ?? "Inter", size: o.size, weight: o.weight ?? 800, italic: o.italic, color: o.color ?? "#ffffff",
  align: o.align ?? "center", valign: o.valign ?? "middle", lineHeight: o.lh ?? 1.05, letterSpacing: o.ls ?? 0, transform: o.tt, x: o.x, y: o.y, w: o.w, h: o.h, rotation: o.r ?? 0, effects: o.fx });
const shape = (d, o) => ({ id: id(), name: o.name ?? "Shape", type: "shape", shape: d ? "custom" : o.shape ?? "rect", d, fill: o.fill, x: o.x, y: o.y, w: o.w, h: o.h, rotation: o.r ?? 0, effects: o.fx });
const widget = (w, o) => ({ id: id(), name: o.name ?? w, type: "widget", widget: w, variant: o.variant ?? 0, theme: o.theme, props: o.props, font: o.font, x: o.x, y: o.y, w: o.w, h: o.h, rotation: 0 });
const qr = o => ({ id: id(), name: "Ticket QR", type: "qr", value: "{{event.public_url}}", bind: "event.public_url", fg: o.fg ?? "#090a2e", bg: o.bg ?? "#ffffff", label: o.label ?? "Scan for tickets", x: o.x, y: o.y, w: o.s, h: o.s * 1.12, rotation: 0 });
const STAR = n => { const p = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? 41 : 50; p.push(`${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`); } return `M${p.join(" L")} Z`; };
const BLOB = "M50 4 Q78 2 90 26 Q100 48 88 72 Q76 96 48 96 Q20 96 8 72 Q-2 48 12 24 Q24 6 50 4 Z";
const WAVE = "M0 40 C20 20 40 60 60 40 C80 20 90 50 100 40 V100 H0 Z";
const NAME = "{{event.name}}", DATE = "{{event.date}} · {{event.time}}", VENUE = "{{event.venue_name}}, {{event.city}}", PRICE = "Tickets from {{ticket.starting_price}}";
const theme = (a, b, t, bg) => ({ a, b, text: t, bg });

const T = [];
const add = (title, category, size, bg, layers, tags = []) => { const [w, h] = SIZES[size]; T.push({ title, category, tags: ["gala-starter", size, ...tags], width: w, height: h, document: { unit: "px", dpi: 150, pages: [{ id: id(), name: title, width: w, height: h, background: bg, layers: layers(w, h) }] } }); };

// ── Nightlife & music
add("Neon club night", "nightclub", "poster", rad("#2b0040", "#07071a"), (w, h) => [
  shape(STAR(24), { name: "Burst", fill: lin(135, "#ff2d87", "#7928ca"), x: w * 0.15, y: h * 0.08, w: w * 0.7, h: w * 0.7, fx: { opacity: 0.35, blur: 4 } }),
  text(NAME, { bind: "event.name", font: "Monoton", size: w * 0.11, x: w * 0.06, y: h * 0.2, w: w * 0.88, h: h * 0.28, color: "#ffffff", fx: { textFx: { kind: "neon", color: "#ff2d87" } } }),
  text(DATE, { font: "Bebas Neue", weight: 400, size: w * 0.06, x: 0, y: h * 0.52, w, h: h * 0.06, color: "#05d9e8", ls: 3 }),
  text(VENUE, { font: "Inter", weight: 600, size: w * 0.032, x: 0, y: h * 0.59, w, h: h * 0.05, color: "#d1f7ff" }),
  widget("lineup", { theme: theme("#ff2d87", "#05d9e8", "#ffffff", "#07071a"), variant: 2, props: { title: "LINE-UP", items: "HEADLINER\nSpecial Guest\nResident DJs" }, x: w * 0.15, y: h * 0.65, w: w * 0.7, h: h * 0.2 }),
  qr({ x: w * 0.78, y: h * 0.84, s: w * 0.17, fg: "#07071a" })], ["neon", "dj"]);
add("Techno warehouse", "nightclub", "square", solid("#000000"), (w, h) => [
  shape(null, { name: "Grid", fill: lin(90, "#39ff14", "#00e5ff"), x: 0, y: h * 0.86, w, h: h * 0.02 }),
  text("TECHNO", { font: "Anton", weight: 400, size: w * 0.24, x: 0, y: h * 0.12, w, h: h * 0.3, color: "transparent", fx: { textFx: { kind: "hollow", color: "#39ff14" } } }),
  text(NAME, { bind: "event.name", font: "Space Grotesk", weight: 700, size: w * 0.06, x: w * 0.06, y: h * 0.48, w: w * 0.88, h: h * 0.14 }),
  text(DATE, { font: "JetBrains Mono", weight: 500, size: w * 0.035, x: 0, y: h * 0.66, w, h: h * 0.06, color: "#39ff14" }),
  text(VENUE, { font: "JetBrains Mono", weight: 400, size: w * 0.028, x: 0, y: h * 0.73, w, h: h * 0.05, color: "#bbbbbb" })], ["techno"]);
add("Jazz evening", "concert", "portrait", lin(180, "#1b1b1e", "#3a2a1e"), (w, h) => [
  shape(BLOB, { name: "Spotlight", fill: rad("#d8a47f", "#1b1b1e"), x: w * 0.1, y: h * 0.05, w: w * 0.8, h: w * 0.8, fx: { opacity: 0.6 } }),
  text("an evening of", { font: "Great Vibes", weight: 400, size: w * 0.07, x: 0, y: h * 0.2, w, h: h * 0.08, color: "#d8a47f" }),
  text(NAME, { bind: "event.name", font: "Playfair Display", weight: 800, italic: true, size: w * 0.1, x: w * 0.06, y: h * 0.3, w: w * 0.88, h: h * 0.22 }),
  widget("date-block", { theme: theme("#d8a47f", "#ef8354", "#f4e4d4", "#1b1b1e"), variant: 1, props: { month: "JUN", day: "21", weekday: "Saturday" }, x: w * 0.38, y: h * 0.58, w: w * 0.24, h: h * 0.2 }),
  text(VENUE, { font: "Lora", weight: 500, size: w * 0.032, x: 0, y: h * 0.82, w, h: h * 0.05, color: "#e6ccb2" })], ["jazz"]);
add("Festival announcement", "festival", "poster", lin(170, "#ff6b35", "#f7c59f", "#004e89"), (w, h) => [
  shape(STAR(16), { name: "Sun", fill: solid("#ffd23f"), x: w * 0.3, y: h * 0.05, w: w * 0.4, h: w * 0.4, fx: { glow: { blur: 60, color: "#ffd23f" } } }),
  text(NAME, { bind: "event.name", font: "Bungee", weight: 400, size: w * 0.1, x: w * 0.05, y: h * 0.33, w: w * 0.9, h: h * 0.2, color: "#ffffff", fx: { textFx: { kind: "long-shadow", color: "#004e89", depth: 30, angle: 45 } } }),
  text(DATE, { font: "Outfit", weight: 700, size: w * 0.045, x: 0, y: h * 0.55, w, h: h * 0.06, color: "#004e89" }),
  widget("lineup", { theme: theme("#004e89", "#ff6b35", "#003049", "#ffffff"), variant: 2, props: { title: "FEATURING", items: "MAIN ACT\nSecond Act\nThird Act\nPlus many more" }, x: w * 0.1, y: h * 0.62, w: w * 0.8, h: h * 0.24 }),
  shape(WAVE, { name: "Wave", fill: solid("#004e89"), x: 0, y: h * 0.86, w, h: h * 0.14 }),
  text(PRICE, { font: "Outfit", weight: 700, size: w * 0.035, x: 0, y: h * 0.92, w, h: h * 0.05 })], ["summer"]);
add("Countdown story", "ticket_launch", "story", lin(160, "#7928ca", "#ff0080"), (w, h) => [
  text("TICKETS ON SALE", { font: "Anton", weight: 400, size: w * 0.09, x: 0, y: h * 0.12, w, h: h * 0.08, ls: 4 }),
  text(NAME, { bind: "event.name", font: "Syne", weight: 800, size: w * 0.11, x: w * 0.06, y: h * 0.22, w: w * 0.88, h: h * 0.22 }),
  widget("countdown", { theme: theme("#ffffff", "#ff0080", "#ffffff", "#2b0033"), variant: 4, props: { label: "Launching in", days: 3, hours: 12, mins: 0, secs: 0 }, x: w * 0.06, y: h * 0.48, w: w * 0.88, h: h * 0.16 }),
  text(DATE, { font: "Inter", weight: 700, size: w * 0.045, x: 0, y: h * 0.7, w, h: h * 0.05 }),
  qr({ x: w * 0.32, y: h * 0.77, s: w * 0.36 })], ["story"]);
add("Sold out", "sold_out", "square", solid("#111111"), (w, h) => [
  text(NAME, { bind: "event.name", font: "Inter", weight: 900, size: w * 0.08, x: w * 0.06, y: h * 0.12, w: w * 0.88, h: h * 0.2 }),
  widget("stamp", { theme: theme("#ff3b3b", "#ffffff", "#ffffff", "#111111"), props: { text: "SOLD OUT", sub: "Thank you" }, x: w * 0.12, y: h * 0.38, w: w * 0.76, h: h * 0.3 }),
  text("Join the waitlist for returns", { font: "Inter", weight: 600, size: w * 0.04, x: 0, y: h * 0.78, w, h: h * 0.06, color: "#bbbbbb" })], ["sold out"]);
add("Early bird", "early_bird", "portrait", lin(135, "#fdc830", "#f37335"), (w, h) => [
  shape(STAR(12), { name: "Badge", fill: solid("#ffffff"), x: w * 0.58, y: h * 0.05, w: w * 0.36, h: w * 0.36, r: 12 }),
  text("EARLY\nBIRD", { font: "Bebas Neue", weight: 400, size: w * 0.08, x: w * 0.6, y: h * 0.09, w: w * 0.32, h: h * 0.2, color: "#f37335", lh: 0.9, r: 12 }),
  text(NAME, { bind: "event.name", font: "Archivo Black", weight: 400, size: w * 0.1, x: w * 0.06, y: h * 0.36, w: w * 0.88, h: h * 0.22, align: "left", color: "#1b1b1b" }),
  widget("price-tag", { theme: theme("#1b1b1b", "#ffffff", "#1b1b1b", "#ffffff"), props: { label: "Early bird from", price: "{{ticket.starting_price}}", note: "Limited tickets" }, x: w * 0.06, y: h * 0.62, w: w * 0.5, h: h * 0.2 }),
  text(DATE, { font: "Inter", weight: 700, size: w * 0.035, x: w * 0.06, y: h * 0.86, w: w * 0.88, h: h * 0.05, align: "left", color: "#1b1b1b" })], ["offer"]);
add("Final release", "final_release", "story", rad("#ff3b3b", "#370617"), (w, h) => [
  text("FINAL\nRELEASE", { font: "Anton", weight: 400, size: w * 0.2, x: 0, y: h * 0.14, w, h: h * 0.3, lh: 0.95, fx: { textFx: { kind: "3d", color: "#370617", depth: 14, angle: 45 } } }),
  text(NAME, { bind: "event.name", font: "Inter", weight: 800, size: w * 0.07, x: w * 0.06, y: h * 0.48, w: w * 0.88, h: h * 0.14 }),
  widget("progress", { theme: theme("#ffd23f", "#ffffff", "#ffffff", "#370617"), variant: 2, props: { value: 92, label: "Tickets sold" }, x: w * 0.08, y: h * 0.66, w: w * 0.84, h: h * 0.08 }),
  qr({ x: w * 0.32, y: h * 0.78, s: w * 0.36 })], ["urgency"]);
// ── Weddings & celebrations
add("Elegant wedding", "wedding", "portrait", solid("#fff8f2"), (w, h) => [
  shape(null, { shape: "rect", name: "Frame", fill: solid("transparent"), x: w * 0.05, y: h * 0.04, w: w * 0.9, h: h * 0.92, fx: { stroke: { width: 3, color: "#b8935a" } } }),
  text("Together with their families", { font: "Cormorant Garamond", weight: 500, italic: true, size: w * 0.04, x: 0, y: h * 0.14, w, h: h * 0.05, color: "#6e4f2b" }),
  text(NAME, { bind: "event.name", font: "Great Vibes", weight: 400, size: w * 0.12, x: w * 0.08, y: h * 0.22, w: w * 0.84, h: h * 0.24, color: "#3d2b1f" }),
  widget("divider", { theme: theme("#b8935a", "#e3c79c", "#3d2b1f", "#fff8f2"), props: { text: "✦" }, x: w * 0.2, y: h * 0.48, w: w * 0.6, h: h * 0.04 }),
  text(DATE, { font: "Cormorant Garamond", weight: 600, size: w * 0.05, x: 0, y: h * 0.55, w, h: h * 0.06, color: "#3d2b1f" }),
  text(VENUE, { font: "Cormorant Garamond", weight: 500, size: w * 0.04, x: 0, y: h * 0.62, w, h: h * 0.05, color: "#6e4f2b" }),
  widget("agenda", { theme: theme("#b8935a", "#e3c79c", "#3d2b1f", "#fff8f2"), variant: 2, font: "Cormorant Garamond", props: { title: "Order of the day", items: "14:00 | Ceremony\n15:30 | Drinks\n18:00 | Dinner\n20:30 | Dancing" }, x: w * 0.15, y: h * 0.69, w: w * 0.7, h: h * 0.24 })], ["elegant"]);
add("Sage wedding welcome", "wedding", "screen", solid("#f4f1e8"), (w, h) => [
  shape(BLOB, { name: "Leaf blob", fill: solid("#cad2c5"), x: -w * 0.08, y: -h * 0.2, w: w * 0.4, h: h * 0.8, fx: { opacity: 0.7 } }),
  shape(BLOB, { name: "Leaf blob", fill: solid("#84a98c"), x: w * 0.72, y: h * 0.45, w: w * 0.36, h: h * 0.7, fx: { opacity: 0.5 } }),
  text("Welcome to the wedding of", { font: "Lora", weight: 500, italic: true, size: h * 0.05, x: 0, y: h * 0.2, w, h: h * 0.08, color: "#52796f" }),
  text(NAME, { bind: "event.name", font: "Parisienne", weight: 400, size: h * 0.16, x: w * 0.1, y: h * 0.3, w: w * 0.8, h: h * 0.3, color: "#354f52" }),
  text(DATE, { font: "Lora", weight: 600, size: h * 0.05, x: 0, y: h * 0.66, w, h: h * 0.07, color: "#354f52" })], ["screen"]);
add("Birthday party", "birthday", "square", lin(135, "#ff6ec4", "#7873f5"), (w, h) => [
  shape(STAR(5), { name: "Star", fill: solid("#ffd23f"), x: w * 0.06, y: h * 0.06, w: w * 0.16, h: w * 0.16, r: -12 }), shape(STAR(5), { name: "Star", fill: solid("#ffffff"), x: w * 0.8, y: h * 0.12, w: w * 0.1, h: w * 0.1, r: 18 }),
  text("Let’s celebrate!", { font: "Pacifico", weight: 400, size: w * 0.07, x: 0, y: h * 0.16, w, h: h * 0.1 }),
  text(NAME, { bind: "event.name", font: "Bungee", weight: 400, size: w * 0.09, x: w * 0.06, y: h * 0.3, w: w * 0.88, h: h * 0.22, fx: { textFx: { kind: "3d", color: "#4a00e0", depth: 10, angle: 45 } } }),
  text(DATE, { font: "Nunito", weight: 800, size: w * 0.045, x: 0, y: h * 0.58, w, h: h * 0.06 }),
  widget("card", { theme: theme("#ff6ec4", "#ffffff", "#2b0033", "#ffffff"), variant: 0, props: { icon: "Gift", title: "Party bags", text: "Party bags for every guest at the door.", layout: 2 }, x: w * 0.12, y: h * 0.7, w: w * 0.76, h: h * 0.16 })], ["party"]);
add("Kids party", "childrens_party", "portrait", solid("#fffbea"), (w, h) => [
  shape(BLOB, { name: "Blob", fill: solid("#ffca3a"), x: -w * 0.1, y: -h * 0.06, w: w * 0.5, h: w * 0.5 }), shape(BLOB, { name: "Blob", fill: solid("#8ac926"), x: w * 0.65, y: h * 0.7, w: w * 0.5, h: w * 0.5 }),
  text("You’re invited!", { font: "Fredoka", weight: 700, size: w * 0.07, x: 0, y: h * 0.18, w, h: h * 0.08, color: "#1982c4" }),
  text(NAME, { bind: "event.name", font: "Bubblegum Sans", weight: 400, size: w * 0.11, x: w * 0.06, y: h * 0.28, w: w * 0.88, h: h * 0.22, color: "#ff595e" }),
  widget("date-block", { theme: theme("#6a4c93", "#ffca3a", "#1b1b1b", "#ffffff"), variant: 3, props: { month: "JUL", day: "12", weekday: "Sunday" }, x: w * 0.38, y: h * 0.52, w: w * 0.24, h: h * 0.2 }),
  text(VENUE, { font: "Nunito", weight: 700, size: w * 0.04, x: 0, y: h * 0.76, w, h: h * 0.06, color: "#1b1b1b" })], ["kids"]);
// ── Business
add("Conference keynote", "conference", "screen", lin(120, "#111827", "#312e81"), (w, h) => [
  shape(null, { shape: "rect", name: "Accent bar", fill: lin(90, "#4f46e5", "#06b6d4"), x: 0, y: 0, w: w * 0.012, h }),
  text(NAME, { bind: "event.name", font: "Plus Jakarta Sans", weight: 800, size: h * 0.1, x: w * 0.06, y: h * 0.18, w: w * 0.55, h: h * 0.3, align: "left" }),
  text(DATE, { font: "Plus Jakarta Sans", weight: 600, size: h * 0.04, x: w * 0.06, y: h * 0.52, w: w * 0.5, h: h * 0.06, align: "left", color: "#06b6d4" }),
  widget("timeline-v", { theme: theme("#06b6d4", "#4f46e5", "#ffffff", "#111827"), variant: 2, props: { items: "09:00 | Registration\n10:00 | Keynote\n12:30 | Lunch\n14:00 | Workshops\n17:00 | Drinks" }, x: w * 0.64, y: h * 0.1, w: w * 0.3, h: h * 0.8 }),
  text(VENUE, { font: "Plus Jakarta Sans", weight: 500, size: h * 0.035, x: w * 0.06, y: h * 0.62, w: w * 0.5, h: h * 0.05, align: "left", color: "#c7d2fe" })], ["business"]);
add("Networking drinks", "networking", "square", solid("#0f172a"), (w, h) => [
  text("NETWORKING", { font: "Manrope", weight: 800, size: w * 0.05, x: 0, y: h * 0.1, w, h: h * 0.06, color: "#3b82f6", ls: 6 }),
  text(NAME, { bind: "event.name", font: "Manrope", weight: 800, size: w * 0.08, x: w * 0.08, y: h * 0.2, w: w * 0.84, h: h * 0.2 }),
  widget("card", { theme: theme("#3b82f6", "#e2e8f0", "#ffffff", "#1e293b"), props: { icon: "Briefcase", title: "Meet the industry", text: "Drinks, canapés and introductions.", layout: 0 }, x: w * 0.08, y: h * 0.46, w: w * 0.84, h: h * 0.18 }),
  widget("card", { theme: theme("#3b82f6", "#e2e8f0", "#ffffff", "#1e293b"), props: { icon: "Clock", title: "{{event.time}}", text: "{{event.date}}", layout: 0 }, x: w * 0.08, y: h * 0.67, w: w * 0.84, h: h * 0.18 })], ["business"]);
add("Webinar", "webinar", "banner", lin(90, "#4f46e5", "#06b6d4"), (w, h) => [
  text("LIVE WEBINAR", { font: "Inter", weight: 800, size: h * 0.09, x: w * 0.04, y: h * 0.14, w: w * 0.4, h: h * 0.12, align: "left", ls: 3, color: "#c7d2fe" }),
  text(NAME, { bind: "event.name", font: "Inter", weight: 900, size: h * 0.18, x: w * 0.04, y: h * 0.28, w: w * 0.6, h: h * 0.4, align: "left" }),
  widget("time-block", { theme: theme("#ffffff", "#c7d2fe", "#ffffff", "#312e81"), variant: 4, props: { time: "{{event.time}}", label: "{{event.date}}" }, x: w * 0.68, y: h * 0.3, w: w * 0.28, h: h * 0.36 })], ["online"]);
add("Comedy night", "comedy", "portrait", solid("#ffd23f"), (w, h) => [
  shape("M5 5 H95 V70 H45 L25 95 L28 70 H5 Z", { name: "Speech bubble", fill: solid("#ffffff"), x: w * 0.08, y: h * 0.08, w: w * 0.84, h: h * 0.4, fx: { stroke: { width: 6, color: "#111111" } } }),
  text(NAME, { bind: "event.name", font: "Bangers", weight: 400, size: w * 0.12, x: w * 0.12, y: h * 0.12, w: w * 0.76, h: h * 0.24, color: "#111111", fx: { textFx: { kind: "double-outline", color: "#111111", color2: "#ff3b3b" } } }),
  text(DATE, { font: "Inter", weight: 900, size: w * 0.05, x: 0, y: h * 0.56, w, h: h * 0.06, color: "#111111" }),
  widget("badge-age", { theme: theme("#111111", "#ffffff", "#ffffff", "#ffd23f"), props: { text: "18+", sub: "Strong language" }, x: w * 0.4, y: h * 0.66, w: w * 0.2, h: w * 0.2 }),
  text(VENUE, { font: "Inter", weight: 700, size: w * 0.035, x: 0, y: h * 0.88, w, h: h * 0.05, color: "#111111" })], ["comedy"]);
add("Theatre", "theatre", "poster", rad("#5c1a2e", "#120408"), (w, h) => [
  shape("M0 0 H100 V20 Q75 35 50 20 Q25 35 0 20 Z", { name: "Curtain", fill: lin(180, "#8e2c48", "#5c1a2e"), x: 0, y: 0, w, h: h * 0.22 }),
  text("presents", { font: "Cinzel", weight: 600, size: w * 0.035, x: 0, y: h * 0.28, w, h: h * 0.05, color: "#d4a5a5", ls: 6 }),
  text(NAME, { bind: "event.name", font: "Cinzel", weight: 800, size: w * 0.09, x: w * 0.06, y: h * 0.34, w: w * 0.88, h: h * 0.26, color: "#f5e6e8", fx: { glow: { blur: 30, color: "#d4af37" } } }),
  text(DATE, { font: "Cormorant Garamond", weight: 600, size: w * 0.045, x: 0, y: h * 0.64, w, h: h * 0.06, color: "#d4af37" }),
  widget("rating", { theme: theme("#d4af37", "#f5e6e8", "#f5e6e8", "#120408"), variant: 2, props: { value: 4.9, label: "“A triumph” — The Stage" }, x: w * 0.2, y: h * 0.74, w: w * 0.6, h: h * 0.08 }),
  qr({ x: w * 0.4, y: h * 0.84, s: w * 0.2, fg: "#120408" })], ["theatre"]);
// ── Food & drink + event-day info
add("Menu card", "menu", "poster", solid("#fefae0"), (w, h) => [
  text("MENU", { font: "Playfair Display", weight: 800, size: w * 0.1, x: 0, y: h * 0.05, w, h: h * 0.1, color: "#283618" }),
  text(NAME, { bind: "event.name", font: "Lora", weight: 500, italic: true, size: w * 0.04, x: 0, y: h * 0.15, w, h: h * 0.05, color: "#606c38" }),
  widget("agenda", { theme: theme("#bc6c25", "#dda15e", "#283618", "#fefae0"), variant: 2, font: "Lora", props: { title: "Starters", items: "£8 | Heritage tomato, burrata\n£9 | Smoked salmon, rye\n£7 | Wild mushroom soup (VG)" }, x: w * 0.08, y: h * 0.22, w: w * 0.84, h: h * 0.22 }),
  widget("agenda", { theme: theme("#bc6c25", "#dda15e", "#283618", "#fefae0"), variant: 2, font: "Lora", props: { title: "Mains", items: "£22 | Roast chicken, truffle jus\n£24 | Sea bass, samphire\n£18 | Squash risotto (V)" }, x: w * 0.08, y: h * 0.46, w: w * 0.84, h: h * 0.22 }),
  widget("card", { theme: theme("#bc6c25", "#dda15e", "#283618", "#fefae0"), variant: 1, props: { icon: "Nut", title: "Allergens", text: "Please tell us about allergies before you order.", layout: 0 }, x: w * 0.08, y: h * 0.74, w: w * 0.84, h: h * 0.12 })], ["food"]);
add("Cocktail list", "drinks", "portrait", lin(160, "#0d0221", "#2b0033"), (w, h) => [
  text("Cocktails", { font: "Lobster", weight: 400, size: w * 0.12, x: 0, y: h * 0.06, w, h: h * 0.14, fx: { textFx: { kind: "neon", color: "#ff2d87" } } }),
  widget("agenda", { theme: theme("#05d9e8", "#ff2d87", "#ffffff", "#0d0221"), variant: 2, font: "Outfit", props: { title: "", items: "£11 | Espresso martini\n£10 | Passionfruit martini\n£10 | Aperol spritz\n£9 | Mojito\n£7 | Mocktail of the day" }, x: w * 0.08, y: h * 0.24, w: w * 0.84, h: h * 0.5 }),
  widget("card", { theme: theme("#ff2d87", "#05d9e8", "#ffffff", "#1a0b2e"), props: { icon: "Citrus", title: "Happy hour", text: "2-for-1 from 17:00–19:00", layout: 2 }, x: w * 0.08, y: h * 0.8, w: w * 0.84, h: h * 0.12 })], ["drinks"]);
add("Event-day welcome screen", "event_day", "screen", lin(135, "#0b08f8", "#090a2e"), (w, h) => [
  text("Welcome to", { font: "Inter", weight: 600, size: h * 0.05, x: w * 0.05, y: h * 0.12, w: w * 0.5, h: h * 0.07, align: "left", color: "#9ea8ff" }),
  text(NAME, { bind: "event.name", font: "Inter", weight: 900, size: h * 0.1, x: w * 0.05, y: h * 0.2, w: w * 0.5, h: h * 0.3, align: "left" }),
  widget("card", { theme: theme("#5b6bff", "#ffffff", "#ffffff", "#14134a"), props: { icon: "Wifi", title: "Wi-Fi", text: "Network: Gala-Guests", layout: 0 }, x: w * 0.05, y: h * 0.56, w: w * 0.42, h: h * 0.14 }),
  widget("card", { theme: theme("#5b6bff", "#ffffff", "#ffffff", "#14134a"), props: { icon: "Hash", title: "Share the moment", text: "#yourevent", layout: 0 }, x: w * 0.05, y: h * 0.74, w: w * 0.42, h: h * 0.14 }),
  widget("timeline-v", { theme: theme("#9ea8ff", "#5b6bff", "#ffffff", "#090a2e"), variant: 2, props: { items: "19:00 | Doors\n19:30 | Welcome\n20:00 | Dinner\n21:30 | Awards\n22:30 | Party" }, x: w * 0.62, y: h * 0.1, w: w * 0.32, h: h * 0.8 })], ["screen", "info"]);
add("Venue information board", "event_day", "portrait", solid("#ffffff"), (w, h) => [
  text("Good to know", { font: "Plus Jakarta Sans", weight: 800, size: w * 0.08, x: w * 0.06, y: h * 0.04, w: w * 0.88, h: h * 0.08, align: "left", color: "#090a2e" }),
  ...[["Toilet", "Toilets", "Ground floor, by the bar."], ["Lock", "Cloakroom", "£2 per item, open all night."], ["Cross", "First aid", "Find us by the main stage."], ["Accessibility", "Accessibility", "Step-free access via the side entrance."], ["CigaretteOff", "No smoking", "Smoking area outside only."]].map(([icon, title, t], i) =>
    widget("card", { theme: theme("#0b08f8", "#e8ebff", "#090a2e", "#f4f6ff"), props: { icon, title, text: t, layout: 0 }, x: w * 0.06, y: h * (0.15 + i * 0.165), w: w * 0.88, h: h * 0.14 }))], ["info"]);
add("Sponsor thank you", "corporate", "screen", solid("#ffffff"), (w, h) => [
  text("Thank you to our sponsors", { font: "Inter", weight: 800, size: h * 0.07, x: 0, y: h * 0.18, w, h: h * 0.1, color: "#090a2e" }),
  widget("sponsors", { theme: theme("#0b08f8", "#e8ebff", "#090a2e", "#ffffff"), variant: 2, props: { title: "{{event.name}}", items: "Sponsor One\nSponsor Two\nSponsor Three\nSponsor Four" }, x: w * 0.05, y: h * 0.38, w: w * 0.9, h: h * 0.24 }),
  shape(WAVE, { name: "Wave", fill: lin(90, "#0b08f8", "#5b6bff"), x: 0, y: h * 0.78, w, h: h * 0.22 })], ["sponsors"]);
add("Ticket sales stats", "ticket_launch", "square", solid("#090a2e"), (w, h) => [
  text(NAME, { bind: "event.name", font: "Inter", weight: 800, size: w * 0.06, x: w * 0.06, y: h * 0.06, w: w * 0.88, h: h * 0.12 }),
  widget("ring", { theme: theme("#5b6bff", "#9ea8ff", "#ffffff", "#090a2e"), variant: 2, props: { value: 85, label: "Sold" }, x: w * 0.06, y: h * 0.24, w: w * 0.42, h: w * 0.42 }),
  widget("stat", { theme: theme("#ffd23f", "#9ea8ff", "#ffffff", "#090a2e"), variant: 2, props: { value: "2,140", label: "Tickets sold" }, x: w * 0.52, y: h * 0.26, w: w * 0.42, h: h * 0.18 }),
  widget("stat", { theme: theme("#43aa8b", "#9ea8ff", "#ffffff", "#090a2e"), variant: 2, props: { value: "12 days", label: "To go" }, x: w * 0.52, y: h * 0.48, w: w * 0.42, h: h * 0.18 }),
  text(PRICE, { font: "Inter", weight: 700, size: w * 0.04, x: 0, y: h * 0.82, w, h: h * 0.06, color: "#9ea8ff" })], ["stats"]);
// Generated colour variants of a clean poster layout (more starters across categories).
const VAR = [["Midnight", "#0b0c2a", "#c9a227"], ["Rose", "#4c0519", "#fecdd3"], ["Ocean", "#03045e", "#90e0ef"], ["Forest", "#081c15", "#b7e4c7"], ["Royal", "#240046", "#ffd60a"], ["Coral", "#2d1e2f", "#ff8a65"],
  ["Mono", "#111111", "#ffffff"], ["Sunset", "#1a1a2e", "#ff6b35"], ["Mint", "#0b2027", "#a8ffcd"], ["Blush", "#3d2b30", "#f6c6c6"], ["Cyber", "#05001f", "#00f0ff"], ["Gold", "#1c1003", "#f4c95d"], ["Lavender", "#231942", "#e0b1cb"], ["Citrus", "#1b1b1b", "#fdc830"]];
const CATS = ["concert", "private_party", "venue_hire", "corporate", "festival", "networking", "birthday", "wedding", "nightclub", "conference", "comedy", "theatre", "catering", "drinks"];
VAR.forEach(([name, dark, accent], i) => add(`${name} event poster`, CATS[i % CATS.length], i % 2 ? "portrait" : "poster", lin(165, dark, dark), (w, h) => [
  shape(i % 3 === 0 ? STAR(32) : BLOB, { name: "Graphic", fill: lin(135, accent, dark), x: w * 0.2, y: h * 0.06, w: w * 0.6, h: w * 0.6, fx: { opacity: 0.5 } }),
  text(NAME, { bind: "event.name", font: ["Syne", "Playfair Display", "Bebas Neue", "Fraunces", "Outfit", "Cinzel", "Space Grotesk"][i % 7], weight: 800, size: w * 0.1, x: w * 0.06, y: h * 0.42, w: w * 0.88, h: h * 0.2, color: "#ffffff" }),
  text(DATE, { font: "Inter", weight: 700, size: w * 0.04, x: 0, y: h * 0.64, w, h: h * 0.05, color: accent }),
  text(VENUE, { font: "Inter", weight: 500, size: w * 0.03, x: 0, y: h * 0.7, w, h: h * 0.05, color: "#ffffffcc" }),
  widget("price-tag", { theme: theme(accent, "#ffffff", "#ffffff", dark), variant: 1, props: { label: "Tickets from", price: "{{ticket.starting_price}}", note: "+ booking fee" }, x: w * 0.06, y: h * 0.78, w: w * 0.4, h: h * 0.14 }),
  qr({ x: w * 0.74, y: h * 0.78, s: w * 0.18, fg: dark })], ["poster"]));

const { data: old } = await db.from("design_templates").select("id").is("workspace_id", null).is("owner_id", null).contains("tags", ["gala-starter"]);
if (old?.length) await db.from("design_templates").delete().in("id", old.map(o => o.id));
const rows = T.map(t => ({ ...t, description: "Gala Dock starter template", visibility: "public", status: "active", placeholders: ["event.name", "event.date", "event.time", "event.venue_name", "event.city", "event.public_url", "ticket.starting_price"] }));
const { error } = await db.from("design_templates").insert(rows);
if (error) { console.error(error.message); process.exit(1); }
console.log(`Seeded ${rows.length} starter templates (replaced ${old?.length ?? 0}).`);
