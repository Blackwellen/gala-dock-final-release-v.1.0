"use client";
import { useEffect, useRef, useState } from "react";
import { Hourglass, CheckCircle2 } from "lucide-react";

type Q = { required: boolean; joined?: boolean; admitted?: boolean; expired?: boolean; ahead?: number; eta_minutes?: number; admit_expires_at?: string | null; opens_at?: string | null };
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/**
 * Waiting room (§52). Shows only what the server returns from /api/events/{id}/queue: no invented positions or times.
 * Joins automatically, polls every 15s until admitted, and tells the parent whether the buyer is still waiting.
 */
export function WaitingRoom({ eventId, onWaiting }: { eventId: string; onWaiting: (waiting: boolean) => void }) {
  const [q, setQ] = useState<Q | null>(null), [notOpen, setNotOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let live = true;
    const tick = async (join: boolean) => {
      const res = await fetch(`/api/events/${eventId}/queue`, { method: join ? "POST" : "GET", cache: "no-store" }).catch(() => null);
      const j = (res && res.ok ? await res.json().catch(() => null) : null) as Q | null;
      if (!live || !j) return;
      setQ(j); setNotOpen(!!j.opens_at && new Date(j.opens_at).getTime() > Date.now()); onWaiting(j.required && !j.admitted);
      if (j.required && !j.joined) { void tick(true); return; }
      if (j.required && !j.admitted) timer.current = setTimeout(() => void tick(false), 15_000);
    };
    void tick(false);
    return () => { live = false; if (timer.current) clearTimeout(timer.current); };
  }, [eventId, onWaiting]);
  if (!q || !q.required) return null;
  if (q.admitted) return <p className="co-queue ok" role="status"><CheckCircle2 aria-hidden="true" />It’s your turn. {q.admit_expires_at ? `Complete your order by ${clock(q.admit_expires_at)}.` : ""}</p>;
  return <section className="co-card co-queue" role="status" aria-live="polite">
    <Hourglass aria-hidden="true" />
    <div><b>You’re in the waiting room</b>
      {q.expired ? <small>Your turn expired before you completed your order. Refresh to rejoin the queue.</small>
        : <small>{typeof q.ahead === "number" ? (q.ahead === 0 ? "You’re next." : `${q.ahead.toLocaleString("en-GB")} ${q.ahead === 1 ? "person" : "people"} ahead of you`) : "Joining the queue…"}
          {q.eta_minutes ? ` · about ${q.eta_minutes} minute${q.eta_minutes === 1 ? "" : "s"}` : ""}{q.opens_at && notOpen ? ` · sales open at ${clock(q.opens_at)}` : ""}</small>}
      <small>Keep this page open — it updates automatically.</small></div>
  </section>;
}
