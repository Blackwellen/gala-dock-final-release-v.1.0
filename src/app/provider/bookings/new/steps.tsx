"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { ChevronDown, CalendarDays, Users, MapPin, Mail, Phone, Sparkles, CircleCheck, CircleAlert, X, Plus, ArrowRight, ArrowLeft, Save, Building2, Layers, CircleParking, UtensilsCrossed, BadgeCheck, LayoutGrid, Info } from "lucide-react";
import { useToast } from "@/components/ui";
import type { ActionResult } from "@/components/workspace/actions";
import { saveBookingStep, confirmBooking, discardBookingDraft } from "./actions";
import type { BookingDraft } from "./draft";
import { labelsFor } from "@/lib/master-data";
import { LAYOUT_LABEL } from "../../venues/_components/layout-glyph";

/** Remote/user media at CSS-controlled sizes (dimensions come from the stylesheet). */
// eslint-disable-next-line @next/next/no-img-element
const Pic = (p: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...p} alt={p.alt ?? ""} loading="lazy" />;
const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
const TYPES = labelsFor("provider.booking_event_types");
/** Layout keys (u_shape, theatre…) as people read them; unknown keys fall back to a capitalised, spaced form. */
const layoutName = (k: string) => LAYOUT_LABEL[k] ?? `${k[0]?.toUpperCase() ?? ""}${k.slice(1).replace(/_/g, " ")}`;

function useStep() {
  const router = useRouter(), toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const run = (fn: () => Promise<ActionResult>) => start(async () => { setError(""); const r = await fn(); if (!r.ok) { setError(r.error); return; } if (r.message) toast(r.message); if (r.redirect) router.push(r.redirect); else router.refresh(); });
  return { pending, error, run };
}
function Footer({ back, onSave, onNext, nextLabel, pending, error, onCancel, disabled }: { back?: string; onSave: () => void; onNext: () => void; nextLabel: string; pending: boolean; error: string; onCancel?: () => void; disabled?: boolean }) {
  return <>{error && <p className="qb-error" role="alert">{error}</p>}
    <footer className="wz-foot">
      {back ? <Link className="ws-btn outline" href={back}><ArrowLeft aria-hidden="true" />Back</Link> : <button type="button" className="ws-btn outline" disabled={pending} onClick={onSave}><Save aria-hidden="true" />Save as draft</button>}
      <span className="ws-spacer" />
      {back && <button type="button" className="ws-btn outline" disabled={pending} onClick={onSave}><Save aria-hidden="true" />Save as draft</button>}
      {onCancel && <button type="button" className="ws-btn ghost" onClick={onCancel}>Cancel</button>}
      <button type="button" className="ws-btn primary wz-next" disabled={pending || disabled} onClick={onNext}>{pending ? "Saving…" : nextLabel}<ArrowRight aria-hidden="true" /></button>
    </footer></>;
}
function Agent({ title, children }: { title?: string; children: ReactNode }) {
  return <section className="ws-panel wz-agent"><h2><span className="qw-agent-icon"><Sparkles aria-hidden="true" /></span>Gala Agent <i>Online</i></h2>
    <div className="qw-agent-body">{title && <p>{title}</p>}{children}</div></section>;
}

/* ───────── Step 1: Event & Client ───────── */
type Venue = { id: string; name: string; location: string; image: string; gallery: string[]; capacity: number | null; tags: string[]; spaces: number };
export function StepEvent({ draft, venues }: { draft: BookingDraft; venues: Venue[] }) {
  const { pending, error, run } = useStep();
  const [d, setD] = useState<BookingDraft>({ venueId: venues[0]?.id, eventType: "Corporate Event", guests: 100, start: "18:00", end: "00:00", source: "direct", requirements: [], ...draft });
  const [req, setReq] = useState("");
  const [photo, setPhoto] = useState(0);
  const set = (p: Partial<BookingDraft>) => setD(x => ({ ...x, ...p }));
  const venue = venues.find(v => v.id === d.venueId) ?? venues[0];
  const photos = [venue?.image, ...(venue?.gallery ?? [])].filter(Boolean) as string[];
  const valid = !!(d.eventName && d.date && d.start && d.end && d.clientName && d.guests);
  const save = (next: 2 | null) => run(() => saveBookingStep(d, next));
  return <div className="wz-grid">
    <div className="wz-col">
      <section className="ws-panel wz-card"><h2>Venue</h2><p className="qb-sub">Select the venue for this booking.</p>
        <label className="wz-venue">{venue?.image ? <Pic src={venue.image} alt="" /> : <span className="qb-noimg" />}
          <span><b>{venue?.name}</b><small>{venue?.location}</small><span className="wz-tags">{(venue?.tags ?? []).slice(0, 3).map(t => <i key={t}>{t}</i>)}{venue?.capacity ? <i>Up to {venue.capacity} guests</i> : null}</span></span>
          <select aria-label="Venue" value={d.venueId} onChange={e => set({ venueId: e.target.value })}>{venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select><ChevronDown aria-hidden="true" /></label></section>
      <section className="ws-panel wz-card"><h2>Event details</h2><p className="qb-sub">Tell us about the event so we can set it up correctly.</p>
        <label className="ws-field"><span>Event name *</span><input value={d.eventName ?? ""} onChange={e => set({ eventName: e.target.value })} placeholder="e.g. Tech Summit After Party" maxLength={120} /></label>
        <div className="wz-2"><label className="ws-field"><span>Event type *</span><select value={d.eventType} onChange={e => set({ eventType: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
          <label className="ws-field"><span>Expected guest count *</span><input type="number" min={1} value={d.guests ?? ""} onChange={e => set({ guests: Number(e.target.value) })} /></label></div>
        <div className="wz-3"><label className="ws-field"><span>Event date *</span><input type="date" value={d.date ?? ""} onChange={e => set({ date: e.target.value })} /></label>
          <label className="ws-field"><span>Start time *</span><input type="time" value={d.start ?? ""} onChange={e => set({ start: e.target.value })} /></label>
          <label className="ws-field"><span>End time *</span><input type="time" value={d.end ?? ""} onChange={e => set({ end: e.target.value })} /></label></div>
        {d.start && d.end && d.end <= d.start && <p className="wz-hint"><Info aria-hidden="true" />Ends after midnight (next day).</p>}
        <label className="ws-field"><span>Event description <small>(optional)</small></span><textarea rows={3} maxLength={500} value={d.description ?? ""} onChange={e => set({ description: e.target.value })} /><small className="wz-count">{(d.description ?? "").length}/500</small></label>
        <div className="ws-field"><span>Special requirements <small>(optional)</small></span><div className="wz-chips">{(d.requirements ?? []).map(r => <i key={r}>{r}<button type="button" aria-label={`Remove ${r}`} onClick={() => set({ requirements: d.requirements?.filter(x => x !== r) })}><X aria-hidden="true" /></button></i>)}
          <span className="wz-addreq"><input value={req} onChange={e => setReq(e.target.value)} placeholder="Add requirement" onKeyDown={e => { if (e.key === "Enter" && req.trim()) { e.preventDefault(); set({ requirements: [...(d.requirements ?? []), req.trim()] }); setReq(""); } }} />
            <button type="button" disabled={!req.trim()} title={req.trim() ? undefined : "Type a requirement first"} onClick={() => { if (req.trim()) { set({ requirements: [...(d.requirements ?? []), req.trim()] }); setReq(""); } }}><Plus aria-hidden="true" />Add requirement</button></span></div></div>
      </section>
    </div>
    <div className="wz-col">
      <section className="ws-panel wz-card"><h2>Client / Organiser</h2><p className="qb-sub">Who is this booking for?</p>
        <label className="ws-field"><span>Client / Organisation *</span><input value={d.clientName ?? ""} onChange={e => set({ clientName: e.target.value })} placeholder="e.g. TechCorp Ltd" /></label>
        <label className="ws-field"><span>Primary contact</span><input value={d.contactName ?? ""} onChange={e => set({ contactName: e.target.value })} placeholder="Full name" /></label>
        <div className="wz-2"><label className="ws-field"><span>Email</span><span className="wz-icon-input"><Mail aria-hidden="true" /><input type="email" value={d.contactEmail ?? ""} onChange={e => set({ contactEmail: e.target.value })} /></span></label>
          <label className="ws-field"><span>Phone</span><span className="wz-icon-input"><Phone aria-hidden="true" /><input type="tel" value={d.contactPhone ?? ""} onChange={e => set({ contactPhone: e.target.value })} /></span></label></div>
        <fieldset className="wz-source"><legend>Booking source <small>How did this booking come to you?</small></legend>
          {[["marketplace", "Gala Dock marketplace"], ["direct", "Direct enquiry (off-platform)"], ["repeat", "Repeat client"], ["referral", "Referral / Partner"], ["other", "Other"]].map(([v, l]) =>
            <label key={v}><input type="radio" name="source" checked={d.source === v} onChange={() => set({ source: v })} />{l}</label>)}</fieldset>
      </section>
    </div>
    <aside className="wz-rail">
      <Agent title="Here’s the event summary from the details you’ve entered:">
        {d.eventName ? <div className="wz-summary"><b>{d.eventName}</b>
          <span><CalendarDays aria-hidden="true" />{d.date ? new Date(`${d.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric" }) : "Date to confirm"}{d.start ? ` · ${d.start} – ${d.end}` : ""}</span>
          <span><Users aria-hidden="true" />{d.guests ?? "—"} guests</span><span><BadgeCheck aria-hidden="true" />{d.eventType}</span><span><MapPin aria-hidden="true" />{venue?.name}</span>
          {d.description && <p>{d.description}</p>}</div> : <p className="ws-muted">Add an event name to see a summary.</p>}
      </Agent>
      {venue && <section className="ws-panel wz-preview"><div className="ws-panel-head"><h2>Venue preview</h2><Link className="ws-btn outline sm" href={`/provider/venues/${venue.id}`}>View venue <ArrowRight aria-hidden="true" /></Link></div>
        
        {photos[photo] ? <div className="wz-photo"><Pic src={photos[photo]} alt={`${venue.name} photo ${photo + 1}`} /><span>{photo + 1}/{photos.length}</span></div> : null}
        <div className="wz-thumbs">{photos.slice(0, 5).map((p, i) => <button key={p + i} type="button" aria-label={`Photo ${i + 1}`} className={i === photo ? "on" : ""} onClick={() => setPhoto(i)}><Pic src={p} alt="" /></button>)}</div>
        <h3>Venue information</h3><ul className="wz-info"><li><Users aria-hidden="true" /><span>Max capacity<b>{venue.capacity ?? "—"}</b></span></li><li><Layers aria-hidden="true" /><span>Spaces<b>{venue.spaces}</b></span></li>
          <li><Building2 aria-hidden="true" /><span>Indoor / Outdoor<b>Both</b></span></li><li><CircleParking aria-hidden="true" /><span>Parking<b>On-site</b></span></li><li><UtensilsCrossed aria-hidden="true" /><span>Catering<b>In-house</b></span></li></ul></section>}
    </aside>
    <div className="wz-span"><Footer onSave={() => save(null)} onNext={() => save(2)} nextLabel="Continue to Space & Services" pending={pending} error={error} disabled={!valid} onCancel={() => run(() => discardBookingDraft())} /></div>
  </div>;
}

/* ───────── Step 2: Space & Package ───────── */
type SpaceOpt = { id: string; name: string; image: string; capacity: number; seated: number | null; indoor: boolean; rate: number | null };
type Pkg = { id: string; name: string; description: string; base_price: number; price_basis: string; inclusions: string[]; space_ids: string[]; min_guests: number | null; max_guests: number | null };
type Busy = { spaceId: string; segs: { a: number; b: number; label: string; kind: string }[]; conflict: { label: string } | null };
export function StepSpace({ draft, venue, spaces, layouts, packages, busy, dayStart, reqStart, reqEnd }: { draft: BookingDraft; venue: { id: string; name: string; location: string; image: string; capacity: number | null; spaces: number };
  spaces: SpaceOpt[]; layouts: Record<string, Record<string, number>>; packages: Pkg[]; busy: Busy[]; dayStart: number | null; reqStart: number | null; reqEnd: number | null }) {
  const { pending, error, run } = useStep();
  const guests = draft.guests ?? 0;
  const best = [...spaces].filter(s => s.capacity >= guests && !busy.find(b => b.spaceId === s.id)?.conflict).sort((a, b) => a.capacity - b.capacity)[0];
  const [d, setD] = useState<BookingDraft>({ spaceId: draft.spaceId ?? best?.id, layout: draft.layout, packageId: draft.packageId ?? "", setupHours: draft.setupHours ?? 4, breakdownHours: draft.breakdownHours ?? 2, hold: draft.hold ?? false, holdHours: draft.holdHours ?? 24 });
  const set = (p: Partial<BookingDraft>) => setD(x => ({ ...x, ...p }));
  const space = spaces.find(s => s.id === d.spaceId);
  const spaceLayouts = Object.entries(space ? layouts[space.id] ?? {} : {});
  const layout = d.layout && spaceLayouts.some(([k]) => k === d.layout) ? d.layout : spaceLayouts.sort((a, b) => b[1] - a[1]).find(([, c]) => c >= guests)?.[0] ?? spaceLayouts[0]?.[0];
  const layoutCap = space ? (layouts[space.id] ?? {})[layout ?? ""] ?? space.capacity : 0;
  const conflict = busy.find(b => b.spaceId === d.spaceId)?.conflict;
  const over = guests > layoutCap && layoutCap > 0;
  const pkg = packages.find(p => p.id === d.packageId);
  const hours = Array.from({ length: 7 }, (_, i) => 12 + i * 2);
  const pos = (t: number) => dayStart === null ? 0 : Math.min(100, Math.max(0, ((t - (dayStart + 12 * 36e5)) / 36e5 / 12) * 100));
  const save = (next: 3 | null) => run(() => saveBookingStep({ ...d, layout }, next));
  return <div className="wz-grid">
    <div className="wz-col wz-wide">
      <section className="ws-panel wz-card wz-selected"><h2>Selected venue</h2><div>{venue.image ? <Pic src={venue.image} alt="" /> : null}
        <span><b>{venue.name}</b><small>{venue.location}</small><span className="wz-tags"><i>{venue.spaces} spaces</i>{venue.capacity ? <i>Up to {venue.capacity} guests</i> : null}</span></span>
        <Link className="ws-btn outline sm" href="/provider/bookings/new?step=1">Change venue</Link></div></section>
      <section className="ws-panel wz-card"><div className="wz-head-row"><div><h2>1. Choose space</h2><p className="qb-sub">Select the space for this booking.</p></div><Link className="ws-btn outline sm" href={`/provider/venues/${venue.id}?tab=spaces`}>View all spaces</Link></div>
        <div className="wz-spaces" role="radiogroup" aria-label="Space">{spaces.map(s => { const c = busy.find(b => b.spaceId === s.id)?.conflict; return <button key={s.id} type="button" role="radio" aria-checked={d.spaceId === s.id}
          className={`${d.spaceId === s.id ? "on" : ""} ${c ? "busy" : ""}`} onClick={() => set({ spaceId: s.id, layout: undefined })}>
          {s.image ? <Pic src={s.image} alt="" /> : <span className="qb-noimg" />}<i className="wz-radio" />
          <b>{s.name}</b><small>{s.capacity} capacity{c ? " · Booked" : ""}</small></button>; })}</div></section>
      <div className="wz-2col">
        <section className="ws-panel wz-card"><h2>2. Layout &amp; capacity</h2><p className="qb-sub">Choose a layout and confirm capacity.</p>
          <div className="wz-2"><label className="ws-field"><span>Layout style</span><select value={layout ?? ""} onChange={e => set({ layout: e.target.value })}>{spaceLayouts.map(([k, c]) => <option key={k} value={k}>{layoutName(k)} ({c})</option>)}</select></label>
            <label className="ws-field"><span>Guest capacity</span><span className="wz-icon-input"><Users aria-hidden="true" /><input readOnly value={guests} /></span></label></div>
          <p className={`wz-hint ${over ? "bad" : ""}`}>{over ? <CircleAlert aria-hidden="true" /> : <Info aria-hidden="true" />}Max for selected layout: {layoutCap}{over ? " — reduce guests or choose another layout/space" : ""}</p>
          <h3>4. Setup &amp; breakdown</h3>
          <div className="wz-2"><label className="ws-field"><span>Setup time (hours) *</span><input type="number" min={0} max={24} value={d.setupHours} onChange={e => set({ setupHours: Number(e.target.value) })} /></label>
            <label className="ws-field"><span>Breakdown time (hours) *</span><input type="number" min={0} max={24} value={d.breakdownHours} onChange={e => set({ breakdownHours: Number(e.target.value) })} /></label></div></section>
        <section className="ws-panel wz-card"><h2>3. Package <small>(optional)</small></h2><p className="qb-sub">Select a package to include with this booking.</p>
          <label className="ws-field"><span className="sr-only">Package</span><select value={d.packageId ?? ""} onChange={e => set({ packageId: e.target.value })}><option value="">No package</option>{packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          {pkg && <ul className="wz-incl">{(pkg.inclusions ?? []).map(i => <li key={i}><CircleCheck aria-hidden="true" />{i}</li>)}</ul>}
          <h3>5. Booking state</h3>
          <label className="wz-radio-row"><input type="radio" checked={!d.hold} onChange={() => set({ hold: false })} /><span><b>Confirm booking now</b><small>Reserves the space immediately.</small></span></label>
          <label className="wz-radio-row"><input type="radio" checked={!!d.hold} onChange={() => set({ hold: true })} /><span><b>Place on hold</b><small>Temporarily hold — expires if not confirmed.</small></span>
            <select aria-label="Hold length" value={d.holdHours} disabled={!d.hold} onChange={e => set({ holdHours: Number(e.target.value) })}><option value={24}>24 hours</option><option value={48}>48 hours</option><option value={72}>72 hours</option></select></label></section>
      </div>
    </div>
    <div className="wz-col wz-avail-col">
      <section className="ws-panel wz-card wz-avail"><h2>Space availability</h2><p className="qb-sub">Real bookings and blocks for the selected date.</p>
        <p className="wz-date"><CalendarDays aria-hidden="true" />{draft.date ? new Date(`${draft.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "No date"}</p>
        <div className="wz-timeline" style={{ ["--n" as string]: Math.min(4, spaces.length) }}>
          <div className="wz-hours">{hours.map(h => <span key={h}>{String(h % 24).padStart(2, "0")}:00</span>)}</div>
          {spaces.slice(0, 4).map(s => { const b = busy.find(x => x.spaceId === s.id); return <div key={s.id} className="wz-lane"><b>{s.name}</b><div className="wz-lane-track">
            {(b?.segs ?? []).map((x, i) => <i key={i} className={x.kind} style={{ top: `${pos(x.a)}%`, height: `${Math.max(3, pos(x.b) - pos(x.a))}%` }} title={x.label} />)}
            {s.id === d.spaceId && reqStart !== null && reqEnd !== null && <i className="sel" style={{ top: `${pos(reqStart)}%`, height: `${Math.max(4, pos(reqEnd) - pos(reqStart))}%` }}>{draft.start} – {draft.end}<br />Selected</i>}
            {!(b?.segs ?? []).length && s.id !== d.spaceId && <em>Available</em>}</div></div>; })}
        </div>
        <p className="wz-legend"><span className="free">Available</span><span className="partial">Held</span><span className="booked">Unavailable</span></p></section>
    </div>
    <aside className="wz-rail">
      <Agent title="Based on your event details, I recommend:">
        <ul>{best && <li><CircleCheck aria-hidden="true" className="ok" />{best.name} for {guests} guests (best fit)</li>}
          {packages[0] && <li><CircleCheck aria-hidden="true" className="ok" />The {packages[0].name}</li>}
          <li>{conflict ? <CircleAlert aria-hidden="true" className="warn" /> : <CircleCheck aria-hidden="true" className="ok" />}{conflict ? `Conflict: ${conflict.label}` : "No availability conflicts detected"}</li></ul>
        {best && best.id !== d.spaceId && <button type="button" className="ws-btn outline block" onClick={() => set({ spaceId: best.id, layout: undefined })}>Apply recommendation</button>}
      </Agent>
      {space && <section className="ws-panel wz-sel-sum"><h2>Selected space</h2><div>{space.image ? <Pic src={space.image} alt="" /> : null}
        <span><b>{space.name}</b><small>{draft.date} · {draft.start} – {draft.end}</small><small>{layout ? `${layoutName(layout)} layout` : ""} · {guests} guests</small></span></div></section>}
      <section className={`ws-panel wz-status ${conflict || over ? "bad" : ""}`}>{conflict || over ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
        <span><b>{conflict ? "Calendar conflict" : over ? "Over capacity" : "No calendar conflicts"}</b><small>{conflict ? `${conflict.label} overlaps this time.` : over ? "Guest count exceeds the layout capacity." : "The selected space and time are available."}</small></span></section>
      {spaces.filter(s => s.id !== d.spaceId && s.capacity >= guests && !busy.find(b => b.spaceId === s.id)?.conflict).length > 0 && <section className="ws-panel wz-alts"><h2><LayoutGrid aria-hidden="true" />Alternative options</h2>
        <ul>{spaces.filter(s => s.id !== d.spaceId && s.capacity >= guests && !busy.find(b => b.spaceId === s.id)?.conflict).slice(0, 2).map(s => <li key={s.id}>{s.image ? <Pic src={s.image} alt="" /> : null}<span><b>{s.name}</b><small>{s.capacity} capacity</small></span>
          <button type="button" aria-label={`Use ${s.name}`} onClick={() => set({ spaceId: s.id, layout: undefined })}><ArrowRight aria-hidden="true" /></button></li>)}</ul></section>}
    </aside>
    <div className="wz-span"><Footer back="/provider/bookings/new?step=1" onSave={() => save(null)} onNext={() => save(3)} nextLabel="Continue to Pricing & Terms" pending={pending} error={error} disabled={!d.spaceId || !!conflict || over} /></div>
  </div>;
}

/* ───────── Step 3: Pricing & Terms ───────── */
type Svc = { id: string; name: string; category: string; price: number; unit: string; image: string };
export function StepPricing({ draft, venue, space, packages, services, taxBps, defaults, policies, conflict }: { draft: BookingDraft; venue: { id: string; name: string; image: string }; space: { id: string; name: string; rate_hourly: number | null; image: string } | null;
  packages: Pkg[]; services: Svc[]; taxBps: number; defaults: { hire: number; minimumSpend: number; depositPct: number }; policies: Record<string, string>; conflict: string | null }) {
  const { pending, error, run } = useStep();
  const guests = draft.guests ?? 0;
  const pkg = packages.find(p => p.id === draft.packageId);
  const [d, setD] = useState<BookingDraft>({
    hire: draft.hire ?? (space?.rate_hourly ? Number(space.rate_hourly) : defaults.hire), hireBasis: draft.hireBasis ?? (space?.rate_hourly ? "hourly" : "fixed"), minimumSpend: draft.minimumSpend ?? defaults.minimumSpend,
    includes: draft.includes ?? ["furniture", "av"], fnbMode: draft.fnbMode ?? (pkg ? "package" : "none"), fnbPerGuest: draft.fnbPerGuest ?? (pkg?.price_basis === "per_person" ? Number(pkg.base_price) : 0),
    fnbIncludes: draft.fnbIncludes ?? pkg?.inclusions ?? [], services: draft.services ?? [], depositPct: draft.depositPct ?? defaults.depositPct, secondPct: draft.secondPct ?? Math.max(0, 100 - (draft.depositPct ?? defaults.depositPct) - (draft.finalPct ?? 25)), secondDays: draft.secondDays ?? 30,
    finalPct: draft.finalPct ?? 25, finalDays: draft.finalDays ?? 7, policy: draft.policy ?? "standard", notes: draft.notes ?? "" });
  const set = (p: Partial<BookingDraft>) => setD(x => ({ ...x, ...p }));
  const hours = draft.start && draft.end ? (((Number(draft.end.slice(0, 2)) + (draft.end <= draft.start ? 24 : 0)) * 60 + Number(draft.end.slice(3))) - (Number(draft.start.slice(0, 2)) * 60 + Number(draft.start.slice(3)))) / 60 : 0;
  const hire = d.hireBasis === "hourly" ? (d.hire ?? 0) * hours : d.hire ?? 0;
  const fnb = d.fnbMode === "none" ? 0 : (d.fnbPerGuest ?? 0) * guests;
  const svc = (d.services ?? []).reduce((a, s) => a + s.qty * s.unitPrice, 0);
  const minTop = Math.max(0, (d.minimumSpend ?? 0) - (hire + fnb));
  const subtotal = hire + fnb + minTop + svc, tax = Math.round(subtotal * taxBps) / 10000, total = subtotal + tax;
  const pct = (p: number) => Math.round(total * p) / 100;
  const schedOk = (d.depositPct ?? 0) + (d.secondPct ?? 0) + (d.finalPct ?? 0) === 100;
  const totals = useMemo(() => ({ subtotal, tax, total }), [subtotal, tax, total]);
  const payload = (): BookingDraft => d;
  return <div className="wz-grid">
    <div className="wz-col wz-wide">
      <section className="ws-panel wz-card wz-selected"><div>{venue.image ? <Pic src={venue.image} alt="" /> : null}
        <span><b>{draft.eventName}</b><small>{draft.date} · {draft.start} – {draft.end} · {guests} guests · {draft.eventType}</small><small><MapPin aria-hidden="true" />{venue.name} · {space?.name} · {draft.layout ? layoutName(draft.layout) : ""}</small></span>
        <Link className="ws-btn outline sm" href="/provider/bookings/new?step=1">Edit event details</Link></div></section>
      <div className="wz-2col">
        <section className="ws-panel wz-card"><h2>1. Hire &amp; venue fees</h2><p className="qb-sub">Set the venue hire, minimum spend and any included items.</p>
          <div className="wz-2"><label className="ws-field"><span>Venue hire (GBP) *</span><span className="wz-money"><span>£</span><input type="number" min={0} value={d.hire ?? 0} onChange={e => set({ hire: Number(e.target.value) })} /></span></label>
            <label className="ws-field"><span>Basis</span><select value={d.hireBasis} onChange={e => set({ hireBasis: e.target.value as "fixed" | "hourly" })}><option value="fixed">Fixed</option><option value="hourly">Per hour ({hours}h)</option></select></label></div>
          <div className="wz-2"><label className="ws-field"><span>Minimum spend <small>(optional)</small></span><span className="wz-money"><span>£</span><input type="number" min={0} value={d.minimumSpend ?? 0} onChange={e => set({ minimumSpend: Number(e.target.value) })} /></span></label>
            <label className="ws-field"><span>Applies to</span><select disabled><option>Hire + F&amp;B</option></select></label></div>
          {[["furniture", "Include standard furniture (tables, chairs, stage)"], ["av", "Include basic AV (sound system, lighting)"], ["cleaning", "Include cleaning"], ["security", "Include security"]].map(([k, l]) =>
            <label key={k} className="wz-check"><input type="checkbox" checked={(d.includes ?? []).includes(k)} onChange={e => set({ includes: e.target.checked ? [...(d.includes ?? []), k] : (d.includes ?? []).filter(x => x !== k) })} />{l}</label>)}</section>
        <section className="ws-panel wz-card"><h2>2. Food &amp; beverage <small>(optional)</small></h2><p className="qb-sub">Add catering and drink packages.</p>
          <div className="wz-seg" role="radiogroup">{(["none", "package", "custom"] as const).map(m => <button key={m} type="button" role="radio" aria-checked={d.fnbMode === m} className={d.fnbMode === m ? "on" : ""} onClick={() => set({ fnbMode: m })}>{m === "none" ? "No F&B" : m === "package" ? "Use package" : "Custom menu"}</button>)}</div>
          {d.fnbMode !== "none" && <><div className="wz-2"><label className="ws-field"><span>Price per guest</span><span className="wz-money"><span>£</span><input type="number" min={0} value={d.fnbPerGuest ?? 0} onChange={e => set({ fnbPerGuest: Number(e.target.value) })} /></span></label>
            <label className="ws-field"><span>Guest count</span><input readOnly value={guests} /></label></div>
            <p className="wz-line"><b>Total (GBP)</b><b>{gbp(fnb)}</b></p>
            {(d.fnbIncludes ?? []).length > 0 && <ul className="wz-incl">{d.fnbIncludes!.map(i => <li key={i}><CircleCheck aria-hidden="true" />{i}</li>)}</ul>}</>}</section>
        <section className="ws-panel wz-card"><h2>3. Additional services <small>(optional)</small></h2><p className="qb-sub">Add any extra services for this booking.</p>
          {(d.services ?? []).length > 0 && <table className="wz-svc"><thead><tr><th>Service</th><th>Qty</th><th>Unit price</th><th>Total</th><th /></tr></thead><tbody>{d.services!.map((s, i) => <tr key={i}>
            <td><span className="wz-svc-name">{s.image ? <Pic src={s.image} alt="" /> : null}<b>{s.label}</b></span></td>
            <td><input type="number" min={1} aria-label="Quantity" value={s.qty} onChange={e => set({ services: d.services!.map((x, j) => j === i ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x) })} /></td>
            <td><input type="number" min={0} aria-label="Unit price" value={s.unitPrice} onChange={e => set({ services: d.services!.map((x, j) => j === i ? { ...x, unitPrice: Math.max(0, Number(e.target.value)) } : x) })} /></td>
            <td>{gbp(s.qty * s.unitPrice)}</td><td><button type="button" className="qb-x" aria-label={`Remove ${s.label}`} onClick={() => set({ services: d.services!.filter((_, j) => j !== i) })}><X aria-hidden="true" /></button></td></tr>)}</tbody></table>}
          <label className="ws-field"><span className="sr-only">Add service</span><select value="" onChange={e => { const s = services.find(x => x.id === e.target.value); if (s) set({ services: [...(d.services ?? []), { listingId: s.id, label: s.name, detail: s.category, qty: s.unit.includes("guest") ? guests : 1, unitPrice: s.price, image: s.image }] }); }}>
            <option value="">+ Add service</option>{services.map(s => <option key={s.id} value={s.id}>{s.name} — {gbp(s.price)} {s.unit}</option>)}</select></label></section>
        <section className="ws-panel wz-card"><h2>4. Payment schedule</h2><p className="qb-sub">Set deposit and payment milestones.</p>
          {([["Deposit *", "depositPct", null], ["Second payment", "secondPct", "secondDays"], ["Final payment", "finalPct", "finalDays"]] as const).map(([l, k, dk]) => <div key={k} className="wz-sched"><span>{l}</span>
            <span className="wz-money pct"><input type="number" min={0} max={100} aria-label={`${l} percent`} value={d[k] ?? 0} onChange={e => set({ [k]: Number(e.target.value) })} /><span>%</span></span>
            <span className="wz-amt">{gbp(pct(d[k] ?? 0))}</span>
            {dk ? <select aria-label={`${l} due`} value={d[dk] ?? 0} onChange={e => set({ [dk]: Number(e.target.value) })}>{[60, 30, 14, 7].map(n => <option key={n} value={n}>{n} days before</option>)}</select> : <span className="wz-due">On confirmation</span>}</div>)}
          {!schedOk && <p className="wz-hint bad"><CircleAlert aria-hidden="true" />Payments must add up to 100%.</p>}
          <h3>5. Cancellation policy</h3><select className="ws-select wz-full" value={d.policy} onChange={e => set({ policy: e.target.value })}>{Object.entries(policies).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></section>
      </div>
      <section className="ws-panel wz-card"><h2>6. Additional notes <small>(optional)</small></h2><p className="qb-sub">Add any internal notes or special arrangements for this booking.</p>
        <textarea className="wz-notes" rows={3} maxLength={500} value={d.notes ?? ""} onChange={e => set({ notes: e.target.value })} /><small className="wz-count">{(d.notes ?? "").length}/500</small></section>
    </div>
    <aside className="wz-rail">
      <Agent title="Here’s a commercial summary of this booking:">
        <ul><li><CircleCheck aria-hidden="true" className="ok" />Total {gbp(totals.total)} for {guests} guests ({guests ? gbp(totals.total / guests) : "—"} per guest)</li>
          {d.minimumSpend ? <li>{minTop > 0 ? <CircleAlert aria-hidden="true" className="warn" /> : <CircleCheck aria-hidden="true" className="ok" />}{minTop > 0 ? `${gbp(minTop)} top-up to reach the minimum spend` : "Minimum spend met"}</li> : null}
          <li>{conflict ? <CircleAlert aria-hidden="true" className="warn" /> : <CircleCheck aria-hidden="true" className="ok" />}{conflict ? `Conflict with ${conflict}` : "No calendar conflicts detected"}</li></ul></Agent>
      <section className="ws-panel wz-sum"><div className="ws-panel-head"><h2>Booking summary</h2><Link className="ws-btn outline sm" href="/provider/bookings/new?step=2">Edit</Link></div>
        <dl><div><dt>Venue</dt><dd>{venue.name} › {space?.name}</dd></div><div><dt>Layout</dt><dd>{draft.layout ? layoutName(draft.layout) : "—"}</dd></div><div><dt>Package</dt><dd>{pkg?.name ?? "—"}</dd></div>
          <div><dt>Setup / breakdown</dt><dd>{draft.setupHours ?? 0} hrs / {draft.breakdownHours ?? 0} hrs</dd></div><div><dt>Guests</dt><dd>{guests}</dd></div></dl></section>
      <section className={`ws-panel wz-status ${conflict || !schedOk ? "bad" : ""}`}>{conflict || !schedOk ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
        <span><b>{conflict ? "Can’t create yet" : !schedOk ? "Check payment schedule" : "Ready to create booking"}</b><small>{conflict ? "The space is no longer available for this time." : !schedOk ? "Milestones must total 100%." : "All requirements are met and the space is available for the selected dates and times."}</small></span></section>
      <section className="ws-panel wz-totals"><h2>Estimated totals (GBP)</h2><dl><div><dt>Venue hire</dt><dd>{gbp(hire)}</dd></div>{fnb > 0 && <div><dt>F&amp;B ({guests} guests)</dt><dd>{gbp(fnb)}</dd></div>}
        {minTop > 0 && <div><dt>Minimum spend top-up</dt><dd>{gbp(minTop)}</dd></div>}{svc > 0 && <div><dt>Additional services</dt><dd>{gbp(svc)}</dd></div>}
        <div className="sub"><dt>Subtotal</dt><dd>{gbp(subtotal)}</dd></div>{taxBps > 0 && <div><dt>VAT ({taxBps / 100}%)</dt><dd>{gbp(tax)}</dd></div>}<div className="total"><dt>Total</dt><dd>{gbp(total)}</dd></div></dl></section>
    </aside>
    <div className="wz-span"><Footer back="/provider/bookings/new?step=2" onSave={() => run(() => saveBookingStep(payload(), null))} onNext={() => run(() => confirmBooking(payload()))} nextLabel="Confirm booking" pending={pending} error={error} disabled={!!conflict || !schedOk || total <= 0} /></div>
  </div>;
}
