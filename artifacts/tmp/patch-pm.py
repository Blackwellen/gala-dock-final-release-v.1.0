p = "src/app/provider/venues/_components/photo-manager.tsx"
s = open(p, encoding="utf8").read()
s = s.replace('import { ChevronLeft, ChevronRight, Camera, Plus, Star, Trash2, Save } from "lucide-react";',
              'import { ChevronLeft, ChevronRight, Camera, Plus, Star, Trash2, Save, CloudUpload } from "lucide-react";')
s = s.replace("export function PhotoManager({ venueId, initial, compact = false, title, badge, save }: { venueId: string | null; initial: string[]; compact?: boolean; title?: string; badge?: string;",
              "export function PhotoManager({ venueId, initial, compact = false, strip = false, title, badge, save }: { venueId: string | null; initial: string[]; compact?: boolean; strip?: boolean; title?: string; badge?: string;")
anchor = "  return <section className=\"ws-panel vw-media\">"
assert anchor in s
strip = '''  // Strip mode ("Service images & video" row in W03 step 1): drop zone + first four photos; every change saves immediately.
  if (strip) return <section className="ws-panel vw-strip"><h2>{title ?? "Service images & video"}</h2><p>Add photos to showcase your work. The first photo is your cover.</p>
    <div className="vw-strip-row">
      <div className="vw-strip-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); }}>
        <CloudUpload aria-hidden="true" /><span><b>Upload images</b> or drag and drop</span><small>JPG, PNG or WebP. Max 10MB each.</small>
        <button type="button" className="ws-btn outline" onClick={() => file.current?.click()} disabled={busy}>{busy ? "Uploading…" : "Upload files"}</button></div>
      <ul>{photos.slice(0, 4).map((p, i) => <li key={p + i}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p} alt={`Photo ${i + 1}`} />{i === 0 && <em><Star aria-hidden="true" />Cover</em>}
        <div className="vw-strip-acts">{i > 0 && <button type="button" aria-label="Make cover" disabled={pending} onClick={() => { const n = [p, ...photos.filter((_, j) => j !== i)]; setPhotos(n); persist(n); }}><Star aria-hidden="true" /></button>}
          <button type="button" aria-label="Remove photo" className="danger" disabled={pending} onClick={() => { const n = photos.filter((_, j) => j !== i); setPhotos(n); persist(n); }}><Trash2 aria-hidden="true" /></button></div></li>)}
        <li><button type="button" className="vw-strip-more" onClick={() => file.current?.click()} disabled={busy}><Plus aria-hidden="true" />{photos.length > 4 ? `+${photos.length - 4} more` : "Add more"}</button></li></ul>
    </div>{input}
  </section>;

'''
s = s.replace(anchor, strip + anchor)
open(p, "w", encoding="utf8").write(s)
print("ok")
