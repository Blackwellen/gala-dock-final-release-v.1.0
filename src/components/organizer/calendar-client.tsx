"use client";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, ChevronDown, Layers, Check, Bookmark, AlertTriangle, CalendarPlus } from "lucide-react";
import { Menu, Dialog, useAction, useKitToast } from "@/components/kit/client";
import { createCalendarEntry, rescheduleEntry, type Impact } from "@/lib/actions/calendar";
import type { CalEntry, LayerKey } from "@/lib/data/calendar";
import { promptDialog } from "@/lib/ui/dialogs";

type Layer = { key: string; label: string; color: string };
const TZ = "Europe/London";
const hm = (iso: string) => { const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso)); const h = Number(p.find(x => x.type === "hour")!.value) % 24, m = Number(p.find(x => x.type === "minute")!.value); return h + m / 60; };
const ymd = (iso: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const fmt = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export function LayerBar({ layers, active }: { layers: Layer[]; active: string[] }) {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();
  const set = (next: string[]) => { const p = new URLSearchParams(params.toString()); if (next.length === layers.length) p.delete("layers"); else p.set("layers", next.join(",") || "none"); router.push(`${pathname}?${p}`, { scroll: false }); };
  return <div className="cal-layers" role="group" aria-label="Calendar layers">{layers.map(l => { const on = active.includes(l.key); return <button key={l.key} className="cal-layer" aria-pressed={on} style={{ ["--c" as string]: l.color }} onClick={() => set(on ? active.filter(a => a !== l.key) : [...active, l.key])}><span className="cal-box">{on && <Check size={11} strokeWidth={3} />}</span>{l.label}</button>; })}</div>;
}

export function LayerList({ layers, active, counts }: { layers: Layer[]; active: string[]; counts: Record<string, number> }) {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();
  const set = (next: string[]) => { const p = new URLSearchParams(params.toString()); if (next.length === layers.length) p.delete("layers"); else p.set("layers", next.join(",") || "none"); router.push(`${pathname}?${p}`, { scroll: false }); };
  return <ul className="cal-layer-list">{layers.map(l => { const on = active.includes(l.key); return <li key={l.key}><label className="k-check"><input type="checkbox" checked={on} onChange={() => set(on ? active.filter(a => a !== l.key) : [...active, l.key])} /><i className="k-dot" style={{ background: l.color }} /><span className="k-grow">{l.label}</span></label><span className="k-small k-muted">{counts[l.key] ?? 0}</span></li>; })}</ul>;
}

export function SavedViews() {
  const router = useRouter(); const params = useSearchParams(); const pathname = usePathname(); const toast = useKitToast();
  const [views, setViews] = useState<{ name: string; query: string }[]>([]);
  useEffect(() => { queueMicrotask(() => { try { setViews(JSON.parse(localStorage.getItem("gd-cal-views") ?? "[]")); } catch { setViews([]); } }); }, []);
  const save = async () => { const name = (await promptDialog({ title: "Save this calendar view", message: "Saves the current filters on this device so you can switch back to them quickly.", label: "View name", defaultValue: "My view", required: true, maxLength: 40, confirmLabel: "Save view" }))?.value; if (!name) return; const next = [...views.filter(v => v.name !== name), { name, query: params.toString() }].slice(-8); setViews(next); try { localStorage.setItem("gd-cal-views", JSON.stringify(next)); toast("View saved on this device"); } catch { toast("Couldn't save view in this browser", "error"); } };
  return <Menu label="Saved views" width={220} trigger={({ toggle, open, id }) => <button className="k-btn ghost lg" onClick={toggle} aria-expanded={open} aria-controls={id}><Bookmark size={15} />Saved views<ChevronDown size={14} /></button>}>
    {close => <>{views.map(v => <button key={v.name} role="menuitem" className="k-menu-item" onClick={() => { close(); router.push(`${pathname}?${v.query}`); }}>{v.name}</button>)}{!views.length && <p className="k-small" style={{ padding: 10 }}>No saved views yet.</p>}<div className="k-menu-sep" /><button role="menuitem" className="k-menu-item" onClick={() => { close(); save(); }}><Plus size={14} />Save current view</button></>}
  </Menu>;
}

export function AddEntry({ events, defaultDate }: { events: { id: string; name: string }[]; defaultDate: string }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  return <>
    <Menu label="Add to calendar" width={230} trigger={({ toggle, open: o, id }) => <div className="k-split"><button className="k-btn primary lg" onClick={() => setOpen(true)}><Plus size={16} />Add</button><button className="k-btn primary lg" onClick={toggle} aria-expanded={o} aria-controls={id} aria-label="More add options"><ChevronDown size={15} /></button></div>}>
      {close => <><button role="menuitem" className="k-menu-item" onClick={() => { close(); setOpen(true); }}><CalendarPlus size={15} />Meeting</button><Link role="menuitem" className="k-menu-item" href="/organizer/events/new?step=1" onClick={close}>Event</Link><Link role="menuitem" className="k-menu-item" href="/organizer/team?tab=shifts" onClick={close}>Crew shift</Link></>}
    </Menu>
    <Dialog open={open} onClose={() => setOpen(false)} title="Add meeting">
      <form className="k-grid k-g2" onSubmit={async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); const r = await run(() => createCalendarEntry({ ...f, starts_at: new Date(String(f.starts_at)).toISOString(), ends_at: f.ends_at ? new Date(String(f.ends_at)).toISOString() : undefined })); if (r.ok) setOpen(false); }}>
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Title <b>*</b></span><input className="k-input" name="title" required /></label>
        <label className="k-field"><span>Starts <b>*</b></span><input className="k-input" type="datetime-local" name="starts_at" required defaultValue={`${defaultDate}T10:00`} /></label>
        <label className="k-field"><span>Ends</span><input className="k-input" type="datetime-local" name="ends_at" defaultValue={`${defaultDate}T11:00`} /></label>
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Related event</span><select className="k-select" name="event_id"><option value="">None</option>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Notes</span><input className="k-input" name="detail" /></label>
        <div className="k-row" style={{ gridColumn: "1/-1", justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>Add</button></div>
      </form>
    </Dialog>
  </>;
}

/** Week/Day time grid. Drag tasks and meetings to reschedule; dragging dependent items shows an impact assessment. */
export function TimeGrid({ days, entries, colors, startHour = 8, endHour = 24, selected }: { days: string[]; entries: CalEntry[]; colors: Record<string, string>; startHour?: number; endHour?: number; selected?: string }) {
  const { run } = useAction(); const router = useRouter(); const params = useSearchParams(); const pathname = usePathname();
  const [impact, setImpact] = useState<Impact | null>(null); const [drag, setDrag] = useState<CalEntry | null>(null);
  const rowH = 34; const today = ymd(new Date());
  const long = (e: CalEntry) => (!!e.end && new Date(e.end).getTime() - new Date(e.start).getTime() > 16 * 36e5) || (!e.end && hm(e.start) < startHour);
  const allDay = entries.filter(long);
  const timed = entries.filter(e => !long(e));
  async function drop(day: string, y: number) {
    if (!drag) return; const hour = Math.max(startHour, Math.min(endHour - 1, startHour + Math.round((y / rowH) * 2) / 2));
    const local = new Date(`${day}T${String(Math.floor(hour)).padStart(2, "0")}:${hour % 1 ? "30" : "00"}:00`);
    const r = await run(() => rescheduleEntry(drag.layer, drag.sourceId, local.toISOString()), { refresh: true });
    if (r.ok && r.data && !r.data.allowed) setImpact(r.data); setDrag(null);
  }
  const select = (id: string) => { const p = new URLSearchParams(params.toString()); p.set("sel", id); router.push(`${pathname}?${p}`, { scroll: false }); };
  return <div className="tg" style={{ ["--cols" as string]: days.length }}>
    <div className="tg-head"><div className="tg-tz">GMT+1</div>{days.map(d => { const dt = new Date(`${d}T12:00:00Z`); return <div key={d} className={`tg-day-h ${d === today ? "today" : ""}`}><span>{dt.toLocaleString("en-GB", { weekday: "short", timeZone: "UTC" })}</span>{d === today ? <b className="tg-today">{dt.getUTCDate()}</b> : <b>{dt.getUTCDate()} {dt.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}</b>}</div>; })}</div>
    {allDay.length > 0 && <div className="tg-allday"><div className="tg-tz">All day</div>{days.map(d => <div key={d} className="tg-ad-col">{allDay.filter(e => ymd(e.start) <= d && ymd(e.end ?? e.start) >= d).slice(0, 4).map(e => <button key={e.id} className="tg-ad" style={{ ["--c" as string]: colors[e.layer] }} onClick={() => router.push(e.href)} title={e.title}>{e.title}{e.sub ? ` · ${e.sub.split(" · ")[0]}` : ""}</button>)}</div>)}</div>}
    <div className="tg-body" style={{ height: (endHour - startHour) * rowH + 10, paddingTop: 10 }}>
      <div className="tg-hours">{Array.from({ length: endHour - startHour }, (_, i) => <span key={i} style={{ top: 10 + i * rowH }}>{String(startHour + i).padStart(2, "0")}:00</span>)}</div>
      {days.map(d => <div key={d} className={`tg-col ${d === today ? "today" : ""}`} onDragOver={e => { if (drag) e.preventDefault(); }} onDrop={e => { e.preventDefault(); void drop(d, e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top); }}>
        {Array.from({ length: endHour - startHour }, (_, i) => <i key={i} className="tg-line" style={{ top: 10 + i * rowH }} />)}
        {timed.filter(e => ymd(e.start) === d).map((e, i, arr) => {
          const top = 10 + Math.max(0, (hm(e.start) - startHour) * rowH); const end = e.end && ymd(e.end) === d ? hm(e.end) : e.end ? endHour : hm(e.start) + (e.layer === "events" ? 3 : 1);
          const h = Math.max(30, (Math.min(endHour, end) - Math.max(startHour, hm(e.start))) * rowH - 3);
          const overlap = arr.filter(o => Math.abs(hm(o.start) - hm(e.start)) < 1).length; const idx = arr.filter(o => Math.abs(hm(o.start) - hm(e.start)) < 1).indexOf(e);
          return <button key={e.id} className={`tg-item ${selected === e.id ? "sel" : ""} ${e.layer === "events" ? "ev" : ""}`} style={{ top, height: h, ["--c" as string]: colors[e.layer], left: `calc(${(100 / overlap) * idx}% + 3px)`, width: `calc(${100 / overlap}% - 6px)` }} draggable onDragStart={() => setDrag(e)} onDragEnd={() => setDrag(null)} onClick={() => (e.layer === "events" ? select(e.id) : router.push(e.href))} title={`${e.title} · ${fmt(e.start)}`} aria-label={`${e.title} at ${fmt(e.start)}`}>
            <b>{e.title}</b><small>{fmt(e.start)}{e.end && ymd(e.end) === d ? ` – ${fmt(e.end)}` : ""}</small>{h > 70 && e.sub && <small>{e.sub}</small>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {e.image && h > 110 && <img src={e.image || "/assets/gd/oe-neon.webp"} alt="" />}
          </button>; })}
      </div>)}
    </div>
    <Dialog open={!!impact} onClose={() => setImpact(null)} title={impact?.title ?? ""} sub="Nothing was changed. Review the impact before rescheduling." footer={<><button className="k-btn ghost" onClick={() => setImpact(null)}>Keep current date</button>{impact?.href && <Link className="k-btn primary" href={impact.href}>Open event to reschedule</Link>}</>}>
      <ul className="k-col" style={{ gap: 8, padding: 0, margin: 0, listStyle: "none" }}>{impact?.lines.map(l => <li key={l} className="k-row" style={{ alignItems: "flex-start", gap: 8 }}><AlertTriangle size={15} className="k-amber" style={{ marginTop: 2 }} /><span className="k-small" style={{ color: "var(--k-ink-2)" }}>{l}</span></li>)}</ul>
    </Dialog>
  </div>;
}
export type { LayerKey };
export { Layers as LayersIcon };
