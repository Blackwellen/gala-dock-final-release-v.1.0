import type { PointerEvent as RPE } from "react";
import { Accessibility } from "lucide-react";
import { ASSET, blockLayout, tableSeats, seatingSize, tableSize, type AssetDef, type Seating, type Seat, type TableSpec } from "./assets";
import { areaArt, pointArt, lineArt, Ic, clamp, type Box } from "./symbols";

export type SeatFlag = "blocked" | "accessible" | "restricted" | "companion";
export type AssetEl = { asset?: string; x?: number; y?: number; w?: number; h?: number; rot?: number; points?: number[][]; label: string; seating?: Seating; table?: TableSpec; capacity?: number;
  tier?: string | null; color?: string; seatFlags?: Record<string, SeatFlag>; seatTiers?: Record<string, string> };
export type SeatState = "available" | "held" | "sold" | "blocked" | "selected" | "mine";
const FLAG_FILL: Record<SeatFlag, string> = { blocked: "#c3c8d8", accessible: "#e0f2fe", restricted: "#fff0d9", companion: "#dcf6f7" };
const STATE_FILL: Record<SeatState, string> = { available: "#fff", held: "#e3e6ef", sold: "#d5d9e5", blocked: "#e3e6ef", selected: "#1a1af2", mine: "#16a46c" };
const STATE_BACK: Partial<Record<SeatState, string>> = { held: "#c9cede", sold: "#b9bfd1", blocked: "#c9cede", selected: "#0f0fa8", mine: "#0d7f52" };

/** Rotated frame for an asset's local coordinates. */
export const frame = (e: AssetEl) => { const w = e.w ?? 0, h = e.h ?? 0; return e.rot ? `rotate(${e.rot} ${(e.x ?? 0) + w / 2} ${(e.y ?? 0) + h / 2})` : undefined; };

type Props = {
  e: AssetEl; selected?: boolean; detail?: boolean; tierColor?: (tier?: string | null) => string | undefined; seatState?: (key: string) => SeatState | undefined;
  selectedSeats?: Set<string>; onSeat?: (key: string, ev: RPE<SVGCircleElement>) => void; scale?: number;
  /** Set by the map when this point label would collide with another (see pointLabelHidden). */ hideLabel?: boolean;
};

/**
 * Renders one plan asset as a top-down plan symbol (area, point, seating block, table, or line). `detail` draws individual seats; `seatState` colours seats
 * for ticketing (available seats take their tier colour); `onSeat` makes seats clickable. `scale` is world units per screen pixel ÷ 1 (labels stay legible).
 */
export function AssetShape({ e, selected, detail, tierColor, seatState, selectedSeats, onSeat, scale = 1, hideLabel = false }: Props) {
  const def = ASSET[e.asset ?? ""]; if (!def) return null;
  const x = e.x ?? 0, y = e.y ?? 0, w = e.w ?? 0, h = e.h ?? 0, k = scale;
  const tint = tierColor?.(e.tier) ?? e.color, stroke = tint ?? def.stroke, fill = tint ? `${tint}22` : def.fill;
  const sw = selected ? 1.6 : 0.9;

  if (def.kind === "line" && e.points) {
    const pts = e.points.map(p => p.join(",")).join(" ");
    return <g className={`vp-line${selected ? " on" : ""}`}><polyline points={pts} fill="none" stroke="transparent" strokeWidth={14} />{lineArt(def.key, pts, stroke, !!selected)}
      {detail && e.points.length > 1 && <LineLabel pts={e.points} text={e.label} k={k} color={stroke} />}</g>;
  }
  if (def.kind === "point") {
    const r = Math.max(w, h, 18) / 2, cx = x + w / 2, cy = y + h / 2, show = !hideLabel && (selected || r / k >= 15 || (detail && r / k >= 10));
    return <g className={`vp-point${selected ? " on" : ""}`}><title>{e.label}</title>{selected && <circle cx={cx} cy={cy} r={r + 2.5} fill="#1a1af214" stroke="#1a1af2" strokeWidth={0.6} />}
      {pointArt(def.key, cx, cy, r, fill, stroke, sw, def.icon, e.rot ?? 0)}
      {show && <OutLabel cx={cx} cy={cy + r + (def.key === "train" ? r * 0.8 : 0)} text={e.label} k={k} />}</g>;
  }
  if (def.kind === "seating" && e.seating) return <SeatBlock {...{ e, def, x, y, fill, stroke, sw, selected, detail, k, tierColor, seatState, selectedSeats, onSeat }} />;
  if (def.kind === "table" && e.table) return <TableShape {...{ e, def, x, y, w, h, fill, stroke, sw, selected, detail, k, tierColor, seatState, selectedSeats, onSeat }} />;

  // area
  if (e.points?.length) {
    const xs = e.points.map(p => p[0]), ys = e.points.map(p => p[1]), b = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    const pat = def.pattern === "bays" ? "vp-asphalt" : def.pattern ? `vp-${def.pattern}` : null, pts = e.points.map(p => p.join(",")).join(" ");
    return <g className={`vp-area${selected ? " on" : ""}`}><polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      {pat && <polygon points={pts} fill={`url(#${pat})`} pointerEvents="none" />}
      <AreaTag def={def} e={e} free={b} center={[b.x + b.w / 2, b.y + b.h / 2]} rot={0} k={k} dark={false} detail={!!detail} /></g>;
  }
  const art = areaArt(def.key, { x, y, w, h, fill, stroke, sw, tinted: !!tint, detail: !!detail });
  return <g className={`vp-area${selected ? " on" : ""}`}>
    <g transform={frame(e)}>{art.body}</g>
    <AreaTag def={def} e={e} free={art.free ?? { x, y, w, h }} center={[x + w / 2, y + h / 2]} rot={e.rot ?? 0} k={k} dark={!!art.dark} noIcon={art.noIcon} detail={!!detail} />
  </g>;
}

/** Centred emblem + label chip inside an area (kept upright under rotation), or a label beneath when the area is too small on screen. */
function AreaTag({ def, e, free, center, rot, k, dark, noIcon, detail }: { def: AssetDef; e: AssetEl; free: Box; center: number[]; rot: number; k: number; dark: boolean; noIcon?: boolean; detail: boolean }) {
  const r = ((rot % 360) + 360) % 360, side = (r > 45 && r < 135) || (r > 225 && r < 315);
  const fw = side ? free.h : free.w, fh = side ? free.w : free.h;
  let fcx = free.x + free.w / 2, fcy = free.y + free.h / 2;
  if (r) { const a = (r * Math.PI) / 180, dx = fcx - center[0], dy = fcy - center[1]; fcx = center[0] + dx * Math.cos(a) - dy * Math.sin(a); fcy = center[1] + dx * Math.sin(a) + dy * Math.cos(a); }
  const text = e.label || def.label, cap = def.capacity && e.capacity ? `${e.capacity.toLocaleString("en-GB")} ${def.key.includes("parking") || def.key === "car_park" ? "spaces" : "cap."}` : null;
  const fs = Math.min(10.5 * k, (fw * 0.9) / (text.length * 0.6 + 1.6)), inside = fs >= 7 * k && fh >= fs * 1.9;
  const s = Math.min(Math.min(fw, fh) * 0.42, 22 * k), chipH = fs * 1.7, capFs = fs * 0.82;
  const showIcon = !noIcon && s >= 9 * k && fh >= s + (inside ? chipH + fs * 0.4 : 0) + 2;
  const showCap = !!cap && inside && fh >= (showIcon ? s + fs * 0.4 : 0) + chipH + capFs * 1.6;
  if (!inside) {
    const a = (r * Math.PI) / 180, bh = Math.abs(Math.sin(a)) * (e.w ?? 0) + Math.abs(Math.cos(a)) * (e.h ?? 0), bw = Math.abs(Math.cos(a)) * (e.w ?? 0) + Math.abs(Math.sin(a)) * (e.h ?? 0);
    if (Math.max(bw, bh) / k < 22 && !detail) return null;
    return <>{showIcon && <Ic I={def.icon} cx={fcx} cy={fcy} s={s} color={dark ? "#fff" : (e.color ?? def.stroke)} />}<OutLabel cx={center[0]} cy={center[1] + bh / 2} text={text} k={k} /></>;
  }
  const total = (showIcon ? s + fs * 0.4 : 0) + chipH + (showCap ? capFs * 1.5 : 0);
  let cy = fcy - total / 2;
  const icon = showIcon ? <Ic I={def.icon} cx={fcx} cy={cy + s / 2} s={s} color={dark ? "#fff" : (e.color ?? def.stroke)} /> : null;
  if (showIcon) cy += s + fs * 0.4;
  const cw = text.length * fs * 0.6 + fs * 1.3;
  return <g className="vp-tag" pointerEvents="none">{icon}
    <rect x={fcx - cw / 2} y={cy} width={cw} height={chipH} rx={chipH / 2} className={dark ? "vp-chip dark" : "vp-chip"} style={{ strokeWidth: fs * 0.07 }} />
    <text x={fcx} y={cy + chipH / 2} dy="0.35em" textAnchor="middle" className={dark ? "vp-chip-t dark" : "vp-chip-t"} style={{ fontSize: fs }}>{text}</text>
    {showCap && <text x={fcx} y={cy + chipH + capFs * 0.95} dy="0.35em" textAnchor="middle" className={dark ? "vp-cap dark" : "vp-cap"} style={{ fontSize: capFs }}>{cap}</text>}</g>;
}
function OutLabel({ cx, cy, text, k }: { cx: number; cy: number; text: string; k: number }) {
  const fs = 9.5 * k;
  return <text x={cx} y={cy + fs * 1.2} textAnchor="middle" className="vp-out" style={{ fontSize: fs }}>{text}</text>;
}
function LineLabel({ pts, text, k, color }: { pts: number[][]; text: string; k: number; color: string }) {
  let best = 0, bi = 0; for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (d > best) { best = d; bi = i; } }
  const a = pts[bi], b = pts[bi + 1], fs = 9 * k; if (best < text.length * fs * 0.6 + 10 * k) return null;
  let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  return <text x={mx} y={my} dy={-fs * 0.9} textAnchor="middle" transform={`rotate(${ang} ${mx} ${my})`} className="vp-out" style={{ fontSize: fs, fill: color }}>{text}</text>;
}

type SeatCtx = { e: AssetEl; def: AssetDef; x: number; y: number; fill: string; stroke: string; sw: number; selected?: boolean; detail?: boolean; k: number;
  tierColor?: Props["tierColor"]; seatState?: Props["seatState"]; selectedSeats?: Set<string>; onSeat?: Props["onSeat"] };

/** Visual state for one seat: cushion + backrest colours and accessibility marker. */
function seatLook(c: SeatCtx, key: string) {
  const flag = c.e.seatFlags?.[key], state = c.seatState?.(key), sel = !!c.selectedSeats?.has(key), tc = c.tierColor?.(c.e.seatTiers?.[key] ?? c.e.tier);
  const line = tc ?? c.stroke;
  let cush = "#fff", back = line;
  if (state === "available" || (!state && !flag)) { cush = state === "available" && tc ? tc : "#fff"; back = line; }
  if (!state && flag) { cush = FLAG_FILL[flag]; back = flag === "blocked" ? "#9aa1bd" : line; }
  if (state && state !== "available") { cush = STATE_FILL[state]; back = STATE_BACK[state] ?? line; }
  if (sel) { cush = "#1a1af2"; back = "#0f0fa8"; }
  const tick = sel || state === "selected" || state === "mine";
  const access = flag === "accessible" || flag === "companion";
  return { cush, back, edge: sel ? "#1a1af2" : state && state !== "available" ? "#fff" : state === "available" && tc ? "#fff" : line, tick, access, flag, title: !state };
}

function SeatBlock(c: SeatCtx) {
  const { e, x, y, fill, stroke, sw, detail, k, onSeat } = c, s = e.seating!, L = blockLayout(s), p = s.pitch, rot = e.rot ?? 0;
  const w = e.w ?? L.w, h = e.h ?? L.h;
  const outline = L.outline.map(([ox, oy]) => `${x + ox},${y + oy}`).join(" ");
  const rowPts = (idx: number[]) => { const segs: number[][][] = [[]]; idx.forEach((si, j) => { const q = L.seats[si]; if (j && s.aisles.includes(q.ci ?? -1)) segs.push([]); segs[segs.length - 1].push([x + q.x, y + q.y]); }); return segs; };
  const bands = s.tiered ? L.rows.map((idx, r) => r % 2 ? null : rowPts(idx).map((seg, j) => <polyline key={`t${r}-${j}`} points={seg.map(q => q.join(",")).join(" ")} fill="none" stroke={stroke} strokeOpacity={0.09} strokeWidth={L.rowH * 0.98} strokeLinecap="butt" />)) : null;
  const n = L.seats.length, tf = frame({ ...e, w, h });
  if (!detail) {
    return <g className={`vp-block${c.selected ? " on" : ""}`}>
      <g transform={tf}><polygon points={outline} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />{bands}
        {L.rows.map((idx, r) => rowPts(idx).map((seg, j) => <polyline key={`${r}-${j}`} points={seg.map(q => q.join(",")).join(" ")} fill="none" stroke={stroke} strokeOpacity={0.5} strokeWidth={p * 0.52} strokeLinecap="round" strokeLinejoin="round" />))}</g>
      <BlockTag cx={x + w / 2} cy={y + h / 2} w={w} h={h} rot={rot} name={e.label} sub={`${n.toLocaleString("en-GB")} seats`} k={k} />
    </g>;
  }
  const r = p * 0.34;
  const lab = (q: Seat, o: Seat | undefined, txt: string, key: string) => {
    let dx = -1, dy = 0; if (o) { const d = Math.hypot(q.x - o.x, q.y - o.y) || 1; dx = (q.x - o.x) / d; dy = (q.y - o.y) / d; }
    const lx = x + q.x + dx * p * 0.95, ly = y + q.y + dy * p * 0.95;
    return <text key={key} x={lx} y={ly} dy="0.35em" textAnchor="middle" className="vp-row" style={{ fontSize: p * 0.5 }} transform={rot ? `rotate(${-rot} ${lx} ${ly})` : undefined}>{txt}</text>;
  };
  const back = L.rows[L.rows.length - 1], bq = back.map(i => L.seats[i]), bcx = bq.reduce((a, q) => a + q.x, 0) / bq.length, bcy = Math.max(...bq.map(q => q.y));
  return <g className={`vp-block${c.selected ? " on" : ""}`} transform={tf}>
    <polygon points={outline} fill={fill} fillOpacity={0.55} stroke={stroke} strokeOpacity={c.seatState ? 0.35 : 0.7} strokeWidth={0.5} strokeDasharray="2.5 1.5" strokeLinejoin="round" />{bands}
    {L.aisles.map(([x1, y1, x2, y2], i) => <line key={`a${i}`} x1={x + x1} y1={y + y1} x2={x + x2} y2={y + y2} stroke={stroke} strokeOpacity={0.35} strokeWidth={0.4} strokeDasharray="1.2 1.2" />)}
    {L.seats.map(q => <SeatGlyph key={q.key} c={c} q={q} ox={x} oy={y} r={r} chair={false} onSeat={onSeat} />)}
    {L.rows.map((idx, ri) => { const f = L.seats[idx[0]], l = L.seats[idx[idx.length - 1]]; return <g key={`rl${ri}`}>{lab(f, L.seats[idx[1]], f.row, "s")}{lab(l, L.seats[idx[idx.length - 2]], l.row, "e")}</g>; })}
    <text x={x + bcx} y={y + bcy + p * 1.25} dy="0.35em" textAnchor="middle" className="vp-section" style={{ fontSize: p * 0.78 }} transform={rot ? `rotate(${-rot} ${x + bcx} ${y + bcy + p * 1.25})` : undefined}>{e.label.toUpperCase()}</text>
  </g>;
}

/** A seat (theatre chair: cushion + backrest) or table chair (rounded seat + back). The circle is the hit target and carries `data-seat`. */
function SeatGlyph({ c, q, ox, oy, r, chair, onSeat, spot }: { c: SeatCtx; q: Seat; ox: number; oy: number; r: number; chair: boolean; onSeat?: Props["onSeat"]; spot?: boolean }) {
  const L = seatLook(c, q.key), cx = ox + q.x, cy = oy + q.y, a = q.ang ?? 0;
  const down = onSeat ? (ev: RPE<SVGCircleElement>) => { ev.stopPropagation(); onSeat(q.key, ev); } : undefined;
  const t = `translate(${cx} ${cy})${a ? ` rotate(${a})` : ""}`;
  const title = L.title ? <title>{q.label}</title> : null;
  if (spot) return <g className={`vp-seat-g${onSeat ? " hit" : ""}`}>
    <circle cx={cx} cy={cy} r={r} className="vp-seat vp-cush" fill={L.cush} fillOpacity={L.cush === "#fff" ? 0.9 : 1} stroke={L.edge === "#fff" ? L.back : L.edge} strokeWidth={0.45} strokeDasharray={L.cush === "#fff" ? "0.8 0.6" : undefined} data-seat={q.key} onPointerDown={down}>{title}</circle>
    {L.tick && <path d={`M${cx - r * 0.45} ${cy} l${r * 0.32} ${r * 0.34} l${r * 0.6} ${-r * 0.66}`} stroke="#fff" strokeWidth={r * 0.28} fill="none" strokeLinecap="round" pointerEvents="none" />}</g>;
  return <g className={`vp-seat-g${onSeat ? " hit" : ""}${L.access ? " acc" : ""}`}>
    <g transform={t} pointerEvents="none">
      {chair ? <><rect x={-r} y={-r * 0.95} width={r * 2} height={r * 1.75} rx={r * 0.45} className="vp-cush" fill={L.cush} stroke={L.edge} strokeWidth={0.32} />
        <rect x={-r * 1.06} y={r * 0.62} width={r * 2.12} height={r * 0.62} rx={r * 0.3} fill={L.back} /></>
        : <rect x={-r * 0.98} y={r * 0.68} width={r * 1.96} height={r * 0.6} rx={r * 0.3} fill={L.back} />}
      {L.tick && <path d={`M${-r * 0.45} ${-r * 0.1} l${r * 0.32} ${r * 0.34} l${r * 0.6} ${-r * 0.66}`} stroke="#fff" strokeWidth={r * 0.26} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
    </g>
    <circle cx={cx} cy={cy} r={chair ? r * 1.15 : r * 0.86} className="vp-seat" data-seat={q.key} fill={chair ? "transparent" : L.cush} stroke={chair ? "none" : L.edge} strokeWidth={0.38} onPointerDown={down}>{title}</circle>
    {!chair && L.tick && <path d={`M${cx - r * 0.45} ${cy} l${r * 0.32} ${r * 0.34} l${r * 0.6} ${-r * 0.66}`} stroke="#fff" strokeWidth={r * 0.26} fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />}
    {L.access && <circle cx={cx} cy={cy} r={r * 1.32} fill="none" stroke="#0284c7" strokeWidth={0.4} pointerEvents="none" />}
    {L.access && L.flag === "accessible" && r / c.k >= 5 && <Ic I={Accessibility} cx={cx} cy={cy} s={r * 1.3} color={L.tick ? "#fff" : "#0369a1"} sw={2.4} />}
  </g>;
}

/** Name + seat-count chip centred on a block, kept upright. */
function BlockTag({ cx, cy, w, h, rot, name, sub, k }: { cx: number; cy: number; w: number; h: number; rot: number; name: string; sub: string; k: number }) {
  const r = ((rot % 360) + 360) % 360, side = (r > 45 && r < 135) || (r > 225 && r < 315), fw = side ? h : w, fh = side ? w : h;
  const fs = Math.min(10.5 * k, (fw * 0.88) / (Math.max(name.length, sub.length * 0.85) * 0.6 + 1.6));
  if (fs < 6 * k || fh < fs * 3.4) return Math.max(w, h) / k >= 22 ? <OutLabel cx={cx} cy={cy + (side ? w : h) / 2} text={name} k={k} /> : null;
  const cw = Math.max(name.length, sub.length * 0.85) * fs * 0.6 + fs * 1.6, ch = fs * 3.1;
  return <g className="vp-tag" pointerEvents="none"><rect x={cx - cw / 2} y={cy - ch / 2} width={cw} height={ch} rx={fs * 0.7} className="vp-chip" style={{ strokeWidth: fs * 0.07 }} />
    <text x={cx} y={cy - fs * 0.45} dy="0.35em" textAnchor="middle" className="vp-chip-t" style={{ fontSize: fs }}>{name}</text>
    <text x={cx} y={cy + fs * 0.75} dy="0.35em" textAnchor="middle" className="vp-cap" style={{ fontSize: fs * 0.82 }}>{sub}</text></g>;
}

function TableShape(c: SeatCtx & { w: number; h: number }) {
  const { e, def, x, y, w, h, stroke, sw, detail, k, onSeat } = c, t = e.table!, seats = tableSeats(t), key = def.key, rot = e.rot ?? 0;
  const tint = c.tierColor?.(e.tier) ?? e.color, cloth = tint ? `${tint}1f` : "#fff";
  const cocktail = key === "cocktail_table", booth = key === "vip_booth";
  const cx = x + w / 2, cy = y + h / 2;
  const R = t.shape === "round" ? (cocktail ? w / 2 - 7 : w / 2 - 5) : 0;
  const badgeR = clamp((t.shape === "round" ? R : (h - 9.2) / 2) * 0.62, 2, 4.4), label = t.number, long = label.length > 2;
  const bw = long ? Math.max(badgeR * 2, label.length * badgeR * 0.78 + badgeR) : badgeR * 2;
  const plates = detail && !cocktail ? seats.map(q => {
    if (t.shape === "round") { const a = Math.atan2(q.y - h / 2, q.x - w / 2); return [cx + Math.cos(a) * (R - 1.7), cy + Math.sin(a) * (R - 1.7)]; }
    return [x + q.x, q.y < h / 2 ? y + 4.6 + 1.6 : y + h - 4.6 - 1.6];
  }) : [];
  return <g className={`vp-table${c.selected ? " on" : ""}`} transform={frame(e)}>
    {booth && <path d={`M${x + 0.5} ${y} H${x + w - 0.5} V${y + 4.4} H${x + 3.6} V${y + h - 4.4} H${x + w - 0.5} V${y + h} H${x + 0.5} Z`} fill={tint ?? def.fill} stroke={stroke} strokeWidth={0.6} strokeLinejoin="round" />}
    {t.shape === "round" ? <><circle cx={cx + 0.5} cy={cy + 0.7} r={R} fill="#0d0d63" opacity={0.07} /><circle cx={cx} cy={cy} r={R} fill={cloth} stroke={stroke} strokeWidth={sw} />
      {!cocktail && R > 6 && <circle cx={cx} cy={cy} r={R - 1.1} fill="none" stroke={stroke} strokeOpacity={0.22} strokeWidth={0.35} />}</>
      : <><rect x={x + 3.5} y={y + 5.3} width={w - 6} height={h - 9.2} rx={1.5} fill="#0d0d63" opacity={0.07} /><rect x={x + 3} y={y + 4.6} width={w - 6} height={h - 9.2} rx={1.5} fill={cloth} stroke={stroke} strokeWidth={sw} /></>}
    {plates.map(([px, py], i) => <circle key={`p${i}`} cx={px} cy={py} r={1} fill="#fff" stroke="#c9cede" strokeWidth={0.3} />)}
    {seats.map(q => <SeatGlyph key={q.key} c={c} q={q} ox={x} oy={y} r={cocktail ? 1.5 : booth ? 1.6 : 1.55} chair={!cocktail} spot={cocktail} onSeat={onSeat} />)}
    <g transform={rot ? `rotate(${-rot} ${cx} ${cy})` : undefined} pointerEvents="none">
      <rect x={cx - bw / 2} y={cy - badgeR} width={bw} height={badgeR * 2} rx={badgeR} fill={stroke} />
      <text x={cx} y={cy} dy="0.36em" textAnchor="middle" className="vp-tnum" style={{ fontSize: badgeR * (long ? 0.95 : label.length > 1 ? 1.05 : 1.25) }}>{label}</text>
      {detail && k < 0.5 && <text x={cx} y={cy + (t.shape === "round" ? w / 2 : h / 2) + 3.2} dy="0.35em" textAnchor="middle" className="vp-row" style={{ fontSize: 1.8 }}>{t.seats} {cocktail ? "standing" : "seats"}</text>}
    </g>
  </g>;
}

export function PlanDefs() {
  const arrow = (id: string, col: string) => <marker id={`vp-arrow${id}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="2.6" markerHeight="2.6" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0 0l10 5-10 5z" fill={col} /></marker>;
  return <>
    <pattern id="vp-grass" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M2 9l.8-2.6M3.4 9.2l-.4-2.4M7.5 4l.8-2.6M8.9 4.2l-.4-2.4" stroke="#5f9f43" strokeWidth=".55" strokeLinecap="round" opacity=".55" /></pattern>
    <pattern id="vp-mottle" width="60" height="60" patternUnits="userSpaceOnUse"><circle cx="14" cy="18" r="11" fill="#cfe9c2" opacity=".55" /><circle cx="44" cy="40" r="14" fill="#d6edcb" opacity=".5" /><circle cx="48" cy="10" r="6" fill="#c4e2b4" opacity=".45" /></pattern>
    <pattern id="vp-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v6" stroke="#4a5277" strokeWidth=".7" opacity=".28" /></pattern>
    <pattern id="vp-hatch-blue" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v3" stroke="#fff" strokeWidth="1" /></pattern>
    <pattern id="vp-check" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#e0398b" opacity=".16" /><rect x="8" y="8" width="8" height="8" fill="#e0398b" opacity=".16" /><rect x="8" width="8" height="8" fill="#7c4dff" opacity=".05" /></pattern>
    <pattern id="vp-crowd" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2.5" r=".7" fill="#2f6bff" opacity=".22" /><circle cx="6.5" cy="7" r=".7" fill="#2f6bff" opacity=".22" /><circle cx="7" cy="2" r=".5" fill="#2f6bff" opacity=".14" /></pattern>
    <pattern id="vp-carpet" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 5h10M5 0v10" stroke="#7c4dff" strokeWidth=".3" opacity=".12" /></pattern>
    <pattern id="vp-deck" width="40" height="5" patternUnits="userSpaceOnUse"><path d="M0 5h40M20 0v5" stroke="#ffffff" strokeWidth=".3" opacity=".09" /></pattern>
    <pattern id="vp-led" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#1b2350" /><circle cx="1" cy="1" r=".45" fill="#6b8cff" opacity=".7" /></pattern>
    <pattern id="vp-tile" width="2.5" height="2.5" patternUnits="userSpaceOnUse"><path d="M2.5 0H0V2.5" fill="none" stroke="#0e9aa7" strokeWidth=".15" opacity=".5" /></pattern>
    <pattern id="vp-paving" width="16" height="8" patternUnits="userSpaceOnUse"><path d="M0 0h16M0 4h16M4 0v4M12 4v4" stroke="#a0782c" strokeWidth=".35" opacity=".28" /></pattern>
    <pattern id="vp-asphalt" width="25" height="50" patternUnits="userSpaceOnUse"><path d="M0 0v20M0 30v20" stroke="#fff" strokeWidth="1.2" /></pattern>
    <pattern id="vp-bays" width="25" height="50" patternUnits="userSpaceOnUse"><path d="M0 0v20M0 30v20" stroke="#fff" strokeWidth="1.4" /></pattern>
    <pattern id="vp-water" width="16" height="10" patternUnits="userSpaceOnUse"><path d="M0 5q4-3.2 8 0t8 0" fill="none" stroke="#5aa5e6" strokeWidth=".7" opacity=".7" /></pattern>
    {arrow("", "#2f6bff")}{arrow("-b", "#2f6bff")}{arrow("-g", "#16a46c")}{arrow("-r", "#e5384f")}{arrow("-a", "#e08a00")}{arrow("-s", "#ffffff")}
  </>;
}

/** Default size (map units, 10 per metre) for a new asset. */
export function assetDefaults(key: string): Partial<AssetEl> & { w: number; h: number } {
  const d = ASSET[key];
  if (d.kind === "seating") { const s = { ...DEFAULT_SEATING_FOR(key) }; return { seating: s, ...seatingSize(s) }; }
  if (d.kind === "table") { const t = { shape: key === "banquet_table" || key === "vip_booth" ? "rect" as const : "round" as const, seats: key === "banquet_table" ? 12 : key === "cocktail_table" ? 4 : key === "vip_booth" ? 6 : 10, number: "1", seatStyle: "numeric" as const }; return { table: t, ...tableSize(t) }; }
  if (d.kind === "point") return key === "tree" ? { w: 50, h: 50 } : { w: 22, h: 22 };
  return { w: (d.w ?? 4) * 10, h: (d.h ?? 3) * 10, ...(d.capacity ? { capacity: Math.round((d.w ?? 4) * (d.h ?? 3) * (key.includes("parking") || key === "car_park" ? 0.04 : key === "camping" ? 0.1 : 2)) } : {}) };
}
const DEFAULT_SEATING_FOR = (key: string): Seating => ({ rows: key === "tiered_stand" ? 12 : 8, cols: key === "tiered_stand" ? 20 : 12, rowStyle: "alpha", colStyle: "numeric", rowStart: 1, colStart: 1, skipIO: true,
  rowDir: "front", colDir: "ltr", aisles: [], pitch: 5, prefix: key === "tiered_stand" ? "Stand" : "A", tiered: key === "tiered_stand" });


/**
 * Greedy label placement for point assets at the current zoom: returns indices whose labels would overlap an already-placed label
 * (selected items are placed first so they always keep theirs). Boxes are in world units; k = world units per screen pixel.
 */
export function pointLabelHidden(els: { type: string; asset?: string; x?: number; y?: number; w?: number; h?: number; label: string; hidden?: boolean }[], k: number, selected: Set<number> = new Set()) {
  const placed: [number, number, number, number][] = [], hide = new Set<number>(), fs = 9.5 * k;
  // Room names (+ capacity pill) are fixed obstacles: point labels yield to them.
  for (const e of els) if (e.type === "room" && !e.hidden && e.w && e.h) { const rf = Math.min(13 * k, (e.w - 12) / (Math.max(1, e.label.length) * 0.56)), cx = (e.x ?? 0) + e.w / 2, cy = (e.y ?? 0) + e.h / 2, bw = e.label.length * rf * 0.6;
    placed.push([cx - bw / 2, cy - 4 * k - rf, cx + bw / 2, cy + 22 * k]); }
  const order = els.map((_, i) => i).filter(i => els[i].type === "asset" && !els[i].hidden && ASSET[els[i].asset ?? ""]?.kind === "point").sort((a, b) => Number(selected.has(b)) - Number(selected.has(a)));
  for (const i of order) {
    const e = els[i], r = Math.max(e.w ?? 0, e.h ?? 0, 18) / 2, cx = (e.x ?? 0) + (e.w ?? 0) / 2, top = (e.y ?? 0) + (e.h ?? 0) / 2 + r + fs * 0.2;
    // 650-weight glyphs average ~0.6em; the 3px white halo (.vp-out stroke) adds ~3px per side on screen.
    const bw = e.label.length * fs * 0.6 + 8 * k, box: [number, number, number, number] = [cx - bw / 2, top, cx + bw / 2, top + fs * 1.3];
    if (placed.some(p => box[0] < p[2] && p[0] < box[2] && box[1] < p[3] && p[1] < box[3])) hide.add(i); else placed.push(box);
  }
  return hide;
}
