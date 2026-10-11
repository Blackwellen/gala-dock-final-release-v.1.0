"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type W = { id: string; level: number; modules: string[]; title: string; message: string; status_url: string | null; expected_restore: string | null; audience: string; dismissible: boolean; severity: string; reference: string };
const KEY = "gd_maint_dismissed";
const audienceFor = (path: string) => path.startsWith("/admin") ? "admins" : path.startsWith("/organizer") ? "organizers" : path.startsWith("/provider") ? "providers" : "customers";

/**
 * Global maintenance notice (release spec §9–10). Client-side so static pages and the installed PWA get it too; polls the cached
 * public feed every minute. Dismissal is per window and per device (critical windows can't be dismissed).
 */
export function MaintenanceBanner() {
  const path = usePathname() ?? "/";
  const [ws, setWs] = useState<W[]>([]);
  // Nothing renders until the feed loads, so reading storage in the initialiser can't cause a hydration mismatch.
  const [hidden, setHidden] = useState<string[]>(() => { try { return typeof window === "undefined" ? [] : JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } });
  useEffect(() => {
    let live = true;
    const load = () => fetch("/api/maintenance").then(r => (r.ok ? r.json() : { windows: [] })).then(j => { if (live) setWs(j.windows ?? []); }).catch(() => {});
    load(); const t = setInterval(load, 60_000);
    return () => { live = false; clearInterval(t); };
  }, []);
  if (path.startsWith("/maintenance")) return null;
  const aud = audienceFor(path);
  const show = ws.filter(w => (w.audience === "all" || w.audience === aud) && !(w.dismissible && hidden.includes(w.id)));
  if (!show.length) return null;
  return <div className="gd-maint" role="region" aria-label="Service status">{show.slice(0, 2).map(w =>
    <div key={w.id} className={`gd-maint-row ${w.severity}`} role={w.severity === "critical" ? "alert" : "status"}>
      <b>{w.title}</b>
      {w.message && <span>{w.message}</span>}
      {w.expected_restore && <span>Expected back {new Date(w.expected_restore).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.</span>}
      {w.status_url && <a href={w.status_url} target="_blank" rel="noreferrer">Status updates</a>}
      {w.dismissible && <button type="button" aria-label="Dismiss notice" onClick={() => { const next = [...hidden, w.id]; setHidden(next); try { localStorage.setItem(KEY, JSON.stringify(next.slice(-20))); } catch { /* ignore */ } }}>×</button>}
    </div>)}
    <style>{`.gd-maint{position:sticky;top:0;z-index:80;display:grid}.gd-maint-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:8px 44px 8px 16px;font:500 13px/1.4 Inter,system-ui,sans-serif;position:relative}
.gd-maint-row.info{background:#e8f1fe;color:#0b2a8a}.gd-maint-row.warning{background:#fff2df;color:#7a4100}.gd-maint-row.critical{background:#c4142b;color:#fff}
.gd-maint-row a{color:inherit;font-weight:700}.gd-maint-row button{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:28px;height:28px;border:0;border-radius:6px;background:transparent;color:inherit;font-size:18px;cursor:pointer}
.gd-maint-row button:hover{background:rgba(0,0,0,.08)}`}</style>
  </div>;
}
