import { STRUCT_STYLE, OVERLAY_STYLE, centroid, type MapStructure, type OverlayEl, type Shape } from "@/lib/venue-map";

export function ShapeEl({ s, fill, stroke, strokeWidth = 1.5, dash, opacity = 1, ...rest }: { s: Shape; fill: string; stroke: string; strokeWidth?: number; dash?: string; opacity?: number } & React.SVGProps<SVGElement>) {
  const common = { fill, stroke, strokeWidth, strokeDasharray: dash, opacity, vectorEffect: "non-scaling-stroke" as const, ...rest } as Record<string, unknown>;
  if (s.shape === "rect") return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r ?? 0} {...common} />;
  if (s.shape === "ellipse") return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...common} />;
  return <polygon points={s.points.map(p => p.join(",")).join(" ")} {...common} />;
}

/** Static venue map render (structure + overlay). Used for previews; the editor adds interaction on top. */
export function VenueMapSvg({ structure, overlay, height = 220, showLabels = true, mode = "ticketing", className }: { structure: MapStructure; overlay: OverlayEl[]; height?: number | string; showLabels?: boolean; mode?: "ticketing" | "operations" | "public"; className?: string }) {
  return <svg viewBox={`0 0 ${structure.width} ${structure.height}`} style={{ width: "100%", height, display: "block" }} role="img" aria-label="Venue map" className={className}>
    <defs><pattern id="vm-grass" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#eef4ee" /><circle cx="3" cy="3" r="1" fill="#dbe7dc" /></pattern></defs>
    {structure.elements.map(e => { const st = STRUCT_STYLE[e.type]; return <ShapeEl key={e.id} s={e} fill={e.type === "area" && e.id === "s-boundary" ? "url(#vm-grass)" : st.fill} stroke={st.stroke} />; })}
    {overlay.filter(o => mode !== "public" || !["staff", "production", "camera", "checkpoint"].includes(o.type)).map(o => { const c = o.color ?? OVERLAY_STYLE[o.type]; return <ShapeEl key={o.id} s={o} fill={o.type === "killed" ? "#fecaca" : c} stroke={c} opacity={o.type === "zone" ? .85 : .9} dash={o.type === "killed" ? "6 4" : undefined} />; })}
    {showLabels && [...structure.elements.filter(e => e.type !== "area" || e.id !== "s-boundary"), ...overlay].map(e => { const [x, y] = centroid(e); const isStruct = "protected" in e || ["stage", "bar", "toilet", "entrance", "exit", "route", "area", "fixed_seats", "first_aid"].includes(e.type); const color = isStruct ? STRUCT_STYLE[e.type as keyof typeof STRUCT_STYLE]?.text ?? "#333" : "#fff"; return <text key={`t-${e.id}`} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={e.type === "stage" ? 18 : e.type === "route" ? 9 : 13} fontWeight={700} fill={color} style={{ pointerEvents: "none", fontFamily: "Inter, sans-serif" }}>{e.label}</text>; })}
  </svg>;
}
