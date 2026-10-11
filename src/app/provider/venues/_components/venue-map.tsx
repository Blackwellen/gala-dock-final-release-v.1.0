import type { PointerEvent as ReactPointerEvent, Ref } from "react";

/** One element of a venue's structural map (venue_structures.elements). Rooms link to bookable spaces. */
export type MapEl = {
  type: "room" | "stage" | "bar" | "exit" | "entrance" | "toilets" | "loading" | "accessible_route" | "water" | (string & {});
  id?: string; label: string; x?: number; y?: number; w?: number; h?: number; space?: string; points?: number[][]; locked?: boolean; protected?: boolean;
};
export type MapSpace = { id: string; name: string; capacity: number; indoor: boolean };

export const ROOM_TONES = [["#ece5ff", "#8b5cf6"], ["#e1edff", "#2f6bff"], ["#ffe3e8", "#ec3a52"], ["#ddf6e9", "#16a46c"], ["#fff0d9", "#f39a1e"], ["#e3f6fb", "#0ea5c6"]] as const;
const FIXTURE: Record<string, [string, string]> = { stage: ["#3b3f5c", "#fff"], bar: ["#fde7c4", "#9a5b00"], toilets: ["#e7eaf3", "#4f5785"], loading: ["#e7eaf3", "#4f5785"], exit: ["#ec3a52", "#fff"], entrance: ["#16a46c", "#fff"] };
export const FIXTURE_LABEL: Record<string, string> = { stage: "Stage", bar: "Bar", exit: "Fire exit", entrance: "Entrance", toilets: "Toilets", loading: "Loading bay", accessible_route: "Step-free route", water: "Water edge" };

export function mapBounds(els: MapEl[]) {
  let maxX = 0, maxY = 0;
  for (const e of els) {
    if (e.points) for (const [x, y] of e.points) { maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    else { maxX = Math.max(maxX, (e.x ?? 0) + (e.w ?? 0)); maxY = Math.max(maxY, (e.y ?? 0) + (e.h ?? 0)); }
  }
  return { w: Math.max(maxX + 20, 400), h: Math.max(maxY + 20, 240) };
}

/**
 * Renders a structural venue map. Rooms are tinted per space and show capacity; fixed features (stage, bar, exits…) are drawn on top.
 * `dim` greys out rooms filtered away; `selected` outlines one room; pointer handlers are only passed by the client editor.
 */
export function VenueMap({ elements, spaces, dim, selected, selectedIndex = null, zoom = 1, className = "", onElDown, onCanvasDown, onCanvasMove, onCanvasUp, labelSize = 13, svgRef }: {
  elements: MapEl[]; spaces: MapSpace[]; dim?: (spaceId: string | undefined) => boolean; selected?: string | null; selectedIndex?: number | null; zoom?: number; className?: string; labelSize?: number;
  svgRef?: Ref<SVGSVGElement>;
  onElDown?: (e: ReactPointerEvent<SVGGElement>, index: number) => void; onCanvasDown?: (e: ReactPointerEvent<SVGSVGElement>) => void;
  onCanvasMove?: (e: ReactPointerEvent<SVGSVGElement>) => void; onCanvasUp?: () => void;
}) {
  const { w, h } = mapBounds(elements);
  const vw = w / zoom, vh = h / zoom, vx = (w - vw) / 2, vy = (h - vh) / 2;
  const rooms = elements.filter(e => e.type === "room");
  const toneOf = (el: MapEl) => ROOM_TONES[Math.max(0, rooms.indexOf(el)) % ROOM_TONES.length];
  const k = labelSize / 13;
  return <svg ref={svgRef} className={`vm ${className}`} viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img" aria-label="Venue floor plan" onPointerDown={onCanvasDown} onPointerMove={onCanvasMove} onPointerUp={onCanvasUp} onPointerCancel={onCanvasUp} preserveAspectRatio="xMidYMid meet">
    <defs>
      <pattern id="vm-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e6ebf5" strokeWidth="1" /></pattern>
      <pattern id="vm-water" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M0 7q3.5-4 7 0t7 0" fill="none" stroke="#8fc1ee" strokeWidth="1.2" /></pattern>
    </defs>
    <rect x={vx} y={vy} width={vw} height={vh} fill="#f6f9fc" /><rect x={vx} y={vy} width={vw} height={vh} fill="url(#vm-grid)" />
    {elements.map((e, i) => {
      if (e.type === "water") return <g key={i}><rect x={e.x} y={e.y} width={e.w} height={e.h} fill="#cfe6fb" /><rect x={e.x} y={e.y} width={e.w} height={e.h} fill="url(#vm-water)" />
        <text x={(e.x ?? 0) + (e.w ?? 0) / 2} y={(e.y ?? 0) + (e.h ?? 0) / 2 + 4 * k} textAnchor="middle" className="vm-water" style={{ fontSize: 11 * k }}>{e.label.toUpperCase()}</text></g>;
      if (e.type !== "room") return null;
      const sp = spaces.find(s => s.id === e.space), [fill, stroke] = toneOf(e), off = dim?.(e.space);
      const cx = (e.x ?? 0) + (e.w ?? 0) / 2, cy = (e.y ?? 0) + (e.h ?? 0) / 2;
      return <g key={i} className={`vm-room${off ? " off" : ""}${(selected && selected === e.space) || selectedIndex === i ? " on" : ""}`} onPointerDown={onElDown ? ev => onElDown(ev, i) : undefined}>
        <rect x={e.x} y={e.y} width={e.w} height={e.h} rx="6" fill={fill} stroke={stroke} strokeWidth={(selected && selected === e.space) || selectedIndex === i ? 2.5 : 1.4} />
        <text x={cx} y={cy - 4 * k} textAnchor="middle" className="vm-label" style={{ fontSize: Math.min(labelSize, ((e.w ?? 0) - 12) / ((sp?.name ?? e.label).length * 0.56)) }}>{sp?.name ?? e.label}</text>
        {sp && <g><rect x={cx - 22 * k} y={cy + 4 * k} width={44 * k} height={17 * k} rx={8.5 * k} fill={stroke} /><text x={cx} y={cy + 16.5 * k} textAnchor="middle" className="vm-cap" style={{ fontSize: 10 * k }}>{sp.capacity}</text></g>}
      </g>;
    })}
    {elements.map((e, i) => {
      if (e.type === "accessible_route" && e.points) return <polyline key={i} points={e.points.map(p => p.join(",")).join(" ")} fill="none" stroke="#16a46c" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round"><title>{e.label}</title></polyline>;
      const f = FIXTURE[e.type];
      if (!f || e.x === undefined) return null;
      const small = (e.w ?? 0) < 40 || (e.h ?? 0) < 18;
      return <g key={i} className={`vm-fix${selectedIndex === i ? " on" : ""}`} onPointerDown={onElDown ? ev => onElDown(ev, i) : undefined}><title>{`${e.label}${e.protected ? " (protected)" : e.locked ? " (fixed)" : ""}`}</title>
        <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={small ? 2 : 4} fill={f[0]} />
        {!small && <text x={e.x + (e.w ?? 0) / 2} y={e.y! + (e.h ?? 0) / 2 + 4} textAnchor="middle" fill={f[1]} className="vm-fix-label" style={{ fontSize: 10 * k }}>{(e.type === "stage" ? "STAGE" : e.label)}</text>}
      </g>;
    })}
  </svg>;
}
