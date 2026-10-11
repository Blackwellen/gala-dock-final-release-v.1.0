"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { useToast } from "@/components/ui";
import { setAvailability } from "./actions";

type Target = { value: string; label: string };
const KIND_LABEL: Record<string, string> = { blocked: "Block time (unavailable)", open: "Open availability (bookable)", emergency_window: "Publish emergency window", maintenance: "Maintenance" };

/**
 * Availability dialog, opened by ?action=block|open|emergency (plus optional &target=space:… &date=YYYY-MM-DD).
 * Writing through the server keeps hard bookings authoritative over soft availability.
 */
export function AvailabilityDialog({ targets }: { targets: Target[] }) {
  const sp = useSearchParams(), router = useRouter(), pathname = usePathname(), toast = useToast();
  const action = sp.get("action");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  if (!action || !["block", "open", "emergency", "maintenance"].includes(action)) return null;
  const kind = action === "block" ? "blocked" : action === "emergency" ? "emergency_window" : action;
  const date = sp.get("date") ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const close = () => { const n = new URLSearchParams(sp.toString()); for (const k of ["action", "target", "date"]) n.delete(k); router.replace(`${pathname}${n.toString() ? `?${n}` : ""}`, { scroll: false }); };
  return <div className="ws-dialog-backdrop" onClick={close}><form className="ws-dialog" role="dialog" aria-modal="true" aria-label="Update availability" onClick={e => e.stopPropagation()}
    onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); setError("");
      // datetime-local values are wall-clock times in the user's zone; send exact instants so the server never guesses.
      for (const k of ["start", "end"]) { const d = new Date(String(f.get(k))); if (!Number.isNaN(d.getTime())) f.set(k, d.toISOString()); } start(async () => { const r = await setAvailability(f); if (!r.ok) { setError(r.error); return; } toast(r.message ?? "Saved"); close(); router.refresh(); }); }}>
    <div className="ws-dialog-head"><h2>Update availability</h2><button type="button" aria-label="Close" onClick={close}><X aria-hidden="true" /></button></div>
    <label className="ws-field"><span>What do you want to do?</span><select name="kind" defaultValue={kind}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    <label className="ws-field"><span>Applies to</span><select name="target" defaultValue={sp.get("target") ?? targets[0]?.value} required>{targets.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
    <div className="pc-dt"><label className="ws-field"><span>Starts</span><input type="datetime-local" name="start" required defaultValue={`${date}T09:00`} /></label>
      <label className="ws-field"><span>Ends</span><input type="datetime-local" name="end" required defaultValue={`${date}T17:00`} /></label></div>
    <label className="ws-field"><span>Note (optional)</span><input name="note" maxLength={500} placeholder="e.g. Private owner use" /></label>
    <p className="ws-muted">Blocking time never cancels confirmed bookings — hard bookings always take precedence.</p>
    {error && <p className="ws-form-error" role="alert">{error}</p>}
    <div className="ws-dialog-actions"><button type="button" className="ws-btn outline" onClick={close}>Cancel</button><button className="ws-btn primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button></div>
  </form></div>;
}
