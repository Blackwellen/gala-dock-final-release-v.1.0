"use client";
import "@/styles/venue-plan.css";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from "react";
import { ZoomIn, ZoomOut, Scan, X, Accessibility } from "lucide-react";
import { MapContent, MapDefs, elBounds, type MapEl } from "@/app/provider/venues/_components/venue-map";
import { ASSET, blockSeats, tableSeats } from "./assets";
import type { SeatFlag, SeatState } from "./asset-shape";

export type PickerSeat = { key: string; status: "available" | "held" | "sold" | "blocked"; tier_id: string | null; accessible: boolean };
export type PickerTier = { id: string; name: string; price: number; color: string };
export type SeatPickerProps = {
  /** Event overlay (seat blocks, tables, areas). */
  elements: MapEl[];
  /** Venue plan drawn read-only underneath. */
  base?: MapEl[];
  seats: PickerSeat[];
  tiers: PickerTier[];
  /** Most seats the buyer may hold in this order. */
  max: number;
  selected: string[];
  onChange: (keys: string[]) => void;
  height?: number;
  currency?: string;
};
type View = { cx: number; cy: number; z: number };
type Info = { section: string; row: string | null; num: string; table: boolean };

const money = (n: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);

/**
 * Buyer-facing reserved-seating picker. Renders the event plan read-only with pan/zoom, seats coloured by ticket tier (grey when sold, held or blocked),
 * accessible seats ringed, click/tap to toggle (available seats only, up to `max`), hover tooltip with price, tier legend and a selected-seat summary.
 */
export function SeatPicker({ elements, base = [], seats, tiers, max, selected, onChange, height = 520, currency = "GBP" }: SeatPickerProps) {
  const svg = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: height });
  const [view, setView] = useState<View | null>(null);
  const [tip, setTip] = useState<{ key: string; x: number; y: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const pan = useRef<{ sx: number; sy: number; v: View; moved: boolean } | null>(null);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 800, h: el.clientHeight || height })); ro.observe(el);
    return () => ro.disconnect();
  }, [height]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2600); return () => clearTimeout(t); }, [msg]);

  const seatBy = useMemo(() => new Map(seats.map(s => [s.key, s])), [seats]);
  const tierBy = useMemo(() => new Map(tiers.map(t => [t.id, t])), [tiers]);
  const sel = useMemo(() => new Set(selected), [selected]);

  /** Overlay with live tiers/accessibility merged onto each seat so the shared renderer colours them. */
  const els = useMemo(() => elements.map(e => {
    const d = ASSET[e.asset ?? ""]; if (!d || (d.kind !== "seating" && d.kind !== "table")) return e;
    const keys = d.kind === "seating" && e.seating ? blockSeats(e.seating).map(q => q.key) : e.table ? tableSeats(e.table).map(q => q.key) : [];
    const seatTiers: Record<string, string> = {}, seatFlags: Record<string, SeatFlag> = {};
    for (const k of keys) { const s = seatBy.get(k); if (s?.tier_id) seatTiers[k] = s.tier_id; if (s?.accessible) seatFlags[k] = "accessible"; }
    return { ...e, tier: null, seatTiers, seatFlags };
  }), [elements, seatBy]);
  const info = useMemo(() => {
    const m = new Map<string, Info>();
    for (const e of elements) { const d = ASSET[e.asset ?? ""]; if (!d || e.hidden) continue;
      if (d.kind === "seating" && e.seating) for (const q of blockSeats(e.seating)) m.set(q.key, { section: e.label, row: q.row, num: q.num, table: false });
      if (d.kind === "table" && e.table) for (const q of tableSeats(e.table)) m.set(q.key, { section: e.label || `Table ${e.table.number}`, row: null, num: q.num, table: true }); }
    return m;
  }, [elements]);
  const pitch = useMemo(() => Math.min(5, ...elements.map(e => e.seating?.pitch ?? 5)), [elements]);

  const bounds = useMemo(() => {
    const list = [...base, ...elements].filter(e => e.type !== "basemap" && !e.hidden);
    if (!list.length) return { x: 0, y: 0, w: 400, h: 240 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of list) { const b = elBounds(e); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    return { x: x0 - 20, y: y0 - 20, w: x1 - x0 + 40, h: y1 - y0 + 40 };
  }, [base, elements]);
  const fitView = useCallback((b = bounds): View => ({ cx: b.x + b.w / 2, cy: b.y + b.h / 2, z: Math.min(size.w / b.w, size.h / b.h) * 0.94 }), [bounds, size]);
  const v = view ?? fitView();
  const vb = { x: v.cx - size.w / (2 * v.z), y: v.cy - size.h / (2 * v.z), w: size.w / v.z, h: size.h / v.z };
  const detail = v.z * pitch >= 3.2;
  const clampZ = (z: number) => Math.min(40, Math.max(fitView().z * 0.5, z));

  const zoomAt = (f: number, px = size.w / 2, py = size.h / 2) => {
    const cur = view ?? fitView(), z = clampZ(cur.z * f), wx = cur.cx + (px - size.w / 2) / cur.z, wy = cur.cy + (py - size.h / 2) / cur.z;
    setView({ z, cx: wx - (px - size.w / 2) / z, cy: wy - (py - size.h / 2) / z });
  };
  useEffect(() => {
    const el = svg.current; if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.deltaY > 0 ? 1 / 1.15 : 1.15, e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });

  const stateOf = useCallback((key: string): SeatState => {
    if (sel.has(key)) return "selected";
    const s = seatBy.get(key); return s ? s.status : "blocked";
  }, [sel, seatBy]);
  const toggle = (key: string) => {
    const s = seatBy.get(key);
    if (sel.has(key)) { onChange(selected.filter(k => k !== key)); return; }
    if (!s || s.status !== "available") { setMsg(s?.status === "sold" ? "That seat has already been sold" : "That seat isn’t available"); return; }
    if (selected.length >= max) { setMsg(max === 1 ? "You can choose 1 seat — remove it to pick another" : `You can choose up to ${max} seats`); return; }
    onChange([...selected, key]);
  };
  const onSeat = (_i: number, key: string, ev: RPE<SVGCircleElement>) => {
    const r = wrap.current!.getBoundingClientRect(); setTip({ key, x: ev.clientX - r.left, y: ev.clientY - r.top }); toggle(key);
  };
  const onElDown = (ev: RPE<SVGGElement>, i: number) => {
    if (detail) return; const e = els[i], d = ASSET[e.asset ?? ""];
    if (!d || (d.kind !== "seating" && d.kind !== "table")) return;
    ev.stopPropagation(); const b = elBounds(e), pad = Math.max(b.w, b.h) * 0.25;
    const z = Math.max(Math.min(size.w / (b.w + pad * 2), size.h / (b.h + pad * 2)), 3.6 / pitch);
    setView({ cx: b.x + b.w / 2, cy: b.y + b.h / 2, z: clampZ(z) });
  };
  const down = (e: RPE<SVGSVGElement>) => { if (e.button !== 0) return; pan.current = { sx: e.clientX, sy: e.clientY, v, moved: false }; svg.current?.setPointerCapture(e.pointerId); };
  const move = (e: RPE<SVGSVGElement>) => {
    const p = pan.current;
    if (p) { const dx = e.clientX - p.sx, dy = e.clientY - p.sy; if (!p.moved && Math.abs(dx) + Math.abs(dy) > 3) { p.moved = true; setPanning(true); } setView({ ...p.v, cx: p.v.cx - dx / p.v.z, cy: p.v.cy - dy / p.v.z }); setTip(null); return; }
    const t = (e.target as Element).closest?.("[data-seat]"); const key = t?.getAttribute("data-seat");
    if (key) { const r = wrap.current!.getBoundingClientRect(); setTip({ key, x: e.clientX - r.left, y: e.clientY - r.top }); } else if (tip) setTip(null);
  };
  const up = () => { pan.current = null; setPanning(false); };

  const priceOf = (key: string) => { const t = tierBy.get(seatBy.get(key)?.tier_id ?? ""); return t ? t.price : null; };
  const labelOf = (key: string) => { const i = info.get(key); if (!i) return key; return i.table ? `${i.section} · Seat ${i.num}` : `${i.section} · Row ${i.row} · Seat ${i.num}`; };
  const shortOf = (key: string) => { const i = info.get(key); if (!i) return key; return i.table ? `${i.section} · ${i.num}` : `${i.section} · ${i.row}${i.num}`; };
  const total = selected.reduce((a, k) => a + (priceOf(k) ?? 0), 0);
  const left = useMemo(() => { const m = new Map<string, number>(); for (const s of seats) if (s.status === "available" && s.tier_id) m.set(s.tier_id, (m.get(s.tier_id) ?? 0) + 1); return m; }, [seats]);
  const tierColor = useCallback((t?: string | null) => (t ? tierBy.get(t)?.color : undefined), [tierBy]);

  const tipSeat = tip ? seatBy.get(tip.key) : undefined, tipTier = tipSeat?.tier_id ? tierBy.get(tipSeat.tier_id) : undefined;
  const tipStatus = tip ? (sel.has(tip.key) ? "Selected — tap to remove" : tipSeat?.status === "available" ? null : tipSeat?.status === "sold" ? "Sold" : tipSeat?.status === "held" ? "Reserved" : "Not available") : null;

  return <div className="sp">
    <div ref={wrap} className="sp-stage" style={{ ["--sp-h" as string]: `${height}px` }} onPointerLeave={() => setTip(null)}>
      <svg ref={svg} className={`vm sp-svg${panning ? " panning" : ""}`} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="application" aria-label="Seating plan — select your seats"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <MapDefs />
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#f6f9fc" />
        {base.length > 0 && <g opacity={0.8} pointerEvents="none"><MapContent elements={base} spaces={[]} labelSize={13 / v.z} span={vb} detail={false} /></g>}
        <MapContent elements={els} spaces={[]} labelSize={13 / v.z} span={vb} detail={detail} tierColor={tierColor} seatState={stateOf} onSeat={onSeat} onElDown={onElDown} />
      </svg>
      <div className="sp-zoom">
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.4)}><ZoomIn aria-hidden="true" /></button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.4)}><ZoomOut aria-hidden="true" /></button>
        <button type="button" aria-label="Fit plan to screen" onClick={() => setView(null)}><Scan aria-hidden="true" /></button>
      </div>
      {!detail && <span className="sp-hint">Tap a section or zoom in to choose seats</span>}
      {msg && <div className="sp-msg" role="status">{msg}</div>}
      {tip && <div className="sp-tip" style={{ left: tip.x, top: tip.y }}>
        <b>{labelOf(tip.key)}</b>{tipTier && <> — {money(tipTier.price, currency)} <span>({tipTier.name})</span></>}
        {(tipStatus || tipSeat?.accessible) && <small>{tipTier && <i style={{ background: tipTier.color }} />}{[tipStatus, tipSeat?.accessible ? "Wheelchair accessible" : null].filter(Boolean).join(" · ")}</small>}
      </div>}
    </div>
    <div className="sp-legend" aria-label="Ticket prices">
      {tiers.map(t => <span key={t.id}><i style={{ background: t.color }} />{t.name} <em>{money(t.price, currency)}{left.has(t.id) ? ` · ${left.get(t.id)} left` : " · sold out"}</em></span>)}
      <span className="st"><i style={{ background: "#1a1af2", borderColor: "#1a1af2" }} />Your seats</span>
      <span className="st"><i style={{ background: "#d5d9e5" }} />Unavailable</span>
      <span className="acc"><i />Accessible</span>
    </div>
    <div className="sp-sum" aria-live="polite">
      <b>{selected.length ? `${selected.length} of ${max} seat${max === 1 ? "" : "s"}` : "No seats selected"}</b>
      {!selected.length && <small>Choose up to {max} seat{max === 1 ? "" : "s"} on the plan.</small>}
      {selected.map(k => { const t = tierBy.get(seatBy.get(k)?.tier_id ?? ""), acc = seatBy.get(k)?.accessible;
        return <span key={k} className="sp-chip"><i style={{ background: t?.color ?? "#1a1af2" }} />{shortOf(k)}{acc && <Accessibility aria-label="Accessible" />}{t && <em>{money(t.price, currency)}</em>}
          <button type="button" aria-label={`Remove ${labelOf(k)}`} onClick={() => onChange(selected.filter(x => x !== k))}><X aria-hidden="true" /></button></span>; })}
      {selected.length > 0 && <><span className="sp-total">{money(total, currency)}</span><button type="button" className="sp-clear" onClick={() => onChange([])}>Clear</button></>}
    </div>
  </div>;
}
