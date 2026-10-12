// Media Studio canonical design document (media spec §11). Pure data, shared by editor, server actions, Agent tools and export.
export type Fill = { type: "solid"; color: string } | { type: "linear" | "radial" | "conic"; angle?: number; stops: { offset: number; color: string }[] };
export type Shadow = { x: number; y: number; blur: number; color: string };
export type TextFx = { kind: "neon" | "outline" | "hollow" | "double-outline" | "3d" | "long-shadow" | "lifted" | "echo" | "glitch" | "retro" | "emboss" | "splice"; color: string; color2?: string; depth?: number; angle?: number };
export type EraseStroke = { d: string; width: number };
export type Effects = {
  opacity?: number; blend?: string; shadow?: { x: number; y: number; blur: number; color: string } | null; glow?: { blur: number; color: string } | null;
  stroke?: { width: number; color: string; dash?: "solid" | "dashed" | "dotted" } | null; radius?: number;
  brightness?: number; contrast?: number; saturate?: number; hue?: number; blur?: number; grayscale?: number; sepia?: number; invert?: number;
  /** Extra drop shadows stacked after `shadow`; inner shadow (images/boxes); text effect; per-corner radii [tl, tr, br, bl]; duotone [shadows, highlights]; vignette 0–100. */
  shadows?: Shadow[] | null; innerShadow?: Shadow | null; textFx?: TextFx | null; radii?: [number, number, number, number] | null; duotone?: [string, string] | null; vignette?: number;
};
type Base = { id: string; name: string; x: number; y: number; w: number; h: number; rotation: number; flipX?: boolean; flipY?: boolean; hidden?: boolean; locked?: boolean; effects?: Effects };
export type TextLayer = Base & { type: "text"; text: string; bind?: string; font: string; size: number; weight: number; italic?: boolean; color: string; fill?: Fill; align: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom"; lineHeight: number; letterSpacing: number; transform?: "none" | "uppercase" | "lowercase"; underline?: boolean; highlight?: string | null; curve?: number };
export type ImageLayer = Base & { type: "image"; asset: { src: string; path?: string; public?: boolean; width?: number; height?: number; sample?: string }; fit: "cover" | "contain"; focusX: number; focusY: number; zoom: number; mask?: "none" | "circle" | "rounded" | "ellipse";
  /** Crop window as fractions of the source image (0–1); erased strokes in layer pixels (rubber tool). */
  crop?: { x: number; y: number; w: number; h: number } | null; erase?: EraseStroke[] };
/** Built-in shapes by name, or any library shape via `d` (SVG path in a 0–100 box; `lineOnly` = stroked, not filled). */
export type ShapeLayer = Base & { type: "shape"; shape: "rect" | "ellipse" | "triangle" | "star" | "diamond" | "line" | "arrow" | "badge" | "speech" | "custom"; fill: Fill; d?: string; lineOnly?: boolean };
export type CodeLayer = Base & { type: "qr" | "barcode"; value: string; bind?: string; fg: string; bg: string; label?: string };
export type Brush = "pen" | "marker" | "highlighter" | "airbrush";
export type DrawLayer = Base & { type: "drawing"; paths: { d: string; color: string; width: number; opacity: number; brush?: Brush }[]; erase?: EraseStroke[] };
/** Lucide icon by name (legacy), or a library icon with its SVG embedded so it renders and exports without the icon set. */
export type IconLayer = Base & { type: "icon"; icon: string; color: string; svg?: { body: string; w: number; h: number } };
/** Bendy line / curve: points in layer pixels, smoothed (Catmull-Rom) or straight, optional closed fill and end caps. */
export type PathLayer = Base & { type: "path"; pts: { x: number; y: number }[]; smooth: boolean; closed: boolean; stroke: { color: string; width: number; dash?: "solid" | "dashed" | "dotted" };
  fill?: Fill | null; startCap?: "none" | "arrow" | "dot" | "bar"; endCap?: "none" | "arrow" | "dot" | "bar" };
/** Parametric widget (countdown, timeline, ticket stub, rating…): `variant` picks the style, `theme` the colours. */
export type WidgetLayer = Base & { type: "widget"; widget: string; variant: number; props: Record<string, string | number>; theme: { a: string; b: string; text: string; bg: string }; font?: string };
export type Layer = TextLayer | ImageLayer | ShapeLayer | CodeLayer | DrawLayer | IconLayer | PathLayer | WidgetLayer;
export type Page = { id: string; name: string; width: number; height: number; background: Fill | null; layers: Layer[] };
export type DesignDoc = { unit: "px" | "mm"; dpi: number; pages: Page[]; bleedMm?: number };

export const uid = () => Math.random().toString(36).slice(2, 10);
const mm = (v: number) => Math.round((v / 25.4) * 150);   // print presets authored at 150 dpi working resolution

export const PRESETS: { group: string; id: string; label: string; w: number; h: number }[] = [
  { group: "Print", id: "a5", label: "A5", w: mm(148), h: mm(210) }, { group: "Print", id: "a4", label: "A4", w: mm(210), h: mm(297) },
  { group: "Print", id: "a3", label: "A3 poster", w: mm(297), h: mm(420) }, { group: "Print", id: "a2", label: "A2 poster", w: mm(420), h: mm(594) },
  { group: "Print", id: "flyer", label: "Flyer (DL)", w: mm(99), h: mm(210) }, { group: "Print", id: "menu", label: "Menu", w: mm(210), h: mm(297) },
  { group: "Social", id: "sq", label: "Square 1:1", w: 1080, h: 1080 }, { group: "Social", id: "portrait", label: "Portrait 4:5", w: 1080, h: 1350 },
  { group: "Social", id: "story", label: "Story 9:16", w: 1080, h: 1920 }, { group: "Social", id: "wide", label: "Landscape 16:9", w: 1920, h: 1080 },
  { group: "Social", id: "banner", label: "Social banner", w: 1500, h: 500 },
  { group: "Event", id: "qr-poster", label: "QR poster", w: mm(210), h: mm(297) }, { group: "Event", id: "screen", label: "Venue screen", w: 1920, h: 1080 },
  { group: "Event", id: "stage", label: "Stage screen", w: 3840, h: 1080 }, { group: "Event", id: "info", label: "Event info card", w: 1080, h: 1350 },
  { group: "Event", id: "sponsor", label: "Sponsor board", w: 1920, h: 1080 }, { group: "Event", id: "artist", label: "Artist card", w: 1080, h: 1080 },
  { group: "Event", id: "tier", label: "Ticket tier card", w: 1200, h: 628 },
];

export const PLACEHOLDERS = ["event.name", "event.date", "event.time", "event.venue_name", "event.city", "event.public_url", "ticket.starting_price", "organizer.name",
  "business.name", "business.location", "business.price_from", "business.website", "business.email", "business.phone"] as const;
/** Business details (venues & suppliers) — filled from the design's workspace and its listings. */
export const BUSINESS_FIELDS = ["business.name", "business.location", "business.price_from", "business.website", "business.email", "business.phone"] as const;
/** Image layers whose src is this placeholder show the event's cover photo (or the layer's `sample` until an event is linked). */
export const COVER_PLACEHOLDER = "{{event.cover_image}}";
export type EventData = Partial<Record<(typeof PLACEHOLDERS)[number] | "event.cover_image", string>>;
/** Dynamic fields (§6): bound layers render live event data; publishing a template reverts them to {{placeholders}}. */
/** Shown for placeholders when a design isn't linked to an event yet, so templates read naturally instead of showing {{braces}}. */
export const PLACEHOLDER_DEFAULTS: EventData = { "event.name": "Your Event Name", "event.date": "Sat 21 June", "event.time": "19:30", "event.venue_name": "Your Venue", "event.city": "London",
  "event.public_url": "https://www.galadock.com", "ticket.starting_price": "£25", "organizer.name": "Your Company",
  "business.name": "Your Business", "business.location": "London", "business.price_from": "From £450", "business.website": "galadock.com", "business.email": "hello@yourbusiness.com", "business.phone": "020 7946 0000" };
/** Plain-English names for the placeholders. Editors show "[Event name]" instead of "{{event.name}}" (customers never see braces). */
export const FIELD_LABELS: Record<(typeof PLACEHOLDERS)[number], string> = { "event.name": "Event name", "event.date": "Date", "event.time": "Start time", "event.venue_name": "Venue",
  "event.city": "City", "event.public_url": "Ticket link", "ticket.starting_price": "Lowest ticket price", "organizer.name": "Organiser name",
  "business.name": "Business name", "business.location": "Business location", "business.price_from": "Starting price", "business.website": "Website", "business.email": "Business email", "business.phone": "Phone number" };
const LABEL_TO_KEY = Object.fromEntries(Object.entries(FIELD_LABELS).map(([k, v]) => [v.toLowerCase(), k]));
/** {{event.name}} → [Event name] for display/editing. */
export const toFriendly = (text: string) => text.replace(/\{\{([a-z_]+\.[a-z_]+)\}\}/g, (m, k: string) => (FIELD_LABELS as Record<string, string>)[k] ? `[${(FIELD_LABELS as Record<string, string>)[k]}]` : m);
/** [Event name] → {{event.name}} when saving (case-insensitive; unknown [brackets] are left as typed). */
export const fromFriendly = (text: string) => text.replace(/\[([^\[\]{}]{2,40})\]/g, (m, label: string) => LABEL_TO_KEY[label.trim().toLowerCase()] ? `{{${LABEL_TO_KEY[label.trim().toLowerCase()]}}}` : m);
export const fillPlaceholders = (text: string, data: EventData) => text.replace(/\{\{([a-z_]+\.[a-z_]+)\}\}/g, (m, k: string) => data[k as keyof EventData] ?? PLACEHOLDER_DEFAULTS[k as keyof EventData] ?? m);
export const resolveText = (l: TextLayer | CodeLayer, data: EventData) => {
  const raw = l.type === "text" ? l.text : l.value;
  const v = l.bind ? data[l.bind as keyof EventData] ?? raw : raw;
  return fillPlaceholders(String(v), data);
};

export function blankDoc(w: number, h: number, background: Fill | null = { type: "solid", color: "#ffffff" }): DesignDoc {
  return { unit: "px", dpi: 150, pages: [{ id: uid(), name: "Page 1", width: w, height: h, background, layers: [] }] };
}

/** Starter poster built from event data (used by "Create from event" and the Agent's Poster Builder skill — layout only, no generated imagery). */
export function posterFromEvent(w: number, h: number, opts: { imageSrc?: string | null; imagePath?: string; accent?: string; font?: string; qr?: boolean }): DesignDoc {
  const accent = opts.accent ?? "#0b08f8", font = opts.font ?? "Inter", s = w / 1240;
  const layers: Layer[] = [];
  if (opts.imageSrc) layers.push({ id: uid(), name: "Artwork", type: "image", x: 0, y: 0, w, h: h * 0.62, rotation: 0, asset: { src: opts.imageSrc, path: opts.imagePath }, fit: "cover", focusX: 50, focusY: 50, zoom: 1 });
  layers.push({ id: uid(), name: "Panel", type: "shape", shape: "rect", x: 0, y: h * 0.58, w, h: h * 0.42, rotation: 0, fill: { type: "solid", color: "#090a2e" } });
  layers.push({ id: uid(), name: "Event name", type: "text", text: "{{event.name}}", bind: "event.name", font, size: 96 * s, weight: 800, color: "#ffffff", align: "left", lineHeight: 1.05, letterSpacing: -1, x: 70 * s, y: h * 0.62, w: w - 140 * s, h: 230 * s, rotation: 0 });
  layers.push({ id: uid(), name: "Date", type: "text", text: "{{event.date}} · {{event.time}}", font, size: 40 * s, weight: 600, color: accent === "#0b08f8" ? "#9ea8ff" : accent, align: "left", lineHeight: 1.2, letterSpacing: 0.5, x: 70 * s, y: h * 0.62 + 250 * s, w: w * 0.62, h: 56 * s, rotation: 0 });
  layers.push({ id: uid(), name: "Venue", type: "text", text: "{{event.venue_name}}, {{event.city}}", font, size: 34 * s, weight: 500, color: "#d6dbff", align: "left", lineHeight: 1.2, letterSpacing: 0, x: 70 * s, y: h * 0.62 + 316 * s, w: w * 0.62, h: 50 * s, rotation: 0 });
  layers.push({ id: uid(), name: "Ticket CTA", type: "shape", shape: "rect", x: 70 * s, y: h - 150 * s, w: 360 * s, h: 84 * s, rotation: 0, fill: { type: "solid", color: accent }, effects: { radius: 42 * s } });
  layers.push({ id: uid(), name: "CTA text", type: "text", text: "Tickets from {{ticket.starting_price}}", font, size: 30 * s, weight: 700, color: "#ffffff", align: "center", valign: "middle", lineHeight: 1, letterSpacing: 0, x: 70 * s, y: h - 150 * s, w: 360 * s, h: 84 * s, rotation: 0 });
  if (opts.qr !== false) layers.push({ id: uid(), name: "Ticket QR", type: "qr", value: "{{event.public_url}}", bind: "event.public_url", fg: "#090a2e", bg: "#ffffff", x: w - 330 * s, y: h - 330 * s, w: 260 * s, h: 260 * s, rotation: 0, label: "Scan for tickets" });
  return { unit: "px", dpi: 150, pages: [{ id: uid(), name: "Poster", width: w, height: h, background: { type: "solid", color: "#090a2e" }, layers }] };
}

/** Format variants (§49): proportional reflow — positions and sizes scale per axis, text by the smaller factor; never stretched. */
export function reflow(page: Page, w: number, h: number): Page {
  const sx = w / page.width, sy = h / page.height, s = Math.min(sx, sy);
  return { ...page, id: uid(), width: w, height: h, layers: page.layers.map(l => {
    const nw = l.type === "image" || l.type === "shape" ? l.w * sx : l.w * s, nh = l.type === "image" || l.type === "shape" ? l.h * sy : l.h * s;
    const cx = (l.x + l.w / 2) * sx, cy = (l.y + l.h / 2) * sy;
    const base = { ...l, id: uid(), w: nw, h: nh, x: cx - nw / 2, y: cy - nh / 2 };
    return base.type === "text" ? { ...base, size: (l as TextLayer).size * s } : base;
  }) as Layer[] };
}

export const FONTS: { family: string; category: string }[] = [
  ["Inter", "Sans Serif"], ["Manrope", "Sans Serif"], ["Poppins", "Sans Serif"], ["Montserrat", "Sans Serif"], ["DM Sans", "Sans Serif"], ["Work Sans", "Sans Serif"], ["Outfit", "Sans Serif"],
  ["Plus Jakarta Sans", "Sans Serif"], ["Space Grotesk", "Futuristic"], ["Sora", "Futuristic"], ["Syne", "Display"], ["Bebas Neue", "Condensed"], ["Oswald", "Condensed"], ["Anton", "Condensed"],
  ["Archivo Black", "Display"], ["Righteous", "Retro"], ["Bungee", "Party"], ["Monoton", "Retro"], ["Shrikhand", "Party"], ["Rubik", "Rounded"], ["Nunito", "Rounded"], ["Quicksand", "Rounded"],
  ["Playfair Display", "Serif"], ["Cormorant Garamond", "Elegant"], ["Libre Baskerville", "Serif"], ["Lora", "Editorial"], ["DM Serif Display", "Editorial"], ["Fraunces", "Editorial"],
  ["Cinzel", "Elegant"], ["Great Vibes", "Wedding"], ["Parisienne", "Wedding"], ["Dancing Script", "Script"], ["Pacifico", "Script"], ["Caveat", "Handwritten"], ["Kalam", "Handwritten"],
  ["Permanent Marker", "Handwritten"], ["JetBrains Mono", "Monospace"], ["Space Mono", "Monospace"], ["IBM Plex Sans", "Corporate"], ["Source Sans 3", "Corporate"], ["Lato", "Corporate"],
  ["Roboto", "Corporate"], ["Open Sans", "Corporate"], ["Barlow Condensed", "Condensed"], ["Teko", "Condensed"], ["Abril Fatface", "Display"], ["Lobster", "Retro"], ["Orbitron", "Futuristic"],
].map(([family, category]) => ({ family: family!, category: category! }));
export const googleFontHref = (families: string[]) =>
  `https://fonts.googleapis.com/css2?${[...new Set(families)].filter(f => FONTS.some(x => x.family === f)).map(f => `family=${encodeURIComponent(f).replace(/%20/g, "+")}`).join("&")}&display=swap`;

/** Font families, weights and italics actually used by a document (text and widget layers). */
export function fontSpecs(doc: DesignDoc): { family: string; weights: number[]; italic: boolean }[] {
  const m = new Map<string, { w: Set<number>; i: boolean }>();
  for (const l of doc.pages.flatMap(p => p.layers)) {
    const fam = l.type === "text" ? l.font : l.type === "widget" ? l.font ?? "Inter" : null; if (!fam) continue;
    const e = m.get(fam) ?? { w: new Set<number>([400, 700]), i: false };
    if (l.type === "text") { e.w.add(l.weight); if (l.italic) e.i = true; }
    m.set(fam, e);
  }
  return [...m].map(([family, e]) => ({ family, weights: [...e.w].sort((a, b) => a - b), italic: e.i }));
}
/** One Google Fonts URL per family. With the catalogue (fonts.json) weights/italics are clamped to what the family has and
 *  unknown names (uploaded brand fonts) are skipped; without it, only the regular style is requested. Per-family links mean one
 *  bad name can't break every font on the page. */
export const googleFontHrefs = (specs: { family: string; weights: number[]; italic: boolean }[], catalogue?: Map<string, { w: number[]; i: boolean }> | null) =>
  specs.flatMap(({ family, weights, italic }) => {
    const name = encodeURIComponent(family).replace(/%20/g, "+");
    if (!catalogue) return [`https://fonts.googleapis.com/css2?family=${name}&display=swap`];
    const meta = catalogue.get(family); if (!meta) return [];
    const nearest = (w: number) => meta.w.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a), meta.w[0] ?? 400);
    const ws = [...new Set((weights.length ? weights : [400]).map(nearest))].sort((a, b) => a - b), ital = italic && meta.i;
    return [`https://fonts.googleapis.com/css2?family=${name}:${ital ? `ital,wght@${[...ws.map(w => `0,${w}`), ...ws.map(w => `1,${w}`)].join(";")}` : `wght@${ws.join(";")}`}&display=swap`];
  });
