// Venue map geometry model shared by the editor (ORG-013), previews and ticket allocation.
// Structure = venue-owned, immutable to organizers. Overlay = event-specific, editable.
export type Shape = { shape: "rect"; x: number; y: number; w: number; h: number; r?: number } | { shape: "ellipse"; cx: number; cy: number; rx: number; ry: number } | { shape: "poly"; points: [number, number][] };
export type StructType = "stage" | "wall" | "entrance" | "exit" | "bar" | "toilet" | "route" | "area" | "fixed_seats" | "first_aid";
export type OverlayType = "zone" | "table" | "booth" | "camera" | "production" | "sponsor" | "staff" | "checkpoint" | "killed" | "temp_stage" | "food";
export type StructEl = Shape & { id: string; type: StructType; label: string; capacity?: number; protected?: boolean };
export type OverlayEl = Shape & { id: string; type: OverlayType; label: string; capacity?: number; tierId?: string | null; accessible?: number; color?: string; layer?: string };
export type MapStructure = { width: number; height: number; maxCapacity: number; elements: StructEl[] };

export const STRUCT_STYLE: Record<StructType, { fill: string; stroke: string; text: string }> = {
  stage: { fill: "#1f2340", stroke: "#1f2340", text: "#fff" }, wall: { fill: "#c9cfdf", stroke: "#aab2c8", text: "#4a5170" },
  entrance: { fill: "#0f172a", stroke: "#0f172a", text: "#fff" }, exit: { fill: "#16a34a", stroke: "#15803d", text: "#fff" },
  bar: { fill: "#fecdd3", stroke: "#fb7185", text: "#9f1239" }, toilet: { fill: "#dbeafe", stroke: "#60a5fa", text: "#1e40af" },
  route: { fill: "#dcfce7", stroke: "#4ade80", text: "#166534" }, area: { fill: "#eef2f7", stroke: "#d4dbe8", text: "#4a5170" },
  fixed_seats: { fill: "#e0e7ff", stroke: "#818cf8", text: "#3730a3" }, first_aid: { fill: "#fee2e2", stroke: "#ef4444", text: "#991b1b" },
};
export const OVERLAY_STYLE: Record<OverlayType, string> = { zone: "#3b82f6", table: "#a855f7", booth: "#f59e0b", camera: "#0ea5e9", production: "#64748b", sponsor: "#ec4899", staff: "#14b8a6", checkpoint: "#0f172a", killed: "#ef4444", temp_stage: "#6366f1", food: "#f97316" };

/** Default outdoor-arena structure used when the venue has not published a structural map. */
export function defaultStructure(capacity = 2000): MapStructure {
  return { width: 1000, height: 640, maxCapacity: capacity, elements: [
    { id: "s-boundary", type: "area", label: "Site boundary", shape: "rect", x: 20, y: 20, w: 960, h: 600, r: 28, protected: true },
    { id: "s-stage", type: "stage", label: "STAGE", shape: "rect", x: 380, y: 40, w: 240, h: 58, r: 10 },
    { id: "s-foh", type: "area", label: "FOH", shape: "rect", x: 460, y: 410, w: 80, h: 46, r: 6 },
    { id: "s-bar-l", type: "bar", label: "Bar", shape: "rect", x: 70, y: 300, w: 110, h: 80, r: 12 },
    { id: "s-bar-r", type: "bar", label: "Bar", shape: "rect", x: 820, y: 120, w: 100, h: 70, r: 12 },
    { id: "s-wc-1", type: "toilet", label: "WC", shape: "rect", x: 80, y: 520, w: 60, h: 40, r: 8 },
    { id: "s-wc-2", type: "toilet", label: "WC", shape: "rect", x: 860, y: 520, w: 60, h: 40, r: 8 },
    { id: "s-entrance", type: "entrance", label: "ENTRANCE", shape: "rect", x: 430, y: 580, w: 140, h: 34, r: 8 },
    { id: "s-exit-l", type: "exit", label: "EXIT", shape: "rect", x: 24, y: 210, w: 50, h: 28, r: 6, protected: true },
    { id: "s-exit-r", type: "exit", label: "EXIT", shape: "rect", x: 926, y: 400, w: 50, h: 28, r: 6, protected: true },
    { id: "s-route", type: "route", label: "Accessible route", shape: "rect", x: 300, y: 560, w: 400, h: 16, r: 8, protected: true },
    { id: "s-aid", type: "first_aid", label: "First aid", shape: "rect", x: 820, y: 300, w: 80, h: 44, r: 8 },
  ] };
}
export function defaultOverlay(tiers: { id: string; name: string; kind: string; quantity: number }[] = []): OverlayEl[] {
  const vip = tiers.find(t => t.kind === "vip"), ga = tiers.find(t => t.kind === "general") ?? tiers.find(t => t.kind === "early"), grp = tiers.find(t => t.kind === "group");
  return [
    { id: "o-vip", type: "zone", label: "VIP", shape: "ellipse", cx: 500, cy: 160, rx: 120, ry: 44, capacity: vip?.quantity ?? 400, tierId: vip?.id ?? null, color: "#a855f7", accessible: 10 },
    { id: "o-ga", type: "zone", label: "General Admission", shape: "ellipse", cx: 500, cy: 300, rx: 250, ry: 100, capacity: ga?.quantity ?? 1000, tierId: ga?.id ?? null, color: "#3b82f6", accessible: 40 },
    { id: "o-group", type: "zone", label: "Group", shape: "rect", x: 220, y: 120, w: 120, h: 120, r: 16, capacity: grp?.quantity ?? 200, tierId: grp?.id ?? null, color: "#22c55e" },
    { id: "o-food", type: "food", label: "Food", shape: "rect", x: 700, y: 400, w: 110, h: 70, r: 14, color: "#f97316" },
    { id: "o-check", type: "checkpoint", label: "Security check", shape: "rect", x: 455, y: 520, w: 90, h: 26, r: 6 },
  ];
}
const centroid = (s: Shape): [number, number] => s.shape === "rect" ? [s.x + s.w / 2, s.y + s.h / 2] : s.shape === "ellipse" ? [s.cx, s.cy] : [s.points.reduce((a, p) => a + p[0], 0) / s.points.length, s.points.reduce((a, p) => a + p[1], 0) / s.points.length];
export const bbox = (s: Shape) => s.shape === "rect" ? { x: s.x, y: s.y, w: s.w, h: s.h } : s.shape === "ellipse" ? { x: s.cx - s.rx, y: s.cy - s.ry, w: 2 * s.rx, h: 2 * s.ry } : (() => { const xs = s.points.map(p => p[0]), ys = s.points.map(p => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; })();
export { centroid };
const overlaps = (a: Shape, b: Shape) => { const A = bbox(a), B = bbox(b); return A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h; };

/** Constraint validation: capacity, protected exits/routes, accessibility, mutually exclusive space. */
export function validateLayout(structure: MapStructure, overlay: OverlayEl[], tiers: { id: string; name: string; quantity: number; kind: string }[] = []) {
  const issues: { level: "error" | "warning"; message: string; elementId?: string }[] = [];
  const zones = overlay.filter(o => o.type === "zone");
  const total = zones.reduce((s, z) => s + (z.capacity ?? 0), 0);
  if (total > structure.maxCapacity) issues.push({ level: "error", message: `Zone capacity ${total.toLocaleString()} exceeds the venue's licensed capacity of ${structure.maxCapacity.toLocaleString()}.` });
  for (const o of overlay) for (const s of structure.elements.filter(e => e.protected && e.type !== "area")) if (overlaps(o, s)) issues.push({ level: "error", message: `${o.label} blocks protected ${s.type === "exit" ? "exit" : s.label.toLowerCase()} (${s.label}).`, elementId: o.id });
  for (const o of overlay) for (const s of structure.elements.filter(e => ["stage", "bar", "toilet", "entrance", "first_aid"].includes(e.type))) if (o.type !== "checkpoint" && overlaps(o, s) && o.type !== "zone") issues.push({ level: "warning", message: `${o.label} overlaps ${s.label}.`, elementId: o.id });
  for (let i = 0; i < overlay.length; i++) for (let j = i + 1; j < overlay.length; j++) { const a = overlay[i]!, b = overlay[j]!; if (a.type !== "zone" && b.type !== "zone" && overlaps(a, b)) issues.push({ level: "error", message: `${a.label} and ${b.label} occupy the same space.`, elementId: a.id }); }
  const accessible = zones.reduce((s, z) => s + (z.accessible ?? 0), 0);
  const needed = Math.ceil(total * 0.02);
  if (total && accessible < needed) issues.push({ level: "warning", message: `Accessible allocation ${accessible} is below the recommended ${needed} (2% of capacity).` });
  for (const z of zones) { const t = tiers.find(x => x.id === z.tierId); if (z.tierId && !t) issues.push({ level: "error", message: `${z.label} is bound to a ticket tier that no longer exists.`, elementId: z.id }); if (t && t.quantity > (z.capacity ?? 0)) issues.push({ level: "error", message: `${t.name} has ${t.quantity} tickets but ${z.label} only holds ${z.capacity}.`, elementId: z.id }); }
  for (const t of tiers.filter(t => !["comp", "group"].includes(t.kind) && t.quantity > 0)) if (!zones.some(z => z.tierId === t.id)) issues.push({ level: "warning", message: `${t.name} isn't allocated to a zone yet.` });
  return issues;
}
