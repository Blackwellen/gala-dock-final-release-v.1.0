"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Minus, Maximize2, Pencil, Users, LayoutGrid, Sparkles, Trash2, Save, Upload, DoorOpen, Truck, Mic2, Wine, Bath, ShieldAlert, Accessibility, CircleCheck, ArrowRight,
  Theater, UtensilsCrossed, Armchair, PersonStanding, School, Shapes, Lock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useToast } from "@/components/ui";
import { VenueMap, mapBounds, FIXTURE_LABEL, type MapEl } from "./venue-map";
import { saveSpace, saveStructure, type SpaceInput } from "../[id]/actions";
import { setSpaceStatus } from "../../listings/actions";

export type EditorSpace = Omit<SpaceInput, "status"> & { id: string; status: string; image: string };
const LAYOUTS: [string, string, LucideIcon][] = [["theatre", "Theatre", Theater], ["banquet", "Banquet", UtensilsCrossed], ["cabaret", "Cabaret", Armchair], ["standing", "Standing", PersonStanding], ["classroom", "Classroom", School], ["custom", "Custom", Shapes]];
const FEATURES: [MapEl["type"], LucideIcon, string][] = [["entrance", DoorOpen, "Guest entrance"], ["loading", Truck, "Staff / deliveries"], ["stage", Mic2, "Fixed stage"], ["bar", Wine, "Fixed bar"], ["toilets", Bath, "Facilities"], ["exit", ShieldAlert, "Protected — can’t be removed"], ["accessible_route", Accessibility, "Step-free route"]];
const blank = (): EditorSpace => ({ id: "", status: "draft", image: "", name: "", indoor: true, capacity_standing: null, capacity_seated: null, area_sqm: null, rate_hourly: null, min_hours: 2, turnaround_minutes: 60, layouts: {}, amenities: [], description: "" });
const numOrNull = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v)));

/**
 * Spaces & structural map editor (venue profile "Spaces & Map" tab and Add Venue step 2).
 * Space edits save through provider_save_space; the map saves as a new structure version (draft or published) through provider_save_structure.
 */
export function SpacesEditor({ venueId, spaces, elements: initial, version, footer }: { venueId: string; spaces: EditorSpace[]; elements: MapEl[]; version: number; footer?: React.ReactNode }) {
  const router = useRouter(), toast = useToast();
  const [pending, start] = useTransition();
  const [selId, setSelId] = useState<string>(spaces[0]?.id ?? "new");
  const [form, setForm] = useState<EditorSpace>(spaces[0] ?? blank());
  const [els, setEls] = useState<MapEl[]>(initial);
  const [dirtyMap, setDirtyMap] = useState(false);
  const [draw, setDraw] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selEl, setSelEl] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ i: number; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const mapSpaces = useMemo(() => spaces.map(s => ({ id: s.id, name: s.name, capacity: Math.max(s.capacity_seated ?? 0, s.capacity_standing ?? 0), indoor: s.indoor })), [spaces]);
  const set = <K extends keyof EditorSpace>(k: K, val: EditorSpace[K]) => setForm(f => ({ ...f, [k]: val }));
  const pick = (s: EditorSpace | null) => { setSelId(s?.id ?? "new"); setForm(s ?? blank()); };
  const maxCap = Math.max(form.capacity_standing ?? 0, form.capacity_seated ?? 0);
  const overCap = Object.entries(form.layouts).filter(([, n]) => maxCap > 0 && n > maxCap).map(([k]) => k);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) => start(async () => {
    const r = await fn(); toast(r.ok ? (r.message ?? "Saved") : (r.error ?? "Something went wrong")); if (r.ok) { after?.(); router.refresh(); }
  });
  const pt = (e: { clientX: number; clientY: number }) => { const m = svg.current?.getScreenCTM(); if (!m) return { x: 0, y: 0 }; const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return { x: p.x, y: p.y }; };
  const onElDown = (e: ReactPointerEvent<SVGGElement>, i: number) => {
    e.stopPropagation(); setSelEl(i);
    const el = els[i]; if (el.type === "room" && el.space) { const s = spaces.find(x => x.id === el.space); if (s) pick(s); }
    if (!draw || el.locked || el.protected || el.points) return;
    const p = pt(e); drag.current = { i, sx: p.x, sy: p.y, ox: el.x ?? 0, oy: el.y ?? 0 };
    e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current; if (!d) return;
    const p = pt(e), snap = (n: number) => Math.round(n / 10) * 10;
    setEls(list => list.map((el, i) => i === d.i ? { ...el, x: Math.max(0, snap(d.ox + p.x - d.sx)), y: Math.max(0, snap(d.oy + p.y - d.sy)) } : el)); setDirtyMap(true);
  };
  const addRoom = () => {
    if (!form.id) return toast("Save the space first, then place it on the map.");
    if (els.some(e => e.type === "room" && e.space === form.id)) return toast("This space is already on the map — drag it to move it.");
    const { h } = mapBounds(els);
    setEls(l => [...l, { type: "room", id: `room-${form.id.slice(0, 8)}`, label: form.name, x: 20, y: Math.max(20, h - 160), w: 160, h: 110, space: form.id }]); setDirtyMap(true); setDraw(true);
  };
  const addFeature = (type: MapEl["type"]) => {
    const n = els.filter(e => e.type === type).length + 1, label = `${FIXTURE_LABEL[type] ?? "Feature"}${n > 1 ? ` ${n}` : ""}`;
    setEls(l => [...l, type === "accessible_route" ? { type, label, points: [[40, 40], [200, 40]] } : { type, label, x: 30, y: 30, w: type === "exit" ? 10 : 80, h: type === "exit" ? 30 : 34, ...(type === "exit" ? { protected: true } : {}) }]);
    setDirtyMap(true); setDraw(true);
  };
  const removeEl = (i: number) => {
    const el = els[i]; if (el.protected) return toast("Fire exits are protected and can’t be removed from the map.");
    setEls(l => l.filter((_, j) => j !== i)); setSelEl(null); setDirtyMap(true);
  };
  const features = els.map((e, i) => ({ e, i })).filter(x => x.e.type !== "room" && x.e.type !== "water");
  // Deterministic suggestions from the current setup — shown for review, never applied automatically.
  const suggestions = [
    ...spaces.filter(s => !s.layouts.standing && (s.capacity_standing ?? 0) > 0).map(s => `Add a standing layout for ${s.name} (up to ${s.capacity_standing}).`),
    ...spaces.filter(s => s.turnaround_minutes < 30).map(s => `Set at least a 30 minute turnaround for ${s.name}.`),
    ...(els.filter(e => e.type === "entrance").length < 2 ? ["Add a secondary entrance for large events."] : []),
    ...spaces.filter(s => !els.some(e => e.type === "room" && e.space === s.id)).map(s => `Place ${s.name} on the venue map.`),
    ...(els.some(e => e.type === "accessible_route") ? [] : ["Mark a step-free route for accessibility."]),
  ].slice(0, 4);

  return <div className="se">
    <section className="ws-panel se-spaces"><div className="se-head"><div><h2>Spaces</h2><p>Add your venue spaces, set capacities and configure layouts.</p></div>
      <div className="se-head-actions"><button type="button" className="ws-btn outline sm" onClick={() => pick(null)}><Plus aria-hidden="true" />Add space</button>
        <Link className="ws-btn outline sm se-ai" href={`/provider/agent?goal=${encodeURIComponent("Suggest spaces and layouts for my venue")}`}><Sparkles aria-hidden="true" />Suggest with AI</Link></div></div>
      <div className="se-cols">
        <ul className="se-list">{spaces.map(s => <li key={s.id}><button type="button" className={selId === s.id ? "on" : ""} onClick={() => pick(s)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.image ? <img src={s.image} alt="" /> : <span className="qb-noimg" />}
          <span><b>{s.name}</b><small><Users aria-hidden="true" />{Math.max(s.capacity_standing ?? 0, s.capacity_seated ?? 0)} ({s.capacity_standing ? "standing" : "seated"})</small>
            <small><LayoutGrid aria-hidden="true" />{Object.keys(s.layouts).length} layouts</small></span>
          <i className={`se-dot ${s.status}`} title={s.status} /></button></li>)}
          {selId === "new" && <li><button type="button" className="on"><span className="qb-noimg" /><span><b>{form.name || "New space"}</b><small>Not saved yet</small></span></button></li>}
        </ul>
        <div className="se-form">
          <div className="se-card"><div className="se-card-head"><h3>Space details</h3><small><i>*</i> Required</small></div>
            <div className="se-grid">
              <label><span>Space name <i>*</i></span><input value={form.name} onChange={e => set("name", e.target.value)} maxLength={80} required /></label>
              <label><span>Space type <i>*</i></span><select className="ws-select" value={form.indoor ? "indoor" : "outdoor"} onChange={e => set("indoor", e.target.value === "indoor")}><option value="indoor">Indoor Event Space</option><option value="outdoor">Outdoor Space</option></select></label>
              <label><span>Standing capacity <i>*</i></span><input type="number" min={0} value={form.capacity_standing ?? ""} onChange={e => set("capacity_standing", numOrNull(e.target.value))} /></label>
              <label><span>Seated capacity</span><input type="number" min={0} value={form.capacity_seated ?? ""} onChange={e => set("capacity_seated", numOrNull(e.target.value))} /></label>
              <label><span>Hourly rate (£)</span><input type="number" min={0} value={form.rate_hourly ?? ""} onChange={e => set("rate_hourly", numOrNull(e.target.value))} /></label>
              <label><span>Floor area</span><span className="se-unit"><input type="number" min={0} value={form.area_sqm ?? ""} onChange={e => set("area_sqm", numOrNull(e.target.value))} /><em>sqm</em></span></label>
              <label><span>Minimum hire (hours)</span><input type="number" min={0.5} step={0.5} value={form.min_hours} onChange={e => set("min_hours", Number(e.target.value) || 1)} /></label>
              <label><span>Turnaround (minutes)</span><input type="number" min={0} step={15} value={form.turnaround_minutes} onChange={e => set("turnaround_minutes", Math.max(0, Number(e.target.value)))} /></label>
              <label className="wide"><span>Description</span><textarea rows={3} maxLength={500} value={form.description} onChange={e => set("description", e.target.value)} /><small className="se-count">{form.description.length}/500</small></label>
            </div></div>
          <div className="se-card"><div className="se-card-head"><div><h3>Layouts &amp; capacity</h3><p>Capacity for each layout. At least one layout is required.</p></div></div>
            <ul className="se-layouts">{LAYOUTS.map(([k, l, Icon]) => { const on = form.layouts[k] !== undefined; return <li key={k} className={`${on ? "on" : ""}${overCap.includes(k) ? " bad" : ""}`}>
              <label><input type="checkbox" checked={on} onChange={e => set("layouts", e.target.checked ? { ...form.layouts, [k]: maxCap || 0 } : Object.fromEntries(Object.entries(form.layouts).filter(([x]) => x !== k)))} />
                <Icon aria-hidden="true" /><b>{l}</b></label>
              {on ? <input type="number" min={0} aria-label={`${l} capacity`} value={form.layouts[k]} onChange={e => set("layouts", { ...form.layouts, [k]: Math.max(0, Number(e.target.value)) })} /> : <span>—</span>}</li>; })}</ul>
            {overCap.length > 0 && <p className="se-warn">A layout is above the room’s maximum capacity ({maxCap}).</p>}
            <div className="se-actions">
              {form.id && <button type="button" className="ws-btn outline sm" disabled={pending} onClick={() => run(() => setSpaceStatus(venueId, form.id, form.status === "published" ? "paused" : "published"))}>{form.status === "published" ? "Pause space" : "Publish space"}</button>}
              <button type="button" className="ws-btn primary sm" disabled={pending || overCap.length > 0} onClick={() => run(async () => {
                const { status: _s, ...input } = form; void _s;
                const r = await saveSpace(venueId, form.id || null, input);
                if (r.ok && r.id && !form.id) setForm(f => ({ ...f, id: r.id! }));
                if (r.ok && r.id) setSelId(r.id);
                return r;
              })}><Save aria-hidden="true" />{form.id ? "Save space" : "Add space"}</button></div></div>
        </div>
      </div>
    </section>

    <div className="se-right">
      <section className="ws-panel se-map"><div className="se-head"><div><h2>Venue map &amp; floor plan</h2><p>Draw a structural map. Version {version || "—"} is live{dirtyMap ? " · unsaved changes" : ""}.</p></div>
        <div className="se-head-actions"><span className="ws-btn outline sm" aria-disabled="true" title="Floor-plan upload isn’t available yet — draw the map instead"><Upload aria-hidden="true" />Upload plan</span>
          <button type="button" className={`ws-btn sm ${draw ? "soft on" : "outline"}`} aria-pressed={draw} onClick={() => setDraw(d => !d)}><Pencil aria-hidden="true" />{draw ? "Drawing" : "Draw on map"}</button></div></div>
        <div className={`se-canvas${draw ? " draw" : ""}`}>
          <VenueMap svgRef={svg} elements={els} spaces={mapSpaces} zoom={zoom} selected={form.id || null} selectedIndex={selEl} onElDown={onElDown} onCanvasDown={() => setSelEl(null)} onCanvasMove={onMove} onCanvasUp={() => { drag.current = null; }} labelSize={16} />
          <div className="pv-mapctl">
            <button type="button" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(2.5, z + 0.25))}><Plus aria-hidden="true" /></button>
            <button type="button" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(1, z - 0.25))}><Minus aria-hidden="true" /></button>
            <button type="button" aria-label="Reset view" onClick={() => setZoom(1)}><Maximize2 aria-hidden="true" /></button></div>
          {draw && <div className="se-tools">
            <button type="button" onClick={addRoom} disabled={!form.id}><Plus aria-hidden="true" />Place {form.name || "space"}</button>
            {selEl !== null && <button type="button" className="danger" onClick={() => removeEl(selEl)}><Trash2 aria-hidden="true" />Remove {els[selEl]?.label}</button>}
            <span>Drag rooms and features to move them. Fixed items are locked.</span></div>}
        </div>
        <div className="se-map-foot">
          <button type="button" className="ws-btn outline sm" disabled={pending || !dirtyMap} onClick={() => setEls(initial)}>Discard changes</button>
          <span className="ws-spacer" />
          <button type="button" className="ws-btn outline sm" disabled={pending || !dirtyMap} onClick={() => run(() => saveStructure(venueId, els, false), () => setDirtyMap(false))}>Save draft</button>
          <button type="button" className="ws-btn primary sm" disabled={pending || (!dirtyMap && version > 0)} onClick={() => { if (window.confirm("Publish this map? Organisers planning events here will see the new version.")) run(() => saveStructure(venueId, els, true), () => setDirtyMap(false)); }}>Publish map</button>
        </div>
      </section>
      <div className="se-pair">
        <section className="ws-panel se-features"><div className="se-head"><div><h2>Access points &amp; fixed features</h2><p>Entrances, loading bays, bars, stages and other fixed features.</p></div>
          <MenuAdd onPick={addFeature} /></div>
          <ul>{features.map(({ e, i }) => { const meta = FEATURES.find(f => f[0] === e.type); const Icon = meta?.[1] ?? Shapes; return <li key={i} className={selEl === i ? "on" : ""}>
            <span className={`se-fic ${e.type}`}><Icon aria-hidden="true" /></span><button type="button" onClick={() => setSelEl(i)}><b>{e.label}</b><small>{meta?.[2] ?? e.type}{e.w && e.h && e.type !== "exit" ? ` (${Math.round(e.w / 10)}m × ${Math.round(e.h / 10)}m)` : ""}</small></button>
            {e.protected || e.locked ? <Lock aria-label={e.protected ? "Protected" : "Fixed"} className="se-lock" /> : <button type="button" className="se-del" aria-label={`Remove ${e.label}`} onClick={() => removeEl(i)}><Trash2 aria-hidden="true" /></button>}</li>; })}
            {!features.length && <li className="se-empty">No access points yet.</li>}</ul></section>
        <section className="ws-panel se-suggest"><h2><Sparkles aria-hidden="true" />Gala Agent suggestions</h2><p>Based on your current setup:</p>
          {suggestions.length ? <ul>{suggestions.map(s => <li key={s}><CircleCheck aria-hidden="true" />{s}</li>)}</ul> : <p className="se-ok">Your spaces and map look complete.</p>}
          <Link className="ws-link" href={`/provider/agent?goal=${encodeURIComponent("Review my venue spaces, layouts and map")}`}>Refine with Gala Agent <ArrowRight aria-hidden="true" /></Link></section>
      </div>
    </div>
    {footer}
  </div>;
}

function MenuAdd({ onPick }: { onPick: (t: MapEl["type"]) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="pv-menu"><button type="button" className="ws-btn outline sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}><Plus aria-hidden="true" />Add feature</button>
    {open && <div className="pv-menu-panel" role="menu">{FEATURES.map(([t, Icon, sub]) => <button key={t} type="button" role="menuitem" onClick={() => { setOpen(false); onPick(t); }}><Icon aria-hidden="true" /> {FIXTURE_LABEL[t]} <small>{sub}</small></button>)}</div>}</div>;
}
