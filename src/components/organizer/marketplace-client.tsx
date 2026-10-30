"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useRef } from "react";
import { Search, SlidersHorizontal, MapPin, ChevronRight, CalendarDays, Star } from "lucide-react";
import { Dialog, MapView, Menu } from "@/components/kit/client";
import type { MapBounds } from "@/components/kit/map-view";
import { useQueryNav } from "./events-client";

export function MarketFilters({ tab, categories }: { tab: "venues" | "services"; categories: string[] }) {
  const { set, params, pending } = useQueryNav(); const [q, setQ] = useState(params.get("q") ?? ""); const [more, setMore] = useState(false);
  const sel = (key: string, label: string, opts: { v: string; l: string }[]) => <select className="k-select mk-filter" value={params.get(key) ?? "all"} onChange={e => set({ [key]: e.target.value })} aria-label={label}><option value="all">{label}</option>{opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>;
  const chk = (key: string, label: string) => <label className="mk-check"><input type="checkbox" checked={params.get(key) === "1"} onChange={e => set({ [key]: e.target.checked ? "1" : null })} />{label}</label>;
  return <div className="mk-filters" aria-busy={pending}>
    <form className="k-input-icon mk-search" role="search" onSubmit={e => { e.preventDefault(); set({ q }); }}><Search size={15} /><input className="k-input" placeholder={`Search ${tab}...`} value={q} onChange={e => setQ(e.target.value)} aria-label={`Search ${tab}`} /></form>
    {sel("city", "Location", [{ v: "london", l: "London" }, { v: "manchester", l: "Manchester" }, { v: "surrey", l: "Surrey" }, { v: "birmingham", l: "Birmingham" }])}
    {tab === "venues" ? sel("cap", "Capacity", [{ v: "200", l: "200+" }, { v: "500", l: "500+" }, { v: "1000", l: "1,000+" }, { v: "2000", l: "2,000+" }, { v: "5000", l: "5,000+" }]) : sel("cat", "Category", categories.map(c => ({ v: c, l: c })))}
    {sel("price", "Price", [{ v: "1000", l: "Up to £1,000" }, { v: "2500", l: "Up to £2,500" }, { v: "5000", l: "Up to £5,000" }, { v: "10000", l: "Up to £10,000" }])}
    {tab === "venues" && sel("cat", "Venue type", categories.map(c => ({ v: c, l: c })))}
    {sel("resp", "Response time", [{ v: "2", l: "Within 2h" }, { v: "4", l: "Within 4h" }, { v: "12", l: "Within 12h" }, { v: "24", l: "Within 24h" }])}
    {chk("verified", "Verified only")}{chk("instant", "Instant book")}{tab === "services" && chk("emergency", "Emergency supply")}
    <button className="k-btn outline mk-more" onClick={() => setMore(true)}><SlidersHorizontal size={15} />More filters</button>
    <Dialog open={more} onClose={() => setMore(false)} title="More filters">
      <div className="k-col" style={{ gap: 12 }}>
        <label className="k-field"><span>Minimum rating</span><select className="k-select" defaultValue={params.get("rating") ?? ""} id="mf-rating"><option value="">Any</option><option value="4.5">4.5+</option><option value="4.7">4.7+</option><option value="4.9">4.9+</option></select></label>
        <label className="k-check"><input type="checkbox" id="mf-history" defaultChecked={params.get("history") === "1"} />Worked with before</label>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button className="k-btn ghost" onClick={() => { set({ rating: null, history: null }); setMore(false); }}>Clear</button><button className="k-btn primary" onClick={() => { set({ rating: (document.getElementById("mf-rating") as HTMLSelectElement).value || null, history: (document.getElementById("mf-history") as HTMLInputElement).checked ? "1" : null }); setMore(false); }}>Apply</button></div>
      </div>
    </Dialog>
  </div>;
}

export function TypeChips({ types }: { types: string[] }) {
  const { set, params } = useQueryNav(); const cur = params.get("cat") ?? "all";
  return <div className="k-pills mk-types">{["all", ...types].map(t => <button key={t} className="k-pill" aria-pressed={cur === t} onClick={() => set({ cat: t })}>{t === "all" ? "All types" : t}</button>)}</div>;
}

export function SortMenu({ value }: { value: string }) {
  const { set } = useQueryNav();
  const opts = [["recommended", "Recommended"], ["rating", "Highest rated"], ["price_asc", "Price: low to high"], ["price_desc", "Price: high to low"], ["capacity", "Largest capacity"], ["response", "Fastest response"]];
  return <label className="k-row k-small" style={{ gap: 8 }}><span className="k-muted">Sort by</span><select className="k-select" style={{ width: 170 }} value={value} onChange={e => set({ sort: e.target.value })}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
}

export function EventPicker({ events, current }: { events: { id: string; name: string; starts_at: string | null; cover_image: string }[]; current: string | null }) {
  const { set } = useQueryNav(); const e = events.find(x => x.id === current);
  return <Menu label="Choose event" width={280} trigger={({ toggle, open, id }) => <button className="mk-ctx" onClick={toggle} aria-expanded={open} aria-controls={id}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {e?.cover_image ? <img src={e.cover_image} alt="" /> : <span className="k-tile sm"><CalendarDays size={14} /></span>}
    <span className="k-grow"><small>For event</small><b className="k-ellipsis">{e?.name ?? "No event selected"}</b>{e?.starts_at && <small>{new Date(e.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</small>}</span></button>}>
    {close => <><button role="menuitem" className="k-menu-item" onClick={() => { close(); set({ event: null }); }}>No event (browse)</button>{events.map(x => <button key={x.id} role="menuitem" className="k-menu-item" onClick={() => { close(); set({ event: x.id }); }}>{x.name}</button>)}</>}
  </Menu>;
}

type Pin = { id: string; lat: number; lng: number; name: string; price: string; image: string; rating: number; reviews: number; capacity: number | null; href: string };
export function MarketMap({ pins, total, label, center }: { pins: Pin[]; total: number; label: string; center?: { lat: number; lng: number } }) {
  const [sel, setSel] = useState<string | null>(null); const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const [follow, setFollow] = useState(true); const followRef = useRef(true);
  // "Search as I move the map": the visible area becomes a bbox filter on the results (server-side), so the list matches the map.
  const onMoveEnd = (b: MapBounds) => { if (!followRef.current) return; const n = new URLSearchParams(sp.toString()); n.set("bbox", [b.south, b.west, b.north, b.east].map(v => v.toFixed(4)).join(",")); router.replace(`${pathname}?${n}`, { scroll: false }); };
  return <div className="mk-map">
    <MapView pins={pins.map(x => ({ id: x.id, lat: x.lat, lng: x.lng, label: x.name, price: x.price, href: x.href, image: x.image || "/assets/gd/covers/summer-sessions.webp", sub: [`★ ${x.rating.toFixed(1)} (${x.reviews})`, x.capacity ? `${x.capacity.toLocaleString()} capacity` : ""].filter(Boolean).join(" · ") }))} center={center} zoom={11} height="100%" selected={sel} onSelect={setSel} showPrices ariaLabel={`Map of ${label}`} onMoveEnd={onMoveEnd} />
    <label className="mk-map-move"><input type="checkbox" checked={follow} onChange={e => { followRef.current = e.target.checked; setFollow(e.target.checked); if (!e.target.checked && sp.get("bbox")) { const n = new URLSearchParams(sp.toString()); n.delete("bbox"); router.replace(`${pathname}${n.size ? `?${n}` : ""}`, { scroll: false }); } }} />Search as I move the map</label>
    <Link className="mk-map-all" href="?view=map">View {total} {label} in this area <ChevronRight size={14} /></Link>
  </div>;
}
