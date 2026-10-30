"use client";
import { useState } from "react";
import { Rocket } from "lucide-react";
import { Dialog, useAction } from "@/components/kit/client";
import { saveEventLaunch } from "@/lib/events/launch-actions";
import { toIso, toLocal } from "./s2-shared";

export type LaunchSettings = { at?: string; presale_at?: string; waiting_room?: { enabled?: boolean; rate_per_minute?: number; admit_minutes?: number } };

/** Sell › Resale & risk: edit presale / launch times and the waiting room through the audited set_event_launch command. */
export function LaunchEditor({ eventId, launch, startsAt }: { eventId: string; launch: LaunchSettings; startsAt: string | null }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const init = () => ({ presale: toLocal(launch.presale_at), at: toLocal(launch.at), on: !!launch.waiting_room?.enabled,
    rate: String(launch.waiting_room?.rate_per_minute ?? 200), admit: String(launch.waiting_room?.admit_minutes ?? 10) });
  const [f, setF] = useState(init);
  const set = (k: keyof ReturnType<typeof init>) => (e: React.ChangeEvent<HTMLInputElement>) => setF(s => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }) as typeof s);
  const save = async () => {
    const r = await run(() => saveEventLaunch(eventId, { at: toIso(f.at), presale_at: toIso(f.presale),
      waiting_room: { enabled: f.on, rate_per_minute: Math.floor(Number(f.rate) || 0), admit_minutes: Math.floor(Number(f.admit) || 0) } }));
    if (r.ok) setOpen(false);
  };
  const max = startsAt ? toLocal(startsAt) : undefined;
  return <>
    <button type="button" className="k-btn outline sm" onClick={() => { setF(init()); setOpen(true); }}><Rocket size={14} />Edit launch</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Launch & waiting room" sub="Owners and managers can schedule sales. Changes are recorded in the audit log."
      footer={<><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="k-btn primary" disabled={pending} onClick={() => void save()}>Save</button></>}>
      <div className="k-col" style={{ gap: 12 }}>
        <label className="k-field"><span>Public launch</span><input className="k-input" type="datetime-local" value={f.at} max={max} onChange={set("at")} /><small>Before this the event page shows coming soon, or a countdown in the last 7 days. Leave empty to follow tier sale windows only.</small></label>
        <label className="k-field"><span>Presale opens</span><input className="k-input" type="datetime-local" value={f.presale} max={f.at || max} onChange={set("presale")} disabled={!f.at} /><small>Optional. Must be before the public launch; presale and access-code tiers sell from here.</small></label>
        <label className="k-row" style={{ gap: 8 }}><input type="checkbox" checked={f.on} onChange={set("on")} disabled={!f.at} /><span className="k-small"><b>Waiting room</b> — queue buyers first come, first served from the launch time</span></label>
        {f.on && <div className="k-grid k-g2" style={{ gap: 10 }}>
          <label className="k-field"><span>Admitted per minute</span><input className="k-input" type="number" min={1} max={10000} value={f.rate} onChange={set("rate")} /></label>
          <label className="k-field"><span>Minutes to buy once admitted</span><input className="k-input" type="number" min={2} max={60} value={f.admit} onChange={set("admit")} /></label>
        </div>}
        <p className="k-xs k-muted" style={{ margin: 0 }}>Once the launch has passed with people in the waiting room, the launch time is locked so nobody&apos;s place changes.</p>
      </div>
    </Dialog>
  </>;
}
