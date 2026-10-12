"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { AUDIENCES, BUSINESS_TYPES, EVENT_TYPES, FORMATS, PALETTES, PURPOSE_GROUPS, PURPOSES, SORTS, STYLES, FILTER_KEYS, labelOf, type Opt, type TemplateFilters } from "@/lib/media/template-taxonomy";

const LISTS: Record<(typeof FILTER_KEYS)[number], { label: string; list: Opt[] }> = {
  audience: { label: "For", list: AUDIENCES }, purpose: { label: "Purpose", list: PURPOSES }, eventType: { label: "Event type", list: EVENT_TYPES },
  business: { label: "Business type", list: BUSINESS_TYPES }, style: { label: "Style", list: STYLES }, palette: { label: "Colour", list: PALETTES }, format: { label: "Format", list: FORMATS },
};
const purposeOptions = (audience?: string) => PURPOSE_GROUPS.filter(g => !audience || audience === "both" || g.audience === "both" || g.audience === audience)
  .map(g => <optgroup key={g.group} label={g.group}>{g.items.map(i => <option key={i.v} value={i.v}>{i.l}</option>)}</optgroup>);

/** Template search filters: who it's for, purpose, event/business type, style, colour, format and sort, with removable chips. */
export function TemplateFilterBar({ value, onChange }: { value: TemplateFilters; onChange: (f: TemplateFilters) => void }) {
  const [open, setOpen] = useState(false);
  const active = FILTER_KEYS.filter(k => value[k]);
  const set = (k: keyof TemplateFilters, v: string) => onChange({ ...value, [k]: v || undefined });
  const sel = (k: (typeof FILTER_KEYS)[number]) => <label key={k} className="tf-field"><span>{LISTS[k].label}</span>
    <select value={value[k] ?? ""} onChange={e => set(k, e.target.value)} aria-label={`Filter by ${LISTS[k].label.toLowerCase()}`}>
      <option value="">{k === "audience" ? "Everyone" : "Any"}</option>
      {k === "purpose" ? purposeOptions(value.audience) : LISTS[k].list.filter(x => k !== "audience" || x.v !== "both").map(x => <option key={x.v} value={x.v}>{x.l}</option>)}</select></label>;
  const showBiz = value.audience !== "organiser", showEvent = value.audience !== "provider";
  return <div className="tf">
    <div className="tf-bar">
      <button type="button" className={`tf-toggle ${open ? "on" : ""}`} aria-expanded={open} onClick={() => setOpen(o => !o)}><SlidersHorizontal size={14} aria-hidden="true" />Filters{active.length > 0 && <b>{active.length}</b>}</button>
      <label className="tf-sort"><span className="sr-only">Sort templates</span><select value={value.sort ?? "popular"} onChange={e => set("sort", e.target.value === "popular" ? "" : e.target.value)} aria-label="Sort templates">
        {SORTS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}</select></label>
    </div>
    {open && <div className="tf-grid">{sel("audience")}{sel("purpose")}{showEvent && sel("eventType")}{showBiz && sel("business")}{sel("format")}{sel("style")}{sel("palette")}</div>}
    {active.length > 0 && <div className="tf-chips">{active.map(k => <button key={k} type="button" className="tf-chip" onClick={() => set(k, "")} aria-label={`Remove ${LISTS[k].label} filter`}>
      {labelOf(LISTS[k].list, value[k])}<X size={11} aria-hidden="true" /></button>)}
      <button type="button" className="tf-clear" onClick={() => onChange({ sort: value.sort })}>Clear all</button></div>}
  </div>;
}

/** The same labels on the "save / share template" forms (named inputs read with FormData). */
export function TemplateFacetFields({ defaultAudience = "both", className = "st-field" }: { defaultAudience?: string; className?: string }) {
  const [aud, setAud] = useState(defaultAudience);
  return <div className="tf-form">
    <label className={className}><span>Who is it for?</span><select name="audience" value={aud} onChange={e => setAud(e.target.value)}>{AUDIENCES.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}</select></label>
    <label className={className}><span>Purpose</span><select name="category" required defaultValue={aud === "provider" ? "venue_showcase" : "announcement"}>{purposeOptions(aud)}</select></label>
    {aud !== "provider" && <label className={className}><span>Event type</span><select name="eventType" defaultValue=""><option value="">Any event</option>{EVENT_TYPES.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}</select></label>}
    {aud !== "organiser" && <label className={className}><span>Business type</span><select name="business" defaultValue=""><option value="">Any business</option>{BUSINESS_TYPES.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}</select></label>}
    <label className={className}><span>Style</span><select name="style" defaultValue=""><option value="">Choose a style</option>{STYLES.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}</select></label>
    <label className={className}><span>Main colours</span><select name="palette" defaultValue=""><option value="">Choose colours</option>{PALETTES.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}</select></label>
    <p className="tf-note">The format (post, story, poster…) is set from the design’s size.</p>
  </div>;
}

/** Reads the facet fields from a submitted form. */
export const facetsFrom = (f: FormData) => ({ audience: String(f.get("audience") ?? "both"), eventType: String(f.get("eventType") ?? ""), business: String(f.get("business") ?? ""),
  style: String(f.get("style") ?? ""), palette: String(f.get("palette") ?? "") });
