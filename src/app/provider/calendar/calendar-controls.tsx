"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SlidersHorizontal, Settings2, X } from "lucide-react";
import { useToast } from "@/components/ui";

import { PREFS_COOKIE, DEFAULT_PREFS, type CalendarPrefs } from "./prefs";

type Opt = { value: string; label: string };
const STATUSES = ["Confirmed", "Held", "Hold", "Standby", "In progress", "Completed", "Pending", "Emergency"];

/** "More filters": layers, status, venue/space, team member, text search and hiding past items. Applied through the URL so a
 *  filtered calendar can be bookmarked or shared with the team. */
export function MoreFilters({ layers, spaces, crew, active }: { layers: Opt[]; spaces: Opt[]; crew: Opt[]; active: number }) {
  const sp = useSearchParams(), router = useRouter(), pathname = usePathname();
  const [open, setOpen] = useState(false);
  const cur = (k: string) => sp.get(k) ?? "";
  const chosen = new Set((cur("layers") || layers.map(l => l.value).join(",")).split(",").filter(Boolean));
  const statuses = new Set(cur("status").split(",").filter(Boolean));
  const apply = (f: FormData) => {
    const n = new URLSearchParams(sp.toString());
    const ls = f.getAll("layer").map(String), st = f.getAll("st").map(String);
    const set = (k: string, v: string) => { if (v) n.set(k, v); else n.delete(k); };
    set("layers", ls.length && ls.length < layers.length ? ls.join(",") : "");
    set("status", st.join(",")); set("space", String(f.get("space") ?? "")); set("crew", String(f.get("crew") ?? ""));
    set("q", String(f.get("q") ?? "").trim().slice(0, 80)); set("hidepast", f.get("hidepast") ? "1" : "");
    router.push(`${pathname}${n.toString() ? `?${n}` : ""}`, { scroll: false }); setOpen(false);
  };
  const reset = () => { const n = new URLSearchParams(sp.toString()); for (const k of ["layers", "status", "space", "crew", "q", "hidepast"]) n.delete(k); router.push(`${pathname}${n.toString() ? `?${n}` : ""}`, { scroll: false }); setOpen(false); };
  return <>
    <button type="button" className="ws-btn outline sm" onClick={() => setOpen(true)} aria-haspopup="dialog"><SlidersHorizontal aria-hidden="true" />{active ? `Filters (${active})` : "More filters"}</button>
    {open && <div className="ws-dialog-backdrop" onClick={() => setOpen(false)}><form className="ws-dialog pcal-dlg" role="dialog" aria-modal="true" aria-label="Calendar filters" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); apply(new FormData(e.currentTarget)); }}>
      <div className="ws-dialog-head"><h2>Filter calendar</h2><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X aria-hidden="true" /></button></div>
      <fieldset className="pcal-fs"><legend>Show</legend><div className="pcal-checks">{layers.map(l => <label key={l.value}><input type="checkbox" name="layer" value={l.value} defaultChecked={chosen.has(l.value)} />{l.label}</label>)}</div></fieldset>
      <fieldset className="pcal-fs"><legend>Status</legend><div className="pcal-checks">{STATUSES.map(s => <label key={s}><input type="checkbox" name="st" value={s} defaultChecked={statuses.has(s)} />{s}</label>)}</div><small className="ws-muted">Leave all unticked to show every status.</small></fieldset>
      <div className="pcal-two">
        <label className="ws-field"><span>Venue or service</span><select name="space" defaultValue={cur("space")}><option value="">All venues &amp; services</option>{spaces.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label className="ws-field"><span>Team member</span><select name="crew" defaultValue={cur("crew")}><option value="">All team members</option>{crew.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      </div>
      <label className="ws-field"><span>Search</span><input name="q" defaultValue={cur("q")} maxLength={80} placeholder="Event, client or note" /></label>
      <label className="pcal-check"><input type="checkbox" name="hidepast" defaultChecked={cur("hidepast") === "1"} />Hide items that have already finished</label>
      <div className="ws-dialog-actions"><button type="button" className="ws-btn outline" onClick={reset}>Reset all</button><button className="ws-btn primary">Apply filters</button></div>
    </form></div>}
  </>;
}

/** "View settings": per-device display preferences, saved in a cookie so the server renders the calendar the same way. */
export function ViewSettings({ prefs }: { prefs: CalendarPrefs }) {
  const router = useRouter(), toast = useToast();
  const [open, setOpen] = useState(false), [p, setP] = useState(prefs);
  const save = () => {
    document.cookie = `${PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(p))}; path=/provider; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setOpen(false); toast("Calendar view saved"); router.refresh();
  };
  const row = (label: string, el: React.ReactNode) => <label className="pcal-set"><span>{label}</span>{el}</label>;
  return <>
    <button type="button" className="ws-btn outline sm" onClick={() => { setP(prefs); setOpen(true); }} aria-haspopup="dialog"><Settings2 aria-hidden="true" />View settings</button>
    {open && <div className="ws-dialog-backdrop" onClick={() => setOpen(false)}><form className="ws-dialog pcal-dlg" role="dialog" aria-modal="true" aria-label="Calendar view settings" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); save(); }}>
      <div className="ws-dialog-head"><h2>View settings</h2><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X aria-hidden="true" /></button></div>
      {row("Week starts on", <select value={p.weekStart} onChange={e => setP({ ...p, weekStart: e.target.value as CalendarPrefs["weekStart"] })}><option value="mon">Monday</option><option value="sun">Sunday</option></select>)}
      {row("Default view", <select value={p.defaultView} onChange={e => setP({ ...p, defaultView: e.target.value as CalendarPrefs["defaultView"] })}><option value="month">Month</option><option value="week">Week</option><option value="day">Day</option><option value="agenda">Agenda</option></select>)}
      {row("Show weekends in week view", <input type="checkbox" checked={p.weekends} onChange={e => setP({ ...p, weekends: e.target.checked })} />)}
      {row("Show summary figures", <input type="checkbox" checked={p.kpis} onChange={e => setP({ ...p, kpis: e.target.checked })} />)}
      {row("Compact rows", <input type="checkbox" checked={p.compact} onChange={e => setP({ ...p, compact: e.target.checked })} />)}
      <p className="ws-muted">Saved on this device. Notification preferences live in <Link href="/provider/settings?tab=notifications">Settings</Link>.</p>
      <div className="ws-dialog-actions"><button type="button" className="ws-btn outline" onClick={() => setP(DEFAULT_PREFS)}>Restore defaults</button><button className="ws-btn primary">Save view</button></div>
    </form></div>}
  </>;
}
