"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Check, ArrowLeft, ArrowRight, Loader2, Plus, Minus, RotateCcw, Accessibility, DoorOpen, Layers, Users } from "lucide-react";
import { Toggle } from "@/components/kit/client";
import type { ProSection } from "@/lib/ticket-pro-model";

export const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const gbp2 = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const num = (n: number) => n.toLocaleString("en-GB");
export const pct = (a: number, b: number, d = 1) => b ? `${(a / b * 100).toFixed(d)}%` : "0%";
const TZ = "Europe/London";
export const dt = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).replace(" at ", ", ") : "—";
export const toLocal = (iso: string | null) => iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "";
export const fromLocal = (v: string) => v ? new Date(v).toISOString() : null;
export const uid = () => Math.random().toString(36).slice(2, 10);

export const STEPS = [
  { title: "Model & Capacity", sub: "Ticket model and inventory" }, { title: "Tiers, Releases & Pricing", sub: "Pricing and options" },
  { title: "Seating & Allocation", sub: "Map and zones" }, { title: "Access & Controls", sub: "Holds, comps and accessibility" }, { title: "Review & Activate", sub: "Check and publish" },
];
const INTRO = ["Define your ticket model, capacity and inventory for this event.", "Create your ticket tiers, pricing, release plan and sales settings.", "Assign tiers to sections of your venue and hold back places for operations.", "Set your policies, buyer questions and controls before publishing.", "Check everything and activate ticket sales."];

export function ProShell({ step, base, event, crumbs, children }: { step: number; base: string; event: { id: string; name: string }; crumbs?: ReactNode; children: ReactNode }) {
  return <div className="tp">
    <nav className="tp-crumbs" aria-label="Breadcrumb">{crumbs ?? <><Link href="/organizer">Organizer</Link><i>/</i><Link href="/organizer/events">Events</Link><i>/</i><Link href={`/organizer/events/${event.id}`}>{event.name}</Link><i>/</i><Link href="/organizer/tickets">Tickets</Link><i>/</i><b aria-current="page">Setup</b></>}</nav>
    <h1 className="tp-h1">Ticket Setup</h1><p className="tp-intro">{INTRO[step - 1]}</p>
    <ol className="tp-steps">{STEPS.map((s, i) => { const n = i + 1, st = n < step ? "done" : n === step ? "on" : "todo"; return <li key={s.title} data-st={st}><Link href={`${base}?step=${n}`} aria-current={n === step ? "step" : undefined}><span className="tp-sn">{st === "done" ? <Check size={15} strokeWidth={3} /> : n}</span><span><b>{s.title}</b><small>{s.sub}</small></span></Link></li>; })}</ol>
    {children}
  </div>;
}

export function Card({ title, sub, action, className, children }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; className?: string; children?: ReactNode }) {
  return <section className={`tp-card ${className ?? ""}`}>{(title || action) && <div className="tp-ch"><div>{title && <h2>{title}</h2>}{sub && <p>{sub}</p>}</div>{action && <div className="tp-ca">{action}</div>}</div>}{children}</section>;
}

export function Footer({ back, backHref, cancelHref, pending, onDraft, onNext, nextLabel = "Continue", nextDisabled }: { back?: () => void; backHref?: string; cancelHref?: string; pending: boolean; onDraft?: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean }) {
  return <div className="tp-foot">
    {cancelHref ? <Link className="k-btn outline" href={cancelHref}>Cancel</Link> : backHref ? <Link className="k-btn outline" href={backHref}><ArrowLeft size={16} />Back</Link> : back ? <button className="k-btn outline" onClick={back}><ArrowLeft size={16} />Back</button> : <span />}
    <span className="tp-fr">{cancelHref && backHref && <Link className="k-btn outline" href={backHref}><ArrowLeft size={16} />Back</Link>}{cancelHref && !backHref && <span className="k-btn outline tp-dis" aria-disabled><ArrowLeft size={16} />Back</span>}
      {onDraft && <button className="k-btn outline" disabled={pending} onClick={onDraft}>Save as draft</button>}
      <button className="k-btn primary tp-next" disabled={pending || nextDisabled} onClick={onNext}>{pending && <Loader2 size={16} className="k-spin" />}{nextLabel}<ArrowRight size={17} /></button></span>
  </div>;
}

export function Donut({ parts, total, label, size = 120 }: { parts: { value: number; color: string }[]; total: number; label: string; size?: number }) {
  const r = 42, c = 2 * Math.PI * r; const sum = parts.reduce((a, p) => a + p.value, 0) || 1;
  const segs = parts.filter(p => p.value > 0).map(p => ({ ...p, len: p.value / sum * c })).map((p, i, all) => ({ ...p, off: all.slice(0, i).reduce((a, x) => a + x.len, 0) }));
  return <svg className="tp-donut" viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${num(total)} ${label}`}>
    <circle cx="50" cy="50" r={r} fill="none" stroke="#eef2f9" strokeWidth="11" />
    {segs.map((p, i) => <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={p.color} strokeWidth="11" strokeDasharray={`${Math.max(0, p.len - 0.6)} ${c}`} strokeDashoffset={-p.off} transform="rotate(-90 50 50)" />)}
    <text x="50" y="49" textAnchor="middle" className="tp-dn">{num(total)}</text><text x="50" y="61" textAnchor="middle" className="tp-dl">{label}</text>
  </svg>;
}

export function Stepper({ value, onChange, min = 0, max = 1_000_000, step = 1, label, prefix, suffix }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; label: string; prefix?: string; suffix?: ReactNode }) {
  return <span className="tp-num">{prefix && <i>{prefix}</i>}<input inputMode="numeric" aria-label={label} value={value} onChange={x => onChange(Math.min(max, Math.max(min, Number(x.target.value.replace(/[^0-9.]/g, "")) || 0)))} />{suffix && <em>{suffix}</em>}
    <span className="tp-numb"><button type="button" onClick={() => onChange(Math.min(max, value + step))} aria-label={`Increase ${label}`}><Plus size={11} /></button><button type="button" onClick={() => onChange(Math.max(min, value - step))} aria-label={`Decrease ${label}`}><Minus size={11} /></button></span></span>;
}

const TREES: [number, number, number][] = Array.from({ length: 26 }, (_, i) => { const left = i % 2 === 0, k = Math.floor(i / 2); return [left ? 30 + (k % 3) * 22 : 770 - (k % 3) * 22, 25 + k * 32, 9 + (i % 3) * 2]; });

/** Schematic venue plan drawn from the event's real sections: stage at the top, GA in front, VIP wings, seated block, accessible platforms. */
export function VenueMap({ sections, image, tierColor, compact }: { sections: ProSection[]; image: string | null; tierColor?: (s: ProSection) => string | null; compact?: boolean }) {
  const [layers, setLayers] = useState({ sections: true, capacity: true, accessibility: true, exits: true }); const [zoom, setZoom] = useState(1);
  const by = (t: ProSection["type"]) => sections.filter(s => s.type === t);
  const ga = by("standing"), vip = by("vip"), seated = by("reserved"), acc = by("accessible");
  type Box = { s: ProSection; x: number; y: number; w: number; h: number; path?: string };
  const boxes: Box[] = [];
  const row = (list: ProSection[], x: number, y: number, w: number, h: number) => list.forEach((s, i) => boxes.push({ s, x: x + i * (w / list.length) + 3, y, w: w / list.length - 6, h }));
  row(ga, 255, 90, 290, 190);
  if (vip[0]) boxes.push({ s: vip[0], x: 150, y: 95, w: 95, h: 150, path: "M175 95 L245 95 L245 245 L150 245 L150 130 Z" });
  if (vip[1]) boxes.push({ s: vip[1], x: 555, y: 95, w: 95, h: 150, path: "M555 95 L625 95 L650 130 L650 245 L555 245 Z" });
  vip.slice(2).forEach((s, i) => boxes.push({ s, x: 150 + i * 100, y: 30, w: 90, h: 40 }));
  row(seated, 255, 300, 290, 105);
  if (acc[0]) boxes.push({ s: acc[0], x: 150, y: 260, w: 95, h: 105, path: "M150 260 L245 260 L245 340 L200 365 L150 340 Z" });
  if (acc[1]) boxes.push({ s: acc[1], x: 555, y: 260, w: 95, h: 105, path: "M555 260 L650 260 L650 340 L600 365 L555 340 Z" });
  return <div className={`tp-map ${compact ? "compact" : ""}`}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {image && <img src={image} alt="" className="tp-mapbg" style={{ transform: `scale(${zoom})` }} />}
    <svg viewBox="0 0 800 440" className="tp-mapsvg" style={{ transform: `scale(${zoom})` }} role="img" aria-label="Venue sections">
      <defs><pattern id="tp-dots" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#ffffff66" /></pattern></defs>
      {!image && <g aria-hidden>
        <rect width="800" height="440" fill="#1e2b24" /><rect x="105" y="10" width="590" height="425" rx="18" fill="#33423a" /><rect x="105" y="10" width="590" height="425" rx="18" fill="none" stroke="#5c7a68" strokeDasharray="6 6" />
        <path d="M130 425 V 120 M670 425 V 120 M130 418 H 670" stroke="#7fa48c" strokeWidth="2" strokeDasharray="4 5" fill="none" opacity=".7" />
        {TREES.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#2f5b3d" stroke="#3f7350" />)}
      </g>}
      <rect x="300" y="22" width="200" height="44" rx="4" fill="#111827" /><text x="400" y="50" textAnchor="middle" className="tp-mstage">STAGE</text>
      {layers.sections && boxes.map(({ s, x, y, w, h, path }) => { const col = tierColor?.(s) ?? s.color; return <g key={s.id}>
        {path ? <path d={path} fill={col} fillOpacity=".72" stroke="#fff" strokeWidth="2" /> : <rect x={x} y={y} width={w} height={h} rx="10" fill={col} fillOpacity=".72" stroke="#fff" strokeWidth="2" />}
        {path ? <path d={path} fill="url(#tp-dots)" /> : <rect x={x} y={y} width={w} height={h} rx="10" fill="url(#tp-dots)" />}
        <rect x={x + w / 2 - Math.min(w - 8, 96) / 2} y={y + h / 2 - (layers.capacity ? 17 : 10)} width={Math.min(w - 8, 96)} height={layers.capacity ? 34 : 20} rx="4" fill="#0b143799" />
        <text x={x + w / 2} y={y + h / 2 - (layers.capacity ? 3 : -4)} textAnchor="middle" className="tp-mlabel">{s.name.length > 18 ? `${s.name.slice(0, 17)}…` : s.name}</text>
        {layers.capacity && <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" className="tp-mcap">{num(s.capacity)}</text>}
      </g>; })}
      {layers.accessibility && [[205, 255], [595, 255], [300, 410], [500, 410]].map(([x, y], i) => <g key={i} transform={`translate(${x! - 8} ${y! - 8})`}><rect width="16" height="16" rx="3" fill="#2563eb" /><circle cx="8" cy="4.5" r="1.6" fill="#fff" /><path d="M5 7.5h6M8 7.5v3.5l2.5 2.5M8 11l-2.5 2.5" stroke="#fff" strokeWidth="1.3" fill="none" /></g>)}
      {layers.exits && [[120, 230], [680, 230], [400, 425], [230, 425], [570, 425]].map(([x, y], i) => <g key={i} transform={`translate(${x! - 9} ${y! - 8})`}><rect width="18" height="16" rx="3" fill="#16a34a" /><path d="M5 12V4h6v8M9 8h4" stroke="#fff" strokeWidth="1.4" fill="none" /></g>)}
    </svg>
    {!compact && <div className="tp-layers"><b>Map layers</b>{([["sections", Layers, "Sections"], ["capacity", Users, "Capacity"], ["accessibility", Accessibility, "Accessibility"], ["exits", DoorOpen, "Exits & Safety"]] as const).map(([k, I, l]) => <label key={k}><I size={12} /><span>{l}</span><Toggle checked={layers[k]} onChange={v => setLayers(x => ({ ...x, [k]: v }))} label={l} /></label>)}</div>}
    <div className="tp-zoom"><button onClick={() => setZoom(z => Math.min(1.8, z + 0.2))} aria-label="Zoom in"><Plus size={15} /></button><button onClick={() => setZoom(z => Math.max(1, z - 0.2))} aria-label="Zoom out"><Minus size={15} /></button><button onClick={() => setZoom(1)} aria-label="Reset zoom"><RotateCcw size={13} /></button></div>
    {!sections.length && <p className="tp-mapempty">Add sections to see them on the plan.</p>}
  </div>;
}
