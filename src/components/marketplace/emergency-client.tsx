"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Siren } from "lucide-react";
import { createEmergencyRequest, respondEmergency, acceptEmergency, cancelEmergency, saveEmergencyProfile } from "@/lib/marketplace/actions";
import { EMERGENCY_CATEGORIES } from "@/lib/marketplace/emergency";

const Spin = () => <Loader2 size={14} className="mk-spin" aria-hidden="true" />;
const localIn = (h: number) => new Date(Date.now() + h * 36e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

/** Organizer: raise an Emergency Supply request. Matching goes to a controlled pool of opted-in, available, in-range providers. */
export function EmergencyRequestForm({ events, defaults }: { events: { id: string; name: string; when: string }[]; defaults: { event?: string; category?: string; original?: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const submit = (f: FormData) => start(async () => {
    setError("");
    const r = await createEmergencyRequest(String(f.get("event")), {
      severity: String(f.get("severity")), category: String(f.get("category")), requiredArrival: String(f.get("arrival")), location: String(f.get("location") ?? ""),
      scope: String(f.get("scope") ?? ""), failureReason: String(f.get("failure") ?? ""), budgetMax: String(f.get("budget") ?? ""), originalItemId: defaults.original ?? "",
    });
    if (!r.ok) { setError(r.error); return; }
    router.push(`/organizer/marketplace/emergency/${r.data}`);
  });
  if (!events.length) return <p className="mk-empty">Create an event first — emergency requests are attached to an event.</p>;
  const cat = EMERGENCY_CATEGORIES.find(([k]) => defaults.category?.toLowerCase().includes(k))?.[0] ?? "";
  return <form className="mk-form" action={submit} aria-label="New emergency request">
    <label className="mk-field wide"><span>Event</span><select name="event" required defaultValue={defaults.event ?? events[0]!.id}>{events.map(e => <option key={e.id} value={e.id}>{e.name} · {e.when}</option>)}</select></label>
    <label className="mk-field"><span>What do you need?</span><select name="category" required defaultValue={cat}><option value="" disabled>Choose…</option>{EMERGENCY_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    <label className="mk-field"><span>Severity</span><select name="severity" defaultValue="high"><option value="critical">Critical — event at risk</option><option value="high">High — needed today</option><option value="standard">Standard — needed soon</option></select></label>
    <label className="mk-field"><span>Needed on site by</span><input name="arrival" type="datetime-local" required defaultValue={localIn(3)} /></label>
    <label className="mk-field"><span>Budget up to (£, optional)</span><input name="budget" type="number" min={0} step="1" inputMode="numeric" /></label>
    <label className="mk-field wide"><span>Location (defaults to the event venue)</span><input name="location" maxLength={300} /></label>
    <label className="mk-field wide"><span>Scope</span><textarea name="scope" rows={2} maxLength={2000} placeholder="e.g. 4-hour DJ set 20:00–00:00, own decks, 150 guests" required /></label>
    <label className="mk-field wide"><span>What happened? (optional)</span><input name="failure" maxLength={1000} placeholder="e.g. Booked DJ cancelled with illness" /></label>
    <p className="mk-note wide">Only providers who have opted in to Emergency Supply, are available now and cover this area are contacted — up to 8, nearest first.</p>
    <div className="mk-row wide"><button className="mk-btn primary" disabled={pending}>{pending ? <Spin /> : <Siren size={14} aria-hidden="true" />}Send emergency request</button></div>
    {error && <p className="mk-error" role="alert">{error}</p>}
  </form>;
}

/** Organizer: accept a quoted candidate, or cancel the request. */
export function EmergencyDecision({ candidateId, requestId, kind }: { candidateId?: string; requestId?: string; kind: "accept" | "cancel" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const go = () => start(async () => {
    const r = kind === "accept" ? await acceptEmergency(candidateId!) : await cancelEmergency(requestId!);
    if (!r.ok) setError(r.error); else router.refresh();
  });
  return <><button type="button" className={`mk-btn ${kind === "accept" ? "primary" : "ghost"}`} disabled={pending} onClick={go}>{pending && <Spin />}{kind === "accept" ? "Accept quote" : "Cancel request"}</button>{error && <p className="mk-error" role="alert">{error}</p>}</>;
}

/** Provider: marks the invitation as seen once, then lets them quote, show interest or decline. */
export function EmergencyRespond({ candidateId, status, seen }: { candidateId: string; status: string; seen: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const marked = useRef(false);
  useEffect(() => { if (!seen && !marked.current) { marked.current = true; void respondEmergency(candidateId, "open", null, null, ""); } }, [candidateId, seen]);
  const act = (action: "interested" | "quote" | "decline", f?: FormData) => start(async () => {
    setError("");
    const r = await respondEmergency(candidateId, action, f ? Number(f.get("quote")) : null, f ? Number(f.get("eta")) || null : null, f ? String(f.get("note") ?? "") : "");
    if (!r.ok) setError(r.error); else router.refresh();
  });
  if (!["delivered", "opened", "interested", "quoted"].includes(status)) return null;
  return <form className="mk-form" action={f => act("quote", f)} aria-label="Respond to emergency request">
    <label className="mk-field"><span>Your price (£)</span><input name="quote" type="number" min={1} step="1" required inputMode="numeric" /></label>
    <label className="mk-field"><span>Arrival in (minutes)</span><input name="eta" type="number" min={0} max={2880} step="5" inputMode="numeric" /></label>
    <label className="mk-field wide"><span>Note</span><input name="note" maxLength={1000} placeholder="Kit, crew, anything the organiser should know" /></label>
    <div className="mk-row wide">
      <button className="mk-btn primary" disabled={pending}>{pending && <Spin />}{status === "quoted" ? "Update quote" : "Send quote"}</button>
      {status !== "interested" && status !== "quoted" && <button type="button" className="mk-btn ghost" disabled={pending} onClick={() => act("interested")}>I’m interested — call me</button>}
      <button type="button" className="mk-btn danger" disabled={pending} onClick={() => act("decline")}>Can’t help</button>
    </div>
    {error && <p className="mk-error" role="alert">{error}</p>}
  </form>;
}

type Profile = { enabled: boolean; categories: string[]; radius_km: number; response_minutes: number; surcharge_pct: number; rate_notes: string; available_now: boolean; available_until: string | null; base_lat: number | null; base_lng: number | null };

/** Provider: opt in to Emergency Supply (§37) — categories, area, response promise, emergency rates, live availability. */
export function EmergencyProfileForm({ workspaceId, profile, canManage }: { workspaceId: string; profile: Profile | null; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const p = profile ?? { enabled: false, categories: [], radius_km: 40, response_minutes: 60, surcharge_pct: 0, rate_notes: "", available_now: false, available_until: null, base_lat: null, base_lng: null };
  const until = p.available_until ? new Date(Date.parse(p.available_until) - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "";
  const submit = (f: FormData) => start(async () => {
    const r = await saveEmergencyProfile(workspaceId, {
      enabled: f.get("enabled") === "on", categories: f.getAll("categories").map(String), radiusKm: Number(f.get("radius")), responseMinutes: Number(f.get("response")),
      surchargePct: Number(f.get("surcharge")), rateNotes: String(f.get("notes") ?? ""), availableNow: f.get("now") === "on", availableUntil: String(f.get("until") ?? ""),
      baseLat: String(p.base_lat ?? ""), baseLng: String(p.base_lng ?? ""),
    });
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  return <form className="mk-form" action={submit} aria-label="Emergency Supply settings">
    <fieldset disabled={!canManage} style={{ display: "contents" }}>
      <label className="mk-switch wide"><input type="checkbox" name="enabled" defaultChecked={p.enabled} />Offer Emergency Supply</label>
      <fieldset className="mk-field wide" style={{ border: 0, padding: 0 }}><legend>Categories you can cover at short notice</legend>
        <div className="mk-cats">{EMERGENCY_CATEGORIES.map(([k, l]) => <label key={k}><input type="checkbox" name="categories" value={k} defaultChecked={p.categories.includes(k)} />{l}</label>)}</div></fieldset>
      <label className="mk-field"><span>Travel radius (km)</span><input name="radius" type="number" min={1} max={500} defaultValue={p.radius_km} required /></label>
      <label className="mk-field"><span>Response promise</span><select name="response" defaultValue={String(p.response_minutes)}>{[15, 30, 60, 120, 240].map(m => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}</option>)}</select></label>
      <label className="mk-field"><span>Emergency surcharge (%)</span><input name="surcharge" type="number" min={0} max={300} defaultValue={p.surcharge_pct} /></label>
      <label className="mk-field"><span>Available until</span><input name="until" type="datetime-local" defaultValue={until} /></label>
      <label className="mk-switch wide"><input type="checkbox" name="now" defaultChecked={p.available_now} />Available right now (stays on until you turn it off)</label>
      <label className="mk-field wide"><span>Rate notes shown to organisers</span><input name="notes" maxLength={1000} defaultValue={p.rate_notes} placeholder="e.g. Minimum 3 hours, travel included within 20km" /></label>
      <p className="mk-note wide">Distance is measured from your listings’ locations. You’re only contacted when you’re available, in range and in a matching category.</p>
      <div className="mk-row wide"><button className="mk-btn primary" disabled={pending}>{pending && <Spin />}Save Emergency Supply</button>
        {msg && <span role="status" className={msg.ok ? "mk-note" : "mk-error"}>{msg.text}</span>}</div>
    </fieldset>
  </form>;
}
