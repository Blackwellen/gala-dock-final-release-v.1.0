"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Star, MapPin, CalendarDays, ImagePlus, Plus, X, ArrowRight, MoreHorizontal, Loader2, MessageSquare, Flag, Pencil, Trash2, FileText } from "lucide-react";
import { Menu, useAction, useKitToast } from "@/components/kit/client";
import { submitReview, deleteReview } from "@/lib/actions/reviews";
import { confirmDialog } from "@/lib/ui/dialogs";

type R = { overall: number; quality: number; communication: number; value: number; reliability: number };
const LABELS: [keyof R, string][] = [["overall", "Overall experience"], ["quality", "Quality"], ["communication", "Communication"], ["value", "Value for money"], ["reliability", "Reliability / Punctuality"]];
const WORD = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [hover, setHover] = useState(0); const v = hover || value;
  return <div className="rv-rate" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(0)}>
    {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""} — ${WORD[n]}`} className={n <= v ? "on" : ""} onMouseEnter={() => setHover(n)} onClick={() => onChange(n)}
      onKeyDown={e => { if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(5, value + 1)); } if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(1, value - 1)); } }} tabIndex={value === n || (!value && n === 1) ? 0 : -1}><Star size={20} /></button>)}
  </div>;
}

export function ReviewForm({ item, initial, draft }: { item: { id: string; title: string; image: string; location: string; date: string; category: string }; initial: { ratings: Partial<R>; body: string } | null; draft: boolean }) {
  const { run, pending } = useAction(); const toast = useKitToast(); const file = useRef<HTMLInputElement>(null);
  const [r, setR] = useState<R>({ overall: 0, quality: 0, communication: 0, value: 0, reliability: 0, ...(initial?.ratings ?? {}) } as R);
  const [body, setBody] = useState(initial?.body ?? ""); const [ok, setOk] = useState(!!initial);
  const [photos, setPhotos] = useState<{ path: string; url: string | null }[]>([]); const [uploading, setUploading] = useState(false);
  const makeDraft = () => {
    const o = r.overall || 5; const lines = [
      `We booked ${item.title} for our event on ${item.date}.`,
      o >= 4 ? "Overall it was a great experience and we'd happily book again." : o === 3 ? "Overall it was a decent experience with a few things to improve." : "Unfortunately it didn't meet our expectations.",
      r.quality ? (r.quality >= 4 ? "The quality was excellent." : "The quality could have been better.") : "",
      r.communication ? (r.communication >= 4 ? "Communication before the day was quick and clear." : "Communication was slower than we'd hoped.") : "",
      r.value ? (r.value >= 4 ? "Good value for money." : "Pricing felt a little high for what we received.") : "",
      r.reliability ? (r.reliability >= 4 ? "Everything was on time." : "Timings slipped a little on the day.") : "",
    ].filter(Boolean);
    setBody(lines.join(" ")); toast("Draft added — make it yours before submitting");
  };
  const drafted = useRef(false);
  useEffect(() => { if (draft && !initial && !drafted.current) { drafted.current = true; makeDraft(); } }); // eslint-disable-line react-hooks/exhaustive-deps
  const upload = async (files: FileList | null) => {
    if (!files?.length) return; setUploading(true);
    for (const f of [...files].slice(0, 5 - photos.length)) {
      const fd = new FormData(); fd.append("file", f); fd.append("purpose", "image");
      const res = await fetch("/api/uploads", { method: "POST", body: fd }).catch(() => null); const j = await res?.json().catch(() => null);
      if (!res?.ok || !j?.path) { toast(j?.error ?? "Upload failed", "error"); continue; }
      setPhotos(p => [...p, { path: j.path, url: j.url }]);
    }
    setUploading(false); if (file.current) file.current.value = "";
  };
  const missing = LABELS.some(([k]) => !r[k]);
  return <section id="write" className="ce-card rv-form">
    <h2>{initial ? "Edit your review" : "Review a completed booking"}</h2>
    <div className="rv-form-top">
      <div className="rv-item">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={item.image || "/assets/gd/oe-neon.webp"} alt="" /><span><b>{item.title}</b><small><MapPin size={13} />{item.location}</small><small><CalendarDays size={13} />{item.date}</small></span></div>
      {LABELS.map(([k, l]) => <div key={k} className="rv-dim"><span>{l}</span><Stars value={r[k]} onChange={n => setR(p => ({ ...p, [k]: n }))} label={l} /><small>{WORD[r[k]] || " "}</small></div>)}
    </div>
    <div className="k-between" style={{ marginTop: 14 }}><label htmlFor="rv-body" className="rv-label">Your review</label><button type="button" className="k-link rv-draft" onClick={makeDraft}><FileText size={13} />Start from a template</button></div>
    <span className="rv-ta"><textarea id="rv-body" value={body} maxLength={1000} onChange={e => setBody(e.target.value)} placeholder="Share your experience... What did you love? What could be improved? This helps other people plan their events." /><small>{body.length.toLocaleString()}/1,000</small></span>
    <div className="rv-photos"><button type="button" className="rv-add" onClick={() => file.current?.click()} disabled={uploading || photos.length >= 5}>{uploading ? <Loader2 size={16} className="k-spin" /> : <ImagePlus size={16} />}Add photos</button><small>You can add up to 5 photos.</small>
      <div className="rv-thumbs">{photos.map(p => <span key={p.path}>{p.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.url} alt="" /> : null}<button type="button" aria-label="Remove photo" onClick={() => setPhotos(x => x.filter(y => y.path !== p.path))}><X size={12} /></button></span>)}{photos.length > 0 && photos.length < 5 && <button type="button" className="rv-more" aria-label="Add another photo" onClick={() => file.current?.click()}><Plus size={18} /></button>}</div>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => void upload(e.target.files)} /></div>
    <div className="rv-submit"><label className="rv-confirm"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} />I confirm this review is based on my genuine experience and complies with the <Link href="/help?topic=review-policy">review policy</Link>.</label>
      <button className="k-btn primary rv-go" disabled={pending || missing || !ok || body.trim().length < 20} title={missing ? "Rate every category" : body.trim().length < 20 ? "Write at least 20 characters" : undefined} onClick={() => void run(() => submitReview({ item: item.id, ratings: r, body, photos: photos.map(p => p.path), confirm: ok }))}>{pending && <Loader2 size={15} className="k-spin" />}{initial ? "Save changes" : "Submit review"} <ArrowRight size={16} /></button></div>
  </section>;
}

export function ReviewRowMenu({ eventId, listingId }: { eventId: string; listingId: string | null }) {
  return <Menu label="Booking options" width={230} trigger={({ toggle, open, id }) => <button className="k-icon-btn rv-dots" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="Booking options"><MoreHorizontal size={18} /></button>}>{close => <>
    <Link role="menuitem" className="k-menu-item" href={`/account/events/${eventId}/messages${listingId ? `?listing=${listingId}` : ""}`} onClick={close}><MessageSquare size={14} />Message provider</Link>
    <Link role="menuitem" className="k-menu-item" href="/help?topic=booking-problem" onClick={close}><Flag size={14} />Report a problem</Link></>}</Menu>;
}
export function SubmittedMenu({ id, editable, compact }: { id: string; editable: boolean; compact?: boolean }) {
  const { run } = useAction();
  return <Menu label="Review options" width={200} trigger={({ toggle, open, id: mid }) => <button className={`k-icon-btn ${compact ? "rv-dots sm" : "rv-dots"}`} onClick={toggle} aria-expanded={open} aria-controls={mid} aria-label="Review options"><MoreHorizontal size={18} /></button>}>{close => <>
    {editable && <Link role="menuitem" className="k-menu-item" href={`/account/reviews?edit=${id}#write`} onClick={close}><Pencil size={14} />Edit review</Link>}
    <button role="menuitem" className="k-menu-item k-red" onClick={async () => { close(); if ((await confirmDialog({ title: "Delete this review? This can't be undone.", confirmLabel: "Delete", danger: true }))) void run(() => deleteReview(id)); }}><Trash2 size={14} />Delete review</button></>}</Menu>;
}
