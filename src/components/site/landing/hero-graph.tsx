"use client";
/* eslint-disable @next/next/no-img-element -- fixed-size illustration thumbnails with reserved dimensions */
import { useState } from "react";
import { CalendarDays, Camera, ChefHat, Megaphone, MapPin, Music2, ShieldCheck, Ticket, Users } from "lucide-react";
import { Scope } from "../motion";
import { DemoTag, ph, vars, type Tone } from "../ui";

/** 2.1 EventDockGraph: one central event with the pieces it needs; paths draw in sequence, labels resolve after their parent. */
type Node = { key: string; label: string; state: string; tone: Tone; img?: string; icon: typeof MapPin; x: number; y: number; path: string; bar?: number };
const NODES: Node[] = [
  { key: "venue", label: "Venue", state: "Venue confirmed", tone: "ok", img: "v-oakwood.webp", icon: MapPin, x: 150, y: 0, path: "M255 78 C255 122 300 116 300 160" },
  { key: "dj", label: "DJ", state: "Held until 16:00", tone: "wait", img: "s-dj-marcus.webp", icon: Music2, x: 486, y: 0, path: "M590 78 C590 126 420 112 420 160" },
  { key: "catering", label: "Catering", state: "2 options confirmed", tone: "ok", img: "s-gourmet.webp", icon: ChefHat, x: 0, y: 122, path: "M214 162 C238 162 226 214 250 214" },
  { key: "tickets", label: "Tickets", state: "182 / 240 sold", tone: "info", img: "tk-neon.webp", icon: Ticket, x: 506, y: 122, path: "M506 162 C482 162 494 214 470 214", bar: 76 },
  { key: "photo", label: "Photographer", state: "Awaiting response", tone: "plain", img: "s-snapshot.webp", icon: Camera, x: 0, y: 270, path: "M214 310 C238 310 226 336 250 336" },
  { key: "security", label: "Security", state: "Confirmed", tone: "ok", img: "s-elite-security.webp", icon: ShieldCheck, x: 506, y: 270, path: "M506 310 C482 310 494 336 470 336" },
  { key: "promotion", label: "Promotion", state: "Campaign live", tone: "info", icon: Megaphone, x: 58, y: 440, path: "M168 440 C168 412 300 428 300 402" },
  { key: "guests", label: "Guests", state: "Growing interest", tone: "plain", img: "ev-neon.webp", icon: Users, x: 452, y: 440, path: "M556 440 C556 412 420 428 420 402" },
];

export function HeroGraph() {
  const [focus, setFocus] = useState<string | null>(null);
  return <div className="gpl-hero-visual">
    <Scope className="gpl-graph" aria-hidden="true" data-focus={focus ?? undefined} amount={0.15}>
      <svg className="gpl-graph-lines" viewBox="0 0 720 520" preserveAspectRatio="none">
        <ellipse className="gpl-orbit" cx="360" cy="270" rx="300" ry="215" />
        {NODES.map((n, i) => <g key={n.key} className={`gpl-link${focus === n.key ? " is-focus" : ""}`}>
          <path className="gp-draw" pathLength={1} d={n.path} style={vars({ "--d": 420 + i * 110 })} />
        </g>)}
      </svg>
      <div className="gpl-core" data-rv="pop" style={vars({ "--d": 80 })}>
        <img src={ph("v-skyline-rooftop.webp")} alt="" width={304} height={146} />
        <span className="gpl-core-date"><CalendarDays size={13} />24 Jul</span>
        <b>Summer Rooftop Party</b>
        <span className="gpl-core-meta"><span><MapPin size={13} />London</span><span><Users size={13} />240 guests</span></span>
        <span className="gpl-core-ready"><span className="gp-bar gp-grow"><i style={{ width: "76%", ...vars({ "--d": 1500 }) }} /></span><em>76% ready</em></span>
      </div>
      {NODES.map((n, i) => {
        const Icon = n.icon;
        return <div key={n.key} className={`gpl-node${focus === n.key ? " is-focus" : ""}`} style={vars({ "--x": n.x, "--y": n.y })}
          onMouseEnter={() => setFocus(n.key)} onMouseLeave={() => setFocus(null)}>
          <span className="gpl-node-in" style={vars({ "--d": 520 + i * 110 })} data-rv="pop">
            {n.img ? <img src={ph(n.img)} alt="" width={64} height={54} /> : <span className="gpl-node-ic"><Icon size={22} /></span>}
            <span className="gpl-node-txt"><b>{n.label}</b>
              <span className={`gp-state is-${n.tone === "violet" ? "info" : n.tone}`} data-rv="fade" style={vars({ "--d": 780 + i * 110 })}>{n.state}</span>
              {n.bar ? <span className="gp-bar gp-grow"><i style={{ width: `${n.bar}%`, ...vars({ "--d": 1200 }) }} /></span> : null}
            </span>
          </span>
        </div>;
      })}
    </Scope>
    <ol className="gpl-seq" aria-label="Example: how one event connects">
      <li className="is-root"><span className="gpl-seq-ic"><CalendarDays size={18} aria-hidden="true" /></span><span><b>Summer Rooftop Party</b><small>24 Jul · London · 240 guests · 76% ready</small></span></li>
      {[["Venue", "Venue confirmed", "ok", MapPin], ["Providers", "DJ held until 16:00 · catering confirmed · photographer awaiting response", "wait", Music2], ["Tickets", "182 / 240 tickets sold", "info", Ticket], ["Operations", "Security confirmed · promotion live · guest interest growing", "ok", ShieldCheck]].map(([t, s, tone, I]) => {
        const Icon = I as typeof MapPin;
        return <li key={t as string}><span className={`gpl-seq-ic is-${tone as string}`}><Icon size={18} aria-hidden="true" /></span><span><b>{t as string}</b><small>{s as string}</small></span></li>;
      })}
    </ol>
    <DemoTag className="gpl-hero-tag" />
  </div>;
}
