"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, LayoutGrid, Sparkles, Save, CircleCheck, ArrowRight, Theater, UtensilsCrossed, Armchair, PersonStanding, School, Shapes } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useToast } from "@/components/ui";
import type { MapEl } from "./venue-map";
import { StructureEditor } from "./structure-editor";
import { saveSpace, type SpaceInput, type StructureMeta } from "../[id]/actions";
import { setSpaceStatus } from "../../listings/actions";

export type EditorSpace = Omit<SpaceInput, "status"> & { id: string; status: string; image: string };
const LAYOUTS: [string, string, LucideIcon][] = [["theatre", "Theatre", Theater], ["banquet", "Banquet", UtensilsCrossed], ["cabaret", "Cabaret", Armchair], ["standing", "Standing", PersonStanding], ["classroom", "Classroom", School], ["custom", "Custom", Shapes]];
const blank = (): EditorSpace => ({ id: "", status: "draft", image: "", name: "", indoor: true, capacity_standing: null, capacity_seated: null, area_sqm: null, rate_hourly: null, min_hours: 2, turnaround_minutes: 60, layouts: {}, amenities: [], description: "" });
const numOrNull = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v)));

/**
 * Spaces & structural map editor (venue profile "Spaces & Map" tab and Add Venue step 2).
 * Space edits save through provider_save_space; the map saves as a new, version-checked structure version (draft or published) through
 * venue_structure_save (StructureEditor: stale-version reload-merge, calibration and rule pack).
 */
export function SpacesEditor({ venueId, spaces, elements: initial, version, latestVersion, meta = {}, geo = null, footer }: { venueId: string; spaces: EditorSpace[]; elements: MapEl[]; version: number; latestVersion?: number; meta?: StructureMeta; geo?: { lat: number; lng: number } | null; footer?: React.ReactNode }) {
  const router = useRouter(), toast = useToast();
  const [pending, start] = useTransition();
  const [selId, setSelId] = useState<string>(spaces[0]?.id ?? "new");
  const [form, setForm] = useState<EditorSpace>(spaces[0] ?? blank());
  const mapSpaces = useMemo(() => spaces.map(s => ({ id: s.id, name: s.name, capacity: Math.max(s.capacity_seated ?? 0, s.capacity_standing ?? 0), indoor: s.indoor })), [spaces]);
  const set = <K extends keyof EditorSpace>(k: K, val: EditorSpace[K]) => setForm(f => ({ ...f, [k]: val }));
  const pick = (s: EditorSpace | null) => { setSelId(s?.id ?? "new"); setForm(s ?? blank()); };
  const maxCap = Math.max(form.capacity_standing ?? 0, form.capacity_seated ?? 0);
  const overCap = Object.entries(form.layouts).filter(([, n]) => maxCap > 0 && n > maxCap).map(([k]) => k);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) => start(async () => {
    const r = await fn(); toast(r.ok ? (r.message ?? "Saved") : (r.error ?? "Something went wrong")); if (r.ok) { after?.(); router.refresh(); }
  });
  // Deterministic suggestions from the current setup — shown for review, never applied automatically.
  const els = initial;
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
      <section className="ws-panel se-map"><div className="se-head"><div><h2>Venue map &amp; floor plan</h2><p>Overlay floor plans, aerials or the street map, drag in seating, tables and facilities, or draw your own.</p></div></div>
        <StructureEditor venueId={venueId} initial={initial} spaces={mapSpaces} version={version} latestVersion={latestVersion ?? version} geo={geo} meta={meta} /></section>
      <section className="ws-panel se-suggest"><h2><Sparkles aria-hidden="true" />Gala Agent suggestions</h2><p>Based on your current setup:</p>
        {suggestions.length ? <ul>{suggestions.map(x => <li key={x}><CircleCheck aria-hidden="true" />{x}</li>)}</ul> : <p className="se-ok">Your spaces and map look complete.</p>}
        <Link className="ws-link" href={`/provider/agent?goal=${encodeURIComponent("Review my venue spaces, layouts and map")}`}>Refine with Gala Agent <ArrowRight aria-hidden="true" /></Link></section>
    </div>
    {footer}
  </div>;
}
