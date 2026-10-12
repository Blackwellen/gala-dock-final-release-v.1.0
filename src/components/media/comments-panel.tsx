"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, MessageSquare, RotateCcw, Trash2 } from "lucide-react";
import { addComment, deleteComment, listComments, resolveComment, type Comment } from "@/lib/media/collab";
import { confirmDialog } from "@/lib/ui/dialogs";

/**
 * Design comments (media spec §46): threads on a design, optionally pinned to a layer. Anyone who can open the design can comment;
 * editors and the author resolve; the owner is notified.
 */
export function CommentsPanel({ designId, canEdit, pageId, layer, onJump, onCount }: {
  designId: string; canEdit: boolean; pageId: string; layer: { id: string; name: string } | null;
  onJump: (pageId: string | null, layerId: string | null) => void; onCount: (open: number) => void;
}) {
  const [rows, setRows] = useState<Comment[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [pin, setPin] = useState(true);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const r = await listComments(designId);
    if (r.ok) { setRows(r.data!); onCount(r.data!.filter(c => !c.parent_id && !c.resolved).length); } else setErr(r.error);
  }, [designId, onCount]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const post = async (form: HTMLFormElement, parentId?: string) => {
    const body = String(new FormData(form).get("body") ?? "");
    setBusy(true); setErr("");
    const r = await addComment(designId, body, parentId ? { parentId } : pin && layer ? { pageId, layerId: layer.id } : { pageId });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    form.reset(); await load();
  };
  const threads = (rows ?? []).filter(c => !c.parent_id && (showResolved || !c.resolved));
  const replies = (id: string) => (rows ?? []).filter(c => c.parent_id === id);
  const when = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return <div className="st-comments">
    <form className="st-form" onSubmit={e => { e.preventDefault(); void post(e.currentTarget); }}>
      <label className="st-field"><span>Add a comment</span><textarea name="body" rows={3} maxLength={4000} required placeholder="Feedback, a question or a change request…" /></label>
      {layer && <label className="st-check"><input type="checkbox" checked={pin} onChange={e => setPin(e.target.checked)} />Pin to “{layer.name}”</label>}
      <button className="st-btn primary" disabled={busy}>{busy ? <Loader2 size={14} className="mk-spin" /> : <MessageSquare size={14} />}Comment</button>
    </form>
    <label className="st-check"><input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />Show resolved</label>
    {err && <p className="st-warn" role="alert">{err}</p>}
    {rows === null ? <p className="st-hint">Loading comments…</p> : !threads.length ? <p className="st-hint">{showResolved ? "No comments yet." : "No open comments."}</p> :
      <ol className="st-threads">{threads.map(c => <li key={c.id} className={c.resolved ? "resolved" : ""}>
        <div className="st-cmt">
          <b>{c.author}</b><small>{when(c.created_at)}{c.resolved ? " · resolved" : ""}</small>
          <p>{c.body}</p>
          <div className="st-row">
            {(c.layer_id || c.page_id) && <button className="st-link" onClick={() => onJump(c.page_id, c.layer_id)}>{c.layer_id ? "Show layer" : "Show page"}</button>}
            {(canEdit || c.mine) && <button className="st-icon sm" aria-label={c.resolved ? "Reopen" : "Resolve"} title={c.resolved ? "Reopen" : "Resolve"}
              onClick={async () => { const r = await resolveComment(c.id, !c.resolved); if (r.ok) await load(); else setErr(r.error); }}>{c.resolved ? <RotateCcw size={13} /> : <Check size={13} />}</button>}
            {c.mine && <button className="st-icon sm" aria-label="Delete comment" onClick={async () => { if (!(await confirmDialog({ title: "Delete this comment and its replies?", confirmLabel: "Delete", danger: true }))) return; const r = await deleteComment(c.id); if (r.ok) await load(); else setErr(r.error); }}><Trash2 size={13} /></button>}
          </div>
        </div>
        {replies(c.id).map(x => <div key={x.id} className="st-cmt reply"><b>{x.author}</b><small>{when(x.created_at)}</small><p>{x.body}</p>
          {x.mine && <button className="st-icon sm" aria-label="Delete reply" onClick={async () => { const r = await deleteComment(x.id); if (r.ok) await load(); else setErr(r.error); }}><Trash2 size={12} /></button>}</div>)}
        {!c.resolved && <form className="st-row" onSubmit={e => { e.preventDefault(); void post(e.currentTarget, c.id); }}>
          <input name="body" className="st-input" maxLength={4000} required placeholder="Reply…" aria-label={`Reply to ${c.author}`} /><button className="st-btn" disabled={busy}>Reply</button></form>}
      </li>)}</ol>}
  </div>;
}
