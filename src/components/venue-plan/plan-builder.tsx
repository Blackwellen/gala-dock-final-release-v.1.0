"use client";
import "@/styles/venue-plan.css";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type MutableRefObject, type PointerEvent as RPE } from "react";
import { MousePointer2, Hand, Square, Pentagon, Minus as WallIcon, Type, Ruler, Undo2, Redo2, Trash2, Copy, Eye, EyeOff, Lock, Unlock, ImagePlus, Map as MapIcon, Maximize2, Minimize2,
  ZoomIn, ZoomOut, Scan, Grid3x3, Magnet, Layers, Crosshair, ArrowUpToLine, ArrowDownToLine, Save, Upload, Shapes, Search, Keyboard, RotateCw, RotateCcw, AlignStartVertical, AlignCenterVertical,
  AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, ListOrdered, X, Satellite, ShieldAlert, Armchair, BookOpen, FlipHorizontal2, FlipVertical2,
  Plus, Pencil, ChevronUp, ChevronDown, Download, FileUp, Printer, MapPin, LocateFixed, ClipboardPaste, Loader2, Spline, Palette } from "lucide-react";
import { DesignKitPanel, DesignElProps, DesignFonts, isDesignEl, type DesignEl } from "./design-layer";
import type { LucideIcon } from "lucide-react";
import { useToast } from "@/components/ui";
import { MapContent, MapDefs, mapBounds, elBounds, isPoly, FIXTURE_LABEL, UNITS_PER_M, MAP_ATTRIBUTION, type MapEl, type MapSpace } from "@/app/provider/venues/_components/venue-map";
import { MAP_STYLES } from "@/lib/maps/styles";
import { ASSETS, ASSET, ASSET_CATS, ASSET_IMG, ASSET_SWATCH, KILL_SEATS_SWATCH, alpha, blockSeats, tableSeats, seatingSize, tableSize, type Seating, type TableSpec } from "./assets";
import { AssetShape, assetDefaults, type SeatFlag } from "./asset-shape";

type Tool = "select" | "hand" | "room" | "poly" | "wall" | "line" | "label" | "measure" | "calibrate" | "place" | "curve";
type View = { x: number; y: number; w: number; h: number };
type Drag =
  | { kind: "pan"; sx: number; sy: number; view: View }
  | { kind: "move"; sx: number; sy: number; orig: Map<number, MapEl> }
  | { kind: "resize"; i: number; corner: number; orig: MapEl }
  | { kind: "rotate"; i: number; cx: number; cy: number; orig: MapEl }
  | { kind: "vertex"; i: number; v: number }
  | { kind: "draft"; sx: number; sy: number }
  | { kind: "marquee"; sx: number; sy: number }
  | { kind: "measure"; sx: number; sy: number };
export type Tier = { id: string; name: string; color: string };
export type SaveFn = (els: MapEl[], publish: boolean) => Promise<{ ok: boolean; message?: string; error?: string }>;
/** Imperative handle for page shells (ORG-013 header actions, findings panel): additive, optional. */
export type PlanApi = { save: (publish: boolean) => void; elements: () => MapEl[]; isDirty: () => boolean; focus: (id: string) => boolean };
/** A validation finding drawn on the canvas (event_map_validate: element_id + severity). */
export type PlanHighlight = { id: string; severity: "error" | "warning" };

const GROUPS: [string, string, (e: MapEl) => boolean][] = [
  ["base", "Street map", e => e.type === "basemap"], ["drawings", "Drawings & aerials", e => e.type === "underlay"], ["rooms", "Rooms & spaces", e => e.type === "room"],
  ["seating", "Seating & tables", e => e.type === "asset" && ["seating", "table"].includes(ASSET[e.asset ?? ""]?.kind)], ["areas", "Areas & assets", e => e.type === "asset" && ["area", "point"].includes(ASSET[e.asset ?? ""]?.kind)],
  ["routes", "Routes & barriers", e => (e.type === "asset" && ASSET[e.asset ?? ""]?.kind === "line") || e.type === "accessible_route"], ["walls", "Walls", e => e.type === "wall"],
  ["fixed", "Fixed features", e => ["stage", "bar", "exit", "entrance", "toilets", "loading", "water"].includes(e.type)], ["labels", "Labels", e => e.type === "label"],
  ["design", "Design elements", e => isDesignEl(e)],
];
const TOOLS: [Tool, LucideIcon, string, string][] = [["select", MousePointer2, "Select & move", "V"], ["hand", Hand, "Pan", "H"], ["room", Square, "Room", "R"], ["poly", Pentagon, "Polygon room", "P"],
  ["wall", WallIcon, "Wall", "W"], ["label", Type, "Text", "T"], ["curve", Spline, "Bendy line", "C"], ["measure", Ruler, "Measure", "M"]];
const SHORTCUTS: [string, string][] = [["V", "Select"], ["H / hold Space", "Pan"], ["R", "Room"], ["P", "Polygon room"], ["W", "Wall"], ["T", "Text"], ["M", "Measure"], ["A", "Assets library"],
  ["Shift + click", "Add to selection"], ["Shift + drag", "Box select"], ["Ctrl + A", "Select all"], ["Ctrl + C / V", "Copy / paste"], ["Ctrl + D", "Duplicate"], ["Q / E", "Rotate 15° (Shift = 1°)"],
  ["Drag ↻ handle", "Free rotate"], ["Shift + drag ↻", "Rotate in 15° steps"], ["Shift + H / Shift + V", "Flip horizontal / vertical"], ["L", "Legend / key"],
  ["Arrows", "Nudge (Shift = 1 m)"], ["Del", "Delete"], ["Ctrl + Z / Y", "Undo / redo"], ["Enter", "Finish line"], ["Esc", "Cancel / deselect"], ["+ / −", "Zoom"], ["0", "Fit plan"], ["F", "Full screen"], ["?", "This list"]];
const PRESETS: { key: string; label: string; sub: string; build: (cx: number, cy: number) => MapEl[] }[] = [
  { key: "theatre", label: "Theatre rows", sub: "3 blocks · 288 seats", build: (cx, cy) => ["A", "B", "C"].map((p, i) => block(p, cx - 200 + i * 135, cy - 40, { rows: 8, cols: 12 })) },
  { key: "banquet", label: "Banquet dinner", sub: "12 rounds of 10", build: (cx, cy) => Array.from({ length: 12 }, (_, i) => table("round_table", String(i + 1), cx - 160 + (i % 4) * 85, cy - 80 + Math.floor(i / 4) * 85, 10)) },
  { key: "cabaret", label: "Cabaret", sub: "8 tables + stage", build: (cx, cy) => [asset("stage", cx - 60, cy - 130, 120, 50), ...Array.from({ length: 8 }, (_, i) => table("round_table", String(i + 1), cx - 140 + (i % 4) * 75, cy - 50 + Math.floor(i / 4) * 80, 6))] },
  { key: "conference", label: "Conference", sub: "Stage, screen, 2 blocks", build: (cx, cy) => [asset("stage", cx - 60, cy - 140, 120, 40), asset("screen", cx - 40, cy - 150, 80, 8), block("L", cx - 140, cy - 70, { rows: 10, cols: 10 }), block("R", cx + 20, cy - 70, { rows: 10, cols: 10 })] },
  { key: "festival", label: "Festival site", sub: "Stage, GA, bars, facilities", build: (cx, cy) => [asset("stage", cx - 80, cy - 220, 160, 60), asset("standing_area", cx - 200, cy - 150, 400, 220, { capacity: 4000 }),
    asset("foh", cx - 20, cy + 20, 40, 30), asset("bar", cx - 320, cy - 100, 80, 25), asset("bar", cx + 240, cy - 100, 80, 25), asset("toilets", cx - 320, cy + 60, 60, 30), asset("first_aid", cx + 260, cy + 60, 40, 30),
    asset("entrance", cx - 30, cy + 140, 60, 15), asset("security", cx - 30, cy + 110, 60, 20), asset("food_stall", cx + 230, cy, 40, 30), asset("food_stall", cx + 280, cy, 40, 30)] },
];
const FLAGS: [SeatFlag | "clear", string][] = [["blocked", "Block"], ["accessible", "Accessible"], ["companion", "Companion"], ["restricted", "Restricted view"], ["clear", "Clear"]];
const mm = (u: number) => Math.round((u / UNITS_PER_M) * 10) / 10;
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
let seq = 0;
const newId = (p: string) => { seq += 1; return `${p}-${seq.toString(36)}-${Math.floor(performance.timeOrigin % 1e6).toString(36)}`; };
function asset(key: string, x: number, y: number, w?: number, h?: number, extra: Partial<MapEl> = {}): MapEl {
  const d = assetDefaults(key); return { type: "asset", asset: key, id: newId(key), label: ASSET[key].label, x, y, ...d, ...(w ? { w } : {}), ...(h ? { h } : {}), ...extra };
}
function block(prefix: string, x: number, y: number, p: Partial<Seating>): MapEl {
  const s: Seating = { rows: 8, cols: 12, rowStyle: "alpha", colStyle: "numeric", rowStart: 1, colStart: 1, skipIO: true, rowDir: "front", colDir: "ltr", aisles: [], pitch: 5, prefix, ...p };
  return { type: "asset", asset: "seat_block", id: newId("blk"), label: `Block ${prefix}`, x, y, seating: s, ...seatingSize(s) };
}
function table(key: string, n: string, x: number, y: number, seats: number): MapEl {
  const t: TableSpec = { shape: key === "banquet_table" ? "rect" : "round", seats, number: n, seatStyle: "numeric" };
  return { type: "asset", asset: key, id: newId("tbl"), label: `Table ${n}`, x, y, table: t, ...tableSize(t) };
}
function shift(e: MapEl, dx: number, dy: number): MapEl {
  if (e.points) return { ...e, points: e.points.map(([x, y]) => [x + dx, y + dy]) };
  return { ...e, x: (e.x ?? 0) + dx, y: (e.y ?? 0) + dy };
}

/**
 * Enterprise venue/event plan builder. Venue mode edits the structural plan; event mode edits an event overlay above a locked base plan and assigns ticket tiers.
 */
export function PlanBuilder({ initial, spaces = [], version, draftVersion = 0, geo, height = 520, onSave, mode = "venue", base = [], tiers = [], title, apiRef, highlights = [], onDirtyChange, hidePublish = false }: {
  initial: MapEl[]; spaces?: MapSpace[]; version: number; draftVersion?: number; geo: { lat: number; lng: number } | null; height?: number; onSave: SaveFn; mode?: "venue" | "event"; base?: MapEl[]; tiers?: Tier[]; title?: string;
  apiRef?: MutableRefObject<PlanApi | null>; highlights?: PlanHighlight[]; onDirtyChange?: (dirty: boolean) => void; hidePublish?: boolean;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [els, setEls] = useState<MapEl[]>(initial);
  const [past, setPast] = useState<MapEl[][]>([]);
  const [future, setFuture] = useState<MapEl[][]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [placing, setPlacing] = useState<string | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [seats, setSeats] = useState<{ el: number; keys: Set<string> } | null>(null);
  const [snap, setSnap] = useState(true);
  const [grid, setGrid] = useState(true);
  const [hiddenGroups, setHiddenGroups] = useState<string[]>([]);
  const [lockedGroups, setLockedGroups] = useState<string[]>(["base"]);
  const [full, setFull] = useState(false);
  const [draft, setDraft] = useState<number[][]>([]);
  const [cursor, setCursor] = useState<number[] | null>(null);
  const [measure, setMeasure] = useState<number[][] | null>(null);
  const [marquee, setMarquee] = useState<number[][] | null>(null);
  const [panel, setPanel] = useState<"assets" | "design" | "layers" | "map" | "inspect">("assets");
  const [query, setQuery] = useState("");
  const [help, setHelp] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [px, setPx] = useState(800);
  const [clip, setClip] = useState<MapEl[]>([]);
  const [legend, setLegend] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [ghost, setGhost] = useState<{ key: string; x: number; y: number } | null>(null);
  const dragKey = useRef<string | null>(null);
  const [step, setStep] = useState(5);
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([]);
  const [lockedLayers, setLockedLayers] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [calib, setCalib] = useState<{ a: number[]; b: number[]; m: string } | null>(null);
  const [confirmPub, setConfirmPub] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [geoQ, setGeoQ] = useState("");
  const [geoHits, setGeoHits] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const [focusName, setFocusName] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const all = useMemo(() => [...base, ...initial], [base, initial]);
  const [view, setView] = useState<View>(() => { const b = mapBounds(all.length ? all : [{ type: "room", label: "", x: 0, y: 0, w: 600, h: 360 }]); return { x: -20, y: -20, w: b.w + 40, h: b.h + 40 }; });
  const svg = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const before = useRef<MapEl[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const space = useRef(false);

  useEffect(() => { const el = svg.current; if (!el) return; const ro = new ResizeObserver(() => setPx(el.clientWidth || 800)); ro.observe(el); return () => ro.disconnect(); }, []);
  const scale = px / view.w;
  const detail = scale * 5 >= 5.5; // seats ≥ ~5.5px drawn individually

  const commit = useCallback((next: MapEl[] | ((p: MapEl[]) => MapEl[]), prev?: MapEl[]) => {
    setEls(cur => { const n = typeof next === "function" ? next(cur) : next; setPast(p => [...p.slice(-100), prev ?? cur]); setFuture([]); return n; }); setDirty(true);
  }, []);
  const undo = useCallback(() => setPast(p => { if (!p.length) return p; const last = p[p.length - 1]; setEls(cur => { setFuture(f => [cur, ...f]); return last; }); setSel([]); return p.slice(0, -1); }), []);
  const redo = useCallback(() => setFuture(f => { if (!f.length) return f; const [n, ...rest] = f; setEls(cur => { setPast(p => [...p, cur]); return n; }); return rest; }), []);
  const groupOf = (e: MapEl) => GROUPS.find(g => g[2](e))?.[0] ?? "fixed";
  const editable = (e: MapEl) => !!e && e.type !== "layer" && !e.locked && !lockedGroups.includes(groupOf(e)) && !(e.layer && lockedLayers.includes(e.layer));
  const sn = (v: number) => (snap ? Math.round(v / step) * step : Math.round(v));
  const layerDefs = els.filter(e => e.type === "layer");
  /** New items go on the active custom layer. */
  const tag = (e: MapEl): MapEl => (activeLayer && !e.layer && e.type !== "basemap" ? { ...e, layer: activeLayer } : e);
  const world = (e: { clientX: number; clientY: number }) => { const c = svg.current?.getScreenCTM(); if (!c) return [0, 0]; const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(c.inverse()); return [p.x, p.y]; };
  const s = sel.length === 1 ? els[sel[0]] : null;
  const removeSel = useCallback(() => {
    const prot = sel.filter(i => els[i]?.protected);
    if (prot.length) toast("Fire exits and protected routes can’t be removed — move them instead.");
    const drop = new Set(sel.filter(i => !els[i]?.protected)); if (!drop.size) return;
    commit(l => l.filter((_, j) => !drop.has(j))); setSel([]);
  }, [sel, els, commit, toast]);
  const finishDraft = useCallback(() => {
    if (tool === "poly" && draft.length >= 3) { commit(l => [...l, tag({ type: "room", id: newId("room"), label: "New room", points: draft })]); setSel([els.length]); setPanel("inspect"); }
    if (tool === "wall" && draft.length >= 2) commit(l => [...l, tag({ type: "wall", label: "Wall", points: draft, size: 4 })]);
    if (tool === "curve" && draft.length >= 2) { commit(l => [...l, tag({ type: "curve", id: newId("curve"), label: "Curve", points: draft, smooth: true, endCap: "none", style: { color: "#2f6bff", strokeW: Math.max(2, Math.round(view.w / 240)) } })]); setSel([els.length]); setPanel("inspect"); setTool("select"); }
    if (tool === "line" && placing && draft.length >= 2) { commit(l => [...l, tag({ type: "asset", asset: placing, id: newId(placing), label: ASSET[placing].label, points: draft })]); setSel([els.length]); setPanel("inspect"); }
    setDraft([]);
  }, [tool, draft, commit, els.length, placing, activeLayer]); // eslint-disable-line react-hooks/exhaustive-deps
  const rotate = useCallback((deg: number) => { if (!sel.length) return; commit(l => l.map((x, j) => sel.includes(j) && x.type === "asset" && !x.points && editable(x) ? { ...x, rot: (((x.rot ?? 0) + deg) % 360 + 360) % 360 } : x)); }, [sel, commit]); // eslint-disable-line react-hooks/exhaustive-deps
  const flip = useCallback((axis: "h" | "v") => {
    if (!sel.length) return;
    commit(l => l.map((x, j) => {
      if (!sel.includes(j) || !editable(x)) return x;
      if (x.points) { const b = elBounds(x), c = axis === "h" ? b.x * 2 + b.w : b.y * 2 + b.h; return { ...x, points: x.points.map(([px, py]) => axis === "h" ? [c - px, py] : [px, c - py]) }; }
      if (x.type !== "asset") return x;
      const r = x.rot ?? 0, nr = ((axis === "h" ? 360 - r : 540 - r) % 360 + 360) % 360;
      return { ...x, rot: nr || undefined, ...(x.seating ? { seating: { ...x.seating, colDir: x.seating.colDir === "ltr" ? "rtl" as const : "ltr" as const } } : {}) };
    }));
  }, [sel, commit]); // eslint-disable-line react-hooks/exhaustive-deps
  const duplicate = useCallback((list = sel) => { if (!list.length) return; const copies = list.map(i => shift({ ...els[i], id: newId("copy"), protected: false, label: els[i].label }, 20, 20)); commit(l => [...l, ...copies]); setSel(copies.map((_, k) => els.length + k)); }, [sel, els, commit]);
  const zoomBy = (f: number) => setView(v => { const w = Math.min(12000, Math.max(40, v.w * f)), h = (w / v.w) * v.h; return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h }; });
  const fit = () => { const b = mapBounds([...base, ...els].length ? [...base, ...els] : [{ type: "room", label: "", x: 0, y: 0, w: 600, h: 360 }]); setView({ x: -20, y: -20, w: b.w + 40, h: (b.w + 40) * (view.h / view.w) }); };

  useEffect(() => {
    const up = (e: KeyboardEvent) => { if (e.key === " ") space.current = false; };
    const key = (e: KeyboardEvent) => {
      if (!wrap.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (e.key === " ") { space.current = true; e.preventDefault(); return; }
      if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === "y") { e.preventDefault(); redo(); return; }
      if (mod && k === "a") { e.preventDefault(); setSel(els.map((_, i) => i).filter(i => editable(els[i]))); return; }
      if (mod && k === "c") { setClip(sel.map(i => els[i])); if (sel.length) toast(`${sel.length} copied`); return; }
      if (mod && k === "v") { if (clip.length) { const c = clip.map(x => shift({ ...x, id: newId("paste"), protected: false }, 30, 30)); commit(l => [...l, ...c]); setSel(c.map((_, j) => els.length + j)); } return; }
      if (mod && k === "d") { e.preventDefault(); duplicate(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && sel.length) { e.preventDefault(); removeSel(); return; }
      if (e.key === "Escape") { setCalib(null); setConfirmPub(false); setExportOpen(false); setDraft([]); setMeasure(null); setSel([]); setSeats(null); setTool("select"); setPlacing(null); setMenu(null); setHelp(false); setLegend(false); return; }
      if (e.key === "Enter") { finishDraft(); return; }
      if (e.key === "?") { setHelp(h => !h); return; }
      if (e.key.startsWith("Arrow") && sel.length) { e.preventDefault(); const d = e.shiftKey ? 10 : 1;
        commit(l => l.map((x, j) => sel.includes(j) && editable(x) ? shift(x, e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0, e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0) : x)); return; }
      if (mod) return;
      if (e.shiftKey && k === "h") { flip("h"); return; } if (e.shiftKey && k === "v") { flip("v"); return; }
      if (k === "l") { setLegend(v => !v); return; }
      if (k === "q") { rotate(e.shiftKey ? -1 : -15); return; } if (k === "e") { rotate(e.shiftKey ? 1 : 15); return; }
      if (k === "+" || k === "=") { zoomBy(1 / 1.25); return; } if (k === "-") { zoomBy(1.25); return; } if (k === "0") { fit(); return; }
      if (k === "f") { setFull(f => !f); return; } if (k === "a") { setPanel("assets"); setSideOpen(true); return; }
      const t = TOOLS.find(x => x[3].toLowerCase() === k); if (t) { setTool(t[0]); setPlacing(null); setDraft([]); }
    };
    window.addEventListener("keydown", key); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("keyup", up); };
  });

  const placeAt = (key: string, x: number, y: number) => {
    const d = ASSET[key]; if (!d) return;
    if (d.kind === "line") { setTool("line"); setPlacing(key); toast(`Click points to draw the ${d.label.toLowerCase()} · double-click to finish`); return; }
    const a = asset(key, 0, 0), w = a.w ?? 20, h = a.h ?? 20;
    const n = d.kind === "table" ? String(els.filter(e => ASSET[e.asset ?? ""]?.kind === "table").length + 1) : "";
    const el: MapEl = d.kind === "table" ? { ...a, table: { ...a.table!, number: n }, label: `Table ${n}` } : d.kind === "seating" ? { ...a, seating: { ...a.seating!, prefix: alphaNext(els) }, label: `Block ${alphaNext(els)}` } : a;
    commit(l => [...l, tag({ ...el, x: sn(x - w / 2), y: sn(y - h / 2) })]); setSel([els.length]); setPanel("inspect");
  };
  const onWheel = (e: React.WheelEvent) => {
    const [x, y] = world(e), f = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    setView(v => { const w = Math.min(12000, Math.max(40, v.w * f)), h = (w / v.w) * v.h; return { x: x - ((x - v.x) * w) / v.w, y: y - ((y - v.y) * h) / v.h, w, h }; });
  };
  const onCanvasDown = (e: RPE<SVGSVGElement>) => {
    setMenu(null); setExportOpen(false); setConfirmPub(false); wrap.current?.focus();
    if (e.button === 2) return;
    if (e.button === 1 || tool === "hand" || space.current) { drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, view }; svg.current?.setPointerCapture(e.pointerId); return; }
    const [x, y] = world(e), p = [sn(x), sn(y)];
    if (tool === "place" && placing) { placeAt(placing, x, y); if (!e.shiftKey) { setTool("select"); setPlacing(null); } return; }
    if (tool === "select") {
      if (e.shiftKey) { drag.current = { kind: "marquee", sx: x, sy: y }; svg.current?.setPointerCapture(e.pointerId); return; }
      setSel([]); setSeats(null); drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, view }; svg.current?.setPointerCapture(e.pointerId); return;
    }
    if (tool === "poly" || tool === "wall" || tool === "line" || tool === "curve") {
      if (e.detail >= 2) { finishDraft(); return; }
      if (tool === "poly" && draft.length >= 3 && dist(p, draft[0]) < view.w / 80) { finishDraft(); return; }
      setDraft(d => [...d, p]); return;
    }
    if (tool === "label") { commit(l => [...l, tag({ type: "label", label: "Text", x: p[0], y: p[1], size: Math.round(view.w / 50) })]); setSel([els.length]); setPanel("inspect"); setSideOpen(true); setFocusName(n => n + 1); setTool("select"); return; }
    if (tool === "calibrate") {
      const next = [...draft, p]; setDraft(next);
      if (next.length === 2) setCalib({ a: next[0], b: next[1], m: "" });
      return;
    }
    drag.current = tool === "measure" ? { kind: "measure", sx: p[0], sy: p[1] } : { kind: "draft", sx: p[0], sy: p[1] };
    before.current = els; svg.current?.setPointerCapture(e.pointerId);
  };
  const onElDown = (e: RPE<SVGGElement>, i: number) => {
    if (tool !== "select" || space.current || e.button !== 0) return;
    e.stopPropagation(); wrap.current?.focus(); setSeats(null);
    const next = e.shiftKey ? (sel.includes(i) ? sel.filter(x => x !== i) : [...sel, i]) : sel.includes(i) ? sel : [i];
    setSel(next); setPanel("inspect");
    if (!next.some(j => editable(els[j]))) return;
    const [x, y] = world(e); drag.current = { kind: "move", sx: x, sy: y, orig: new Map(next.filter(j => editable(els[j])).map(j => [j, els[j]])) }; before.current = els; svg.current?.setPointerCapture(e.pointerId);
  };
  const onSeat = (i: number, key: string, e: RPE<SVGCircleElement>) => {
    if (tool !== "select") return;
    setSel([i]); setPanel("inspect"); setSideOpen(true);
    setSeats(cur => { const keys = new Set(cur && cur.el === i && e.shiftKey ? cur.keys : []); if (keys.has(key)) keys.delete(key); else keys.add(key); return { el: i, keys }; });
  };
  const onHandleDown = (e: RPE<SVGElement>, kind: "resize" | "vertex" | "rotate", n: number) => {
    e.stopPropagation(); if (!s) return;
    if (kind === "rotate") { const b = elBounds(s); drag.current = { kind, i: sel[0], cx: b.x + b.w / 2, cy: b.y + b.h / 2, orig: s }; setRotating(true); }
    else drag.current = kind === "resize" ? { kind, i: sel[0], corner: n, orig: s } : { kind, i: sel[0], v: n };
    before.current = els; svg.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPE<SVGSVGElement>) => {
    const [x, y] = world(e); setCursor([x, y]);
    const d = drag.current; if (!d) return;
    if (d.kind === "pan") { const r = svg.current!.getBoundingClientRect(), k = d.view.w / r.width; setView({ ...d.view, x: d.view.x - (e.clientX - d.sx) * k, y: d.view.y - (e.clientY - d.sy) * k }); return; }
    if (d.kind === "move") { const dx = sn(x - d.sx), dy = sn(y - d.sy); setEls(l => l.map((el, j) => d.orig.has(j) ? shift(d.orig.get(j)!, dx, dy) : el)); setDirty(true); return; }
    if (d.kind === "resize") {
      // Works in the element's own (possibly rotated) frame: the opposite corner stays fixed in world space.
      const o = d.orig, ow = o.w ?? 0, oh = o.h ?? 0, ccx = (o.x ?? 0) + ow / 2, ccy = (o.y ?? 0) + oh / 2, th = ((o.rot ?? 0) * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th);
      const sx = d.corner === 1 || d.corner === 2 ? 1 : -1, sy = d.corner >= 2 ? 1 : -1, lx = (-sx * ow) / 2, ly = (-sy * oh) / 2;
      const ax = ccx + lx * co - ly * si, ay = ccy + lx * si + ly * co, qx = x - ax, qy = y - ay;
      let lw = (qx * co + qy * si) * sx, lh = (-qx * si + qy * co) * sy;
      lw = Math.max(5, snap ? Math.round(lw / step) * step : Math.round(lw)); lh = Math.max(5, snap ? Math.round(lh / step) * step : Math.round(lh));
      if (o.type === "underlay" && !e.shiftKey) lh = lw / ((o.w ?? 1) / (o.h ?? 1));
      const hx = (sx * lw) / 2, hy = (sy * lh) / 2, ncx = ax + hx * co - hy * si, ncy = ay + hx * si + hy * co;
      setEls(l => l.map((el, j) => j === d.i ? { ...el, x: Math.round((ncx - lw / 2) * 10) / 10, y: Math.round((ncy - lh / 2) * 10) / 10, w: lw, h: lh } : el)); setDirty(true); return;
    }
    if (d.kind === "rotate") {
      let a = (Math.atan2(y - d.cy, x - d.cx) * 180) / Math.PI + 90;
      a = e.shiftKey ? Math.round(a / 15) * 15 : Math.round(a);
      if (!e.shiftKey && snap) for (const q of [0, 90, 180, 270, 360]) if (Math.abs(a - q) < 3 || Math.abs(a + 360 - q) < 3) a = q;
      const r = ((a % 360) + 360) % 360;
      setEls(l => l.map((el, j) => j === d.i ? { ...el, rot: r || undefined } : el)); setDirty(true); return;
    }
    if (d.kind === "vertex") { setEls(l => l.map((el, j) => j === d.i && el.points ? { ...el, points: el.points.map((p, v) => v === d.v ? [sn(x), sn(y)] : p) } : el)); setDirty(true); return; }
    if (d.kind === "measure") { setMeasure([[d.sx, d.sy], [x, y]]); return; }
    if (d.kind === "marquee") { setMarquee([[d.sx, d.sy], [x, y]]); return; }
    if (d.kind === "draft") setDraft([[d.sx, d.sy], [sn(x), sn(y)]]);
  };
  const onUp = () => {
    const d = drag.current; drag.current = null; setRotating(false);
    if (!d) return;
    if ((d.kind === "move" || d.kind === "resize" || d.kind === "vertex" || d.kind === "rotate") && before.current && before.current !== els) { const b = before.current; setPast(p => [...p.slice(-100), b]); setFuture([]); }
    if (d.kind === "marquee" && marquee) {
      const [a, b] = marquee, x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      setSel(els.map((e, i) => ({ e, i, b: elBounds(e) })).filter(({ e, b: bb }) => editable(e) && e.type !== "basemap" && bb.x >= x0 && bb.y >= y0 && bb.x + bb.w <= x1 && bb.y + bb.h <= y1).map(q => q.i)); setMarquee(null);
    }
    if (d.kind === "draft" && draft.length === 2) {
      const [[a, b], [c, dd]] = draft, x = Math.min(a, c), y = Math.min(b, dd), w = Math.abs(c - a), h = Math.abs(dd - b);
      if (w >= 10 && h >= 5) { commit(l => [...l, tag({ type: "room", id: newId("room"), label: "New room", x, y, w, h })], before.current ?? undefined); setSel([els.length]); setPanel("inspect"); }
      setDraft([]);
    }
    before.current = null;
  };

  const upload = async (f: File, kind: "plan" | "aerial") => {
    const body = new FormData(); body.set("file", f);
    const res = await fetch("/api/listing-media", { method: "POST", body }); const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast(j.error ?? "Upload failed"); return; }
    const img = new Image(); img.src = j.url; await img.decode().catch(() => null);
    const w = Math.max(200, view.w * 0.8), h = img.naturalWidth ? (w * img.naturalHeight) / img.naturalWidth : w * 0.6;
    commit(l => [tag({ type: "underlay", label: `${kind === "aerial" ? "Aerial · " : ""}${f.name.replace(/\.[^.]+$/, "").slice(0, 50) || "Drawing"}`, url: j.url, x: view.x + view.w * 0.1, y: view.y + view.h * 0.1, w, h, opacity: kind === "aerial" ? 0.85 : 0.6 }), ...l]);
    setSel([0]); setPanel("inspect"); setSideOpen(true); toast("Added — use Calibrate to set its real-world scale, then draw on top");
  };
  const uploadKind = useRef<"plan" | "aerial">("plan");
  const save = (publish: boolean) => start(async () => {
    setConfirmPub(false);
    const r = await onSave(els, publish); toast(r.ok ? (r.message ?? "Saved") : (r.error ?? "Couldn’t save")); if (r.ok) setDirty(false);
  });
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      save: (publish: boolean) => save(publish), elements: () => els, isDirty: () => dirty,
      focus: (id: string) => {
        const i = els.findIndex(e => e.id === id);
        if (i < 0) return false;
        const b = elBounds(els[i]), w = Math.max(b.w * 3, 120);
        setSel([i]); setPanel("inspect"); setSideOpen(true);
        setView(v => ({ x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - (w * (v.h / v.w)) / 2, w, h: w * (v.h / v.w) }));
        return true;
      },
    };
    return () => { apiRef.current = null; };
  });
  const setS = (patch: Partial<MapEl>) => s && commit(l => l.map((x, j) => j === sel[0] ? { ...x, ...patch } : x));
  const setSeating = (patch: Partial<Seating>) => {
    if (!s?.seating) return; const ns = { ...s.seating, ...patch }, sz = seatingSize(ns);
    const keepCentre = !!s.rot || "curve" in patch || "rowOffset" in patch;
    setS({ seating: ns, ...sz, ...(keepCentre ? { x: Math.round(((s.x ?? 0) + (s.w ?? 0) / 2 - sz.w / 2) * 10) / 10, y: Math.round(((s.y ?? 0) + (s.h ?? 0) / 2 - sz.h / 2) * 10) / 10 } : {}) });
  };
  const setTable = (patch: Partial<TableSpec>) => { if (!s?.table) return; const nt = { ...s.table, ...patch }; setS({ table: nt, ...tableSize(nt), label: patch.number ? `Table ${patch.number}` : s.label }); };
  const align = (how: "l" | "c" | "r" | "t" | "m" | "b" | "dh" | "dv") => {
    if (sel.length < 2) return;
    const bs = sel.map(i => ({ i, b: elBounds(els[i]) })), minX = Math.min(...bs.map(q => q.b.x)), maxX = Math.max(...bs.map(q => q.b.x + q.b.w)), minY = Math.min(...bs.map(q => q.b.y)), maxY = Math.max(...bs.map(q => q.b.y + q.b.h));
    const move = new Map<number, [number, number]>();
    if (how === "dh" || how === "dv") {
      const sorted = [...bs].sort((a, b) => how === "dh" ? a.b.x - b.b.x : a.b.y - b.b.y), total = sorted.reduce((t, q) => t + (how === "dh" ? q.b.w : q.b.h), 0);
      const gap = ((how === "dh" ? maxX - minX : maxY - minY) - total) / (sorted.length - 1); let pos = how === "dh" ? minX : minY;
      for (const q of sorted) { move.set(q.i, how === "dh" ? [pos - q.b.x, 0] : [0, pos - q.b.y]); pos += (how === "dh" ? q.b.w : q.b.h) + gap; }
    } else for (const q of bs) move.set(q.i, [how === "l" ? minX - q.b.x : how === "c" ? (minX + maxX) / 2 - (q.b.x + q.b.w / 2) : how === "r" ? maxX - (q.b.x + q.b.w) : 0,
      how === "t" ? minY - q.b.y : how === "m" ? (minY + maxY) / 2 - (q.b.y + q.b.h / 2) : how === "b" ? maxY - (q.b.y + q.b.h) : 0]);
    commit(l => l.map((x, j) => move.has(j) && editable(x) ? shift(x, Math.round(move.get(j)![0]), Math.round(move.get(j)![1])) : x));
  };
  const renumberTables = () => {
    const idx = (sel.length > 1 ? sel : els.map((_, i) => i)).filter(i => ASSET[els[i]?.asset ?? ""]?.kind === "table");
    const order = [...idx].sort((a, b) => { const A = elBounds(els[a]), B = elBounds(els[b]); return Math.abs(A.y - B.y) > 15 ? A.y - B.y : A.x - B.x; });
    commit(l => l.map((x, j) => { const n = order.indexOf(j); return n < 0 ? x : { ...x, table: { ...x.table!, number: String(n + 1) }, label: `Table ${n + 1}` }; })); toast(`${order.length} tables renumbered`);
  };
  const renumberBlocks = () => {
    const idx = (sel.length > 1 ? sel : els.map((_, i) => i)).filter(i => !!els[i]?.seating);
    const order = [...idx].sort((a, b) => { const A = elBounds(els[a]), B = elBounds(els[b]); return Math.abs(A.y - B.y) > 15 ? A.y - B.y : A.x - B.x; });
    commit(l => l.map((x, j) => { const n = order.indexOf(j); if (n < 0) return x; const p = alpha(n + 1, true); return { ...x, seating: { ...x.seating!, prefix: p }, label: `Block ${p}` }; })); toast(`${order.length} blocks renamed A–${alpha(order.length, true)}`);
  };
  const flagSeats = (flag: SeatFlag | "clear") => {
    if (!seats) return; const el = els[seats.el];
    const f = { ...(el.seatFlags ?? {}) }; for (const k of seats.keys) { if (flag === "clear") delete f[k]; else f[k] = flag; }
    commit(l => l.map((x, j) => j === seats.el ? { ...x, seatFlags: f } : x));
  };
  const tierSeats = (tier: string) => {
    if (!seats) return; const el = els[seats.el], t = { ...(el.seatTiers ?? {}) };
    for (const k of seats.keys) { if (tier) t[k] = tier; else delete t[k]; }
    commit(l => l.map((x, j) => j === seats.el ? { ...x, seatTiers: t } : x));
  };

  // ── Custom layers ────────────────────────────────────────────────────────
  const layerCount = (id: string | null) => els.filter(e => e.type !== "layer" && e.type !== "basemap" && (id ? e.layer === id : !e.layer)).length;
  const newLayer = () => { const id = newId("layer"); commit(l => [...l, { type: "layer", id, label: `Layer ${layerDefs.length + 1}` }]); setActiveLayer(id); setRenaming(id); setPanel("layers"); setSideOpen(true); };
  const renameLayer = (id: string, label: string) => { const v = label.trim().slice(0, 40); if (v) commit(l => l.map(x => x.type === "layer" && x.id === id ? { ...x, label: v } : x)); setRenaming(null); };
  const deleteLayer = (id: string) => {
    const n = layerCount(id);
    commit(l => l.filter(x => !(x.type === "layer" && x.id === id)).map(x => x.layer === id ? { ...x, layer: undefined } : x));
    if (activeLayer === id) setActiveLayer(null); setSel([]);
    toast(n ? `Layer deleted. Its ${n} item${n === 1 ? "" : "s"} moved to No layer (Undo restores it).` : "Layer deleted");
  };
  /** Layer order sets stacking: items on later layers draw above earlier ones within each kind of element. */
  const moveLayer = (id: string, dir: -1 | 1) => {
    const ids = layerDefs.map(L => L.id!), i = ids.indexOf(id), j = i + dir; if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const rank = (e: MapEl) => (e.type === "layer" ? ids.indexOf(e.id!) : e.layer ? ids.indexOf(e.layer) : -1);
    commit(l => l.map((e, k) => ({ e, k })).sort((a, b) => rank(a.e) - rank(b.e) || a.k - b.k).map(x => x.e)); setSel([]);
  };
  const moveToLayer = (id: string) => commit(l => l.map((x, j) => sel.includes(j) && x.type !== "layer" && x.type !== "basemap" ? { ...x, layer: id || undefined } : x));

  // ── Street map ───────────────────────────────────────────────────────────
  const bmi = els.findIndex(e => e.type === "basemap"), bm = bmi >= 0 ? els[bmi] : null;
  const setBm = (patch: Partial<MapEl>) => bmi >= 0 && commit(l => l.map((x, j) => j === bmi ? { ...x, ...patch } : x));
  const placeBasemap = (h: { label: string; lat: number; lng: number }) => {
    setHiddenGroups(g => g.filter(x => x !== "base"));
    if (bm) setBm({ lat: h.lat, lng: h.lng });
    else { const cx = view.x + view.w / 2, cy = view.y + view.h / 2; commit(l => [{ type: "basemap", label: "Street map", lat: h.lat, lng: h.lng, x: Math.round(cx), y: Math.round(cy), opacity: 0.6, mapStyle: "streets", locked: true }, ...l]); }
    setGeoHits([]); toast(`Street map centred on ${h.label.split(",")[0]}`);
  };
  const findPlace = async () => {
    if (geoQ.trim().length < 3) return; setGeoBusy(true);
    const r = await fetch(`/api/maps/geocode?q=${encodeURIComponent(geoQ.trim())}`).catch(() => null); const j = await r?.json().catch(() => null); setGeoBusy(false);
    if (!r?.ok) { toast(j?.error ?? "Location search is unavailable right now."); return; }
    setGeoHits(j.results ?? []); if (!(j.results ?? []).length) toast("No matching places. Try a postcode or full address.");
  };
  const addBasemap = () => { setPanel("map"); setSideOpen(true); if (!bm && geo) placeBasemap({ label: "the venue address", ...geo }); };

  // ── Export / import ──────────────────────────────────────────────────────
  const download = (blob: Blob, name: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const fileBase = (title || (mode === "event" ? "event-layout" : "venue-plan")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  /** Standalone SVG of the whole plan: editor chrome removed, plan styles and images inlined so it renders anywhere. */
  const exportSvg = async () => {
    const el = svg.current; if (!el) return "";
    const c = el.cloneNode(true) as SVGSVGElement;
    c.querySelectorAll(".mb-handle,.mb-selbox,.mb-rot-handle,.mb-rot-stem,.mb-draft,.mb-ghost,.mb-ghost-box,.mb-marquee,.mb-measure,.mb-gridbg,.mb-dim").forEach(n => n.remove());
    const all = [...base, ...els].filter(e => e.type !== "basemap" && e.type !== "layer" && !e.hidden);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const e of all) { const b = elBounds(e); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    if (!Number.isFinite(x0)) { x0 = view.x; y0 = view.y; x1 = view.x + view.w; y1 = view.y + view.h; }
    const pad = 20, vb = [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2];
    c.setAttribute("viewBox", vb.join(" ")); c.setAttribute("xmlns", "http://www.w3.org/2000/svg"); c.setAttribute("width", String(Math.round(vb[2] * 2))); c.setAttribute("height", String(Math.round(vb[3] * 2)));
    c.querySelectorAll("rect").forEach(r => { if (r.getAttribute("x") === String(view.x) && r.getAttribute("width") === String(view.w)) { r.setAttribute("x", String(vb[0])); r.setAttribute("y", String(vb[1])); r.setAttribute("width", String(vb[2])); r.setAttribute("height", String(vb[3])); } });
    const css: string[] = []; for (const sh of Array.from(document.styleSheets)) { let rules: CSSRuleList; try { rules = sh.cssRules; } catch { continue; } for (const r of Array.from(rules)) if (r instanceof CSSStyleRule && /\.vm|vm-|\.ps-|\.sb-/.test(r.selectorText)) css.push(r.cssText); }
    const st = document.createElementNS("http://www.w3.org/2000/svg", "style"); st.textContent = css.join("\n"); c.insertBefore(st, c.firstChild);
    await Promise.all(Array.from(c.querySelectorAll("image")).map(async img => { const href = img.getAttribute("href"); if (!href || href.startsWith("data:")) return;
      try { const b = await (await fetch(href)).blob(); const d = await new Promise<string>(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(b); }); img.setAttribute("href", d); } catch { img.remove(); } }));
    return new XMLSerializer().serializeToString(c);
  };
  const doExport = async (kind: "svg" | "png" | "json" | "print") => {
    setExportOpen(false);
    if (kind === "json") { download(new Blob([JSON.stringify({ format: "gala-plan", version: 1, mode, elements: els }, null, 2)], { type: "application/json" }), `${fileBase}.json`); return; }
    toast("Preparing export…"); const markup = await exportSvg(); if (!markup) return;
    if (kind === "svg") { download(new Blob([markup], { type: "image/svg+xml" }), `${fileBase}.svg`); return; }
    if (kind === "print") { const w = window.open("", "_blank", "noopener=no"); if (!w) { toast("Allow pop-ups to print"); return; }
      w.document.write(`<!doctype html><title>${fileBase}</title><style>@page{size:landscape;margin:12mm}body{margin:0}svg{width:100%;height:auto}</style>${markup}`); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); return; }
    const img = new Image(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`; await img.decode().catch(() => null);
    const cv = document.createElement("canvas"); cv.width = Math.min(8000, img.naturalWidth || 2000); cv.height = Math.round(cv.width * ((img.naturalHeight || 1200) / (img.naturalWidth || 2000)));
    const g = cv.getContext("2d"); if (!g) return; g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
    cv.toBlob(b => { if (b) download(b, `${fileBase}.png`); else toast("Couldn’t create the image"); }, "image/png");
  };
  const importJson = async (f: File) => {
    try {
      const j = JSON.parse(await f.text()) as { format?: string; elements?: unknown };
      const list = Array.isArray(j) ? j : j.elements;
      if (!Array.isArray(list) || list.length > 2000 || !list.every(x => x && typeof x === "object" && typeof (x as MapEl).type === "string" && typeof (x as MapEl).label === "string")) throw new Error("bad");
      commit((list as MapEl[]).map(x => ({ ...x, label: String(x.label).slice(0, 60) }))); setSel([]); toast(`Imported ${list.length} items. Undo reverts the import.`);
    } catch { toast("That file isn’t a Gala Dock plan export (.json)."); }
  };

  useEffect(() => { if (!dirty) return; const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [dirty]);
  useEffect(() => { if (focusName) { nameRef.current?.focus(); nameRef.current?.select(); } }, [focusName]);
  const applyCalib = () => {
    if (!calib) return; const real = Number(calib.m), u = s;
    if (real > 0 && u?.type === "underlay") { const f = (real * UNITS_PER_M) / Math.max(1e-6, dist(calib.a, calib.b)), ox = u.x ?? 0, oy = u.y ?? 0, a = calib.a;
      commit(l => l.map((q, j) => j === sel[0] ? { ...q, w: (q.w ?? 0) * f, h: (q.h ?? 0) * f, x: a[0] - (a[0] - ox) * f, y: a[1] - (a[1] - oy) * f } : q)); toast("Drawing scaled to real-world metres"); }
    setCalib(null); setDraft([]); setTool("select");
  };

  const visible = els.map(e => ({ ...e, hidden: e.hidden || hiddenGroups.includes(groupOf(e)) || (!!e.layer && hiddenLayers.includes(e.layer)) }));
  const placed = new Set(els.filter(e => e.type === "room" && e.space).map(e => e.space));
  const totals = useMemo(() => {
    let seatN = 0, tableSeatN = 0, tables = 0, standing = 0, blocked = 0;
    for (const e of [...base, ...els]) { const d = ASSET[e.asset ?? ""]; if (!d) continue;
      if (d.kind === "seating" && e.seating) { const n = e.seating.rows * e.seating.cols; seatN += n; blocked += Object.values(e.seatFlags ?? {}).filter(f => f === "blocked").length; }
      if (d.kind === "table" && e.table) { tables += 1; tableSeatN += e.table.seats; blocked += Object.values(e.seatFlags ?? {}).filter(f => f === "blocked").length; }
      if (d.capacity && e.capacity) standing += e.capacity; }
    return { seatN, tableSeatN, tables, standing, blocked };
  }, [els, base]);
  const tierColor = useCallback((t?: string | null) => tiers.find(x => x.id === t)?.color, [tiers]);
  const used = useMemo(() => { const m = new Map<string, number>(); for (const e of [...base, ...els]) if (e.type === "asset" && e.asset && ASSET[e.asset]) m.set(e.asset, (m.get(e.asset) ?? 0) + 1); return [...m.entries()].sort((a, b) => ASSETS.findIndex(x => x.key === a[0]) - ASSETS.findIndex(x => x.key === b[0])); }, [base, els]);
  const tierUse = useMemo(() => { const m = new Map<string, number>(); for (const e of els) { const d = ASSET[e.asset ?? ""]; if (!d) continue;
    const keys = d.kind === "seating" && e.seating ? blockSeats(e.seating).map(q => q.key) : d.kind === "table" && e.table ? tableSeats(e.table).map(q => q.key) : [];
    if (!keys.length && e.tier) m.set(e.tier, (m.get(e.tier) ?? 0) + (e.capacity ?? 0));
    for (const k of keys) { const t = e.seatTiers?.[k] ?? e.tier; if (t) m.set(t, (m.get(t) ?? 0) + 1); } } return m; }, [els]);
  const scaleBar = (() => { const target = view.w / 6 / UNITS_PER_M, steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]; const m = steps.find(x => x >= target) ?? 1000; return { m, u: m * UNITS_PER_M }; })();
  const hr = view.w / 140;
  const shownAssets = ASSETS.filter(a => !query || `${a.label} ${a.cat}`.toLowerCase().includes(query.toLowerCase()));
  const seatList = s?.seating ? blockSeats(s.seating) : s?.table ? tableSeats(s.table) : [];

  return <div ref={wrap} tabIndex={-1} className={`mb${full ? " full" : ""}${sideOpen ? " side-open" : ""}`} style={{ ["--mb-h" as string]: `${height}px` }} onContextMenu={e => { e.preventDefault(); if (sel.length) { const r = wrap.current!.getBoundingClientRect(); setMenu({ x: e.clientX - r.left, y: e.clientY - r.top }); } }}>
    <DesignFonts elements={els} />
    <div className="mb-bar" role="toolbar" aria-label="Plan tools">
      {title && <b className="mb-title">{title}</b>}
      {TOOLS.map(([t, Icon, label, k]) => <button key={t} type="button" className={tool === t ? "on" : ""} aria-pressed={tool === t} aria-label={label} title={`${label} (${k})`} onClick={() => { setTool(t); setDraft([]); setPlacing(null); }}><Icon aria-hidden="true" /></button>)}
      <button type="button" className={panel === "assets" && sideOpen ? "on" : ""} aria-label="Assets library" title="Assets library (A)" onClick={() => { setPanel("assets"); setSideOpen(o => panel !== "assets" || !o); }}><Shapes aria-hidden="true" /></button>
      <span className="mb-sep" />
      <button type="button" aria-label="Upload floor plan or drawing" title="Upload floor plan or layout drawing" onClick={() => { uploadKind.current = "plan"; fileRef.current?.click(); }}><ImagePlus aria-hidden="true" /></button>
      <button type="button" aria-label="Upload aerial image" title="Upload aerial / bird’s-eye image" onClick={() => { uploadKind.current = "aerial"; fileRef.current?.click(); }}><Satellite aria-hidden="true" /></button>
      <button type="button" aria-label="Street map and location" title="Street map & location finder" className={panel === "map" && sideOpen ? "on" : ""} onClick={addBasemap}><MapIcon aria-hidden="true" /></button>
      <button type="button" aria-label="Calibrate drawing scale" title="Calibrate selected drawing (click two points, enter distance)" disabled={s?.type !== "underlay"} className={tool === "calibrate" ? "on" : ""} onClick={() => { setTool("calibrate"); setDraft([]); toast("Click two points a known distance apart"); }}><Crosshair aria-hidden="true" /></button>
      <span className="mb-sep" />
      <button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!past.length} onClick={undo}><Undo2 aria-hidden="true" /></button>
      <button type="button" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!future.length} onClick={redo}><Redo2 aria-hidden="true" /></button>
      <button type="button" aria-label="Snap to grid" title="Snap to grid" className={snap ? "on" : ""} aria-pressed={snap} onClick={() => setSnap(v => !v)}><Magnet aria-hidden="true" /></button>
      <select className="mb-step" aria-label="Grid and snap size" title="Grid / snap size" value={step} onChange={e => setStep(Number(e.target.value))}><option value={1}>0.1 m</option><option value={5}>0.5 m</option><option value={10}>1 m</option><option value={50}>5 m</option></select>
      <button type="button" aria-label="Show grid" title="Show grid" className={grid ? "on" : ""} aria-pressed={grid} onClick={() => setGrid(v => !v)}><Grid3x3 aria-hidden="true" /></button>
      <button type="button" aria-label="Legend" title="Legend / key (L)" className={legend ? "on" : ""} aria-pressed={legend} onClick={() => setLegend(v => !v)}><BookOpen aria-hidden="true" /></button>
      <button type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setHelp(h => !h)}><Keyboard aria-hidden="true" /></button>
      <span className="mb-sep" />
      <span className="mb-pop-wrap"><button type="button" aria-label="Export or import" title="Export / import" aria-expanded={exportOpen} className={exportOpen ? "on" : ""} onClick={() => setExportOpen(o => !o)}><Download aria-hidden="true" /></button>
        {exportOpen && <div className="mb-menu mb-export" role="menu" onPointerDown={e => e.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => void doExport("png")}><Download aria-hidden="true" />Export PNG image</button>
          <button type="button" role="menuitem" onClick={() => void doExport("svg")}><Download aria-hidden="true" />Export SVG (vector)</button>
          <button type="button" role="menuitem" onClick={() => void doExport("print")}><Printer aria-hidden="true" />Print / save as PDF</button>
          <hr />
          <button type="button" role="menuitem" onClick={() => void doExport("json")}><Download aria-hidden="true" />Export plan file (.json)</button>
          <button type="button" role="menuitem" onClick={() => { setExportOpen(false); importRef.current?.click(); }}><FileUp aria-hidden="true" />Import plan file…</button></div>}</span>
      <span className="ws-spacer" />
      <span className="mb-status" aria-live="polite">{dirty ? "Unsaved changes" : draftVersion ? `Draft v${draftVersion} saved${version ? ` · v${version} live` : ""}` : version ? `Version ${version} live` : "Not published"}</span>
      <button type="button" className="mb-txt" disabled={pending || !dirty} onClick={() => save(false)}>{pending ? <Loader2 aria-hidden="true" className="k-spin" /> : <Save aria-hidden="true" />}Save draft</button>
      {!hidePublish && <span className="mb-pop-wrap"><button type="button" className="mb-txt primary" disabled={pending || (!dirty && version > 0 && !draftVersion)} aria-expanded={confirmPub} onClick={() => setConfirmPub(v => !v)}><Upload aria-hidden="true" />Publish</button>
        {confirmPub && <div className="mb-pop right" role="dialog" aria-label="Publish layout"><b>{mode === "event" ? "Publish this event layout?" : "Publish this venue plan?"}</b>
          <p>{mode === "event" ? "Seat and area inventory for ticketing updates to match. Sold or held seats must stay on the plan." : "Organisers planning events here will see the new version."}</p>
          <div className="mb-pop-acts"><button type="button" className="ws-btn ghost sm" onClick={() => setConfirmPub(false)}>Cancel</button><button type="button" className="ws-btn primary sm" disabled={pending} onClick={() => save(true)}>Publish</button></div></div>}</span>}
      <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ""; }} />
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f, uploadKind.current); e.target.value = ""; }} />
    </div>
    <div className="mb-body">
      <div className={`mb-canvas tool-${tool}`} onDragOver={e => { if (!e.dataTransfer.types.includes("text/x-plan-asset")) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy";
          const k = dragKey.current; if (k && ASSET[k]?.kind !== "line") { const [x, y] = world(e); setGhost(g => g && g.key === k && Math.abs(g.x - x) < 0.5 && Math.abs(g.y - y) < 0.5 ? g : { key: k, x, y }); } }}
        onDragLeave={e => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setGhost(null); }}
        onDrop={e => { const k = e.dataTransfer.getData("text/x-plan-asset"); setGhost(null); dragKey.current = null; if (!k) return; e.preventDefault(); const [x, y] = world(e); placeAt(k, x, y); }}>
        <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="vm mb-svg" onPointerDown={onCanvasDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => setCursor(null)}
          onWheel={onWheel} onDoubleClick={() => finishDraft()} role="application" aria-label="Plan editor">
          <MapDefs />
          <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="#f6f9fc" />
          {grid && <><rect className="mb-gridbg" x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#vm-grid)" /><rect className="mb-gridbg" x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#vm-grid-m)" /></>}
          {base.length > 0 && <g className="mb-base" opacity={0.85} pointerEvents="none"><MapContent px={px} elements={base} spaces={spaces} labelSize={13 / scale} span={view} detail={detail} tierColor={tierColor} /></g>}
          <MapContent px={px} elements={visible} spaces={spaces} selectedSet={new Set(sel)} labelSize={13 / scale} onElDown={onElDown} span={view} detail={detail} tierColor={tierColor}
            selectedSeats={seats?.keys} onSeat={onSeat}>
            {s && !s.hidden && (() => { const b = elBounds(s);
              if (isPoly(s)) return <g>{s.points!.map((p, v) => <Handle key={`v${v}`} x={p[0]} y={p[1]} r={hr} cursor="move" kind="vertex" n={v} onDown={onHandleDown} />)}</g>;
              const rotated = !!s.rot, canRotate = editable(s) && s.type === "asset" && !s.points;
              const cur = (n: number) => { const base = n % 2 ? 135 : 45, a = (((base + (s.rot ?? 0)) % 180) + 180) % 180; return a < 22.5 || a >= 157.5 ? "ew-resize" : a < 67.5 ? "nwse-resize" : a < 112.5 ? "ns-resize" : "nesw-resize"; };
              return <g transform={rotated ? `rotate(${s.rot} ${b.x + b.w / 2} ${b.y + b.h / 2})` : undefined}><rect x={b.x} y={b.y} width={b.w} height={b.h} className="mb-selbox" />
                {editable(s) && !s.seating && !s.table && !["label", "basemap"].includes(s.type) && ASSET[s.asset ?? ""]?.kind !== "point" && [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([hx, hy], n) =>
                  <Handle key={`c${n}`} x={hx} y={hy} r={hr} cursor={cur(n)} kind="resize" n={n} onDown={onHandleDown} />)}
                {canRotate && <g><line x1={b.x + b.w / 2} y1={b.y} x2={b.x + b.w / 2} y2={b.y - hr * 6} className="mb-rot-stem" />
                  <circle cx={b.x + b.w / 2} cy={b.y - hr * 6} r={hr * 1.15} className="mb-rot-handle" onPointerDown={e => onHandleDown(e, "rotate", 0)}><title>Drag to rotate · Shift snaps to 15°</title></circle>
                  {rotating && <text x={b.x + b.w / 2} y={b.y - hr * 9} textAnchor="middle" className="mb-dim" style={{ fontSize: 11 / scale }}>{s.rot ?? 0}°</text>}</g>}
                {(s.w ?? 0) > 0 && s.type !== "basemap" && <text x={b.x + b.w / 2} y={b.y - view.w / 160} textAnchor="middle" className="mb-dim" style={{ fontSize: 11 / scale }}>{mm(b.w)} m × {mm(b.h)} m</text>}</g>; })()}
            {sel.length > 1 && sel.map(i => { const b = elBounds(els[i]); return <rect key={`ms${i}`} x={b.x} y={b.y} width={b.w} height={b.h} className="mb-selbox" />; })}
            {draft.length === 2 && tool === "room" && <g className="mb-draft"><rect x={Math.min(draft[0][0], draft[1][0])} y={Math.min(draft[0][1], draft[1][1])} width={Math.abs(draft[1][0] - draft[0][0])} height={Math.abs(draft[1][1] - draft[0][1])} />
              <text x={(draft[0][0] + draft[1][0]) / 2} y={Math.min(draft[0][1], draft[1][1]) - 6} textAnchor="middle" className="mb-dim" style={{ fontSize: 11 / scale }}>{mm(Math.abs(draft[1][0] - draft[0][0]))} m × {mm(Math.abs(draft[1][1] - draft[0][1]))} m</text></g>}
            {draft.length > 0 && ["poly", "wall", "line", "calibrate", "curve"].includes(tool) && <g className="mb-draft">
              <polyline points={[...draft, ...(cursor ? [[sn(cursor[0]), sn(cursor[1])]] : [])].map(p => p.join(",")).join(" ")} />
              {draft.map((p, v) => <circle key={v} cx={p[0]} cy={p[1]} r={view.w / 220} />)}
              {cursor && <text x={cursor[0] + 8} y={cursor[1] - 8} className="mb-dim" style={{ fontSize: 11 / scale }}>{mm(dist(draft[draft.length - 1], cursor))} m</text>}</g>}
            {highlights.length > 0 && els.map((e, i) => { const h = e.id ? highlights.find(x => x.id === e.id) : undefined; if (!h || e.hidden) return null; const b = elBounds(e);
              return <rect key={`hl${i}`} x={b.x - hr} y={b.y - hr} width={b.w + hr * 2} height={b.h + hr * 2} className={`mb-finding ${h.severity}`} pointerEvents="none"><title>{h.severity === "error" ? "Blocking issue" : "Warning"}</title></rect>; })}
            {marquee && <rect className="mb-marquee" x={Math.min(marquee[0][0], marquee[1][0])} y={Math.min(marquee[0][1], marquee[1][1])} width={Math.abs(marquee[1][0] - marquee[0][0])} height={Math.abs(marquee[1][1] - marquee[0][1])} />}
            {measure && <g className="mb-measure"><line x1={measure[0][0]} y1={measure[0][1]} x2={measure[1][0]} y2={measure[1][1]} />
              <text x={(measure[0][0] + measure[1][0]) / 2} y={(measure[0][1] + measure[1][1]) / 2 - 8} textAnchor="middle" className="mb-dim" style={{ fontSize: 11 / scale }}>{mm(dist(measure[0], measure[1]))} m</text></g>}
            {tool === "place" && placing && cursor && !ghost && <Ghost k={placing} x={cursor[0]} y={cursor[1]} sn={sn} scale={scale} detail={detail} />}
            {ghost && <Ghost k={ghost.key} x={ghost.x} y={ghost.y} sn={sn} scale={scale} detail={detail} />}
          </MapContent>
          {[...base, ...els].some(e => e.type === "basemap" && !e.hidden) && !hiddenGroups.includes("base") && <text x={view.x + view.w - view.w / 80} y={view.y + view.h - view.h / 14} textAnchor="end" className="vm-attr" style={{ fontSize: view.w / 110 }}>{MAP_ATTRIBUTION}</text>}
        </svg>
        <div className="mb-zoom"><button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomBy(1 / 1.25)}><ZoomIn aria-hidden="true" /></button><button type="button" aria-label="Zoom out" title="Zoom out (−)" onClick={() => zoomBy(1.25)}><ZoomOut aria-hidden="true" /></button>
          <button type="button" aria-label="Fit to plan" title="Fit (0)" onClick={fit}><Scan aria-hidden="true" /></button><button type="button" aria-label={full ? "Exit full screen" : "Full screen"} title="Full screen (F)" onClick={() => setFull(f => !f)}>{full ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}</button>
          <button type="button" className="mb-side-toggle" aria-label="Panels" aria-pressed={sideOpen} onClick={() => setSideOpen(o => !o)}><Layers aria-hidden="true" /></button></div>
        <div className="mb-foot"><span className="mb-scale"><i style={{ width: `${(scaleBar.u / view.w) * 100}%` }} />{scaleBar.m} m</span>
          {cursor && <span>{mm(cursor[0])} m, {mm(cursor[1])} m</span>}
          <span className="mb-totals">{totals.seatN + totals.tableSeatN > 0 && <>{(totals.seatN + totals.tableSeatN - totals.blocked).toLocaleString("en-GB")} sellable seats{totals.tables ? ` · ${totals.tables} tables` : ""}</>}{totals.standing > 0 && <> · {totals.standing.toLocaleString("en-GB")} standing</>}</span>
          <span className="mb-hint">{tool === "place" ? "Click to place · Shift-click to place several" : tool === "poly" ? "Click corners · click first point or double-click to close" : tool === "wall" || tool === "line" ? "Click points · double-click or Enter to finish" : tool === "select" ? (detail ? "Click seats to select · Shift+click for more · drag to move" : "Drag to move · Shift+drag box-selects · zoom in to edit seats") : tool === "measure" ? "Drag to measure" : "Drag to draw"}</span></div>
        {calib && <form className="mb-pop mb-calib" onSubmit={e => { e.preventDefault(); applyCalib(); }} onPointerDown={e => e.stopPropagation()}><b>Set drawing scale</b>
          <label>Real distance between the two points (metres)<input type="number" min={0.1} step={0.1} required autoFocus value={calib.m} onChange={e => setCalib(c => c && { ...c, m: e.target.value })} /></label>
          <div className="mb-pop-acts"><button type="button" className="ws-btn ghost sm" onClick={() => { setCalib(null); setDraft([]); setTool("select"); }}>Cancel</button><button className="ws-btn primary sm">Apply scale</button></div></form>}
        {menu && s !== undefined && <div className="mb-menu" style={{ left: menu.x, top: menu.y }} role="menu" onPointerDown={e => e.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => { setClip(sel.map(i => els[i])); toast(`${sel.length} copied`); setMenu(null); }}><Copy aria-hidden="true" />Copy<kbd>Ctrl C</kbd></button>
          <button type="button" role="menuitem" disabled={!clip.length} onClick={() => { const c = clip.map(x => shift({ ...x, id: newId("paste"), protected: false }, 30, 30)); commit(l => [...l, ...c]); setSel(c.map((_, j) => els.length + j)); setMenu(null); }}><ClipboardPaste aria-hidden="true" />Paste<kbd>Ctrl V</kbd></button>
          <button type="button" role="menuitem" onClick={() => { duplicate(); setMenu(null); }}><Copy aria-hidden="true" />Duplicate<kbd>Ctrl D</kbd></button>
          <button type="button" role="menuitem" onClick={() => { rotate(90); setMenu(null); }}><RotateCw aria-hidden="true" />Rotate 90° right</button>
          <button type="button" role="menuitem" onClick={() => { rotate(-90); setMenu(null); }}><RotateCcw aria-hidden="true" />Rotate 90° left</button>
          <button type="button" role="menuitem" onClick={() => { flip("h"); setMenu(null); }}><FlipHorizontal2 aria-hidden="true" />Flip horizontal<kbd>Shift H</kbd></button>
          <button type="button" role="menuitem" onClick={() => { flip("v"); setMenu(null); }}><FlipVertical2 aria-hidden="true" />Flip vertical<kbd>Shift V</kbd></button>
          <hr />
          <button type="button" role="menuitem" onClick={() => { commit(l => [...l.filter((_, j) => !sel.includes(j)), ...sel.map(i => l[i])]); setSel(sel.map((_, k) => els.length - sel.length + k)); setMenu(null); }}><ArrowUpToLine aria-hidden="true" />Bring to front</button>
          <button type="button" role="menuitem" onClick={() => { commit(l => [...sel.map(i => l[i]), ...l.filter((_, j) => !sel.includes(j))]); setSel(sel.map((_, k) => k)); setMenu(null); }}><ArrowDownToLine aria-hidden="true" />Send to back</button>
          <button type="button" role="menuitem" onClick={() => { commit(l => l.map((x, j) => sel.includes(j) ? { ...x, locked: !x.locked } : x)); setMenu(null); }}><Lock aria-hidden="true" />Lock / unlock</button>
          <button type="button" role="menuitem" onClick={() => { commit(l => l.map((x, j) => sel.includes(j) ? { ...x, hidden: true } : x)); setSel([]); setMenu(null); toast("Hidden. Show it again from Layers."); }}><EyeOff aria-hidden="true" />Hide</button>
          {sel.some(i => ASSET[els[i]?.asset ?? ""]?.kind === "table") && <button type="button" role="menuitem" onClick={() => { renumberTables(); setMenu(null); }}><ListOrdered aria-hidden="true" />Renumber tables</button>}
          {sel.some(i => !!els[i]?.seating) && <button type="button" role="menuitem" onClick={() => { renumberBlocks(); setMenu(null); }}><ListOrdered aria-hidden="true" />Rename blocks A, B, C…</button>}
          <hr />
          <button type="button" role="menuitem" className="danger" onClick={() => { removeSel(); setMenu(null); }}><Trash2 aria-hidden="true" />Delete<kbd>Del</kbd></button></div>}
        {help && <div className="mb-help" role="dialog" aria-label="Keyboard shortcuts"><header><b><Keyboard aria-hidden="true" />Keyboard shortcuts</b><button type="button" aria-label="Close" onClick={() => setHelp(false)}><X aria-hidden="true" /></button></header>
          <dl>{SHORTCUTS.map(([k, v]) => <div key={k}><dt>{k.split(" / ").map((x, i) => <span key={x}>{i > 0 && " / "}<kbd>{x}</kbd></span>)}</dt><dd>{v}</dd></div>)}</dl></div>}
        {legend && <div className="mb-legend" role="dialog" aria-label="Plan legend"><header>Legend<button type="button" aria-label="Close legend" onClick={() => setLegend(false)}><X aria-hidden="true" /></button></header>
          {used.length > 0 ? <><h5>On this plan</h5><ul>{used.map(([key, n]) => { const d = ASSET[key]; return <li key={key}><span style={{ background: d.fill, color: d.stroke }}>{ASSET_IMG[key] ? <img src={ASSET_IMG[key]} alt="" className="mb-gd-ic" /> : <d.icon aria-hidden="true" />}</span>{d.label}
              {ASSET_SWATCH[key] && <img src={ASSET_SWATCH[key]} alt="" className="mb-gd-sw" />}<em>{n}</em></li>; })}</ul></>
            : <p className="mb-note">Nothing placed yet.</p>}
          {tiers.length > 0 && <><h5>Ticket tiers</h5><ul>{tiers.map(t => <li key={t.id}><span><i className="dot" style={{ background: t.color }} /></span>{t.name}<em>{tierUse.get(t.id) ?? 0}</em></li>)}</ul></>}
          {totals.seatN + totals.tableSeatN > 0 && <><h5>Seats</h5><ul>
            {([["#fff", "#2f6bff", "Available"], ["#c3c8d8", "#9aa1bd", "Blocked"], ["#e0f2fe", "#0284c7", "Accessible"], ["#fff0d9", "#e08a00", "Restricted view"]] as const).map(([f, st, l]) => <li key={l}><span>{l === "Blocked" ? <img src={KILL_SEATS_SWATCH} alt="" className="mb-gd-sw" /> : <i className="dot" style={{ background: f, border: `1.5px solid ${st}` }} />}</span>{l}</li>)}</ul></>}
        </div>}
      </div>
      <aside className="mb-side">
        <nav className="mb-tabs"><button type="button" className={panel === "assets" ? "on" : ""} onClick={() => setPanel("assets")}><Shapes aria-hidden="true" />Assets</button>
          <button type="button" className={panel === "design" ? "on" : ""} onClick={() => setPanel("design")}><Palette aria-hidden="true" />Design</button>
          <button type="button" className={panel === "layers" ? "on" : ""} onClick={() => setPanel("layers")}><Layers aria-hidden="true" />Layers</button>
          <button type="button" className={panel === "map" ? "on" : ""} onClick={() => setPanel("map")}><MapIcon aria-hidden="true" />Map</button>
          <button type="button" className={panel === "inspect" ? "on" : ""} onClick={() => setPanel("inspect")}>Edit</button></nav>
        {panel === "assets" && <div className="mb-assets">
          <label className="mb-search"><Search aria-hidden="true" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search assets…" aria-label="Search assets" /></label>
          {!query && <section className="mb-presets"><h4>Quick layouts</h4><ul>{PRESETS.map(p => <li key={p.key}><button type="button" onClick={() => { const cx = view.x + view.w / 2, cy = view.y + view.h / 2, add = p.build(cx, cy).map(tag); commit(l => [...l, ...add]); setSel(add.map((_, k) => els.length + k)); setPanel("inspect"); toast(`${p.label} added — drag to position`); }}>
            <b>{p.label}</b><small>{p.sub}</small></button></li>)}</ul></section>}
          {ASSET_CATS.map(cat => { const items = shownAssets.filter(a => a.cat === cat); if (!items.length) return null; return <section key={cat}><h4>{cat}</h4><ul className="mb-tiles">{items.map(a => <li key={a.key}>
            <button type="button" draggable onDragStart={e => { e.dataTransfer.setData("text/x-plan-asset", a.key); e.dataTransfer.effectAllowed = "copy"; dragKey.current = a.key; }}
              onDragEnd={() => { dragKey.current = null; setGhost(null); }} className={placing === a.key ? "on" : ""}
              onClick={() => { if (a.kind === "line") placeAt(a.key, 0, 0); else { setTool("place"); setPlacing(a.key); } }} title={`${a.label} — drag onto the plan or click then place`}>
              <span style={{ background: a.fill, color: a.stroke }}>{ASSET_IMG[a.key] ? <img src={ASSET_IMG[a.key]} alt="" className="mb-gd-ic" /> : <a.icon aria-hidden="true" />}</span>{a.label}</button></li>)}</ul></section>; })}
        </div>}
        {panel === "map" && <div className="mb-props mb-mappanel">
          <h4>Find a location</h4>
          <form className="mb-search" role="search" onSubmit={e => { e.preventDefault(); void findPlace(); }}><Search aria-hidden="true" /><input value={geoQ} onChange={e => setGeoQ(e.target.value)} placeholder="Address, place or postcode" aria-label="Search for a location" />{geoBusy && <Loader2 aria-hidden="true" className="k-spin" />}</form>
          {geoHits.length > 0 && <ul className="mb-geo" aria-label="Search results">{geoHits.map(h => <li key={`${h.lat},${h.lng}`}><button type="button" onClick={() => placeBasemap(h)}><MapPin aria-hidden="true" /><span>{h.label}</span></button></li>)}</ul>}
          {geo && <button type="button" className="ws-btn outline sm" onClick={() => placeBasemap({ label: "the venue address", ...geo })}><LocateFixed aria-hidden="true" />Use venue address</button>}
          {bm ? <>
            <h4>Street map</h4>
            <p className="mb-note">Centred on {bm.lat?.toFixed(5)}, {bm.lng?.toFixed(5)}. Drawn at true scale: 1 m on the map is 1 m on your plan.</p>
            <label>Map style<select className="ws-select" value={bm.mapStyle ?? "streets"} onChange={e => setBm({ mapStyle: e.target.value })}>{MAP_STYLES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
            <label>Opacity<span className="mb-rot"><input type="range" min={0.1} max={1} step={0.05} value={bm.opacity ?? 0.6} onChange={e => setBm({ opacity: Number(e.target.value) })} /><em>{Math.round((bm.opacity ?? 0.6) * 100)}%</em></span></label>
            <label>Rotate map to match the plan<span className="mb-rot"><input type="range" min={-180} max={180} value={bm.rot ?? 0} onChange={e => setBm({ rot: Number(e.target.value) || undefined })} /><em>{bm.rot ?? 0}°</em></span></label>
            <label className="mb-check"><input type="checkbox" checked={!hiddenGroups.includes("base")} onChange={e => setHiddenGroups(g => e.target.checked ? g.filter(x => x !== "base") : [...g, "base"])} />Show street map</label>
            <label className="mb-check"><input type="checkbox" checked={!!bm.locked && lockedGroups.includes("base")} onChange={e => { setBm({ locked: e.target.checked }); setLockedGroups(g => e.target.checked ? [...new Set([...g, "base"])] : g.filter(x => x !== "base")); if (!e.target.checked) toast("Map unlocked: drag it to line it up with your plan, then lock it again."); }} />Lock map position</label>
            <div className="mb-acts"><button type="button" className="danger" title="Remove street map" aria-label="Remove street map" onClick={() => { commit(l => l.filter((_, j) => j !== bmi)); setSel([]); }}><Trash2 aria-hidden="true" /></button></div>
          </> : <p className="mb-empty">Search for the site, or use the venue address, to place a street map under your plan. Then add stages, zones and facilities on top at real-world scale.</p>}
          <p className="mb-attr">{MAP_ATTRIBUTION}</p>
        </div>}
        {panel === "layers" && <div className="mb-layers">
          <section className="mb-ulayers"><header><b>Your layers</b><small>{layerDefs.length}</small><button type="button" aria-label="New blank layer" title="New blank layer" onClick={newLayer}><Plus aria-hidden="true" /></button></header>
            <ul>
              <li className={!activeLayer ? "on" : ""}><button type="button" className="mb-lname" aria-pressed={!activeLayer} onClick={() => setActiveLayer(null)}>No layer<em>{layerCount(null)}</em></button></li>
              {layerDefs.map((L, k) => { const id = L.id!, hid = hiddenLayers.includes(id), lock = lockedLayers.includes(id);
                return <li key={id} className={activeLayer === id ? "on" : ""}>
                  {renaming === id ? <input className="mb-lrename" autoFocus defaultValue={L.label} maxLength={40} aria-label="Layer name" onBlur={e => renameLayer(id, e.target.value)} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }} />
                    : <button type="button" className="mb-lname" aria-pressed={activeLayer === id} title="Click to add new items to this layer · double-click to rename" onClick={() => setActiveLayer(id)} onDoubleClick={() => setRenaming(id)}>{L.label}<em>{layerCount(id)}</em></button>}
                  <button type="button" className="mb-mini" aria-label={hid ? `Show ${L.label}` : `Hide ${L.label}`} onClick={() => setHiddenLayers(h => hid ? h.filter(x => x !== id) : [...h, id])}>{hid ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
                  <button type="button" className="mb-mini" aria-label={lock ? `Unlock ${L.label}` : `Lock ${L.label}`} onClick={() => setLockedLayers(h => lock ? h.filter(x => x !== id) : [...h, id])}>{lock ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}</button>
                  <button type="button" className="mb-mini" aria-label={`Rename ${L.label}`} onClick={() => setRenaming(id)}><Pencil aria-hidden="true" /></button>
                  <button type="button" className="mb-mini" aria-label={`Move ${L.label} down (behind)`} disabled={k === 0} onClick={() => moveLayer(id, -1)}><ChevronUp aria-hidden="true" /></button>
                  <button type="button" className="mb-mini" aria-label={`Move ${L.label} up (in front)`} disabled={k === layerDefs.length - 1} onClick={() => moveLayer(id, 1)}><ChevronDown aria-hidden="true" /></button>
                  <button type="button" className="mb-mini danger" aria-label={`Delete ${L.label}`} onClick={() => deleteLayer(id)}><Trash2 aria-hidden="true" /></button></li>; })}
            </ul>
            <p className="mb-note">{activeLayer ? <>New items go on “{layerDefs.find(L => L.id === activeLayer)?.label}”.</> : layerDefs.length ? "Pick a layer to draw on it. Later layers draw on top." : "Add blank layers to organise the plan, e.g. Production, Catering, Security."}</p>
          </section>
          {GROUPS.map(([g, label, pred]) => { const items = els.map((e, i) => ({ e, i })).filter(x => pred(x.e)); if (!items.length && g !== "rooms") return null;
          if (g === "rooms" && mode === "event" && !items.length) return null;
          const hid = hiddenGroups.includes(g), lock = lockedGroups.includes(g);
          return <section key={g}><header><b>{label}</b><small>{items.length}</small>
            <button type="button" aria-label={hid ? `Show ${label}` : `Hide ${label}`} onClick={() => setHiddenGroups(h => hid ? h.filter(x => x !== g) : [...h, g])}>{hid ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
            <button type="button" aria-label={lock ? `Unlock ${label}` : `Lock ${label}`} onClick={() => setLockedGroups(h => lock ? h.filter(x => x !== g) : [...h, g])}>{lock ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}</button></header>
            <ul>{items.map(({ e, i }) => { const nm = e.type === "room" ? spaces.find(sp => sp.id === e.space)?.name ?? e.label : e.label; return <li key={i} className="mb-item"><button type="button" className={`${sel.includes(i) ? "on" : ""}${e.hidden ? " off" : ""}`} onClick={ev => { setSel(ev.shiftKey ? [...sel, i] : [i]); setPanel("inspect"); }}>
              {nm}{e.protected ? <ShieldAlert aria-label="Protected" /> : null}</button>
              <button type="button" className="mb-mini" aria-label={e.hidden ? `Show ${nm}` : `Hide ${nm}`} title={e.hidden ? "Show" : "Hide (hidden items aren’t published)"} onClick={() => commit(l => l.map((x, j) => j === i ? { ...x, hidden: x.hidden ? undefined : true } : x))}>{e.hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
              <button type="button" className="mb-mini" aria-label={e.locked ? `Unlock ${nm}` : `Lock ${nm}`} onClick={() => commit(l => l.map((x, j) => j === i ? { ...x, locked: !x.locked } : x))}>{e.locked ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}</button></li>; })}
              {g === "rooms" && mode === "venue" && spaces.filter(sp => !placed.has(sp.id)).map(sp => <li key={sp.id} className="mb-unplaced"><button type="button" onClick={() => { setTool("room"); toast(`Draw a rectangle, then link it to ${sp.name}`); }}>{sp.name}<em>Not on map</em></button></li>)}</ul></section>; })}</div>}
        {panel === "design" && <div className="mb-design"><DesignKitPanel at={{ x: view.x + view.w / 2, y: view.y + view.h / 2 }} unit={Math.max(8, Math.round(view.w / 12))}
          onAdd={d => { commit(l => [...l, tag({ ...(d as MapEl), id: newId(d.type) })]); setSel([els.length]); setPanel("inspect"); }} /></div>}
        {panel === "inspect" && (sel.length > 1 ? <div className="mb-props"><p className="mb-note">{sel.length} items selected</p>
          <div className="mb-align">{([["l", AlignStartVertical, "Align left"], ["c", AlignCenterVertical, "Align centre"], ["r", AlignEndVertical, "Align right"], ["t", AlignStartHorizontal, "Align top"], ["m", AlignCenterHorizontal, "Align middle"], ["b", AlignEndHorizontal, "Align bottom"],
            ["dh", AlignHorizontalSpaceAround, "Distribute horizontally"], ["dv", AlignVerticalSpaceAround, "Distribute vertically"]] as const).map(([k, I, t]) => <button key={k} type="button" title={t} aria-label={t} onClick={() => align(k)}><I aria-hidden="true" /></button>)}</div>
          {mode === "event" && tiers.length > 0 && (() => { const ts = new Set(sel.map(i => els[i]?.tier ?? "")); const v = ts.size === 1 ? [...ts][0] : "__mixed"; return <label>Ticket tier<select className="ws-select" value={v} onChange={e => commit(l => l.map((x, j) => sel.includes(j) && x.type === "asset" ? { ...x, tier: e.target.value || null } : x))}>{v === "__mixed" && <option value="__mixed" disabled>Mixed</option>}<option value="">No tier</option>{tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>; })()}
          {layerDefs.length > 0 && (() => { const ls = new Set(sel.map(i => els[i]?.layer ?? "")); const v = ls.size === 1 ? [...ls][0] : "__mixed"; return <label>Layer<select className="ws-select" value={v} onChange={e => moveToLayer(e.target.value)}>{v === "__mixed" && <option value="__mixed" disabled>Mixed</option>}<option value="">No layer</option>{layerDefs.map(L => <option key={L.id} value={L.id}>{L.label}</option>)}</select></label>; })()}
          <div className="mb-acts"><button type="button" title="Rotate −15° (Q)" onClick={() => rotate(-15)}><RotateCcw aria-hidden="true" /></button><button type="button" title="Rotate 15° (E)" onClick={() => rotate(15)}><RotateCw aria-hidden="true" /></button>
            <button type="button" title="Duplicate (Ctrl+D)" onClick={() => duplicate()}><Copy aria-hidden="true" /></button>
            {sel.some(i => ASSET[els[i]?.asset ?? ""]?.kind === "table") && <button type="button" title="Renumber tables" onClick={renumberTables}><ListOrdered aria-hidden="true" /></button>}
            <button type="button" title="Delete (Del)" className="danger" onClick={removeSel}><Trash2 aria-hidden="true" /></button></div></div>
          : s ? <div className="mb-props">
            {seats && seats.keys.size > 0 ? <div className="mb-seatsel"><h4><Armchair aria-hidden="true" />{seats.keys.size} seat{seats.keys.size === 1 ? "" : "s"} selected</h4>
              <p className="mb-note">{[...seats.keys].slice(0, 4).map(k => seatList.find(x => x.key === k)?.label ?? k).join(", ")}{seats.keys.size > 4 ? "…" : ""}</p>
              <div className="mb-flags">{FLAGS.map(([f, l]) => <button key={f} type="button" className={`f-${f}`} onClick={() => flagSeats(f)}>{l}</button>)}</div>
              {mode === "event" && tiers.length > 0 && <label>Ticket tier for these seats<select className="ws-select" value="" onChange={e => tierSeats(e.target.value)}><option value="">Use block tier</option>{tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
              <button type="button" className="ws-btn ghost sm" onClick={() => setSeats(null)}>Done</button></div> : null}
            <label>{s.type === "label" || s.type === "text" ? "Text" : "Name"}<input ref={nameRef} value={s.label} maxLength={60} onChange={e => setS({ label: e.target.value })} /></label>
            {isDesignEl(s) && <DesignElProps e={s as DesignEl} onChange={p => setS(p as Partial<MapEl>)} />}
            {layerDefs.length > 0 && s.type !== "basemap" && <label>Layer<select className="ws-select" value={s.layer ?? ""} onChange={e => setS({ layer: e.target.value || undefined })}><option value="">No layer</option>{layerDefs.map(L => <option key={L.id} value={L.id}>{L.label}</option>)}</select></label>}
            {s.type === "room" && mode === "venue" && <label>Linked space<select className="ws-select" value={s.space ?? ""} onChange={e => setS({ space: e.target.value || undefined, label: spaces.find(sp => sp.id === e.target.value)?.name ?? s.label })}>
              <option value="">Not linked (non-bookable area)</option>{spaces.filter(sp => sp.id === s.space || !placed.has(sp.id)).map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}</select></label>}
            {s.seating && <fieldset className="mb-fs"><legend>Seating &amp; numbering</legend>
              <div className="mb-row"><label>Rows<input type="number" min={1} max={80} value={s.seating.rows} onChange={e => setSeating({ rows: Math.max(1, Math.min(80, Number(e.target.value))) })} /></label>
                <label>Seats / row<input type="number" min={1} max={120} value={s.seating.cols} onChange={e => setSeating({ cols: Math.max(1, Math.min(120, Number(e.target.value))) })} /></label></div>
              <label>Block / section name<input value={s.seating.prefix} maxLength={12} onChange={e => setSeating({ prefix: e.target.value.replace(/[^\w ]/g, "") })} /></label>
              <div className="mb-row"><label>Rows labelled<select className="ws-select" value={s.seating.rowStyle} onChange={e => setSeating({ rowStyle: e.target.value as Seating["rowStyle"] })}><option value="alpha">A, B, C…</option><option value="numeric">1, 2, 3…</option></select></label>
                <label>Seats labelled<select className="ws-select" value={s.seating.colStyle} onChange={e => setSeating({ colStyle: e.target.value as Seating["colStyle"] })}><option value="numeric">1, 2, 3…</option><option value="alpha">A, B, C…</option></select></label></div>
              <div className="mb-row"><label>First row<input type="number" min={1} value={s.seating.rowStart} onChange={e => setSeating({ rowStart: Math.max(1, Number(e.target.value)) })} /></label>
                <label>First seat<input type="number" min={1} value={s.seating.colStart} onChange={e => setSeating({ colStart: Math.max(1, Number(e.target.value)) })} /></label></div>
              <div className="mb-row"><label>Row order<select className="ws-select" value={s.seating.rowDir} onChange={e => setSeating({ rowDir: e.target.value as Seating["rowDir"] })}><option value="front">Front → back</option><option value="back">Back → front</option></select></label>
                <label>Seat order<select className="ws-select" value={s.seating.colDir} onChange={e => setSeating({ colDir: e.target.value as Seating["colDir"] })}><option value="ltr">Left → right</option><option value="rtl">Right → left</option></select></label></div>
              <label>Aisles after seat <small>(e.g. 6, 12)</small><input value={s.seating.aisles.join(", ")} onChange={e => setSeating({ aisles: e.target.value.split(/[,\s]+/).map(Number).filter(n => n > 0 && n < (s.seating?.cols ?? 0)) })} /></label>
              <label className="mb-check"><input type="checkbox" checked={s.seating.skipIO} onChange={e => setSeating({ skipIO: e.target.checked })} />Skip letters I and O</label>
              <label>Curve rows around stage<span className="mb-rot"><input type="range" min={0} max={150} step={5} value={s.seating.curve ?? 0} onChange={e => setSeating({ curve: Number(e.target.value) || undefined })} /><em>{s.seating.curve ?? 0}°</em></span></label>
              <label className="mb-check"><input type="checkbox" checked={!!s.seating.rowOffset} onChange={e => setSeating({ rowOffset: e.target.checked ? 0.5 : undefined })} />Stagger alternate rows</label>
              <p className="mb-note">{s.seating.rows * s.seating.cols} seats · first {blockSeats(s.seating)[0]?.label}{detail ? "" : " · zoom in to select individual seats"}</p></fieldset>}
            {s.table && <fieldset className="mb-fs"><legend>Table</legend>
              <div className="mb-row"><label>Table number<input value={s.table.number} maxLength={10} onChange={e => setTable({ number: e.target.value })} /></label>
                <label>Seats<input type="number" min={1} max={24} value={s.table.seats} onChange={e => setTable({ seats: Math.max(1, Math.min(24, Number(e.target.value))) })} /></label></div>
              <div className="mb-row"><label>Shape<select className="ws-select" value={s.table.shape} onChange={e => setTable({ shape: e.target.value as TableSpec["shape"] })}><option value="round">Round</option><option value="rect">Rectangular</option></select></label>
                <label>Seats labelled<select className="ws-select" value={s.table.seatStyle} onChange={e => setTable({ seatStyle: e.target.value as TableSpec["seatStyle"] })}><option value="numeric">1, 2, 3…</option><option value="alpha">A, B, C…</option></select></label></div></fieldset>}
            {ASSET[s.asset ?? ""]?.capacity && <label>Capacity<input type="number" min={0} value={s.capacity ?? 0} onChange={e => setS({ capacity: Math.max(0, Number(e.target.value)) })} /></label>}
            {mode === "event" && tiers.length > 0 && s.type === "asset" && <label>Ticket tier<select className="ws-select" value={s.tier ?? ""} onChange={e => setS({ tier: e.target.value || null })}><option value="">Not ticketed</option>{tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
            {!isPoly(s) && !s.seating && !s.table && s.type !== "basemap" && s.type !== "label" && ASSET[s.asset ?? ""]?.kind !== "point" && <div className="mb-row"><label>Width (m)<input type="number" min={0.5} step={0.5} value={mm(s.w ?? 0)} onChange={e => setS({ w: Math.max(5, Number(e.target.value) * UNITS_PER_M) })} /></label>
              <label>Depth (m)<input type="number" min={0.5} step={0.5} value={mm(s.h ?? 0)} onChange={e => setS({ h: Math.max(5, Number(e.target.value) * UNITS_PER_M) })} /></label></div>}
            {s.type === "asset" && !s.points && <label>Rotation<span className="mb-rot"><input type="range" min={0} max={359} value={s.rot ?? 0} onChange={e => setS({ rot: Number(e.target.value) })} /><em>{s.rot ?? 0}°</em></span></label>}
            {isPoly(s) && s.type === "room" && <p className="mb-note">Area ≈ {Math.round(Math.abs(s.points!.reduce((a, p, i2) => { const q = s.points![(i2 + 1) % s.points!.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2 / UNITS_PER_M ** 2)} m² · drag corners to reshape</p>}
            {(s.type === "underlay" || s.type === "basemap") && <label>Opacity<input type="range" min={0.1} max={1} step={0.05} value={s.opacity ?? 0.6} onChange={e => setS({ opacity: Number(e.target.value) })} /></label>}
            {s.type === "underlay" && <button type="button" className="ws-btn outline sm" onClick={() => { setTool("calibrate"); setDraft([]); }}><Crosshair aria-hidden="true" />Calibrate scale</button>}
            {(s.type === "wall" || s.type === "label") && <label>{s.type === "wall" ? "Thickness" : "Text size"}<input type="number" min={1} max={120} value={s.size ?? (s.type === "wall" ? 4 : 14)} onChange={e => setS({ size: Number(e.target.value) })} /></label>}
            <label className="mb-check"><input type="checkbox" checked={!!s.locked} onChange={e => setS({ locked: e.target.checked })} />Locked in place</label>
            {s.protected && <p className="mb-note"><ShieldAlert aria-hidden="true" />Protected — can be moved but never removed or blocked.</p>}
            <div className="mb-acts">
              {s.type === "asset" && !s.points && <><button type="button" title="Rotate −15° (Q)" onClick={() => rotate(-15)}><RotateCcw aria-hidden="true" /></button><button type="button" title="Rotate 15° (E)" onClick={() => rotate(15)}><RotateCw aria-hidden="true" /></button></>}
              <button type="button" title="Duplicate (Ctrl+D)" onClick={() => duplicate()}><Copy aria-hidden="true" /></button>
              <button type="button" title="Delete (Del)" className="danger" disabled={!!s.protected} onClick={removeSel}><Trash2 aria-hidden="true" /></button>
            </div>
          </div> : <div className="mb-empty"><p>Select something to edit it, or drag an asset from the library onto the plan.</p><p>Press <kbd>?</kbd> for shortcuts.</p></div>)}
      </aside>
    </div>
  </div>;
}

function alphaNext(els: MapEl[]) { const used = new Set(els.map(e => e.seating?.prefix)); for (const c of "ABCDEFGHJKLMNPQRSTUVWXYZ") if (!used.has(c)) return c; return "Z"; }
function Handle({ x, y, r, cursor, kind, n, onDown }: { x: number; y: number; r: number; cursor: string; kind: "resize" | "vertex"; n: number; onDown: (e: RPE<SVGElement>, kind: "resize" | "vertex" | "rotate", n: number) => void }) {
  return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={r * 0.3} className="mb-handle" style={{ cursor }} onPointerDown={e => onDown(e, kind, n)} />;
}
/** Drop / placement preview: the real asset symbol at its drop size, snapped like the final placement. */
function Ghost({ k, x, y, sn, scale, detail }: { k: string; x: number; y: number; sn: (v: number) => number; scale: number; detail: boolean }) {
  const d = ASSET[k]; if (!d || d.kind === "line") return null;
  const a = assetDefaults(k), el: MapEl = { type: "asset", asset: k, label: d.label, ...a, x: sn(x - a.w / 2), y: sn(y - a.h / 2) };
  return <g className="mb-ghost" pointerEvents="none"><AssetShape e={el} detail={detail} scale={1 / scale} />
    <rect x={el.x} y={el.y} width={a.w} height={a.h} className="mb-ghost-box" />
    <text x={(el.x ?? 0) + a.w / 2} y={(el.y ?? 0) + a.h + 14 / scale} textAnchor="middle" className="mb-dim" style={{ fontSize: 11 / scale }}>{mm(a.w)} m × {mm(a.h)} m</text></g>;
}
export { FIXTURE_LABEL };
