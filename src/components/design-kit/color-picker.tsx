"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from "react";
import { Pipette, Plus, Trash2 } from "lucide-react";
import { parseColor, toHex, toRgbString, rgbToHsl, hslToRgb, rgbToHsv, hsvToRgb, swatches, palettes, gradientPresets, type RGBA } from "@/lib/design-kit/color";
import type { Fill } from "@/lib/media/document";
import { fillCss } from "@/lib/media/render";
import "@/styles/design-kit.css";

const RECENT_KEY = "gd-recent-colours";
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; } };
const pushRecent = (c: string) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([c, ...readRecent().filter(x => x !== c)].slice(0, 16))); } catch { /* storage unavailable */ } };
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

/** Full colour picker: SV area, hue + alpha sliders, HEX / RGB / HSL entry, eyedropper, swatches, palettes, document + recent colours. */
export function ColorPicker({ value, onChange, docColors = [], alpha = true }: { value: string; onChange: (c: string) => void; docColors?: string[]; alpha?: boolean }) {
  const rgb = parseColor(value) ?? { r: 0, g: 0, b: 0, a: 1 };
  const [hsv, setHsv] = useState(() => rgbToHsv(rgb));
  const [mode, setMode] = useState<"hex" | "rgb" | "hsl">("hex");
  const [tab, setTab] = useState<"swatches" | "palettes">("swatches");
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const last = useRef(value);
  useEffect(() => { queueMicrotask(() => setRecent(readRecent())); }, []);
  // Follow external changes (another layer selected, undo…).
  useEffect(() => { if (value !== last.current) { last.current = value; const c = parseColor(value); if (c) queueMicrotask(() => setHsv(rgbToHsv(c))); } }, [value]);
  const emit = (c: RGBA, record = false) => { const s = toHex(c, alpha && c.a < 1); last.current = s; onChange(s); if (record) { pushRecent(s); setRecent(readRecent()); } };
  const setFromHsv = (h: number, s: number, v: number, a: number, record = false) => { setHsv({ h, s, v, a }); emit(hsvToRgb(h, s, v, a), record); };

  const sv = useRef<HTMLDivElement>(null);
  const dragSv = (e: RPE) => { const r = sv.current!.getBoundingClientRect(); setFromHsv(hsv.h, Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)), hsv.a); };
  const hsl = rgbToHsl(rgb);
  const pals = useMemo(() => palettes(), []);
  const shownPals = pals.filter(p => `${p.name} ${p.group}`.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  const pick = (c: string) => { const p = parseColor(c); if (p) { setHsv(rgbToHsv(p)); emit(p, true); } };
  const eye = typeof window !== "undefined" && "EyeDropper" in window;

  return <div className="dk-color">
    <div ref={sv} className="dk-sv" style={{ background: `hsl(${hsv.h} 100% 50%)` }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); dragSv(e); }} onPointerMove={e => e.buttons && dragSv(e)} onPointerUp={() => emit(hsvToRgb(hsv.h, hsv.s, hsv.v, hsv.a), true)}
      role="slider" aria-label="Saturation and brightness" aria-valuenow={Math.round(hsv.s * 100)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={toHex(rgb)} tabIndex={0}
      onKeyDown={e => { const d = e.shiftKey ? 0.1 : 0.02; if (e.key === "ArrowLeft") setFromHsv(hsv.h, Math.max(0, hsv.s - d), hsv.v, hsv.a); if (e.key === "ArrowRight") setFromHsv(hsv.h, Math.min(1, hsv.s + d), hsv.v, hsv.a); if (e.key === "ArrowUp") setFromHsv(hsv.h, hsv.s, Math.min(1, hsv.v + d), hsv.a); if (e.key === "ArrowDown") setFromHsv(hsv.h, hsv.s, Math.max(0, hsv.v - d), hsv.a); }}>
      <span style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: toHex({ ...rgb, a: 1 }) }} /></div>
    <div className="dk-sliders">
      {eye && <button type="button" className="dk-ibtn" aria-label="Pick a colour from the screen" onClick={async () => { try { const r = await new (window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper().open(); pick(r.sRGBHex); } catch { /* cancelled */ } }}><Pipette size={15} /></button>}
      <div className="dk-sl-col">
        <input type="range" className="dk-hue" min={0} max={359} value={Math.round(hsv.h)} aria-label="Hue" onChange={e => setFromHsv(Number(e.target.value), hsv.s, hsv.v, hsv.a)} onPointerUp={() => emit(hsvToRgb(hsv.h, hsv.s, hsv.v, hsv.a), true)} />
        {alpha && <input type="range" className="dk-alpha" min={0} max={100} value={Math.round(hsv.a * 100)} aria-label="Opacity" style={{ ["--dk-c" as string]: toHex({ ...rgb, a: 1 }) }} onChange={e => setFromHsv(hsv.h, hsv.s, hsv.v, Number(e.target.value) / 100)} />}
      </div>
      <span className="dk-chip" style={{ background: toRgbString(rgb) }} aria-hidden="true" />
    </div>
    <div className="dk-modes" role="tablist" aria-label="Colour format">{(["hex", "rgb", "hsl"] as const).map(m => <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{m.toUpperCase()}</button>)}</div>
    {mode === "hex" && <input className="dk-in" aria-label="Hex colour" defaultValue={toHex(rgb, rgb.a < 1)} key={`h${toHex(rgb, true)}`} onBlur={e => { const c = parseColor(e.target.value); if (c) { setHsv(rgbToHsv(c)); emit(c, true); } }} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />}
    {mode === "rgb" && <div className="dk-trio">{(["r", "g", "b"] as const).map(k => <label key={k}><span>{k.toUpperCase()}</span><input type="number" min={0} max={255} value={Math.round(rgb[k])} onChange={e => { const c = { ...rgb, [k]: Math.min(255, Math.max(0, Number(e.target.value) || 0)) }; setHsv(rgbToHsv(c)); emit(c); }} /></label>)}
      {alpha && <label><span>A</span><input type="number" min={0} max={100} value={Math.round(rgb.a * 100)} onChange={e => { const c = { ...rgb, a: Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100 }; setHsv(rgbToHsv(c)); emit(c); }} /></label>}</div>}
    {mode === "hsl" && <div className="dk-trio">{([["h", 360], ["s", 100], ["l", 100]] as const).map(([k, max]) => <label key={k}><span>{k.toUpperCase()}</span><input type="number" min={0} max={max} value={Math.round(hsl[k])} onChange={e => { const c = hslToRgb({ ...hsl, [k]: Math.min(max, Math.max(0, Number(e.target.value) || 0)) }); setHsv(rgbToHsv(c)); emit(c); }} /></label>)}</div>}
    {docColors.length > 0 && <><p className="dk-cap">In this design</p><div className="dk-sw">{[...new Set(docColors)].slice(0, 16).map(c => <button key={c} type="button" style={{ background: c }} aria-label={c} title={c} onClick={() => pick(c)} />)}</div></>}
    {recent.length > 0 && <><p className="dk-cap">Recent</p><div className="dk-sw">{recent.map(c => <button key={c} type="button" style={{ background: c }} aria-label={c} title={c} onClick={() => pick(c)} />)}</div></>}
    <div className="dk-modes" role="tablist" aria-label="Colour library"><button type="button" role="tab" aria-selected={tab === "swatches"} className={tab === "swatches" ? "on" : ""} onClick={() => setTab("swatches")}>Swatches</button>
      <button type="button" role="tab" aria-selected={tab === "palettes"} className={tab === "palettes" ? "on" : ""} onClick={() => setTab("palettes")}>{pals.length} palettes</button></div>
    {tab === "swatches" ? <div className="dk-grid11">{swatches().flat().map((c, i) => <button key={`${c}${i}`} type="button" style={{ background: c }} aria-label={c} title={c} onClick={() => pick(c)} />)}</div>
      : <><input className="dk-in" placeholder="Search palettes — wedding, neon, ocean…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search palettes" />
        <ul className="dk-pals">{shownPals.map(p => <li key={`${p.group}${p.name}`}><small>{p.name}</small><div>{p.colors.map((c, i) => <button key={i} type="button" style={{ background: c }} aria-label={`${p.name} ${c}`} title={c} onClick={() => pick(c)} />)}</div></li>)}</ul></>}
  </div>;
}

/** Fill editor: solid, linear, radial or conic gradient with any number of stops (drag to position), angle and ~200 presets. */
export function FillPicker({ fill, onChange, docColors }: { fill: Fill; onChange: (f: Fill) => void; docColors?: string[] }) {
  const [stop, setStop] = useState(0);
  const [showPresets, setShowPresets] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const presets = useMemo(() => gradientPresets(), []);
  const grad = fill.type === "solid" ? null : fill;
  const sorted = (stops: { offset: number; color: string }[]) => [...stops].sort((a, b) => a.offset - b.offset);
  return <div className="dk-fill">
    <div className="dk-modes" role="tablist" aria-label="Fill type">{(["solid", "linear", "radial", "conic"] as const).map(t => <button key={t} type="button" role="tab" aria-selected={fill.type === t} className={fill.type === t ? "on" : ""}
      onClick={() => onChange(t === "solid" ? { type: "solid", color: grad ? grad.stops[0]!.color : fill.type === "solid" ? fill.color : "#000000" } : { type: t, angle: grad?.angle ?? (t === "conic" ? 0 : 135), stops: grad?.stops ?? [{ offset: 0, color: fill.type === "solid" ? fill.color : "#0b08f8" }, { offset: 1, color: "#090a2e" }] })}>{t[0]!.toUpperCase() + t.slice(1)}</button>)}</div>
    {fill.type === "solid" ? <ColorPicker value={fill.color} onChange={c => onChange({ type: "solid", color: c })} docColors={docColors} /> : grad && <>
      <div className="dk-gbar" ref={bar} style={{ background: `linear-gradient(90deg, ${sorted(grad.stops).map(s => `${s.color} ${Math.round(s.offset * 100)}%`).join(",")})` }}
        onDoubleClick={e => { const r = bar.current!.getBoundingClientRect(), off = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); onChange({ ...grad, stops: [...grad.stops, { offset: +off.toFixed(3), color: grad.stops[stop]?.color ?? "#ffffff" }] }); setStop(grad.stops.length); }}>
        {grad.stops.map((s, i) => <button key={i} type="button" className={`dk-stop ${i === stop ? "on" : ""}`} style={{ left: `${s.offset * 100}%`, background: s.color }} aria-label={`Stop ${i + 1} at ${Math.round(s.offset * 100)}%`}
          onPointerDown={e => { setStop(i); e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={e => { if (!e.buttons) return; const r = bar.current!.getBoundingClientRect(); const off = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); onChange({ ...grad, stops: grad.stops.map((x, j) => (j === i ? { ...x, offset: +off.toFixed(3) } : x)) }); }} />)}
      </div>
      <div className="dk-row">
        <button type="button" className="dk-btn" onClick={() => { onChange({ ...grad, stops: [...grad.stops, { offset: 0.5, color: "#ffffff" }] }); setStop(grad.stops.length); }}><Plus size={13} />Stop</button>
        {grad.stops.length > 2 && <button type="button" className="dk-btn" onClick={() => { onChange({ ...grad, stops: grad.stops.filter((_, j) => j !== stop) }); setStop(0); }}><Trash2 size={13} />Remove stop</button>}
        <label className="dk-mini"><span>Pos</span><input type="number" min={0} max={100} value={Math.round((grad.stops[stop]?.offset ?? 0) * 100)} onChange={e => onChange({ ...grad, stops: grad.stops.map((x, j) => (j === stop ? { ...x, offset: Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100 } : x)) })} />%</label>
      </div>
      {grad.type !== "radial" && <label className="dk-field"><span>Angle {grad.angle ?? 0}°</span><input type="range" min={0} max={360} value={grad.angle ?? 0} onChange={e => onChange({ ...grad, angle: Number(e.target.value) })} /></label>}
      {grad.stops[stop] && <ColorPicker value={grad.stops[stop]!.color} onChange={c => onChange({ ...grad, stops: grad.stops.map((x, j) => (j === stop ? { ...x, color: c } : x)) })} docColors={docColors} />}
    </>}
    <button type="button" className="dk-btn wide" onClick={() => setShowPresets(s => !s)} aria-expanded={showPresets}>{showPresets ? "Hide" : "Show"} {presets.length} gradient presets</button>
    {showPresets && <div className="dk-gpresets">{presets.map(p => <button key={`${p.name}${p.type}`} type="button" title={p.name} aria-label={p.name} style={{ background: fillCss(p) }} onClick={() => onChange({ type: p.type, angle: p.angle, stops: p.stops })} />)}</div>}
  </div>;
}

/** Compact swatch button that opens a ColorPicker / FillPicker popover. */
export function ColorButton({ value, onChange, label, docColors }: { value: string; onChange: (c: string) => void; label: string; docColors?: string[] }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("pointerdown", off); addEventListener("keydown", k); return () => { removeEventListener("pointerdown", off); removeEventListener("keydown", k); }; }, [open]);
  return <div className="dk-cbtn" ref={ref}><button type="button" className="dk-cbtn-trigger" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={`${label}: ${value}`}><span style={{ background: value }} /><b>{label}</b><code>{value}</code></button>
    {open && <div className="dk-pop" role="dialog" aria-label={label}><ColorPicker value={value} onChange={onChange} docColors={docColors} /></div>}</div>;
}
export function FillButton({ fill, onChange, label, docColors }: { fill: Fill; onChange: (f: Fill) => void; label: string; docColors?: string[] }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("pointerdown", off); addEventListener("keydown", k); return () => { removeEventListener("pointerdown", off); removeEventListener("keydown", k); }; }, [open]);
  return <div className="dk-cbtn" ref={ref}><button type="button" className="dk-cbtn-trigger" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={`${label}: ${fill.type}`}><span style={{ background: fillCss(fill) }} /><b>{label}</b><code>{fill.type === "solid" ? fill.color : fill.type}</code></button>
    {open && <div className="dk-pop" role="dialog" aria-label={label}><FillPicker fill={fill} onChange={onChange} docColors={docColors} /></div>}</div>;
}
