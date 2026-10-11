"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown, Plus, Image as ImageIcon, Megaphone, Link2, Rocket } from "lucide-react";
import { Menu } from "@/components/kit/client";

/** Date range + event scope pickers and the Create promotion split button. Filters live in the URL. */
export function HubFilters({ days, range, event, events }: { days: number; range: string; event: string; events: { id: string; name: string }[] }) {
  const router = useRouter(); const sp = useSearchParams();
  const set = (k: string, v: string) => { const u = new URLSearchParams(sp.toString()); if (v) u.set(k, v); else u.delete(k); router.push(`/organizer/tickets${u.size ? `?${u}` : ""}`); };
  return <div className="th-filters">
    <label className="th-range"><CalendarDays size={18} /><span><small>Last {days} days</small><b>{range}</b></span><select value={days} onChange={e => set("days", e.target.value === "30" ? "" : e.target.value)} aria-label="Date range">{[7, 30, 90, 365].map(d => <option key={d} value={d}>Last {d} days</option>)}</select><ChevronDown size={16} /></label>
    <label className="th-evsel"><select value={event} onChange={e => set("event", e.target.value)} aria-label="Event"><option value="">All events</option>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select><ChevronDown size={16} /></label>
    <div className="th-split"><Link className="k-btn primary" href="/organizer/promotions/new"><Plus size={17} />Create promotion</Link>
      <Menu label="More create options" width={220} trigger={({ toggle, open, id }) => <button className="k-btn primary th-caret" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="More create options"><ChevronDown size={16} /></button>}>{close => <>
        <Link role="menuitem" className="k-menu-item" href="/organizer/promotions/new" onClick={close}><Megaphone size={14} />Campaign</Link>
        <Link role="menuitem" className="k-menu-item" href={events[0] ? `/organizer/events/${event || events[0].id}/media` : "/organizer/events"} onClick={close}><ImageIcon size={14} />Poster or media</Link>
        <Link role="menuitem" className="k-menu-item" href="/organizer/tickets?tab=promoters" onClick={close}><Link2 size={14} />Promoter link</Link>
        <Link role="menuitem" className="k-menu-item" href="/organizer/promotions/new?type=boost" onClick={close}><Rocket size={14} />Directory boost</Link></>}</Menu></div>
  </div>;
}
