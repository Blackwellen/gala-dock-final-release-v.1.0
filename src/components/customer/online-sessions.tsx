import Link from "next/link";
import { Video, PlayCircle, Clock, Lock, CircleSlash, Captions, Hand, FileText, AudioLines } from "lucide-react";
import type { MySession } from "@/lib/virtual/my-online";

/**
 * Customer "Online sessions" card (Q29). Join and replay buttons only link to the gated server routes — the stream / recording
 * links never reach the page. Every state is shown in words (open now, opens at, ended, not included in your ticket) so nobody
 * clicks into a refusal.
 */
const KIND: Record<string, string> = { main: "Main stage", breakout: "Breakout", workshop: "Workshop", webinar: "Webinar", live_audio: "Live audio", podcast: "Podcast", remote: "Remote", replay: "Replay" };
const at = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export function OnlineSessions({ ticketId, sessions }: { ticketId: string; sessions: MySession[] }) {
  if (!sessions.length) return null;
  return <section className="ce-card os" aria-labelledby="os-h">
    <h2 id="os-h"><Video size={18} />Online sessions</h2>
    <p className="os-sub">Join from here when a session opens. Links are issued to you and this device only, so please don’t share them.</p>
    <ul className="os-list">{sessions.map(s => <li key={s.id} className="os-row" data-state={s.join}>
      <div className="os-main">
        <b>{s.title}</b>
        <small>{KIND[s.kind] ?? s.kind}{s.track && s.track !== KIND[s.kind] ? ` · ${s.track}` : ""} · {at(s.startsAt)}–{time(s.endsAt)}</small>
        {(s.captions && s.captions !== "none") || s.signLanguage || s.transcript || s.audioDescription ? <span className="os-a11y">
          {s.captions && s.captions !== "none" && <span><Captions size={13} />{s.captions === "post_event" ? "Captions after the event" : "Live captions"}</span>}
          {s.signLanguage && <span><Hand size={13} />Sign language</span>}
          {s.transcript && <span><FileText size={13} />Transcript</span>}
          {s.audioDescription && <span><AudioLines size={13} />Audio description</span>}
        </span> : null}
      </div>
      <div className="os-act">
        {s.join === "open" ? <Link className="k-btn primary sm" href={`/tickets/${ticketId}/join?session=${s.id}`} prefetch={false}><Video size={14} />Join now</Link>
          : s.join === "soon" ? <span className="os-state"><Clock size={14} />Opens {at(s.opensAt)}</span>
          : s.join === "not_entitled" ? <span className="os-state muted"><Lock size={14} />Not included in your ticket</span>
          : s.join === "cancelled" ? <span className="os-state muted"><CircleSlash size={14} />Cancelled</span>
          : <span className="os-state muted">Session ended</span>}
        {s.join !== "open" && s.join !== "soon" && <Replay r={s.replay} />}
      </div>
    </li>)}</ul>
  </section>;
}

function Replay({ r }: { r: MySession["replay"] }) {
  switch (r.state) {
    case "available": return <Link className="k-btn outline sm" href={`/virtual/replay/${r.id}`} prefetch={false}><PlayCircle size={14} />Watch replay{r.until ? <small className="os-until"> until {at(r.until)}</small> : null}</Link>;
    case "opens": return <span className="os-state"><Clock size={14} />Replay from {at(r.at)}</span>;
    case "closed": return <span className="os-state muted">Replay window closed</span>;
    case "processing": return <span className="os-state muted">Replay being prepared</span>;
    case "not_entitled": return <span className="os-state muted"><Lock size={14} />Replay not included</span>;
    default: return null;
  }
}
