"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Loader2, CalendarCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type DayStatus = "free" | "limited" | "booked" | "closed";
export type PublicAvailability = { from: string; to: string; timezone: string; days: { date: string; status: DayStatus }[]; spaces: { id: string; name: string }[] };

/** Event the booking card (PlanWithListing) listens for: a picked day pre-fills the request date. */
export const PICK_EVENT = "gd:listing-date";

const LABEL: Record<DayStatus, string> = { free: "available", limited: "limited availability", booked: "booked", closed: "closed" };
const LEGEND: [DayStatus, string][] = [["free", "Available"], ["limited", "Limited"], ["booked", "Booked"], ["closed", "Closed"]];
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEK_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Dates are handled as YYYY-MM-DD strings at UTC noon, so no device time zone can shift a day.
const at = (d: string) => new Date(`${d}T12:00:00Z`);
const ymd = (t: Date) => t.toISOString().slice(0, 10);
const plus = (d: string, n: number) => { const t = at(d); t.setUTCDate(t.getUTCDate() + n); return ymd(t); };
const monthKey = (d: string) => d.slice(0, 7);
const monthStart = (k: string) => `${k}-01`;
const shiftMonth = (k: string, n: number) => { const t = at(monthStart(k)); t.setUTCMonth(t.getUTCMonth() + n); return monthKey(ymd(t)); };
const dow = (d: string) => (at(d).getUTCDay() + 6) % 7;   // Monday = 0
const monthTitle = (k: string) => at(monthStart(k)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = (d: string) => `${WEEK_LONG[dow(d)]} ${at(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}`;

export function AvailabilityCalendar({ initial, listingId, kind, name }: { initial: PublicAvailability; listingId: string; kind: "venue" | "service"; name: string }) {
  const [data, setData] = useState(initial);
  const [space, setSpace] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const firstOpen = initial.days.find(d => d.status === "free" || d.status === "limited")?.date ?? initial.from;
  const [month, setMonth] = useState(monthKey(firstOpen));
  const [focus, setFocus] = useState(firstOpen);
  const [picked, setPicked] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const spaces = useMemo(() => initial.spaces ?? [], [initial.spaces]);

  const status = useMemo(() => new Map(data.days.map(d => [d.date, d.status])), [data]);
  const minMonth = monthKey(data.from), maxMonth = monthKey(data.to);
  const firstOf = (k: string) => monthStart(k) < data.from ? data.from : monthStart(k);
  const tab = monthKey(focus) === month ? focus : firstOf(month);   // roving tabindex target, always inside the visible month
  const goMonth = (k: string) => { setMonth(k); setFocus(firstOf(k)); };

  const weeks = useMemo(() => {
    const start = monthStart(month); const lead = dow(start);
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = start; monthKey(d) === month; d = plus(d, 1)) cells.push(d);
    while (cells.length % 7) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  }, [month]);

  // Move DOM focus only after a keyboard move (never on load or a pointer click).
  useEffect(() => {
    if (moved.current) { moved.current = false; grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus(); }
  }, [focus, month]);

  const changeSpace = useCallback(async (id: string) => {
    setSpace(id); setErr(""); setLoading(true);
    const { data: next, error } = await createClient().rpc("public_listing_availability", { p_listing: listingId, p_from: initial.from, p_to: initial.to, ...(id ? { p_space: id } : {}) });
    setLoading(false);
    if (error || !next) { setErr("Couldn't load that space's calendar. Try again."); return; }
    setData({ ...(next as PublicAvailability), spaces });
    setPicked(null);
  }, [initial.from, initial.to, listingId, spaces]);

  const pick = (d: string) => {
    const s = status.get(d);
    if (!s || s === "booked" || s === "closed") return;
    setPicked(d); setFocus(d);
    window.dispatchEvent(new CustomEvent(PICK_EVENT, { detail: { listingId, date: d } }));
  };

  const onKey = (e: React.KeyboardEvent, d: string) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next: string | null = null;
    if (e.key in step) next = plus(d, step[e.key]!);
    else if (e.key === "Home") next = plus(d, -dow(d));
    else if (e.key === "End") next = plus(d, 6 - dow(d));
    else if (e.key === "PageUp" || e.key === "PageDown") { const t = at(d); t.setUTCMonth(t.getUTCMonth() + (e.key === "PageUp" ? -1 : 1)); next = ymd(t); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(d); return; }
    if (!next) return;
    e.preventDefault();
    if (monthKey(next) < minMonth || monthKey(next) > maxMonth) return;
    moved.current = true; setFocus(next); if (monthKey(next) !== month) setMonth(monthKey(next));
  };

  const counts = useMemo(() => {
    const c = { free: 0, limited: 0, booked: 0, closed: 0 } as Record<DayStatus, number>;
    for (const d of data.days) if (monthKey(d.date) === month) c[d.status]++;
    return c;
  }, [data, month]);

  return <div className="ce-card la-card">
    <div className="la-top">
      <p className="la-note"><Info size={15} aria-hidden />Shows when {name} is free or busy. It&apos;s a guide only — your date is confirmed when {kind === "venue" ? "the venue" : "the supplier"} accepts your request.</p>
      {kind === "venue" && spaces.length > 1 && <label className="la-space"><span>Space</span>
        <select value={space} onChange={e => void changeSpace(e.target.value)} disabled={loading} aria-describedby="la-space-hint">
          <option value="">Any space</option>{spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select><small id="la-space-hint" className="k-sr">Shows availability for the chosen space only</small></label>}
    </div>
    <div className="la-nav">
      <button type="button" className="la-navbtn" onClick={() => goMonth(shiftMonth(month, -1))} disabled={month <= minMonth} aria-label="Previous month"><ChevronLeft size={18} aria-hidden /></button>
      <h3 id="la-month" aria-live="polite">{monthTitle(month)}{loading && <Loader2 size={15} className="k-spin" aria-label="Loading" />}</h3>
      <button type="button" className="la-navbtn" onClick={() => goMonth(shiftMonth(month, 1))} disabled={month >= maxMonth} aria-label="Next month"><ChevronRight size={18} aria-hidden /></button>
    </div>
    {err && <p className="la-err" role="alert">{err}</p>}
    <div ref={grid} className="la-grid" role="grid" aria-labelledby="la-month" aria-describedby="la-legend" aria-busy={loading}>
      <div role="row" className="la-row la-wk">{WEEK.map((w, i) => <span key={w} role="columnheader" aria-label={WEEK_LONG[i]}>{w}</span>)}</div>
      {weeks.map((wk, i) => <div key={i} role="row" className="la-row">{wk.map((d, j) => {
        if (!d) return <span key={`x${j}`} role="gridcell" className="la-cell la-empty" aria-hidden />;
        const s = status.get(d); const n = Number(d.slice(8));
        if (!s) return <span key={d} role="gridcell" className="la-cell la-out" aria-label={`${dayLabel(d)}, not shown`}><span className="la-day">{n}</span></span>;
        const open = s === "free" || s === "limited"; const sel = picked === d;
        return <span key={d} role="gridcell" className="la-cell" aria-selected={sel}>
          <button type="button" data-date={d} className={`la-btn s-${s}${sel ? " on" : ""}`} tabIndex={d === tab ? 0 : -1} aria-disabled={!open}
            aria-label={`${dayLabel(d)}, ${LABEL[s]}${sel ? ", selected" : ""}`} onClick={() => pick(d)} onKeyDown={e => onKey(e, d)} onFocus={() => setFocus(d)}>
            <span className="la-day" aria-hidden>{n}</span><i aria-hidden />
          </button></span>;
      })}</div>)}
    </div>
    <ul id="la-legend" className="la-legend" aria-label="Legend">{LEGEND.map(([s, l]) => <li key={s}><i className={`s-${s}`} aria-hidden />{l}<small>{counts[s]}</small></li>)}</ul>
    <div className="la-pick" aria-live="polite">{picked
      ? <><CalendarCheck size={16} aria-hidden /><span><b>{dayLabel(picked)}</b> selected{status.get(picked) === "limited" ? " — limited, so ask soon" : ""}.</span><a className="k-link" href="#book">Request this date</a></>
      : <span className="k-small">Pick an available day to use it in your request.</span>}</div>
  </div>;
}
