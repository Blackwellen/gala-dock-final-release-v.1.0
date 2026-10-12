"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Share2, Plus, Minus, Maximize2, ChevronRight, ChevronLeft } from "lucide-react";
import { useToast } from "@/components/ui";
import { publishListing, pauseListing } from "../../listings/actions";
import { VenueMap, type MapEl, type MapSpace } from "../_components/venue-map";
import { confirmDialog } from "@/lib/ui/dialogs";

export function ShareVenue({ path }: { path: string }) {
  const toast = useToast();
  return <button type="button" className="ws-btn outline" onClick={async () => {
    try { await navigator.clipboard.writeText(new URL(path, window.location.origin).toString()); toast("Link copied"); } catch { toast("Couldn’t copy the link"); }
  }}><Share2 aria-hidden="true" />Share</button>;
}

/** Published ⇄ paused. Publishing runs the readiness check; pausing never affects existing bookings. */
export function LiveToggle({ venueId, live }: { venueId: string; live: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast(), router = useRouter();
  return <div className="pv-live">
    <button type="button" role="switch" aria-checked={live} aria-label={live ? "Pause listing" : "Publish listing"} className={`pv-switch${live ? " on" : ""}`} disabled={pending}
      onClick={async () => {
        if (live && !(await confirmDialog({ title: "Pause this venue? It stops taking new requests; existing bookings are unaffected.", confirmLabel: "Pause" }))) return;
        start(async () => { // Going live from paused must clear the pause too, or the listing stays hidden (published but paused_at set).
        const r = live ? await pauseListing(venueId, true) : await (async () => { const u = await pauseListing(venueId, false); return u.ok ? publishListing(venueId) : u; })(); toast(r.ok ? (r.message ?? "Done") : r.error); if (r.ok) router.refresh(); });
      }}><i /></button>
    <span><b className={live ? "ok" : ""}>{live ? "Published" : "Not live"}</b><small>{live ? "Live on marketplace" : "Hidden from the marketplace"}</small></span>
  </div>;
}

/** Overview map: filter by indoor/outdoor, zoom, and pick a space from the strip to highlight it. */
export function OverviewMap({ elements, spaces, venueId }: { elements: MapEl[]; spaces: (MapSpace & { image: string })[]; venueId: string }) {
  const [filter, setFilter] = useState<"all" | "indoor" | "outdoor">("all");
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const shown = spaces.filter(s => filter === "all" || (filter === "indoor") === s.indoor);
  const indoor = spaces.filter(s => s.indoor).length;
  return <>
    <nav className="ws-tabs segment pv-mapfilter" aria-label="Filter spaces">
      {([["all", `All spaces (${spaces.length})`], ["indoor", `Indoor (${indoor})`], ["outdoor", `Outdoor (${spaces.length - indoor})`]] as const).map(([k, l]) =>
        <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{l}</button>)}
    </nav>
    <div className="pv-mapbox">
      {elements.length ? <VenueMap elements={elements} spaces={spaces} zoom={zoom} selected={sel} dim={id => !shown.some(s => s.id === id)} labelSize={24} />
        : <div className="pv-nomap"><b>No map yet</b><Link href={`/provider/venues/${venueId}?tab=spaces`} className="ws-link">Draw your venue map</Link></div>}
      {elements.length > 0 && <div className="pv-mapctl">
        <button type="button" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(2.5, +(z + 0.25).toFixed(2)))}><Plus aria-hidden="true" /></button>
        <button type="button" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(1, +(z - 0.25).toFixed(2)))}><Minus aria-hidden="true" /></button>
        <button type="button" aria-label="Reset view" onClick={() => { setZoom(1); setSel(null); }}><Maximize2 aria-hidden="true" /></button>
      </div>}
    </div>
    <div className="pv-strip">
      {offset > 0 && <button type="button" className="pv-strip-nav prev" aria-label="Previous spaces" onClick={() => setOffset(o => Math.max(0, o - 1))}><ChevronLeft aria-hidden="true" /></button>}
      <ul>{shown.slice(offset, offset + 4).map(s => <li key={s.id}>
        <button type="button" className={sel === s.id ? "on" : ""} aria-pressed={sel === s.id} onClick={() => setSel(v => v === s.id ? null : s.id)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.image ? <img src={s.image} alt="" /> : <span className="qb-noimg" />}
          <span><b>{s.name}</b><small>{s.capacity} capacity</small></span>
        </button></li>)}</ul>
      {offset + 4 < shown.length && <button type="button" className="pv-strip-nav" aria-label="More spaces" onClick={() => setOffset(o => o + 1)}><ChevronRight aria-hidden="true" /></button>}
    </div>
  </>;
}
