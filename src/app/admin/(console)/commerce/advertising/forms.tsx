"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBoostPaused, setPlacementActive } from "./actions";

type R = { ok: true; message: string } | { ok: false; error: string };
function useSubmit() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = (fn: () => Promise<R>) => start(async () => {
    setMsg(null);
    const r = await fn();
    setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  return { pending, msg, submit };
}
const Msg = ({ m }: { m: { ok: boolean; text: string } | null }) => m ? <span className={m.ok ? "add-ok" : "add-error"} role={m.ok ? "status" : "alert"}>{m.text}</span> : null;

/** Pause (policy takedown) or resume one boost, with the reason the advertiser is shown. */
export function BoostPauseForm({ id, paused, label }: { id: string; paused: boolean; label: string }) {
  const { pending, msg, submit } = useSubmit();
  return <form className="add-row" action={f => submit(() => setBoostPaused(id, !paused, String(f.get("reason") ?? "")))}>
    <input name="reason" required minLength={5} maxLength={500} placeholder={paused ? "Why it can run again" : "Policy reason (shown to the advertiser)"} aria-label={`${paused ? "Resume" : "Pause"} reason for ${label}`} />
    <button className="adb-btn" disabled={pending}>{pending ? "Saving…" : paused ? "Resume" : "Pause"}</button>
    <Msg m={msg} />
  </form>;
}

/** One placement on/off, or key '*' for every placement (kill switch). */
export function PlacementForm({ k, active, label }: { k: string; active: boolean; label: string }) {
  const { pending, msg, submit } = useSubmit();
  const all = k === "*";
  return <form className="add-row" action={f => submit(() => setPlacementActive(k, !active, String(f.get("reason") ?? "")))}>
    <input name="reason" required minLength={5} maxLength={500} placeholder="Reason (audited)" aria-label={`Reason to switch ${label} ${active ? "off" : "on"}`} />
    <button className={`adb-btn${all && active ? " primary" : ""}`} disabled={pending}>{pending ? "Saving…" : all ? (active ? "Stop all ads" : "Turn all placements on") : active ? "Switch off" : "Switch on"}</button>
    <Msg m={msg} />
  </form>;
}
