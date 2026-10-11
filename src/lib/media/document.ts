// Media Studio canonical design document (media spec §11). Pure data, shared by editor, server actions, Agent tools and export.
export type Fill = { type: "solid"; color: string } | { type: "linear" | "radial"; angle?: number; stops: { offset: number; color: string }[] };
export type Effects = {
  opacity?: number; blend?: string; shadow?: { x: number; y: number; blur: number; color: string } | null; glow?: { blur: number; color: string } | null;
  stroke?: { width: number; color: string; dash?: "solid" | "dashed" | "dotted" } | null; radius?: number;
  brightness?: number; contrast?: number; saturate?: number; hue?: number; blur?: number; grayscale?: number; sepia?: number; invert?: number;
};
type Base = { id: string; name: string; x: number; y: number; w: number; h: number; rotation: number; flipX?: boolean; flipY?: boolean; hidden?: boolean; locked?: boolean; effects?: Effects };
export type TextLayer = Base & { type: "text"; text: string; bind?: string; font: string; size: number; weight: number; italic?: boolean; color: string; fill?: Fill; align: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom"; lineHeight: number; letterSpacing: number; transform?: "none" | "uppercase" | "lowercase"; underline?: boolean; highlight?: string | null; curve?: number };
export type ImageLayer = Base & { type: "image"; asset: { src: string; path?: string; public?: boolean; width?: number; height?: number }; fit: "cover" | "contain"; focusX: number; focusY: number; zoom: number; mask?: "none" | "circle" | "rounded" | "ellipse" };
export type ShapeLayer = Base & { type: "shape"; shape: "rect" | "ellipse" | "triangle" | "star" | "diamond" | "line" | "arrow" | "badge" | "speech"; fill: Fill; };
export type CodeLayer = Base & { type: "qr" | "barcode"; value: string; bind?: string; fg: string; bg: string; label?: string };
export type DrawLayer = Base & { type: "drawing"; paths: { d: string; color: string; width: number; opacity: number }[] };
export type IconLayer = Base & { type: "icon"; icon: string; color: string };
export type Layer = TextLayer | ImageLayer | ShapeLayer | CodeLayer | DrawLayer | IconLayer;
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

export const PLACEHOLDERS = ["event.name", "event.date", "event.time", "event.venue_name", "event.city", "event.public_url", "ticket.starting_price", "organizer.name"] as const;
export type EventData = Partial<Record<(typeof PLACEHOLDERS)[number], string>>;
/** Dynamic fields (§6): bound layers render live event data; publishing a template reverts them to {{placeholders}}. */
export const resolveText = (l: TextLayer | CodeLayer, data: EventData) => {
  const raw = l.type === "text" ? l.text : l.value;
  const v = l.bind ? data[l.bind as keyof EventData] ?? raw : raw;
  return String(v).replace(/\{\{([a-z_]+\.[a-z_]+)\}\}/g, (m, k: string) => data[k as keyof EventData] ?? m);
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
