// Effect preset library for Media Studio layers (~280 presets). Each preset is a partial Effects patch applied on top of the
// layer's current effects, so presets combine and every value stays editable afterwards.
import type { Effects } from "@/lib/media/document";

export type EffectPreset = { id: string; name: string; group: string; for: ("text" | "image" | "shape" | "any")[]; fx: Partial<Effects> };
const NEUTRAL: Partial<Effects> = { brightness: 100, contrast: 100, saturate: 100, hue: 0, grayscale: 0, sepia: 0, invert: 0, blur: 0, duotone: null, vignette: 0 };

const PHOTO: [string, Partial<Effects>][] = [
  ["Original", {}], ["Mono", { grayscale: 100 }], ["Noir", { grayscale: 100, contrast: 150, brightness: 90 }], ["Silver", { grayscale: 100, contrast: 110, brightness: 110 }],
  ["High contrast", { contrast: 140, saturate: 110 }], ["Punch", { contrast: 125, saturate: 140 }], ["Vivid", { saturate: 170, contrast: 110 }], ["Warm", { sepia: 25, saturate: 120 }],
  ["Golden hour", { sepia: 35, saturate: 130, brightness: 105, hue: -8 }], ["Cool", { hue: 190, saturate: 90 }], ["Arctic", { hue: 200, saturate: 70, brightness: 110 }],
  ["Cinematic", { contrast: 120, saturate: 85, brightness: 95 }], ["Teal & orange", { hue: -12, saturate: 140, contrast: 115 }], ["Faded", { contrast: 80, brightness: 110, saturate: 80 }],
  ["Vintage", { sepia: 45, contrast: 90 }], ["Polaroid", { sepia: 20, contrast: 95, brightness: 110, saturate: 90 }], ["Kodachrome", { contrast: 125, saturate: 135, sepia: 10 }],
  ["Lomo", { contrast: 140, saturate: 150, vignette: 55 }], ["Nightlife", { hue: 280, saturate: 150, contrast: 120 }], ["Neon wash", { hue: 300, saturate: 180, contrast: 125, brightness: 105 }],
  ["Matte", { contrast: 85, brightness: 105 }], ["Dreamy", { brightness: 112, contrast: 88, saturate: 115, blur: 0.6 }], ["Moody", { brightness: 85, contrast: 115, saturate: 75 }],
  ["Sepia", { sepia: 100 }], ["Inverted", { invert: 100 }], ["X-ray", { invert: 100, grayscale: 100, contrast: 130 }], ["Pop art", { saturate: 300, contrast: 150 }],
  ["Washed", { brightness: 125, contrast: 75, saturate: 60 }], ["Sunburnt", { sepia: 30, saturate: 160, hue: -15, contrast: 110 }], ["Emerald", { hue: 90, saturate: 120 }],
  ["Rose", { hue: -30, saturate: 120, brightness: 105 }], ["Lilac", { hue: 250, saturate: 80, brightness: 108 }], ["Ocean", { hue: 160, saturate: 110, contrast: 105 }],
];
const DUO: [string, string, string][] = [["Midnight gala", "#090a2e", "#5b6bff"], ["Hot pink", "#2b0033", "#ff3cac"], ["Lagoon", "#022c43", "#43d9ad"], ["Sunset", "#3a0ca3", "#ff9e00"],
  ["Mono blue", "#03045e", "#90e0ef"], ["Gold", "#1c1003", "#f4c95d"], ["Forest", "#081c15", "#95d5b2"], ["Berry", "#3c0d3e", "#ff7aa2"], ["Fire", "#370617", "#ffba08"], ["Mint", "#0b2027", "#a8ffcd"],
  ["Lavender", "#231942", "#e0b1cb"], ["Coral", "#2d1e2f", "#ff8a65"], ["Ice", "#0d1b2a", "#e0fbfc"], ["Toxic", "#10002b", "#c7f464"], ["Sepia ink", "#2b1d0e", "#f1e3c6"], ["Red alert", "#1a0000", "#ff3b3b"],
  ["Cyber", "#05001f", "#00f0ff"], ["Peach", "#3d1f2d", "#ffc8a2"], ["Royal", "#120136", "#ffd60a"], ["Rose gold", "#2e1a1d", "#f7cac9"], ["Electric", "#0a0f3d", "#ffe600"], ["Olive", "#1b2410", "#dde5b6"],
  ["Plum", "#2a0a2a", "#f3c4fb"], ["Steel", "#11151c", "#c9d6df"]];
const COLOURS: [string, string][] = [["Blue", "#5b6bff"], ["Pink", "#ff2d87"], ["Cyan", "#00e5ff"], ["Green", "#39ff14"], ["Gold", "#ffd23f"], ["Orange", "#ff7a00"], ["Purple", "#b14dff"],
  ["Red", "#ff3b3b"], ["White", "#ffffff"], ["Lime", "#c7f464"], ["Magenta", "#ff00ff"], ["Ice", "#a5f3fc"]];

let cached: EffectPreset[] | null = null;
export function effectPresets(): EffectPreset[] {
  if (cached) return cached;
  const out: EffectPreset[] = [];
  const add = (group: string, name: string, forT: EffectPreset["for"], fx: Partial<Effects>) => out.push({ id: `${group}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, group, for: forT, fx });
  for (const [n, fx] of PHOTO) {
    add("Photo filters", n, ["image"], { ...NEUTRAL, ...fx });
    if (n !== "Original" && n !== "Inverted") add("Photo filters", `${n} (light)`, ["image"], { ...NEUTRAL, ...Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, typeof v === "number" ? (k === "brightness" || k === "contrast" || k === "saturate" ? 100 + (v - 100) / 2 : v / 2) : v])) });
  }
  for (const [n, a, b] of DUO) add("Duotone", n, ["image"], { ...NEUTRAL, duotone: [a, b] });
  for (const [n, c] of COLOURS) {
    add("Text effects", `Neon ${n.toLowerCase()}`, ["text"], { textFx: { kind: "neon", color: c } });
    add("Text effects", `Outline ${n.toLowerCase()}`, ["text"], { textFx: { kind: "outline", color: c } });
    add("Text effects", `3D ${n.toLowerCase()}`, ["text"], { textFx: { kind: "3d", color: c, depth: 8, angle: 45 } });
    add("Text effects", `Long shadow ${n.toLowerCase()}`, ["text"], { textFx: { kind: "long-shadow", color: c, depth: 30, angle: 45 } });
    add("Glow", `${n} glow`, ["any"], { glow: { blur: 18, color: c } });
    add("Glow", `${n} soft glow`, ["any"], { glow: { blur: 40, color: c } });
  }
  const TEXT: [string, NonNullable<Effects["textFx"]>][] = [["Lifted", { kind: "lifted", color: "rgba(0,0,0,0.35)" }], ["Hollow", { kind: "hollow", color: "#090a2e" }], ["Double outline", { kind: "double-outline", color: "#ffffff", color2: "#0b08f8" }],
    ["Echo", { kind: "echo", color: "#ff2d87" }], ["Glitch", { kind: "glitch", color: "#00e5ff", color2: "#ff2d87" }], ["Retro", { kind: "retro", color: "#ff7a00", color2: "#2b0033" }],
    ["Emboss", { kind: "emboss", color: "#ffffff", color2: "rgba(0,0,0,0.35)" }], ["Splice", { kind: "splice", color: "#5b6bff" }], ["Deep 3D", { kind: "3d", color: "#090a2e", depth: 16, angle: 45 }],
    ["Comic", { kind: "double-outline", color: "#000000", color2: "#ffd23f" }], ["Chrome", { kind: "retro", color: "#c9d6df", color2: "#11151c" }], ["Candy 3D", { kind: "3d", color: "#ff2d87", depth: 10, angle: 135 }]];
  for (const [n, fx] of TEXT) add("Text effects", n, ["text"], { textFx: fx });
  const SHADOWS: [string, NonNullable<Effects["shadow"]>, ...NonNullable<Effects["shadows"]>][] = [
    ["Soft", { x: 0, y: 8, blur: 24, color: "rgba(9,10,46,0.25)" }], ["Hard", { x: 8, y: 8, blur: 0, color: "rgba(9,10,46,0.9)" }], ["Floating", { x: 0, y: 24, blur: 48, color: "rgba(9,10,46,0.3)" }],
    ["Close", { x: 0, y: 2, blur: 6, color: "rgba(0,0,0,0.35)" }], ["Lifted", { x: 0, y: 14, blur: 20, color: "rgba(0,0,0,0.25)" }], ["Brutalist", { x: 12, y: 12, blur: 0, color: "#000000" }],
    ["Blue cast", { x: 0, y: 16, blur: 36, color: "rgba(11,8,248,0.4)" }], ["Pink cast", { x: 0, y: 16, blur: 36, color: "rgba(255,45,135,0.45)" }], ["Left", { x: -12, y: 6, blur: 18, color: "rgba(0,0,0,0.3)" }],
    ["Right", { x: 12, y: 6, blur: 18, color: "rgba(0,0,0,0.3)" }]];
  for (const [n, s] of SHADOWS) add("Shadows", `${n} shadow`, ["any"], { shadow: s });
  add("Shadows", "Layered shadow", ["any"], { shadow: null, shadows: [{ x: 0, y: 2, blur: 4, color: "rgba(0,0,0,0.12)" }, { x: 0, y: 10, blur: 20, color: "rgba(0,0,0,0.12)" }, { x: 0, y: 30, blur: 60, color: "rgba(0,0,0,0.15)" }] });
  add("Shadows", "Stacked colour", ["any"], { shadow: null, shadows: [{ x: 6, y: 6, blur: 0, color: "#ff2d87" }, { x: 12, y: 12, blur: 0, color: "#5b6bff" }] });
  for (const [n, s] of [["Inner soft", { x: 0, y: 4, blur: 16, color: "rgba(0,0,0,0.35)" }], ["Inner deep", { x: 0, y: 10, blur: 30, color: "rgba(0,0,0,0.55)" }], ["Inner glow", { x: 0, y: 0, blur: 24, color: "rgba(255,255,255,0.8)" }],
    ["Inner edge", { x: 0, y: 0, blur: 4, color: "rgba(0,0,0,0.6)" }]] as const) add("Inner shadows", n, ["image", "shape"], { innerShadow: s });
  for (const w of [2, 4, 8, 16]) for (const dash of ["solid", "dashed", "dotted"] as const) add("Borders", `${dash} ${w}px`, ["any"], { stroke: { width: w, color: "#090a2e", dash } });
  for (const [n, c] of COLOURS.slice(0, 8)) add("Borders", `${n} border`, ["any"], { stroke: { width: 6, color: c, dash: "solid" } });
  for (const r of [4, 8, 16, 24, 40, 64, 999]) add("Corners", r === 999 ? "Fully rounded" : `Radius ${r}`, ["image", "shape"], { radius: r, radii: null });
  for (const [n, radii] of [["Leaf", [60, 0, 60, 0]], ["Leaf reverse", [0, 60, 0, 60]], ["Tab top", [40, 40, 0, 0]], ["Tab bottom", [0, 0, 40, 40]], ["Drop corner", [999, 999, 999, 0]], ["Arch top", [999, 999, 0, 0]]] as const)
    add("Corners", n, ["image", "shape"], { radii: [...radii] as [number, number, number, number] });
  for (const b of [1, 2, 4, 8, 16]) add("Blur & focus", `Blur ${b}`, ["any"], { blur: b });
  for (const v of [20, 40, 60, 80]) add("Vignette", `Vignette ${v}%`, ["image"], { vignette: v });
  for (const o of [90, 75, 50, 25]) add("Transparency", `${o}% opacity`, ["any"], { opacity: o / 100 });
  for (const blend of ["multiply", "screen", "overlay", "soft-light", "hard-light", "color-dodge", "difference", "luminosity"]) add("Blend modes", blend.replace("-", " "), ["any"], { blend });
  return (cached = out);
}

/** CSS text-shadow for a text effect, scaled to the font size. */
export function textFxShadow(fx: NonNullable<Effects["textFx"]>, size: number): { textShadow?: string; stroke?: string; color?: string } {
  const u = Math.max(1, size / 40), c = fx.color, c2 = fx.color2 ?? "#000000";
  const steps = (n: number, angle: number, color: string) => { const a = (angle * Math.PI) / 180; return Array.from({ length: n }, (_, i) => `${(Math.cos(a) * (i + 1) * u).toFixed(1)}px ${(Math.sin(a) * (i + 1) * u).toFixed(1)}px 0 ${color}`).join(", "); };
  switch (fx.kind) {
    case "neon": return { textShadow: `0 0 ${2 * u}px #fff, 0 0 ${6 * u}px ${c}, 0 0 ${14 * u}px ${c}, 0 0 ${28 * u}px ${c}, 0 0 ${48 * u}px ${c}` };
    case "outline": return { stroke: `${Math.max(1, 1.5 * u)}px ${c}` };
    case "hollow": return { stroke: `${Math.max(1, 1.5 * u)}px ${c}`, color: "transparent" };
    case "double-outline": return { stroke: `${Math.max(1, 1.2 * u)}px ${c}`, textShadow: `0 0 0 ${c2}, ${2 * u}px ${2 * u}px 0 ${c2}, -${2 * u}px -${2 * u}px 0 ${c2}, ${2 * u}px -${2 * u}px 0 ${c2}, -${2 * u}px ${2 * u}px 0 ${c2}` };
    case "3d": return { textShadow: steps(fx.depth ?? 8, fx.angle ?? 45, c) };
    case "long-shadow": return { textShadow: steps(fx.depth ?? 30, fx.angle ?? 45, c) };
    case "lifted": return { textShadow: `0 ${3 * u}px ${6 * u}px ${c}` };
    case "echo": return { textShadow: `${3 * u}px ${3 * u}px 0 ${c}80, ${6 * u}px ${6 * u}px 0 ${c}50, ${9 * u}px ${9 * u}px 0 ${c}25` };
    case "glitch": return { textShadow: `${-2 * u}px 0 0 ${c}, ${2 * u}px 0 0 ${c2}` };
    case "retro": return { textShadow: `${2 * u}px ${2 * u}px 0 ${c}, ${4 * u}px ${4 * u}px 0 ${c2}` };
    case "emboss": return { textShadow: `-${u}px -${u}px 0 ${c}, ${u}px ${u}px 0 ${c2}` };
    case "splice": return { stroke: `${Math.max(1, u)}px ${c}`, textShadow: `${3 * u}px ${3 * u}px 0 ${c}` };
  }
}
