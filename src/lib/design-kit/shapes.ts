// Generated vector shape library. Every shape is an SVG path in a 0–100 box, so it scales to any layer size and stays crisp in
// exports. Families: polygons, stars, bursts, seals, arrows, callouts, banners, frames, symbols and organic blobs (~400 shapes).
export type ShapeDef = { id: string; name: string; group: string; d: string; stroke?: boolean };
const f = (n: number) => +n.toFixed(2);
const pt = (cx: number, cy: number, r: number, a: number) => `${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
const poly = (n: number, rot = -Math.PI / 2, r = 50) => `M${Array.from({ length: n }, (_, i) => pt(50, 50, r, rot + (i * 2 * Math.PI) / n)).join(" L")} Z`;
const star = (n: number, inner: number, r = 50) => `M${Array.from({ length: n * 2 }, (_, i) => pt(50, 50, i % 2 ? r * inner : r, -Math.PI / 2 + (i * Math.PI) / n)).join(" L")} Z`;
const roundedPoly = (n: number, round: number) => {
  const pts = Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)] as const; });
  let d = "";
  pts.forEach((p, i) => {
    const prev = pts[(i - 1 + n) % n]!, next = pts[(i + 1) % n]!;
    const a = [p[0] + (prev[0] - p[0]) * round, p[1] + (prev[1] - p[1]) * round], b = [p[0] + (next[0] - p[0]) * round, p[1] + (next[1] - p[1]) * round];
    d += `${i ? " L" : "M"}${f(a[0]!)} ${f(a[1]!)} Q${f(p[0])} ${f(p[1])} ${f(b[0]!)} ${f(b[1]!)}`;
  });
  return `${d} Z`;
};
const seal = (teeth: number, depth: number) => `M${Array.from({ length: teeth * 2 }, (_, i) => pt(50, 50, i % 2 ? 50 - depth : 50, (i * Math.PI) / teeth)).join(" L")} Z`;
const wavy = (bumps: number, amp: number) => {
  let d = ""; const steps = bumps * 12;
  for (let i = 0; i <= steps; i++) { const a = (i / steps) * Math.PI * 2, r = 50 - amp + amp * Math.cos(a * bumps); d += `${i ? " L" : "M"}${pt(50, 50, r, a)}`; }
  return `${d} Z`;
};
/** Seeded organic blob (smooth closed curve through jittered points). */
const blob = (seed: number, points = 7) => {
  let s = seed; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const ps = Array.from({ length: points }, (_, i) => { const a = (i / points) * Math.PI * 2, r = 32 + rnd() * 18; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)] as const; });
  let d = `M${f((ps[0]![0] + ps[points - 1]![0]) / 2)} ${f((ps[0]![1] + ps[points - 1]![1]) / 2)}`;
  for (let i = 0; i < points; i++) { const p = ps[i]!, n = ps[(i + 1) % points]!; d += ` Q${f(p[0])} ${f(p[1])} ${f((p[0] + n[0]) / 2)} ${f((p[1] + n[1]) / 2)}`; }
  return `${d} Z`;
};
const NAMES: Record<number, string> = { 3: "Triangle", 4: "Square", 5: "Pentagon", 6: "Hexagon", 7: "Heptagon", 8: "Octagon", 9: "Nonagon", 10: "Decagon", 11: "Hendecagon", 12: "Dodecagon" };

let cached: ShapeDef[] | null = null;
export function shapeLibrary(): ShapeDef[] {
  if (cached) return cached;
  const out: ShapeDef[] = [];
  const add = (group: string, name: string, d: string, stroke = false) => out.push({ id: `${group}:${name}`.toLowerCase().replace(/[^a-z0-9:]+/g, "-"), name, group, d, stroke });
  // Basic
  add("Basic", "Rectangle", "M0 0 H100 V100 H0 Z"); add("Basic", "Rounded rectangle", "M12 0 H88 Q100 0 100 12 V88 Q100 100 88 100 H12 Q0 100 0 88 V12 Q0 0 12 0 Z");
  add("Basic", "Pill", "M25 20 H75 A30 30 0 0 1 75 80 H25 A30 30 0 0 1 25 20 Z"); add("Basic", "Circle", "M50 0 A50 50 0 1 1 49.99 0 Z");
  add("Basic", "Semicircle", "M0 75 A50 50 0 0 1 100 75 Z"); add("Basic", "Quarter circle", "M0 0 A100 100 0 0 1 100 100 H0 Z");
  add("Basic", "Ring", "M50 0 A50 50 0 1 1 49.99 0 Z M50 22 A28 28 0 1 0 50.01 22 Z"); add("Basic", "Right triangle", "M0 0 L100 100 H0 Z");
  add("Basic", "Parallelogram", "M25 10 H100 L75 90 H0 Z"); add("Basic", "Trapezoid", "M20 10 H80 L100 90 H0 Z"); add("Basic", "Diamond", "M50 0 L100 50 L50 100 L0 50 Z");
  add("Basic", "Cross", "M35 0 H65 V35 H100 V65 H65 V100 H35 V65 H0 V35 H35 Z"); add("Basic", "X", "M15 0 L50 35 L85 0 L100 15 L65 50 L100 85 L85 100 L50 65 L15 100 L0 85 L35 50 L0 15 Z");
  add("Basic", "Heart", "M50 92 C20 70 0 52 0 30 A25 25 0 0 1 50 20 A25 25 0 0 1 100 30 C100 52 80 70 50 92 Z"); add("Basic", "Moon", "M60 5 A45 45 0 1 0 95 70 A38 38 0 1 1 60 5 Z");
  add("Basic", "Drop", "M50 0 C50 0 15 45 15 65 A35 35 0 0 0 85 65 C85 45 50 0 50 0 Z"); add("Basic", "Shield", "M50 0 L95 15 V45 C95 75 75 92 50 100 C25 92 5 75 5 45 V15 Z");
  add("Basic", "Lightning", "M58 0 L15 58 H45 L38 100 L85 38 H55 Z"); add("Basic", "Cloud", "M25 80 A20 20 0 0 1 22 40 A25 25 0 0 1 70 30 A20 20 0 0 1 80 80 Z");
  add("Basic", "Leaf", "M10 90 C10 40 40 10 90 10 C90 60 60 90 10 90 Z"); add("Basic", "Tag", "M0 30 L30 0 H100 V60 L70 90 H0 Z M18 30 A6 6 0 1 0 18.01 30 Z");
  add("Basic", "Ticket", "M0 15 H100 V40 A10 10 0 0 0 100 60 V85 H0 V60 A10 10 0 0 0 0 40 Z"); add("Basic", "Speech bubble", "M5 5 H95 V70 H45 L25 95 L28 70 H5 Z");
  add("Basic", "Thought bubble", "M50 5 C78 5 98 20 98 40 C98 60 78 72 50 72 C42 72 35 71 28 69 L10 82 L16 64 C7 57 2 49 2 40 C2 20 22 5 50 5 Z");
  add("Basic", "Location pin", "M50 0 A35 35 0 0 1 85 35 C85 60 50 100 50 100 C50 100 15 60 15 35 A35 35 0 0 1 50 0 Z M50 22 A13 13 0 1 0 50.01 22 Z");
  add("Basic", "Sparkle", "M50 0 C54 34 66 46 100 50 C66 54 54 66 50 100 C46 66 34 54 0 50 C34 46 46 34 50 0 Z");
  add("Basic", "Plus", "M40 0 H60 V40 H100 V60 H60 V100 H40 V60 H0 V40 H40 Z"); add("Basic", "Chevron", "M0 0 H60 L100 50 L60 100 H0 L40 50 Z");
  // Polygons (sharp and rounded)
  for (let n = 3; n <= 12; n++) { add("Polygons", NAMES[n]!, poly(n)); add("Polygons", `Rounded ${NAMES[n]!.toLowerCase()}`, roundedPoly(n, 0.18)); add("Polygons", `Soft ${NAMES[n]!.toLowerCase()}`, roundedPoly(n, 0.35)); }
  // Stars and bursts
  for (const n of [4, 5, 6, 7, 8, 10, 12, 16, 20, 24]) for (const [label, inner] of [["Sharp", 0.38], ["Classic", 0.5], ["Fat", 0.68]] as const) add("Stars", `${label} ${n}-point star`, star(n, inner));
  for (const n of [8, 12, 16, 24, 32, 48]) for (const [label, inner] of [["Burst", 0.7], ["Sunburst", 0.82]] as const) add("Bursts", `${label} ${n}`, star(n, inner));
  // Seals / badges
  for (const teeth of [12, 16, 20, 24, 30, 36, 40]) { add("Badges", `Seal ${teeth}`, seal(teeth, 6)); add("Badges", `Deep seal ${teeth}`, seal(teeth, 12)); }
  for (const bumps of [6, 8, 10, 12, 16, 20]) { add("Badges", `Scalloped ${bumps}`, wavy(bumps, 6)); add("Badges", `Flower ${bumps}`, wavy(bumps, 16)); }
  // Arrows
  const arrows: [string, string][] = [["Right", "M0 35 H65 V10 L100 50 L65 90 V65 H0 Z"], ["Left", "M100 35 H35 V10 L0 50 L35 90 V65 H100 Z"], ["Up", "M35 100 V35 H10 L50 0 L90 35 H65 V100 Z"],
    ["Down", "M35 0 V65 H10 L50 100 L90 65 H65 V0 Z"], ["Double", "M0 50 L25 15 V35 H75 V15 L100 50 L75 85 V65 H25 V85 Z"], ["Thin right", "M0 45 H80 V30 L100 50 L80 70 V55 H0 Z"],
    ["Chevron right", "M10 0 L60 50 L10 100 L30 100 L80 50 L30 0 Z"], ["Notched", "M0 20 H60 V0 L100 50 L60 100 V80 H0 L20 50 Z"], ["Curved", "M10 90 C10 40 40 20 70 20 V0 L100 30 L70 60 V40 C50 40 30 55 30 90 Z"],
    ["U-turn", "M20 100 V40 A30 30 0 0 1 80 40 V55 H95 L70 85 L45 55 H60 V40 A10 10 0 0 0 40 40 V100 Z"], ["Circular", "M50 10 A40 40 0 1 1 15 30 L5 22 L30 15 L28 40 L20 34 A30 30 0 1 0 50 20 Z"],
    ["Block right", "M0 25 H55 V0 L100 50 L55 100 V75 H0 Z"], ["Pentagon arrow", "M0 0 H70 L100 50 L70 100 H0 Z"], ["Striped", "M0 35 H10 V65 H0 Z M18 35 H28 V65 H18 Z M36 35 H65 V10 L100 50 L65 90 V65 H36 Z"]];
  for (const [n, d] of arrows) add("Arrows", `${n} arrow`, d);
  // Callouts & banners
  const callouts: [string, string][] = [["Rounded callout", "M15 5 H85 Q95 5 95 15 V60 Q95 70 85 70 H45 L25 95 L28 70 H15 Q5 70 5 60 V15 Q5 5 15 5 Z"], ["Oval callout", "M50 5 C80 5 98 20 98 40 C98 60 80 72 50 72 L30 95 L33 70 C15 66 2 55 2 40 C2 20 20 5 50 5 Z"],
    ["Left callout", "M15 5 H95 V70 H15 V45 L0 37 L15 30 Z"], ["Ribbon banner", "M0 25 H15 V10 H85 V25 H100 L90 45 L100 65 H85 V80 H15 V65 H0 L10 45 Z"], ["Flag banner", "M0 10 H100 L85 50 L100 90 H0 Z"],
    ["Swallowtail", "M0 20 H100 V80 H0 L15 50 Z"], ["Pennant", "M0 0 L100 50 L0 100 Z"], ["Bookmark", "M15 0 H85 V100 L50 75 L15 100 Z"], ["Label", "M0 0 H80 L100 50 L80 100 H0 Z"],
    ["Scroll", "M10 15 H90 A8 8 0 0 1 90 31 H85 V85 A8 8 0 0 1 77 93 H10 A8 8 0 0 1 10 77 H15 V23 A8 8 0 0 1 10 15 Z"], ["Ticket stub", "M0 0 H70 A6 6 0 0 0 82 0 H100 V100 H82 A6 6 0 0 0 70 100 H0 Z"]];
  for (const [n, d] of callouts) add("Callouts & banners", n, d);
  // Frames (outline-only shapes)
  add("Frames", "Square frame", "M0 0 H100 V100 H0 Z M8 8 V92 H92 V8 Z"); add("Frames", "Circle frame", "M50 0 A50 50 0 1 1 49.99 0 Z M50 8 A42 42 0 1 0 50.01 8 Z");
  add("Frames", "Rounded frame", "M14 0 H86 Q100 0 100 14 V86 Q100 100 86 100 H14 Q0 100 0 86 V14 Q0 0 14 0 Z M14 8 Q8 8 8 14 V86 Q8 92 14 92 H86 Q92 92 92 86 V14 Q92 8 86 8 Z");
  add("Frames", "Arch frame", "M0 100 V45 A50 45 0 0 1 100 45 V100 Z M8 92 H92 V45 A42 37 0 0 0 8 45 Z"); add("Frames", "Arch", "M0 100 V45 A50 45 0 0 1 100 45 V100 Z");
  add("Frames", "Corner brackets", "M0 0 H30 V8 H8 V30 H0 Z M70 0 H100 V30 H92 V8 H70 Z M0 70 H8 V92 H30 V100 H0 Z M92 70 H100 V100 H70 V92 H92 Z");
  add("Frames", "Polaroid", "M0 0 H100 V100 H0 Z M7 7 V75 H93 V7 Z"); add("Frames", "Double frame", "M0 0 H100 V100 H0 Z M4 4 V96 H96 V4 Z M9 9 H91 V91 H9 Z M13 13 V87 H87 V13 Z");
  for (let n = 3; n <= 8; n++) add("Frames", `${NAMES[n]} frame`, `${poly(n)} ${poly(n, -Math.PI / 2, 40).replace(/^M/, "M")}`);
  // Lines & dividers (stroked)
  add("Lines", "Line", "M0 50 H100", true); add("Lines", "Wave", "M0 50 C12 30 25 30 37 50 C50 70 62 70 75 50 C87 30 100 30 100 50", true);
  add("Lines", "Zigzag", "M0 60 L10 40 L20 60 L30 40 L40 60 L50 40 L60 60 L70 40 L80 60 L90 40 L100 60", true); add("Lines", "Arc", "M0 80 Q50 0 100 80", true);
  add("Lines", "Swoosh", "M0 70 C30 20 70 90 100 30", true); add("Lines", "Loop", "M0 60 C30 60 40 20 55 30 C70 40 50 70 40 55 C30 40 70 30 100 40", true);
  add("Lines", "Bracket", "M30 0 Q15 0 15 15 V40 Q15 50 0 50 Q15 50 15 60 V85 Q15 100 30 100", true); add("Lines", "Spiral", "M50 50 m0 -5 a5 5 0 1 1 -5 5 a10 10 0 1 1 10 -10 a15 15 0 1 1 -15 15 a20 20 0 1 1 20 -20 a25 25 0 1 1 -25 25", true);
  // Organic blobs
  for (let i = 1; i <= 60; i++) add("Blobs", `Blob ${i}`, blob(i * 7919, 5 + (i % 5)));
  return (cached = out);
}
