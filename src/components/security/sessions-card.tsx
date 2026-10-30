"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { MonitorSmartphone, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type S = { id: string; created_at: string; last_active: string; user_agent: string; ip: string | null; aal: string; current: boolean };
const device = (ua: string) => {
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Unknown device";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : ua ? "Browser" : "";
  return br ? `${br} on ${os}` : os;
};

/** Active sessions (release spec §6): see where you're signed in, sign out other devices, or everywhere. */
export function SessionsCard() {
  const [sb] = useState(createClient);
  const [rows, setRows] = useState<S[] | null>(null), [msg, setMsg] = useState(""); const [pending, start] = useTransition();
  const load = useCallback(async () => { const { data } = await sb.rpc("my_sessions" as never); setRows((data ?? []) as S[]); }, [sb]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return <section className="ce-card ac-card" id="sessions" style={{ display: "grid", gap: 10 }} aria-labelledby="sess-h">
    <h2 id="sess-h" style={{ display: "flex", gap: 8, alignItems: "center" }}><MonitorSmartphone size={18} aria-hidden="true" />Where you’re signed in</h2>
    {rows === null ? <p className="ac-hint">Loading…</p> : <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>{rows.map(s =>
      <li key={s.id} style={{ display: "grid", gap: 2, padding: "8px 10px", border: "1px solid #eef2fb", borderRadius: 8 }}>
        <b>{device(s.user_agent)}{s.current && <span style={{ marginLeft: 8, fontSize: 11, color: "#087443" }}>This device</span>}</b>
        <small className="ac-hint">{s.ip ?? "Unknown IP"} · last active {new Date(s.last_active).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}{s.aal === "aal2" ? " · verified with 2-step" : ""}</small>
      </li>)}</ul>}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="k-btn outline" disabled={pending || (rows?.length ?? 0) < 2} onClick={() => start(async () => { const { data, error } = await sb.rpc("revoke_other_sessions" as never); setMsg(error ? "Couldn’t sign out other devices." : `Signed out ${data} other session${data === 1 ? "" : "s"}.`); await load(); })}>Sign out other devices</button>
      <form method="post" action="/auth/signout?scope=global"><button className="k-btn outline"><LogOut size={15} />Sign out everywhere</button></form>
    </div>
    {msg && <p role="status" className="ac-hint">{msg}</p>}
  </section>;
}
