"use client";
// Interactive raster map (Web Mercator) used across Customer, Organizer and Provider: drag to pan (zoom-aware inside the
// scaled shells), wheel / double-click / buttons to zoom toward the pointer, clustered pins, and a card for the chosen pin.
// Tiles come through /api/maps/tile so the map key stays on the server.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Minus, X, MapPin as PinIcon, ArrowRight } from "lucide-react";
import { tileUrl } from "@/lib/maps/styles";

export type MapPin = { id: string; lat: number; lng: number; label?: string; price?: string; href?: string; sub?: string; image?: string };
export type MapBounds = { north: number; south: number; east: number; west: number };
const TILE = 256, MIN_Z = 3, MAX_Z = 18, CLUSTER_PX = 48, DRAG_PX = 4;
const project = (lat: number, lng: number, z: number) => { const s = Math.sin((lat * Math.PI) / 180), sc = TILE * 2 ** z; return { x: ((lng + 180) / 360) * sc, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * sc }; };
const unproject = (x: number, y: number, z: number) => { const sc = TILE * 2 ** z, lng = (x / sc) * 360 - 180, n = Math.PI - (2 * Math.PI * y) / sc; return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng }; };
/** MapTiler style names used by callers → proxy styles. */
const proxyStyle = (s: string) => /light/.test(s) ? "light" : /outdoor/.test(s) ? "outdoor" : /hybrid/.test(s) ? "hybrid" : /satellite/.test(s) ? "satellite" : "streets";

type Cluster = { key: string; x: number; y: number; pins: MapPin[] };

export function MapView({ pins, center, zoom: z0 = 11, height = 220, mapKey, selected, onSelect, style = "streets-v2-light", showPrices, ariaLabel = "Map of results", onMoveEnd }: {
  pins: MapPin[]; center?: { lat: number; lng: number }; zoom?: number; height?: number | string; mapKey?: string; selected?: string | null; onSelect?: (id: string) => void; style?: string; showPrices?: boolean; ariaLabel?: string;
  /** Called (debounced) with the visible area after the user pans or zooms. */ onMoveEnd?: (b: MapBounds) => void;
}) {
  void mapKey; // tiles are proxied server-side; kept for API compatibility
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 220 });
  const [zoom, setZoom] = useState(z0);
  const initialCenter = useMemo(() => center ?? (pins.length ? { lat: pins.reduce((s, p) => s + p.lat, 0) / pins.length, lng: pins.reduce((s, p) => s + p.lng, 0) / pins.length } : { lat: 51.5072, lng: -0.1276 }), [center, pins]);
  const [c, setC] = useState(initialCenter);
  const [open, setOpen] = useState<string | null>(null);
  const [touched, setTouched] = useState(false); // only report areas the user chose (not the initial layout/resize)
  const drag = useRef<{ x: number; y: number; c: { lat: number; lng: number }; moved: boolean; id: number } | null>(null);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height })); ro.observe(el); return () => ro.disconnect(); }, []);
  // Follow the parent's selection (e.g. a list row was clicked) without an effect.
  const [prevSel, setPrevSel] = useState(selected);
  if (selected !== prevSel) { setPrevSel(selected); if (selected) setOpen(selected); }
  /** CSS px per screen px: the shells are scaled with CSS zoom, pointer coordinates are in screen px. */
  const scale = () => { const el = ref.current; if (!el || !el.offsetWidth) return 1; return el.offsetWidth / el.getBoundingClientRect().width; };
  const local = (clientX: number, clientY: number) => { const r = ref.current!.getBoundingClientRect(), k = scale(); return { x: (clientX - r.left) * k, y: (clientY - r.top) * k }; };
  /** Zoom by `dz` keeping the point under (px, py) fixed. */
  const zoomAt = useCallback((dz: number, px?: number, py?: number) => {
    setTouched(true);
    setZoom(z => {
      const nz = Math.max(MIN_Z, Math.min(MAX_Z, z + dz)); if (nz === z) return z;
      setC(cc => { const cp = project(cc.lat, cc.lng, z), ax = px ?? size.w / 2, ay = py ?? size.h / 2;
        const wx = cp.x - size.w / 2 + ax, wy = cp.y - size.h / 2 + ay, f = 2 ** (nz - z);
        return unproject(wx * f - ax + size.w / 2, wy * f - ay + size.h / 2, nz); });
      return nz;
    });
  }, [size.w, size.h]);
  // Wheel zoom needs a non-passive listener so the page doesn't scroll underneath the map.
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let acc = 0, t = 0;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); acc += e.deltaY; const now = Date.now(); if (Math.abs(acc) < 60 && now - t < 250) return; t = now;
      const p = local(e.clientX, e.clientY); zoomAt(acc < 0 ? 1 : -1, p.x, p.y); acc = 0; };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const cp = project(c.lat, c.lng, zoom), ox = Math.round(cp.x - size.w / 2), oy = Math.round(cp.y - size.h / 2); // whole pixels: identical SSR + client style values
  // Report the visible area once the user's movement settles.
  const moveCb = useRef(onMoveEnd);
  useEffect(() => { moveCb.current = onMoveEnd; });
  useEffect(() => {
    if (!touched || !moveCb.current) return;
    const t = setTimeout(() => { const nw = unproject(ox, oy, zoom), se = unproject(ox + size.w, oy + size.h, zoom); moveCb.current?.({ north: nw.lat, west: nw.lng, south: se.lat, east: se.lng }); }, 650);
    return () => clearTimeout(t);
  }, [ox, oy, zoom, touched]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = 2 ** zoom, ts = proxyStyle(style);
  const tiles: { x: number; y: number; key: string }[] = [];
  for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + size.w) / TILE); tx++) for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + size.h) / TILE); ty++) if (ty >= 0 && ty < max) tiles.push({ x: tx, y: ty, key: `${zoom}/${tx}/${ty}` });

  // Group pins that would overlap at this zoom into clusters.
  const clusters = useMemo(() => {
    const out: Cluster[] = [];
    for (const p of pins) {
      const pp = project(p.lat, p.lng, zoom), x = Math.round(pp.x - ox), y = Math.round(pp.y - oy);
      if (x < -60 || y < -60 || x > size.w + 60 || y > size.h + 60) continue;
      const near = out.find(cl => Math.abs(cl.x - x) < CLUSTER_PX && Math.abs(cl.y - y) < CLUSTER_PX && !(selected && (cl.pins[0]!.id === selected || p.id === selected)));
      if (near) { near.pins.push(p); const n = near.pins.length; near.x = Math.round((near.x * (n - 1) + x) / n); near.y = Math.round((near.y * (n - 1) + y) / n); }
      else out.push({ key: p.id, x, y, pins: [p] });
    }
    // Centroids drift as pins join, so keep merging until no two markers overlap (the selected pin always stays on its own).
    for (let merged = true; merged;) {
      merged = false;
      outer: for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!, b = out[j]!; if (selected && (a.pins.some(q => q.id === selected) || b.pins.some(q => q.id === selected))) continue;
        if (Math.abs(a.x - b.x) < CLUSTER_PX && Math.abs(a.y - b.y) < CLUSTER_PX) {
          const n = a.pins.length + b.pins.length; a.x = Math.round((a.x * a.pins.length + b.x * b.pins.length) / n); a.y = Math.round((a.y * a.pins.length + b.y * b.pins.length) / n);
          a.pins.push(...b.pins); out.splice(j, 1); merged = true; break outer;
        }
      }
    }
    return out;
  }, [pins, zoom, ox, oy, size.w, size.h, selected]);
  const openPin = open ? pins.find(p => p.id === open) : null;
  const openPos = openPin ? (() => { const pp = project(openPin.lat, openPin.lng, zoom); return { x: Math.round(pp.x - ox), y: Math.round(pp.y - oy) }; })() : null;
  const choose = (p: MapPin) => { setOpen(o => (o === p.id && !onSelect ? null : p.id)); onSelect?.(p.id); };

  return <div ref={ref} className="k-map" style={{ height }} role="application" aria-label={ariaLabel} tabIndex={0}
    onPointerDown={e => { if (e.button !== 0) return; drag.current = { x: e.clientX, y: e.clientY, c, moved: false, id: e.pointerId }; }}
    onPointerMove={e => { const d = drag.current; if (!d || d.id !== e.pointerId) return; const k = scale(), dx = (e.clientX - d.x) * k, dy = (e.clientY - d.y) * k;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_PX) return;
      if (!d.moved) { d.moved = true; setTouched(true); ref.current?.setPointerCapture?.(e.pointerId); ref.current?.classList.add("dragging"); }
      const p = project(d.c.lat, d.c.lng, zoom); setC(unproject(p.x - dx, p.y - dy, zoom)); }}
    onPointerUp={e => { const d = drag.current; drag.current = null; ref.current?.classList.remove("dragging"); if (d?.moved) ref.current?.releasePointerCapture?.(e.pointerId); }}
    onPointerCancel={() => { drag.current = null; ref.current?.classList.remove("dragging"); }}
    onDoubleClick={e => { if ((e.target as HTMLElement).closest(".pin,.cluster,.zoom,.card")) return; const p = local(e.clientX, e.clientY); zoomAt(1, p.x, p.y); }}
    onKeyDown={e => { const step = 80, p = project(c.lat, c.lng, zoom); const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (m[e.key]) { e.preventDefault(); setTouched(true); setC(unproject(p.x + m[e.key]![0], p.y + m[e.key]![1], zoom)); } else if (e.key === "+" || e.key === "=") zoomAt(1); else if (e.key === "-") zoomAt(-1); else if (e.key === "Escape") setOpen(null); }}>
    <div className="tiles" aria-hidden>{tiles.map(t => { const wx = ((t.x % max) + max) % max;
      // eslint-disable-next-line @next/next/no-img-element
      return <img key={t.key} alt="" draggable={false} src={tileUrl(ts, zoom, wx, t.y)} style={{ left: t.x * TILE - ox, top: t.y * TILE - oy }} />; })}</div>
    {clusters.map(cl => cl.pins.length > 1
      ? <button key={`c-${cl.key}`} type="button" className="cluster" style={{ left: cl.x, top: cl.y }} aria-label={`${cl.pins.length} places here — zoom in`} onPointerDown={e => e.stopPropagation()}
          onClick={() => { setTouched(true); const lat = cl.pins.reduce((s, p) => s + p.lat, 0) / cl.pins.length, lng = cl.pins.reduce((s, p) => s + p.lng, 0) / cl.pins.length; setC({ lat, lng }); setZoom(z => Math.min(MAX_Z, z + 2)); }}>{cl.pins.length}</button>
      : (() => { const p = cl.pins[0]!; return <button key={p.id} type="button" className="pin" style={{ left: cl.x, top: cl.y }} aria-pressed={selected === p.id || open === p.id} aria-label={p.label?.trim() || "Location"} onPointerDown={e => e.stopPropagation()} onClick={() => choose(p)}>
          {showPrices && p.price ? <span className="price">{p.price}</span> : <span className="dot"><PinIcon size={14} aria-hidden /></span>}</button>; })())}
    {openPin && openPos && (openPin.label || openPin.href) && <div className="card" role="dialog" aria-label={openPin.label ?? "Location"} style={{ left: Math.min(Math.max(openPos.x, 110), size.w - 110), top: Math.max(openPos.y - 44, 70) }} onPointerDown={e => e.stopPropagation()}>
      <button type="button" className="card-x" aria-label="Close" onClick={() => setOpen(null)}><X size={13} /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {openPin.image && <img src={openPin.image} alt="" className="card-img" />}
      <b>{openPin.label}</b>{(openPin.sub || openPin.price) && <small>{[openPin.sub, openPin.price].filter(Boolean).join(" · ")}</small>}
      {openPin.href && <Link href={openPin.href}>View <ArrowRight size={12} /></Link>}</div>}
    <div className="zoom"><button type="button" aria-label="Zoom in" onPointerDown={e => e.stopPropagation()} onClick={() => zoomAt(1)}><Plus size={14} /></button><button type="button" aria-label="Zoom out" onPointerDown={e => e.stopPropagation()} onClick={() => zoomAt(-1)}><Minus size={14} /></button></div>
    <span className="attr">© MapTiler © OpenStreetMap contributors</span>
  </div>;
}
