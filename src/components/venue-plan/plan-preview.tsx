import { MapContent, MapDefs, MAP_ATTRIBUTION, elBounds, type MapEl, type MapSpace } from "@/app/provider/venues/_components/venue-map";

/** Read-only render of a saved plan (venue base + event overlay), fitted to its contents. Same renderer as the editor. */
export function PlanPreview({ base, overlay, spaces = [], height = 200, tierColor, label = "Event layout preview" }: {
  base: MapEl[]; overlay: MapEl[]; spaces?: MapSpace[]; height?: number | string; tierColor?: Record<string, string>; label?: string;
}) {
  const all = [...base, ...overlay].filter(e => !e.hidden && e.type !== "layer");
  const drawn = all.filter(e => e.type !== "basemap");
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of drawn) { const b = elBounds(e); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = 600; y1 = 360; }
  // At least ~80 m × 45 m of context so a plan with one or two items isn't blown up.
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = Math.max(800, (x1 - x0) * 1.12 + 40), h = Math.max(450, (y1 - y0) * 1.12 + 40);
  const view = { x: cx - w / 2, y: cy - h / 2, w, h };
  const colors = tierColor ?? {};
  // Wide cards show more than the viewBox (meet scaling), so street-map tiles cover a wider span than the plan itself.
  const tiles = { x: view.x - view.w * 1.5, y: view.y - view.h, w: view.w * 4, h: view.h * 3 };
  return <svg className="vm" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} style={{ width: "100%", height, display: "block" }} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
    <MapDefs /><rect x={tiles.x} y={tiles.y} width={tiles.w} height={tiles.h} fill="#f6f9fc" />
    {base.length > 0 && <g opacity={0.85}><MapContent elements={base} spaces={spaces} span={tiles} labelSize={view.w / 50} px={600} /></g>}
    <MapContent elements={overlay} spaces={spaces} span={tiles} labelSize={view.w / 50} px={600} tierColor={t => (t ? colors[t] : undefined)} />
    {all.some(e => e.type === "basemap") && <text x={view.x + view.w - 6} y={view.y + view.h - 6} textAnchor="end" className="vm-attr" style={{ fontSize: view.w / 90 }}>{MAP_ATTRIBUTION}</text>}
  </svg>;
}
