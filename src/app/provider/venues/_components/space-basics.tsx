"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, CircleCheck, Lightbulb, Plus, Check, X, Save, ArrowRight, Ruler, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui";
import { saveSpaceFields } from "../[id]/spaces/actions";
import { LayoutGlyph, LAYOUT_LABEL, SEATED } from "./layout-glyph";

type Basics = { id: string | null; name: string; indoor: boolean; area_sqm: number | null; capacity_standing: number | null; layouts: Record<string, number>;
  details: { space_type?: string; description?: string; dimensions?: { length?: number; width?: number; ceiling?: number }; default_layout?: string; layout_notes?: Record<string, string>;
    min_capacity?: number; use_cases?: string[]; layout_features?: string[] } };
const TYPES = ["Event Hall", "Conference Room", "Meeting Room", "Studio", "Terrace", "Garden", "Private Dining", "Bar / Lounge", "Other"];
const USE_CASES = ["Concerts", "Corporate Events", "Weddings", "Parties", "Exhibitions", "Product Launches", "Conferences"];
const FEATURES = ["Stage", "Bar", "Dance Floor", "DJ Booth", "Fixed Seating", "VIP Area", "Screen / Projector", "Lighting Rig"];
// Standard per-person floor allowances (m²) used for the guide figures.
const ALLOW: [string, number][] = [["standing", 0.8], ["theatre", 1.15], ["banquet", 1.45], ["cabaret", 1.75]];
const n = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Number(v)));

/**
 * Add Space step 1 / space profile "Layouts" tab. Saves through saveSpaceFields; in the wizard, continues to `next` with the saved space id.
 */
export function SpaceBasicsForm({ venueId, initial, next, submitLabel = "Save space" }: { venueId: string; initial: Basics; next?: string; submitLabel?: string }) {
  const router = useRouter(), toast = useToast();
  const [pending, start] = useTransition();
  const [f, setF] = useState(initial);
  const d = f.details, dim = d.dimensions ?? {};
  const [sel, setSel] = useState<string>(d.default_layout && f.layouts[d.default_layout] !== undefined ? d.default_layout : Object.keys(f.layouts)[0] ?? "standing");
  const [areaManual, setAreaManual] = useState(!!initial.area_sqm && initial.area_sqm !== (dim.length ?? 0) * (dim.width ?? 0));
  const [measure, setMeasure] = useState(true);
  const [custom, setCustom] = useState<{ kind: "use" | "feat"; text: string } | null>(null);
  const setD = (patch: Partial<Basics["details"]>) => setF(x => ({ ...x, details: { ...x.details, ...patch } }));
  const setDim = (k: "length" | "width" | "ceiling", v: number | undefined) => setF(x => {
    const dims = { ...x.details.dimensions, [k]: v };
    return { ...x, details: { ...x.details, dimensions: dims }, area_sqm: areaManual ? x.area_sqm : dims.length && dims.width ? Math.round(dims.length * dims.width) : x.area_sqm };
  });
  const area = f.area_sqm ?? 0;
  const guide = area > 0 ? ALLOW.map(([k, a]) => [k, Math.round((area / a) * 0.9 / 10) * 10, Math.round((area / a) * 1.1 / 10) * 10] as const) : [];
  const maxCap = f.capacity_standing ?? Math.max(0, ...Object.values(f.layouts));
  const toggle = (list: string[] | undefined, v: string) => (list ?? []).includes(v) ? (list ?? []).filter(x => x !== v) : [...(list ?? []), v];
  const remaining = Object.keys(LAYOUT_LABEL).filter(k => f.layouts[k] === undefined);
  const save = (go: boolean) => start(async () => {
    if (!f.name.trim()) { toast("Give the space a name."); return; }
    if (!Object.keys(f.layouts).length) { toast("Add at least one layout."); return; }
    const over = Object.entries(f.layouts).find(([, v]) => maxCap > 0 && v > maxCap);
    if (over) { toast(`${LAYOUT_LABEL[over[0]] ?? over[0]} is above the maximum capacity (${maxCap}).`); return; }
    const seated = Math.max(0, ...SEATED.map(k => f.layouts[k] ?? 0));
    const r = await saveSpaceFields(venueId, f.id, { name: f.name.trim(), indoor: f.indoor, area_sqm: f.area_sqm, capacity_standing: f.capacity_standing ?? f.layouts.standing ?? null,
      capacity_seated: seated || null, layouts: f.layouts, details: { ...d, default_layout: d.default_layout ?? sel } });
    toast(r.ok ? (r.message ?? "Saved") : r.error);
    if (!r.ok) return;
    if (go && next && r.id) router.push(next.replace("{space}", r.id));
    else { if (!f.id && r.id) router.replace(`/provider/venues/${venueId}/spaces/new?step=1&space=${r.id}`); router.refresh(); }
  });

  return <div className="sb">
    <section className="ws-panel sb-basic"><h2>Basic details</h2><p>Give your space a clear name and define its physical details.</p>
      <label>Space name <i>*</i><input value={f.name} maxLength={80} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Main Hall" /></label>
      <label>Space type <i>*</i><select className="ws-select" value={d.space_type ?? ""} onChange={e => { setD({ space_type: e.target.value }); setF(x => ({ ...x, indoor: !["Terrace", "Garden"].includes(e.target.value) })); }}>
        <option value="" disabled>Choose a type</option>{TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Short description<textarea rows={4} maxLength={500} value={d.description ?? ""} onChange={e => setD({ description: e.target.value })} placeholder="What makes this space great for events?" /><small>{(d.description ?? "").length}/500</small></label>
    </section>

    <section className="ws-panel sb-dims"><h2>Dimensions &amp; capacity</h2><p>Set the size and capacity for this space.</p>
      <div className="sb-row3">
        <label>Length (m)<input type="number" min={0} step={0.5} value={dim.length ?? ""} onChange={e => setDim("length", n(e.target.value))} /></label>
        <label>Width (m)<input type="number" min={0} step={0.5} value={dim.width ?? ""} onChange={e => setDim("width", n(e.target.value))} /></label>
        <label>Ceiling height (m)<input type="number" min={0} step={0.1} value={dim.ceiling ?? ""} onChange={e => setDim("ceiling", n(e.target.value))} /></label>
      </div>
      <ul className="sb-quick">{(["standing", "theatre", "banquet", "cabaret"] as const).map(k => <li key={k}><span><LayoutGlyph type={k} size={30} />{LAYOUT_LABEL[k]}</span>
        <input type="number" min={0} aria-label={`${LAYOUT_LABEL[k]} capacity`} value={f.layouts[k] ?? ""} placeholder="—"
          onChange={e => { const v = n(e.target.value); setF(x => { const l = { ...x.layouts }; if (v === undefined) delete l[k]; else l[k] = v; return { ...x, layouts: l }; }); }} /></li>)}</ul>
      <div className="sb-row2">
        <label>Area (sqm)<span className="sb-auto"><input type="number" min={0} value={f.area_sqm ?? ""} onChange={e => { setAreaManual(true); setF({ ...f, area_sqm: n(e.target.value) ?? null }); }} />{!areaManual && <em>Auto</em>}</span></label>
        <label>Default layout<select className="ws-select" value={d.default_layout ?? sel} onChange={e => setD({ default_layout: e.target.value })}>{Object.keys(f.layouts).map(k => <option key={k} value={k}>{LAYOUT_LABEL[k] ?? k}</option>)}</select></label>
        <label>Min. capacity <small>(optional)</small><input type="number" min={0} value={d.min_capacity ?? ""} onChange={e => setD({ min_capacity: n(e.target.value) })} /></label>
        <label>Max. capacity <small>(safe limit)</small><input type="number" min={0} value={f.capacity_standing ?? ""} onChange={e => setF({ ...f, capacity_standing: n(e.target.value) ?? null })} /></label>
      </div>
    </section>

    <aside className="sb-side">
      <section className="ws-panel sb-agent"><h2><span className="sb-agent-ic"><Sparkles aria-hidden="true" /></span>Gala Agent <em>Guide</em></h2>
        {guide.length ? <div className="sb-agent-box"><p>Based on a {dim.length && dim.width ? `${dim.length}m × ${dim.width}m` : `${area} sqm`} space, standard allowances suggest:</p>
          <ul>{guide.map(([k, a, b]) => <li key={k}><CircleCheck aria-hidden="true" />{LAYOUT_LABEL[k]}: {a}–{b}</li>)}</ul>
          <button type="button" className="ws-btn outline block sm" onClick={() => setF(x => ({ ...x, layouts: { ...x.layouts, ...Object.fromEntries(guide.map(([k, a]) => [k, x.layouts[k] ?? a])) } }))}>Apply these layouts</button>
          <small>Only fills empty layouts. Always check against your fire-safety capacity.</small></div>
          : <p className="sb-muted">Add the length and width to get suggested layout capacities.</p>}</section>
      <section className="ws-panel sb-tip"><h3><Lightbulb aria-hidden="true" />Tip</h3><p>You can create multiple layouts for different event types and switch between them when booking.</p></section>
    </aside>

    <section className="ws-panel sb-layouts"><div className="sb-head"><div><h2>Layouts</h2><p>Create and configure different layouts for this space.</p></div>
      <button type="button" className="ws-btn outline sm" disabled={!guide.length} onClick={() => setF(x => ({ ...x, layouts: { ...x.layouts, ...Object.fromEntries(guide.map(([k, a]) => [k, x.layouts[k] ?? a])) } }))}><Sparkles aria-hidden="true" />Suggest layouts</button></div>
      <ul className="sb-tiles">{Object.entries(f.layouts).map(([k, v]) => <li key={k}><button type="button" className={sel === k ? "on" : ""} onClick={() => setSel(k)}>
        {sel === k && <Check aria-hidden="true" className="sb-tick" />}<LayoutGlyph type={k} size={44} /><b>{LAYOUT_LABEL[k] ?? k}</b><small>{v} capacity</small></button></li>)}
        {remaining.length > 0 && <li><label className="sb-add"><Plus aria-hidden="true" />Add layout
          <select aria-label="Add layout" value="" onChange={e => { const k = e.target.value; if (!k) return; setF(x => ({ ...x, layouts: { ...x.layouts, [k]: 0 } })); setSel(k); }}>
            <option value="" />{remaining.map(k => <option key={k} value={k}>{LAYOUT_LABEL[k]}</option>)}</select></label></li>}</ul>
      {f.layouts[sel] !== undefined && <div className="sb-sel"><h3>Selected layout: {LAYOUT_LABEL[sel] ?? sel}</h3>
        <label>Capacity<input type="number" min={0} value={f.layouts[sel]} onChange={e => setF(x => ({ ...x, layouts: { ...x.layouts, [sel]: n(e.target.value) ?? 0 } }))} /></label>
        <label className="grow">Description <small>(optional)</small><input maxLength={160} value={d.layout_notes?.[sel] ?? ""} onChange={e => setD({ layout_notes: { ...d.layout_notes, [sel]: e.target.value } })} /></label>
        <button type="button" className="ws-btn ghost sm" onClick={() => { setF(x => { const l = { ...x.layouts }; delete l[sel]; return { ...x, layouts: l }; }); setSel(Object.keys(f.layouts).find(k => k !== sel) ?? "standing"); }}><X aria-hidden="true" />Remove</button></div>}
    </section>

    <section className="ws-panel sb-plan"><div className="sb-plan-tabs"><span className="on">2D plan</span></div>
      <svg viewBox="0 0 400 240" className="sb-svg" role="img" aria-label="Space outline">
        {(() => { const L = dim.length || 24, W = dim.width || 16, k = Math.min(320 / L, 170 / W), w = L * k, h = W * k, x = (400 - w) / 2, y = (240 - h) / 2 + 6;
          return <g><rect x={x} y={y} width={w} height={h} rx="4" fill="#d9e8ff" stroke="#2f6bff" strokeWidth="1.5" />
            {(d.layout_features ?? []).includes("Stage") && <rect x={x + w * 0.3} y={y} width={w * 0.4} height={Math.max(14, h * 0.14)} fill="#3b3f5c" />}
            {(d.layout_features ?? []).includes("Bar") && <rect x={x + w - 14} y={y + h * 0.3} width={10} height={h * 0.4} fill="#f39a1e" opacity=".75" />}
            <text x={x + w / 2} y={y + h / 2 - 4} textAnchor="middle" className="sb-svg-t">{LAYOUT_LABEL[sel] ?? "Layout"}</text>
            <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" className="sb-svg-s">{f.layouts[sel] ?? 0} capacity{dim.length && dim.width ? ` · ${dim.length}m × ${dim.width}m` : ""}</text>
            {measure && dim.length ? <g className="sb-svg-m"><path d={`M${x} ${y - 10}H${x + w}`} /><text x={x + w / 2} y={y - 14} textAnchor="middle">{dim.length}m</text></g> : null}
            {measure && dim.width ? <g className="sb-svg-m"><path d={`M${x - 10} ${y}V${y + h}`} /><text x={x - 14} y={y + h / 2} textAnchor="end">{dim.width}m</text></g> : null}</g>; })()}
      </svg>
      <div className="sb-plan-foot"><label className="sb-switch"><Ruler aria-hidden="true" />Show measurements<input type="checkbox" checked={measure} onChange={e => setMeasure(e.target.checked)} /></label>
        <button type="button" className="ws-btn ghost sm" onClick={() => setMeasure(true)}><RotateCcw aria-hidden="true" />Reset view</button></div>
    </section>

    <section className="ws-panel sb-chips"><h2>Use cases</h2><p>Select the typical event types for this space.</p>
      <ul>{[...new Set([...USE_CASES, ...(d.use_cases ?? [])])].map(u => <li key={u}><button type="button" aria-pressed={(d.use_cases ?? []).includes(u)} onClick={() => setD({ use_cases: toggle(d.use_cases, u) })}>{(d.use_cases ?? []).includes(u) && <Check aria-hidden="true" />}{u}</button></li>)}
        <li>{custom?.kind === "use" ? <form onSubmit={e => { e.preventDefault(); if (custom.text.trim()) setD({ use_cases: [...(d.use_cases ?? []), custom.text.trim().slice(0, 40)] }); setCustom(null); }}><input autoFocus value={custom.text} onChange={e => setCustom({ kind: "use", text: e.target.value })} aria-label="Custom use case" /></form>
          : <button type="button" className="sb-addchip" onClick={() => setCustom({ kind: "use", text: "" })}><Plus aria-hidden="true" />Add custom</button>}</li></ul></section>
    <section className="ws-panel sb-chips"><h2>Layout features</h2><p>Add fixed features for this space (stage, bar, etc.).</p>
      <ul>{[...new Set([...FEATURES, ...(d.layout_features ?? [])])].map(u => <li key={u}><button type="button" aria-pressed={(d.layout_features ?? []).includes(u)} onClick={() => setD({ layout_features: toggle(d.layout_features, u) })}>{(d.layout_features ?? []).includes(u) && <Check aria-hidden="true" />}{u}</button></li>)}
        <li>{custom?.kind === "feat" ? <form onSubmit={e => { e.preventDefault(); if (custom.text.trim()) setD({ layout_features: [...(d.layout_features ?? []), custom.text.trim().slice(0, 40)] }); setCustom(null); }}><input autoFocus value={custom.text} onChange={e => setCustom({ kind: "feat", text: e.target.value })} aria-label="Custom feature" /></form>
          : <button type="button" className="sb-addchip" onClick={() => setCustom({ kind: "feat", text: "" })}><Plus aria-hidden="true" />Add custom</button>}</li></ul></section>
    <section className="sb-stats"><h3>Quick stats</h3><dl><div><dt>Total capacity (this layout)</dt><dd>{f.layouts[sel] ?? 0} <small>{LAYOUT_LABEL[sel]?.toLowerCase()}</small></dd></div>
      <div><dt>Floor area</dt><dd>{area || "—"} <small>sqm</small></dd></div><div><dt>Recommended uses</dt><dd className="sb-uses">{(d.use_cases ?? []).slice(0, 2).map(u => <i key={u}>{u}</i>)}</dd></div></dl></section>

    <div className="sb-foot">
      <button type="button" className="ws-btn outline" disabled={pending} onClick={() => save(false)}><Save aria-hidden="true" />{next ? "Save draft" : submitLabel}</button>
      {next && <button type="button" className="ws-btn primary" disabled={pending} onClick={() => save(true)}>{submitLabel}<ArrowRight aria-hidden="true" /></button>}
    </div>
  </div>;
}
