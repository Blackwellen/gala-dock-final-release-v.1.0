"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, CalendarCheck2, Check, Clock, ExternalLink, MapPin, Plus, Search, SlidersHorizontal, Star, Users, Zap } from "lucide-react";
import { Dialog, useAction } from "@/components/kit/client";
import { addToBuild } from "@/lib/actions/build";
import { replaceWith } from "@/lib/actions/build-extra";
import { searchProviders, type ProviderFilters, type ProviderSearch, type ProviderHit } from "@/lib/actions/provider-search";
import "@/styles/provider-finder.css";

const CATS: [string, string][] = [["venue", "Venue"], ["food", "Food & catering"], ["drinks", "Drinks & bar"], ["entertainment", "Entertainment"], ["media", "Photo & video"],
  ["styling", "Styling & décor"], ["staff", "Staff & security"], ["production", "Lighting & sound"], ["hire", "Hire & equipment"], ["transport", "Transport & stays"], ["extras", "Extras"]];
const SORTS: [NonNullable<ProviderFilters["sort"]>, string][] = [["recommended", "Recommended"], ["rating", "Highest rated"], ["reviews", "Most reviewed"], ["price_low", "Price: low to high"], ["price_high", "Price: high to low"], ["response", "Fastest reply"]];
const PRICES = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const AVAIL: Record<ProviderHit["availability"], [string, string] | null> = { available: ["ok", "Free on your date"], limited: ["warn", "Limited on your date"], unavailable: ["no", "Booked on your date"], unknown: null };

/**
 * "Add to your event": searches the marketplace for one build category with filters that matter for this event (free on the date,
 * fits the guest count, near the event, price, rating, verified, instant book). Add several to compare; nothing is booked.
 */
export function AddProvider({ eventId, category: initialCat, label, trigger, replaceId, initialOpen = false }: { eventId: string; category: string; label: string; trigger: "button" | "tile" | "link"; replaceId?: string; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return <>
    {trigger === "button" ? <button className="k-btn outline lg" onClick={() => setOpen(true)}><Plus size={16} />{label}</button>
      : trigger === "tile" ? <button className="cb-add-tile" aria-label={label} onClick={() => setOpen(true)}><Plus size={16} /></button>
      : <button className="k-link" onClick={() => setOpen(true)}>{label}</button>}
    <Dialog open={open} onClose={() => setOpen(false)} title={label} wide
      sub={replaceId ? "Pick a replacement. Your current option is kept as a backup. Nothing is booked until you confirm." : "Add a few options to compare. Nothing is booked until you confirm."}>
      {open && <Finder eventId={eventId} initialCat={initialCat} replaceId={replaceId} onDone={() => setOpen(false)} />}
    </Dialog>
  </>;
}

function Finder({ eventId, initialCat, replaceId, onDone }: { eventId: string; initialCat: string; replaceId?: string; onDone: () => void }) {
  const { run, pending } = useAction();
  const [cat, setCat] = useState(initialCat), [q, setQ] = useState(""), [f, setF] = useState<ProviderFilters>({ sort: "recommended" }), [page, setPage] = useState(0);
  const [res, setRes] = useState<ProviderSearch | null>(null), [doneKey, setDoneKey] = useState(""), [err, setErr] = useState(""), [more, setMore] = useState(false), [added, setAdded] = useState<Set<string>>(new Set());
  const key = JSON.stringify({ cat, q, f, page }), loading = doneKey !== key;
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => { void searchProviders(eventId, cat, { ...f, q, page }).then(r => { if (!live) return; setDoneKey(key); if (r.ok) { setRes(r.data); setErr(""); } else setErr(r.error); }); }, q ? 280 : 0);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, eventId]);
  const set = (p: Partial<ProviderFilters>) => { setF(x => ({ ...x, ...p })); setPage(0); };
  const toggle = (k: "availableOnly" | "fitsGuests" | "nearEvent" | "verified" | "instantBook") => set({ [k]: !f[k] });
  const ev = res?.event;
  const date = ev?.date ? new Date(ev.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : null;
  const active = ["availableOnly", "fitsGuests", "nearEvent", "verified", "instantBook"].filter(k => f[k as keyof ProviderFilters]).length + (f.maxPrice ? 1 : 0) + (f.minRating ? 1 : 0);
  const add = async (h: ProviderHit) => {
    const r = await run(() => (replaceId ? replaceWith(eventId, replaceId, h.id, cat) : addToBuild(eventId, h.id, cat)));
    if (r.ok) { if (replaceId) onDone(); else setAdded(s => new Set(s).add(h.id)); }
  };
  const chip = (k: "availableOnly" | "fitsGuests" | "nearEvent" | "verified" | "instantBook", icon: React.ReactNode, text: string, show = true) => show &&
    <button type="button" className={`pf-chip ${f[k] ? "on" : ""}`} aria-pressed={!!f[k]} onClick={() => toggle(k)}>{icon}{text}</button>;
  return <div className="pf">
    <div className="pf-bar">
      {!replaceId && <label className="pf-cat"><span className="sr-only">Category</span><select value={cat} onChange={e => { setCat(e.target.value); setPage(0); }} aria-label="Category">{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
      <label className="pf-search"><Search size={16} aria-hidden="true" /><input value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="Search by name, style or area" aria-label="Search providers" autoFocus /></label>
      <label className="pf-sort"><span className="sr-only">Sort</span><select value={f.sort} onChange={e => set({ sort: e.target.value as ProviderFilters["sort"] })} aria-label="Sort providers">{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <button type="button" className={`pf-more ${more ? "on" : ""}`} aria-expanded={more} onClick={() => setMore(m => !m)}><SlidersHorizontal size={15} />Filters{active > 0 && <b>{active}</b>}</button>
    </div>
    <div className="pf-chips" role="group" aria-label="Quick filters">
      {chip("availableOnly", <CalendarCheck2 size={14} />, date ? `Free on ${date}` : "Free on my date", !!ev?.date)}
      {chip("fitsGuests", <Users size={14} />, `Fits ${ev?.guests ?? ""} guests`, cat === "venue" && !!ev?.guests)}
      {chip("nearEvent", <MapPin size={14} />, `Near ${ev?.city || "my event"}`, !!ev?.city)}
      {chip("verified", <BadgeCheck size={14} />, "Verified")}
      {chip("instantBook", <Zap size={14} />, "Instant book")}
    </div>
    {more && <div className="pf-panel">
      <label><span>Max starting price</span><select value={f.maxPrice ?? ""} onChange={e => set({ maxPrice: e.target.value ? Number(e.target.value) : null })}><option value="">Any price</option>{PRICES.map(p => <option key={p} value={p}>Up to {gbp(p)}</option>)}</select></label>
      <label><span>Rating</span><select value={f.minRating ?? ""} onChange={e => set({ minRating: e.target.value ? Number(e.target.value) : null })}><option value="">Any rating</option><option value="4">4★ and up</option><option value="4.5">4.5★ and up</option><option value="4.8">4.8★ and up</option></select></label>
      {active > 0 && <button type="button" className="k-link" onClick={() => { setF({ sort: f.sort }); setPage(0); }}>Clear filters</button>}
    </div>}
    <p className="pf-summary" aria-live="polite">{loading && !res ? "Finding providers…" : err ? err : <>{res!.total} {res!.total === 1 ? "option" : "options"}{ev?.guests ? <> · {ev.guests} guests</> : null}{date ? <> · {date}</> : null}{ev?.city ? <> · {ev.city}</> : null}</>}</p>
    <div className={`pf-grid ${loading ? "busy" : ""}`}>
      {!res && loading && Array.from({ length: 6 }, (_, i) => <div key={i} className="pf-card sk" aria-hidden="true"><span className="pf-img" /><span className="pf-l" /><span className="pf-l s" /></div>)}
      {res?.hits.map(h => { const av = AVAIL[h.availability], isIn = h.added || added.has(h.id);
        return <article key={h.id} className="pf-card">
          <div className="pf-img">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={h.image || "/assets/gd/covers/summer-sessions.webp"} alt="" loading="lazy" />
            {av && <span className={`pf-avail ${av[0]}`}>{av[1]}</span>}{h.badge && !/avail/i.test(h.badge) && <span className="pf-badge">{h.badge}</span>}</div>
          <div className="pf-body">
            <div className="pf-title"><h3>{h.name}</h3>{h.verified && <BadgeCheck size={15} className="pf-ver" aria-label="Verified" />}</div>
            <p className="pf-meta">{h.review_count > 0 ? <><Star size={12} fill="#f59e0b" color="#f59e0b" aria-hidden="true" /><b>{h.rating.toFixed(1)}</b> ({h.review_count})</> : <span>New</span>}<span>·</span><span>{h.category}</span></p>
            <p className="pf-meta"><MapPin size={12} aria-hidden="true" />{h.city || h.location}{h.capacity_max ? <><span>·</span><Users size={12} aria-hidden="true" />{h.capacity_min ? `${h.capacity_min}–` : "Up to "}{h.capacity_max}</> : null}</p>
            <p className="pf-meta">{h.instant_book && <span className="pf-tag"><Zap size={11} />Instant book</span>}{h.response_hours != null && <span className="pf-tag"><Clock size={11} />Replies in {h.response_hours < 24 ? `${h.response_hours}h` : `${Math.round(h.response_hours / 24)}d`}</span>}</p>
            <div className="pf-price"><b>{h.price_from != null ? `From ${gbp(h.price_from)}` : "Price on request"}</b>{h.price_from != null && h.price_unit && <small>{h.price_unit}</small>}
              {h.estimate != null && /guest|person/.test(h.price_unit) && ev?.guests ? <small className="pf-est">≈ {gbp(h.estimate)} for {ev.guests} guests</small> : null}</div>
          </div>
          <div className="pf-acts">
            <Link className="k-btn outline sm" href={h.href} target="_blank" rel="noopener">View<ExternalLink size={12} /></Link>
            {h.tooSmall ? <button className="k-btn sm" disabled title={`Holds up to ${h.capacity_max} guests`}>Too small</button>
              : isIn ? <button className="k-btn sm pf-added" disabled><Check size={14} />Added</button>
              : <button className="k-btn primary sm" disabled={pending} onClick={() => void add(h)}>{replaceId ? "Choose" : h.availability === "unavailable" ? "Add anyway" : <><Plus size={14} />Add</>}</button>}
          </div>
        </article>; })}
    </div>
    {res && !res.hits.length && !loading && <div className="pf-empty"><b>No providers match.</b><span>Try fewer filters{q ? " or a different search" : ""}, or browse the whole marketplace.</span>
      {(active > 0 || q) && <button type="button" className="k-btn outline sm" onClick={() => { setF({ sort: f.sort }); setQ(""); setPage(0); }}>Clear search and filters</button>}</div>}
    <div className="pf-foot">
      {res?.more ? <button type="button" className="k-btn outline" disabled={loading} onClick={() => setPage(p => p + 1)}>Show more</button> : <span />}
      {added.size > 0 && !replaceId && <span className="pf-done"><Check size={14} />{added.size} added to compare<button type="button" className="k-btn primary sm" onClick={onDone}>Done</button></span>}
      <Link className="k-link" href={`/discover?tab=${cat === "venue" ? "venues" : "services"}&results=1`}>Browse the marketplace <ArrowRight size={12} /></Link>
    </div>
  </div>;
}
