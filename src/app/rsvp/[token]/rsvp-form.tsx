"use client";
import { useState, useTransition } from "react";
import { Check, X, HelpCircle, Plus, Trash2 } from "lucide-react";
import { respondRsvp } from "@/lib/guests/access";

type Answer = "confirmed" | "declined" | "pending";
const OPTIONS: [Answer, string, React.ComponentType<{ size?: number }>][] = [["confirmed", "Yes, I'll be there", Check], ["declined", "Sorry, I can't make it", X], ["pending", "Not sure yet", HelpCircle]];

/** RSVP answer for a personal link: yes / no / maybe, plus-ones within the allowance, and optional dietary/access needs. */
export function RsvpForm({ token, current, allowed, existingPlusOnes, child }: { token: string; current: string | null; allowed: number; existingPlusOnes: number; child: boolean }) {
  const [answer, setAnswer] = useState<Answer | null>((["confirmed", "declined", "pending"] as const).find(a => a === current) ?? null);
  const [guests, setGuests] = useState<{ name: string; child: boolean }[]>(() => Array.from({ length: Math.min(existingPlusOnes, allowed) }, () => ({ name: "", child: false })));
  const [care, setCare] = useState({ dietary: "", allergies: "", accessibility: "" });
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!answer) return; setMsg(null);
    start(async () => {
      const hasCare = Object.values(care).some(v => v.trim());
      const r = await respondRsvp(token, { response: answer, plus_ones: answer === "confirmed" ? guests.map(g => ({ name: g.name.trim(), child: g.child })) : [], note, care: answer === "confirmed" && hasCare ? care : null });
      setMsg(r.ok ? { ok: true, text: r.message ?? "Thanks — your answer is saved." } : { ok: false, text: r.error ?? "Could not save your RSVP." });
    }); };
  return <form className="gf-form" onSubmit={submit}>
    <fieldset className="gf-choices"><legend className="k-sr">Your answer</legend>
      {OPTIONS.map(([v, l, I]) => <label key={v} className={answer === v ? "on" : ""}><input type="radio" name="answer" value={v} checked={answer === v} onChange={() => setAnswer(v)} /><I size={18} />{l}</label>)}
    </fieldset>
    {answer === "confirmed" && <>
      {allowed > 0 && <fieldset className="gf-set"><legend>Guests you&apos;re bringing <small>(up to {allowed})</small></legend>
        {guests.map((g, i) => <div key={i} className="gf-row"><input className="k-input" value={g.name} onChange={e => setGuests(x => x.map((y, k) => k === i ? { ...y, name: e.target.value } : y))} maxLength={120} placeholder={`Guest ${i + 1} name`} aria-label={`Guest ${i + 1} name`} />
          <label className="k-check"><input type="checkbox" checked={g.child} onChange={e => setGuests(x => x.map((y, k) => k === i ? { ...y, child: e.target.checked } : y))} />Child</label>
          <button type="button" className="k-icon-btn plain" aria-label={`Remove guest ${i + 1}`} onClick={() => setGuests(x => x.filter((_, k) => k !== i))}><Trash2 size={15} /></button></div>)}
        {guests.length < allowed && <button type="button" className="k-btn ghost sm" onClick={() => setGuests(x => [...x, { name: "", child: false }])}><Plus size={14} />Add a guest</button>}
      </fieldset>}
      <fieldset className="gf-set"><legend>Anything the host should know? <small>(optional)</small></legend>
        <div className="gf-two"><label className="k-field"><span>Dietary needs</span><input className="k-input" value={care.dietary} onChange={e => setCare(c => ({ ...c, dietary: e.target.value }))} maxLength={300} placeholder="e.g. vegetarian" /></label>
          <label className="k-field"><span>Allergies</span><input className="k-input" value={care.allergies} onChange={e => setCare(c => ({ ...c, allergies: e.target.value }))} maxLength={300} placeholder="e.g. nuts" /></label></div>
        <label className="k-field"><span>Access needs</span><input className="k-input" value={care.accessibility} onChange={e => setCare(c => ({ ...c, accessibility: e.target.value }))} maxLength={500} placeholder="e.g. step-free entrance" /></label>
        <small className="gf-hint">Shared with the host only{child ? "" : ", with your consent by sending this form"}.</small>
      </fieldset>
    </>}
    {!child && <label className="k-field"><span>Message to the host <small>(optional)</small></span><textarea className="k-textarea" value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={3} /></label>}
    <div className="gf-actions"><button className="k-btn primary" type="submit" disabled={!answer || pending}>{pending ? "Sending…" : current ? "Update my answer" : "Send my answer"}</button></div>
    <p className={`gf-msg ${msg ? (msg.ok ? "ok" : "bad") : ""}`} role="status" aria-live="polite">{msg?.text ?? ""}</p>
  </form>;
}
