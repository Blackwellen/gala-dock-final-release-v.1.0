"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Layers as LayersIcon, Loader2, MoreHorizontal, Upload, Users } from "lucide-react";
import { listElements, saveElement, updateElement, deleteElement, type DesignElement } from "@/lib/media/elements";
import { confirmDialog, promptDialog, alertDialog } from "@/lib/ui/dialogs";
import type { Layer } from "@/lib/media/document";

const KINDS = [["all", "All"], ["image", "Images"], ["gif", "GIFs"], ["svg", "SVG"], ["group", "Groups"]] as const;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg";
export const elementSrc = (path: string) => `/api/media/asset?path=${encodeURIComponent(path)}`;

/** Natural size of an uploaded image (SVGs without a size fall back to a square). */
const measure = (src: string) => new Promise<{ w: number; h: number }>(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth || 800, h: i.naturalHeight || 800 }); i.onerror = () => res({ w: 800, h: 800 }); i.src = src; });

async function uploadFile(f: File) {
  const fd = new FormData(); fd.set("file", f); fd.set("purpose", "element");
  const r = await fetch("/api/uploads", { method: "POST", body: fd }); const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Upload failed.");
  return j as { path: string; name: string };
}

/**
 * "My elements": people's own images, GIFs, SVGs and saved layer groups, reusable in any design. Upload (picker or drag-and-drop),
 * keep private or share with the team, save the current selection as an element, rename and remove.
 */
export function MyElements({ workspaceId, canEdit, selection, onInsertImage, onInsertGroup, preview, compact = false }: {
  workspaceId: string | null; canEdit: boolean; selection: Layer[];
  onInsertImage: (src: string, path: string, w: number, h: number, title: string) => void; onInsertGroup: (layers: Layer[], title: string) => void;
  preview: (layers: Layer[]) => ReactNode; compact?: boolean }) {
  const [list, setList] = useState<DesignElement[] | null>(null), [kind, setKind] = useState<(typeof KINDS)[number][0]>("all"), [q, setQ] = useState("");
  const [busy, setBusy] = useState(0), [err, setErr] = useState(""), [share, setShare] = useState(!!workspaceId), [drag, setDrag] = useState(false), [menu, setMenu] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const refresh = useCallback(() => listElements(workspaceId).then(r => { if (r.ok) setList(r.data ?? []); else setErr(r.error); }), [workspaceId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!menu) return; const off = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest(".me-menu, .me-more")) setMenu(null); }; document.addEventListener("pointerdown", off); return () => document.removeEventListener("pointerdown", off); }, [menu]);

  const upload = async (files: FileList | File[]) => {
    const fs = [...files].slice(0, 20); if (!fs.length) return; setErr(""); setBusy(n => n + fs.length);
    await Promise.all(fs.map(async f => {
      try {
        const u = await uploadFile(f); const ext = u.path.split(".").pop()!.toLowerCase();
        const { w, h } = await measure(elementSrc(u.path));
        const r = await saveElement({ kind: ext === "gif" ? "gif" : ext === "svg" ? "svg" : "image", title: f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120), path: u.path, width: w, height: h, workspaceId: share ? workspaceId : null });
        if (!r.ok) throw new Error(r.error);
      } catch (e) { setErr(`${f.name}: ${(e as Error).message}`); } finally { setBusy(n => n - 1); }
    }));
    void refresh();
  };
  const saveSelection = async () => {
    if (!selection.length) return;
    const r0 = await promptDialog({ title: "Save as element", message: `${selection.length} layer${selection.length > 1 ? "s" : ""} will be saved together so you can reuse them in any design.`, label: "Name", defaultValue: selection.length === 1 ? selection[0]!.name : "My element", maxLength: 120, required: true, confirmLabel: "Save element" });
    if (!r0) return;
    const minX = Math.min(...selection.map(l => l.x)), minY = Math.min(...selection.map(l => l.y));
    const layers = selection.map(l => ({ ...l, x: l.x - minX, y: l.y - minY }));
    const w = Math.max(...layers.map(l => l.x + l.w)), h = Math.max(...layers.map(l => l.y + l.h));
    setBusy(n => n + 1); const r = await saveElement({ kind: "group", title: r0.value, width: w, height: h, layers, workspaceId: share ? workspaceId : null }); setBusy(n => n - 1);
    if (!r.ok) setErr(r.error); else { setKind("group"); void refresh(); }
  };
  const insert = (e: DesignElement) => { if (e.kind === "group") onInsertGroup(e.data.layers ?? [], e.title); else if (e.path) onInsertImage(elementSrc(e.path), e.path, e.width, e.height, e.title); };
  const rename = async (e: DesignElement) => { setMenu(null); const r = await promptDialog({ title: "Rename element", label: "Name", defaultValue: e.title, maxLength: 120, required: true, confirmLabel: "Rename" }); if (!r) return; const u = await updateElement(e.id, { title: r.value }); if (u.ok) void refresh(); else void alertDialog({ title: "Couldn’t rename", message: u.error }); };
  const toggleShare = async (e: DesignElement) => { setMenu(null); const u = await updateElement(e.id, { shared: !e.shared, workspaceId }); if (u.ok) void refresh(); else void alertDialog({ title: "Couldn’t change sharing", message: u.error }); };
  const remove = async (e: DesignElement) => { setMenu(null); if (!(await confirmDialog({ title: `Remove “${e.title}”?`, message: e.shared ? "It will be removed from your team’s elements. Designs already using it keep their copy." : "Designs already using it keep their copy.", confirmLabel: "Remove", danger: true }))) return;
    const r = await deleteElement(e.id); if (r.ok) setList(l => l?.filter(x => x.id !== e.id) ?? null); else void alertDialog({ title: "Couldn’t remove", message: r.error }); };

  const term = q.trim().toLowerCase();
  const shown = (list ?? []).filter(e => (kind === "all" || e.kind === kind) && (!term || `${e.title} ${e.tags.join(" ")}`.toLowerCase().includes(term)));
  return <section className={`me ${drag ? "drag" : ""}`} aria-label="My elements"
    onDragOver={e => { if (canEdit && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true); } }} onDragLeave={() => setDrag(false)}
    onDrop={e => { if (canEdit && e.dataTransfer.files.length) { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files); } }}>
    <div className="me-head"><h3>My elements</h3>{busy > 0 && <Loader2 size={14} className="mk-spin" aria-label="Working" />}</div>
    {canEdit && <>
      <div className="me-actions">
        <button type="button" className="st-btn primary" onClick={() => input.current?.click()}><Upload size={14} />Upload</button>
        <button type="button" className="st-btn" disabled={!selection.length} onClick={() => void saveSelection()} title={selection.length ? "Save the selected layers as a reusable element" : "Select layers on the canvas first"}><LayersIcon size={14} />Save selection</button>
        <input ref={input} type="file" multiple hidden accept={ACCEPT} aria-label="Upload elements" onChange={e => { const f = e.target.files; if (f?.length) void upload(f); e.target.value = ""; }} />
      </div>
      {workspaceId && <label className="dk-check me-share"><input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} />Share new elements with my team</label>}
      {!compact && <p className="me-hint">PNG, JPG, WebP, GIF or SVG · up to 10MB · drop files here</p>}
    </>}
    {err && <p className="st-warn" role="alert">{err}</p>}
    {(list?.length ?? 0) > 0 && <>
      <input className="dk-in" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${list!.length} elements`} aria-label="Search my elements" />
      <div className="dk-tabs" role="tablist" aria-label="Element type">{KINDS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}</div>
    </>}
    {!list ? <p className="dk-cap">Loading…</p> : !list.length ? <p className="dk-cap">Nothing here yet. Upload logos, stickers, GIFs or SVGs, or select layers and choose Save selection.</p>
      : !shown.length ? <p className="dk-cap">No elements match.</p>
      : <div className="me-grid">{shown.map(e => <div key={e.id} className="me-item">
        <button type="button" className="me-tile" onClick={() => insert(e)} title={`Add “${e.title}”`} disabled={!canEdit}>
          {e.kind === "group" ? <span className="me-group">{preview(e.data.layers ?? [])}</span>
            /* eslint-disable-next-line @next/next/no-img-element */
            : <img src={elementSrc(e.path!)} alt={e.title} loading="lazy" />}
          {e.kind !== "image" && <i className="me-badge">{e.kind === "group" ? "Group" : e.kind.toUpperCase()}</i>}
          {e.shared && <Users size={12} className="me-shared" aria-label="Shared with team" />}
        </button>
        <span className="me-name" title={e.title}>{e.title}</span>
        {canEdit && <button type="button" className="me-more" aria-label={`Options for ${e.title}`} aria-expanded={menu === e.id} onClick={() => setMenu(menu === e.id ? null : e.id)}><MoreHorizontal size={14} /></button>}
        {menu === e.id && <div className="me-menu" role="menu" data-popover>
          <button type="button" role="menuitem" onClick={() => insert(e)}>Add to design</button>
          {e.mine && <button type="button" role="menuitem" onClick={() => void rename(e)}>Rename</button>}
          {e.mine && workspaceId && <button type="button" role="menuitem" onClick={() => void toggleShare(e)}>{e.shared ? "Make private" : "Share with team"}</button>}
          <button type="button" role="menuitem" className="danger" onClick={() => void remove(e)}>Remove</button>
        </div>}
      </div>)}</div>}
    {drag && <div className="me-drop">Drop to upload</div>}
  </section>;
}
