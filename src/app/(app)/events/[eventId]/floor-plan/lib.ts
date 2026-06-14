/** Floor plan element model + helpers. Stored as JSON in event_floor_plans.canvas_json. */

export type FloorPlanElementType =
  | "round-table-6"
  | "round-table-8"
  | "round-table-10"
  | "round-table-12"
  | "rect-table-6"
  | "rect-table-8"
  | "cocktail-table"
  | "stage"
  | "dance-floor"
  | "dj-booth"
  | "bar"
  | "photo-booth"
  | "registration-desk"
  | "buffet-table"
  | "entrance"
  | "text-label";

export interface FloorPlanElement {
  id: string;
  type: FloorPlanElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
  color: string | null;
  capacity: number | null;
  guest_ids: string[];
  locked: boolean;
}

export interface ElementSpec {
  type: FloorPlanElementType;
  label: string;
  group: "Tables" | "Features" | "Other";
  width: number;
  height: number;
  shape: "circle" | "rect";
  color: string;
  capacity: number | null;
}

/** Catalogue of placeable elements used by the library panel + add-at-center. */
export const ELEMENT_SPECS: ElementSpec[] = [
  { type: "round-table-6", label: "Round 6", group: "Tables", width: 90, height: 90, shape: "circle", color: "#7c5cff", capacity: 6 },
  { type: "round-table-8", label: "Round 8", group: "Tables", width: 110, height: 110, shape: "circle", color: "#7c5cff", capacity: 8 },
  { type: "round-table-10", label: "Round 10", group: "Tables", width: 130, height: 130, shape: "circle", color: "#7c5cff", capacity: 10 },
  { type: "round-table-12", label: "Round 12", group: "Tables", width: 150, height: 150, shape: "circle", color: "#7c5cff", capacity: 12 },
  { type: "rect-table-6", label: "Rect 6", group: "Tables", width: 160, height: 70, shape: "rect", color: "#7c5cff", capacity: 6 },
  { type: "rect-table-8", label: "Rect 8", group: "Tables", width: 200, height: 70, shape: "rect", color: "#7c5cff", capacity: 8 },
  { type: "cocktail-table", label: "Cocktail", group: "Tables", width: 56, height: 56, shape: "circle", color: "#a78bfa", capacity: 4 },
  { type: "stage", label: "Stage", group: "Features", width: 220, height: 90, shape: "rect", color: "#475569", capacity: null },
  { type: "dance-floor", label: "Dance Floor", group: "Features", width: 180, height: 180, shape: "rect", color: "#0ea5e9", capacity: null },
  { type: "dj-booth", label: "DJ Booth", group: "Features", width: 90, height: 60, shape: "rect", color: "#334155", capacity: null },
  { type: "bar", label: "Bar", group: "Features", width: 200, height: 60, shape: "rect", color: "#b45309", capacity: null },
  { type: "photo-booth", label: "Photo Booth", group: "Features", width: 90, height: 90, shape: "rect", color: "#db2777", capacity: null },
  { type: "registration-desk", label: "Registration", group: "Features", width: 140, height: 55, shape: "rect", color: "#0f766e", capacity: null },
  { type: "buffet-table", label: "Buffet", group: "Features", width: 200, height: 60, shape: "rect", color: "#ca8a04", capacity: null },
  { type: "entrance", label: "Entrance", group: "Other", width: 80, height: 40, shape: "rect", color: "#16a34a", capacity: null },
  { type: "text-label", label: "Text Label", group: "Other", width: 120, height: 40, shape: "rect", color: "#94a3b8", capacity: null },
];

const SPEC_BY_TYPE = new Map(ELEMENT_SPECS.map((s) => [s.type, s]));

export function specFor(type: FloorPlanElementType): ElementSpec | undefined {
  return SPEC_BY_TYPE.get(type);
}

export function isTable(type: FloorPlanElementType): boolean {
  return type.startsWith("round-table") || type.startsWith("rect-table") || type === "cocktail-table";
}

let counter = 0;
/** Generate a reasonably unique client-side element id (crypto when available). */
export function newElementId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  counter += 1;
  return `el-${Date.now()}-${counter}`;
}

/** Build a fresh element from a spec, placed at the given centre coordinates. */
export function makeElement(
  type: FloorPlanElementType,
  centerX: number,
  centerY: number,
  index: number,
): FloorPlanElement {
  const spec = specFor(type)!;
  return {
    id: newElementId(),
    type,
    x: Math.round(centerX - spec.width / 2),
    y: Math.round(centerY - spec.height / 2),
    width: spec.width,
    height: spec.height,
    rotation: 0,
    label: isTable(type) ? `Table ${index}` : spec.label,
    color: spec.color,
    capacity: spec.capacity,
    guest_ids: [],
    locked: false,
  };
}

/**
 * Coerce an unknown jsonb value (from canvas_json) into a typed element array.
 * Defensive: drops anything that isn't a well-formed element.
 */
export function parseCanvasJson(raw: unknown): FloorPlanElement[] {
  if (!Array.isArray(raw)) return [];
  const out: FloorPlanElement[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    if (typeof e.id !== "string" || typeof e.type !== "string") continue;
    out.push({
      id: e.id,
      type: e.type as FloorPlanElementType,
      x: typeof e.x === "number" ? e.x : 0,
      y: typeof e.y === "number" ? e.y : 0,
      width: typeof e.width === "number" ? e.width : 100,
      height: typeof e.height === "number" ? e.height : 100,
      rotation: typeof e.rotation === "number" ? e.rotation : 0,
      label: typeof e.label === "string" ? e.label : "",
      color: typeof e.color === "string" ? e.color : null,
      capacity: typeof e.capacity === "number" ? e.capacity : null,
      guest_ids: Array.isArray(e.guest_ids)
        ? (e.guest_ids.filter((g) => typeof g === "string") as string[])
        : [],
      locked: e.locked === true,
    });
  }
  return out;
}

export const LAYOUT_PRESETS = [
  { id: "blank", label: "Blank Canvas" },
  { id: "banquet", label: "Banquet — rows of long tables" },
  { id: "cabaret", label: "Cabaret — round tables facing stage" },
  { id: "cocktail", label: "Cocktail — standing tables" },
] as const;

export type PresetId = (typeof LAYOUT_PRESETS)[number]["id"];

/** Generate starter elements for a preset. */
export function presetElements(preset: PresetId): FloorPlanElement[] {
  const els: FloorPlanElement[] = [];
  if (preset === "banquet") {
    let n = 1;
    for (let row = 0; row < 3; row++) {
      els.push(makeElement("rect-table-8", 220, 140 + row * 120, n++));
      els.push(makeElement("rect-table-8", 480, 140 + row * 120, n++));
    }
  } else if (preset === "cabaret") {
    els.push(makeElement("stage", 380, 70, 0));
    let n = 1;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        els.push(makeElement("round-table-10", 200 + col * 180, 240 + row * 180, n++));
      }
    }
  } else if (preset === "cocktail") {
    let n = 1;
    const coords = [
      [180, 160], [340, 220], [500, 160], [260, 320], [440, 320], [600, 260],
    ];
    for (const [x, y] of coords) {
      els.push(makeElement("cocktail-table", x, y, n++));
    }
    els.push(makeElement("bar", 380, 60, 0));
  }
  return els;
}
