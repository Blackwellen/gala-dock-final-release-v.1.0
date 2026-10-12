"use client";

import { useEffect, useState } from "react";
import { Loader2, Users, X } from "lucide-react";
import { publishTemplate } from "@/lib/media/actions";

const CATEGORIES = ["nightclub", "festival", "wedding", "birthday", "childrens_party", "conference", "corporate", "comedy", "concert", "theatre", "networking", "webinar", "private_party",
  "venue_hire", "catering", "menu", "drinks", "ticket_launch", "early_bird", "sold_out", "final_release", "event_day"];

/**
 * "Share to community" — publishes a design as a public template other Gala Dock users can use (they always get their own copy).
 * Event details become placeholders and private uploads are replaced with safe public copies (publishTemplate).
 * Used from the design ⋯ menu (library card and editor).
 */
export function ShareToCommunity({ designId, title, onClose }: { designId: string; title: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [err, setErr] = useState(""), [agree, setAgree] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  return <div className="sc-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="sc-dialog" role="dialog" aria-modal="true" aria-labelledby="sc-title">
      <div className="sc-head"><Users size={18} aria-hidden="true" /><h2 id="sc-title">Share to community</h2><button type="button" className="sc-x" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
      {done ? <><p className="sc-ok" role="status">Shared. Your template is now in the Community tab for every Gala Dock user.</p><button type="button" className="sc-btn primary" onClick={onClose}>Done</button></>
        : <form onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setErr("");
          const r = await publishTemplate(designId, { title: String(f.get("title") ?? ""), description: String(f.get("description") ?? ""), category: String(f.get("category") ?? "event_day"),
            tags: String(f.get("tags") ?? "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 10), visibility: "public" });
          setBusy(false); if (r.ok) setDone(true); else setErr(r.error); }}>
          <label><span>Template name</span><input name="title" defaultValue={title} required minLength={2} maxLength={120} /></label>
          <label><span>Description</span><textarea name="description" rows={2} maxLength={1000} placeholder="What it’s for, sizes, tips" /></label>
          <label><span>Category</span><select name="category" defaultValue="event_day">{CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</select></label>
          <label><span>Tags (comma separated)</span><input name="tags" maxLength={200} placeholder="poster, gold, elegant" /></label>
          <p className="sc-note">Your event’s details become placeholders and private uploads are replaced with public copies — no private data is shared. Others always get their own copy; your design never changes.</p>
          <label className="sc-check"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} required />I own or have the rights to everything in this design and agree to the Content &amp; Template Policy.</label>
          {err && <p className="sc-err" role="alert">{err}</p>}
          <div className="sc-acts"><button type="button" className="sc-btn" onClick={onClose}>Cancel</button><button className="sc-btn primary" disabled={busy || !agree}>{busy && <Loader2 size={14} className="mk-spin" />}Share to community</button></div>
        </form>}
    </div>
  </div>;
}
