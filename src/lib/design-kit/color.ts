// Colour maths, palettes and gradient presets for the design editors. Pure functions — no DOM.
export type RGBA = { r: number; g: number; b: number; a: number };
export type HSLA = { h: number; s: number; l: number; a: number };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hex2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");

export function parseColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase();
  let m = s.match(/^#?([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1]!; if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
  if (m) return { r: +m[1]!, g: +m[2]!, b: +m[3]!, a: m[4] ? (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4]) : 1 };
  m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:[,\s/]+([\d.]+%?))?\s*\)$/);
  if (m) return { ...hslToRgb({ h: +m[1]!, s: +m[2]!, l: +m[3]!, a: 1 }), a: m[4] ? (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4]) : 1 };
  return null;
}
export const toHex = (c: RGBA, alpha = c.a < 1) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${alpha ? hex2(c.a * 255) : ""}`;
export const toRgbString = (c: RGBA) => c.a < 1 ? `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${+c.a.toFixed(2)})` : `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
export function rgbToHsl({ r, g, b, a }: RGBA): HSLA {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s: s * 100, l: l * 100, a };
}
export function hslToRgb({ h, s, l, a }: HSLA): RGBA {
  s /= 100; l /= 100; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a };
}
export function rgbToHsv({ r, g, b, a }: RGBA) {
  r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0; if (d) { h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s: max ? d / max : 0, v: max, a };
}
export function hsvToRgb(h: number, s: number, v: number, a = 1): RGBA {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a };
}
const hsl = (h: number, s: number, l: number) => toHex(hslToRgb({ h: ((h % 360) + 360) % 360, s, l, a: 1 }));

/** Tonal scale (50–950) for a hue — the basis of the generated palette library. */
export const scale = (h: number, s = 80) => [96, 90, 80, 68, 56, 46, 38, 30, 22, 15, 9].map(l => hsl(h, l > 85 ? s * 0.7 : s, l));

export type Palette = { name: string; group: string; colors: string[] };
const CURATED: [string, string, string[]][] = [
  ["Gala Dock", "Brand", ["#0b08f8", "#090a2e", "#5b6bff", "#9ea8ff", "#ffffff"]],
  ["Midnight gala", "Events", ["#0b0c2a", "#1f1d5c", "#c9a227", "#f4e4b0", "#ffffff"]],
  ["Champagne", "Events", ["#f7e7ce", "#e3c79c", "#b8935a", "#6e4f2b", "#2b1d0e"]],
  ["Neon nights", "Events", ["#0d0221", "#ff2a6d", "#05d9e8", "#d1f7ff", "#f706cf"]],
  ["Festival sun", "Events", ["#ff6b35", "#f7c59f", "#efefd0", "#004e89", "#1a659e"]],
  ["Wedding blush", "Events", ["#fff1f0", "#f6c6c6", "#e8a0a0", "#b5838d", "#6d6875"]],
  ["Sage wedding", "Events", ["#f4f1e8", "#cad2c5", "#84a98c", "#52796f", "#354f52"]],
  ["Garden party", "Events", ["#fefae0", "#ccd5ae", "#e9edc9", "#faedcd", "#d4a373"]],
  ["Corporate", "Business", ["#0f172a", "#1e3a8a", "#3b82f6", "#e2e8f0", "#ffffff"]],
  ["Conference", "Business", ["#111827", "#4f46e5", "#06b6d4", "#f3f4f6", "#ffffff"]],
  ["Jazz club", "Music", ["#1b1b1e", "#d8a47f", "#ef8354", "#4f5d75", "#bfc0c0"]],
  ["Techno", "Music", ["#000000", "#39ff14", "#1a1a1a", "#e0e0e0", "#ff00ff"]],
  ["Rave", "Music", ["#7400b8", "#6930c3", "#5390d9", "#48bfe3", "#72efdd"]],
  ["Retro 70s", "Retro", ["#f4a259", "#f4e285", "#8cb369", "#5b8e7d", "#bc4b51"]],
  ["Vaporwave", "Retro", ["#ff71ce", "#01cdfe", "#05ffa1", "#b967ff", "#fffb96"]],
  ["Sunset", "Nature", ["#ffcdb2", "#ffb4a2", "#e5989b", "#b5838d", "#6d6875"]],
  ["Ocean", "Nature", ["#03045e", "#0077b6", "#00b4d8", "#90e0ef", "#caf0f8"]],
  ["Forest", "Nature", ["#081c15", "#1b4332", "#2d6a4f", "#52b788", "#b7e4c7"]],
  ["Autumn", "Nature", ["#582f0e", "#7f4f24", "#936639", "#a68a64", "#ede0d4"]],
  ["Winter", "Seasonal", ["#edf6f9", "#83c5be", "#006d77", "#e29578", "#ffddd2"]],
  ["Christmas", "Seasonal", ["#165b33", "#146b3a", "#f8b229", "#ea4630", "#bb2528"]],
  ["Halloween", "Seasonal", ["#0b0b0b", "#ff7518", "#6a0dad", "#f5f5f5", "#2e2e2e"]],
  ["Pride", "Celebration", ["#e40303", "#ff8c00", "#ffed00", "#008026", "#24408e", "#732982"]],
  ["Kids party", "Celebration", ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93"]],
  ["Pastel", "Soft", ["#cdb4db", "#ffc8dd", "#ffafcc", "#bde0fe", "#a2d2ff"]],
  ["Monochrome", "Neutral", ["#000000", "#333333", "#777777", "#bbbbbb", "#ffffff"]],
  ["Warm neutral", "Neutral", ["#edede9", "#d6ccc2", "#f5ebe0", "#e3d5ca", "#d5bdaf"]],
  ["Luxury", "Premium", ["#0a0a0a", "#1c1c1c", "#d4af37", "#f9f6ee", "#8a6e2f"]],
  ["Royal", "Premium", ["#240046", "#3c096c", "#5a189a", "#e0aaff", "#ffd60a"]],
  ["Coffee house", "Food & drink", ["#3c2a21", "#6f4e37", "#b08968", "#e6ccb2", "#ede0d4"]],
  ["Citrus bar", "Food & drink", ["#f9c74f", "#f8961e", "#f3722c", "#90be6d", "#43aa8b"]],
  ["Wine bar", "Food & drink", ["#2d0a15", "#5c1a2e", "#8e2c48", "#d4a5a5", "#f5e6e8"]],
];
/** ~300 palettes: curated sets plus generated harmonies (complementary, analogous, triadic, split, tonal) around the colour wheel. */
export function palettes(): Palette[] {
  const out: Palette[] = CURATED.map(([name, group, colors]) => ({ name, group, colors }));
  const hues = [0, 15, 30, 45, 60, 90, 120, 150, 170, 190, 210, 225, 240, 260, 280, 300, 320, 340];
  const hueName = (h: number) => ["Red", "Vermilion", "Orange", "Amber", "Yellow", "Lime", "Green", "Emerald", "Teal", "Cyan", "Sky", "Azure", "Blue", "Indigo", "Violet", "Purple", "Fuchsia", "Rose"][hues.indexOf(h)]!;
  for (const h of hues) {
    out.push({ name: `${hueName(h)} tones`, group: "Tonal", colors: scale(h).slice(1, 10).filter((_, i) => i % 2 === 0) });
    out.push({ name: `${hueName(h)} complementary`, group: "Complementary", colors: [hsl(h, 80, 45), hsl(h, 70, 70), hsl(h + 180, 75, 45), hsl(h + 180, 60, 75), hsl(h, 30, 12)] });
    out.push({ name: `${hueName(h)} analogous`, group: "Analogous", colors: [hsl(h - 30, 75, 50), hsl(h, 80, 50), hsl(h + 30, 75, 50), hsl(h, 60, 85), hsl(h, 40, 15)] });
    out.push({ name: `${hueName(h)} triadic`, group: "Triadic", colors: [hsl(h, 80, 50), hsl(h + 120, 70, 50), hsl(h + 240, 70, 50), hsl(h, 20, 95), hsl(h, 30, 12)] });
    out.push({ name: `${hueName(h)} split`, group: "Split complementary", colors: [hsl(h, 80, 48), hsl(h + 150, 65, 50), hsl(h + 210, 65, 50), hsl(h, 25, 92), hsl(h, 35, 14)] });
    out.push({ name: `${hueName(h)} pastel`, group: "Pastel", colors: [hsl(h, 70, 86), hsl(h + 40, 70, 86), hsl(h + 80, 60, 86), hsl(h + 160, 60, 88), hsl(h + 220, 60, 88)] });
    out.push({ name: `${hueName(h)} neon`, group: "Neon", colors: ["#07071a", hsl(h, 100, 55), hsl(h + 60, 100, 55), hsl(h + 180, 100, 60), "#f5f5ff"] });
    out.push({ name: `${hueName(h)} muted`, group: "Muted", colors: [hsl(h, 25, 30), hsl(h, 22, 45), hsl(h, 18, 62), hsl(h, 16, 78), hsl(h, 14, 92)] });
    out.push({ name: `${hueName(h)} dark`, group: "Dark", colors: [hsl(h, 50, 6), hsl(h, 45, 12), hsl(h, 40, 20), hsl(h, 70, 55), hsl(h, 30, 90)] });
  }
  return out;
}
/** Swatch grid: 18 hues × 11 tones + greys (≈ 210 colours). */
export const swatches = () => [...[0, 15, 30, 45, 60, 90, 120, 150, 170, 190, 210, 225, 240, 260, 280, 300, 320, 340].map(h => scale(h)), ["#ffffff", "#f4f4f5", "#e4e4e7", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b", "#3f3f46", "#27272a", "#18181b", "#000000"]];

export type GradientStop = { offset: number; color: string };
export type GradientPreset = { name: string; type: "linear" | "radial" | "conic"; angle: number; stops: GradientStop[] };
const G: [string, number, string[]][] = [
  ["Gala blue", 160, ["#0b08f8", "#090a2e"]], ["Sunrise", 135, ["#ff9a8b", "#ff6a88", "#ff99ac"]], ["Ocean breeze", 135, ["#2e3192", "#1bffff"]], ["Peach", 135, ["#ffecd2", "#fcb69f"]],
  ["Night sky", 180, ["#0f2027", "#203a43", "#2c5364"]], ["Purple haze", 135, ["#7f00ff", "#e100ff"]], ["Mojito", 135, ["#1d976c", "#93f9b9"]], ["Flamingo", 135, ["#ee9ca7", "#ffdde1"]],
  ["Royal gold", 135, ["#b8860b", "#f4e4b0", "#b8860b"]], ["Neon city", 120, ["#ff0080", "#7928ca", "#2afadf"]], ["Lava", 135, ["#f12711", "#f5af19"]], ["Aurora", 135, ["#00c9ff", "#92fe9d"]],
  ["Candy", 90, ["#ff6ec4", "#7873f5"]], ["Steel", 180, ["#bdc3c7", "#2c3e50"]], ["Emerald", 135, ["#11998e", "#38ef7d"]], ["Berry", 135, ["#8e2de2", "#4a00e0"]],
  ["Citrus", 135, ["#fdc830", "#f37335"]], ["Velvet", 135, ["#360033", "#0b8793"]], ["Rose gold", 135, ["#b76e79", "#f7cac9", "#b76e79"]], ["Holographic", 120, ["#a1c4fd", "#c2e9fb", "#fbc2eb", "#a6c1ee"]],
  ["Disco", 90, ["#fc466b", "#3f5efb"]], ["Mint", 135, ["#d4fc79", "#96e6a1"]], ["Coral reef", 135, ["#ff7e5f", "#feb47b"]], ["Deep space", 180, ["#000000", "#434343"]],
  ["Champagne", 135, ["#f7e7ce", "#e3c79c", "#fff8ee"]], ["Rainbow", 90, ["#ff0000", "#ff8000", "#ffff00", "#00c000", "#0080ff", "#8000ff"]], ["Sunset strip", 180, ["#0b0c2a", "#5b247a", "#ff6a3d", "#ffd56b"]],
  ["Glacier", 135, ["#e0eafc", "#cfdef3"]], ["Cosmic", 135, ["#ff00cc", "#333399"]], ["Tropical", 135, ["#00f260", "#0575e6"]], ["Ember", 180, ["#200122", "#6f0000"]], ["Lavender", 135, ["#c471f5", "#fa71cd"]],
];
/** ~200 gradient presets: hand-picked event gradients in linear, radial and conic forms, plus generated two- and three-stop blends. */
export function gradientPresets(): GradientPreset[] {
  const out: GradientPreset[] = [];
  for (const [name, angle, colors] of G) {
    const stops = colors.map((c, i) => ({ offset: i / (colors.length - 1), color: c }));
    out.push({ name, type: "linear", angle, stops }, { name: `${name} glow`, type: "radial", angle: 0, stops }, { name: `${name} spin`, type: "conic", angle, stops: [...stops, { offset: 1, color: colors[0]! }].map((s, i, a) => ({ ...s, offset: i / (a.length - 1) })) });
  }
  const hues = [0, 20, 40, 60, 100, 140, 170, 195, 215, 240, 265, 290, 315, 340];
  for (const h of hues) {
    out.push({ name: `Hue ${h}° deep`, type: "linear", angle: 160, stops: [{ offset: 0, color: hsl(h, 85, 50) }, { offset: 1, color: hsl(h + 40, 80, 18) }] });
    out.push({ name: `Hue ${h}° soft`, type: "linear", angle: 135, stops: [{ offset: 0, color: hsl(h, 80, 88) }, { offset: 1, color: hsl(h + 60, 75, 80) }] });
    out.push({ name: `Hue ${h}° tri`, type: "linear", angle: 120, stops: [{ offset: 0, color: hsl(h, 90, 55) }, { offset: 0.5, color: hsl(h + 60, 90, 55) }, { offset: 1, color: hsl(h + 120, 90, 55) }] });
    out.push({ name: `Hue ${h}° spotlight`, type: "radial", angle: 0, stops: [{ offset: 0, color: hsl(h, 90, 60) }, { offset: 1, color: hsl(h, 60, 8) }] });
    out.push({ name: `Hue ${h}° metallic`, type: "linear", angle: 180, stops: [{ offset: 0, color: hsl(h, 20, 85) }, { offset: 0.45, color: hsl(h, 15, 45) }, { offset: 0.55, color: hsl(h, 15, 35) }, { offset: 1, color: hsl(h, 20, 80) }] });
  }
  return out;
}
