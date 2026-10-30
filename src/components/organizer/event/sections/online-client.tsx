"use client";
import { useState } from "react";
import { Plus, PenLine, Eye, EyeOff, UserPlus } from "lucide-react";
import { Chip } from "@/components/kit";
import { Dialog, useAction, useKitToast } from "@/components/kit/client";
import { saveVirtualSession, transitionVirtualSession, assignVirtualRole, revokeVirtualRole, setTierAttendanceMode, saveVirtualRecording, transitionVirtualRecording } from "@/lib/virtual/sessions";
import { revealSessionLinks, type SessionLinks } from "@/lib/events/online-actions";
import { ActionButton, toIso, toLocal, intOrNull } from "./s2-shared";

export type Session = { id: string; title: string; kind: string; track: string | null; parent_session_id: string | null; programme_item_id: string | null; starts_at: string; ends_at: string; status: string; provider: string;
  access: string; tier_ids: string[]; capacity: number | null; max_devices_per_attendee: number; opens_minutes_before: number; closes_minutes_after: number; captions: string; caption_languages: string[];
  sign_language: boolean; transcript: boolean; audio_description: boolean; accessibility_notes: string | null };
export type Role = { id: string; session_id: string; user_id: string; role: string; status: string; display_name: string | null; created_at: string; revoked_at: string | null };
export type Recording = { id: string; session_id: string; title: string; source: string; status: string; audience: string; access_from: string | null; access_until: string | null; captions: boolean; created_at: string };
type Opt = { id: string; name: string };

const KINDS = [["main", "Main stage"], ["breakout", "Breakout"], ["workshop", "Workshop"], ["webinar", "Webinar"], ["live_audio", "Live audio"], ["podcast", "Podcast"], ["remote", "Remote"], ["replay", "Replay"]] as const;
const PROVIDERS = [["manual", "Any platform (paste links)"], ["zoom", "Zoom"], ["teams", "Microsoft Teams"], ["google_meet", "Google Meet"], ["youtube_live", "YouTube Live"], ["vimeo", "Vimeo"], ["streamyard", "StreamYard"], ["riverside", "Riverside"], ["spotify_live", "Spotify Live"], ["other", "Other"]] as const;
const ACCESS = [["ticket", "Ticket holders"], ["registration", "Approved registrations"], ["ticket_or_registration", "Tickets or registrations"], ["invite_only", "Invited roles only"]] as const;
const CAPTIONS = [["none", "None"], ["live_human", "Live (human)"], ["live_auto", "Live (automatic)"], ["post_event", "After the event"]] as const;
const NEXT: Record<string, [string, string][]> = { draft: [["scheduled", "Schedule"], ["cancelled", "Cancel"]], scheduled: [["live", "Go live"], ["ended", "End"], ["draft", "Back to draft"], ["cancelled", "Cancel"]],
  live: [["ended", "End session"], ["cancelled", "Cancel"]], ended: [["live", "Resume live"], ["archived", "Archive"]], cancelled: [["scheduled", "Reschedule"], ["archived", "Archive"]], archived: [] };
const LINKS = [["join_url", "Attendee join link"], ["speaker_url", "Speaker / backstage link"], ["host_url", "Host link"]] as const;

type F = { title: string; kind: string; track: string; parent: string; programme: string; starts: string; ends: string; draft: boolean; provider: string; meeting: string; access: string; tiers: string[];
  capacity: string; devices: string; before: string; after: string; captions: string; langs: string; sign: boolean; transcript: boolean; ad: boolean; notes: string; join_url: string; speaker_url: string; host_url: string; host_note: string };

export function SessionButton({ eventId, session, tiers, programme, sessions, primary }: { eventId: string; session?: Session; tiers: Opt[]; programme: Opt[]; sessions: Opt[]; primary?: boolean }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false); const [touched, setTouched] = useState<Set<string>>(new Set());
  const init = (): F => ({ title: session?.title ?? "", kind: session?.kind ?? "main", track: session?.track ?? "", parent: session?.parent_session_id ?? "", programme: session?.programme_item_id ?? "", starts: toLocal(session?.starts_at), ends: toLocal(session?.ends_at),
    draft: false, provider: session?.provider ?? "manual", meeting: "", access: session?.access ?? "ticket", tiers: session?.tier_ids ?? [], capacity: session?.capacity ? String(session.capacity) : "", devices: String(session?.max_devices_per_attendee ?? 1),
    before: String(session?.opens_minutes_before ?? 15), after: String(session?.closes_minutes_after ?? 30), captions: session?.captions ?? "none", langs: (session?.caption_languages ?? []).join(", "), sign: session?.sign_language ?? false,
    transcript: session?.transcript ?? false, ad: session?.audio_description ?? false, notes: session?.accessibility_notes ?? "", join_url: "", speaker_url: "", host_url: "", host_note: "" });
  const [f, setF] = useState<F>(init);
  const up = (p: Partial<F>, key?: string) => { setF(x => ({ ...x, ...p })); if (key) setTouched(t => new Set(t).add(key)); };
  const badLink = LINKS.some(([k]) => f[k] && !/^https:\/\/\S+$/.test(f[k].trim()));
  const save = async () => {
    // Secret links are sent only when typed (or explicitly cleared) so editing the schedule never wipes them.
    const secrets = Object.fromEntries((["join_url", "speaker_url", "host_url", "host_note", "meeting"] as const).filter(k => !session || touched.has(k)).map(k => [k === "host_note" ? "host_secret_note" : k === "meeting" ? "external_meeting_id" : k, f[k].trim()]));
    const body = { title: f.title, kind: f.kind, track: f.track, starts_at: toIso(f.starts) ?? undefined, ends_at: toIso(f.ends) ?? undefined, ...(session ? {} : { status: f.draft ? "draft" : "scheduled" }), provider: f.provider,
      access: f.access, tier_ids: f.tiers, capacity: intOrNull(f.capacity), max_devices_per_attendee: Math.min(5, Math.max(1, Number(f.devices) || 1)), opens_minutes_before: Math.min(1440, Number(f.before) || 0), closes_minutes_after: Math.min(1440, Number(f.after) || 0),
      captions: f.captions, caption_languages: f.langs.split(",").map(s => s.trim().toLowerCase()).filter(s => s.length >= 2), sign_language: f.sign, transcript: f.transcript, audio_description: f.ad, accessibility_notes: f.notes,
      ...(f.programme ? { programme_item_id: f.programme } : {}), ...(f.parent ? { parent_session_id: f.parent } : {}), ...secrets };
    const r = await run(() => saveVirtualSession(eventId, body, session?.id), { success: session ? "Session saved." : "Session added." });
    if (r.ok) setOpen(false);
  };
  const tierToggle = (id: string, on: boolean) => up({ tiers: on ? [...f.tiers, id] : f.tiers.filter(t => t !== id) });
  return <>
    {session ? <button type="button" className="k-icon-btn" aria-label={`Edit ${session.title}`} title="Edit session" onClick={() => { setF(init()); setTouched(new Set()); setOpen(true); }}><PenLine size={14} /></button>
      : <button type="button" className="k-btn primary sm" onClick={() => { setF(init()); setTouched(new Set()); setOpen(true); }}><Plus size={14} />{primary ? "Add first session" : "Add session"}</button>}
    <Dialog wide open={open} onClose={() => setOpen(false)} title={session ? `Edit ${session.title}` : "Add online session"} sub="Times are in your browser's timezone."
      footer={<><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="k-btn primary" disabled={pending || !f.title.trim() || !f.starts || !f.ends || badLink} onClick={() => void save()}>Save session</button></>}>
      <div className="k-col" style={{ gap: 12 }}>
        <div className="k-grid k-g3">
          <label className="k-field" style={{ gridColumn: "span 2" }}><span>Title <b>*</b></span><input className="k-input" value={f.title} maxLength={200} onChange={e => up({ title: e.target.value })} /></label>
          <label className="k-field"><span>Kind</span><select className="k-select" value={f.kind} onChange={e => up({ kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="k-field"><span>Starts <b>*</b></span><input className="k-input" type="datetime-local" value={f.starts} onChange={e => up({ starts: e.target.value })} /></label>
          <label className="k-field"><span>Ends <b>*</b></span><input className="k-input" type="datetime-local" value={f.ends} onChange={e => up({ ends: e.target.value })} /></label>
          <label className="k-field"><span>Track</span><input className="k-input" value={f.track} maxLength={80} placeholder="e.g. Product" onChange={e => up({ track: e.target.value })} /></label>
          <label className="k-field"><span>Part of session</span><select className="k-select" value={f.parent} onChange={e => up({ parent: e.target.value })}><option value="">None (top level)</option>{sessions.filter(s => s.id !== session?.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="k-field"><span>Programme item</span><select className="k-select" value={f.programme} onChange={e => up({ programme: e.target.value })}><option value="">Not linked</option>{programme.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="k-field"><span>Platform</span><select className="k-select" value={f.provider} onChange={e => up({ provider: e.target.value })}>{PROVIDERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        </div>
        <fieldset className="ax-checks"><legend className="k-label">Links {session && <span className="k-muted">— leave empty to keep the saved link; type a new one to replace it</span>}</legend>
          <div className="k-grid k-g2" style={{ width: "100%" }}>
            {LINKS.map(([k, l]) => <label key={k} className="k-field"><span>{l}</span><input className="k-input" type="url" value={f[k]} placeholder={session ? "Unchanged" : "https://"} onChange={e => up({ [k]: e.target.value } as Partial<F>, k)} /></label>)}
            <label className="k-field"><span>Meeting ID</span><input className="k-input" value={f.meeting} maxLength={200} placeholder={session ? "Unchanged" : ""} onChange={e => up({ meeting: e.target.value }, "meeting")} /></label>
            <label className="k-field" style={{ gridColumn: "1 / -1" }}><span>Host note (private)</span><textarea className="k-textarea" value={f.host_note} maxLength={2000} placeholder={session ? "Unchanged" : "Passcodes, run notes…"} onChange={e => up({ host_note: e.target.value }, "host_note")} /></label>
          </div></fieldset>
        {badLink && <p className="k-xs k-red" style={{ margin: 0 }}>Links must start with https://.</p>}
        <div className="k-grid k-g3">
          <label className="k-field"><span>Who can join</span><select className="k-select" value={f.access} onChange={e => up({ access: e.target.value })}>{ACCESS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="k-field"><span>Capacity</span><input className="k-input" inputMode="numeric" value={f.capacity} placeholder="No limit" onChange={e => up({ capacity: e.target.value.replace(/\D/g, "") })} /></label>
          <label className="k-field"><span>Devices per attendee</span><select className="k-select" value={f.devices} onChange={e => up({ devices: e.target.value })}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <label className="k-field"><span>Opens (min before)</span><input className="k-input" inputMode="numeric" value={f.before} onChange={e => up({ before: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></label>
          <label className="k-field"><span>Closes (min after)</span><input className="k-input" inputMode="numeric" value={f.after} onChange={e => up({ after: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></label>
          {!session && <label className="k-check" style={{ alignSelf: "end" }}><input type="checkbox" checked={f.draft} onChange={e => up({ draft: e.target.checked })} />Save as draft</label>}
        </div>
        {(f.access === "ticket" || f.access === "ticket_or_registration") && tiers.length > 0 && <fieldset className="ax-checks"><legend className="k-label">Only these tiers (none = any online-entitled ticket)</legend>
          {tiers.map(t => <label key={t.id} className="k-check"><input type="checkbox" checked={f.tiers.includes(t.id)} onChange={e => tierToggle(t.id, e.target.checked)} />{t.name}</label>)}</fieldset>}
        <div className="k-grid k-g3">
          <label className="k-field"><span>Captions</span><select className="k-select" value={f.captions} onChange={e => up({ captions: e.target.value })}>{CAPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="k-field"><span>Caption languages</span><input className="k-input" value={f.langs} placeholder="en, cy" onChange={e => up({ langs: e.target.value })} /></label>
          <div className="k-col" style={{ gap: 6, justifyContent: "end" }}>
            <label className="k-check"><input type="checkbox" checked={f.sign} onChange={e => up({ sign: e.target.checked })} />Sign language</label>
            <label className="k-check"><input type="checkbox" checked={f.transcript} onChange={e => up({ transcript: e.target.checked })} />Transcript</label>
            <label className="k-check"><input type="checkbox" checked={f.ad} onChange={e => up({ ad: e.target.checked })} />Audio description</label></div>
        </div>
        <label className="k-field"><span>Accessibility notes (shown to attendees)</span><textarea className="k-textarea" value={f.notes} maxLength={1000} onChange={e => up({ notes: e.target.value })} /></label>
      </div>
    </Dialog>
  </>;
}

export function SessionTransitions({ session }: { session: Session }) {
  return <>{(NEXT[session.status] ?? []).map(([to, label]) => <ActionButton key={to} label={`${label}: ${session.title}`} className={`k-btn ${to === "live" ? "green" : "ghost"} sm`}
    run={reason => transitionVirtualSession(session.id, to as "draft" | "scheduled" | "live" | "ended" | "cancelled" | "archived", reason || undefined).then(r => (r.ok ? { ok: true, message: `Session ${to === "live" ? "is live" : to}.` } : r))}
    confirm={["ended", "cancelled", "archived"].includes(to) ? { title: `${label} “${session.title}”?`, text: "Attendance closes and unused join links stop working.", cta: label, danger: to === "cancelled" } : undefined}
    reason={to === "cancelled" ? { label: "Reason" } : undefined}>{label}</ActionButton>)}</>;
}

/** Links are fetched only when asked; each reveal is audited (virtual.host_links_viewed). */
export function LinksReveal({ sessionId }: { sessionId: string }) {
  const [links, setLinks] = useState<SessionLinks | null>(null); const [busy, setBusy] = useState(false); const toast = useKitToast();
  if (!links) return <div><button type="button" className="k-link" style={{ fontSize: 12 }} disabled={busy} onClick={async () => { setBusy(true); const r = await revealSessionLinks(sessionId).catch(() => ({ ok: false as const, error: "Network error." })); setBusy(false); if (r.ok && r.data) setLinks(r.data); else toast(r.error ?? "Could not load links.", "error"); }}><Eye size={12} /> Show join, speaker and host links</button> <span className="k-xs k-muted">(recorded in the audit log)</span></div>;
  return <div className="ax-links">
    {LINKS.map(([k, l]) => <div key={k}><span className="k-muted">{l}: </span>{links[k] ? <code className="ax-code">{links[k]}</code> : <span className="k-muted">not set</span>}</div>)}
    {links.external_meeting_id && <div><span className="k-muted">Meeting ID: </span><code className="ax-code">{links.external_meeting_id}</code></div>}
    {links.host_secret_note && <div><span className="k-muted">Host note: </span>{links.host_secret_note}</div>}
    <div><button type="button" className="k-link" style={{ fontSize: 12 }} onClick={() => setLinks(null)}><EyeOff size={12} /> Hide links</button></div>
  </div>;
}

export function RolesPanel({ sessionId, roles, canManage }: { sessionId: string; roles: Role[]; canManage: boolean }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false); const [f, setF] = useState({ email: "", role: "speaker", name: "" });
  const active = roles.filter(r => r.status === "active");
  const save = async () => { const r = await run(() => assignVirtualRole(sessionId, { email: f.email.trim(), role: f.role as "speaker", display_name: f.name.trim() || undefined }), { success: "Role assigned." }); if (r.ok) { setOpen(false); setF({ email: "", role: "speaker", name: "" }); } };
  return <div>
    <div className="k-between" style={{ gap: 8 }}><b className="k-xs k-strong">Speakers & hosts</b>{canManage && <button type="button" className="k-btn ghost sm" onClick={() => setOpen(true)}><UserPlus size={13} />Assign</button>}</div>
    {active.length ? <div className="ax-chips" style={{ marginTop: 4 }}>{active.map(r => <span key={r.id} className="k-row" style={{ gap: 4 }}><Chip tone={r.role === "speaker" ? "blue" : "purple"}>{r.role}: {r.display_name || "Gala Dock user"}</Chip>
      {canManage && <ActionButton label={`Revoke ${r.role} ${r.display_name ?? ""}`.trim()} className="k-btn ghost sm" run={() => revokeVirtualRole(r.id).then(x => (x.ok ? { ok: true, message: "Role revoked — their links stop working." } : x))} confirm={{ title: `Revoke this ${r.role}?`, text: "Their unused join links are revoked and any open attendance is closed.", cta: "Revoke", danger: true }}>Revoke</ActionButton>}</span>)}</div>
      : <p className="k-xs k-muted" style={{ margin: "4px 0 0" }}>{canManage ? "No speakers or hosts yet." : "No speakers or hosts yet. Owners and managers assign roles."}</p>}
    <Dialog open={open} onClose={() => setOpen(false)} title="Assign a session role" sub="Speakers get the backstage link; hosts, moderators and producers get the host link."
      footer={<><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="k-btn primary" disabled={pending || !/^\S+@\S+\.\S+$/.test(f.email)} onClick={() => void save()}>Assign</button></>}>
      <div className="k-grid k-g2">
        <label className="k-field"><span>Email <b>*</b></span><input className="k-input" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /><small>Must be an existing Gala Dock account.</small></label>
        <label className="k-field"><span>Role</span><select className="k-select" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}><option value="speaker">Speaker</option><option value="moderator">Moderator</option><option value="host">Host</option><option value="producer">Producer</option></select></label>
        <label className="k-field" style={{ gridColumn: "1 / -1" }}><span>Display name</span><input className="k-input" value={f.name} maxLength={120} onChange={e => setF({ ...f, name: e.target.value })} /></label>
      </div>
    </Dialog>
  </div>;
}

export function RecordingButton({ sessionId, sessionTitle, recording }: { sessionId: string; sessionTitle: string; recording?: Recording }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const init = () => ({ title: recording?.title ?? `${sessionTitle} (replay)`, src: recording?.source === "file" ? "file" : "url", url: "", path: "", audience: recording?.audience ?? "attendees", from: toLocal(recording?.access_from), until: toLocal(recording?.access_until), captions: recording?.captions ?? false, available: false });
  const [f, setF] = useState(init);
  const save = async () => {
    const body = { title: f.title, audience: f.audience as "attendees", access_from: toIso(f.from) ?? "", access_until: toIso(f.until) ?? "", captions: f.captions,
      ...(f.src === "url" ? (f.url.trim() ? { url: f.url.trim() } : {}) : (f.path.trim() ? { storage_path: f.path.trim() } : {})), ...(!recording && f.available ? { status: "available" as const } : {}) };
    const r = await run(() => saveVirtualRecording(sessionId, body, recording?.id), { success: recording ? "Recording updated." : "Recording added." });
    if (r.ok) setOpen(false);
  };
  const needSource = !recording && (f.src === "url" ? !/^https:\/\/\S+$/.test(f.url.trim()) : !f.path.trim());
  return <>
    {recording ? <button type="button" className="k-icon-btn" aria-label={`Edit recording ${recording.title}`} onClick={() => { setF(init()); setOpen(true); }}><PenLine size={13} /></button>
      : <button type="button" className="k-btn ghost sm" aria-label={`Add recording to ${sessionTitle}`} onClick={() => { setF(init()); setOpen(true); }}><Plus size={13} />Recording</button>}
    <Dialog open={open} onClose={() => setOpen(false)} title={recording ? "Edit recording" : "Add recording"} sub="Replays open only inside their access window and for the audience you choose; each view is logged."
      footer={<><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="k-btn primary" disabled={pending || !f.title.trim() || needSource || (f.src === "url" && !!f.url && !/^https:\/\/\S+$/.test(f.url.trim()))} onClick={() => void save()}>Save recording</button></>}>
      <div className="k-col" style={{ gap: 12 }}>
        <label className="k-field"><span>Title</span><input className="k-input" value={f.title} maxLength={200} onChange={e => setF({ ...f, title: e.target.value })} /></label>
        <div className="ax-seg" role="group" aria-label="Recording source"><button type="button" aria-pressed={f.src === "url"} onClick={() => setF({ ...f, src: "url" })}>Provider link</button><button type="button" aria-pressed={f.src === "file"} onClick={() => setF({ ...f, src: "file" })}>Private file</button></div>
        {f.src === "url" ? <label className="k-field"><span>Replay link {!recording && <b>*</b>}</span><input className="k-input" type="url" value={f.url} placeholder={recording ? "Unchanged" : "https://"} onChange={e => setF({ ...f, url: e.target.value })} /></label>
          : <label className="k-field"><span>File path in your workspace files {!recording && <b>*</b>}</span><input className="k-input" value={f.path} placeholder={recording ? "Unchanged" : "workspace-id/recordings/keynote.mp4"} onChange={e => setF({ ...f, path: e.target.value })} /><small>Upload the file to the event&apos;s workspace files first; it is served through the virus-scan gate with a 60-second link.</small></label>}
        <div className="k-grid k-g3">
          <label className="k-field"><span>Who can watch</span><select className="k-select" value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })}><option value="attendees">Ticket holders</option><option value="registered">Registered people</option><option value="session_attendees">Only people who attended live</option><option value="team">Event team only</option></select></label>
          <label className="k-field"><span>Available from</span><input className="k-input" type="datetime-local" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></label>
          <label className="k-field"><span>Available until</span><input className="k-input" type="datetime-local" value={f.until} onChange={e => setF({ ...f, until: e.target.value })} /></label>
        </div>
        <label className="k-check"><input type="checkbox" checked={f.captions} onChange={e => setF({ ...f, captions: e.target.checked })} />Has captions</label>
        {!recording && <label className="k-check"><input type="checkbox" checked={f.available} onChange={e => setF({ ...f, available: e.target.checked })} />Ready to watch now (otherwise it stays “processing”)</label>}
      </div>
    </Dialog>
  </>;
}

export function RecordingToggle({ recording }: { recording: Recording }) {
  if (recording.status === "withdrawn") return <ActionButton label={`Restore ${recording.title}`} className="k-btn ghost sm" run={() => transitionVirtualRecording(recording.id, "available").then(r => (r.ok ? { ok: true, message: "Recording restored." } : r))}>Restore</ActionButton>;
  return <>
    {recording.status === "processing" && <ActionButton label={`Publish ${recording.title}`} className="k-btn ghost sm" run={() => transitionVirtualRecording(recording.id, "available").then(r => (r.ok ? { ok: true, message: "Recording available." } : r))}>Make available</ActionButton>}
    <ActionButton label={`Withdraw ${recording.title}`} className="k-btn ghost sm" run={() => transitionVirtualRecording(recording.id, "withdrawn").then(r => (r.ok ? { ok: true, message: "Recording withdrawn." } : r))} confirm={{ title: "Withdraw this recording?", text: "Nobody can open the replay until you restore it.", cta: "Withdraw", danger: true }}>Withdraw</ActionButton>
  </>;
}

const MODES = [["", "Not set (legacy)"], ["in_person", "In person"], ["online", "Online"], ["hybrid", "Hybrid (both)"]] as const;
export function TierModes({ tiers, modes }: { tiers: (Opt & { quantity: number })[]; modes: Record<string, string> }) {
  const { run, pending } = useAction();
  return <div className="k-list" style={{ marginTop: 6 }}>{tiers.map(t => <div key={t.id} className="k-li ax-li">
    <div className="k-grow" style={{ minWidth: 0 }}><b className="k-small k-strong k-ellipsis">{t.name}</b><div className="k-xs k-muted">{t.quantity} tickets</div></div>
    <select className="k-select" style={{ width: 150 }} aria-label={`Attendance mode for ${t.name}`} disabled={pending} value={modes[t.id] ?? ""} onChange={e => void run(() => setTierAttendanceMode(t.id, (e.target.value || null) as "online" | null).then(r => (r.ok ? { ok: true, message: `${t.name}: ${MODES.find(m => m[0] === e.target.value)?.[1]}.` } : r)))}>
      {MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
  </div>)}</div>;
}
