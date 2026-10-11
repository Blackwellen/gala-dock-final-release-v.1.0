"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Camera, Plus, Star, Trash2, Save } from "lucide-react";
import { useToast } from "@/components/ui";
import { savePhotos } from "../new/actions";

/** Venue photos: upload (public listing-media bucket), reorder, choose cover, remove. Compact mode is the preview card used in setup steps. */
export function PhotoManager({ venueId, initial, compact = false, title, badge }: { venueId: string | null; initial: string[]; compact?: boolean; title?: string; badge?: string }) {
  const router = useRouter(), toast = useToast();
  const [pending, start] = useTransition();
  const [photos, setPhotos] = useState(initial);
  const [cur, setCur] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const persist = (list: string[]) => { if (!venueId) return; start(async () => { const r = await savePhotos(venueId, list); toast(r.ok ? (r.message ?? "Saved") : r.error); if (r.ok) { setDirty(false); router.refresh(); } }); };
  const upload = async (files: FileList) => {
    if (!venueId) { toast("Save the venue details first, then add photos."); return; }
    setBusy(true);
    const added: string[] = [];
    for (const f of Array.from(files).slice(0, 12)) {
      const body = new FormData(); body.set("file", f);
      const res = await fetch("/api/listing-media", { method: "POST", body }); const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) added.push(j.url); else toast(j.error ?? `Couldn’t upload ${f.name}`);
    }
    setBusy(false);
    if (added.length) { const next = [...photos, ...added]; setPhotos(next); persist(next); }
  };
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= photos.length) return; const n = [...photos]; [n[i], n[j]] = [n[j], n[i]]; setPhotos(n); setDirty(true); };
  const input = <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ""; }} />;

  if (compact) return <section className="ws-panel vw-preview">
    <div className="vw-preview-head"><h2>{title ?? "Venue preview"}</h2>{badge && <span>{badge}</span>}</div>
    <div className="vw-photo">{/* eslint-disable-next-line @next/next/no-img-element */}
      {photos[cur] ? <img src={photos[cur]} alt="" /> : <span className="vw-nophoto"><Camera aria-hidden="true" />No photos yet</span>}
      {photos.length > 1 && <><button type="button" className="prev" aria-label="Previous photo" onClick={() => setCur(c => (c - 1 + photos.length) % photos.length)}><ChevronLeft aria-hidden="true" /></button>
        <button type="button" className="next" aria-label="Next photo" onClick={() => setCur(c => (c + 1) % photos.length)}><ChevronRight aria-hidden="true" /></button></>}
      <button type="button" className="vw-change" onClick={() => file.current?.click()} disabled={busy}><Camera aria-hidden="true" />{busy ? "Uploading…" : photos.length ? "Change cover" : "Add photos"}</button>
      {photos.length > 0 && <span className="vw-count">{cur + 1}/{photos.length}</span>}</div>
    <ul className="vw-thumbs">{photos.slice(0, 4).map((p, i) => <li key={p + i}><button type="button" className={i === cur ? "on" : ""} onClick={() => setCur(i)} aria-label={`Photo ${i + 1}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p} alt="" /></button></li>)}
      <li><button type="button" className="vw-add" aria-label="Add photos" onClick={() => file.current?.click()} disabled={busy}><Plus aria-hidden="true" /></button></li></ul>
    {input}
  </section>;

  return <section className="ws-panel vw-media"><div className="vw-media-head"><div><h2>Photos</h2><p>The first photo is your cover. Add at least 3 — setups, details and the space empty.</p></div>
    <div className="vw-media-acts"><button type="button" className="ws-btn outline sm" onClick={() => file.current?.click()} disabled={busy}><Plus aria-hidden="true" />{busy ? "Uploading…" : "Upload photos"}</button>
      <button type="button" className="ws-btn primary sm" disabled={!dirty || pending} onClick={() => persist(photos)}><Save aria-hidden="true" />Save order</button></div></div>
    {photos.length ? <ul className="vw-grid">{photos.map((p, i) => <li key={p + i} className={i === 0 ? "cover" : ""}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p} alt="" />{i === 0 && <em>Cover</em>}
      <div className="vw-tile-acts">
        <button type="button" aria-label="Move left" disabled={i === 0} onClick={() => move(i, -1)}><ChevronLeft aria-hidden="true" /></button>
        {i > 0 && <button type="button" aria-label="Make cover" onClick={() => { const n = [p, ...photos.filter((_, j) => j !== i)]; setPhotos(n); setDirty(true); }}><Star aria-hidden="true" /></button>}
        <button type="button" aria-label="Move right" disabled={i === photos.length - 1} onClick={() => move(i, 1)}><ChevronRight aria-hidden="true" /></button>
        <button type="button" aria-label="Remove photo" className="danger" onClick={() => { setPhotos(photos.filter((_, j) => j !== i)); setDirty(true); }}><Trash2 aria-hidden="true" /></button></div></li>)}</ul>
      : <button type="button" className="vw-drop" onClick={() => file.current?.click()}><Camera aria-hidden="true" /><b>Upload photos</b><small>PNG, JPG or WebP up to 10MB each</small></button>}
    {input}
  </section>;
}
