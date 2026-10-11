import type { PointerEvent as RPE } from "react";
import { ASSET, blockSeats, tableSeats, seatingSize, tableSize, type Seating, type TableSpec } from "./assets";

export type SeatFlag = "blocked" | "accessible" | "restricted" | "companion";
export type AssetEl = { asset?: string; x?: number; y?: number; w?: number; h?: number; rot?: number; points?: number[][]; label: string; seating?: Seating; table?: TableSpec; capacity?: number;
  tier?: string | null; color?: string; seatFlags?: Record<string, SeatFlag>; seatTiers?: Record<string, string> };
export type SeatState = "available" | "held" | "sold" | "blocked" | "selected" | "mine";
const FLAG_FILL: Record<SeatFlag, string> = { blocked: "#c3c8d8", accessible: "#0284c7", restricted: "#e08a00", companion: "#0e9aa7" };
const STATE_FILL: Record<SeatState, string> = { available: "#fff", held: "#fde68a", sold: "#9aa1bd", blocked: "#d6dae6", selected: "#1a1af2", mine: "#16a46c" };

/** Rotated frame for an asset's local coordinates. */
export const frame = (e: AssetEl) => { const w = e.w ?? 0, h = e.h ?? 0; return e.rot ? `rotate(${e.rot} ${(e.x ?? 0) + w / 2} ${(e.y ?? 0) + h / 2})` : undefined; };

/**
 * Renders one plan asset (area, point badge, seating block, table, or line). `detail` draws individual seats; `seatState` colours seats for ticketing;
 * `onSeat` makes seats clickable (organiser blocking/tiering, buyer selection).
 */
export function AssetShape({ e, selected, detail, tierColor, seatState, selectedSeats, onSeat, scale = 1 }: {
  e: AssetEl; selected?: boolean; detail?: boolean; tierColor?: (tier?: string | null) => string | undefined; seatState?: (key: string) => SeatState | undefined;
  selectedSeats?: Set<string>; onSeat?: (key: string, ev: RPE<SVGCircleElement>) => void; scale?: number;
}) {
  const def = ASSET[e.asset ?? ""]; if (!def) return null;
  const Icon = def.icon, x = e.x ?? 0, y = e.y ?? 0, w = e.w ?? 0, h = e.h ?? 0;
  const tint = tierColor?.(e.tier) ?? e.color, stroke = tint ?? def.stroke, fill = tint ? `${tint}22` : def.fill;
  const sw = selected ? 2.4 : 1.3;
  const iconS = Math.min(Math.max(Math.min(w, h) * 0.38, 8), 26) * scale;
  const label = <text x={x + w / 2} y={y + h / 2 + (def.kind === "area" && h > iconS * 2 ? iconS * 0.75 : 4)} textAnchor="middle" className="vp-label" style={{ fontSize: Math.min(13, Math.max(6, w / Math.max(4, e.label.length) * 1.3)) * scale }}>{e.label}</text>;

  if (def.kind === "line" && e.points) {
    const pts = e.points.map(p => p.join(",")).join(" ");
    return <g className={`vp-line${selected ? " on" : ""}`}><polyline points={pts} fill="none" stroke="transparent" strokeWidth={14} />
      <polyline points={pts} fill="none" stroke={selected ? "#1a1af2" : stroke} strokeWidth={def.key === "fence" ? 3 : def.key === "vehicle_route" ? 6 : 3} strokeDasharray={def.dash} strokeLinecap="round" strokeLinejoin="round" />
      {def.key !== "fence" && <polyline points={pts} fill="none" stroke={stroke} strokeWidth={0} markerEnd="url(#vp-arrow)" />}</g>;
  }
  if (def.kind === "point") {
    const r = Math.max(w, h, 18) / 2, cx = x + w / 2, cy = y + h / 2;
    return <g className={`vp-point${selected ? " on" : ""}`}><circle cx={cx} cy={cy} r={r} fill="#fff" stroke={stroke} strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r - 2.5} fill={fill} /><Icon x={cx - r * 0.55} y={cy - r * 0.55} width={r * 1.1} height={r * 1.1} color={stroke} strokeWidth={2} />
      {detail && <text x={cx} y={cy + r + 9} textAnchor="middle" className="vp-sub">{e.label}</text>}</g>;
  }
  if (def.kind === "seating" && e.seating) {
    const s = e.seating, seats = blockSeats(s), r = s.pitch * 0.36;
    return <g className={`vp-block${selected ? " on" : ""}`} transform={frame(e)}>
      <rect x={x} y={y} width={w} height={h} rx={3} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={detail ? "4 3" : undefined} opacity={detail ? 0.55 : 1} />
      {detail ? seats.map(st => { const flag = e.seatFlags?.[st.key], state = seatState?.(st.key), sel = selectedSeats?.has(st.key), tc = tierColor?.(e.seatTiers?.[st.key] ?? e.tier);
        return <circle key={st.key} cx={x + st.x} cy={y + st.y} r={r} className={`vp-seat${sel ? " sel" : ""}${onSeat ? " hit" : ""}`}
          fill={state ? STATE_FILL[state] : flag ? FLAG_FILL[flag] : "#fff"} stroke={sel ? "#1a1af2" : tc ?? stroke} strokeWidth={sel ? 1.6 : 0.9}
          onPointerDown={onSeat ? ev => { ev.stopPropagation(); onSeat(st.key, ev); } : undefined}><title>{st.label}</title></circle>; })
        : <><Icon x={x + w / 2 - iconS / 2} y={y + h / 2 - iconS * 0.95} width={iconS} height={iconS} color={stroke} strokeWidth={1.8} />
          <text x={x + w / 2} y={y + h / 2 + iconS * 0.55} textAnchor="middle" className="vp-label" style={{ fontSize: Math.min(13, w / 9) * scale }}>{e.label}</text>
          <text x={x + w / 2} y={y + h / 2 + iconS * 0.55 + Math.min(11, w / 11) * scale + 2} textAnchor="middle" className="vp-sub" style={{ fontSize: Math.min(10, w / 12) * scale }}>{s.rows} × {s.cols} · {s.rows * s.cols} seats</text></>}
      {detail && Array.from(new Set(seats.map(st => st.row))).map((row, i) => { const st = seats.find(q => q.row === row)!; return <text key={row + i} x={x - 3} y={y + st.y + 1.6} textAnchor="end" className="vp-row">{row}</text>; })}
    </g>;
  }
  if (def.kind === "table" && e.table) {
    const t = e.table, seats = tableSeats(t), cr = 2;
    return <g className={`vp-table${selected ? " on" : ""}`} transform={frame(e)}>
      {seats.map(st => { const flag = e.seatFlags?.[st.key], state = seatState?.(st.key), sel = selectedSeats?.has(st.key);
        return <circle key={st.key} cx={x + st.x} cy={y + st.y} r={cr} className={`vp-seat${sel ? " sel" : ""}${onSeat ? " hit" : ""}`} fill={state ? STATE_FILL[state] : flag ? FLAG_FILL[flag] : "#fff"}
          stroke={sel ? "#1a1af2" : stroke} strokeWidth={sel ? 1.4 : 0.9} onPointerDown={onSeat ? ev => { ev.stopPropagation(); onSeat(st.key, ev); } : undefined}><title>{st.label}</title></circle>; })}
      {t.shape === "round" ? <circle cx={x + w / 2} cy={y + h / 2} r={w / 2 - 5} fill={fill} stroke={stroke} strokeWidth={sw} />
        : <rect x={x + 3} y={y + 4.6} width={w - 6} height={h - 9.2} rx={1.5} fill={fill} stroke={stroke} strokeWidth={sw} />}
      <text x={x + w / 2} y={y + h / 2 + 2.4} textAnchor="middle" className="vp-tnum" style={{ fontSize: Math.min(7, (w - 8) / Math.max(2, t.number.length) * 1.1) }}>{t.number}</text>
    </g>;
  }
  // area
  const pat = def.pattern ? `url(#vp-${def.pattern})` : undefined;
  return <g className={`vp-area${selected ? " on" : ""}`} transform={frame(e)}>
    {e.points ? <polygon points={e.points.map(p => p.join(",")).join(" ")} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      : <rect x={x} y={y} width={w} height={h} rx={Math.min(6, w / 8, h / 8)} fill={def.key === "stage" || def.key === "dj_booth" || def.key === "catwalk" ? def.fill : fill} stroke={stroke} strokeWidth={sw} />}
    {pat && !e.points && <rect x={x} y={y} width={w} height={h} rx={Math.min(6, w / 8, h / 8)} fill={pat} pointerEvents="none" />}
    {h > iconS * 1.6 && w > iconS * 1.2 && <Icon x={x + w / 2 - iconS / 2} y={y + h / 2 - iconS * (h > iconS * 2.6 ? 0.85 : 0.5)} width={iconS} height={iconS} color={def.key === "stage" || def.key === "dj_booth" || def.key === "catwalk" ? "#fff" : stroke} strokeWidth={1.8} />}
    {(h > iconS * 2.6 || h <= iconS * 1.6) && <g fill={def.key === "stage" || def.key === "dj_booth" || def.key === "catwalk" ? "#fff" : undefined}>{label}</g>}
    {def.capacity && e.capacity ? <text x={x + w / 2} y={y + h - 4} textAnchor="middle" className="vp-sub">{e.capacity.toLocaleString("en-GB")} cap.</text> : null}
  </g>;
}

export function PlanDefs() {
  return <>
    <pattern id="vp-grass" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M2 8l1-3M6 9l1-3M8 4l1-3" stroke="#7cb85b" strokeWidth=".8" opacity=".55" /></pattern>
    <pattern id="vp-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v8" stroke="#4a5277" strokeWidth="1" opacity=".25" /></pattern>
    <pattern id="vp-check" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#e0398b" opacity=".12" /><rect x="6" y="6" width="6" height="6" fill="#e0398b" opacity=".12" /></pattern>
    <pattern id="vp-bays" width="25" height="50" patternUnits="userSpaceOnUse"><path d="M0 0v20M0 30v20" stroke="#fff" strokeWidth="1.4" /></pattern>
    <pattern id="vp-water" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M0 7q3.5-4 7 0t7 0" fill="none" stroke="#5aa5e6" strokeWidth="1.1" /></pattern>
    <marker id="vp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0l10 5-10 5z" fill="#2f6bff" /></marker>
  </>;
}

/** Default size (map units, 10 per metre) for a new asset. */
export function assetDefaults(key: string): Partial<AssetEl> & { w: number; h: number } {
  const d = ASSET[key];
  if (d.kind === "seating") { const s = { ...DEFAULT_SEATING_FOR(key) }; return { seating: s, ...seatingSize(s) }; }
  if (d.kind === "table") { const t = { shape: key === "banquet_table" || key === "vip_booth" ? "rect" as const : "round" as const, seats: key === "banquet_table" ? 12 : key === "cocktail_table" ? 4 : key === "vip_booth" ? 6 : 10, number: "1", seatStyle: "numeric" as const }; return { table: t, ...tableSize(t) }; }
  if (d.kind === "point") return { w: 22, h: 22 };
  return { w: (d.w ?? 4) * 10, h: (d.h ?? 3) * 10, ...(d.capacity ? { capacity: Math.round((d.w ?? 4) * (d.h ?? 3) * (key.includes("parking") || key === "car_park" ? 0.04 : key === "camping" ? 0.1 : 2)) } : {}) };
}
const DEFAULT_SEATING_FOR = (key: string): Seating => ({ rows: key === "tiered_stand" ? 12 : 8, cols: key === "tiered_stand" ? 20 : 12, rowStyle: "alpha", colStyle: "numeric", rowStart: 1, colStart: 1, skipIO: true,
  rowDir: "front", colDir: "ltr", aisles: [], pitch: 5, prefix: key === "tiered_stand" ? "Stand" : "A", tiered: key === "tiered_stand" });
