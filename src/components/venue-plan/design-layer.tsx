"use client";

import { useEffect, useMemo, useState } from "react";
import { IconPicker, EmojiPicker, SymbolPicker, ShapePicker, WidgetPicker, FontPicker } from "@/components/design-kit/pickers";
import { ColorButton, FillButton } from "@/components/design-kit/color-picker";
import { loadFonts } from "@/lib/design-kit/assets";
import { googleFontHrefs } from "@/lib/media/document";
import type { DesignEl, DesignStyle } from "./design-el-view";
export { DesignElView, isDesignEl, DESIGN_TYPES, type DesignEl, type DesignStyle } from "./design-el-view";
import { widgetById } from "@/lib/design-kit/widgets";
import "@/styles/design-kit.css";

/** Fonts used by design text elements → stylesheet links (clamped to the Google Fonts catalogue). */
export function DesignFonts({ elements }: { elements: { type: string }[] }) {
  const [cat, setCat] = useState<Map<string, { w: number[]; i: boolean }> | null>(null);
  useEffect(() => { void loadFonts().then(l => setCat(new Map(l.map(f => [f.f, { w: f.w, i: f.i }])))).catch(() => setCat(null)); }, []);
  const hrefs = useMemo(() => { const m = new Map<string, { w: Set<number>; i: boolean }>();
    for (const e of elements) if (e.type === "text") { const t = e as DesignEl, f = t.font ?? "Inter", v = m.get(f) ?? { w: new Set<number>(), i: false }; v.w.add(t.weight ?? 700); if (t.italic) v.i = true; m.set(f, v); }
    return googleFontHrefs([...m].map(([family, v]) => ({ family, weights: [...v.w], italic: v.i })), cat); }, [elements, cat]);
  return <>{hrefs.map(h => <link key={h} rel="stylesheet" href={h} />)}</>;
}

/** Library panel for the map builder: adds design elements centred on `at` (map units), sized relative to `unit`. */
export function DesignKitPanel({ at, unit, onAdd }: { at: { x: number; y: number }; unit: number; onAdd: (e: DesignEl) => void }) {
  const [tab, setTab] = useState("Icons");
  const box = (w: number, h: number) => ({ x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w: Math.round(w), h: Math.round(h) });
  const s = unit;
  return <div className="dk-picker">
    <div className="dk-tabs" role="tablist" aria-label="Design library">{["Icons", "Emoji", "Symbols", "Shapes", "Text", "Signs", "Lines"].map(t =>
      <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab === "Icons" && <IconPicker onPick={i => onAdd({ type: "glyph", label: i.name, glyph: i.svg ? { kind: "icon", name: `${i.set}:${i.name}`, body: i.svg.body, vw: i.svg.w, vh: i.svg.h } : { kind: "icon", name: i.name }, style: { color: "#090a2e" }, ...box(s, s) })} />}
    {tab === "Emoji" && <EmojiPicker onPick={(e, n) => onAdd({ type: "glyph", label: n, glyph: { kind: "emoji", char: e }, ...box(s, s) })} />}
    {tab === "Symbols" && <SymbolPicker onPick={c => onAdd({ type: "glyph", label: `Symbol ${c}`, glyph: { kind: "symbol", char: c }, style: { color: "#090a2e" }, ...box(s, s) })} />}
    {tab === "Shapes" && <ShapePicker onPick={sh => onAdd({ type: "shape", label: sh.name, d: sh.d, lineOnly: sh.stroke, style: { fill: { type: "solid", color: sh.stroke ? "#090a2e" : "#2f6bff" }, strokeW: 3 }, ...box(s * 2, sh.group === "Lines" ? s * 0.8 : s * 2) })} />}
    {tab === "Text" && <TextAdd onAdd={(font, weight) => onAdd({ type: "text", label: "Label", font, weight, size: Math.round(s * 0.6), style: { color: "#090a2e" }, ...box(s * 4, s) })} />}
    {tab === "Signs" && <WidgetPicker onPick={w => { const k = (s * 6) / w.w; onAdd({ type: "widget", label: w.name, widget: { widget: w.widget, variant: w.variant, theme: w.theme, props: w.props }, ...box(w.w * k, w.h * k) }); }} />}
    {tab === "Lines" && <p className="dk-cap">Choose the curve tool in the toolbar, click to place points and double-click to finish. Drag a point to bend the line. Arrows, dots, dashes and colours are in the element’s properties.</p>}
  </div>;
}
function TextAdd({ onAdd }: { onAdd: (font: string, weight: number) => void }) {
  const [f, setF] = useState({ family: "Inter", weight: 700, italic: false });
  return <><button type="button" className="dk-btn wide" onClick={() => onAdd(f.family, f.weight)} style={{ fontFamily: `'${f.family}'` }}>Add text in {f.family}</button><FontPicker value={f} onChange={setF} /></>;
}

/** Properties for a selected design element. */
export function DesignElProps({ e, onChange, showName = false }: { e: DesignEl; onChange: (patch: Partial<DesignEl>) => void; showName?: boolean }) {
  const s = e.style ?? {}, st = (p: Partial<DesignStyle>) => onChange({ style: { ...s, ...p } });
  const [fonts, setFonts] = useState(false);
  const def = e.type === "widget" && e.widget ? widgetById(e.widget.widget) : null;
  return <div className="dk-picker">
    {showName && <label className="dk-field"><span>Name</span><input className="dk-in" value={e.label} onChange={ev => onChange({ label: ev.target.value.slice(0, 80) })} /></label>}
    {e.type === "text" && <>
      <button type="button" className="dk-cbtn-trigger" onClick={() => setFonts(v => !v)} aria-expanded={fonts} style={{ fontFamily: `'${e.font ?? "Inter"}'` }}><b>{e.font ?? "Inter"}</b><code>{e.weight ?? 700}</code></button>
      {fonts && <FontPicker value={{ family: e.font ?? "Inter", weight: e.weight ?? 700, italic: !!e.italic }} onChange={f => onChange({ font: f.family, weight: f.weight, italic: f.italic })} />}
      <label className="dk-field"><span>Size {e.size ?? 24}</span><input type="range" min={4} max={400} value={e.size ?? 24} onChange={ev => onChange({ size: Number(ev.target.value) })} /></label>
    </>}
    {(e.type === "glyph" || e.type === "text" || e.type === "curve") && e.glyph?.kind !== "emoji" && <ColorButton label="Colour" value={s.color ?? "#090a2e"} onChange={c => st({ color: c })} />}
    {e.type === "shape" && <FillButton label={e.lineOnly ? "Line" : "Fill"} fill={s.fill ?? { type: "solid", color: "#2f6bff" }} onChange={f => st({ fill: f })} />}
    {(e.type === "shape" || e.type === "text") && <><ColorButton label="Outline" value={s.stroke ?? "#ffffff"} onChange={c => st({ stroke: c, strokeW: s.strokeW ?? 2 })} />
      {s.stroke && <button type="button" className="dk-btn" onClick={() => st({ stroke: undefined })}>Remove outline</button>}</>}
    {(e.type === "curve" || e.type === "shape") && <>
      <label className="dk-field"><span>Line width {s.strokeW ?? 3}</span><input type="range" min={1} max={40} value={s.strokeW ?? 3} onChange={ev => st({ strokeW: Number(ev.target.value) })} /></label>
      <label className="dk-mini"><span>Style</span><select value={s.dash ?? "solid"} onChange={ev => st({ dash: ev.target.value as "solid" })}><option>solid</option><option>dashed</option><option>dotted</option></select></label></>}
    {e.type === "curve" && <div className="dk-row">
      <label className="dk-check"><input type="checkbox" checked={e.smooth ?? true} onChange={ev => onChange({ smooth: ev.target.checked })} />Curved</label>
      <label className="dk-check"><input type="checkbox" checked={!!e.closed} onChange={ev => onChange({ closed: ev.target.checked })} />Closed</label>
      <label className="dk-mini"><span>End</span><select value={e.endCap ?? "none"} onChange={ev => onChange({ endCap: ev.target.value as "none" })}><option value="none">Plain</option><option value="arrow">Arrow</option><option value="dot">Dot</option></select></label></div>}
    {e.type === "curve" && e.closed && <FillButton label="Fill" fill={s.fill ?? { type: "solid", color: "#c9ccff" }} onChange={f => st({ fill: f })} />}
    {e.type === "widget" && e.widget && <>
      {(e.widget.widget === "card" ? [{ key: "title", label: "Title" }, { key: "text", label: "Text" }, { key: "icon", label: "Icon (Lucide name)" }] : def?.fields ?? []).map(f => <label key={f.key} className="dk-field"><span>{f.label}</span>
        <input className="dk-in" value={String(e.widget!.props[f.key] ?? "")} onChange={ev => onChange({ widget: { ...e.widget!, props: { ...e.widget!.props, [f.key]: ev.target.value.slice(0, 300) } } })} /></label>)}
      <ColorButton label="Accent" value={e.widget.theme.a} onChange={c => onChange({ widget: { ...e.widget!, theme: { ...e.widget!.theme, a: c } } })} />
      <ColorButton label="Panel" value={e.widget.theme.bg} onChange={c => onChange({ widget: { ...e.widget!, theme: { ...e.widget!.theme, bg: c } } })} />
      <ColorButton label="Text" value={e.widget.theme.text} onChange={c => onChange({ widget: { ...e.widget!, theme: { ...e.widget!.theme, text: c } } })} />
    </>}
    <label className="dk-field"><span>Rotate {e.rot ?? 0}°</span><input type="range" min={-180} max={180} value={e.rot ?? 0} onChange={ev => onChange({ rot: Number(ev.target.value) })} /></label>
    <label className="dk-field"><span>Opacity {Math.round((s.opacity ?? 1) * 100)}%</span><input type="range" min={5} max={100} value={Math.round((s.opacity ?? 1) * 100)} onChange={ev => st({ opacity: Number(ev.target.value) / 100 })} /></label>
    <label className="dk-check"><input type="checkbox" checked={!!s.glow} onChange={ev => st({ glow: ev.target.checked ? { blur: 8, color: "#5b6bff" } : null })} />Glow</label>
    {s.glow && <><label className="dk-field"><span>Glow spread</span><input type="range" min={1} max={60} value={s.glow.blur} onChange={ev => st({ glow: { ...s.glow!, blur: Number(ev.target.value) } })} /></label>
      <ColorButton label="Glow" value={s.glow.color} onChange={c => st({ glow: { ...s.glow!, color: c } })} /></>}
    <label className="dk-check"><input type="checkbox" checked={!!s.shadow} onChange={ev => st({ shadow: ev.target.checked ? { x: 0, y: 3, blur: 6, color: "#00000059" } : null })} />Shadow</label>
    {s.shadow && <ColorButton label="Shadow" value={s.shadow.color} onChange={c => st({ shadow: { ...s.shadow!, color: c } })} />}
  </div>;
}
