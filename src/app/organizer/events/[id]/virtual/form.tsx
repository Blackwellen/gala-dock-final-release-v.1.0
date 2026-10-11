"use client";

import { useState, useTransition } from "react";
import { saveVirtual } from "@/lib/virtual/actions";

type V = { provider: string; format: string; external_id: string | null; join_url: string | null; host_url: string | null; host_notes: string | null; timezone: string; capacity: number | null;
  ticket_required: boolean; opens_minutes_before: number; closes_minutes_after: number; recording_url: string | null; replay_available: boolean; replay_until: string | null };
const f: React.CSSProperties = { display: "grid", gap: 4, fontSize: 12.5, fontWeight: 600 };

export function VirtualForm({ eventId, initial, providers, formats }: { eventId: string; initial: V | null; providers: { key: string; label: string; status: string }[]; formats: [string, string][] }) {
  const [pending, start] = useTransition(); const [msg, setMsg] = useState(""), [err, setErr] = useState(""), [provider, setProvider] = useState(initial?.provider ?? "manual");
  const p = providers.find(x => x.key === provider);
  return <form className="mk-form" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}
    action={fd => start(async () => { setMsg(""); setErr(""); const r = await saveVirtual(eventId, fd); if (r.ok) setMsg("Saved."); else setErr(r.error); })}>
    <label style={f}>Format<select className="k-input" name="format" defaultValue={initial?.format ?? "virtual"}>{formats.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    <label style={f}>Platform<select className="k-input" name="provider" value={provider} onChange={e => setProvider(e.target.value)}>{providers.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
    {p?.status === "blocked_external_configuration" && <p className="mk-note warn" style={{ gridColumn: "1/-1" }}>Automatic {p.label} set-up isn’t connected yet — paste the session links from {p.label} below.</p>}
    <label style={{ ...f, gridColumn: "1/-1" }}>Attendee join link<input className="k-input" name="join_url" type="url" placeholder="https://" defaultValue={initial?.join_url ?? ""} /></label>
    <label style={f}>Host / producer link (private)<input className="k-input" name="host_url" type="url" placeholder="https://" defaultValue={initial?.host_url ?? ""} /></label>
    <label style={f}>Meeting / stream ID<input className="k-input" name="external_id" defaultValue={initial?.external_id ?? ""} /></label>
    <label style={{ ...f, gridColumn: "1/-1" }}>Host notes (private — passcodes, run of show)<textarea className="k-input" name="host_notes" rows={2} maxLength={2000} defaultValue={initial?.host_notes ?? ""} style={{ height: "auto" }} /></label>
    <label style={f}>Opens (minutes before start)<input className="k-input" name="opens_minutes_before" type="number" min={0} max={1440} defaultValue={initial?.opens_minutes_before ?? 30} /></label>
    <label style={f}>Closes (minutes after end)<input className="k-input" name="closes_minutes_after" type="number" min={0} max={10080} defaultValue={initial?.closes_minutes_after ?? 120} /></label>
    <label style={f}>Online capacity<input className="k-input" name="capacity" type="number" min={1} defaultValue={initial?.capacity ?? ""} /></label>
    <label style={f}>Timezone<input className="k-input" name="timezone" defaultValue={initial?.timezone ?? "Europe/London"} /></label>
    <label style={{ ...f, gridColumn: "1/-1" }}>Recording / replay link<input className="k-input" name="recording_url" type="url" placeholder="https://" defaultValue={initial?.recording_url ?? ""} /></label>
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}><input type="checkbox" name="replay_available" defaultChecked={initial?.replay_available ?? false} />Ticket holders can watch the replay</label>
    <label style={f}>Replay available until<input className="k-input" name="replay_until" type="datetime-local" defaultValue={initial?.replay_until ? initial.replay_until.slice(0, 16) : ""} /></label>
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}><input type="checkbox" name="ticket_required" defaultChecked={initial?.ticket_required ?? true} />Ticket required to join</label>
    <div style={{ gridColumn: "1/-1", display: "flex", gap: 10, alignItems: "center" }}><button className="mk-btn primary" disabled={pending}>{pending ? "Saving…" : "Save online session"}</button>
      {msg && <span role="status" className="mk-note">{msg}</span>}{err && <span role="alert" className="mk-error">{err}</span>}</div>
  </form>;
}
