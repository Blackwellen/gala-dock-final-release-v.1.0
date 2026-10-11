"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Info, CircleCheck, CircleAlert, Sparkles, X, ChevronLeft, ChevronRight, Users, Ruler, Building2, Save, ArrowRight, ArrowLeft } from "lucide-react";
import { useToast } from "@/components/ui";
import { saveSpaceFields, setSpaceLinks } from "../[id]/spaces/actions";
import { money } from "@/lib/workspace/format";

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Hours = Partial<Record<Day, [string, string] | null>>;
const DAYS: [Day, string][] = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
export type RulesInput = {
  space: { id: string; name: string; status: string; image: string; gallery: string[]; capacity: number; area: number | null; type: string; rate_hourly: number | null; min_hours: number;
    details: { hours?: { inherit?: boolean; week?: Hours }; setup_minutes?: number; cleardown_minutes?: number; pricing_mode?: string; short_notice?: boolean; booking_type?: string;
      response_hours?: number | null; cancellation?: { window: string; refund: number }[] | null; quote_custom?: boolean } };
  others: { id: string; name: string }[]; linked: string[]; exclusive: string[]; venueHours: Hours; venueRate: number | null; venueResponse: number;
  venueCancellation: { window: string; refund: number }[];
  /** Overlapping hard commitments between this space and each other space (id → event names) — exclusivity can't be declared over these. */
  overlaps: Record<string, string[]>;
};

/** Add Space step 4 / space profile "Availability & Rules". Every rule saved here is enforced server-side (turnaround + exclusivity in provider_jobs triggers). */
export function SpaceRulesForm({ venueId, input, back, next, nextLabel = "Next" }: { venueId: string; input: RulesInput; back?: string; next?: string; nextLabel?: string }) {
  const router = useRouter(), toast = useToast();
  const [pending, start] = useTransition();
  const s = input.space, d = s.details;
  const [inherit, setInherit] = useState(d.hours?.inherit !== false);
  const [week, setWeek] = useState<Hours>(d.hours?.week ?? input.venueHours);
  const [editHours, setEditHours] = useState(false);
  const [linked, setLinked] = useState(input.linked);
  const [exclusive, setExclusive] = useState(input.exclusive);
  const [setup, setSetup] = useState({ v: d.setup_minutes ?? 60, unit: (d.setup_minutes ?? 60) % 60 === 0 ? "hours" : "minutes" });
  const [clear, setClear] = useState({ v: d.cleardown_minutes ?? 60, unit: (d.cleardown_minutes ?? 60) % 60 === 0 ? "hours" : "minutes" });
  const [customRate, setCustomRate] = useState(s.rate_hourly !== null && s.rate_hourly !== input.venueRate);
  const [rate, setRate] = useState(s.rate_hourly ?? input.venueRate ?? 0);
  const [mode, setMode] = useState(d.pricing_mode ?? "hourly");
  const [minHours, setMinHours] = useState(s.min_hours);
  const [shortNotice, setShortNotice] = useState(d.short_notice ?? false);
  const [bookingType, setBookingType] = useState(d.booking_type ?? "marketplace");
  const [response, setResponse] = useState<number | null>(d.response_hours ?? null);
  const [cancel, setCancel] = useState<"venue" | "flexible" | "strict">(d.cancellation ? (d.cancellation[0]?.refund === 100 && d.cancellation.length === 2 ? "flexible" : "strict") : "venue");
  const [quote, setQuote] = useState(d.quote_custom ?? false);
  const [publish, setPublish] = useState(s.status === "published");
  const [img, setImg] = useState(0);
  const photos = [s.image, ...s.gallery].filter(Boolean);
  const total = (setup.v + clear.v) / 60;
  const clash = exclusive.flatMap(id => (input.overlaps[id] ?? []).map(ev => `${input.others.find(o => o.id === id)?.name}: ${ev}`));
  const hours = inherit ? input.venueHours : week;
  const policy = cancel === "venue" ? null : cancel === "flexible" ? [{ window: "7+ days", refund: 100 }, { window: "<7 days", refund: 50 }] : [{ window: "30+ days", refund: 100 }, { window: "14–30 days", refund: 50 }, { window: "<14 days", refund: 0 }];
  const checks = [
    clash.length ? { ok: false, text: "Exclusive spaces have overlapping bookings" } : { ok: true, text: "No conflicting exclusivity rules" },
    total >= 1 ? { ok: true, text: "Turnaround time is sufficient" } : { ok: false, text: "Turnaround under 1 hour is tight for most events" },
    customRate && input.venueRate ? { ok: Math.abs(rate - input.venueRate) / input.venueRate <= 0.5, text: Math.abs(rate - input.venueRate) / input.venueRate <= 0.5 ? "Rate is in line with your venue rate" : "Rate is far from your venue rate — double-check" } : { ok: true, text: "Uses your venue rates" },
    { ok: minHours >= 2, text: minHours >= 2 ? `Minimum ${minHours}h booking set` : "Consider a minimum of 2+ hours" },
  ];

  const save = (go: boolean) => start(async () => {
    if (clash.length) { toast("Resolve the overlapping bookings before making these spaces exclusive."); return; }
    if (bookingType === "operational" && publish) { toast("Operational-only spaces can’t be published."); return; }
    const r = await saveSpaceFields(venueId, s.id, {
      rate_hourly: customRate ? rate : input.venueRate, min_hours: minHours, status: bookingType === "operational" ? "draft" : publish ? "published" : (s.status === "published" ? "paused" : s.status),
      details: { hours: inherit ? { inherit: true } : { inherit: false, week }, setup_minutes: setup.v, cleardown_minutes: clear.v,
        pricing_mode: mode, short_notice: shortNotice, booking_type: bookingType, response_hours: response, cancellation: policy, quote_custom: quote } });
    if (!r.ok) { toast(r.error); return; }
    const l = await setSpaceLinks(venueId, s.id, linked, exclusive);
    if (!l.ok) { toast(l.error); return; }
    toast(r.message ?? "Saved");
    if (go && next) router.push(next); else router.refresh();
  });
  const hourInput = (v: { v: number; unit: string }, set: (x: { v: number; unit: string }) => void, label: string) => <div className="sr-dur">
    <input type="number" min={0} aria-label={label} value={v.unit === "hours" ? v.v / 60 : v.v} onChange={e => set({ ...v, v: Math.max(0, Number(e.target.value)) * (v.unit === "hours" ? 60 : 1) })} />
    <select className="ws-select" aria-label={`${label} unit`} value={v.unit} onChange={e => set({ ...v, unit: e.target.value })}><option value="hours">hours</option><option value="minutes">minutes</option></select></div>;
  const chipsFor = (list: string[], set: (x: string[]) => void, other: string[], label: string) => <div className="sr-multi">
    {list.map(id => <span key={id} className="sr-chip">{input.others.find(o => o.id === id)?.name}<button type="button" aria-label={`Remove ${input.others.find(o => o.id === id)?.name}`} onClick={() => set(list.filter(x => x !== id))}><X aria-hidden="true" /></button></span>)}
    <select className="ws-select" aria-label={label} value="" onChange={e => { if (e.target.value) set([...list, e.target.value]); }}>
      <option value="">{list.length ? "Add…" : label}</option>{input.others.filter(o => !list.includes(o.id) && !other.includes(o.id)).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>;

  return <div className="sr">
    <section className="ws-panel sr-avail"><h2>Availability</h2><p>Set when this space can be booked.</p>
      <div className="sr-radios">
        <label className={inherit ? "on" : ""}><input type="radio" name="avail" checked={inherit} onChange={() => setInherit(true)} /><span><b>Inherit from venue</b><small>Use venue opening hours and override if needed.</small></span></label>
        <label className={!inherit ? "on" : ""}><input type="radio" name="avail" checked={!inherit} onChange={() => { setInherit(false); setEditHours(true); }} /><span><b>Custom availability</b><small>Set different hours for this space.</small></span></label></div>
      <h3>Weekly availability {inherit && <small>(inherited)</small>}</h3>
      <ul className="sr-week">{DAYS.map(([k, l]) => <li key={k}><b>{l}</b>{!inherit && editHours
        ? <span className="sr-hrs"><input type="time" aria-label={`${l} opens`} value={week[k]?.[0] ?? ""} onChange={e => setWeek({ ...week, [k]: [e.target.value, week[k]?.[1] ?? "00:00"] })} /><input type="time" aria-label={`${l} closes`} value={week[k]?.[1] ?? ""} onChange={e => setWeek({ ...week, [k]: [week[k]?.[0] ?? "09:00", e.target.value] })} />
          <button type="button" className="sr-closed" onClick={() => setWeek({ ...week, [k]: week[k] ? null : ["09:00", "00:00"] })}>{week[k] ? "Close" : "Open"}</button></span>
        : <small>{hours[k] ? `${hours[k]![0]} – ${hours[k]![1]}` : "Closed"}</small>}</li>)}
        <li className="sr-edit"><button type="button" className="ws-btn outline sm" onClick={() => { setInherit(false); setEditHours(e => !e); }}>{editHours && !inherit ? "Done" : "Edit hours"}</button></li></ul>
    </section>

    <section className="ws-panel sr-links"><h2>Linked &amp; exclusive spaces</h2><p>Control how this space interacts with other spaces.</p>
      <label>Linked spaces <small>(optional)</small>{chipsFor(linked, setLinked, exclusive, "Select spaces that are commonly booked together")}</label>
      <small className="sr-help">Linked spaces can be suggested together during booking.</small>
      <label>Exclusive spaces{chipsFor(exclusive, setExclusive, linked, "Select spaces that can’t be booked at the same time")}</label>
      <small className="sr-help">These spaces cannot be booked at the same time — enforced on every hold and booking.</small>
      <div className={`sr-note ${clash.length ? "bad" : "ok"}`}>{clash.length ? <CircleAlert aria-hidden="true" /> : <Info aria-hidden="true" />}
        <span><b>{clash.length ? "Conflicts found" : "No conflicts detected"}</b><small>{clash.length ? clash.slice(0, 2).join(" · ") : "Your exclusivity rules do not conflict with existing bookings."}</small></span></div>
    </section>

    <aside className="sr-side">
      <section className="ws-panel sr-agent"><h2><span className="sb-agent-ic"><Sparkles aria-hidden="true" /></span>Gala Agent <em>Checks</em></h2>
        <div className="sb-agent-box"><p>I’ve checked your availability and commercial rules:</p>
          <ul>{checks.map(c => <li key={c.text} className={c.ok ? "" : "warn"}>{c.ok ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}{c.text}</li>)}</ul></div></section>
      <section className="ws-panel sr-preview"><div className="sb-head"><h2>Space preview</h2><span className="sr-vis">{publish && bookingType !== "operational" ? "Visible on marketplace" : "Draft (not visible)"}</span></div>
        <div className="sr-photo">{/* eslint-disable-next-line @next/next/no-img-element */}
          {photos[img] ? <img src={photos[img]} alt="" /> : <span className="qb-noimg" />}
          {photos.length > 1 && <><button type="button" className="prev" aria-label="Previous photo" onClick={() => setImg(i => (i - 1 + photos.length) % photos.length)}><ChevronLeft aria-hidden="true" /></button>
            <button type="button" className="next" aria-label="Next photo" onClick={() => setImg(i => (i + 1) % photos.length)}><ChevronRight aria-hidden="true" /></button><span className="sr-count">{img + 1}/{photos.length}</span></>}</div>
        <b className="sr-name">{s.name}</b>
        <p className="sr-meta"><span><Users aria-hidden="true" />{s.capacity} capacity</span>{s.area ? <span><Ruler aria-hidden="true" />{s.area} sqm</span> : null}<span><Building2 aria-hidden="true" />{s.type}</span></p></section>
    </aside>

    <section className="ws-panel sr-turn"><h2>Turnaround &amp; preparation</h2><p>Set time buffer between bookings.</p>
      <div className="sr-row2"><label>Setup time before{hourInput(setup, setSetup, "Setup time")}</label><label>Clear down time after{hourInput(clear, setClear, "Clear down time")}</label></div>
      <div className="sr-note"><Clock aria-hidden="true" /><span><b>Total turnaround time: {+total.toFixed(2)} hours</b><small>This time is blocked between bookings — a hold or booking inside it is refused.</small></span></div>
    </section>

    <section className="ws-panel sr-price"><h2>Pricing &amp; commercial</h2><p>Override venue rates (optional).</p>
      <div className="sr-seg"><button type="button" className={!customRate ? "on" : ""} aria-pressed={!customRate} onClick={() => setCustomRate(false)}>{!customRate && <CircleCheck aria-hidden="true" />}Use venue rates</button>
        <button type="button" className={customRate ? "on" : ""} aria-pressed={customRate} onClick={() => setCustomRate(true)}>{customRate && <CircleCheck aria-hidden="true" />}Custom rates</button></div>
      <div className="sr-row2">
        <label>Pricing mode<select className="ws-select" value={mode} onChange={e => setMode(e.target.value)}><option value="hourly">{customRate ? "Hourly rate" : "Same as venue (Hourly rate)"}</option><option value="daily">Day rate</option><option value="fixed">Fixed fee</option></select></label>
        <label>Rate {customRate ? "" : <small>(venue)</small>}<span className="sr-money"><em>£</em><input type="number" min={0} value={customRate ? rate : input.venueRate ?? ""} disabled={!customRate} onChange={e => setRate(Math.max(0, Number(e.target.value)))} /><em>{mode === "hourly" ? "per hour" : mode === "daily" ? "per day" : "fixed"}</em></span></label>
        <label>Minimum booking duration<div className="sr-dur"><input type="number" min={0.5} step={0.5} value={minHours} onChange={e => setMinHours(Math.max(0.5, Number(e.target.value)))} /><span>hours</span></div></label>
        <label className="sr-toggle"><button type="button" role="switch" aria-checked={shortNotice} className={`pv-switch${shortNotice ? " on" : ""}`} onClick={() => setShortNotice(v => !v)}><i /></button>
          <span><b>Allow short-notice bookings</b><small>Accept bookings with less than 48 hours’ notice.</small></span></label>
      </div>
      {!customRate && input.venueRate !== null && <small className="sr-help">Venue rate: {money(input.venueRate)}/hr</small>}
    </section>

    <section className="ws-panel sr-rules"><h2>Booking rules</h2><p>Configure how this space can be booked on the marketplace.</p>
      <div className="sr-rules-grid">
        <div><h3>Booking type</h3><div className="sr-radios col">
          <label className={bookingType === "marketplace" ? "on" : ""}><input type="radio" name="btype" checked={bookingType === "marketplace"} onChange={() => setBookingType("marketplace")} /><span><b>Marketplace bookable</b><small>Customers can book this space directly or request to book.</small></span></label>
          <label className={bookingType === "operational" ? "on" : ""}><input type="radio" name="btype" checked={bookingType === "operational"} onChange={() => { setBookingType("operational"); setPublish(false); }} /><span><b>Operational only</b><small>Internal use only, not shown on marketplace.</small></span></label></div></div>
        <label>Response requirement<select className="ws-select" value={response ?? ""} onChange={e => setResponse(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Same as venue (within {input.venueResponse} hours)</option>{[2, 4, 8, 12, 24].map(h => <option key={h} value={h}>Within {h} hours</option>)}</select></label>
        <label>Cancellation policy<select className="ws-select" value={cancel} onChange={e => setCancel(e.target.value as typeof cancel)}>
          <option value="venue">Same as venue ({input.venueCancellation.map(c => `${c.window}: ${c.refund}%`).slice(0, 1).join("")})</option><option value="flexible">Flexible (7+ days: 100%)</option><option value="strict">Strict (30+ days: 100%)</option></select></label>
        <label className="sr-toggle wide"><button type="button" role="switch" aria-checked={quote} className={`pv-switch${quote ? " on" : ""}`} onClick={() => setQuote(v => !v)}><i /></button>
          <span><b>Require quote for custom setup</b><small>Customer must request a quote for non-standard events.</small></span></label>
      </div>
    </section>

    <section className="ws-panel sr-publish"><h2>Publish settings</h2><p>Set the visibility of this space.</p>
      <div className="sr-radios col">
        <label className={!publish ? "on" : ""}><input type="radio" name="pub" checked={!publish} onChange={() => setPublish(false)} /><span><b>Save as draft</b><small>Keep this space private for now.</small></span></label>
        <label className={publish ? "on" : ""}><input type="radio" name="pub" checked={publish} disabled={bookingType === "operational"} onChange={() => setPublish(true)} /><span><b>Publish on marketplace</b><small>Make this space visible to customers.</small></span></label></div></section>

    <div className="sb-foot">
      {back && <Link href={back} className="ws-btn outline"><ArrowLeft aria-hidden="true" />Back</Link>}
      <span className="ws-spacer" />
      <button type="button" className="ws-btn outline" disabled={pending} onClick={() => save(false)}><Save aria-hidden="true" />{next ? "Save draft" : "Save rules"}</button>
      {next && <button type="button" className="ws-btn primary" disabled={pending} onClick={() => save(true)}>{nextLabel}<ArrowRight aria-hidden="true" /></button>}
    </div>
  </div>;
}
