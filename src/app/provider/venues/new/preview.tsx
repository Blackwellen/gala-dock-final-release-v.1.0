"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ImagePlus, Plus, RefreshCw } from "lucide-react";

/** Venue preview card (W01 step 4 rail): the venue's own photos as a carousel, plus its marketplace chips. */
export function VenuePreview({ photos, name, chips, editHref, publicHref }: {
  photos: string[]; name: string; chips: { icon: React.ReactNode; label: string }[]; editHref: string; publicHref: string | null;
}) {
  const [i, setI] = useState(0);
  const n = photos.length, go = (d: number) => setI(x => (x + d + n) % n);
  return <section className="ws-panel vw-prev">
    <div className="vw-prev-h"><h2>Venue preview</h2>
      {publicHref ? <Link href={publicHref} target="_blank" className="ws-btn outline">View on marketplace<ChevronRight aria-hidden="true" /></Link>
        : <span className="ws-btn outline" aria-disabled="true" title="Publish the venue to see it on the marketplace">Not on marketplace yet</span>}</div>
    <div className="vw-prev-img">
      {n ? <img src={photos[i]} alt={`${name} photo ${i + 1} of ${n}`} /> : <span className="vw-prev-none">No photos yet</span>}
      {n > 1 && <><button type="button" className="prev" onClick={() => go(-1)} aria-label="Previous photo"><ChevronLeft aria-hidden="true" /></button>
        <button type="button" className="next" onClick={() => go(1)} aria-label="Next photo"><ChevronRight aria-hidden="true" /></button></>}
      <Link href={editHref} className="vw-prev-edit"><ImagePlus aria-hidden="true" />Edit images</Link>
      {n > 0 && <span className="vw-prev-count">{i + 1}/{n}</span>}
    </div>
    <b className="vw-prev-name">{name}</b>
    <ul className="vw-prev-chips">{chips.map(c => <li key={c.label}>{c.icon}{c.label}</li>)}</ul>
    <ul className="vw-prev-thumbs">{photos.slice(0, 5).map((p, k) => <li key={p}><button type="button" className={k === i ? "on" : ""} onClick={() => setI(k)} aria-label={`Show photo ${k + 1}`}><img src={p} alt="" /></button></li>)}
      <li><Link href={editHref} aria-label="Add photos"><Plus aria-hidden="true" /></Link></li></ul>
  </section>;
}

/** Re-runs the server readiness checks (the page re-reads the listing and listing_readiness RPC). */
export function RunCheck() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button type="button" className="ws-btn outline vw-run" disabled={busy} onClick={() => { setBusy(true); router.refresh(); setTimeout(() => setBusy(false), 800); }}>
    {busy ? <><RefreshCw aria-hidden="true" className="spin" />Checking</> : "Run check"}</button>;
}

/** Textarea with a live "n/max" counter, as in the designs. */
export function Counted({ name, max, defaultValue, rows, placeholder, label }: { name: string; max: number; defaultValue?: string; rows?: number; placeholder?: string; label?: string }) {
  const [n, setN] = useState((defaultValue ?? "").length);
  return <span className="vw-counted"><textarea name={name} maxLength={max} rows={rows} defaultValue={defaultValue} placeholder={placeholder} aria-label={label} onInput={e => setN(e.currentTarget.value.length)} />
    <small aria-hidden="true">{n}/{max}</small></span>;
}
