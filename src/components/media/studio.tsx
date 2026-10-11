"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from "react";
import Link from "next/link";
import { icons, ArrowLeft, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Type, Square, Circle, Triangle, Star, QrCode, Barcode, Layers, Pencil, Sparkles, Download, Eye, EyeOff, Lock, Unlock,
  Trash2, Copy, ChevronUp, ChevronDown, History, Share2, Plus, Upload, Loader2, LayoutTemplate, Ruler } from "lucide-react";
import { LayerView, fillCss, qrContrast } from "./layer-view";
import { exportDesign } from "./export";
import { saveDesign, restoreVersion, deriveDesign, publishTemplate } from "@/lib/media/actions";
import { FONTS, PRESETS, PLACEHOLDERS, googleFontHref, uid, type DesignDoc, type EventData, type Layer, type Page, type TextLayer, type Fill } from "@/lib/media/document";
import "@/styles/studio.css";

type Version = { version: number; label: string; created_at: string };
type Asset = { src: string; path?: string; title: string };
const HISTORY = 80;
const TABS = ["Design", "Elements", "Text", "Uploads", "Icons", "Draw", "Layers", "Resize"] as const;
const BLENDS = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];
const FILTERS: [string, Record<string, number>][] = [["Original", {}], ["Mono", { grayscale: 100 }], ["High contrast", { contrast: 140, saturate: 110 }], ["Warm", { sepia: 25, saturate: 120 }], ["Cool", { hue: 190, saturate: 90 }],
  ["Cinematic", { contrast: 120, saturate: 85, brightness: 95 }], ["Faded", { contrast: 80, brightness: 110, saturate: 80 }], ["Vintage", { sepia: 45, contrast: 90 }], ["Nightlife", { hue: 280, saturate: 150, contrast: 120 }], ["Matte", { contrast: 85, brightness: 105 }]];

/**
 * Gala Dock Studio — the single design editor for posters, social, screens, menus and QR posters (media spec §4–54).
 * Every control edits the canonical document; autosave persists it with optimistic concurrency; exports render from it.
 */
export function Studio({ design, versions: initialVersions, eventData, assets, back }: {
  design: { id: string; title: string; version: number; document: DesignDoc; canEdit: boolean; eventId: string | null };
  versions: Version[]; eventData: EventData; assets: Asset[]; back: string;
}) {
  const [doc, setDoc] = useState<DesignDoc>(design.document);
  const [title, setTitle] = useState(design.title);
  const [pageIdx, setPageIdx] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [zoom, setZoom] = useState(0.4);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Design");
  const [save, setSave] = useState<"saved" | "dirty" | "saving" | "error" | "conflict">("saved");
  const [versions, setVersions] = useState(initialVersions);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [pen, setPen] = useState<{ on: boolean; color: string; width: number }>({ on: false, color: "#0b08f8", width: 8 });
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [panel, setPanel] = useState<"" | "versions" | "export" | "publish">("");
  const [notice, setNotice] = useState("");
  const inflight = useRef<Promise<void>>(Promise.resolve()), version = useRef(design.version), past = useRef<string[]>([]), future = useRef<string[]>([]);
  const stage = useRef<HTMLDivElement>(null), pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const page = doc.pages[pageIdx]!;
  const selected = page.layers.filter(l => sel.includes(l.id));
  const one = selected.length === 1 ? selected[0]! : null;

  // Fonts used in the document load on demand (licensed open-source families via Google Fonts).
  const fontHref = useMemo(() => googleFontHref(doc.pages.flatMap(p => p.layers).filter(l => l.type === "text").map(l => (l as TextLayer).font)), [doc]);

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
  const setFx = (patch: Partial<NonNullable<Layer["effects"]>>) => updateLayers(sel, l => ({ ...l, effects: { ...(l.effects ?? {}), ...patch } }));
  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push(JSON.stringify(doc)); syncHist(); setDoc(JSON.parse(p)); setSave("dirty"); };
  const redo = () => { const f = future.current.pop(); if (!f) return; past.current.push(JSON.stringify(doc)); syncHist(); setDoc(JSON.parse(f)); setSave("dirty"); };
  const add = (l: Layer) => { updatePage(p => ({ ...p, layers: [...p.layers, l] })); setSel([l.id]); };
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
      // Edits made while this save was in flight keep the state "dirty" so they are saved next.
      if (r.ok) { version.current = r.data!; setSave(s => (s === "saving" ? "saved" : s)); setNotice(""); try { localStorage.removeItem(`gd_design_${design.id}`); } catch { /* ignore */ } }
      else if (/another tab/.test(r.error)) { setSave("conflict"); setNotice(r.error); }
      else { setSave(s => (s === "saving" ? "error" : s)); setNotice(r.error); }
    }); }, 1200);
    return () => clearTimeout(t);
  }, [save, doc, title, design.id]);
  useEffect(() => { const on = () => setSave(s => (s === "dirty" || s === "error" ? "dirty" : s)); addEventListener("online", on); return () => removeEventListener("online", on); }, []);

  // Fit to screen on load.
  const fit = useCallback(() => { const el = stage.current; if (!el) return; setZoom(Math.max(0.05, Math.min((el.clientWidth - 80) / page.width, (el.clientHeight - 80) / page.height, 2))); }, [page.width, page.height]);
  useEffect(() => { const t = setTimeout(fit, 0); return () => clearTimeout(t); }, [fit, pageIdx]);

  const duplicate = () => { const copies = selected.map(l => ({ ...structuredClone(l), id: uid(), name: `${l.name} copy`, x: l.x + 20, y: l.y + 20 })); updatePage(p => ({ ...p, layers: [...p.layers, ...copies] })); setSel(copies.map(c => c.id)); };
  const remove = () => { updatePage(p => ({ ...p, layers: p.layers.filter(l => !sel.includes(l.id) || l.locked) })); setSel([]); };

  // ── keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSel(page.layers.filter(l => !l.locked).map(l => l.id)); }
      else if (mod && e.key.toLowerCase() === "d" && sel.length) { e.preventDefault(); duplicate(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel.length) { e.preventDefault(); remove(); }
      else if (e.key === "Escape") { setSel([]); setEditingText(null); setPen(p => ({ ...p, on: false })); }
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

  // ── pointer: select, move, resize, rotate, snap, marquee, draw
  const toPage = (e: { clientX: number; clientY: number }) => { const r = pageRefs.current[pageIdx]!.getBoundingClientRect(); return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }; };
  const drag = useRef<{ mode: "move" | "resize" | "rotate" | "marquee" | "draw"; start: { x: number; y: number }; orig: Layer[]; handle?: string; path?: string } | null>(null);
  const snap = (x: number, y: number, w: number, h: number, ignore: string[]) => {
    const th = 6 / zoom, xs = [0, page.width / 2, page.width], ys = [0, page.height / 2, page.height];
    for (const l of page.layers) if (!ignore.includes(l.id) && !l.hidden) { xs.push(l.x, l.x + l.w / 2, l.x + l.w); ys.push(l.y, l.y + l.h / 2, l.y + l.h); }
    let gx: number[] = [], gy: number[] = [], nx = x, ny = y;
    for (const [off, cand] of [[0, x], [w / 2, x + w / 2], [w, x + w]] as const) { const hit = xs.find(v => Math.abs(v - cand) < th); if (hit !== undefined) { nx = hit - off; gx = [hit]; break; } }
    for (const [off, cand] of [[0, y], [h / 2, y + h / 2], [h, y + h]] as const) { const hit = ys.find(v => Math.abs(v - cand) < th); if (hit !== undefined) { ny = hit - off; gy = [hit]; break; } }
    setGuides({ x: gx, y: gy }); return { x: nx, y: ny };
  };
  const onDown = (e: RPE, layer?: Layer, handle?: string) => {
    if (!design.canEdit || e.button !== 0) return;
    const p = toPage(e);
    if (pen.on) { drag.current = { mode: "draw", start: p, orig: [], path: `M${p.x.toFixed(1)} ${p.y.toFixed(1)}` }; (e.target as Element).setPointerCapture?.(e.pointerId); return; }
    e.stopPropagation();
    if (!layer) { setSel([]); setEditingText(null); drag.current = { mode: "marquee", start: p, orig: [] }; (e.currentTarget as Element).setPointerCapture?.(e.pointerId); return; }
    if (layer.locked) { setSel([layer.id]); return; }
    const ids = e.shiftKey ? (sel.includes(layer.id) ? sel.filter(x => x !== layer.id) : [...sel, layer.id]) : sel.includes(layer.id) ? sel : [layer.id];
    setSel(ids);
    past.current = [...past.current.slice(-HISTORY + 1), JSON.stringify(doc)]; future.current = []; syncHist();
    drag.current = { mode: handle === "rot" ? "rotate" : handle ? "resize" : "move", start: p, orig: page.layers.filter(l => ids.includes(l.id)).map(l => structuredClone(l)), handle };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: RPE) => {
    const d = drag.current; if (!d) return;
    const p = toPage(e), dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (d.mode === "draw") { d.path += ` L${p.x.toFixed(1)} ${p.y.toFixed(1)}`; setMarquee({ x: 0, y: 0, w: 0, h: 0 }); return; }
    if (d.mode === "marquee") { setMarquee({ x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(dx), h: Math.abs(dy) }); return; }
    const o = d.orig[0]!;
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
      if (e.shiftKey || o.type === "image" || o.type === "qr") { const r = o.w / o.h; if (Math.abs(w - o.w) > Math.abs(hh - o.h)) hh = w / r; else w = hh * r; if (h.includes("n")) y = o.y + o.h - hh; if (h.includes("w")) x = o.x + o.w - w; }
      updateLayers([o.id], l => (l.type === "text" && e.altKey ? { ...l, x, y, w, h: hh, size: (l as TextLayer).size * (w / o.w) } : { ...l, x, y, w, h: hh }) as Layer, false);
    }
  };
  const onUp = () => {
    const d = drag.current; drag.current = null; setGuides({ x: [], y: [] });
    if (d?.mode === "draw" && d.path && d.path.includes("L")) add({ id: uid(), name: "Drawing", type: "drawing", x: 0, y: 0, w: page.width, h: page.height, rotation: 0, paths: [{ d: d.path, color: pen.color, width: pen.width, opacity: 1 }] });
    if (d?.mode === "marquee" && marquee) { const m = marquee; setSel(page.layers.filter(l => !l.locked && !l.hidden && l.x < m.x + m.w && l.x + l.w > m.x && l.y < m.y + m.h && l.y + l.h > m.y).map(l => l.id)); }
    setMarquee(null);
  };

  // ── elements
  const addText = (preset: "heading" | "sub" | "body", text?: string, bind?: string) => {
    const size = { heading: unit * 0.09, sub: unit * 0.05, body: unit * 0.032 }[preset];
    add({ id: uid(), name: preset === "heading" ? "Heading" : preset === "sub" ? "Subheading" : "Text", type: "text", text: text ?? (preset === "heading" ? "Add a heading" : preset === "sub" ? "Add a subheading" : "Add body text"), bind,
      font: "Inter", size, weight: preset === "body" ? 400 : preset === "sub" ? 600 : 800, color: "#090a2e", align: "center", lineHeight: 1.15, letterSpacing: 0, ...center(page.width * 0.7, size * 2.4) });
  };
  const addShape = (shape: "rect" | "ellipse" | "triangle" | "star" | "diamond" | "line" | "arrow" | "badge" | "speech") => add({ id: uid(), name: shape[0]!.toUpperCase() + shape.slice(1), type: "shape", shape, fill: { type: "solid", color: shape === "line" ? "#090a2e" : "#0b08f8" }, ...center(unit * 0.3, shape === "line" ? unit * 0.02 : unit * 0.3) });
  const addImage = (a: Asset) => { const w = page.width * 0.6; add({ id: uid(), name: a.title || "Image", type: "image", asset: { src: a.src, path: a.path }, fit: "cover", focusX: 50, focusY: 50, zoom: 1, ...center(w, w * 0.66) }); };
  const upload = async (file: File) => {
    const fd = new FormData(); fd.set("file", file); fd.set("purpose", "image");
    const r = await fetch("/api/uploads", { method: "POST", body: fd }); const j = await r.json();
    if (!r.ok) { setNotice(j.error ?? "Upload failed."); return; }
    addImage({ src: `/api/media/asset?path=${encodeURIComponent(j.path)}`, path: j.path, title: j.name });
  };

  const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const status = { saved: "Saved", dirty: "Unsaved", saving: "Saving…", error: "Save failed", conflict: "Conflict" }[save];

  return <div className="st">
    {fontHref.includes("family=") && <link rel="stylesheet" href={fontHref} />}
    <header className="st-top">
      <Link href={back} className="st-icon" aria-label="Back"><ArrowLeft size={18} /></Link>
      <input className="st-title" value={title} onChange={e => { setTitle(e.target.value); setSave("dirty"); }} aria-label="Design name" maxLength={140} disabled={!design.canEdit} />
      <span className={`st-save ${save}`} role="status">{save === "saving" && <Loader2 size={13} className="mk-spin" />}{status}</span>
      <div className="st-grow" />
      <button className="st-icon" onClick={undo} aria-label="Undo" disabled={!hist.undo}><Undo2 size={17} /></button>
      <button className="st-icon" onClick={redo} aria-label="Redo" disabled={!hist.redo}><Redo2 size={17} /></button>
      <button className="st-icon" onClick={() => setZoom(z => Math.max(0.05, z / 1.25))} aria-label="Zoom out"><ZoomOut size={17} /></button>
      <span className="st-zoom">{Math.round(zoom * 100)}%</span>
      <button className="st-icon" onClick={() => setZoom(z => Math.min(4, z * 1.25))} aria-label="Zoom in"><ZoomIn size={17} /></button>
      <button className="st-icon" onClick={fit} aria-label="Fit to screen"><Maximize size={16} /></button>
      <button className="st-icon" onClick={() => setZoom(1)} aria-label="Actual size"><Ruler size={16} /></button>
      <button className="st-btn" onClick={() => setPanel(panel === "versions" ? "" : "versions")}><History size={15} />Versions</button>
      {design.canEdit && <button className="st-btn" onClick={() => setPanel(panel === "publish" ? "" : "publish")}><Share2 size={15} />Template</button>}
      <button className="st-btn primary" onClick={() => setPanel(panel === "export" ? "" : "export")}><Download size={15} />Export</button>
    </header>
    {notice && <p className="st-notice" role="alert">{notice}{save === "conflict" && <button className="st-link" onClick={() => location.reload()}>Reload</button>}</p>}

    <div className="st-body">
      <nav className="st-tabs" aria-label="Tools">{TABS.map(t => { const I = { Design: LayoutTemplate, Elements: Square, Text: Type, Uploads: Upload, Icons: Sparkles, Draw: Pencil, Layers, Resize: Ruler }[t]; return <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)} aria-pressed={tab === t}><I size={18} /><span>{t}</span></button>; })}</nav>

      <aside className="st-panel" aria-label={tab}>
        {tab === "Design" && <>
          <h3>Pages</h3>
          <ul className="st-pages">{doc.pages.map((p, i) => <li key={p.id}><button className={i === pageIdx ? "on" : ""} onClick={() => { setPageIdx(i); setSel([]); }}>{p.name}<small>{Math.round(p.width)}×{Math.round(p.height)}</small></button></li>)}</ul>
          {design.canEdit && <div className="st-row">
            <button className="st-btn" onClick={() => commit({ ...doc, pages: [...doc.pages, { ...page, id: uid(), name: `Page ${doc.pages.length + 1}`, layers: [] }] })}><Plus size={14} />Add page</button>
            <button className="st-btn" onClick={() => commit({ ...doc, pages: [...doc.pages.slice(0, pageIdx + 1), { ...structuredClone(page), id: uid(), name: `${page.name} copy`, layers: page.layers.map(l => ({ ...structuredClone(l), id: uid() })) }, ...doc.pages.slice(pageIdx + 1)] })}><Copy size={14} />Duplicate</button>
            {doc.pages.length > 1 && <button className="st-btn" onClick={() => { commit({ ...doc, pages: doc.pages.filter((_, i) => i !== pageIdx) }); setPageIdx(0); }}><Trash2 size={14} />Delete</button>}
            {pageIdx > 0 && <button className="st-btn" onClick={() => { const ps = [...doc.pages]; [ps[pageIdx - 1], ps[pageIdx]] = [ps[pageIdx]!, ps[pageIdx - 1]!]; commit({ ...doc, pages: ps }); setPageIdx(pageIdx - 1); }}><ChevronUp size={14} />Move up</button>}
          </div>}
          <label className="st-field"><span>Page name</span><input value={page.name} onChange={e => updatePage(p => ({ ...p, name: e.target.value.slice(0, 60) }), false)} /></label>
          <h3>Background</h3>
          <div className="st-row"><label className="st-field"><span>Colour</span><input type="color" value={page.background?.type === "solid" ? page.background.color : "#ffffff"} onChange={e => updatePage(p => ({ ...p, background: { type: "solid", color: e.target.value } }))} /></label>
            <button className="st-btn" onClick={() => updatePage(p => ({ ...p, background: null }))}>Transparent</button>
            <button className="st-btn" onClick={() => updatePage(p => ({ ...p, background: { type: "linear", angle: 160, stops: [{ offset: 0, color: "#0b08f8" }, { offset: 1, color: "#090a2e" }] } }))}>Gradient</button></div>
          <h3>Event data</h3>
          <p className="st-hint">Text and QR codes linked to the event update automatically when event details change.</p>
          <ul className="st-chips">{PLACEHOLDERS.map(k => <li key={k}><button onClick={() => addText("body", `{{${k}}}`, k)}>{k.replace("event.", "").replace("_", " ")}</button></li>)}</ul>
        </>}
        {tab === "Elements" && <>
          <h3>Shapes</h3>
          <div className="st-grid">{([["rect", Square], ["ellipse", Circle], ["triangle", Triangle], ["star", Star], ["diamond", Square], ["arrow", ChevronUp], ["badge", Star], ["speech", Square], ["line", Ruler]] as const).map(([s, I]) => <button key={s} onClick={() => addShape(s)} aria-label={s}><I size={22} /><span>{s}</span></button>)}</div>
          <h3>Widgets</h3>
          <div className="st-grid">
            <button onClick={() => add({ id: uid(), name: "Ticket QR", type: "qr", value: "{{event.public_url}}", bind: "event.public_url", fg: "#090a2e", bg: "#ffffff", label: "Scan for tickets", ...center(unit * 0.3, unit * 0.34) })}><QrCode size={22} /><span>Event QR</span></button>
            <button onClick={() => add({ id: uid(), name: "Custom QR", type: "qr", value: "https://www.galadock.com", fg: "#090a2e", bg: "#ffffff", ...center(unit * 0.3, unit * 0.3) })}><QrCode size={22} /><span>Custom QR</span></button>
            <button onClick={() => add({ id: uid(), name: "Barcode", type: "barcode", value: "GALADOCK", fg: "#000000", bg: "#ffffff", ...center(unit * 0.5, unit * 0.16) })}><Barcode size={22} /><span>Barcode</span></button>
            <button onClick={() => addText("sub", "{{event.date}} · {{event.time}}", "event.date")}><Type size={22} /><span>Date</span></button>
            <button onClick={() => addText("sub", "{{event.venue_name}}, {{event.city}}", "event.venue_name")}><Type size={22} /><span>Venue</span></button>
            <button onClick={() => addText("sub", "Tickets from {{ticket.starting_price}}", "ticket.starting_price")}><Type size={22} /><span>Price</span></button>
          </div>
          <h3>Emoji</h3>
          <div className="st-emoji">{"🎉🎶🎤🍾🥂🎟️🔥⭐️💃🕺🎂🌹📍🎧🍸".match(/\p{Extended_Pictographic}️?/gu)!.map(em => <button key={em} onClick={() => addText("heading", em)}>{em}</button>)}</div>
        </>}
        {tab === "Text" && <>
          <button className="st-textbtn h" onClick={() => addText("heading")}>Add a heading</button>
          <button className="st-textbtn s" onClick={() => addText("sub")}>Add a subheading</button>
          <button className="st-textbtn b" onClick={() => addText("body")}>Add body text</button>
          <h3>Event fields</h3>
          <ul className="st-chips">{PLACEHOLDERS.map(k => <li key={k}><button onClick={() => addText("body", `{{${k}}}`, k)}>{k}</button></li>)}</ul>
        </>}
        {tab === "Uploads" && <>
          {design.canEdit && <label className="st-drop"><Upload size={20} /><span>Upload JPG, PNG or WebP</span><input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} /></label>}
          <p className="st-hint">Uploads stay private to you and your workspace. Gala Dock doesn’t generate photos — use your own artwork or event media.</p>
          <div className="st-assets">{assets.map(a => <button key={a.src} onClick={() => addImage(a)} title={a.title}>{/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.src} alt={a.title} loading="lazy" /></button>)}</div>
          {!assets.length && <p className="st-hint">No event media yet.</p>}
        </>}
        {tab === "Icons" && <IconPicker onPick={name => add({ id: uid(), name, type: "icon", icon: name, color: "#090a2e", ...center(unit * 0.15, unit * 0.15) })} />}
        {tab === "Draw" && <>
          <button className={`st-btn ${pen.on ? "primary" : ""}`} onClick={() => setPen(p => ({ ...p, on: !p.on }))}><Pencil size={15} />{pen.on ? "Drawing — click to stop" : "Start drawing"}</button>
          <label className="st-field"><span>Colour</span><input type="color" value={pen.color} onChange={e => setPen(p => ({ ...p, color: e.target.value }))} /></label>
          <label className="st-field"><span>Brush size {pen.width}px</span><input type="range" min={1} max={60} value={pen.width} onChange={e => setPen(p => ({ ...p, width: Number(e.target.value) }))} /></label>
          <p className="st-hint">Each stroke becomes its own drawing layer you can move, recolour or delete.</p>
        </>}
        {tab === "Layers" && <ol className="st-layers">{[...page.layers].reverse().map(l => <li key={l.id} className={sel.includes(l.id) ? "on" : ""}>
          <button className="st-lname" onClick={e => setSel(e.shiftKey ? [...sel, l.id] : [l.id])}>{l.name}<small>{l.type}</small></button>
          <button className="st-icon sm" aria-label={l.hidden ? "Show" : "Hide"} onClick={() => updateLayers([l.id], x => ({ ...x, hidden: !x.hidden }))}>{l.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
          <button className="st-icon sm" aria-label={l.locked ? "Unlock" : "Lock"} onClick={() => updateLayers([l.id], x => ({ ...x, locked: !x.locked }))}>{l.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
        </li>)}{!page.layers.length && <li className="st-hint">No layers yet.</li>}</ol>}
        {tab === "Resize" && <ResizePanel designId={design.id} />}
      </aside>

      <main className="st-stage" ref={stage} onPointerMove={onMove} onPointerUp={onUp} onWheel={e => { if (e.ctrlKey) { e.preventDefault(); setZoom(z => Math.max(0.05, Math.min(4, z * (e.deltaY < 0 ? 1.1 : 0.9)))); } }}>
        <div className="st-canvas" style={{ width: page.width * zoom, height: page.height * zoom }}>
          {doc.pages.map((p, i) => <div key={p.id} ref={el => { pageRefs.current[i] = el; }} className="st-page" aria-label={p.name}
            style={{ width: p.width, height: p.height, transform: `scale(${zoom})`, background: fillCss(p.background) || undefined, display: i === pageIdx ? "block" : "none", cursor: pen.on ? "crosshair" : "default" }}
            onPointerDown={e => onDown(e)}>
            {p.background === null && <div className="st-checker" aria-hidden="true" />}
            {p.layers.map(l => <div key={l.id} onPointerDown={e => onDown(e, l)} onDoubleClick={() => l.type === "text" && design.canEdit && !l.locked && setEditingText(l.id)}>
              <LayerView l={l} data={eventData} editing={editingText === l.id} onText={t => { updateLayers([l.id], x => ({ ...x, text: t, bind: undefined }) as Layer); setEditingText(null); }} /></div>)}
          </div>)}
          {/* selection overlay in screen space */}
          <div className="st-overlay" style={{ width: page.width * zoom, height: page.height * zoom }}>
            {selected.map(l => <div key={l.id} className="st-sel" style={{ left: l.x * zoom, top: l.y * zoom, width: l.w * zoom, height: l.h * zoom, transform: `rotate(${l.rotation}deg)` }}>
              {one && !l.locked && design.canEdit && <>{handles.map(h => <span key={h} className={`st-h ${h}`} onPointerDown={e => onDown(e, l, h)} />)}<span className="st-h rot" onPointerDown={e => onDown(e, l, "rot")} /></>}
            </div>)}
            {guides.x.map(g => <div key={`x${g}`} className="st-guide v" style={{ left: g * zoom }} />)}{guides.y.map(g => <div key={`y${g}`} className="st-guide h" style={{ top: g * zoom }} />)}
            {marquee && marquee.w > 0 && <div className="st-marquee" style={{ left: marquee.x * zoom, top: marquee.y * zoom, width: marquee.w * zoom, height: marquee.h * zoom }} />}
          </div>
        </div>
      </main>

      <aside className="st-props" aria-label="Properties">
        {!selected.length ? <p className="st-hint">Select a layer to edit it. Shift-click to multi-select, drag on empty canvas to box-select. Double-click text to edit.</p> : <>
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
            {one.type === "text" && <TextProps l={one} set={set} />}
            {one.type === "image" && <>
              <h3>Image</h3>
              <div className="st-row"><label className="st-field"><span>Fit</span><select value={one.fit} onChange={e => set({ fit: e.target.value as "cover" | "contain" })}><option value="cover">Fill (crop)</option><option value="contain">Fit</option></select></label>
                <label className="st-field"><span>Mask</span><select value={one.mask ?? "none"} onChange={e => set({ mask: e.target.value as "none" })}><option value="none">None</option><option value="rounded">Rounded</option><option value="circle">Circle</option><option value="ellipse">Ellipse</option></select></label></div>
              <label className="st-field"><span>Crop zoom {one.zoom.toFixed(2)}×</span><input type="range" min={1} max={4} step={0.05} value={one.zoom} onChange={e => set({ zoom: Number(e.target.value) }, false)} /></label>
              <label className="st-field"><span>Crop position X</span><input type="range" min={0} max={100} value={one.focusX} onChange={e => set({ focusX: Number(e.target.value) }, false)} /></label>
              <label className="st-field"><span>Crop position Y</span><input type="range" min={0} max={100} value={one.focusY} onChange={e => set({ focusY: Number(e.target.value) }, false)} /></label>
              <h3>Filters</h3>
              <div className="st-chips">{FILTERS.map(([n, f]) => <button key={n} onClick={() => setFx({ brightness: 100, contrast: 100, saturate: 100, hue: 0, grayscale: 0, sepia: 0, ...f })}>{n}</button>)}</div>
              {(["brightness", "contrast", "saturate"] as const).map(k => <label key={k} className="st-field"><span>{k} {one.effects?.[k] ?? 100}%</span><input type="range" min={0} max={200} value={one.effects?.[k] ?? 100} onChange={e => setFx({ [k]: Number(e.target.value) })} /></label>)}
              <label className="st-field"><span>Hue {one.effects?.hue ?? 0}°</span><input type="range" min={-180} max={180} value={one.effects?.hue ?? 0} onChange={e => setFx({ hue: Number(e.target.value) })} /></label>
              <label className="st-field"><span>Blur {one.effects?.blur ?? 0}px</span><input type="range" min={0} max={30} value={one.effects?.blur ?? 0} onChange={e => setFx({ blur: Number(e.target.value) })} /></label>
            </>}
            {one.type === "shape" && <FillProps fill={one.fill} onChange={f => set({ fill: f })} />}
            {(one.type === "qr" || one.type === "barcode") && <>
              <h3>{one.type === "qr" ? "QR code" : "Barcode"}</h3>
              <label className="st-field"><span>Value</span><input value={one.value} onChange={e => set({ value: e.target.value.slice(0, 500), bind: undefined })} /></label>
              <div className="st-row"><label className="st-field"><span>Colour</span><input type="color" value={one.fg} onChange={e => set({ fg: e.target.value })} /></label><label className="st-field"><span>Background</span><input type="color" value={one.bg} onChange={e => set({ bg: e.target.value })} /></label></div>
              <label className="st-field"><span>Label</span><input value={one.label ?? ""} onChange={e => set({ label: e.target.value.slice(0, 40) })} /></label>
              {qrContrast(one.fg, one.bg) < 4 && <p className="st-warn">Low contrast — this code may not scan reliably. Use a dark code on a light background.</p>}
              {one.type === "qr" && one.w < unit * 0.12 && <p className="st-warn">This QR is small; print it at least 2 cm wide.</p>}
            </>}
            {one.type === "icon" && <label className="st-field"><span>Colour</span><input type="color" value={one.color} onChange={e => set({ color: e.target.value })} /></label>}
          </>}
          <h3>Effects</h3>
          <label className="st-field"><span>Opacity {Math.round((one?.effects?.opacity ?? 1) * 100)}%</span><input type="range" min={0} max={100} value={Math.round((one?.effects?.opacity ?? 1) * 100)} onChange={e => setFx({ opacity: Number(e.target.value) / 100 })} /></label>
          <label className="st-field"><span>Blend</span><select value={one?.effects?.blend ?? "normal"} onChange={e => setFx({ blend: e.target.value })}>{BLENDS.map(b => <option key={b}>{b}</option>)}</select></label>
          <label className="st-check"><input type="checkbox" checked={!!one?.effects?.shadow} onChange={e => setFx({ shadow: e.target.checked ? { x: 0, y: unit * 0.01, blur: unit * 0.03, color: "rgba(0,0,0,0.45)" } : null })} />Drop shadow</label>
          {one?.effects?.shadow && <div className="st-grid4">{(["x", "y", "blur"] as const).map(k => <label key={k} className="st-field"><span>{k}</span><input type="number" value={Math.round(one.effects!.shadow![k])} onChange={e => setFx({ shadow: { ...one.effects!.shadow!, [k]: Number(e.target.value) } })} /></label>)}
            <label className="st-field"><span>Colour</span><input type="color" value={one.effects.shadow.color.startsWith("#") ? one.effects.shadow.color : "#000000"} onChange={e => setFx({ shadow: { ...one.effects!.shadow!, color: e.target.value } })} /></label></div>}
          <label className="st-check"><input type="checkbox" checked={!!one?.effects?.glow} onChange={e => setFx({ glow: e.target.checked ? { blur: unit * 0.02, color: "#5b6bff" } : null })} />Glow / neon</label>
          {one?.effects?.glow && <div className="st-row"><label className="st-field"><span>Spread</span><input type="range" min={1} max={80} value={one.effects.glow.blur} onChange={e => setFx({ glow: { ...one.effects!.glow!, blur: Number(e.target.value) } })} /></label>
            <label className="st-field"><span>Colour</span><input type="color" value={one.effects.glow.color} onChange={e => setFx({ glow: { ...one.effects!.glow!, color: e.target.value } })} /></label></div>}
          <label className="st-check"><input type="checkbox" checked={!!one?.effects?.stroke} onChange={e => setFx({ stroke: e.target.checked ? { width: Math.max(2, unit * 0.004), color: "#090a2e", dash: "solid" } : null })} />Border / stroke</label>
          {one?.effects?.stroke && <div className="st-row"><label className="st-field"><span>Width</span><input type="number" min={1} value={one.effects.stroke.width} onChange={e => setFx({ stroke: { ...one.effects!.stroke!, width: Number(e.target.value) } })} /></label>
            <label className="st-field"><span>Style</span><select value={one.effects.stroke.dash ?? "solid"} onChange={e => setFx({ stroke: { ...one.effects!.stroke!, dash: e.target.value as "solid" } })}><option>solid</option><option>dashed</option><option>dotted</option></select></label>
            <label className="st-field"><span>Colour</span><input type="color" value={one.effects.stroke.color} onChange={e => setFx({ stroke: { ...one.effects!.stroke!, color: e.target.value } })} /></label></div>}
          {(one?.type === "shape" || one?.type === "image") && <label className="st-field"><span>Corner radius</span><input type="range" min={0} max={Math.round(Math.min(one.w, one.h) / 2)} value={one.effects?.radius ?? 0} onChange={e => setFx({ radius: Number(e.target.value) })} /></label>}
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
    {panel === "export" && <ExportPanel pages={doc.pages} pageIdx={pageIdx} els={() => pageRefs.current.filter(Boolean) as HTMLDivElement[]} title={title} onClose={() => setPanel("")} />}
    {panel === "publish" && <PublishPanel designId={design.id} title={title} onClose={() => setPanel("")} flush={async () => { if (save !== "saved") { const r = await saveDesign(design.id, doc, version.current, title); if (r.ok) { version.current = r.data!; setSave("saved"); } } }} />}
  </div>;
}

function TextProps({ l, set }: { l: TextLayer; set: (p: Partial<Layer>, record?: boolean) => void }) {
  const [q, setQ] = useState("");
  const list = FONTS.filter(f => `${f.family} ${f.category}`.toLowerCase().includes(q.toLowerCase()));
  return <>
    <h3>Text</h3>
    <label className="st-field"><span>Text</span><textarea rows={3} value={l.text} onChange={e => set({ text: e.target.value, bind: undefined } as Partial<Layer>, false)} /></label>
    {l.bind && <p className="st-hint">Linked to <b>{l.bind}</b> — updates with the event.</p>}
    <label className="st-field"><span>Font ({FONTS.length} licensed families)</span><input placeholder="Search fonts" value={q} onChange={e => setQ(e.target.value)} />
      <select value={l.font} size={6} onChange={e => set({ font: e.target.value } as Partial<Layer>)}>{list.map(f => <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>{f.family} · {f.category}</option>)}</select></label>
    <div className="st-grid4">
      <label className="st-field"><span>Size</span><input type="number" min={4} value={Math.round(l.size)} onChange={e => set({ size: Number(e.target.value) } as Partial<Layer>)} /></label>
      <label className="st-field"><span>Weight</span><select value={l.weight} onChange={e => set({ weight: Number(e.target.value) } as Partial<Layer>)}>{[300, 400, 500, 600, 700, 800, 900].map(w => <option key={w}>{w}</option>)}</select></label>
      <label className="st-field"><span>Line</span><input type="number" step={0.05} value={l.lineHeight} onChange={e => set({ lineHeight: Number(e.target.value) } as Partial<Layer>)} /></label>
      <label className="st-field"><span>Spacing</span><input type="number" step={0.5} value={l.letterSpacing} onChange={e => set({ letterSpacing: Number(e.target.value) } as Partial<Layer>)} /></label>
    </div>
    <div className="st-row">
      <label className="st-field"><span>Colour</span><input type="color" value={l.color} onChange={e => set({ color: e.target.value, fill: undefined } as Partial<Layer>)} /></label>
      <label className="st-field"><span>Align</span><select value={l.align} onChange={e => set({ align: e.target.value as "left" } as Partial<Layer>)}><option>left</option><option>center</option><option>right</option></select></label>
      <label className="st-field"><span>Case</span><select value={l.transform ?? "none"} onChange={e => set({ transform: e.target.value as "none" } as Partial<Layer>)}><option value="none">As typed</option><option value="uppercase">UPPER</option><option value="lowercase">lower</option></select></label>
    </div>
    <div className="st-row">
      <button className="st-btn" onClick={() => set({ italic: !l.italic } as Partial<Layer>)}><i>I</i></button>
      <button className="st-btn" onClick={() => set({ underline: !l.underline } as Partial<Layer>)}><u>U</u></button>
      <button className="st-btn" onClick={() => set({ fill: l.fill ? undefined : { type: "linear", angle: 90, stops: [{ offset: 0, color: "#ff3cac" }, { offset: 1, color: "#2b86c5" }] } } as Partial<Layer>)}>Gradient</button>
      <button className="st-btn" onClick={() => set({ highlight: l.highlight ? null : "#fff200" } as Partial<Layer>)}>Highlight</button>
    </div>
    {l.fill && l.fill.type !== "solid" && <FillProps fill={l.fill} onChange={f => set({ fill: f } as Partial<Layer>)} />}
  </>;
}

function FillProps({ fill, onChange }: { fill: Fill; onChange: (f: Fill) => void }) {
  return <>
    <h3>Fill</h3>
    <div className="st-row"><select value={fill.type} onChange={e => onChange(e.target.value === "solid" ? { type: "solid", color: fill.type === "solid" ? fill.color : fill.stops[0]!.color }
      : { type: e.target.value as "linear", angle: 135, stops: fill.type === "solid" ? [{ offset: 0, color: fill.color }, { offset: 1, color: "#090a2e" }] : fill.stops })}><option value="solid">Solid</option><option value="linear">Linear gradient</option><option value="radial">Radial gradient</option></select></div>
    {fill.type === "solid" ? <input type="color" value={fill.color} onChange={e => onChange({ type: "solid", color: e.target.value })} /> : <>
      <div className="st-row">{fill.stops.map((s, i) => <input key={i} type="color" value={s.color} onChange={e => onChange({ ...fill, stops: fill.stops.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })} />)}
        {fill.stops.length < 5 && <button className="st-btn" onClick={() => onChange({ ...fill, stops: [...fill.stops, { offset: 1, color: "#ffffff" }].map((s, i, a) => ({ ...s, offset: i / (a.length - 1) })) })}><Plus size={13} />Stop</button>}</div>
      {fill.type === "linear" && <label className="st-field"><span>Angle {fill.angle ?? 180}°</span><input type="range" min={0} max={360} value={fill.angle ?? 180} onChange={e => onChange({ ...fill, angle: Number(e.target.value) })} /></label>}
    </>}
  </>;
}

const ICON_NAMES = Object.keys(icons);
function IconPicker({ onPick }: { onPick: (name: string) => void }) {
  const [q, setQ] = useState("party");
  const list = ICON_NAMES.filter(n => n.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  return <><label className="st-field"><span>Search {ICON_NAMES.length} icons</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="music, ticket, map…" /></label>
    <div className="st-grid">{list.map(n => { const I = icons[n as keyof typeof icons]; return <button key={n} onClick={() => onPick(n)} title={n}><I size={22} /></button>; })}</div></>;
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
  return <Popover title="Save as template" onClose={onClose}>
    <form className="st-form" onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); await flush();
      const r = await publishTemplate(designId, { title: String(f.get("title")), description: String(f.get("description") ?? ""), category: String(f.get("category")), tags: String(f.get("tags") ?? "").split(",").map(s => s.trim()).filter(Boolean), visibility: f.get("visibility") as "private" });
      setBusy(false); setMsg(r.ok ? "Template saved." : r.error); }}>
      <label className="st-field"><span>Title</span><input name="title" defaultValue={title} required minLength={2} maxLength={120} /></label>
      <label className="st-field"><span>Description</span><textarea name="description" rows={2} maxLength={1000} /></label>
      <label className="st-field"><span>Category</span><select name="category">{["nightclub", "festival", "wedding", "birthday", "childrens_party", "conference", "corporate", "comedy", "concert", "theatre", "networking", "webinar", "private_party", "venue_hire", "catering", "menu", "drinks", "ticket_launch", "early_bird", "sold_out", "final_release", "event_day"].map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</select></label>
      <label className="st-field"><span>Tags (comma separated)</span><input name="tags" maxLength={200} /></label>
      <label className="st-field"><span>Who can use it</span><select name="visibility" defaultValue="workspace"><option value="private">Only me</option><option value="workspace">My workspace</option><option value="link">Anyone with the link</option><option value="public">Public community</option></select></label>
      <p className="st-hint">Event details become placeholders and private uploads are replaced with safe copies — your event’s private data is never published. Others always get their own copy.</p>
      <button className="st-btn primary" disabled={busy}>{busy && <Loader2 size={14} className="mk-spin" />}Save template</button>
      {msg && <p className="st-hint" role="status">{msg}</p>}
    </form>
  </Popover>;
}
