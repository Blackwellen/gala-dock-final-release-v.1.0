"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Flag } from "lucide-react";
import { createDesign, reportTemplate } from "@/lib/media/actions";
import { PRESETS } from "@/lib/media/document";

export function NewDesign({ workspaceId, events }: { workspaceId: string; events: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(""), [err, setErr] = useState(""), [eventId, setEventId] = useState(""), [custom, setCustom] = useState({ w: 1080, h: 1350 });
  const go = async (key: string, i: Omit<Parameters<typeof createDesign>[0], "workspaceId">) => {
    setBusy(key); setErr("");
    const r = await createDesign({ ...i, workspaceId, eventId: eventId || null });
    if (r.ok) router.push(`/studio/${r.data}`); else { setErr(r.error); setBusy(""); }
  };
  if (!open) return <button className="st-btn primary" onClick={() => setOpen(true)}><Plus size={15} />New design</button>;
  return <div className="st-pop" role="dialog" aria-label="New design" style={{ top: 80 }}>
    <div className="st-pop-head"><b>New design</b><button className="st-icon" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
    <label className="st-field"><span>Link to event (fills names, dates and the ticket QR)</span><select value={eventId} onChange={e => setEventId(e.target.value)}><option value="">No event</option>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
    {eventId && <button className="st-btn primary" disabled={!!busy} onClick={() => go("poster", { preset: "a3", fromEvent: true, title: "Event poster" })}>{busy === "poster" && <Loader2 size={14} className="mk-spin" />}Start from my event poster</button>}
    {["Print", "Social", "Event"].map(g => <div key={g}><h3 style={{ margin: "4px 0", fontSize: 11, textTransform: "uppercase", color: "#6a70b0" }}>{g}</h3>
      <div className="ml-sizes">{PRESETS.filter(p => p.group === g).map(p => <button key={p.id} disabled={!!busy} onClick={() => go(p.id, { preset: p.id })}><b>{p.label}</b><small>{p.w}×{p.h}</small></button>)}</div></div>)}
    <div className="st-row"><label className="st-field"><span>Width px</span><input type="number" min={50} max={8000} value={custom.w} onChange={e => setCustom(c => ({ ...c, w: Number(e.target.value) }))} /></label>
      <label className="st-field"><span>Height px</span><input type="number" min={50} max={8000} value={custom.h} onChange={e => setCustom(c => ({ ...c, h: Number(e.target.value) }))} /></label>
      <button className="st-btn" disabled={!!busy} onClick={() => go("custom", { width: custom.w, height: custom.h, title: "Custom design" })}>Custom size</button>
      <button className="st-btn" disabled={!!busy} onClick={() => go("transparent", { width: custom.w, height: custom.h, transparent: true, title: "Transparent design" })}>Transparent</button></div>
    {err && <p className="st-warn" role="alert">{err}</p>}
  </div>;
}

export function TemplateCard({ id, title, meta, workspaceId, community, children }: { id: string; title: string; meta: string; workspaceId: string; community: boolean; children: React.ReactNode }) {
  const router = useRouter(); const [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  return <div className="ml-card">
    <button style={{ all: "unset", cursor: "pointer", display: "grid", gap: 6 }} disabled={busy} onClick={async () => { setBusy(true); const r = await createDesign({ workspaceId, templateId: id, title }); if (r.ok) router.push(`/studio/${r.data}`); else { setMsg(r.error); setBusy(false); } }}>
      {children}<b>{busy ? "Opening…" : title}</b><small>{meta}</small></button>
    {community && <button className="st-icon sm" style={{ position: "absolute", top: 12, right: 12, background: "#fff" }} aria-label="Report template"
      onClick={async () => { const reason = prompt("Why are you reporting this template? (copyright, offensive, misleading, spam)"); if (!reason) return; const r = await reportTemplate(id, reason.slice(0, 40), ""); setMsg(r.ok ? "Thanks — our team will review it." : r.error); }}><Flag size={13} /></button>}
    {msg && <small role="status">{msg}</small>}
  </div>;
}
