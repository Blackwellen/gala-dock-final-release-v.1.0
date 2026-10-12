"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { icons as lucide } from "lucide-react";
import { loadFonts, loadEmoji, loadIndex, loadIconSet, iconOf, type FontMeta, type EmojiMeta, type IconSet, type IconSetMeta, type IconSvg } from "@/lib/design-kit/assets";
import { symbolGroups } from "@/lib/design-kit/symbols";
import { shapeLibrary, type ShapeDef } from "@/lib/design-kit/shapes";
import { WIDGETS, VARIANTS, THEMES, type WidgetDef, type WidgetTheme } from "@/lib/design-kit/widgets";
import { CARD_TOPICS, CARD_LAYOUTS, cardSize, type CardTopic } from "@/lib/design-kit/info-cards";
import { effectPresets, type EffectPreset } from "@/lib/design-kit/effects";
import { WidgetView } from "./widget-view";
import type { WidgetLayer } from "@/lib/media/document";
import "@/styles/design-kit.css";

/** Grows a list as the sentinel scrolls into view, so big libraries render a page at a time. */
function useMore(step: number, deps: unknown[]) {
  const [n, setN] = useState(step); const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { queueMicrotask(() => setN(step)); }, deps);
  useEffect(() => { const el = ref.current; if (!el) return; const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) setN(x => x + step); }, { rootMargin: "200px" }); io.observe(el); return () => io.disconnect(); });
  return [n, ref] as const;
}
const Search = ({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) =>
  <input className="dk-in" type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />;
const Tabs = ({ items, value, onChange, label }: { items: string[]; value: string; onChange: (v: string) => void; label: string }) =>
  <div className="dk-tabs" role="tablist" aria-label={label}>{items.map(i => <button key={i} type="button" role="tab" aria-selected={value === i} className={value === i ? "on" : ""} onClick={() => onChange(i)}>{i}</button>)}</div>;
const Loading = () => <p className="dk-cap" role="status">Loading library…</p>;

// ── Fonts
export type FontChoice = { family: string; weight: number; italic: boolean };
const CATS = ["All", "Sans Serif", "Serif", "Display", "Handwriting", "Monospace"];
export function FontPicker({ value, onChange, custom = [] }: { value: FontChoice; onChange: (f: FontChoice) => void; custom?: string[] }) {
  const [list, setList] = useState<FontMeta[] | null>(null), [q, setQ] = useState(""), [cat, setCat] = useState("All");
  useEffect(() => { void loadFonts().then(setList).catch(() => setList([])); }, []);
  const shown = useMemo(() => (list ?? []).filter(f => (cat === "All" || f.c === cat) && f.f.toLowerCase().includes(q.toLowerCase())), [list, q, cat]);
  const [n, more] = useMore(40, [q, cat]);
  const page = shown.slice(0, n);
  // Previews: one stylesheet per 20 families, limited to the characters of each name (tiny downloads).
  const links = useMemo(() => { const out: string[] = []; for (let i = 0; i < page.length; i += 20) { const b = page.slice(i, i + 20);
    out.push(`https://fonts.googleapis.com/css2?${b.map(f => `family=${encodeURIComponent(f.f).replace(/%20/g, "+")}${f.w.includes(400) ? "" : `:wght@${f.w[0]}`}`).join("&")}&text=${encodeURIComponent([...new Set(b.map(f => f.f).join(""))].join(""))}&display=swap`); } return out; }, [page]);
  const meta = list?.find(f => f.f === value.family);
  return <div className="dk-picker">
    {links.map(h => <link key={h} rel="stylesheet" href={h} />)}
    <Search value={q} onChange={setQ} placeholder={`Search ${list?.length ?? "1,700+"} fonts`} label="Search fonts" />
    <Tabs items={CATS} value={cat} onChange={setCat} label="Font category" />
    {meta && <div className="dk-row"><label className="dk-mini"><span>Weight</span><select value={value.weight} onChange={e => onChange({ ...value, weight: Number(e.target.value) })}>{meta.w.map(w => <option key={w} value={w}>{w}</option>)}</select></label>
      {meta.i && <label className="dk-check"><input type="checkbox" checked={value.italic} onChange={e => onChange({ ...value, italic: e.target.checked })} />Italic</label>}<small className="dk-cap">{meta.w.length} weights{meta.i ? " · italics" : ""}</small></div>}
    {!list ? <Loading /> : <ul className="dk-fonts" aria-label="Fonts">
      {custom.filter(f => f.toLowerCase().includes(q.toLowerCase())).map(f => <li key={`c${f}`}><button type="button" className={value.family === f ? "on" : ""} style={{ fontFamily: `'${f}'` }} onClick={() => onChange({ ...value, family: f })}>{f}<small>Brand upload</small></button></li>)}
      {page.map(f => <li key={f.f}><button type="button" className={value.family === f.f ? "on" : ""} style={{ fontFamily: `'${f.f}', Inter` }} onClick={() => onChange({ family: f.f, weight: f.w.includes(value.weight) ? value.weight : f.w.includes(400) ? 400 : f.w[0]!, italic: value.italic && f.i })}>{f.f}<small>{f.c} · {f.w.length} weight{f.w.length === 1 ? "" : "s"}{f.i ? " · italic" : ""}</small></button></li>)}
      <div ref={more} />
    </ul>}
    {list && !shown.length && <p className="dk-cap">No fonts match “{q}”.</p>}
  </div>;
}

// ── Icons
export type IconChoice = { name: string; set: string; svg?: IconSvg };
const LUCIDE = Object.keys(lucide);
export function IconPicker({ onPick }: { onPick: (i: IconChoice) => void }) {
  const [sets, setSets] = useState<IconSetMeta[]>([]), [setId, setSetId] = useState("lucide"), [data, setData] = useState<IconSet | null>(null), [q, setQ] = useState("");
  useEffect(() => { void loadIndex().then(i => setSets(i.iconSets)).catch(() => setSets([])); }, []);
  useEffect(() => { if (setId === "lucide") { queueMicrotask(() => setData(null)); return; } let live = true; queueMicrotask(() => setData(null)); void loadIconSet(setId).then(d => { if (live) setData(d); }); return () => { live = false; }; }, [setId]);
  const names = useMemo(() => { const all = setId === "lucide" ? LUCIDE : data ? Object.keys(data.i) : []; const t = q.trim().toLowerCase().replace(/\s+/g, "-"); return t ? all.filter(n => n.toLowerCase().includes(t)) : all; }, [setId, data, q]);
  const [n, more] = useMore(120, [setId, q]);
  const total = 1 + sets.length, count = LUCIDE.length + sets.reduce((a, s) => a + s.count, 0);
  return <div className="dk-picker">
    <Search value={q} onChange={setQ} placeholder={`Search ${count.toLocaleString("en-GB")} icons`} label="Search icons" />
    <label className="dk-mini wide"><span>Library ({total})</span><select aria-label="Icon library" value={setId} onChange={e => setSetId(e.target.value)}>
      <option value="lucide">Lucide · {LUCIDE.length.toLocaleString("en-GB")}</option>{sets.map(s => <option key={s.prefix} value={s.prefix}>{s.name} · {s.count.toLocaleString("en-GB")}</option>)}</select></label>
    {setId !== "lucide" && !data ? <Loading /> : <div className="dk-igrid">{names.slice(0, n).map(name => {
      if (setId === "lucide") { const I = lucide[name as keyof typeof lucide]; return <button key={name} type="button" title={name} aria-label={name} onClick={() => onPick({ name, set: "lucide" })}><I size={22} strokeWidth={1.75} /></button>; }
      const s = iconOf(data!, name)!; return <button key={name} type="button" title={name} aria-label={name} onClick={() => onPick({ name, set: setId, svg: s })}><svg viewBox={`0 0 ${s.w} ${s.h}`} width={22} height={22} dangerouslySetInnerHTML={{ __html: s.body }} /></button>;
    })}<div ref={more} /></div>}
    {names.length === 0 && (setId === "lucide" || data) && <p className="dk-cap">No icons match “{q}”. Try another library.</p>}
    <p className="dk-cap">Licences: Lucide ISC · Tabler, Phosphor MIT · Material Design, Remix Apache-2.0.</p>
  </div>;
}

// ── Emoji & symbols
export function EmojiPicker({ onPick }: { onPick: (e: string, name: string) => void }) {
  const [list, setList] = useState<EmojiMeta[] | null>(null), [q, setQ] = useState(""), [g, setG] = useState("All");
  useEffect(() => { void loadEmoji().then(setList).catch(() => setList([])); }, []);
  const groups = useMemo(() => ["All", ...new Set((list ?? []).map(e => e.g))], [list]);
  const shown = useMemo(() => (list ?? []).filter(e => (g === "All" || e.g === g) && (!q || `${e.n} ${e.t.join(" ")}`.toLowerCase().includes(q.toLowerCase()))), [list, q, g]);
  const [n, more] = useMore(160, [q, g]);
  return <div className="dk-picker">
    <Search value={q} onChange={setQ} placeholder={`Search ${list?.length ?? "1,900"} emoji`} label="Search emoji" />
    <label className="dk-mini wide"><span>Group</span><select value={g} onChange={e => setG(e.target.value)}>{groups.map(x => <option key={x}>{x}</option>)}</select></label>
    {!list ? <Loading /> : <div className="dk-egrid">{shown.slice(0, n).map(e => <button key={e.e} type="button" title={e.n} aria-label={e.n} onClick={() => onPick(e.e, e.n)}>{e.e}</button>)}<div ref={more} /></div>}
  </div>;
}
export function SymbolPicker({ onPick }: { onPick: (c: string) => void }) {
  const groups = useMemo(() => symbolGroups(), []), [g, setG] = useState(groups[0]!.name);
  const total = groups.reduce((a, x) => a + x.chars.length, 0);
  return <div className="dk-picker">
    <label className="dk-mini wide"><span>{total} symbols</span><select value={g} onChange={e => setG(e.target.value)}>{groups.map(x => <option key={x.name} value={x.name}>{x.name} · {x.chars.length}</option>)}</select></label>
    <div className="dk-egrid sym">{groups.find(x => x.name === g)!.chars.map(c => <button key={c} type="button" aria-label={`Symbol ${c} (U+${c.codePointAt(0)!.toString(16).toUpperCase()})`} title={`U+${c.codePointAt(0)!.toString(16).toUpperCase()}`} onClick={() => onPick(c)}>{c}</button>)}</div>
  </div>;
}

// ── Shapes
export function ShapePicker({ onPick }: { onPick: (s: ShapeDef) => void }) {
  const lib = useMemo(() => shapeLibrary(), []), [q, setQ] = useState(""), [g, setG] = useState("All");
  const groups = useMemo(() => ["All", ...new Set(lib.map(s => s.group))], [lib]);
  const shown = lib.filter(s => (g === "All" || s.group === g) && s.name.toLowerCase().includes(q.toLowerCase()));
  const [n, more] = useMore(96, [q, g]);
  return <div className="dk-picker">
    <Search value={q} onChange={setQ} placeholder={`Search ${lib.length} shapes`} label="Search shapes" />
    <label className="dk-mini wide"><span>Group</span><select value={g} onChange={e => setG(e.target.value)}>{groups.map(x => <option key={x}>{x}</option>)}</select></label>
    <div className="dk-sgrid">{shown.slice(0, n).map(s => <button key={s.id} type="button" title={s.name} aria-label={s.name} onClick={() => onPick(s)}>
      <svg viewBox="-4 -4 108 108" width={34} height={34}><path d={s.d} fill={s.stroke ? "none" : "currentColor"} fillRule="evenodd" stroke={s.stroke ? "currentColor" : "none"} strokeWidth={s.stroke ? 6 : 0} strokeLinecap="round" /></svg></button>)}<div ref={more} /></div>
  </div>;
}

// ── Widgets (parametric widgets + info cards)
export type WidgetChoice = { widget: string; variant: number; theme: WidgetTheme; props: Record<string, string | number>; w: number; h: number; name: string };
const mini = (c: WidgetChoice, id: string): WidgetLayer => ({ id, name: c.name, type: "widget", x: 0, y: 0, w: c.w, h: c.h, rotation: 0, widget: c.widget, variant: c.variant, theme: c.theme, props: c.props });
function Thumb({ c, k }: { c: WidgetChoice; k: string }) {
  const s = 132 / Math.max(c.w, c.h * 1.25);
  return <span className="dk-wthumb" style={{ width: 132, height: Math.max(48, c.h * s) }}><WidgetView l={mini(c, k)} style={{ width: c.w * s, height: c.h * s, display: "block" }} /></span>;
}
export function WidgetPicker({ onPick }: { onPick: (w: WidgetChoice) => void }) {
  const [mode, setMode] = useState("Info cards"), [q, setQ] = useState(""), [theme, setTheme] = useState(0), [variant, setVariant] = useState(0), [layout, setLayout] = useState(0);
  const th = THEMES[theme]!.theme;
  const cards = useMemo(() => CARD_TOPICS.filter(t => !q || `${t.title} ${t.group} ${t.text}`.toLowerCase().includes(q.toLowerCase())), [q]);
  const widgets = WIDGETS.filter(w => !q || `${w.name} ${w.group}`.toLowerCase().includes(q.toLowerCase()));
  const [n, more] = useMore(24, [q, mode, layout]);
  const lay = CARD_LAYOUTS[layout]!, size = cardSize(lay);
  const fromCard = (t: CardTopic): WidgetChoice => ({ widget: "card", variant, theme: th, props: { icon: t.icon, title: t.title, text: t.text, layout }, w: size.w, h: size.h, name: t.title });
  const fromDef = (d: WidgetDef): WidgetChoice => ({ widget: d.id, variant, theme: th, props: { ...d.props }, w: d.w, h: d.h, name: d.name });
  return <div className="dk-picker">
    <Tabs items={["Info cards", "Widgets"]} value={mode} onChange={setMode} label="Widget type" />
    <Search value={q} onChange={setQ} placeholder={mode === "Info cards" ? `Search ${CARD_TOPICS.length} topics — parking, dress code, menu…` : `Search ${WIDGETS.length} widgets`} label="Search widgets" />
    <div className="dk-row"><label className="dk-mini"><span>Colours</span><select value={theme} onChange={e => setTheme(Number(e.target.value))}>{THEMES.map((t, i) => <option key={t.name} value={i}>{t.name}</option>)}</select></label>
      <label className="dk-mini"><span>Style</span><select value={variant} onChange={e => setVariant(Number(e.target.value))}>{VARIANTS.map((v, i) => <option key={v} value={i}>{v}</option>)}</select></label>
      {mode === "Info cards" && <label className="dk-mini"><span>Layout</span><select value={layout} onChange={e => setLayout(Number(e.target.value))}>{CARD_LAYOUTS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}</div>
    <p className="dk-cap">{mode === "Info cards" ? `${CARD_TOPICS.length} topics × ${CARD_LAYOUTS.length} layouts × ${VARIANTS.length} styles × ${THEMES.length} colour sets` : `${WIDGETS.length} widget types × ${VARIANTS.length} styles × ${THEMES.length} colour sets`} — every word and colour stays editable.</p>
    <div className="dk-wgrid">{mode === "Info cards"
      ? cards.slice(0, n).map((t, i) => { const c = fromCard(t); return <button key={`${t.group}${t.title}${i}`} type="button" onClick={() => onPick(c)} title={t.title}><Thumb c={c} k={`wc${i}`} /><small>{t.title}</small></button>; })
      : widgets.slice(0, n).map((d, i) => { const c = fromDef(d); return <button key={d.id} type="button" onClick={() => onPick(c)} title={d.name}><Thumb c={c} k={`wd${i}`} /><small>{d.name}</small></button>; })}<div ref={more} /></div>
  </div>;
}

// ── Effects
export function EffectsPicker({ kind, onApply }: { kind: "text" | "image" | "shape" | "other"; onApply: (p: EffectPreset) => void }) {
  const all = useMemo(() => effectPresets().filter(p => p.for.includes("any") || p.for.includes(kind as "text")), [kind]);
  const groups = useMemo(() => [...new Set(all.map(p => p.group))], [all]);
  const [g, setG] = useState(groups[0] ?? ""), [q, setQ] = useState("");
  const shown = all.filter(p => (q ? p.name.toLowerCase().includes(q.toLowerCase()) : p.group === g));
  return <div className="dk-picker">
    <Search value={q} onChange={setQ} placeholder={`Search ${all.length} effects`} label="Search effects" />
    {!q && <label className="dk-mini wide"><span>Group</span><select value={g} onChange={e => setG(e.target.value)}>{groups.map(x => <option key={x}>{x}</option>)}</select></label>}
    <div className="dk-fx">{shown.map(p => <button key={p.id} type="button" onClick={() => onApply(p)} title={p.name}>{p.name}</button>)}</div>
  </div>;
}
