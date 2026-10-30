"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ArrowLeft, ArrowRight, Sparkles, CheckCircle2, XCircle, ClipboardList, CalendarDays, Package, Ticket, Megaphone, Users, ShieldCheck, Plus, X, Loader2, MapPin, Clock, UserX, CreditCard, MessageSquareOff, Lock } from "lucide-react";
import { Toggle, useAction } from "@/components/kit/client";
import { saveTemplate } from "@/lib/actions/templates";
import { labelOf, resolveTerm, terms } from "@/lib/master-data";

type Ev = { id: string; name: string; type: string; description: string; cover: string; when: string; where: string; capacity: number | null; hours: number | null; tags: string[] };
const MODS = [["plan", ClipboardList, "Event plan & structure", "Event type, overview, goals, target audience, key details and build structure.", "Event structure & plan"], ["schedule", CalendarDays, "Schedule structure", "Timeline, stages, key activities and run sheets (without staff names or specific past dates).", "Schedule template"], ["providers", Package, "Provider categories", "Vendor requirements, categories and example scopes (without specific vendor history).", "Provider categories"], ["tickets", Ticket, "Ticket model", "Ticket types, tiers, pricing structure and entry rules (without buyer data).", "Ticket model"], ["promotion", Megaphone, "Promotion structure", "Marketing channels, campaign structure and timing (without previous performance data).", "Promotion structure"], ["staffing", Users, "Staffing roles", "Key roles, team structure and coverage requirements (without personal staff details).", "Staffing roles"], ["risk", ShieldCheck, "Risk & compliance checklist", "Health & safety, licensing, risk assessments and incident plans (generic and reusable).", "Risk & compliance checklist"]] as const;
const EXCL = [[UserX, "Guest lists and attendee data", "Personal data and previous attendee records will not be included."], [CreditCard, "Payments and financial records", "Invoices, payments, payouts, costs and profit data will not be included."], [MessageSquareOff, "Private communications", "Messages, internal notes and client/supplier conversations will not be included."], [Lock, "Event-specific records", "Actual dates, real-time availability, bookings and unique references will not be included."]] as const;
type Key = typeof MODS[number][0];
/** Suggestions for "Applicable event types": canonical event-type labels (free text is still allowed). */
const TYPE_LABELS = terms("event_type").map(t => t.label);
/** build_items.category is a build key ("food") or a supplier key ("dj"); show its label either way. */
const catLabel = (c: string) => resolveTerm("build_category", c) ? labelOf("build_category", c) : labelOf("service_category", c, c);

export type TemplateFamily = { family_id: string; name: string; version: number; /** saved from this same event */ same: boolean };
export function TemplateWizard({ step, event: e, counts, tiers, cats, roles, families = [] }: { step: 1 | 2; event: Ev; counts: Record<Key, number>; tiers: { name: string; price: number; sub: string }[]; cats: string[]; roles: string[]; /** Active workspace templates this save can become a new version of (Q14 versioned family). */ families?: TemplateFamily[] }) {
  const router = useRouter(); const { run, pending } = useAction();
  const [mods, setMods] = useState<Record<Key, boolean>>({ plan: true, schedule: counts.schedule > 0, providers: counts.providers > 0, tickets: counts.tickets > 0, promotion: true, staffing: counts.staffing > 0, risk: true });
  const [name, setName] = useState(families.find(f => f.same)?.name ?? `${e.type} – ${e.name.replace(/\b20\d\d\b/g, "").trim()} (Standard)`);
  const [desc, setDesc] = useState(e.description.slice(0, 500));
  const [types, setTypes] = useState<string[]>([e.type, ...e.tags.slice(0, 3)].filter((x, i, a) => x && a.indexOf(x) === i));
  const [newType, setNewType] = useState("");
  const [family, setFamily] = useState(families.find(f => f.same)?.family_id ?? "");
  const fam = families.find(f => f.family_id === family) ?? null;
  const on = MODS.filter(m => mods[m[0]]);
  const recommend = () => setMods({ plan: true, schedule: true, providers: true, tickets: true, promotion: true, staffing: true, risk: true });
  const steps = [["Select scope", "Choose what to include"], ["Review & confirm", "Name and preview template"], ["Save template", "Complete and go to templates"]];
  const ready = [["Valid template name", name.trim().length >= 3], ["Description added", desc.trim().length > 0], ["Event types selected", types.length > 0], ["Reusable content only", true], ["No sensitive data included", true], ["All selected modules configured", on.length > 0]] as [string, boolean][];

  return <>
    <div className="tw-head"><h1>Save Event as Template</h1><p>{step === 1 ? "Choose what to include in your reusable template. We'll exclude personal, financial and event-specific data by default." : "Give your template a name, review the included content and confirm it's ready to save."}</p></div>
    <ol className="iw-steps tw-steps">{steps.map(([t, s], i) => <li key={t} data-state={i + 1 < step ? "done" : i + 1 === step ? "on" : "todo"}><span className="n">{i + 1 < step ? <Check size={16} strokeWidth={3} /> : i + 1}</span><span><b>{t}</b><small>{s}</small></span></li>)}</ol>
    <div className="tw-grid">
      <div className="tw-main">
        {step === 1 ? <section className="k-card tw-sec"><div className="k-between"><div><h2>1. Choose what to include</h2><p className="tw-sub">Select the reusable structure and content you want to save in your template. Sensitive or event-specific data is excluded by default.</p></div><button className="k-btn outline sm" onClick={recommend}><Sparkles size={14} />Select recommended</button></div>
          <div className="tw-mods">{MODS.map(([k, I, t, d]) => <label key={k} className={`tw-mod ${mods[k] ? "on" : ""}`}><span className="tw-mh"><input type="checkbox" checked={mods[k]} onChange={x => setMods(m => ({ ...m, [k]: x.target.checked }))} /><I size={20} /><b>{t}</b></span><p>{d}</p>
            {k === "plan" && <div className="tw-plan">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover || "/assets/gd/hero-neon.webp"} alt="" /><ul>{["Event overview", "Objectives & outcomes", "Venue type & setup", "Capacity & audience profile"].map(x => <li key={x}><CheckCircle2 size={14} />{x}</li>)}</ul></div>}
            {k === "tickets" && <div className="tw-tiers">{tiers.map(t => <span key={t.name}><b>{t.name}</b><strong>£{t.price.toLocaleString("en-GB")}</strong><small>{t.sub}</small></span>)}{!tiers.length && <small className="k-muted">No ticket tiers on this event yet.</small>}</div>}
            {k === "providers" && <ul className="tw-list">{cats.slice(0, 6).map(c => <li key={c}><CheckCircle2 size={14} />{catLabel(c)}</li>)}{!cats.length && <li className="k-muted">No supplier categories yet.</li>}</ul>}
            {k === "staffing" && <ul className="tw-list">{roles.slice(0, 5).map(r => <li key={r}><CheckCircle2 size={14} />{r}</li>)}{!roles.length && <li className="k-muted">No roles assigned yet.</li>}</ul>}
            {k === "schedule" && <small className="tw-count">{counts.schedule} programme items · times saved relative to the start</small>}
            {k === "promotion" && <small className="tw-count">Channel mix, campaign timeline and asset types</small>}
            {k === "risk" && <ul className="tw-list">{["Site risk assessment", "Licensing requirements", "Emergency procedures", "Crowd management plan"].map(x => <li key={x}><CheckCircle2 size={14} />{x}</li>)}</ul>}</label>)}
            <div className="tw-excl"><b>Exclude (recommended by default)</b>{EXCL.map(([I, t, d]) => <div key={t}><Toggle checked={false} disabled label={`Include ${t}`} /><span className="tw-xi"><I size={16} /></span><span><b>{t}</b><small>{d}</small></span></div>)}</div></div></section>
        : <div className="tw-r2">
          <div className="k-col" style={{ gap: 14 }}>
            <section className="k-card tw-sec"><h2>1. Template details</h2><p className="tw-sub">Give your reusable template a clear name and description.</p>
              {families.length > 0 && <fieldset className="tw-family"><legend className="ce2-lbl">Save as</legend><label><input type="radio" name="tw-family" checked={!family} onChange={() => setFamily("")} />A new template</label><label><input type="radio" name="tw-family" checked={!!family} onChange={() => { const f = families[0]!; setFamily(f.family_id); setName(f.name); }} />A new version of</label>{!!family && <select className="k-select" aria-label="Template to update" value={family} onChange={x => { setFamily(x.target.value); const f = families.find(y => y.family_id === x.target.value); if (f) setName(f.name); }}>{families.map(f => <option key={f.family_id} value={f.family_id}>{f.name} (now v{f.version})</option>)}</select>}<small>{fam ? `Saves version ${fam.version + 1}. Version ${fam.version} is kept as history; events already made from it are unchanged.` : "Starts a new template family at version 1."}</small></fieldset>}
              <label className="ce2-f"><span>Template name <i>*</i></span><span className="ce2-in ic"><input value={name} maxLength={80} onChange={x => setName(x.target.value)} />{name.trim().length >= 3 && <CheckCircle2 size={16} className="k-green" />}</span></label>
              <label className="ce2-f" style={{ marginTop: 12 }}><span>Description</span><textarea className="ce2-ta" maxLength={500} value={desc} onChange={x => setDesc(x.target.value)} /><small className="k-right">{desc.length}/500</small></label>
              <span className="ce2-lbl">Applicable event types <i>*</i></span><div className="tw-types">{types.map((t, i) => <span key={t} className={i === 0 ? "on" : ""}>{t}<button aria-label={`Remove ${t}`} onClick={() => setTypes(ts => ts.filter(x => x !== t))}><X size={12} /></button></span>)}<form onSubmit={x => { x.preventDefault(); const v = newType.trim(); if (v && !types.includes(v)) setTypes(ts => [...ts, v]); setNewType(""); }}><span className="tw-add"><Plus size={13} /><input value={newType} maxLength={30} list="tw-types" onChange={x => setNewType(x.target.value)} placeholder="Add type" aria-label="Add event type" /></span><datalist id="tw-types">{TYPE_LABELS.filter(l => !types.includes(l)).map(l => <option key={l} value={l} />)}</datalist></form></div></section>
            <section className="k-card tw-sec"><h2>2. Included modules</h2><p className="tw-sub">Review the content that will be saved in your template.</p>
              <ul className="tw-incl">{MODS.map(([k, I, t, d]) => <li key={k}><span className="tw-ii"><I size={17} /></span><span className="k-grow"><b>{t}</b><small>{d.split("(")[0]}</small></span><small>{counts[k]} items</small><Toggle checked={mods[k]} onChange={v => setMods(m => ({ ...m, [k]: v }))} label={t} /></li>)}</ul></section></div>
          <section className="k-card tw-sec"><h2>3. Template preview</h2><p className="tw-sub">Here&apos;s a preview of how your template will appear.</p>
            <div className="tw-pimg">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover || "/assets/gd/hero-neon.webp"} alt="" /><span>Template</span></div>
            <h3 className="tw-pn">{name}</h3><div className="tw-ptypes">{types.map(t => <i key={t}>{t}</i>)}</div><p className="tw-pd">{desc}</p>
            <div className="tw-facts"><span><Clock size={18} /><span><b>{e.hours ? `${e.hours} hours` : "—"}</b><small>Typical duration</small></span></span><span><Users size={18} /><span><b>{e.capacity?.toLocaleString("en-GB") ?? "—"}</b><small>Typical capacity</small></span></span><span><MapPin size={18} /><span><b>{e.where.split(",")[0] || "—"}</b><small>Venue type</small></span></span></div>
            <ul className="tw-prev">{on.map(([k, I, , , label]) => <li key={k}><span className="tw-ii"><I size={16} /></span><span><b>{label}</b><small>{counts[k as Key]} items</small></span></li>)}</ul></section></div>}
        <div className="iw-bar">{step === 1 ? <Link className="k-btn outline" href={`/organizer/events/${e.id}`}><ArrowLeft size={16} />Cancel</Link> : <Link className="k-btn outline" href={`/organizer/events/${e.id}/template`}><ArrowLeft size={16} />Back</Link>}
          {step === 1 ? <button className="k-btn primary iw-go" disabled={!on.length} onClick={() => router.push(`/organizer/events/${e.id}/template?step=2`)}>Continue <ArrowRight size={16} /></button>
            : <button className="k-btn primary iw-go" disabled={pending || !ready.every(r => r[1])} onClick={() => void run(() => saveTemplate({ event_id: e.id, name, description: desc, event_types: types, modules: mods, ...(family ? { family_id: family } : {}) }))}>{pending && <Loader2 size={15} className="k-spin" />}Save Template <ArrowRight size={16} /></button>}</div>
      </div>
      <aside className="tw-side">
        <section className="k-card tw-ev">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover || "/assets/gd/hero-neon.webp"} alt="" /><div><b>{e.name}</b><small><CalendarDays size={13} />{e.when}</small><small><MapPin size={13} />{e.where}</small><span className="iw-tags">{e.tags.slice(0, 3).map(t => <i key={t}>{t}</i>)}</span></div></section>
        <section className="k-card tw-sec"><h2 className="sm">Template preview</h2><p className="tw-sub">This is what will be included in your template:</p><ul className="tw-chk">{MODS.map(m => <li key={m[0]} className={mods[m[0]] ? "ok" : "no"}>{mods[m[0]] ? <CheckCircle2 size={16} /> : <XCircle size={16} />}{m[4]}{mods[m[0]] ? "" : " (not included)"}</li>)}{EXCL.map(x => <li key={x[1]} className="no"><XCircle size={16} />{x[1]} (excluded)</li>)}</ul></section>
        <section className="tw-safe"><b><CheckCircle2 size={18} />{step === 2 ? (ready.every(r => r[1]) ? "Template is ready to save" : "Almost ready") : "Template safety check"}</b><ul>{(step === 2 ? ready : [["No guest data included", true], ["No payment or financial records", true], ["No private communications", true], ["Only reusable, generic content", true]] as [string, boolean][]).map(([l, ok]) => <li key={l} className={ok ? "ok" : ""}>{ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}{l}</li>)}</ul></section>
      </aside>
    </div>
  </>;
}
