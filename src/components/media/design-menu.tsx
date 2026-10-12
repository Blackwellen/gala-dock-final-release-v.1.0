"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, MoreHorizontal, Trash2, Undo2, ExternalLink, Users } from "lucide-react";
import { archiveDesign, deriveDesign } from "@/lib/media/actions";
import { restoreDesign } from "@/lib/media/design-actions";
import { ShareToCommunity } from "./share-community";

/** Duplicate / delete for a design, from a library card or the editor top bar. Delete asks first; the library then offers Undo. */
export function DesignMenu({ id, title, library, inEditor = false, canEdit = true }: { id: string; title: string; library: string; inEditor?: boolean; canEdit?: boolean }) {
  const router = useRouter(); const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [sharing, setSharing] = useState(false), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState<"" | "copy" | "delete">(""), [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(false); setConfirm(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setConfirm(false); } };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const copy = async () => {
    setBusy("copy"); setErr(""); const r = await deriveDesign(id, "duplicate"); setBusy("");
    if (!r.ok) { setErr(r.error); return; }
    setOpen(false);
    const copyId = r.data?.[0]; if (inEditor && copyId) router.push(`/studio/${copyId}`); else router.refresh();
  };
  const remove = async () => {
    setBusy("delete"); setErr(""); const r = await archiveDesign(id); setBusy("");
    if (!r.ok) { setErr(r.error); return; }
    setOpen(false); router.push(`${library}?tab=designs&deleted=${id}`); router.refresh();
  };
  return <div className="dm" ref={ref} onClick={e => e.stopPropagation()}>
    <button type="button" className={inEditor ? "st-icon" : "dm-trigger"} aria-label={`More actions for ${title}`} aria-haspopup="menu" aria-expanded={open} onClick={e => { e.preventDefault(); setOpen(o => !o); setConfirm(false); }}><MoreHorizontal size={16} /></button>
    {open && <div className="dm-menu" role="menu">
      {!inEditor && <a role="menuitem" href={`/studio/${id}`}><ExternalLink size={14} aria-hidden="true" />Open</a>}
      <button type="button" role="menuitem" disabled={!!busy} onClick={copy}>{busy === "copy" ? <Loader2 size={14} className="mk-spin" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}Duplicate</button>
      {canEdit && <button type="button" role="menuitem" onClick={() => { setOpen(false); setSharing(true); }}><Users size={14} aria-hidden="true" />Share to community</button>}
      {canEdit && (confirm
        ? <div className="dm-confirm" role="alert"><p>Delete “{title}”? You can undo this from your library.</p>
            <div><button type="button" className="st-btn" onClick={() => setConfirm(false)}>Cancel</button><button type="button" className="st-btn danger" disabled={!!busy} onClick={remove}>{busy === "delete" && <Loader2 size={13} className="mk-spin" aria-hidden="true" />}Delete</button></div></div>
        : <button type="button" role="menuitem" className="danger" onClick={() => setConfirm(true)}><Trash2 size={14} aria-hidden="true" />Delete</button>)}
      {err && <p className="dm-err" role="alert">{err}</p>}
    </div>}
    {sharing && <ShareToCommunity designId={id} title={title} audience={library.startsWith("/provider") ? "provider" : "organiser"} onClose={() => setSharing(false)} />}
  </div>;
}

/** Banner after a delete, with Undo (restores the design within 30 days). */
export function DeletedBanner({ id, library }: { id: string; library: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  return <p className="dm-banner" role="status">{msg || "Design deleted."}
    {!msg && <button type="button" className="st-link" disabled={busy} onClick={async () => { setBusy(true); const r = await restoreDesign(id); setBusy(false); if (r.ok) { router.replace(`${library}?tab=designs`); router.refresh(); } else setMsg(r.error); }}>{busy ? <Loader2 size={13} className="mk-spin" aria-hidden="true" /> : <Undo2 size={13} aria-hidden="true" />}Undo</button>}
    <button type="button" className="st-link" aria-label="Dismiss" onClick={() => router.replace(`${library}?tab=designs`)}>×</button></p>;
}
