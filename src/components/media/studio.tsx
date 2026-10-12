"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from "react";
import Link from "next/link";
import { ArrowLeft, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Type, Square, Circle, QrCode, Barcode, Layers, Pencil, Sparkles, Download, Eye, EyeOff, Lock, Unlock,
  Trash2, Copy, ChevronUp, ChevronDown, History, Share2, Plus, Upload, Loader2, LayoutTemplate, Ruler, Palette, MessageSquare, Smile, Shapes, LayoutDashboard, FileImage,
  Spline, Eraser, Crop, Brush as BrushIcon, Highlighter, SprayCan, PenTool, MousePointer2, Check, X } from "lucide-react";
import { LayerView, fillCss, qrContrast, pathD } from "./layer-view";
import { exportDesign } from "./export";
import { BrandPanel, fontFaceCss, type Brand, type CustomFont } from "./brand-panel";
import { CommentsPanel } from "./comments-panel";
import { DesignMenu } from "./design-menu";
import { FriendlyField, EventFieldButtons } from "./event-fields";
import { saveDesign, restoreVersion, deriveDesign, publishTemplate, listTemplates, templateUsed, type TemplateSummary } from "@/lib/media/actions";
import { PRESETS, FIELD_LABELS, fontSpecs, googleFontHrefs, reflow, uid, type DesignDoc, type EventData, type Layer, type Page, type TextLayer, type Brush, type PathLayer, type WidgetLayer, type Effects, type TextFx } from "@/lib/media/document";
import { loadFonts } from "@/lib/design-kit/assets";
import { ColorButton, FillButton } from "@/components/design-kit/color-picker";
import { FontPicker, IconPicker, EmojiPicker, SymbolPicker, ShapePicker, WidgetPicker, EffectsPicker } from "@/components/design-kit/pickers";
import { widgetById } from "@/lib/design-kit/widgets";
import { CARD_LAYOUTS, cardSize } from "@/lib/design-kit/info-cards";
import "@/styles/studio.css";
import "@/styles/design-kit.css";

type Version = { version: number; label: string; created_at: string };
type Asset = { src: string; path?: string; title: string };
type Tool = "select" | "pen" | "line" | "erase" | "crop";
const HISTORY = 80;
const TABS = ["Templates", "Elements", "Text", "Icons", "Emoji", "Widgets", "Uploads", "Draw", "Brand", "Layers", "Page", "Resize"] as const;
const TAB_ICON = { Templates: LayoutTemplate, Elements: Shapes, Text: Type, Icons: Sparkles, Emoji: Smile, Widgets: LayoutDashboard, Uploads: Upload, Draw: Pencil, Brand: Palette, Layers, Page: FileImage, Resize: Ruler } as const;
const BLENDS = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];
const TEXT_STYLES: { name: string; font: string; weight: number; italic?: boolean; size: number; transform?: "uppercase"; letterSpacing?: number; fx?: TextFx; color?: string }[] = [
  { name: "Headline", font: "Inter", weight: 900, size: 0.1 }, { name: "Elegant", font: "Playfair Display", weight: 700, italic: true, size: 0.09 }, { name: "Script", font: "Great Vibes", weight: 400, size: 0.1 },
  { name: "Condensed caps", font: "Bebas Neue", weight: 400, size: 0.12, transform: "uppercase", letterSpacing: 2 }, { name: "Neon sign", font: "Monoton", weight: 400, size: 0.08, fx: { kind: "neon", color: "#ff2d87" }, color: "#ffffff" },
  { name: "Retro", font: "Righteous", weight: 400, size: 0.09, fx: { kind: "retro", color: "#ff7a00", color2: "#2b0033" } }, { name: "3D pop", font: "Archivo Black", weight: 400, size: 0.1, fx: { kind: "3d", color: "#0b08f8", depth: 10, angle: 45 }, color: "#ffd23f" },
  { name: "Outline", font: "Anton", weight: 400, size: 0.12, fx: { kind: "hollow", color: "#090a2e" }, transform: "uppercase" }, { name: "Handwritten", font: "Caveat", weight: 600, size: 0.08 },
  { name: "Editorial", font: "Fraunces", weight: 600, size: 0.08 }, { name: "Futuristic", font: "Orbitron", weight: 700, size: 0.07, letterSpacing: 3 }, { name: "Party", font: "Bungee", weight: 400, size: 0.08, fx: { kind: "long-shadow", color: "#ff2d87", depth: 20, angle: 45 } },
];

/**
 * Gala Dock Studio — the single design editor for posters, social, screens, menus and QR posters (media spec §4–54).
 * Every control edits the canonical document; autosave persists it with optimistic concurrency; exports render from it.
 */
export function Studio({ design, versions: initialVersions, eventData, assets, back, brand = null, openComments = false, workspaceId = null }: {
  design: { id: string; title: string; version: number; document: DesignDoc; canEdit: boolean; eventId: string | null };
  versions: Version[]; eventData: EventData; assets: Asset[]; back: string; brand?: Brand | null; openComments?: boolean; workspaceId?: string | null;
}) {
  const [doc, setDoc] = useState<DesignDoc>(design.document);
  const [title, setTitle] = useState(design.title);
  const [pageIdx, setPageIdx] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [zoom, setZoom] = useState(0.4);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Templates");
  const [save, setSave] = useState<"saved" | "dirty" | "saving" | "error" | "conflict">("saved");
  const [versions, setVersions] = useState(initialVersions);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [tool, setTool] = useState<Tool>("select");
  const [brush, setBrush] = useState<{ brush: Brush; color: string; width: number; opacity: number }>({ brush: "pen", color: "#0b08f8", width: 8, opacity: 1 });
  const [lineOpts, setLineOpts] = useState<{ smooth: boolean; color: string; width: number; endCap: "none" | "arrow" | "dot" | "bar" }>({ smooth: true, color: "#090a2e", width: 6, endCap: "none" });
  const [lineDraft, setLineDraft] = useState<{ pts: { x: number; y: number }[]; hover: { x: number; y: number } | null } | null>(null);
  const [eraseW, setEraseW] = useState(24);
  const [livePath, setLivePath] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [panel, setPanel] = useState<"" | "versions" | "export" | "publish" | "comments">(openComments ? "comments" : "");
  const [customFonts, setCustomFonts] = useState<CustomFont[]>(brand?.fonts ?? []);
  const [catalogue, setCatalogue] = useState<Map<string, { w: number[]; i: boolean }> | null>(null);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const inflight = useRef<Promise<void>>(Promise.resolve()), version = useRef(design.version), past = useRef<string[]>([]), future = useRef<string[]>([]);
  const stage = useRef<HTMLDivElement>(null), pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const page = doc.pages[pageIdx]!;
  const selected = page.layers.filter(l => sel.includes(l.id));
  const one = selected.length === 1 ? selected[0]! : null;

  // Fonts: any Google Fonts catalogue family, one stylesheet per family with exactly the weights/italics in use.
  useEffect(() => { void loadFonts().then(list => setCatalogue(new Map(list.map(f => [f.f, { w: f.w, i: f.i }])))).catch(() => setCatalogue(null)); }, []);
  const fontHrefs = useMemo(() => googleFontHrefs([...fontSpecs(doc), ...(brand?.kit.fonts ?? []).map(f => ({ family: f.family, weights: [400, 700], italic: false }))], catalogue), [doc, brand, catalogue]);
  const faces = useMemo(() => fontFaceCss(customFonts), [customFonts]);
  const docColors = useMemo(() => [...new Set(doc.pages.flatMap(p => p.layers).flatMap(l => l.type === "text" ? [l.color] : l.type === "shape" && l.fill.type === "solid" ? [l.fill.color] : l.type === "icon" ? [l.color] : l.type === "path" ? [l.stroke.color] : []).filter(c => c.startsWith("#")))].slice(0, 16), [doc]);

  // ── history + mutation
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const syncHist = useCallback(() => setHist({ undo: past.current.length, redo: future.current.length }), []);
  const commit = useCallback((next: DesignDoc, record = true) => {
    if (!design.canEdit) return;
    if (record) { past.current = [...past.current.slice(-HISTORY + 1), JSON.stringify(doc)]; future.current = []; syncHist(); }
    setDoc(next); setSave("dirty");
  }, [doc, design.canEdit, syncHist]);
  const updatePage = (fn: (p: Page) => Page, record = true) => commit({ ...doc, pages: doc.pages.map((p, i) => (i === pageIdx ? fn(p) : p)) }, record);
  const updateLayers = (ids: string[], patch: (l: Layer) => Layer, record = true) => updatePage(p => ({ ...p, layers: p.layers.map(l => (ids.includes(l.id) ? patch(l) : l)) }), record);
  const set = (patch: Partial<Layer>, record = true) => one && updateLayers([one.id], l => ({ ...l, ...patch }) as Layer, record);
  const setFx = (patch: Partial<Effects>) => updateLayers(sel, l => ({ ...l, effects: { ...(l.effects ?? {}), ...patch } }));
  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push(JSON.stringify(doc)); syncHist(); setDoc(JSON.parse(p)); setSave("dirty"); };
  const redo = () => { const f = future.current.pop(); if (!f) return; past.current.push(JSON.stringify(doc)); syncHist(); setDoc(JSON.parse(f)); setSave("dirty"); };
  const add = (l: Layer) => { updatePage(p => ({ ...p, layers: [...p.layers, l] })); setSel([l.id]); setTool("select"); };
  const center = (w: number, h: number) => ({ x: (page.width - w) / 2, y: (page.height - h) / 2, w, h, rotation: 0 });
  const unit = Math.min(page.width, page.height);

  // ── autosave (debounced) with conflict detection; offline drafts are kept locally until they can be saved
  useEffect(() => {
    if (save !== "dirty") return;
    const t = setTimeout(() => { inflight.current = inflight.current.then(async () => {
      setSave("saving");
      try { localStorage.setItem(`gd_design_${design.id}`, JSON.stringify({ doc, version: version.current })); } catch { /* storage unavailable */ }
      if (!navigator.onLine) { setSave("dirty"); setNotice("Offline — your changes are kept on this device and will save when you reconnect."); return; }
      const r = await saveDesign(design.id, doc, version.current, title);
      if (r.ok) { version.current = r.data!; setSave(s => (s === "saving" ? "saved" : s)); setNotice(""); try { localStorage.removeItem(`gd_design_${design.id}`); } catch { /* ignore */ } }
      else if (/another tab/.test(r.error)) { setSave("conflict"); setNotice(r.error); }
      else { setSave(s => (s === "saving" ? "error" : s)); setNotice(r.error); }
    }); }, 1200);
    return () => clearTimeout(t);
  }, [save, doc, title, design.id]);
  useEffect(() => { const on = () => setSave(s => (s === "dirty" || s === "error" ? "dirty" : s)); addEventListener("online", on); return () => removeEventListener("online", on); }, []);

  const fit = useCallback(() => { const el = stage.current; if (!el) return; setZoom(Math.max(0.05, Math.min((el.clientWidth - 64) / page.width, (el.clientHeight - 64) / page.height, 2))); }, [page.width, page.height]);
  useEffect(() => { const t = setTimeout(fit, 0); return () => clearTimeout(t); }, [fit, pageIdx]);

  const duplicate = () => { const copies = selected.map(l => ({ ...structuredClone(l), id: uid(), name: `${l.name} copy`, x: l.x + 20, y: l.y + 20 })); updatePage(p => ({ ...p, layers: [...p.layers, ...copies] })); setSel(copies.map(c => c.id)); };
  const remove = () => { updatePage(p => ({ ...p, layers: p.layers.filter(l => !sel.includes(l.id) || l.locked) })); setSel([]); };

  // ── bendy line tool
  const finishLine = useCallback(() => {
    setLineDraft(d => {
      if (d && d.pts.length >= 2) {
        const xs = d.pts.map(p => p.x), ys = d.pts.map(p => p.y), pad = lineOpts.width * 2;
        const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad, w = Math.max(...xs) - x + pad, h = Math.max(...ys) - y + pad;
        const l: PathLayer = { id: uid(), name: lineOpts.smooth ? "Curve" : "Line", type: "path", x, y, w: Math.max(w, 1), h: Math.max(h, 1), rotation: 0, pts: d.pts.map(p => ({ x: p.x - x, y: p.y - y })),
          smooth: lineOpts.smooth, closed: false, stroke: { color: lineOpts.color, width: lineOpts.width, dash: "solid" }, startCap: "none", endCap: lineOpts.endCap };
        queueMicrotask(() => add(l));
      }
      return null;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineOpts, doc, pageIdx]);

  // ── keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (tool === "line" && e.key === "Enter") { e.preventDefault(); finishLine(); return; }
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSel(page.layers.filter(l => !l.locked).map(l => l.id)); }
      else if (mod && e.key.toLowerCase() === "d" && sel.length) { e.preventDefault(); duplicate(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel.length) { e.preventDefault(); remove(); }
      else if (e.key === "Escape") { setSel([]); setEditingText(null); setTool("select"); setLineDraft(null); }
      else if (!mod && e.key.toLowerCase() === "v") setTool("select");
      else if (!mod && e.key.toLowerCase() === "p") setTool("pen");
      else if (!mod && e.key.toLowerCase() === "l") setTool("line");
      else if (e.key.startsWith("Arrow") && sel.length) {
        e.preventDefault(); const d = e.shiftKey ? 10 : 1;
        updateLayers(sel.filter(id => !page.layers.find(l => l.id === id)?.locked), l => ({ ...l, x: l.x + (e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0), y: l.y + (e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0) }));
      }
    };
    addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey);
  });
  const order = (dir: 1 | -1 | "top" | "bottom") => updatePage(p => {
    const ls = [...p.layers]; for (const id of dir === -1 || dir === "bottom" ? sel : [...sel].reverse()) {
      const i = ls.findIndex(l => l.id === id); if (i < 0) continue; const [l] = ls.splice(i, 1);
      const to = dir === "top" ? ls.length : dir === "bottom" ? 0 : Math.max(0, Math.min(ls.length, i + dir)); ls.splice(to, 0, l!);
    } return { ...p, layers: ls };
  });

  // ── pointer: select, move, resize, rotate, snap, marquee, draw, erase, crop, edit curve points
  const toPage = (e: { clientX: number; clientY: number }) => { const r = pageRefs.current[pageIdx]!.getBoundingClientRect(); return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }; };
  /** Page point → layer-local pixels (undoing the layer's rotation about its centre). */
  const toLocal = (l: Layer, p: { x: number; y: number }) => {
    const cx = l.x + l.w / 2, cy = l.y + l.h / 2, a = (-l.rotation * Math.PI) / 180, dx = p.x - cx, dy = p.y - cy;
    return { x: dx * Math.cos(a) - dy * Math.sin(a) + l.w / 2, y: dx * Math.sin(a) + dy * Math.cos(a) + l.h / 2 };
  };
  const drag = useRef<{ mode: "move" | "resize" | "rotate" | "marquee" | "draw" | "erase" | "point"; start: { x: number; y: number }; orig: Layer[]; handle?: string; path?: string; point?: number } | null>(null);
  const snap = (x: number, y: number, w: number, h: number, ignore: string[]) => {
    const th = 6 / zoom, xs = [0, page.width / 2, page.width], ys = [0, page.height / 2, page.height];
    for (const l of page.layers) if (!ignore.includes(l.id) && !l.hidden) { xs.push(l.x, l.x + l.w / 2, l.x + l.w); ys.push(l.y, l.y + l.h / 2, l.y + l.h); }
    let gx: number[] = [], gy: number[] = [], nx = x, ny = y;
    for (const [off, cand] of [[0, x], [w / 2, x + w / 2], [w, x + w]] as const) { const hit = xs.find(v => Math.abs(v - cand) < th); if (hit !== undefined) { nx = hit - off; gx = [hit]; break; } }
    for (const [off, cand] of [[0, y], [h / 2, y + h / 2], [h, y + h]] as const) { const hit = ys.find(v => Math.abs(v - cand) < th); if (hit !== undefined) { ny = hit - off; gy = [hit]; break; } }
    setGuides({ x: gx, y: gy }); return { x: nx, y: ny };
  };
  /** Cover-fit framing of an image expressed as a crop window (fractions of the source), so crop mode starts from what you see. */
  const coverCrop = (l: Extract<Layer, { type: "image" }>) => {
    const img = pageRefs.current[pageIdx]?.querySelector<HTMLImageElement>(`[data-layer="${l.id}"] img`); const nw = img?.naturalWidth || l.w, nh = img?.naturalHeight || l.h;
    const s = (l.fit === "contain" ? Math.min(l.w / nw, l.h / nh) : Math.max(l.w / nw, l.h / nh)) * (l.zoom || 1), cw = Math.min(1, l.w / (nw * s)), ch = Math.min(1, l.h / (nh * s));
    return { x: (1 - cw) * (l.focusX / 100), y: (1 - ch) * (l.focusY / 100), w: cw, h: ch };
  };
  const onDown = (e: RPE, layer?: Layer, handle?: string) => {
    if (!design.canEdit || e.button !== 0) return;
    const p = toPage(e);
    if (tool === "pen") { drag.current = { mode: "draw", start: p, orig: [], path: `M${p.x.toFixed(1)} ${p.y.toFixed(1)}` }; (e.target as Element).setPointerCapture?.(e.pointerId); return; }
    if (tool === "line") { e.stopPropagation(); if (e.detail >= 2) { finishLine(); return; } setLineDraft(d => ({ pts: [...(d?.pts ?? []), p], hover: null })); return; }
    if (tool === "erase") {
      const target = one && (one.type === "image" || one.type === "drawing") ? one : null;
      if (!target) { setNotice("Select an image or drawing first, then rub out parts of it."); return; }
      const lp = toLocal(target, p); past.current = [...past.current.slice(-HISTORY + 1), JSON.stringify(doc)]; future.current = []; syncHist();
      drag.current = { mode: "erase", start: p, orig: [target], path: `M${lp.x.toFixed(1)} ${lp.y.toFixed(1)}` }; (e.target as Element).setPointerCapture?.(e.pointerId); return;
    }
    e.stopPropagation();
    if (handle?.startsWith("pt") && layer) { past.current = [...past.current.slice(-HISTORY + 1), JSON.stringify(doc)]; future.current = []; syncHist(); drag.current = { mode: "point", start: p, orig: [structuredClone(layer)], point: Number(handle.slice(2)) }; (e.target as Element).setPointerCapture?.(e.pointerId); return; }
    if (!layer) { setSel([]); setEditingText(null); drag.current = { mode: "marquee", start: p, orig: [] }; (e.currentTarget as Element).setPointerCapture?.(e.pointerId); return; }
    if (layer.locked) { setSel([layer.id]); return; }
    const ids = e.shiftKey ? (sel.includes(layer.id) ? sel.filter(x => x !== layer.id) : [...sel, layer.id]) : sel.includes(layer.id) ? sel : [layer.id];
    setSel(ids);
    past.current = [...past.current.slice(-HISTORY + 1), JSON.stringify(doc)]; future.current = []; syncHist();
    drag.current = { mode: handle === "rot" ? "rotate" : handle ? "resize" : "move", start: p, orig: page.layers.filter(l => ids.includes(l.id)).map(l => structuredClone(l)), handle };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: RPE) => {
    if (tool === "line" && lineDraft) { const p = toPage(e); setLineDraft(d => (d ? { ...d, hover: p } : d)); }
    const d = drag.current; if (!d) return;
    const p = toPage(e), dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (d.mode === "draw") { d.path += ` L${p.x.toFixed(1)} ${p.y.toFixed(1)}`; setLivePath(d.path!); return; }
    if (d.mode === "erase") { const lp = toLocal(d.orig[0]!, p); d.path += ` L${lp.x.toFixed(1)} ${lp.y.toFixed(1)}`; const o = d.orig[0]!;
      updateLayers([o.id], l => ({ ...l, erase: [...((o as { erase?: { d: string; width: number }[] }).erase ?? []), { d: d.path!, width: eraseW }] }) as Layer, false); return; }
    if (d.mode === "marquee") { setMarquee({ x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(dx), h: Math.abs(dy) }); return; }
    const o = d.orig[0]!;
    if (d.mode === "point" && o.type === "path") { const lp = toLocal(o, p); updateLayers([o.id], l => ({ ...l, pts: (l as PathLayer).pts.map((pt, i) => (i === d.point ? lp : pt)) }) as Layer, false); return; }
    if (d.mode === "move") {
      const s = d.orig.length === 1 ? snap(o.x + dx, o.y + dy, o.w, o.h, [o.id]) : { x: o.x + dx, y: o.y + dy };
      const ox = s.x - (o.x + dx), oy = s.y - (o.y + dy);
      updateLayers(d.orig.map(l => l.id), l => { const b = d.orig.find(x => x.id === l.id)!; return { ...l, x: b.x + dx + ox, y: b.y + dy + oy }; }, false);
    } else if (d.mode === "rotate") {
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2; let a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90; if (e.shiftKey) a = Math.round(a / 15) * 15;
      updateLayers([o.id], l => ({ ...l, rotation: Math.round(a) }), false);
    } else {
      const h = d.handle!; let { x, y, w, h: hh } = o;
      if (h.includes("e")) w = Math.max(8, o.w + dx); if (h.includes("s")) hh = Math.max(8, o.h + dy);
      if (h.includes("w")) { w = Math.max(8, o.w - dx); x = o.x + o.w - w; } if (h.includes("n")) { hh = Math.max(8, o.h - dy); y = o.y + o.h - hh; }
      if (tool === "crop" && o.type === "image") {
        // Crop: the image stays put in page space; the frame moves over it.
        const c = o.crop ?? coverCrop(o), X = o.x - (c.x / c.w) * o.w, Y = o.y - (c.y / c.h) * o.h, W = o.w / c.w, H = o.h / c.h;
        x = Math.max(X, x); y = Math.max(Y, y); w = Math.min(X + W - x, w); hh = Math.min(Y + H - y, hh);
        updateLayers([o.id], l => ({ ...l, x, y, w, h: hh, crop: { x: (x - X) / W, y: (y - Y) / H, w: w / W, h: hh / H } }) as Layer, false); return;
      }
      if (e.shiftKey || o.type === "image" || o.type === "qr") { const r = o.w / o.h; if (Math.abs(w - o.w) > Math.abs(hh - o.h)) hh = w / r; else w = hh * r; if (h.includes("n")) y = o.y + o.h - hh; if (h.includes("w")) x = o.x + o.w - w; }
      updateLayers([o.id], l => {
        if (l.type === "text" && e.altKey) return { ...l, x, y, w, h: hh, size: (l as TextLayer).size * (w / o.w) };
        if (l.type === "path") { const sx = w / o.w, sy = hh / o.h; return { ...l, x, y, w, h: hh, pts: (o as PathLayer).pts.map(pt => ({ x: pt.x * sx, y: pt.y * sy })) }; }
        return { ...l, x, y, w, h: hh };
      }, false);
    }
  };
  const onUp = () => {
    const d = drag.current; drag.current = null; setGuides({ x: [], y: [] }); setLivePath(null);
    if (d?.mode === "draw" && d.path && d.path.includes("L")) add({ id: uid(), name: brush.brush === "airbrush" ? "Airbrush" : brush.brush === "highlighter" ? "Highlight" : "Drawing", type: "drawing", x: 0, y: 0, w: page.width, h: page.height, rotation: 0,
      paths: [{ d: d.path, color: brush.color, width: brush.width, opacity: brush.opacity, brush: brush.brush }] });
    if (d?.mode === "draw") setTool("pen");
    if (d?.mode === "marquee" && marquee) { const m = marquee; setSel(page.layers.filter(l => !l.locked && !l.hidden && l.x < m.x + m.w && l.x + l.w > m.x && l.y < m.y + m.h && l.y + l.h > m.y).map(l => l.id)); }
    setMarquee(null);
  };

  // ── elements
  const addText = (preset: "heading" | "sub" | "body", text?: string, bind?: string, font = "Inter", extra: Partial<TextLayer> = {}) => {
    const size = { heading: unit * 0.09, sub: unit * 0.05, body: unit * 0.032 }[preset];
    add({ id: uid(), name: preset === "heading" ? "Heading" : preset === "sub" ? "Subheading" : "Text", type: "text", text: text ?? (preset === "heading" ? "Add a heading" : preset === "sub" ? "Add a subheading" : "Add body text"), bind,
      font, size, weight: preset === "body" ? 400 : preset === "sub" ? 600 : 800, color: "#090a2e", align: "center", lineHeight: 1.15, letterSpacing: 0, ...center(page.width * 0.7, size * 2.4), ...extra } as TextLayer);
  };
  const addGlyph = (ch: string, name: string, emoji: boolean) => { const s = unit * 0.16; add({ id: uid(), name, type: "text", text: ch, font: emoji ? "Noto Color Emoji" : "Inter", size: s, weight: 400, color: "#090a2e", align: "center", valign: "middle", lineHeight: 1, letterSpacing: 0, ...center(s * 1.3, s * 1.3) }); };
  const addShape = (shape: "rect" | "ellipse", name = shape === "rect" ? "Rectangle" : "Ellipse") => add({ id: uid(), name, type: "shape", shape, fill: { type: "solid", color: "#0b08f8" }, ...center(unit * 0.3, unit * 0.3) });
  const addImage = (a: Asset) => { const w = page.width * 0.6; add({ id: uid(), name: a.title || "Image", type: "image", asset: { src: a.src, path: a.path }, fit: "cover", focusX: 50, focusY: 50, zoom: 1, ...center(w, w * 0.66) }); };
  const upload = async (file: File) => {
    const fd = new FormData(); fd.set("file", file); fd.set("purpose", "image");
    const r = await fetch("/api/uploads", { method: "POST", body: fd }); const j = await r.json();
    if (!r.ok) { setNotice(j.error ?? "Upload failed."); return; }
    addImage({ src: `/api/media/asset?path=${encodeURIComponent(j.path)}`, path: j.path, title: j.name });
  };
  const applyColor = (hex: string) => {
    if (!selected.length) { updatePage(p => ({ ...p, background: { type: "solid", color: hex } })); return; }
    updateLayers(sel, l => (l.type === "text" ? { ...l, color: hex, fill: undefined } : l.type === "shape" ? { ...l, fill: { type: "solid", color: hex } } : l.type === "icon" ? { ...l, color: hex }
      : l.type === "qr" || l.type === "barcode" ? { ...l, fg: hex } : l.type === "drawing" ? { ...l, paths: l.paths.map(p => ({ ...p, color: hex })) } : l.type === "path" ? { ...l, stroke: { ...l.stroke, color: hex } }
      : l.type === "widget" ? { ...l, theme: { ...l.theme, a: hex } } : l) as Layer);
  };
  const applyFont = (family: string) => {
    const texts = selected.filter(l => l.type === "text" || l.type === "widget").map(l => l.id);
    if (texts.length) updateLayers(texts, l => ({ ...l, font: family }) as Layer); else addText("heading", undefined, undefined, family);
  };
  const jumpTo = (pageId: string | null, layerId: string | null) => {
    const i = doc.pages.findIndex(p => p.id === pageId || (layerId && p.layers.some(l => l.id === layerId)));
    if (i >= 0) { setPageIdx(i); setSel(layerId && doc.pages[i]!.layers.some(l => l.id === layerId) ? [layerId] : []); }
  };
  const useTemplate = (t: TemplateSummary, mode: "replace" | "page") => {
    const src = t.document.pages[0]; if (!src) return;
    const fresh = (p: Page): Page => ({ ...structuredClone(p), id: uid(), layers: p.layers.map(l => ({ ...structuredClone(l), id: uid() })) });
    if (mode === "replace") { const r = reflow(fresh(src), page.width, page.height); updatePage(p => ({ ...p, background: r.background, layers: r.layers })); }
    else { const pages = t.document.pages.map(p => reflow(fresh(p), page.width, page.height)); commit({ ...doc, pages: [...doc.pages.slice(0, pageIdx + 1), ...pages, ...doc.pages.slice(pageIdx + 1)] }); setPageIdx(pageIdx + 1); }
    setSel([]); void templateUsed(t.id);
  };

  const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const status = { saved: "Saved", dirty: "Unsaved", saving: "Saving…", error: "Save failed", conflict: "Conflict" }[save];
  const cursor = tool === "pen" || tool === "line" ? "crosshair" : tool === "erase" ? "cell" : "default";

  return <div className="st">
    {fontHrefs.map(h => <link key={h} rel="stylesheet" href={h} />)}
    {faces && <style>{faces}</style>}
    <header className="st-top">
      <Link href={back} className="st-icon" aria-label="Back"><ArrowLeft size={18} /></Link>
      <input className="st-title" value={title} onChange={e => { setTitle(e.target.value); setSave("dirty"); }} aria-label="Design name" maxLength={140} disabled={!design.canEdit} />
      <span className={`st-save ${save}`} role="status">{save === "saving" && <Loader2 size={13} className="mk-spin" />}{status}</span>
      <div className="st-grow" />
      {design.canEdit && <div className="st-tools" role="toolbar" aria-label="Tools">
        {([["select", MousePointer2, "Select (V)"], ["pen", PenTool, "Draw (P)"], ["line", Spline, "Bendy line (L)"], ["erase", Eraser, "Rubber"], ["crop", Crop, "Crop image"]] as const).map(([k, I, label]) =>
          <button key={k} className={`st-icon ${tool === k ? "on" : ""}`} aria-label={label} title={label} aria-pressed={tool === k} onClick={() => { setTool(k); setLineDraft(null); if (k === "crop" && one?.type === "image" && !one.crop) set({ crop: coverCrop(one) }); }}><I size={16} /></button>)}
      </div>}
      <button className="st-icon" onClick={undo} aria-label="Undo" disabled={!hist.undo}><Undo2 size={17} /></button>
      <button className="st-icon" onClick={redo} aria-label="Redo" disabled={!hist.redo}><Redo2 size={17} /></button>
      <button className="st-icon" onClick={() => setZoom(z => Math.max(0.05, z / 1.25))} aria-label="Zoom out"><ZoomOut size={17} /></button>
      <span className="st-zoom">{Math.round(zoom * 100)}%</span>
      <button className="st-icon" onClick={() => setZoom(z => Math.min(4, z * 1.25))} aria-label="Zoom in"><ZoomIn size={17} /></button>
      <button className="st-icon" onClick={fit} aria-label="Fit to screen"><Maximize size={16} /></button>
      <button className="st-btn" onClick={() => setPanel(panel === "comments" ? "" : "comments")} aria-pressed={panel === "comments"}><MessageSquare size={15} />Comments{openCount ? <span className="st-count">{openCount}</span> : null}</button>
      <button className="st-btn" onClick={() => setPanel(panel === "versions" ? "" : "versions")}><History size={15} />Versions</button>
      {design.canEdit && <button className="st-btn" onClick={() => setPanel(panel === "publish" ? "" : "publish")}><Share2 size={15} />Share template</button>}
      <button className="st-btn primary" onClick={() => setPanel(panel === "export" ? "" : "export")}><Download size={15} />Export</button>
      <DesignMenu id={design.id} title={title} library={back} inEditor canEdit={design.canEdit} />
    </header>
    {notice && <p className="st-notice" role="alert">{notice}{save === "conflict" && <button className="st-link" onClick={() => location.reload()}>Reload</button>}<button className="st-link" onClick={() => setNotice("")} aria-label="Dismiss"><X size={13} /></button></p>}

    <div className="st-body">
      <nav className="st-tabs" aria-label="Library">{TABS.filter(t => t !== "Brand" || brand).map(t => { const I = TAB_ICON[t]; return <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)} aria-pressed={tab === t}><I size={18} /><span>{t}</span></button>; })}</nav>

      <aside className="st-panel" aria-label={tab}>
        {tab === "Templates" && <TemplatesPanel workspaceId={workspaceId} canEdit={design.canEdit} onUse={useTemplate} />}
        {tab === "Elements" && <>
          <div className="st-quick">
            <button onClick={() => addShape("rect")}><Square size={18} />Rectangle</button><button onClick={() => addShape("ellipse")}><Circle size={18} />Circle</button>
            <button onClick={() => { setTool("line"); setTab("Draw"); }}><Spline size={18} />Bendy line</button>
          </div>
          <ShapePicker onPick={s => add({ id: uid(), name: s.name, type: "shape", shape: "custom", d: s.d, lineOnly: s.stroke, fill: { type: "solid", color: s.stroke ? "#090a2e" : "#0b08f8" }, effects: s.stroke ? { stroke: { width: Math.max(3, unit * 0.006), color: "#090a2e" } } : undefined, ...center(unit * 0.3, s.group === "Lines" ? unit * 0.12 : unit * 0.3) })} />
        </>}
        {tab === "Text" && <>
          <button className="st-textbtn h" onClick={() => addText("heading")}>Add a heading</button>
          <button className="st-textbtn s" onClick={() => addText("sub")}>Add a subheading</button>
          <button className="st-textbtn b" onClick={() => addText("body")}>Add body text</button>
          <h3>Event details</h3>
          <p className="st-hint">Adds text that fills in from your event automatically.</p>
          <EventFieldButtons data={eventData} onAdd={k => addText("body", `{{${k}}}`, k, "Inter", { name: FIELD_LABELS[k] })} />
          <h3>Text styles</h3>
          <div className="st-tstyles">{TEXT_STYLES.map(s => <button key={s.name} style={{ fontFamily: `'${s.font}', Inter`, fontWeight: s.weight, fontStyle: s.italic ? "italic" : undefined }} onClick={() => addText("heading", s.name, undefined, s.font,
            { name: s.name, weight: s.weight, italic: s.italic, size: unit * s.size, transform: s.transform, letterSpacing: s.letterSpacing ?? 0, color: s.color ?? "#090a2e", effects: s.fx ? { textFx: s.fx } : undefined })}>{s.name}</button>)}</div>
          <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?${[...new Set(TEXT_STYLES.map(s => s.font))].map(f => `family=${f.replace(/ /g, "+")}`).join("&")}&text=${encodeURIComponent([...new Set(TEXT_STYLES.map(s => s.name).join(""))].join(""))}&display=swap`} />
          <h3>Fonts</h3>
          <FontPicker value={{ family: one?.type === "text" ? one.font : "Inter", weight: one?.type === "text" ? one.weight : 400, italic: one?.type === "text" ? !!one.italic : false }} custom={[...new Set(customFonts.map(f => f.family))]}
            onChange={f => { if (one?.type === "text") set({ font: f.family, weight: f.weight, italic: f.italic } as Partial<Layer>); else applyFont(f.family); }} />
        </>}
        {tab === "Icons" && <IconPicker onPick={i => add({ id: uid(), name: i.name, type: "icon", icon: i.set === "lucide" ? i.name : `${i.set}:${i.name}`, svg: i.svg, color: "#090a2e", ...center(unit * 0.15, unit * 0.15) })} />}
        {tab === "Emoji" && <EmojiSymbols onEmoji={(e, n) => addGlyph(e, n, true)} onSymbol={c => addGlyph(c, `Symbol ${c}`, false)} />}
        {tab === "Widgets" && <>
          <div className="st-quick">
            <button onClick={() => add({ id: uid(), name: "Ticket QR", type: "qr", value: "{{event.public_url}}", bind: "event.public_url", fg: "#090a2e", bg: "#ffffff", label: "Scan for tickets", ...center(unit * 0.3, unit * 0.34) })}><QrCode size={18} />Event QR</button>
            <button onClick={() => add({ id: uid(), name: "Custom QR", type: "qr", value: "https://www.galadock.com", fg: "#090a2e", bg: "#ffffff", ...center(unit * 0.3, unit * 0.3) })}><QrCode size={18} />Custom QR</button>
            <button onClick={() => add({ id: uid(), name: "Barcode", type: "barcode", value: "GALADOCK", fg: "#000000", bg: "#ffffff", ...center(unit * 0.5, unit * 0.16) })}><Barcode size={18} />Barcode</button>
          </div>
          <WidgetPicker onPick={w => { const s = Math.min(1, (page.width * 0.8) / w.w); add({ id: uid(), name: w.name, type: "widget", widget: w.widget, variant: w.variant, theme: w.theme, props: w.props, ...center(w.w * s * (unit / 1080), w.h * s * (unit / 1080)) }); }} />
        </>}
        {tab === "Uploads" && <>
          {design.canEdit && <label className="st-drop"><Upload size={20} /><span>Upload JPG, PNG or WebP</span><input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} /></label>}
          <p className="st-hint">Uploads stay private to you and your workspace.</p>
          <div className="st-assets">{assets.map(a => <button key={a.src} onClick={() => addImage(a)} title={a.title}>{/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.src} alt={a.title} loading="lazy" /></button>)}</div>
          {!assets.length && <p className="st-hint">No event media yet.</p>}
        </>}
        {tab === "Draw" && <>
          <h3>Brush</h3>
          <div className="st-quick four">{([["pen", PenTool, "Pen"], ["marker", BrushIcon, "Marker"], ["highlighter", Highlighter, "Highlighter"], ["airbrush", SprayCan, "Airbrush"]] as const).map(([b, I, n]) =>
            <button key={b} className={tool === "pen" && brush.brush === b ? "on" : ""} aria-pressed={tool === "pen" && brush.brush === b} onClick={() => { setBrush(x => ({ ...x, brush: b, width: b === "highlighter" ? 28 : b === "airbrush" ? 36 : b === "marker" ? 14 : 8 })); setTool("pen"); }}><I size={18} />{n}</button>)}</div>
          <ColorButton label="Colour" value={brush.color} onChange={c => setBrush(x => ({ ...x, color: c }))} docColors={docColors} />
          <label className="dk-field"><span>Size {brush.width}px</span><input type="range" min={1} max={120} value={brush.width} onChange={e => setBrush(x => ({ ...x, width: Number(e.target.value) }))} /></label>
          <label className="dk-field"><span>Opacity {Math.round(brush.opacity * 100)}%</span><input type="range" min={5} max={100} value={Math.round(brush.opacity * 100)} onChange={e => setBrush(x => ({ ...x, opacity: Number(e.target.value) / 100 }))} /></label>
          <h3>Bendy lines</h3>
          <button className={`st-btn ${tool === "line" ? "primary" : ""}`} onClick={() => { setTool(tool === "line" ? "select" : "line"); setLineDraft(null); }}><Spline size={15} />{tool === "line" ? "Drawing a line — click points" : "Draw a line or curve"}</button>
          <p className="st-hint">Click to add points, double-click or press Enter to finish. Drag the round handles afterwards to bend it.</p>
          <div className="dk-row"><label className="dk-check"><input type="checkbox" checked={lineOpts.smooth} onChange={e => setLineOpts(o => ({ ...o, smooth: e.target.checked }))} />Smooth curve</label>
            <label className="dk-mini"><span>End</span><select value={lineOpts.endCap} onChange={e => setLineOpts(o => ({ ...o, endCap: e.target.value as "none" }))}><option value="none">Plain</option><option value="arrow">Arrow</option><option value="dot">Dot</option><option value="bar">Bar</option></select></label></div>
          <ColorButton label="Line colour" value={lineOpts.color} onChange={c => setLineOpts(o => ({ ...o, color: c }))} docColors={docColors} />
          <label className="dk-field"><span>Line width {lineOpts.width}px</span><input type="range" min={1} max={60} value={lineOpts.width} onChange={e => setLineOpts(o => ({ ...o, width: Number(e.target.value) }))} /></label>
          <h3>Rubber</h3>
          <button className={`st-btn ${tool === "erase" ? "primary" : ""}`} onClick={() => setTool(tool === "erase" ? "select" : "erase")}><Eraser size={15} />{tool === "erase" ? "Rubbing out — drag over the layer" : "Rub out part of an image or drawing"}</button>
          <label className="dk-field"><span>Rubber size {eraseW}px</span><input type="range" min={4} max={160} value={eraseW} onChange={e => setEraseW(Number(e.target.value))} /></label>
          {one && (one.type === "image" || one.type === "drawing") && one.erase?.length ? <button className="st-btn" onClick={() => set({ erase: [] } as Partial<Layer>)}>Restore rubbed-out areas</button> : null}
        </>}
        {tab === "Brand" && brand && <BrandPanel brand={brand} canEdit={design.canEdit} onColor={applyColor} onFont={applyFont} onFontsChange={setCustomFonts} onLogo={(src, path, name) => addImage({ src, path, title: name })} />}
        {tab === "Layers" && <ol className="st-layers">{[...page.layers].reverse().map(l => <li key={l.id} className={sel.includes(l.id) ? "on" : ""}>
          <button className="st-lname" onClick={e => setSel(e.shiftKey ? [...sel, l.id] : [l.id])}>{l.name}<small>{l.type}</small></button>
          <button className="st-icon sm" aria-label={l.hidden ? "Show" : "Hide"} onClick={() => updateLayers([l.id], x => ({ ...x, hidden: !x.hidden }))}>{l.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
          <button className="st-icon sm" aria-label={l.locked ? "Unlock" : "Lock"} onClick={() => updateLayers([l.id], x => ({ ...x, locked: !x.locked }))}>{l.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
        </li>)}{!page.layers.length && <li className="st-hint">No layers yet.</li>}</ol>}
        {tab === "Page" && <>
          <h3>Pages</h3>
          <ul className="st-pages">{doc.pages.map((p, i) => <li key={p.id}><button className={i === pageIdx ? "on" : ""} onClick={() => { setPageIdx(i); setSel([]); }}>{p.name}<small>{Math.round(p.width)}×{Math.round(p.height)}</small></button></li>)}</ul>
          {design.canEdit && <div className="st-row">
            <button className="st-btn" onClick={() => commit({ ...doc, pages: [...doc.pages, { ...page, id: uid(), name: `Page ${doc.pages.length + 1}`, layers: [] }] })}><Plus size={14} />Add</button>
            <button className="st-btn" onClick={() => commit({ ...doc, pages: [...doc.pages.slice(0, pageIdx + 1), { ...structuredClone(page), id: uid(), name: `${page.name} copy`, layers: page.layers.map(l => ({ ...structuredClone(l), id: uid() })) }, ...doc.pages.slice(pageIdx + 1)] })}><Copy size={14} />Duplicate</button>
            {doc.pages.length > 1 && <button className="st-btn" onClick={() => { commit({ ...doc, pages: doc.pages.filter((_, i) => i !== pageIdx) }); setPageIdx(0); }}><Trash2 size={14} />Delete</button>}
            {pageIdx > 0 && <button className="st-btn" onClick={() => { const ps = [...doc.pages]; [ps[pageIdx - 1], ps[pageIdx]] = [ps[pageIdx]!, ps[pageIdx - 1]!]; commit({ ...doc, pages: ps }); setPageIdx(pageIdx - 1); }}><ChevronUp size={14} />Up</button>}
          </div>}
          <label className="st-field"><span>Page name</span><input value={page.name} onChange={e => updatePage(p => ({ ...p, name: e.target.value.slice(0, 60) }), false)} /></label>
          <h3>Background</h3>
          <FillButton label="Background" fill={page.background ?? { type: "solid", color: "#ffffff" }} onChange={f => updatePage(p => ({ ...p, background: f }))} docColors={docColors} />
          <button className="st-btn" onClick={() => updatePage(p => ({ ...p, background: null }))}>Transparent background</button>
          <h3>Event details</h3>
          <p className="st-hint">Text and QR codes linked to the event update automatically when event details change.</p>
          <EventFieldButtons data={eventData} onAdd={k => addText("body", `{{${k}}}`, k, "Inter", { name: FIELD_LABELS[k] })} />
        </>}
        {tab === "Resize" && <ResizePanel designId={design.id} />}
      </aside>

      <main className="st-stage" ref={stage} onPointerMove={onMove} onPointerUp={onUp} onWheel={e => { if (e.ctrlKey) { e.preventDefault(); setZoom(z => Math.max(0.05, Math.min(4, z * (e.deltaY < 0 ? 1.1 : 0.9)))); } }}>
        {tool === "line" && <p className="st-toolhint" role="status">{lineDraft?.pts.length ? `${lineDraft.pts.length} point${lineDraft.pts.length === 1 ? "" : "s"} — double-click or Enter to finish, Esc to cancel` : "Click to start a line"}
          {lineDraft && lineDraft.pts.length >= 2 && <button className="st-btn primary" onClick={finishLine}><Check size={14} />Finish</button>}</p>}
        {tool === "crop" && <p className="st-toolhint" role="status">{one?.type === "image" ? "Drag the handles to crop. Choose Select (V) when you’re done." : "Select an image to crop it."}{one?.type === "image" && one.crop && <button className="st-btn" onClick={() => set({ crop: null } as Partial<Layer>)}>Reset crop</button>}</p>}
        <div className="st-canvas" style={{ width: page.width * zoom, height: page.height * zoom }}>
          {doc.pages.map((p, i) => <div key={p.id} ref={el => { pageRefs.current[i] = el; }} className="st-page" aria-label={p.name}
            style={{ width: p.width, height: p.height, transform: `scale(${zoom})`, background: fillCss(p.background) || undefined, display: i === pageIdx ? "block" : "none", cursor }}
            onPointerDown={e => onDown(e)}>
            {p.background === null && <div className="st-checker" aria-hidden="true" />}
            {p.layers.map(l => <div key={l.id} onPointerDown={e => onDown(e, l)} onDoubleClick={() => l.type === "text" && tool === "select" && design.canEdit && !l.locked && setEditingText(l.id)}>
              <LayerView l={l} data={eventData} editing={editingText === l.id} onText={t => { updateLayers([l.id], x => ({ ...x, text: t, bind: undefined }) as Layer); setEditingText(null); }} /></div>)}
            {livePath && <svg className="st-live" viewBox={`0 0 ${p.width} ${p.height}`} aria-hidden="true"><path d={livePath} stroke={brush.color} strokeWidth={brush.width} strokeOpacity={brush.brush === "highlighter" ? 0.4 : brush.opacity} fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            {lineDraft && <svg className="st-live" viewBox={`0 0 ${p.width} ${p.height}`} aria-hidden="true">
              <path d={pathD([...lineDraft.pts, ...(lineDraft.hover ? [lineDraft.hover] : [])], lineOpts.smooth, false)} stroke={lineOpts.color} strokeWidth={lineOpts.width} fill="none" strokeLinecap="round" />
              {lineDraft.pts.map((pt, j) => <circle key={j} cx={pt.x} cy={pt.y} r={Math.max(4, 6 / zoom)} fill="#fff" stroke="#0b08f8" strokeWidth={2 / zoom} />)}</svg>}
          </div>)}
          <div className="st-overlay" style={{ width: page.width * zoom, height: page.height * zoom }}>
            {selected.map(l => <div key={l.id} className={`st-sel ${tool === "crop" && l.type === "image" ? "crop" : ""}`} style={{ left: l.x * zoom, top: l.y * zoom, width: l.w * zoom, height: l.h * zoom, transform: `rotate(${l.rotation}deg)` }}>
              {one && !l.locked && design.canEdit && (tool === "select" || tool === "crop") && <>{handles.map(h => <span key={h} className={`st-h ${h}`} onPointerDown={e => onDown(e, l, h)} />)}{tool === "select" && <span className="st-h rot" onPointerDown={e => onDown(e, l, "rot")} />}</>}
              {one && l.type === "path" && tool === "select" && !l.locked && design.canEdit && l.pts.map((pt, j) => <span key={j} className="st-pt" style={{ left: pt.x * zoom, top: pt.y * zoom }} onPointerDown={e => onDown(e, l, `pt${j}`)} aria-label={`Point ${j + 1}`} />)}
            </div>)}
            {guides.x.map(g => <div key={`x${g}`} className="st-guide v" style={{ left: g * zoom }} />)}{guides.y.map(g => <div key={`y${g}`} className="st-guide h" style={{ top: g * zoom }} />)}
            {marquee && marquee.w > 0 && <div className="st-marquee" style={{ left: marquee.x * zoom, top: marquee.y * zoom, width: marquee.w * zoom, height: marquee.h * zoom }} />}
          </div>
        </div>
      </main>

      <aside className="st-props" aria-label="Properties">
        {!selected.length ? <><p className="st-hint">Select a layer to edit it. Shift-click to multi-select, drag on empty canvas to box-select. Double-click text to edit.</p>
          <h3>Page background</h3><FillButton label="Background" fill={page.background ?? { type: "solid", color: "#ffffff" }} onChange={f => updatePage(p => ({ ...p, background: f }))} docColors={docColors} /></> : <>
          <div className="st-row">
            <button className="st-icon" aria-label="Bring forward" onClick={() => order(1)}><ChevronUp size={16} /></button><button className="st-icon" aria-label="Send backward" onClick={() => order(-1)}><ChevronDown size={16} /></button>
            <button className="st-btn" onClick={() => order("top")}>Front</button><button className="st-btn" onClick={() => order("bottom")}>Back</button>
            <button className="st-icon" aria-label="Duplicate" onClick={duplicate}><Copy size={16} /></button><button className="st-icon" aria-label="Delete" onClick={remove}><Trash2 size={16} /></button>
          </div>
          {one && <>
            <label className="st-field"><span>Name</span><input value={one.name} onChange={e => set({ name: e.target.value.slice(0, 60) }, false)} /></label>
            <div className="st-grid4">{(["x", "y", "w", "h"] as const).map(k => <label key={k} className="st-field"><span>{k.toUpperCase()}</span><input type="number" value={Math.round(one[k])} onChange={e => set({ [k]: Number(e.target.value) } as Partial<Layer>)} /></label>)}</div>
            <div className="st-row"><label className="st-field"><span>Rotate</span><input type="number" value={one.rotation} onChange={e => set({ rotation: Number(e.target.value) })} /></label>
              <button className="st-btn" onClick={() => set({ flipX: !one.flipX })}>Flip H</button><button className="st-btn" onClick={() => set({ flipY: !one.flipY })}>Flip V</button></div>
            {one.type === "text" && <TextProps l={one} set={set} custom={[...new Set(customFonts.map(f => f.family))]} docColors={docColors} data={eventData} />}
            {one.type === "image" && <>
              <h3>Image</h3>
              <div className="st-row">
                <button className={`st-btn ${tool === "crop" ? "primary" : ""}`} onClick={() => { if (tool === "crop") setTool("select"); else { setTool("crop"); if (!one.crop) set({ crop: coverCrop(one) }); } }}><Crop size={14} />{tool === "crop" ? "Done cropping" : "Crop"}</button>
                <button className={`st-btn ${tool === "erase" ? "primary" : ""}`} onClick={() => setTool(tool === "erase" ? "select" : "erase")}><Eraser size={14} />Rubber</button>
                {one.crop && <button className="st-btn" onClick={() => set({ crop: null })}>Reset crop</button>}
              </div>
              {!one.crop && <div className="st-row"><label className="st-field"><span>Fit</span><select value={one.fit} onChange={e => set({ fit: e.target.value as "cover" | "contain" })}><option value="cover">Fill</option><option value="contain">Fit</option></select></label>
                <label className="st-field"><span>Mask</span><select value={one.mask ?? "none"} onChange={e => set({ mask: e.target.value as "none" })}><option value="none">None</option><option value="rounded">Rounded</option><option value="circle">Circle</option><option value="ellipse">Ellipse</option></select></label></div>}
              <h3>Adjust</h3>
              {(["brightness", "contrast", "saturate"] as const).map(k => <label key={k} className="dk-field"><span>{k} {one.effects?.[k] ?? 100}%</span><input type="range" min={0} max={200} value={one.effects?.[k] ?? 100} onChange={e => setFx({ [k]: Number(e.target.value) })} /></label>)}
              <label className="dk-field"><span>Hue {one.effects?.hue ?? 0}°</span><input type="range" min={-180} max={180} value={one.effects?.hue ?? 0} onChange={e => setFx({ hue: Number(e.target.value) })} /></label>
              <label className="dk-field"><span>Vignette {one.effects?.vignette ?? 0}%</span><input type="range" min={0} max={100} value={one.effects?.vignette ?? 0} onChange={e => setFx({ vignette: Number(e.target.value) })} /></label>
              {one.effects?.duotone && <div className="st-row"><ColorButton label="Shadows" value={one.effects.duotone[0]} onChange={c => setFx({ duotone: [c, one.effects!.duotone![1]] })} /><ColorButton label="Highlights" value={one.effects.duotone[1]} onChange={c => setFx({ duotone: [one.effects!.duotone![0], c] })} />
                <button className="st-btn" onClick={() => setFx({ duotone: null })}>Remove duotone</button></div>}
            </>}
            {one.type === "shape" && <><h3>Fill</h3><FillButton label="Fill" fill={one.fill} onChange={f => set({ fill: f })} docColors={docColors} /></>}
            {one.type === "icon" && <><h3>Icon</h3><ColorButton label="Colour" value={one.color} onChange={c => set({ color: c })} docColors={docColors} /></>}
            {one.type === "drawing" && <><h3>Drawing</h3><ColorButton label="Colour" value={one.paths[0]?.color ?? "#000000"} onChange={c => set({ paths: one.paths.map(p => ({ ...p, color: c })) })} docColors={docColors} />
              <button className={`st-btn ${tool === "erase" ? "primary" : ""}`} onClick={() => setTool(tool === "erase" ? "select" : "erase")}><Eraser size={14} />Rubber</button></>}
            {one.type === "path" && <PathProps l={one} set={set} docColors={docColors} />}
            {one.type === "widget" && <WidgetProps l={one} set={set} docColors={docColors} data={eventData} />}
            {(one.type === "qr" || one.type === "barcode") && <>
              <h3>{one.type === "qr" ? "QR code" : "Barcode"}</h3>
              <FriendlyField label={one.type === "qr" ? "Link or text in the code" : "Barcode value"} value={one.value} data={eventData} maxLength={500} only={["event.public_url", "event.name"]} onChange={v => set({ value: v, bind: undefined })} />
              <ColorButton label="Code" value={one.fg} onChange={c => set({ fg: c })} docColors={docColors} /><ColorButton label="Background" value={one.bg} onChange={c => set({ bg: c })} docColors={docColors} />
              <label className="st-field"><span>Label</span><input value={one.label ?? ""} onChange={e => set({ label: e.target.value.slice(0, 40) })} /></label>
              {qrContrast(one.fg, one.bg) < 4 && <p className="st-warn">Low contrast — this code may not scan reliably. Use a dark code on a light background.</p>}
              {one.type === "qr" && one.w < unit * 0.12 && <p className="st-warn">This QR is small; print it at least 2 cm wide.</p>}
            </>}
          </>}
          <EffectsSection one={one} setFx={setFx} unit={unit} docColors={docColors} />
        </>}
      </aside>
    </div>

    {panel === "versions" && <Popover onClose={() => setPanel("")} title="Version history">
      {design.canEdit && <form className="st-row" onSubmit={async e => { e.preventDefault(); const label = String(new FormData(e.currentTarget).get("label") || "Named version");
        const r = await saveDesign(design.id, doc, version.current, title, label); if (r.ok) { version.current = r.data!; setSave("saved"); setVersions(v => [{ version: r.data!, label, created_at: new Date().toISOString() }, ...v]); } else setNotice(r.error); }}>
        <input name="label" placeholder="e.g. Final poster" maxLength={80} className="st-input" /><button className="st-btn primary">Save version</button></form>}
      <ul className="st-versions">{versions.map(v => <li key={v.version}><span><b>{v.label}</b><small>v{v.version} · {new Date(v.created_at).toLocaleString("en-GB")}</small></span>
        {design.canEdit && <button className="st-btn" onClick={async () => { const r = await restoreVersion(design.id, v.version); if (r.ok) location.reload(); else setNotice(r.error); }}>Restore</button>}</li>)}</ul>
      <p className="st-hint">Restoring saves your current state first, so nothing is lost.</p>
    </Popover>}
    {panel === "comments" && <Popover onClose={() => setPanel("")} title="Comments">
      <CommentsPanel designId={design.id} canEdit={design.canEdit} pageId={page.id} layer={one ? { id: one.id, name: one.name } : null} onJump={jumpTo} onCount={setOpenCount} />
    </Popover>}
    {panel === "export" && <ExportPanel pages={doc.pages} pageIdx={pageIdx} els={() => pageRefs.current.filter(Boolean) as HTMLDivElement[]} title={title} onClose={() => setPanel("")} />}
    {panel === "publish" && <PublishPanel designId={design.id} title={title} onClose={() => setPanel("")} flush={async () => { if (save !== "saved") { const r = await saveDesign(design.id, doc, version.current, title); if (r.ok) { version.current = r.data!; setSave("saved"); } } }} />}
  </div>;
}

function EmojiSymbols({ onEmoji, onSymbol }: { onEmoji: (e: string, n: string) => void; onSymbol: (c: string) => void }) {
  const [t, setT] = useState<"emoji" | "symbols">("emoji");
  return <>
    <div className="dk-tabs" role="tablist" aria-label="Emoji or symbols"><button type="button" role="tab" aria-selected={t === "emoji"} className={t === "emoji" ? "on" : ""} onClick={() => setT("emoji")}>Emoji</button>
      <button type="button" role="tab" aria-selected={t === "symbols"} className={t === "symbols" ? "on" : ""} onClick={() => setT("symbols")}>Symbols</button></div>
    {t === "emoji" ? <EmojiPicker onPick={onEmoji} /> : <SymbolPicker onPick={onSymbol} />}
  </>;
}

function TemplatesPanel({ workspaceId, canEdit, onUse }: { workspaceId: string | null; canEdit: boolean; onUse: (t: TemplateSummary, mode: "replace" | "page") => void }) {
  const [scope, setScope] = useState<"all" | "starter" | "community" | "workspace">("all"), [q, setQ] = useState(""), [list, setList] = useState<TemplateSummary[] | null>(null), [err, setErr] = useState("");
  useEffect(() => { let live = true; const t = setTimeout(() => { void listTemplates(scope, q, workspaceId).then(r => { if (!live) return; if (r.ok) { setList(r.data ?? []); setErr(""); } else setErr(r.error); }); }, q ? 250 : 0); return () => { live = false; clearTimeout(t); }; }, [scope, q, workspaceId]);
  return <div className="dk-picker">
    <input className="dk-in" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search templates — wedding, nightclub, menu…" aria-label="Search templates" />
    <div className="dk-tabs" role="tablist" aria-label="Template source">{([["all", "All"], ["starter", "Starters"], ["community", "Community"], ["workspace", "Mine & team"]] as const).map(([k, l]) =>
      <button key={k} type="button" role="tab" aria-selected={scope === k} className={scope === k ? "on" : ""} onClick={() => setScope(k)}>{l}</button>)}</div>
    <p className="dk-cap">Community templates are shared by other Gala Dock users. Using one gives you your own copy — the original never changes. Share yours with “Share template”.</p>
    {err && <p className="st-warn">{err}</p>}
    {!list ? <p className="dk-cap">Loading templates…</p> : !list.length ? <p className="dk-cap">No templates found{q ? ` for “${q}”` : ""}.</p>
      : <div className="st-tgrid">{list.map(t => <div key={t.id} className="st-tcard"><MiniThumb doc={t.document} /><b title={t.title}>{t.title}</b><small>{t.scope === "starter" ? "Gala Dock" : t.scope === "community" ? "Community" : t.scope === "mine" ? "Yours" : "Your team"} · used {t.usage_count}×</small>
        {canEdit && <span className="st-row"><button className="st-btn" onClick={() => onUse(t, "replace")}>Use</button><button className="st-btn" onClick={() => onUse(t, "page")} title="Add as a new page">+ Page</button></span>}</div>)}</div>}
  </div>;
}
/** Sample event details so template previews read naturally (the real event's data fills in once used). */
const SAMPLE: EventData = { "event.name": "Summer Gala", "event.date": "Sat 21 June", "event.time": "19:30", "event.venue_name": "Riverside Arena", "event.city": "London", "event.public_url": "https://www.galadock.com", "ticket.starting_price": "£25.00", "organizer.name": "Alex Events" };
function MiniThumb({ doc }: { doc: DesignDoc }) {
  const p = doc.pages?.[0]; if (!p) return <div className="st-mthumb" />;
  const s = 116 / Math.max(p.width, p.height);
  return <div className="st-mthumb" aria-hidden="true"><div style={{ width: p.width, height: p.height, position: "absolute", left: (116 - p.width * s) / 2, top: (116 - p.height * s) / 2, transform: `scale(${s})`, transformOrigin: "0 0", background: fillCss(p.background) }}>
    {p.layers.map(l => <LayerView key={l.id} l={l} data={SAMPLE} />)}</div></div>;
}

function TextProps({ l, set, custom, docColors, data }: { l: TextLayer; set: (p: Partial<Layer>, record?: boolean) => void; custom: string[]; docColors: string[]; data: EventData }) {
  const [fonts, setFonts] = useState(false);
  return <>
    <h3>Text</h3>
    <FriendlyField label="Text" multiline value={l.text} data={data} onChange={v => set({ text: v, bind: undefined } as Partial<Layer>, false)} />
    {l.bind && <p className="st-hint">Shows your event’s <b>{FIELD_LABELS[l.bind as keyof typeof FIELD_LABELS]?.toLowerCase() ?? "details"}</b> — updates automatically.</p>}
    <button className="dk-cbtn-trigger" onClick={() => setFonts(f => !f)} aria-expanded={fonts} style={{ fontFamily: `'${l.font}', Inter` }}><b>{l.font}</b><code>{l.weight}{l.italic ? " italic" : ""}</code></button>
    {fonts && <FontPicker value={{ family: l.font, weight: l.weight, italic: !!l.italic }} custom={custom} onChange={f => set({ font: f.family, weight: f.weight, italic: f.italic } as Partial<Layer>)} />}
    <div className="st-grid4">
      <label className="st-field"><span>Size</span><input type="number" min={4} value={Math.round(l.size)} onChange={e => set({ size: Number(e.target.value) } as Partial<Layer>)} /></label>
      <label className="st-field"><span>Weight</span><select value={l.weight} onChange={e => set({ weight: Number(e.target.value) } as Partial<Layer>)}>{[100, 200, 300, 400, 500, 600, 700, 800, 900].map(w => <option key={w}>{w}</option>)}</select></label>
      <label className="st-field"><span>Line</span><input type="number" step={0.05} value={l.lineHeight} onChange={e => set({ lineHeight: Number(e.target.value) } as Partial<Layer>)} /></label>
      <label className="st-field"><span>Spacing</span><input type="number" step={0.5} value={l.letterSpacing} onChange={e => set({ letterSpacing: Number(e.target.value) } as Partial<Layer>)} /></label>
    </div>
    {l.fill && l.fill.type !== "solid" ? <FillButton label="Text gradient" fill={l.fill} onChange={f => set({ fill: f.type === "solid" ? undefined : f, ...(f.type === "solid" ? { color: f.color } : {}) } as Partial<Layer>)} docColors={docColors} />
      : <ColorButton label="Colour" value={l.color} onChange={c => set({ color: c, fill: undefined } as Partial<Layer>)} docColors={docColors} />}
    <div className="st-row">
      <label className="st-field"><span>Align</span><select value={l.align} onChange={e => set({ align: e.target.value as "left" } as Partial<Layer>)}><option>left</option><option>center</option><option>right</option></select></label>
      <label className="st-field"><span>Case</span><select value={l.transform ?? "none"} onChange={e => set({ transform: e.target.value as "none" } as Partial<Layer>)}><option value="none">As typed</option><option value="uppercase">UPPER</option><option value="lowercase">lower</option></select></label>
    </div>
    <div className="st-row">
      <button className={`st-btn ${l.italic ? "primary" : ""}`} onClick={() => set({ italic: !l.italic } as Partial<Layer>)} aria-pressed={!!l.italic}><i>I</i></button>
      <button className={`st-btn ${l.underline ? "primary" : ""}`} onClick={() => set({ underline: !l.underline } as Partial<Layer>)} aria-pressed={!!l.underline}><u>U</u></button>
      <button className="st-btn" onClick={() => set({ fill: l.fill ? undefined : { type: "linear", angle: 90, stops: [{ offset: 0, color: "#ff3cac" }, { offset: 1, color: "#2b86c5" }] } } as Partial<Layer>)}>{l.fill ? "Solid" : "Gradient"}</button>
      <button className="st-btn" onClick={() => set({ highlight: l.highlight ? null : "#fff200" } as Partial<Layer>)}>Highlight</button>
    </div>
    {l.highlight && <ColorButton label="Highlight" value={l.highlight} onChange={c => set({ highlight: c } as Partial<Layer>)} docColors={docColors} />}
  </>;
}

function PathProps({ l, set, docColors }: { l: PathLayer; set: (p: Partial<Layer>, record?: boolean) => void; docColors: string[] }) {
  return <>
    <h3>Line</h3>
    <ColorButton label="Colour" value={l.stroke.color} onChange={c => set({ stroke: { ...l.stroke, color: c } } as Partial<Layer>)} docColors={docColors} />
    <label className="dk-field"><span>Width {l.stroke.width}px</span><input type="range" min={1} max={80} value={l.stroke.width} onChange={e => set({ stroke: { ...l.stroke, width: Number(e.target.value) } } as Partial<Layer>)} /></label>
    <div className="dk-row">
      <label className="dk-check"><input type="checkbox" checked={l.smooth} onChange={e => set({ smooth: e.target.checked } as Partial<Layer>)} />Curved</label>
      <label className="dk-check"><input type="checkbox" checked={l.closed} onChange={e => set({ closed: e.target.checked, fill: e.target.checked ? l.fill ?? { type: "solid", color: "#c9ccff" } : l.fill } as Partial<Layer>)} />Closed shape</label>
      <label className="dk-mini"><span>Style</span><select value={l.stroke.dash ?? "solid"} onChange={e => set({ stroke: { ...l.stroke, dash: e.target.value as "solid" } } as Partial<Layer>)}><option>solid</option><option>dashed</option><option>dotted</option></select></label>
    </div>
    <div className="dk-row">{(["startCap", "endCap"] as const).map(k => <label key={k} className="dk-mini"><span>{k === "startCap" ? "Start" : "End"}</span><select value={l[k] ?? "none"} onChange={e => set({ [k]: e.target.value } as Partial<Layer>)}>
      <option value="none">Plain</option><option value="arrow">Arrow</option><option value="dot">Dot</option><option value="bar">Bar</option></select></label>)}</div>
    {l.closed && l.fill && <FillButton label="Fill" fill={l.fill} onChange={f => set({ fill: f } as Partial<Layer>)} docColors={docColors} />}
    <p className="st-hint">Drag the round handles on the canvas to bend the line. {l.pts.length} points.</p>
    <div className="st-row"><button className="st-btn" onClick={() => { const a = l.pts[l.pts.length - 2] ?? l.pts[0]!, b = l.pts[l.pts.length - 1]!; set({ pts: [...l.pts.slice(0, -1), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b] } as Partial<Layer>); }}><Plus size={13} />Add point</button>
      {l.pts.length > 2 && <button className="st-btn" onClick={() => set({ pts: l.pts.filter((_, i) => i !== Math.floor(l.pts.length / 2)) } as Partial<Layer>)}>Remove point</button>}</div>
  </>;
}

function WidgetProps({ l, set, docColors, data }: { l: WidgetLayer; set: (p: Partial<Layer>, record?: boolean) => void; docColors: string[]; data: EventData }) {
  const def = widgetById(l.widget);
  const fields = l.widget === "card" ? [{ key: "title", label: "Title", kind: "text" }, { key: "text", label: "Text", kind: "list" }, { key: "icon", label: "Icon (Lucide name)", kind: "text" }] : def?.fields ?? [];
  const prop = (k: string, v: string | number) => set({ props: { ...l.props, [k]: v } } as Partial<Layer>, false);
  return <>
    <h3>{def?.name ?? "Info card"}</h3>
    {fields.map(f => f.kind === "number" || f.key === "icon" ? <label key={f.key} className="st-field"><span>{f.label}</span><input type={f.kind === "number" ? "number" : "text"} value={String(l.props[f.key] ?? "")} onChange={e => prop(f.key, f.kind === "number" ? Number(e.target.value) : e.target.value.slice(0, 200))} /></label>
      : <FriendlyField key={f.key} label={f.label} value={String(l.props[f.key] ?? "")} data={data} multiline={f.kind === "list"} rows={f.key === "text" ? 2 : 5} maxLength={f.kind === "list" ? 1000 : 200} onChange={v => prop(f.key, v)} />)}
    {l.widget === "card" && <label className="st-field"><span>Layout</span><select value={Number(l.props.layout) || 0} onChange={e => { const lay = CARD_LAYOUTS[Number(e.target.value)]!, sz = cardSize(lay); set({ props: { ...l.props, layout: lay.id }, h: (l.w * sz.h) / sz.w } as Partial<Layer>); }}>
      {CARD_LAYOUTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    <label className="st-field"><span>Style</span><select value={l.variant} onChange={e => set({ variant: Number(e.target.value) } as Partial<Layer>)}>{["Filled", "Outline", "Minimal", "Rounded", "Glass", "Bold"].map((v, i) => <option key={v} value={i}>{v}</option>)}</select></label>
    <ColorButton label="Accent" value={l.theme.a} onChange={c => set({ theme: { ...l.theme, a: c } } as Partial<Layer>)} docColors={docColors} />
    <ColorButton label="Second" value={l.theme.b} onChange={c => set({ theme: { ...l.theme, b: c } } as Partial<Layer>)} docColors={docColors} />
    <ColorButton label="Text" value={l.theme.text} onChange={c => set({ theme: { ...l.theme, text: c } } as Partial<Layer>)} docColors={docColors} />
    <ColorButton label="Panel" value={l.theme.bg} onChange={c => set({ theme: { ...l.theme, bg: c } } as Partial<Layer>)} docColors={docColors} />
  </>;
}

function EffectsSection({ one, setFx, unit, docColors }: { one: Layer | null; setFx: (p: Partial<Effects>) => void; unit: number; docColors: string[] }) {
  const [presets, setPresets] = useState(false);
  const e = one?.effects;
  const kind = one?.type === "text" ? "text" : one?.type === "image" ? "image" : one?.type === "shape" ? "shape" : "other";
  return <>
    <h3>Effects</h3>
    <button className="st-btn" onClick={() => setPresets(p => !p)} aria-expanded={presets}><Sparkles size={14} />{presets ? "Hide effect presets" : "Browse effect presets"}</button>
    {presets && <EffectsPicker kind={kind} onApply={p => setFx(p.fx)} />}
    <label className="dk-field"><span>Opacity {Math.round((e?.opacity ?? 1) * 100)}%</span><input type="range" min={0} max={100} value={Math.round((e?.opacity ?? 1) * 100)} onChange={ev => setFx({ opacity: Number(ev.target.value) / 100 })} /></label>
    <label className="st-field"><span>Blend</span><select value={e?.blend ?? "normal"} onChange={ev => setFx({ blend: ev.target.value })}>{BLENDS.map(b => <option key={b}>{b}</option>)}</select></label>
    <label className="st-check"><input type="checkbox" checked={!!e?.shadow} onChange={ev => setFx({ shadow: ev.target.checked ? { x: 0, y: unit * 0.01, blur: unit * 0.03, color: "#00000073" } : null })} />Drop shadow</label>
    {e?.shadow && <><div className="st-grid4">{(["x", "y", "blur"] as const).map(k => <label key={k} className="st-field"><span>{k}</span><input type="number" value={Math.round(e.shadow![k])} onChange={ev => setFx({ shadow: { ...e.shadow!, [k]: Number(ev.target.value) } })} /></label>)}</div>
      <ColorButton label="Shadow" value={e.shadow.color} onChange={c => setFx({ shadow: { ...e.shadow!, color: c } })} docColors={docColors} /></>}
    {(kind === "image" || kind === "shape") && <><label className="st-check"><input type="checkbox" checked={!!e?.innerShadow} onChange={ev => setFx({ innerShadow: ev.target.checked ? { x: 0, y: unit * 0.006, blur: unit * 0.025, color: "#00000080" } : null })} />Inner shadow</label>
      {e?.innerShadow && <><label className="dk-field"><span>Inner blur</span><input type="range" min={0} max={120} value={e.innerShadow.blur} onChange={ev => setFx({ innerShadow: { ...e.innerShadow!, blur: Number(ev.target.value) } })} /></label>
        <ColorButton label="Inner shadow" value={e.innerShadow.color} onChange={c => setFx({ innerShadow: { ...e.innerShadow!, color: c } })} docColors={docColors} /></>}</>}
    <label className="st-check"><input type="checkbox" checked={!!e?.glow} onChange={ev => setFx({ glow: ev.target.checked ? { blur: unit * 0.02, color: "#5b6bff" } : null })} />Glow</label>
    {e?.glow && <><label className="dk-field"><span>Glow spread</span><input type="range" min={1} max={120} value={e.glow.blur} onChange={ev => setFx({ glow: { ...e.glow!, blur: Number(ev.target.value) } })} /></label>
      <ColorButton label="Glow" value={e.glow.color} onChange={c => setFx({ glow: { ...e.glow!, color: c } })} docColors={docColors} /></>}
    {kind === "text" && <><label className="st-field"><span>Text effect</span><select value={e?.textFx?.kind ?? ""} onChange={ev => setFx({ textFx: ev.target.value ? { kind: ev.target.value as TextFx["kind"], color: e?.textFx?.color ?? "#ff2d87", color2: e?.textFx?.color2 ?? "#0b08f8", depth: 10, angle: 45 } : null })}>
      <option value="">None</option>{["neon", "outline", "hollow", "double-outline", "3d", "long-shadow", "lifted", "echo", "glitch", "retro", "emboss", "splice"].map(k => <option key={k} value={k}>{k.replace("-", " ")}</option>)}</select></label>
      {e?.textFx && <><ColorButton label="Effect colour" value={e.textFx.color} onChange={c => setFx({ textFx: { ...e.textFx!, color: c } })} docColors={docColors} />
        {["double-outline", "glitch", "retro", "emboss"].includes(e.textFx.kind) && <ColorButton label="Second colour" value={e.textFx.color2 ?? "#000000"} onChange={c => setFx({ textFx: { ...e.textFx!, color2: c } })} docColors={docColors} />}
        {["3d", "long-shadow"].includes(e.textFx.kind) && <div className="st-row"><label className="dk-field"><span>Depth {e.textFx.depth ?? 10}</span><input type="range" min={1} max={60} value={e.textFx.depth ?? 10} onChange={ev => setFx({ textFx: { ...e.textFx!, depth: Number(ev.target.value) } })} /></label>
          <label className="dk-field"><span>Angle {e.textFx.angle ?? 45}°</span><input type="range" min={0} max={360} value={e.textFx.angle ?? 45} onChange={ev => setFx({ textFx: { ...e.textFx!, angle: Number(ev.target.value) } })} /></label></div>}</>}</>}
    <label className="st-check"><input type="checkbox" checked={!!e?.stroke} onChange={ev => setFx({ stroke: ev.target.checked ? { width: Math.max(2, unit * 0.004), color: "#090a2e", dash: "solid" } : null })} />Border / outline</label>
    {e?.stroke && <><div className="st-row"><label className="st-field"><span>Width</span><input type="number" min={1} value={e.stroke.width} onChange={ev => setFx({ stroke: { ...e.stroke!, width: Number(ev.target.value) } })} /></label>
      <label className="st-field"><span>Style</span><select value={e.stroke.dash ?? "solid"} onChange={ev => setFx({ stroke: { ...e.stroke!, dash: ev.target.value as "solid" } })}><option>solid</option><option>dashed</option><option>dotted</option></select></label></div>
      <ColorButton label="Border" value={e.stroke.color} onChange={c => setFx({ stroke: { ...e.stroke!, color: c } })} docColors={docColors} /></>}
    {one && (one.type === "shape" || one.type === "image") && <>
      <label className="dk-field"><span>Corner curvature {e?.radius ?? 0}px</span><input type="range" min={0} max={Math.round(Math.min(one.w, one.h) / 2)} value={e?.radius ?? 0} onChange={ev => setFx({ radius: Number(ev.target.value), radii: null })} /></label>
      <details className="st-details"><summary>Individual corners</summary><div className="st-grid4">{["Top left", "Top right", "Bottom right", "Bottom left"].map((n, i) => <label key={n} className="st-field"><span>{n}</span>
        <input type="number" min={0} value={(e?.radii ?? [e?.radius ?? 0, e?.radius ?? 0, e?.radius ?? 0, e?.radius ?? 0])[i]} onChange={ev => { const r = [...(e?.radii ?? [e?.radius ?? 0, e?.radius ?? 0, e?.radius ?? 0, e?.radius ?? 0])] as [number, number, number, number]; r[i] = Math.max(0, Number(ev.target.value)); setFx({ radii: r }); }} /></label>)}</div></details></>}
    <label className="dk-field"><span>Blur {e?.blur ?? 0}px</span><input type="range" min={0} max={40} value={e?.blur ?? 0} onChange={ev => setFx({ blur: Number(ev.target.value) })} /></label>
  </>;
}

function ResizePanel({ designId }: { designId: string }) {
  const [picked, setPicked] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  return <>
    <p className="st-hint">Create resized copies. Layers are reflowed proportionally (never stretched) — review each copy before publishing.</p>
    {["Print", "Social", "Event"].map(g => <div key={g}><h3>{g}</h3><div className="st-chips">{PRESETS.filter(p => p.group === g).map(p => <label key={p.id} className="st-check"><input type="checkbox" checked={picked.includes(p.id)} onChange={e => setPicked(x => (e.target.checked ? [...x, p.id] : x.filter(y => y !== p.id)))} />{p.label}</label>)}</div></div>)}
    <button className="st-btn primary" disabled={!picked.length || busy} onClick={async () => { setBusy(true); const r = await deriveDesign(designId, "variant", picked); setBusy(false); setMsg(r.ok ? `Created ${r.data!.length} variant${r.data!.length === 1 ? "" : "s"} in your library.` : r.error); }}>{busy && <Loader2 size={14} className="mk-spin" />}Create variants</button>
    <button className="st-btn" onClick={async () => { const r = await deriveDesign(designId, "duplicate"); setMsg(r.ok ? "Duplicate created in your library." : r.error); }}>Duplicate design</button>
    {msg && <p className="st-hint" role="status">{msg}</p>}
  </>;
}

function Popover({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  return <div className="st-pop" role="dialog" aria-label={title}><div className="st-pop-head"><b>{title}</b><button className="st-icon" onClick={onClose} aria-label="Close">×</button></div>{children}</div>;
}

function ExportPanel({ pages, pageIdx, els, title, onClose }: { pages: Page[]; pageIdx: number; els: () => HTMLDivElement[]; title: string; onClose: () => void }) {
  const [format, setFormat] = useState<"png" | "jpeg" | "webp" | "pdf">("png"); const [scale, setScale] = useState(1); const [q, setQ] = useState(0.92); const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    try {
      const all = els(), list = format === "pdf" ? pages : [pages[pageIdx]!], nodes = format === "pdf" ? all : [all[pageIdx]!];
      const prev = nodes.map(n => [n.style.display, n.style.transform] as const);
      nodes.forEach(n => { n.style.display = "block"; });
      const blob = await exportDesign(nodes, list, format, { scale, quality: q, transparent });
      nodes.forEach((n, i) => { n.style.display = prev[i]![0]; n.style.transform = prev[i]![1]; });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${title.replace(/[^\w\- ]+/g, "").trim() || "design"}.${format === "jpeg" ? "jpg" : format}`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch { setErr("Export failed. Try a smaller scale, or remove images that can’t be loaded."); } finally { setBusy(false); }
  };
  const p = pages[pageIdx]!;
  return <Popover title="Export" onClose={onClose}>
    <label className="st-field"><span>Format</span><select value={format} onChange={e => setFormat(e.target.value as "png")}><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option><option value="pdf">PDF (all pages)</option></select></label>
    <label className="st-field"><span>Scale {scale}× → {Math.round(p.width * scale)}×{Math.round(p.height * scale)}px</span><input type="range" min={0.25} max={3} step={0.25} value={scale} onChange={e => setScale(Number(e.target.value))} /></label>
    {(format === "jpeg" || format === "webp") && <label className="st-field"><span>Quality {Math.round(q * 100)}%</span><input type="range" min={0.5} max={1} step={0.02} value={q} onChange={e => setQ(Number(e.target.value))} /></label>}
    {format === "png" && <label className="st-check"><input type="checkbox" checked={transparent} onChange={e => setTransparent(e.target.checked)} />Transparent background</label>}
    <button className="st-btn primary" onClick={go} disabled={busy}>{busy && <Loader2 size={14} className="mk-spin" />}Download</button>
    {err && <p className="st-warn">{err}</p>}
  </Popover>;
}

function PublishPanel({ designId, title, onClose, flush }: { designId: string; title: string; onClose: () => void; flush: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  return <Popover title="Share as a template" onClose={onClose}>
    <form className="st-form" onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); await flush();
      const r = await publishTemplate(designId, { title: String(f.get("title")), description: String(f.get("description") ?? ""), category: String(f.get("category")), tags: String(f.get("tags") ?? "").split(",").map(s => s.trim()).filter(Boolean), visibility: f.get("visibility") as "private" });
      setBusy(false); setMsg(r.ok ? "Template saved." : r.error); }}>
      <label className="st-field"><span>Title</span><input name="title" defaultValue={title} required minLength={2} maxLength={120} /></label>
      <label className="st-field"><span>Description</span><textarea name="description" rows={2} maxLength={1000} /></label>
      <label className="st-field"><span>Category</span><select name="category">{["nightclub", "festival", "wedding", "birthday", "childrens_party", "conference", "corporate", "comedy", "concert", "theatre", "networking", "webinar", "private_party", "venue_hire", "catering", "menu", "drinks", "ticket_launch", "early_bird", "sold_out", "final_release", "event_day"].map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</select></label>
      <label className="st-field"><span>Tags (comma separated)</span><input name="tags" maxLength={200} /></label>
      <label className="st-field"><span>Who can use it</span><select name="visibility" defaultValue="public"><option value="private">Only me</option><option value="workspace">My workspace</option><option value="link">Anyone with the link</option><option value="public">Everyone (community)</option></select></label>
      <p className="st-hint">Event details become placeholders and private uploads are replaced with safe copies — your event’s private data is never published. Others always get their own copy. Community templates follow the Content &amp; Template Policy.</p>
      <button className="st-btn primary" disabled={busy}>{busy && <Loader2 size={14} className="mk-spin" />}Save template</button>
      {msg && <p className="st-hint" role="status">{msg}</p>}
    </form>
  </Popover>;
}
