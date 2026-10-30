"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ui";
import { setPublicAvailability } from "@/lib/actions/public-availability";

/**
 * Provider listing editor: "Show availability on my public page" (listings.details.public_availability, default off).
 * Publishes day-level free / limited / booked / closed only — never clients, events, prices or times.
 */
export function PublicAvailabilityToggle({ listingId, kind, on: initial, canManage, publicHref }: { listingId: string; kind: "venue" | "service"; on: boolean; canManage: boolean; publicHref: string | null }) {
  const [on, setOn] = useState(initial); const [pending, start] = useTransition();
  const toast = useToast(); const router = useRouter();
  const flip = () => start(async () => {
    const next = !on; setOn(next);
    const r = await setPublicAvailability(listingId, next);
    if (!r.ok) setOn(!next);
    toast(r.ok ? (r.message ?? "Saved") : r.error);
    if (r.ok) router.refresh();
  });
  return <section className="ws-panel pv-pubavail" aria-labelledby="pv-pubavail-h">
    <div className="ws-panel-head"><h2 id="pv-pubavail-h"><CalendarRange aria-hidden="true" />Public availability calendar</h2>
      {on && publicHref && <Link className="ws-link" href={`${publicHref}#availability`} target="_blank">View on public page <ExternalLink aria-hidden="true" /></Link>}</div>
    <div className="pv-live">
      <button type="button" role="switch" aria-checked={on} aria-labelledby="pv-pubavail-h" aria-describedby="pv-pubavail-d" className={`pv-switch${on ? " on" : ""}`}
        disabled={pending || !canManage} title={canManage ? undefined : "Only owners and managers can change this."} onClick={flip}><i /></button>
      <span><b className={on ? "ok" : ""}>{on ? "Shown" : "Hidden"}</b>
        <small id="pv-pubavail-d">{on ? "Visitors see which days are free, limited, booked or closed for the next 4 months." : "Your public page shows no calendar. Turn on to let visitors see free and busy days."}</small></span>
    </div>
    <p className="k-small" style={{ margin: "10px 0 0" }}>Only day-level status is published{kind === "venue" ? " (per space if you have several)" : ""} — never client names, events, prices or booking times. Requests still need your confirmation.</p>
  </section>;
}
