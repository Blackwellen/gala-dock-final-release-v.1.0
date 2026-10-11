import type { Metadata } from "next";
import { Restricted } from "@/components/workspace/kit";
import { getAdmin } from "@/lib/admin/context";
import { requestTime } from "@/lib/workspace/format";
import { Head, Pill } from "../_b/kit";
import { MaintenanceForm, EndWindow } from "./form";
import "@/styles/admin-b.css";

export const metadata: Metadata = { title: "Maintenance" };
type W = { id: string; level: number; modules: string[]; title: string; message: string; starts_at: string; ends_at: string | null; ended_at: string | null; audience: string; severity: string; reference: string; created_at: string };
const LEVELS: [number, string, string][] = [[1, "M1 Notice", "Banner only; everything works."], [2, "M2 Degraded", "Selected modules unavailable; the rest works."], [3, "M3 Read-only", "Selected modules (or all) read-only; check-in and tickets stay up."],
  [4, "M4 Full maintenance", "Maintenance page; writes off except admin. Tickets and check-in stay up."], [5, "M5 Security lockdown", "Sign-in, payments, Agent and API writes off. Admin responders only."]];
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }) : "—";
const list: React.CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 };

/** Maintenance control (release spec §9–10): schedule, scope and end maintenance windows. Every change is audit-logged in the DB. */
export default async function MaintenancePage() {
  const admin = await getAdmin();
  if (!admin.permissions.has("settings" as never)) return <Restricted area="Maintenance" />;
  const { data } = await admin.db.from("maintenance_windows" as never).select("*").order("created_at", { ascending: false }).limit(50);
  const all = (data ?? []) as W[], now = new Date(requestTime()).getTime();
  const isActive = (w: W) => !w.ended_at && new Date(w.starts_at).getTime() <= now && (!w.ends_at || new Date(w.ends_at).getTime() > now);
  const active = all.filter(isActive), scheduled = all.filter(w => !w.ended_at && new Date(w.starts_at).getTime() > now);
  const past = all.filter(w => !isActive(w) && !scheduled.includes(w)).slice(0, 20);
  const level = Math.max(0, ...active.map(w => w.level));
  const row = (w: W, end: boolean) => <li key={w.id} className="adb-panel" style={{ display: "grid", gap: 4 }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><Pill status={w.level >= 4 ? "critical" : w.level >= 2 ? "warning" : "info"} label={`M${w.level}`} /><b>{w.title}</b>{w.reference && <small>· {w.reference}</small>}</div>
    <small>{w.modules.length ? `Modules: ${w.modules.join(", ")}` : "Platform-wide"} · audience {w.audience} · {when(w.starts_at)} → {w.ended_at ? `ended ${when(w.ended_at)}` : when(w.ends_at)}</small>
    {w.message && <small>{w.message}</small>}
    {end && <EndWindow id={w.id} />}
  </li>;
  return <div className="adb-page" style={{ display: "grid", gap: 16 }}>
    <Head title="Maintenance" subtitle={level ? `Current level M${level} — ${LEVELS[level - 1]![1].slice(3)}` : "Current level M0 — normal operation"} />
    <section style={{ display: "grid", gap: 8 }}><h2 style={{ fontSize: 15, margin: 0 }}>Active</h2><ul style={list}>{active.length ? active.map(w => row(w, true)) : <li className="adb-panel">No active maintenance.</li>}</ul></section>
    {scheduled.length > 0 && <section style={{ display: "grid", gap: 8 }}><h2 style={{ fontSize: 15, margin: 0 }}>Scheduled</h2><ul style={list}>{scheduled.map(w => row(w, true))}</ul></section>}
    <section className="adb-panel" style={{ display: "grid", gap: 10 }}><h2 style={{ fontSize: 15, margin: 0 }}>Start or schedule a window</h2>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>{LEVELS.map(([n, l, d]) => <li key={n}><b>{l}</b> — {d}</li>)}</ul>
      <MaintenanceForm /></section>
    {past.length > 0 && <section style={{ display: "grid", gap: 8 }}><h2 style={{ fontSize: 15, margin: 0 }}>History</h2><ul style={list}>{past.map(w => row(w, false))}</ul></section>}
  </div>;
}
