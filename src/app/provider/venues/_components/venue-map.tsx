import "@/styles/venue-plan.css";
import type { PointerEvent as ReactPointerEvent, Ref, ReactNode } from "react";
import { AssetShape, PlanDefs, pointLabelHidden, type SeatFlag, type SeatState } from "@/components/venue-plan/asset-shape";
import { tileUrl, styleMaxZoom, MAP_ATTRIBUTION } from "@/lib/maps/styles";
import type { Seating, TableSpec } from "@/components/venue-plan/assets";

/**
 * One element of a venue's structural map (venue_structures.elements). Units: 10 map units = 1 metre.
 * Rooms are rectangles (x/y/w/h) or polygons (points) and link to bookable spaces. Underlays are uploaded drawings; a basemap is a street map anchored to the venue's coordinates.
 */
export type MapEl = {
  type: "room" | "stage" | "bar" | "exit" | "entrance" | "toilets" | "loading" | "accessible_route" | "water" | "wall" | "label" | "underlay" | "basemap" | (string & {});
  id?: string; label: string; x?: number; y?: number; w?: number; h?: number; space?: string; points?: number[][]; locked?: boolean; protected?: boolean;
  url?: string; opacity?: number; lat?: number; lng?: number; hidden?: boolean; size?: number;
  /** Plan assets (type "asset"): catalogue key, rotation, seating/table specs, capacity, ticket tier, per-seat flags/tiers. */
  /** Custom layer id (elements of type "layer" define layers: id + label; they draw nothing). Basemap: tile style. */
  layer?: string; mapStyle?: string;
  asset?: string; rot?: number; seating?: Seating; table?: TableSpec; capacity?: number; tier?: string | null; color?: string; seatFlags?: Record<string, SeatFlag>; seatTiers?: Record<string, string>;
};
export type MapSpace = { id: string; name: string; capacity: number; indoor: boolean };
export const UNITS_PER_M = 10;

export const ROOM_TONES = [["#ece5ff", "#8b5cf6"], ["#e1edff", "#2f6bff"], ["#ffe3e8", "#ec3a52"], ["#ddf6e9", "#16a46c"], ["#fff0d9", "#f39a1e"], ["#e3f6fb", "#0ea5c6"]] as const;
const FIXTURE: Record<string, [string, string]> = { stage: ["#3b3f5c", "#fff"], bar: ["#fde7c4", "#9a5b00"], toilets: ["#e7eaf3", "#3f4596"], loading: ["#e7eaf3", "#3f4596"], exit: ["#ec3a52", "#fff"], entrance: ["#16a46c", "#fff"] };
export const FIXTURE_LABEL: Record<string, string> = { stage: "Stage", bar: "Bar", exit: "Fire exit", entrance: "Entrance", toilets: "Toilets", loading: "Loading bay", accessible_route: "Step-free route", water: "Water edge", wall: "Wall", label: "Label", room: "Room", underlay: "Drawing", basemap: "Street map" };

export const isPoly = (e: MapEl) => !!e.points && e.points.length > 0;
export function elBounds(e: MapEl) {
  if (e.points?.length) { const xs = e.points.map(p => p[0]), ys = e.points.map(p => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
  if (e.type === "label") return { x: e.x ?? 0, y: (e.y ?? 0) - (e.size ?? 14), w: e.label.length * (e.size ?? 14) * 0.6, h: e.size ?? 14 };
  return { x: e.x ?? 0, y: e.y ?? 0, w: e.w ?? 0, h: e.h ?? 0 };
}
export function mapBounds(els: MapEl[]) {
  let maxX = 0, maxY = 0;
  for (const e of els) { if (e.type === "basemap" || e.type === "layer" || e.hidden) continue; const b = elBounds(e); maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h); }
  return { w: Math.max(maxX + 20, 400), h: Math.max(maxY + 20, 240) };
}
export const centroid = (pts: number[][]) => { const n = pts.length; return [pts.reduce((a, p) => a + p[0], 0) / n, pts.reduce((a, p) => a + p[1], 0) / n]; };

/** Web-Mercator tiles covering the visible span, anchored so the basemap's lat/lng sits at map (x, y). The zoom level follows the view
 *  (≈256–512 screen px per tile for a canvas `px` wide) so zooming out never loads hundreds of street-level tiles. */
export function basemapTiles(e: MapEl, span: { x?: number; y?: number; w: number; h: number }, px = 1000) {
  if (e.lat === undefined || e.lng === undefined) return [];
  const cos = Math.cos((e.lat * Math.PI) / 180), unitsPerPx = span.w / Math.max(200, px);
  const z = Math.max(3, Math.min(styleMaxZoom(e.mapStyle ?? "streets"), Math.round(Math.log2((156543.03392 * cos * UNITS_PER_M) / unitsPerPx / 1.4))));
  const n = 2 ** z, mpp = (156543.03392 * cos) / n, tileU = 256 * mpp * UNITS_PER_M;
  const fx = ((e.lng + 180) / 360) * n, latR = (e.lat * Math.PI) / 180, fy = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  const ax = e.x ?? 0, ay = e.y ?? 0, out: { href: string; x: number; y: number; s: number }[] = [];
  // A rotated basemap covers the span's bounding circle so no corner is left blank.
  let sx = span.x ?? 0, sy = span.y ?? 0, sw = span.w, sh = span.h;
  if (e.rot) { const r = Math.hypot(sw, sh) / 2, cx = sx + sw / 2, cy = sy + sh / 2, th = (-e.rot * Math.PI) / 180, dx = cx - ax, dy = cy - ay;
    const rcx = ax + dx * Math.cos(th) - dy * Math.sin(th), rcy = ay + dx * Math.sin(th) + dy * Math.cos(th); sx = rcx - r; sy = rcy - r; sw = sh = r * 2; }
  const minTx = Math.floor(fx + (sx - ax) / tileU), maxTx = Math.floor(fx + (sx + sw - ax) / tileU), minTy = Math.floor(fy + (sy - ay) / tileU), maxTy = Math.floor(fy + (sy + sh - ay) / tileU);
  for (let tx = Math.max(0, minTx); tx <= Math.min(n - 1, maxTx); tx++) for (let ty = Math.max(0, minTy); ty <= Math.min(n - 1, maxTy); ty++)
    out.push({ href: tileUrl(e.mapStyle ?? "streets", z, tx, ty), x: ax + (tx - fx) * tileU, y: ay + (ty - fy) * tileU, s: tileU });
  return out.slice(0, 160);
}
export { MAP_ATTRIBUTION };

/** Map content (no <svg>) so the read-only map and the builder share one renderer. */
export function MapContent({ elements, spaces, dim, selected, selectedIndex = null, selectedSet, labelSize = 13, onElDown, span, children, detail = false, tierColor, seatState, selectedSeats, onSeat, px }: {
  elements: MapEl[]; spaces: MapSpace[]; dim?: (spaceId: string | undefined) => boolean; selected?: string | null; selectedIndex?: number | null; selectedSet?: Set<number>; labelSize?: number;
  onElDown?: (e: ReactPointerEvent<SVGGElement>, index: number) => void; span: { x?: number; y?: number; w: number; h: number }; children?: ReactNode;
  detail?: boolean; tierColor?: (tier?: string | null) => string | undefined; seatState?: (key: string) => SeatState | undefined; selectedSeats?: Set<string>;
  onSeat?: (elIndex: number, key: string, ev: ReactPointerEvent<SVGCircleElement>) => void; px?: number;
}) {
  const rooms = elements.filter(e => e.type === "room");
  const toneOf = (el: MapEl) => ROOM_TONES[Math.max(0, rooms.indexOf(el)) % ROOM_TONES.length];
  const k = labelSize / 13;
  const hiddenLabels = pointLabelHidden(elements, k, new Set([...(selectedSet ?? []), ...(selectedIndex !== null ? [selectedIndex] : [])]));
  const down = (i: number) => (onElDown ? (ev: ReactPointerEvent<SVGGElement>) => onElDown(ev, i) : undefined);
  const on = (i: number, e: MapEl) => selectedIndex === i || !!selectedSet?.has(i) || (!!selected && selected === e.space);
  const layer = (pred: (e: MapEl) => boolean, draw: (e: MapEl, i: number) => ReactNode) => elements.map((e, i) => (!e.hidden && pred(e) ? draw(e, i) : null));
  const pts = (p: number[][]) => p.map(q => q.join(",")).join(" ");
  return <>
    {layer(e => e.type === "basemap", (e, i) => <g key={`b${i}`} opacity={e.opacity ?? 0.6} className="vm-base" onPointerDown={down(i)} transform={e.rot ? `rotate(${e.rot} ${e.x ?? 0} ${e.y ?? 0})` : undefined}>
      {basemapTiles(e, span, px).map(t => <image key={t.href} href={t.href} x={t.x} y={t.y} width={t.s + 0.6} height={t.s + 0.6} preserveAspectRatio="none" />)}</g>)}
    {layer(e => e.type === "underlay", (e, i) => <g key={`u${i}`} className={`vm-under${on(i, e) ? " on" : ""}`} onPointerDown={down(i)}>
      <image href={e.url} x={e.x} y={e.y} width={e.w} height={e.h} opacity={e.opacity ?? 0.7} preserveAspectRatio="none" />
      {on(i, e) && <rect x={e.x} y={e.y} width={e.w} height={e.h} fill="none" stroke="#1a1af2" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}</g>)}
    {layer(e => e.type === "water", (e, i) => <g key={`w${i}`} className={on(i, e) ? "vm-sel" : ""} onPointerDown={down(i)}><rect x={e.x} y={e.y} width={e.w} height={e.h} fill="#cfe6fb" /><rect x={e.x} y={e.y} width={e.w} height={e.h} fill="url(#vm-water)" />
      <text x={(e.x ?? 0) + (e.w ?? 0) / 2} y={(e.y ?? 0) + (e.h ?? 0) / 2 + 4 * k} textAnchor="middle" className="vm-water" style={{ fontSize: 11 * k }}>{e.label.toUpperCase()}</text></g>)}
    {layer(e => e.type === "room", (e, i) => {
      const sp = spaces.find(s => s.id === e.space), [fill, stroke] = toneOf(e), off = dim?.(e.space), b = elBounds(e);
      const [cx, cy] = isPoly(e) ? centroid(e.points!) : [b.x + b.w / 2, b.y + b.h / 2];
      const name = sp?.name ?? e.label, fs = Math.min(labelSize, (b.w - 12) / (Math.max(1, name.length) * 0.56));
      return <g key={`r${i}`} className={`vm-room${off ? " off" : ""}${on(i, e) ? " on" : ""}`} onPointerDown={down(i)}>
        {isPoly(e) ? <polygon points={pts(e.points!)} fill={fill} stroke={stroke} strokeWidth={on(i, e) ? 2.5 : 1.4} strokeLinejoin="round" />
          : <rect x={e.x} y={e.y} width={e.w} height={e.h} rx="6" fill={fill} stroke={stroke} strokeWidth={on(i, e) ? 2.5 : 1.4} />}
        <text x={cx} y={cy - 4 * k} textAnchor="middle" className="vm-label" style={{ fontSize: Math.max(6, fs) }}>{name}</text>
        {sp && <g><rect x={cx - 22 * k} y={cy + 4 * k} width={44 * k} height={17 * k} rx={8.5 * k} fill={stroke} /><text x={cx} y={cy + 16.5 * k} textAnchor="middle" className="vm-cap" style={{ fontSize: 10 * k }}>{sp.capacity}</text></g>}
      </g>;
    })}
    {layer(e => e.type === "wall" && isPoly(e), (e, i) => <g key={`x${i}`} className="vm-wall" onPointerDown={down(i)}>
      <polyline points={pts(e.points!)} fill="none" stroke={on(i, e) ? "#1a1af2" : "#2b2f4a"} strokeWidth={e.size ?? 4} strokeLinecap="square" strokeLinejoin="miter" />
      <polyline points={pts(e.points!)} fill="none" stroke="transparent" strokeWidth={14} /></g>)}
    {layer(e => e.type === "accessible_route" && isPoly(e), (e, i) => <g key={`a${i}`} className="vm-route" onPointerDown={down(i)}><title>{e.label}</title>
      <polyline points={pts(e.points!)} fill="none" stroke={on(i, e) ? "#1a1af2" : "#16a46c"} strokeWidth={on(i, e) ? 3.5 : 2.5} strokeDasharray="6 5" strokeLinecap="round" />
      <polyline points={pts(e.points!)} fill="none" stroke="transparent" strokeWidth={14} /></g>)}
    {layer(e => !!FIXTURE[e.type] && e.x !== undefined, (e, i) => {
      const f = FIXTURE[e.type], small = (e.w ?? 0) < 40 || (e.h ?? 0) < 18;
      return <g key={`f${i}`} className={`vm-fix${on(i, e) ? " on" : ""}`} onPointerDown={down(i)}><title>{`${e.label}${e.protected ? " (protected)" : e.locked ? " (fixed)" : ""}`}</title>
        <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={small ? 2 : 4} fill={f[0]} />
        {!small && <text x={e.x! + (e.w ?? 0) / 2} y={e.y! + (e.h ?? 0) / 2 + 4 * k} textAnchor="middle" fill={f[1]} className="vm-fix-label" style={{ fontSize: 10 * k }}>{e.type === "stage" ? "STAGE" : e.label}</text>}</g>;
    })}
    {layer(e => e.type === "asset", (e, i) => <g key={`s${i}`} className={`vm-asset${on(i, e) ? " on" : ""}`} onPointerDown={down(i)}>
      <AssetShape e={e} selected={on(i, e)} detail={detail} tierColor={tierColor} seatState={seatState} selectedSeats={selectedSeats} onSeat={onSeat ? (k, ev) => onSeat(i, k, ev) : undefined} scale={labelSize / 13} hideLabel={hiddenLabels.has(i)} /></g>)}
    {layer(e => e.type === "label", (e, i) => <g key={`t${i}`} className={`vm-text${on(i, e) ? " on" : ""}`} onPointerDown={down(i)}>
      <text x={e.x} y={e.y} className="vm-free" style={{ fontSize: e.size ?? 14 }}>{e.label}</text></g>)}
    {children}
  </>;
}

export function MapDefs() {
  return <defs>
    <pattern id="vm-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e6ebf5" strokeWidth="1" /></pattern>
    <pattern id="vm-grid-m" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="#d3dcef" strokeWidth="1.2" /></pattern>
    <pattern id="vm-water" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M0 7q3.5-4 7 0t7 0" fill="none" stroke="#8fc1ee" strokeWidth="1.2" /></pattern>
    <PlanDefs />
  </defs>;
}

/** Read-only venue map (overview, space location). Pointer props are optional for light interactivity. */
export function VenueMap({ elements, spaces, dim, selected, selectedIndex = null, zoom = 1, className = "", onElDown, onCanvasDown, onCanvasMove, onCanvasUp, labelSize = 13, svgRef }: {
  elements: MapEl[]; spaces: MapSpace[]; dim?: (spaceId: string | undefined) => boolean; selected?: string | null; selectedIndex?: number | null; zoom?: number; className?: string; labelSize?: number;
  svgRef?: Ref<SVGSVGElement>; onElDown?: (e: ReactPointerEvent<SVGGElement>, index: number) => void; onCanvasDown?: (e: ReactPointerEvent<SVGSVGElement>) => void;
  onCanvasMove?: (e: ReactPointerEvent<SVGSVGElement>) => void; onCanvasUp?: () => void;
}) {
  const span = mapBounds(elements);
  const vw = span.w / zoom, vh = span.h / zoom, vx = (span.w - vw) / 2, vy = (span.h - vh) / 2;
  const hasBase = elements.some(e => e.type === "basemap" && !e.hidden);
  return <svg ref={svgRef} className={`vm ${className}`} viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img" aria-label="Venue floor plan" onPointerDown={onCanvasDown} onPointerMove={onCanvasMove} onPointerUp={onCanvasUp} onPointerCancel={onCanvasUp} preserveAspectRatio="xMidYMid meet">
    <MapDefs />
    <rect x={vx} y={vy} width={vw} height={vh} fill="#f6f9fc" /><rect x={vx} y={vy} width={vw} height={vh} fill="url(#vm-grid)" />
    <MapContent elements={elements} spaces={spaces} dim={dim} selected={selected} selectedIndex={selectedIndex} labelSize={labelSize} onElDown={onElDown} span={{ x: vx, y: vy, w: vw, h: vh }} />
    {hasBase && <text x={vx + vw - 6} y={vy + vh - 6} textAnchor="end" className="vm-attr">{MAP_ATTRIBUTION}</text>}
  </svg>;
}
