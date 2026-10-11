"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setProviderCheckin, setProgrammeStatus, reportIncident, resolveIncident } from "@/lib/live/actions";

/** Keeps the live board fresh: re-reads server state every 20 seconds while the tab is visible. */
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 20_000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

function useRun() {
  const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => { setError(""); const r = await fn(); if (!r.ok) setError(r.error ?? "Error"); else { after?.(); router.refresh(); } });
  return { pending, error, run };
}

export function CheckinButtons({ itemId, status }: { itemId: string; status: string }) {
  const { pending, error, run } = useRun();
  const opts: [string, string][] = status === "checked_in" ? [] : [["checked_in", "Check in"], ["late", "Late"], ["absent", "Absent"]];
  return <span className="mk-row">{opts.map(([s, l]) => <button key={s} type="button" className={`mk-btn ${s === "checked_in" ? "primary" : s === "absent" ? "danger" : "ghost"}`} disabled={pending} onClick={() => run(() => setProviderCheckin(itemId, s))}>{l}</button>)}
    {error && <span className="mk-error">{error}</span>}</span>;
}

export function ProgrammeButtons({ eventId, itemId, status }: { eventId: string; itemId: string; status: string }) {
  const { pending, run } = useRun();
  const next: [typeof status, string][] = status === "in_progress" ? [["done", "Done"], ["delayed", "Delayed"]] : status === "done" ? [] : [["in_progress", "Start"], ["delayed", "Delayed"]];
  return <span className="mk-row">{next.map(([s, l]) => <button key={s} type="button" className={`mk-btn ${s === "in_progress" || s === "done" ? "primary" : "ghost"}`} disabled={pending}
    onClick={() => run(() => setProgrammeStatus(eventId, itemId, s as "in_progress" | "done" | "delayed"))}>{l}</button>)}</span>;
}

export function IncidentForm({ eventId }: { eventId: string }) {
  const { pending, error, run } = useRun(); const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="mk-btn danger" onClick={() => setOpen(true)}>Report an issue</button>;
  return <form className="mk-form" aria-label="Report an issue" action={f => run(() => reportIncident(eventId, String(f.get("title")), String(f.get("detail") ?? ""), String(f.get("severity")) as "low"), () => setOpen(false))}>
    <label className="mk-field"><span>What’s happening?</span><input name="title" required minLength={3} maxLength={140} autoFocus /></label>
    <label className="mk-field"><span>Severity</span><select name="severity" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
    <label className="mk-field wide"><span>Details</span><textarea name="detail" rows={2} maxLength={2000} /></label>
    <div className="mk-row wide"><button type="button" className="mk-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="mk-btn danger" disabled={pending}>{pending && <Loader2 size={14} className="mk-spin" aria-hidden="true" />}Log issue</button></div>
    {error && <p className="mk-error" role="alert">{error}</p>}
  </form>;
}

export function ResolveIncident({ eventId, id }: { eventId: string; id: string }) {
  const { pending, run } = useRun();
  return <button type="button" className="mk-btn ghost" disabled={pending} onClick={() => run(() => resolveIncident(eventId, id))}>Resolve</button>;
}

/** Provider-side self report (§86): en route / arrived, with an ETA. */
export function ProviderSelfCheckin({ itemId, status }: { itemId: string; status: string | null }) {
  const { pending, error, run } = useRun(); const [eta, setEta] = useState("");
  if (status === "checked_in") return <p className="mk-note">Checked in by the event team.</p>;
  return <div className="mk-row">
    {status !== "en_route" && status !== "arrived" && <><label className="mk-field" style={{ width: 120 }}><span>ETA (minutes)</span><input type="number" min={0} max={600} value={eta} onChange={e => setEta(e.target.value)} /></label>
      <button type="button" className="mk-btn ghost" disabled={pending} onClick={() => run(() => setProviderCheckin(itemId, "en_route", "", eta ? new Date(Date.now() + Number(eta) * 6e4).toISOString() : undefined))}>On my way</button></>}
    {status !== "arrived" && <button type="button" className="mk-btn primary" disabled={pending} onClick={() => run(() => setProviderCheckin(itemId, "arrived"))}>I’ve arrived</button>}
    {status === "arrived" && <p className="mk-note">Arrived — the event team will check you in.</p>}
    {error && <span className="mk-error">{error}</span>}
  </div>;
}
