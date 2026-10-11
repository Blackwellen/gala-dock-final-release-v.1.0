"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { placeVenueHold, offerAlternative, decideAlternative, quoteVenue } from "@/lib/venue/actions";

const local = (iso: string | null) => iso ? new Date(Date.parse(iso) - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "";
type Space = { id: string; name: string };

/** Venue responses (§61): hold an exact space + window with a blocking level, or offer an alternative space/date. */
export function VenueResponse({ itemId, spaces, starts, ends }: { itemId: string; spaces: Space[]; starts: string | null; ends: string | null }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [mode, setMode] = useState<"" | "hold" | "alt">(""); const [error, setError] = useState(""); const [check, setCheck] = useState<string>("");
  if (!spaces.length) return null;
  if (!mode) return <div className="mk-row"><button type="button" className="mk-btn ghost" onClick={() => setMode("hold")}>Hold a space</button><button type="button" className="mk-btn ghost" onClick={() => setMode("alt")}>Offer an alternative</button></div>;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { setError(""); const r = await fn(); if (!r.ok) setError(r.error ?? "Error"); else { setMode(""); router.refresh(); } });
  const preview = (f: HTMLFormElement) => start(async () => { const d = new FormData(f); const r = await quoteVenue(String(d.get("space")), String(d.get("starts")), String(d.get("ends")), 0);
    setCheck(r.ok && r.data ? (r.data.conflicts.length ? r.data.conflicts.map(c => `${c.level === "hard" ? "Blocked" : "Check"}: ${c.reason}`).join(" · ") : "No conflicts, including setup and cleardown buffers.") : "Couldn’t check availability."); });
  return <form className="mk-form" aria-label={mode === "hold" ? "Hold a space" : "Offer an alternative"} action={f => {
    const g = (k: string) => String(f.get(k) ?? "");
    run(() => mode === "hold" ? placeVenueHold(itemId, g("space"), g("starts"), g("ends"), Number(g("hours")), g("blocking") as "soft" | "hard", g("note"))
      : offerAlternative(itemId, g("kind") as "space" | "date" | "both", g("space"), g("starts"), g("ends"), g("price"), g("note")));
  }}>
    {mode === "alt" && <label className="mk-field wide"><span>Offer</span><select name="kind" defaultValue="space"><option value="space">A different space</option><option value="date">A different date/time</option><option value="both">Both</option></select></label>}
    <label className="mk-field"><span>Space</span><select name="space">{spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    {mode === "hold" ? <label className="mk-field"><span>Blocking level</span><select name="blocking" defaultValue="hard"><option value="hard">Hard — blocks other bookings</option><option value="soft">Soft — first refusal</option></select></label>
      : <label className="mk-field"><span>Price (£, optional)</span><input name="price" type="number" min={0} step="1" /></label>}
    <label className="mk-field"><span>Event starts</span><input name="starts" type="datetime-local" defaultValue={local(starts)} required={mode === "hold"} /></label>
    <label className="mk-field"><span>Event ends</span><input name="ends" type="datetime-local" defaultValue={local(ends)} required={mode === "hold"} /></label>
    {mode === "hold" && <label className="mk-field"><span>Hold for (hours)</span><input name="hours" type="number" min={2} max={336} defaultValue={72} required /></label>}
    <label className="mk-field wide"><span>Note to the organiser</span><input name="note" maxLength={1000} /></label>
    {mode === "hold" && <p className="mk-note wide">Setup and cleardown times from the space are added to the held window automatically.</p>}
    <div className="mk-row wide"><button type="button" className="mk-btn ghost" onClick={() => setMode("")}>Cancel</button>
      <button type="button" className="mk-btn ghost" disabled={pending} onClick={e => preview(e.currentTarget.form!)}>Check availability</button>
      <button className="mk-btn primary" disabled={pending}>{pending && <Loader2 size={14} className="mk-spin" aria-hidden="true" />}{mode === "hold" ? "Place hold" : "Send alternative"}</button></div>
    {check && <p className="mk-note wide" role="status">{check}</p>}
    {error && <p className="mk-error" role="alert">{error}</p>}
  </form>;
}

export function AlternativeDecision({ altId }: { altId: string }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState("");
  const go = (accept: boolean) => start(async () => { const r = await decideAlternative(altId, accept); if (!r.ok) setError(r.error); else router.refresh(); });
  return <span className="mk-row"><button type="button" className="mk-btn primary" disabled={pending} onClick={() => go(true)}>Accept</button><button type="button" className="mk-btn ghost" disabled={pending} onClick={() => go(false)}>Decline</button>{error && <span className="mk-error">{error}</span>}</span>;
}
